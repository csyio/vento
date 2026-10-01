#!/usr/bin/env python3
"""Vento.app'i imzalar (içten dışa, sertleştirilmiş çalışma zamanı) ve istenirse notarize eder.

Kullanım:
  tools/sign-app.py /yol/Vento.app                       # ad-hoc imza (kimlik "-"): yerel test, dağıtım için DEĞİL
  tools/sign-app.py /yol/Vento.app --identity "Developer ID Application: Ad (TAKIM)"
  tools/sign-app.py /yol/Vento.app --identity "..." --notarize PROFIL   # xcrun notarytool store-credentials ile kaydedilmiş profil
Yetkiler: vento/installer/entitlements/ (Mozilla ekip kimliğine bağlı üretim yetkileri kullanılamaz).
İmzalı .app'ten DMG üretme: docs/YAYIN.md.
"""
import argparse, os, plistlib, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENT = os.path.join(ROOT, "vento/installer/entitlements")
NESTED_ENT = {"plugin-container.app": "plugin-container.xml", "gpu-helper.app": "plugin-container.xml",
              "media-plugin-helper.app": "media-plugin-helper.xml"}

def run(cmd, check=True):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if check and r.returncode:
        sys.exit(f"HATA: {' '.join(cmd)}\n{r.stderr}")
    return r

def is_macho(path):
    with open(path, "rb") as f:
        return f.read(4) in (b"\xcf\xfa\xed\xfe", b"\xca\xfe\xba\xbe", b"\xbe\xba\xfe\xca", b"\xce\xfa\xed\xfe")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("app")
    ap.add_argument("--identity", default="-")
    ap.add_argument("--notarize", metavar="PROFIL")
    a = ap.parse_args()
    app = os.path.abspath(a.app)
    adhoc = a.identity == "-"
    base = ["codesign", "--force", "--sign", a.identity, "--options", "runtime"] + (["--timestamp=none"] if adhoc else ["--timestamp"])
    nested = {}  # .app yolu → ana yürütülebilir
    for d, dirs, files in os.walk(app):
        for n in dirs:
            if n.endswith(".app") and os.path.join(d, n) != app:
                p = os.path.join(d, n)
                info = plistlib.load(open(os.path.join(p, "Contents/Info.plist"), "rb"))
                nested[p] = os.path.join(p, "Contents/MacOS", info["CFBundleExecutable"])
    main_info = plistlib.load(open(os.path.join(app, "Contents/Info.plist"), "rb"))
    bundle_exes = set(nested.values()) | {os.path.join(app, "Contents/MacOS", main_info["CFBundleExecutable"])}
    # 1) bağımsız Mach-O dosyaları (dylib, yardımcı araçlar), en derin yol önce
    singles = []
    for d, _, files in os.walk(app):
        for n in files:
            p = os.path.join(d, n)
            if os.path.islink(p) or p in bundle_exes or not os.path.isfile(p):
                continue
            if is_macho(p):
                singles.append(p)
    for p in sorted(singles, key=lambda x: -x.count("/")):
        run(base + [p])
    print(f"{len(singles)} bağımsız ikili imzalandı")
    # 2) iç içe uygulamalar (kendi yetkileriyle), en derin önce
    for p in sorted(nested, key=lambda x: -x.count("/")):
        ent = NESTED_ENT.get(os.path.basename(p))
        run(base + (["--entitlements", os.path.join(ENT, ent)] if ent else []) + [p])
    print(f"{len(nested)} yardımcı uygulama imzalandı")
    # 3) ana uygulama
    run(base + ["--entitlements", os.path.join(ENT, "browser.xml"), app])
    run(["codesign", "--verify", "--deep", "--strict", "--verbose=1", app])
    print("ana uygulama imzalandı ve doğrulandı:", "AD-HOC (dağıtım için değil)" if adhoc else a.identity)
    if a.notarize:
        if adhoc:
            sys.exit("HATA: ad-hoc imza notarize edilemez")
        zip_ = app + ".notarize.zip"
        run(["ditto", "-c", "-k", "--keepParent", app, zip_])
        r = run(["xcrun", "notarytool", "submit", zip_, "--keychain-profile", a.notarize, "--wait"], check=False)
        print(r.stdout, r.stderr)
        os.remove(zip_)
        if r.returncode or "status: Accepted" not in r.stdout:
            sys.exit("HATA: notarization kabul edilmedi")
        run(["xcrun", "stapler", "staple", app])
        print("notarize edildi ve zımbalandı")

main()
