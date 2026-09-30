#!/bin/sh
# vento/ dizinini motor ağacına bağlar (engine/ temiz Firefox olarak kalır; bağ git'te ignore).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ln -sfn ../vento "$ROOT/engine/vento"
grep -qx "/vento" "$ROOT/engine/.git/info/exclude" 2>/dev/null || echo "/vento" >> "$ROOT/engine/.git/info/exclude"
grep -qx "/obj-vento" "$ROOT/engine/.git/info/exclude" || echo "/obj-vento" >> "$ROOT/engine/.git/info/exclude"
echo "bağlandı: engine/vento -> ../vento"
