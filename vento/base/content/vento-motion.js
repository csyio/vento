"use strict";

// Hareket sistemi: Vento'da açılıp kapanan her şey buradan geçer, böylece süre/eğri/"hareketi azalt" tek yerde.
//
// İlkeler
//  - Giriş yavaşça-durur (ease-out), çıkış hızlanarak-gider (ease-in) ve girişten KISA: kullanıcı beklemez.
//  - Yalnız opacity + transform (GPU'da, sayfayı yeniden boyutlandırmaz). İstisna: sekme şeridi (30 px'lik küçük ağaç).
//  - `prefers-reduced-motion`: konum/ölçek hareketi kalkar, yalnız çok kısa solma kalır (bilgi "belirir", sıçramaz).
//  - `hidden` niteliği MANTIKSAL durumdur: girişte hemen kalkar, çıkışta animasyon BİTİNCE konur. Çıkış sürerken öğe
//    `closing` niteliği taşır; "açık mı?" sorusu için isShown() kullanılır (hidden'a doğrudan bakılmaz).
//  - Çıkış sürerken yeniden show() çağrılırsa çıkış iptal olur ve öğe takılı kalmaz (yarış güvenli).

Vento.motion = (() => {
  const EASE_OUT = "cubic-bezier(0.22, 0.8, 0.3, 1)";
  const EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";
  const REDUCED_MS = 90;

  // [başlangıç durumu] → doğal durum. Çıkış bunun tersi (daha kısa süre, ease-in).
  const PRESETS = {
    pop: { from: { opacity: 0, transform: "translateY(8px) scale(0.97)" }, to: { opacity: 0, transform: "translateY(4px) scale(0.98)" }, enter: 190, exit: 130 },
    drop: { from: { opacity: 0, transform: "translateY(-6px) scale(0.98)" }, to: { opacity: 0, transform: "translateY(-4px) scale(0.99)" }, enter: 170, exit: 120 },
    bar: { from: { opacity: 0, transform: "translateY(-10px) scale(0.98)" }, to: { opacity: 0, transform: "translateY(-6px) scale(0.98)" }, enter: 180, exit: 120 },
    side: { from: { opacity: 0, transform: "translateX(20px)" }, to: { opacity: 0, transform: "translateX(12px)" }, enter: 230, exit: 140 },
    fade: { from: { opacity: 0 }, to: { opacity: 0 }, enter: 160, exit: 120 },
  };

  const states = new WeakMap();
  const stateOf = el => {
    let s = states.get(el);
    if (!s) {
      s = { token: 0, anim: null, done: null, settle: null };
      states.set(el, s);
    }
    return s;
  };

  const api = {
    /** Test düzeneği: true → "hareketi azalt" gibi davranır. */
    reducedOverride: null,

    get reduced() {
      return api.reducedOverride ?? window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    },

    PRESETS,

    /** Öğe görünür (ve kapanmıyor) mu? `hidden`a doğrudan bakmak yerine bunu kullan. */
    isShown(el) {
      return !el.hidden && !el.hasAttribute("closing");
    },

    /** Kareler + süre. Hareket azaltılmışsa yalnız opacity. */
    frames(preset, dir) {
      const p = PRESETS[preset] ?? PRESETS.pop;
      const edge = dir === "in" ? p.from : p.to;
      const ms = dir === "in" ? p.enter : p.exit;
      if (api.reduced) {
        return { keyframes: [{ opacity: edge.opacity ?? 0 }, { opacity: 1 }], duration: REDUCED_MS };
      }
      return { keyframes: [edge, { opacity: 1, transform: "none" }], duration: ms };
    },

    /** Öğeyi gösterir (zaten açıksa dokunmaz). `inner` verilirse o öğe ayrıca giriş yapar (ör. katmanın içindeki kart). */
    show(el, preset = "pop") {
      const s = stateOf(el);
      const wasClosing = el.hasAttribute("closing");
      const wasHidden = el.hidden;
      s.token++; // bekleyen çıkışın sonunu geçersiz kıl
      s.anim?.cancel();
      s.anim = null;
      s.settle?.();
      el.removeAttribute("closing");
      el.hidden = false;
      if (!wasHidden && !wasClosing) {
        return;
      }
      const { keyframes, duration } = api.frames(preset, "in");
      s.anim = el.animate(keyframes, { duration, easing: EASE_OUT });
    },

    /** Öğeyi gizler; animasyon bitince `hidden` konur. Bitince çözülen söz döner. */
    hide(el, preset = "pop") {
      const s = stateOf(el);
      if (el.hidden) {
        return Promise.resolve();
      }
      if (el.hasAttribute("closing")) {
        return s.done ?? Promise.resolve();
      }
      const token = ++s.token;
      el.setAttribute("closing", "");
      const { keyframes, duration } = api.frames(preset, "out");
      const anim = el.animate(keyframes.toReversed(), { duration, easing: EASE_IN, fill: "forwards" });
      // keyframes.toReversed(): [doğal, çıkış kenarı] — giriş karelerinin tersi
      s.anim = anim;
      s.done = new Promise(resolve => {
        let over = false;
        const finish = () => {
          if (over) {
            return;
          }
          over = true;
          clearTimeout(timer);
          if (s.token === token) {
            anim.cancel(); // fill:forwards kalıntısı kalmasın
            el.removeAttribute("closing");
            el.hidden = true;
            s.anim = null;
          }
          resolve();
        };
        s.settle = finish;
        anim.finished.then(finish, () => {});
        // Güvence: animasyon hiç ilerlemezse (gizli belge, arka plan) öğe yine de kapanır
        const timer = setTimeout(finish, duration + 150);
      });
      return s.done;
    },

    set(el, visible, preset) {
      if (visible) {
        api.show(el, preset);
        return Promise.resolve();
      }
      return api.hide(el, preset);
    },

    /** Yalnız giriş animasyonu (öğe zaten DOM'da, ör. kart). */
    enter(el, preset = "pop") {
      const { keyframes, duration } = api.frames(preset, "in");
      return el.animate(keyframes, { duration, easing: EASE_OUT });
    },
  };
  return api;
})();
