# Dil (yerelleştirme)

**Durum (2026-09-30):** arayüz Türkçe (`intl.locale.requested = tr`), eksik dize İngilizceye düşer (`en-US` yedek).

## İki katman
1. **Vento'nun kendi metinleri** (`vento/base/content/*`): kodda doğrudan Türkçe ("sen" dili: "girdiğin bilgiler"). Fluent/properties kullanılmaz.
2. **Motorun metinleri** (hata sayfaları, kimlik/yazdırma/dosya seçici istemleri, PDF görüntüleyici, `about:` sayfaları): Mozilla'nın Türkçe çevirisi ("siz" dili: "giriş yapmanızı"). Kaynak: `mozilla-l10n/firefox-l10n`, yalnız `tr`.

## Nasıl çalışır
- `tools/fetch-l10n.sh` → `l10n-base/firefox-l10n` (git'te YOK, `.gitignore`), **pin'li commit** (`PIN=` betiğin içinde). Sürüm yükseltmek için PIN'i değiştir.
- `tools/build-locale.sh` → Firefox'un kendi adımları: `merge-tr` (eksik dizeleri en-US'ten tamamlar) + `chrome-tr` (toolkit, dom, netwerk, security, devtools, **marka**) → `Vento.app/Contents/Resources/{localization,chrome}/tr`, `res/multilocale.txt` = `tr,en-US`.
  Kuralları `vento/locales/Makefile.in` (Firefox'un `browser/locales/Makefile.in`'inin browser'a bağlı kısımları çıkarılmış hâli).
- `tools/selftest.sh`, `mach build faster`'tan sonra `build-locale.sh`'ı çalıştırır. **`faster` Vento.app'i yeniden kurar; Türkçeyi silebilir → her zaman `build-locale.sh` çalıştırın.**
- **Sürüm derlemesinde (paketleme/imza adımı yazıldığında) de `tools/build-locale.sh` çalışmalı**; yoksa paket İngilizce çıkar. (Henüz bir release betiği yok.)

## Tuzaklar
- Marka (`branding/brand.ftl`) ayrıca `make -C <marka dizini>/locales chrome AB_CD=tr` ile eklenmeli. **Bir Fluent kümesinde tek dosya eksikse TÜM küme İngilizceye düşer** (hata sayfaları sessizce İngilizce kalır).
- Alt make'lere `IS_LANGUAGE_REPACK=1` komut satırından verilmeli, hedef-özel değişken geçmez.
- `.properties` dizelerinde `&` erişim tuşudur ("&Evet").
- macOS uygulama menüsü (Vento ▸ Hakkında/Gizle/Çık) sistem nib'inden gelir, sistem diliyle seçilir; Türkçeleştirilmedi (bkz. Obsidian Log).
