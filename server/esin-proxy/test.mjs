// Proxy tests: `node --test`. Exercises real behavior against a fake LLM server (no network access).
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { createProxy, MODELS, DEFAULT_MODEL, LIMITS } from "./app.mjs";

/** Fake LLMTR: records the incoming request and returns a stream or JSON. */
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
        return; // never finishes: "close" fires when the client disconnects
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

test("stream passes through unchanged; the key is added server-side (the client's is ignored)", async t => {
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

test("a model outside the list falls back to the default; a listed one is kept", async t => {
  const s = await setup();
  t.after(s.close);
  await (await s.post(ask({ model: "greenpt/green-l" }))).text();
  await (await s.post(ask({ model: MODELS[1] }))).text();
  assert.equal(s.up.seen.requests[0].body.model, DEFAULT_MODEL);
  assert.equal(s.up.seen.requests[1].body.model, MODELS[1]);
});

test("max_tokens is capped; unknown fields are not forwarded", async t => {
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

test("invalid body gives 400, oversized body 413, unknown role 400", async t => {
  const s = await setup();
  t.after(s.close);
  assert.equal((await s.post("{bozuk")).status, 400);
  assert.equal((await s.post({ messages: [] })).status, 400);
  assert.equal((await s.post({ messages: [{ role: "tool", content: "x" }] })).status, 400);
  assert.equal((await s.post({ messages: [{ role: "user", content: "x".repeat(LIMITS.maxTotalChars + 1) }] })).status, 413);
  assert.equal(s.up.seen.requests.length, 0, "invalid requests must not reach the provider");
});

test("a provider error does not leak raw text", async t => {
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

test("per-minute limit per IP (429)", async t => {
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

test("the first X-Forwarded-For address can't be forged (the last address counts)", async t => {
  const s = await setup({ perMinute: 1 });
  t.after(s.close);
  const a = await s.post(ask(), { "X-Forwarded-For": "1.1.1.1, 9.9.9.9" });
  await a.text();
  const b = await s.post(ask(), { "X-Forwarded-For": "2.2.2.2, 9.9.9.9" });
  assert.equal(b.status, 429, "changing the first address must not get around the limit");
});

test("daily cap (with the file counter)", async t => {
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

test("upstream is aborted when the client disconnects (tokens stop burning)", async t => {
  const s = await setup();
  t.after(s.close);
  s.up.setMode("slow"); // the fake provider never finishes the response
  const ac = new AbortController();
  const p = fetch(`${s.base}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ask()),
    signal: ac.signal,
  }).catch(() => {});
  await new Promise(r => setTimeout(r, 200));
  ac.abort(); // the user pressed "stop"
  await p;
  await new Promise(r => setTimeout(r, 300));
  assert.equal(s.up.seen.aborted, 1, "upstream connection must close");
});

test("content is not logged", async t => {
  const s = await setup();
  t.after(s.close);
  await (await s.post({ messages: [{ role: "user", content: "GIZLI-MESAJ-METNI" }] })).text();
  assert.ok(s.logs.length > 0);
  assert.doesNotMatch(s.logs.join("\n"), /GIZLI-MESAJ-METNI|SERVER-KEY/);
});

test("no key gives 503; /health reports the configuration state; unknown path gives 404", async t => {
  const s = await setup({ apiKey: "" });
  t.after(s.close);
  assert.equal((await s.post(ask())).status, 503);
  const h = await (await fetch(`${s.base}/health`)).json();
  assert.equal(h.configured, false);
  assert.equal((await fetch(`${s.base}/x`)).status, 404);
});

// ---- Daily quota per user (IP) ----------------------------------------------------------------
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ipOf = ip => ({ "X-Forwarded-For": ip });

test("user quota: 429 client_quota when used up, others unaffected; remaining count is in the header", async t => {
  const s = await setup({ clientDaily: 3, perMinute: 1000 });
  t.after(s.close);
  const remaining = [];
  for (let i = 0; i < 3; i++) {
    const r = await s.post(ask(), ipOf("203.0.113.1"));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("x-esin-limit"), "3");
    remaining.push(r.headers.get("x-esin-remaining"));
    await r.text();
  }
  assert.deepEqual(remaining, ["2", "1", "0"]);
  const over = await s.post(ask(), ipOf("203.0.113.1"));
  assert.equal(over.status, 429);
  const body = await over.json();
  assert.equal(body.error.code, "client_quota");
  assert.equal(body.error.limit, 3);
  assert.ok(Date.parse(body.error.resetAt) > Date.now(), "reset time is in the future");
  assert.equal(s.up.seen.requests.length, 3, "no request reached the provider once the quota was used up");
  const other = await s.post(ask(), ipOf("203.0.113.2"));
  assert.equal(other.status, 200, "another user is unaffected");
  await other.text();
});

test("quota: an invalid request costs nothing; a provider error refunds the quota", async t => {
  const s = await setup({ clientDaily: 2, perMinute: 1000 });
  t.after(s.close);
  for (let i = 0; i < 5; i++) {
    assert.equal((await s.post("{bozuk", ipOf("203.0.113.3"))).status, 400);
  }
  s.up.setMode("error401");
  for (let i = 0; i < 4; i++) {
    const r = await s.post(ask(), ipOf("203.0.113.3"));
    assert.equal(r.status, 502, "a provider error must not use up the user's quota");
    await r.text();
  }
  s.up.setMode("stream");
  const ok1 = await s.post(ask(), ipOf("203.0.113.3"));
  assert.equal(ok1.headers.get("x-esin-remaining"), "1");
  await ok1.text();
});

test("quota: overall cap has its own code (global_quota); no raw IP in the file; a restart does not reset it", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "esin-q-"));
  const file = path.join(dir, "c.json");
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let s = await setup({ clientDaily: 2, dailyLimit: 3, perMinute: 1000, counterPath: file });
  for (const ip of ["198.51.100.7", "198.51.100.7", "198.51.100.8"]) {
    const r = await s.post(ask(), ipOf(ip));
    assert.equal(r.status, 200);
    await r.text();
  }
  const g = await s.post(ask(), ipOf("198.51.100.9"));
  assert.equal(g.status, 429);
  assert.equal((await g.json()).error.code, "global_quota");
  s.close();

  const raw = fs.readFileSync(file, "utf8");
  assert.ok(!raw.includes("198.51.100"), "no raw IP on disk");
  assert.equal(Object.keys(JSON.parse(raw).clients).length, 2);

  // the process restarts (new createProxy, same file): .7 is still used up
  s = await setup({ clientDaily: 2, dailyLimit: 100, perMinute: 1000, counterPath: file });
  t.after(s.close);
  const again = await s.post(ask(), ipOf("198.51.100.7"));
  assert.equal(again.status, 429);
  assert.equal((await again.json()).error.code, "client_quota");
});

test("quota: the day boundary follows Turkey time; the previous day's counter is reset", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "esin-q-"));
  const file = path.join(dir, "c.json");
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(file, JSON.stringify({ date: "2000-01-01", count: 99, salt: "x", clients: { abc: 99 } }));
  const s = await setup({ clientDaily: 1, dailyLimit: 5, perMinute: 1000, counterPath: file });
  t.after(s.close);
  const r = await s.post(ask(), ipOf("192.0.2.5"));
  assert.equal(r.status, 200, "yesterday's counter does not affect today");
  await r.text();
  const h = await (await fetch(`${s.base}/health`)).json();
  assert.equal(h.today.count, 1);
  assert.equal(h.today.clientLimit, 1);
  // the next reset is local midnight: 00:00 Turkey time = 21:00 UTC
  assert.match(h.today.resetAt, /T21:00:00\.000Z$/);
});
