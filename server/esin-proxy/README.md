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
- IP başına dakikada 20 istek; UTC günü başına 2000 istek (dosya sayacı, süreçler arası kilit).
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
   İsteğe bağlı: `ESIN_DAILY_LIMIT`, `ESIN_PER_MINUTE`, `TRUST_PROXY_HOPS`.
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
