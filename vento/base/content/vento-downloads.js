"use strict";

// İndirmeler: araç çubuğu düğmesi + açılır panel. Motor: toolkit'in Downloads modülü
// (liste, ilerleme, iptal/yeniden dene, profilde kalıcı downloads.json). Arayüz bizim.
// Dosya yardımcı-uygulama diyaloğu YOK: tercihler (vento.js) soru sormadan Downloads klasörüne kaydeder.

Vento.downloads = (() => {
  const { Downloads } = ChromeUtils.importESModule("resource://gre/modules/Downloads.sys.mjs");
  const { FileUtils } = ChromeUtils.importESModule("resource://gre/modules/FileUtils.sys.mjs");

  const $ = id => document.getElementById(id);
  const SVG = "http://www.w3.org/2000/svg";
  const els = {};
  const state = { list: null, rows: new Map(), dryRun: false };

  // ---- Yardımcılar ------------------------------------------------------------------------------

  const fileName = d => PathUtils.filename(d.target.path);

  function formatBytes(n) {
    if (!(n >= 0)) {
      return "";
    }
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i++;
    }
    return `${n.toLocaleString("tr-TR", { maximumFractionDigits: i ? 1 : 0 })} ${units[i]}`;
  }

  /** Durum metni + sınıf: active | done | error | canceled | paused */
  function status(d) {
    if (d.error) {
      return { kind: "error", text: "Başarısız" };
    }
    if (d.canceled) {
      return { kind: "canceled", text: "İptal edildi" };
    }
    if (d.succeeded) {
      return { kind: "done", text: `${formatBytes(d.totalBytes || d.currentBytes)} · Tamamlandı` };
    }
    const cur = formatBytes(d.currentBytes);
    const total = d.hasProgress ? ` / ${formatBytes(d.totalBytes)}` : "";
    return { kind: d.stopped ? "paused" : "active", text: d.stopped ? "Duraklatıldı" : `${cur}${total}` };
  }

  function svgButton(className, title, pathData, onClick) {
    const b = document.createElement("button");
    b.className = `dl-btn ${className}`;
    b.title = title;
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    const p = document.createElementNS(SVG, "path");
    p.setAttribute("d", pathData);
    svg.append(p);
    b.append(svg);
    b.addEventListener("click", e => {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  // ---- Satır ------------------------------------------------------------------------------------

  function buildRow(d) {
    const row = document.createElement("div");
    row.className = "dl-row";

    const mark = document.createElement("div");
    mark.className = "dl-mark";
    const info = document.createElement("div");
    info.className = "dl-info";
    const name = document.createElement("div");
    name.className = "dl-name";
    const meta = document.createElement("div");
    meta.className = "dl-meta";
    const bar = document.createElement("div");
    bar.className = "dl-bar";
    const fill = document.createElement("div");
    fill.className = "dl-fill";
    bar.append(fill);
    info.append(name, meta, bar);

    const actions = document.createElement("div");
    actions.className = "dl-actions";
    actions.append(
      svgButton("dl-cancel", "İptal", "M4 4l8 8M12 4l-8 8", () => d.cancel()),
      svgButton("dl-retry", "Yeniden dene", "M13 8a5 5 0 1 1-1.6-3.7M13 2.8v2.6h-2.6", () => d.start()),
      svgButton("dl-reveal", "Finder'da göster", "M2.5 5.5h4l1.2 1.5h5.8v5.5h-11z", () => reveal(d)),
      svgButton("dl-remove", "Listeden kaldır", "M3.5 5h9M6.5 5V3.5h3V5M5 5l.6 8h4.8l.6-8", () => remove(d))
    );

    row.append(mark, info, actions);
    row.addEventListener("click", () => {
      if (d.succeeded) {
        open(d);
      }
    });
    return { row, mark, name, meta, fill };
  }

  function paintRow(d) {
    const r = state.rows.get(d);
    if (!r) {
      return;
    }
    const st = status(d);
    r.row.dataset.kind = st.kind;
    r.name.textContent = fileName(d);
    r.name.title = d.source.url;
    r.mark.textContent = (/\.([a-z0-9]{1,4})$/i.exec(fileName(d))?.[1] ?? "•").toUpperCase();
    r.meta.textContent = st.text;
    r.fill.style.width = d.succeeded ? "100%" : d.hasProgress ? `${d.progress}%` : "8%";
    r.fill.toggleAttribute("indeterminate", st.kind === "active" && !d.hasProgress);
  }

  // ---- Eylemler ---------------------------------------------------------------------------------

  function open(d) {
    try {
      d.launch();
    } catch (e) {
      Vento.trace(`indirme açılamadı: ${e}`);
    }
  }

  function reveal(d) {
    try {
      new FileUtils.File(d.target.path).reveal();
    } catch (e) {
      Vento.trace(`Finder'da gösterilemedi: ${e}`);
    }
  }

  async function remove(d) {
    await state.list.remove(d);
    await d.finalize(!d.succeeded); // biten dosyayı silme; yarımı sil
  }

  async function clearFinished() {
    for (const d of await state.list.getAll()) {
      if (d.stopped && !d.hasPartialData) {
        await state.list.remove(d);
      }
    }
  }

  /** Bir adresi Downloads klasörüne kaydeder (sağ tık "Resmi kaydet" vb.). */
  async function saveURL(url, { referrer = "" } = {}) {
    const dir = await Downloads.getPreferredDownloadsDirectory();
    let base = "indirilen";
    try {
      const u = new URL(url);
      base = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || u.hostname) || base;
    } catch (e) {
      // data: vb. — varsayılan ad
    }
    base = base.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").slice(0, 120);
    if (!/\.[a-z0-9]{1,5}$/i.test(base) && url.startsWith("data:image/")) {
      base += "." + (/^data:image\/([a-z0-9+.-]+)/i.exec(url)?.[1] ?? "png").replace("jpeg", "jpg").replace("svg+xml", "svg");
    }
    const dot = base.lastIndexOf(".");
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const ext = dot > 0 ? base.slice(dot) : "";
    let path = PathUtils.join(dir, base);
    for (let i = 1; await IOUtils.exists(path); i++) {
      path = PathUtils.join(dir, `${stem} (${i})${ext}`);
    }

    const source = { url, isPrivate: false };
    if (referrer) {
      try {
        const info = Cc["@mozilla.org/referrer-info;1"].createInstance(Ci.nsIReferrerInfo);
        info.init(Ci.nsIReferrerInfo.UNSET, true, Services.io.newURI(referrer));
        source.referrerInfo = info;
      } catch (e) {
        // referrer olmadan devam
      }
    }
    const d = await Downloads.createDownload({ source, target: path });
    await state.list.add(d);
    d.start().catch(() => {}); // hata durumu satırda görünür
    return d;
  }

  // ---- Panel ------------------------------------------------------------------------------------

  function showPanel(show) {
    els.panel.hidden = !show;
    els.button.toggleAttribute("active-panel", show);
  }

  function refreshChrome() {
    const all = [...state.rows.keys()];
    els.button.hidden = all.length === 0;
    els.empty.hidden = all.length > 0;
    const active = all.filter(d => !d.stopped);
    els.button.toggleAttribute("downloading", active.length > 0);
    const known = active.filter(d => d.hasProgress);
    const pct = known.length ? Math.round(known.reduce((n, d) => n + d.progress, 0) / known.length) : 0;
    els.button.style.setProperty("--dl-progress", `${pct}%`);
    if (!all.length) {
      showPanel(false);
    }
  }

  const view = {
    onDownloadAdded(d) {
      const r = buildRow(d);
      state.rows.set(d, r);
      els.rows.prepend(r.row); // en yeni üstte
      paintRow(d);
      refreshChrome();
      if (!state.dryRun && !d.stopped) {
        showPanel(true); // yeni indirme başlayınca paneli göster
      }
    },
    onDownloadChanged(d) {
      paintRow(d);
      refreshChrome();
    },
    onDownloadRemoved(d) {
      state.rows.get(d)?.row.remove();
      state.rows.delete(d);
      refreshChrome();
    },
  };

  async function init() {
    Object.assign(els, {
      button: $("nav-downloads"),
      panel: $("downloads-panel"),
      rows: $("dl-rows"),
      empty: $("dl-empty"),
    });
    els.button.addEventListener("click", () => showPanel(els.panel.hidden));
    $("dl-clear").addEventListener("click", clearFinished);

    // Panel dışına tıklayınca / Esc ile kapanır. Sayfa içeriğine tıklama chrome'a mousedown olarak gelmez;
    // içeriğe odak geçişi (focusin) yakalanır.
    document.addEventListener("mousedown", e => {
      if (!els.panel.hidden && !els.panel.contains(e.target) && !els.button.contains(e.target)) {
        showPanel(false);
      }
    });
    document.addEventListener("focusin", e => {
      if (!els.panel.hidden && e.target.localName === "browser") {
        showPanel(false);
      }
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && !els.panel.hidden) {
        showPanel(false);
      }
    });

    await Downloads.getList(Downloads.PUBLIC); // kalıcı listeyi (downloads.json) yükler
    state.list = await Downloads.getList(Downloads.ALL);
    await state.list.addView(view);
  }

  return {
    init,
    saveURL,
    showPanel,
    formatBytes,
    set dryRun(v) {
      state.dryRun = v;
    },
    get state() {
      return state;
    },
  };
})();
