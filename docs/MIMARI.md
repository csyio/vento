# Vento — mimari kararlar (2026-09-30)

Eski tarayıcı (`~/Desktop/csy-browser`) Firefox'un `browser.xhtml` / `gBrowser` katmanına giydirilmişti.
Bu yüzden Firefox'un iç davranışları Vento'nun davranışı oldu. Yeni proje bunu tekrarlamaz.

## Karar

**Gecko motoru + tamamen kendi kabuk.** Thunderbird (`comm/mail`) modeli: `browser/` derlenmez,
motor ağacının yanında kendi uygulama dizinimiz (`vento/`) vardır ve `toolkit/` üzerine kurulur.

```
engine/          Firefox 153.2.0esr, pristine git ağacı — dokunulmaz, git'e girmez
vento/           bizim uygulama dizinimiz (engine/vento -> ../vento sembolik bağ)
  moz.configure, confvars.sh, app.mozbuild, moz.build
  app/           ikili (nsVentoApp.cpp), tercihler (profile/vento.js), macOS paketi
  base/          pencere/kabuk XHTML + JS (chrome://vento/content/)
  branding/      ad, ikonlar
mozconfig        --enable-project=vento, obj-vento
tools/link.sh    engine/vento bağını kurar
```

## Kurallar

1. Firefox dosyalarına **minimum yama**: yalnızca derleme uyumu için, `patches/NNNN-*.patch` olarak
   izlenir, `tools/apply-patches.sh` uygular. Arayüz/davranış yaması **asla**. Her şey `vento/` altında.
2. `browser/` dizinine, `browser.xhtml`'e ve `gBrowser`'a bağımlılık **sıfır**.
3. Motor ile arayüz arasında tek ince katman (sekme/oturum modeli bizim).
4. Surfer yok. Düz `mach`. Firefox sürümü sabit, yükseltme bilinçli.
5. İlk günden otomatik test.
6. Dikey dilim: önce ince uçtan uca çekirdek, sonra özellik.

## Pencere nasıl açılıyor

`toolkit/components/DefaultCLH.sys.mjs` → `toolkit.defaultChromeURI` tercihi
(`vento/app/profile/vento.js`) → `chrome://vento/content/vento.xhtml`. Firefox tarayıcı kodu yok.

## Toolkit'te hazır olanlar (browser/ dışında)

places, downloads, sessionstore (C++ çekirdeği), extensions, prompts, search, contextualidentity,
find, printing, **pageextractor, ml, translations** (Esin için sayfa metni/yapısı ve yerel model).

## İlk sürüm kapsamı

Yatay çoklu sekme, adres çubuğu, **Esin** (sayfayı okuyup özetleme/soru cevaplama +
çoklu sekme bağlamı), oturum geri yükleme, indirme, izinler.
Sonraya: sayfada işlem yapma (form/tıklama), workspaces, split view, glance, konteynerler.
Arayüz düzeni bilerek açık: "her şey bize özel" — dikey sekme yok, Firefox/Zen/Arc kalıbı yok.

## Sıra

1. ~~Spike~~ ✅ **tamam (2026-09-30):** `VentoStartup` pencereyi açtı, uzak içerik (`webIsolated`) example.com'u yükledi.
2. Bir sekme + adres çubuğu, 3. yatay çoklu sekme, 4. Esin paneli (LLMTR), 5. oturum/indirme/izin.

## Spike bulguları (2026-09-30)

Toolkit'in `browser/`'a sert bağımlılığı **yok** — ama her Gecko uygulamasının sağlaması gereken iki şey çıktı:

- `nsIShellService.h`: `widget/cocoa/nsMenuBarX.mm` koşulsuz include eder. Çözüm: kendi
  `vento/components/shell/nsIShellService.idl` (yama gerekmedi; Thunderbird da böyle).
- `services/settings/dumps/gen_last_modified.py`: derleme uygulaması adı sabit izin listesinde
  (`browser`, `mobile/*`, `comm/*`). Çözüm: `patches/0001` (3 satır, `"vento"` eklendi).

- Kimlik: `--with-app-basename=Vento` verilmezse `Name=Firefox` olur → gerçek Firefox profil klasörü → sessiz "profil eksik" diyaloğu. Bkz. vault `Knowledge/Vento Gecko Uygulaması Tuzakları.md`.

Tam derleme ~45 dk (M-serisi, sıfırdan). Sonraki derlemeler artımlı.

## Tuzaklar (yaşandıkça eklenecek)

- `mach` `CLAUDECODE` görünce çıktıyı kısar: `env -u CLAUDECODE ./mach ...`
- `git clean` sembolik bağı siler → `tools/link.sh` yeniden çalıştır (`.git/info/exclude`'da olduğu için normalde silmez).
