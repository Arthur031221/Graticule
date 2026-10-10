// Generates the pages that must match the code (docs/rules.md and
// docs/regions.md) and copies the reference pages into the skill. Run by
// `npm run build`, and CI fails when the output differs from what is committed.
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { RULES, THRESHOLDS } from "../src/checks.js";
import { PROJECTIONS } from "../src/projections.js";
import { REGIONS } from "../src/regions.js";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const docs = join(root, "docs");
const refs = join(root, "skills/graticule/references");
const en = JSON.parse(await readFile(join(root, "skills/graticule/locales/en.json"), "utf8"));

const rules = Object.entries(RULES)
  .map(([id, rule]) => `| \`${id}\` | ${rule.level} | ${rule.fires} | ${en.rules[id].reason} |`)
  .join("\n");

await writeFile(
  join(docs, "rules.md"),
  `# Rules

Generated from the code by scripts/build-docs.mjs. Every finding in a report has one of these ids, a level (error, warn or info) and a reason.

An error stops the map from being drawn. \`--fix\` repairs the errors marked fixable below. \`--allow <id>\` (or \`"checks": { "allow": ["<id>"] }\`) accepts a rule: the finding stays in the report at level info, marked as allowed.

| Rule | Level | Fires when | Why it exists |
| --- | --- | --- | --- |
${rules}

Thresholds: neighbouring classes must differ by CIEDE2000 ${THRESHOLDS.sequentialError} or more under normal vision and under simulated protanopia, deuteranopia and tritanopia (Machado, Oliveira and Fernandes 2009, severity 1.0), with a warning below ${THRESHOLDS.sequentialWarn}. Sequential palettes must change lightness (CIE L*) by at least ${THRESHOLDS.lightnessStep} between neighbours, in one direction. At most ${THRESHOLDS.maxClasses} classes and ${THRESHOLDS.maxCategories} categories.

## What \`--fix\` does

| Rule | Change |
| --- | --- |
| \`raw-counts\` | Adds \`normalize\` by population (per 1,000, 100,000 or 1,000,000, whichever puts the typical value at 1 or more) and sets \`kind\` to rate. Only for regions with bundled population. |
| \`projection-mercator\` | Sets \`projection\` to auto. |
| \`max-classes\` | Sets \`classes.count\` to 7. Not for manual breaks. |
| \`class-breaks-coverage\` | Adds a class below or above the manual breaks so every value is covered. |
| \`skewed-classes\` | Switches to quantile classes. |
| \`palette-order\` | Removes the custom palette, which restores the default. |
| \`cvd-separation\` | Same, when the finding is an error. |
| \`diverging-center\` | Sets \`center\` to 0 when the data has both signs. |

Every change is listed in the report as a \`fix-applied\` finding and the spec that was used is written to \`<name>.spec.json\`.

## Other messages

| Id | Level | Meaning |
| --- | --- | --- |
| \`spec\` | error | A field is missing or has the wrong shape. The message names the path. |
| \`spec-unknown-key\` | warn | A field the renderer does not know. It is ignored. |
| \`value-not-numeric\` | error | The value column is mostly not numeric. |
| \`no-values\` | error | No area has a value. |
| \`highlight-unmatched\` | warn | A locator map could not find an area in \`highlight\`. |
| \`table-encoding\` | warn | The table file is not valid UTF-8 and was read as Windows-1252. Set \`data.encoding\` or \`--encoding\` if the names look wrong. |
| \`boundaries-skipped\` | warn | Some features of the custom boundaries have no polygon (a point, a line or no geometry) and are not drawn. |
| \`symbols-negative\` | warn | Proportional symbols skip values at or below zero. |
| \`symbols-min-size\` | info | Circles smaller than the minimum size were drawn at the minimum. |
| \`glyphs-missing\` | warn | The embedded fonts have no glyph for some characters of a title or label. |
| \`labels-hidden\` | info | Labels left out because they do not fit or would overlap. |
| \`small-areas-marked\` | info | Areas too small to see are drawn as dots. |
| \`outside-frame\` | info | Areas with data that lie outside the map frame. |
| \`fix-applied\` | info | A change made by \`--fix\`. |
`,
);

