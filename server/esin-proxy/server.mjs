// Başlatıcı (Plesk "Application Startup File"). Mantık app.mjs'te; burası yalnızca ortamı okur.
//
// Ortam değişkenleri:
//   LLMTR_API_KEY     (zorunlu — yoksa /v1 istekleri 503 döner, /health "configured:false")
//   LLMTR_BASE_URL    varsayılan https://llmtr.com/v1
//   ESIN_DAILY_LIMIT  tüm kullanıcılar için günlük toplam istek, varsayılan 2000 (0 = kapalı)
//   ESIN_CLIENT_DAILY kullanıcı (IP) başına günlük istek kotası, varsayılan 30 (0 = kapalı)
//   ESIN_DAY_OFFSET_HOURS  günün döndüğü UTC farkı, varsayılan 3 (Türkiye saati: kota 00:00'da yenilenir)
//   ESIN_PER_MINUTE   IP başına dakikada istek, varsayılan 20
//   ESIN_COUNTER_PATH sayaç dosyası, varsayılan bu klasörde esin-daily.json
//   TRUST_PROXY_HOPS  X-Forwarded-For sonundan kaçıncı adres istemci, varsayılan 1
//   PORT              Plesk/Passenger kendisi verir; yerelde varsayılan 3111

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createProxy } from "./app.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const num = (v, d) => (v === undefined || v === "" || Number.isNaN(Number(v)) ? d : Number(v));

const server = createProxy({
  apiKey: env.LLMTR_API_KEY ?? "",
  baseUrl: env.LLMTR_BASE_URL || undefined,
  dailyLimit: num(env.ESIN_DAILY_LIMIT, 2000),
  clientDaily: num(env.ESIN_CLIENT_DAILY, 30),
  dayOffsetHours: num(env.ESIN_DAY_OFFSET_HOURS, 3),
  perMinute: num(env.ESIN_PER_MINUTE, 20),
  counterPath: env.ESIN_COUNTER_PATH || path.join(here, "esin-daily.json"),
  trustProxyHops: num(env.TRUST_PROXY_HOPS, 1),
});

server.listen(num(env.PORT, 3111), () => {
  console.log(`esin-proxy hazır (anahtar ${env.LLMTR_API_KEY ? "var" : "YOK"})`);
});
