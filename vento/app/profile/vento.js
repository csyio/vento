// Vento varsayılan tercihleri.

// Ana pencereyi components/startup/VentoStartup açar (DefaultCLH değil) — toolkit.defaultChromeURI
// bilerek set DEĞİL, yoksa iki pencere açılır. browser.xhtml YOK.
pref("toolkit.telemetry.enabled", false);
pref("app.update.enabled", false);

// Geliştirme: chrome dump() çıktısı stdout'a.
pref("browser.dom.window.dump.enabled", true);
pref("devtools.console.stdout.chrome", true);
