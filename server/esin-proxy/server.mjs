// Launcher (Plesk "Application Startup File"). The logic is in app.mjs; this file only reads the environment.
//
// Environment variables:
//   LLMTR_API_KEY     (required; without it /v1 requests return 503 and /health reports "configured:false")
//   LLMTR_BASE_URL    default https://llmtr.com/v1
//   ESIN_DAILY_LIMIT  total requests per day across all users, default 2000 (0 = off)
//   ESIN_CLIENT_DAILY daily request quota per user (IP), default 30 (0 = off)
//   ESIN_DAY_OFFSET_HOURS  UTC offset at which the day rolls over, default 3 (Turkey time: the quota resets at 00:00)
//   ESIN_PER_MINUTE   requests per minute per IP, default 20
//   ESIN_COUNTER_PATH counter file, default esin-daily.json in this folder
//   TRUST_PROXY_HOPS  which address from the end of X-Forwarded-For is the client, default 1
//   PORT              set by Plesk/Passenger; defaults to 3111 locally

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
  console.log(`esin-proxy ready (key ${env.LLMTR_API_KEY ? "set" : "MISSING"})`);
});
