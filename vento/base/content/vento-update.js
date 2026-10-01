"use strict";

// Güncelleme arayüzü. Motor (toolkit UpdateService) güncellemeyi bulur/indirir/hazırlar; biz yalnız görünümü çizeriz.
//  - Otomatik AÇIK (app.update.auto): motor arka planda indirir + hazırlar → "update-downloaded/-staged" → çubuk: "yeniden başlat".
//  - Otomatik KAPALI: motor "update-available / show-prompt" der → çubuk: "İndir ve kur" (AppUpdater.allowUpdateDownload).
//  - "Özelleştir" panelindeki "Güncellemeleri denetle" → AppUpdater ile elle denetim; durum metni olay olarak yayınlanır.
//  - Güncelleme sonrası ilk açılışta sitedeki SÜRÜM NOTLARI sayfası otomatik açılır (bir kez; ilk kurulumda değil).
// Motor yapılandırması: mozconfig (--enable-updater, kanal "vento"), patches/0003 (MAR imza sertifikaları), 0004 (adres).

const { AppUpdater } = ChromeUtils.importESModule("resource://gre/modules/AppUpdater.sys.mjs");

Vento.update = new (class VentoUpdate extends EventTarget {
  // Tek adres; sunucuda site build'inin (site/build.mjs) ürettiği sayfalar. Yol değişirse YALNIZ burası.
  static RELEASE_NOTES = {
    tr: "https://vento.cansoykanyilmaz.com/surum-notlari/",
    en: "https://vento.cansoykanyilmaz.com/en/release-notes/",
  };
  static PREF_LAST = "vento.lastRunVersion";

  #updater = null;
  #els = {};
  status = { id: "idle", text: "" };

  /** Sürüm notları adresi (dile göre) + ?v=<sürüm>. */
  releaseNotesURL(version = Services.appinfo.version) {
    const base = VentoUpdate.RELEASE_NOTES[Vento.l10n.locale.startsWith("tr") ? "tr" : "en"];
    return `${base}?v=${encodeURIComponent(version)}`;
  }

  /**
   * Güncelleme sonrası ilk açılış mı? Son çalışan sürüm kayıtlıysa ve şimdikinden KÜÇÜKSE sürüm notlarını yeni sekmede açar.
   * İlk kurulumda (kayıt yok) ve aynı sürümde açmaz. Açtıysa URL'yi, açmadıysa null döner. Kaydı HER ZAMAN günceller.
   */
  afterUpdate({ last = Services.prefs.getStringPref(VentoUpdate.PREF_LAST, ""), current = Services.appinfo.version, open = true } = {}) {
    Services.prefs.setStringPref(VentoUpdate.PREF_LAST, current);
    if (!last || Services.vc.compare(last, current) >= 0) {
      return null;
    }
    const url = this.releaseNotesURL(current);
    if (open) {
      Vento.tabs.open(url, { select: true });
    }
    return url;
  }

  #set(id, key, args) {
    this.status = { id, text: key ? Vento.l10n.t(key, args) : "" };
    this.dispatchEvent(new CustomEvent("status", { detail: this.status }));
  }

  #showBar(kind) {
    const { bar, text, primary, later } = this.#els;
    text.textContent = Vento.l10n.t(kind === "ready" ? "ub-ready" : "ub-available");
    primary.textContent = Vento.l10n.t(kind === "ready" ? "ub-restart" : "ub-download");
    primary.dataset.kind = kind;
    Vento.motion.show(bar, "pop");
    return bar;
  }

  restart() {
    Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit | Ci.nsIAppStartup.eRestart);
  }

  #onStatus(status, a, b) {
    const S = AppUpdater.STATUS;
    switch (status) {
      case S.CHECKING:
        this.#set("checking", "up-checking");
        break;
      case S.NO_UPDATES_FOUND:
        this.#set("current", "up-current", { version: Services.appinfo.version });
        break;
      case S.DOWNLOAD_AND_INSTALL:
        this.#set("found", "up-found");
        this.#showBar("available");
        break;
      case S.DOWNLOADING:
      case S.STAGING: {
        const percent = status === S.STAGING ? 100 : b ? Math.round((a / b) * 100) : 0;
        this.#set("downloading", "up-downloading", { percent });
        break;
      }
      case S.READY_FOR_RESTART:
        this.#set("ready", "up-ready");
        this.#showBar("ready");
        break;
      case S.NO_UPDATER:
      case S.UPDATE_DISABLED_BY_POLICY:
      case S.UNSUPPORTED_SYSTEM:
      case S.MANUAL_UPDATE:
        this.#set("unavailable", "up-unavailable");
        break;
      case S.DOWNLOAD_FAILED:
      case S.CHECKING_FAILED:
      case S.INTERNAL_ERROR:
        this.#set("failed", "up-failed");
        break;
    }
  }

  /** Elle/arka plan denetimi: AppUpdater durumları arayüze yansıtılır. `updater` testler içindir (sahte). */
  check(updater = new AppUpdater()) {
    this.#updater?.stop?.();
    this.#updater = updater;
    updater.addListener((status, a, b) => this.#onStatus(status, a, b));
    return updater.check();
  }

  init() {
    const $ = id => document.getElementById(id);
    this.#els = { bar: $("update-bar"), text: $("ub-text"), primary: $("ub-primary"), later: $("ub-later") };
    this.#els.later.addEventListener("click", () => Vento.motion.hide(this.#els.bar, "pop"));
    this.#els.primary.addEventListener("click", () => {
      if (this.#els.primary.dataset.kind === "ready") {
        this.restart();
      } else {
        this.#updater?.allowUpdateDownload?.();
        Vento.motion.hide(this.#els.bar, "pop");
      }
    });
    // Dil değişince çubuk metni de yenilenir
    Vento.l10n.addEventListener("change", () => {
      if (!this.#els.bar.hidden) {
        this.#showBar(this.#els.primary.dataset.kind);
      }
    });
    const observer = {
      observe: (subject, topic, data) => {
        if (topic === "update-available" && data !== "show-prompt") {
          return; // yalnız "izin iste" durumu bizi ilgilendirir (otomatik kapalı)
        }
        this.check(); // durum makinesi sürer; çubuk READY_FOR_RESTART / DOWNLOAD_AND_INSTALL'da açılır
      },
    };
    for (const topic of ["update-available", "update-downloaded", "update-staged"]) {
      Services.obs.addObserver(observer, topic);
    }
    window.addEventListener("unload", () => {
      for (const topic of ["update-available", "update-downloaded", "update-staged"]) {
        Services.obs.removeObserver(observer, topic);
      }
    }, { once: true });
  }
})();
