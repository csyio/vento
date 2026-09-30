"use strict";

// Vento pencere kabuğu: komutlar/kısayollar, window.open yolu, başlangıç, (isteğe bağlı) öz-test.

(() => {
  const BDW = Ci.nsIBrowserDOMWindow;
  const $ = id => document.getElementById(id);

  // ---- Komutlar (kısayollar ve yerel menü aynı komutlara bağlanır) -----------------------

  function bindCommands() {
    const on = (id, fn) => $(id).addEventListener("command", fn);
    const t = Vento.tabs;

    on("cmd_newTab", () => t.open("about:blank", { afterCurrent: true }));
    on("cmd_closeTab", () => t.close(t.selected));
    on("cmd_focusBar", () => Vento.ui.focusBar());
    on("cmd_reload", () => t.reload());
    on("cmd_stop", () => t.stop());
    on("cmd_back", () => t.back());
    on("cmd_forward", () => t.forward());
    on("cmd_nextTab", () => t.selectRelative(1));
    on("cmd_prevTab", () => t.selectRelative(-1));
    on("cmd_toggleEsin", () => Vento.esin.toggle());
    on("cmd_quit", () => Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit));

    // Düzen komutları odaktaki öğeye (sayfa ya da akıllı çubuk) gider.
    for (const c of ["cmd_undo", "cmd_redo", "cmd_cut", "cmd_copy", "cmd_paste", "cmd_selectAll"]) {
      on(c, () => goDoCommand(c));
    }
  }

  // ---- window.open / target=_blank -----------------------------------------------------

  /** nsIBrowserDOMWindow: içerik yeni pencere/sekme isterse buraya gelir. */
  function makeBrowserAccess() {
    const openTab = (where, openWindowInfo) => {
      if (where === BDW.OPEN_CURRENTWINDOW && !openWindowInfo && Vento.tabs.selected) {
        return Vento.tabs.selected;
      }
      if (where === BDW.OPEN_PRINT_BROWSER) {
        return null;
      }
      return Vento.tabs.open("about:blank", {
        openWindowInfo,
        select: where !== BDW.OPEN_NEWTAB_BACKGROUND,
        afterCurrent: true,
      });
    };

    return {
      QueryInterface: ChromeUtils.generateQI(["nsIBrowserDOMWindow"]),

      createContentWindow(uri, openWindowInfo, where) {
        return openTab(where, openWindowInfo)?.browser.browsingContext ?? null;
      },

      openURI(uri, openWindowInfo, where, flags, triggeringPrincipal) {
        const tab = openTab(where, openWindowInfo);
        if (!tab) {
          return null;
        }
        if (uri && !openWindowInfo) {
          tab.browser.fixupAndLoadURIString(uri.spec, {
            triggeringPrincipal: triggeringPrincipal ?? Vento.SYSTEM_PRINCIPAL,
          });
        }
        return tab.browser.browsingContext;
      },

      createContentWindowInFrame() {
        throw Components.Exception("desteklenmiyor", Cr.NS_ERROR_NOT_IMPLEMENTED);
      },
      openURIInFrame() {
        throw Components.Exception("desteklenmiyor", Cr.NS_ERROR_NOT_IMPLEMENTED);
      },
      isTabContentWindow(win) {
        return Vento.tabs.all.some(tab => tab.browser.contentWindow === win);
      },
      canClose() {
        return true;
      },
      get tabCount() {
        return Vento.tabs.all.length;
      },
    };
  }

  // ---- Başlangıç -----------------------------------------------------------------------

  window.addEventListener("load", () => {
    Vento.tabs.init($("browsers"));
    Vento.ui.init();
    Vento.esin.init();
    bindCommands();
    window.browserDOMWindow = makeBrowserAccess();

    // Komut satırı: -url <adres>
    let startUrl = null;
    try {
      const cmdLine = window.arguments?.[0];
      if (cmdLine instanceof Ci.nsICommandLine) {
        startUrl = cmdLine.handleFlagWithParam("url", false);
      }
    } catch (e) {
      Vento.trace(`komut satırı okunamadı: ${e}`);
    }
    Vento.tabs.open(Vento.resolveInput(startUrl) ?? "about:blank");
    Vento.trace("kabuk hazır");

    if (Services.env.exists("VENTO_SELFTEST")) {
      Services.scriptloader.loadSubScript("chrome://vento/content/vento-selftest.js", window);
    }
  });
})();
