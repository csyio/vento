// Session store: keeps tab state in the profile as `vento-session.json`.
//
// Why a separate module from the window: the shutdown blocker (AsyncShutdown) runs after the window has closed;
// promises pending on the window's global never resolve by then, so the app hangs on quit.
// This module lives independently of the window. The window only reports the latest state via `set()`.

import { AsyncShutdown } from "resource://gre/modules/AsyncShutdown.sys.mjs";
import { setTimeout, clearTimeout } from "resource://gre/modules/Timer.sys.mjs";

const VERSION = 1;
const SAVE_DELAY = 1500;
// Only real pages are saved/restored (never error pages, data:, javascript:, chrome: ...)
const SAVABLE = /^(https?|file):/i;

const trace = msg => {
  dump(`VENTO: ${msg}\n`);
  if (Services.env.exists("VENTO_TRACE")) {
    IOUtils.writeUTF8(Services.env.get("VENTO_TRACE"), `${msg}\n`, { mode: "appendOrCreate" }).catch(() => {});
  }
};

export const VentoSessionStore = new (class {
  #path = PathUtils.join(PathUtils.profileDir, "vento-session.json");
  #snapshot = null;
  #timer = null;
  #writing = Promise.resolve();
  #blockerAdded = false;

  get path() {
    return this.#path;
  }

  isSavable(url) {
    return typeof url === "string" && SAVABLE.test(url);
  }

  /** Reads from disk; if corrupt or missing, tries the backup. Returns the filtered valid state or null. */
  async read() {
    for (const p of [this.#path, this.#path + ".bak"]) {
      try {
        const data = await IOUtils.readJSON(p);
        if (data?.version === VERSION && Array.isArray(data.tabs)) {
          return {
            selected: Number.isInteger(data.selected) ? data.selected : 0,
            tabs: data.tabs
              .filter(t => this.isSavable(t?.url))
              .map(t => ({ url: t.url, title: typeof t.title === "string" ? t.title.slice(0, 200) : "" })),
          };
        }
      } catch (e) {
        if (!DOMException.isInstance(e) || e.name !== "NotFoundError") {
          trace(`could not read session (${p}): ${e}`);
        }
      }
    }
    return null;
  }

  /** Reports the latest state ({selected, tabs:[{url,title}]}); written to disk after a short delay. */
  set(state) {
    this.#snapshot = { version: VERSION, selected: state.selected, tabs: state.tabs };
    if (!this.#blockerAdded) {
      this.#blockerAdded = true;
      AsyncShutdown.profileBeforeChange.addBlocker("Vento: session save", () => this.flush());
    }
    if (!this.#timer) {
      this.#timer = setTimeout(() => {
        this.#timer = null;
        this.#write();
      }, SAVE_DELAY);
    }
  }

  /** Writes the pending state immediately; resolves when the write finishes. */
  flush() {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    return this.#write();
  }

  #write() {
    const state = this.#snapshot;
    if (!state) {
      return this.#writing;
    }
    // Sequential writes; the previous file is kept as .bak (read from there if a write is interrupted).
    this.#writing = this.#writing
      .then(() => IOUtils.writeJSON(this.#path, state, { tmpPath: this.#path + ".tmp", backupFile: this.#path + ".bak" }))
      .catch(e => trace(`could not write session: ${e}`));
    return this.#writing;
  }
})();
