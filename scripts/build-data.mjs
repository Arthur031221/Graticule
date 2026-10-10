// Rebuilds skills/graticule/data from the public sources listed in data/SOURCES.md.
// Needs network access. The output is committed so rendering never does.
//
//   node scripts/build-data.mjs [rawDir]
//
// rawDir holds the downloaded originals (default .tmp/raw). Files that are
// missing are downloaded first.
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { topology } from "topojson-server";
import { presimplify, simplify, quantile } from "topojson-simplify";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "skills/graticule/data");
const raw = process.argv[2] ?? join(root, ".tmp/raw");

const NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson";
const SOURCES = {
  "ne_110m_admin_0_countries.geojson": `${NE}/ne_110m_admin_0_countries.geojson`,
  "ne_50m_admin_0_countries.geojson": `${NE}/ne_50m_admin_0_countries.geojson`,
  "ne_10m_admin_1_states_provinces.geojson": `${NE}/ne_10m_admin_1_states_provinces.geojson`,
  "us-states-10m.json": "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json",
  "us-counties-10m.json": "https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json",
  "tw-counties-10t.json": "https://cdn.jsdelivr.net/npm/taiwan-atlas@2021.9.20/counties-10t.json",
  "tw-towns-10t.json": "https://cdn.jsdelivr.net/npm/taiwan-atlas@2021.9.20/towns-10t.json",
  "co-est2023-alldata.csv":
    "https://www2.census.gov/programs-surveys/popest/datasets/2020-2023/counties/totals/co-est2023-alldata.csv",
};

// Order matches src/lang.js (LANGS).
const NE_NAME_KEYS = ["EN", "ZHT", "ZH", "JA", "KO", "ES", "FR", "DE", "PT"];

