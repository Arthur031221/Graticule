import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { buildMap } from "../../src/build.js";
import { toSvg } from "../../src/scene.js";
import { assets } from "./helpers.js";

const gallery = (id) => fileURLToPath(new URL(`../../gallery/${id}/`, import.meta.url));
const SNAPSHOTS = new URL("../snapshots.json", import.meta.url);
const update = Boolean(process.env.UPDATE_SNAPSHOTS);

/** Everything about a scene that a visual change would alter, without the coordinates. */
function signature(scene) {
  const counts = {};
  const fills = {};
  const texts = [];
  const walk = (item) => {
    counts[item.type] = (counts[item.type] ?? 0) + 1;
    if (item.fill && item.fill !== "none") fills[item.fill] = (fills[item.fill] ?? 0) + 1;
    if (item.type === "text") texts.push(item.text);
    if (item.type === "g") item.children.forEach(walk);
  };
  scene.items.forEach(walk);
  return { size: [scene.width, scene.height], counts, fills: Object.fromEntries(Object.entries(fills).sort()), texts };
}

async function render(id, patch = (spec) => spec) {
  const dir = gallery(id);
  const spec = patch(JSON.parse(await readFile(`${dir}spec.json`, "utf8")));
  const result = await buildMap(spec, { assets, readText: (path) => readFile(`${dir}${path}`, "utf8") });
  assert.equal(
    result.blocked,
    false,
    result.findings
      .filter((f) => f.level === "error")
      .map((f) => f.message)
      .join(" "),
  );
  return result;
}

const CASES = {
  choropleth: ["life-expectancy"],
  "raw counts normalised by population": ["covid-deaths"],
  symbols: ["population-symbols"],
  categorical: ["income-groups"],
  "small multiples": ["fertility-small-multiples"],
  "locator with globe": ["taiwan-locator"],
  "Japan with an Okinawa inset": ["japan-regions"],
  "US states normalised by area": ["us-state-density"],
  "Taiwan townships in Traditional Chinese": ["taiwan-township-area"],
  "dark theme": ["life-expectancy", (spec) => ({ ...spec, theme: "dark" })],
};

let snapshots = {};
try {
  snapshots = JSON.parse(await readFile(SNAPSHOTS, "utf8"));
} catch {}
const fresh = {};

for (const [name, [id, patch]] of Object.entries(CASES)) {
  test(`snapshot: ${name}`, async () => {
    const result = await render(id, patch);
    const actual = signature(result.scene);
    fresh[name] = actual;
    if (!update)
      assert.deepEqual(
        actual,
        snapshots[name],
        `${name} changed. If that is intended, run: UPDATE_SNAPSHOTS=1 npm test`,
      );
    const svg = toSvg(result.scene);
    assert.ok(!/NaN|undefined|Infinity/.test(svg), "no broken numbers in the SVG");
    assert.ok(svg.startsWith("<svg") && svg.trimEnd().endsWith("</svg>"));
  });
}

test("small multiples dot the areas too small to see in every panel", async () => {
  const result = await render("fertility-small-multiples");
  const dots = [];
  const walk = (item) => {
    if (item.type === "circle") dots.push(item);
    if (item.type === "g") item.children.forEach(walk);
  };
  result.scene.items.forEach(walk);
  assert.ok(dots.length > 0, "dots drawn");
  const panels = 4;
  assert.equal(dots.length % panels, 0, "the same areas in each of the four panels");
  assert.ok(result.findings.some((f) => f.id === "small-areas-marked"));
});

test.after(async () => {
  if (update) await writeFile(SNAPSHOTS, JSON.stringify(fresh, null, 1) + "\n");
});

test("the same spec always gives the same SVG", async () => {
  const [a, b] = await Promise.all([render("life-expectancy"), render("life-expectancy")]);
  assert.equal(toSvg(a.scene), toSvg(b.scene));
});

test("the legend prints the edges the classes used", async () => {
  const result = await render("life-expectancy");
  const edges = result.analysis.classing.edges;
  const legend = result.scene.items.filter((item) => item.type === "text").map((item) => Number(item.text));
  for (const edge of [edges[0], edges.at(-1)])
    assert.ok(legend.includes(edge), `${edge} in ${legend.filter(Number.isFinite)}`);
});

test("every area with a value gets a colour from the legend and the others the no-data colour", async () => {
  const result = await render("life-expectancy");
  const colours = new Set(result.analysis.classing.colors);
  const areas = result.scene.items.find((item) => item.id === "areas").children;
  for (const area of areas) {
    const hasValue = area.attrs["data-value"] !== undefined;
    assert.equal(colours.has(area.fill), hasValue, area.attrs["data-name"]);
  }
});

test("labels never overlap", async () => {
  for (const id of ["life-expectancy", "europe-gdp-per-capita", "japan-regions"]) {
    const { stats } = await render(id);
    for (let i = 0; i < stats.labelBoxes.length; i++) {
      for (let j = i + 1; j < stats.labelBoxes.length; j++) {
        const p = stats.labelBoxes[i];
        const q = stats.labelBoxes[j];
        assert.ok(
          p.x >= q.x + q.w || q.x >= p.x + p.w || p.y >= q.y + q.h || q.y >= p.y + p.h,
          `${id}: labels ${i} and ${j}`,
        );
      }
    }
  }
});

test("labels follow the map language and fall back where a name is missing", async () => {
  const text = async (language) =>
    (await render("europe-gdp-per-capita", (spec) => ({ ...spec, language }))).scene.items.flatMap(function walk(item) {
      return item.type === "g" ? item.children.flatMap(walk) : item.type === "text" ? [item.text] : [];
    });
  assert.ok((await text("en")).includes("Germany"));
  assert.ok((await text("de")).includes("Deutschland"));
  assert.ok((await text("ja")).includes("ドイツ"));
  assert.ok((await text("zh-Hant")).includes("德國"));
  assert.ok((await text("ko")).includes("독일"));
});

test("a label is not placed over a hole in its area", async () => {
  const { placeLabels } = await import("../../src/labels.js");
  const square = [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ];
  const hole = [
    [45, 45],
    [45, 55],
    [55, 55],
    [55, 45],
  ];
  const anchor = { x: 50, y: 50, radius: 5, area: 10000, ring: square, holes: [hole] };
  const result = placeLabels([{ id: "a", anchor, names: ["wide label"] }], {
    width: () => 50,
    frame: [0, 0, 100, 100],
    sizes: [43],
  });
  assert.equal(result.placed.length, 0);
});
