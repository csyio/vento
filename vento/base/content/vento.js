"use strict";

// Spike izleyicisi: VENTO_TRACE ortam değişkeni bir dosya yoluysa oraya iz yazar
// (stdout'a güvenilmez). Yol yoksa hiçbir şey yapmaz.
const TRACE = Services.env.exists("VENTO_TRACE") ? Services.env.get("VENTO_TRACE") : "";
function trace(msg) {
  dump(`VENTO: ${msg}\n`);
  if (TRACE) {
    IOUtils.writeUTF8(TRACE, `${msg}\n`, { mode: "appendOrCreate" }).catch(() => {});
  }
}

trace("chrome script çalıştı");
window.addEventListener("error", e => trace(`HATA: ${e.message} @ ${e.filename}:${e.lineno}`));

window.addEventListener("load", () => {
  const b = document.getElementById("content");
  trace(`pencere yüklendi; browser=${!!b} remote=${b?.isRemoteBrowser} type=${b?.localName}`);
  setTimeout(() => {
    trace(
      `5sn sonra url=${b?.currentURI?.spec} başlık=${b?.browsingContext?.currentWindowGlobal?.documentTitle} ` +
        `remoteType=${b?.remoteType} pencereSayısı=${[...Services.wm.getEnumerator(null)].length}`
    );
  }, 5000);
});