const regionRows = Object.entries(REGIONS)
  .map(([id, r]) => {
    const proj = typeof r.projection === "string" ? r.projection : r.projection.name;
    return `| \`${id}\` | ${r.level} | ${proj} | ${r.keys.join(", ")} | ${r.population ? "yes" : "no"} |`;
  })
  .join("\n");
const projectionRows = Object.entries(PROJECTIONS)
  .map(([id, p]) => `| \`${id}\` | ${p.equalArea ? "yes" : "no"} | ${p.note} |`)
  .join("\n");

await writeFile(
  join(docs, "regions.md"),
  `# Regions and projections

Generated from the code by scripts/build-docs.mjs.

| Region | Level | Default projection | Key types | Population bundled |
| --- | --- | --- | --- | --- |
${regionRows}

Key types: \`iso3\`, \`iso2\` and \`isonum\` are ISO 3166-1 codes, \`fips\` are US FIPS codes (a county code is five digits and a missing leading zero is added back), \`postal\` is the US state abbreviation, \`code\` is the Taiwan Ministry of the Interior code, \`iso\` is ISO 3166-2 such as JP-13, \`jis\` is the Japanese prefecture number, \`name\` is any spelling in the nine label languages plus common aliases: World Bank, UN, IMF, WHO and everyday names for countries, and for the other regions the Associated Press state abbreviations (\`Calif.\`, \`N.Y.\`), Taiwan county names from before 2014 and bare city names (\`Taipei\`, \`New Taipei\`), the Korean provinces renamed in 2023 and 2024 and romanised Japanese suffixes (\`Osaka-fu\`, \`Fukuoka-ken\`). A name that fits two areas, such as \`Chiayi\`, is reported, never guessed.

Not in the table: \`custom\` draws boundaries from your own GeoJSON or TopoJSON file, see [config.md](config.md). Its projection is chosen from the extent of the file, and its key types are the properties of the file.

## Details that matter

- **world** and the continents use Natural Earth 1:50m countries. Antarctica is left out. Countries too small to see at the map's scale are drawn as dots, so a value is never lost. Dependencies share their parent's polygon only when Natural Earth does: French Guiana, Martinique, Guadeloupe, Mayotte and Reunion are part of France and cannot be mapped separately. Gibraltar and Tokelau have no polygon.
- **us-states** and **us-counties** use Albers with Alaska, Hawaii and Puerto Rico moved below the lower 48. Alaska is drawn at 35 percent of the scale of the lower 48, so areas are comparable inside each piece and not between Alaska and the rest. American Samoa, Guam, the Northern Mariana Islands and the US Virgin Islands are not drawn. Population is the Census Bureau estimate for 2023 (July 1).
- **tw-counties** and **tw-towns** use a Lambert azimuthal equal-area projection centred on Taiwan. Kinmen and Lienchiang (Matsu) are shown as insets, each with its own projection. Wuqiu, a part of Kinmen County far from Kinmen, is not drawn. Township names exist in English and Traditional Chinese only, so other label languages fall back to those.
- **jp-prefectures** shows Okinawa as an inset. Islands south of 30 degrees north other than Okinawa (Amami, Ogasawara) are not drawn.
- **kr-provinces** covers South Korea.
- Boundaries are drawn as Natural Earth, the US Census Bureau and the Taiwan Ministry of the Interior publish them. Graticule takes no position on disputed borders.

## Projections

| Name | Equal-area | Note |
| --- | --- | --- |
${projectionRows}
`,
);
// The skill carries the same pages so that it works from a plain copy of its folder.
for (const [file, target] of [
  ["config.md", "spec.md"],
  ["rules.md", "rules.md"],
  ["regions.md", "regions.md"],
  ["data.md", "data.md"],
])
  await copyFile(join(docs, file), join(refs, target));
console.log("docs and references written");
