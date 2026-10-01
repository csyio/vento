"use strict";

// Vento arayüz metinleri (Fluent): vento/locales/{en-US,tr}/vento.ftl.
//  - XHTML'de:  data-l10n-id="kimlik"  (document.l10n dil değişince kendiliğinden yeniler)
//  - JS'te:     Vento.l10n.t("kimlik", { değişken })  — her çağrıda güncel dil
//  - Kural: kodun içine düz metin yazma; iki .ftl dosyasına da aynı kimlikle ekle (öz-test kimlik kümelerinin eşitliğini ve
//    kodda kullanılan her kimliğin var olduğunu doğrular).
// Dil seçimi: `intl.locale.requested` tercihi (tr / en-US). Değişince "change" olayı yayınlanır; JS ile kurulmuş metinleri
// (ör. sekme başlıkları) dinleyen modüller yeniden çizer.

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
        this.#loc = null; // yeni dil için yeniden kurulur
        this.dispatchEvent(new Event("change"));
      },
    };
    Services.obs.addObserver(observer, "intl:app-locales-changed");
    window.addEventListener("unload", () => Services.obs.removeObserver(observer, "intl:app-locales-changed"), { once: true });
  }

  /** Geçerli uygulama dili (BCP47): "tr", "en-US". */
  get locale() {
    return Services.locale.appLocaleAsBCP47;
  }

  /** Kimliğin metni; bulunamazsa KİMLİĞİN KENDİSİ döner ve `missing`e yazılır (öz-test bunu yakalar). */
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

  /** Yalnız öznitelikleri olan mesajın (ör. `.title`) öznitelik metni; yoksa kimlik döner ve `missing`e yazılır. */
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

  /** Sayıyı geçerli dile göre biçimler. */
  number(n, options) {
    return n.toLocaleString(this.locale, options);
  }

  /** Dili değiştirir (tr | en-US). Statik metinler hemen, JS ile kurulanlar "change" olayıyla yenilenir. */
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
