"use strict";

// Vento window shell: commands/shortcuts, the window.open path, startup, (optional) self-test.

(() => {
  const BDW = Ci.nsIBrowserDOMWindow;
  const $ = id => document.getElementById(id);

  // ---- Commands (shortcuts and the native menu bind to the same commands) -----------------------

  function bindCommands() {
    const on = (id, fn) => $(id).addEventListener("command", fn);
    const t = Vento.tabs;

    on("cmd_newTab", () => t.open("about:blank", { afterCurrent: true }));
    on("cmd_closeTab", () => t.close(t.selected));
    on("cmd_print", () => Vento.print());
    on("cmd_reopenTab", () => t.reopenClosed());
    // The command is disabled when there is no tab to reopen (the menu is dimmed, ⌘⇧T does nothing)
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

    // Edit commands go to the focused element (the page or the smart bar).
    for (const c of ["cmd_undo", "cmd_redo", "cmd_cut", "cmd_copy", "cmd_paste", "cmd_selectAll"]) {
      on(c, () => goDoCommand(c));
    }
  }

  // ---- window.open / target=_blank -----------------------------------------------------

  /**
   * Firefox's printing layer (toolkit/components/printing): loaded on first use. The script assumes the `XPCOMUtils` global that
   * browser.xhtml provides; we don't have it, so it is defined first.
   */
  function loadPrintUtils() {
    if (!window.PrintUtils) {
      window.XPCOMUtils ??= ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs").XPCOMUtils;
      Services.scriptloader.loadSubScript("chrome://global/content/printUtils.js", window);
    }
    return window.PrintUtils;
  }
  Vento.loadPrintUtils = loadPrintUtils;

  /** window.print(): the content process asks for a browser to hold the document's static clone (sets up the printing layer). */
  function printBrowser(openWindowInfo) {
    try {
      return loadPrintUtils().handleStaticCloneCreatedForPrint(openWindowInfo);
    } catch (e) {
      Vento.trace(`could not set up print browser: ${e}`);
      return null;
    }
  }

  /** Prints the selected tab (native macOS panel). Does nothing on an empty/unprintable tab. */
  Vento.print = (tab = Vento.tabs.selected) => {
    if (!tab || tab.blank || tab.pending) {
      return false;
    }
    try {
      loadPrintUtils().startPrintWindow(tab.browser.browsingContext);
      return true;
    } catch (e) {
      Vento.trace(`could not start printing: ${e}`);
      return false;
    }
  };

  /** nsIBrowserDOMWindow: arrives here when content asks for a new window/tab. */
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

      // The print static clone (window.print / silent print) asks from here and waits for the browser ELEMENT.
      // Everything else (a tab inside a tab) is not supported.
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

  // ---- Startup -----------------------------------------------------------------------

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
    Vento.downloads.init().catch(e => Vento.trace(`could not start downloads: ${e}`));
    bindCommands();
    window.browserDOMWindow = makeBrowserAccess();

    // Command line: -url <address> (can be given more than once; each in its own tab, the last one selected)
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
      Vento.trace(`could not read command line: ${e}`);
    }
    // Restore the previous session (open tabs); if -url was given, those URLs open in separate tabs.
    let restored = false;
    if (Services.prefs.getBoolPref("vento.session.restore", true)) {
      try {
        restored = Vento.session.restore(await Vento.session.read(), startUrls);
      } catch (e) {
        Vento.trace(`could not restore session: ${e}`);
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
      // First launch after an update -> release notes on the site open; on first install the welcome flow is shown
      Vento.update.afterUpdate();
      if (!Vento.welcome.completed) {
        Vento.welcome.show();
      }
    }
    Vento.trace(`shell ready (session restored=${restored})`);

    if (Services.env.exists("VENTO_SELFTEST")) {
      Services.scriptloader.loadSubScript("chrome://vento/content/vento-selftest.js", window);
    }
  });
})();
