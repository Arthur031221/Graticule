// Builds the program the skill ships (skills/graticule/scripts/graticule.mjs)
// and the browser bundles of the playground (site/).
//
//   node scripts/build.mjs [--site]
import { build } from "esbuild";
import { chmod, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const skill = join(root, "skills/graticule");
// The browser build of pdfkit carries its fonts inside the bundle, the Node build reads them at run time.
const pdfkitBrowser = join(root, "node_modules/pdfkit/js/pdfkit.browser.mjs");
const PLAYGROUND_EXAMPLES = new Set([
  "life-expectancy",
  "us-county-unemployment",
  "europe-gdp-per-capita",
  "population-symbols",
  "taiwan-township-area",
  "japan-regions",
]);
const escapeHtml = (text) =>
  String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

await build({
  entryPoints: [join(root, "src/bin.js")],
  outfile: join(skill, "scripts/graticule.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  banner: {
    js: "// Graticule command line program. Built from src/ by scripts/build.mjs; edit the sources, not this file.",
  },
  legalComments: "none",
  logLevel: "warning",
  alias: { pdfkit: pdfkitBrowser },
  define: { "process.env.GRATICULE_VERSION": JSON.stringify(version) },
});
await chmod(join(skill, "scripts/graticule.mjs"), 0o755);
console.log("built skills/graticule/scripts/graticule.mjs");

if (process.argv.includes("--site")) {
  const site = join(root, "site");
  await rm(site, { recursive: true, force: true });
  await mkdir(site, { recursive: true });
  await build({
    entryPoints: [join(root, "playground/app.js")],
    outdir: site,
    splitting: true,
    bundle: true,
    platform: "browser",
    format: "esm",
    target: "es2022",
    minify: true,
    logLevel: "warning",
    alias: { pdfkit: pdfkitBrowser },
    inject: [join(root, "playground/buffer-shim.js")],
    define: { "process.env.NODE_ENV": '"production"', global: "globalThis" },
    external: ["fs", "node:fs", "zlib", "stream", "crypto"],
  });
  for (const file of ["index.html", "style.css", "logo.svg"])
    await cp(join(root, "playground", file), join(site, file));
  await cp(join(root, "assets/social-card.png"), join(site, "social-card.png")).catch(() => {});
  for (const [id, source] of [
    ["covid-raw", "covid-deaths/spec.raw.json"],
    ["life-expectancy", "life-expectancy/spec.json"],
    ["us-county-unemployment", "us-county-unemployment/spec.json"],
    ["europe-gdp-per-capita", "europe-gdp-per-capita/spec.json"],
    ["population-symbols", "population-symbols/spec.json"],
    ["taiwan-township-area", "taiwan-township-area/spec.json"],
    ["japan-regions", "japan-regions/spec.json"],
  ]) {
    const dir = join(site, "examples", id);
    await mkdir(dir, { recursive: true });
    await cp(join(root, "gallery", source), join(dir, "spec.json"));
    await cp(join(root, "gallery", source.split("/")[0], "data.csv"), join(dir, "data.csv"));
  }
  await cp(join(skill, "data"), join(site, "data"), { recursive: true });
  await cp(join(skill, "fonts"), join(site, "fonts"), { recursive: true });
  await cp(join(skill, "locales"), join(site, "locales"), { recursive: true });
  await cp(join(skill, "vendor"), join(site, "vendor"), { recursive: true });
  await writeFile(join(site, ".nojekyll"), "");
  await galleryPage(site);
  console.log("built site/");
}

/** site/gallery/index.html: every gallery map with the prompt that asked for it. */
async function galleryPage(site) {
  const entries = JSON.parse(await readFile(join(root, "gallery/index.json"), "utf8"));
  const dir = join(site, "gallery");
  await mkdir(dir, { recursive: true });
  const base = "https://github.com/Arthur031221/Graticule/tree/main/gallery";
  const tiles = [];
  for (const e of entries) {
    await cp(join(root, "docs/gallery", `${e.id}.png`), join(dir, `${e.id}.png`));
    const open = PLAYGROUND_EXAMPLES.has(e.id) ? `<a href="../?example=${e.id}">Open in the playground</a>` : "";
    tiles.push(
      `<figure><img src="${e.id}.png" alt="${escapeHtml(e.title)}" loading="lazy"><figcaption><strong>${escapeHtml(e.title)}</strong><span>${escapeHtml(e.prompt)}</span><nav>${open}<a href="${base}/${e.id}/spec.json">Spec</a><a href="${base}/${e.id}/data.csv">Data</a><a href="${base}/${e.id}/check.json">Check log</a></nav></figcaption></figure>`,
    );
  }
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Graticule gallery</title><link rel="icon" href="../logo.svg" type="image/svg+xml"><link rel="stylesheet" href="../style.css">
<style>main{max-width:1500px;margin:0 auto;padding:22px clamp(16px,3vw,40px) 40px}h1{font:600 34px/1.2 var(--serif);margin:8px 0 4px}p.lead{color:var(--muted);margin:0 0 22px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:18px}figure{margin:0;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow)}
figure img{display:block;width:100%;height:auto}figcaption{display:grid;gap:6px;padding:12px 16px 14px;border-top:1px solid var(--line)}figcaption span{color:var(--muted);font-size:13.5px}
figcaption nav{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px}figcaption a{color:var(--accent)}</style></head>
<body><header class="top"><a class="brand" href="../"><img src="../logo.svg" alt="" width="34" height="34"><span class="brand-name">Graticule</span><span class="brand-tag">Gallery</span></a></header>
<main><h1>${entries.length} maps from public data</h1><p class="lead">Each one is a spec and a table. The prompt is what a person might ask an agent. Every map passed the checker.</p><div class="grid">${tiles.join("")}</div></main></body></html>`;
  await writeFile(join(dir, "index.html"), html);
}
