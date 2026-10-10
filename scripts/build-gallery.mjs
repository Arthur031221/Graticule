// Fetches the public data behind every gallery map, writes gallery/<id>/ (spec,
// data, check log) and renders docs/gallery/<id>.png.
//
//   node scripts/build-gallery.mjs [--offline] [id ...]
//
// With --offline the committed data.csv files are used and nothing is downloaded.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMap } from "../src/build.js";
import { parseTable } from "../src/csv.js";
import { exportMap } from "../src/export.js";
import { loadAreas } from "../src/geo.js";
import { normalizeLang } from "../src/lang.js";
import { nodeAssets } from "../src/node-assets.js";
import { summarize } from "../src/report.js";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const assets = nodeAssets();
const args = process.argv.slice(2);
const offline = args.includes("--offline");
const only = args.filter((a) => !a.startsWith("--"));
const RETRIEVED = "2026-10-10";

const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const toCsv = (columns, rows) =>
  [columns.join(","), ...rows.map((r) => columns.map((c) => csvCell(r[c] ?? "")).join(","))].join("\n") + "\n";

async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!res.ok) throw new Error(`${res.status}`);
      return await res.json();
    } catch (error) {
      if (attempt === 4) throw new Error(`${url}: ${error.message}`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

let countryMeta;
async function worldBankCountries() {
  countryMeta ??= (await getJson("https://api.worldbank.org/v2/country?format=json&per_page=400"))[1].filter(
    (c) => c.region.value !== "Aggregates",
  );
  return countryMeta;
}

/** One indicator, one year: rows of { country, iso3, value }. */
async function worldBank(indicator, date) {
  const countries = new Map((await worldBankCountries()).map((c) => [c.id, c.name]));
  const data = (
    await getJson(
      `https://api.worldbank.org/v2/country/all/indicator/${indicator}?format=json&date=${date}&per_page=1000`,
    )
  )[1];
  return data
    .filter((r) => countries.has(r.countryiso3code) && r.value !== null)
    .map((r) => ({ country: countries.get(r.countryiso3code), iso3: r.countryiso3code, value: r.value }));
}

const round = (v, digits) => Math.round(v * 10 ** digits) / 10 ** digits;
const wbSource = (code, year) => `World Bank, World Development Indicators, ${code}, ${year}`;
const note = `Data retrieved ${RETRIEVED}.`;

/** Gallery entries. `data()` returns { columns, rows }; `spec` is the finished map. */
const GALLERY = [
  {
    id: "life-expectancy",
    prompt: "Map life expectancy by country.",
    data: async () => ({
      columns: ["country", "iso3", "life_expectancy"],
      rows: (await worldBank("SP.DYN.LE00.IN", 2019)).map((r) => ({ ...r, life_expectancy: round(r.value, 1) })),
    }),
    spec: {
      title: "Life expectancy at birth, 2019",
      subtitle: "Years, by country",
      source: wbSource("SP.DYN.LE00.IN", 2019),
      note,
      region: "world",
      data: { file: "data.csv", key: "iso3", value: "life_expectancy", kind: "rate", label: "Years" },
      classes: { method: "quantile", count: 5 },
      palette: "ylgnbu",
    },
  },
  {
    id: "covid-deaths",
    prompt: "Map COVID deaths by country from deaths.csv.",
    // The map an unguarded script would draw: raw counts, Mercator, nine classes, a rainbow.
    rawSpec: {
      title: "COVID-19 deaths",
      subtitle: "Cumulative deaths reported to WHO",
      source: "WHO COVID-19 dashboard, cumulative deaths up to 2026-09-20",
      region: "world",
      projection: "mercator",
      data: { file: "data.csv", key: "country", value: "deaths", kind: "count", label: "Deaths" },
      classes: { method: "jenks", count: 9 },
      palette: ["#00007f", "#0000ff", "#007fff", "#00ffff", "#7fff7f", "#ffff00", "#ff7f00", "#ff0000", "#7f0000"],
    },
    data: async () => {
      const text = await (
        await fetch("https://srhdpeuwpubsa.blob.core.windows.net/whdh/COVID/WHO-COVID-19-global-data.csv")
      ).text();
      const last = new Map();
      for (const row of parseTable(text).rows) if (row.Cumulative_deaths !== "") last.set(row.Country_code, row);
      return {
        columns: ["country", "code", "deaths"],
        rows: [...last.values()].map((r) => ({
          country: r.Country,
          code: r.Country_code,
          deaths: r.Cumulative_deaths,
        })),
      };
    },
    spec: {
      title: "COVID-19 deaths per 100,000 people",
      subtitle: "Cumulative deaths reported to WHO, by country",
      source: "WHO COVID-19 dashboard, cumulative deaths up to 2026-09-20. Population: Natural Earth",
      note,
      region: "world",
      data: {
        file: "data.csv",
        key: "country",
        value: "deaths",
        kind: "count",
        normalize: { by: "population", per: 100000 },
        label: "Deaths",
      },
      classes: { method: "jenks", count: 5 },
      palette: "reds",
    },
  },
  {
    id: "co2-per-capita",
    prompt: "Show CO2 emissions per person for every country.",
    data: async () => ({
      columns: ["country", "iso3", "tonnes_per_person"],
      rows: (await worldBank("EN.GHG.CO2.PC.CE.AR5", 2020)).map((r) => ({
        ...r,
        tonnes_per_person: round(r.value, 2),
      })),
    }),
    spec: {
      title: "Carbon dioxide emissions per person, 2020",
      subtitle: "Tonnes of CO2 per person, excluding land use",
      source: wbSource("EN.GHG.CO2.PC.CE.AR5", 2020),
      note,
      region: "world",
      data: { file: "data.csv", key: "iso3", value: "tonnes_per_person", kind: "rate", label: "Tonnes per person" },
      classes: { method: "jenks", count: 6 },
      palette: "ylorrd",
    },
  },
  {
    id: "internet-users",
    prompt: "Which countries have the most people online? Use a map.",
    data: async () => ({
      columns: ["country", "iso3", "percent_online"],
      rows: (await worldBank("IT.NET.USER.ZS", 2022)).map((r) => ({ ...r, percent_online: round(r.value, 1) })),
    }),
    spec: {
      title: "People using the internet, 2022",
      subtitle: "Percent of the population",
      source: wbSource("IT.NET.USER.ZS", 2022),
      note,
      region: "world",
      data: { file: "data.csv", key: "iso3", value: "percent_online", kind: "share", label: "Percent" },
      classes: { method: "quantile", count: 5 },
      palette: "purples",
    },
  },
  {
    id: "population-symbols",
    prompt: "Draw the population of every country as circles on a map.",
    data: async () => ({
      columns: ["country", "iso3", "population"],
      rows: (await worldBank("SP.POP.TOTL", 2022)).map((r) => ({ ...r, population: r.value })),
    }),
    spec: {
      title: "Population, 2022",
      subtitle: "Circle area is proportional to the number of people",
      source: wbSource("SP.POP.TOTL", 2022),
      note,
      region: "world",
      type: "symbols",
      data: { file: "data.csv", key: "iso3", value: "population", kind: "count", label: "People" },
    },
  },
  {
    id: "income-groups",
    prompt: "Color countries by World Bank income group.",
    data: async () => ({
      columns: ["country", "iso3", "income_group"],
      rows: (await worldBankCountries())
        .filter((c) => c.incomeLevel.id !== "INX")
        .map((c) => ({ country: c.name, iso3: c.id, income_group: c.incomeLevel.value })),
    }),
    spec: {
      title: "World Bank income groups",
      subtitle: "Classification of economies, fiscal year 2026",
      source: "World Bank country classifications",
      note,
      region: "world",
      type: "categorical",
      data: { file: "data.csv", key: "iso3", value: "income_group", label: "Income group" },
      legend: { order: ["High income", "Upper middle income", "Lower middle income", "Low income"] },
      palette: "okabe-ito",
      labels: "none",
    },
  },
  {
    id: "fertility-small-multiples",
    prompt: "Compare fertility rates by country in 1990, 2000, 2010 and 2022 side by side.",
    data: async () => {
      const years = [1990, 2000, 2010, 2022];
      const tables = await Promise.all(
        years.map(async (y) => new Map((await worldBank("SP.DYN.TFRT.IN", y)).map((r) => [r.iso3, r]))),
      );
      const isos = new Set(tables.flatMap((t) => [...t.keys()]));
      const cell = (t, iso) => (t.has(iso) ? round(t.get(iso).value, 2) : "");
      return {
        columns: ["country", "iso3", ...years.map((y) => `y${y}`)],
        rows: [...isos].map((iso) => ({
          country: tables.map((t) => t.get(iso)?.country).find(Boolean),
          iso3: iso,
          ...Object.fromEntries(years.map((y, i) => [`y${y}`, cell(tables[i], iso)])),
        })),
      };
    },
    spec: {
      title: "Births per woman",
      subtitle: "Total fertility rate, by country",
      source: wbSource("SP.DYN.TFRT.IN", "1990, 2000, 2010 and 2022"),
      note,
      region: "world",
      type: "small-multiples",
      columns: 2,
      data: {
        file: "data.csv",
        key: "iso3",
        value: ["y1990", "y2000", "y2010", "y2022"],
        kind: "rate",
        label: "Births per woman",
      },
      panels: [{ title: "1990" }, { title: "2000" }, { title: "2010" }, { title: "2022" }],
      classes: { method: "manual", breaks: [0.5, 1.5, 2.1, 3, 4.5, 6, 9] },
      palette: "oranges",
      labels: "none",
    },
  },
  {
    id: "europe-gdp-per-capita",
    prompt: "Map GDP per person in Europe.",
    data: async () => ({
      columns: ["country", "iso3", "gdp_per_person"],
      rows: (await worldBank("NY.GDP.PCAP.PP.CD", 2022)).map((r) => ({ ...r, gdp_per_person: Math.round(r.value) })),
    }),
    spec: {
      title: "GDP per person in Europe, 2022",
      subtitle: "Current international dollars, purchasing power parity",
      source: wbSource("NY.GDP.PCAP.PP.CD", 2022),
      note,
      region: "europe",
      data: { file: "data.csv", key: "iso3", value: "gdp_per_person", kind: "rate", label: "International dollars" },
      classes: { method: "jenks", count: 6 },
      palette: "blues",
    },
  },
  {
    id: "africa-internet-users",
    prompt: "Show internet use across Africa, labels in French.",
    data: async () => ({
      columns: ["country", "iso3", "percent_online"],
      rows: (await worldBank("IT.NET.USER.ZS", 2022)).map((r) => ({ ...r, percent_online: round(r.value, 1) })),
    }),
    spec: {
      title: "Utilisateurs d'internet, 2022",
      subtitle: "Part de la population, en pourcentage",
      source: wbSource("IT.NET.USER.ZS", 2022),
      note,
      region: "africa",
      language: "fr",
      data: { file: "data.csv", key: "iso3", value: "percent_online", kind: "share", label: "Pourcentage" },
      classes: { method: "quantile", count: 5 },
      palette: "greens",
    },
  },
  {
    id: "south-america-life-expectancy",
    prompt: "Esperanza de vida en Sudamerica, con nombres en espanol.",
    promptEn: "Life expectancy in South America, with names in Spanish.",
    data: async () => ({
      columns: ["country", "iso3", "life_expectancy"],
      rows: (await worldBank("SP.DYN.LE00.IN", 2019)).map((r) => ({ ...r, life_expectancy: round(r.value, 1) })),
    }),
    spec: {
      title: "Esperanza de vida al nacer, 2019",
      subtitle: "Anos",
      source: wbSource("SP.DYN.LE00.IN", 2019),
      note,
      region: "south-america",
      language: "es",
      data: { file: "data.csv", key: "iso3", value: "life_expectancy", kind: "rate", label: "Anos" },
      classes: { method: "quantile", count: 5 },
      palette: "viridis",
    },
  },
  {
    id: "us-state-density",
    prompt: "Map population density by US state.",
    data: async () => {
      const text = await (
        await fetch(
          "https://www2.census.gov/programs-surveys/popest/datasets/2020-2023/state/totals/NST-EST2023-ALLDATA.csv",
        )
      ).text();
      const rows = parseTable(text)
        .rows.filter((r) => r.SUMLEV === "040")
        .map((r) => ({ state: r.NAME, fips: r.STATE, population: r.POPESTIMATE2023 }));
      return { columns: ["state", "fips", "population"], rows };
    },
    spec: {
      title: "Population density by state, 2023",
      subtitle: "People per square kilometer",
      source:
        "US Census Bureau, Vintage 2023 population estimates (July 1, 2023). Area computed from Census boundaries",
      note,
      region: "us-states",
      data: {
        file: "data.csv",
        key: "fips",
        value: "population",
        kind: "count",
        normalize: { by: "area", per: 1 },
        label: "People",
      },
      classes: { method: "jenks", count: 6 },
      palette: "ylorrd",
    },
  },
  {
    id: "us-county-unemployment",
    prompt: "Show unemployment by county for the whole US.",
    data: async () => {
      const text = await (
        await fetch("https://raw.githubusercontent.com/plotly/datasets/master/fips-unemp-16.csv")
      ).text();
      return {
        columns: ["fips", "unemployment_rate"],
        rows: parseTable(text).rows.map((r) => ({ fips: r.fips, unemployment_rate: r.unemp })),
      };
    },
    spec: {
      title: "Unemployment rate by county, 2016",
      subtitle: "Percent of the labor force",
      source:
        "US Bureau of Labor Statistics, Local Area Unemployment Statistics, 2016 annual average (via plotly/datasets)",
      note,
      region: "us-counties",
      data: { file: "data.csv", key: "fips", value: "unemployment_rate", kind: "rate", label: "Percent" },
      classes: { method: "jenks", count: 6 },
      palette: "ylorrd",
    },
  },
  {
    id: "taiwan-township-area",
    prompt: "把台灣每個鄉鎮市區的面積畫成地圖，用繁體中文。",
    promptEn: "Map the area of every Taiwan township and district, in Traditional Chinese.",
    data: async () => {
      const { areas } = await loadAreas("tw-towns", assets);
      return {
        columns: ["code", "name", "area_km2"],
        rows: areas.map((a) => ({
          code: a.id,
          name: `${a.props.countyName}${a.names[1]}`,
          area_km2: round(a.areaKm2, 1),
        })),
      };
    },
    spec: {
      title: "台灣各鄉鎮市區的面積",
      subtitle: "平方公里",
      source: "內政部國土測繪中心鄉鎮市區界線，面積由邊界計算（球面近似）",
      note: `資料產生於 ${RETRIEVED}。`,
      region: "tw-towns",
      language: "zh-TW",
      data: { file: "data.csv", key: "code", value: "area_km2", kind: "other", label: "平方公里" },
      classes: { method: "jenks", count: 6 },
      palette: "viridis",
      labels: "none",
    },
  },
  {
    id: "taiwan-locator",
    prompt: "Show where Taiwan is, in Traditional Chinese.",
    data: async () => ({ columns: ["name"], rows: [{ name: "台灣" }] }),
    spec: {
      title: "台灣在哪裡",
      subtitle: "位於東亞，介於日本與菲律賓之間",
      source: "Natural Earth",
      note,
      region: "asia",
      type: "locator",
      language: "zh-TW",
      highlight: ["TWN"],
      data: {},
    },
  },
  {
    id: "japan-regions",
    prompt: "日本の都道府県を地方ごとに色分けして。",
    promptEn: "Color the Japanese prefectures by region.",
    data: async () => {
      const groups = {
        北海道: ["北海道"],
        東北: ["青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"],
        関東: ["茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県"],
        中部: ["新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県"],
        近畿: ["三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"],
        中国: ["鳥取県", "島根県", "岡山県", "広島県", "山口県"],
        四国: ["徳島県", "香川県", "愛媛県", "高知県"],
        九州沖縄: ["福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"],
      };
      return {
        columns: ["prefecture", "region"],
        rows: Object.entries(groups).flatMap(([region, list]) => list.map((prefecture) => ({ prefecture, region }))),
      };
    },
    spec: {
      title: "日本の地方区分",
      subtitle: "47都道府県を8地方に分けたもの",
      source: "一般的な地方区分。境界はNatural Earth",
      note: `作成日 ${RETRIEVED}。`,
      region: "jp-prefectures",
      language: "ja",
      type: "categorical",
      data: { file: "data.csv", key: "prefecture", value: "region", label: "地方" },
      palette: "okabe-ito",
    },
  },
  {
    id: "korea-capital-region",
    prompt: "대한민국 시도를 수도권, 광역시, 도로 나누어 색칠해 줘.",
    promptEn: "Color the South Korean provinces as capital region, metropolitan cities and provinces.",
    data: async () => {
      const groups = {
        수도권: ["서울특별시", "인천광역시", "경기도"],
        광역시: ["부산광역시", "대구광역시", "광주광역시", "대전광역시", "울산광역시", "세종특별자치시"],
        도: ["강원도", "충청북도", "충청남도", "전라북도", "전라남도", "경상북도", "경상남도", "제주특별자치도"],
      };
      return {
        columns: ["province", "group"],
        rows: Object.entries(groups).flatMap(([group, list]) => list.map((province) => ({ province, group }))),
      };
    },
    spec: {
      title: "수도권, 광역시, 도",
      subtitle: "대한민국 17개 시도",
      source: "일반적인 행정 구분. 경계는 Natural Earth",
      note: `작성일 ${RETRIEVED}.`,
      region: "kr-provinces",
      language: "ko",
      type: "categorical",
      data: { file: "data.csv", key: "province", value: "group", label: "구분" },
      palette: "tol-bright",
    },
  },
];

await mkdir(join(root, "docs/gallery"), { recursive: true });
const index = [];
for (const entry of GALLERY) {
  if (only.length && !only.includes(entry.id)) continue;
  const dir = join(root, "gallery", entry.id);
  await mkdir(dir, { recursive: true });
  const csvPath = join(dir, "data.csv");
  if (!offline || !existsSync(csvPath)) {
    const { columns, rows } = await entry.data();
    await writeFile(csvPath, toCsv(columns, rows));
  }
  await writeFile(join(dir, "spec.json"), JSON.stringify(entry.spec, null, 2) + "\n");
  if (entry.rawSpec) await writeFile(join(dir, "spec.raw.json"), JSON.stringify(entry.rawSpec, null, 2) + "\n");
  const readText = (p) => readFile(join(dir, p), "utf8");
  const result = await buildMap(entry.spec, { assets, readText });
  const summary = summarize(result);
  if (result.blocked)
    throw new Error(
      `${entry.id} is blocked by the checker: ${result.findings
        .filter((f) => f.level === "error")
        .map((f) => f.message)
        .join(" ")}`,
    );
  const out = await exportMap(result, ["png"], { assets });
  await writeFile(join(root, "docs/gallery", `${entry.id}.png`), out.png);
  await writeFile(join(dir, "check.json"), JSON.stringify(summary, null, 2) + "\n");
  index.push({
    id: entry.id,
    title: entry.spec.title,
    prompt: entry.prompt,
    promptEn: entry.promptEn ?? entry.prompt,
    region: entry.spec.region,
    type: entry.spec.type ?? "choropleth",
    language: entry.spec.language ?? "en",
    findings: result.findings.filter((f) => f.level !== "info").map((f) => f.id),
  });
  console.log(
    entry.id.padEnd(30),
    `${result.scene.width}x${result.scene.height}`,
    result.findings
      .filter((f) => f.level !== "info")
      .map((f) => `${f.level}:${f.id}`)
      .join(" "),
  );
}
if (!only.length) {
  await writeFile(join(root, "gallery/index.json"), JSON.stringify(index, null, 2) + "\n");
  await writeFile(join(root, "docs/gallery.md"), galleryPage(index));
}

/** docs/gallery.md. Prompts in other languages are shown in English here, the original is in gallery/index.json. */
function galleryPage(entries) {
  const names = {
    en: "English",
    "zh-Hant": "Traditional Chinese",
    "zh-Hans": "Simplified Chinese",
    ja: "Japanese",
    ko: "Korean",
    es: "Spanish",
    fr: "French",
    de: "German",
    pt: "Portuguese",
  };
  const blocks = entries.map((e) => {
    const language = names[normalizeLang(e.language)];
    const asked = e.promptEn === e.prompt ? "" : ` (asked in ${language})`;
    const labels = normalizeLang(e.language) === "en" ? "" : ` Labels in ${language}.`;
    const findings = e.findings.length
      ? `Checker notes: ${e.findings.join(", ")}.`
      : "The checker found nothing to report.";
    return `## ${e.title.match(/^[\x00-\x7f]*$/) ? e.title : e.id}

![${e.id}](gallery/${e.id}.png)

Prompt${asked}: "${e.promptEn}"

Region \`${e.region}\`, type \`${e.type}\`.${labels} ${findings} [Spec](../gallery/${e.id}/spec.json), [data](../gallery/${e.id}/data.csv), [check log](../gallery/${e.id}/check.json).`;
  });
  return `# Gallery

${entries.length} maps built from public data. Each one is a spec and a table in \`gallery/<name>\`, so \`graticule render gallery/<name>/spec.json\` redraws it. The check log is the report the checker wrote. \`npm run gallery\` fetches the data again and rebuilds everything.

${blocks.join("\n\n")}
`;
}
