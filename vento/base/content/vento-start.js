"use strict";

// Başlangıç ekranı kişiselleştirme: duvar kâğıdı + Ebabil aç/kapa. Varsayılan SADE (duvar kâğıdı yok, Ebabil açık).
// Tercihler: vento.start.wallpaper ("" ya da bir kimlik), vento.start.ebabil (bool). Panel "Özelleştir" düğmesinden açılır.
//
// Metinler tek yerde (T): ileride i18n'e taşınırken yalnız burası değişir.

Vento.start = (() => {
  const T = { wall: "Duvar kâğıdı", none: "Yok", none_title: "Duvar kâğıdı yok (sade)" };
  const WALLPAPERS = [
    { id: "ink", tone: "dark", name: "Mürekkep" },
    { id: "tide", tone: "dark", name: "Gelgit" },
    { id: "dusk", tone: "dark", name: "Alacakaranlık" },
    { id: "dune", tone: "dark", name: "Kumul" },
    { id: "paper", tone: "light", name: "Kâğıt" },
    { id: "mist", tone: "light", name: "Sis" },
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

  /** Duvar kâğıdını tercihten uygular. Önce görsel ÇÖZÜLÜR, sonra ton değişir (okunurluk + titreme olmasın). */
  async function applyWallpaper() {
    const id = Services.prefs.getStringPref(PREF_WALL, "");
    const w = WALLPAPERS.find(x => x.id === id); // bilinmeyen kimlik (elle bozulmuş tercih) = yok
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
      Vento.trace(`duvar kâğıdı yüklenemedi (${w.id}): ${e}`);
      return;
    }
    if (mine !== token) {
      return; // bu arada başka seçim yapıldı
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
    els.walls.replaceChildren(mk("", T.none_title, T.none), ...WALLPAPERS.map(w => mk(w.id, w.name, w.name)));
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
    });
    buildTiles();
    applyWallpaper();
    applyEbabil();
    els.btn.addEventListener("click", () => (isOpen() ? close() : open()));
    els.ebabilBox.addEventListener("change", () => Services.prefs.setBoolPref(PREF_EB, els.ebabilBox.checked));
    const observer = { observe: (s, t, name) => (name === PREF_WALL ? applyWallpaper() : applyEbabil()) };
    Services.prefs.addObserver(PREF_WALL, observer);
    Services.prefs.addObserver(PREF_EB, observer);
    window.addEventListener("unload", () => {
      Services.prefs.removeObserver(PREF_WALL, observer);
      Services.prefs.removeObserver(PREF_EB, observer);
    });
    // Dışarı tıklayınca / Esc ile kapanır; başlangıç ekranı görünmüyorsa (sayfaya gidildi) panel de kapanır
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

  return { init, WALLPAPERS, open, close, isOpen, applyWallpaper };
})();
