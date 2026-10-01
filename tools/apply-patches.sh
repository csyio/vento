#!/bin/sh
# Applies the patches/*.patch series on top of engine/ (idempotent). This is the only allowed deviation from stock Firefox.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/engine"
for p in "$ROOT"/patches/*.patch; do
  if git apply --check "$p" 2>/dev/null; then git apply "$p"; echo "applied: $(basename "$p")";
  elif git apply --check -R "$p" 2>/dev/null; then echo "already applied: $(basename "$p")";
  else echo "ERROR: cannot apply $(basename "$p")" >&2; exit 1; fi
done
