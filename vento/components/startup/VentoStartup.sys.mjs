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
    // Toolkit'in pencere/süreç aktörlerini (PageExtractor, Select, Find, Pdfjs …) kaydeder. Firefox'ta bunu
    // browser/'ın DesktopActorRegistry'si yapar; bizde kimse yapmadığı için burada yüklenir.
    try {
      ChromeUtils.importESModule("resource://gre/modules/ActorManagerParent.sys.mjs");
      trace("startup: toolkit aktörleri kaydedildi");
      ChromeUtils.registerWindowActor("VentoPageText", {
        parent: { esModuleURI: "resource:///actors/VentoPageTextParent.sys.mjs" },
        child: { esModuleURI: "resource:///actors/VentoPageTextChild.sys.mjs" },
        allFrames: false,
        matches: ["http://*/*", "https://*/*"],
        messageManagerGroups: ["browsers"],
      });
      trace("startup: VentoPageText aktörü kaydedildi");
      ChromeUtils.registerWindowActor("VentoContextMenu", {
        parent: { esModuleURI: "resource:///actors/VentoContextMenuParent.sys.mjs" },
        child: {
          esModuleURI: "resource:///actors/VentoContextMenuChild.sys.mjs",
          events: { contextmenu: { mozSystemGroup: true } },
        },
        allFrames: true,
        messageManagerGroups: ["browsers"],
      });
      trace("startup: VentoContextMenu aktörü kaydedildi");
      // Hata sayfasına Ebabil (yalnız bağlantı hatalarında; sertifika uyarısında yok)
      ChromeUtils.registerWindowActor("VentoErrorPage", {
        child: {
          esModuleURI: "resource:///actors/VentoErrorPageChild.sys.mjs",
          events: { DOMContentLoaded: {} },
        },
        matches: ["about:neterror?*"],
        messageManagerGroups: ["browsers"],
      });
      trace("startup: VentoErrorPage aktörü kaydedildi");
      // Sekme simgeleri (favicon): <link rel=icon> + /favicon.ico; Firefox'un FaviconLoader'ı içerik sürecinde çalışır
      ChromeUtils.registerWindowActor("VentoLink", {
        parent: { esModuleURI: "resource:///actors/VentoLinkParent.sys.mjs" },
        child: {
          esModuleURI: "resource:///actors/VentoLinkChild.sys.mjs",
          events: {
            DOMHeadElementParsed: {},
            DOMLinkAdded: {},
            DOMLinkChanged: {},
            pageshow: {},
            // pagehide yalnız var olan aktörün durumunu temizler
            pagehide: { createActor: false },
          },
        },
        messageManagerGroups: ["browsers"],
      });
      trace("startup: VentoLink aktörü kaydedildi");
      // alert/confirm/prompt/kimlik doğrulama: toolkit'in Prompter'ı "Prompt" adlı aktörü arar
      ChromeUtils.registerWindowActor("Prompt", {
        parent: { esModuleURI: "resource:///actors/VentoPromptParent.sys.mjs" },
        includeChrome: true,
        allFrames: true,
      });
      trace("startup: Prompt aktörü kaydedildi");
      // Kamera/mikrofon: süreç aktörü bildirimi dinler, pencere aktörü kartı ana sürece taşır
      ChromeUtils.registerProcessActor("VentoMediaProcess", {
        child: {
          esModuleURI: "resource:///actors/VentoMediaProcessChild.sys.mjs",
          observers: ["getUserMedia:request"],
        },
        includeParent: false,
      });
      ChromeUtils.registerWindowActor("VentoMedia", {
        parent: { esModuleURI: "resource:///actors/VentoMediaParent.sys.mjs" },
        child: { esModuleURI: "resource:///actors/VentoMediaChild.sys.mjs" },
        allFrames: true,
        messageManagerGroups: ["browsers"],
      });
      trace("startup: VentoMedia aktörleri kaydedildi");
    } catch (e) {
      trace(`startup: ActorManagerParent HATA: ${e}`);
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
