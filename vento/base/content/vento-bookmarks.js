"use strict";

// Bookmarks + top sites (on Places; in toolkit). Bookmarks go to the "Other bookmarks" (unfiled) folder.
//  - ⌘D / toolbar star: bookmark / unbookmark the current page.
//  - Bookmarks menu: the 25 newest bookmarks (built when it opens).
//  - Start screen: bookmarks (newest first) + most visited sites (frecency); removed with "×"
//    (bookmark -> deleted; top site -> hostname hidden, vento.start.hidden).
// Privacy: everything comes from local history; nothing leaves the machine.

const { PlacesUtils: Places } = ChromeUtils.importESModule("resource://gre/modules/PlacesUtils.sys.mjs");

Vento.bookmarks = new (class VentoBookmarks extends EventTarget {
  static PREF_HIDDEN = "vento.start.hidden";
  static isWeb = url => /^https?:\/\//i.test(url || "");

  #hiddenHosts() {
    try {
      return new Set(JSON.parse(Services.prefs.getStringPref(VentoBookmarks.PREF_HIDDEN, "[]")));
    } catch (e) {
      return new Set();
    }
  }

  static host(url) {
    try {
      return new URL(url).host.replace(/^www\./, "");
    } catch (e) {
      return "";
    }
  }

  #changed() {
    this.dispatchEvent(new Event("change"));
  }

  /** The URL's bookmark entry (null if none). */
  async find(url) {
    if (!VentoBookmarks.isWeb(url)) {
      return null;
    }
    return (await Places.bookmarks.fetch({ url })) ?? null;
  }

  async isBookmarked(url) {
    return !!(await this.find(url));
  }

  async add(url, title = "") {
    if (!VentoBookmarks.isWeb(url)) {
      return null;
    }
    const b = await Places.bookmarks.insert({ parentGuid: Places.bookmarks.unfiledGuid, url, title: title || VentoBookmarks.host(url) });
    this.#changed();
    return b;
  }

  async remove(url) {
    const guids = [];
    await Places.bookmarks.fetch({ url }, b => guids.push(b.guid));
    for (const guid of guids) {
      await Places.bookmarks.remove(guid);
    }
    this.#changed();
    return guids.length;
  }

  /** Bookmarks or unbookmarks the current tab; returns the new state (true = bookmarked). */
  async toggle(tab = Vento.tabs.selected) {
    if (!tab || !VentoBookmarks.isWeb(tab.url)) {
      return false;
    }
    if (await this.isBookmarked(tab.url)) {
      await this.remove(tab.url);
      return false;
    }
    await this.add(tab.url, tab.title);
    return true;
  }

  /** Bookmarks, newest first. */
  async list(limit = 50) {
    const all = [];
    await Places.bookmarks.fetch({ parentGuid: Places.bookmarks.unfiledGuid }, b => b.url && all.push(b));
    return all
      .filter(b => VentoBookmarks.isWeb(b.url.href ?? b.url))
      .sort((a, b) => b.lastModified - a.lastModified)
      .slice(0, limit)
      .map(b => ({ url: b.url.href ?? String(b.url), title: b.title || VentoBookmarks.host(b.url.href ?? b.url), guid: b.guid, lastModified: b.lastModified }));
  }

  /** Most visited sites (frecency), excluding hidden ones and `except` URLs. */
  async frecent(limit = 8, except = new Set()) {
    const conn = await Places.promiseDBConnection();
    const rows = await conn.executeCached(
      `SELECT url, title FROM moz_places
       WHERE hidden = 0 AND visit_count > 0 AND frecency > 0 AND (url LIKE :http ESCAPE '/' OR url LIKE :https ESCAPE '/')
       ORDER BY frecency DESC LIMIT 60`,
      { http: "http://%", https: "https://%" }
    );
    const hidden = this.#hiddenHosts();
    const seen = new Set();
    const out = [];
    for (const r of rows) {
      const url = r.getResultByName("url");
      const host = VentoBookmarks.host(url);
      if (!host || hidden.has(host) || seen.has(host) || except.has(host)) {
        continue;
      }
      seen.add(host); // only the most visited page of a site (one tile per host)
      out.push({ url, title: r.getResultByName("title") || host });
      if (out.length >= limit) {
        break;
      }
    }
    return out;
  }

  /** Start screen tiles: bookmarks + top sites. [{url, title, host, bookmark: bool}] */
  async topSites(limit = 8) {
    const marks = (await this.list(limit)).map(b => ({ ...b, host: VentoBookmarks.host(b.url), bookmark: true }));
    const taken = new Set(marks.map(m => m.host));
    const rest = (await this.frecent(limit - marks.length, taken)).map(s => ({ ...s, host: VentoBookmarks.host(s.url), bookmark: false }));
    return [...marks, ...rest].slice(0, limit);
  }

  /** Hides a top site tile (by hostname). */
  hideHost(host) {
    const set = this.#hiddenHosts();
    set.add(host);
    Services.prefs.setStringPref(VentoBookmarks.PREF_HIDDEN, JSON.stringify([...set]));
    this.#changed();
  }

  /** The page's icon from the Places cache as a data: URL; null if none. */
  async icon(url) {
    try {
      const fav = await Places.favicons.getFaviconForPage(Services.io.newURI(url));
      return fav?.dataURI?.spec ?? null;
    } catch (e) {
      return null;
    }
  }

  // ---- UI -----------------------------------------------------------------------------------

  async #syncStar() {
    const btn = document.getElementById("nav-bookmark");
    const tab = Vento.tabs.selected;
    const web = !!tab && VentoBookmarks.isWeb(tab.url);
    btn.disabled = !web;
    btn.toggleAttribute("active", web && (await this.isBookmarked(tab.url)));
  }

  async #buildMenu() {
    const popup = document.getElementById("menu_BookmarksPopup");
    const tab = Vento.tabs.selected;
    const web = !!tab && VentoBookmarks.isWeb(tab.url);
    const marked = web && (await this.isBookmarked(tab.url));
    const items = await this.list(25);
    const add = document.getElementById("menu_bookmarkThis");
    document.l10n.setAttributes(add, marked ? "menu-unbookmark" : "menu-bookmark-this");
    add.disabled = !web;
    for (const el of [...popup.querySelectorAll(".bm-item")]) {
      el.remove();
    }
    if (!items.length) {
      const none = document.createXULElement("menuitem");
      none.className = "bm-item";
      none.disabled = true;
      document.l10n.setAttributes(none, "menu-no-bookmarks");
      popup.append(none);
    }
    for (const b of items) {
      const mi = document.createXULElement("menuitem");
      mi.className = "bm-item";
      mi.setAttribute("label", b.title.slice(0, 60));
      mi.setAttribute("tooltiptext", b.url);
      mi.addEventListener("command", () => Vento.tabs.open(b.url, { select: true, afterCurrent: true }));
      popup.append(mi);
    }
  }

  init() {
    const $ = id => document.getElementById(id);
    $("nav-bookmark").addEventListener("click", () => Vento.bookmarks.toggle());
    $("cmd_bookmark").addEventListener("command", () => Vento.bookmarks.toggle());
    $("menu_BookmarksPopup").addEventListener("popupshowing", () => this.#buildMenu());
    const sync = () => this.#syncStar();
    Vento.tabs.addEventListener("tabselect", sync);
    Vento.tabs.addEventListener("tabchange", e => e.detail.tab === Vento.tabs.selected && sync());
    this.addEventListener("change", sync);
    sync();
  }
})();
