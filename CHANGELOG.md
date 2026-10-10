# Changelog

## 0.3.3 (2026-10-11)

- An area named over two columns joins: `data.key` may be a list such as `["county", "state"]`, joined as `Mohave, AZ`. A county column next to a column called `state` is found without being listed, by `join`, `init` (`--key county,state` names the pair), the spec and the playground, where it also decides the region over a bare state column.
- A CSV with only a header row says so.
- The unit tests run on Windows and macOS as well as Linux on every push.

## 0.3.2 (2026-10-11)

- The command line no longer crashes or stays silent on bad input. A spec field of the wrong type (a text `center`, a text `size`, `grid`, `highlight`, `columns`, `data.key` and others) is named. A rule id with a typo in `--allow` or `checks.allow` is an error. Unknown options are refused. `--dpi` must be between 24 and 600. An Excel workbook, an image or another binary file is named instead of being read as a table. The closing line suggests `--fix` only when a rule has a repair, and an internal error says it is a bug and where to report it.
- `init` skips a year column when it picks the value to map, and says how to map one year when several rows name the same area. `init --value` checks that the column exists. `join` and `init` warn about a quote that never closes, repeated column names and short rows.
- Playground: a table with a row per area and year gets a year selector, set to the latest year. The first screen says that the example is drawn badly on purpose. A new file clears the fields of the last map at once, a handful of plain numbers no longer picks a region, an empty file says to add a table, and the status says Checking while regions are detected.
- The buttons of a blocked card, the match pills and the long lists in findings are tidier: a list shows twenty names and how many are left out.
- Legends show four significant digits and the report says "1 class". The small print under a map reads at 4.5 to 1 in both themes.
- Translations: the explanation of the colour vision thresholds now matches the code in all nine languages, the empty class wording says that no area falls into it, and typos in French, Spanish, Japanese and German are fixed.
- The demo data restores five names that the WHO file spells with a damaged accent. The docs no longer claim a repair for skewed classes, say where population is bundled and name the program for each install route.

## 0.3.1 (2026-10-11)

- US counties join by name with the state: `Mohave County, AZ`, `Orleans Parish, LA`, `Anchorage Municipality, AK`, `Alexandria city, VA`. The state may be the postal code or the full name. A name two areas share is reported as ambiguous and a name without a state is never matched.
- Playground: the buttons of a blocked card work when a map was drawn before, because the greyed map no longer takes their clicks. Small multiples start with the numeric columns ticked, and spec errors such as a missing highlight get a Go to field button.
- A table with hundreds of unmatched names is reported in under a second instead of several.
- `render` lists the check log among the files it wrote, and the install page names the program for each install route.

## 0.3.0 (2026-10-10)

- `--fix` divides raw counts by population in Taiwan, Japan and South Korea too. Counties and townships carry the Ministry of the Interior household registration at the end of 2023, prefectures the 2020 census and provinces the 2020 census. `scripts/add-population.mjs` fetches the sources and stops unless each total matches the official figure.
- Playground: on a phone the map opens full screen at a size where labels can be read, and pans by touch. The page no longer jumps while it loads, because the stage and the example chips keep their space.
- Custom boundaries are sturdier. Rings are turned the way d3 wants by their own winding, so holes, polygons wider than a hemisphere and the antimeridian all draw correctly. A feature id works as a key, every spelling of WGS84 is accepted and a property called `constructor` is only a property.
- Gallery: Brazil's states from a TopoJSON file, with the 2022 census from IBGE divided by the area measured from the boundary file.
- Playground races closed: an older file, example or region lookup can no longer replace a newer one.
- Issue forms, a pull request checklist and a security policy.

## 0.2.0 (2026-10-10)

- Your own boundaries. `region: "custom"` with a `boundaries` block draws any GeoJSON or TopoJSON file of polygons. Every property that differs per feature becomes a key type, so a table joins on whichever column matches. The projection is an equal-area one chosen from the extent. Files in metres are refused with the command that reprojects them. `graticule join` and `graticule init` take `--boundaries`, and the playground takes the file next to the table.
- Tables that are not UTF-8. A Big5, Shift_JIS, EUC-KR, GBK or Windows-1252 file is read as Windows-1252 with a `table-encoding` warning. `--encoding` and `data.encoding` name the real encoding, and the playground shows an encoding picker. UTF-16 with a byte order mark is read as UTF-16.
- Real-world spellings join: Associated Press state abbreviations, Taiwan county names from before 2014 and bare city names, Korean provinces renamed in 2023 and 2024, romanised Japanese suffixes. Names that fit two areas, such as Chiayi, are reported with both candidates.
- Key columns. A text column that names the most areas wins over a column of numbers that happen to look like codes, value columns are never keys, and `--key-type` picks the column by the requested type.
- Playground: the region picker works (it used to snap back), the export buttons show their names instead of message keys, the Fix button stays inside the card on a phone, the map is one tab stop with arrow keys, findings link to their field, singular messages read correctly in five languages, and an axe check runs in both themes.
- Messages for the new features are translated in all nine languages.

## 0.1.0 (2026-10-10)

First release.

- Skill for coding agents (`skills/graticule`) and a command line program with the commands render, check, join, init, regions, projections, palettes and rules. It needs Node 20 or newer and no network.
- Map types: choropleth, proportional symbols, categorical, locator with a globe inset and small multiples.
- Regions: world, six continents, US states and counties (Albers with Alaska, Hawaii and Puerto Rico), Taiwan counties and townships, Japan prefectures, South Korea provinces.
- Join engine for country names in nine languages, ISO codes, FIPS, Taiwan and Japan codes, with an unmatched-rows report.
- 25 rules with reasons and fixes, among them raw counts, Mercator, class count, palette lightness order, colour vision separation and silent join drops.
- Outputs: SVG with embedded font subsets, PNG at 96 or 300 dpi, vector PDF, interactive HTML.
- Browser playground with nine interface languages, deployed on GitHub Pages.
- Gallery of 16 maps built from public data.