const US_POSTAL = {
  "01": "AL",
  "02": "AK",
  "04": "AZ",
  "05": "AR",
  "06": "CA",
  "08": "CO",
  "09": "CT",
  10: "DE",
  11: "DC",
  12: "FL",
  13: "GA",
  15: "HI",
  16: "ID",
  17: "IL",
  18: "IN",
  19: "IA",
  20: "KS",
  21: "KY",
  22: "LA",
  23: "ME",
  24: "MD",
  25: "MA",
  26: "MI",
  27: "MN",
  28: "MS",
  29: "MO",
  30: "MT",
  31: "NE",
  32: "NV",
  33: "NH",
  34: "NJ",
  35: "NM",
  36: "NY",
  37: "NC",
  38: "ND",
  39: "OH",
  40: "OK",
  41: "OR",
  42: "PA",
  44: "RI",
  45: "SC",
  46: "SD",
  47: "TN",
  48: "TX",
  49: "UT",
  50: "VT",
  51: "VA",
  53: "WA",
  54: "WV",
  55: "WI",
  56: "WY",
  72: "PR",
};

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function fetchRaw() {
  await mkdir(raw, { recursive: true });
  for (const [name, url] of Object.entries(SOURCES)) {
    const path = join(raw, name);
    if (await exists(path)) continue;
    console.log("download", url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    await writeFile(path, Buffer.from(await res.arrayBuffer()));
  }
}

const readJson = async (name) => JSON.parse(await readFile(join(raw, name), "utf8"));

function writeTopo(name, topo) {
  const text = JSON.stringify(topo);
  console.log(name.padEnd(24), (text.length / 1024).toFixed(0).padStart(6), "KB");
  return writeFile(join(out, name), text);
}

function clean(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text && text !== "-99" ? text : "";
}

function neNames(p, prefix) {
  const get = (key) => clean(p[prefix === "NAME_" ? `NAME_${key}` : `name_${key.toLowerCase()}`]);
  const en = get("EN") || clean(p.NAME ?? p.name);
  return NE_NAME_KEYS.map((key) => get(key) || en);
}

function altNames(p, keys, known) {
  const seen = new Set(known);
  const alt = [];
  for (const key of keys) {
    for (const part of String(p[key] ?? "").split("|")) {
      const name = clean(part);
      if (name && !seen.has(name)) {
        seen.add(name);
        alt.push(name);
      }
    }
  }
  return alt;
}

function toTopology(name, features, { simplifyQuantile, quantization }) {
  let topo = topology({ [name]: { type: "FeatureCollection", features } }, quantization);
  if (simplifyQuantile) {
    topo = presimplify(topo);
    topo = simplify(topo, quantile(topo, simplifyQuantile));
    for (const arc of topo.arcs) for (const point of arc) point.length = 2;
  }
  return topo;
}

/**
 * Natural Earth fills the "_EH" fields of dependencies with their parent's
 * code, so two features can claim one code. A code goes to the feature that
 * holds it in the plain field; the "_EH" value is used only when nobody
 * holds it (France, Norway), otherwise the feature keeps its own ADM0 code.
 */
function codePicker(features, plain, enhanced) {
  const claimed = new Set(features.map((f) => clean(f.properties[plain])).filter(Boolean));
  return (p) => clean(p[plain]) || (!claimed.has(clean(p[enhanced])) ? clean(p[enhanced]) : "");
}

// Natural Earth names Taiwan by its official name in some languages. A map labels it with the place name, as the English label does.
const TAIWAN_NAMES = [
  "Taiwan",
  "\u53f0\u7063",
  "\u53f0\u6e7e",
  "\u53f0\u6e7e",
  "\ub300\ub9cc",
  "Taiw\u00e1n",
  "Ta\u00efwan",
  "Taiwan",
  "Taiwan",
];

async function buildWorld(resolution) {
  const fc = await readJson(`ne_${resolution}_admin_0_countries.geojson`);
  const iso3 = codePicker(fc.features, "ISO_A3", "ISO_A3_EH");
  const iso2 = codePicker(fc.features, "ISO_A2", "ISO_A2_EH");
  const isoNum = codePicker(fc.features, "ISO_N3", "ISO_N3_EH");
  const features = fc.features.map((f) => {
    const p = f.properties;
    const official = neNames(p, "NAME_");
    const nm = p.ADM0_A3 === "TWN" ? TAIWAN_NAMES : official;
    return {
      type: "Feature",
      geometry: f.geometry,
      properties: {
        id: p.ADM0_A3 === "KOS" ? "XKX" : iso3(p) || clean(p.ADM0_A3),
        a2: p.ADM0_A3 === "KOS" ? "XK" : iso2(p),
        n3: isoNum(p),
        nm,
        alt: [
          ...altNames(
            p,
            ["NAME", "NAME_LONG", "FORMAL_EN", "BRK_NAME", "NAME_SORT", "NAME_ALT", "NAME_CIAWF", "ABBREV"],
            nm,
          ),
          ...(nm === official ? [] : official.filter((name) => !nm.includes(name))),
        ],
        pop: p.POP_EST,
        py: p.POP_YEAR,
        c: p.CONTINENT,
        t: p.TYPE,
      },
    };
  });
  await writeTopo(`world-${resolution}.json`, toTopology("countries", features, { quantization: 1e5 }));
}

async function buildAdmin1(country, outName, objectName, idOf) {
  const fc = await readJson("ne_10m_admin_1_states_provinces.geojson");
  const features = fc.features
    .filter((f) => f.properties.iso_a2 === country)
    .map((f) => {
      const p = f.properties;
      const nm = neNames(p, "name_");
      nm[0] = clean(p.name_en) || clean(p.name);
      return {
        type: "Feature",
        geometry: f.geometry,
        properties: {
          id: idOf(p),
          nm,
          alt: altNames(p, ["name", "name_local", "name_alt", "woe_name"], nm),
        },
      };
    });
  await writeTopo(outName, toTopology(objectName, features, { quantization: 1e5, simplifyQuantile: 0.35 }));
  return features.length;
}

// The Census file has no quoted fields.
function parseCsv(text) {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const cols = head.split(",");
  return lines.map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(cols.map((c, i) => [c, cells[i]]));
  });
}

