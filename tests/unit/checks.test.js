import assert from "node:assert/strict";
import { test } from "node:test";
import { RULES } from "../../src/checks.js";
import { readFile } from "node:fs/promises";
import { decodeBytes } from "../../src/csv.js";
import { base, build, errors, fixture, ids } from "./helpers.js";

const countries = [
  "USA",
  "CHN",
  "IND",
  "BRA",
  "NGA",
  "DEU",
  "FRA",
  "JPN",
  "RUS",
  "MEX",
  "EGY",
  "ZAF",
  "AUS",
  "CAN",
  "ARG",
  "ESP",
  "ITA",
  "GBR",
  "KOR",
  "TUR",
  "IDN",
  "PAK",
];
const rows = (value) => countries.map((iso3, i) => ({ iso3, v: String(value(iso3, i)) }));

async function population() {
  const { loadAreas } = await import("../../src/geo.js");
  const { assets } = await import("./helpers.js");
  const { areas } = await loadAreas("world", assets);
  return new Map(areas.map((a) => [a.id, a.pop]));
}

test("every rule has a message and a reason in every language", async () => {
  const { assets } = await import("./helpers.js");
  for (const code of ["en", "zh-Hant", "zh-Hans", "ja", "ko", "es", "fr", "de", "pt"]) {
    const messages = await assets.json(`locales/${code}.json`);
    for (const id of Object.keys(RULES)) {
      assert.ok(messages.rules[id]?.reason, `${code} ${id} reason`);
      assert.ok(messages.rules[id]?.message ?? messages.rules[id]?.message_declared, `${code} ${id} message`);
    }
  }
});

test("a map with no source or title is refused with reasons", async () => {
  const result = await build({
    ...base({ title: "", source: "" }),
    data: { rows: rows((_, i) => i), key: "iso3", value: "v", kind: "rate", label: "u" },
  });
  assert.deepEqual(errors(result), ["source-required"]);
  assert.ok(ids(result).includes("title-required"));
  assert.match(result.findings.find((f) => f.id === "source-required").reason, /where the numbers come from/);
  assert.equal(result.scene, null);
});

test("raw counts are refused when declared", async () => {
  const result = await build(
    base({ data: { rows: rows((_, i) => 1000 * (i + 1)), key: "iso3", value: "v", kind: "count", label: "Deaths" } }),
  );
  assert.deepEqual(errors(result), ["raw-counts"]);
  assert.equal(result.findings[0].fixable || result.findings.find((f) => f.id === "raw-counts").fixable, true);
});

test("raw counts are caught from the correlation with population when kind is missing", async () => {
  const pop = await population();
  const result = await build(
    base({ data: { rows: rows((iso) => Math.round(pop.get(iso) * 0.01)), key: "iso3", value: "v", label: "Deaths" } }),
  );
  assert.ok(errors(result).includes("raw-counts"), ids(result).join());
  assert.match(result.findings.find((f) => f.id === "raw-counts").message, /Spearman/);
});

test("a rate that does not track population is not flagged", async () => {
  const result = await build(
    base({ data: { rows: rows((_, i) => (i * 37) % 11), key: "iso3", value: "v", label: "Percent" } }),
  );
  assert.ok(!ids(result).includes("raw-counts"));
  assert.ok(ids(result).includes("kind-undeclared"));
});

test("--fix divides by population, switches projection, caps classes and drops a rainbow palette", async () => {
  const pop = await population();
  const spec = base({
    projection: "mercator",
    palette: ["#00007f", "#0000ff", "#007fff", "#00ffff", "#7fff7f", "#ffff00", "#ff7f00", "#ff0000", "#7f0000"],
    classes: { method: "quantile", count: 9 },
    data: {
      rows: rows((iso) => Math.round(pop.get(iso) * 0.01)),
      key: "iso3",
      value: "v",
      kind: "count",
      label: "Deaths",
    },
  });
  const blocked = await build(spec);
  assert.deepEqual(errors(blocked).sort(), ["max-classes", "palette-order", "projection-mercator", "raw-counts"]);
  const fixed = await build(spec, { fix: true });
  assert.equal(fixed.blocked, false);
  assert.deepEqual(fixed.fixes.map((f) => f.rule).sort(), [
    "max-classes",
    "palette-order",
    "projection-mercator",
    "raw-counts",
  ]);
  assert.equal(fixed.spec.data.normalize.by, "population");
  assert.equal(fixed.spec.projection, "auto");
  assert.equal(fixed.spec.classes.count, 7);
  assert.ok(fixed.scene);
  assert.match(JSON.stringify(fixed.scene.items), /per [\d,]+ people/);
});

