"use strict";

// Start screen personalization: wallpaper + Ebabil on/off. Default is PLAIN (no wallpaper, Ebabil on).
// Prefs: vento.start.wallpaper ("" or an id), vento.start.ebabil (bool). The panel opens from the "Customize" button.
//
// Text lives in Fluent (vento.ftl): wp-<id> wallpaper names, cp-* panel text.

Vento.start = (() => {
  const WALLPAPERS = [
    { id: "ink", tone: "dark" },
    { id: "tide", tone: "dark" },
    { id: "dusk", tone: "dark" },
    { id: "dune", tone: "dark" },
    { id: "paper", tone: "light" },
    { id: "mist", tone: "light" },
  ];
  const PREF_WALL = "vento.start.wallpaper";
  const PREF_EB = "vento.start.ebabil";
  const BASE = "chrome://vento/content/wallpapers/";
  const $ = id => document.getElementById(id);
  const els = {};
  let token = 0;

  const full = id => `${BASE}vento-${id}.jpg`;
  const thumb = id => `${BASE}vento-${id}-thumb.jpg`;

  function markSelected(id) {
    for (const b of els.walls.querySelectorAll("button")) {
      b.setAttribute("aria-pressed", String((b.dataset.id ?? "") === id));
    }
  }

  /** Applies the wallpaper from the pref. The image is RESOLVED first, then the tone changes (readability + no flicker). */
  async function applyWallpaper() {
    const id = Services.prefs.getStringPref(PREF_WALL, "");
    const w = WALLPAPERS.find(x => x.id === id); // unknown id (hand-edited pref) = none
    const mine = ++token;
    if (!w) {
      els.start.removeAttribute("data-wallpaper");
      els.start.removeAttribute("data-tone");
      els.wall.style.backgroundImage = "";
      markSelected("");
      return;
    }
    const img = new Image();
    img.src = full(w.id);
    try {
      await img.decode();
    } catch (e) {
      Vento.trace(`could not load wallpaper (${w.id}): ${e}`);
      return;
    }
    if (mine !== token) {
      return; // another choice was made in the meantime
    }
    els.wall.style.backgroundImage = `url("${full(w.id)}")`;
    els.start.dataset.wallpaper = w.id;
    els.start.dataset.tone = w.tone;
    els.wall.animate([{ opacity: 0 }, { opacity: 1 }], { duration: Vento.motion.reduced ? 90 : 420, easing: "cubic-bezier(0.22, 0.8, 0.3, 1)" });
    markSelected(w.id);
  }

  function applyEbabil() {
    const on = Services.prefs.getBoolPref(PREF_EB, true);
    $("ebabil").hidden = !on;
    els.ebabilBox.checked = on;
  }

  function buildTiles() {
    const mk = (id, title, label) => {
      const b = document.createElement("button");
      b.className = "cp-tile";
      b.dataset.id = id;
      b.title = title;
      b.setAttribute("aria-pressed", "false");
      if (id) {
        const im = document.createElement("img");
        im.src = thumb(id);
        im.alt = "";
        im.loading = "lazy";
        b.append(im);
      } else {
        b.classList.add("none");
      }
      const t = document.createElement("span");
      t.textContent = label;
      b.append(t);
      b.addEventListener("click", () => Services.prefs.setStringPref(PREF_WALL, id));
      return b;
    };
    els.walls.replaceChildren(mk("", Vento.l10n.t("cp-none-title"), Vento.l10n.t("cp-none")), ...WALLPAPERS.map(w => mk(w.id, Vento.l10n.t(`wp-${w.id}`), Vento.l10n.t(`wp-${w.id}`))));
  }

  // ---- Top sites (bookmarks + most visited) ---------------------------------------
  const PREF_SITES = "vento.start.sites";
  let sitesToken = 0;

  async function makeTile(site) {
    const tile = document.createElement("div");
    tile.className = "site";
    tile.dataset.host = site.host;
    if (site.bookmark) {
      tile.dataset.bookmark = "";
    }
    const go = document.createElement("button");
    go.className = "site-go";
    go.title = site.url;
    const ico = document.createElement("span");
    ico.className = "site-ico";
    const data = await Vento.bookmarks.icon(site.url);
    if (data) {
      const img = document.createElement("img");
      img.src = data;
      img.alt = "";
      img.addEventListener("error", () => (ico.textContent = (site.host[0] ?? "•").toUpperCase()), { once: true });
      ico.append(img);
    } else {
      ico.textContent = (site.host[0] ?? "•").toUpperCase();
    }
    const name = document.createElement("span");
    name.className = "site-name";
    name.textContent = site.title.length > 26 ? `${site.title.slice(0, 25)}…` : site.title;
    go.append(ico, name);
    go.addEventListener("click", () => Vento.tabs.navigate(Vento.tabs.selected, site.url));
    const x = document.createElement("button");
    x.className = "site-x";
    x.title = Vento.l10n.t("site-remove");
    x.textContent = "×";
    x.addEventListener("click", async e => {
      e.stopPropagation();
      if (site.bookmark) {
        await Vento.bookmarks.remove(site.url);
      } else {
        Vento.bookmarks.hideHost(site.host);
      }
    });
    tile.append(go, x);
    return tile;
  }

  async function refreshSites() {
    const mine = ++sitesToken;
    if (!Services.prefs.getBoolPref(PREF_SITES, true)) {
      els.sites.replaceChildren();
      els.sites.hidden = true;
      return;
    }
    const tiles = await Promise.all((await Vento.bookmarks.topSites(8)).map(makeTile));
    if (mine !== sitesToken) {
      return; // a newer refresh has started
    }
    els.sites.replaceChildren(...tiles);
    els.sites.hidden = tiles.length === 0;
  }

  const isOpen = () => Vento.motion.isShown(els.panel);
  const open = () => Vento.motion.show(els.panel, "pop");
  const close = () => Vento.motion.hide(els.panel, "pop");

  function init() {
    Object.assign(els, {
      start: $("start"),
      wall: $("start-wall"),
      panel: $("custom-panel"),
      walls: $("cp-walls"),
      btn: $("start-custom"),
      ebabilBox: $("cp-ebabil"),
      sites: $("start-sites"),
    });
    buildTiles();
    Vento.l10n.addEventListener("change", () => {
      buildTiles(); // tile names and hints in the new language
      markSelected(Services.prefs.getStringPref(PREF_WALL, ""));
    });
    applyWallpaper();
    applyEbabil();
    refreshSites();
    Vento.bookmarks.addEventListener("change", refreshSites);
    Vento.l10n.addEventListener("change", refreshSites);
    // Keep the list current when a new blank tab opens (newly visited sites)
    Vento.tabs.addEventListener("tabselect", () => Vento.tabs.selected?.blank && refreshSites());

    // Panel rows: checkboxes bound directly to the pref (the checkbox updates if the pref changes elsewhere)
    const cleanups = [];
    const bindBool = (id, pref, def) => {
      const box = $(id);
      const apply = () => (box.checked = Services.prefs.getBoolPref(pref, def));
      apply();
      box.addEventListener("change", () => Services.prefs.setBoolPref(pref, box.checked));
      const obs = { observe: apply };
      Services.prefs.addObserver(pref, obs);
      cleanups.push(() => Services.prefs.removeObserver(pref, obs));
    };
    bindBool("cp-sites", PREF_SITES, true);
    Services.prefs.addObserver(PREF_SITES, { observe: () => refreshSites() });
    bindBool("cp-esin", "vento.esin.enabled", true);
    // Search engine: DuckDuckGo by default; picking Google shows a privacy note
    const engineSel = $("cp-search");
    const applyEngine = () => {
      const e = Services.prefs.getStringPref("vento.search.engine", "duckduckgo");
      engineSel.value = e in Vento.SEARCH_ENGINES ? e : "duckduckgo";
      $("cp-search-note").hidden = engineSel.value !== "google";
    };
    applyEngine();
    engineSel.addEventListener("change", () => Services.prefs.setStringPref("vento.search.engine", engineSel.value));
    const engineObs = { observe: applyEngine };
    Services.prefs.addObserver("vento.search.engine", engineObs);
    cleanups.push(() => Services.prefs.removeObserver("vento.search.engine", engineObs));
    // Esin model: the default (no logging) or Qwen; picking Qwen shows a note about the provider keeping logs
    const modelSel = $("cp-model");
    const applyModel = () => {
      const m = Services.prefs.getStringPref("vento.esin.model", "");
      modelSel.value = [...modelSel.options].some(o => o.value === m) ? m : "";
      $("cp-model-note").hidden = modelSel.value === "";
    };
    applyModel();
    modelSel.addEventListener("change", () => {
      Services.prefs.setStringPref("vento.esin.model", modelSel.value);
      applyModel();
    });
    const modelObs = { observe: applyModel };
    Services.prefs.addObserver("vento.esin.model", modelObs);
    cleanups.push(() => Services.prefs.removeObserver("vento.esin.model", modelObs));
    bindBool("cp-update-auto", "app.update.auto", true);
    $("cp-update-check").addEventListener("click", () => Vento.update.check());
    Vento.update.addEventListener("status", e => ($("cp-update-status").textContent = e.detail.text));
    window.addEventListener("unload", () => cleanups.forEach(f => f()), { once: true });
    els.btn.addEventListener("click", () => (isOpen() ? close() : open()));
    els.ebabilBox.addEventListener("change", () => Services.prefs.setBoolPref(PREF_EB, els.ebabilBox.checked));
    const observer = { observe: (s, t, name) => (name === PREF_WALL ? applyWallpaper() : applyEbabil()) };
    Services.prefs.addObserver(PREF_WALL, observer);
    Services.prefs.addObserver(PREF_EB, observer);
    window.addEventListener("unload", () => {
      Services.prefs.removeObserver(PREF_WALL, observer);
      Services.prefs.removeObserver(PREF_EB, observer);
    });
    // Closes on click outside / Esc; if the start screen is not visible (navigated to a page) the panel closes too
    document.addEventListener("mousedown", e => {
      if (isOpen() && !els.panel.contains(e.target) && !els.btn.contains(e.target)) {
        close();
      }
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && isOpen()) {
        close();
      }
    });
    const sync = () => {
      if (isOpen() && !Vento.tabs.selected?.blank) {
        close();
      }
    };
    Vento.tabs.addEventListener("tabselect", sync);
    Vento.tabs.addEventListener("tabchange", sync);
  }

  return { init, WALLPAPERS, open, close, isOpen, applyWallpaper, refreshSites };
})();
