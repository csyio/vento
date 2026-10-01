# Vento

Vento, macOS için yazdığımız küçük, gizlilik odaklı bir tarayıcı. Motor Firefox'un (Gecko); sekmeler, akıllı çubuk,
oturum geri yükleme ve Esin asistanı dahil arayüzün tamamı bu depodadır. Durum: **pre-alpha, yalnız macOS (Apple Silicon)**.

İndirme ve bilgi: <https://vento.cansoykanyilmaz.com>

## Yapı

Firefox ağacına dokunmayız. Thunderbird modeli: kendi uygulama dizinimiz (`vento/`), motorun yanında derlenir.
Ayrıntı: [`docs/MIMARI.md`](docs/MIMARI.md).

```
vento/      uygulama: kabuk (XHTML/JS/CSS), tercihler, marka, yerelleştirme (tr, en-US), yükleyici
patches/    Firefox'a uygulanan yalnızca dört küçük derleme/güncelleme yaması
tools/      yama uygulama, imzalama, DMG, öz-test, yerelleştirme denetimi
server/     Esin vekil sunucusu (LLMTR anahtarı yalnızca orada tutulur)
site/       ürün sitesi (statik, çerezsiz)
docs/       mimari, dil, yayın adımları
```

## Derleme

Motor: **Firefox 153.2.0esr** kaynak ağacı `engine/` altına konur (bu depoda yoktur, `.gitignore`'dadır).

```sh
sh tools/link.sh && sh tools/apply-patches.sh
export MOZCONFIG=$PWD/mozconfig
cd engine && ./mach build
```

Paketleme, imzalama ve notarization: [`docs/YAYIN.md`](docs/YAYIN.md). Öz-test: `tools/selftest.sh`.

## Esin ve gizlilik

Esin yalnızca sen sorduğunda sayfa metnini gönderir; istek `server/esin-proxy` üzerinden geçer, istem ve yanıt içeriği loglanmaz.
Ayrıntı ve açık kalan noktalar sitedeki gizlilik sayfasında.

## Lisans

[Mozilla Public License 2.0](LICENSE). Firefox'tan türeyen dosyalar Mozilla'ya aittir ve kendi lisanslarını taşır.
Firefox ve Mozilla adları Mozilla Vakfı'nın markalarıdır; Vento Mozilla ile bağlantılı değildir.
Yazı tipleri (Fraunces, Inter Tight) OFL kapsamındadır (`site/assets/fonts/`).