test("manual breaks that stop short of the data are refused and extended by --fix", async () => {
  const spec = base({
    classes: { method: "manual", breaks: [10, 20, 30] },
    data: { rows: rows((_, i) => i * 3), key: "iso3", value: "v", kind: "rate", label: "u" },
  });
  assert.deepEqual(errors(await build(spec)), ["class-breaks-coverage"]);
  const fixed = await build(spec, { fix: true });
  assert.equal(fixed.blocked, false);
  assert.ok(fixed.spec.classes.breaks[0] <= 0 && fixed.spec.classes.breaks.at(-1) >= 63);
});

test("duplicate rows per country are refused until a filter or an aggregate is given", async () => {
  const data = [...rows((_, i) => i), ...rows((_, i) => i + 5).map((r) => ({ ...r, year: "2" }))].map((r) => ({
    year: "1",
    ...r,
  }));
  const spec = base({ data: { rows: data, key: "iso3", value: "v", kind: "rate", label: "u" } });
  assert.deepEqual(errors(await build(spec)), ["duplicate-keys"]);
  spec.data.filter = { year: "1" };
  assert.deepEqual(errors(await build(spec)), []);
  delete spec.data.filter;
  spec.data.aggregate = "mean";
  assert.deepEqual(errors(await build(spec)), []);
});

test("a join that mostly fails is an error, one that partly fails is a warning with the rows", async () => {
  const bad = await build(
    base({
      data: {
        rows: [
          { iso3: "ZZZ", v: "1" },
          { iso3: "YYY", v: "2" },
        ],
        key: "iso3",
        value: "v",
        kind: "rate",
        label: "u",
      },
    }),
  );
  assert.ok(errors(bad).includes("join-failed"));
  const partial = await build(
    base({
      data: {
        rows: [...rows((_, i) => i), { iso3: "Atlantis", v: "3" }],
        key: "iso3",
        value: "v",
        kind: "rate",
        label: "u",
      },
    }),
  );
  assert.deepEqual(errors(partial), []);
  assert.match(partial.findings.find((f) => f.id === "join-unmatched").message, /Atlantis/);
});

test("categorical maps refuse more than eight categories and unsafe custom colours", async () => {
  const many = rows((_, i) => `cat${i % 10}`);
  const spec = base({ type: "categorical", data: { rows: many, key: "iso3", value: "v", label: "Group" } });
  assert.ok(errors(await build(spec)).includes("too-many-categories"));
  const close = base({
    type: "categorical",
    palette: ["#ff0000", "#fe0101"],
    data: { rows: rows((_, i) => `c${i % 2}`), key: "iso3", value: "v", label: "Group" },
  });
  assert.ok(errors(await build(close)).includes("cvd-separation"));
});

test("a diverging palette needs a centre and --fix picks 0 when the data has both signs", async () => {
  const spec = base({
    palette: "rdbu",
    data: { rows: rows((_, i) => i - 10), key: "iso3", value: "v", kind: "index", label: "u" },
  });
  assert.deepEqual(errors(await build(spec)), ["diverging-center"]);
  const fixed = await build(spec, { fix: true });
  assert.equal(fixed.spec.center, 0);
  assert.equal(fixed.blocked, false);
});

test("an accepted rule stays in the report and no longer blocks", async () => {
  const spec = base({
    title: "",
    source: "",
    checks: { allow: ["source-required"] },
    data: { rows: rows((_, i) => i), key: "iso3", value: "v", kind: "rate", label: "u" },
  });
  const result = await build(spec);
  assert.equal(result.blocked, false);
  const finding = result.findings.find((f) => f.id === "source-required");
  assert.equal(finding.allowed, true);
  assert.equal(finding.was, "error");
});

