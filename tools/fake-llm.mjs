// Sahte OpenAI uyumlu LLM: Esin öz-testi için. Neyin gönderildiğini kaydeder, /stats ile verir.
// Kullanım: node tools/fake-llm.mjs <port-dosyası>
import http from "node:http";
import fs from "node:fs";

const stats = { requests: [], aborted: 0 };

const srv = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/stats") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(stats));
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

    res.writeHead(200, { "Content-Type": "text/event-stream" });
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
