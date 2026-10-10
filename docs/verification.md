# Verification

Every number in the README comes from a check in this repository. `npm run verify` reruns the external ones and rewrites this page. The unit tests (`npm test`) cover the rest. Nothing here compares Graticule with its own assumptions: each check uses a second implementation or the real file format.

## Projections against PROJ

Each of the 12 projections is evaluated at 3,000 seeded random points on a sphere and compared with PROJ. The Albers USA composite is built from conic equal-area projections of the same family and is not listed separately. The unit of the error is metres on the ground.

PROJ 9.8.1 (pyproj 3.8.0), sphere radius 6371008.8 m, 3,000 seeded random points per projection.

| Projection | Points | Median error (m) | Maximum error (m) | Note |
| --- | --- | --- | --- | --- |
| equal-earth | 3000 | 0.000000 | 0.000000 |  |
| mollweide | 3000 | 0.000000 | 0.000010 |  |
| natural-earth | 3000 | 0.000000 | 0.000000 |  |
| robinson | 3000 | 334.631529 | 10189.090019 | compared after fitting one scale factor (1.17827), the tables are interpolated differently |
| winkel-tripel | 3000 | 0.000001 | 0.000001 |  |
| mercator | 3000 | 0.000000 | 0.000000 |  |
| equirectangular | 3000 | 0.000000 | 0.000000 |  |
| albers | 3000 | 0.000000 | 0.000000 |  |
| conic-equal-area | 3000 | 0.000000 | 0.000000 |  |
| azimuthal-equal-area | 3000 | 0.000000 | 0.000000 |  |
| transverse-mercator | 3000 | 0.000000 | 0.000004 |  |
| orthographic | 3000 | 0.000000 | 0.000000 |  |

