// Vento varsayılan tercihleri.

// Ana pencereyi components/startup/VentoStartup açar (DefaultCLH değil) — toolkit.defaultChromeURI
// bilerek set DEĞİL, yoksa iki pencere açılır. browser.xhtml YOK.
pref("toolkit.telemetry.enabled", false);
pref("app.update.enabled", true);

// Geliştirme: chrome dump() çıktısı stdout'a.
pref("browser.dom.window.dump.enabled", true);
pref("devtools.console.stdout.chrome", true);

// Diller: site dili Türkçe öncelikli (Gecko yoksa sistem listesini türetir → beklenmedik dil çıkabilir).
pref("intl.accept_languages", "tr-TR, tr, en-US, en");

// Esin: Vento vekil sunucusu (LLMTR anahtarı yalnızca orada). Farklı alt alan adı kullanılırsa burayı değiştir.
pref("vento.esin.endpoint", "https://esin.cansoykanyilmaz.com/v1");
// İlk kullanımda gösterilen veri aktarımı bilgilendirmesi onaylandı mı?
pref("vento.esin.consented", false);

// İndirmeler: soru sormadan Downloads klasörüne kaydet (Firefox bu tercihleri browser/'ın kendi dosyasında
// açar; bizde yoksa yardımcı-uygulama diyaloğunda takılıp .part dosyası bırakır).
pref("browser.download.useDownloadDir", true);
pref("browser.download.folderList", 1); // 1 = ~/Downloads
pref("browser.download.always_ask_before_handling_new_types", false);

// Açılışta önceki oturumun sekmelerini geri getir
pref("vento.session.restore", true);

// Hata sayfaları (about:certerror / about:neterror): sayfa bu tercihleri varsayılansız okur; tanımsızsa
// başlatma istisnayla yarıda kalır ve düğmelerin tıklama işleyicileri hiç bağlanmaz (Firefox'ta firefox.js tanımlar).
pref("security.certerrors.permanentOverride", true);
// Firefox'ta açık: sertifika hatasında Mozilla'nın MITM tespit sunucusuna istek atar. Vento atmaz.
pref("security.certerrors.mitm.priming.enabled", false);
// "Daha fazla bilgi" bağlantıları (Gecko'nun kendi yardım makaleleri — Mozilla'nın yardım sitesi)
pref("app.support.baseURL", "https://support.mozilla.org/1/firefox/%VERSION%/%OS%/%LOCALE%/");

// Yazdırma: macOS'un yerel yazdırma paneli (PDF olarak kaydet dahil). Firefox'un sekme-içi önizlemesi
// browser/'daki TabDialogBox'a bağlı olduğu için kullanılmaz.
pref("print.prefer_system_dialog", true);

// Arayüz dili: Türkçe (motorun dil dosyaları tools/build-locale.sh ile eklenir); eksik dize İngilizceye düşer.
// Boş bırakılırsa macOS'un sistem dilini izler (İngilizce bir Mac'te arayüz İngilizce olurdu).
pref("intl.locale.requested", "tr");

// Başlangıç ekranı kişiselleştirme: duvar kâğıdı ("" = yok, sade varsayılan) ve Ebabil'in görünürlüğü
pref("vento.start.wallpaper", "");
pref("vento.start.ebabil", true);

// ---- İlk açılış, Esin, güncelleme (vento-welcome.js / vento-update.js / vento-bookmarks.js) ----
pref("vento.welcome.completed", false);   // ilk açılış akışı bir kez gösterilir
pref("vento.esin.model", "");            // "" = vekilin varsayılanı (greenpt/gpt-oss-120b-eu)
pref("vento.esin.enabled", true);         // kapalıyken Esin düğmesi/önerisi/paneli yok, hiçbir şey gönderilmez
// Kullanıcı aracısına "Firefox/x.y" belirteci eklenir (…Gecko/20100101 Firefox/x.y Vento/s): aksi hâlde Google gibi siteler
// tanımadıkları tarayıcıya sadeleştirilmiş eski sayfa sunar. "Vento/s" belirteci dürüstlük için kalır.
pref("general.useragent.compatMode.firefox", true);
pref("vento.search.engine", "duckduckgo"); // duckduckgo | google (vento-tabs.js SEARCH_ENGINES)
pref("vento.start.sites", true);          // başlangıç ekranında sık siteler + yer imleri
pref("vento.start.hidden", "[]");         // gizlenen sık site sunucu adları (JSON dizisi)
pref("vento.lastRunVersion", "");         // güncelleme sonrası sürüm notlarını açmak için son çalışan sürüm
pref("app.update.auto", true);            // kapalıysa yeni sürüm çıkınca haber verilir, kullanıcı "İndir ve kur" der
pref("app.update.interval", 21600);       // 6 saatte bir denetle (sn)
pref("app.update.staging.enabled", true);
// "Daha fazla bilgi" ve elle indirme bağlantıları ürün sitesine gider (tek adres)
pref("app.update.url.details", "https://vento.cansoykanyilmaz.com/surum-notlari/");
pref("app.update.url.manual", "https://vento.cansoykanyilmaz.com/");

