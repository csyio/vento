// Vekil testleri: `node --test`. Sahte bir LLM sunucusuyla gerçek davranışı sınar (ağa çıkmaz).
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { createProxy, MODELS, DEFAULT_MODEL, LIMITS } from "./app.mjs";

/** Sahte LLMTR: gelen isteği kaydeder, akış ya da JSON döner. */
async function fakeUpstream() {
  const seen = { requests: [], aborted: 0 };
  let mode = "stream";
  const srv = http.createServer((req, res) => {
    let raw = "";
    req.on("data", c => (raw += c));
    req.on("end", () => {
      seen.requests.push({ headers: req.headers, body: JSON.parse(raw) });
      if (mode === "error401") {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { message: "bad key sk-SECRET llmtr.internal" } }));
      }
      if (mode === "error429") {
        res.writeHead(429);
        return res.end("{}");
      }
      if (mode === "slow") {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write('data: {"choices":[{"delta":{"content":"a"}}]}\n\n');
        res.on("close", () => seen.aborted++);
        return; // bitirmez: istemci kopunca "close" gelir
      }
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write('data: {"choices":[{"delta":{"content":"Mer"}}]}\n\n');
      setTimeout(() => {
        res.write('data: {"choices":[{"delta":{"content":"haba"}}]}\n\n');
        res.end("data: [DONE]\n\n");
      }, 20);
    });
  });
  srv.listen(0);
  await once(srv, "listening");
  return { srv, seen, url: `http://127.0.0.1:${srv.address().port}/v1`, setMode: m => (mode = m) };
}

async function setup(over = {}) {
  const up = await fakeUpstream();
  const logs = [];
  const proxy = createProxy({ apiKey: "SERVER-KEY", baseUrl: up.url, log: l => logs.push(l), ...over });
  proxy.listen(0);
  await once(proxy, "listening");
  const base = `http://127.0.0.1:${proxy.address().port}`;
  const post = (body, headers = {}) =>
    fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  const close = () => {
    proxy.closeAllConnections();
    proxy.close();
    up.srv.closeAllConnections();
    up.srv.close();
  };
  return { up, proxy, base, post, logs, close };
}

const ask = (extra = {}) => ({ messages: [{ role: "user", content: "Selam" }], ...extra });

test("akış aynen geçer, anahtar sunucudan eklenir (istemcininki yok sayılır)", async t => {
  const s = await setup();
  t.after(s.close);
  const r = await s.post(ask(), { Authorization: "Bearer ISTEMCI-ANAHTARI" });
  assert.equal(r.status, 200);
  const text = await r.text();
  assert.match(text, /Mer/);
  assert.match(text, /haba/);
  assert.match(text, /\[DONE\]/);
  const got = s.up.seen.requests[0];
  assert.equal(got.headers.authorization, "Bearer SERVER-KEY");
  assert.notEqual(got.headers.authorization, "Bearer ISTEMCI-ANAHTARI");
});

test("liste dışı model varsayılana düşer; listedeki korunur", async t => {
  const s = await setup();
  t.after(s.close);
  await (await s.post(ask({ model: "greenpt/green-l" }))).text();
  await (await s.post(ask({ model: MODELS[1] }))).text();
  assert.equal(s.up.seen.requests[0].body.model, DEFAULT_MODEL);
  assert.equal(s.up.seen.requests[1].body.model, MODELS[1]);
});

test("max_tokens tavanı; bilinmeyen alanlar geçirilmez", async t => {
  const s = await setup();
  t.after(s.close);
  await (await s.post(ask({ max_tokens: 999999, tools: [{ x: 1 }], user: "kimlik", temperature: 9 }))).text();
  const b = s.up.seen.requests[0].body;
  assert.equal(b.max_tokens, LIMITS.maxTokens);
  assert.equal(b.temperature, 1.5);
  assert.equal(b.tools, undefined);
  assert.equal(b.user, undefined);
  assert.deepEqual(Object.keys(b).sort(), ["max_tokens", "messages", "model", "stream", "temperature"]);
});

