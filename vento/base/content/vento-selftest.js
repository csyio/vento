"use strict";

// Self-test: runs with VENTO_SELFTEST=1. Results are written to the VENTO_TRACE file, then the app quits.
// Uses the real network (example.com/org/net). Run with `tools/selftest.sh`.

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
        // condition isn't ready yet
      }
      await new Promise(r => setTimeout(r, 100));
    }
    return false;
  };

  // ===== Phase 2: reopened with the same profile -> the session should be back (tools/selftest.sh runs it a second time) =====
  if (Services.env.exists("VENTO_SELFTEST_PHASE2")) {
    try {
      const tabs = Vento.tabs;
      const llm = Services.env.get("VENTO_ESIN_ENDPOINT").replace(/\/v1$/, "");
      const u = n => `${llm}/oturum/${n}`;
      check("reopen: 3 tabs came back (no extra blank tab)", tabs.all.length === 3, String(tabs.all.length));
      check("URLs and order are correct", tabs.all.map(t => t.url).join(" ") === [u("a"), u("b"), u("c")].join(" "), tabs.all.map(t => t.url).join(" "));
      check("selected tab is B (last state written on quit)", tabs.selected === tabs.all[1], String(tabs.all.indexOf(tabs.selected)));
      check("selected tab is loaded, the others are pending", !tabs.all[1].pending && !!tabs.all[0].pending && !!tabs.all[2].pending, tabs.all.map(t => t.pending ? "pending" : "loaded").join(","));
      check("title kept on pending tabs", tabs.all[0].title === "Sayfa A" && tabs.all[2].title === "Sayfa C", tabs.all.map(t => t.title).join("|"));
      check("selected tab's page actually loaded", await wait(() => tabs.all[1].browser.currentURI?.spec === u("b"), 15000), tabs.all[1].browser.currentURI?.spec);
      tabs.select(tabs.all[0]);
      check("page loaded after switching to a pending tab", !tabs.all[0].pending && await wait(() => tabs.all[0].browser.currentURI?.spec === u("a"), 15000), tabs.all[0].browser.currentURI?.spec);
    } catch (e) {
      check("phase 2 threw no exception", false, String(e) + "\n" + (e.stack || ""));
    }
    Vento.trace(`ÖZET ${results.filter(Boolean).length}/${results.length} geçti`);
    Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
    return;
  }

  try {
    const tabs = Vento.tabs;

    // -- window and shell
    check("1 tab at startup", tabs.all.length === 1, String(tabs.all.length));
    check("native menu source exists", !!document.getElementById("main-menubar"));
    // Note: can't be measured in headless mode, where the custom title bar is really drawn (outer-inner is always 0).
    // We only test that the attribute exists; visual verification is done by eye.
    check("customtitlebar attribute exists", document.documentElement.getAttribute("customtitlebar") === "true");
    {
      const bb = document.querySelector(".titlebar-buttonbox").getBoundingClientRect();
      check("traffic lights box takes up space", bb.width > 40 && bb.height > 8, `${Math.round(bb.width)}x${Math.round(bb.height)} @${Math.round(bb.left)},${Math.round(bb.top)}`);
    }
    check("start view on a blank tab", document.getElementById("stage").hasAttribute("blank"));

    // -- resolving (pure)
    check("resolve: domain -> https", Vento.resolveInput("example.com/x") === "https://example.com/x");
    check("resolve: localhost -> http", Vento.resolveInput("localhost:3000") === "http://localhost:3000");
    check("resolve: search", Vento.resolveInput("rüzgar nedir") === "https://duckduckgo.com/?q=r%C3%BCzgar%20nedir");
    check("resolve: javascript: is not a URL", !Vento.resolveInput("javascript:alert(1)").startsWith("javascript:"));
    check("resolve: chrome: is not a URL", !Vento.resolveInput("chrome://browser/content/x").startsWith("chrome:"));

    // -- navigation
    const t1 = tabs.selected;
    tabs.navigate(t1, "example.com");
    check("t1 loaded example.com", await wait(() => t1.title === "Example Domain"), t1.title);
    check("t1 URL is https://example.com/", t1.url === "https://example.com/", t1.url);
    check("start view hidden", !document.getElementById("stage").hasAttribute("blank"));

    // -- second tab, only one is visible
    const t2 = tabs.open("https://example.org");
    check("t2 selected", tabs.selected === t2);
    check("t2 loaded", await wait(() => /Example Domain/.test(t2.title)), t2.title);
    check("t1 hidden / t2 visible", t1.browser.hasAttribute("hidden-tab") && !t2.browser.hasAttribute("hidden-tab"));
    tabs.select(t1);
    check("switched back to t1", tabs.selected === t1 && !t1.browser.hasAttribute("hidden-tab") && t2.browser.hasAttribute("hidden-tab"));

    // -- back / forward
    check("no back at first", !t1.canGoBack);
    tabs.navigate(t1, "example.net");
    check("t1 went to example.net", await wait(() => t1.url.includes("example.net") && !t1.loading), t1.url);
    check("back became available", await wait(() => t1.canGoBack));
    tabs.back(t1);
    check("went back", await wait(() => t1.url === "https://example.com/"), t1.url);
    check("forward became available", await wait(() => t1.canGoForward));

    // -- window.open / target=_blank path
    const before = tabs.all.length;
    const bc = window.browserDOMWindow.openURI(
      Services.io.newURI("https://example.com/"), null, Ci.nsIBrowserDOMWindow.OPEN_NEWTAB, 0,
      Vento.SYSTEM_PRINCIPAL, null
    );
    check("browserDOMWindow.openURI opened a new tab", tabs.all.length === before + 1 && !!bc, String(tabs.all.length));
    const t3 = tabs.selected;
    // -- layout: "+" must sit right next to the last tab (not drift right)
    {
      const r = id => document.getElementById(id).getBoundingClientRect();
      const lastTab = document.getElementById("tabs").lastElementChild.getBoundingClientRect();
      const plus = r("newtab");
      const gap = Math.round(plus.left - lastTab.right);
      check("+ button is right next to the last tab", gap >= 0 && gap < 24,
        `gap=${gap}px; tabs=[${Math.round(r("tabs").left)}..${Math.round(r("tabs").right)}] last=[${Math.round(lastTab.left)}..${Math.round(lastTab.right)}] +=[${Math.round(plus.left)}..${Math.round(plus.right)}] strip=${Math.round(r("tabstrip").width)}`);
    }
    // A long title must not inflate the container's natural width and push the "+" button right (seen in a real window).
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
      check("+ stays right next to the tab with long titles too", gap >= 0 && gap < 24, `gap=${gap}px`);
    }
    check("openURI loaded the page", await wait(() => t3.title === "Example Domain"), t3.title);

    // -- closing
    tabs.close(t3);
    tabs.close(t2);
    check("1 tab left after closing", tabs.all.length === 1 && tabs.selected === t1, String(tabs.all.length));

    // -- smart bar
    Vento.ui.focusBar();
    check("⌘L focuses the bar", document.activeElement === document.getElementById("smartbar-input"));
    check("full URL shows on focus", document.getElementById("smartbar-input").value === "https://example.com/",
      document.getElementById("smartbar-input").value);
    Vento.ui.focusPage();
    check("short form when focus returns to the page", await wait(() => document.getElementById("smartbar-input").value === "example.com"),
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

      // -- panel and layout
      Services.prefs.setBoolPref("vento.esin.consented", false);
      const stageBefore = $("stage").getBoundingClientRect().width;
      Vento.esin.open();
      const er = $("esin").getBoundingClientRect();
      const sr = $("stage").getBoundingClientRect();
      check("Esin panel is next to the page card", er.left >= sr.right - 1 && Math.round(er.width) === 380,
        `panel=[${Math.round(er.left)}..${Math.round(er.right)}] card right=${Math.round(sr.right)}`);
      check("card narrowed when the panel opened", sr.width < stageBefore, `${Math.round(stageBefore)} → ${Math.round(sr.width)}`);
      check("open page was added to the context on open (1 chip)", $("esin-chips").children.length === 1);

      // -- consent gate: nothing may be sent without consent
      check("consent card is visible", !$("esin-consent").hidden);
      Vento.esin.send("Merhaba?");
      await new Promise(r => setTimeout(r, 300));
      check("unconsented send did not reach the provider", (await reqs()).length === 0);
      $("esin-consent-ok").click();
      check("pending question was sent after consent", await wait(async () => (await reqs()).length === 1));
      check("reply arrived via stream", await wait(() => botText().includes("Soru: Merhaba?") && idle()), botText());
      const r1 = (await reqs())[0];
      check("request: page URL + question + system prompt", r1.urls.join() === "https://example.com/" && r1.question === "Merhaba?" && r1.systemOk, JSON.stringify(r1));
      check("page text was extracted and sent (>200 chars)", r1.pageChars > 200, `pageChars=${r1.pageChars}`);
      check("client sent no Authorization (key is on the server)", r1.hasAuth === false);
      check("the sent page was shown to the user", document.querySelector(".msg-ctx")?.textContent.includes("example.com"),
        document.querySelector(".msg-ctx")?.textContent);

      // -- multiple tabs (c)
      const e2 = tabs.open("https://example.org");
      check("e2 loaded", await wait(() => /Example Domain/.test(e2.title)), e2.title);
      check("context followed the new page when the tab changed", Vento.esin.state.attached.length === 1 && Vento.esin.state.attached[0] === e2);
      check("t1 added by hand", Vento.esin.attach(t1) === true);
      check("two chips exist", $("esin-chips").children.length === 2);
      Vento.esin.send("İkisini karşılaştır");
      check("multi-tab reply arrived", await wait(() => botText().includes("İkisini karşılaştır") && idle()), botText());
      const r2 = (await reqs())[1];
      check("both pages were sent", r2.urls.length === 2 && r2.urls.includes("https://example.com/") && r2.urls.includes("https://example.org/"), r2.urls.join());
      check("previous turn is in the history (2 messages)", r2.historyLen === 2, String(r2.historyLen));

      // -- stopping
      Vento.esin.send("YAVAS bir soru");
      check("slow reply started streaming", await wait(() => botText().startsWith("Başlıyorum")), botText());
      Vento.esin.stop();
      check("provider connection closed on stop", await wait(async () => (await stats()).aborted >= 1));
      check("not busy after stop", await wait(idle));
      check("partial reply kept, 'Durduruldu' note is there", $("esin-thread").textContent.includes("Durduruldu") && botText().startsWith("Başlıyorum"));

      // -- model output is not rendered as HTML
      const tHtml = Date.now();
      Vento.esin.send("HTML dene");
      check("markdown reply arrived", await wait(() => idle() && !!bots().at(-1)?.querySelector("strong")), botText());
      Vento.trace(`TEST info: "HTML dene" took ${Date.now() - tHtml} ms`);
      const body = bots().at(-1);
      check("HTML tags were not rendered (no b/img)", !body.querySelector("b, img") && body.textContent.includes("<b>x</b>"));
      check("markdown was rendered (strong, code, 2 li)", !!body.querySelector("strong") && !!body.querySelector("code") && body.querySelectorAll("li").length === 2);

      // -- page text is NOT sent for a context-free question
      for (const tab of [...Vento.esin.state.attached]) {
        Vento.esin.detach(tab);
      }
      check("chips are empty", $("esin-chips").children.length === 0);
      Vento.esin.send("Sadece soru");
      check("context-free reply arrived", await wait(() => botText().includes("Sadece soru") && idle()), botText());
      const rs = await reqs();
      const rn = rs[rs.length - 1];
      check("no page text was sent in the context-free request", rn.urls.length === 0 && rn.pageChars === 0, JSON.stringify(rn));

      // -- smart bar suggestions
      tabs.close(e2);
      tabs.select(t1);
      const input = $("smartbar-input");
      Vento.ui.focusBar();
      input.value = "rüzgar nedir";
      input.dispatchEvent(new Event("input"));
      const rows = [...$("smartbar-suggest").querySelectorAll(".suggest-row")];
      check("suggestion list appeared for search text (Esin is the default)", !$("smartbar-suggest").hidden && rows.length === 2 && rows[0].hasAttribute("selected") && rows[0].dataset.kind === "esin");
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      check("'Ara' was selected with the down arrow", rows[1].hasAttribute("selected") && !rows[0].hasAttribute("selected"));
      input.value = "example.com";
      input.dispatchEvent(new Event("input"));
      check("no suggestions when typing a URL (hidden once the exit animation ends)", await wait(() => $("smartbar-suggest").hidden));

      // -- ask Esin from the bar: the open page becomes context
      Vento.ui.focusBar();
      input.value = "Bu sayfa nedir?";
      input.dispatchEvent(new Event("input"));
      const before = (await reqs()).length;
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      check("question asked from the bar went to Esin", await wait(async () => (await reqs()).length === before + 1));
      const rq = (await reqs()).at(-1);
      check("open page is in the context when asked from the bar", rq.question === "Bu sayfa nedir?" && rq.urls.join() === "https://example.com/", JSON.stringify(rq));
      check("bar returned to the page's short URL after the question was sent", input.value === "example.com", input.value);
      await wait(idle);

      // -- new chat and closing
      Vento.esin.clearChat();
      check("new chat cleared the messages", $("esin-thread").querySelectorAll(".msg").length === 0 && !$("esin-empty").hidden);
      Vento.esin.close();
      check("panel closed, card returned to its old width", await wait(() => $("esin").hidden) && Math.abs($("stage").getBoundingClientRect().width - stageBefore) < 2);
    }

    // ===================== Context menu =====================
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

      // -- SECURITY: the production registration only listens to REAL user events. A page script must not be able to
      //    open our menu by forging a contextmenu event.
      load(`<meta charset="utf-8"><a id=l href="https://example.com/x">x</a><script>
        setTimeout(() => document.getElementById("l").dispatchEvent(new MouseEvent("contextmenu", {bubbles: true, cancelable: true, composed: true})), 500);
      </script>`);
      await new Promise(r => setTimeout(r, 2000));
      check("SECURITY: a forged contextmenu event from a page script did not open the menu", cm.state.history.length === 0, String(cm.state.history.length));

      // We can't produce a real mouse event in the test (no windowUtils.sendMouseEvent) -> the actor is re-registered
      // with wantUntrusted ONLY in the test, and we test the rest (same child/parent code).
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
      // Are the actor modules valid? (a module that fails to load dies silently in content)
      for (const m of ["VentoContextMenuChild", "VentoContextMenuParent"]) {
        let err = "";
        try {
          ChromeUtils.importESModule(`resource:///actors/${m}.sys.mjs`);
        } catch (e) {
          err = String(e);
        }
        check(`${m} module loads`, !err, err);
      }
      load(html);
      check("data page loaded and its script ran", await wait(() => /^betik-/.test(tab.title), 10000), `title=${tab.title}`);
      check("6 right-click events produced menu data", await wait(() => cm.state.history.length >= 6, 15000), String(cm.state.history.length));
      await new Promise(r => setTimeout(r, 800)); // the "own" event was already handled: a menu must NOT be built
      check("left alone when the page makes its own menu (6 records from 7 events)", cm.state.history.length === 6, String(cm.state.history.length));

      const labels = h => h.items.map(d => (d === cm.SEP ? "|" : d.label));
      const [link, img, edit, sel, page, pw] = cm.state.history;
      const has = (h, l) => labels(h).includes(l);

      check("link: URL and text were collected", link.data.linkUrl === "https://example.com/hedef" && link.data.linkText === "bağlantı metni", JSON.stringify(link.data.linkUrl));
      check("link menu", has(link, "Bağlantıyı Yeni Sekmede Aç") && has(link, "Bağlantı Adresini Kopyala") && !has(link, "Yenile"), labels(link).join(","));
      check("image: URL was collected + menu", img.data.imageUrl.endsWith("/resim.png") && has(img, "Resmi Yeni Sekmede Aç") && has(img, "Resim Adresini Kopyala"), img.data.imageUrl);
      check("text field: editable + selected text", edit.data.editable === true && edit.data.selection === "merhaba", JSON.stringify(edit.data.selection));
      check("text field menu (Cut enabled, Paste, Select All)", has(edit, "Yapıştır") && has(edit, "Tümünü Seç") && edit.items.find(d => d.label === "Kes")?.disabled === false);
      check("selected text: Copy + Search + Esin submenu", sel.data.selection === "Bu bir seçilecek metindir" && has(sel, "Kopyala") &&
        labels(sel).some(l => l.endsWith("için Ara")) && sel.items.find(d => d.label === "Esin")?.sub?.length === 3 && !has(sel, "Kes"), labels(sel).join(","));
      check("blank page: navigation + URL + Esin + source", has(page, "Yenile") && has(page, "Sayfa Adresini Kopyala") && has(page, "Sayfayı Esin ile Özetle") && has(page, "Sayfa Kaynağını Göster"), labels(page).join(","));
      check("menu doesn't start or end with a separator", cm.state.history.every(h => h.items[0] !== cm.SEP && h.items.at(-1) !== cm.SEP));
      check("screen position was converted to device pixels", link.data.screenXDevPx > 0 && link.data.screenYDevPx > 0);
      check("password field: editable but the selected text was NOT sent", pw.data.editable === true && pw.data.password === true && pw.data.selection === "", JSON.stringify(pw.data.selection));
      check("no Esin/Search in the password field menu", !labels(pw).some(l => l === "Esin" || l.endsWith("için Ara")), labels(pw).join(","));

      // -- actions
      const run = (h, label) => h.items.find(d => d.label === label).run();
      const nBefore = tabs.all.length;
      const selBefore = tabs.selected;
      run(link, "Bağlantıyı Yeni Sekmede Aç");
      check("link opened in a new background tab", tabs.all.length === nBefore + 1 && tabs.selected === selBefore);
      tabs.close(tabs.all.at(-1));
      tabs.select(selBefore);
      run(link, "Bağlantı Adresini Kopyala");
      check("link URL was copied", cm.state.copied === "https://example.com/hedef");
      run(sel, "Kopyala");
      check("selected text was copied", cm.state.copied === "Bu bir seçilecek metindir");
      const before = (await reqs()).length;
      sel.items.find(d => d.label === "Esin").sub.find(d => d.label === "Özetle").run();
      check("Esin > Özetle sent the question with the selected text", await wait(async () => (await reqs()).length === before + 1), "");
      const rq = (await reqs()).at(-1);
      check("the sent question contains the selected text", rq.question.includes("Şu metni kısaca özetle") && rq.question.includes("Bu bir seçilecek metindir"), rq.question);
      await wait(idle);
      cm.dryRun = false;
    }

    // ===================== Find in page =====================
    {
      const $ = id => document.getElementById(id);
      const tab = tabs.selected;
      const count = () => $("find-count").textContent;
      const input = $("find-input");
      const key = (k, extra = {}) => input.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...extra }));
      tab.browser.fixupAndLoadURIString("data:text/html," + encodeURIComponent(
        `<meta charset="utf-8"><title>bul</title><p>elma armut elma muz elma</p>`), { triggeringPrincipal: Vento.SYSTEM_PRINCIPAL });
      check("find page loaded", await wait(() => tab.title === "bul"), tab.title);

      check("menu has 'Sayfada Ara…' and the ⌘F shortcut", !!$("menu_find") && $("key_find").getAttribute("key") === "f");
      Vento.find.open();
      check("⌘F opened the bar, focus is in the find box", !$("findbar").hidden && document.activeElement === input);

      input.value = "elma";
      input.dispatchEvent(new Event("input"));
      check("'elma' → 1/3", await wait(() => count() === "1/3"), count());
      key("Enter");
      check("Enter -> next 2/3", await wait(() => count() === "2/3"), count());
      Vento.find.next();
      check("⌘G → 3/3", await wait(() => count() === "3/3"), count());
      Vento.find.next();
      check("wrapped to the start after the last one, 1/3", await wait(() => count() === "1/3"), count());
      key("Enter", { shiftKey: true });
      check("Shift+Enter -> back (3/3)", await wait(() => count() === "3/3"), count());

      input.value = "yokkelime";
      input.dispatchEvent(new Event("input"));
      check("missing word -> 'Bulunamadı' and red", await wait(() => count() === "Bulunamadı" && input.hasAttribute("notfound")), count());
      input.value = "armut";
      input.dispatchEvent(new Event("input"));
      check("red cleared once found, 1/1", await wait(() => count() === "1/1" && !input.hasAttribute("notfound")), count());

      key("Escape");
      check("Esc closed the bar", Vento.find.state.open === false && await wait(() => $("findbar").hidden === true));

      // find is bound to the tab: it closes when the tab changes
      Vento.find.open();
      const other = tabs.open("about:blank");
      check("find bar closed when the tab changed", await wait(() => $("findbar").hidden === true));
      tabs.close(other);
      tabs.select(tab);
      Vento.find.open();
      Vento.find.close(false);
      await wait(() => $("findbar").hidden); // let the previous close's animation finish
      check("⌘F doesn't open on a blank tab", (() => { const b = tabs.open("about:blank"); Vento.find.open(); const ok = $("findbar").hidden; tabs.close(b); tabs.select(tab); return ok; })());
    }

    // ===================== Downloads =====================
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

      check("download button is hidden at first", $("nav-downloads").hidden === true);

      // -- an attachment from a page (Content-Disposition: attachment) downloads automatically
      const tab = tabs.selected;
      tab.browser.fixupAndLoadURIString(`${llm}/dosya.bin`, { triggeringPrincipal: Vento.SYSTEM_PRINCIPAL });
      check("attachment landed in the download list", await wait(() => D.state.rows.size === 1, 15000), String(D.state.rows.size));
      const first = [...D.state.rows.keys()][0];
      check("download finished", await wait(() => first.succeeded, 15000), `succeeded=${first.succeeded} error=${first.error}`);
      check("file saved with the right name and full size (rapor.bin, 200 KB)", (await sizeOf("rapor.bin")) === 204800, String(await sizeOf("rapor.bin")));
      check("didn't ask: no helper-app dialog opened (single window)", [...Services.wm.getEnumerator(null)].length === 1);
      check("download button appeared", $("nav-downloads").hidden === false);
      D.showPanel(true);
      check("panel row: name + Tamamlandı", rowOf(first)?.querySelector(".dl-name").textContent === "rapor.bin" && rowOf(first)?.querySelector(".dl-meta").textContent.includes("Tamamlandı"), rowOf(first)?.querySelector(".dl-meta").textContent);
      check("finished row shows only 'Finder'da göster' and 'kaldır'", getComputedStyle(rowOf(first).querySelector(".dl-reveal")).display !== "none" && getComputedStyle(rowOf(first).querySelector(".dl-cancel")).display === "none");

      // -- save a URL (right-click "Save image" path) + unique name
      const d1 = await D.saveURL(`${llm}/dosya.bin?a=1`);
      check("saveURL tamamlandı (dosya.bin)", await wait(() => d1.succeeded, 15000) && (await sizeOf("dosya.bin")) === 204800, String(await sizeOf("dosya.bin")));
      const d2 = await D.saveURL(`${llm}/dosya.bin?a=2`);
      check("unique name if the name exists (dosya (1).bin)", await wait(() => d2.succeeded, 15000) && PathUtils.filename(d2.target.path) === "dosya (1).bin", PathUtils.filename(d2.target.path));

      // -- cancel
      const slow = await D.saveURL(`${llm}/yavas.bin`);
      check("slow download is progressing", await wait(() => slow.currentBytes > 0 && !slow.stopped, 15000), String(slow.currentBytes));
      check("cancel button visible while running, remove hidden", getComputedStyle(rowOf(slow).querySelector(".dl-cancel")).display !== "none" && getComputedStyle(rowOf(slow).querySelector(".dl-remove")).display === "none");
      check("progress bar width increased", rowOf(slow).querySelector(".dl-fill").style.width !== "");
      rowOf(slow).querySelector(".dl-cancel").click();
      check("download stopped on cancel", await wait(() => slow.canceled, 10000));
      check("canceled row shows 'İptal edildi' + retry", await wait(() => rowOf(slow)?.dataset.kind === "canceled") && getComputedStyle(rowOf(slow).querySelector(".dl-retry")).display !== "none");

      // -- remove
      const n = D.state.rows.size;
      rowOf(slow).querySelector(".dl-remove").click();
      check("row left the list on remove", await wait(() => D.state.rows.size === n - 1), String(D.state.rows.size));

      // -- context menu items
      const cmb = Vento.contextMenu.build({ imageUrl: "https://x/y.png", linkUrl: "https://x/f.pdf", pageUrl: "https://x/" });
      const lb = cmb.filter(d => d !== Vento.contextMenu.SEP).map(d => d.label);
      check("context menu has 'Resmi İndirilenler'e Kaydet' and 'Bağlantıdaki Dosyayı İndir'", lb.includes("Resmi İndirilenler'e Kaydet") && lb.includes("Bağlantıdaki Dosyayı İndir"), lb.join(","));

      // -- the button hides when all are gone
      for (const d of [...D.state.rows.keys()]) {
        await D.state.list.remove(d);
      }
      check("button and panel hid when the list emptied", await wait(() => $("nav-downloads").hidden && $("downloads-panel").hidden));
      D.dryRun = false;
    }

    // ===================== Page dialogs =====================
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

      // -- confirm -> prompt -> alert chain: must NOT be cancelled silently
      load(`<title>d</title><script>setTimeout(() => { const a = confirm("Emin misin?"); const b = prompt("Adın?", "varsayılan"); alert("bitti"); document.title = "sonuç:" + a + ":" + b; }, 300);</script>`);
      check("confirm dialog appeared (no longer cancelled silently)", await wait(() => shown() && visible(), 10000));
      check("confirm: text + OK/Cancel", card().querySelector(".dlg-text").textContent === "Emin misin?" && card().querySelectorAll("button").length === 2 && btn(0).hasAttribute("primary"));
      // A data: page has no site name (empty origin); it showing on an http page is checked in the permission tests below
      btn(0).click();
      check("prompt: field with a default value", await wait(() => card()?.querySelector(".dlg-value")?.value === "varsayılan"));
      card().querySelector(".dlg-value").value = "Can";
      btn(0).click();
      check("alert: single button", await wait(() => card()?.querySelectorAll("button").length === 1 && card().querySelector(".dlg-text").textContent === "bitti"));
      key("Enter");
      check("page received the answers (confirm=true, prompt='Can')", await wait(() => tab.title === "sonuç:true:Can"), tab.title);
      check("layer hid when done", await wait(() => !visible()));

      // -- cancel (Esc): confirm=false, prompt=null
      load(`<title>e</title><script>setTimeout(() => { const a = confirm("x?"); const b = prompt("y?"); document.title = "sonuç:" + a + ":" + b; }, 300);</script>`);
      await wait(() => shown());
      key("Escape");
      await wait(() => card()?.querySelector(".dlg-value"));
      key("Escape");
      check("Esc: confirm=false, prompt=null", await wait(() => tab.title === "sonuç:false:null"), tab.title);

      // -- a background tab's dialog stays hidden until that tab is selected
      const bg = tabs.open(du(`<title>bg</title><script>setTimeout(() => { document.title = "bg:" + confirm("arka plan?"); }, 300);</script>`), { select: false });
      check("background dialog was queued", await wait(() => D.pending === 1, 10000), String(D.pending));
      check("but wasn't shown in front", !visible());
      tabs.select(bg);
      check("appeared when switching to the tab", await wait(() => visible() && card()?.querySelector(".dlg-text").textContent === "arka plan?"));
      tabs.select(tab);
      check("hid when switching to another tab but still pending", await wait(() => !visible()) && D.pending === 1);
      tabs.select(bg);
      btn(0).click();
      check("answer reached the page (bg:true)", await wait(() => bg.title === "bg:true"), bg.title);
      tabs.close(bg);
      tabs.select(tab);

      // -- a pending prompt is cancelled when the tab closes
      const bg2 = tabs.open(du(`<script>setTimeout(() => confirm("kapanacak"), 300);</script>`), { select: false });
      await wait(() => D.pending === 1, 10000);
      tabs.close(bg2);
      check("pending prompt was cleared when the tab closed", await wait(() => D.pending === 0), String(D.pending));
      tabs.select(tab);

      // -- confirmEx: 3 buttons, default 2, checkbox
      const p1 = D.open(tab.browser, { promptType: "confirmEx", text: "Üç seçenek", button0Label: "Kaydet", button1Label: "Vazgeç", button2Label: "Kaydetme", defaultButtonNum: 2, checkLabel: "Bir daha sorma", checked: false });
      await wait(() => card());
      check("confirmEx: 3 buttons, the 2nd is the default (primary)", card().querySelectorAll("button").length === 3 && btn(2).hasAttribute("primary") && !btn(0).hasAttribute("primary"));
      card().querySelector("input[type=checkbox]").checked = true;
      btn(2).click();
      const r1 = await p1;
      check("confirmEx result: buttonNumClicked=2, ok=false, checked=true", r1.buttonNumClicked === 2 && r1.ok === false && r1.checked === true, JSON.stringify(r1));

      // -- authentication (HTTP auth) fields
      const p2 = D.open(tab.browser, { promptType: "promptUserAndPass", text: "Giriş gerekli", authOrigin: "example.com", isInsecureAuth: true, user: "", pass: "" });
      await wait(() => card());
      check("auth: user + password (hidden) + insecure warning + origin",
        !!card().querySelector(".dlg-user") && card().querySelector(".dlg-pass").type === "password" && !!card().querySelector(".dlg-warn") && card().querySelector(".dlg-origin").textContent.includes("example.com"));
      card().querySelector(".dlg-user").value = "can";
      card().querySelector(".dlg-pass").value = "gizli";
      btn(0).click();
      const r2 = await p2;
      check("auth result: user, pass, ok", r2.user === "can" && r2.pass === "gizli" && r2.ok === true);

      // -- field values are not returned on cancel
      const p3 = D.open(tab.browser, { promptType: "promptPassword", text: "Parola", pass: "" });
      await wait(() => card());
      card().querySelector(".dlg-pass").value = "sızmamalı";
      btn(1).click();
      const r3 = await p3;
      check("password was not written to the result on cancel", r3.ok === false && (r3.pass ?? "") === "", JSON.stringify(r3));
    }

    // ===================== Site permissions =====================
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

      // -- notification: Block
      goto("notif");
      check("notification request card appeared", await wait(() => visible() && card(), 10000));
      check("card: site + 'sana bildirim göndermek'", card().querySelector(".perm-origin").textContent === new URL(llm).host && card().querySelector(".perm-text").textContent.includes("bildirim göndermek"),
        `origin=${card().querySelector(".perm-origin").textContent} expected=${new URL(llm).host}`);
      check("'Remember' is OFF by default (privacy)", card().querySelector(".perm-remember input").checked === false);
      btn(".perm-block").click();
      check("Block -> page got 'denied'", await titleIs("n:denied"), tab.title);
      const denied = Services.perms.getPermissionObject(principal, "desktop-notification", true);
      check("Block: card disappeared; decision was stored for the SESSION only (not persistent)", await wait(() => !visible()) && denied?.capability === Services.perms.DENY_ACTION && denied?.expireType === Services.perms.EXPIRE_SESSION, `${denied?.capability}/${denied?.expireType}`);
      Services.perms.removeAll();

      // -- notification: Allow + remember -> allowed without asking the second time
      goto("notif");
      await wait(() => visible() && card(), 10000);
      card().querySelector(".perm-remember input").checked = true;
      btn(".perm-allow").click();
      check("Allow -> 'granted'", await titleIs("n:granted"), tab.title);
      check("remembered (in the persistent permission manager)", PM_test(principal, "desktop-notification") === Services.perms.ALLOW_ACTION);
      goto("notif");
      check("remembered notification permission gives 'granted' without a card (the platform answers itself)", await wait(() => tab.title === "n:granted", 10000) && await wait(() => !visible()));
      Services.perms.removeAll();

      // -- location: Block -> PERMISSION_DENIED (1)
      goto("geo");
      await wait(() => visible() && card(), 10000);
      check("location card: 'konumunu görmek'", card().querySelector(".perm-text").textContent.includes("konumunu görmek"));
      btn(".perm-block").click();
      check("location Block -> error code 1 (PERMISSION_DENIED)", await titleIs("geo:1"), tab.title);

      // -- camera + microphone (with fake devices)
      goto("media");
      check("camera+microphone card appeared", await wait(() => visible() && card(), 10000));
      check("text: 'kameranı ve mikrofonunu kullanmak'", card().querySelector(".perm-text").textContent.includes("kameranı ve mikrofonunu kullanmak"), card().querySelector(".perm-text").textContent);
      btn(".perm-allow").click();
      check("Allow -> stream arrived (2 tracks: video+audio)", await titleIs("media:ok:2"), tab.title);
      check("camera/microphone 'just this once': NOT stored at all while remember is off", PM_test(principal, "camera") === 0 && PM_test(principal, "microphone") === 0);
      goto("media");
      await wait(() => visible() && card(), 10000);
      btn(".perm-block").click();
      check("Block -> NotAllowedError", await titleIs("media:NotAllowedError"), tab.title);
      // -- camera+microphone: if "remember" is checked the next request has no card (our automatic answer path)
      goto("media");
      await wait(() => visible() && card(), 10000);
      card().querySelector(".perm-remember input").checked = true;
      btn(".perm-allow").click();
      await titleIs("media:ok:2");
      check("camera+microphone was stored PERSISTENTLY while remember is on", PM_test(principal, "camera") === Services.perms.ALLOW_ACTION && PM_test(principal, "microphone") === Services.perms.ALLOW_ACTION);
      const autoBefore = P.state.autoAnswered.length;
      goto("media");
      // The title may already be "media:ok:2" from the previous attempt -> first wait for the new request to reach us
      const answered = await wait(() => P.state.autoAnswered.length > autoBefore, 10000);
      await new Promise(r => setTimeout(r, 700)); // let the stream reach the page
      check("remembered camera permission gave a stream without a card (via auto-answer)", answered && tab.title === "media:ok:2" && !visible(), `auto=${answered} title=${tab.title}`);
      Services.perms.removeAll();
      goto("cam");
      await wait(() => visible() && card(), 10000);
      check("camera only: text 'kameranı kullanmak'", card().querySelector(".perm-text").textContent.includes("kameranı kullanmak") && !card().querySelector(".perm-text").textContent.includes("mikrofon"));
      btn(".perm-block").click();
      await titleIs("cam:NotAllowedError");

      // -- bound to the tab: a background tab's card is not visible
      const bg = tabs.open(page("notif"), { select: false });
      check("background request was queued, not visible", await wait(() => P.pending === 1, 10000) && !visible());
      tabs.select(bg);
      check("card appeared when switching to the tab", await wait(() => visible() && !!card()));
      tabs.select(tab);
      check("hid when switching to another tab but still pending", await wait(() => !visible()) && P.pending === 1);
      tabs.close(bg);
      check("request was cleared when the tab closed", await wait(() => P.pending === 0));
      tabs.select(tab);

      // -- a pending request is denied when navigating to another site
      goto("notif");
      await wait(() => visible() && card(), 10000);
      tab.browser.fixupAndLoadURIString("data:text/html," + encodeURIComponent("<meta charset=utf-8><title>gitti</title>"), { triggeringPrincipal: Vento.SYSTEM_PRINCIPAL });
      check("pending card went away on leaving the site", await wait(() => tab.title === "gitti" && !visible() && P.pending === 0), String(P.pending));
      Services.perms.removeAll();
    }

    // ===================== Motion / effects =====================
    {
      const M = Vento.motion;
      const $ = id => document.getElementById(id);
      const animProps = el => new Set(el.getAnimations().flatMap(a => a.effect.getKeyframes().flatMap(k => Object.keys(k))).filter(p => !["offset", "computedOffset", "easing", "composite", "simulateComputeValuesFailure"].includes(p)));
      const only = (set, allowed) => [...set].every(p => allowed.includes(p));
      const rootStyle = getComputedStyle(document.documentElement);

      check("motion variables are defined (--v-dur-fast/--v-dur/--v-dur-slow)", rootStyle.getPropertyValue("--v-dur-fast").trim() === "110ms" && rootStyle.getPropertyValue("--v-dur").trim() === "180ms" && rootStyle.getPropertyValue("--v-dur-slow").trim() === "260ms");
      check("in every preset the exit is SHORTER than the enter (the user doesn't wait)", Object.values(M.PRESETS).every(p => p.exit < p.enter), JSON.stringify(Object.fromEntries(Object.entries(M.PRESETS).map(([k, p]) => [k, `${p.enter}/${p.exit}`]))));
      check("no duration exceeds 260 ms", Object.values(M.PRESETS).every(p => p.enter <= 260 && p.exit <= 260));

      // -- core: enter/exit/race (on a single element)
      const box = document.createElement("div");
      box.hidden = true;
      box.style.cssText = "position:absolute;top:0;left:0;width:10px;height:10px";
      $("stage").append(box);
      M.show(box, "pop");
      check("show: visible right away and the enter animation is running", !box.hidden && M.isShown(box) && box.getAnimations().length === 1);
      check("enter uses only opacity + transform (doesn't disturb layout)", only(animProps(box), ["opacity", "transform"]), [...animProps(box)].join(","));
      await wait(() => box.getAnimations().length === 0, 2000);
      check("no animation residue after the enter ends", box.getAnimations().length === 0 && !box.hidden);

      const hid = M.hide(box, "pop");
      check("hide: while exiting the element is still visible in the DOM, has 'closing', isShown=false", !box.hidden && box.hasAttribute("closing") && !M.isShown(box));
      check("a second hide returns the same promise (no double exit)", M.hide(box, "pop") === hid);
      await hid;
      check("hidden is set when the exit ends, no residue", box.hidden && !box.hasAttribute("closing") && box.getAnimations().length === 0);
      check("hide resolves immediately when already hidden", (await Promise.race([M.hide(box), new Promise(r => setTimeout(() => r("ZAMAN"), 500))])) !== "ZAMAN");

      // race: show again while exiting -> the element doesn't get stuck 'hidden'
      M.show(box, "pop");
      await wait(() => box.getAnimations().length === 0, 2000);
      const p1 = M.hide(box, "pop");
      await new Promise(r => setTimeout(r, 40));
      M.show(box, "pop");
      await p1;
      await new Promise(r => setTimeout(r, 400));
      check("show again while exiting: the element stays visible (race-safe)", !box.hidden && !box.hasAttribute("closing") && M.isShown(box));
      // quick open/close/open/close
      for (let i = 0; i < 6; i++) { M.show(box, "drop"); await new Promise(r => setTimeout(r, 15)); M.hide(box, "drop"); await new Promise(r => setTimeout(r, 15)); }
      await wait(() => box.hidden && !box.hasAttribute("closing"), 2000);
      check("consistent state after a quick open/close chain (hidden, no residue)", box.hidden && !box.hasAttribute("closing") && box.getAnimations().length === 0);

      // -- reduce motion
      M.reducedOverride = true;
      try {
        M.show(box, "pop");
        check("reduce motion: opacity only, no position/scale motion, <=100 ms", only(animProps(box), ["opacity"]) && box.getAnimations()[0].effect.getTiming().duration <= 100, `${[...animProps(box)]} ${box.getAnimations()[0]?.effect.getTiming().duration}`);
        await M.hide(box, "pop");
        check("reduce motion: the exit completes too", box.hidden && !box.hasAttribute("closing"));
      } finally {
        M.reducedOverride = null;
      }
      box.remove();
      check("CSS has a prefers-reduced-motion rule", [...document.styleSheets].some(sh => { try { return [...sh.cssRules].some(r => r.media && /prefers-reduced-motion/.test(r.media.mediaText)); } catch (e) { return false; } }));

      // -- real components
      // Tab: open animation, ghost on close, no stuck residue
      const strip = $("tabs");
      const live = () => [...strip.querySelectorAll(".tab:not(.closing)")].length;
      await wait(() => !document.documentElement.hasAttribute("booting"), 3000);
      const t1 = tabs.open("about:blank", { select: false });
      const el1 = strip.querySelector(`.tab[data-id="${t1.id}"]`);
      check("new tab opened with an animation (width/opacity/scale only)", el1.getAnimations().length > 0 && only(animProps(el1), ["flexBasis", "width", "minWidth", "paddingLeft", "paddingRight", "opacity", "transform"]), [...animProps(el1)].join(","));
      tabs.close(t1);
      check("closing tab's ghost is in the strip (not clickable)", !!strip.querySelector(".tab.closing") && getComputedStyle(strip.querySelector(".tab.closing")).pointerEvents === "none");
      check("ghost goes away when done", await wait(() => !strip.querySelector(".tab.closing"), 2000));
      const batch = Array.from({ length: 8 }, () => tabs.open("about:blank", { select: false }));
      batch.forEach(t => tabs.close(t));
      check("8 tabs opened/closed quickly: no ghost left, tab count matches the model", await wait(() => !strip.querySelector(".tab.closing") && live() === tabs.all.length, 3000), `${live()} / ${tabs.all.length}`);
      M.reducedOverride = true;
      try {
        const t2 = tabs.open("about:blank", { select: false });
        const el2 = strip.querySelector(`.tab[data-id="${t2.id}"]`);
        check("reduce motion: the tab opens by fading only", only(animProps(el2), ["opacity"]), [...animProps(el2)].join(","));
        tabs.close(t2);
        await wait(() => !strip.querySelector(".tab.closing"), 2000);
      } finally {
        M.reducedOverride = null;
      }

      // Dialog: the dim fades in + the card appears; on close the card stays in place while the dim fades, then goes away
      {
        const D = Vento.dialogs;
        const layer = $("dialog-layer");
        const dtab = tabs.selected;
        const p = D.open(dtab.browser, { promptType: "alert", text: "hareket" });
        await wait(() => D.state.shown && !layer.hidden, 10000);
        const card = D.state.shown.ui.card;
        check("dialog: the dim faded in, the card entered with 'pop'", layer.getAnimations().length > 0 && card.getAnimations().length > 0 && only(animProps(card), ["opacity", "transform"]));
        card.querySelector('button[data-index="0"]').click();
        await p;
        check("when the dialog closes the card stays in place on the fading dim", await wait(() => layer.hasAttribute("closing") || layer.hidden, 3000) && (layer.hidden || !!layer.querySelector(".dlg-card")));
        check("layer is hidden and the card removed after the dialog closes", await wait(() => layer.hidden && !layer.querySelector(".dlg-card"), 3000));
      }

      // Find bar
      {
        const fb = $("findbar");
        const ftab = tabs.open(`${Services.env.get("VENTO_ESIN_ENDPOINT").replace(/\/v1$/, "")}/oturum/ara`);
        await wait(() => ftab.title === "Sayfa ARA" && !ftab.loading, 15000);
        Vento.find.open();
        check("⌘F opened the bar with the 'bar' animation", !fb.hidden && fb.getAnimations().length > 0 && only(animProps(fb), ["opacity", "transform"]));
        Vento.find.close(false);
        check("'closing' while the bar closes, then hidden", fb.hasAttribute("closing") && await wait(() => fb.hidden && !fb.hasAttribute("closing"), 3000));
        tabs.close(ftab);
      }

      // Start (blank tab) view: the content fades in softly when a blank tab is selected (CSS animation)
      {
        const blank = tabs.open("about:blank"); // selected -> #stage[blank]
        await wait(() => $("stage").hasAttribute("blank"), 3000);
        const start = $("start");
        const names = [start, $("start-word"), $("start-hint")].map(e => getComputedStyle(e).animationName);
        check("blank tab view: container, title and hint have a staggered enter animation", names.every(n => n !== "none") && start.getAnimations().length > 0, names.join(","));
        // Ebabil: 4 layers load, move only with transform (GPU), blend additively
        const eb = $("ebabil");
        const layers = [...eb.querySelectorAll(".eb")];
        await wait(() => layers.every(i => i.complete && i.naturalWidth === 640), 5000);
        check("Ebabil: 4 layers (right wing, body, tail, left wing) loaded (640 px)", layers.length === 4 && layers.every(i => i.complete && i.naturalWidth === 640), layers.map(i => `${i.className}:${i.naturalWidth}`).join(" "));
        check("Ebabil: visible size (>100 px)", eb.getBoundingClientRect().width > 100, String(Math.round(eb.getBoundingClientRect().width)));
        check("Ebabil: the whole bird glides; 2 wings + tail flap separately, the body only carries the glide", $("ebabil-rig").getAnimations().length === 1 && ["wl", "wr", "tail"].every(k => eb.querySelector(`.eb-${k}`).getAnimations().length === 1) && eb.querySelector(".eb-body").getAnimations().length === 0, layers.map(i => `${i.className.split(" ")[1]}:${i.getAnimations().length}`).join(" "));
        check("Ebabil motion is transform only (on the GPU, doesn't disturb layout)", only(new Set([...layers, $("ebabil-rig")].flatMap(e => [...animProps(e)])), ["transform"]), [...new Set([...layers, $("ebabil-rig")].flatMap(e => [...animProps(e)]))].join(","));
        check("Ebabil layers blend additively (plus-lighter), the group is isolated", layers.every(i => getComputedStyle(i).mixBlendMode === "plus-lighter") && getComputedStyle($("ebabil-rig")).isolation === "isolate");
        check("wings flap in opposite directions, the tail with a different duration", (() => { const d = e => e.getAnimations()[0].effect.getTiming().duration; return d(eb.querySelector(".eb-wl")) === d(eb.querySelector(".eb-wr")) && d(eb.querySelector(".eb-tail")) !== d(eb.querySelector(".eb-wl")); })());
        check("CSS has a reduce-motion rule for Ebabil (it stops)", [...document.styleSheets].some(sh => { try { return [...sh.cssRules].some(r => r.media && /prefers-reduced-motion/.test(r.media.mediaText) && [...r.cssRules].some(x => x.cssText.includes("#ebabil-rig") && x.cssText.includes("animation: none"))); } catch (e) { return false; } }));
        // Is the resting state the SAME as the original mascot? Sum the layers on the browser canvas (lighter = additive) and compare with still.webp
        {
          const still = new Image();
          still.src = "chrome://vento/content/ebabil/still.webp";
          await still.decode();
          const mk = () => { const c = document.createElementNS("http://www.w3.org/1999/xhtml", "canvas"); c.width = c.height = 640; return c.getContext("2d", { willReadFrequently: true }); };
          const A = mk(), B = mk();
          A.fillStyle = B.fillStyle = "#000"; A.fillRect(0, 0, 640, 640); B.fillRect(0, 0, 640, 640);
          A.drawImage(still, 0, 0);
          B.globalCompositeOperation = "lighter";
          for (const i of layers) { B.drawImage(i, 0, 0); }
          const a = A.getImageData(0, 0, 640, 640).data, b = B.getImageData(0, 0, 640, 640).data;
          let max = 0, sum = 0;
          for (let k = 0; k < a.length; k += 4) { for (let c = 0; c < 3; c++) { const d = Math.abs(a[k + c] - b[k + c]); sum += d; if (d > max) { max = d; } } }
          const mean = sum / (a.length / 4 * 3);
          check("Ebabil resting state matches the original mascot (layer sum ≈ still; measured on a canvas)", max <= 24 && mean < 1.2, `max diff ${max}, mean ${mean.toFixed(3)}`);
        }
        M.reducedOverride = null;
        tabs.close(blank);
      }
    }

    // ===================== Ebabil poses (error page, empty states) =====================
    {
      const $ = id => document.getElementById(id);
      const llm = Services.env.get("VENTO_ESIN_ENDPOINT").replace(/\/v1$/, "");
      const https = Services.env.get("VENTO_TEST_HTTPS");
      const tab = tabs.open("about:blank");
      const load = u => tab.browser.fixupAndLoadURIString(u, { triggeringPrincipal: Vento.SYSTEM_PRINCIPAL });
      const docURI = () => tab.browser.browsingContext?.currentWindowGlobal?.documentURI?.spec ?? "";
      const inPage = (body, ms = 8000) => new Promise(resolve => {
        const id = "vento:poz:" + Math.random();
        const mm = tab.browser.messageManager;
        mm.addMessageListener(id, m => resolve(m.data), { once: true });
        mm.loadFrameScript("data:,(" + encodeURIComponent(`function(){ Promise.resolve().then(() => (${body})()).then(r => sendAsyncMessage(${JSON.stringify(id)}, r), e => sendAsyncMessage(${JSON.stringify(id)}, "HATA " + e)); }`) + ")()", false);
        setTimeout(() => resolve("ZAMAN ASIMI"), ms);
      });
      // The Ebabil on the page: {pose, yuklendi, gorunur}; null if none
      const probe = () => inPage(`() => { const i = content.document.querySelector(".vento-ebabil"); return i ? { pose: content.document.documentElement.dataset.ventoPose, yuklendi: i.complete && i.naturalWidth > 0, gorunur: content.getComputedStyle(i).display === "block", src: i.src } : null; }`);

      // Connection error -> Ebabil (confused)
      load("http://nonexistent.invalid/");
      await wait(() => docURI().startsWith("about:neterror?e=dnsNotFound"), 15000);
      await wait(async () => (await probe())?.yuklendi, 8000);
      const dns = await probe();
      check("DNS error: the confused Ebabil is visible and loaded (style applied)", dns?.pose === "error" && dns.yuklendi && dns.gorunur && dns.src.endsWith("pose-error.webp"), JSON.stringify(dns));
      check("a single Ebabil on the error page (not added twice)", (await inPage(`() => content.document.querySelectorAll(".vento-ebabil").length`)) === 1);

      // Offline -> sleeping Ebabil
      load("about:neterror?e=netOffline&u=http%3A//x.invalid/&c=UTF-8&d=x");
      await wait(() => docURI().startsWith("about:neterror?e=netOffline"), 10000);
      await wait(async () => (await probe())?.yuklendi, 8000);
      const off = await probe();
      check("offline: sleeping Ebabil", off?.pose === "idle" && off.src.endsWith("pose-idle.webp"), JSON.stringify(off));

      // No Ebabil on serious warnings
      load("about:neterror?e=blockedByPolicy&u=http%3A//x.invalid/&c=UTF-8&d=x");
      await wait(() => docURI().startsWith("about:neterror?e=blockedByPolicy"), 10000);
      await new Promise(r => setTimeout(r, 1200));
      check("no Ebabil on a security block (blockedByPolicy)", (await probe()) === null);
      load(`${https}/`);
      await wait(() => docURI().startsWith("about:certerror"), 15000);
      await new Promise(r => setTimeout(r, 1200));
      check("no Ebabil on a certificate warning (a serious risk isn't softened with a cute bird)", (await probe()) === null);

      // Security: a web page can only reach the ART package, not Vento's main UI package
      load(`${llm}/oturum/guvenlik`);
      await wait(() => tab.title === "Sayfa GUVENLIK" && !tab.loading, 15000);
      const yukle = url => inPage(`() => new Promise(res => { const i = new content.Image(); i.onload = () => res("yuklendi"); i.onerror = () => res("engellendi"); i.src = ${JSON.stringify(url)}; content.setTimeout(() => res("zaman"), 4000); })`);
      check("web page can load the art package (vento-art)", (await yukle("chrome://vento-art/content/pose-icon.webp")) === "yuklendi");
      check("web page CANNOT reach Vento's UI package (chrome://vento/)", (await yukle("chrome://vento/content/art/pose-icon.webp")) === "engellendi");
      check("web page cannot reach the Ebabil animation layers (vento)", (await yukle("chrome://vento/content/ebabil/body.webp")) === "engellendi");
      tabs.close(tab);

      // Empty states and the blank tab icon
      const emptyImgs = [$("esin-empty").querySelector(".empty-ebabil"), $("dl-empty").querySelector(".empty-ebabil")];
      await wait(() => emptyImgs.every(i => i.complete), 5000);
      check("perched Ebabil loaded in the Esin and download empty states", emptyImgs.every(i => i.complete && i.naturalWidth > 0 && i.src.endsWith("pose-empty.webp")), emptyImgs.map(i => i.naturalWidth).join(","));
      const bl = tabs.open("about:blank");
      await wait(() => document.querySelector(`.tab[data-id="${bl.id}"] .tab-mark img`)?.complete, 5000);
      const markImg = document.querySelector(`.tab[data-id="${bl.id}"] .tab-mark img`);
      check("blank tab's icon is Ebabil's head (not a letter)", !!markImg && markImg.src.endsWith("pose-icon.webp") && markImg.naturalWidth > 0, markImg?.src);
      tabs.close(bl);
    }

    // ===================== Start personalization (wallpaper, Ebabil), Esin logo, document icons =====================
    {
      const $ = id => document.getElementById(id);
      const S = Vento.start;
      const prefs = Services.prefs;
      const lum = c => { const m = c.match(/\d+(\.\d+)?/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
      const setWall = id => prefs.setStringPref("vento.start.wallpaper", id);

      check("panel is HIDDEN at startup, no wallpaper (plain default)", $("custom-panel").hidden === true && !$("start").hasAttribute("data-wallpaper") && prefs.getStringPref("vento.start.wallpaper", "?") === "", `panel.hidden=${$("custom-panel").hidden}`);
      check("6 wallpapers (4 dark, 2 light) + a 'Yok' tile = 7 tiles; 'Yok' is selected by default", S.WALLPAPERS.length === 6 && S.WALLPAPERS.filter(w => w.tone === "dark").length === 4 && $("cp-walls").querySelectorAll("button").length === 7 && $("cp-walls").querySelector('button[data-id=""]').getAttribute("aria-pressed") === "true");

      // Measure on a visible blank tab (the start screen is only visible on a blank tab)
      const blank = tabs.open("about:blank");
      await wait(() => $("stage").hasAttribute("blank"), 3000);
      const word = () => getComputedStyle($("start-word")).color;

      setWall("tide");
      check("dark wallpaper: applied, tone 'dark', text is a LIGHT color (readable)", await wait(() => $("start").dataset.wallpaper === "tide" && $("start").dataset.tone === "dark", 8000) && lum(word()) > 0.6 && $("start-wall").style.backgroundImage.includes("vento-tide.jpg"), word());
      setWall("mist");
      check("light wallpaper: tone 'light', text is a DARK color (readable)", await wait(() => $("start").dataset.tone === "light", 8000) && lum(word()) < 0.4, word());
      check("selected tile updated (aria-pressed)", $("cp-walls").querySelector('button[data-id="mist"]').getAttribute("aria-pressed") === "true" && $("cp-walls").querySelector('button[data-id="tide"]').getAttribute("aria-pressed") === "false");
      setWall("");
      check("'Yok': wallpaper and tone were cleared", await wait(() => !$("start").hasAttribute("data-wallpaper") && !$("start").hasAttribute("data-tone") && $("start-wall").style.backgroundImage === "", 4000));
      setWall("bozuk-kimlik");
      await new Promise(r => setTimeout(r, 400));
      check("a corrupt pref value is safe: treated as 'none'", !$("start").hasAttribute("data-wallpaper"));
      // race: quick successive picks -> the LAST pick wins
      for (const id of ["ink", "tide", "mist", "dusk"]) { setWall(id); }
      check("the last pick wins on quick successive picks (race-safe)", await wait(() => $("start").dataset.wallpaper === "dusk", 8000) && await new Promise(r => setTimeout(() => r($("start").dataset.wallpaper === "dusk" && $("start").dataset.tone === "dark"), 900)));

      // Panel: opens/closes with the button, clicking a tile writes the pref
      $("start-custom").click();
      check("Özelleştir button opens the panel (with the pop animation)", S.isOpen() && !$("custom-panel").hidden && $("custom-panel").getAnimations().length > 0);
      $("cp-walls").querySelector('button[data-id="paper"]').click();
      check("pref was written and applied when a tile was clicked", prefs.getStringPref("vento.start.wallpaper") === "paper" && await wait(() => $("start").dataset.wallpaper === "paper" && $("start").dataset.tone === "light", 8000));
      check("panel is unaffected by the tone change: text color is the app's own color (independent of the start text)", getComputedStyle($("custom-panel")).color === getComputedStyle(document.body).color && $("start").dataset.tone === "light", `${getComputedStyle($("custom-panel")).color} / body ${getComputedStyle(document.body).color}`);
      // Ebabil on/off
      $("cp-ebabil").checked = false;
      $("cp-ebabil").dispatchEvent(new Event("change"));
      check("when 'Ebabil'i göster' is turned off Ebabil is hidden and the pref is written", $("ebabil").hidden === true && prefs.getBoolPref("vento.start.ebabil") === false);
      prefs.setBoolPref("vento.start.ebabil", true);
      check("when the pref changes from outside (observer) Ebabil comes back and the box is checked", $("ebabil").hidden === false && $("cp-ebabil").checked === true);
      // ways to close
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      check("Esc closes the panel", await wait(() => $("custom-panel").hidden, 3000));
      S.open();
      $("stage").dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      check("closes on a click outside the panel", await wait(() => $("custom-panel").hidden, 3000));
      S.open();
      const other = tabs.open(`${Services.env.get("VENTO_ESIN_ENDPOINT").replace(/\/v1$/, "")}/oturum/baska`);
      check("the panel closes too when the start screen goes away (navigating to a page)", await wait(() => $("custom-panel").hidden, 5000));
      tabs.close(other);
      tabs.select(blank);
      setWall("");
      prefs.setBoolPref("vento.start.ebabil", true);
      await wait(() => !$("start").hasAttribute("data-wallpaper"), 3000);

      // Esin logo: a single-color mask in the toolbar, colored in the panel header
      const g = document.querySelector("#nav-esin .esin-glyph");
      const logo = document.querySelector(".esin-logo");
      await wait(() => logo.complete, 4000);
      check("Esin button: single-color logo mask (color = currentColor), no old ✦", getComputedStyle(g).maskImage.includes("esin-mask.png") && g.getBoundingClientRect().width >= 16 && !document.querySelector("#nav-esin svg"), getComputedStyle(g).maskImage);
      check("colored logo loaded in the Esin panel header", logo.complete && logo.naturalWidth === 256 && logo.src.endsWith("esin-color.png"), String(logo.naturalWidth));

      // Document icons: in the bundle and Vento's own
      const res = Services.dirsvc.get("GreD", Ci.nsIFile);
      const readIcns = async name => { const f = res.clone(); f.append(name); return IOUtils.read(f.path); };
      const [doc, app] = [await readIcns("document.icns"), await readIcns("firefox.icns")];
      const magic = b => new TextDecoder().decode(b.slice(0, 4));
      check("document.icns is a valid icns and the Vento document icon (different from the app icon)", magic(doc) === "icns" && doc.length > 50000 && doc.length !== app.length, `${doc.length} B`);
    }

    // ===================== UI language (Turkish) =====================
    {
      const L = Services.locale;
      check("UI language is Turkish (tr), the default stays en-US", L.appLocaleAsBCP47 === "tr" && L.defaultLocale === "en-US", `${L.appLocaleAsBCP47} / default ${L.defaultLocale}`);
      check("packaged languages: tr and en-US (fallback)", L.packagedLocales.includes("tr") && L.packagedLocales.includes("en-US"), L.packagedLocales.join(","));
      check("requested languages: tr, falls back to en-US", L.requestedLocales[0] === "tr" && L.appLocalesAsBCP47.includes("en-US"), `${L.requestedLocales} → ${L.appLocalesAsBCP47}`);
      // .properties (chrome://.../locale/) in Turkish
      const dlg = Services.strings.createBundle("chrome://global/locale/commonDialogs.properties");
      Vento.trace(`LOCALE-DIAG commonDialogs Yes="${dlg.GetStringFromName("Yes")}" Cancel="${dlg.GetStringFromName("Cancel")}" EnterUserPasswordFor2="${dlg.GetStringFromName("EnterUserPasswordFor2")}"`);
      check("commonDialogs.properties in Turkish ('&Evet', & = access key)", dlg.GetStringFromName("Yes") === "&Evet" && dlg.GetStringFromName("Cancel") === "Vazgeç", `${dlg.GetStringFromName("Yes")} / ${dlg.GetStringFromName("Cancel")}`);
      // Fluent (.ftl) in Turkish + the set doesn't crash even if a single file is missing
      const loc = new Localization(["toolkit/neterror/netError.ftl", "branding/brand.ftl"], true);
      const v = loc.formatValueSync("neterror-page-title");
      check("Fluent: neterror-page-title in Turkish", typeof v === "string" && v.length > 0 && v !== "neterror-page-title", String(v));
    }

    // ===================== Error pages =====================
    // Toolkit's about:neterror can't resolve any message if the app locale resource (brand.ftl) isn't registered:
    // the title is empty, the texts stay raw. Registration: vento/l10n-registry.manifest.
    {
      const tab = tabs.selected;
      const docURI = () => tab.browser.browsingContext?.currentWindowGlobal?.documentURI?.spec ?? "";
      const missing = [];
      const listener = { observe(m) { if (m instanceof Ci.nsIScriptError && /Missing resource/.test(m.errorMessage)) missing.push(m.errorMessage); } };
      Services.console.registerListener(listener);
      tab.browser.fixupAndLoadURIString("http://nonexistent.invalid/", { triggeringPrincipal: Vento.SYSTEM_PRINCIPAL });
      check("DNS error: about:neterror opened", await wait(() => docURI().startsWith("about:neterror?e=dnsNotFound"), 15000), docURI());
      await wait(() => tab.title === "Sunucu bulunamadı", 10000);
      Services.console.unregisterListener(listener);
      const text = await new Promise(resolve => {
        const mm = tab.browser.messageManager;
        mm.addMessageListener("vento:errtext", m => resolve(m.data), { once: true });
        mm.loadFrameScript("data:,(" + encodeURIComponent(`function(){ sendAsyncMessage("vento:errtext", content.document.body?.innerText || ""); }`) + ")()", false);
        setTimeout(() => resolve(""), 5000);
      });
      check("error page title resolved and in Turkish", tab.title === "Sunucu bulunamadı", `"${tab.title}"`);
      check("error page text in Turkish ('Aradığınız siteyi bulamıyoruz')", text.includes("Aradığınız siteyi bulamıyoruz"), text.slice(0, 120));
      check("brand name is Vento (not Nightly/Firefox)", /Vento/.test(text) && !/Nightly|Firefox/.test(text), text.match(/.{0,30}Vento.{0,40}/)?.[0] ?? text.slice(0, 200));
      check("no missing locale resource was reported (brand.ftl)", missing.length === 0, missing.join(" | "));
      check("app locale resource is registered", L10nRegistry.getInstance().getSourceNames().some(n => n.includes("vento")));
    }

    // ===================== Certificate error page (real HTTPS, self-signed) =====================
    {
      const https = Services.env.get("VENTO_TEST_HTTPS");
      const tab = tabs.open("about:blank"); // clean tab (so the previous error page test's state doesn't interfere)
      const docURI = () => tab.browser.browsingContext?.currentWindowGlobal?.documentURI?.spec ?? "";
      const load = u => tab.browser.fixupAndLoadURIString(u, { triggeringPrincipal: Vento.SYSTEM_PRINCIPAL });
      // Runs a function in the content process and gets its result
      const inPage = (body, ms = 8000) => new Promise(resolve => {
        body = body.replace(/\bdocument\b/g, "content.document");
        const id = "vento:sonuc:" + Math.random();
        const mm = tab.browser.messageManager;
        mm.addMessageListener(id, m => resolve(m.data), { once: true });
        // async supported; the source must be ASCII (the data: script is read as Latin-1)
        mm.loadFrameScript("data:,(" + encodeURIComponent(`function(){ Promise.resolve().then(() => (${body})()).then(r => sendAsyncMessage(${JSON.stringify(id)}, r), e => sendAsyncMessage(${JSON.stringify(id)}, "HATA " + e)); }`) + ")()", false);
        setTimeout(() => resolve("ZAMAN AŞIMI"), ms);
      });
      check("privacy: no request is made to Mozilla's MITM server on a certificate error", Services.prefs.getBoolPref("security.certerrors.mitm.priming.enabled") === false);
      Services.prefs.setIntPref("security.dialog_enable_delay", 0); // the 1 s wait on the "Riski kabul et" button (test only)
      const overrides = Cc["@mozilla.org/security/certoverride;1"].getService(Ci.nsICertOverrideService);

      load(`${https}/`);
      check("self-signed HTTPS: about:certerror opened", await wait(() => docURI().startsWith("about:certerror"), 15000), docURI().slice(0, 80));
      check("certificate error page title resolved and in Turkish", await wait(() => tab.title === "Uyarı: Güvenlik riskiyle karşılaşabilirsiniz", 10000), `"${tab.title}"`);
      const page = await inPage(`() => ({ text: document.body.innerText, adv: !!document.getElementById("advancedButton"), ret: !!document.getElementById("returnButton"), exc: !!document.getElementById("exceptionDialogButton") })`);
      check("page text: 'Vento' appears, no Nightly/Firefox", /Vento/.test(page.text) && !/Nightly|Firefox/.test(page.text), String(page.text).slice(0, 160).replace(/\n/g, " | "));
      check("buttons: Gelişmiş, Geri dön, İstisna", page.adv && page.ret && page.exc, JSON.stringify(page));

      await inPage(`() => document.getElementById("advancedButton").click()`);
      const adv = await inPage(`() => { const b = document.getElementById("exceptionDialogButton"); return { hidden: b.closest("[hidden]") ? "gizli" : "gorunur", disabled: b.disabled }; }`);
      check("'Gelişmiş' -> the 'Riski kabul et' button is visible", adv.hidden === "gorunur", JSON.stringify(adv));

      await wait(async () => (await inPage(`() => !document.getElementById("exceptionDialogButton").disabled`)) === true, 8000);
      await inPage(`() => document.getElementById("exceptionDialogButton").click()`);
      check("page actually loaded after accepting the risk", await wait(() => tab.title === "Güvenli sayfa", 15000), `"${tab.title}" ${docURI().slice(0, 50)}`);
      check("address bar shows the HTTPS URL (not the error URL)", tab.url === `${https}/`, tab.url);
      check("exception was stored (not asked again in the same session)", await (async () => { load(`${https}/?ikinci`); return wait(() => tab.title === "Güvenli sayfa" && tab.url.endsWith("?ikinci"), 15000); })());
      overrides.clearAllOverrides();

      // "Geri dön": to the previous page (clean history: data: page -> certificate error -> back)
      load("data:text/html,<title>onceki</title>");
      await wait(() => tab.title === "onceki" && !tab.loading, 10000);
      load(`${https}/?geri`);
      await wait(() => docURI().startsWith("about:certerror"), 15000);
      await inPage(`() => document.getElementById("returnButton").click()`);
      check("'Geri dön' took us to the previous page", await wait(() => tab.title === "onceki" && !docURI().startsWith("about:certerror"), 10000), `${docURI().slice(0, 40)} "${tab.title}"`);
      Services.prefs.clearUserPref("security.dialog_enable_delay");
      tabs.close(tab);
    }

    // ===================== HTTP authentication (real server, end to end) =====================
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
      check("protected page: auth dialog opened", await wait(() => visible() && card()?.querySelector(".dlg-user") && card().querySelector(".dlg-pass"), 15000));
      const text = card()?.textContent ?? "";
      // Security: the realm is under the server's control (a fake prompt text can be written) -> Firefox only shows it for a proxy; we must not show it either
      check("dialog: the site (127.0.0.1) is visible, the realm written by the server is NOT shown", text.includes("127.0.0.1") && !text.includes("Test Alani"), text.slice(0, 160));
      check("dialog: there is an 'insecure' warning for http", !!card()?.querySelector(".dlg-warn, .dlg-insecure") || /güvens|şifrelen|encrypt/i.test(text), text.slice(0, 160));
      check("password field is hidden (type=password)", card()?.querySelector(".dlg-pass")?.type === "password");

      // wrong password -> the server returns 401 again -> the dialog opens AGAIN
      card().querySelector(".dlg-user").value = "can";
      card().querySelector(".dlg-pass").value = "yanlis";
      btn(0).click();
      check("wrong password: the dialog asked again", await wait(() => visible() && card()?.querySelector(".dlg-pass")?.value === "", 15000));

      card().querySelector(".dlg-user").value = "can";
      card().querySelector(".dlg-pass").value = "gizli";
      btn(0).click();
      check("correct password: page loaded", await wait(() => tab.title === "Giris yapildi" && !visible(), 15000), `"${tab.title}"`);
      const a1 = await attempts();
      check("server: first without credentials, then wrong, then correct", a1.length >= 3 && !a1[0].sent && a1.some(a => a.sent && !a.ok) && a1.at(-1).ok, JSON.stringify(a1));

      // not asked again in the same realm after a successful login
      load(`${llm}/kimlik/iki`);
      check("no dialog in the same realm after login", await wait(() => tab.title === "Giris yapildi" && tab.url.endsWith("/iki"), 15000) && !visible(), `"${tab.title}" dialog=${visible()}`);

      // cancel -> the 401 page shows, the dialog closes
      clearLogins();
      load(`${llm}/kimlik/uc`);
      await wait(() => visible() && card()?.querySelector(".dlg-user"), 15000);
      btn(1).click();
      check("Cancel: the server's 401 page was shown, the dialog closed", await wait(() => tab.title === "Yetkisiz" && !visible(), 15000), `"${tab.title}" dialog=${visible()}`);
      const a2 = await attempts();
      check("Cancel: no password was sent to the server after cancelling", !a2.filter(a => a.url.endsWith("/uc")).some(a => a.sent), JSON.stringify(a2.filter(a => a.url.endsWith("/uc"))));

      clearLogins();
      tabs.close(tab);
    }

    // ===================== File picker (<input type=file>) =====================
    // The native macOS panel can't be clicked in a headless test -> a registered mock picker. What is measured: does the page really call the picker,
    // are the mode/filter right, does the chosen file reach the page, does the page stay unchanged on Cancel.
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
      // Clicks the input with a real user activation (otherwise the page can't open the picker)
      const tikla = id => inPage(`() => { content.document.notifyUserGestureActivation(); content.document.getElementById("${id}").click(); return true; }`);
      const tmp = name => PathUtils.join(PathUtils.tempDir, name);
      const nsFile = path => { const f = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile); f.initWithPath(path); return f; };
      await IOUtils.writeUTF8(tmp("vento-test-a.txt"), "merhaba");
      await IOUtils.writeUTF8(tmp("vento-test-b.txt"), "dunya");

      // The real (native) picker component exists and can be initialized with our window
      {
        let ok = false, err = "";
        try {
          const fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
          fp.init(window.browsingContext, "Dosya sec", Ci.nsIFilePicker.modeOpen);
          ok = true;
        } catch (e) { err = String(e); }
        check("native file picker component exists and initializes with the window", ok, err);
      }

      // -- mock picker
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

        // single file
        mock.files = [nsFile(tmp("vento-test-a.txt"))];
        await tikla("tek");
        check("single file: the page called the picker (Open mode, has a title, window attached)", await wait(() => mock.calls.length === 1, 10000) && mock.calls[0].mode === Ci.nsIFilePicker.modeOpen && mock.calls[0].hasBC && mock.calls[0].title !== "", JSON.stringify(mock.calls[0]));
        check("single file: name and CONTENT reached the page", await wait(() => tab.title === "dosya:tek:vento-test-a.txt=merhaba", 10000), `"${tab.title}"`);

        // Cancel: the page must not change
        mock.result = Ci.nsIFilePicker.returnCancel;
        mock.files = [];
        load(`${llm}/dosya.html?iptal`);
        await wait(() => tab.title === "hazir" && tab.url.endsWith("?iptal"), 15000);
        const n0 = mock.calls.length;
        await tikla("tek");
        await wait(() => mock.calls.length === n0 + 1, 10000);
        await new Promise(r => setTimeout(r, 800));
        const secim = await inPage(`() => content.document.getElementById("tek").files.length`);
        check("Cancel: the picker opened but no file was chosen on the page, the title didn't change", secim === 0 && tab.title === "hazir", `files=${secim} title="${tab.title}"`);

        // multiple
        mock.result = Ci.nsIFilePicker.returnOK;
        mock.files = [nsFile(tmp("vento-test-a.txt")), nsFile(tmp("vento-test-b.txt"))];
        const n1 = mock.calls.length;
        await tikla("cok");
        check("multiple: Open-multiple mode was requested", await wait(() => mock.calls.length === n1 + 1, 10000) && mock.calls.at(-1).mode === Ci.nsIFilePicker.modeOpenMultiple, String(mock.calls.at(-1)?.mode));
        check("multiple: both files reached the page", await wait(() => tab.title === "dosya:cok:vento-test-a.txt=merhaba|vento-test-b.txt=dunya", 10000), `"${tab.title}"`);

        // accept="...": the filter is passed to the picker
        mock.files = [nsFile(tmp("vento-test-a.txt"))];
        const n2 = mock.calls.length;
        await tikla("acc");
        await wait(() => mock.calls.length === n2 + 1, 10000);
        const rec = mock.calls.at(-1);
        check("accept='.txt,image/png': the filter was passed to the picker", rec.filters.some(f => /\*\.txt/.test(f)) || rec.masks !== 0, JSON.stringify(rec));

        // folder selection
        const n3 = mock.calls.length;
        mock.files = [nsFile(PathUtils.tempDir)];
        await tikla("dir");
        check("webkitdirectory: folder-select mode was requested", await wait(() => mock.calls.length === n3 + 1, 10000) && mock.calls.at(-1).mode === Ci.nsIFilePicker.modeGetFolder, String(mock.calls.at(-1)?.mode));
      } finally {
        registrar.unregisterFactory(newCID, factory);
        if (oldCID) { registrar.registerFactory(oldCID, "", CONTRACT, null); }
      }
      await IOUtils.remove(tmp("vento-test-a.txt"), { ignoreAbsent: true });
      await IOUtils.remove(tmp("vento-test-b.txt"), { ignoreAbsent: true });
      tabs.close(tab);
    }

    // ===================== Printing =====================
    // The native macOS panel can't be clicked in a headless test -> the "Save to PDF" virtual printer + silent mode: we measure whether a real PDF is produced.
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

      check("printing layer can be loaded (PrintUtils) and the system panel is preferred", typeof Vento.loadPrintUtils()?.startPrintWindow === "function" && Services.prefs.getBoolPref("print.prefer_system_dialog") === true);
      const key = document.getElementById("key_print");
      check("⌘P shortcut and the File > Yazdır… menu are wired", key?.getAttribute("key") === "p" && key.getAttribute("modifiers") === "accel" && document.getElementById("menu_print")?.getAttribute("command") === "cmd_print");
      check("printing doesn't start on a blank tab (false)", Vento.print(tab) === false);

      Services.prefs.setBoolPref("print.always_print_silent", true);
      try {
        // ⌘P path
        load(`${llm}/yazdir.html`);
        await wait(() => tab.title === "Yazdirma sayfasi" && !tab.loading, 15000);
        await IOUtils.remove(pdf("vento-yazdir-a.pdf"), { ignoreAbsent: true });
        setOut(pdf("vento-yazdir-a.pdf"));
        check("⌘P: printing started (true)", Vento.print() === true);
        check("⌘P: a real PDF was produced (%PDF-, >1 KB)", await wait(() => isPDF(pdf("vento-yazdir-a.pdf")), 20000), String((await IOUtils.exists(pdf("vento-yazdir-a.pdf"))) && (await IOUtils.stat(pdf("vento-yazdir-a.pdf"))).size));

        // window.print(): the page itself calls it
        await IOUtils.remove(pdf("vento-yazdir-b.pdf"), { ignoreAbsent: true });
        setOut(pdf("vento-yazdir-b.pdf"));
        load(`${llm}/yazdir.html?pencere`);
        check("window.print(): a real PDF was produced", await wait(() => isPDF(pdf("vento-yazdir-b.pdf")), 25000), String(await IOUtils.exists(pdf("vento-yazdir-b.pdf"))));
        await new Promise(r => setTimeout(r, 1500));
        check("after printing the page is still loaded and the tab count is the same", tab.title === "Yazdirma sayfasi" && tabs.all.includes(tab), `"${tab.title}"`);
        check("temporary browsers opened for printing were cleaned up", document.querySelectorAll("browser").length <= browsersBefore + 0, `${document.querySelectorAll("browser").length} / before ${browsersBefore}`);
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

    // ===================== Reopen closed tab (⌘⇧T) =====================
    {
      const llm = Services.env.get("VENTO_ESIN_ENDPOINT").replace(/\/v1$/, "");
      const u = n => `${llm}/kapali/${n}`;
      const cmd = document.getElementById("cmd_reopenTab");
      tabs.forgetClosed(); // so tabs closed by earlier tests don't interfere
      const base = tabs.all.length;
      const open = (n, select = false) => tabs.open(u(n), { select, lazy: { url: u(n), title: "Sayfa " + n } });
      const key = document.getElementById("key_reopenTab");
      check("⌘⇧T shortcut and the Geçmiş menu are wired", key?.getAttribute("key") === "t" && key.getAttribute("modifiers") === "accel,shift" && document.getElementById("menu_reopenTab")?.getAttribute("command") === "cmd_reopenTab");
      check("command is disabled when there is no closed tab, reopenClosed() is null", cmd.hasAttribute("disabled") && tabs.closed.length === 0 && tabs.reopenClosed() === null);

      const [A, B, C] = [open("a"), open("b"), open("c")];
      tabs.close(B);
      check("closed tab went onto the stack (URL + title + index)", tabs.closed.length === 1 && tabs.closed[0].url === u("b") && tabs.closed[0].title === "Sayfa b" && tabs.closed[0].index === base + 1, JSON.stringify(tabs.closed));
      check("command became enabled", !cmd.hasAttribute("disabled"));

      const back = tabs.reopenClosed();
      check("⌘⇧T: the tab returned to its OLD position (between A and C) and was selected", back && tabs.all.indexOf(back) === base + 1 && tabs.all[base] === A && tabs.all[base + 2] === C && tabs.selected === back, String(tabs.all.indexOf(back)));
      check("reopened tab's page loaded", await wait(() => back.url === u("b") && back.browser.currentURI?.spec === u("b"), 15000), back.url);
      check("stack emptied, command disabled again", tabs.closed.length === 0 && cmd.hasAttribute("disabled"));

      // order: the most recently closed comes back first
      tabs.close(A); tabs.close(C);
      check("newest first: C, then A", tabs.closed[0].url === u("c") && tabs.closed[1].url === u("a"), JSON.stringify(tabs.closed.map(c => c.url)));
      const r1 = tabs.reopenClosed();
      const r2 = tabs.reopenClosed();
      check("the first ⌘⇧T opens C, the second A, the stack empties", tabs.closed.length === 0 && !!r1 && !!r2 && await wait(() => r1.url === u("c") && r2.url === u("a"), 15000), `${r1?.url} ${r2?.url}`);

      // real pages only: blank tabs, data: and error pages don't go on the stack
      const blank = tabs.open("about:blank", { select: false });
      const dat = tabs.open("data:text/html,<title>d</title>", { select: false });
      await wait(() => dat.url.startsWith("data:"), 10000);
      tabs.close(blank); tabs.close(dat);
      check("blank and data: tabs don't go on the stack", tabs.closed.length === 0, JSON.stringify(tabs.closed));

      // limit: 25
      const many = Array.from({ length: 30 }, (_, i) => open("m" + i));
      many.forEach(t => tabs.close(t));
      check("stack keeps at most 25 entries, newest first", tabs.closed.length === 25 && tabs.closed[0].url === u("m29") && tabs.closed.at(-1).url === u("m5"), `${tabs.closed.length} ${tabs.closed[0]?.url.slice(-3)}`);
      tabs.forgetClosed();
      check("forgetClosed: stack emptied and command disabled", tabs.closed.length === 0 && cmd.hasAttribute("disabled"));
      for (const t of tabs.all.slice(base)) { tabs.close(t); }
      tabs.forgetClosed();
    }

    // ===================== Tab icons (favicon) =====================
    {
      const llm = Services.env.get("VENTO_ESIN_ENDPOINT").replace(/\/v1$/, "");
      const tab = tabs.selected;
      const load = u => tab.browser.fixupAndLoadURIString(u, { triggeringPrincipal: Vento.SYSTEM_PRINCIPAL });
      const mark = () => document.querySelector(".tab[selected] .tab-mark");
      const img = () => mark()?.querySelector("img");

      load(`${llm}/simge/link.html`);
      check("<link rel=icon>: the tab icon arrived (data:image)", await wait(() => tab.icon.startsWith("data:image/"), 15000), tab.icon.slice(0, 40));
      const linkIcon = tab.icon;
      check("icon was drawn as an <img> in the tab strip", await wait(() => !tab.loading && img()?.complete && img().naturalWidth === 16), `${img()?.naturalWidth}`);
      check("no letter mark while there is an icon, has-icon class is present", mark()?.classList.contains("has-icon") && !mark().textContent.trim());

      load(`${llm}/simge/kok.html`);
      check("page without a link: fell back to /favicon.ico", await wait(() => tab.icon.startsWith("data:image/") && tab.icon !== linkIcon, 15000), tab.icon.slice(0, 40));

      load("data:text/html,<title>x</title>");
      check("old site icon is gone after navigating to another page", await wait(() => tab.icon === "" && !tab.loading), tab.icon.slice(0, 40));
      check("letter mark came back when there is no icon", await wait(() => !img() && mark()?.textContent.trim() !== "" && !mark().classList.contains("has-icon")));

      Vento.tabs.setIcon(tab.browser, "data:image/png;base64,AAAA");
      check("broken icon -> quietly falls back to the letter mark", await wait(() => tab.icon === "" && !img() && mark()?.textContent.trim() !== ""), tab.icon);

      // A visited page's icon is stored in Places -> a lazily opened session tab shows its icon without loading
      load(`${llm}/simge/link.html`);
      await wait(() => tab.icon.startsWith("data:image/") && !tab.loading, 15000);
      await new Promise(r => setTimeout(r, 1500)); // Places write is async
      const before = tabs.all.length;
      Vento.session.restore({ selected: 1, tabs: [{ url: `${llm}/simge/link.html`, title: "Bağlantılı" }, { url: "http://127.0.0.1:1/bos", title: "b" }] });
      const cached = tabs.all[before];
      check("lazy tab: icon came from the cache before loading", await wait(() => cached.pending && cached.icon.startsWith("data:image/"), 10000), `pending=${!!cached.pending} icon=${cached.icon.slice(0, 30)}`);
      for (const t of tabs.all.slice(before)) { tabs.close(t); }
      load("data:text/html,<title>x</title>");
      await wait(() => tab.icon === "" && !tab.loading);
    }

    // ===================== Bookmarks + top sites =====================
    {
      const B = Vento.bookmarks;
      const $ = id => document.getElementById(id);
      const bmUrl = "https://example.com/vento-yerimi-testi";
      await B.remove(bmUrl);
      check("bookmark: none at first", !(await B.isBookmarked(bmUrl)));
      check("bookmark: a non-web URL is not added", (await B.add("javascript:alert(1)")) === null && (await B.add("chrome://vento/content/vento.xhtml")) === null);
      let changed = 0;
      const onChange = () => changed++;
      B.addEventListener("change", onChange);
      await B.add(bmUrl, "Yer imi testi");
      check("bookmark: added and 'change' was fired", (await B.isBookmarked(bmUrl)) && changed >= 1, String(changed));
      const listed = (await B.list(50)).find(b => b.url === bmUrl);
      check("bookmark: in the list, with its title", listed?.title === "Yer imi testi", JSON.stringify(listed));
      check("bookmark: in the 'Diğer yer imleri' folder", (await B.find(bmUrl))?.parentGuid === Places.bookmarks.unfiledGuid);

      // ⌘D command and the star button (current tab: example.com)
      const cur = tabs.open("https://example.com/", { select: true });
      await wait(() => cur.title === "Example Domain");
      check("star: enabled on a web page", await wait(() => !$("nav-bookmark").disabled), cur.url);
      check("star: unmarked when not bookmarked", !$("nav-bookmark").hasAttribute("active"));
      check("toggle: added (true)", (await B.toggle(cur)) === true && (await B.isBookmarked(cur.url)));
      check("star: filled when bookmarked", await wait(() => $("nav-bookmark").hasAttribute("active"), 5000));
      check("toggle: removed (false)", (await B.toggle(cur)) === false && !(await B.isBookmarked(cur.url)));
      check("star: empty after removing", await wait(() => !$("nav-bookmark").hasAttribute("active"), 5000));
      tabs.close(cur);

      // menu: built when it opens
      const popup = $("menu_BookmarksPopup");
      popup.dispatchEvent(new Event("popupshowing"));
      check("Yer İmleri menu: the bookmark row was built", await wait(() => [...popup.querySelectorAll(".bm-item")].some(m => m.getAttribute("tooltiptext") === bmUrl), 5000));

      // start screen tiles
      const tops = await B.topSites(8);
      check("topSites: the bookmark came as a tile (bookmark=true)", tops.some(s => s.url === bmUrl && s.bookmark === true), JSON.stringify(tops.map(s => s.host)));
      check("topSites: one tile per host", new Set(tops.map(s => s.host)).size === tops.length);
      check("topSites: at most 8", tops.length <= 8);
      // x: a bookmark tile -> deleted
      await B.remove(bmUrl);
      check("bookmark left the list when deleted", !(await B.list(50)).some(b => b.url === bmUrl));

      // hiding a top site (by hostname)
      const hiddenBefore = Services.prefs.getStringPref(B.constructor.PREF_HIDDEN, "[]");
      B.hideHost("gizli-site.example");
      check("hideHost: written to the pref", JSON.parse(Services.prefs.getStringPref(B.constructor.PREF_HIDDEN, "[]")).includes("gizli-site.example"));
      Services.prefs.setStringPref(B.constructor.PREF_HIDDEN, hiddenBefore);
      B.removeEventListener("change", onChange);
    }

    // ===================== Update =====================
    {
      const U = Vento.update;
      const $ = id => document.getElementById(id);
      const { AppUpdater: AU } = ChromeUtils.importESModule("resource://gre/modules/AppUpdater.sys.mjs");
      const prefLast = U.constructor.PREF_LAST;
      const hadLast = Services.prefs.prefHasUserValue(prefLast);
      const oldLast = Services.prefs.getStringPref(prefLast, "");

      // release notes URL: by language, with a version parameter
      check("release notes: /surum-notlari/?v= in Turkish", U.releaseNotesURL("1.2.0") === "https://vento.cansoykanyilmaz.com/surum-notlari/?v=1.2.0", U.releaseNotesURL("1.2.0"));
      // first launch after an update logic
      const r1 = U.afterUpdate({ last: "", current: "1.0.0", open: false });
      check("afterUpdate: doesn't open on first install (no record)", r1 === null);
      check("afterUpdate: recorded the version", Services.prefs.getStringPref(prefLast) === "1.0.0");
      check("afterUpdate: doesn't open on the same version", U.afterUpdate({ last: "1.0.0", current: "1.0.0", open: false }) === null);
      check("afterUpdate: doesn't open when going back to an older version", U.afterUpdate({ last: "1.1.0", current: "1.0.0", open: false }) === null);
      check("afterUpdate: gives the release notes when the version goes up", U.afterUpdate({ last: "1.0.0", current: "1.1.0", open: false }) === U.releaseNotesURL("1.1.0"));
      check("afterUpdate: '1.9' -> '1.10' sorts correctly (version comparison, not text)", U.afterUpdate({ last: "1.9.0", current: "1.10.0", open: false }) === U.releaseNotesURL("1.10.0"));
      const nTabs = tabs.all.length;
      const opened = U.afterUpdate({ last: "0.9.0", current: "1.0.0" });
      check("afterUpdate: open=true opened the release notes in a new tab", tabs.all.length === nTabs + 1 && opened === U.releaseNotesURL("1.0.0") && await wait(() => tabs.selected.url.includes("surum-notlari"), 10000), tabs.selected.url);
      tabs.close(tabs.selected);
      if (hadLast) { Services.prefs.setStringPref(prefLast, oldLast); } else { Services.prefs.clearUserPref(prefLast); }

      // fake updater: states are reflected in the text and the bar
      const statuses = [];
      const onStatus = e => statuses.push(e.detail.id);
      U.addEventListener("status", onStatus);
      const fake = () => {
        let cb;
        return { addListener(f) { cb = f; }, stop() {}, check() { this.emit = cb; return Promise.resolve(); }, allowed: false, allowUpdateDownload() { this.allowed = true; } };
      };
      let f = fake();
      await U.check(f);
      f.emit(AU.STATUS.CHECKING);
      check("update: checking state", U.status.id === "checking" && U.status.text.length > 0 && U.status.text !== "up-checking", JSON.stringify(U.status));
      f.emit(AU.STATUS.NO_UPDATES_FOUND);
      check("update: the current state reports the version", U.status.id === "current" && U.status.text.includes(Services.appinfo.version), JSON.stringify(U.status));
      f.emit(AU.STATUS.DOWNLOADING, 50, 200);
      check("update: download percentage (%25)", U.status.id === "downloading" && /25/.test(U.status.text), JSON.stringify(U.status));
      f.emit(AU.STATUS.DOWNLOAD_FAILED);
      check("update: error state", U.status.id === "failed");
      f.emit(AU.STATUS.NO_UPDATER);
      check("update: no updater -> 'unavailable'", U.status.id === "unavailable");
      check("the bar didn't open in the error/current states", $("update-bar").hidden);

      // auto off: the "İndir ve kur" bar -> permission is granted
      f.emit(AU.STATUS.DOWNLOAD_AND_INSTALL);
      check("update found: the bar opened, 'download' button", await wait(() => !$("update-bar").hidden && $("ub-primary").dataset.kind === "available"), $("ub-primary").dataset.kind);
      $("ub-primary").click();
      check("'download' granted permission (allowUpdateDownload) and the bar closed", f.allowed === true && await wait(() => $("update-bar").hidden, 5000));
      // auto on: ready -> the "restart" bar; "later" dismisses it
      f.emit(AU.STATUS.READY_FOR_RESTART);
      check("update ready: the bar with a 'restart' button", await wait(() => !$("update-bar").hidden && $("ub-primary").dataset.kind === "ready"), $("ub-primary").dataset.kind);
      check("bar text was resolved (not a raw id)", $("ub-text").textContent.length > 5 && !/^ub-/.test($("ub-text").textContent), $("ub-text").textContent);
      $("ub-later").click();
      check("'later' closed the bar", await wait(() => $("update-bar").hidden, 5000));
      check("status events were fired in order", statuses.join() === "checking,current,downloading,failed,unavailable,found,ready", statuses.join());
      U.removeEventListener("status", onStatus);

      // Manual check button and status text in the Customize panel
      check("Özelleştir: the 'Güncellemeleri denetle' button exists", !!$("cp-update-check") && !!$("cp-update-status"));
    }

    // ===================== UI language (Fluent, live switching) =====================
    {
      const L = Vento.l10n;
      const reqBefore = Services.prefs.prefHasUserValue("intl.locale.requested") ? Services.prefs.getStringPref("intl.locale.requested") : null;
      check("l10n: attribute text (.title) resolved", L.attr("tip-tab-close") !== "tip-tab-close" && L.attr("tip-tab-close").length > 3, L.attr("tip-tab-close"));
      check("l10n: Turkish resolved", L.locale === "tr" && L.t("up-checking") !== "up-checking", L.t("up-checking"));
      const tr = L.t("w-start");
      check("l10n: text with a variable", L.t("up-current", { version: "9.9.9" }).includes("9.9.9"), L.t("up-current", { version: "9.9.9" }));
      check("l10n: missing id -> the id itself, and it was recorded in 'missing'", L.t("yok-boyle-bir-kimlik") === "yok-boyle-bir-kimlik" && L.missing.includes("yok-boyle-bir-kimlik"));
      let changes = 0;
      const onChange = () => changes++;
      L.addEventListener("change", onChange);
      L.setLocale("en-US");
      check("l10n: switched to English (event + language)", await wait(() => L.locale === "en-US" && changes >= 1, 10000), `${L.locale} event=${changes}`);
      const en = L.t("w-start");
      check("l10n: English text differs from Turkish", en !== tr && en !== "w-start", `${tr} ↔ ${en}`);
      check("l10n: static text (data-l10n-id) refreshed live", await wait(() => document.getElementById("w-next").textContent === L.t("w-next"), 10000), document.getElementById("w-next").textContent);
      check("l10n: English release notes URL", Vento.update.releaseNotesURL("2.0.0").startsWith("https://vento.cansoykanyilmaz.com/en/release-notes/"), Vento.update.releaseNotesURL("2.0.0"));
      L.setLocale(reqBefore ?? "tr");
      if (reqBefore === null) { Services.prefs.clearUserPref("intl.locale.requested"); }
      check("l10n: switched back to Turkish", await wait(() => L.locale === "tr", 10000), L.locale);
      L.removeEventListener("change", onChange);
      // the only missing id must be the one this test made up (no raw id should show up in code)
      check("l10n: only the made-up id was missing throughout the tests", L.missing.every(id => id === "yok-boyle-bir-kimlik"), L.missing.join());
    }

    // ===================== First launch (welcome) =====================
    {
      const W = Vento.welcome;
      const $ = id => document.getElementById(id);
      const P = Services.prefs;
      const keep = ["vento.welcome.completed", "vento.esin.enabled", "vento.esin.consented", "app.update.auto", "intl.locale.requested"]
        .map(k => [k, P.prefHasUserValue(k) ? (P.getPrefType(k) === P.PREF_BOOL ? P.getBoolPref(k) : P.getStringPref(k)) : undefined]);
      P.clearUserPref("vento.esin.consented");
      P.setBoolPref("vento.esin.enabled", true);
      P.setBoolPref("app.update.auto", true);
      const visible = () => !$("welcome").hidden;
      const stepShown = () => [...document.querySelectorAll("#w-card .w-step")].filter(s => !s.hidden).map(s => s.dataset.step);

      W.show();
      check("welcome: opened, the first step is language", await wait(visible, 5000) && W.isOpen && W.step === "lang" && stepShown().join() === "lang", stepShown().join());
      check("welcome: language buttons (tr, en-US) and one is selected", document.querySelectorAll('[data-lang]').length === 2 && document.querySelectorAll('[data-lang][aria-pressed="true"]').length === 1);
      // the language choice applies instantly
      document.querySelector('[data-lang="en-US"]').click();
      check("welcome: the language choice applied live (en-US)", await wait(() => Vento.l10n.locale === "en-US", 10000), Vento.l10n.locale);
      document.querySelector('[data-lang="tr"]').click();
      check("welcome: switched back to Turkish", await wait(() => Vento.l10n.locale === "tr", 10000));
      // forward: lang -> hello -> esin
      W.next();
      check("welcome: step 2 is the intro", W.step === "hello" && stepShown().join() === "hello", W.step);
      W.next();
      check("welcome: step 3 is Esin", W.step === "esin", W.step);
      document.querySelector('[data-esin="off"]').click();
      check("Esin off: pref turned off, consent counts as not given", P.getBoolPref("vento.esin.enabled") === false && P.getBoolPref("vento.esin.consented", false) === false);
      check("sleeping Ebabil while Esin is off", $("w-eb-img").src.includes("pose-idle"), $("w-eb-img").src);
      document.querySelector('[data-esin="on"]').click();
      check("Esin on: pref turned on and consent counts as taken on this screen", P.getBoolPref("vento.esin.enabled") === true && P.getBoolPref("vento.esin.consented") === true);
      check("flying Ebabil while Esin is on", $("w-eb-img").src.includes("ebabil/still"), $("w-eb-img").src);
      W.next();
      check("welcome: step 4 is updates", W.step === "update" && $("w-update-off-note").hidden);
      document.querySelector('[data-update="off"]').click();
      check("Updates off: app.update.auto turned off and the warning note appeared", P.getBoolPref("app.update.auto") === false && !$("w-update-off-note").hidden);
      document.querySelector('[data-update="on"]').click();
      check("Updates on: turned back on, the note was hidden", P.getBoolPref("app.update.auto") === true && $("w-update-off-note").hidden);
      W.next();
      check("welcome: last step, 'Atla' hidden, the button is 'Başla'", W.step === "done" && $("w-skip").hidden && $("w-next").getAttribute("data-l10n-id") === "w-start");
      check("dots: 5 steps, the last one is marked", $("w-dots").children.length === 5 && $("w-dots").children[4].hasAttribute("on"));
      W.next();
      check("welcome: closed on finish and counted as completed", await wait(() => !visible() && !W.isOpen, 5000) && W.completed === true);

      // Esc closes the flow and counts it as completed; choices already made are not undone
      P.setBoolPref("vento.welcome.completed", false);
      W.show();
      check("welcome: reopened", await wait(visible, 5000) && W.step === "lang");
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      check("Esc: closed the welcome and counted it as completed", await wait(() => !visible(), 5000) && W.completed === true);
      W.show();
      W.show(); // calling again while open doesn't create a second copy
      check("calling show() again while open didn't reset the step or open it twice", W.isOpen && $("w-dots").children.length === 5);
      $("w-skip").click();
      check("'Atla' button closed it", await wait(() => !visible() && !W.isOpen, 5000));

      // restore the prefs
      for (const [k, v] of keep) {
        if (v === undefined) { P.clearUserPref(k); } else if (typeof v === "boolean") { P.setBoolPref(k, v); } else { P.setStringPref(k, v); }
      }
      check("language is Turkish after the welcome test", await wait(() => Vento.l10n.locale === "tr", 10000), Vento.l10n.locale);
    }

    // ===================== Esin: LLMTR logo and thanks =====================
    {
      const $ = id => document.getElementById(id);
      const keepConsent = Services.prefs.getBoolPref("vento.esin.consented", false);
      Services.prefs.setBoolPref("vento.esin.consented", true);
      Vento.esin.open();
      Vento.esin.clearChat();
      const card = $("esin-llmtr");
      const img = card.querySelector("img");
      check("LLMTR: the logo card is visible in the empty state", await wait(() => card.getBoundingClientRect().width > 100 && !$("esin-empty").hidden), `${JSON.stringify(card.getBoundingClientRect())} panelHidden=${$("esin").hidden} panelDisplay=${getComputedStyle($("esin")).display} emptyHidden=${$("esin-empty").hidden} emptyDisplay=${getComputedStyle($("esin-empty")).display} enabled=${Vento.esin.enabled} panelW=${$("esin").getBoundingClientRect().width}`);
      check("LLMTR: official logo loaded (SVG, aspect ratio kept)", await wait(() => img.complete && img.naturalWidth > 0), `${img.naturalWidth}x${img.naturalHeight} ${img.currentSrc}`);
      const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      check("LLMTR: the version that fits the ground (dark/light)", img.currentSrc.endsWith(dark ? "llmtr-on-dark.svg" : "llmtr-on-light.svg"), img.currentSrc);
      const r = img.getBoundingClientRect();
      check("LLMTR: logo aspect ratio is intact (141.435:36)", Math.abs(r.width / r.height - 141.435 / 36) < 0.05, `${r.width}x${r.height}`);
      const cr = card.getBoundingClientRect();
      check("LLMTR: padding of >= 50% of the logo height around it", (r.left - cr.left) >= r.height * 0.5 && (r.top - cr.top) >= r.height * 0.5, `${r.left - cr.left}px / ${r.top - cr.top}px, height ${r.height}`);
      const bg = getComputedStyle(card).backgroundColor;
      check("LLMTR: card color is the brand's token (#F8FAFC / #111113)", bg === (dark ? "rgb(17, 17, 19)" : "rgb(248, 250, 252)"), bg);
      const thanks = document.querySelector("#esin-thanks p");
      // static texts refresh asynchronously after a language change: wait for it
      check("LLMTR: the thanks text resolved and is visible", await wait(() => thanks.textContent.includes("LLMTR") && thanks.textContent.includes("teşekkür") && thanks.getBoundingClientRect().height > 10, 10000), thanks.textContent);
      check("LLMTR: accessible name and hint", card.getAttribute("role") === "link" && /LLMTR/.test(card.getAttribute("aria-label") ?? "") && !!card.title, `${card.getAttribute("aria-label")} / ${card.title}`);
      // click -> llmtr.com in a new tab
      const n = tabs.all.length;
      card.click();
      check("LLMTR: clicking opened llmtr.com in a new tab", tabs.all.length === n + 1 && await wait(() => tabs.selected.url.includes("llmtr.com"), 15000), tabs.selected.url);
      tabs.close(tabs.selected);
      card.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      check("LLMTR: also opens with Enter", tabs.all.length === n + 1 && await wait(() => tabs.selected.url.includes("llmtr.com"), 15000), tabs.selected.url);
      tabs.close(tabs.selected);
      Vento.esin.close();
      Services.prefs.setBoolPref("vento.esin.consented", keepConsent);
    }

    // ===================== Esin daily quota (the proxy's headers and 429 codes) =====================
    {
      const $ = id => document.getElementById(id);
      const llm = Services.env.get("VENTO_ESIN_ENDPOINT").replace(/\/v1$/, "");
      const keepConsent = Services.prefs.getBoolPref("vento.esin.consented", false);
      Services.prefs.setBoolPref("vento.esin.consented", true);
      Vento.esin.open();
      Vento.esin.clearChat();
      const idle = () => !Vento.esin.state.busy;
      const lastBot = () => [...$("esin-thread").querySelectorAll(".msg-assistant")].at(-1);
      const left = () => Number(/(\d+) \/ (\d+)/.exec($("esin-quota").textContent)?.[1]);

      Vento.esin.send("Kota birinci soru");
      check("quota: reply arrived", await wait(() => idle() && lastBot()?.textContent.includes("Kota birinci soru")), lastBot()?.textContent);
      check("quota: 'Bugün kalan: N / 30' is visible (from the proxy header)", !$("esin-quota").hidden && /Bugün kalan: \d+ \/ 30/.test($("esin-quota").textContent), $("esin-quota").textContent);
      const l1 = left();
      Vento.esin.send("Kota ikinci soru");
      check("quota: the remaining count dropped by 1 on the second question", await wait(() => idle() && lastBot()?.textContent.includes("Kota ikinci soru") && left() === l1 - 1, 10000), `${l1} → ${left()}`);
      check("quota: not highlighted when plenty is left", !$("esin-quota").hasAttribute("low") || left() <= 3);

      // user quota used up: a clear message, the renewal time, no RETRY, no second request goes to the provider
      Vento.esin.send("KOTA-DOLU");
      check("quota full: the error bubble appeared", await wait(() => idle() && !!lastBot()?.classList.contains("msg-error")), lastBot()?.textContent);
      const msg = lastBot()?.textContent ?? "";
      check("quota full: the message states the quota (30 questions) and the renewal", /30 soru/.test(msg) && /Yenilenme: /.test(msg), msg);
      check("quota full: no 'Tekrar dene' button (pointless)", !lastBot()?.querySelector(".msg-retry"));
      check("quota full: the panel shows '0 / 30' and is highlighted", left() === 0 && $("esin-quota").hasAttribute("low"), $("esin-quota").textContent);
      // total capacity used up
      Vento.esin.send("GLOBAL-DOLU");
      check("total capacity full: a separate message, no retry", await wait(() => idle() && /bugünlük kapasitesini/.test(lastBot()?.textContent ?? "")) && !lastBot()?.querySelector(".msg-retry"), lastBot()?.textContent);

      Vento.esin.clearChat();
      Vento.esin.close();
      Services.prefs.setBoolPref("vento.esin.consented", keepConsent);
    }

    // ===================== User agent (so sites recognize us) =====================
    {
      const ua = Cc["@mozilla.org/network/protocol;1?name=http"].getService(Ci.nsIHttpProtocolHandler).userAgent;
      check("UA: has the 'Firefox/x.y' compatibility token (so sites like Google serve the modern page)", /Gecko\/\d+ Firefox\/\d+\.\d+ Vento\/\S+$/.test(ua), ua);
      check("UA: the Vento name is stated honestly, the Nightly/Mozilla product name doesn't leak", /Vento\//.test(ua) && !/Nightly|Zen/.test(ua), ua);
    }

    // ===================== Search engine (DuckDuckGo default, Google selectable) =====================
    {
      const $ = id => document.getElementById(id);
      const P = Services.prefs;
      const had = P.prefHasUserValue("vento.search.engine");
      const old = P.getStringPref("vento.search.engine", "duckduckgo");
      const q = "rüzgar nedir", enc = "r%C3%BCzgar%20nedir";
      P.clearUserPref("vento.search.engine");
      check("search: DuckDuckGo is the default", Vento.resolveInput(q) === `https://duckduckgo.com/?q=${enc}` && Vento.searchURL(q) === `https://duckduckgo.com/?q=${enc}`);
      check("search: DuckDuckGo is selected in the panel, the Google note is hidden", $("cp-search").value === "duckduckgo" && $("cp-search-note").hidden);
      P.setStringPref("vento.search.engine", "google");
      check("search: with Google selected the text is searched on Google", Vento.resolveInput(q) === `https://www.google.com/search?q=${enc}`, Vento.resolveInput(q));
      check("search: the right-click 'Ara' URL is Google too (even URL-like text is searched)", Vento.searchURL("example.com") === "https://www.google.com/search?q=example.com", Vento.searchURL("example.com"));
      check("search: with Google too, the bar suggestion counts as 'search', not a URL", Vento.isSearchText(q) && !Vento.isSearchText("example.com"));
      check("search: URLs were not affected", Vento.resolveInput("example.com/x") === "https://example.com/x" && !Vento.resolveInput("javascript:alert(1)").startsWith("javascript:"));
      check("search: the panel synced with the pref, the Google privacy note appeared", await wait(() => $("cp-search").value === "google" && !$("cp-search-note").hidden, 5000), `${$("cp-search").value} noteHidden=${!$("cp-search-note").hidden}`);
      // changing from the panel writes the pref
      $("cp-search").value = "duckduckgo";
      $("cp-search").dispatchEvent(new Event("change", { bubbles: true }));
      check("search: switching back to DuckDuckGo in the panel wrote the pref and hid the note", P.getStringPref("vento.search.engine") === "duckduckgo" && await wait(() => $("cp-search-note").hidden, 5000));
      P.setStringPref("vento.search.engine", "yok-boyle-motor");
      check("search: an unknown value falls back to DuckDuckGo", Vento.resolveInput(q) === `https://duckduckgo.com/?q=${enc}`);
      if (had) { P.setStringPref("vento.search.engine", old); } else { P.clearUserPref("vento.search.engine"); }
    }

    // ===================== Session restore =====================
    {
      const S = Vento.session;
      const llm = Services.env.get("VENTO_ESIN_ENDPOINT").replace(/\/v1$/, "");
      const u = n => `${llm}/oturum/${n}`;
      // Clean start: close everything except the selected tab
      for (const t of tabs.all) { if (t !== tabs.selected) { tabs.close(t); } }
      const first = tabs.selected;
      first.browser.fixupAndLoadURIString("data:text/html,<title>x</title>", { triggeringPrincipal: Vento.SYSTEM_PRINCIPAL });
      await wait(() => first.url.startsWith("data:"));

      // -- capture: real pages only, the selected index is relative to the savable tabs
      const A = tabs.open(u("a"), { select: false });
      const B = tabs.open(u("b"), { select: true });
      const C = tabs.open(u("c"), { select: false });
      await wait(() => [A, B, C].every(t => t.url === t.browser.currentURI?.spec && t.url.startsWith("http")), 15000);
      const cap = S.capture();
      check("capture: the data: tab is left out, 3 http tabs", cap.tabs.length === 3 && cap.tabs.every(t => t.url.startsWith(llm)), JSON.stringify(cap.tabs.map(t => t.url)));
      check("capture: selected index is relative to the savable tabs (B -> 1)", cap.selected === 1, String(cap.selected));

      // -- writing to disk + reading
      tabs.select(C);
      await S.flush();
      const back = await S.read();
      check("flush + read: the same state went to disk", back?.tabs.length === 3 && back.selected === 2 && back.tabs[1].url === u("b"), JSON.stringify(back));

      // -- corrupt file -> backup
      await S.flush(); // second write: the first file becomes .bak
      check(".bak backup was created", await IOUtils.exists(S.path + ".bak"));
      await IOUtils.writeUTF8(S.path, "{ bozuk json");
      const fallback = await S.read();
      check("read from the backup when the main file was corrupt", fallback?.tabs.length === 3, JSON.stringify(fallback));

      // -- tampered file: dangerous schemes are filtered out
      await IOUtils.writeJSON(S.path, { version: 1, selected: 9, tabs: [{ url: "javascript:alert(1)" }, { url: "chrome://vento/content/vento.xhtml" }, { url: u("ok"), title: "t" }, { url: 5 }] });
      const tampered = await S.read();
      check("javascript:/chrome:/wrong-type entries were filtered out", tampered?.tabs.length === 1 && tampered.tabs[0].url === u("ok"), JSON.stringify(tampered));
      check("invalid version/empty state -> null", (await IOUtils.writeJSON(S.path, { version: 99, tabs: [] }), await (async () => { await IOUtils.remove(S.path + ".bak", { ignoreAbsent: true }); return (await S.read()) === null; })()));

      // -- restore: the selected one loads, the others wait
      const before = tabs.all.length;
      const state = { selected: 1, tabs: [{ url: u("x"), title: "Sayfa X" }, { url: u("y"), title: "Sayfa Y" }, { url: u("z"), title: "Sayfa Z" }] };
      check("restore: returns true", S.restore(state) === true);
      const [X, Y, Z] = tabs.all.slice(before);
      check("restore: 3 tabs were added, the selected one is Y", tabs.all.length === before + 3 && tabs.selected === Y);
      check("restore: Y loaded, X and Z are pending", !Y.pending && X.pending === u("x") && Z.pending === u("z"));
      check("restore: title and URL show in the strip on pending tabs", X.title === "Sayfa X" && X.url === u("x") && X.label === "Sayfa X");
      check("restore: Y's page loaded", await wait(() => Y.browser.currentURI?.spec === u("y"), 15000), Y.browser.currentURI?.spec);
      check("restore: pending X's page has NOT loaded yet", X.browser.currentURI?.spec !== u("x"), X.browser.currentURI?.spec);
      tabs.select(Z);
      check("restore: Z loaded when switched to", !Z.pending && await wait(() => Z.browser.currentURI?.spec === u("z"), 15000), Z.browser.currentURI?.spec);
      // navigating from the address bar cancels the pending state (so the old URL doesn't load later and overwrite it)
      tabs.navigate(X, u("q"));
      check("navigating to another URL on a pending tab cancels the pending state", X.pending === null);
      for (const t of [X, Y, Z]) { tabs.close(t); }

      // -- command-line URL: its own tab, selected
      const n0 = tabs.all.length;
      S.restore({ selected: 0, tabs: [{ url: u("m"), title: "M" }] }, u("extra"));
      check("restore + -url: the extra URL is in its own tab and selected, the restored tab is pending", tabs.all.length === n0 + 2 && tabs.selected === tabs.all[n0 + 1] && tabs.all[n0].pending === u("m"));
      check("restore + -url: the extra URL loaded", await wait(() => tabs.selected.url === u("extra"), 15000), tabs.selected.url);
      tabs.close(tabs.all[tabs.all.length - 1]);
      tabs.close(tabs.all[tabs.all.length - 1]);
      check("restore(null) and an empty state: false", S.restore(null) === false && S.restore({ selected: 0, tabs: [] }) === false);

      // -- Final state: verified in phase 2 (restart). The titles are the real page titles the server returns.
      for (const t of tabs.all) { if (t !== tabs.selected) { tabs.close(t); } }
      const keep = tabs.selected;
      const [a2, b2, c2] = [tabs.open(u("a"), { select: false }), tabs.open(u("b"), { select: false }), tabs.open(u("c"), { select: false })];
      await wait(() => [a2, b2, c2].every(t => !t.loading && t.browser.currentURI?.spec === t.url && t.url.startsWith("http")), 15000);
      await wait(() => a2.title === "Sayfa A" && c2.title === "Sayfa C", 10000); // titles come from the server as the real page title
      tabs.close(keep); // so the blank/data tab doesn't come back
      tabs.select(c2);
      await S.flush();       // intermediate state: C selected
      tabs.select(b2);       // B selected — NOW we quit without waiting for the write: the shutdown blocker must write
      check("before shutdown: 3 tabs, B selected", tabs.all.length === 3 && tabs.selected === b2);
    }
  } catch (e) {
    check("self-test threw no exception", false, String(e) + "\n" + (e.stack || ""));
  }

  const pass = results.filter(Boolean).length;
  Vento.trace(`ÖZET ${pass}/${results.length} geçti`);
  Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
})();
