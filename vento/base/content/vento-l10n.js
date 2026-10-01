"use strict";

// Vento UI strings (Fluent): vento/locales/{en-US,tr}/vento.ftl.
//  - In XHTML:  data-l10n-id="id"  (document.l10n refreshes itself when the language changes)
//  - In JS:     Vento.l10n.t("id", { var })  — uses the current language on every call
//  - Rule: don't write plain text in code; add it to both .ftl files under the same id (the self-test checks the id sets are equal and
//    that every id used in code exists).
// Language choice: the `intl.locale.requested` pref (tr / en-US). A "change" event is fired when it changes; modules that show
// JS-built text (e.g. tab titles) listen and re-render.

var Vento = (window.Vento = window.Vento || {});

Vento.l10n = new (class L10n extends EventTarget {
  static FILES = ["vento/vento.ftl"];
  #loc = null;
  #missing = new Set();
  #used = new Set();

  constructor() {
    super();
    const observer = {
      observe: () => {
        this.#loc = null; // rebuilt for the new language
        this.dispatchEvent(new Event("change"));
      },
    };
    Services.obs.addObserver(observer, "intl:app-locales-changed");
    window.addEventListener("unload", () => Services.obs.removeObserver(observer, "intl:app-locales-changed"), { once: true });
  }

  /** Current app language (BCP47): "tr", "en-US". */
  get locale() {
    return Services.locale.appLocaleAsBCP47;
  }

  /** Text for an id; if not found, the ID ITSELF is returned and recorded in `missing` (the self-test catches this). */
  t(id, args) {
    this.#used.add(id);
    this.#loc ??= new Localization(L10n.FILES, true);
    const value = this.#loc.formatValueSync(id, args);
    if (value === null || value === undefined) {
      this.#missing.add(id);
      return id;
    }
    return value;
  }

  /** Attribute text (e.g. `.title`) of a message that has only attributes; if missing, returns the id and records it in `missing`. */
  attr(id, name = "title") {
    this.#used.add(id);
    this.#loc ??= new Localization(L10n.FILES, true);
    const [msg] = this.#loc.formatMessagesSync([{ id }]);
    const value = msg?.attributes?.find(a => a.name === name)?.value;
    if (value === undefined) {
      this.#missing.add(id);
      return id;
    }
    return value;
  }

  /** Formats a number for the current language. */
  number(n, options) {
    return n.toLocaleString(this.locale, options);
  }

  /** Changes the language (tr | en-US). Static text updates immediately, JS-built text via the "change" event. */
  setLocale(locale) {
    Services.prefs.setStringPref("intl.locale.requested", locale);
  }

  get missing() {
    return [...this.#missing];
  }

  get used() {
    return [...this.#used];
  }
})();
