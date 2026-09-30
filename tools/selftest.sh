#!/bin/sh
# Öz-test: hızlı derleme (yalnız JS/CSS/XHTML) + başsız çalıştır + sonucu yazdır.
# Kullanım: tools/selftest.sh [--no-build]
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export MOZCONFIG="$ROOT/mozconfig"
if [ "$1" != "--no-build" ]; then
  (cd "$ROOT/engine" && env -u CLAUDECODE ./mach build faster 2>&1 | tail -n 3)
fi
APP="$ROOT/engine/obj-vento/dist/Vento.app/Contents/MacOS/vento"
TMP="$(mktemp -d)"
# Sahte LLM (Esin testleri için)
node "$ROOT/tools/fake-llm.mjs" "$TMP/llm-port" &
LLM=$!
trap 'kill $LLM 2>/dev/null' EXIT
i=0; while [ ! -s "$TMP/llm-port" ] && [ $i -lt 50 ]; do sleep 0.1; i=$((i+1)); done
export VENTO_ESIN_ENDPOINT="http://127.0.0.1:$(cat "$TMP/llm-port")/v1"
env -u CLAUDECODE VENTO_SELFTEST=1 VENTO_TRACE="$TMP/trace.txt" MOZ_CRASHREPORTER_DISABLE=1 \
  "$APP" --profile "$TMP/profile" --no-remote --headless >"$TMP/out.log" 2>&1 &
PID=$!
i=0; while kill -0 $PID 2>/dev/null && [ $i -lt 90 ]; do sleep 1; i=$((i+1)); done
kill -0 $PID 2>/dev/null && { echo "ZAMAN AŞIMI (90 sn)"; kill $PID; }
cat "$TMP/trace.txt" 2>/dev/null || echo "iz dosyası yok (uygulama başlamadı?)"
grep -q "ÖZET" "$TMP/trace.txt" 2>/dev/null && ! grep -q "FAIL" "$TMP/trace.txt" && echo "==> TÜMÜ GEÇTİ" || { echo "==> BAŞARISIZ"; exit 1; }
