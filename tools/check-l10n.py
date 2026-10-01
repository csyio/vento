#!/usr/bin/env python3
"""Statically checks Vento's string dictionaries (Fluent). No build needed; runs at the start of tools/selftest.sh.

 1. Do en-US and tr have the same set of ids?
 2. Is every id used in code (`data-l10n-id` in vento.xhtml, JS `Vento.l10n.t("...")` and the `t(\"...\")`/`L(\"...\")` helpers) defined in both locales?
 3. Does each id use the same variables ({ $x }) in both locales? (A variable missing in one locale means a broken sentence.)
 4. Are there ids in the dictionary that nothing uses (orphans)? (warning, not an error)
Exit code 0 means clean.
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
    errors.append(f"id exists in only one locale: {k} ({'en-US' if k in en else 'tr'})")

# usages: xhtml data-l10n-id + JS t("…")/L("…")/data-q-id
used = {}
def add(i, where): used.setdefault(i, where)
x = open(f"{C}/vento.xhtml", encoding="utf-8").read()
for m in re.finditer(r'data-(?:l10n|q)-id="([a-z0-9-]+)"', x): add(m.group(1), "vento.xhtml")
for f in glob.glob(f"{C}/vento-*.js"):
    if f.endswith("selftest.js") or f.endswith("vento-l10n.js"): continue
    s = open(f, encoding="utf-8").read()
    for m in re.finditer(r'(?:\.t|\bL|\bt)\(\s*"([a-z][a-z0-9-]*)"', s): add(m.group(1), os.path.basename(f))
    for m in re.finditer(r'setAttributes\([^,]+,\s*"([a-z][a-z0-9-]*)"', s): add(m.group(1), os.path.basename(f))
    # conditional: t(cond ? "a" : "b") and template t(`wp-${id}`)
    for m in re.finditer(r'\?\s*"([a-z][a-z0-9-]*)"\s*:\s*"([a-z][a-z0-9-]*)"', s):
        for g in m.groups():
            if g in en or g in tr: add(g, os.path.basename(f))
# templated id families (wp-<id>, perm-<kind>)
for fam in ("wp-ink", "wp-tide", "wp-dusk", "wp-dune", "wp-paper", "wp-mist"): add(fam, "vento-start.js (template)")
for i, where in sorted(used.items()):
    for name, d in (("en-US", en), ("tr", tr)):
        if i not in d:
            errors.append(f"{where}: used id is MISSING from the {name} dictionary: {i}")

# variable parity
var = lambda v: sorted(set(re.findall(r"\{\s*\$([a-zA-Z_]+)", v)))
for k in sorted(set(en) & set(tr)):
    if var(en[k]) != var(tr[k]):
        errors.append(f"variables differ: {k}: en={var(en[k])} tr={var(tr[k])}")

orphans = [k for k in en if k not in used and not k.startswith(("perm-", "ctx-kind", "esin-err", "esin-q-", "up-", "menu-", "tip-"))]
for k in orphans: warns.append(f"unused id: {k}")
print(f"ids: {len(en)} (en-US) / {len(tr)} (tr); used in code: {len(used)}")
for w in warns: print("warning:", w)
for e in errors: print("ERROR:", e)
sys.exit(1 if errors else 0)
