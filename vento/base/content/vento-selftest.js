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

    // ===================== Sağ tık menüsü =====================
    {
      const cm = Vento.contextMenu;
      cm.dryRun = true;
      const llm = Services.env.get("VENTO_ESIN_ENDPOINT").replace(/\/v1$/, "");
      const reqs = async () => (await (await fetch(`${llm}/stats`)).json()).requests;
      const idle = () => !Vento.esin.state.busy;
      const html = `<meta charset="utf-8">
        <a id=l href="https://example.com/hedef">bağlantı metni</a>
        <img id=i src="https://example.com/resim.png" width=20 height=20>
        <textarea id=t>merhaba dünya</textarea>
        <p id=p>Bu bir seçilecek metindir</p>
        <div id=own>kendi menüsü var</div>
        <input id=pw type=password value="gizli-parola">
        <title>hazır</title>
        <script>
          document.title = "betik-çalıştı";
          const fire = el => el.dispatchEvent(new MouseEvent("contextmenu", {bubbles:true, cancelable:true, composed:true, screenX:120, screenY:140}));
          document.getElementById("own").addEventListener("contextmenu", e => e.preventDefault());
          const at = (ms, f) => setTimeout(f, ms);
          at(500, () => fire(document.getElementById("l")));
          at(800, () => fire(document.getElementById("i")));
          at(1100, () => { const t = document.getElementById("t"); t.focus(); t.setSelectionRange(0, 7); fire(t); });
          at(1400, () => { const r = document.createRange(); r.selectNodeContents(document.getElementById("p")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); fire(document.getElementById("p")); });
          at(1700, () => { getSelection().removeAllRanges(); fire(document.body); });
          at(2000, () => fire(document.getElementById("own")));
          at(2300, () => { const p = document.getElementById("pw"); p.focus(); p.setSelectionRange(0, 5); fire(p); });
        </script>`;
      const tab = tabs.selected;
      const load = h => tab.browser.fixupAndLoadURIString("data:text/html," + encodeURIComponent(h), { triggeringPrincipal: Vento.SYSTEM_PRINCIPAL });

      // -- GÜVENLİK: üretim kaydı yalnızca GERÇEK kullanıcı olaylarını dinler. Sayfa betiği sahte bir
      //    contextmenu olayı üretip menümüzü açamamalı.
      load(`<meta charset="utf-8"><a id=l href="https://example.com/x">x</a><script>
        setTimeout(() => document.getElementById("l").dispatchEvent(new MouseEvent("contextmenu", {bubbles: true, cancelable: true, composed: true})), 500);
      </script>`);
      await new Promise(r => setTimeout(r, 2000));
      check("GÜVENLİK: sayfa betiğinin sahte contextmenu olayı menü açmadı", cm.state.history.length === 0, String(cm.state.history.length));

      // Testte gerçek fare olayı üretemiyoruz (windowUtils.sendMouseEvent yok) → aktörü YALNIZCA testte
      // wantUntrusted ile yeniden kaydeder, gerisini (aynı çocuk/ebeveyn kodu) sınarız.
      ChromeUtils.unregisterWindowActor("VentoContextMenu");
      ChromeUtils.registerWindowActor("VentoContextMenu", {
        parent: { esModuleURI: "resource:///actors/VentoContextMenuParent.sys.mjs" },
        child: {
          esModuleURI: "resource:///actors/VentoContextMenuChild.sys.mjs",
          events: { contextmenu: { mozSystemGroup: true, wantUntrusted: true } },
        },
        allFrames: true,
        messageManagerGroups: ["browsers"],
      });
      // Aktör modülleri geçerli mi? (yüklenemeyen modül içerikte sessizce ölür)
      for (const m of ["VentoContextMenuChild", "VentoContextMenuParent"]) {
        let err = "";
        try {
          ChromeUtils.importESModule(`resource:///actors/${m}.sys.mjs`);
        } catch (e) {
          err = String(e);
        }
        check(`${m} modülü yükleniyor`, !err, err);
      }
      load(html);
      check("veri sayfası yüklendi ve betiği çalıştı", await wait(() => /^betik-/.test(tab.title), 10000), `başlık=${tab.title}`);
      check("6 sağ tık olayı menü verisi üretti", await wait(() => cm.state.history.length >= 6, 15000), String(cm.state.history.length));
      await new Promise(r => setTimeout(r, 800)); // "own" olayı çoktan işlendi: menü OLUŞMAMALI
      check("sayfa kendi menüsünü yapıyorsa dokunulmadı (7 olaydan 6 kayıt)", cm.state.history.length === 6, String(cm.state.history.length));

      const labels = h => h.items.map(d => (d === cm.SEP ? "|" : d.label));
      const [link, img, edit, sel, page, pw] = cm.state.history;
      const has = (h, l) => labels(h).includes(l);

      check("bağlantı: adres ve metin toplandı", link.data.linkUrl === "https://example.com/hedef" && link.data.linkText === "bağlantı metni", JSON.stringify(link.data.linkUrl));
      check("bağlantı menüsü", has(link, "Bağlantıyı Yeni Sekmede Aç") && has(link, "Bağlantı Adresini Kopyala") && !has(link, "Yenile"), labels(link).join(","));
      check("resim: adres toplandı + menü", img.data.imageUrl.endsWith("/resim.png") && has(img, "Resmi Yeni Sekmede Aç") && has(img, "Resim Adresini Kopyala"), img.data.imageUrl);
      check("yazı alanı: düzenlenebilir + seçili metin", edit.data.editable === true && edit.data.selection === "merhaba", JSON.stringify(edit.data.selection));
      check("yazı alanı menüsü (Kes açık, Yapıştır, Tümünü Seç)", has(edit, "Yapıştır") && has(edit, "Tümünü Seç") && edit.items.find(d => d.label === "Kes")?.disabled === false);
      check("seçili metin: Kopyala + Ara + Esin alt menüsü", sel.data.selection === "Bu bir seçilecek metindir" && has(sel, "Kopyala") &&
        labels(sel).some(l => l.endsWith("için Ara")) && sel.items.find(d => d.label === "Esin")?.sub?.length === 3 && !has(sel, "Kes"), labels(sel).join(","));
      check("boş sayfa: gezinme + adres + Esin + kaynak", has(page, "Yenile") && has(page, "Sayfa Adresini Kopyala") && has(page, "Sayfayı Esin ile Özetle") && has(page, "Sayfa Kaynağını Göster"), labels(page).join(","));
      check("menü ayırıcı ile başlayıp bitmiyor", cm.state.history.every(h => h.items[0] !== cm.SEP && h.items.at(-1) !== cm.SEP));
      check("ekran konumu cihaz pikseline çevrildi", link.data.screenXDevPx > 0 && link.data.screenYDevPx > 0);
      check("şifre alanı: düzenlenebilir ama seçili metin GÖNDERİLMEDİ", pw.data.editable === true && pw.data.password === true && pw.data.selection === "", JSON.stringify(pw.data.selection));
      check("şifre alanı menüsünde Esin/Ara yok", !labels(pw).some(l => l === "Esin" || l.endsWith("için Ara")), labels(pw).join(","));

      // -- eylemler
      const run = (h, label) => h.items.find(d => d.label === label).run();
      const nBefore = tabs.all.length;
      const selBefore = tabs.selected;
      run(link, "Bağlantıyı Yeni Sekmede Aç");
      check("bağlantı arka planda yeni sekmede açıldı", tabs.all.length === nBefore + 1 && tabs.selected === selBefore);
      tabs.close(tabs.all.at(-1));
      tabs.select(selBefore);
      run(link, "Bağlantı Adresini Kopyala");
      check("bağlantı adresi kopyalandı", cm.state.copied === "https://example.com/hedef");
      run(sel, "Kopyala");
      check("seçili metin kopyalandı", cm.state.copied === "Bu bir seçilecek metindir");
      const before = (await reqs()).length;
      sel.items.find(d => d.label === "Esin").sub.find(d => d.label === "Özetle").run();
      check("Esin > Özetle seçili metinle soruyu gönderdi", await wait(async () => (await reqs()).length === before + 1), "");
      const rq = (await reqs()).at(-1);
      check("gönderilen soru seçili metni içeriyor", rq.question.includes("Şu metni kısaca özetle") && rq.question.includes("Bu bir seçilecek metindir"), rq.question);
      await wait(idle);
      cm.dryRun = false;
    }
  } catch (e) {
    check("öz-test istisna fırlatmadı", false, String(e) + "\n" + (e.stack || ""));
  }

  const pass = results.filter(Boolean).length;
  Vento.trace(`ÖZET ${pass}/${results.length} geçti`);
  Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
})();
