#!/usr/bin/env python3
"""Signs Vento.app (inside out, hardened runtime) and optionally notarizes it.

Usage:
  tools/sign-app.py /yol/Vento.app                       # ad-hoc signature (identity "-"): local testing, NOT for distribution
  tools/sign-app.py /yol/Vento.app --identity "Developer ID Application: Name (TEAMID)"
  tools/sign-app.py /yol/Vento.app --identity "..." --notarize PROFILE   # profile saved with xcrun notarytool store-credentials
Entitlements: vento/installer/entitlements/ (Mozilla's production entitlements are tied to its team ID and can't be used).
Building a DMG from the signed .app: docs/YAYIN.md.
"""
import argparse, os, plistlib, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENT = os.path.join(ROOT, "vento/installer/entitlements")
NESTED_ENT = {"plugin-container.app": "plugin-container.xml", "gpu-helper.app": "plugin-container.xml",
              "media-plugin-helper.app": "media-plugin-helper.xml"}

def run(cmd, check=True):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if check and r.returncode:
        sys.exit(f"ERROR: {' '.join(cmd)}\n{r.stderr}")
    return r

def is_macho(path):
    with open(path, "rb") as f:
        return f.read(4) in (b"\xcf\xfa\xed\xfe", b"\xca\xfe\xba\xbe", b"\xbe\xba\xfe\xca", b"\xce\xfa\xed\xfe")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("app")
    ap.add_argument("--identity", default="-")
    ap.add_argument("--notarize", metavar="PROFILE")
    a = ap.parse_args()
    app = os.path.abspath(a.app)
    adhoc = a.identity == "-"
    base = ["codesign", "--force", "--sign", a.identity, "--options", "runtime"] + (["--timestamp=none"] if adhoc else ["--timestamp"])
    nested = {}  # .app path -> main executable
    for d, dirs, files in os.walk(app):
        for n in dirs:
            if n.endswith(".app") and os.path.join(d, n) != app:
                p = os.path.join(d, n)
                info = plistlib.load(open(os.path.join(p, "Contents/Info.plist"), "rb"))
                nested[p] = os.path.join(p, "Contents/MacOS", info["CFBundleExecutable"])
    main_info = plistlib.load(open(os.path.join(app, "Contents/Info.plist"), "rb"))
    bundle_exes = set(nested.values()) | {os.path.join(app, "Contents/MacOS", main_info["CFBundleExecutable"])}
    # 1) standalone Mach-O files (dylibs, helper tools), deepest path first
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
    print(f"signed {len(singles)} standalone binaries")
    # 2) nested apps (with their own entitlements), deepest first
    for p in sorted(nested, key=lambda x: -x.count("/")):
        ent = NESTED_ENT.get(os.path.basename(p))
        run(base + (["--entitlements", os.path.join(ENT, ent)] if ent else []) + [p])
    print(f"signed {len(nested)} helper apps")
    # 3) main app
    run(base + ["--entitlements", os.path.join(ENT, "browser.xml"), app])
    run(["codesign", "--verify", "--deep", "--strict", "--verbose=1", app])
    print("main app signed and verified:", "AD-HOC (not for distribution)" if adhoc else a.identity)
    if a.notarize:
        if adhoc:
            sys.exit("ERROR: an ad-hoc signature cannot be notarized")
        zip_ = app + ".notarize.zip"
        run(["ditto", "-c", "-k", "--keepParent", app, zip_])
        r = run(["xcrun", "notarytool", "submit", zip_, "--keychain-profile", a.notarize, "--wait"], check=False)
        print(r.stdout, r.stderr)
        os.remove(zip_)
        if r.returncode or "status: Accepted" not in r.stdout:
            sys.exit("ERROR: notarization was not accepted")
        run(["xcrun", "stapler", "staple", app])
        print("notarized and stapled")

main()
