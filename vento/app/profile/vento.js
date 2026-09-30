// Vento varsayılan tercihleri.

// Ana pencereyi components/startup/VentoStartup açar (DefaultCLH değil) — toolkit.defaultChromeURI
// bilerek set DEĞİL, yoksa iki pencere açılır. browser.xhtml YOK.
pref("toolkit.telemetry.enabled", false);
pref("app.update.enabled", false);

// Geliştirme: chrome dump() çıktısı stdout'a.
pref("browser.dom.window.dump.enabled", true);
pref("devtools.console.stdout.chrome", true);

// Diller: site dili Türkçe öncelikli (Gecko yoksa sistem listesini türetir → beklenmedik dil çıkabilir).
pref("intl.accept_languages", "tr-TR, tr, en-US, en");
