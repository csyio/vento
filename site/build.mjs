#!/usr/bin/env node
// Vento product site generator. No dependencies (Node 18+).
//
//   node site/build.mjs              -> site/dist/ + site/vento-site-<version>.zip (needs the DMG)
//   node site/build.mjs --preview    -> no DMG needed; the download button shows "coming soon"
//   node site/build.mjs --dmg <path> -> give the DMG path explicitly (or VENTO_DMG=<path>)
//   node site/build.mjs --no-zip     -> skip the zip
//
// Produces only pages, images and (if present) the DMG. The /updates/… files are NOT part of this.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, statSync, existsSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { pages, ui, routes } from "./src/content.mjs";

const SITE = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(SITE);
const OUT = join(SITE, "dist");
const ORIGIN = "https://vento.cansoykanyilmaz.com";
const args = process.argv.slice(2);
const preview = args.includes("--preview");
const noZip = args.includes("--no-zip");
const dmgArg = args.includes("--dmg") ? args[args.indexOf("--dmg") + 1] : process.env.VENTO_DMG;

// Version: the user-facing version (version_display.txt) if present, otherwise version.txt.
// (version.txt currently holds the engine/app version, 153.2.0; the user-facing version is 0.1.0.)
function readVersion() {
  for (const f of ["version_display.txt", "version.txt"]) {
    const p = join(REPO, "vento", "config", f);
    if (existsSync(p)) {
      const v = readFileSync(p, "utf8").trim();
      if (v) return v;
    }
  }
  throw new Error("could not read vento/config/version_display.txt or version.txt");
}
const version = readVersion();
const dmgName = `vento-${version}.dmg`;

function findDmg() {
  const cands = [dmgArg, join(REPO, "dist", dmgName), join(SITE, "dmg", dmgName), join(REPO, dmgName)].filter(Boolean);
  return cands.find(p => existsSync(p)) ?? null;
}
const dmgPath = findDmg();
if (!dmgPath && !preview) {
  console.error(`ERROR: DMG not found (looked for: dist/${dmgName}, site/dmg/${dmgName}). For a preview without a DMG: node site/build.mjs --preview`);
  process.exit(1);
}

const dl = { has: false, href: `/dl/${dmgName}`, name: dmgName, sha: "", size: "" };
if (dmgPath) {
  const buf = readFileSync(dmgPath);
  dl.has = true;
  dl.sha = createHash("sha256").update(buf).digest("hex");
  dl.size = `${Math.round(buf.length / 1048576)} MB`;
}

const esc = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const other = { tr: "en", en: "tr" };
const keys = ["home", "download", "esin", "privacy", "notes"];

function layout(lang, key, page, urlPath) {
  const u = ui[lang];
  const isHome = key === "home";
  const title = isHome ? page.title : `${page.title} · Vento`;
  const alt = key === "notFound" ? null : routes[other[lang]][key];
  const self = key === "notFound" ? null : routes[lang][key];
  const nav = u.nav.map(([href, label, k]) => `<a href="${href}"${k === key ? ' aria-current="page"' : ""}>${label}</a>`).join("");
  const hreflangs = self
    ? `<link rel="canonical" href="${ORIGIN}${self}">
<link rel="alternate" hreflang="${lang}" href="${ORIGIN}${self}">
<link rel="alternate" hreflang="${other[lang]}" href="${ORIGIN}${alt}">
<link rel="alternate" hreflang="x-default" href="${ORIGIN}${routes.tr[key]}">`
    : `<meta name="robots" content="noindex">`;
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(page.desc)}">
<meta name="color-scheme" content="light dark">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(page.desc)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="${lang === "tr" ? "tr_TR" : "en_US"}">
${hreflangs}
<link rel="icon" type="image/png" href="/assets/img/favicon.png">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<link rel="preload" href="/assets/fonts/fraunces-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css?v=${version}">
</head>
<body>
<a class="skip" href="#main">${u.skip}</a>
<header class="top"><div class="wrap">
  <a class="wm" href="${routes[lang].home}" aria-label="${u.home}"><img src="/assets/img/vento-icon.webp" alt="" width="34" height="34">Vento</a>
  <nav aria-label="${lang === "tr" ? "Ana gezinti" : "Main"}">${nav}${alt ? `<a class="lang" href="${alt}" hreflang="${other[lang]}" lang="${other[lang]}" title="${u.langTitle}">${u.langName}</a>` : ""}</nav>
</div></header>
<main id="main">
${page.body}
</main>
<footer class="foot"><div class="wrap">
  <p><strong>${u.footTag}</strong></p>
  <div><p>${u.footLine}</p><p><a href="mailto:info@cansoykanyilmaz.com">info@cansoykanyilmaz.com</a> · <a href="https://github.com/csyio/vento">${lang === "tr" ? "Kaynak kod (MPL-2.0)" : "Source code (MPL-2.0)"}</a></p></div>
</div></footer>
</body>
</html>
`;
}

function write(rel, data) {
  const p = join(OUT, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, data);
}
function copyDir(from, to) {
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(from)) {
    const a = join(from, f), b = join(to, f);
    if (statSync(a).isDirectory()) copyDir(a, b);
    else if (f !== ".DS_Store") copyFileSync(a, b);
  }
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const ctxFor = lang => ({ version, dl, lang });
const urls = [];
for (const lang of ["tr", "en"]) {
  for (const key of keys) {
    const route = routes[lang][key];
    write(join(route, "index.html"), layout(lang, key, pages[lang][key](ctxFor(lang)), route));
    urls.push(route);
  }
  write(lang === "tr" ? "404.html" : "en/404.html", layout(lang, "notFound", pages[lang].notFound(ctxFor(lang)), ""));
}

copyDir(join(SITE, "assets"), join(OUT, "assets"));
copyFileSync(join(SITE, "src", "site.css"), join(OUT, "assets", "site.css"));
if (dl.has) {
  mkdirSync(join(OUT, "dl"), { recursive: true });
  copyFileSync(dmgPath, join(OUT, "dl", dmgName));
}

write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`);
const link = (lang, key) => `<xhtml:link rel="alternate" hreflang="${lang}" href="${ORIGIN}${routes[lang][key]}"/>`;
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${["tr", "en"].flatMap(lang => keys.map(k => `<url><loc>${ORIGIN}${routes[lang][k]}</loc>${link("tr", k)}${link("en", k)}</url>`)).join("\n")}
</urlset>
`);

console.log(`Vento site ${version} → ${OUT}${dl.has ? `  (DMG: ${dmgName}, ${dl.size}, sha256 ${dl.sha.slice(0, 12)}…)` : "  (no DMG: preview)"}`);

if (!noZip) {
  const zipName = `vento-site-${version}${dl.has ? "" : "-onizleme"}.zip`;
  const zipPath = join(SITE, zipName);
  if (spawnSync("zip", ["-v"], { stdio: "ignore" }).error) {
    console.warn(`WARNING: 'zip' command not found; could not build the zip. Compress the contents of ${OUT} by hand and upload them to Plesk.`);
  } else {
    rmSync(zipPath, { force: true });
    const r = spawnSync("zip", ["-qr", zipPath, "."], { cwd: OUT, stdio: "inherit" });
    if (r.status === 0) console.log(`Zip: ${zipPath} (${(statSync(zipPath).size / 1048576).toFixed(1)} MB)`);
    else console.warn("WARNING: zip failed.");
  }
}
