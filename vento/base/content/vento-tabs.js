"use strict";

// Vento tab model and engine interface.
//
// Rule: Firefox's tabbrowser/gBrowser is NOT used. Each tab is its own <browser> element;
// we keep its state (title, URL, loading, back/forward) here. The UI only listens to this
// model's events (vento-ui.js) — it never touches the engine directly.

var Vento = (window.Vento = window.Vento || {});

const SYSTEM_PRINCIPAL = Services.scriptSecurityManager.getSystemPrincipal();
// Search engines (Customize > Search engine; pref: vento.search.engine). To add an engine, just add a line here.
const SEARCH_ENGINES = {
  duckduckgo: "https://duckduckgo.com/?q=",
  google: "https://www.google.com/search?q=",
};
const searchBase = () => SEARCH_ENGINES[Services.prefs.getStringPref("vento.search.engine", "duckduckgo")] ?? SEARCH_ENGINES.duckduckgo;

/** If VENTO_TRACE=<file> is set, writes every step there (stdout is unreliable). */
Vento.trace = (() => {
  const file = Services.env.exists("VENTO_TRACE") ? Services.env.get("VENTO_TRACE") : "";
  return msg => {
    dump(`VENTO: ${msg}\n`);
    if (file) {
      IOUtils.writeUTF8(file, `${msg}\n`, { mode: "appendOrCreate" }).catch(() => {});
    }
  };
})();

/**
 * Turns what was typed in the smart bar into a URL (pure function).
 * A URL if it looks like one, otherwise a search. Unsafe schemes (javascript:, chrome:, data: ...)
 * never become a URL; they count as search text.
 */
