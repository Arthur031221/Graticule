// Adds a population to every area of the Taiwan, Japan and South Korea regions,
// so that `--fix` can divide raw counts there as it does for countries and the US.
// Run it when a source publishes a newer year; it checks each total against the
// official figure before it writes anything.
//
//   node scripts/add-population.mjs
//
// Sources
//   Taiwan  Ministry of the Interior, household registration, end of 2023, by village
//           (https://www.ris.gov.tw/rs-opendata/api/v1/datastore/ODRP019/112). Open Government Data License 1.0.
//   Japan   Statistics Bureau of Japan, 2020 Census, by prefecture (read from the table on
//           en.wikipedia.org/wiki/List_of_Japanese_prefectures_by_population, which reproduces it).
//   Korea   Statistics Korea, 2020 Census, by province, with the boundaries of 2020
//           (read from citypopulation.de/en/southkorea/admin).
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeName } from "../src/names.js";

const data = join(fileURLToPath(new URL(".", import.meta.url)), "../skills/graticule/data");
const TOTALS = { taiwan: 23420442, japan: 126146099, korea: 51829136 };

async function get(url, as = "text") {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!res.ok) throw new Error(String(res.status));
      return await res[as]();
    } catch (error) {
      if (attempt === 4) throw new Error(`${url}: ${error.message}`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

function expectTotal(label, pops) {
  const total = [...pops.values()].reduce((a, b) => a + b, 0);
  if (total !== TOTALS[label])
    throw new Error(`${label}: the areas add up to ${total}, the official total is ${TOTALS[label]}`);
}

/** county (5 digits) and township (8 digits) populations, summed from the villages */
async function taiwan() {
  const counties = new Map();
  const towns = new Map();
  for (let page = 1, last = 1; page <= last; page++) {
    const body = JSON.parse(await get(`https://www.ris.gov.tw/rs-opendata/api/v1/datastore/ODRP019/112?page=${page}`));
    last = Number(body.totalPage);
    for (const row of body.responseData) {
      const people = Object.entries(row)
        .filter(([key]) => key.startsWith("household_") && /_(m|f)$/.test(key))
        .reduce((sum, [, value]) => sum + Number(value), 0);
      const code = row.district_code;
      counties.set(code.slice(0, 5), (counties.get(code.slice(0, 5)) ?? 0) + people);
      towns.set(code.slice(0, 8), (towns.get(code.slice(0, 8)) ?? 0) + people);
    }
  }
  expectTotal("taiwan", counties);
  expectTotal("taiwan", towns);
  return { counties, towns };
}

/** Prefecture names without the type of prefecture, accents or case: "Ōsaka-fu" and "Osaka Prefecture" meet. */
const prefectureKey = (name) =>
  normalizeName(name.replace(/ (prefecture|metropolis)$/i, "").replace(/-(ken|fu|to)$/i, ""));

async function japan() {
  const { parse } = JSON.parse(
    await get(
      "https://en.wikipedia.org/w/api.php?action=parse&page=List_of_Japanese_prefectures_by_population&prop=wikitext&format=json&formatversion=2",
    ),
  );
  const start = parse.wikitext.indexOf('{| class="wikitable sortable"');
  const table = parse.wikitext.slice(start, parse.wikitext.indexOf("\n|}", start));
  const byName = new Map();
  for (const row of table.split("\n|-\n").slice(1)) {
    const cells = row
      .trim()
      .split("\n|")
      .map((cell) => cell.trim());
    cells[0] = cells[0].replace(/^\|/, "");
    const name = (cells[1] ?? "").replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1");
    const people = Number((cells[4] ?? "").replace(/,/g, ""));
    // The first row is the header and the last is the total for Japan; the prefectures have a whole number here.
    if (/^[\p{L}ōŌūŪ -]+$/u.test(name) && Number.isInteger(people) && people > 0 && !/^Japan$/.test(name))
      byName.set(prefectureKey(name), people);
  }
  if (byName.size !== 47) throw new Error(`japan: found ${byName.size} prefectures`);
  expectTotal("japan", byName);
  return byName;
}

async function korea() {
  const html = await get("https://www.citypopulation.de/en/southkorea/admin/");
  const byName = new Map();
  for (const [, block] of html.matchAll(/<tbody class="admin1">([\s\S]*?)<\/tbody>/g)) {
    for (const [, row] of block.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      const native = row.match(/class="rnative"><span itemprop="name">([^<]+)/)?.[1];
      const census = [...row.matchAll(/<td class="rpop">([\d,]+)<\/td>/g)].map((m) => Number(m[1].replace(/,/g, "")));
      // Columns are the censuses 1980, 1990, 2000, 2010, 2015, 2020 and 2025: the sixth is 2020.
      if (native && census.length >= 6) byName.set(normalizeName(native), census[5]);
    }
  }
  if (byName.size !== 17) throw new Error(`korea: found ${byName.size} provinces`);
  expectTotal("korea", byName);
  return byName;
}

async function write(file, fill) {
  const path = join(data, file);
  const topo = JSON.parse(await readFile(path, "utf8"));
  const [object] = Object.values(topo.objects);
  let count = 0;
  for (const geometry of object.geometries) {
    const pop = fill(geometry.properties);
    if (pop === undefined)
      throw new Error(`${file}: no population for ${geometry.properties.id} ${geometry.properties.nm[0]}`);
    geometry.properties.pop = pop;
    count++;
  }
  await writeFile(path, JSON.stringify(topo));
  console.log(`${file}: ${count} areas`);
}

const tw = await taiwan();
await write("tw-counties.json", (p) => tw.counties.get(p.id));
await write("tw-towns.json", (p) => tw.towns.get(p.id));
const jp = await japan();
await write("jp-prefectures.json", (p) => jp.get(prefectureKey(p.nm[0])));
const kr = await korea();
await write("kr-provinces.json", (p) => {
  for (const name of [...p.nm, ...(p.alt ?? [])]) if (kr.has(normalizeName(name))) return kr.get(normalizeName(name));
  return undefined;
});
