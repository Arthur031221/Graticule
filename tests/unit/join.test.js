import assert from "node:assert/strict";
import { test } from "node:test";
import { loadAreas } from "../../src/geo.js";
import { buildIndex, detectKind, joinKeys, rankKeyColumns } from "../../src/join.js";
import { damagedNamePattern, normalizeName, suggest } from "../../src/names.js";
import { assets } from "./helpers.js";

async function indexFor(region) {
  const { areas, region: def } = await loadAreas(region, assets);
  const aliases = def.level === "country" ? (await assets.json("data/aliases.json")).country : {};
  return { index: buildIndex(areas, aliases), order: def.keys };
}

const world = await indexFor("world");
const joined = (values, kind) => joinKeys(values, world.index, kind);
const idsOf = (join) => [...join.rowsByArea.keys()];

test("ISO 2 code NA is Namibia, not a missing value", () => {
  assert.deepEqual(idsOf(joined(["NA"], "iso2")), ["NAM"]);
});

test("names from the World Bank, UN and WHO reach the same country", () => {
  const names = ["Korea, Rep.", "Republic of Korea", "South Korea", "대한민국", "大韓民國", "Corée du Sud", "Südkorea"];
  const result = joined(names, "name");
  assert.deepEqual(idsOf(result), ["KOR"]);
  assert.equal(result.unmatched.length, 0);
});

test("accents, case, punctuation and St. are folded", () => {
  assert.equal(normalizeName("Côte d'Ivoire"), normalizeName("Cote d Ivoire"));
  assert.equal(normalizeName("St. Lucia"), normalizeName("Saint Lucia"));
  assert.equal(normalizeName("臺北市"), normalizeName("台北市"));
});

test("text damaged by a wrong encoding still matches one country", () => {
  assert.ok(damagedNamePattern("C�te d'Ivoire"));
  assert.deepEqual(idsOf(joined(["C�te d'Ivoire", "Cura�ao"], "name")).sort(), ["CIV", "CUW"]);
});

test("the Congos and the Koreas are never confused", () => {
  const result = joined(["Congo", "Congo, Dem. Rep.", "Korea, Dem. People's Rep.", "Korea, Rep."], "name");
  assert.deepEqual(idsOf(result).sort(), ["COD", "COG", "KOR", "PRK"]);
});

test("a bare 'Korea' is reported, not guessed", () => {
  const result = joined(["Korea"], "name");
  assert.equal(result.rowsByArea.size, 0);
  assert.equal(result.unmatched[0].value, "Korea");
});

test("unmatched rows come back with the closest names", () => {
  const result = joined(["Gernany", "Atlantis"], "name");
  assert.deepEqual(result.unmatched.find((u) => u.value === "Gernany").suggestions, ["Germany"]);
  assert.deepEqual(result.unmatched.find((u) => u.value === "Atlantis").suggestions, []);
});

test("dependencies do not steal the code of their country", () => {
  assert.deepEqual(idsOf(joined(["AU", "AUS"], "iso2")), ["AUS"]);
  assert.deepEqual(idsOf(joined(["FRA", "NOR"], "iso3")).sort(), ["FRA", "NOR"]);
});

test("the key column and its type are detected from the values", () => {
  const detected = detectKind(["DEU", "FRA", "JPN", "XXX"], world.index, world.order);
  assert.equal(detected.kind, "iso3");
  assert.equal(detected.rate, 0.75);
  assert.equal(detectKind(["Germany", "France", "Japan"], world.index, world.order).kind, "name");
});

test("US FIPS codes lose their leading zero in spreadsheets and get it back", async () => {
  const counties = await indexFor("us-counties");
  const result = joinKeys(["1001", "01003", "56045"], counties.index, "fips");
  assert.equal(result.rowsByArea.size, 3);
  assert.equal(result.via.padded, 1);
  const states = await indexFor("us-states");
  assert.equal(joinKeys(["6", "CA", "California"], states.index, "fips").rowsByArea.size, 1);
});

test("Taiwan township names need the county, and both spellings of Tai match", async () => {
  const towns = await indexFor("tw-towns");
  const result = joinKeys(["臺北市中正區", "台北市中正區", "基隆市中正區", "中正區"], towns.index, "name");
  assert.deepEqual(idsOf(result).length, 2);
  assert.equal(result.ambiguous.length, 1);
});

test("Japanese and Korean areas match by suffixed and bare names and by code", async () => {
  const jp = await indexFor("jp-prefectures");
  assert.equal(joinKeys(["東京都", "東京", "Tokyo", "JP-13", "北海道"], jp.index, "name").rowsByArea.size, 2);
  assert.equal(joinKeys(["13", "1", "47"], jp.index, "jis").rowsByArea.size, 3);
  const kr = await indexFor("kr-provinces");
  assert.equal(joinKeys(["서울특별시", "서울", "Seoul"], kr.index, "name").rowsByArea.size, 1);
});

test("suggest ignores very short or distant strings", () => {
  assert.deepEqual(suggest("ab", [["abc", "ABC"]]), []);
  assert.deepEqual(
    suggest("Germny", [
      ["germany", "Germany"],
      ["gabon", "Gabon"],
    ]),
    ["Germany"],
  );
});

const table = (header, lines) => ({
  columns: header,
  rows: lines.map((line) => Object.fromEntries(header.map((c, i) => [c, String(line[i])]))),
});

test("a text column that half joins beats a number column that matches codes by accident", async () => {
  const us = await indexFor("us-states");
  const { columns, rows } = table(
    ["state", "electoral_votes"],
    [
      ["Calif.", 54],
      ["N.Y.", 28],
      ["Texas", 40],
      ["Fla.", 30],
      ["Ohio", 17],
      ["Maine", 4],
    ],
  );
  const ranked = rankKeyColumns(columns, rows, us.index, us.order);
  assert.equal(ranked[0].column, "state");
  assert.equal(ranked[0].kind, "name");
  assert.equal(ranked[1].column, "electoral_votes");
});

test("a value column is never offered as the key", async () => {
  const us = await indexFor("us-states");
  const { columns, rows } = table(
    ["name", "votes"],
    [
      ["Texas", 40],
      ["Ohio", 17],
      ["Maine", 4],
    ],
  );
  assert.deepEqual(
    rankKeyColumns(columns, rows, us.index, us.order, ["name"]).map((r) => r.column),
    ["votes"],
  );
});

test("a plain number column is still the key when no text column joins", async () => {
  const jp = await indexFor("jp-prefectures");
  const { columns, rows } = table(
    ["code", "population"],
    [
      [1, 5224614],
      [13, 14047594],
      [27, 8837685],
      [47, 1467480],
    ],
  );
  const best = rankKeyColumns(columns, rows, jp.index, jp.order)[0];
  assert.equal(best.column, "code");
  assert.equal(best.kind, "jis");
});

test("zero-padded codes count as codes, not as numbers", async () => {
  const us = await indexFor("us-states");
  const { columns, rows } = table(
    ["note", "fips", "score"],
    [
      ["a", "06", 5],
      ["b", "48", 6],
      ["c", "36", 7],
      ["d", "12", 8],
    ],
  );
  const best = rankKeyColumns(columns, rows, us.index, us.order)[0];
  assert.equal(best.column, "fips");
  assert.equal(best.kind, "fips");
});
