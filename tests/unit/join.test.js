import assert from "node:assert/strict";
import { test } from "node:test";
import { loadAreas } from "../../src/geo.js";
import { buildIndex, detectKind, joinKeys, loadAliases, rankKeyColumns } from "../../src/join.js";
import { damagedNamePattern, editDistance, normalizeName, suggest } from "../../src/names.js";
import { assets } from "./helpers.js";

async function indexFor(region) {
  const { areas, region: def } = await loadAreas(region, assets);
  return { index: buildIndex(areas, await loadAliases(region, def, assets)), order: def.keys };
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
    rankKeyColumns(columns, rows, us.index, us.order, { exclude: ["name"] }).map((r) => r.column),
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

test("a key column with few distinct areas and many rows still ranks first", async () => {
  const { columns, rows } = table(
    ["year", "country", "value"],
    [
      [2023, "France", 5],
      [2024, "France", 6],
      [2023, "Japan", 7],
      [2024, "Japan", 8],
    ],
  );
  const ranked = rankKeyColumns(columns, rows, world.index, world.order);
  assert.equal(ranked[0].column, "country");
});

test("a flag column that happens to hold a postal code does not outrank the real key", async () => {
  const us = await indexFor("us-states");
  const { columns, rows } = table(
    ["status", "state", "value"],
    [
      ["OK", "Texas", 1],
      ["OK", "Ohio", 2],
      ["OK", "Maine", 3],
      ["OK", "Utah", 4],
    ],
  );
  assert.equal(rankKeyColumns(columns, rows, us.index, us.order)[0].column, "state");
});

test("a requested key kind decides which column is the key", () => {
  const { columns, rows } = table(
    ["iso3", "iso2", "value"],
    [
      ["FRA", "FR", 5],
      ["JPN", "JP", 6],
      ["BRA", "BR", 7],
    ],
  );
  assert.equal(rankKeyColumns(columns, rows, world.index, world.order)[0].column, "iso3");
  const forced = rankKeyColumns(columns, rows, world.index, world.order, { kind: "iso2" })[0];
  assert.deepEqual([forced.column, forced.kind], ["iso2", "iso2"]);
});

test("Associated Press state abbreviations join the right US state", async () => {
  const us = await indexFor("us-states");
  const pairs = {
    "Calif.": "06",
    "N.Y.": "36",
    "Fla.": "12",
    "W.Va.": "54",
    "Wash.": "53",
    "Mich.": "26",
    "D.C.": "11",
  };
  for (const [name, id] of Object.entries(pairs))
    assert.deepEqual(idsOf(joinKeys([name], us.index, "name")), [id], name);
  assert.equal(joinKeys(["Washington"], us.index, "name").rowsByArea.size, 1);
});

test("Taiwan county names from before 2014 and bare city names join, Chiayi and Hsinchu are never guessed", async () => {
  const tw = await indexFor("tw-counties");
  const pairs = {
    桃園縣: "68000",
    臺北縣: "65000",
    Taipei: "63000",
    "New Taipei": "65000",
    Kaohsiung: "64000",
    Matsu: "09007",
  };
  for (const [name, id] of Object.entries(pairs))
    assert.deepEqual(idsOf(joinKeys([name], tw.index, "name")), [id], name);
  const result = joinKeys(["Chiayi", "Hsinchu"], tw.index, "name");
  assert.equal(result.rowsByArea.size, 0);
  assert.deepEqual(
    result.unmatched.map((u) => u.value),
    ["Chiayi", "Hsinchu"],
  );
  assert.ok(result.unmatched[0].suggestions.length >= 2);
});

test("Korean provinces renamed in 2023 and 2024 and Japanese suffix spellings join", async () => {
  const kr = await indexFor("kr-provinces");
  assert.deepEqual(idsOf(joinKeys(["강원특별자치도", "Gangwon State"], kr.index, "name")), ["KR-42"]);
  assert.deepEqual(idsOf(joinKeys(["전북특별자치도", "Jeonbuk"], kr.index, "name")), ["KR-45"]);
  const jp = await indexFor("jp-prefectures");
  assert.deepEqual(idsOf(joinKeys(["Tokyo-to", "Tokyo Metropolis"], jp.index, "name")), ["JP-13"]);
  assert.deepEqual(idsOf(joinKeys(["Osaka-fu", "Kyoto-fu", "Fukuoka-ken"], jp.index, "name")).sort(), [
    "JP-26",
    "JP-27",
    "JP-40",
  ]);
});

test("every regional alias points at an area of its region and no alias is claimed twice", async () => {
  const file = await assets.json("data/aliases.json");
  const { normalizeName } = await import("../../src/names.js");
  for (const [regionId, table] of Object.entries(file.regions)) {
    const { index } = await indexFor(regionId);
    const seen = new Map();
    for (const [alias, id] of Object.entries(table)) {
      assert.ok(index.byId.has(id), `${regionId}: ${alias} points at ${id}`);
      const key = normalizeName(alias);
      assert.ok(!seen.has(key) || seen.get(key) === id, `${regionId}: ${alias} is claimed by two areas`);
      seen.set(key, id);
    }
  }
});

test("US counties join by the name with the state, the way tables write them", async () => {
  const us = await indexFor("us-counties");
  const expected = {
    "Los Angeles County, CA": "06037",
    "Los Angeles County, California": "06037",
    "Los Angeles, CA": "06037",
    "Orleans Parish, LA": "22071",
    "Anchorage Municipality, AK": "02020",
    "Alexandria city, VA": "51510",
    "Richmond city, VA": "51760",
    "Richmond County, VA": "51159",
    "Saint Louis County, Missouri": "29189",
    "St. Louis city, MO": "29510",
    "Doña Ana County, NM": "35013",
    "Dona Ana County, NM": "35013",
    "Baltimore city, MD": "24510",
    "Baltimore County, MD": "24005",
    "Carson City, NV": "32510",
    "Charles City County, VA": "51036",
    "District of Columbia, DC": "11001",
  };
  for (const [name, fips] of Object.entries(expected))
    assert.deepEqual(idsOf(joinKeys([name], us.index, "name")), [fips], name);
});

test("a county name that two counties share is ambiguous and a bare name is not matched", async () => {
  const us = await indexFor("us-counties");
  const richmond = joinKeys(["Richmond, VA"], us.index, "name");
  assert.equal(richmond.rowsByArea.size, 0);
  assert.equal(richmond.ambiguous.length, 1);
  assert.equal(joinKeys(["Mohave", "Washington County"], us.index, "name").rowsByArea.size, 0);
  assert.deepEqual(us.order, ["fips", "name"]);
});

test("the state table of the county names agrees with the bundled states", async () => {
  const { US_STATES } = await import("../../src/us-names.js");
  const { areas } = await loadAreas("us-states", assets);
  for (const area of areas) assert.deepEqual(US_STATES[area.id], [area.keys.postal[0], area.names[0]], area.id);
  assert.equal(Object.keys(US_STATES).length, areas.length);
});

test("a limited edit distance is the full one when within the limit and above the limit when not", () => {
  const letters = "abcde";
  let seed = 7;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
  const word = () => Array.from({ length: 3 + (next() % 8) }, () => letters[next() % letters.length]).join("");
  for (let i = 0; i < 400; i++) {
    const a = word();
    const b = word();
    for (const limit of [0, 1, 2, 3]) {
      assert.equal(
        Math.min(editDistance(a, b, limit), limit + 1),
        Math.min(editDistance(a, b), limit + 1),
        `${a} ${b} ${limit}`,
      );
    }
  }
});

test("hundreds of unmatched county names are reported in a moment", async () => {
  const us = await indexFor("us-counties");
  const wrong = Array.from({ length: 300 }, (_, i) => `Nonexistent${i} County, TX`);
  const started = performance.now();
  const result = joinKeys(wrong, us.index, "name");
  assert.equal(result.unmatched.length, 300);
  assert.ok(performance.now() - started < 5000, `${Math.round(performance.now() - started)} ms`);
  assert.equal(result.unmatched[299].suggestions.length, 0);
});
