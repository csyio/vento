// Sahte OpenAI uyumlu LLM: Esin öz-testi için. Neyin gönderildiğini kaydeder, /stats ile verir.
// Kullanım: node tools/fake-llm.mjs <port-dosyası>
import http from "node:http";
import https from "node:https";
import fs from "node:fs";

const stats = { requests: [], aborted: 0 };

const srv = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/stats") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(stats));
  }
  // İndirme testi: ek olarak sunulan bir dosya (Content-Disposition: attachment)
  if (req.method === "GET" && req.url.startsWith("/dosya.bin")) {
    const body = Buffer.alloc(200 * 1024, 65);
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="rapor.bin"',
      "Content-Length": body.length,
    });
    return res.end(body);
  }
  // İzin testi: güvenli bağlam (127.0.0.1) gerektiren API'ler için sayfa; davranış #hash ile seçilir
  if (req.method === "GET" && req.url.startsWith("/izin.html")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(`<!doctype html><meta charset="utf-8"><title>hazır</title><script>
      const mode = location.search.slice(1); // ?notif — hash değişimi sayfayı yeniden yüklemez
      const set = t => (document.title = t);
      if (mode === "notif") Notification.requestPermission().then(r => set("n:" + r));
      if (mode === "geo") navigator.geolocation.getCurrentPosition(() => set("geo:ok"), e => set("geo:" + e.code));
      if (mode === "media") navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(st => set("media:ok:" + st.getTracks().length), e => set("media:" + e.name));
      if (mode === "cam") navigator.mediaDevices.getUserMedia({ video: true }).then(st => set("cam:ok:" + st.getTracks().length), e => set("cam:" + e.name));
    </script>`);
  }
  // Simge testi: /simge/link.html (<link rel=icon> → kırmızı), /simge/kok.html (bağlantısız → /favicon.ico mavi)
  if (req.method === "GET" && req.url === "/simge/link.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end('<!doctype html><meta charset="utf-8"><title>Bağlantılı</title><link rel="icon" type="image/png" href="/simge/kirmizi.png"><p>x</p>');
  }
  if (req.method === "GET" && req.url === "/simge/kok.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end('<!doctype html><meta charset="utf-8"><title>Köke düşen</title><p>x</p>');
  }
  if (req.method === "GET" && (req.url === "/simge/kirmizi.png" || req.url === "/favicon.ico")) {
    const red = req.url !== "/favicon.ico";
    res.writeHead(200, { "Content-Type": red ? "image/png" : "image/x-icon", "Cache-Control": "no-store" });
    return res.end(Buffer.from(red ? "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGO4IydHEmIY1TCqYfhqAACaMxgQdGu1YAAAAABJRU5ErkJggg==" : "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGOQs7lDEmIY1TCqYfhqAAAQ1jYQxYTP1AAAAABJRU5ErkJggg==", "base64"));
  }
  // Kimlik doğrulama testi: /kimlik/* → Basic (kullanıcı can, parola gizli). Doğru: 200 "Giris yapildi"; yanlış/yok: 401 "Yetkisiz"
  if (req.method === "GET" && req.url.startsWith("/kimlik/")) {
    stats.authAttempts = stats.authAttempts ?? [];
    const h = req.headers.authorization ?? "";
    const ok = h === "Basic " + Buffer.from("can:gizli").toString("base64");
    stats.authAttempts.push({ url: req.url, sent: !!h, ok });
    if (ok) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end('<!doctype html><meta charset="utf-8"><title>Giris yapildi</title><p>ic sayfa</p>');
    }
    res.writeHead(401, { "Content-Type": "text/html; charset=utf-8", "WWW-Authenticate": 'Basic realm="Test Alani"' });
    return res.end('<!doctype html><meta charset="utf-8"><title>Yetkisiz</title><p>giris gerekli</p>');
  }
  // Dosya seçici testi: tek / çoklu / accept'li / klasör girdileri; seçilen dosyaların adı+içeriği başlığa yazılır
  if (req.method === "GET" && req.url.startsWith("/dosya.html")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(`<!doctype html><meta charset="utf-8"><title>hazir</title>
      <input id="tek" type="file"><input id="cok" type="file" multiple>
      <input id="acc" type="file" accept=".txt,image/png"><input id="dir" type="file" webkitdirectory>
      <script>
        const yaz = async inp => { const p = []; for (const f of inp.files) p.push(f.name + "=" + (await f.text())); document.title = "dosya:" + inp.id + ":" + p.join("|"); };
        for (const id of ["tek", "cok", "acc"]) document.getElementById(id).addEventListener("change", e => yaz(e.target));
        document.getElementById("dir").addEventListener("change", e => { document.title = "dosya:dir:" + e.target.files.length; });
      </script>`);
  }
  // Oturum/kapalı sekme testleri: /oturum/<ad> ve /kapali/<ad> → başlığı "Sayfa <AD>" olan gerçek bir sayfa
  {
    const m = req.method === "GET" && /^\/(oturum|kapali)\/([^/?#]+)/.exec(req.url);
    if (m) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(`<!doctype html><meta charset="utf-8"><title>Sayfa ${decodeURIComponent(m[2]).toUpperCase()}</title><p>${m[2]}</p>`);
    }
  }
  // Yazdırma testi: ?pencere → sayfa kendi window.print()'ini çağırır
  if (req.method === "GET" && req.url.startsWith("/yazdir.html")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(`<!doctype html><meta charset="utf-8"><title>Yazdirma sayfasi</title>
      <h1>Yazdirilacak baslik</h1><p>Turkce karakterler: ığüşöç ĞÜŞİÖÇ. ${"Uzun paragraf. ".repeat(80)}</p>
      <script>if (location.search === "?pencere") setTimeout(() => window.print(), 300);</script>`);
  }
  if (req.method === "GET" && req.url.startsWith("/yavas.bin")) {
    // İptal testi: 5 MB'ı ağır ağır yollar (bitmesi ~30 sn sürer)
    res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": 5 * 1024 * 1024 });
    const iv = setInterval(() => res.write(Buffer.alloc(8192, 66)), 50);
    res.on("close", () => clearInterval(iv));
    return;
  }
  if (req.method !== "POST" || !req.url.endsWith("/chat/completions")) {
    res.writeHead(404);
    return res.end();
  }
  let raw = "";
  req.on("data", c => (raw += c));
  req.on("end", () => {
    const body = JSON.parse(raw);
    const msgs = body.messages;
    const last = msgs[msgs.length - 1].content;
    const urls = [...last.matchAll(/adres="([^"]+)"/g)].map(m => m[1]);
    const question = (last.split("Soru: ").pop() ?? "").trim();
    stats.requests.push({
      urls,
      question,
      systemOk: msgs[0].role === "system" && msgs[0].content.includes("Esin"),
      historyLen: msgs.length - 2,
      stream: body.stream === true,
      pageChars: [...last.matchAll(/<sayfa[^>]*>\n([\s\S]*?)\n<\/sayfa>/g)].reduce((n, m) => n + m[1].length, 0),
      hasAuth: !!req.headers.authorization,
    });

    // Kota (vekilin davranışı): KOTA-DOLU → 429 client_quota, GLOBAL-DOLU → 429 global_quota; diğerlerinde kalan hak başlığı
    if (question.includes("KOTA-DOLU") || question.includes("GLOBAL-DOLU")) {
      res.writeHead(429, { "Content-Type": "application/json" });
      const client = question.includes("KOTA-DOLU");
      return res.end(JSON.stringify({ error: { message: "kota", code: client ? "client_quota" : "global_quota", limit: client ? 30 : null, resetAt: new Date(Date.now() + 3 * 3600_000).toISOString() } }));
    }
    stats.quotaLeft = (stats.quotaLeft ?? 30) - 1;
    res.writeHead(200, { "Content-Type": "text/event-stream", "X-Esin-Limit": "30", "X-Esin-Remaining": String(stats.quotaLeft) });
    const send = t => res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`);

    if (question.includes("YAVAS")) {
      // bitmez: istemci kopunca "close" gelir
      send("Başlıyorum");
      const iv = setInterval(() => send(" ve"), 100);
      res.on("close", () => {
        clearInterval(iv);
        stats.aborted++;
      });
      return;
    }
    if (question.includes("HTML")) {
      send('<b>x</b> <img src=x onerror="1"> **kalın** ve `kod`\n\n- bir\n- iki');
      return res.end("data: [DONE]\n\n");
    }
    if (question.includes("HATA")) {
      res.writeHead(200);
    }
    const answer = `Sayfalar: ${urls.join(", ") || "yok"}. Soru: ${question}. Geçmiş: ${msgs.length - 2}.`;
    const parts = answer.match(/.{1,24}/g);
    let i = 0;
    const iv = setInterval(() => {
      if (i < parts.length) {
        return send(parts[i++]);
      }
      clearInterval(iv);
      res.end("data: [DONE]\n\n");
    }, 15);
  });
});

srv.listen(0, "127.0.0.1", () => {
  fs.writeFileSync(process.argv[2], String(srv.address().port));
});

// HTTPS ucu (sertifika hatası testi): kendinden imzalı sertifika. Kullanım: node fake-llm.mjs <port> <tls-port> <key.pem> <cert.pem>
if (process.argv[3] && process.argv[4] && process.argv[5]) {
  const tls = https.createServer({ key: fs.readFileSync(process.argv[4]), cert: fs.readFileSync(process.argv[5]) }, (req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end('<!doctype html><meta charset="utf-8"><title>Güvenli sayfa</title><p>tls-ok</p>');
  });
  tls.listen(0, "127.0.0.1", () => fs.writeFileSync(process.argv[3], String(tls.address().port)));
}