async function buildUs() {
  const census = parseCsv(await readFile(join(raw, "co-est2023-alldata.csv"), "latin1"));
  const countyPop = new Map();
  const statePop = new Map();
  for (const row of census) {
    const pop = Number(row.POPESTIMATE2023);
    if (row.SUMLEV === "040") statePop.set(row.STATE, pop);
    if (row.SUMLEV === "050") countyPop.set(row.STATE + row.COUNTY, pop);
  }
  for (const [file, object, outName, pops, keep] of [
    ["us-states-10m.json", "states", "us-states.json", statePop, ["states"]],
    ["us-counties-10m.json", "counties", "us-counties.json", countyPop, ["counties", "states"]],
  ]) {
    const topo = await readJson(file);
    for (const name of Object.keys(topo.objects)) if (!keep.includes(name)) delete topo.objects[name];
    for (const g of topo.objects[object].geometries) {
      const fips = String(g.id);
      const state = fips.slice(0, 2);
      const props = { id: fips, nm: [g.properties.name] };
      if (object === "states") props.postal = US_POSTAL[state] ?? "";
      if (pops.has(fips)) props.pop = pops.get(fips);
      g.properties = props;
      delete g.id;
    }
    await writeTopo(outName, topo);
  }
}

// ISO 3166-2 codes, as used by Natural Earth, for the MOI county codes.
const TW_ISO = {
  "09007": "TW-LIE",
  "09020": "TW-KIN",
  10002: "TW-ILA",
  10004: "TW-HSQ",
  10005: "TW-MIA",
  10007: "TW-CHA",
  10008: "TW-NAN",
  10009: "TW-YUN",
  10010: "TW-CYQ",
  10013: "TW-PIF",
  10014: "TW-TTT",
  10015: "TW-HUA",
  10016: "TW-PEN",
  10017: "TW-KEE",
  10018: "TW-HSZ",
  10020: "TW-CYI",
  63000: "TW-TPE",
  64000: "TW-KHH",
  65000: "TW-TPQ",
  66000: "TW-TXG",
  67000: "TW-TNN",
  68000: "TW-TAO",
};
// Natural Earth has no record for Lienchiang County (Matsu).
const TW_EXTRA = { "TW-LIE": { zh: "连江县", ja: "連江県", ko: "롄장현" } };

async function buildTaiwan() {
  const counties = await readJson("tw-counties-10t.json");
  const towns = await readJson("tw-towns-10t.json");
  const admin1 = await readJson("ne_10m_admin_1_states_provinces.geojson");
  const ne = new Map(
    admin1.features.filter((f) => f.properties.iso_a2 === "TW").map((f) => [f.properties.iso_3166_2, f.properties]),
  );
  counties.objects = { counties: counties.objects.counties };
  towns.objects = { towns: towns.objects.towns };
  for (const g of counties.objects.counties.geometries) {
    const p = g.properties;
    const iso = TW_ISO[p.COUNTYCODE];
    const n = ne.get(iso) ?? {};
    const x = TW_EXTRA[iso] ?? {};
    const en = p.COUNTYENG;
    // Romanised names read the same in Spanish, French, German and Portuguese.
    const nm = [
      en,
      p.COUNTYNAME,
      clean(n.name_zh) || x.zh,
      clean(n.name_ja) || x.ja,
      clean(n.name_ko) || x.ko,
      en,
      en,
      en,
      en,
    ];
    g.properties = {
      id: p.COUNTYCODE,
      nm,
      alt: [p.COUNTYNAME.replace("臺", "台"), p.COUNTYNAME.replace("台", "臺")],
      iso,
    };
  }
  for (const g of towns.objects.towns.geometries) {
    const p = g.properties;
    g.properties = {
      id: p.TOWNCODE,
      nm: [p.TOWNENG, p.TOWNNAME],
      county: p.COUNTYCODE,
      countyName: p.COUNTYNAME,
      countyEng: p.COUNTYENG,
    };
  }
  await writeTopo("tw-counties.json", counties);
  await writeTopo("tw-towns.json", towns);
}

await mkdir(out, { recursive: true });
await fetchRaw();
await buildWorld("110m");
await buildWorld("50m");
console.log("japan", await buildAdmin1("JP", "jp-prefectures.json", "prefectures", (p) => p.iso_3166_2));
console.log("korea", await buildAdmin1("KR", "kr-provinces.json", "provinces", (p) => p.iso_3166_2));
await buildUs();
await buildTaiwan();
