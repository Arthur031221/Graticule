// How well does "values rank like population" separate counts from rates?
// Pulls World Bank indicators (most recent value per country), computes the
// Spearman correlation with the population of each country and reports how
// many fall on the wrong side of the threshold Graticule uses.
//
//   node verify/raw-counts.mjs [--write docs/verification-counts.md]
import { writeFileSync } from "node:fs";
import { THRESHOLDS } from "../src/checks.js";
import { spearman } from "../src/classify.js";
import { loadAreas } from "../src/geo.js";
import { nodeAssets } from "../src/node-assets.js";

const assets = nodeAssets();
const { areas } = await loadAreas("world", assets);
const population = new Map(areas.filter((a) => a.pop).map((a) => [a.id, a.pop]));
const meta = (await (await fetch("https://api.worldbank.org/v2/country?format=json&per_page=400")).json())[1].filter(
  (c) => c.region.value !== "Aggregates",
);
const real = new Set(meta.map((c) => c.id));

const RATES = {
  "SP.DYN.LE00.IN": "Life expectancy",
  "SP.DYN.TFRT.IN": "Fertility rate",
  "IT.NET.USER.ZS": "Internet users, % of population",
  "EN.GHG.CO2.PC.CE.AR5": "CO2 per person",
  "NY.GDP.PCAP.CD": "GDP per person",
  "SH.DYN.MORT": "Under-5 mortality rate",
  "SL.UEM.TOTL.ZS": "Unemployment, % of labor force",
  "SP.URB.TOTL.IN.ZS": "Urban share of population",
  "EG.ELC.ACCS.ZS": "Access to electricity, %",
  "SP.POP.GROW": "Population growth, %",
  "NY.GDP.MKTP.KD.ZG": "GDP growth, %",
  "FP.CPI.TOTL.ZG": "Inflation, %",
  "SH.XPD.CHEX.GD.ZS": "Health spending, % of GDP",
  "SP.DYN.CBRT.IN": "Birth rate",
  "SP.DYN.CDRT.IN": "Death rate",
  "AG.LND.FRST.ZS": "Forest area, % of land",
  "SH.MED.PHYS.ZS": "Physicians per 1,000 people",
  "SP.POP.65UP.TO.ZS": "Population 65 and over, %",
  "NE.EXP.GNFS.ZS": "Exports, % of GDP",
  "SE.XPD.TOTL.GD.ZS": "Education spending, % of GDP",
  "EG.USE.PCAP.KG.OE": "Energy use per person",
  "SH.STA.SUIC.P5": "Suicide mortality rate",
  "SI.POV.DDAY": "Poverty headcount ratio, %",
  "SP.DYN.IMRT.IN": "Infant mortality rate",
  "SH.TBS.INCD": "Tuberculosis incidence per 100,000 people",
};
const COUNTS = {
  "SP.POP.TOTL": "Population",
  "NY.GDP.MKTP.CD": "GDP, current US$",
  "EN.GHG.CO2.MT.CE.AR5": "CO2 emissions, total",
  "SP.POP.TOTL.MA.IN": "Male population",
  "SP.RUR.TOTL": "Rural population",
  "SM.POP.TOTL": "International migrant stock",
  "SE.PRM.ENRL": "Primary school pupils",
  "SP.POP.0014.TO": "Population aged 0 to 14",
};

async function rho(code) {
  const url = `https://api.worldbank.org/v2/country/all/indicator/${code}?format=json&mrnev=1&per_page=1000`;
  const rows = (await (await fetch(url, { signal: AbortSignal.timeout(60000) })).json())[1] ?? [];
  const pairs = rows.filter(
    (r) => real.has(r.countryiso3code) && r.value !== null && population.has(r.countryiso3code),
  );
  if (pairs.length < 30) return null;
  return {
    rho: spearman(
      pairs.map((r) => r.value),
      pairs.map((r) => population.get(r.countryiso3code)),
    ),
    n: pairs.length,
  };
}

const out = [];
for (const [group, table] of [
  ["rate", RATES],
  ["count", COUNTS],
]) {
  for (const [code, label] of Object.entries(table)) {
    if (!label) continue;
    const r = await rho(code).catch(() => null);
    if (r) out.push({ group, code, label, ...r });
  }
}
const limit = THRESHOLDS.populationCorrelation;
const flagged = (r) => r.rho >= limit;
const rates = out.filter((r) => r.group === "rate");
const counts = out.filter((r) => r.group === "count");
const summary = `Threshold ${limit}. Rates flagged as counts: ${rates.filter(flagged).length} of ${rates.length}. Counts caught: ${counts.filter(flagged).length} of ${counts.length}.`;
console.log(summary);
for (const r of out)
  console.log(
    `${r.group.padEnd(6)}${r.code.padEnd(24)}${r.label.padEnd(40)}n=${String(r.n).padEnd(4)}rho=${r.rho.toFixed(2)}${(r.group === "rate") === flagged(r) ? "  <-- wrong side" : ""}`,
  );
// A run that could not fetch an indicator, or that put one on the wrong side, has not verified the claim.
const expected = [...Object.values(RATES), ...Object.values(COUNTS)].filter(Boolean).length;
const wrong = out.filter((r) => (r.group === "rate") === flagged(r));
if (out.length !== expected || wrong.length) {
  console.error(`FAILED: ${out.length} of ${expected} indicators measured, ${wrong.length} on the wrong side.`);
  process.exitCode = 1;
}
if (process.argv.includes("--write") && !process.exitCode) {
  const rows = out
    .map((r) => `| ${r.group} | ${r.label} (${r.code}) | ${r.n} | ${r.rho.toFixed(2)} | ${flagged(r) ? "yes" : "no"} |`)
    .join("\n");
  writeFileSync(
    process.argv[process.argv.indexOf("--write") + 1],
    `${summary}\n\n| Kind | Indicator | Countries | Spearman with population | Flagged as raw counts |\n| --- | --- | --- | --- | --- |\n${rows}\n`,
  );
}
