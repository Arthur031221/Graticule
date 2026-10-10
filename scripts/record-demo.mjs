// Records the playground doing the main thing it does and turns it into
// assets/demo.gif: a map with four mistakes is blocked, one click fixes it,
// then the labels switch language.
//
//   node scripts/build.mjs --site && node scripts/record-demo.mjs
//
// Needs Chrome (set CHROME to its path if it is not the one Playwright installs) and ffmpeg.
import { execFileSync } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { serve } from "./serve.mjs";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const raw = join(root, ".tmp/demo-video");
await rm(raw, { recursive: true, force: true });
await mkdir(raw, { recursive: true });

const server = await serve(join(root, "site"), 4190);
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: raw, size: { width: 1280, height: 720 } },
});
const page = await context.newPage();
await page.addInitScript(() => localStorage.setItem("graticule.lang", "en"));

// A caption bar, only present while recording.
const caption = (text) =>
  page.evaluate((text) => {
    let bar = document.getElementById("demo-caption");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "demo-caption";
      bar.style.cssText =
        "position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:99;padding:10px 20px;border-radius:999px;background:#1b1f23;color:#fff;font:600 17px/1.2 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.35);transition:opacity .25s;white-space:nowrap";
      document.body.append(bar);
    }
    bar.textContent = text;
  }, text);

await page.goto("http://localhost:4190/?example=covid-raw");
await page.waitForSelector("#stage-note.show");
await page.waitForTimeout(300);
const start = Date.now();
await caption("A map with four mistakes: Graticule refuses to draw it");
await page.waitForTimeout(4200);
await caption("One click applies the smallest fix for each rule");
await page.locator("#stage-note .btn.primary").click();
await page.waitForSelector("#sheet svg");
await page.waitForTimeout(2600);
await page.locator('#sheet [data-id="BRA"]').first().hover();
await caption("Deaths per 100,000 people, equal-area, 7 classes, a safe palette");
await page.waitForTimeout(2200);
await caption("Labels in nine languages, embedded fonts");
await page.selectOption("#map-lang", "ja");
await page.waitForTimeout(2000);
await page.selectOption("#map-lang", "zh-Hant");
await page.waitForTimeout(2000);
console.log(`recorded ${(Date.now() - start) / 1000}s`);
await context.close();
await browser.close();
server.close();

const [video] = (await readdir(raw)).filter((f) => f.endsWith(".webm"));
const gif = join(root, "assets/demo.gif");
execFileSync(
  "ffmpeg",
  [
    "-y",
    "-loglevel",
    "error",
    "-ss",
    "0.9",
    "-i",
    join(raw, video),
    "-vf",
    "fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=112:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle",
    gif,
  ],
  { stdio: "inherit" },
);
console.log("wrote assets/demo.gif");
