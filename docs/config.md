# Spec reference

A spec is one JSON object. Paths are relative to the spec file and must stay inside its folder (the command line refuses others unless you pass `--data-root`). Unknown fields produce a warning (`spec-unknown-key`) and are ignored.

## Top level

| Field | Default | Meaning |
| --- | --- | --- |
| `title` | none | Headline. A map without one gets the `title-required` warning. |
| `subtitle` | none | One line under the title: unit, place, period. |
| `source` | none | Where the numbers come from. Required (`source-required`). |
| `note` | none | A short note after the source line, for caveats. |
| `region` | `world` | One of the regions in `references/regions.md`. |
| `type` | `choropleth` | `choropleth`, `symbols`, `categorical`, `locator`, `small-multiples`. |
| `data` | required | The table and which columns to use, see below. |
| `classes` | quantile, 5 | How values are sorted into legend classes. |
| `palette` | by type | A palette name (`graticule palettes`) or a list of `#rrggbb` colours. |
| `center` | none | Midpoint for a diverging palette, for example 0. Setting it selects a diverging palette. |
| `projection` | `auto` | `auto` uses the region's equal-area projection. Or a name from `graticule projections`. |
| `language` | `en` | Label language: en, zh-TW or zh-Hant, zh-CN or zh-Hans, ja, ko, es, fr, de, pt-BR or pt. |
| `labels` | `auto` | `auto`, `none`, `all`, or an object such as `{ "show": "auto", "ids": ["TWN"] }`. With `ids`, only those areas are labelled. |
| `legend` | none | `{ "title": "...", "order": [...] }`. `order` fixes the order of categories. |
| `size` | width 1200 | `{ "width": 1200, "height": 800 }`. Height is derived when omitted. |
| `theme` | `light` | `light` or `dark`. |
| `highlight` | none | Locator maps: ids or names of the areas to mark. |
| `panels` | none | Small multiples: `[{ "title": "1990" }, ...]`, one per value column. |
| `columns` | by panel count | Small multiples: panels per row, 1 to 4. |
| `symbols` | none | `{ "color": "#c8412b", "maxRadius": 38 }`. The colour must be `#rrggbb`. |
| `attribution` | `true` | `false` removes the "Made with Graticule" line. The boundary credit stays, because the licenses ask for it. |
| `checks` | none | `{ "allow": ["rule-id"] }`. Accepts rules, with a note in the report. |

## data

Give exactly one of `file`, `csv` (the text itself) or `rows` (a list of objects).

| Field | Meaning |
| --- | --- |
| `key` | Column that names the areas. Found automatically when omitted. |
| `keyType` | `auto` (default) or one of the region's key types: iso3, iso2, isonum, name for countries, fips, postal, name for US states, fips for counties, code and name for Taiwan, iso, jis, name for Japan, iso and name for Korea. |
| `value` | Column to map. A list of columns for small multiples. |
| `kind` | `count`, `rate`, `share`, `index` or `other`. Counts are refused on choropleths. |
| `label` | Legend title, normally the unit. |
| `normalize` | `{ "by": "population", "per": 100000 }`, `{ "by": "area", "per": 1 }` (per square kilometre) or `{ "by": "column", "column": "pop", "per": 1000 }`. `per` must be above 0 and defaults to 1. If the title, the legend title or `label` says "per 100,000" or similar, `per` has to agree with it. Population is bundled for countries and US states and counties. |
| `aggregate` | `sum`, `mean`, `first`, `last`, `min`, `max` when several rows name the same area. |
| `filter` | Equality filter on the table, for example `{ "year": "2022" }` or `{ "year": ["2021", "2022"] }`. |

Numbers are read the way spreadsheets print them: thousands separators, percent signs, currency symbols and a Unicode minus. A blank, `NA`, `n/a`, `..` or `-` is a gap. Any other cell that is not a number is left out and reported as `values-skipped`. A cell such as `1,234` is 1234 or 1.234, so the other cells of the column decide: `12,5` or `1.234,5` make the column decimal-comma, while `3.5` or `1,234,567` make it decimal-point. With no such cell the thousands reading is used, so write a column of decimal commas with at least one cell that settles it, or remove the separators.

## classes

| Field | Meaning |
| --- | --- |
| `method` | `quantile` (default), `jenks`, `equal` or `manual`. |
| `count` | Number of classes, at most 7. |
| `breaks` | Manual breaks: every class edge, lowest first and highest last. Setting it selects `manual`. |

Classes are closed on the right, so a value equal to an inner edge belongs to the lower class, and the first class includes its lower edge. Quantile and Jenks edges are moved to the roundest number that leaves every area in the class it had, so the legend prints round numbers without changing a single colour. Equal-interval classes use a round width (1, 2, 2.5 or 5 times a power of ten) from a multiple of that width, so there can be fewer classes than `count`.

## Output files

`graticule render map.json -f svg,png,pdf,html` writes `map.svg`, `map.png`, `map.pdf`, `map.html` and `map.check.json` next to the spec (`-o` changes the base name or folder). With `--fix` it also writes `map.spec.json`, the spec after fixes.
