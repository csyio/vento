# Esin vekil sunucusu

LLMTR anahtarını sunucuda tutar; tarayıcı anahtarı hiç görmez. Tarayıcıya gömülen anahtar herkesin
kotayı boşaltması demek (3M jeton/ay bir günde biter), bu yüzden istekler buradan geçer.

Sıfır bağımlılık (Node 18+). Mantık `app.mjs`, başlatıcı `server.mjs`, testler `test.mjs`.

## Ne yapar / yapmaz

- `POST /v1/chat/completions` → LLMTR'ye iletir; `Authorization` başlığını **burada** ekler,
  istemcinin gönderdiğini yok sayar.
- **Model beyaz listesi:** `greenpt/gpt-oss-120b-eu` (varsayılan), `qwen/qwen3.6-35b-a3b`,
  `qwen/qwen3.6-flash`. Liste dışı istek sessizce varsayılana düşer. `greenpt/green-l` bilerek yok
  (gizli sistem istemi ~2.5k jeton/istek, kotayı yer).
- Gövdeyi olduğu gibi geçirmez; yalnızca bilinen alanları yeniden kurar. `max_tokens` ≤ 1500;
  toplam mesaj uzunluğu ≤ 150k karakter; ≤ 40 mesaj.
- **Kota (üç katman):**
  1. IP başına dakikada 20 istek (`ESIN_PER_MINUTE`) → `429 code:"rate"`.
  2. **Kullanıcı (IP) başına günlük kota, varsayılan 30 istek** (`ESIN_CLIENT_DAILY`, 0 = kapalı) → `429 code:"client_quota"`,
     gövdede `limit` ve `resetAt`. Başarılı yanıtlarda `X-Esin-Limit` / `X-Esin-Remaining` / `X-Esin-Reset` başlıkları gelir (Vento panelde "Bugün kalan: N / 30" gösterir).
  3. Tüm kullanıcılar için günlük toplam tavan, varsayılan 2000 (`ESIN_DAILY_LIMIT`) → `429 code:"global_quota"`. Bütçe koruması; tek kişi değil herkes için.
  - **Gün Türkiye saatine göre döner** (`ESIN_DAY_OFFSET_HOURS`, varsayılan 3): kota 00:00'da yenilenir.
  - Geçersiz/bozuk istekler hak yemez; sağlayıcıya ulaşılamazsa (502/429) hak **geri verilir**.
  - Sayaç dosyası (`esin-daily.json`): kullanıcılar **ham IP ile değil, tuzlu SHA-256 özetinin ilk 16 karakteriyle** tutulur; özetler ertesi gün silinir.
    Tuz dosyada kalıcıdır; yeniden başlatma kotayı sıfırlamaz. 100.000'den fazla farklı kullanıcı aynı gün gelirse yenileri reddedilir.
  - **Bütçe hesabı (sayıları buna göre ayarla):** LLMTR test bütçesi ~3M jeton/ay ≈ 100k jeton/gün. Sayfa bağlamlı bir soru tipik 3–6k jeton tutar
    (en kötü durumda ~35k). Yani 100k jeton/gün ≈ **günde 20–30 soru TOPLAM**. Varsayılanlar (kullanıcı başına 30, toplam 2000) bu bütçeye göre
    değil, kötüye kullanımı sınırlamak için; bütçeyi korumak istiyorsan `ESIN_DAILY_LIMIT`'i düşür (ör. 25–150) ve `ESIN_CLIENT_DAILY`'i
    (ör. 10–20) birlikte ayarla. Kullanıcı sayısı artınca LLMTR ile bütçeyi konuşmak gerekir.
- İstemci bağlantıyı kapatınca ("durdur") upstream de iptal edilir; yoksa jeton yanmaya devam eder.
- Sağlayıcının ham hatasını istemciye sızdırmaz (anahtar/adres ipuçları).
- **İstem ve yanıt içeriği loglanmaz.** Yalnızca zaman, model, durum, mesaj sayısı, süre.
- Kullanıcı kimliği yok — o sonraki adım. Şimdilik korunma: IP sınırı + günlük tavan.

## Plesk kurulumu

Önerilen alt alan adı: **`esin.cansoykanyilmaz.com`** (tarayıcıdaki varsayılan adres bu; farklı bir ad
seçersen `vento/app/profile/vento.js` içindeki `vento.esin.endpoint` tercihini de değiştir).

1. Plesk → Websites & Domains → **Add Subdomain** → `esin` (SSL/TLS: Let's Encrypt açık).
2. Bu klasörün (`server/esin-proxy`) dosyalarını (`app.mjs`, `server.mjs`, `package.json`) alt alanın
   klasörüne yükle (ör. `httpdocs/` dışında bir yer: `esin-proxy/`).
3. Alt alan → **Node.js** → Node sürümü 18+ → *Application Root*: yüklediğin klasör →
   *Application Startup File*: `server.mjs`.
4. **Custom environment variables:** `LLMTR_API_KEY` = LLMTR panelinden aldığın anahtar.
   **Anahtarı kimseyle/hiçbir sohbette paylaşma; yalnızca buraya yaz.**
   İsteğe bağlı: `ESIN_CLIENT_DAILY`, `ESIN_DAILY_LIMIT`, `ESIN_PER_MINUTE`, `ESIN_DAY_OFFSET_HOURS`, `TRUST_PROXY_HOPS`.
5. *Enable Node.js* → *Restart App*.
6. Doğrula:
   ```sh
   curl https://esin.cansoykanyilmaz.com/health
   # {"ok":true,"configured":true,"models":[...],"today":{"count":0,"limit":2000}}
   ```
   `configured:false` ise anahtar değişkeni okunmamış demektir.

### GreenPT veri aktarım onayı

LLMTR'nin 23 Eylül 2026 tarihli geri bildirimine göre GreenPT modelleri için LLMTR hesabında
**Ayarlar → Veri aktarım onayları → GreenPT** onayı gerekir. `LLMTR_API_KEY`'in ait olduğu hesapta
bunu bir kez kontrol et; kullanıcıdan istenmez. Bunun Vento gizlilik sayfasına da yazılması gerekir.

### Client IP ve `TRUST_PROXY_HOPS`

Sınırlar IP'ye göre. nginx `X-Forwarded-For` listesinin **sonuna** gerçek istemciyi ekler, ilk adres
istemci tarafından uydurulabilir; bu yüzden sondan sayılır (`TRUST_PROXY_HOPS=1`). Plesk'te nginx'in
önünde/arkasında ek bir vekil varsa 2 yap. Doğrulamak için birkaç istekle `/health` sayacına bak.

## Yerelde

```sh
node --test                                 # 11 test, sahte LLM ile, ağa çıkmaz
LLMTR_API_KEY=... PORT=3111 node server.mjs
curl localhost:3111/health
```
