#!/bin/sh
# Motorun Türkçe dil dosyalarını (Mozilla'nın firefox-l10n deposu, yalnız `tr`) pin'li sürümle indirir. Yeniden çalıştırmak güvenlidir.
# Sürümü yükseltmek için PIN'i değiştir ve vento/docs'a nedenini yaz (dil dosyaları MPL-2.0).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIN="ab3eee19ba53d3e29999278548eff2052df1d8a9"
DIR="$ROOT/l10n-base/firefox-l10n"
mkdir -p "$ROOT/l10n-base"
if [ ! -d "$DIR/.git" ]; then
  git clone -q --filter=blob:none --no-checkout https://github.com/mozilla-l10n/firefox-l10n.git "$DIR"
fi
cd "$DIR"
git sparse-checkout init --cone >/dev/null 2>&1 || true
git sparse-checkout set tr
git fetch -q --depth 1 origin "$PIN" 2>/dev/null || git fetch -q origin
git checkout -q "$PIN"
echo "firefox-l10n @ $(git rev-parse --short HEAD) (tr)"
