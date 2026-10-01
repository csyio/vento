#!/usr/bin/env python3
"""Vento metin sözlüklerini (Fluent) statik olarak doğrular. Derleme gerektirmez; tools/selftest.sh başında çalışır.

 1. en-US ve tr aynı kimlik kümesine sahip mi?
 2. Koddaki her kullanım (vento.xhtml `data-l10n-id`, JS `Vento.l10n.t("...")` ve `t(\"...\")`/`L(\"...\")` yardımcıları) iki dilde de tanımlı mı?
 3. Her kimlikte aynı değişkenler ({ $x }) iki dilde de geçiyor mu? (Bir dilde eksik değişken = bozuk cümle.)
 4. Sözlükte kullanılmayan (öksüz) kimlik var mı? (uyarı; hata değil)
Çıkış kodu 0 = temiz.
"""
import re, sys, glob, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
L = os.path.join(ROOT, "vento/locales")
C = os.path.join(ROOT, "vento/base/content")

def parse(path):
    msgs, cur = {}, None
    for line in open(path, encoding="utf-8"):
        m = re.match(r"^([a-z][a-z0-9-]*)\s*=(.*)$", line)
        if m:
            cur = m.group(1)
            msgs[cur] = m.group(2)
        elif cur and (line.startswith(" ") or line.startswith("\t")):
            msgs[cur] += "\n" + line
        elif line.strip() == "" or line.startswith("#"):
            continue
        else:
            cur = None
    return msgs

en, tr = parse(f"{L}/en-US/vento.ftl"), parse(f"{L}/tr/vento.ftl")
errors, warns = [], []
for k in sorted(set(en) ^ set(tr)):
    errors.append(f"kimlik yalnız bir dilde: {k} ({'en-US' if k in en else 'tr'})")

# kullanım: xhtml data-l10n-id + JS t("…")/L("…")/data-q-id
used = {}
def add(i, where): used.setdefault(i, where)
x = open(f"{C}/vento.xhtml", encoding="utf-8").read()
for m in re.finditer(r'data-(?:l10n|q)-id="([a-z0-9-]+)"', x): add(m.group(1), "vento.xhtml")
for f in glob.glob(f"{C}/vento-*.js"):
    if f.endswith("selftest.js") or f.endswith("vento-l10n.js"): continue
    s = open(f, encoding="utf-8").read()
    for m in re.finditer(r'(?:\.t|\bL|\bt)\(\s*"([a-z][a-z0-9-]*)"', s): add(m.group(1), os.path.basename(f))
    for m in re.finditer(r'setAttributes\([^,]+,\s*"([a-z][a-z0-9-]*)"', s): add(m.group(1), os.path.basename(f))
    # koşullu: t(cond ? "a" : "b") ve şablon t(`wp-${id}`)
    for m in re.finditer(r'\?\s*"([a-z][a-z0-9-]*)"\s*:\s*"([a-z][a-z0-9-]*)"', s):
        for g in m.groups():
            if g in en or g in tr: add(g, os.path.basename(f))
# şablonlu kimlik aileleri (wp-<kimlik>, perm-<tür>)
for fam in ("wp-ink", "wp-tide", "wp-dusk", "wp-dune", "wp-paper", "wp-mist"): add(fam, "vento-start.js (şablon)")
for i, where in sorted(used.items()):
    for name, d in (("en-US", en), ("tr", tr)):
        if i not in d:
            errors.append(f"{where}: kullanılan kimlik {name} sözlüğünde YOK: {i}")

# değişken eşitliği
var = lambda v: sorted(set(re.findall(r"\{\s*\$([a-zA-Z_]+)", v)))
for k in sorted(set(en) & set(tr)):
    if var(en[k]) != var(tr[k]):
        errors.append(f"değişkenler farklı: {k}: en={var(en[k])} tr={var(tr[k])}")

orphans = [k for k in en if k not in used and not k.startswith(("perm-", "ctx-kind", "esin-err", "esin-q-", "up-", "menu-", "tip-"))]
for k in orphans: warns.append(f"kullanılmayan kimlik: {k}")
print(f"kimlik: {len(en)} (en-US) / {len(tr)} (tr); kodda kullanılan: {len(used)}")
for w in warns: print("uyarı:", w)
for e in errors: print("HATA:", e)
sys.exit(1 if errors else 0)