Robinson is defined by a table of 19 rows. d3 and PROJ normalise it differently, so the two are compared after fitting one scale factor, and they interpolate between rows differently, which is where the 10 km comes from (0.16 percent of the Earth's radius). Every other projection agrees with PROJ to well below a millimetre.

## Joining names to polygons

Names from public tables, joined to Natural Earth 1:50m countries by name only. "Exact match" is the usual shortcut: equal to the English name in Natural Earth. A wrong match is a name that Graticule or the shortcut joined to a country other than the one its own ISO code names. Only names whose country has a polygon at 1:50m are counted.

| Table | Names with a polygon | Exact match with Natural Earth | Graticule |
| --- | --- | --- | --- |
| World Bank country names | 215 | 176 (0 wrong) | 215 (0 wrong) |
| WHO COVID-19 dashboard names | 226 | 192 (0 wrong) | 226 (0 wrong) |
| UN terminology short names | 195 | 158 (0 wrong) | 195 (0 wrong) |
| UN terminology formal names | 195 | 26 (0 wrong) | 166 (0 wrong) |
| ISO 3166 official names | 235 | 202 (0 wrong) | 232 (0 wrong) |
| Unicode CLDR display names | 235 | 203 (0 wrong) | 229 (0 wrong) |

Names Graticule did not match, with the reason that they are spellings it does not know or have no polygon at 1:50m:

- World Bank country names: none
- WHO COVID-19 dashboard names: none
- UN terminology short names: none
- UN terminology formal names: the Argentine Republic / the Central African Republic / the Cook Islands ** / the Czech Republic / the Democratic People's Republic of Korea / the Democratic Republic of the Congo / the Dominican Republic / the French Republic / the Gabonese Republic / the Hellenic Republic / the Holy See * / the Kyrgyz Republic / the Lao People's Democratic Republic / the Lebanese Republic / the United Mexican States / the Federated States of Micronesia / the Republic of the Union of Myanmar / the Portuguese Republic / the Republic of Korea / the Russian Federation / the Democratic Republic of Sao Tome and Principe / the Slovak Republic / the Swiss Confederation / the Syrian Arab Republic / the Democratic Republic of Timor-Leste / the Togolese Republic / the United Arab Emirates / the United Kingdom of Great Britain and Northern Ireland / the Eastern Republic of Uruguay
- ISO 3166 official names: China, Hong Kong Special Administrative Region / China, Macao Special Administrative Region / French Southern Territories
- Unicode CLDR display names: Bosnia / French Southern Territories / Heard & McDonald Islands / St. Martin / St. Vincent & Grenadines / South Georgia & South Sandwich Islands

The aliases were written while looking at the World Bank and WHO lists, so those two rows are not independent. The UN short names led to the rule that ignores "(the)", and the UN formal names to the rule that shortens "the Republic of X". The ISO and CLDR rows were measured before any further change and are the fairest numbers on the page. No list produced a wrong match.

## Telling counts from rates

Raw counts on a choropleth mostly show where people live, so Graticule asks whether the values rank like population. The check is the Spearman rank correlation with the population of each country, with a limit of 0.6. Applied to World Bank indicators (most recent value per country):

Threshold 0.6. Rates flagged as counts: 0 of 25. Counts caught: 8 of 8.

| Kind | Indicator | Countries | Spearman with population | Flagged as raw counts |
| --- | --- | --- | --- | --- |
| rate | Life expectancy (SP.DYN.LE00.IN) | 215 | -0.15 | no |
| rate | Fertility rate (SP.DYN.TFRT.IN) | 215 | 0.14 | no |
| rate | Internet users, % of population (IT.NET.USER.ZS) | 212 | -0.08 | no |
| rate | CO2 per person (EN.GHG.CO2.PC.CE.AR5) | 202 | 0.03 | no |
| rate | GDP per person (NY.GDP.PCAP.CD) | 213 | -0.33 | no |
| rate | Under-5 mortality rate (SH.DYN.MORT) | 196 | 0.13 | no |
| rate | Unemployment, % of labor force (SL.UEM.TOTL.ZS) | 186 | -0.19 | no |
| rate | Urban share of population (SP.URB.TOTL.IN.ZS) | 215 | -0.11 | no |
| rate | Access to electricity, % (EG.ELC.ACCS.ZS) | 214 | -0.25 | no |
| rate | Population growth, % (SP.POP.GROW) | 215 | 0.27 | no |
| rate | GDP growth, % (NY.GDP.MKTP.KD.ZG) | 213 | 0.03 | no |
| rate | Inflation, % (FP.CPI.TOTL.ZG) | 193 | 0.23 | no |
| rate | Health spending, % of GDP (SH.XPD.CHEX.GD.ZS) | 193 | -0.10 | no |
| rate | Birth rate (SP.DYN.CBRT.IN) | 215 | 0.17 | no |
| rate | Death rate (SP.DYN.CDRT.IN) | 215 | -0.07 | no |
| rate | Forest area, % of land (AG.LND.FRST.ZS) | 212 | -0.13 | no |
| rate | Physicians per 1,000 people (SH.MED.PHYS.ZS) | 207 | -0.07 | no |
| rate | Population 65 and over, % (SP.POP.65UP.TO.ZS) | 215 | -0.17 | no |
| rate | Exports, % of GDP (NE.EXP.GNFS.ZS) | 194 | -0.39 | no |
| rate | Education spending, % of GDP (SE.XPD.TOTL.GD.ZS) | 203 | -0.11 | no |
| rate | Energy use per person (EG.USE.PCAP.KG.OE) | 178 | -0.00 | no |
| rate | Suicide mortality rate (SH.STA.SUIC.P5) | 185 | -0.02 | no |
| rate | Poverty headcount ratio, % (SI.POV.DDAY) | 171 | 0.07 | no |
| rate | Infant mortality rate (SP.DYN.IMRT.IN) | 196 | 0.13 | no |
| rate | Tuberculosis incidence per 100,000 people (SH.TBS.INCD) | 208 | 0.27 | no |
| count | Population (SP.POP.TOTL) | 215 | 1.00 | yes |
| count | GDP, current US$ (NY.GDP.MKTP.CD) | 213 | 0.78 | yes |
| count | CO2 emissions, total (EN.GHG.CO2.MT.CE.AR5) | 202 | 0.80 | yes |
| count | Male population (SP.POP.TOTL.MA.IN) | 215 | 1.00 | yes |
| count | Rural population (SP.RUR.TOTL) | 215 | 0.93 | yes |
| count | International migrant stock (SM.POP.TOTL) | 213 | 0.73 | yes |
| count | Primary school pupils (SE.PRM.ENRL) | 209 | 0.97 | yes |
| count | Population aged 0 to 14 (SP.POP.0014.TO) | 215 | 0.97 | yes |

It is a heuristic and the page says so: a rate that really does track population (for example a rate measured in a few huge countries) would be flagged, and `data.kind` settles it either way. A declared kind of rate, share, index or other is never second-guessed.

## Classification and colour

- 45 cases of quantile, equal-interval and Fisher-Jenks classes on five datasets (normal, lognormal, uniform, tied integers, skewed) are compared with mapclassify 2.11.0: the class edges and the number of areas per class agree, and the Jenks within-class variance equals the optimum. The tied-integer Jenks case is compared on variance only, because tied values allow several optimal partitions. The comparison is on the classification itself. The map then moves quantile and Jenks edges to the roundest number that keeps every area in its class, and gives equal intervals a round width, which can move areas between classes.
- 48 colours are converted to CIELAB and compared with colour-science 0.4.7, 24 pairs with its CIEDE2000, and the three colour vision simulations with colorspacious. CIEDE2000 is also checked against four pairs from the published test data of Sharma, Wu and Dalal.

## Output files

Gallery maps are rendered by the command line program and the files re-opened with parsers that share no code with it: ElementTree and fontTools for SVG (every character drawn has a glyph in an embedded font), pypdf for PDF (one page of the right size, every font embedded, the title present in the extracted text) and Pillow for PNG.

```
ok  life-expectancy                svg 1200x757 (58 embedded glyphs)  pdf (2 embedded fonts)  png
ok  taiwan-township-area           svg 1200x1187 (91 embedded glyphs)  pdf (2 embedded fonts)  png
ok  japan-regions                  svg 1200x1176 (110 embedded glyphs)  pdf (2 embedded fonts)  png
ok  korea-capital-region           svg 1200x1176 (78 embedded glyphs)  pdf (3 embedded fonts)  png
ok  fertility-small-multiples      svg 1200x827 (51 embedded glyphs)  pdf (2 embedded fonts)  png
ok  taiwan-locator                 svg 1200x834 (61 embedded glyphs)  pdf (2 embedded fonts)  png
ok  population-symbols             svg 1200x787 (47 embedded glyphs)  pdf (2 embedded fonts)  png
```
