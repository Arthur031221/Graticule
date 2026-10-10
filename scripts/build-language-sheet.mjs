// Draws the same map in all nine label languages and tiles them into
// assets/languages.png.
//
//   node scripts/build-language-sheet.mjs
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { buildMap } from "../src/build.js";
import { exportMap } from "../src/export.js";
import { nodeAssets } from "../src/node-assets.js";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const assets = nodeAssets();
const dir = join(root, "gallery/europe-gdp-per-capita");
const base = JSON.parse(await readFile(join(dir, "spec.json"), "utf8"));

const LANGUAGES = [
  ["en", "English", "GDP per person in Europe, 2022", "International dollars"],
  ["zh-Hant", "繁體中文", "歐洲每人 GDP，2022", "國際元"],
  ["zh-Hans", "简体中文", "欧洲人均 GDP，2022", "国际元"],
  ["ja", "日本語", "ヨーロッパの一人当たりGDP、2022", "国際ドル"],
  ["ko", "한국어", "유럽 1인당 GDP, 2022", "국제 달러"],
  ["es", "Español", "PIB per cápita en Europa, 2022", "Dólares internacionales"],
  ["fr", "Français", "PIB par habitant en Europe, 2022", "Dollars internationaux"],
  ["de", "Deutsch", "BIP pro Kopf in Europa, 2022", "Internationale Dollar"],
  ["pt", "Português", "PIB per capita na Europa, 2022", "Dólares internacionais"],
];

const tiles = [];
for (const [language, name, title, label] of LANGUAGES) {
  const spec = {
    ...base,
    language,
    title,
    subtitle: "",
    note: "",
    size: { width: 640 },
    attribution: false,
    data: { ...base.data, label },
  };
  const result = await buildMap(spec, { assets, readText: (path) => readFile(join(dir, path), "utf8") });
  if (result.blocked) throw new Error(result.findings.map((f) => f.message).join(" "));
  const { png } = await exportMap(result, ["png"], { assets, dpi: 96 });
  tiles.push(
    `<figure><img src="data:image/png;base64,${Buffer.from(png).toString("base64")}" alt="${name}"><figcaption>${name}</figcaption></figure>`,
  );
}

const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#f4f1ea;font:600 17px/1 system-ui,"Noto Sans CJK TC",sans-serif;color:#1b1f23}
main{display:grid;grid-template-columns:repeat(3,640px);gap:18px;padding:18px;width:max-content}
figure{margin:0;background:#fbfaf7;border:1px solid #e2ddd1;border-radius:12px;overflow:hidden}
img{display:block;width:640px}
figcaption{padding:10px 16px 12px;border-top:1px solid #e2ddd1;color:#5b626b;font-size:15px}
</style><main>${tiles.join("")}</main>`;
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const page = await browser.newPage({ viewport: { width: 2000, height: 1400 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.waitForTimeout(500);
await (await page.locator("main")).screenshot({ path: join(root, "assets/languages.png") });
await browser.close();
console.log("wrote assets/languages.png");
