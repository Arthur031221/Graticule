// Runs every external check and writes docs/verification.md with the measured
// numbers. Needs Python with numpy, pyproj, pillow, pypdf and fonttools:
//
//   PYTHON=python3 node scripts/verify.mjs
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const python = process.env.PYTHON ?? "python3";
const run = (cmd, args) =>
  execFileSync(cmd, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
const tmp = join(root, ".tmp");

run("node", ["verify/dump-projections.mjs", `${tmp}/projections.json`]);
run(python, ["verify/proj_check.py", `${tmp}/projections.json`, "--write", `${tmp}/proj.md`]);
run("node", ["verify/join-rates.mjs", "--write", `${tmp}/join.md`]);
run("node", ["verify/raw-counts.mjs", "--write", `${tmp}/counts.md`]);
const parsed = run(python, ["verify/parse_outputs.py"]).trim().split("\n");

const classify = JSON.parse(await readFile(join(root, "tests/fixtures/classify.json"), "utf8"));
const color = JSON.parse(await readFile(join(root, "tests/fixtures/color.json"), "utf8"));
const read = (name) => readFile(join(tmp, name), "utf8");

await writeFile(
  join(root, "docs/verification.md"),
  `# Verification

Every number in the README comes from a check in this repository. \`npm run verify\` reruns the external ones and rewrites this page. The unit tests (\`npm test\`) cover the rest. Nothing here compares Graticule with its own assumptions: each check uses a second implementation or the real file format.

## Projections against PROJ

Each of the 12 projections is evaluated at 3,000 seeded random points on a sphere and compared with PROJ. The Albers USA composite is built from conic equal-area projections of the same family and is not listed separately. The unit of the error is metres on the ground.

${await read("proj.md")}
Robinson is defined by a table of 19 rows. d3 and PROJ normalise it differently, so the two are compared after fitting one scale factor, and they interpolate between rows differently, which is where the 10 km comes from (0.16 percent of the Earth's radius). Every other projection agrees with PROJ to well below a millimetre.

## Joining names to polygons

Names from public tables, joined to Natural Earth 1:50m countries by name only. "Exact match" is the usual shortcut: equal to the English name in Natural Earth. A wrong match is a name that Graticule or the shortcut joined to a country other than the one its own ISO code names. Only names whose country has a polygon at 1:50m are counted.

${await read("join.md")}
The aliases were written while looking at the World Bank and WHO lists, so those two rows are not independent. The UN short names led to the rule that ignores "(the)", and the UN formal names to the rule that shortens "the Republic of X". The ISO and CLDR rows were measured before any further change and are the fairest numbers on the page. No list produced a wrong match.

## Telling counts from rates

Raw counts on a choropleth mostly show where people live, so Graticule asks whether the values rank like population. The check is the Spearman rank correlation with the population of each country, with a limit of 0.6. Applied to World Bank indicators (most recent value per country):

${await read("counts.md")}
It is a heuristic and the page says so: a rate that really does track population (for example a rate measured in a few huge countries) would be flagged, and \`data.kind\` settles it either way. A declared kind of rate, share, index or other is never second-guessed.

## Classification and colour

- ${classify.cases.length} cases of quantile, equal-interval and Fisher-Jenks classes on five datasets (normal, lognormal, uniform, tied integers, skewed) are compared with mapclassify ${classify.mapclassify}: the class edges and the number of areas per class agree, and the Jenks within-class variance equals the optimum. The tied-integer Jenks case is compared on variance only, because tied values allow several optimal partitions.
- ${Object.keys(color.lab).length} colours are converted to CIELAB and compared with colour-science ${color.colour_science}, ${color.pairs.length} pairs with its CIEDE2000, and the three colour vision simulations with colorspacious. CIEDE2000 is also checked against four pairs from the published test data of Sharma, Wu and Dalal.

## Output files

Gallery maps are rendered by the command line program and the files re-opened with parsers that share no code with it: ElementTree and fontTools for SVG (every character drawn has a glyph in an embedded font), pypdf for PDF (one page of the right size, every font embedded, the title present in the extracted text) and Pillow for PNG.

\`\`\`
${parsed.join("\n")}
\`\`\`
`,
);
console.log("docs/verification.md written");
