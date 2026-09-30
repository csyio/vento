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
      add("Bağlantıyı Yeni Sekmede Aç", () => t.open(data.linkUrl, { select: false, afterCurrent: true }));
      add("Bağlantı Adresini Kopyala", () => copy(data.linkUrl));
      add("Bağlantıdaki Dosyayı İndir", () => Vento.downloads.saveURL(data.linkUrl, { referrer: data.pageUrl }));
      sep();
    }

    if (data.imageUrl) {
      add("Resmi Yeni Sekmede Aç", () => t.open(data.imageUrl, { afterCurrent: true }));
      add("Resim Adresini Kopyala", () => copy(data.imageUrl));
      add("Resmi İndirilenler'e Kaydet", () => Vento.downloads.saveURL(data.imageUrl, { referrer: data.pageUrl }));
      sep();
    }

    if (data.mediaUrl) {
      const kind = data.mediaKind === "video" ? "Videoyu" : "Sesi";
      add(`${kind} Yeni Sekmede Aç`, () => t.open(data.mediaUrl, { afterCurrent: true }));
      add(`${data.mediaKind === "video" ? "Video" : "Ses"} Adresini Kopyala`, () => copy(data.mediaUrl));
      add(`${kind} İndir`, () => Vento.downloads.saveURL(data.mediaUrl, { referrer: data.pageUrl }));
      sep();
    }

    if (data.editable) {
      add("Geri Al", goCmd("cmd_undo"));
      add("Yinele", goCmd("cmd_redo"));
      sep();
      add("Kes", goCmd("cmd_cut"), { disabled: !data.selection });
      add("Kopyala", goCmd("cmd_copy"), { disabled: !data.selection });
      add("Yapıştır", goCmd("cmd_paste"));
      add("Tümünü Seç", goCmd("cmd_selectAll"));
      sep();
    } else if (data.selection) {
      add("Kopyala", () => copy(data.selection));
    }

    if (data.selection) {
      const q = data.selection;
      add(`“${shorten(q)}” için Ara`, () => {
        const url = Vento.resolveInput(q);
        // Seçili metin adres gibi görünse bile arama yap (kullanıcı "ara" dedi)
        t.open(url?.startsWith("https://duckduckgo.com/") ? url : `https://duckduckgo.com/?q=${encodeURIComponent(q)}`, {
          afterCurrent: true,
        });
      });
      add("Esin", null, {
        sub: [
          { label: "Açıkla", run: () => Vento.esin.ask(`Şu metni açıkla:\n\n“${q}”`) },
          { label: "Özetle", run: () => Vento.esin.ask(`Şu metni kısaca özetle:\n\n“${q}”`) },
          { label: "Türkçeye Çevir", run: () => Vento.esin.ask(`Şu metni Türkçeye çevir:\n\n“${q}”`) },
        ],
      });
      sep();
    }

    // Sayfa menüsü: yalnızca özel bir hedef yokken (bağlantı/resim/yazı alanı/seçim değil)
    if (!data.linkUrl && !data.imageUrl && !data.mediaUrl && !data.editable && !data.selection) {
      add("Geri", () => t.back(), { disabled: !tab?.canGoBack });
      add("İleri", () => t.forward(), { disabled: !tab?.canGoForward });
      add("Yenile", () => t.reload());
      sep();
      add("Sayfa Adresini Kopyala", () => copy(data.pageUrl));
      add("Yazdır…", () => Vento.print());
      add("Sayfayı Esin ile Özetle", () => Vento.esin.ask("Bu sayfayı kısaca özetle."));
      add("Sayfa Kaynağını Göster", () => t.open(`view-source:${data.pageUrl}`, { afterCurrent: true }));
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
