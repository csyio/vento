// Vento startup component: command line handler. We open the main window, not DefaultCLH.
// If the VENTO_TRACE=<file> environment variable is set, every step is written there (stdout can't be trusted).

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
    trace("startup: command line handler called");
    if (cmdLine.preventDefault) {
      trace("startup: preventDefault already set, exiting");
      return;
    }
    // Registers the toolkit's window/process actors (PageExtractor, Select, Find, Pdfjs ...). In Firefox,
    // browser/'s DesktopActorRegistry does this; nobody does here, so it's loaded here.
    try {
      ChromeUtils.importESModule("resource://gre/modules/ActorManagerParent.sys.mjs");
      trace("startup: toolkit actors registered");
      ChromeUtils.registerWindowActor("VentoPageText", {
        parent: { esModuleURI: "resource:///actors/VentoPageTextParent.sys.mjs" },
        child: { esModuleURI: "resource:///actors/VentoPageTextChild.sys.mjs" },
        allFrames: false,
        matches: ["http://*/*", "https://*/*"],
        messageManagerGroups: ["browsers"],
      });
      trace("startup: VentoPageText actor registered");
      ChromeUtils.registerWindowActor("VentoContextMenu", {
        parent: { esModuleURI: "resource:///actors/VentoContextMenuParent.sys.mjs" },
        child: {
          esModuleURI: "resource:///actors/VentoContextMenuChild.sys.mjs",
          events: { contextmenu: { mozSystemGroup: true } },
        },
        allFrames: true,
        messageManagerGroups: ["browsers"],
      });
      trace("startup: VentoContextMenu actor registered");
      // Ebabil on the error page (connection errors only; not on certificate warnings)
      ChromeUtils.registerWindowActor("VentoErrorPage", {
        child: {
          esModuleURI: "resource:///actors/VentoErrorPageChild.sys.mjs",
          events: { DOMContentLoaded: {} },
        },
        matches: ["about:neterror?*"],
        messageManagerGroups: ["browsers"],
      });
      trace("startup: VentoErrorPage actor registered");
      // Tab icons (favicon): <link rel=icon> + /favicon.ico; Firefox's FaviconLoader runs in the content process
      ChromeUtils.registerWindowActor("VentoLink", {
        parent: { esModuleURI: "resource:///actors/VentoLinkParent.sys.mjs" },
        child: {
          esModuleURI: "resource:///actors/VentoLinkChild.sys.mjs",
          events: {
            DOMHeadElementParsed: {},
            DOMLinkAdded: {},
            DOMLinkChanged: {},
            pageshow: {},
            // pagehide only clears the state of an existing actor
            pagehide: { createActor: false },
          },
        },
        messageManagerGroups: ["browsers"],
      });
      trace("startup: VentoLink actor registered");
      // alert/confirm/prompt/authentication: the toolkit's Prompter looks for an actor named "Prompt"
      ChromeUtils.registerWindowActor("Prompt", {
        parent: { esModuleURI: "resource:///actors/VentoPromptParent.sys.mjs" },
        includeChrome: true,
        allFrames: true,
      });
      trace("startup: Prompt actor registered");
      // Camera/microphone: the process actor listens for the notification, the window actor carries the card to the parent process
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
      trace("startup: VentoMedia actors registered");
    } catch (e) {
      trace(`startup: ActorManagerParent ERROR: ${e}`);
    }
    try {
      const win = Services.ww.openWindow(null, MAIN_WINDOW, "_blank", WINDOW_FEATURES, cmdLine);
      trace(`startup: openWindow returned, window=${!!win}`);
      cmdLine.preventDefault = true;
    } catch (e) {
      trace(`startup: openWindow ERROR: ${e}`);
    }
  },

  helpInfo: "",
};
