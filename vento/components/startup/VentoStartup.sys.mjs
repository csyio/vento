// Vento başlangıç bileşeni: komut satırı işleyicisi. Ana pencereyi DefaultCLH değil biz açarız.
// VENTO_TRACE=<dosya> ortam değişkeni verilirse her adımı oraya yazar (stdout'a güvenilmez).

const TRACE = Services.env.exists("VENTO_TRACE") ? Services.env.get("VENTO_TRACE") : "";
function trace(msg) {
  dump(`VENTO: ${msg}\n`);
  if (TRACE) {
    IOUtils.writeUTF8(TRACE, `${msg}\n`, { mode: "appendOrCreate" }).catch(() => {});
  }
}

const MAIN_WINDOW = "chrome://vento/content/vento.xhtml";
const WINDOW_FEATURES = "chrome,dialog=no,all,resizable";

export function VentoStartup() {}

VentoStartup.prototype = {
  classID: Components.ID("{80b2bd50-970d-4d74-8ae1-5b39020fd685}"),
  QueryInterface: ChromeUtils.generateQI(["nsICommandLineHandler"]),

  handle(cmdLine) {
    trace("startup: komut satırı işleyicisi çağrıldı");
    if (cmdLine.preventDefault) {
      trace("startup: preventDefault zaten set, çıkılıyor");
      return;
    }
    try {
      const win = Services.ww.openWindow(null, MAIN_WINDOW, "_blank", WINDOW_FEATURES, cmdLine);
      trace(`startup: openWindow döndü, pencere=${!!win}`);
      cmdLine.preventDefault = true;
    } catch (e) {
      trace(`startup: openWindow HATA: ${e}`);
    }
  },

  helpInfo: "",
};
