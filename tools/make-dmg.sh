#!/bin/sh
# İmzalı Vento.app'ten dağıtım DMG'si: uygulama + /Applications kısayolu (sürükle-bırak kurulum).
# Kullanım: tools/make-dmg.sh /yol/Vento.app /yol/vento-0.1.0.dmg ["Hacim adı"]
# Not: Firefox'un arka planlı/simgeli DMG düzeni (mach package çıktısı) yerine yalın düzen; imzayı bozmadan kopyalar.
set -e
APP="$1"; OUT="$2"; VOL="${3:-Vento}"
[ -d "$APP" ] && [ -n "$OUT" ] || { echo "kullanım: $0 Vento.app çıktı.dmg [hacim adı]" >&2; exit 2; }
STAGE="$(mktemp -d)"; trap 'rm -rf "$STAGE"' EXIT
ditto "$APP" "$STAGE/Vento.app"
ln -s /Applications "$STAGE/Applications"
rm -f "$OUT"
hdiutil create -quiet -volname "$VOL" -srcfolder "$STAGE" -fs HFS+ -format UDZO -imagekey zlib-level=9 "$OUT"
shasum -a 256 "$OUT"
