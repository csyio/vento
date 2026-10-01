# Vento release steps

Status tags: **[verified]** was run on this machine. **[untested]** is written down but has never been run.

## 1. Build and package  [verified]

```sh
export MOZCONFIG=$PWD/mozconfig
cd engine && ./mach build            # full build (takes hours)
cd .. && sh tools/build-locale.sh                      # puts Turkish (tr) into dist; required for it to end up in the package
cd engine/obj-vento/vento/installer && make make-package
# output: engine/obj-vento/dist/vento-<version>.en-US.mac.dmg
```

`mach package` does not work (the root Makefile has no `package` target), so we run `make make-package` directly as above.
The package contents are listed in `vento/installer/package-manifest.in`. Language entries are `MOZ_CHROME_MULTILOCALE = tr` in `Makefile.in`.
When `Makefile.in` changes, `engine/obj-vento/vento/installer/Makefile` is regenerated at the next configure.

Test the package by running the self-test on an app copied out of the DMG:

```sh
VENTO_APP=/path/to/Vento.app tools/selftest.sh --no-build     # expect 408/408 + 7/7 (0.1.0, 2026-10-01)
```

Bundle ID: `com.cansoykanyilmaz.vento` (`mozconfig`: `--with-distribution-id`, and `MOZ_MACBUNDLE_ID` in `vento/branding/default/configure.sh`).

## 2. Signing  [Developer ID + notarization verified, 2026-10-01]

```sh
python3 tools/sign-app.py /path/to/Vento.app                                   # ad-hoc: local testing only
python3 tools/sign-app.py /path/to/Vento.app --identity "Developer ID Application: Name (TEAM)" --notarize PROFILE
sh tools/make-dmg.sh /path/to/Vento.app /path/to/vento-<version>.dmg           # DMG from the signed .app
```

- Entitlements are in `vento/installer/entitlements/`. Firefox's production entitlements are tied to Mozilla's team ID and can't be used.
- `PROFILE`: stored once with `xcrun notarytool store-credentials PROFILE --apple-id … --team-id …`.
- 2026-09-30: the 0.1.0 DMG was signed with `Developer ID Application: erdogan yilmaz (MQ8525E33U)` from the keychain (with Can's approval; the certificate is in another person's name). If the certificate owner changes, switch with `--identity`. 2026-10-01: the .app and DMG were notarized and stapled (`spctl`: Notarized Developer ID). Profile: `vento` (Apple ID idealcozumler.csy@gmail.com, team MQ8525E33U; the app-specific password is in the keychain). Note: signing in to an Apple account with a passkey does not work inside Vento (it has no entitlement for custom browsers). Use Safari or Chrome.

## 3. Site  [verified, upload to the server is manual]

```sh
node site/build.mjs --dmg /path/to/vento-<version>.dmg       # the DMG must be named vento-<version>.dmg for the site
```

Unzip the zip into Plesk → `vento.cansoykanyilmaz.com` → `httpdocs`. Don't touch the server's `/updates/` folder (the zip doesn't contain it).
The app expects release notes at `/surum-notlari/` and `/en/release-notes/` (`vento-update.js`). The site generates these paths. (`surum-notlari` is Turkish for "release notes".)

## 4. Update server  [untested]

The app checks this address (`patches/0004-update-url-vento.patch`):

```
https://vento.cansoykanyilmaz.com/updates/browser/<BUILD_TARGET>/<CHANNEL>/update.xml      # e.g. Darwin_aarch64-gcc3/vento
```

- The channel is `vento`. It accepts only MARs signed by the certificate added in `patches/0003` (`vento1.der` / `vento2.der`).
- The MAR signing key is in `~/.vento-mar-keys` (an NSS database, nickname `vento-mar-1`). **Back this key up.** If it is lost, no released version can ever be updated.
- Still to do (not written): full MAR generation, signing with `signmar`, generating `update.xml`, and `tools/sign-mar.sh`. The first release has no update server, and the site says so.
- Privacy: the address contains only the build target and channel. No version or identity is sent (stated on the site's privacy page).

## 5. 0.1.1 plan (decided 2026-10-01)

1. **Update server** (§4): MAR generation, `signmar`, `update.xml`, `tools/sign-mar.sh`. Test 0.1.0 → 0.1.1 end to end.
2. **Passkey.** Why: `MacOSWebAuthnService.mm` turns off the platform passkey API unless the `com.apple.developer.web-browser.public-key-credential` entitlement is present. Vento's `browser.xml` doesn't have it (Mozilla's entitlement is tied to their team ID).
   To do: the Account Holder (the certificate owner) sends Apple an entitlement request. After approval, create an explicit App ID for `com.cansoykanyilmaz.vento` and a Developer ID provisioning profile. Embed the profile as `Contents/embedded.provisionprofile`, add the entitlement to `browser.xml`, then re-sign and notarize. If it fails, the reason shows up in the `WebAuthn` log.
   For now: use Safari or Chrome. The site has a "known gaps" note.
