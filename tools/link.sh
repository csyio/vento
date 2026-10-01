#!/bin/sh
# Links vento/ into the engine tree (engine/ stays stock Firefox; the link is git-ignored).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ln -sfn ../vento "$ROOT/engine/vento"
grep -qx "/vento" "$ROOT/engine/.git/info/exclude" 2>/dev/null || echo "/vento" >> "$ROOT/engine/.git/info/exclude"
grep -qx "/obj-vento" "$ROOT/engine/.git/info/exclude" || echo "/obj-vento" >> "$ROOT/engine/.git/info/exclude"
echo "linked: engine/vento -> ../vento"
