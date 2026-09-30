#!/bin/sh
# Öz-test: hızlı derleme (yalnız JS/CSS/XHTML) + başsız çalıştır + sonucu yazdır.
# Kullanım: tools/selftest.sh [--no-build]
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export MOZCONFIG="$ROOT/mozconfig"
if [ "$1" != "--no-build" ]; then
  (cd "$ROOT/engine" && env -u CLAUDECODE ./mach build faster 2>&1 | tail -n 3)
  sh "$ROOT/tools/build-locale.sh"
fi
# disk.icns yalnız DMG paketlemede kullanılır (uygulama paketine girmez): kaynakta uygulama simgesiyle aynı olmalı
cmp -s "$ROOT/vento/branding/default/disk.icns" "$ROOT/vento/branding/default/firefox.icns" \
  || { echo "HATA: vento/branding/default/disk.icns uygulama simgesiyle (firefox.icns) aynı değil (tools/make-doc-icon.py)"; exit 1; }
APP="$ROOT/engine/obj-vento/dist/Vento.app/Contents/MacOS/vento"
TMP="$(mktemp -d)"
# Sahte LLM (Esin testleri için)
# Kendinden imzalı sertifika (sertifika hatası sayfası testi)
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$TMP/tls-key.pem" -out "$TMP/tls-cert.pem" -days 2 \
  -subj "/CN=127.0.0.1" -addext "subjectAltName=IP:127.0.0.1" >/dev/null 2>&1
node "$ROOT/tools/fake-llm.mjs" "$TMP/llm-port" "$TMP/tls-port" "$TMP/tls-key.pem" "$TMP/tls-cert.pem" &
LLM=$!
trap 'kill $LLM 2>/dev/null' EXIT
i=0; while [ ! -s "$TMP/llm-port" ] && [ $i -lt 50 ]; do sleep 0.1; i=$((i+1)); done
i=0; while [ ! -s "$TMP/tls-port" ] && [ $i -lt 50 ]; do sleep 0.1; i=$((i+1)); done
export VENTO_ESIN_ENDPOINT="http://127.0.0.1:$(cat "$TMP/llm-port")/v1"
export VENTO_TEST_HTTPS="https://127.0.0.1:$(cat "$TMP/tls-port")"
env -u CLAUDECODE VENTO_SELFTEST=1 VENTO_TRACE="$TMP/trace.txt" MOZ_CRASHREPORTER_DISABLE=1 \
  "$APP" --profile "$TMP/profile" --no-remote --headless >"$TMP/out.log" 2>&1 &
PID=$!
i=0; while kill -0 $PID 2>/dev/null && [ $i -lt 90 ]; do sleep 1; i=$((i+1)); done
kill -0 $PID 2>/dev/null && { echo "ZAMAN AŞIMI (90 sn)"; kill $PID; }
cat "$TMP/trace.txt" 2>/dev/null || echo "iz dosyası yok (uygulama başlamadı?)"
grep -q "ÖZET" "$TMP/trace.txt" 2>/dev/null && ! grep -q "FAIL" "$TMP/trace.txt" || { echo "==> BAŞARISIZ"; exit 1; }

# 2. aşama: AYNI profille yeniden aç → oturum geri gelmiş olmalı
echo "--- 2. aşama: yeniden başlatma (oturum geri yükleme)"
env -u CLAUDECODE VENTO_SELFTEST=1 VENTO_SELFTEST_PHASE2=1 VENTO_TRACE="$TMP/trace2.txt" MOZ_CRASHREPORTER_DISABLE=1 \
  "$APP" --profile "$TMP/profile" --no-remote --headless >"$TMP/out2.log" 2>&1 &
PID=$!
i=0; while kill -0 $PID 2>/dev/null && [ $i -lt 60 ]; do sleep 1; i=$((i+1)); done
kill -0 $PID 2>/dev/null && { echo "ZAMAN AŞIMI (60 sn, 2. aşama)"; kill $PID; }
cat "$TMP/trace2.txt" 2>/dev/null || echo "iz dosyası yok (2. aşama başlamadı?)"
grep -q "ÖZET" "$TMP/trace2.txt" 2>/dev/null && ! grep -q "FAIL" "$TMP/trace2.txt" && echo "==> TÜMÜ GEÇTİ" || { echo "==> BAŞARISIZ (2. aşama)"; exit 1; }
