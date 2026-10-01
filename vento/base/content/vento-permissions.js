"use strict";

// Site permissions: location, notifications, camera, microphone... When a page asks for a permission, a card appears at the top left of the page card.
// NOT modal (the page keeps running). The card is bound to the TAB: a background tab's request stays hidden until that tab
// is selected; if the tab closes or navigates to another site, the request is denied. A request is never left hanging.
// "Remember" is OFF by default (privacy first); if checked, the decision is stored persistently in the permission manager.

Vento.permissions = (() => {
  const $ = id => document.getElementById(id);
  const els = {};
  /** browser -> { current: entry|null, queue: entry[] } */
  const perBrowser = new Map();
  const state = { shown: null, autoAnswered: [] };

  const PM = Services.perms;

  /** Permission type -> Fluent id ("... wants to: <part>") */
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

  // ---- Stored decisions ---------------------------------------------------------------------------

  /** "allow" | "deny" | null (should ask) */
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

  /** Types that can be granted "just this once": if remember is unchecked they are NEVER stored (the site asks again next time). */
  const ONE_TIME_KINDS = new Set(["camera", "microphone", "geolocation"]);

  /**
   * Writes the decision to the permission manager. Persistent if remember is checked. Otherwise: stateful types (notifications etc.)
   * are kept for the session, or the page can't see Notification.permission as "denied" (it sees "default" and
   * asks again on every load); one-shot types (camera, microphone, location) are not stored.
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

  // ---- Request entry points ----------------------------------------------------------------------

  /** nsIContentPermissionRequest (location, notifications, ...), comes from VentoPermissionPrompt. */
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

  /** Camera/microphone (from VentoMediaParent). */
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

  // ---- Queue ---------------------------------------------------------------------------------------

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
    // sync() removes the visible card (so it stays in place while the container fades); a hidden card goes immediately.
    if (entry !== state.shown) {
      entry.ui?.card.remove();
    }
    try {
      entry.answer(allow, devices);
    } catch (e) {
      // When the tab/page is gone the request is already invalid (cancel() throws): expected, skip quietly
      if (!aborted) {
        Vento.trace(`could not deliver permission answer: ${e}`);
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

  // ---- Card -----------------------------------------------------------------------------------------

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
      // Exit: the card stays in place while the container fades; removed when it finishes
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
    // If we navigated to another site, the old site's pending requests are denied
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
