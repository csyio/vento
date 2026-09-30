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

// Esin: Vento vekil sunucusu (LLMTR anahtarı yalnızca orada). Farklı alt alan adı kullanılırsa burayı değiştir.
pref("vento.esin.endpoint", "https://esin.cansoykanyilmaz.com/v1");
// İlk kullanımda gösterilen veri aktarımı bilgilendirmesi onaylandı mı?
pref("vento.esin.consented", false);
