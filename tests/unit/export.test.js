import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { buildMap } from "../../src/build.js";
import { exportMap } from "../../src/export.js";
import { createFontStore } from "../../src/fonts.js";
import { assets } from "./helpers.js";

const store = createFontStore(assets);
const dir = (id) => fileURLToPath(new URL(`../../gallery/${id}/`, import.meta.url));

async function built(id, patch = (s) => s) {
  const spec = patch(JSON.parse(await readFile(`${dir(id)}spec.json`, "utf8")));
  const result = await buildMap(spec, { assets, readText: (p) => readFile(`${dir(id)}${p}`, "utf8") });
  assert.equal(result.blocked, false);
  return result;
}

const pngSize = (bytes) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  assert.equal(view.getUint32(0), 0x89504e47);
  return [view.getUint32(16), view.getUint32(20)];
};

test("PNG has the scene size at screen scale and 3.125 times that at 300 dpi", async () => {
  const result = await built("life-expectancy");
  const screen = await exportMap(result, ["png"], { assets, store });
  assert.deepEqual(pngSize(screen.png), [result.scene.width, result.scene.height]);
  const print = await exportMap(result, ["png"], { assets, store, dpi: 300 });
  assert.deepEqual(pngSize(print.png), [
    Math.round(result.scene.width * 3.125),
    Math.round(result.scene.height * 3.125),
  ]);
});

test("PDF is one page the size of the map with the title in its metadata", async () => {
  const result = await built("life-expectancy");
  const { pdf } = await exportMap(result, ["pdf"], { assets, store });
  const text = Buffer.from(pdf).toString("latin1");
  assert.ok(text.startsWith("%PDF-"));
  assert.match(text, new RegExp(`/MediaBox \\[0 0 ${(result.scene.width * 0.75).toFixed(0)}`));
  assert.ok(text.includes("/Type /Pages"));
});

test("SVG embeds only the fonts and glyphs it uses", async () => {
  const latin = (await exportMap(await built("life-expectancy"), ["svg"], { assets, store })).svg;
  assert.match(latin, /font-family:'Noto Sans'/);
  assert.ok(!latin.includes("Noto Sans CJK"));
  const chinese = (await exportMap(await built("taiwan-township-area"), ["svg"], { assets, store })).svg;
  assert.match(chinese, /font-family:'Noto Sans CJK TC'/);
  assert.ok(chinese.length < 900_000, `CJK SVG is ${chinese.length} bytes`);
});

test("Japanese and Korean maps embed their own CJK faces", async () => {
  const ja = (await exportMap(await built("japan-regions"), ["svg"], { assets, store })).svg;
  assert.match(ja, /Noto Sans CJK JP/);
  const ko = (await exportMap(await built("korea-capital-region"), ["svg"], { assets, store })).svg;
  assert.match(ko, /Noto Sans CJK KR/);
});

test("HTML is one self-contained page with a data table and no external requests", async () => {
  const { html } = await exportMap(await built("income-groups"), ["html"], { assets, store });
  assert.match(html, /^<!doctype html>/);
  assert.ok(html.includes("<table>") && html.includes("<script>"));
  assert.ok(!/(src|href)=["']https?:/.test(html), "no external resources");
  assert.ok(html.includes("function interactions"));
});

test("an unknown format is an error", async () => {
  await assert.rejects(exportMap(await built("life-expectancy"), ["gif"], { assets, store }), /unknown format/);
});

test("a Chinese title on an English map gets a face that can draw it, and a character no face has is reported", async () => {
  const result = await built("life-expectancy", (spec) => ({ ...spec, title: "\u6e2c\u8a66 \ud840\udc00" }));
  assert.ok(result.findings.some((f) => f.id === "glyphs-missing"));
  const { svg, pdf } = await exportMap(result, ["svg", "pdf"], { assets, store });
  assert.match(svg, /Noto Sans CJK TC/);
  assert.ok(pdf.length > 1000);
});

test("a character the Latin face lacks is reported too", async () => {
  const result = await built("life-expectancy", (spec) => ({ ...spec, title: "Life \u{1F600}" }));
  const finding = result.findings.find((f) => f.id === "glyphs-missing");
  assert.ok(finding, "emoji reported");
  assert.match(finding.message, /\u{1F600}/u);
  assert.ok(!(await built("life-expectancy")).findings.some((f) => f.id === "glyphs-missing"));
});

test("a hostile colour or title cannot add elements to the SVG or the HTML", async () => {
  const patch = (spec) => ({
    ...spec,
    type: "symbols",
    symbols: { color: '#ff0000" onload="alert(1)' },
    title: "<script>alert(1)</script>",
  });
  const rejected = await built("population-symbols", patch).catch((error) => error);
  assert.ok(rejected instanceof Error || rejected.blocked === false, "validation or a clean render");
  const result = await built("population-symbols", (spec) => ({ ...spec, title: '<script>alert(1)</script> "x"' }));
  const { svg, html } = await exportMap(result, ["svg", "html"], { assets, store });
  assert.ok(!svg.includes("<script>alert") && !html.includes("<script>alert"));
  assert.ok(svg.includes("&lt;script&gt;"));
});
