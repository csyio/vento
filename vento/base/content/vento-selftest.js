"use strict";

// Öz-test: VENTO_SELFTEST=1 ile çalışır. Sonuçlar VENTO_TRACE dosyasına yazılır, sonra çıkılır.
// Gerçek ağ kullanır (example.com/org/net). `tools/selftest.sh` ile çalıştırılır.

(async () => {
  const results = [];
  const check = (name, ok, extra = "") => {
    results.push(!!ok);
    Vento.trace(`TEST ${ok ? "OK  " : "FAIL"} ${name}${extra ? "  → " + extra : ""}`);
  };
  const wait = async (fn, ms = 25000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try {
        if (await fn()) {
          return true;
        }
      } catch (e) {
        // koşul henüz hazır değil
      }
      await new Promise(r => setTimeout(r, 100));
    }
    return false;
  };

  try {
    const tabs = Vento.tabs;

    // -- pencere ve kabuk
    check("başlangıçta 1 sekme", tabs.all.length === 1, String(tabs.all.length));
    check("yerel menü kaynağı var", !!document.getElementById("main-menubar"));
    // Not: özel başlık çubuğunun gerçekten çizildiği başsız modda ölçülemez (outer-inner hep 0).
    // Yalnızca niteliğin varlığını sınarız; görsel doğrulama gözle yapılır.
    check("customtitlebar niteliği var", document.documentElement.getAttribute("customtitlebar") === "true");
    {
      const bb = document.querySelector(".titlebar-buttonbox").getBoundingClientRect();
      check("trafik ışıkları kutusu yer kaplıyor", bb.width > 40 && bb.height > 8, `${Math.round(bb.width)}x${Math.round(bb.height)} @${Math.round(bb.left)},${Math.round(bb.top)}`);
    }
    check("boş sekmede başlangıç görünümü", document.getElementById("stage").hasAttribute("blank"));

    // -- çözümleme (saf)
    check("çözümle: alan adı → https", Vento.resolveInput("example.com/x") === "https://example.com/x");
    check("çözümle: localhost → http", Vento.resolveInput("localhost:3000") === "http://localhost:3000");
    check("çözümle: arama", Vento.resolveInput("rüzgar nedir") === "https://duckduckgo.com/?q=r%C3%BCzgar%20nedir");
    check("çözümle: javascript: adres olmaz", !Vento.resolveInput("javascript:alert(1)").startsWith("javascript:"));
    check("çözümle: chrome: adres olmaz", !Vento.resolveInput("chrome://browser/content/x").startsWith("chrome:"));

    // -- gezinme
    const t1 = tabs.selected;
    tabs.navigate(t1, "example.com");
    check("t1 example.com yüklendi", await wait(() => t1.title === "Example Domain"), t1.title);
    check("t1 adresi https://example.com/", t1.url === "https://example.com/", t1.url);
    check("başlangıç görünümü gizlendi", !document.getElementById("stage").hasAttribute("blank"));

    // -- ikinci sekme, yalnız biri görünür
    const t2 = tabs.open("https://example.org");
    check("t2 seçili", tabs.selected === t2);
    check("t2 yüklendi", await wait(() => /Example Domain/.test(t2.title)), t2.title);
    check("t1 gizli / t2 görünür", t1.browser.hasAttribute("hidden-tab") && !t2.browser.hasAttribute("hidden-tab"));
    tabs.select(t1);
    check("t1'e dönüldü", tabs.selected === t1 && !t1.browser.hasAttribute("hidden-tab") && t2.browser.hasAttribute("hidden-tab"));

    // -- geri / ileri
    check("başta geri yok", !t1.canGoBack);
    tabs.navigate(t1, "example.net");
    check("t1 example.net'e gitti", await wait(() => t1.url.includes("example.net") && !t1.loading), t1.url);
    check("geri açıldı", await wait(() => t1.canGoBack));
    tabs.back(t1);
    check("geri döndü", await wait(() => t1.url === "https://example.com/"), t1.url);
    check("ileri açıldı", await wait(() => t1.canGoForward));

    // -- window.open / target=_blank yolu
    const before = tabs.all.length;
    const bc = window.browserDOMWindow.openURI(
      Services.io.newURI("https://example.com/"), null, Ci.nsIBrowserDOMWindow.OPEN_NEWTAB, 0,
      Vento.SYSTEM_PRINCIPAL, null
    );
    check("browserDOMWindow.openURI yeni sekme açtı", tabs.all.length === before + 1 && !!bc, String(tabs.all.length));
    const t3 = tabs.selected;
    // -- yerleşim: "+" son sekmenin hemen yanında olmalı (sağa kaçmamalı)
    {
      const r = id => document.getElementById(id).getBoundingClientRect();
      const lastTab = document.getElementById("tabs").lastElementChild.getBoundingClientRect();
      const plus = r("newtab");
      const gap = Math.round(plus.left - lastTab.right);
      check("+ düğmesi son sekmenin hemen yanında", gap >= 0 && gap < 24,
        `boşluk=${gap}px; tabs=[${Math.round(r("tabs").left)}..${Math.round(r("tabs").right)}] son=[${Math.round(lastTab.left)}..${Math.round(lastTab.right)}] +=[${Math.round(plus.left)}..${Math.round(plus.right)}] şerit=${Math.round(r("tabstrip").width)}`);
    }
    // Uzun başlık, kabın doğal genişliğini şişirip "+" düğmesini sağa itmemeli (gerçek pencerede görüldü).
    {
      const longTitle = "Çok uzun bir sayfa başlığı — muhasebe programınız bulutta çalışır ";
      for (const tab of tabs.all) {
        tab.title = longTitle;
      }
      Vento.ui.renderTabs();
      await new Promise(r => setTimeout(r, 200));
      const lastTab = document.getElementById("tabs").lastElementChild.getBoundingClientRect();
      const plus = document.getElementById("newtab").getBoundingClientRect();
      const gap = Math.round(plus.left - lastTab.right);
      check("uzun başlıklarda da + sekmenin hemen yanında", gap >= 0 && gap < 24, `boşluk=${gap}px`);
    }
    check("openURI sayfayı yükledi", await wait(() => t3.title === "Example Domain"), t3.title);

    // -- kapatma
    tabs.close(t3);
    tabs.close(t2);
    check("kapatınca 1 sekme kaldı", tabs.all.length === 1 && tabs.selected === t1, String(tabs.all.length));

    // -- akıllı çubuk
    Vento.ui.focusBar();
    check("⌘L çubuğa odak verir", document.activeElement === document.getElementById("smartbar-input"));
    check("odakta tam adres görünür", document.getElementById("smartbar-input").value === "https://example.com/",
      document.getElementById("smartbar-input").value);
    Vento.ui.focusPage();
    check("odak sayfaya dönünce kısa biçim", await wait(() => document.getElementById("smartbar-input").value === "example.com"),
      document.getElementById("smartbar-input").value);
  } catch (e) {
    check("öz-test istisna fırlatmadı", false, String(e) + "\n" + (e.stack || ""));
  }

  const pass = results.filter(Boolean).length;
  Vento.trace(`ÖZET ${pass}/${results.length} geçti`);
  Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
})();
