import assert from "node:assert/strict";
import { test } from "node:test";
import { declaredPer, normalizeSpec } from "../../src/spec.js";

const problems = (input) =>
  normalizeSpec(input)
    .findings.filter((f) => f.level === "error")
    .map((f) => f.params.path);

test("a minimal spec gets its defaults", () => {
  const { spec, findings } = normalizeSpec({ data: { rows: [], value: "v" } });
  assert.equal(findings.length, 0);
  assert.equal(spec.region, "world");
  assert.equal(spec.type, "choropleth");
  assert.deepEqual(spec.classes, { method: "quantile", count: 5 });
  assert.equal(spec.language, "en");
});

test("errors name the field to fix", () => {
  assert.deepEqual(problems({ region: "mars", data: { rows: [], value: "v" } }), ["region"]);
  assert.deepEqual(problems({ type: "bubble", data: { rows: [], value: "v" } }), ["type"]);
  assert.deepEqual(problems({ data: { rows: [], value: "v" }, classes: { breaks: [3, 2] } }), ["classes.breaks"]);
  assert.deepEqual(problems({ data: { rows: [], value: "v" }, palette: "rainbowish" }), ["palette"]);
  assert.deepEqual(problems({ data: { rows: [], value: "v" }, language: "xx" }), ["language"]);
  assert.deepEqual(problems({ data: { rows: [], csv: "a", value: "v" } }), ["data"]);
  assert.deepEqual(problems({ title: "x" }), ["data"]);
  assert.deepEqual(problems({ data: { rows: [] } }), ["data.value"]);
});

test("misspelled fields are reported, not dropped silently", () => {
  const { findings } = normalizeSpec({ data: { rows: [], value: "v" }, paletre: "blues" });
  assert.equal(findings[0].id, "spec-unknown-key");
  assert.equal(findings[0].params.path, "paletre");
});

test("language tags are normalised", () => {
  for (const [tag, expected] of [
    ["zh-TW", "zh-Hant"],
    ["zh-CN", "zh-Hans"],
    ["pt-BR", "pt"],
    ["JA", "ja"],
    ["zh", "zh-Hans"],
  ]) {
    assert.equal(normalizeSpec({ language: tag, data: { rows: [], value: "v" } }).spec.language, expected);
  }
});

test("a custom palette must be hex colours", () => {
  assert.deepEqual(problems({ data: { rows: [], value: "v" }, palette: ["red", "blue"] }), ["palette"]);
  assert.equal(problems({ data: { rows: [], value: "v" }, palette: ["#ff0000", "#0000ff"] }).length, 0);
});

test("a locator map needs no table, a small multiple needs several columns", () => {
  assert.equal(problems({ type: "locator", highlight: ["TWN"] }).length, 0);
  assert.deepEqual(problems({ type: "choropleth", data: { rows: [], value: ["a", "b"] } }), ["data.value"]);
  assert.equal(problems({ type: "small-multiples", data: { rows: [], value: ["a", "b"] } }).length, 0);
});

test("normalize.per must be a positive number, defaults to 1 and must agree with a unit label", () => {
  const data = (normalize, label) => ({ rows: [], value: "v", normalize, ...(label ? { label } : {}) });
  assert.deepEqual(problems({ data: data({ by: "population", per: -100 }) }), ["data.normalize.per"]);
  assert.deepEqual(problems({ data: data({ by: "population", per: "100" }) }), ["data.normalize.per"]);
  assert.equal(normalizeSpec({ data: data({ by: "population" }) }).spec.data.normalize.per, 1);
  assert.deepEqual(problems({ data: data({ by: "population", per: 1000 }, "Deaths per 100,000 people") }), [
    "data.normalize.per",
  ]);
  assert.deepEqual(problems({ title: "Deaths per 100,000 people", data: data({ by: "population", per: 1000 }) }), [
    "data.normalize.per",
  ]);
  assert.deepEqual(problems({ data: data({ by: "population", per: 100000 }, "Deaths per 100,000 people") }), []);
  assert.deepEqual(problems({ data: data({ by: "population", per: 100000 }, "Deaths per 100 000 people") }), []);
  assert.deepEqual(problems({ data: data({ by: "population", per: 100000 }, "Deaths per 100k") }), []);
  assert.deepEqual(problems({ data: data({ by: "population", per: 1 }, "Deaths per capita") }), []);
  assert.equal(declaredPer("Cases per 1,000 residents"), 1000);
  assert.equal(declaredPer("Share per 0.5 units"), null);
});

test("a field of the wrong type is named, never spread, ignored or allowed to crash", () => {
  const good = { title: "t", source: "s", region: "world", data: { rows: [], key: "iso3", value: "v" } };
  const wrong = {
    center: "50",
    size: "huge",
    grid: "x",
    highlight: 3,
    columns: 9,
    panels: "a",
    classes: 5,
    legend: "L",
    symbols: 4,
    attribution: "no",
    labels: 4,
    data: { rows: "x", key: 7, keyType: 1, label: 2, file: 3, value: {} },
  };
  for (const [field, value] of Object.entries(wrong)) {
    const input = field === "data" ? { ...good, data: { ...good.data, ...value } } : { ...good, [field]: value };
    const { findings } = normalizeSpec(input);
    const paths = findings.filter((f) => f.id === "spec").map((f) => f.params.path);
    if (field === "data")
      for (const key of ["data.rows", "data.key", "data.keyType", "data.label", "data.file", "data.value"])
        assert.ok(paths.includes(key), key);
    else assert.ok(paths.includes(field), `${field}: ${paths.join()}`);
  }
  assert.deepEqual(normalizeSpec(good).findings, []);
});
