# Esin proxy

This server holds the LLMTR key. The browser never sees it. A key shipped inside the browser would let anyone
drain the quota (3M tokens/month is gone in a day), so requests go through here.

No dependencies (Node 18+). The logic is in `app.mjs`, the launcher in `server.mjs`, and the tests in `test.mjs`.

## What it does and doesn't do

- `POST /v1/chat/completions` is forwarded to LLMTR. The `Authorization` header is added **here**.
  Whatever the client sends is ignored.
- **Model allow list:** `greenpt/gpt-oss-120b-eu` (default), `qwen/qwen3.6-35b-a3b`,
  `qwen/qwen3.6-flash`. A request for any other model silently falls back to the default. `greenpt/green-l` is left out on purpose
  (its hidden system prompt costs about 2.5k tokens per request and eats the quota).
- The body is not passed through as is. The proxy rebuilds it from known fields only. `max_tokens` ≤ 1500;
  total message length ≤ 150k characters; at most 40 messages.
- **Quota (three layers):**
  1. 20 requests per minute per IP (`ESIN_PER_MINUTE`) → `429 code:"rate"`.
  2. **A daily quota per user (IP), 30 requests by default** (`ESIN_CLIENT_DAILY`, 0 = off) → `429 code:"client_quota"`,
     with `limit` and `resetAt` in the body. Successful responses carry `X-Esin-Limit` / `X-Esin-Remaining` / `X-Esin-Reset` headers (Vento shows "Bugün kalan: N / 30", meaning "Left today: N / 30", in the panel).
  3. A daily total cap across all users, 2000 by default (`ESIN_DAILY_LIMIT`) → `429 code:"global_quota"`. This protects the budget. It applies to everyone together, not to one person.
  - **The day rolls over on Turkish time** (`ESIN_DAY_OFFSET_HOURS`, default 3). The quota resets at 00:00.
  - Invalid or malformed requests don't use up a request. If the provider can't be reached (502/429), the request is **given back**.
  - Counter file (`esin-daily.json`): users are stored **not by raw IP but by the first 16 characters of a salted SHA-256 hash**. The hashes are deleted the next day.
    The salt is kept in the file, so a restart does not reset the quota. If more than 100,000 distinct users show up on one day, new ones are rejected.
  - **Budget math (set the numbers accordingly):** LLMTR's test budget is about 3M tokens/month, roughly 100k tokens/day. A question with page context is typically 3–6k tokens
    (about 35k in the worst case). So 100k tokens/day is about **20–30 questions per day IN TOTAL**. The defaults (30 per user, 2000 total) are not
    based on this budget. They are there to limit abuse. To protect the budget, lower `ESIN_DAILY_LIMIT` (e.g. 25–150) and adjust `ESIN_CLIENT_DAILY`
    (e.g. 10–20) together with it. If the user count grows, we need to talk to LLMTR about the budget.
- When the client closes the connection ("stop"), the upstream request is cancelled too. Otherwise tokens keep burning.
- The provider's raw errors are not passed to the client (they could hint at the key or address).
- **Prompt and response content is not logged.** Only time, model, status, message count and duration.
- There are no user accounts. That is the next step. For now, protection is the IP limit plus the daily cap.

## Plesk setup

Recommended subdomain: **`esin.cansoykanyilmaz.com`** (this is the default address in the browser). If you
pick a different name, also change the `vento.esin.endpoint` pref in `vento/app/profile/vento.js`.

1. Plesk → Websites & Domains → **Add Subdomain** → `esin` (SSL/TLS: Let's Encrypt on).
2. Upload the files of this folder (`server/esin-proxy`: `app.mjs`, `server.mjs`, `package.json`) to the subdomain's
   folder (somewhere outside `httpdocs/`, e.g. `esin-proxy/`).
3. Subdomain → **Node.js** → Node version 18+ → *Application Root*: the folder you uploaded to →
   *Application Startup File*: `server.mjs`.
4. **Custom environment variables:** `LLMTR_API_KEY` = the key from the LLMTR panel.
   **Don't share the key with anyone or in any chat. Enter it only here.**
   Optional: `ESIN_CLIENT_DAILY`, `ESIN_DAILY_LIMIT`, `ESIN_PER_MINUTE`, `ESIN_DAY_OFFSET_HOURS`, `TRUST_PROXY_HOPS`.
5. *Enable Node.js*, then *Restart App*.
6. Check it:
   ```sh
   curl https://esin.cansoykanyilmaz.com/health
   # {"ok":true,"configured":true,"models":[...],"today":{"count":0,"limit":2000}}
   ```
   `configured:false` means the key variable was not read.

### GreenPT data transfer consent

According to LLMTR's feedback of 23 September 2026, GreenPT models need a consent in the LLMTR account:
**Ayarlar → Veri aktarım onayları → GreenPT** (Settings → Data transfer consents → GreenPT). Check this once in the account that owns
`LLMTR_API_KEY`. Users are not asked for it. It also needs to be written into Vento's privacy page.

### Client IP and `TRUST_PROXY_HOPS`

The limits are per IP. nginx appends the real client to the **end** of the `X-Forwarded-For` list, and the first address
can be forged by the client, so we count from the end (`TRUST_PROXY_HOPS=1`). If Plesk has another proxy in front of
or behind nginx, set it to 2. To verify, send a few requests and watch the `/health` counter.

## Run locally

```sh
node --test                                 # 11 tests, with a fake LLM, no network
LLMTR_API_KEY=... PORT=3111 node server.mjs
curl localhost:3111/health
```
