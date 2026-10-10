import assert from "node:assert/strict";
import { test } from "node:test";
import { loadAreas } from "../../src/geo.js";
import { build, errors } from "./helpers.js";
import { assets } from "./helpers.js";

// Official totals: Taiwan Ministry of the Interior end of 2023, Statistics Bureau of Japan and Statistics Korea 2020 census.
const TOTALS = { "tw-counties": 23420442, "tw-towns": 23420442, "jp-prefectures": 126146099, "kr-provinces": 51829136 };

for (const [region, total] of Object.entries(TOTALS)) {
  test(`${region} carries a population for every area and it adds up to the official total`, async () => {
    const { areas } = await loadAreas(region, assets);
    assert.deepEqual(
      areas.filter((a) => !(a.pop > 0)).map((a) => a.id),
      [],
    );
    assert.equal(
      areas.reduce((sum, a) => sum + a.pop, 0),
      total,
    );
  });

  test(`--fix divides raw counts by population in ${region}`, async () => {
    const { areas } = await loadAreas(region, assets);
    const rows = areas.slice(0, 8).map((a, i) => ({ area: a.names[0], deaths: 100 + i * 37 }));
    const spec = {
      title: "Deaths",
      source: "Made up",
      region,
      data: { rows, key: "area", value: "deaths", kind: "count", label: "Deaths" },
    };
    const refused = await build(spec);
    assert.ok(errors(refused).includes("raw-counts"));
    const fixed = await build(spec, { fix: true });
    assert.deepEqual(errors(fixed), []);
    assert.ok(fixed.fixes.some((f) => f.rule === "raw-counts"));
    assert.equal(fixed.spec.data.normalize.by, "population");
    assert.equal(fixed.analysis.population.available, true);
  });
}

test("a bundled population is not taken for the one of another region", async () => {
  const { areas } = await loadAreas("tw-towns", assets);
  const big = areas.sort((a, b) => b.pop - a.pop)[0];
  assert.ok(big.pop > 400000, `${big.names[0]} ${big.pop}`);
});
