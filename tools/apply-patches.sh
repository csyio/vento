#!/bin/sh
# engine/ üstüne patches/*.patch serisini uygular (idempotent). Firefox'a tek izinli sapma budur.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/engine"
for p in "$ROOT"/patches/*.patch; do
  if git apply --check "$p" 2>/dev/null; then git apply "$p"; echo "uygulandı: $(basename "$p")";
  elif git apply --check -R "$p" 2>/dev/null; then echo "zaten uygulanmış: $(basename "$p")";
  else echo "HATA: $(basename "$p") uygulanamıyor" >&2; exit 1; fi
done
