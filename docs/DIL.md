# Language (localization)

**Status (2026-09-30):** the UI is Turkish (`intl.locale.requested = tr`). Missing strings fall back to English (`en-US`).

## Two layers

1. **Vento's own strings** (`vento/base/content/*`). Turkish, written directly in the code, in the informal "sen" register ("girdiğin bilgiler"). No Fluent or .properties files.
2. **The engine's strings** (error pages, login/print/file-picker prompts, the PDF viewer, `about:` pages). These use Mozilla's Turkish translation, in the formal "siz" register ("giriş yapmanızı"). Source: `mozilla-l10n/firefox-l10n`, `tr` only.

## How it works

- `tools/fetch-l10n.sh` fetches into `l10n-base/firefox-l10n` (not in git, listed in `.gitignore`) at a **pinned commit** (`PIN=` inside the script). To move to a new version, change the PIN.
- `tools/build-locale.sh` runs Firefox's own steps: `merge-tr` (fills missing strings from en-US) and `chrome-tr` (toolkit, dom, netwerk, security, devtools, **branding**). The output goes to `Vento.app/Contents/Resources/{localization,chrome}/tr`, and `res/multilocale.txt` becomes `tr,en-US`.
  The rules are in `vento/locales/Makefile.in`. It is Firefox's `browser/locales/Makefile.in` with the browser-specific parts removed.
- `tools/selftest.sh` runs `build-locale.sh` after `mach build faster`. **`faster` reinstalls Vento.app and can wipe the Turkish locale, so always run `build-locale.sh` afterwards.**
- **A release build (once the packaging/signing step exists) must run `tools/build-locale.sh` too.** Otherwise the package ships in English. There is no release script yet.

## Pitfalls

- Branding (`branding/brand.ftl`) has to be added separately with `make -C <branding dir>/locales chrome AB_CD=tr`. **If one file in a Fluent bundle is missing, the whole bundle falls back to English.** Error pages then stay English with no warning.
- Pass `IS_LANGUAGE_REPACK=1` on the command line of sub-makes. A target-specific variable does not get through.
- In `.properties` strings, `&` marks the access key ("&Evet").
- The macOS application menu (Vento > About/Hide/Quit) comes from the system nib and follows the system language. We did not translate it.
