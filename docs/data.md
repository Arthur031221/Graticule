# Data, fonts and licenses

Everything Graticule draws from is bundled. Rendering never touches the network.

| Data | Source | License | Notes |
| --- | --- | --- | --- |
| World countries, 1:110m and 1:50m | Natural Earth, nvkelso/natural-earth-vector (master, fetched 2026-10-10) | Public domain | Names in nine languages come from the NAME_xx fields. Taiwan is the one change: Natural Earth gives its official names in Chinese, Japanese and Korean, and Graticule labels it with the plain place name in each language, like the English label. The official names still work as join keys. Population is POP_EST, mostly a 2019 estimate (the year is in the data as POP_YEAR). |
| Japan prefectures, South Korea provinces | Natural Earth 1:10m admin-1 | Public domain | Simplified for map scale. |
| US states and counties | us-atlas 3.0.1 (ISC), which redistributes the US Census Bureau cartographic boundary files, 2017 edition | Public domain (Census Bureau) | Counties created or recoded after 2017 are missing: Connecticut's planning regions (09110 to 09190) and Alaska's Chugach and Copper River census areas (02063, 02066). The old Valdez-Cordova (02261) is present. Rows with the new codes are reported as unmatched. |
| US population | US Census Bureau, Vintage 2023 population estimates, July 1, 2023 | Public domain | Puerto Rico municipios and Connecticut's eight counties have no population in that table, so a per-capita map shows them as no data. |
| Taiwan counties and townships | Ministry of the Interior, Taiwan, via taiwan-atlas 2021.9.20 (MIT) | Open Government Data License 1.0 | English and Traditional Chinese names. County names in other languages come from Natural Earth. |
| Fonts | Noto Sans and Noto Sans CJK, Google | SIL Open Font License 1.1 | Subsets of the regular and bold Latin faces and the regular CJK faces (TC, SC, JP, KR). Only the glyphs a map uses are embedded in each output. |
| Palettes | ColorBrewer (Brewer and Harrower, Pennsylvania State University) through d3-scale-chromatic, and viridis, cividis, magma, plasma | Apache 2.0, and CC0 | Okabe and Ito (2008) and Paul Tol's bright set for categories. |

Natural Earth draws borders as they exist on the ground (de facto). Graticule takes no position on disputed borders and cannot offer every national view.

## Rebuilding

`npm run build:data` downloads the sources again and rewrites `skills/graticule/data`. `npm run build:fonts` rebuilds the font subsets from the installed Noto fonts (needs Python and fontTools). Both are only for maintainers.