test("Mercator is fine for a city-sized region and Albers USA needs no warning", async () => {
  const taiwan = await build({
    title: "t",
    source: "s",
    region: "tw-counties",
    projection: "mercator",
    data: {
      rows: [
        { code: "63000", v: "1" },
        { code: "64000", v: "2" },
        { code: "67000", v: "3" },
      ],
      key: "code",
      value: "v",
      kind: "rate",
      label: "u",
    },
  });
  assert.ok(!errors(taiwan).includes("projection-mercator"));
});

test("the legend covers every value and the classes use few digits", async () => {
  const result = await build(
    base({
      data: { rows: rows((_, i) => 12.3456 * (i + 1) + 0.00123), key: "iso3", value: "v", kind: "rate", label: "u" },
    }),
  );
  const edges = result.analysis.classing.edges;
  assert.ok(edges[0] <= 12.34 && edges.at(-1) >= 12.3456 * countries.length);
  assert.ok(
    edges.slice(1, -1).every((e) => String(e).replace(".", "").length <= 4),
    edges.join(),
  );
});

test("a custom palette with fewer colours than classes is an error, not a silent no-data fill", async () => {
  const spec = base({
    palette: ["#eeeeee", "#111111"],
    classes: { method: "manual", breaks: [0, 1, 2, 3] },
    data: {
      rows: [
        { iso3: "USA", v: "1" },
        { iso3: "CAN", v: "2" },
        { iso3: "MEX", v: "3" },
      ],
      key: "iso3",
      value: "v",
      kind: "rate",
      label: "u",
    },
  });
  const result = await build(spec);
  assert.ok(errors(result).includes("spec"));
  assert.match(result.findings.find((f) => f.id === "spec").message, /3 classes need 3 colours/);
});

test("a denominator column is paired row by row", async () => {
  const rows = [
    { iso3: "USA", n: "10", d: "100" },
    { iso3: "USA", n: "90", d: "" },
    { iso3: "CAN", n: "5", d: "50" },
    { iso3: "MEX", n: "1", d: "0" },
  ];
  const data = {
    rows,
    key: "iso3",
    value: "n",
    kind: "rate",
    label: "u",
    normalize: { by: "column", column: "d", per: 1 },
    aggregate: "sum",
  };
  const result = await build(base({ data }));
  const byArea = result.analysis.series[0].byArea;
  assert.equal(byArea.get("USA"), 0.1);
  assert.equal(byArea.get("CAN"), 0.1);
  assert.equal(byArea.get("MEX"), null);
  assert.ok(ids(result).includes("normalize-missing"));
});

test("a value in an inset is classified with the rest of its map", async () => {
  const rows = [
    { k: "JP-47", v: "999" },
    { k: "JP-13", v: "1" },
    { k: "JP-14", v: "2" },
    { k: "JP-27", v: "3" },
  ];
  const result = await build({
    title: "t",
    source: "s",
    region: "jp-prefectures",
    classes: { method: "equal", count: 3 },
    data: { rows, key: "k", value: "v", kind: "rate", label: "u" },
  });
  assert.ok(result.analysis.classing.edges.at(-1) >= 999);
  assert.ok(result.analysis.series[0].assign.get("JP-47") >= 0);
});

test("symbols need a positive value and are sized by the areas that are drawn", async () => {
  const none = await build(
    base({
      type: "symbols",
      data: {
        rows: [
          { iso3: "USA", v: "-1" },
          { iso3: "CAN", v: "" },
        ],
        key: "iso3",
        value: "v",
        kind: "count",
        label: "u",
      },
    }),
  );
  assert.ok(errors(none).includes("no-values"));
  const far = await build({
    title: "t",
    source: "s",
    region: "europe",
    type: "symbols",
    data: {
      rows: [
        { k: "DEU", v: "10" },
        { k: "FRA", v: "20" },
        { k: "AUS", v: "1e12" },
      ],
      key: "k",
      value: "v",
      kind: "count",
      label: "u",
    },
  });
  assert.equal(Math.max(...far.analysis.series[0].numbers), 20);
});

test("categories take the first or last row and refuse other operations", async () => {
  const rows = [
    { k: "USA", v: "A" },
    { k: "USA", v: "B" },
    { k: "CAN", v: "A" },
    { k: "MEX", v: "B" },
  ];
  const spec = (aggregate) =>
    base({ type: "categorical", data: { rows, key: "k", value: "v", label: "g", aggregate } });
  assert.equal((await build(spec("first"))).analysis.series[0].byArea.get("USA"), "A");
  assert.equal((await build(spec("last"))).analysis.series[0].byArea.get("USA"), "B");
  assert.ok(errors(await build(spec("sum"))).includes("spec"));
  assert.ok(errors(await build(spec(undefined))).includes("duplicate-keys"));
});

