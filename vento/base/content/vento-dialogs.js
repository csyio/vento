"use strict";

// Sayfa iletişim kutuları: alert / confirm / prompt / kimlik doğrulama (confirmEx, promptUserAndPass, …).
//
// Toolkit'in Prompter'ı istemi "Prompt" aktörüne yollar (VentoPromptParent → buraya). Diyalog SEKMEYE bağlıdır:
// arka plandaki sekmenin diyaloğu o sekme seçilene kadar görünmez; sekme kapanır/gezinirse iptal edilir.
// Cevap sözleşmesi (CommonDialog ile aynı): args.ok, args.buttonNumClicked, args.checked, args.value | user | pass.

Vento.dialogs = (() => {
  const $ = id => document.getElementById(id);
  const els = {};
  /** browser → { current: entry|null, queue: entry[] } */
  const perBrowser = new Map();
  const state = { shown: null };

  const isType = (t, ...list) => list.includes(t);

  function originOf(args) {
    if (args.authOrigin) {
      return args.authOrigin;
    }
    try {
      const p = args.promptPrincipal;
      if (p?.URI && /^https?$/.test(p.URI.scheme)) {
        return p.URI.host;
      }
    } catch (e) {
      // başlık yalnızca bilgi
    }
    return "";
  }

  /** [{index, label}] — index, cevaptaki buttonNumClicked'dir. */
  function buttonsFor(args) {
    const t = args.promptType;
    const label = (i, fallback) => args[`button${i}Label`] || fallback;
    if (isType(t, "alert", "alertCheck")) {
      return [{ index: 0, label: label(0, Vento.l10n.t("dlg-ok")) }];
    }
    if (t === "confirmEx") {
      return [0, 1, 2, 3].filter(i => args[`button${i}Label`]).map(i => ({ index: i, label: args[`button${i}Label`] }));
    }
    return [
      { index: 0, label: label(0, Vento.l10n.t("dlg-ok")) },
      { index: 1, label: label(1, Vento.l10n.t("dlg-cancel")) },
    ];
  }

  function field(className, type, value, placeholder) {
    const input = document.createElement("input");
    input.className = `dlg-input ${className}`;
    input.type = type;
    input.value = value ?? "";
    input.spellcheck = false;
    input.autocomplete = "off";
    if (placeholder) {
      input.placeholder = placeholder;
    }
    return input;
  }

  function build(entry) {
    const { args } = entry;
    const t = args.promptType;
    const card = document.createElement("div");
    card.className = "dlg-card";
    card.setAttribute("role", "alertdialog");

    const origin = originOf(args);
    if (origin) {
      const o = document.createElement("div");
      o.className = "dlg-origin";
      o.textContent = args.inPermitUnload ? origin : Vento.l10n.t("dlg-says", { origin });
      card.append(o);
    }

    const text = document.createElement("div");
    text.className = "dlg-text";
    text.textContent = (args.text ?? "").slice(0, 10000);
    card.append(text);

    if (args.isInsecureAuth) {
      const w = document.createElement("div");
      w.className = "dlg-warn";
      w.textContent = Vento.l10n.t("dlg-insecure");
      card.append(w);
    }

    const inputs = {};
    if (t === "prompt") {
      inputs.value = field("dlg-value", "text", args.value);
    } else if (t === "promptUserAndPass") {
      inputs.user = field("dlg-user", "text", args.user, Vento.l10n.t("dlg-username"));
      inputs.pass = field("dlg-pass", "password", args.pass, Vento.l10n.t("dlg-password"));
    } else if (t === "promptPassword") {
      inputs.pass = field("dlg-pass", "password", args.pass, Vento.l10n.t("dlg-password"));
    }
    card.append(...Object.values(inputs));

    let checkbox = null;
    if (args.checkLabel) {
      const label = document.createElement("label");
      label.className = "dlg-check";
      checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = !!args.checked;
      label.append(checkbox, args.checkLabel);
      card.append(label);
    }

    const row = document.createElement("div");
    row.className = "dlg-buttons";
    const buttons = buttonsFor(args);
    const defaultIndex = buttons.some(b => b.index === (args.defaultButtonNum || 0)) ? args.defaultButtonNum || 0 : buttons[0]?.index ?? 0;
    for (const b of buttons) {
      const btn = document.createElement("button");
      btn.className = "dlg-btn";
      btn.textContent = b.label;
      btn.dataset.index = String(b.index);
      btn.toggleAttribute("primary", b.index === defaultIndex);
      btn.addEventListener("click", () => answer(entry, b.index));
      row.append(btn);
    }
    card.append(row);

    card.addEventListener("keydown", e => {
      if (e.key === "Enter" && e.target.localName !== "button") {
        e.preventDefault();
        answer(entry, defaultIndex);
      } else if (e.key === "Escape") {
        e.preventDefault();
        // İptal düğmesi varsa o; yoksa (alert) tek düğme
        answer(entry, buttons.some(b => b.index === 1) ? 1 : buttons[0]?.index ?? 0);
      }
    });

    entry.ui = { card, inputs, checkbox, defaultIndex };
    return card;
  }

  // ---- Akış -------------------------------------------------------------------------------------

  /** Actor'dan çağrılır. Kullanıcı cevap verince (ya da iptal edilince) args ile çözülen Promise döner. */
  function open(browser, args, actor = null) {
    if (args.promptType === "select") {
      return Promise.resolve({ promptAborted: true }); // seçim istemleri henüz desteklenmiyor
    }
    return new Promise(resolve => {
      const entry = { browser, args, actor, resolve, ui: null };
      let slot = perBrowser.get(browser);
      if (!slot) {
        slot = { current: null, queue: [] };
        perBrowser.set(browser, slot);
      }
      slot.queue.push(entry);
      if (!slot.current) {
        slot.current = slot.queue.shift();
      }
      sync();
    });
  }

  function answer(entry, index) {
    if (entry.done) {
      return;
    }
    entry.done = true;
    const { args } = entry;
    const { inputs, checkbox } = entry.ui ?? { inputs: {} };
    args.promptActive = false;
    args.buttonNumClicked = index;
    args.ok = index === 0;
    if (checkbox) {
      args.checked = checkbox.checked;
    }
    if (index === 0) {
      for (const k of ["value", "user", "pass"]) {
        if (inputs[k]) {
          args[k] = inputs[k].value;
        }
      }
    }
    settle(entry, args);
  }

  function abort(entry) {
    if (entry.done) {
      return;
    }
    entry.done = true;
    entry.args.promptActive = false;
    entry.args.promptAborted = true;
    settle(entry, entry.args);
  }

  function settle(entry, result) {
    const slot = perBrowser.get(entry.browser);
    if (slot?.current === entry) {
      slot.current = slot.queue.shift() ?? null;
    } else if (slot) {
      slot.queue = slot.queue.filter(e => e !== entry);
    }
    if (slot && !slot.current && !slot.queue.length) {
      perBrowser.delete(entry.browser);
    }
    // Görünen kartı sync() kaldırır (karartma solarken yerinde kalsın); görünmeyen (sırada bekleyen) kart hemen gider.
    if (entry !== state.shown) {
      entry.ui?.card.remove();
    }
    entry.resolve(result);
    sync();
  }

  function abortWhere(pred) {
    for (const slot of [...perBrowser.values()]) {
      for (const e of [slot.current, ...slot.queue]) {
        if (e && pred(e)) {
          abort(e);
        }
      }
    }
  }

  /** Seçili sekmenin geçerli diyaloğunu göster; yoksa katmanı gizle. */
  function sync() {
    const browser = Vento.tabs.selected?.browser;
    const entry = perBrowser.get(browser)?.current ?? null;
    if (entry === state.shown && (!entry || entry.ui?.card.isConnected)) {
      Vento.motion.set(els.layer, !!entry, "fade");
      return;
    }
    const old = state.shown?.ui?.card;
    state.shown = entry;
    if (!entry) {
      // Çıkış: kart, karartma solarken yerinde kalır; bitince kaldırılır (bu arada yeni diyalog geldiyse dokunulmaz)
      state.leaving = old ?? null;
      Vento.motion.hide(els.layer, "fade").then(() => {
        if (!state.shown && state.leaving === old) {
          old?.remove();
          state.leaving = null;
        }
      });
      return;
    }
    state.leaving?.remove();
    state.leaving = null;
    old?.remove();
    {
      if (!entry.ui) {
        build(entry); // entry.ui = { card, inputs, checkbox } kurar
      }
      const wasShown = Vento.motion.isShown(els.layer);
      els.layer.append(entry.ui.card);
      Vento.motion.show(els.layer, "fade");
      if (!wasShown) {
        Vento.motion.enter(entry.ui.card, "pop"); // kart da kendi girişini yapar (karartma yalnız solar)
      }
      const first = entry.ui.card.querySelector("input:not([type=checkbox])") ?? entry.ui.card.querySelector("button[primary]");
      first?.focus();
      first?.select?.();
    }
  }

  function init() {
    els.layer = $("dialog-layer");
    Vento.tabs.addEventListener("tabselect", sync);
    Vento.tabs.addEventListener("tabclose", e => abortWhere(x => x.browser === e.detail.tab.browser));
  }

  return {
    init,
    open,
    abortActor: actor => abortWhere(e => e.actor === actor),
    get state() {
      return state;
    },
    get pending() {
      return [...perBrowser.values()].reduce((n, s) => n + (s.current ? 1 : 0) + s.queue.length, 0);
    },
  };
})();
