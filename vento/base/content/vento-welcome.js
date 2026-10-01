"use strict";

// İlk açılış (karşılama): dil → tanışma (Ebabil) → Esin açık/kapalı → otomatik güncelleme açık/kapalı → bitti.
// Her seçim ANINDA uygulanır (dil canlı değişir). "Atla" ve Esc akışı kapatır ve tamamlanmış sayar; hiçbir seçim geri alınmaz,
// hepsi başlangıç ekranındaki "Özelleştir" panelinden değiştirilebilir. Yalnız bir kez gösterilir (vento.welcome.completed).
//
// Tercihler: vento.welcome.completed, vento.esin.enabled, vento.esin.consented, app.update.auto, intl.locale.requested.

Vento.welcome = (() => {
  const PREF_DONE = "vento.welcome.completed";
  const STEPS = ["lang", "hello", "esin", "update", "done"];
  const $ = id => document.getElementById(id);
  const els = {};
  let index = 0;
  let open = false;

  /** İşletim sistemi dili Türkçe ise tr, değilse en-US önerilir. */
  function systemLocale() {
    try {
      const os = Cc["@mozilla.org/intl/ospreferences;1"].getService(Ci.mozIOSPreferences).systemLocale;
      return /^tr\b/i.test(os) ? "tr" : "en-US";
    } catch (e) {
      return "tr";
    }
  }

  const section = name => els.card.querySelector(`.w-step[data-step="${name}"]`);

  function markChoices(root, attr, value) {
    for (const b of root.querySelectorAll(`[data-${attr}]`)) {
      b.setAttribute("aria-pressed", String(b.dataset[attr] === value));
    }
  }

  function setPose() {
    // Esin kapalıyken uyuyan Ebabil, aksi hâlde uçan
    const sleeping = STEPS[index] === "esin" && !Services.prefs.getBoolPref("vento.esin.enabled", true);
    els.img.src = sleeping ? "chrome://vento/content/art/pose-idle.webp" : "chrome://vento/content/ebabil/still.webp";
  }

  function render() {
    const name = STEPS[index];
    for (const s of els.card.querySelectorAll(".w-step")) {
      const on = s.dataset.step === name;
      if (on && s.hidden) {
        s.hidden = false;
        Vento.motion.enter(s, "pop");
      } else if (!on) {
        s.hidden = true;
      }
    }
    [...els.dots.children].forEach((d, i) => d.toggleAttribute("on", i === index));
    document.l10n.setAttributes(els.next, index === STEPS.length - 1 ? "w-start" : "w-next");
    els.skip.hidden = index === STEPS.length - 1;
    els.card.setAttribute("aria-label", Vento.l10n.t("w-progress", { n: index + 1, total: STEPS.length }));
    setPose();
    (section(name).querySelector('.w-choice[aria-pressed="true"]') ?? els.next).focus();
  }

  function go(delta) {
    if (index + delta >= STEPS.length) {
      finish();
      return;
    }
    index = Math.max(0, index + delta);
    render();
  }

  function finish() {
    Services.prefs.setBoolPref(PREF_DONE, true);
    open = false;
    Vento.motion.hide(els.layer, "fade");
    Vento.ui?.focusBar?.();
  }

  function applyLocale(code) {
    Vento.l10n.setLocale(code);
    markChoices(section("lang"), "lang", code);
  }

  /** Karşılamayı gösterir (ilk açılışta shell çağırır; testler de doğrudan çağırır). */
  function show() {
    if (open) {
      return;
    }
    open = true;
    index = 0;
    els.dots.replaceChildren(...STEPS.map(() => document.createElement("i")));
    // Seçimlerin başlangıç durumu: dil sistemden, Esin ve güncelleme mevcut tercihten
    const code = Services.prefs.getStringPref("intl.locale.requested", "") === "en-US" ? "en-US" : systemLocale();
    applyLocale(code);
    markChoices(section("esin"), "esin", Services.prefs.getBoolPref("vento.esin.enabled", true) ? "on" : "off");
    markChoices(section("update"), "update", Services.prefs.getBoolPref("app.update.auto", true) ? "on" : "off");
    $("w-update-off-note").hidden = Services.prefs.getBoolPref("app.update.auto", true);
    for (const s of els.card.querySelectorAll(".w-step")) {
      s.hidden = true;
    }
    Vento.motion.show(els.layer, "fade");
    render();
  }

  function init() {
    Object.assign(els, {
      layer: $("welcome"),
      card: $("w-card"),
      img: $("w-eb-img"),
      next: $("w-next"),
      skip: $("w-skip"),
      dots: $("w-dots"),
    });
    els.next.addEventListener("click", () => go(1));
    els.skip.addEventListener("click", finish);

    section("lang").addEventListener("click", e => {
      const b = e.target.closest("[data-lang]");
      if (b) {
        applyLocale(b.dataset.lang);
      }
    });
    section("esin").addEventListener("click", e => {
      const b = e.target.closest("[data-esin]");
      if (!b) {
        return;
      }
      const on = b.dataset.esin === "on";
      Services.prefs.setBoolPref("vento.esin.enabled", on);
      if (on) {
        // Bu ekranda veri akışı (LLMTR → GreenPT) açıkça anlatıldı: onay burada alınmış olur
        Services.prefs.setBoolPref("vento.esin.consented", true);
      }
      markChoices(section("esin"), "esin", on ? "on" : "off");
      setPose();
    });
    section("update").addEventListener("click", e => {
      const b = e.target.closest("[data-update]");
      if (!b) {
        return;
      }
      const on = b.dataset.update === "on";
      Services.prefs.setBoolPref("app.update.auto", on);
      markChoices(section("update"), "update", on ? "on" : "off");
      $("w-update-off-note").hidden = on;
    });

    document.addEventListener("keydown", e => {
      if (!open) {
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        finish();
      } else if (e.key === "Enter" && !e.target.closest?.("button")) {
        e.preventDefault();
        go(1);
      }
    });
  }

  return {
    init,
    show,
    finish,
    next: () => go(1),
    get isOpen() {
      return open;
    },
    get step() {
      return STEPS[index];
    },
    get completed() {
      return Services.prefs.getBoolPref(PREF_DONE, false);
    },
  };
})();