test("geçersiz gövde 400, büyük gövde 413, bilinmeyen rol 400", async t => {
  const s = await setup();
  t.after(s.close);
  assert.equal((await s.post("{bozuk")).status, 400);
  assert.equal((await s.post({ messages: [] })).status, 400);
  assert.equal((await s.post({ messages: [{ role: "tool", content: "x" }] })).status, 400);
  assert.equal((await s.post({ messages: [{ role: "user", content: "x".repeat(LIMITS.maxTotalChars + 1) }] })).status, 413);
  assert.equal(s.up.seen.requests.length, 0, "geçersiz istekler sağlayıcıya gitmemeli");
});

test("sağlayıcı hatası ham metin sızdırmaz", async t => {
  const s = await setup();
  t.after(s.close);
  s.up.setMode("error401");
  const r = await s.post(ask());
  assert.equal(r.status, 502);
  const t1 = await r.text();
  assert.doesNotMatch(t1, /SECRET|llmtr\.internal|bad key/);
  s.up.setMode("error429");
  assert.equal((await s.post(ask())).status, 429);
});

test("IP başına dakikalık sınır (429)", async t => {
  const s = await setup({ perMinute: 3 });
  t.after(s.close);
  const codes = [];
  for (let i = 0; i < 5; i++) {
    const r = await s.post(ask());
    codes.push(r.status);
    await r.text();
  }
  assert.deepEqual(codes, [200, 200, 200, 429, 429]);
});

test("X-Forwarded-For'un ilk adresi uydurulamaz (son adres sayılır)", async t => {
  const s = await setup({ perMinute: 1 });
  t.after(s.close);
  const a = await s.post(ask(), { "X-Forwarded-For": "1.1.1.1, 9.9.9.9" });
  await a.text();
  const b = await s.post(ask(), { "X-Forwarded-For": "2.2.2.2, 9.9.9.9" });
  assert.equal(b.status, 429, "ilk adresi değiştirmek sınırı aşmamalı");
});

test("günlük tavan (dosya sayacıyla)", async t => {
  const path = `/tmp/esin-test-${process.pid}.json`;
  const s = await setup({ dailyLimit: 2, counterPath: path });
  t.after(() => {
    s.close();
    import("node:fs").then(fs => fs.rmSync(path, { force: true }));
  });
  const codes = [];
  for (let i = 0; i < 3; i++) {
    const r = await s.post(ask());
    codes.push(r.status);
    await r.text();
  }
  assert.deepEqual(codes, [200, 200, 429]);
  const h = await (await fetch(`${s.base}/health`)).json();
  assert.deepEqual(h.today.count, 2);
});

test("istemci kopunca upstream iptal edilir (jeton yanmaya devam etmez)", async t => {
  const s = await setup();
  t.after(s.close);
  s.up.setMode("slow"); // sahte sağlayıcı yanıtı bitirmez
  const ac = new AbortController();
  const p = fetch(`${s.base}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ask()),
    signal: ac.signal,
  }).catch(() => {});
  await new Promise(r => setTimeout(r, 200));
  ac.abort(); // kullanıcı "durdur"a bastı
  await p;
  await new Promise(r => setTimeout(r, 300));
  assert.equal(s.up.seen.aborted, 1, "upstream bağlantısı kapanmalı");
});

test("içerik loglanmaz", async t => {
  const s = await setup();
  t.after(s.close);
  await (await s.post({ messages: [{ role: "user", content: "GIZLI-MESAJ-METNI" }] })).text();
  assert.ok(s.logs.length > 0);
  assert.doesNotMatch(s.logs.join("\n"), /GIZLI-MESAJ-METNI|SERVER-KEY/);
});

test("anahtar yoksa 503; /health yapılandırma durumunu söyler; bilinmeyen yol 404", async t => {
  const s = await setup({ apiKey: "" });
  t.after(s.close);
  assert.equal((await s.post(ask())).status, 503);
  const h = await (await fetch(`${s.base}/health`)).json();
  assert.equal(h.configured, false);
  assert.equal((await fetch(`${s.base}/x`)).status, 404);
});
