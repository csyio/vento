#!/bin/sh
# Adds the Turkish (tr) locale to Vento.app using Firefox's own merge (missing strings fall back to en-US) and packaging steps.
# Run AFTER `mach build faster` rebuilds Vento.app (tools/selftest.sh does this). Fast (~2 s).
# Usage: tools/build-locale.sh
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export MOZCONFIG="$ROOT/mozconfig"
L10N="$ROOT/l10n-base/firefox-l10n"
OBJ="$ROOT/engine/obj-vento"
RES="$OBJ/dist/Vento.app/Contents/Resources"
[ -d "$L10N/tr" ] || sh "$ROOT/tools/fetch-l10n.sh"
if ! make -C "$OBJ/vento/locales" chrome-tr L10NBASEDIR="$L10N" IS_LANGUAGE_REPACK=1 FINAL_TARGET="$RES" >"$OBJ/vento-locale.log" 2>&1; then
  tail -n 20 "$OBJ/vento-locale.log"; echo "ERROR: locale packaging failed (full log: $OBJ/vento-locale.log)" >&2; exit 1
fi
# Packaged locales (Gecko reads res/multilocale.txt); en-US stays the default, tr is picked via a pref (vento.js)
mkdir -p "$RES/res"
printf 'tr,en-US\n' > "$RES/res/multilocale.txt"
echo "locale added: tr → $RES"
