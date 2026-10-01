// Esin proxy server. Keeps the LLMTR key on the server; the browser never sees it.
//
// Does: forwards POST /v1/chat/completions to LLMTR and adds the Authorization header here.
// Does not: log content, or pass the client's headers/fields through as-is.
//
// No dependencies (Node 18+). Startup lives in server.mjs and the logic here, so it can be tested.

import http from "node:http";
import fs from "node:fs";
import { once } from "node:events";
import crypto from "node:crypto";

/** Only models covered by the quota. A model outside the list silently falls back to the default. */
export const MODELS = ["greenpt/gpt-oss-120b-eu", "qwen/qwen3.6-35b-a3b", "qwen/qwen3.6-flash"];
export const DEFAULT_MODEL = MODELS[0];

// Limits so that a single request can't eat the quota.
export const LIMITS = {
  maxTokens: 1500, // response cap
  maxBodyBytes: 512 * 1024, // request body
  maxTotalChars: 150_000, // total length of all messages (~35k tokens)
  maxMessages: 40,
};

const ROLES = new Set(["system", "user", "assistant"]);

const err = (message, extra = {}) => ({ error: { message, ...extra } });

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(data) });
  res.end(data);
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", c => {
      size += c.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error("body too large"), { code: "TOO_BIG" }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** Rebuilds the messages from known fields only. Returns null if invalid. */
