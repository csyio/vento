"use strict";

// Session restore (window side): extracts state from the tabs, brings it back on startup.
// Writing to disk and the on-quit save live in the window-independent `VentoSessionStore` module.
// Only the selected tab loads right away; the others sit in the tab strip with their title and load when selected
// (VentoTab.pending). Back/forward history and scroll position are not saved.

const { VentoSessionStore } = ChromeUtils.importESModule("resource:///modules/VentoSessionStore.sys.mjs");

Vento.session = new (class Session {
  #started = false;

  get path() {
    return VentoSessionStore.path;
  }

  read() {
    return VentoSessionStore.read();
  }

  flush() {
    return VentoSessionStore.flush();
  }

  /** Builds the state to save from the current tabs. */
  capture() {
    const saved = [];
    let selected = 0;
    for (const tab of Vento.tabs.all) {
      if (!VentoSessionStore.isSavable(tab.url)) {
        continue;
      }
      if (tab === Vento.tabs.selected) {
        selected = saved.length;
      }
      saved.push({ url: tab.url, title: (tab.title || "").slice(0, 200) });
    }
    return { selected, tabs: saved };
  }

  /**
   * Restores the loaded state into tabs. If `extra` (a command-line URL or array of URLs) is given, each opens in its own tab,
   * the last one selected. Returns false if no tab could be restored.
   */
  restore(state, extra = []) {
    if (!state?.tabs?.length) {
      return false;
    }
    const extras = [extra].flat().filter(Boolean);
    const sel = Math.min(Math.max(state.selected, 0), state.tabs.length - 1);
    state.tabs.forEach((t, i) => {
      Vento.tabs.open(t.url, { select: !extras.length && i === sel, lazy: { url: t.url, title: t.title } });
    });
    extras.forEach((url, i) => Vento.tabs.open(url, { select: i === extras.length - 1 }));
    return true;
  }

  /** Starts listening for changes; call AFTER the first tabs are set up. */
  start() {
    if (this.#started) {
      return;
    }
    this.#started = true;
    for (const ev of ["tabopen", "tabclose", "tabselect", "tabchange"]) {
      Vento.tabs.addEventListener(ev, () => this.#update());
    }
    this.#update();
  }

  #update() {
    // If no tabs are left (last tab closed = window/app is quitting) the previous state is kept;
    // the next launch brings that tab back (Firefox's "restore previous session" behavior).
    if (Vento.tabs.all.length) {
      VentoSessionStore.set(this.capture());
    }
  }
})();
