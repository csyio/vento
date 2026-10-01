# Vento yayın adımları

Durum işaretleri: **[doğrulandı]** bu makinede çalıştırıldı, **[denenmedi]** yazıldı ama hiç çalıştırılmadı.

## 1. Derleme ve paket  [doğrulandı]

```sh
export MOZCONFIG=$PWD/mozconfig
cd engine && env -u CLAUDECODE ./mach build            # tam derleme (saatler sürer)
cd .. && sh tools/build-locale.sh                      # Türkçe (tr) dist'e girer; pakete girmesi için şart
cd engine/obj-vento/vento/installer && make make-package
# çıktı: engine/obj-vento/dist/vento-<sürüm>.en-US.mac.dmg
```

`mach package` çalışmaz (kök Makefile'da `package` hedefi yok); yukarıdaki doğrudan `make make-package` kullanılır.
Paketin içeriği `vento/installer/package-manifest.in`; dil girdileri `Makefile.in` içindeki `MOZ_CHROME_MULTILOCALE = tr`.
Makefile.in değişince `engine/obj-vento/vento/installer/Makefile` bir sonraki yapılandırmada yenilenir.

Paketi sına (DMG'den kopyalanmış uygulamada öz-test):

```sh
VENTO_APP=/yol/Vento.app tools/selftest.sh --no-build     # 408/408 + 7/7 beklenir (0.1.0, 2026-10-01)
```

Paket kimliği: `com.cansoykanyilmaz.vento` (`mozconfig`: `--with-distribution-id`, `vento/branding/default/configure.sh`: `MOZ_MACBUNDLE_ID`).

## 2. İmzalama  [Developer ID + notarization doğrulandı, 2026-10-01]

```sh
python3 tools/sign-app.py /yol/Vento.app                                   # ad-hoc: yalnız yerel test
python3 tools/sign-app.py /yol/Vento.app --identity "Developer ID Application: Ad (TAKIM)" --notarize PROFIL
sh tools/make-dmg.sh /yol/Vento.app /yol/vento-<sürüm>.dmg                 # imzalı .app'ten DMG
```

- Yetkiler `vento/installer/entitlements/` altında. Firefox'un üretim yetkileri Mozilla'nın ekip kimliğine bağlıdır, kullanılamaz.
- `PROFIL`: bir kez `xcrun notarytool store-credentials PROFIL --apple-id … --team-id …` ile saklanır.
- 2026-09-30: 0.1.0 DMG'si anahtarlıktaki `Developer ID Application: erdogan yilmaz (MQ8525E33U)` ile imzalandı (Can'ın onayıyla; sertifika başka bir kişi adına). Sertifika sahibi değişirse `--identity` ile değiştir. 2026-10-01: .app ve DMG notarize edilip zımbalandı (`spctl`: Notarized Developer ID). Profil: `vento` (Apple ID idealcozumler.csy@gmail.com, takım MQ8525E33U; uygulamaya özel şifre anahtarlıkta). Not: Vento içinden Apple hesabına passkey ile giriş çalışmıyor (özel tarayıcı yetkisi yok); Safari/Chrome kullan.

## 3. Site  [doğrulandı, yayına yükleme elle]

```sh
node site/build.mjs --dmg /yol/vento-<sürüm>.dmg       # DMG adı site için vento-<sürüm>.dmg olmalı
```

Zip'i Plesk → `vento.cansoykanyilmaz.com` → `httpdocs` içine aç. Sunucudaki `/updates/` klasörüne dokunma (zip onu içermez).
Uygulamanın bildiği adresler: sürüm notları `/surum-notlari/` ve `/en/release-notes/` (`vento-update.js`); site bu yolları üretir.

## 4. Güncelleme sunucusu  [denenmedi]

Uygulama şuraya bakar (`patches/0004-update-url-vento.patch`):

```
https://vento.cansoykanyilmaz.com/updates/browser/<BUILD_TARGET>/<CHANNEL>/update.xml      # ör. Darwin_aarch64-gcc3/vento
```

- Kanal `vento`; yalnız `patches/0003` ile eklenen sertifikanın (`vento1.der`/`vento2.der`) imzaladığı MAR'ları kabul eder.
- MAR imzalama anahtarı: `~/.vento-mar-keys` (NSS veritabanı, takma ad `vento-mar-1`). **Bu anahtarı yedekle**; kaybolursa yayımlanmış hiçbir sürüm güncellenemez.
- Yapılması gereken (yazılmadı): tam MAR üretimi, `signmar` ile imza, `update.xml` üretimi, `tools/sign-mar.sh`. İlk sürümde sunucuda güncelleme yok; site bunu açıkça söylüyor.
- Gizlilik: adreste yalnız yapı hedefi ve kanal bulunur; sürüm/kimlik gitmez (site gizlilik sayfasında yazılı).

## 5. 0.1.1 planı (2026-10-01'de kararlaştırıldı)

1. **Güncelleme sunucusu** (§4): MAR üretimi, `signmar`, `update.xml`, `tools/sign-mar.sh`; 0.1.0 → 0.1.1 uçtan uca denenir.
2. **Passkey:** Neden: `MacOSWebAuthnService.mm` `com.apple.developer.web-browser.public-key-credential` yetkisi yoksa platform passkey API'sini kapatır; Vento'nun `browser.xml`'inde yok (Mozilla'nın yetkisi ekip kimliğine bağlı).
   Yapılacak: Account Holder (sertifika sahibi) Apple'a yetki talebi gönderir → onaydan sonra `com.cansoykanyilmaz.vento` açık App ID + Developer ID provisioning profile → profil `Contents/embedded.provisionprofile` olarak gömülür, yetki `browser.xml`'e eklenir, yeniden imzala + notarize. Başarısızlık nedeni `WebAuthn` log'unda görünür.
   Geçici: Safari/Chrome kullan; sitede "bilinen eksik" notu var.
