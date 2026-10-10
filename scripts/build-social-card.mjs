// Renders assets/social-card.png (1200 x 675) from HTML with headless Chrome.
//
//   node scripts/build-social-card.mjs
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const image = async (path) => `data:image/png;base64,${(await readFile(join(root, path))).toString("base64")}`;
const logo = (await readFile(join(root, "assets/logo.svg"), "utf8")).replace(/<svg /, '<svg width="64" height="64" ');
const map = await image("docs/gallery/life-expectancy.png");

const html = `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box}
body{margin:0;width:1200px;height:675px;background:#f4f1ea;color:#1b1f23;font:400 20px/1.4 system-ui,"Noto Sans",sans-serif;position:relative;overflow:hidden;
background-image:linear-gradient(rgba(200,65,43,.09) 1px,transparent 1px),linear-gradient(90deg,rgba(200,65,43,.09) 1px,transparent 1px);background-size:60px 60px}
.left{position:absolute;left:64px;top:64px;width:520px}
.brand{display:flex;align-items:center;gap:18px}
h1{margin:0;font:600 76px/1 ui-serif,"Iowan Old Style","Palatino Linotype","Noto Serif",Georgia,serif;letter-spacing:-.02em}
.tag{margin:34px 0 0;font:600 36px/1.2 system-ui,"Noto Sans",sans-serif}
.sub{margin:18px 0 0;color:#5b626b;font-size:22px}
.chips{display:flex;flex-wrap:wrap;gap:10px;margin-top:34px}
.chips span{padding:7px 16px;border:1.5px solid #c8412b;border-radius:999px;color:#c8412b;font-weight:600;font-size:19px;background:#fbfaf7}
.cmd{position:absolute;left:64px;bottom:56px;padding:14px 22px;border-radius:12px;background:#1b1f23;color:#fff;font:500 22px/1 ui-monospace,"DejaVu Sans Mono",monospace}
.map{position:absolute;right:48px;top:70px;width:560px;border-radius:16px;background:#fbfaf7;border:1px solid #e2ddd1;box-shadow:0 30px 60px -30px rgba(27,31,35,.5);overflow:hidden}
.map img{display:block;width:100%}
.check{position:absolute;right:30px;bottom:56px;width:470px;padding:18px 20px;border-radius:14px;background:#fbfaf7;border:1px solid #e2ddd1;box-shadow:0 24px 50px -24px rgba(27,31,35,.55);font-size:15.5px;line-height:1.35}
.check strong{display:block;font:600 20px/1.2 ui-serif,Georgia,serif;margin-bottom:10px}
.check div{display:grid;grid-template-columns:150px 1fr;gap:12px;margin:5px 0}
.check code{color:#c8412b;font:600 14px/1.35 ui-monospace,"DejaVu Sans Mono",monospace}
.check b{display:inline-block;margin-top:12px;padding:8px 18px;border-radius:10px;background:#c8412b;color:#fff;font-size:15px}
</style>
<div class="left"><div class="brand">${logo}<h1>Graticule</h1></div>
<p class="tag">A map skill for coding agents that refuses to draw a bad map.</p>
<p class="sub">Raw counts, Mercator, silent join drops, rainbow palettes. Caught, explained, fixed.</p>
<div class="chips"><span>25 rules</span><span>13 regions</span><span>9 languages</span><span>offline</span></div></div>
<div class="cmd">npx skills add Arthur031221/Graticule</div>
<div class="map"><img src="${map}"></div>
<div class="check"><strong>4 problems stop this map</strong>
<div><code>raw-counts</code><span>The values are raw counts.</span></div>
<div><code>projection-mercator</code><span>Mercator on a region 141 degrees tall.</span></div>
<div><code>max-classes</code><span>9 classes is more than readers can tell apart.</span></div>
<div><code>palette-order</code><span>Palette does not get steadily lighter.</span></div>
<b>Fix them</b></div>`;

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 675 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.waitForTimeout(400);
await page.screenshot({ path: join(root, "assets/social-card.png") });
await browser.close();
console.log("wrote assets/social-card.png");
