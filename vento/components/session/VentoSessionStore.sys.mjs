// Oturum deposu: sekme durumunu profilde `vento-session.json` olarak saklar.
//
// Neden pencereden ayrı bir modül: kapanış engelleyicisi (AsyncShutdown) pencere kapandıktan sonra çalışır;
// pencerenin küresel nesnesinde bekleyen promise'ler o zaman hiç çözülmez → uygulama kapanışta takılır.
// Bu modül pencereden bağımsız yaşar. Pencere yalnız `set()` ile son durumu bildirir.

import { AsyncShutdown } from "resource://gre/modules/AsyncShutdown.sys.mjs";
import { setTimeout, clearTimeout } from "resource://gre/modules/Timer.sys.mjs";

const VERSION = 1;
const SAVE_DELAY = 1500;
// Yalnız gerçek sayfalar saklanır/geri getirilir (hata sayfası, data:, javascript:, chrome: … asla)
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

  /** Diskten okur; bozuk/eksikse yedeğe bakar. Süzülmüş geçerli durum ya da null. */
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
          trace(`oturum okunamadı (${p}): ${e}`);
        }
      }
    }
    return null;
  }

  /** Son durumu bildirir ({selected, tabs:[{url,title}]}); kısa gecikmeyle diske yazılır. */
  set(state) {
    this.#snapshot = { version: VERSION, selected: state.selected, tabs: state.tabs };
    if (!this.#blockerAdded) {
      this.#blockerAdded = true;
      AsyncShutdown.profileBeforeChange.addBlocker("Vento: oturum kaydı", () => this.flush());
    }
    if (!this.#timer) {
      this.#timer = setTimeout(() => {
        this.#timer = null;
        this.#write();
      }, SAVE_DELAY);
    }
  }

  /** Bekleyen durumu hemen yazar; yazma bitince çözülür. */
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
    // Sıralı yazma; önceki dosya .bak olarak kalır (yazma yarıda kesilirse oradan okunur).
    this.#writing = this.#writing
      .then(() => IOUtils.writeJSON(this.#path, state, { tmpPath: this.#path + ".tmp", backupFile: this.#path + ".bak" }))
      .catch(e => trace(`oturum yazılamadı: ${e}`));
    return this.#writing;
  }
})();
