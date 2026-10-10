# Usage

This page follows one map from a table to a file. The commands are real and so is the output, taken from `gallery/covid-deaths`. Below, `graticule` stands for `node skills/graticule/scripts/graticule.mjs`.

## 1. Look at the join first

Most wrong maps start with rows that did not join. `graticule join` tells you before anything is drawn.

```
$ graticule join deaths.csv --region world --key country
column "country" matches 226 areas of world as name (240 rows)
matched by: name 218, alias 8
not matched: Bonaire, Saint Eustatius and Saba
not matched: French Guiana
not matched: Gibraltar
...
```

`matched by` says how: `name` is a spelling in one of the nine languages, `alias` is a variant such as "Korea, Rep." or "Turkiye", `code` is an ISO or FIPS code. Names that are close to a real one come with a suggestion and are never joined by guessing. A name that fits two areas is listed as ambiguous and left out.

## 2. Write a spec and check it

`graticule init deaths.csv --region world --value deaths -o covid.json` writes a starting point. Fill in `title`, `source` and `data.kind`, then check it. A table that is not UTF-8 is read as Windows-1252 with a warning. Pass `--encoding big5` (or `shift_jis`, `euc-kr`, `gbk`) to `join` and `init`, or set `data.encoding`, when the names look garbled. Data files are read only from the folder of the spec (`--data-root <folder>` allows another one), because specs can come from other people. This spec is the map an unguarded script would draw: raw counts, Mercator, nine classes and a rainbow.

```
$ graticule check covid.json
region: world, type: choropleth, projection: mercator
join: 226 of 240 rows matched 226 areas (column "country" as name)
classes: jenks, 9 classes, edges 0 | 13000 | 41000 | ... | 1000000 | 1300000, areas per class 167 31 8 9 6 2 1 1 1
error  raw-counts: The values are raw counts (data.kind is count).
       why: A map of counts mostly shows where people live. Divide by population or area so that the colours show a rate. ...
       fix: --fix will normalize by population
error  projection-mercator: Mercator on a region 141 degrees of latitude tall.
       why: Mercator stretches area away from the equator, so Greenland looks as large as Africa, ...
       fix: --fix will use the region's equal-area projection
error  max-classes: 9 classes is more than readers can tell apart. The limit is 7.
       fix: --fix will use 7 classes
error  palette-order: Palette custom does not get steadily lighter or darker.
       fix: --fix will use the default sequential palette

No map was written. Fix the errors above, or rerun with --fix, or accept a rule with --allow <id>.
```

The exit code is 2. Nothing is drawn while an error stands. Every finding carries its reason, so a person or an agent can decide whether to fix the spec or argue with the rule.

## 3. Fix and render

```
$ graticule render covid.json --fix -f svg,png,pdf,html
...
info   fix-applied: Applied for raw-counts: normalize by population.
info   fix-applied: Applied for projection-mercator: use the region's equal-area projection.
info   fix-applied: Applied for max-classes: use 7 classes.
info   fix-applied: Applied for palette-order: use the default sequential palette.
wrote covid.svg covid.png covid.pdf covid.html covid.spec.json covid.check.json (1200 x 757)
```

`covid.spec.json` is the spec after the fixes, so the picture can be reproduced. `covid.check.json` is the machine-readable report: what matched, the class edges and counts, every finding.

Formats: `svg` has real text and embeds only the font glyphs the map uses, `png` is 96 dpi unless you pass `--dpi 300`, `pdf` is vector with embedded fonts, `html` is one file with tooltips, a legend that highlights classes and a data table.

## 4. Other map types

Proportional symbols take counts as they are, because circle area is the right encoding for a quantity:

```json
{ "type": "symbols", "region": "world", "data": { "file": "population.csv", "key": "iso3", "value": "population", "kind": "count" } }
```

Categories need at most eight, in colors that stay apart for people with colour vision deficiency:

```json
{ "type": "categorical", "data": { "file": "groups.csv", "key": "iso3", "value": "income_group" }, "legend": { "order": ["High income", "Low income"] } }
```

Small multiples share one classification and one legend across the panels, so the colors mean the same thing everywhere:

```json
{ "type": "small-multiples", "columns": 2, "data": { "file": "fertility.csv", "key": "iso3", "value": ["y1990", "y2022"], "kind": "rate" } }
```

A locator map marks areas and adds a small globe:

```json
{ "type": "locator", "region": "asia", "highlight": ["TWN"], "data": {} }
```

## Your own boundaries

For a place the bundled regions do not cover, give a GeoJSON or TopoJSON file with `--boundaries` instead of `--region`:

```
graticule join table.csv --boundaries states.geojson
graticule init table.csv --boundaries states.geojson -o map.json
```

The spec gets `"region": "custom"` and a `boundaries` block, described in [config.md](config.md). Everything else works as for a bundled region: the join report, the rules, `--fix`, the four output formats and the nine label languages. In the playground, drop the file next to the table.

## 5. Language

`--lang zh-TW` (or `"language": "zh-TW"` in the spec) changes the labels on the map and the language of the messages. The nine languages are en, zh-TW, zh-CN, ja, ko, es, fr, de and pt-BR. Names come from Natural Earth and, for Taiwan townships, from the Ministry of the Interior (English and Traditional Chinese only, other languages fall back to those).

## 6. Accepting a rule

```
graticule render map.json --allow projection-not-equal-area
```

The finding stays in the report at level info, marked as allowed, so a reader of `map.check.json` can see that the rule was set aside. Use it for real exceptions.

## Using it from an agent

Ask in plain words. The skill tells the agent to run `join` first, to read every finding, to look at the PNG and to report the unmatched rows and any fix it applied. `eval/` contains the fixed prompts and the transcripts of real agent sessions, Codex and one other agent, with and without the skill.
