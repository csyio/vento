#!/bin/sh
# Türkçe (tr) dil dosyalarını Vento.app'e ekler: Firefox'un kendi birleştirme (eksik dizeler en-US'ten) + paketleme adımları.
# `mach build faster` Vento.app'i yeniden kurduktan SONRA çalıştırılır (tools/selftest.sh bunu yapar). Hızlıdır (~2 sn).
# Kullanım: tools/build-locale.sh
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export MOZCONFIG="$ROOT/mozconfig"
L10N="$ROOT/l10n-base/firefox-l10n"
OBJ="$ROOT/engine/obj-vento"
RES="$OBJ/dist/Vento.app/Contents/Resources"
[ -d "$L10N/tr" ] || sh "$ROOT/tools/fetch-l10n.sh"
if ! env -u CLAUDECODE make -C "$OBJ/vento/locales" chrome-tr L10NBASEDIR="$L10N" IS_LANGUAGE_REPACK=1 FINAL_TARGET="$RES" >"$OBJ/vento-locale.log" 2>&1; then
  tail -n 20 "$OBJ/vento-locale.log"; echo "HATA: dil paketleme başarısız (tam günlük: $OBJ/vento-locale.log)" >&2; exit 1
fi
# Paketli diller (Gecko bunu res/multilocale.txt'ten okur); varsayılan en-US kalır, tr tercihle seçilir (vento.js)
mkdir -p "$RES/res"
printf 'tr,en-US\n' > "$RES/res/multilocale.txt"
echo "dil eklendi: tr → $RES"
