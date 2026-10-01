#!/bin/sh
# Self-test: fast build (JS/CSS/XHTML only), run headless, print the result.
# Usage: tools/selftest.sh [--no-build]
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export MOZCONFIG="$ROOT/mozconfig"
if [ "$1" != "--no-build" ]; then
  (cd "$ROOT/engine" && ./mach build faster 2>&1 | tail -n 3)
  sh "$ROOT/tools/build-locale.sh"
fi
# disk.icns is only used when packaging the DMG (it does not go into the app bundle); in the source it must match the app icon
cmp -s "$ROOT/vento/branding/default/disk.icns" "$ROOT/vento/branding/default/firefox.icns" \
  || { echo "ERROR: vento/branding/default/disk.icns does not match the app icon (firefox.icns) (tools/make-doc-icon.py)"; exit 1; }
# VENTO_APP: if set to the path of a packaged Vento.app (copied from the DMG), test that one
APP="${VENTO_APP:+$VENTO_APP/Contents/MacOS/vento}"
APP="${APP:-$ROOT/engine/obj-vento/dist/Vento.app/Contents/MacOS/vento}"
TMP="$(mktemp -d)"
# Fake LLM (for the Esin tests)
# Self-signed certificate (for the certificate error page test)
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$TMP/tls-key.pem" -out "$TMP/tls-cert.pem" -days 2 \
  -subj "/CN=127.0.0.1" -addext "subjectAltName=IP:127.0.0.1" >/dev/null 2>&1
node "$ROOT/tools/fake-llm.mjs" "$TMP/llm-port" "$TMP/tls-port" "$TMP/tls-key.pem" "$TMP/tls-cert.pem" &
LLM=$!
trap 'kill $LLM 2>/dev/null' EXIT
i=0; while [ ! -s "$TMP/llm-port" ] && [ $i -lt 50 ]; do sleep 0.1; i=$((i+1)); done
i=0; while [ ! -s "$TMP/tls-port" ] && [ $i -lt 50 ]; do sleep 0.1; i=$((i+1)); done
export VENTO_ESIN_ENDPOINT="http://127.0.0.1:$(cat "$TMP/llm-port")/v1"
export VENTO_TEST_HTTPS="https://127.0.0.1:$(cat "$TMP/tls-port")"
VENTO_SELFTEST=1 VENTO_TRACE="$TMP/trace.txt" MOZ_CRASHREPORTER_DISABLE=1 \
  "$APP" --profile "$TMP/profile" --no-remote --headless >"$TMP/out.log" 2>&1 &
PID=$!
i=0; while kill -0 $PID 2>/dev/null && [ $i -lt 90 ]; do sleep 1; i=$((i+1)); done
kill -0 $PID 2>/dev/null && { echo "TIMEOUT (90 s)"; kill $PID; }
cat "$TMP/trace.txt" 2>/dev/null || echo "no trace file (did the app start?)"
grep -q "ÖZET" "$TMP/trace.txt" 2>/dev/null && ! grep -q "FAIL" "$TMP/trace.txt" || { echo "==> FAILED"; exit 1; }

# Phase 2: reopen with the SAME profile; the session should be restored
echo "--- phase 2: restart (session restore)"
VENTO_SELFTEST=1 VENTO_SELFTEST_PHASE2=1 VENTO_TRACE="$TMP/trace2.txt" MOZ_CRASHREPORTER_DISABLE=1 \
  "$APP" --profile "$TMP/profile" --no-remote --headless >"$TMP/out2.log" 2>&1 &
PID=$!
i=0; while kill -0 $PID 2>/dev/null && [ $i -lt 60 ]; do sleep 1; i=$((i+1)); done
kill -0 $PID 2>/dev/null && { echo "TIMEOUT (60 s, phase 2)"; kill $PID; }
cat "$TMP/trace2.txt" 2>/dev/null || echo "no trace file (did phase 2 start?)"
grep -q "ÖZET" "$TMP/trace2.txt" 2>/dev/null && ! grep -q "FAIL" "$TMP/trace2.txt" && echo "==> ALL PASSED" || { echo "==> FAILED (phase 2)"; exit 1; }
