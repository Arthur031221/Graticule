// Measures how many country names from three public tables Graticule joins
// to the right polygon, against the usual shortcut: exact equality with the
// English name in Natural Earth.
//
//   node verify/join-rates.mjs [--write docs/verification-join.md]
import { writeFileSync } from "node:fs";
import { parseTable } from "../src/csv.js";
import { loadAreas } from "../src/geo.js";
import { buildIndex, joinKeys } from "../src/join.js";
import { nodeAssets } from "../src/node-assets.js";

const assets = nodeAssets();
const { areas } = await loadAreas("world", assets);
const index = buildIndex(areas, (await assets.json("data/aliases.json")).country);
const polygons = new Set(areas.map((a) => a.id));
const naturalEarthNames = new Map(areas.map((a) => [a.names[0], a.id]));

const getText = async (url) => (await fetch(url, { signal: AbortSignal.timeout(60000) })).text();

const sources = [];

// 1. World Bank, countries and economies without aggregates (API).
{
  const meta = JSON.parse(await getText("https://api.worldbank.org/v2/country?format=json&per_page=400"))[1].filter(
    (c) => c.region.value !== "Aggregates",
  );
  sources.push({
    name: "World Bank country names",
    note: "217 economies, WDI",
    rows: meta.map((c) => ({ name: c.name, iso3: c.id })),
  });
}
// 2. WHO COVID-19 dashboard, the latest row of every country.
{
  const rows = parseTable(
    await getText("https://srhdpeuwpubsa.blob.core.windows.net/whdh/COVID/WHO-COVID-19-global-data.csv"),
  ).rows;
  const last = new Map(rows.map((r) => [r.Country_code, r]));
  const iso2 = new Map(areas.map((a) => [a.keys.iso2?.[0], a.id]));
  sources.push({
    name: "WHO COVID-19 dashboard names",
    note: "WHO region names, ISO 2 truth",
    rows: [...last.values()]
      .filter((r) => iso2.has(r.Country_code))
      .map((r) => ({ name: r.Country, iso3: iso2.get(r.Country_code) })),
  });
}
// 3. United Nations short names (datasets/country-codes, UNTERM).
{
  const rows = parseTable(
    await getText("https://raw.githubusercontent.com/datasets/country-codes/master/data/country-codes.csv"),
  ).rows;
  const column = (header) =>
    rows
      .filter((r) => r[header] && r["ISO3166-1-Alpha-3"])
      .map((r) => ({ name: r[header], iso3: r["ISO3166-1-Alpha-3"] }));
  sources.push({
    name: "UN terminology short names",
    note: "UNTERM English Short",
    rows: column("UNTERM English Short"),
  });
  sources.push({
    name: "UN terminology formal names",
    note: "UNTERM English Formal",
    rows: column("UNTERM English Formal"),
  });
  sources.push({ name: "ISO 3166 official names", note: "official_name_en", rows: column("official_name_en") });
  sources.push({ name: "Unicode CLDR display names", note: "CLDR display name", rows: column("CLDR display name") });
}

const results = [];
for (const source of sources) {
  const withPolygon = source.rows.filter((r) => polygons.has(r.iso3));
  const naive = withPolygon.map((r) => naturalEarthNames.get(r.name));
  const joined = joinKeys(
    withPolygon.map((r) => r.name),
    index,
    "name",
  );
  const byRow = new Map();
  for (const [id, rowIdx] of joined.rowsByArea) for (const i of rowIdx) byRow.set(i, id);
  const graticule = withPolygon.map((_, i) => byRow.get(i));
  results.push({
    ...source,
    names: source.rows.length,
    withPolygon: withPolygon.length,
    naive: naive.filter(Boolean).length,
    naiveWrong: naive.filter((id, i) => id && id !== withPolygon[i].iso3).length,
    graticule: graticule.filter(Boolean).length,
    graticuleWrong: graticule.filter((id, i) => id && id !== withPolygon[i].iso3).length,
    missed: withPolygon.filter((_, i) => !graticule[i]).map((r) => r.name),
  });
}

const line = (r) =>
  `| ${r.name} | ${r.withPolygon} | ${r.naive} (${r.naiveWrong} wrong) | ${r.graticule} (${r.graticuleWrong} wrong) |`;
const table = [
  "| Table | Names with a polygon | Exact match with Natural Earth | Graticule |",
  "| --- | --- | --- | --- |",
  ...results.map(line),
].join("\n");
console.log(table);
for (const r of results)
  console.log(`\n${r.name}: not matched by Graticule (${r.missed.length}): ${r.missed.join(" / ")}`);
if (process.argv.includes("--write")) {
  const missedText = results.map((r) => `- ${r.name}: ${r.missed.length ? r.missed.join(" / ") : "none"}`).join("\n");
  writeFileSync(
    process.argv[process.argv.indexOf("--write") + 1],
    `${table}\n\nNames Graticule did not match, with the reason that they are spellings it does not know or have no polygon at 1:50m:\n\n${missedText}\n`,
  );
}
if (results.some((r) => r.graticuleWrong)) process.exitCode = 1;
