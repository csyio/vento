"use strict";

// Vento UI: tab strip, navigation, smart bar, stage state.
// Only listens to Vento.tabs model events; never touches the engine directly.

Vento.ui = (() => {
  const SVG = "http://www.w3.org/2000/svg";
  const $ = id => document.getElementById(id);

  const els = {};

  function svgIcon(pathData) {
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", pathData);
    svg.appendChild(path);
    return svg;
  }

  function markLetter(tab) {
    const m = /[\p{L}\p{N}]/u.exec(tab.host || tab.title || "");
    return m ? m[0] : "V";
  }

  // <img> if there is an icon, otherwise (or if it fails to load) a letter mark. The element isn't rebuilt unless the icon changes (no flicker).
  // Icon of a blank tab (new tab): Ebabil's head (the site has no icon of its own)
  const BLANK_ICON = "chrome://vento/content/art/pose-icon.webp";

  function setMark(mark, tab) {
    const icon = tab.icon || (tab.blank ? BLANK_ICON : "");
    if (icon) {
      if (mark.dataset.icon !== icon) {
        const img = document.createElement("img");
        img.alt = "";
        img.addEventListener("error", () => {
          if (icon === mark.dataset.icon) {
            if (tab.icon === icon) {
              tab.icon = "";
            }
            delete mark.dataset.icon;
            mark.classList.remove("has-icon");
            mark.textContent = markLetter(tab);
          }
        }, { once: true });
        img.src = icon;
        mark.dataset.icon = icon;
        mark.classList.add("has-icon");
        mark.replaceChildren(img);
      }
      return;
    }
    delete mark.dataset.icon;
    mark.classList.remove("has-icon");
    mark.textContent = markLetter(tab);
  }

  function buildTabEl(tab) {
    const el = document.createElement("div");
    el.className = "tab";
    el.dataset.id = String(tab.id);

    const mark = document.createElement("span");
    mark.className = "tab-mark";
    const title = document.createElement("span");
    title.className = "tab-title";
    const close = document.createElement("button");
    close.className = "tab-close";
    close.title = Vento.l10n.attr("tip-tab-close");
    close.appendChild(svgIcon("M4 4l8 8M12 4l-8 8"));
    el.append(mark, title, close);

    el.addEventListener("mousedown", e => {
      if (e.button === 1) {
        e.preventDefault();
        Vento.tabs.close(tab);
      } else if (e.button === 0 && !close.contains(e.target)) {
        Vento.tabs.select(tab);
      }
    });
    close.addEventListener("click", e => {
      e.stopPropagation();
      Vento.tabs.close(tab);
    });
    return el;
  }

  function tabEl(tab) {
    return els.tabs.querySelector(`.tab[data-id="${tab.id}"]`);
  }

  function updateTab(tab) {
    const el = tabEl(tab);
    if (!el) {
      return;
    }
    el.toggleAttribute("selected", tab === Vento.tabs.selected);
    el.toggleAttribute("loading", tab.loading);
    setMark(el.querySelector(".tab-mark"), tab);
    el.querySelector(".tab-close").title = Vento.l10n.attr("tip-tab-close");
    el.querySelector(".tab-title").textContent = tab.label;
    el.title = tab.label;
  }

  // ---- Tab motion --------------------------------------------------------------------------
  // On open it expands in place and fades in; on close its copy (ghost) shrinks and fades. No motion on startup (booting).
  // The width animation affects layout but only in the 30 px tab strip; the page isn't resized.
  const TAB_IN_MS = 200;
  const TAB_OUT_MS = 170;
  const ghosts = []; // {el, index, started}
  const tabMotionOn = () => !document.documentElement.hasAttribute("booting");
  const COLLAPSED = { flexBasis: "0px", width: "0px", minWidth: "0px", paddingLeft: "0px", paddingRight: "0px", opacity: 0 };

  function animateTabIn(el) {
    if (!tabMotionOn()) {
      return;
    }
    if (Vento.motion.reduced) {
      el.animate([{ opacity: 0 }], { duration: 90 });
      return;
    }
    el.animate([{ ...COLLAPSED, transform: "scale(0.92)" }], { duration: TAB_IN_MS, easing: "cubic-bezier(0.22, 0.8, 0.3, 1)" });
  }

  function captureGhost(tab) {
    const el = tabEl(tab);
    if (!el || !tabMotionOn()) {
      return;
    }
    const g = el.cloneNode(true);
    g.removeAttribute("data-id");
    g.classList.add("closing");
    ghosts.push({ el: g, index: [...els.tabs.children].indexOf(el), started: false });
  }

  function startGhost(g) {
    g.started = true;
    const done = () => {
      g.el.remove();
      const i = ghosts.indexOf(g);
      if (i >= 0) {
        ghosts.splice(i, 1);
      }
    };
    const frames = Vento.motion.reduced ? [{ opacity: 1 }, { opacity: 0 }] : [{}, COLLAPSED];
    const a = g.el.animate(frames, { duration: Vento.motion.reduced ? 90 : TAB_OUT_MS, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" });
    a.finished.then(done, done);
    setTimeout(done, TAB_OUT_MS + 200); // safety net: a ghost never gets stuck for good
  }

  function renderTabs() {
    const tabs = Vento.tabs.all;
    const existing = new Map([...els.tabs.children].filter(c => !c.classList.contains("closing")).map(c => [c.dataset.id, c]));
    const frag = [];
    const fresh = [];
    for (const tab of tabs) {
      let el = existing.get(String(tab.id));
      if (!el) {
        el = buildTabEl(tab);
        fresh.push(el);
      }
      existing.delete(String(tab.id));
      frag.push(el);
    }
    for (const stale of existing.values()) {
      stale.remove();
    }
    for (const g of ghosts) {
      frag.splice(Math.min(g.index, frag.length), 0, g.el);
    }
    els.tabs.replaceChildren(...frag);
    tabs.forEach(updateTab);
    fresh.forEach(animateTabIn);
    ghosts.filter(g => !g.started).forEach(startGhost);
  }

  /** The bar's value: full URL when focused, short form otherwise. */
  function refreshBar() {
    const tab = Vento.tabs.selected;
    if (!tab || document.activeElement === els.input) {
      return;
    }
    els.input.value = Vento.formatDisplay(tab.url);
  }

  function refreshChrome() {
    const tab = Vento.tabs.selected;
    if (!tab) {
      return;
    }
    els.back.disabled = !tab.canGoBack;
    els.forward.disabled = !tab.canGoForward;
    els.stage.toggleAttribute("loading", tab.loading);
    els.stage.toggleAttribute("blank", tab.blank);
    document.title = tab.blank ? "Vento" : `${tab.label} — Vento`;
    refreshBar();
  }

  // ---- Suggestions: "Ask Esin / Search" for text that is not a URL -----------------------------
  let suggestIndex = 0;

  function suggestVisible() {
    return Vento.motion.isShown(els.suggest);
  }

  function selectSuggest(i) {
    suggestIndex = (i + els.rows.length) % els.rows.length;
    els.rows.forEach((r, k) => r.toggleAttribute("selected", k === suggestIndex));
  }

  // If Esin is off, the "Ask Esin" row is absent (the default choice becomes "Search")
  const liveRows = () => [...els.suggest.querySelectorAll(".suggest-row")].filter(r => Vento.esin.enabled || r.dataset.kind !== "esin");

  function updateSuggest() {
    els.rows = liveRows();
    const text = els.input.value.trim();
    const show = document.activeElement === els.input && !!text && Vento.isSearchText(text);
    if (!show) {
      hideSuggest(); // also resets the selection: next open defaults to "Ask Esin" again
    } else {
      // The selection resets when the list shows again (or again while exiting): the default is "Ask Esin" again
      if (!Vento.motion.isShown(els.suggest)) {
        els.rows.forEach(r => r.removeAttribute("selected"));
      }
      Vento.motion.show(els.suggest, "drop");
    }
    if (show) {
      els.rows.forEach(r => (r.querySelector(".suggest-text").textContent = text));
      if (!els.rows.some(r => r.hasAttribute("selected"))) {
        selectSuggest(0); // default: Esin
      }
    }
  }

  function hideSuggest() {
    // The selection is reset when the exit animation ENDS (so the highlight doesn't vanish and flicker while fading); untouched if it reopened meanwhile.
    Vento.motion.hide(els.suggest, "drop").then(() => {
      if (els.suggest.hidden) {
        els.rows.forEach(r => r.removeAttribute("selected"));
      }
    });
  }

  function runSuggest(kind) {
    const text = els.input.value.trim();
    hideSuggest();
    if (!text) {
      return;
    }
    if (kind === "esin") {
      els.input.value = "";
      els.input.blur();
      Vento.esin.ask(text);
      document.getElementById("esin-input").focus();
    } else if (Vento.tabs.navigate(Vento.tabs.selected, text)) {
      focusPage();
    }
  }

  /** When focused the bar shows the full URL. We don't leave the value to the focus event: it doesn't fire while the window is inactive. */
  function showFullUrl() {
    const tab = Vento.tabs.selected;
    els.input.value = tab && !tab.blank ? tab.url : "";
  }

  function focusBar() {
    showFullUrl();
    els.input.focus();
    els.input.select();
  }

  function focusPage() {
    Vento.tabs.selected?.browser.focus();
  }

  function init() {
    // No tab animation on startup (including session restore); it turns on shortly after.
    document.documentElement.setAttribute("booting", "");
    setTimeout(() => document.documentElement.removeAttribute("booting"), 900);
    Object.assign(els, {
      tabs: $("tabs"),
      stage: $("stage"),
      input: $("smartbar-input"),
      back: $("nav-back"),
      forward: $("nav-forward"),
      reload: $("nav-reload"),
      suggest: $("smartbar-suggest"),
    });
    els.rows = [...els.suggest.querySelectorAll(".suggest-row")];

    const t = Vento.tabs;
    t.addEventListener("tabopen", renderTabs);
    t.addEventListener("tabclose", e => {
      captureGhost(e.detail.tab);
      renderTabs();
    });
    t.addEventListener("tabselect", () => {
      renderTabs();
      refreshChrome();
      if (t.selected?.blank) {
        focusBar();
      }
    });
    t.addEventListener("tabchange", e => {
      updateTab(e.detail.tab);
      if (e.detail.tab === t.selected) {
        refreshChrome();
      }
    });

    $("newtab").addEventListener("click", () => t.open("about:blank"));
    els.back.addEventListener("click", () => t.back());
    els.forward.addEventListener("click", () => t.forward());
    els.reload.addEventListener("click", () => (t.selected?.loading ? t.stop() : t.reload()));

    els.input.addEventListener("focus", () => {
      showFullUrl();
      els.input.select();
    });
    els.input.addEventListener("blur", () => {
      hideSuggest();
      refreshBar();
    });
    els.input.addEventListener("input", updateSuggest);
    els.rows.forEach(row => {
      // keep focus on the bar on mousedown, otherwise blur hides the suggestion first and the click is lost
      row.addEventListener("mousedown", e => e.preventDefault());
      row.addEventListener("mouseenter", () => selectSuggest(Math.max(0, els.rows.indexOf(row))));
      row.addEventListener("click", () => runSuggest(row.dataset.kind));
    });
    els.input.addEventListener("keydown", e => {
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && suggestVisible()) {
        e.preventDefault();
        selectSuggest(suggestIndex + (e.key === "ArrowDown" ? 1 : -1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (suggestVisible()) {
          runSuggest(els.rows[suggestIndex].dataset.kind);
        } else if (t.navigate(t.selected, els.input.value)) {
          focusPage();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (suggestVisible()) {
          hideSuggest();
        } else if (t.selected?.blank) {
          els.input.select();
        } else {
          focusPage();
        }
      }
    });
  }

  return { init, focusBar, focusPage, renderTabs, refreshChrome, updateSuggest };
})();
