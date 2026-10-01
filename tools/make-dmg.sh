#!/bin/sh
# Builds the distribution DMG from a signed Vento.app: the app plus an /Applications shortcut (drag-and-drop install).
# Usage: tools/make-dmg.sh /path/Vento.app /path/vento-0.1.0.dmg ["Volume name"]
# Note: plain layout instead of Firefox's DMG with background and icon layout (mach package output); copies without breaking the signature.
set -e
APP="$1"; OUT="$2"; VOL="${3:-Vento}"
[ -d "$APP" ] && [ -n "$OUT" ] || { echo "usage: $0 Vento.app out.dmg [volume name]" >&2; exit 2; }
STAGE="$(mktemp -d)"; trap 'rm -rf "$STAGE"' EXIT
ditto "$APP" "$STAGE/Vento.app"
ln -s /Applications "$STAGE/Applications"
rm -f "$OUT"
hdiutil create -quiet -volname "$VOL" -srcfolder "$STAGE" -fs HFS+ -format UDZO -imagekey zlib-level=9 "$OUT"
shasum -a 256 "$OUT"
