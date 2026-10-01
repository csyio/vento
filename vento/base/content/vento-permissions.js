"use strict";

// Site izinleri: konum, bildirim, kamera, mikrofon… Sayfa izin isteyince sayfa kartının sol üstünde bir kart çıkar.
// Modal DEĞİL (sayfa çalışmaya devam eder). Kart SEKMEYE bağlıdır: arka plan sekmesinin isteği o sekme seçilene
// kadar görünmez; sekme kapanır ya da başka siteye gidilirse istek reddedilir. İstek asla askıda bırakılmaz.
// "Hatırla" varsayılan KAPALI (gizlilik öncelikli); işaretlenirse karar izin yöneticisinde kalıcı saklanır.

Vento.permissions = (() => {
  const $ = id => document.getElementById(id);
  const els = {};
  /** browser → { current: entry|null, queue: entry[] } */
  const perBrowser = new Map();
  const state = { shown: null, autoAnswered: [] };

  const PM = Services.perms;

  /** İzin türü → Fluent kimliği ("… şunu yapmak istiyor: <parça>") */
  const WHAT = {
    geolocation: "perm-geolocation",
    "desktop-notification": "perm-notification",
    "persistent-storage": "perm-persistent-storage",
    "storage-access": "perm-storage-access",
    midi: "perm-midi",
    "midi-sysex": "perm-midi-sysex",
    xr: "perm-xr",
    camera: "perm-camera",
    microphone: "perm-microphone",
    "autoplay-media": "perm-autoplay",
  };

  function describe(kinds) {
    const L = (id, args) => Vento.l10n.t(id, args);
    const media = kinds.filter(k => k === "camera" || k === "microphone");
    const others = kinds.filter(k => !media.includes(k));
    const parts = [];
    if (media.length === 2) {
      parts.push(L("perm-camera-microphone"));
    } else if (media.length === 1) {
      parts.push(L(WHAT[media[0]]));
    }
    parts.push(...others.map(k => (WHAT[k] ? L(WHAT[k]) : L("perm-unknown", { kind: k }))));
    return parts.join(L("perm-join"));
  }

  const originOf = principal => {
    try {
      return principal.URI && /^https?$/.test(principal.URI.scheme) ? principal.URI.hostPort : principal.origin;
    } catch (e) {
      return "Bu site";
    }
  };

  // ---- Kayıtlı kararlar ---------------------------------------------------------------------------

  /** "allow" | "deny" | null (sormalı) */
  function saved(principal, kinds) {
    const results = kinds.map(k => PM.testExactPermissionFromPrincipal(principal, k));
    if (results.some(r => r === PM.DENY_ACTION)) {
      return "deny";
    }
    if (results.length && results.every(r => r === PM.ALLOW_ACTION)) {
      return "allow";
    }
    return null;
  }

  /** "Bu seferlik" verilebilen türler: hatırla işaretli değilse HİÇ saklanmaz (site bir dahaki sefere yine sorar). */
  const ONE_TIME_KINDS = new Set(["camera", "microphone", "geolocation"]);

  /**
   * Kararı izin yöneticisine yazar. Hatırla işaretliyse kalıcı. Değilse: durum tutan türler (bildirim vb.)
   * oturum boyunca saklanır — yoksa sayfa Notification.permission'ı "denied" göremez ("default" görür ve
   * her açılışta yeniden sorar); bir kerelik türler (kamera, mikrofon, konum) saklanmaz.
   */
  function store(principal, kinds, allow, permanent) {
    const action = allow ? PM.ALLOW_ACTION : PM.DENY_ACTION;
    for (const k of kinds) {
      if (permanent) {
        PM.addFromPrincipal(principal, k, action, PM.EXPIRE_NEVER);
      } else if (!ONE_TIME_KINDS.has(k)) {
        PM.addFromPrincipal(principal, k, action, PM.EXPIRE_SESSION);
      }
    }
  }

  // ---- İstek girişleri ----------------------------------------------------------------------------

  /** nsIContentPermissionRequest (konum, bildirim, …) — VentoPermissionPrompt'tan gelir. */
  function request(req) {
    const browser = req.element;
    const principal = req.principal;
    const kinds = [...req.types.enumerate(Ci.nsIContentPermissionType)].map(t => t.type);
    const prior = saved(principal, kinds);
    if (prior) {
      state.autoAnswered.push({ kinds, decision: prior });
      prior === "allow" ? req.allow({}) : req.cancel();
      return;
    }
    enqueue({
      browser,
      principal,
      kinds,
      origin: principal.originNoSuffix,
      actor: null,
      answer: allow => (allow ? req.allow({}) : req.cancel()),
    });
  }

  /** Kamera/mikrofon (VentoMediaParent'tan). */
  function requestMedia({ browser, principal, data, actor, respond }) {
    const kinds = [];
    if (data.videoInputDevices.length) {
      kinds.push("camera");
    }
    if (data.audioInputDevices.length) {
      kinds.push("microphone");
    }
    const firstDevices = () => [data.videoInputDevices[0], data.audioInputDevices[0]].filter(Boolean).map(d => d.deviceIndex);
    const prior = saved(principal, kinds);
    if (prior) {
      state.autoAnswered.push({ kinds, decision: prior });
      respond(prior === "allow" ? { allow: true, devices: firstDevices() } : { allow: false });
      return;
    }
    enqueue({
      browser,
      principal,
      kinds,
      origin: principal.originNoSuffix,
      actor,
      media: data,
      answer: (allow, devices) => respond(allow ? { allow: true, devices: devices ?? firstDevices() } : { allow: false }),
    });
  }

  // ---- Kuyruk ---------------------------------------------------------------------------------------

  function enqueue(entry) {
    let slot = perBrowser.get(entry.browser);
    if (!slot) {
      slot = { current: null, queue: [] };
      perBrowser.set(entry.browser, slot);
    }
    slot.queue.push(entry);
    slot.current ??= slot.queue.shift();
    sync();
  }

  function settle(entry, allow, devices, aborted = false) {
    if (entry.done) {
      return;
    }
    entry.done = true;
    if (entry.principal && entry.kinds && entry.ui) {
      store(entry.principal, entry.kinds, allow, entry.ui.remember.checked);
    }
    const slot = perBrowser.get(entry.browser);
    if (slot?.current === entry) {
      slot.current = slot.queue.shift() ?? null;
    } else if (slot) {
      slot.queue = slot.queue.filter(e => e !== entry);
    }
    if (slot && !slot.current && !slot.queue.length) {
      perBrowser.delete(entry.browser);
    }
    // Görünen kartı sync() kaldırır (kapsayıcı solarken yerinde kalsın); görünmeyen kart hemen gider.
    if (entry !== state.shown) {
      entry.ui?.card.remove();
    }
    try {
      entry.answer(allow, devices);
    } catch (e) {
      // Sekme/sayfa gidince istek zaten geçersizdir (cancel() hata verir): beklenen, sessiz geç
      if (!aborted) {
        Vento.trace(`izin cevabı iletilemedi: ${e}`);
      }
    }
    sync();
  }

  function abortWhere(pred) {
    for (const slot of [...perBrowser.values()]) {
      for (const e of [slot.current, ...slot.queue]) {
        if (e && pred(e)) {
          settle(e, false, undefined, true);
        }
      }
    }
  }

  // ---- Kart -----------------------------------------------------------------------------------------

  function selectFor(label, devices) {
    const wrap = document.createElement("label");
    wrap.className = "perm-field";
    wrap.append(label);
    const sel = document.createElement("select");
    sel.className = "perm-select";
    for (const d of devices) {
      const o = document.createElement("option");
      o.value = String(d.deviceIndex);
      o.textContent = d.name;
      sel.append(o);
    }
    wrap.append(sel);
    return { wrap, sel };
  }

  function build(entry) {
    const card = document.createElement("div");
    card.className = "perm-card";
    card.setAttribute("role", "alertdialog");

    const origin = document.createElement("div");
    origin.className = "perm-origin";
    origin.textContent = originOf(entry.principal);
    const text = document.createElement("div");
    text.className = "perm-text";
    text.textContent = Vento.l10n.t("perm-wants", { what: describe(entry.kinds) });
    card.append(origin, text);

    const selects = {};
    if (entry.media) {
      if (entry.media.videoInputDevices.length > 1) {
        const s = selectFor("Kamera", entry.media.videoInputDevices);
        selects.video = s.sel;
        card.append(s.wrap);
      }
      if (entry.media.audioInputDevices.length > 1) {
        const s = selectFor("Mikrofon", entry.media.audioInputDevices);
        selects.audio = s.sel;
        card.append(s.wrap);
      }
    }

    const rememberLabel = document.createElement("label");
    rememberLabel.className = "perm-remember";
    const remember = document.createElement("input");
    remember.type = "checkbox";
    rememberLabel.append(remember, Vento.l10n.t("perm-remember"));
    card.append(rememberLabel);

    const buttons = document.createElement("div");
    buttons.className = "perm-buttons";
    const block = document.createElement("button");
    block.className = "perm-btn perm-block";
    block.textContent = Vento.l10n.t("perm-block");
    const allow = document.createElement("button");
    allow.className = "perm-btn perm-allow";
    allow.textContent = Vento.l10n.t("perm-allow");
    allow.setAttribute("primary", "");
    buttons.append(block, allow);
    card.append(buttons);

    block.addEventListener("click", () => settle(entry, false));
    allow.addEventListener("click", () => {
      const devices = entry.media
        ? [
            selects.video ? Number(selects.video.value) : entry.media.videoInputDevices[0]?.deviceIndex,
            selects.audio ? Number(selects.audio.value) : entry.media.audioInputDevices[0]?.deviceIndex,
          ].filter(d => d !== undefined)
        : undefined;
      settle(entry, true, devices);
    });
    card.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        e.preventDefault();
        settle(entry, false);
      }
    });

    entry.ui = { card, remember };
  }

  function sync() {
    const browser = Vento.tabs.selected?.browser;
    const entry = perBrowser.get(browser)?.current ?? null;
    if (entry === state.shown && (!entry || entry.ui?.card.isConnected)) {
      Vento.motion.set(els.layer, !!entry, "drop");
      return;
    }
    const old = state.shown?.ui?.card;
    state.shown = entry;
    if (!entry) {
      // Çıkış: kart, kapsayıcı solarken yerinde kalır; bitince kaldırılır
      state.leaving = old ?? null;
      Vento.motion.hide(els.layer, "drop").then(() => {
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
    if (!entry.ui) {
      build(entry);
    }
    els.layer.append(entry.ui.card);
    Vento.motion.show(els.layer, "drop");
  }

  function init() {
    els.layer = $("perm-layer");
    Vento.tabs.addEventListener("tabselect", sync);
    Vento.tabs.addEventListener("tabclose", e => abortWhere(x => x.browser === e.detail.tab.browser));
    // Başka siteye gidildiyse eski sitenin bekleyen istekleri reddedilir
    Vento.tabs.addEventListener("tabchange", e => {
      let origin = "";
      try {
        origin = new URL(e.detail.tab.url).origin;
      } catch (err) {
        return;
      }
      abortWhere(x => x.browser === e.detail.tab.browser && x.origin && x.origin !== origin && origin !== "null");
    });
  }

  return {
    init,
    request,
    requestMedia,
    abortActor: actor => abortWhere(e => e.actor === actor),
    describe,
    get state() {
      return state;
    },
    get pending() {
      return [...perBrowser.values()].reduce((n, s) => n + (s.current ? 1 : 0) + s.queue.length, 0);
    },
  };
})();