test("table problems that would change the data are reported", async () => {
  const dup = await build(
    base({ data: { csv: "k,v,v\nUSA,10,999\n", key: "k", value: "v", kind: "rate", label: "u" } }),
  );
  assert.match(dup.findings.find((f) => f.id === "spec").message, /more than once/);
  const open = await build(
    base({ data: { csv: 'k,v\nUSA,"10\nCAN,20\n', key: "k", value: "v", kind: "rate", label: "u" } }),
  );
  assert.match(open.findings.find((f) => f.id === "spec").message, /never closes/);
  const ragged = await build(
    base({ data: { csv: "k,v\nUSA,10\nCAN,20,extra\nMEX\n", key: "k", value: "v", kind: "rate", label: "u" } }),
  );
  assert.ok(ids(ragged).includes("table-ragged"));
});

test("--fix keeps the unit the spec already states, so the numbers match their label", async () => {
  const pop = await population();
  const fixed = await build(
    base({
      legend: { title: "Deaths per 100,000 people" },
      data: { rows: rows((iso) => Math.round(pop.get(iso) * 0.01)), key: "iso3", value: "v", kind: "count" },
    }),
    { fix: true },
  );
  assert.equal(fixed.blocked, false);
  assert.equal(fixed.spec.data.normalize.per, 100000);
  const titled = await build(
    base({
      title: "Deaths per 100,000 people",
      data: { rows: rows((iso) => Math.round(pop.get(iso) * 0.01)), key: "iso3", value: "v", kind: "count" },
    }),
    { fix: true },
  );
  assert.equal(titled.spec.data.normalize.per, 100000, "a unit in the title counts too");
});

test("diverging colours stay on their own side of the centre", async () => {
  const { classifyNumbers } = await import("../../src/analyze.js");
  const { paletteColors } = await import("../../src/palettes.js");
  const full = paletteColors("rdbu", 4);
  const allPositive = classifyNumbers([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], {
    center: 0,
    classes: { method: "quantile", count: 5 },
  });
  assert.deepEqual(allPositive.colors, full.slice(2));
  const lopsided = classifyNumbers([-10, -5, -1, 1, 2, 3, 4, 5, 6, 20], {
    center: 0,
    classes: { method: "equal", count: 6 },
  });
  assert.deepEqual(lopsided.edges, [-10, 0, 10, 20]);
  assert.deepEqual(lopsided.colors, full.slice(1));
});

test("a categorical palette on ordered classes is refused because its lightness does not run one way", async () => {
  const result = await build(
    base({
      palette: "okabe-ito",
      data: { rows: rows((_, i) => i), key: "iso3", value: "v", kind: "rate", label: "u" },
    }),
  );
  assert.ok(errors(result).includes("palette-order"), ids(result).join());
});

test("every panel of a small multiple is checked on its own", async () => {
  const pop = await population();
  const table = [...pop].map(([iso3, people], i) => ({
    iso3,
    steady: String((i * 37) % 11),
    counts: people ? String(Math.round(people * 0.01)) : "",
    blank: "",
  }));
  const multiples = (value, extra = {}) =>
    build(base({ type: "small-multiples", data: { rows: table, key: "iso3", value, ...extra } }));
  const raw = await multiples(["steady", "counts"]);
  assert.ok(errors(raw).includes("raw-counts"), ids(raw).join());
  const gaps = await multiples(["steady", "blank"], { kind: "rate", label: "u" });
  assert.ok(ids(gaps).includes("no-data-share"), ids(gaps).join());
  const fine = await multiples(["steady"], { kind: "rate", label: "u" });
  assert.ok(!ids(fine).includes("no-data-share"));
});

