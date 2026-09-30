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

    // ===================== Esin =====================
    {
      const $ = id => document.getElementById(id);
      const llm = Services.env.get("VENTO_ESIN_ENDPOINT").replace(/\/v1$/, "");
      const stats = async () => (await fetch(`${llm}/stats`)).json();
      const reqs = async () => (await stats()).requests;
      const bots = () => [...$("esin-thread").querySelectorAll(".msg-assistant .msg-body")];
      const botText = () => bots().at(-1)?.textContent ?? "";
      const idle = () => !Vento.esin.state.busy;

      // -- panel ve yerleşim
      Services.prefs.setBoolPref("vento.esin.consented", false);
      const stageBefore = $("stage").getBoundingClientRect().width;
      Vento.esin.open();
      const er = $("esin").getBoundingClientRect();
      const sr = $("stage").getBoundingClientRect();
      check("Esin paneli sayfa kartının yanında", er.left >= sr.right - 1 && Math.round(er.width) === 380,
        `panel=[${Math.round(er.left)}..${Math.round(er.right)}] kart sağı=${Math.round(sr.right)}`);
      check("panel açılınca kart daraldı", sr.width < stageBefore, `${Math.round(stageBefore)} → ${Math.round(sr.width)}`);
      check("açılışta açık sayfa bağlama eklendi (1 çip)", $("esin-chips").children.length === 1);

      // -- onay kapısı: onaysız hiçbir şey gitmemeli
      check("onay kartı görünür", !$("esin-consent").hidden);
      Vento.esin.send("Merhaba?");
      await new Promise(r => setTimeout(r, 300));
      check("onaysız gönderim sağlayıcıya gitmedi", (await reqs()).length === 0);
      $("esin-consent-ok").click();
      check("onaydan sonra bekleyen soru gitti", await wait(async () => (await reqs()).length === 1));
      check("cevap akışla geldi", await wait(() => botText().includes("Soru: Merhaba?") && idle()), botText());
      const r1 = (await reqs())[0];
      check("istek: sayfa adresi + soru + sistem istemi", r1.urls.join() === "https://example.com/" && r1.question === "Merhaba?" && r1.systemOk, JSON.stringify(r1));
      check("sayfa metni çıkarıldı ve gönderildi (>200 karakter)", r1.pageChars > 200, `pageChars=${r1.pageChars}`);
      check("istemci Authorization göndermedi (anahtar sunucuda)", r1.hasAuth === false);
      check("gönderilen sayfa kullanıcıya gösterildi", document.querySelector(".msg-ctx")?.textContent.includes("example.com"),
        document.querySelector(".msg-ctx")?.textContent);

      // -- çoklu sekme (c)
      const e2 = tabs.open("https://example.org");
      check("e2 yüklendi", await wait(() => /Example Domain/.test(e2.title)), e2.title);
      check("sekme değişince bağlam yeni sayfayı izledi", Vento.esin.state.attached.length === 1 && Vento.esin.state.attached[0] === e2);
      check("t1 elle eklendi", Vento.esin.attach(t1) === true);
      check("iki çip var", $("esin-chips").children.length === 2);
      Vento.esin.send("İkisini karşılaştır");
      check("çoklu sekmeli cevap geldi", await wait(() => botText().includes("İkisini karşılaştır") && idle()), botText());
      const r2 = (await reqs())[1];
      check("iki sayfa da gitti", r2.urls.length === 2 && r2.urls.includes("https://example.com/") && r2.urls.includes("https://example.org/"), r2.urls.join());
      check("önceki tur geçmişte (2 mesaj)", r2.historyLen === 2, String(r2.historyLen));

      // -- durdurma
      Vento.esin.send("YAVAS bir soru");
      check("yavaş cevap akmaya başladı", await wait(() => botText().startsWith("Başlıyorum")), botText());
      Vento.esin.stop();
      check("durdurunca sağlayıcı bağlantısı kapandı", await wait(async () => (await stats()).aborted >= 1));
      check("durdurunca meşgul değil", await wait(idle));
      check("kısmi cevap korundu, 'Durduruldu' notu var", $("esin-thread").textContent.includes("Durduruldu") && botText().startsWith("Başlıyorum"));

      // -- model çıktısı HTML olarak çizilmez
      const tHtml = Date.now();
      Vento.esin.send("HTML dene");
      check("markdown cevabı geldi", await wait(() => idle() && !!bots().at(-1)?.querySelector("strong")), botText());
      Vento.trace(`TEST bilgi: HTML dene ${Date.now() - tHtml} ms sürdü`);
      const body = bots().at(-1);
      check("HTML etiketleri çizilmedi (b/img yok)", !body.querySelector("b, img") && body.textContent.includes("<b>x</b>"));
      check("markdown çizildi (strong, code, 2 li)", !!body.querySelector("strong") && !!body.querySelector("code") && body.querySelectorAll("li").length === 2);

      // -- bağlamsız soruda sayfa metni GİTMEZ
      for (const tab of [...Vento.esin.state.attached]) {
        Vento.esin.detach(tab);
      }
      check("çipler boşaldı", $("esin-chips").children.length === 0);
      Vento.esin.send("Sadece soru");
      check("bağlamsız cevap geldi", await wait(() => botText().includes("Sadece soru") && idle()), botText());
      const rs = await reqs();
      const rn = rs[rs.length - 1];
      check("bağlamsız istekte sayfa metni gitmedi", rn.urls.length === 0 && rn.pageChars === 0, JSON.stringify(rn));

      // -- akıllı çubuk önerileri
      tabs.close(e2);
      tabs.select(t1);
      const input = $("smartbar-input");
      Vento.ui.focusBar();
      input.value = "rüzgar nedir";
      input.dispatchEvent(new Event("input"));
      const rows = [...$("smartbar-suggest").querySelectorAll(".suggest-row")];
      check("arama metninde öneri listesi çıktı (Esin varsayılan)", !$("smartbar-suggest").hidden && rows.length === 2 && rows[0].hasAttribute("selected") && rows[0].dataset.kind === "esin");
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      check("↓ ile 'Ara' seçildi", rows[1].hasAttribute("selected") && !rows[0].hasAttribute("selected"));
      input.value = "example.com";
      input.dispatchEvent(new Event("input"));
      check("adres yazınca öneri yok", $("smartbar-suggest").hidden);

      // -- çubuktan Esin'e sor: açık sayfa bağlam olur
      Vento.ui.focusBar();
      input.value = "Bu sayfa nedir?";
      input.dispatchEvent(new Event("input"));
      const before = (await reqs()).length;
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      check("çubuktan sorulan soru Esin'e gitti", await wait(async () => (await reqs()).length === before + 1));
      const rq = (await reqs()).at(-1);
      check("çubuktan sorulunca açık sayfa bağlamda", rq.question === "Bu sayfa nedir?" && rq.urls.join() === "https://example.com/", JSON.stringify(rq));
      check("soru gönderilince çubuk sayfanın kısa adresine döndü", input.value === "example.com", input.value);
      await wait(idle);

      // -- yeni sohbet ve kapatma
      Vento.esin.clearChat();
      check("yeni sohbet mesajları sildi", $("esin-thread").querySelectorAll(".msg").length === 0 && !$("esin-empty").hidden);
      Vento.esin.close();
      check("panel kapandı, kart eski genişliğe döndü", $("esin").hidden && Math.abs($("stage").getBoundingClientRect().width - stageBefore) < 2);
    }
  } catch (e) {
    check("öz-test istisna fırlatmadı", false, String(e) + "\n" + (e.stack || ""));
  }

  const pass = results.filter(Boolean).length;
  Vento.trace(`ÖZET ${pass}/${results.length} geçti`);
  Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
})();