Vento.resolveInput = function resolveInput(raw) {
  const text = (raw ?? "").trim();
  if (!text) {
    return null;
  }
  if (/^(https?|ftp|file):\/\/\S+$/i.test(text) || /^(about|view-source):\S+$/i.test(text)) {
    return text;
  }
  const hostLike =
    /^(?:localhost|(?:[^\s/?#:.]+\.)+[^\s/?#:.]+|\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-f:]+\])(?::\d{1,5})?(?:[/?#]\S*)?$/iu;
  if (hostLike.test(text)) {
    const local = /^(localhost|\d{1,3}(?:\.\d{1,3}){3}|\[)/i.test(text);
    return `${local ? "http" : "https"}://${text}`;
  }
  return searchBase() + encodeURIComponent(text);
};

/** URL that searches the text in the current search engine (searches even if it looks like a URL). */
Vento.searchURL = text => searchBase() + encodeURIComponent(text);
Vento.SEARCH_ENGINES = SEARCH_ENGINES;

/** Is the input a search/question text rather than a URL? (for the bar's "Search / Ask Esin" suggestion) */
Vento.isSearchText = text => Vento.resolveInput(text)?.startsWith(searchBase()) ?? false;

/** Short form shown in the bar: domain + path. */
Vento.formatDisplay = function formatDisplay(url) {
  if (!url || url === "about:blank") {
    return "";
  }
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") {
      return u.host + (u.pathname === "/" ? "" : u.pathname) + u.search + u.hash;
    }
  } catch (e) {
    // not a URL — show as is
  }
  return url;
};

const lazyPlaces = {};
ChromeUtils.defineESModuleGetters(lazyPlaces, {
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
});

// Number of closed tabs kept in memory (close to Firefox's 25 as well)
const CLOSED_LIMIT = 25;

let nextTabId = 1;

class VentoTab {
  constructor(browser) {
    this.id = nextTabId++;
    this.browser = browser;
    this.title = "";
    this.url = "";
    this.loading = false;
    this.canGoBack = false;
    this.canGoForward = false;
    // A tab restored from the session but not loaded yet: this URL loads when it is selected.
    this.pending = null;
    // Tab icon (favicon): a data:/http URL or "" (none -> letter mark)
    this.icon = "";
  }

  get blank() {
    return !this.url || this.url === "about:blank";
  }

  get host() {
    try {
      return new URL(this.url).host.replace(/^www\./, "");
    } catch (e) {
      return "";
    }
  }

  get label() {
    return this.title || this.host || Vento.l10n.t("tab-new");
  }
}

function contentTitle(browser) {
  return (
    browser.contentTitle ||
    browser.browsingContext?.currentWindowGlobal?.documentTitle ||
    ""
  );
}

Vento.tabs = new (class TabManager extends EventTarget {
  #tabs = [];
  #closed = []; // closed tabs, newest LAST: {url, title, index}
  #selected = null;
  #container = null;

  init(container) {
    this.#container = container;
  }

  get all() {
    return [...this.#tabs];
  }

  get selected() {
    return this.#selected;
  }

  /** Closed tabs that can be reopened (newest first). */
  get closed() {
    return [...this.#closed].reverse();
  }

  #emit(type, tab) {
    this.dispatchEvent(new CustomEvent(type, { detail: { tab } }));
  }

  #syncNav(tab) {
    try {
      tab.canGoBack = tab.browser.canGoBack;
      tab.canGoForward = tab.browser.canGoForward;
    } catch (e) {
      tab.canGoBack = tab.canGoForward = false;
    }
  }

  #setActive(tab, active) {
    tab.browser.toggleAttribute("hidden-tab", !active);
    try {
      tab.browser.docShellIsActive = active;
    } catch (e) {
      Vento.trace(`could not set docShellIsActive: ${e}`);
    }
  }

  #wire(tab) {
    const browser = tab.browser;
    const L = Ci.nsIWebProgressListener;
    const listener = {
      QueryInterface: ChromeUtils.generateQI(["nsIWebProgressListener", "nsISupportsWeakReference"]),
      onStateChange: (wp, req, flags) => {
        if (!wp.isTopLevel || !(flags & L.STATE_IS_NETWORK)) {
          return;
        }
        if (flags & L.STATE_START) {
          tab.loading = true;
        } else if (flags & L.STATE_STOP) {
          tab.loading = false;
          tab.title = contentTitle(browser) || tab.title;
          this.#syncNav(tab);
        }
        this.#emit("tabchange", tab);
      },
      onLocationChange: (wp, req, uri, flags) => {
        if (!wp.isTopLevel) {
          return;
        }
        if (!(flags & Ci.nsIWebProgressListener.LOCATION_CHANGE_SAME_DOCUMENT)) {
          tab.icon = "";
        }
        tab.url = uri ? uri.spec : "";
        tab.title = contentTitle(browser);
        this.#syncNav(tab);
        this.#emit("tabchange", tab);
      },
      onProgressChange() {},
      onProgressChange64() {},
      onStatusChange() {},
      onSecurityChange() {},
      onContentBlockingEvent() {},
      onRefreshAttempted() {
        return true;
      },
    };
    // Progress notifications go through a filter; the filter and listener are weakly bound -> must be held on the tab.
    const filter = Cc["@mozilla.org/appshell/component/browser-status-filter;1"].createInstance(
      Ci.nsIWebProgress
    );
    filter.addProgressListener(listener, Ci.nsIWebProgress.NOTIFY_ALL);
    browser.webProgress.addProgressListener(filter, Ci.nsIWebProgress.NOTIFY_ALL);
    tab._progress = { listener, filter };

    browser.addEventListener("pagetitlechanged", () => {
      tab.title = contentTitle(browser);
      this.#emit("tabchange", tab);
    });
  }

  /**
   * Opens a new tab.
   * @param url          URL to open (resolved); "about:blank" = blank tab
   * @param select       true -> select the tab
   * @param openWindowInfo  info from window.open() (if present the page isn't loaded, the content loads itself)
   * @param afterCurrent true -> right next to the selected tab
   * @param lazy         {url, title} -> the page isn't loaded now (session restore); it loads when the tab is selected
   * @param at           index for the tab (if omitted, end / per afterCurrent)
   */
  open(url = "about:blank", { select = true, openWindowInfo = null, afterCurrent = false, lazy = null, at = null } = {}) {
    const browser = document.createXULElement("browser");
    const attrs = {
      type: "content",
      remote: "true",
      maychangeremoteness: "true",
      messagemanagergroup: "browsers",
      manualactiveness: "true",
      class: "vento-page",
    };
    for (const [k, v] of Object.entries(attrs)) {
      browser.setAttribute(k, v);
    }
    const loadNow = !!url && url !== "about:blank" && !openWindowInfo && !lazy;
    if (loadNow || openWindowInfo || lazy) {
      // Prevent the needless initial about:blank load (same as tabbrowser).
      browser.setAttribute("nodefaultsrc", "true");
    }
    if (openWindowInfo) {
      browser.openWindowInfo = openWindowInfo;
    }
    browser.setAttribute("hidden-tab", "");
    this.#container.appendChild(browser);

    const tab = new VentoTab(browser);
    if (lazy) {
      tab.pending = lazy.url;
      tab.url = lazy.url;
      tab.title = lazy.title || "";
      this.#iconFromCache(tab);
    }
    const pos = Number.isInteger(at)
      ? Math.min(Math.max(at, 0), this.#tabs.length)
      : afterCurrent && this.#selected
        ? this.#tabs.indexOf(this.#selected) + 1
        : this.#tabs.length;
    this.#tabs.splice(pos, 0, tab);
    this.#wire(tab);
    this.#setActive(tab, false);
    this.#emit("tabopen", tab);

    if (loadNow) {
      browser.fixupAndLoadURIString(url, { triggeringPrincipal: SYSTEM_PRINCIPAL });
    }
    // With no selected tab the first tab is selected; but a lazy (restored) tab isn't selected on its own —
    // otherwise the FIRST tab in the session would be loaded needlessly. The caller decides what's selected (select: true).
    if (select || (!this.#selected && !lazy)) {
      this.select(tab);
    }
    return tab;
  }

  select(tab) {
    if (!tab || tab === this.#selected || !this.#tabs.includes(tab)) {
      return;
    }
    this.#selected = tab;
    for (const t of this.#tabs) {
      this.#setActive(t, t === tab);
    }
    this.#emit("tabselect", tab);
    this.#loadPending(tab);
  }

  /** Called when the content process finds a tab's icon (VentoLinkParent). */
  setIcon(browser, iconURL) {
    const tab = this.#tabs.find(t => t.browser === browser);
    if (!tab || tab.icon === iconURL) {
      return;
    }
    tab.icon = iconURL;
    this.#emit("tabchange", tab);
  }

  /** Places' cached icon for unloaded (from session) tabs; if none, the letter mark stays. */
  async #iconFromCache(tab) {
    try {
      const fav = await lazyPlaces.PlacesUtils.favicons.getFaviconForPage(Services.io.newURI(tab.url));
      if (fav && !tab.icon && this.#tabs.includes(tab)) {
        tab.icon = fav.dataURI.spec;
        this.#emit("tabchange", tab);
      }
    } catch (e) {
      // no icon in the cache
    }
  }

  #loadPending(tab) {
    if (!tab.pending) {
      return;
    }
    const url = tab.pending;
    tab.pending = null;
    tab.browser.fixupAndLoadURIString(url, { triggeringPrincipal: SYSTEM_PRINCIPAL });
  }

  selectRelative(delta) {
    if (this.#tabs.length < 2) {
      return;
    }
    const i = this.#tabs.indexOf(this.#selected);
    this.select(this.#tabs[(i + delta + this.#tabs.length) % this.#tabs.length]);
  }

  close(tab) {
    const i = this.#tabs.indexOf(tab);
    if (i < 0) {
      return;
    }
    const wasSelected = tab === this.#selected;
    // When the last tab closes the window (app) closes too; that is session restore's job, not saved here.
    if (this.#tabs.length > 1 && /^(https?|file):/i.test(tab.url || "")) {
      this.#closed.push({ url: tab.url, title: tab.title, index: i });
      if (this.#closed.length > CLOSED_LIMIT) {
        this.#closed.shift();
      }
    }
    this.#tabs.splice(i, 1);
    tab.browser.remove();
    this.#emit("tabclose", tab);
    if (!this.#tabs.length) {
      this.#selected = null;
      window.close();
      return;
    }
    if (wasSelected) {
      this.#selected = null;
      this.select(this.#tabs[Math.min(i, this.#tabs.length - 1)]);
    }
  }

  /** Forgets the closed-tab stack (clear history / privacy). */
  forgetClosed() {
    this.#closed.length = 0;
    this.dispatchEvent(new CustomEvent("closedchange"));
  }

  /** Reopens the most recently closed tab at its old position and selects it. null if there is no closed tab. */
  reopenClosed() {
    const entry = this.#closed.pop();
    if (!entry) {
      return null;
    }
    return this.open(entry.url, { select: true, at: entry.index });
  }

  navigate(tab, text) {
    const url = Vento.resolveInput(text);
    if (!tab || !url) {
      return false;
    }
    tab.pending = null;
    tab.browser.fixupAndLoadURIString(url, { triggeringPrincipal: SYSTEM_PRINCIPAL });
    return true;
  }

  back(tab = this.#selected) {
    if (tab?.canGoBack) {
      tab.browser.goBack();
    }
  }

  forward(tab = this.#selected) {
    if (tab?.canGoForward) {
      tab.browser.goForward();
    }
  }

  reload(tab = this.#selected) {
    if (tab?.pending) {
      this.#loadPending(tab);
      return;
    }
    tab?.browser.reload();
  }

  stop(tab = this.#selected) {
    tab?.browser.stop();
  }
})();

Vento.SYSTEM_PRINCIPAL = SYSTEM_PRINCIPAL;
