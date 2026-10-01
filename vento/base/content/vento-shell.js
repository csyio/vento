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
    on("cmd_print", () => Vento.print());
    on("cmd_reopenTab", () => t.reopenClosed());
    // Komut, yeniden açılacak sekme yokken devre dışı (menü soluk görünür, ⌘⇧T boşa basmaz)
    const syncReopen = () => $("cmd_reopenTab").toggleAttribute("disabled", !t.closed.length);
    t.addEventListener("tabclose", syncReopen);
    t.addEventListener("tabopen", syncReopen);
    t.addEventListener("closedchange", syncReopen);
    on("cmd_focusBar", () => Vento.ui.focusBar());
    on("cmd_reload", () => t.reload());
    on("cmd_stop", () => t.stop());
    on("cmd_back", () => t.back());
    on("cmd_forward", () => t.forward());
    on("cmd_nextTab", () => t.selectRelative(1));
    on("cmd_prevTab", () => t.selectRelative(-1));
    on("cmd_find", () => Vento.find.open());
    on("cmd_findNext", () => Vento.find.next());
    on("cmd_findPrev", () => Vento.find.prev());
    on("cmd_toggleEsin", () => Vento.esin.toggle());
    on("cmd_quit", () => Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit));

    // Düzen komutları odaktaki öğeye (sayfa ya da akıllı çubuk) gider.
    for (const c of ["cmd_undo", "cmd_redo", "cmd_cut", "cmd_copy", "cmd_paste", "cmd_selectAll"]) {
      on(c, () => goDoCommand(c));
    }
  }

  // ---- window.open / target=_blank -----------------------------------------------------

  /**
   * Firefox'un yazdırma katmanı (toolkit/components/printing): ilk kullanımda yüklenir. Betik, browser.xhtml'in sağladığı
   * `XPCOMUtils` genel değişkenini varsayar; bizde yok → önce tanımlanır.
   */
  function loadPrintUtils() {
    if (!window.PrintUtils) {
      window.XPCOMUtils ??= ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs").XPCOMUtils;
      Services.scriptloader.loadSubScript("chrome://global/content/printUtils.js", window);
    }
    return window.PrintUtils;
  }
  Vento.loadPrintUtils = loadPrintUtils;

  /** window.print(): içerik süreci belgenin statik kopyası için bir tarayıcı ister (yazdırma katmanı kurar). */
  function printBrowser(openWindowInfo) {
    try {
      return loadPrintUtils().handleStaticCloneCreatedForPrint(openWindowInfo);
    } catch (e) {
      Vento.trace(`yazdırma tarayıcısı kurulamadı: ${e}`);
      return null;
    }
  }

  /** Seçili sekmeyi yazdırır (yerel macOS paneli). Boş/yazdırılamaz sekmede hiçbir şey yapmaz. */
  Vento.print = (tab = Vento.tabs.selected) => {
    if (!tab || tab.blank || tab.pending) {
      return false;
    }
    try {
      loadPrintUtils().startPrintWindow(tab.browser.browsingContext);
      return true;
    } catch (e) {
      Vento.trace(`yazdırma başlatılamadı: ${e}`);
      return false;
    }
  };

  /** nsIBrowserDOMWindow: içerik yeni pencere/sekme isterse buraya gelir. */
  function makeBrowserAccess() {
    const openTab = (where, openWindowInfo) => {
      if (where === BDW.OPEN_CURRENTWINDOW && !openWindowInfo && Vento.tabs.selected) {
        return Vento.tabs.selected;
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
        if (where === BDW.OPEN_PRINT_BROWSER) {
          return printBrowser(openWindowInfo)?.browsingContext ?? null;
        }
        return openTab(where, openWindowInfo)?.browser.browsingContext ?? null;
      },

      openURI(uri, openWindowInfo, where, flags, triggeringPrincipal) {
        if (where === BDW.OPEN_PRINT_BROWSER) {
          return printBrowser(openWindowInfo)?.browsingContext ?? null;
        }
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

      // Yazdırma statik kopyası (window.print / sessiz yazdırma) buradan ister ve tarayıcı ÖĞESİNİ bekler.
      // Başka her şey (sekme içi sekme) desteklenmez.
      createContentWindowInFrame(uri, params, where) {
        if (where === BDW.OPEN_PRINT_BROWSER) {
          return printBrowser(params.openWindowInfo);
        }
        throw Components.Exception("desteklenmiyor", Cr.NS_ERROR_NOT_IMPLEMENTED);
      },
      openURIInFrame(uri, params, where) {
        if (where === BDW.OPEN_PRINT_BROWSER) {
          return printBrowser(params.openWindowInfo);
        }
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

  window.addEventListener("load", async () => {
    Vento.tabs.init($("browsers"));
    Vento.ui.init();
    Vento.esin.init();
    Vento.find.init();
    Vento.bookmarks.init();
    Vento.update.init();
    Vento.start.init();
    Vento.welcome.init();
    Vento.dialogs.init();
    Vento.permissions.init();
    Vento.downloads.init().catch(e => Vento.trace(`indirmeler başlatılamadı: ${e}`));
    bindCommands();
    window.browserDOMWindow = makeBrowserAccess();

    // Komut satırı: -url <adres> (birden fazla verilebilir; her biri ayrı sekme, sonuncusu seçili)
    const startUrls = [];
    try {
      const cmdLine = window.arguments?.[0];
      if (cmdLine instanceof Ci.nsICommandLine) {
        let u;
        while ((u = cmdLine.handleFlagWithParam("url", false))) {
          const resolved = Vento.resolveInput(u);
          if (resolved) {
            startUrls.push(resolved);
          }
        }
      }
    } catch (e) {
      Vento.trace(`komut satırı okunamadı: ${e}`);
    }
    // Önceki oturumu geri getir (açık sekmeler); -url verildiyse o adresler ayrı sekmelerde açılır.
    let restored = false;
    if (Services.prefs.getBoolPref("vento.session.restore", true)) {
      try {
        restored = Vento.session.restore(await Vento.session.read(), startUrls);
      } catch (e) {
        Vento.trace(`oturum geri yüklenemedi: ${e}`);
      }
    }
    if (!restored) {
      startUrls.forEach(u => Vento.tabs.open(u));
      if (!startUrls.length) {
        Vento.tabs.open("about:blank");
      }
    }
    Vento.session.start();
    if (!Services.env.exists("VENTO_SELFTEST")) {
      // Güncelleme sonrası ilk açılış → sitedeki sürüm notları açılır; ilk kurulumda karşılama akışı gösterilir
      Vento.update.afterUpdate();
      if (!Vento.welcome.completed) {
        Vento.welcome.show();
      }
    }
    Vento.trace(`kabuk hazır (oturum geri yüklendi=${restored})`);

    if (Services.env.exists("VENTO_SELFTEST")) {
      Services.scriptloader.loadSubScript("chrome://vento/content/vento-selftest.js", window);
    }
  });
})();
