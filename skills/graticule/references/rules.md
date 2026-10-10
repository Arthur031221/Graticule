# Rules

Generated from the code by scripts/build-docs.mjs. Every finding in a report has one of these ids, a level (error, warn or info) and a reason.

An error stops the map from being drawn. `--fix` repairs the errors marked fixable below. `--allow <id>` (or `"checks": { "allow": ["<id>"] }`) accepts a rule: the finding stays in the report at level info, marked as allowed.

| Rule | Level | Fires when | Why it exists |
| --- | --- | --- | --- |
| `source-required` | error | The spec has no source. | Readers cannot check a map that does not say where the numbers come from. Add "source" to the spec. |
| `title-required` | warn | The spec has no title. | Readers should know what the colours measure before they read the legend. |
| `legend-title` | warn | Neither legend.title nor data.label is set, so the unit is not stated. | A number without a unit can be read several ways. Set data.label, for example "Deaths per 100,000 people". |
| `kind-undeclared` | warn | A choropleth has no data.kind and no normalize, and the values do not look like counts. | Shading raw counts mostly shows where many people live. Declare "kind" as rate, share, index or count. |
| `table-ragged` | warn | Some rows of the table have more or fewer cells than the header. | Cells in a short or long row may sit under the wrong column. Check the quoting and the delimiter of the file. |
| `join-blank` | warn | Some rows have an empty key and are not drawn. | A row that names no area cannot be placed. A blank key is often a total row or a note at the end of the table. |
| `join-failed` | error | No row matched an area, or fewer than 50% of the rows with a key did. | A map built on a failed join puts values in the wrong places. Check data.key, data.keyType and region. |
| `join-unmatched` | warn | Some rows matched no area. Lists them with the closest names. | Rows that vanish quietly make a map look complete when it is not. Fix the spelling or the key column. |
| `join-ambiguous` | warn | A name fits more than one area. Those rows are not drawn. | Guessing which area was meant would put a value in the wrong place. |
| `duplicate-keys` | error | An area has more than one row and data.aggregate is not set. | Only one value can be drawn per area, and keeping the last row hides the others. Set data.aggregate, or data.filter to pick one row such as one year. |
| `raw-counts` | error | A choropleth has data.kind count, or no kind and a Spearman rank correlation of 0.6 or more between its values and the population of the areas, and no normalize. | A map of counts mostly shows where people live. Divide by population or area so that the colours show a rate. --fix does it when the region has population data. |
| `projection-mercator` | error | The projection is Mercator on a region more than 20 degrees of latitude tall. | Mercator stretches area away from the equator, so Greenland looks as large as Africa, and a choropleth is compared by area. Use an equal-area projection. |
| `projection-not-equal-area` | warn | A shaded map of a region more than 10 degrees of latitude tall uses a projection that does not preserve area. | Areas read larger or smaller than they are, which biases the comparison a little. Equal Earth, Albers and Lambert azimuthal keep areas true. |
| `max-classes` | error | More than 7 classes. | People can match about seven shades against a legend and no more. |
| `class-breaks-coverage` | error | Manual breaks stop short of the lowest or the highest value. | A value outside the first and last edge gets no colour, so the legend would not describe the map. List every edge, lowest value first and highest last. |
| `empty-class` | warn | A class holds no area. | A legend entry that nothing uses suggests the breaks do not fit the data. |
| `skewed-classes` | warn | Equal or manual classes put more than 70% of the areas in one class. | Equal intervals and hand-set breaks on skewed data paint most of the map one colour. Quantile or Jenks classes spread the areas out. |
| `palette-order` | error | A palette for ordered classes, sequential or categorical, whose lightness does not move one way or moves less than 2 L* between neighbours. | On a sequential scale the order of lightness is the only sign of "more". Rainbow palettes jump up and down in lightness and invent boundaries. |
| `cvd-separation` | error | Neighbouring colours (all pairs for categories) come closer than CIEDE2000 2.5 under normal vision or a simulated protanopia, deuteranopia or tritanopia. A warning below 4 (for categories: error below 4, warning below 8). | About 1 in 12 men cannot tell some of these colours apart. Neighbouring classes need a difference of at least 3, and 5 is comfortable (8 for categories). |
| `diverging-center` | error | A diverging palette is used without center. | Without a meaningful midpoint, such as 0, a diverging scale suggests a split that the data does not have. Set "center". |
| `too-many-categories` | error | A categorical map has more than 8 categories. | Beyond eight colours readers cannot match the map to the legend. Group the small categories as Other. |
| `normalize-missing` | warn | Some areas have no bundled population or area to divide by and are shown as no data. | A rate cannot be computed without a denominator. Supply one with normalize.by column, or accept the gaps and say so in the note. |
| `values-skipped` | warn | Rows that matched an area hold a cell that is not a number, or a value whose denominator is missing or zero, and were left out. | A skipped row changes the value of its area with no sign on the map. Fix the cell, or accept the gap and say so in the note. |
| `no-data-share` | warn | More than 40% of the areas have no value, in any panel. | A map with large grey areas can mislead. Say why in the note, or pick a region that the data covers. |
| `label-overlap` | error | Two placed labels overlap. Checked on the final layout, so it guards the label placer itself. | Labels that overlap cannot be read. |

