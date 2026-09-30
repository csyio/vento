"use strict";

// Oturum geri yükleme (pencere tarafı): sekmelerden durumu çıkarır, açılışta geri getirir.
// Diske yazma ve kapanış kaydı pencereden bağımsız `VentoSessionStore` modülündedir.
// Yalnız seçili sekme hemen yüklenir; diğerleri sekme şeridinde başlığıyla durur, seçilince yüklenir
// (VentoTab.pending). Geri/ileri geçmişi ve kaydırma konumu saklanmaz.

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

  /** Şimdiki sekmelerden saklanacak durumu üretir. */
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
   * Okunan durumu sekmelere döker. `extra` (komut satırı adresi ya da adres dizisi) verilirse hepsi ayrı sekmede açılır,
   * sonuncusu seçilir. Hiç sekme geri getirilemezse false döner.
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

  /** Değişiklikleri dinlemeye başlar; ilk sekmeler kurulduktan SONRA çağrılır. */
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
    // Sekme kalmadıysa (son sekme kapandı = pencere/uygulama kapanıyor) önceki durum korunur;
    // sonraki açılışta o sekme geri gelir (Firefox'un "önceki oturumu aç" davranışı).
    if (Vento.tabs.all.length) {
      VentoSessionStore.set(this.capture());
    }
  }
})();
