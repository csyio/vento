"use strict";

// Vento sekme modeli ve motor arayüzü.
//
// Kural: Firefox'un tabbrowser/gBrowser'ı KULLANILMAZ. Her sekme kendi <browser> öğesidir;
// durumu (başlık, adres, yükleniyor, geri/ileri) burada tutarız. Arayüz yalnızca bu
// modelin olaylarını dinler (vento-ui.js) — motora doğrudan dokunmaz.

var Vento = (window.Vento = window.Vento || {});

const SYSTEM_PRINCIPAL = Services.scriptSecurityManager.getSystemPrincipal();
const SEARCH_URL = "https://duckduckgo.com/?q=";

/** VENTO_TRACE=<dosya> verilirse her adımı oraya yazar (stdout'a güvenilmez). */
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
 * Akıllı çubuğa yazılanı bir adrese çevirir (saf fonksiyon).
 * Adres gibi görünüyorsa adres, değilse arama. Güvensiz şemalar (javascript:, chrome:, data: …)
 * asla adres olmaz — arama metni sayılır.
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
  return SEARCH_URL + encodeURIComponent(text);
};

/** Girdi bir adres değil, arama/soru metni mi? (çubuktaki "Ara / Esin'e sor" önerisi için) */
Vento.isSearchText = text => Vento.resolveInput(text)?.startsWith(SEARCH_URL) ?? false;

/** Çubukta gösterilecek kısa biçim: alan adı + yol. */
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
    // adres değil — olduğu gibi göster
  }
  return url;
};

const lazyPlaces = {};
ChromeUtils.defineESModuleGetters(lazyPlaces, {
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
});

// Bellekte tutulan kapatılmış sekme sayısı (Firefox'ta da 25'e yakın)
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
    // Oturumdan geri yüklenen ama henüz yüklenmemiş sekme: seçilince bu adres yüklenir.
    this.pending = null;
    // Sekme simgesi (favicon): data:/http adresi ya da "" (yok → harf işareti)
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
    return this.title || this.host || "Yeni sekme";
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
  #closed = []; // kapatılan sekmeler, en yeni SONDA: {url, title, index}
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

  /** Yeniden açılabilecek kapatılmış sekmeler (en yeni başta). */
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
      Vento.trace(`docShellIsActive ayarlanamadı: ${e}`);
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
    // İlerleme bildirimleri süzgeçten geçer; süzgeç ve dinleyici zayıf bağlanır → sekmede tutulmalı.
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
   * Yeni sekme açar.
   * @param url          açılacak adres (çözümlenmiş); "about:blank" = boş sekme
   * @param select       true → sekmeyi seç
   * @param openWindowInfo  window.open() ile gelen bilgi (varsa sayfa yüklenmez, içerik kendi yükler)
   * @param afterCurrent true → seçili sekmenin hemen sağına
   * @param lazy         {url, title} → sayfa şimdi yüklenmez (oturum geri yükleme); sekme seçilince yüklenir
   * @param at           sekmenin konacağı sıra (verilmezse sona / afterCurrent'e göre)
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
      // Gereksiz ilk about:blank yüklemesini engelle (tabbrowser ile aynı).
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
    // Hiç seçili sekme yokken ilk sekme seçilir; ama tembel (geri yüklenen) sekme kendiliğinden seçilmez —
    // yoksa oturumdaki İLK sekme gereksiz yüklenir. Seçileni çağıran belirler (select: true).
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

  /** İçerik süreci bir sekmenin simgesini bulunca (VentoLinkParent) çağrılır. */
  setIcon(browser, iconURL) {
    const tab = this.#tabs.find(t => t.browser === browser);
    if (!tab || tab.icon === iconURL) {
      return;
    }
    tab.icon = iconURL;
    this.#emit("tabchange", tab);
  }

  /** Yüklenmemiş (oturumdan gelen) sekmeler için Places'in önbellekli simgesi; yoksa harf işareti kalır. */
  async #iconFromCache(tab) {
    try {
      const fav = await lazyPlaces.PlacesUtils.favicons.getFaviconForPage(Services.io.newURI(tab.url));
      if (fav && !tab.icon && this.#tabs.includes(tab)) {
        tab.icon = fav.dataURI.spec;
        this.#emit("tabchange", tab);
      }
    } catch (e) {
      // önbellekte simge yok
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
    // Son sekme kapanınca pencere (uygulama) de kapanır; o durum oturum geri yüklemenin işi, burada kaydedilmez.
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

  /** Kapatılmış sekme yığınını unutur (geçmişi temizle / gizlilik). */
  forgetClosed() {
    this.#closed.length = 0;
    this.dispatchEvent(new CustomEvent("closedchange"));
  }

  /** En son kapatılan sekmeyi eski yerine açar ve seçer. Kapatılmış sekme yoksa null. */
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
