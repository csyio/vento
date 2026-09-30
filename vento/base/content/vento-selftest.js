"use strict";

// Öz-test: VENTO_SELFTEST=1 ile çalışır. Sonuçlar VENTO_TRACE dosyasına yazılır, sonra çıkılır.
// Gerçek ağ kullanır (example.com/org/net). `tools/selftest.sh` ile çalıştırılır.

(async () => {
  const PM_test = (principal, type) => Services.perms.testExactPermissionFromPrincipal(principal, type);
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

  // ===== 2. aşama: aynı profille yeniden açıldı → oturum geri gelmiş olmalı (tools/selftest.sh ikinci kez çalıştırır) =====
  if (Services.env.exists("VENTO_SELFTEST_PHASE2")) {
    try {
      const tabs = Vento.tabs;
      const llm = Services.env.get("VENTO_ESIN_ENDPOINT").replace(/\/v1$/, "");
      const u = n => `${llm}/oturum/${n}`;
      check("yeniden açılış: 3 sekme geri geldi (fazladan boş sekme yok)", tabs.all.length === 3, String(tabs.all.length));
      check("adresler ve sıra doğru", tabs.all.map(t => t.url).join(" ") === [u("a"), u("b"), u("c")].join(" "), tabs.all.map(t => t.url).join(" "));
      check("seçili sekme B (kapanışta yazılan son durum)", tabs.selected === tabs.all[1], String(tabs.all.indexOf(tabs.selected)));
      check("seçili sekme yüklendi, diğerleri bekliyor", !tabs.all[1].pending && !!tabs.all[0].pending && !!tabs.all[2].pending, tabs.all.map(t => t.pending ? "bekliyor" : "yüklü").join(","));
      check("bekleyen sekmelerde başlık korundu", tabs.all[0].title === "Sayfa A" && tabs.all[2].title === "Sayfa C", tabs.all.map(t => t.title).join("|"));
      check("seçili sekmenin sayfası gerçekten yüklendi", await wait(() => tabs.all[1].browser.currentURI?.spec === u("b"), 15000), tabs.all[1].browser.currentURI?.spec);
      tabs.select(tabs.all[0]);
      check("bekleyen sekmeye geçince sayfa yüklendi", !tabs.all[0].pending && await wait(() => tabs.all[0].browser.currentURI?.spec === u("a"), 15000), tabs.all[0].browser.currentURI?.spec);
    } catch (e) {
      check("2. aşama istisna fırlatmadı", false, String(e) + "\n" + (e.stack || ""));
    }
    Vento.trace(`ÖZET ${results.filter(Boolean).length}/${results.length} geçti`);
    Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
    return;
  }

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

    // ===================== Sayfada ara =====================
    {
      const $ = id => document.getElementById(id);
      const tab = tabs.selected;
      const count = () => $("find-count").textContent;
      const input = $("find-input");
      const key = (k, extra = {}) => input.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...extra }));
      tab.browser.fixupAndLoadURIString("data:text/html," + encodeURIComponent(
        `<meta charset="utf-8"><title>bul</title><p>elma armut elma muz elma</p>`), { triggeringPrincipal: Vento.SYSTEM_PRINCIPAL });
      check("arama sayfası yüklendi", await wait(() => tab.title === "bul"), tab.title);

      check("menüde 'Sayfada Ara…' ve ⌘F kısayolu var", !!$("menu_find") && $("key_find").getAttribute("key") === "f");
      Vento.find.open();
      check("⌘F çubuğu açtı, odak arama kutusunda", !$("findbar").hidden && document.activeElement === input);

      input.value = "elma";
      input.dispatchEvent(new Event("input"));
      check("'elma' → 1/3", await wait(() => count() === "1/3"), count());
      key("Enter");
      check("Enter → sonraki 2/3", await wait(() => count() === "2/3"), count());
      Vento.find.next();
      check("⌘G → 3/3", await wait(() => count() === "3/3"), count());
      Vento.find.next();
      check("sonuncudan sonra başa sardı 1/3", await wait(() => count() === "1/3"), count());
      key("Enter", { shiftKey: true });
      check("⇧Enter → geri (3/3)", await wait(() => count() === "3/3"), count());

      input.value = "yokkelime";
      input.dispatchEvent(new Event("input"));
      check("olmayan kelime → 'Bulunamadı' ve kırmızı", await wait(() => count() === "Bulunamadı" && input.hasAttribute("notfound")), count());
      input.value = "armut";
      input.dispatchEvent(new Event("input"));
      check("bulunca kırmızı kalktı, 1/1", await wait(() => count() === "1/1" && !input.hasAttribute("notfound")), count());

      key("Escape");
      check("Esc çubuğu kapattı", $("findbar").hidden === true && Vento.find.state.open === false);

      // arama sekmeye bağlı: sekme değişince kapanır
      Vento.find.open();
      const other = tabs.open("about:blank");
      check("sekme değişince arama çubuğu kapandı", $("findbar").hidden === true);
      tabs.close(other);
      tabs.select(tab);
      Vento.find.open();
      Vento.find.close(false);
      check("boş sekmede ⌘F açmaz", (() => { const b = tabs.open("about:blank"); Vento.find.open(); const ok = $("findbar").hidden; tabs.close(b); tabs.select(tab); return ok; })());
    }

    // ===================== İndirmeler =====================
    {
      const $ = id => document.getElementById(id);
      const D = Vento.downloads;
      D.dryRun = true;
      const dir = Services.dirsvc.get("TmpD", Ci.nsIFile);
      dir.append(`vento-indirme-${Date.now()}`);
      dir.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
      Services.prefs.setIntPref("browser.download.folderList", 2);
      Services.prefs.setComplexValue("browser.download.dir", Ci.nsIFile, dir);
      const llm = Services.env.get("VENTO_ESIN_ENDPOINT").replace(/\/v1$/, "");
      const rowOf = d => D.state.rows.get(d)?.row;
      const sizeOf = async name => (await IOUtils.exists(PathUtils.join(dir.path, name))) ? (await IOUtils.stat(PathUtils.join(dir.path, name))).size : -1;

      check("indirme düğmesi başta gizli", $("nav-downloads").hidden === true);

      // -- sayfadan gelen ek (Content-Disposition: attachment) otomatik iner
      const tab = tabs.selected;
      tab.browser.fixupAndLoadURIString(`${llm}/dosya.bin`, { triggeringPrincipal: Vento.SYSTEM_PRINCIPAL });
      check("ek dosya indirme listesine düştü", await wait(() => D.state.rows.size === 1, 15000), String(D.state.rows.size));
      const first = [...D.state.rows.keys()][0];
      check("indirme tamamlandı", await wait(() => first.succeeded, 15000), `succeeded=${first.succeeded} error=${first.error}`);
      check("dosya doğru adla, tam boyutta kaydedildi (rapor.bin, 200 KB)", (await sizeOf("rapor.bin")) === 204800, String(await sizeOf("rapor.bin")));
      check("soru sormadı: yardımcı-uygulama diyaloğu açılmadı (tek pencere)", [...Services.wm.getEnumerator(null)].length === 1);
      check("indirme düğmesi göründü", $("nav-downloads").hidden === false);
      D.showPanel(true);
      check("panel satırı: ad + Tamamlandı", rowOf(first)?.querySelector(".dl-name").textContent === "rapor.bin" && rowOf(first)?.querySelector(".dl-meta").textContent.includes("Tamamlandı"), rowOf(first)?.querySelector(".dl-meta").textContent);
      check("bitmiş satırda yalnızca 'Finder'da göster' ve 'kaldır' görünür", getComputedStyle(rowOf(first).querySelector(".dl-reveal")).display !== "none" && getComputedStyle(rowOf(first).querySelector(".dl-cancel")).display === "none");

      // -- adresi kaydet (sağ tık "Resmi kaydet" yolu) + benzersiz ad
      const d1 = await D.saveURL(`${llm}/dosya.bin?a=1`);
      check("saveURL tamamlandı (dosya.bin)", await wait(() => d1.succeeded, 15000) && (await sizeOf("dosya.bin")) === 204800, String(await sizeOf("dosya.bin")));
      const d2 = await D.saveURL(`${llm}/dosya.bin?a=2`);
      check("aynı ad varsa benzersiz ad (dosya (1).bin)", await wait(() => d2.succeeded, 15000) && PathUtils.filename(d2.target.path) === "dosya (1).bin", PathUtils.filename(d2.target.path));

      // -- iptal
      const slow = await D.saveURL(`${llm}/yavas.bin`);
      check("yavaş indirme ilerliyor", await wait(() => slow.currentBytes > 0 && !slow.stopped, 15000), String(slow.currentBytes));
      check("sürerken iptal düğmesi görünür, kaldır gizli", getComputedStyle(rowOf(slow).querySelector(".dl-cancel")).display !== "none" && getComputedStyle(rowOf(slow).querySelector(".dl-remove")).display === "none");
      check("ilerleme çubuğu genişliği yükseldi", rowOf(slow).querySelector(".dl-fill").style.width !== "");
      rowOf(slow).querySelector(".dl-cancel").click();
      check("iptal edince indirme durdu", await wait(() => slow.canceled, 10000));
      check("iptal satırı 'İptal edildi' + yeniden dene görünür", await wait(() => rowOf(slow)?.dataset.kind === "canceled") && getComputedStyle(rowOf(slow).querySelector(".dl-retry")).display !== "none");

      // -- kaldır
      const n = D.state.rows.size;
      rowOf(slow).querySelector(".dl-remove").click();
      check("kaldırınca satır listeden gitti", await wait(() => D.state.rows.size === n - 1), String(D.state.rows.size));

      // -- bağlam menüsü öğeleri
      const cmb = Vento.contextMenu.build({ imageUrl: "https://x/y.png", linkUrl: "https://x/f.pdf", pageUrl: "https://x/" });
      const lb = cmb.filter(d => d !== Vento.contextMenu.SEP).map(d => d.label);
      check("bağlam menüsünde 'Resmi İndirilenler'e Kaydet' ve 'Bağlantıdaki Dosyayı İndir'", lb.includes("Resmi İndirilenler'e Kaydet") && lb.includes("Bağlantıdaki Dosyayı İndir"), lb.join(","));

      // -- hepsi kalkınca düğme gizlenir
      for (const d of [...D.state.rows.keys()]) {
        await D.state.list.remove(d);
      }
      check("liste boşalınca düğme ve panel gizlendi", await wait(() => $("nav-downloads").hidden && $("downloads-panel").hidden));
      D.dryRun = false;
    }

    // ===================== Sayfa diyalogları =====================
    {
      const $ = id => document.getElementById(id);
      const D = Vento.dialogs;
      const tab = tabs.selected;
      const shown = () => D.state.shown;
      const card = () => shown()?.ui?.card;
      const btn = i => card().querySelector(`button[data-index="${i}"]`);
      const key = k => card().dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
      const du = h => "data:text/html," + encodeURIComponent(`<meta charset="utf-8">${h}`);
      const load = h => tab.browser.fixupAndLoadURIString(du(h), { triggeringPrincipal: Vento.SYSTEM_PRINCIPAL });
      const visible = () => !$("dialog-layer").hidden;

      // -- confirm → prompt → alert zinciri: sessizce iptal EDİLMEMELİ
      load(`<title>d</title><script>setTimeout(() => { const a = confirm("Emin misin?"); const b = prompt("Adın?", "varsayılan"); alert("bitti"); document.title = "sonuç:" + a + ":" + b; }, 300);</script>`);
      check("confirm diyaloğu göründü (artık sessizce iptal edilmiyor)", await wait(() => shown() && visible(), 10000));
      check("confirm: metin + Tamam/İptal", card().querySelector(".dlg-text").textContent === "Emin misin?" && card().querySelectorAll("button").length === 2 && btn(0).hasAttribute("primary"));
      // data: sayfasında site adı yoktur (boş kaynak); http sayfasında görünmesi aşağıdaki izin testlerinde ölçülür
      btn(0).click();
      check("prompt: varsayılan değerli alan", await wait(() => card()?.querySelector(".dlg-value")?.value === "varsayılan"));
      card().querySelector(".dlg-value").value = "Can";
      btn(0).click();
      check("alert: tek düğme", await wait(() => card()?.querySelectorAll("button").length === 1 && card().querySelector(".dlg-text").textContent === "bitti"));
      key("Enter");
      check("sayfa cevapları aldı (confirm=true, prompt='Can')", await wait(() => tab.title === "sonuç:true:Can"), tab.title);
      check("bitince katman gizlendi", await wait(() => !visible()));

      // -- iptal (Esc): confirm=false, prompt=null
      load(`<title>e</title><script>setTimeout(() => { const a = confirm("x?"); const b = prompt("y?"); document.title = "sonuç:" + a + ":" + b; }, 300);</script>`);
      await wait(() => shown());
      key("Escape");
      await wait(() => card()?.querySelector(".dlg-value"));
      key("Escape");
      check("Esc: confirm=false, prompt=null", await wait(() => tab.title === "sonuç:false:null"), tab.title);

      // -- arka plandaki sekmenin diyaloğu o sekme seçilene kadar görünmez
      const bg = tabs.open(du(`<title>bg</title><script>setTimeout(() => { document.title = "bg:" + confirm("arka plan?"); }, 300);</script>`), { select: false });
      check("arka plan diyaloğu kuyruğa alındı", await wait(() => D.pending === 1, 10000), String(D.pending));
      check("ama önde görünmedi", !visible());
      tabs.select(bg);
      check("sekmeye geçince göründü", await wait(() => visible() && card()?.querySelector(".dlg-text").textContent === "arka plan?"));
      tabs.select(tab);
      check("başka sekmeye geçince gizlendi ama bekliyor", !visible() && D.pending === 1);
      tabs.select(bg);
      btn(0).click();
      check("cevap sayfaya ulaştı (bg:true)", await wait(() => bg.title === "bg:true"), bg.title);
      tabs.close(bg);
      tabs.select(tab);

      // -- sekme kapanınca bekleyen istem iptal edilir
      const bg2 = tabs.open(du(`<script>setTimeout(() => confirm("kapanacak"), 300);</script>`), { select: false });
      await wait(() => D.pending === 1, 10000);
      tabs.close(bg2);
      check("sekme kapanınca bekleyen istem temizlendi", await wait(() => D.pending === 0), String(D.pending));
      tabs.select(tab);

      // -- confirmEx: 3 düğme, varsayılan 2, onay kutusu
      const p1 = D.open(tab.browser, { promptType: "confirmEx", text: "Üç seçenek", button0Label: "Kaydet", button1Label: "Vazgeç", button2Label: "Kaydetme", defaultButtonNum: 2, checkLabel: "Bir daha sorma", checked: false });
      await wait(() => card());
      check("confirmEx: 3 düğme, 2. varsayılan (birincil)", card().querySelectorAll("button").length === 3 && btn(2).hasAttribute("primary") && !btn(0).hasAttribute("primary"));
      card().querySelector("input[type=checkbox]").checked = true;
      btn(2).click();
      const r1 = await p1;
      check("confirmEx sonucu: buttonNumClicked=2, ok=false, checked=true", r1.buttonNumClicked === 2 && r1.ok === false && r1.checked === true, JSON.stringify(r1));

      // -- kimlik doğrulama (HTTP auth) alanları
      const p2 = D.open(tab.browser, { promptType: "promptUserAndPass", text: "Giriş gerekli", authOrigin: "example.com", isInsecureAuth: true, user: "", pass: "" });
      await wait(() => card());
      check("kimlik: kullanıcı + parola (gizli) + güvensiz uyarı + kaynak",
        !!card().querySelector(".dlg-user") && card().querySelector(".dlg-pass").type === "password" && !!card().querySelector(".dlg-warn") && card().querySelector(".dlg-origin").textContent.includes("example.com"));
      card().querySelector(".dlg-user").value = "can";
      card().querySelector(".dlg-pass").value = "gizli";
      btn(0).click();
      const r2 = await p2;
      check("kimlik sonucu: user, pass, ok", r2.user === "can" && r2.pass === "gizli" && r2.ok === true);

      // -- iptalde alan değerleri geri verilmez
      const p3 = D.open(tab.browser, { promptType: "promptPassword", text: "Parola", pass: "" });
      await wait(() => card());
      card().querySelector(".dlg-pass").value = "sızmamalı";
      btn(1).click();
      const r3 = await p3;
      check("İptal'de parola sonuca yazılmadı", r3.ok === false && (r3.pass ?? "") === "", JSON.stringify(r3));
    }

    // ===================== Site izinleri =====================
    {
      const $ = id => document.getElementById(id);
      const P = Vento.permissions;
      const tab = tabs.selected;
      const llm = Services.env.get("VENTO_ESIN_ENDPOINT").replace(/\/v1$/, "");
      const page = mode => `${llm}/izin.html?${mode}`;
      const card = () => P.state.shown?.ui?.card;
      const visible = () => !$("perm-layer").hidden;
      const btn = cls => card().querySelector(cls);
      Services.prefs.setBoolPref("dom.webnotifications.requireuserinteraction", false);
      Services.prefs.setBoolPref("media.navigator.streams.fake", true);
      const principal = Services.scriptSecurityManager.createContentPrincipalFromOrigin(new URL(llm).origin);
      const goto = async (mode, expectTitlePrefix) => {
        tab.browser.fixupAndLoadURIString(page(mode), { triggeringPrincipal: Vento.SYSTEM_PRINCIPAL });
      };
      const titleIs = async t => wait(() => tab.title === t, 10000);

      // -- bildirim: Engelle
      goto("notif");
      check("bildirim isteği kartı çıktı", await wait(() => visible() && card(), 10000));
      check("kart: site + 'sana bildirim göndermek'", card().querySelector(".perm-origin").textContent === new URL(llm).host && card().querySelector(".perm-text").textContent.includes("bildirim göndermek"),
        `origin=${card().querySelector(".perm-origin").textContent} beklenen=${new URL(llm).host}`);
      check("'Hatırla' varsayılan KAPALI (gizlilik)", card().querySelector(".perm-remember input").checked === false);
      btn(".perm-block").click();
      check("Engelle → sayfa 'denied' aldı", await titleIs("n:denied"), tab.title);
      const denied = Services.perms.getPermissionObject(principal, "desktop-notification", true);
      check("Engelle: kart kayboldu; karar YALNIZ oturum boyunca saklandı (kalıcı değil)", !visible() && denied?.capability === Services.perms.DENY_ACTION && denied?.expireType === Services.perms.EXPIRE_SESSION, `${denied?.capability}/${denied?.expireType}`);
      Services.perms.removeAll();

      // -- bildirim: İzin Ver + hatırla → ikinci sefer sormadan izin
      goto("notif");
      await wait(() => visible() && card(), 10000);
      card().querySelector(".perm-remember input").checked = true;
      btn(".perm-allow").click();
      check("İzin Ver → 'granted'", await titleIs("n:granted"), tab.title);
      check("hatırlandı (kalıcı izin yöneticisinde)", PM_test(principal, "desktop-notification") === Services.perms.ALLOW_ACTION);
      goto("notif");
      check("hatırlanan bildirim izninde kart çıkmadan 'granted' (platform kendisi cevaplar)", await wait(() => tab.title === "n:granted", 10000) && !visible());
      Services.perms.removeAll();

      // -- konum: Engelle → PERMISSION_DENIED (1)
      goto("geo");
      await wait(() => visible() && card(), 10000);
      check("konum kartı: 'konumunu görmek'", card().querySelector(".perm-text").textContent.includes("konumunu görmek"));
      btn(".perm-block").click();
      check("konum Engelle → hata kodu 1 (PERMISSION_DENIED)", await titleIs("geo:1"), tab.title);

      // -- kamera + mikrofon (sahte cihazlarla)
      goto("media");
      check("kamera+mikrofon kartı çıktı", await wait(() => visible() && card(), 10000));
      check("metin: 'kameranı ve mikrofonunu kullanmak'", card().querySelector(".perm-text").textContent.includes("kameranı ve mikrofonunu kullanmak"), card().querySelector(".perm-text").textContent);
      btn(".perm-allow").click();
      check("İzin Ver → akış geldi (2 iz: video+ses)", await titleIs("media:ok:2"), tab.title);
      check("kamera/mikrofon 'bu seferlik': hatırla kapalıyken HİÇ saklanmadı", PM_test(principal, "camera") === 0 && PM_test(principal, "microphone") === 0);
      goto("media");
      await wait(() => visible() && card(), 10000);
      btn(".perm-block").click();
      check("Engelle → NotAllowedError", await titleIs("media:NotAllowedError"), tab.title);
      // -- kamera+mikrofon: "hatırla" işaretliyse bir dahaki istek kartsız (bizim otomatik cevap yolumuz)
      goto("media");
      await wait(() => visible() && card(), 10000);
      card().querySelector(".perm-remember input").checked = true;
      btn(".perm-allow").click();
      await titleIs("media:ok:2");
      check("hatırla açıkken kamera+mikrofon KALICI saklandı", PM_test(principal, "camera") === Services.perms.ALLOW_ACTION && PM_test(principal, "microphone") === Services.perms.ALLOW_ACTION);
      const autoBefore = P.state.autoAnswered.length;
      goto("media");
      // Başlık önceki denemeden zaten "media:ok:2" kalmış olabilir → önce yeni isteğin bize ulaşmasını bekle
      const answered = await wait(() => P.state.autoAnswered.length > autoBefore, 10000);
      await new Promise(r => setTimeout(r, 700)); // akış sayfaya ulaşsın
      check("hatırlanan kamera izninde kart çıkmadan (otomatik cevapla) akış geldi", answered && tab.title === "media:ok:2" && !visible(), `otomatik=${answered} başlık=${tab.title}`);
      Services.perms.removeAll();
      goto("cam");
      await wait(() => visible() && card(), 10000);
      check("yalnız kamera: metin 'kameranı kullanmak'", card().querySelector(".perm-text").textContent.includes("kameranı kullanmak") && !card().querySelector(".perm-text").textContent.includes("mikrofon"));
      btn(".perm-block").click();
      await titleIs("cam:NotAllowedError");

      // -- sekmeye bağlı: arka plandaki sekmenin kartı görünmez
      const bg = tabs.open(page("notif"), { select: false });
      check("arka plan isteği kuyruğa alındı, görünmüyor", await wait(() => P.pending === 1, 10000) && !visible());
      tabs.select(bg);
      check("sekmeye geçince kart göründü", await wait(() => visible() && !!card()));
      tabs.select(tab);
      check("başka sekmeye geçince gizlendi ama bekliyor", !visible() && P.pending === 1);
      tabs.close(bg);
      check("sekme kapanınca istek temizlendi", await wait(() => P.pending === 0));
      tabs.select(tab);

      // -- başka siteye gidilince bekleyen istek reddedilir
      goto("notif");
      await wait(() => visible() && card(), 10000);
      tab.browser.fixupAndLoadURIString("data:text/html," + encodeURIComponent("<meta charset=utf-8><title>gitti</title>"), { triggeringPrincipal: Vento.SYSTEM_PRINCIPAL });
      check("siteden ayrılınca bekleyen kart kalktı", await wait(() => tab.title === "gitti" && !visible() && P.pending === 0), String(P.pending));
      Services.perms.removeAll();
    }

    // ===================== Hata sayfaları =====================
    // Toolkit'in about:neterror'u, uygulama dil kaynağı (brand.ftl) kayıtlı değilse hiçbir iletiyi çözemez:
    // başlık boş, metinler ham kalır. Kayıt: vento/l10n-registry.manifest.
    {
      const tab = tabs.selected;
      const docURI = () => tab.browser.browsingContext?.currentWindowGlobal?.documentURI?.spec ?? "";
      const missing = [];
      const listener = { observe(m) { if (m instanceof Ci.nsIScriptError && /Missing resource/.test(m.errorMessage)) missing.push(m.errorMessage); } };
      Services.console.registerListener(listener);
      tab.browser.fixupAndLoadURIString("http://nonexistent.invalid/", { triggeringPrincipal: Vento.SYSTEM_PRINCIPAL });
      check("DNS hatası: about:neterror açıldı", await wait(() => docURI().startsWith("about:neterror?e=dnsNotFound"), 15000), docURI());
      await wait(() => tab.title === "Server Not Found", 10000);
      Services.console.unregisterListener(listener);
      const text = await new Promise(resolve => {
        const mm = tab.browser.messageManager;
        mm.addMessageListener("vento:errtext", m => resolve(m.data), { once: true });
        mm.loadFrameScript("data:,(" + encodeURIComponent(`function(){ sendAsyncMessage("vento:errtext", content.document.body?.innerText || ""); }`) + ")()", false);
        setTimeout(() => resolve(""), 5000);
      });
      check("hata sayfası başlığı çözüldü (boş değil)", tab.title === "Server Not Found", `"${tab.title}"`);
      check("hata sayfası metni çevrildi ('Hmm. We’re having trouble…')", text.includes("having trouble finding that site"), text.slice(0, 120));
      check("marka adı Vento (Nightly/Firefox değil)", text.includes("Check that Vento has permission") && !/Nightly|Firefox/.test(text), text.match(/Check that .{0,20}/)?.[0]);
      check("dil kaynağı eksikliği raporlanmadı (brand.ftl)", missing.length === 0, missing.join(" | "));
      check("uygulama dil kaynağı kayıtlı", L10nRegistry.getInstance().getSourceNames().some(n => n.includes("vento")));
    }

    // ===================== Sertifika hata sayfası (gerçek HTTPS, kendinden imzalı) =====================
    {
      const https = Services.env.get("VENTO_TEST_HTTPS");
      const tab = tabs.open("about:blank"); // temiz sekme (önceki hata sayfası testinin durumu karışmasın)
      const docURI = () => tab.browser.browsingContext?.currentWindowGlobal?.documentURI?.spec ?? "";
      const load = u => tab.browser.fixupAndLoadURIString(u, { triggeringPrincipal: Vento.SYSTEM_PRINCIPAL });
      // İçerik sürecinde bir işlev çalıştırıp sonucunu alır
      const inPage = (body, ms = 8000) => new Promise(resolve => {
        body = body.replace(/\bdocument\b/g, "content.document");
        const id = "vento:sonuc:" + Math.random();
        const mm = tab.browser.messageManager;
        mm.addMessageListener(id, m => resolve(m.data), { once: true });
        // async destekli; kaynak ASCII olmalı (data: betik Latin-1 okunuyor)
        mm.loadFrameScript("data:,(" + encodeURIComponent(`function(){ Promise.resolve().then(() => (${body})()).then(r => sendAsyncMessage(${JSON.stringify(id)}, r), e => sendAsyncMessage(${JSON.stringify(id)}, "HATA " + e)); }`) + ")()", false);
        setTimeout(() => resolve("ZAMAN AŞIMI"), ms);
      });
      check("gizlilik: sertifika hatasında Mozilla MITM sunucusuna istek atılmıyor", Services.prefs.getBoolPref("security.certerrors.mitm.priming.enabled") === false);
      Services.prefs.setIntPref("security.dialog_enable_delay", 0); // "Riski kabul et" düğmesinin 1 sn'lik bekleme süresi (yalnız test)
      const overrides = Cc["@mozilla.org/security/certoverride;1"].getService(Ci.nsICertOverrideService);

      load(`${https}/`);
      check("kendinden imzalı HTTPS: about:certerror açıldı", await wait(() => docURI().startsWith("about:certerror"), 15000), docURI().slice(0, 80));
      check("sertifika hata sayfasının başlığı çözüldü", await wait(() => tab.title === "Warning: Potential Security Risk Ahead", 10000), `"${tab.title}"`);
      const page = await inPage(`() => ({ text: document.body.innerText, adv: !!document.getElementById("advancedButton"), ret: !!document.getElementById("returnButton"), exc: !!document.getElementById("exceptionDialogButton") })`);
      check("sayfa metni: 'Vento' adı geçiyor, Nightly/Firefox yok", /Vento/.test(page.text) && !/Nightly|Firefox/.test(page.text), String(page.text).slice(0, 160).replace(/\n/g, " | "));
      check("düğmeler: Gelişmiş, Geri dön, İstisna", page.adv && page.ret && page.exc, JSON.stringify(page));

      await inPage(`() => document.getElementById("advancedButton").click()`);
      const adv = await inPage(`() => { const b = document.getElementById("exceptionDialogButton"); return { hidden: b.closest("[hidden]") ? "gizli" : "gorunur", disabled: b.disabled }; }`);
      check("'Gelişmiş' → 'Riski kabul et' düğmesi görünür", adv.hidden === "gorunur", JSON.stringify(adv));

      await wait(async () => (await inPage(`() => !document.getElementById("exceptionDialogButton").disabled`)) === true, 8000);
      await inPage(`() => document.getElementById("exceptionDialogButton").click()`);
      check("riski kabul edince sayfa gerçekten yüklendi", await wait(() => tab.title === "Güvenli sayfa", 15000), `"${tab.title}" ${docURI().slice(0, 50)}`);
      check("adres çubuğu HTTPS adresini gösteriyor (hata adresi değil)", tab.url === `${https}/`, tab.url);
      check("istisna saklandı (aynı oturumda yeniden sorulmaz)", await (async () => { load(`${https}/?ikinci`); return wait(() => tab.title === "Güvenli sayfa" && tab.url.endsWith("?ikinci"), 15000); })());
      overrides.clearAllOverrides();

      // "Geri dön": önceki sayfaya (temiz geçmiş: data: sayfası → sertifika hatası → geri)
      load("data:text/html,<title>onceki</title>");
      await wait(() => tab.title === "onceki" && !tab.loading, 10000);
      load(`${https}/?geri`);
      await wait(() => docURI().startsWith("about:certerror"), 15000);
      await inPage(`() => document.getElementById("returnButton").click()`);
      check("'Geri dön' önceki sayfaya götürdü", await wait(() => tab.title === "onceki" && !docURI().startsWith("about:certerror"), 10000), `${docURI().slice(0, 40)} "${tab.title}"`);
      Services.prefs.clearUserPref("security.dialog_enable_delay");
      tabs.close(tab);
    }

    // ===================== HTTP kimlik doğrulama (gerçek sunucu, uçtan uca) =====================
    {
      const llm = Services.env.get("VENTO_ESIN_ENDPOINT").replace(/\/v1$/, "");
      const D = Vento.dialogs;
      const tab = tabs.open("about:blank");
      const load = u => tab.browser.fixupAndLoadURIString(u, { triggeringPrincipal: Vento.SYSTEM_PRINCIPAL });
      const card = () => D.state.shown?.ui?.card;
      const visible = () => !document.getElementById("dialog-layer").hidden;
      const btn = i => card().querySelector(`button[data-index="${i}"]`);
      const attempts = async () => (await (await fetch(`${llm}/stats`)).json()).authAttempts ?? [];
      const clearLogins = () => Services.obs.notifyObservers(null, "net:clear-active-logins");
      clearLogins();

      load(`${llm}/kimlik/bir`);
      check("korumalı sayfa: kimlik diyaloğu açıldı", await wait(() => visible() && card()?.querySelector(".dlg-user") && card().querySelector(".dlg-pass"), 15000));
      const text = card()?.textContent ?? "";
      // Güvenlik: realm sunucunun kontrolünde (sahte istem metni yazılabilir) → Firefox yalnız proxy için gösterir; biz de göstermemeliyiz
      check("diyalog: site (127.0.0.1) görünür, sunucunun yazdığı alan adı (realm) GÖRÜNMEZ", text.includes("127.0.0.1") && !text.includes("Test Alani"), text.slice(0, 160));
      check("diyalog: http için 'güvensiz' uyarısı var", !!card()?.querySelector(".dlg-warn, .dlg-insecure") || /güvens|şifrelen|encrypt/i.test(text), text.slice(0, 160));
      check("parola alanı gizli (type=password)", card()?.querySelector(".dlg-pass")?.type === "password");

      // yanlış parola → sunucu yine 401 → diyalog YENİDEN açılır
      card().querySelector(".dlg-user").value = "can";
      card().querySelector(".dlg-pass").value = "yanlis";
      btn(0).click();
      check("yanlış parola: diyalog yeniden sordu", await wait(() => visible() && card()?.querySelector(".dlg-pass")?.value === "", 15000));

      card().querySelector(".dlg-user").value = "can";
      card().querySelector(".dlg-pass").value = "gizli";
      btn(0).click();
      check("doğru parola: sayfa yüklendi", await wait(() => tab.title === "Giris yapildi" && !visible(), 15000), `"${tab.title}"`);
      const a1 = await attempts();
      check("sunucu: önce kimliksiz, sonra yanlış, sonra doğru", a1.length >= 3 && !a1[0].sent && a1.some(a => a.sent && !a.ok) && a1.at(-1).ok, JSON.stringify(a1));

      // başarılı girişten sonra aynı alanda yeniden sorulmaz
      load(`${llm}/kimlik/iki`);
      check("giriş sonrası aynı alanda diyalog çıkmadı", await wait(() => tab.title === "Giris yapildi" && tab.url.endsWith("/iki"), 15000) && !visible(), `"${tab.title}" diyalog=${visible()}`);

      // iptal → 401 sayfası görünür, diyalog kapanır
      clearLogins();
      load(`${llm}/kimlik/uc`);
      await wait(() => visible() && card()?.querySelector(".dlg-user"), 15000);
      btn(1).click();
      check("İptal: sunucunun 401 sayfası gösterildi, diyalog kapandı", await wait(() => tab.title === "Yetkisiz" && !visible(), 15000), `"${tab.title}" diyalog=${visible()}`);
      const a2 = await attempts();
      check("İptal: iptalden sonra sunucuya parola GİTMEDİ", !a2.filter(a => a.url.endsWith("/uc")).some(a => a.sent), JSON.stringify(a2.filter(a => a.url.endsWith("/uc"))));

      clearLogins();
      tabs.close(tab);
    }

    // ===================== Dosya seçici (<input type=file>) =====================
    // Yerel macOS paneli başsız testte tıklanamaz → kayıtlı sahte seçici. Ölçülen: sayfa seçiciyi gerçekten çağırıyor mu,
    // mod/filtre doğru mu, seçilen dosya sayfaya ulaşıyor mu, İptal'de sayfa değişmiyor mu.
    {
      const llm = Services.env.get("VENTO_ESIN_ENDPOINT").replace(/\/v1$/, "");
      const tab = tabs.open("about:blank");
      const load = u => tab.browser.fixupAndLoadURIString(u, { triggeringPrincipal: Vento.SYSTEM_PRINCIPAL });
      const inPage = (body, ms = 8000) => new Promise(resolve => {
        const id = "vento:dosya:" + Math.random();
        const mm = tab.browser.messageManager;
        mm.addMessageListener(id, m => resolve(m.data), { once: true });
        mm.loadFrameScript("data:,(" + encodeURIComponent(`function(){ Promise.resolve().then(() => (${body})()).then(r => sendAsyncMessage(${JSON.stringify(id)}, r), e => sendAsyncMessage(${JSON.stringify(id)}, "HATA " + e)); }`) + ")()", false);
        setTimeout(() => resolve("ZAMAN ASIMI"), ms);
      });
      // Gerçek kullanıcı etkinleştirmesiyle (aksi hâlde sayfa seçici açamaz) girdiye tıklar
      const tikla = id => inPage(`() => { content.document.notifyUserGestureActivation(); content.document.getElementById("${id}").click(); return true; }`);
      const tmp = name => PathUtils.join(PathUtils.tempDir, name);
      const nsFile = path => { const f = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile); f.initWithPath(path); return f; };
      await IOUtils.writeUTF8(tmp("vento-test-a.txt"), "merhaba");
      await IOUtils.writeUTF8(tmp("vento-test-b.txt"), "dunya");

      // Gerçek (yerel) seçici bileşeni var ve penceremizle başlatılabiliyor
      {
        let ok = false, err = "";
        try {
          const fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
          fp.init(window.browsingContext, "Dosya sec", Ci.nsIFilePicker.modeOpen);
          ok = true;
        } catch (e) { err = String(e); }
        check("yerel dosya seçici bileşeni var ve pencereyle başlatılıyor", ok, err);
      }

      // -- sahte seçici
      const registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
      const CONTRACT = "@mozilla.org/filepicker;1";
      const oldCID = registrar.contractIDToCID(CONTRACT);
      const newCID = Services.uuid.generateUUID();
      const mock = { calls: [], files: [], result: Ci.nsIFilePicker.returnOK };
      class Picker {
        QueryInterface = ChromeUtils.generateQI(["nsIFilePicker"]);
        defaultString = ""; defaultExtension = ""; filterIndex = 0; displayDirectory = null; displaySpecialDirectory = "";
        okButtonLabel = ""; addToRecentDocs = false;
        init(bc, title, mode) { this.rec = { title, mode, filters: [], masks: 0, hasBC: !!bc }; mock.calls.push(this.rec); this.mode = mode; }
        appendFilter(title, filter) { this.rec.filters.push(filter); }
        appendFilters(mask) { this.rec.masks |= mask; }
        get file() { return mock.files[0] ?? null; }
        get fileURL() { return mock.files[0] ? Services.io.newFileURI(mock.files[0]) : null; }
        get files() { return mock.files[Symbol.iterator](); }
        get domFileOrDirectory() { return null; }
        get domFileOrDirectoryEnumerator() { return [][Symbol.iterator](); }
        get domFilesInWebKitDirectory() { return [][Symbol.iterator](); }
        open(cb) { Services.tm.dispatchToMainThread(() => cb.done(mock.result)); }
      }
      const factory = { createInstance: iid => new Picker().QueryInterface(iid), QueryInterface: ChromeUtils.generateQI(["nsIFactory"]) };
      registrar.registerFactory(newCID, "VentoTestFilePicker", CONTRACT, factory);
      try {
        load(`${llm}/dosya.html`);
        await wait(() => tab.title === "hazir", 15000);

        // tek dosya
        mock.files = [nsFile(tmp("vento-test-a.txt"))];
        await tikla("tek");
        check("tek dosya: sayfa seçiciyi çağırdı (Aç modu, başlık var, pencere bağlı)", await wait(() => mock.calls.length === 1, 10000) && mock.calls[0].mode === Ci.nsIFilePicker.modeOpen && mock.calls[0].hasBC && mock.calls[0].title !== "", JSON.stringify(mock.calls[0]));
        check("tek dosya: ad ve İÇERİK sayfaya ulaştı", await wait(() => tab.title === "dosya:tek:vento-test-a.txt=merhaba", 10000), `"${tab.title}"`);

        // İptal: sayfa değişmemeli
        mock.result = Ci.nsIFilePicker.returnCancel;
        mock.files = [];
        load(`${llm}/dosya.html?iptal`);
        await wait(() => tab.title === "hazir" && tab.url.endsWith("?iptal"), 15000);
        const n0 = mock.calls.length;
        await tikla("tek");
        await wait(() => mock.calls.length === n0 + 1, 10000);
        await new Promise(r => setTimeout(r, 800));
        const secim = await inPage(`() => content.document.getElementById("tek").files.length`);
        check("İptal: seçici açıldı ama sayfada dosya seçilmedi, başlık değişmedi", secim === 0 && tab.title === "hazir", `dosya=${secim} başlık="${tab.title}"`);

        // çoklu
        mock.result = Ci.nsIFilePicker.returnOK;
        mock.files = [nsFile(tmp("vento-test-a.txt")), nsFile(tmp("vento-test-b.txt"))];
        const n1 = mock.calls.length;
        await tikla("cok");
        check("çoklu: Aç-çoklu modu istendi", await wait(() => mock.calls.length === n1 + 1, 10000) && mock.calls.at(-1).mode === Ci.nsIFilePicker.modeOpenMultiple, String(mock.calls.at(-1)?.mode));
        check("çoklu: iki dosya da sayfaya ulaştı", await wait(() => tab.title === "dosya:cok:vento-test-a.txt=merhaba|vento-test-b.txt=dunya", 10000), `"${tab.title}"`);

        // accept="…": filtre seçiciye iletilir
        mock.files = [nsFile(tmp("vento-test-a.txt"))];
        const n2 = mock.calls.length;
        await tikla("acc");
        await wait(() => mock.calls.length === n2 + 1, 10000);
        const rec = mock.calls.at(-1);
        check("accept='.txt,image/png': filtre seçiciye iletildi", rec.filters.some(f => /\*\.txt/.test(f)) || rec.masks !== 0, JSON.stringify(rec));

        // klasör seçimi
        const n3 = mock.calls.length;
        mock.files = [nsFile(PathUtils.tempDir)];
        await tikla("dir");
        check("webkitdirectory: klasör seçme modu istendi", await wait(() => mock.calls.length === n3 + 1, 10000) && mock.calls.at(-1).mode === Ci.nsIFilePicker.modeGetFolder, String(mock.calls.at(-1)?.mode));
      } finally {
        registrar.unregisterFactory(newCID, factory);
        if (oldCID) { registrar.registerFactory(oldCID, "", CONTRACT, null); }
      }
      await IOUtils.remove(tmp("vento-test-a.txt"), { ignoreAbsent: true });
      await IOUtils.remove(tmp("vento-test-b.txt"), { ignoreAbsent: true });
      tabs.close(tab);
    }

    // ===================== Yazdırma =====================
    // Yerel macOS paneli başsız testte tıklanamaz → "PDF'e kaydet" sanal yazıcısı + sessiz kip: gerçek bir PDF üretilip üretilmediği ölçülür.
    {
      const llm = Services.env.get("VENTO_ESIN_ENDPOINT").replace(/\/v1$/, "");
      const tab = tabs.open("about:blank");
      const load = u => tab.browser.fixupAndLoadURIString(u, { triggeringPrincipal: Vento.SYSTEM_PRINCIPAL });
      const pdf = name => PathUtils.join(PathUtils.tempDir, name);
      const PRINTER = "Mozilla Save to PDF";
      const pk = "print.printer_Mozilla_Save_to_PDF.";
      const setOut = path => {
        Services.prefs.setStringPref("print_printer", PRINTER);
        Services.prefs.setBoolPref(pk + "print_to_file", true);
        Services.prefs.setStringPref(pk + "print_to_filename", path);
      };
      const isPDF = async path => {
        try {
          const bytes = await IOUtils.read(path, { maxBytes: 5 });
          return new TextDecoder().decode(bytes) === "%PDF-" && (await IOUtils.stat(path)).size > 1000;
        } catch (e) { return false; }
      };
      const browsersBefore = document.querySelectorAll("browser").length;

      check("yazdırma katmanı yüklenebiliyor (PrintUtils) ve sistem paneli tercih edilmiş", typeof Vento.loadPrintUtils()?.startPrintWindow === "function" && Services.prefs.getBoolPref("print.prefer_system_dialog") === true);
      const key = document.getElementById("key_print");
      check("⌘P kısayolu ve Dosya ▸ Yazdır… menüsü bağlı", key?.getAttribute("key") === "p" && key.getAttribute("modifiers") === "accel" && document.getElementById("menu_print")?.getAttribute("command") === "cmd_print");
      check("boş sekmede yazdırma başlamaz (false)", Vento.print(tab) === false);

      Services.prefs.setBoolPref("print.always_print_silent", true);
      try {
        // ⌘P yolu
        load(`${llm}/yazdir.html`);
        await wait(() => tab.title === "Yazdirma sayfasi" && !tab.loading, 15000);
        await IOUtils.remove(pdf("vento-yazdir-a.pdf"), { ignoreAbsent: true });
        setOut(pdf("vento-yazdir-a.pdf"));
        check("⌘P: yazdırma başladı (true)", Vento.print() === true);
        check("⌘P: gerçek bir PDF üretildi (%PDF-, >1 KB)", await wait(() => isPDF(pdf("vento-yazdir-a.pdf")), 20000), String((await IOUtils.exists(pdf("vento-yazdir-a.pdf"))) && (await IOUtils.stat(pdf("vento-yazdir-a.pdf"))).size));

        // window.print(): sayfanın kendisi çağırır
        await IOUtils.remove(pdf("vento-yazdir-b.pdf"), { ignoreAbsent: true });
        setOut(pdf("vento-yazdir-b.pdf"));
        load(`${llm}/yazdir.html?pencere`);
        check("window.print(): gerçek bir PDF üretildi", await wait(() => isPDF(pdf("vento-yazdir-b.pdf")), 25000), String(await IOUtils.exists(pdf("vento-yazdir-b.pdf"))));
        await new Promise(r => setTimeout(r, 1500));
        check("yazdırma sonrası sayfa hâlâ yüklü ve sekme sayısı aynı", tab.title === "Yazdirma sayfasi" && tabs.all.includes(tab), `"${tab.title}"`);
        check("yazdırma için açılan geçici tarayıcılar temizlendi", document.querySelectorAll("browser").length <= browsersBefore + 0, `${document.querySelectorAll("browser").length} / önce ${browsersBefore}`);
      } finally {
        Services.prefs.clearUserPref("print.always_print_silent");
        Services.prefs.clearUserPref("print_printer");
        Services.prefs.clearUserPref(pk + "print_to_file");
        Services.prefs.clearUserPref(pk + "print_to_filename");
        await IOUtils.remove(pdf("vento-yazdir-a.pdf"), { ignoreAbsent: true });
        await IOUtils.remove(pdf("vento-yazdir-b.pdf"), { ignoreAbsent: true });
      }
      tabs.close(tab);
    }

    // ===================== Kapatılan sekmeyi yeniden aç (⌘⇧T) =====================
    {
      const llm = Services.env.get("VENTO_ESIN_ENDPOINT").replace(/\/v1$/, "");
      const u = n => `${llm}/kapali/${n}`;
      const cmd = document.getElementById("cmd_reopenTab");
      tabs.forgetClosed(); // önceki testlerin kapattığı sekmeler karışmasın
      const base = tabs.all.length;
      const open = (n, select = false) => tabs.open(u(n), { select, lazy: { url: u(n), title: "Sayfa " + n } });
      const key = document.getElementById("key_reopenTab");
      check("⌘⇧T kısayolu ve Geçmiş menüsü bağlı", key?.getAttribute("key") === "t" && key.getAttribute("modifiers") === "accel,shift" && document.getElementById("menu_reopenTab")?.getAttribute("command") === "cmd_reopenTab");
      check("kapatılmış sekme yokken komut devre dışı, reopenClosed() null", cmd.hasAttribute("disabled") && tabs.closed.length === 0 && tabs.reopenClosed() === null);

      const [A, B, C] = [open("a"), open("b"), open("c")];
      tabs.close(B);
      check("kapatılan sekme yığına girdi (adres + başlık + sıra)", tabs.closed.length === 1 && tabs.closed[0].url === u("b") && tabs.closed[0].title === "Sayfa b" && tabs.closed[0].index === base + 1, JSON.stringify(tabs.closed));
      check("komut etkinleşti", !cmd.hasAttribute("disabled"));

      const back = tabs.reopenClosed();
      check("⌘⇧T: sekme ESKİ yerine döndü (A ile C arasında) ve seçildi", back && tabs.all.indexOf(back) === base + 1 && tabs.all[base] === A && tabs.all[base + 2] === C && tabs.selected === back, String(tabs.all.indexOf(back)));
      check("yeniden açılan sekmenin sayfası yüklendi", await wait(() => back.url === u("b") && back.browser.currentURI?.spec === u("b"), 15000), back.url);
      check("yığın boşaldı, komut yine devre dışı", tabs.closed.length === 0 && cmd.hasAttribute("disabled"));

      // sıra: en son kapatılan önce döner
      tabs.close(A); tabs.close(C);
      check("en yeni başta: C, sonra A", tabs.closed[0].url === u("c") && tabs.closed[1].url === u("a"), JSON.stringify(tabs.closed.map(c => c.url)));
      const r1 = tabs.reopenClosed();
      const r2 = tabs.reopenClosed();
      check("ilk ⌘⇧T C'yi, ikincisi A'yı açar, yığın boşalır", tabs.closed.length === 0 && !!r1 && !!r2 && await wait(() => r1.url === u("c") && r2.url === u("a"), 15000), `${r1?.url} ${r2?.url}`);

      // yalnız gerçek sayfalar: boş sekme, data: ve hata sayfası yığına girmez
      const blank = tabs.open("about:blank", { select: false });
      const dat = tabs.open("data:text/html,<title>d</title>", { select: false });
      await wait(() => dat.url.startsWith("data:"), 10000);
      tabs.close(blank); tabs.close(dat);
      check("boş sekme ve data: sekmesi yığına girmez", tabs.closed.length === 0, JSON.stringify(tabs.closed));

      // sınır: 25
      const many = Array.from({ length: 30 }, (_, i) => open("m" + i));
      many.forEach(t => tabs.close(t));
      check("yığın en fazla 25 kayıt tutar, en yenisi başta", tabs.closed.length === 25 && tabs.closed[0].url === u("m29") && tabs.closed.at(-1).url === u("m5"), `${tabs.closed.length} ${tabs.closed[0]?.url.slice(-3)}`);
      tabs.forgetClosed();
      check("forgetClosed: yığın boşaldı ve komut devre dışı", tabs.closed.length === 0 && cmd.hasAttribute("disabled"));
      for (const t of tabs.all.slice(base)) { tabs.close(t); }
      tabs.forgetClosed();
    }

    // ===================== Sekme simgeleri (favicon) =====================
    {
      const llm = Services.env.get("VENTO_ESIN_ENDPOINT").replace(/\/v1$/, "");
      const tab = tabs.selected;
      const load = u => tab.browser.fixupAndLoadURIString(u, { triggeringPrincipal: Vento.SYSTEM_PRINCIPAL });
      const mark = () => document.querySelector(".tab[selected] .tab-mark");
      const img = () => mark()?.querySelector("img");

      load(`${llm}/simge/link.html`);
      check("<link rel=icon>: sekme simgesi geldi (data:image)", await wait(() => tab.icon.startsWith("data:image/"), 15000), tab.icon.slice(0, 40));
      const linkIcon = tab.icon;
      check("simge sekme şeridinde <img> olarak çizildi", await wait(() => !tab.loading && img()?.complete && img().naturalWidth === 16), `${img()?.naturalWidth}`);
      check("simge varken harf işareti yok, has-icon sınıfı var", mark()?.classList.contains("has-icon") && !mark().textContent.trim());

      load(`${llm}/simge/kok.html`);
      check("bağlantısız sayfa: /favicon.ico'ya düşüldü", await wait(() => tab.icon.startsWith("data:image/") && tab.icon !== linkIcon, 15000), tab.icon.slice(0, 40));

      load("data:text/html,<title>x</title>");
      check("başka sayfaya gidince eski site simgesi kalmadı", await wait(() => tab.icon === "" && !tab.loading), tab.icon.slice(0, 40));
      check("simge yokken harf işareti geri geldi", await wait(() => !img() && mark()?.textContent.trim() !== "" && !mark().classList.contains("has-icon")));

      Vento.tabs.setIcon(tab.browser, "data:image/png;base64,AAAA");
      check("bozuk simge → sessizce harf işaretine döner", await wait(() => tab.icon === "" && !img() && mark()?.textContent.trim() !== ""), tab.icon);

      // Ziyaret edilen sayfanın simgesi Places'e saklanır → oturumdan tembel açılan sekme yüklenmeden simgesini gösterir
      load(`${llm}/simge/link.html`);
      await wait(() => tab.icon.startsWith("data:image/") && !tab.loading, 15000);
      await new Promise(r => setTimeout(r, 1500)); // Places yazımı asenkron
      const before = tabs.all.length;
      Vento.session.restore({ selected: 1, tabs: [{ url: `${llm}/simge/link.html`, title: "Bağlantılı" }, { url: "http://127.0.0.1:1/bos", title: "b" }] });
      const cached = tabs.all[before];
      check("tembel sekme: yüklenmeden önbellekten simge geldi", await wait(() => cached.pending && cached.icon.startsWith("data:image/"), 10000), `bekliyor=${!!cached.pending} icon=${cached.icon.slice(0, 30)}`);
      for (const t of tabs.all.slice(before)) { tabs.close(t); }
      load("data:text/html,<title>x</title>");
      await wait(() => tab.icon === "" && !tab.loading);
    }

    // ===================== Oturum geri yükleme =====================
    {
      const S = Vento.session;
      const llm = Services.env.get("VENTO_ESIN_ENDPOINT").replace(/\/v1$/, "");
      const u = n => `${llm}/oturum/${n}`;
      // Temiz başlangıç: seçili sekme dışındakileri kapat
      for (const t of tabs.all) { if (t !== tabs.selected) { tabs.close(t); } }
      const first = tabs.selected;
      first.browser.fixupAndLoadURIString("data:text/html,<title>x</title>", { triggeringPrincipal: Vento.SYSTEM_PRINCIPAL });
      await wait(() => first.url.startsWith("data:"));

      // -- capture: yalnız gerçek sayfalar, seçili indeks saklanabilir sekmelere göre
      const A = tabs.open(u("a"), { select: false });
      const B = tabs.open(u("b"), { select: true });
      const C = tabs.open(u("c"), { select: false });
      await wait(() => [A, B, C].every(t => t.url === t.browser.currentURI?.spec && t.url.startsWith("http")), 15000);
      const cap = S.capture();
      check("capture: data: sekmesi dışarıda, 3 http sekmesi", cap.tabs.length === 3 && cap.tabs.every(t => t.url.startsWith(llm)), JSON.stringify(cap.tabs.map(t => t.url)));
      check("capture: seçili indeks saklanabilir sekmelere göre (B → 1)", cap.selected === 1, String(cap.selected));

      // -- diske yazma + okuma
      tabs.select(C);
      await S.flush();
      const back = await S.read();
      check("flush + read: aynı durum diske gitti", back?.tabs.length === 3 && back.selected === 2 && back.tabs[1].url === u("b"), JSON.stringify(back));

      // -- bozuk dosya → yedek
      await S.flush(); // ikinci yazma: ilk dosya .bak olur
      check(".bak yedeği oluştu", await IOUtils.exists(S.path + ".bak"));
      await IOUtils.writeUTF8(S.path, "{ bozuk json");
      const fallback = await S.read();
      check("ana dosya bozukken yedekten okundu", fallback?.tabs.length === 3, JSON.stringify(fallback));

      // -- kurcalanmış dosya: tehlikeli şemalar süzülür
      await IOUtils.writeJSON(S.path, { version: 1, selected: 9, tabs: [{ url: "javascript:alert(1)" }, { url: "chrome://vento/content/vento.xhtml" }, { url: u("ok"), title: "t" }, { url: 5 }] });
      const tampered = await S.read();
      check("javascript:/chrome:/tip hatalı girdiler süzüldü", tampered?.tabs.length === 1 && tampered.tabs[0].url === u("ok"), JSON.stringify(tampered));
      check("geçersiz sürüm/boş durum → null", (await IOUtils.writeJSON(S.path, { version: 99, tabs: [] }), await (async () => { await IOUtils.remove(S.path + ".bak", { ignoreAbsent: true }); return (await S.read()) === null; })()));

      // -- restore: seçili yüklenir, diğerleri bekler
      const before = tabs.all.length;
      const state = { selected: 1, tabs: [{ url: u("x"), title: "Sayfa X" }, { url: u("y"), title: "Sayfa Y" }, { url: u("z"), title: "Sayfa Z" }] };
      check("restore: true döner", S.restore(state) === true);
      const [X, Y, Z] = tabs.all.slice(before);
      check("restore: 3 sekme eklendi, seçili olan Y", tabs.all.length === before + 3 && tabs.selected === Y);
      check("restore: Y yüklendi, X ve Z bekliyor", !Y.pending && X.pending === u("x") && Z.pending === u("z"));
      check("restore: bekleyen sekmelerde başlık ve adres şeritte", X.title === "Sayfa X" && X.url === u("x") && X.label === "Sayfa X");
      check("restore: Y'nin sayfası yüklendi", await wait(() => Y.browser.currentURI?.spec === u("y"), 15000), Y.browser.currentURI?.spec);
      check("restore: bekleyen X'in sayfası HENÜZ yüklenmedi", X.browser.currentURI?.spec !== u("x"), X.browser.currentURI?.spec);
      tabs.select(Z);
      check("restore: Z'ye geçince yüklendi", !Z.pending && await wait(() => Z.browser.currentURI?.spec === u("z"), 15000), Z.browser.currentURI?.spec);
      // adres çubuğundan gezinme beklemeyi iptal eder (eski adres sonradan yüklenip ezmesin)
      tabs.navigate(X, u("q"));
      check("bekleyen sekmede başka adrese gidince bekleme iptal", X.pending === null);
      for (const t of [X, Y, Z]) { tabs.close(t); }

      // -- komut satırı adresi: ayrı sekme, o seçili
      const n0 = tabs.all.length;
      S.restore({ selected: 0, tabs: [{ url: u("m"), title: "M" }] }, u("extra"));
      check("restore + -url: ek adres ayrı sekmede ve seçili, geri gelen sekme bekliyor", tabs.all.length === n0 + 2 && tabs.selected === tabs.all[n0 + 1] && tabs.all[n0].pending === u("m"));
      check("restore + -url: ek adres yüklendi", await wait(() => tabs.selected.url === u("extra"), 15000), tabs.selected.url);
      tabs.close(tabs.all[tabs.all.length - 1]);
      tabs.close(tabs.all[tabs.all.length - 1]);
      check("restore(null) ve boş durum: false", S.restore(null) === false && S.restore({ selected: 0, tabs: [] }) === false);

      // -- Son durum: 2. aşamada (yeniden başlatma) doğrulanır. Başlıklar sunucunun döndürdüğü gerçek sayfa başlığıdır.
      for (const t of tabs.all) { if (t !== tabs.selected) { tabs.close(t); } }
      const keep = tabs.selected;
      const [a2, b2, c2] = [tabs.open(u("a"), { select: false }), tabs.open(u("b"), { select: false }), tabs.open(u("c"), { select: false })];
      await wait(() => [a2, b2, c2].every(t => !t.loading && t.browser.currentURI?.spec === t.url && t.url.startsWith("http")), 15000);
      await wait(() => a2.title === "Sayfa A" && c2.title === "Sayfa C", 10000); // başlıklar sunucudan gerçek sayfa başlığı olarak gelir
      tabs.close(keep); // boş/data sekmesi geri gelmesin
      tabs.select(c2);
      await S.flush();       // ara durum: seçili C
      tabs.select(b2);       // seçili B — ARTIK yazılmayı beklemeden çıkıyoruz: kapanış engelleyicisi yazmalı
      check("kapanış öncesi: 3 sekme, seçili B", tabs.all.length === 3 && tabs.selected === b2);
    }
  } catch (e) {
    check("öz-test istisna fırlatmadı", false, String(e) + "\n" + (e.stack || ""));
  }

  const pass = results.filter(Boolean).length;
  Vento.trace(`ÖZET ${pass}/${results.length} geçti`);
  Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
})();