Thresholds: neighbouring classes must differ by CIEDE2000 2.5 or more under normal vision and under simulated protanopia, deuteranopia and tritanopia (Machado, Oliveira and Fernandes 2009, severity 1.0), with a warning below 4. Sequential palettes must change lightness (CIE L*) by at least 2 between neighbours, in one direction. At most 7 classes and 8 categories.

## What `--fix` does

| Rule | Change |
| --- | --- |
| `raw-counts` | Adds `normalize` by population (per 1,000, 100,000 or 1,000,000, whichever puts the typical value at 1 or more) and sets `kind` to rate. Only for regions with bundled population. |
| `projection-mercator` | Sets `projection` to auto. |
| `max-classes` | Sets `classes.count` to 7. Not for manual breaks. |
| `class-breaks-coverage` | Adds a class below or above the manual breaks so every value is covered. |
| `skewed-classes` | Switches to quantile classes. |
| `palette-order` | Removes the custom palette, which restores the default. |
| `cvd-separation` | Same, when the finding is an error. |
| `diverging-center` | Sets `center` to 0 when the data has both signs. |

Every change is listed in the report as a `fix-applied` finding and the spec that was used is written to `<name>.spec.json`.

## Other messages

| Id | Level | Meaning |
| --- | --- | --- |
| `spec` | error | A field is missing or has the wrong shape. The message names the path. |
| `spec-unknown-key` | warn | A field the renderer does not know. It is ignored. |
| `value-not-numeric` | error | The value column is mostly not numeric. |
| `no-values` | error | No area has a value. |
| `highlight-unmatched` | warn | A locator map could not find an area in `highlight`. |
| `table-encoding` | warn | The table file is not valid UTF-8 and was read as Windows-1252. Set `data.encoding` or `--encoding` if the names look wrong. |
| `boundaries-skipped` | warn | Some features of the custom boundaries have no polygon (a point, a line or no geometry) and are not drawn. |
| `symbols-negative` | warn | Proportional symbols skip values at or below zero. |
| `symbols-min-size` | info | Circles smaller than the minimum size were drawn at the minimum. |
| `glyphs-missing` | warn | The embedded fonts have no glyph for some characters of a title or label. |
| `labels-hidden` | info | Labels left out because they do not fit or would overlap. |
| `small-areas-marked` | info | Areas too small to see are drawn as dots. |
| `outside-frame` | info | Areas with data that lie outside the map frame. |
| `fix-applied` | info | A change made by `--fix`. |
