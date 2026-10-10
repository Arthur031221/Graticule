<p align="center"><img src="assets/logo.svg" width="64" alt="Graticule logo"></p>

# Graticule

A cartography skill for coding agents: 1 skill, 5 map types, 13 regions or your own GeoJSON, 25 rules, 9 languages. It won't draw a bad map. It'll tell you why.

> **Quick start.** `npx skills add Arthur031221/Graticule`, then ask your agent: "map COVID deaths by country from deaths.csv".

[English](README.md) | [Traditional Chinese](README.zh-TW.md) | [Simplified Chinese](README.zh-CN.md) | [Japanese](README.ja.md) | [Korean](README.ko.md) | [Spanish](README.es.md) | [French](README.fr.md) | [German](README.de.md) | [Portuguese](README.pt-BR.md)

[![CI](https://github.com/Arthur031221/Graticule/actions/workflows/ci.yml/badge.svg)](https://github.com/Arthur031221/Graticule/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-c8412b?style=flat-square)](LICENSE) [![Live demo](https://img.shields.io/badge/live%20demo-open-c8412b?style=flat-square)](https://arthur031221.github.io/Graticule/)

<p align="center"><a href="https://arthur031221.github.io/Graticule/"><img src="assets/demo.gif" alt="A map with four mistakes is blocked, one click fixes it, then the labels change language" width="860"></a></p>

**232 of 235** ISO 3166 country names join to the right polygon by name alone. None join to the wrong one. Matching on Natural Earth's English name finds 202.
<sub>Names from datasets/country-codes (official_name_en), joined to Natural Earth 1:50m. Wrong joins counted against each name's ISO code. Five more public lists show the same pattern. See [docs/verification.md](docs/verification.md).</sub>

| A coding agent, no skill | The same agent with Graticule |
| --- | --- |
| <img src="assets/before.png" alt="World map of raw COVID death counts in six log-scaled bins"> | <img src="assets/after.png" alt="World map of COVID deaths per 100,000 people with a legend, a source line and dots for small countries"> |
| Shaded raw death counts. The legend uses log bins of counts, so big countries are dark. No source line. | Divided by population, used an equal-area projection, added a source line and named the 14 unmatched rows. 22 seconds. |

Same prompt and file, fresh sessions of the same agent (Sonnet 5.5). All four sessions without the skill shaded raw counts: two with that agent and two with Codex. Transcripts are in [eval/runs](eval/runs).

I wrote down the rules agents skip when drawing maps in a hurry, then built a renderer that won't run until they pass. No new map library.

## Why the name

A graticule is the grid of latitude and longitude lines on a map. Readers use it to check that the map is where it says it is. This project does the same for maps drawn by agents. These mistakes keep coming up.

- **Counts instead of rates.** Coloring countries by death counts shows where the people are. Graticule asks for the data kind, or spots values that rank like population, and divides.
- **Mercator for the world.** Greenland as big as Africa. Equal-area projections are the default. Graticule refuses Mercator above 20 degrees of latitude.
- **Rows that vanish.** "Korea, Rep." doesn't match "South Korea" and nobody hears about it. Every row that fails to join is listed with its closest names. If a name fits two places, Graticule won't guess.
- **Files that are not UTF-8.** A table saved by a spreadsheet on Windows is often Big5, Shift_JIS or Windows-1252. Read as UTF-8, it joins nothing. Graticule flags files that aren't UTF-8, reads them as Windows-1252 and takes `--encoding big5` or `data.encoding` for the rest.
- **Rainbow palettes.** Lightness that goes up and down draws borders that aren't in the data. The palette must get steadily lighter or darker. Its colors must stay apart for the three kinds of color vision deficiency I simulate.
- **Labels that turn into empty boxes.** Chinese, Japanese and Korean labels need fonts. Each output carries a subset of Noto Sans CJK with only the glyphs it uses.
- **No source.** Graticule refuses maps without a source line.

## What it checks

25 rules, each with a plain reason beside the finding. Errors stop the map. `--fix` repairs errors with a single mechanical fix. `--allow <id>` accepts a rule with a note in the report.

| Rule | What it catches |
| --- | --- |
| `source-required` | A map with no source line. |
| `title-required` | A map with no title. |
| `legend-title` | A legend that doesn't say what the numbers are. |
| `kind-undeclared` | A shaded map whose values might be counts. |
| `table-ragged` | Table rows with the wrong number of cells. |
| `join-blank` | Rows with an empty area name. |
| `join-failed` | A key column that mostly matches no area. |
| `join-unmatched` | Rows that match nothing, listed with the closest names. |
| `join-ambiguous` | Names that fit more than one area. |
| `duplicate-keys` | Several rows for one area, such as many years in one column. |
| `raw-counts` | Raw counts on a shaded map. `--fix` divides by population. |
| `projection-mercator` | Mercator on a region over 20 degrees of latitude. |
| `projection-not-equal-area` | A shaded map of a large region in a projection that distorts area. |
| `max-classes` | More than 7 classes. |
| `class-breaks-coverage` | Breaks that leave some values without a color. |
| `empty-class` | A legend class that no area uses. |
| `skewed-classes` | Equal or manual classes with most of the map in one of them. |
| `palette-order` | A palette that isn't steadily lighter or darker. |
| `cvd-separation` | Colors that come too close under simulated color vision deficiency. |
| `diverging-center` | A diverging palette with no midpoint. |
| `too-many-categories` | More than 8 categories. |
| `normalize-missing` | Areas with no population or area to divide by. |
| `values-skipped` | Rows skipped because a cell isn't a number or a denominator is missing or zero. |
| `no-data-share` | A map that's mostly grey. |
| `label-overlap` | Labels printed over each other. |

Exact conditions and thresholds are in [docs/rules.md](docs/rules.md).

## Install

<details open>
<summary><b>Codex and the agent used above</b> (the two I tested)</summary>

```
npx skills add Arthur031221/Graticule
```

Run this in a project. It writes `.agents/skills/graticule`, which Codex reads, and links the skills folder of the other agents you pick. Then ask for a map in plain words.

</details>

<details>
<summary><b>Cursor, Gemini CLI, OpenCode and other agents</b></summary>

Run the same command and pick your agent when the `skills` program asks. I haven't run these agents myself. If your agent has a skills folder, copy `skills/graticule` into it. It's about 14 MB. That's all you need.

</details>

<details>
<summary><b>Chat apps that accept a skill upload</b></summary>

After cloning, build `graticule-skill.zip` with `npm run package:skill`, or get it from a release. Upload it where the app accepts a custom skill. The skill runs a program, so code execution must be on.

</details>

<details>
<summary><b>Command line only</b></summary>

```
npx -y github:Arthur031221/Graticule render map.json
```

Or clone and run `node skills/graticule/scripts/graticule.mjs --help`. Node 20 or newer, no network.

</details>

<details>
<summary><b>In the browser</b></summary>

Open the [playground](https://arthur031221.github.io/Graticule/). Drop a CSV, fix what the checker finds, then download SVG, PNG, PDF or an interactive HTML page. Everything runs in the page. Nothing is uploaded. The interface is in nine languages. Drop a GeoJSON or TopoJSON file next to the table to draw your own boundaries.

</details>

## Use it

<p align="center"><img src="assets/cli.gif" alt="graticule join, check and render --fix on a table of COVID deaths" width="860"></p>

```
graticule join deaths.csv --region world     # which rows match which areas, before anything is drawn
graticule check map.json                     # every finding, with its reason
graticule render map.json --fix -f svg,png   # the smallest repair for each error, then the files
```

A spec is a small JSON file:

```json
{
  "title": "COVID-19 deaths per 100,000 people",
  "source": "WHO COVID-19 dashboard, up to 2026-09-20",
  "region": "world",
  "data": { "file": "deaths.csv", "key": "country", "value": "deaths", "kind": "count" }
}
```

`render` writes `map.svg`, `map.png`, optionally `map.pdf` and `map.html`, and `map.check.json`. The report lists what matched, the class edges and every finding. The full walk-through is in [docs/usage.md](docs/usage.md). [docs/config.md](docs/config.md) lists the fields.

## Maps and regions

Five map types: shaded areas (choropleth), proportional circles, categories, locator maps with a small globe, and small multiples that share one legend. Thirteen regions: the world, six continents, US states and counties (Alaska, Hawaii and Puerto Rico as insets), Taiwan counties and townships, Japan prefectures and South Korean provinces. Everything is bundled, so rendering works offline. For any other place, supply a GeoJSON or TopoJSON file: `graticule init table.csv --boundaries states.geojson`. Every property that differs per feature becomes a key. The extent determines which equal-area projection to use. See [docs/config.md](docs/config.md).

| | | |
| --- | --- | --- |
| [<img src="docs/gallery/us-county-unemployment.png" alt="US county unemployment">](docs/gallery.md) | [<img src="docs/gallery/population-symbols.png" alt="Population as proportional circles">](docs/gallery.md) | [<img src="docs/gallery/fertility-small-multiples.png" alt="Fertility rates in four small multiples">](docs/gallery.md) |
| [<img src="docs/gallery/taiwan-township-area.png" alt="Taiwan townships in Traditional Chinese">](docs/gallery.md) | [<img src="docs/gallery/japan-regions.png" alt="Japan prefectures by region">](docs/gallery.md) | [<img src="docs/gallery/brazil-state-density.png" alt="Population density in Brazil, drawn from a TopoJSON file">](docs/gallery.md) |

[docs/gallery.md](docs/gallery.md) has all 17, each with its prompt, spec, data and check log.

## Labels in nine languages

<p align="center"><img src="assets/languages.png" alt="The same map of Europe labelled in nine languages" width="860"></p>

English, Traditional and Simplified Chinese, Japanese, Korean, Spanish, French, German and Brazilian Portuguese. `--lang zh-TW` changes the map labels and message language. The playground, messages and these READMEs are translated into each language.

## Checked against real systems

Each check runs from a script in this repository. CI repeats most of them. The numbers and methods are in [docs/verification.md](docs/verification.md).

| What | Compared with | Result |
| --- | --- | --- |
| 12 projections | PROJ 9.8.1, 3,000 points each | 11 agree to 0.00001 m, Robinson to 10.2 km after one fitted scale |
| Quantile, equal and Jenks classes | mapclassify 2.11.0, 45 cases | same edges and counts, before the legend edges are rounded |
| CIELAB, CIEDE2000, color vision simulation | colour-science 0.4.7, colorspacious | within 0.02 and within 2 of 255 |
| Name joins | 6 public country lists | no wrong join in 1,301 names |
| Counts versus rates | 33 World Bank indicators | 0 of 25 rates flagged, 8 of 8 counts caught |
| SVG, PDF and PNG | fontTools, pypdf, Pillow | every glyph embedded, fonts embedded, sizes right |

The agent sessions are a small sample: two prompts, two agents, two runs each. Read them as examples. The prompts and a runner are in [eval](eval).

## Limits

- Boundaries come from Natural Earth (1:50m for countries), the Census 2017 files and the Taiwan Ministry of the Interior files. They're drawn for maps and aren't for surveying. French Guiana, Martinique, Guadeloupe, Mayotte and Reunion are part of France. Gibraltar and Tokelau have no polygon.
- US counties use the 2017 set, so Connecticut's planning regions and Alaska's newer census areas don't join.
- Taiwan townships have English and Traditional Chinese names only. Japan's Ogasawara and Amami islands and Taiwan's Wuqiu aren't drawn.
- The counts detector is a heuristic with a limit of 0.6. Declare `data.kind` to bypass it.
- A cell such as `1,234` is read as 1234 unless another cell in the column shows decimal commas. The other number rules are in [docs/config.md](docs/config.md).
- Fonts cover each language's common characters (5,401 Big5 level 1 characters for Traditional Chinese, for example). Characters outside that set return `glyphs-missing`. Scripts that run right to left or need shaping aren't supported.
- In the US map, Alaska is drawn at 35 percent of the lower 48 scale. Areas are comparable inside each piece.
- Labels use a greedy placer. Dense maps leave some out, and the report counts them.
- Your own boundaries are drawn as given, without simplification. Files with millions of vertices draw slowly. Coordinates must be longitude and latitude. `--fix` needs a population property in the file before it can divide raw counts.

## More

[Install](docs/install.md), [usage](docs/usage.md), [config](docs/config.md), [regions](docs/regions.md), [rules](docs/rules.md), [data and licenses](docs/data.md), [architecture](docs/architecture.md), [verification](docs/verification.md), [contributing](CONTRIBUTING.md), [changelog](CHANGELOG.md).

Natural Earth, the US Census Bureau, the Taiwan Ministry of the Interior, Noto fonts, ColorBrewer, d3, pdfkit, resvg and HarfBuzz make this possible. [NOTICE.md](NOTICE.md) has the licenses.

MIT, see [LICENSE](LICENSE).

Assisted by Claude/Codex.
