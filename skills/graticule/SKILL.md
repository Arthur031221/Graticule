---
name: graticule
description: Draws maps from tabular data (choropleth, proportional symbols, categorical, locator and small multiples) and checks them against cartography rules before exporting SVG, PNG, PDF or interactive HTML. Use it whenever someone asks for a map, a choropleth, "color the countries or states by", a heat map by region, a locator map, or a figure that places numbers on geography. It joins the table to boundaries (countries, US states and counties, Taiwan counties and townships, Japan prefectures, Korean provinces), normalizes counts, picks an equal-area projection, builds a colorblind-safe legend and labels areas in nine languages, all offline.
---

# Graticule

Use this skill instead of writing map code yourself. A map made from a table goes wrong in the same few ways: raw counts that only show where people live, Mercator for the world, rows that silently fail to join, rainbow palettes, legends that do not cover the data. Graticule catches those cases, says why, and can repair most of them.

The program is `scripts/graticule.mjs` in this skill folder. It needs Node 20 or newer and no network. Below, `graticule` stands for `node <this skill folder>/scripts/graticule.mjs`. If the folder path is not known, `npx -y github:Arthur031221/Graticule` runs the same program.

## Workflow

1. **Find the data and the geography.** Ask for the table if it is missing. Pick a region with `graticule regions` (world, europe, asia, africa, north-america, south-america, oceania, us-states, us-counties, tw-counties, tw-towns, jp-prefectures, kr-provinces). For any other place ask for a GeoJSON or TopoJSON file of its areas (in longitude and latitude) and use `--boundaries file.geojson` in place of `--region`. The spec then has `"region": "custom"` (see `references/spec.md`).
2. **Look at the join first.** Run `graticule join table.csv --region world`. It names the key column it found (or the two columns, such as a county and its state, that name an area together), shows how many rows matched and lists every row that did not, with the closest names. Fix the table or choose another key before drawing anything. If it says the file is not valid UTF-8 and the names look garbled, rerun with `--encoding big5`, `shift_jis`, `euc-kr` or `gbk` (the file came from a spreadsheet on Windows) and keep that value in `data.encoding`.
3. **Write a spec.** Run `graticule init table.csv --region world --value <column> -o map.json` for a start, then fill in `title`, `subtitle`, `source`, `data.kind` and `data.label`. Field reference: `references/spec.md`.
4. **Check.** Run `graticule check map.json`. Read every error and warning. Each one carries a reason in one sentence.
5. **Render.** Run `graticule render map.json --fix -f svg,png`. `--fix` makes the smallest change that satisfies each failed error rule (normalize counts by population, replace Mercator, cap classes at 7, extend manual breaks, swap an unsafe palette) and writes the spec it used to `map.spec.json`.
6. **Look at the PNG** and read `map.check.json`. Report back what was fixed, which rows did not match, and what the map cannot show.
7. **Deliver** the files the person asked for: `-f svg,png,pdf,html`. Use `--dpi 300` for print. Use `--lang zh-TW` (or ja, ko, es, fr, de, pt-BR, zh-CN) to label in another language.

## The spec in one screen

```json
{
  "title": "COVID-19 deaths per 100,000 people",
  "subtitle": "Cumulative, by country",
  "source": "WHO COVID-19 dashboard, data up to 2026-09-20",
  "region": "world",
  "type": "choropleth",
  "data": { "file": "deaths.csv", "key": "country", "value": "deaths", "kind": "count", "label": "Deaths" },
  "classes": { "method": "quantile", "count": 5 }
}
```

`type` is one of choropleth, symbols, categorical, locator, small-multiples. File paths are relative to the spec file and must stay inside its folder.

## Rules you must not argue with

- **Declare what the numbers are.** `data.kind` is count, rate, share, index or other. A choropleth of counts is refused (`raw-counts`). `--fix` divides by the bundled population, per 1,000, 100,000 or 1,000,000 people (or the unit the legend already states), and puts that unit in the legend. Counts that should be sized go in `type: "symbols"`.
- **One value per area.** A table with several years or several rows per place is refused (`duplicate-keys`). Pick one with `data.filter` (for example `{"year": "2022"}`) or combine with `data.aggregate`.
- **Say where it came from.** `source` is required.
- **Never pick the projection by habit.** Leave `projection` as auto. Mercator is refused for a region more than 20 degrees of latitude tall.
- **Do not turn a rule off to get a picture.** `--allow <rule-id>` exists for real exceptions. When you use it, tell the person which rule and why.

## What to tell the person

Always include: the rows that did not match (and the closest names), anything `--fix` changed, the data date, and the limits that matter for the region (for example Taiwan township names exist in English and Traditional Chinese only). Never describe a map you have not looked at.

## More

- `references/spec.md`: every spec field.
- `references/rules.md`: every rule, when it fires, how to fix it.
- `references/regions.md`: regions, key types, projections, labels and what is bundled.
- `references/data.md`: where the boundaries and fonts come from and their licenses.
