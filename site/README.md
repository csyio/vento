# Vento site

A static site (Turkish at `/`, English at `/en/`). No JavaScript, no cookies, no external requests. Fonts are in `assets/fonts/` (OFL).

## Build

```sh
node site/build.mjs --preview    # without a DMG; the download button says "coming soon"
node site/build.mjs              # with a DMG; looks for dist/vento-<version>.dmg
node site/build.mjs --dmg /path/to/vento-0.1.0.dmg   # or VENTO_DMG=...
node site/build.mjs --no-zip
```

Output goes to `site/dist/`, plus `site/vento-site-<version>.zip` for drag-and-drop into Plesk (`-onizleme`, "preview", is added to the name when there is no DMG).
If the `zip` command is missing, the script warns. The version comes from `vento/config/version_display.txt` (or `version.txt` if that doesn't exist).
The DMG is named `vento-<version>.dmg` and served at `/dl/vento-<version>.dmg`. This script does not generate the `/updates/…` files.

To look at it locally: `cd site/dist && python3 -m http.server 8765`.

## Publish

1. Plesk → `vento.cansoykanyilmaz.com` → Files → upload the zip into `httpdocs` and choose "Extract".
   (If the server already has an `/updates/` folder, don't overwrite it. The zip doesn't contain it.)
2. Error documents: use `/404.html` for 404 (Plesk → Apache & nginx → Error Documents, or `ErrorDocument 404 /404.html`).
3. Open and check: `/`, `/en/`, `/indir/` (download page), `/gizlilik/` (privacy page), and the DMG link.

Content is in `src/content.mjs` (TR + EN), styling in `src/site.css`, and page parts in `src/parts.mjs`.
The LLMTR logo (`assets/img/llmtr-on-*.svg`) is used unmodified and only on the download page and the Esin page.
