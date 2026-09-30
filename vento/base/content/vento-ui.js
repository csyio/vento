"use strict";

// Vento arayüzü: sekme şeridi, gezinme, akıllı çubuk, sahne durumu.
// Yalnızca Vento.tabs modelinin olaylarını dinler; motora doğrudan dokunmaz.

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
    close.title = "Sekmeyi kapat (⌘W)";
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
    el.querySelector(".tab-mark").textContent = markLetter(tab);
    el.querySelector(".tab-title").textContent = tab.label;
    el.title = tab.label;
  }

  function renderTabs() {
    const tabs = Vento.tabs.all;
    const existing = new Map([...els.tabs.children].map(c => [c.dataset.id, c]));
    const frag = [];
    for (const tab of tabs) {
      const el = existing.get(String(tab.id)) ?? buildTabEl(tab);
      existing.delete(String(tab.id));
      frag.push(el);
    }
    for (const stale of existing.values()) {
      stale.remove();
    }
    els.tabs.replaceChildren(...frag);
    tabs.forEach(updateTab);
  }

  /** Çubuğun değeri: odakta tam adres, değilse kısa biçim. */
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

  /** Odakta çubuk tam adresi gösterir. Değeri odak olayına bırakmayız: pencere etkin değilken tetiklenmez. */
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
    Object.assign(els, {
      tabs: $("tabs"),
      stage: $("stage"),
      input: $("smartbar-input"),
      back: $("nav-back"),
      forward: $("nav-forward"),
      reload: $("nav-reload"),
    });

    const t = Vento.tabs;
    t.addEventListener("tabopen", renderTabs);
    t.addEventListener("tabclose", renderTabs);
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
    els.input.addEventListener("blur", refreshBar);
    els.input.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (t.navigate(t.selected, els.input.value)) {
          focusPage();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (t.selected?.blank) {
          els.input.select();
        } else {
          focusPage();
        }
      }
    });
  }

  return { init, focusBar, focusPage, renderTabs, refreshChrome };
})();
