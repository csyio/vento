"use strict";

// Esin: sayfayı okuyup soru cevaplayan yerleşik asistan (tek sayfa + birden çok sekme).
//
// Sağlayıcıdan bağımsız: OpenAI uyumlu /chat/completions + akış. Varsayılan uç nokta Vento vekilidir
// (anahtar yalnızca sunucuda). Gizlilik: sayfa metni YALNIZCA kullanıcı bir soru gönderdiğinde ve o sekme
// bağlama eklenmişse gönderilir; neyin gönderildiği mesajın altında görünür.

Vento.esin = (() => {
  const PREF_ENDPOINT = "vento.esin.endpoint";
  const PREF_CONSENT = "vento.esin.consented";
  // Kullanıcının seçtiği model ("" = vekilin varsayılanı: greenpt/gpt-oss-120b-eu). Yalnız bilinen modeller gönderilir.
  const PREF_MODEL = "vento.esin.model";
  const MODELS = ["greenpt/gpt-oss-120b-eu", "qwen/qwen3.6-35b-a3b", "qwen/qwen3.6-flash"];
  const chosenModel = () => {
    const m = Services.prefs.getStringPref(PREF_MODEL, "");
    return MODELS.includes(m) ? m : "";
  };
  const PREF_ENABLED = "vento.esin.enabled"; // kapalıyken düğme/öneri/panel yok ve hiçbir şey gönderilmez
  const PAGE_CHARS = 20000; // sayfa başına (~5k jeton)
  const MAX_TABS = 5;
  const KEEP_MESSAGES = 16; // geçmişte tutulan son mesaj sayısı

  // Sistem istemi Fluent'te (esin-system): dile göre; "cevabı kullanıcının yazdığı dilde ver" kuralı ikisinde de var.
  const systemPrompt = () => Vento.l10n.t("esin-system");

  const $ = id => document.getElementById(id);
  const els = {};
  const state = { open: false, busy: false, follow: true, attached: [], history: [], abort: null, pending: null, quota: null };

  class EsinError extends Error {
    constructor(message, { noRetry = false } = {}) {
      super(message);
      this.noRetry = noRetry; // kota doluyken "tekrar dene" anlamsız
    }
  }

  const eligible = tab => !!tab && /^https?:\/\//i.test(tab.url);
  const consented = () => Services.prefs.getBoolPref(PREF_CONSENT, false);
  const enabled = () => Services.prefs.getBoolPref(PREF_ENABLED, true);

  /** Esin açık/kapalı durumunu arayüze yansıtır (kök öğede `esin-off`, komut devre dışı, açıksa panel kapanır). */
  function applyEnabled() {
    document.documentElement.toggleAttribute("esin-off", !enabled());
    $("cmd_toggleEsin")?.toggleAttribute("disabled", !enabled());
    if (!enabled() && state.open) {
      close();
    }
  }

  function endpoint() {
    const e = Services.env.exists("VENTO_ESIN_ENDPOINT")
      ? Services.env.get("VENTO_ESIN_ENDPOINT")
      : Services.prefs.getStringPref(PREF_ENDPOINT, "");
    return e.replace(/\/+$/, "");
  }

  function httpMessage(status) {
    switch (status) {
      case 429:
        return Vento.l10n.t("esin-err-busy");
      case 413:
        return Vento.l10n.t("esin-err-too-long");
      case 502:
      case 503:
        return Vento.l10n.t("esin-err-unavailable");
      default:
        return Vento.l10n.t("esin-err-generic", { status });
    }
  }

  // ---- Günlük kota (vekil sunucu: X-Esin-* başlıkları ve 429 kodları) ---------------------------

  /** Panelin altında "Bugün kalan: N / M"; bilinmiyorsa gizli. Az kalınca vurgulanır. */
  function showQuota(remaining, limit) {
    state.quota = { remaining, limit };
    const el = $("esin-quota");
    el.hidden = false;
    el.toggleAttribute("low", remaining <= 3);
    el.textContent = Vento.l10n.t("esin-quota", { left: remaining, limit });
  }

  function readQuota(res) {
    const limit = Number(res.headers.get("x-esin-limit"));
    const left = Number(res.headers.get("x-esin-remaining"));
    if (limit > 0 && Number.isFinite(left)) {
      showQuota(left, limit);
    }
  }

  /** 429: kota doluysa yenilenme zamanıyla söyler (kullanıcının saat dilimiyle), değilse genel yoğunluk iletisi. */
  async function rateLimitError(res) {
    let e = null;
    try {
      e = (await res.json())?.error;
    } catch {
      // gövde yok/bozuk
    }
    if (e?.code === "client_quota") {
      showQuota(0, e.limit ?? state.quota?.limit ?? 0);
      const when = e.resetAt
        ? new Date(e.resetAt).toLocaleString(Vento.l10n.locale, { weekday: "long", hour: "2-digit", minute: "2-digit" })
        : "";
      return new EsinError(Vento.l10n.t("esin-err-quota", { limit: e.limit ?? 0, when }), { noRetry: true });
    }
    if (e?.code === "global_quota") {
      return new EsinError(Vento.l10n.t("esin-err-global"), { noRetry: true });
    }
    return new EsinError(httpMessage(429));
  }

  // ---- Akış istemcisi (OpenAI uyumlu SSE) -------------------------------------------------------

  async function* streamChat(messages, signal) {
    let res;
    try {
      res = await fetch(`${endpoint()}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, stream: true, ...(chosenModel() && { model: chosenModel() }) }),
        signal,
      });
    } catch (e) {
      if (signal.aborted) {
        throw e;
      }
      throw new EsinError(Vento.l10n.t("esin-err-unreachable"));
    }
    if (res.status === 429) {
      throw await rateLimitError(res);
    }
    if (!res.ok) {
      throw new EsinError(httpMessage(res.status));
    }
    readQuota(res);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }
      buf += dec.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const evt = buf.slice(0, i);
        buf = buf.slice(i + 2);
        for (const line of evt.split("\n")) {
          if (!line.startsWith("data:")) {
            continue;
          }
          const data = line.slice(5).trim();
          if (data === "[DONE]") {
            return;
          }
          try {
            const delta = JSON.parse(data).choices?.[0]?.delta?.content;
            if (delta) {
              yield delta;
            }
          } catch {
            // yarım/bozuk olay: atla
          }
        }
      }
    }
  }

  // ---- Sayfa metni --------------------------------------------------------------------------------

  async function extract(tab) {
    if (!eligible(tab)) {
      return null;
    }
    try {
      const wg = tab.browser.browsingContext?.currentWindowGlobal;
      // Kendi aktörümüz: arka plan sekmelerinde de anında (bkz. VentoPageTextChild). Yoksa Firefox'unkine düş.
      let r;
      try {
        r = await wg.getActor("VentoPageText").sendQuery("VentoPageText:Get", { sufficientLength: PAGE_CHARS });
      } catch (e) {
        Vento.trace(`esin: VentoPageText yok/başarısız (${e}), PageExtractor'a düşülüyor`);
        r = await wg.getActor("PageExtractor").getText({ removeBoilerplate: true, sufficientLength: PAGE_CHARS });
      }
      const text = (r?.text ?? "").slice(0, PAGE_CHARS);
      return text ? { title: tab.label, url: tab.url, text } : null;
    } catch (e) {
      Vento.trace(`esin: sayfa metni alınamadı (${tab.url}): ${e}`);
      return null;
    }
  }

  const attr = s => String(s).replace(/["<>]/g, "'");

  function pageBlock(p) {
    // İçerik etiketi kapatıp kaçamasın
    const safe = p.text.replaceAll("</sayfa", "</ sayfa");
    return `<sayfa başlık="${attr(p.title)}" adres="${attr(p.url)}">\n${safe}\n</sayfa>`;
  }

  function buildMessages(question, pages) {
    const ctx = pages.length
      ? `${Vento.l10n.t("esin-pages-header")}\n\n${pages.map(pageBlock).join("\n\n")}\n\n`
      : "";
    return [
      { role: "system", content: systemPrompt() },
      ...state.history,
      { role: "user", content: `${ctx}Soru: ${question}` },
    ];
  }

  // ---- Arayüz ------------------------------------------------------------------------------------

  function letter(tab) {
    const m = /[\p{L}\p{N}]/u.exec(tab.host || tab.title || "");
    return m ? m[0] : "V";
  }

  function renderChips() {
    const chips = state.attached.map(tab => {
      const chip = document.createElement("span");
      chip.className = "chip";
      const mark = document.createElement("span");
      mark.className = "chip-mark";
      mark.textContent = letter(tab);
      const title = document.createElement("span");
      title.className = "chip-title";
      title.textContent = tab.label;
      const x = document.createElement("button");
      x.className = "chip-x";
      x.title = Vento.l10n.t("esin-chip-remove");
      x.textContent = "×";
      x.addEventListener("click", () => detach(tab));
      chip.append(mark, title, x);
      return chip;
    });
    els.chips.replaceChildren(...chips);
    els.add.hidden = state.attached.length >= MAX_TABS || !Vento.tabs.all.some(t => eligible(t) && !state.attached.includes(t));
    els.input.placeholder = Vento.l10n.t(state.attached.length ? "esin-input-placeholder-page" : "esin-input-placeholder");
    els.form.toggleAttribute("has-context", state.attached.length > 0);
  }

  function syncFollow() {
    if (!state.follow) {
      return;
    }
    const sel = Vento.tabs.selected;
    state.attached = eligible(sel) ? [sel] : [];
    renderChips();
  }

  function attach(tab) {
    if (!eligible(tab) || state.attached.includes(tab) || state.attached.length >= MAX_TABS) {
      return false;
    }
    state.follow = false;
    state.attached.push(tab);
    renderChips();
    return true;
  }

  function detach(tab) {
    state.follow = false;
    state.attached = state.attached.filter(t => t !== tab);
    renderChips();
  }

  function showMenu() {
    const candidates = Vento.tabs.all.filter(t => eligible(t) && !state.attached.includes(t));
    els.menu.replaceChildren(
      ...candidates.map(tab => {
        const b = document.createElement("button");
        b.className = "menu-item";
        b.textContent = tab.label;
        b.addEventListener("click", () => {
          Vento.motion.hide(els.menu, "drop");
          attach(tab);
        });
        return b;
      })
    );
    Vento.motion.set(els.menu, candidates.length > 0, "drop");
  }

  function scrollDown(force = false) {
    const t = els.thread;
    if (force || t.scrollHeight - t.scrollTop - t.clientHeight < 80) {
      t.scrollTop = t.scrollHeight;
    }
  }

  function addMessage(role, className = "") {
    els.empty.hidden = true;
    const el = document.createElement("div");
    el.className = `msg msg-${role} ${className}`.trim();
    const body = document.createElement("div");
    body.className = "msg-body";
    el.append(body);
    els.thread.append(el);
    scrollDown(true);
    return { el, body };
  }

  function setBusy(busy) {
    state.busy = busy;
    els.form.toggleAttribute("busy", busy);
    els.send.title = Vento.l10n.t(busy ? "esin-stop" : "esin-send");
  }

  function showConsent() {
    Vento.motion.show(els.consent, "pop");
    scrollDown(true);
  }

  function grantConsent() {
    Services.prefs.setBoolPref(PREF_CONSENT, true);
    Vento.motion.hide(els.consent, "pop");
    const q = state.pending;
    state.pending = null;
    if (q) {
      send(q);
    }
  }

  async function send(question) {
    question = (question ?? "").trim();
    if (!question || state.busy) {
      return;
    }
    if (!consented()) {
      state.pending = question;
      open();
      showConsent();
      return;
    }

    const attached = [...state.attached];
    const user = addMessage("user");
    user.body.textContent = question;
    const ctxRow = document.createElement("div");
    ctxRow.className = "msg-ctx";
    user.el.append(ctxRow);

    const bot = addMessage("assistant", "typing");
    bot.body.textContent = Vento.l10n.t(attached.length ? "esin-reading" : "esin-thinking");

    const ac = new AbortController();
    state.abort = ac;
    setBusy(true);
    els.input.value = "";
    autosize();

    let answer = "";
    const t0 = Date.now();
    try {
      const pages = (await Promise.all(attached.map(extract))).filter(Boolean);
      Vento.trace(`esin: ${pages.length}/${attached.length} sayfa okundu, ${Date.now() - t0} ms`);
      // Kullanıcı neyin gönderildiğini görsün.
      ctxRow.textContent = pages.length
        ? pages.map(p => Vento.l10n.t("esin-chars", { host: new URL(p.url).host.replace(/^www\./, ""), count: Vento.l10n.number(p.text.length) })).join("   ")
        : attached.length
          ? Vento.l10n.t("esin-unreadable")
          : "";
      if (ac.signal.aborted) {
        throw new DOMException("durduruldu", "AbortError");
      }
      bot.body.textContent = Vento.l10n.t("esin-thinking");

      let raf = 0;
      const paint = () => {
        raf = 0;
        Vento.markdown.render(answer, bot.body);
        scrollDown();
      };
      let first = true;
      for await (const delta of streamChat(buildMessages(question, pages), ac.signal)) {
        if (first) {
          first = false;
          Vento.trace(`esin: ilk parça ${Date.now() - t0} ms`);
        }
        answer += delta;
        bot.el.classList.remove("typing");
        raf ||= requestAnimationFrame(paint);
      }
      if (raf) {
        cancelAnimationFrame(raf);
      }
      bot.el.classList.remove("typing");
      if (!answer) {
        throw new EsinError(Vento.l10n.t("esin-err-empty"));
      }
      Vento.markdown.render(answer, bot.body);
      state.history.push({ role: "user", content: question }, { role: "assistant", content: answer });
      state.history = state.history.slice(-KEEP_MESSAGES);
    } catch (e) {
      bot.el.classList.remove("typing");
      if (e?.name === "AbortError") {
        if (answer) {
          Vento.markdown.render(answer, bot.body);
          const note = document.createElement("div");
          note.className = "msg-note";
          note.textContent = Vento.l10n.t("esin-stopped");
          bot.el.append(note);
          state.history.push({ role: "user", content: question }, { role: "assistant", content: answer });
          state.history = state.history.slice(-KEEP_MESSAGES);
        } else {
          bot.el.remove();
          user.el.remove();
          els.input.value = question;
          autosize();
        }
      } else {
        bot.el.classList.add("msg-error");
        bot.body.textContent = e instanceof EsinError ? e.message : Vento.l10n.t("esin-unexpected");
        Vento.trace(`esin: hata: ${e}`);
        if (!(e instanceof EsinError && e.noRetry)) {
          const retry = document.createElement("button");
          retry.className = "msg-retry";
          retry.textContent = Vento.l10n.t("esin-retry");
          retry.addEventListener("click", () => {
            user.el.remove();
            bot.el.remove();
            send(question);
          });
          bot.el.append(retry);
        }
      }
    } finally {
      state.abort = null;
      setBusy(false);
      scrollDown();
    }
  }

  function stop() {
    state.abort?.abort();
  }

  function autosize() {
    els.input.style.height = "auto";
    els.input.style.height = `${Math.min(els.input.scrollHeight, 132)}px`;
  }

  function open() {
    state.open = true;
    Vento.motion.show(els.panel, "side");
    $("nav-esin").toggleAttribute("active", true);
    syncFollow();
    if (!consented() && state.pending === null && !state.history.length) {
      // Onay kartı ilk kullanımda sohbetin en üstünde görünür
      showConsent();
    }
  }

  function close() {
    state.open = false;
    Vento.motion.hide(els.panel, "side");
    $("nav-esin").toggleAttribute("active", false);
    Vento.ui.focusPage();
  }

  function toggle() {
    if (!enabled()) {
      return;
    }
    if (state.open) {
      close();
    } else {
      open();
      els.input.focus();
    }
  }

  /** Akıllı çubuktan: soruyu Esin'e sorar. Açık sayfa (varsa) bağlam olur. */
  function ask(question) {
    if (!enabled()) {
      return Promise.resolve(); // kapalıyken sormak sayfa içeriği göndermez
    }
    open();
    state.follow = true;
    syncFollow();
    return send(question);
  }

  function clearChat() {
    stop();
    state.history = [];
    els.thread.querySelectorAll(".msg").forEach(m => m.remove());
    els.empty.hidden = false;
  }

  function init() {
    Object.assign(els, {
      panel: $("esin"),
      thread: $("esin-thread"),
      empty: $("esin-empty"),
      consent: $("esin-consent"),
      chips: $("esin-chips"),
      add: $("esin-add"),
      menu: $("esin-menu"),
      form: $("esin-form"),
      input: $("esin-input"),
      send: $("esin-send"),
    });

    applyEnabled();
    const prefObserver = { observe: () => applyEnabled() };
    Services.prefs.addObserver(PREF_ENABLED, prefObserver);
    window.addEventListener("unload", () => Services.prefs.removeObserver(PREF_ENABLED, prefObserver), { once: true });
    setBusy(false); // gönder düğmesinin ipucunu ilk kez yazar
    renderChips();  // girdi yer tutucusu
    Vento.l10n.addEventListener("change", () => {
      setBusy(state.busy);
      renderChips();
    });
    $("nav-esin").addEventListener("click", toggle);
    $("esin-close").addEventListener("click", close);
    $("esin-clear").addEventListener("click", clearChat);
    $("esin-consent-ok").addEventListener("click", grantConsent);
    els.add.addEventListener("click", () => (!Vento.motion.isShown(els.menu) ? showMenu() : Vento.motion.hide(els.menu, "drop")));

    // Enter (form gönderimi) yalnızca yeni soru gönderir; yanıt akarken hiçbir şey yapmaz.
    // Durdurmak için yalnızca durdur düğmesi (aynı yerdeki gönder düğmesi) kullanılır.
    els.form.addEventListener("submit", e => {
      e.preventDefault();
      if (!state.busy) {
        send(els.input.value);
      }
    });
    els.send.addEventListener("click", e => {
      if (state.busy) {
        e.preventDefault();
        stop();
      }
    });
    els.input.addEventListener("input", autosize);
    els.input.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        els.form.requestSubmit();
      } else if (e.key === "Escape") {
        close();
      }
    });
    // Hazır sorular: metin Fluent kimliğinden (data-q-id) TIKLANDIĞI ANDA çözülür → her zaman güncel dilde
    const llmtr = $("esin-llmtr");
    const openLlmtr = () => Vento.tabs.open("https://llmtr.com", { select: true, afterCurrent: true });
    llmtr.addEventListener("click", openLlmtr);
    llmtr.addEventListener("keydown", e => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), openLlmtr()));
    els.empty.querySelectorAll("[data-q-id]").forEach(b => b.addEventListener("click", () => send(Vento.l10n.t(b.dataset.qId))));
    els.thread.addEventListener("click", e => {
      const a = e.target.closest?.("a.md-link");
      if (a) {
        e.preventDefault();
        Vento.tabs.open(a.dataset.href, { afterCurrent: true });
      }
    });

    const t = Vento.tabs;
    t.addEventListener("tabselect", syncFollow);
    t.addEventListener("tabopen", () => renderChips());
    t.addEventListener("tabclose", e => {
      state.attached = state.attached.filter(x => x !== e.detail.tab);
      renderChips();
    });
    t.addEventListener("tabchange", e => {
      if (e.detail.tab === t.selected) {
        syncFollow();
      } else if (state.attached.includes(e.detail.tab)) {
        renderChips();
      }
    });
    renderChips();
  }

  return {
    init,
    open,
    close,
    toggle,
    ask,
    send,
    get enabled() {
      return enabled();
    },
    get model() {
      return chosenModel();
    },
    MODELS,
    stop,
    attach,
    detach,
    grantConsent,
    clearChat,
    get state() {
      return state;
    },
  };
})();
