"use strict";

// Sağ tık menüsü (ana süreç tarafı). İçerik aktörü (VentoContextMenuChild) tıklanan yerin verisini yollar;
// burada önce "ne gösterilecek" bir tarif olarak üretilir (build — test edilebilir), sonra macOS yerel
// menüsüne (XUL menupopup) çevrilip açılır (render/show).

Vento.contextMenu = (() => {
  const SEP = Symbol("ayırıcı");
  const state = { dryRun: false, last: null, items: [], copied: null, history: [] };

  const shorten = (text, n = 28) => {
    const t = text.replace(/\s+/g, " ").trim();
    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
  };

  function copy(text) {
    state.copied = text;
    if (!state.dryRun) {
      Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(text);
    }
  }

  /** Bağlam verisinden menü tarifi: [{label, run, disabled?, sub?} | SEP]. */
  function build(data) {
    const L = (id, args) => Vento.l10n.t(id, args);
    const t = Vento.tabs;
    const tab = t.selected;
    const out = [];
    const sep = () => {
      if (out.length && out.at(-1) !== SEP) {
        out.push(SEP);
      }
    };
    const add = (label, run, extra = {}) => out.push({ label, run, ...extra });
    const goCmd = c => () => goDoCommand(c);

    if (data.linkUrl) {
      add(L("ctx-open-link-new-tab"), () => t.open(data.linkUrl, { select: false, afterCurrent: true }));
      add(L("ctx-copy-link"), () => copy(data.linkUrl));
      add(L("ctx-download-link"), () => Vento.downloads.saveURL(data.linkUrl, { referrer: data.pageUrl }));
      sep();
    }

    if (data.imageUrl) {
      add(L("ctx-open-image-new-tab"), () => t.open(data.imageUrl, { afterCurrent: true }));
      add(L("ctx-copy-image-url"), () => copy(data.imageUrl));
      add(L("ctx-save-image"), () => Vento.downloads.saveURL(data.imageUrl, { referrer: data.pageUrl }));
      sep();
    }

    if (data.mediaUrl) {
      const video = data.mediaKind === "video";
      const acc = L(video ? "ctx-kind-video-acc" : "ctx-kind-audio-acc");
      const nom = L(video ? "ctx-kind-video" : "ctx-kind-audio");
      add(L("ctx-open-media-new-tab", { kind: acc }), () => t.open(data.mediaUrl, { afterCurrent: true }));
      add(L("ctx-copy-media-url", { kind: nom }), () => copy(data.mediaUrl));
      add(L("ctx-download-media", { kind: acc }), () => Vento.downloads.saveURL(data.mediaUrl, { referrer: data.pageUrl }));
      sep();
    }

    if (data.editable) {
      add(L("ctx-undo"), goCmd("cmd_undo"));
      add(L("ctx-redo"), goCmd("cmd_redo"));
      sep();
      add(L("ctx-cut"), goCmd("cmd_cut"), { disabled: !data.selection });
      add(L("ctx-copy"), goCmd("cmd_copy"), { disabled: !data.selection });
      add(L("ctx-paste"), goCmd("cmd_paste"));
      add(L("ctx-select-all"), goCmd("cmd_selectAll"));
      sep();
    } else if (data.selection) {
      add(L("ctx-copy"), () => copy(data.selection));
    }

    if (data.selection) {
      const q = data.selection;
      add(L("ctx-search-for", { text: shorten(q) }), () => {
        // Seçili metin adres gibi görünse bile arama yap (kullanıcı "ara" dedi)
        t.open(Vento.searchURL(q), { afterCurrent: true });
      });
      add(L("ctx-esin"), null, {
        sub: [
          { label: L("ctx-explain"), run: () => Vento.esin.ask(`${L("ctx-q-explain")}\n\n“${q}”`) },
          { label: L("ctx-summarize"), run: () => Vento.esin.ask(`${L("ctx-q-summarize")}\n\n“${q}”`) },
          { label: L("ctx-translate"), run: () => Vento.esin.ask(`${L("ctx-q-translate")}\n\n“${q}”`) },
        ],
      });
      sep();
    }

    // Sayfa menüsü: yalnızca özel bir hedef yokken (bağlantı/resim/yazı alanı/seçim değil)
    if (!data.linkUrl && !data.imageUrl && !data.mediaUrl && !data.editable && !data.selection) {
      add(L("ctx-back"), () => t.back(), { disabled: !tab?.canGoBack });
      add(L("ctx-forward"), () => t.forward(), { disabled: !tab?.canGoForward });
      add(L("ctx-reload"), () => t.reload());
      sep();
      add(L("ctx-copy-page-url"), () => copy(data.pageUrl));
      add(L("ctx-print"), () => Vento.print());
      add(L("ctx-summarize-page"), () => Vento.esin.ask(L("ctx-q-summarize-page")));
      add(L("ctx-view-source"), () => t.open(`view-source:${data.pageUrl}`, { afterCurrent: true }));
    }

    while (out.at(-1) === SEP) {
      out.pop();
    }
    return out;
  }

  function menuItem(d) {
    const el = document.createXULElement("menuitem");
    el.setAttribute("label", d.label);
    if (d.disabled) {
      el.setAttribute("disabled", "true");
    }
    el.addEventListener("command", () => d.run());
    return el;
  }

  function render(items) {
    const popup = document.getElementById("page-context-menu");
    popup.replaceChildren(
      ...items.map(d => {
        if (d === SEP) {
          return document.createXULElement("menuseparator");
        }
        if (d.sub) {
          const menu = document.createXULElement("menu");
          menu.setAttribute("label", d.label);
          const sub = document.createXULElement("menupopup");
          sub.append(...d.sub.map(menuItem));
          menu.append(sub);
          return menu;
        }
        return menuItem(d);
      })
    );
    return popup;
  }

  /** İçerik aktöründen gelir. `browser`: tıklanan sekmenin <browser>'ı. */
  function show(browser, data) {
    if (browser !== Vento.tabs.selected?.browser) {
      return; // yalnızca görünen sekme menü açabilir
    }
    data.pageUrl = Vento.tabs.selected?.url ?? "";
    state.last = data;
    state.items = build(data);
    if (state.dryRun) {
      state.history.push({ data, items: state.items });
    }
    if (state.dryRun || !state.items.length) {
      return;
    }
    const dpr = window.devicePixelRatio;
    render(state.items).openPopupAtScreen(data.screenXDevPx / dpr, data.screenYDevPx / dpr, true);
  }

  return {
    build,
    show,
    SEP,
    get state() {
      return state;
    },
    set dryRun(v) {
      state.dryRun = v;
    },
  };
})();
