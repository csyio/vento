"use strict";

// Motion system: everything that opens or closes in Vento goes through here, so duration, easing and "reduce motion" live in one place.
//
// Principles
//  - Enter decelerates (ease-out), exit accelerates (ease-in) and is SHORTER than enter: the user shouldn't wait.
//  - Only opacity + transform (GPU, no relayout). Exception: the tab strip (a small 30 px tree).
//  - `prefers-reduced-motion`: position/scale motion is dropped, only a very short fade stays (content "appears", doesn't jump).
//  - `hidden` is the LOGICAL state: removed immediately on enter, set only when the exit animation FINISHES. While exiting, the element
//    carries a `closing` attribute; use isShown() to ask "is it open?" (don't read hidden directly).
//  - If show() is called during an exit, the exit is cancelled and the element doesn't get stuck (race-safe).

Vento.motion = (() => {
  const EASE_OUT = "cubic-bezier(0.22, 0.8, 0.3, 1)";
  const EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";
  const REDUCED_MS = 90;

  // [start state] -> natural state. Exit is the reverse (shorter, ease-in).
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
    /** Test hook: true -> behave as if "reduce motion" is on. */
    reducedOverride: null,

    get reduced() {
      return api.reducedOverride ?? window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    },

    PRESETS,

    /** Is the element visible (and not closing)? Use this instead of reading `hidden` directly. */
    isShown(el) {
      return !el.hidden && !el.hasAttribute("closing");
    },

    /** Keyframes + duration. With reduced motion, opacity only. */
    frames(preset, dir) {
      const p = PRESETS[preset] ?? PRESETS.pop;
      const edge = dir === "in" ? p.from : p.to;
      const ms = dir === "in" ? p.enter : p.exit;
      if (api.reduced) {
        return { keyframes: [{ opacity: edge.opacity ?? 0 }, { opacity: 1 }], duration: REDUCED_MS };
      }
      return { keyframes: [edge, { opacity: 1, transform: "none" }], duration: ms };
    },

    /** Shows the element (no-op if already open). If `inner` is given, it also animates in separately (e.g. the card inside a layer). */
    show(el, preset = "pop") {
      const s = stateOf(el);
      const wasClosing = el.hasAttribute("closing");
      const wasHidden = el.hidden;
      s.token++; // invalidate the end of any pending exit
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

    /** Hides the element; `hidden` is set when the animation ends. Returns a promise that resolves when done. */
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
      // keyframes.toReversed(): [natural, exit edge], the reverse of the enter frames
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
            anim.cancel(); // don't leave fill:forwards residue
            el.removeAttribute("closing");
            el.hidden = true;
            s.anim = null;
          }
          resolve();
        };
        s.settle = finish;
        anim.finished.then(finish, () => {});
        // Safety net: if the animation never progresses (hidden document, background), the element still closes
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

    /** Enter animation only (element is already in the DOM, e.g. a card). */
    enter(el, preset = "pop") {
      const { keyframes, duration } = api.frames(preset, "in");
      return el.animate(keyframes, { duration, easing: EASE_OUT });
    },
  };
  return api;
})();
