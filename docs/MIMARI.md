# Vento architecture decisions (2026-09-30)

The old browser (`~/Desktop/csy-browser`) was a skin over Firefox's `browser.xhtml` / `gBrowser` layer.
That meant Firefox's internal behavior became Vento's behavior. The new project does not repeat this.

## Decision

**Gecko engine, fully custom shell.** We follow the Thunderbird (`comm/mail`) model. `browser/` is not built.
Our own application directory (`vento/`) sits next to the engine tree and builds on `toolkit/`.

```
engine/          Firefox 153.2.0esr, pristine git tree: never edited, not committed
vento/           our application directory (engine/vento is a symlink to ../vento)
  moz.configure, confvars.sh, app.mozbuild, moz.build
  app/           binary (nsVentoApp.cpp), prefs (profile/vento.js), macOS bundle
  base/          window/shell XHTML + JS (chrome://vento/content/)
  branding/      name, icons
mozconfig        --enable-project=vento, obj-vento
tools/link.sh    creates the engine/vento link
```

## Rules

1. Patch Firefox files as little as possible, and only for build compatibility. Patches are tracked as
   `patches/NNNN-*.patch` and applied by `tools/apply-patches.sh`. Never patch UI or behavior. All of that lives under `vento/`.
2. Zero dependency on the `browser/` directory, `browser.xhtml` and `gBrowser`.
3. One thin layer between the engine and the UI (the tab/session model is ours).
4. No Surfer. Plain `mach`. The Firefox version is pinned and upgrades are deliberate.
5. Automated tests from day one.
6. Vertical slice: a thin end-to-end core first, features after.

## How the window opens

`toolkit/components/DefaultCLH.sys.mjs` reads the `toolkit.defaultChromeURI` pref
(`vento/app/profile/vento.js`), which points to `chrome://vento/content/vento.xhtml`. There is no Firefox browser code in the path.

## What toolkit already provides (outside browser/)

places, downloads, sessionstore (C++ core), extensions, prompts, search, contextualidentity,
find, printing, and **pageextractor, ml, translations** (page text/structure and a local model for Esin).

## First release scope

Horizontal multi-tab, address bar, **Esin** (reads the page to summarize and answer questions, with
multi-tab context), session restore, downloads, permissions.
Later: acting on the page (forms/clicks), workspaces, split view, glance, containers.
The UI layout is deliberately open: everything is ours. No vertical tabs, and no Firefox/Zen/Arc pattern.

## Order of work

1. ~~Spike~~ ✅ **done (2026-09-30):** `VentoStartup` opened the window and remote content (`webIsolated`) loaded example.com.
2. One tab and an address bar. 3. Horizontal multi-tab. 4. Esin panel (LLMTR). 5. Session/downloads/permissions.

## Spike findings (2026-09-30)

Toolkit has **no** hard dependency on `browser/`. Two things came up that every Gecko app has to provide:

- `nsIShellService.h`: `widget/cocoa/nsMenuBarX.mm` includes it unconditionally. Fix: our own
  `vento/components/shell/nsIShellService.idl` (no patch needed; Thunderbird does the same).
- `services/settings/dumps/gen_last_modified.py`: the build app name is on a hardcoded allow list
  (`browser`, `mobile/*`, `comm/*`). Fix: `patches/0001` (3 lines, adds `"vento"`).

- Identity: without `--with-app-basename=Vento` the app gets `Name=Firefox`. That points it at the real Firefox profile folder, and you get a silent "profile missing" dialog. See the maintainer's note `Knowledge/Vento Gecko Uygulaması Tuzakları.md` (kept outside this repo).

A full build from scratch takes about 45 minutes (M-series). Later builds are incremental.

## Esin (assistant) architecture

- **Panel:** `vento-esin.js` (client + panel) and `vento-markdown.js` (a safe renderer: model output is never
  interpreted as HTML). Provider-independent: OpenAI-compatible `/chat/completions` with streaming.
- **Endpoint:** pref `vento.esin.endpoint` (default `https://esin.cansoykanyilmaz.com/v1`, the Vento proxy).
  For development, set the `VENTO_ESIN_ENDPOINT` environment variable. **The browser holds no key.** The key lives only in `server/esin-proxy`.
- **Page text:** `vento/actors/VentoPageText*` (Reader mode + DOMExtractor, no `waitForPageReady`, so background
  tabs take about 70 ms too). Text is read and sent only when the user submits a question and the tab is in the context.
  The message shows "host · N characters" underneath. The first use shows a consent card (`vento.esin.consented`).
- **Smart bar:** when the input is not an address, the bottom shows "Esin'e sor / Ara" ("Ask Esin / Search"). Esin is the default. Arrow keys and Enter work.
- **Context:** chips. The open page is the default and follows tab switches. "+ Sekme" ("+ Tab") adds up to 5 tabs (multi-tab context).
- **Tests:** `tools/selftest.sh` + `tools/fake-llm.mjs` (66 checks). Proxy: `node --test` in `server/esin-proxy` (11 tests).

## Pitfalls (added as we hit them)

- `git clean` deletes the symlink. Run `tools/link.sh` again. It is listed in `.git/info/exclude`, so normally it survives.
