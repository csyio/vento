# Vento sitesi

Statik site (TR `/`, EN `/en/`). JavaScript yok, çerez yok, dış istek yok; yazı tipleri `assets/fonts/` altında (OFL).

## Üret

```sh
node site/build.mjs --preview    # DMG olmadan; indirme düğmesi "yakında" olur
node site/build.mjs              # DMG ile; dist/vento-<sürüm>.dmg aranır
node site/build.mjs --dmg /yol/vento-0.1.0.dmg   # ya da VENTO_DMG=...
node site/build.mjs --no-zip
```

Çıktı: `site/dist/` ve Plesk'e sürükle-bırak için `site/vento-site-<sürüm>.zip` (DMG yoksa `-onizleme`).
`zip` komutu yoksa uyarır. Sürüm `vento/config/version_display.txt` (yoksa `version.txt`) dosyasından gelir;
DMG adı `vento-<sürüm>.dmg`, yolu `/dl/vento-<sürüm>.dmg`. `/updates/…` dosyalarını bu betik üretmez.

Yerelde bak: `cd site/dist && python3 -m http.server 8765`.

## Yayınla

1. Plesk → `vento.cansoykanyilmaz.com` → Dosyalar → `httpdocs` içine zip'i yükle, "Ayıkla".
   (Sunucuda `/updates/` klasörü varsa üzerine yazma; zip onu içermez.)
2. Hata belgeleri: 404 için `/404.html` (Plesk → Apache & nginx → Hata Belgeleri, ya da `ErrorDocument 404 /404.html`).
3. Açıp kontrol et: `/`, `/en/`, `/indir/`, `/gizlilik/`, DMG bağlantısı.

İçerik: `src/content.mjs` (TR+EN), biçim: `src/site.css`, parçalar: `src/parts.mjs`.
LLMTR logosu değiştirilmeden (`assets/img/llmtr-on-*.svg`) ve yalnızca indirme ile Esin sayfasında kullanılır.