export function sanitizeMessages(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > LIMITS.maxMessages) {
    return null;
  }
  const out = [];
  for (const m of input) {
    if (!m || !ROLES.has(m.role) || typeof m.content !== "string" || !m.content) {
      return null;
    }
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

export function buildPayload(body, messages) {
  const asked = Math.floor(Number(body.max_tokens));
  const temperature = Number(body.temperature);
  const payload = {
    model: MODELS.includes(body.model) ? body.model : DEFAULT_MODEL,
    messages,
    stream: body.stream !== false,
    max_tokens: Math.min(asked > 0 ? asked : LIMITS.maxTokens, LIMITS.maxTokens),
  };
  if (Number.isFinite(temperature)) {
    payload.temperature = Math.min(Math.max(temperature, 0), 1.5);
  }
  return payload;
}

export function createProxy(cfg = {}) {
  const {
    apiKey = "",
    baseUrl = "https://llmtr.com/v1",
    dailyLimit = 2000, // total requests per day for ALL users (budget guard); 0 = off
    clientDaily = 30, // daily request quota per user (IP); 0 = off
    dayOffsetHours = 3, // the "day" rolls over at this UTC offset (3 = Turkey time, resets at 00:00)
    counterPath = "", // if empty, counts in memory
    perMinute = 20, // per IP per minute
    trustProxyHops = 1, // which address from the end of X-Forwarded-For is the client
    log = line => console.log(line),
  } = cfg;

  // ---- Per-IP token bucket (in memory) ----------------------------------------------------
  const buckets = new Map();
  function take(ip) {
    const now = Date.now();
    if (buckets.size > 5000) {
      for (const [k, b] of buckets) {
        if (now - b.ts > 120_000) {
          buckets.delete(k);
        }
      }
    }
    const b = buckets.get(ip) ?? { tokens: perMinute, ts: now };
    b.tokens = Math.min(perMinute, b.tokens + ((now - b.ts) * perMinute) / 60_000);
    b.ts = now;
    const ok = b.tokens >= 1;
    if (ok) {
      b.tokens -= 1;
    }
    buckets.set(ip, b);
    return ok;
  }

  function clientIp(req) {
    const xff = String(req.headers["x-forwarded-for"] ?? "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    // nginx appends to the END of the incoming list; the first address can be forged by the client.
    return xff[xff.length - trustProxyHops] ?? req.socket.remoteAddress ?? "?";
  }

  // ---- Daily quota: overall cap + per-user (IP) quota ------------------------------------------
  // File: { date, count, salt, clients: { <salted hash>: count } }. Raw IPs are NEVER written to disk; the hashes are dropped
  // with the day (the salt persists so a restart doesn't reset the quota). Cross-process lock: see withLock.
  const MAX_CLIENTS = 100_000;
  const localNow = () => new Date(Date.now() + dayOffsetHours * 3_600_000);
  const today = () => localNow().toISOString().slice(0, 10);
  const resetAt = () => {
    const n = localNow();
    return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1) - dayOffsetHours * 3_600_000).toISOString();
  };
  let mem = null;

  function withLock(fn) {
    const lock = `${counterPath}.lock`;
    for (let i = 0; i < 100; i++) {
      try {
        fs.mkdirSync(lock);
      } catch (e) {
        if (e.code !== "EEXIST") {
          throw e;
        }
        try {
          if (Date.now() - fs.statSync(lock).mtimeMs > 5000) {
            fs.rmdirSync(lock); // stale lock
          }
        } catch {
          // another process removed it
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
        continue;
      }
      try {
        return fn();
      } finally {
        fs.rmdirSync(lock);
      }
    }
    throw new Error("could not acquire counter lock");
  }

  function load() {
    let s = mem;
    if (counterPath) {
      try {
        s = JSON.parse(fs.readFileSync(counterPath, "utf8"));
      } catch {
        s = null;
      }
    }
    const salt = s?.salt || crypto.randomBytes(16).toString("hex");
    if (!s || s.date !== today()) {
      return { date: today(), count: 0, salt, clients: {} };
    }
    return { date: s.date, count: s.count ?? 0, salt, clients: s.clients ?? {} };
  }

  function save(s) {
    if (counterPath) {
      fs.writeFileSync(counterPath, JSON.stringify(s));
    } else {
      mem = s;
    }
  }

  const transact = fn => (counterPath ? withLock(() => fn()) : fn());
  const clientId = (s, ip) => crypto.createHash("sha256").update(`${s.salt}|${ip}`).digest("hex").slice(0, 16);

  /** Returns { ok:true, limit, remaining } if the request is admitted, { ok:false, code:"client"|"global" } if rejected. */
  function admit(ip) {
    return transact(() => {
      const s = load();
      const id = clientId(s, ip);
      const used = s.clients[id] ?? 0;
      if (clientDaily && (used >= clientDaily || (!(id in s.clients) && Object.keys(s.clients).length >= MAX_CLIENTS))) {
        return { ok: false, code: "client", limit: clientDaily };
      }
      if (dailyLimit && s.count >= dailyLimit) {
        return { ok: false, code: "global" };
      }
      s.count += 1;
      s.clients[id] = used + 1;
      save(s);
      return { ok: true, limit: clientDaily, remaining: clientDaily ? clientDaily - used - 1 : null };
    });
  }

  /** Gives the quota back if the provider was never reached (not the user's fault). */
  function refund(ip) {
    transact(() => {
      const s = load();
      const id = clientId(s, ip);
      if (s.clients[id] > 0) {
        s.clients[id] -= 1;
        s.count = Math.max(0, s.count - 1);
        save(s);
      }
    });
  }

  // ---- Endpoints --------------------------------------------------------------------------------
  async function chat(req, res) {
    const started = Date.now();
    let status = 0;
    let model = "-";
    let msgCount = 0;
    const done = () => log(JSON.stringify({ t: new Date().toISOString(), model, status, msgs: msgCount, ms: Date.now() - started }));

    if (!apiKey) {
      status = 503;
      json(res, status, err("Sunucu yapılandırılmamış"));
      return done();
    }
    const ip = clientIp(req);
    if (!take(ip)) {
      status = 429;
      json(res, status, err("Çok fazla istek, biraz bekle", { code: "rate" }));
      return done();
    }

    let body;
    try {
      body = JSON.parse(await readBody(req, LIMITS.maxBodyBytes));
    } catch (e) {
      status = e.code === "TOO_BIG" ? 413 : 400;
      json(res, status, err(status === 413 ? "İstek çok büyük" : "Geçersiz JSON"));
      return done();
    }

    const messages = sanitizeMessages(body?.messages);
    if (!messages) {
      status = 400;
      json(res, status, err("Geçersiz mesajlar"));
      return done();
    }
    msgCount = messages.length;
    if (messages.reduce((n, m) => n + m.content.length, 0) > LIMITS.maxTotalChars) {
      status = 413;
      json(res, status, err("İstek çok büyük"));
      return done();
    }
    const quota = admit(ip);
    if (!quota.ok) {
      status = 429;
      const message = quota.code === "client" ? "Günlük Esin hakkın doldu" : "Esin bugünlük doldu, yarın tekrar dene";
      json(res, status, err(message, { code: quota.code === "client" ? "client_quota" : "global_quota", limit: quota.limit ?? null, resetAt: resetAt() }));
      return done();
    }

    const payload = buildPayload(body, messages);
    model = payload.model;

    // If the client closes the connection ("stop"), abort the upstream request too; otherwise tokens keep burning.
    const ac = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) {
        ac.abort();
      }
    });

    let up;
    try {
      up = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ac.signal,
      });
    } catch {
      status = ac.signal.aborted ? 499 : 502;
      if (!ac.signal.aborted) {
        refund(ip);
        json(res, status, err("Sağlayıcıya ulaşılamadı"));
      }
      return done();
    }

    if (!up.ok) {
      // Don't leak the provider's raw error (key/address hints) to the client.
      status = up.status === 429 ? 429 : 502;
      refund(ip);
      await up.body?.cancel().catch(() => {});
      json(res, status, err(status === 429 ? "Sağlayıcı yoğun, biraz bekle" : "Sağlayıcı hatası"));
      log(JSON.stringify({ t: new Date().toISOString(), upstream: up.status }));
      return done();
    }

    status = 200;
    res.writeHead(200, {
      "Content-Type": up.headers.get("content-type") ?? "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
      ...(quota.limit ? { "X-Esin-Limit": String(quota.limit), "X-Esin-Remaining": String(quota.remaining), "X-Esin-Reset": resetAt() } : {}),
    });
    try {
      for await (const chunk of up.body) {
        if (!res.write(chunk)) {
          await once(res, "drain");
        }
      }
    } catch {
      // aborted, or the upstream dropped; closed below
    } finally {
      res.end();
    }
    done();
  }

  return http.createServer(async (req, res) => {
    try {
      const path = new URL(req.url, "http://x").pathname;
      if (req.method === "GET" && path === "/health") {
        const s = transact(load);
        return json(res, 200, {
          ok: true,
          configured: !!apiKey,
          models: MODELS,
          today: { count: s.count, limit: dailyLimit, clientLimit: clientDaily, clients: Object.keys(s.clients).length, resetAt: resetAt() },
        });
      }
      if (req.method === "POST" && path === "/v1/chat/completions") {
        return await chat(req, res);
      }
      json(res, 404, err("Bulunamadı"));
    } catch (e) {
      log(JSON.stringify({ t: new Date().toISOString(), hata: String(e?.message ?? e) }));
      if (!res.headersSent) {
        json(res, 500, err("Sunucu hatası"));
      } else {
        res.end();
      }
    }
  });
}
