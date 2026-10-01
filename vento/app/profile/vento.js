// Vento default preferences.

// components/startup/VentoStartup opens the main window (not DefaultCLH). toolkit.defaultChromeURI
// is deliberately NOT set, otherwise two windows open. There is no browser.xhtml.
pref("toolkit.telemetry.enabled", false);
pref("app.update.enabled", true);

// Development: send chrome dump() output to stdout.
pref("browser.dom.window.dump.enabled", true);
pref("devtools.console.stdout.chrome", true);

// Languages: Turkish first for sites (if unset, Gecko derives the list from the system, which can give an unexpected language).
pref("intl.accept_languages", "tr-TR, tr, en-US, en");

// Esin: Vento proxy server (the LLMTR key lives only there). Change this if a different subdomain is used.
pref("vento.esin.endpoint", "https://esin.cansoykanyilmaz.com/v1");
// Has the data transfer notice shown on first use been accepted?
pref("vento.esin.consented", false);

// Downloads: save to the Downloads folder without asking (Firefox defines these prefs in browser/'s own
// file; without them here it gets stuck in the helper-app dialog and leaves a .part file).
pref("browser.download.useDownloadDir", true);
pref("browser.download.folderList", 1); // 1 = ~/Downloads
pref("browser.download.always_ask_before_handling_new_types", false);

// Restore the previous session's tabs at startup
pref("vento.session.restore", true);

// Error pages (about:certerror / about:neterror): the page reads these prefs without defaults; if they're
// undefined, init aborts with an exception and the buttons' click handlers never get attached (Firefox defines them in firefox.js).
pref("security.certerrors.permanentOverride", true);
// On in Firefox: on a certificate error it sends a request to Mozilla's MITM detection server. Vento doesn't.
pref("security.certerrors.mitm.priming.enabled", false);
// "Learn more" links (Gecko's own help articles, on Mozilla's support site)
pref("app.support.baseURL", "https://support.mozilla.org/1/firefox/%VERSION%/%OS%/%LOCALE%/");

// Printing: macOS's native print panel (including Save as PDF). Firefox's in-tab preview isn't used
// because it depends on TabDialogBox in browser/.
pref("print.prefer_system_dialog", true);

// UI language: Turkish (the engine's locale files are added by tools/build-locale.sh); missing strings fall back to English.
// If left empty it follows the macOS system language (on an English Mac the UI would be English).
pref("intl.locale.requested", "tr");

// Start page personalization: wallpaper ("" = none, plain default) and Ebabil's visibility
pref("vento.start.wallpaper", "");
pref("vento.start.ebabil", true);

// ---- First run, Esin, updates (vento-welcome.js / vento-update.js / vento-bookmarks.js) ----
pref("vento.welcome.completed", false);   // the first-run flow is shown once
pref("vento.esin.model", "");            // "" = the proxy's default (greenpt/gpt-oss-120b-eu)
pref("vento.esin.enabled", true);         // when off there is no Esin button/suggestion/panel and nothing is sent
// Adds a "Firefox/x.y" token to the user agent (...Gecko/20100101 Firefox/x.y Vento/s): otherwise sites like Google
// serve a stripped-down legacy page to a browser they don't recognize. The "Vento/s" token stays for honesty.
pref("general.useragent.compatMode.firefox", true);
pref("vento.search.engine", "duckduckgo"); // duckduckgo | google (vento-tabs.js SEARCH_ENGINES)
pref("vento.start.sites", true);          // frequent sites + bookmarks on the start page
pref("vento.start.hidden", "[]");         // hostnames of hidden frequent sites (JSON array)
pref("vento.lastRunVersion", "");         // last version that ran, used to open release notes after an update
pref("app.update.auto", true);            // when off, the user is notified of a new version and chooses "Download and install"
pref("app.update.interval", 21600);       // check every 6 hours (seconds)
pref("app.update.staging.enabled", true);
// "Learn more" and manual download links go to the product site (single address)
pref("app.update.url.details", "https://vento.cansoykanyilmaz.com/surum-notlari/");
pref("app.update.url.manual", "https://vento.cansoykanyilmaz.com/");