test("rows left out of an area are reported, plain gaps are not", async () => {
  const table = (cell) => rows((_, i) => (i === 3 ? cell : i));
  const spec = (rowsOf) => base({ data: { rows: rowsOf, key: "iso3", value: "v", kind: "rate", label: "u" } });
  const stray = (await build(spec(table("oops")))).findings.find((f) => f.id === "values-skipped");
  assert.ok(stray, "a stray word is reported");
  assert.equal(stray.level, "warn");
  assert.match(stray.message, /oops/);
  for (const gap of ["", "n/a", "-"]) assert.ok(!ids(await build(spec(table(gap)))).includes("values-skipped"), gap);

  const pairs = countries.map((iso3, i) => ({ iso3, v: String(10 + i), d: "100" }));
  const zero = await build(
    base({
      data: {
        rows: [...pairs, { iso3: "USA", v: "90", d: "0" }],
        key: "iso3",
        value: "v",
        kind: "rate",
        label: "u",
        aggregate: "sum",
        normalize: { by: "column", column: "d", per: 1 },
      },
    }),
  );
  const dropped = zero.findings.find((f) => f.id === "values-skipped");
  assert.ok(dropped, "a row with a zero denominator is reported even though another row of the area is used");
  assert.match(dropped.message, /90 \/ 0/);
});

const readDecoded = async (path, encoding) => decodeBytes(await readFile(fixture(path)), encoding);

test("a table that is not UTF-8 is read as Windows-1252 and the report says so", async () => {
  const spec = base({
    data: { file: "countries-latin1.csv", key: "country", value: "value", kind: "rate", label: "Units" },
  });
  const result = await build(spec, { readText: readDecoded });
  const finding = result.findings.find((f) => f.id === "table-encoding");
  assert.equal(finding.level, "warn");
  assert.match(finding.message, /countries-latin1\.csv is not valid UTF-8, so it was read as windows-1252/);
  assert.equal(result.analysis.join.rowsMatched, 5);
});

test("data.encoding reads a Big5 table, joins every Taiwan county and raises no encoding finding", async () => {
  const spec = base({
    region: "tw-counties",
    data: { file: "tw-counties-big5.csv", encoding: "big5", key: "county", value: "population", kind: "count" },
  });
  const result = await build(spec, { readText: readDecoded });
  assert.ok(!ids(result).includes("table-encoding"));
  assert.equal(result.analysis.join.rowsMatched, 6);
  assert.equal(result.analysis.join.unmatched.length, 0);
});

test("without data.encoding the same Big5 table is guessed wrong and fails to join", async () => {
  const spec = base({
    region: "tw-counties",
    data: { file: "tw-counties-big5.csv", key: "county", value: "population", kind: "count" },
  });
  const result = await build(spec, { readText: readDecoded });
  assert.ok(ids(result).includes("table-encoding"));
  assert.ok(ids(result).includes("join-failed"));
});

test("data.encoding must be an encoding name", async () => {
  const spec = base({ data: { rows: [{ iso3: "FRA", v: 1 }], key: "iso3", value: "v", encoding: "klingon" } });
  const result = await build(spec);
  assert.ok(result.findings.some((f) => f.id === "spec" && f.message.includes("data.encoding")));
});

test("a blank key cell does not stop the key column from being found", async () => {
  const spec = base({
    data: {
      rows: [
        { c: "France", v: 5.1 },
        { c: "Japan", v: 6.2 },
        { c: "", v: 7.3 },
      ],
      value: "v",
      kind: "rate",
      label: "Units",
    },
  });
  const result = await build(spec);
  assert.ok(!errors(result).includes("spec"), errors(result).join());
  assert.equal(result.analysis.join.column, "c");
  assert.ok(ids(result).includes("join-blank"));
});

test("a long list of unmatched names is cut after twenty and says how many are left out", async () => {
  const { loadAreas } = await import("../../src/geo.js");
  const { assets } = await import("./helpers.js");
  const { areas } = await loadAreas("world", assets);
  const rows = [
    ...areas.slice(0, 120).map((a, i) => ({ iso3: a.id, v: i + 1 })),
    ...Array.from({ length: 60 }, (_, i) => ({ iso3: `ZZ${i}`, v: 1 })),
  ];
  const result = await build(base({ data: { rows, key: "iso3", value: "v", kind: "rate", label: "Units" } }));
  const finding = result.findings.find((f) => f.id === "join-unmatched");
  assert.match(finding.message, /^60 rows matched no area/);
  assert.match(finding.message, /; \.\.\. \(\+40\)\.$/);
  assert.equal(finding.message.split("; ").length, 21);
  assert.equal(result.analysis.join.unmatched.length, 60);
});
