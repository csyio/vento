# Vento

Vento is a small, privacy-focused browser for macOS. The engine is Firefox's Gecko. Everything else is in this repo: tabs, the smart bar, session restore and the Esin assistant.

Status: **pre-alpha, macOS (Apple Silicon) only.**

Downloads and info: <https://vento.cansoykanyilmaz.com>

## Layout

We don't touch the Firefox tree. We follow the Thunderbird model: our own application directory (`vento/`) is built next to the engine. Details are in [`docs/MIMARI.md`](docs/MIMARI.md).

```
vento/      the app: shell (XHTML/JS/CSS), prefs, branding, localization (tr, en-US), installer
patches/    four small build/update patches applied to Firefox, nothing else
tools/      patching, signing, DMG, self-test, localization checks
server/     the Esin proxy (the LLMTR key lives only there)
site/       the product site (static, no cookies)
docs/       architecture, language, release steps
```

## Build

The engine is the **Firefox 153.2.0esr** source tree. Put it in `engine/`. It is not in this repo and is listed in `.gitignore`.

```sh
sh tools/link.sh && sh tools/apply-patches.sh
export MOZCONFIG=$PWD/mozconfig
cd engine && ./mach build
```

Packaging, signing and notarization are in [`docs/YAYIN.md`](docs/YAYIN.md). The self-test is `tools/selftest.sh`.

## Esin and privacy

Esin sends page text only when you ask it a question. Requests go through `server/esin-proxy`, which does not log prompt or response content. The privacy page on the site has the details and the points that are still open.

## License

[Mozilla Public License 2.0](LICENSE). Files derived from Firefox belong to Mozilla and keep their own licenses.
Firefox and Mozilla are trademarks of the Mozilla Foundation. Vento is not affiliated with Mozilla.
The fonts (Fraunces, Inter Tight) are under the OFL (`site/assets/fonts/`).
