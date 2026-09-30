// Esin vekil sunucusu — LLMTR anahtarını sunucuda tutar; tarayıcı anahtarı hiç görmez.
//
// Ne yapar: POST /v1/chat/completions → LLMTR'ye iletir, Authorization başlığını burada ekler.
// Ne yapmaz: içerik loglamaz, istemcinin gönderdiği başlıkları/alanları olduğu gibi geçirmez.
//
// Sıfır bağımlılık (Node 18+). Test edilebilsin diye başlatma server.mjs'te, mantık burada.

import http from "node:http";
import fs from "node:fs";
import { once } from "node:events";

/** Yalnızca kotaya dahil modeller. Liste dışı istek sessizce varsayılana düşer. */
export const MODELS = ["greenpt/gpt-oss-120b-eu", "qwen/qwen3.6-35b-a3b", "qwen/qwen3.6-flash"];
export const DEFAULT_MODEL = MODELS[0];

// Tek bir isteğin kotayı yiyememesi için sınırlar.
export const LIMITS = {
  maxTokens: 1500, // yanıt tavanı
  maxBodyBytes: 512 * 1024, // istek gövdesi
  maxTotalChars: 150_000, // tüm mesajların toplam uzunluğu (~35k jeton)
  maxMessages: 40,
};

const ROLES = new Set(["system", "user", "assistant"]);

const err = message => ({ error: { message } });

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
        reject(Object.assign(new Error("gövde çok büyük"), { code: "TOO_BIG" }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** Yalnızca bilinen alanları yeniden kurar. Geçersizse null. */
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
    dailyLimit = 2000, // UTC günü başına istek; 0 = kapalı
    counterPath = "", // boşsa bellekte sayılır
    perMinute = 20, // IP başına dakikada
    trustProxyHops = 1, // X-Forwarded-For sonundan kaçıncı adres istemci
    log = line => console.log(line),
  } = cfg;

  // ---- IP başına jeton kovası (bellekte) --------------------------------------------------
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
    // nginx gelen listenin SONUNA ekler; ilk adres istemci tarafından uydurulabilir.
    return xff[xff.length - trustProxyHops] ?? req.socket.remoteAddress ?? "?";
  }

  // ---- Günlük tavan (dosya sayacı, süreçler arası kilit) ------------------------------------
  let memCount = { date: "", count: 0 };
  const today = () => new Date().toISOString().slice(0, 10);

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
            fs.rmdirSync(lock); // takılı kalmış kilit
          }
        } catch {
          // başka süreç kaldırdı
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
    throw new Error("sayaç kilidi alınamadı");
  }

  function readCount() {
    if (!counterPath) {
      return memCount.date === today() ? memCount : { date: today(), count: 0 };
    }
    try {
      const s = JSON.parse(fs.readFileSync(counterPath, "utf8"));
      return s.date === today() ? s : { date: today(), count: 0 };
    } catch {
      return { date: today(), count: 0 };
    }
  }

  /** true → istek sayıldı; false → günlük tavan doldu. */
  function bumpDaily() {
    if (!dailyLimit) {
      return true;
    }
    const step = () => {
      const s = readCount();
      if (s.count >= dailyLimit) {
        return false;
      }
      s.count += 1;
      if (counterPath) {
        fs.writeFileSync(counterPath, JSON.stringify(s));
      } else {
        memCount = s;
      }
      return true;
    };
    return counterPath ? withLock(step) : step();
  }

  // ---- Uç noktalar ------------------------------------------------------------------------------
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
    if (!take(clientIp(req))) {
      status = 429;
      json(res, status, err("Çok fazla istek, biraz bekle"));
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
    if (!bumpDaily()) {
      status = 429;
      json(res, status, err("Günlük sınır doldu, yarın tekrar dene"));
      return done();
    }

    const payload = buildPayload(body, messages);
    model = payload.model;

    // İstemci bağlantıyı kapatırsa ("durdur") upstream'i de iptal et; yoksa jeton yanmaya devam eder.
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
        json(res, status, err("Sağlayıcıya ulaşılamadı"));
      }
      return done();
    }

    if (!up.ok) {
      // Sağlayıcının ham hatasını (anahtar/adres ipuçları) istemciye sızdırma.
      status = up.status === 429 ? 429 : 502;
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
    });
    try {
      for await (const chunk of up.body) {
        if (!res.write(chunk)) {
          await once(res, "drain");
        }
      }
    } catch {
      // iptal ya da upstream koptu; aşağıda kapanır
    } finally {
      res.end();
    }
    done();
  }

  return http.createServer(async (req, res) => {
    try {
      const path = new URL(req.url, "http://x").pathname;
      if (req.method === "GET" && path === "/health") {
        const s = readCount();
        return json(res, 200, {
          ok: true,
          configured: !!apiKey,
          models: MODELS,
          today: { count: s.count, limit: dailyLimit },
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
