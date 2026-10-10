# Regions and projections

Generated from the code by scripts/build-docs.mjs.

| Region | Level | Default projection | Key types | Population bundled |
| --- | --- | --- | --- | --- |
| `world` | country | equal-earth | iso3, iso2, isonum, name | yes |
| `europe` | country | azimuthal-equal-area | iso3, iso2, isonum, name | yes |
| `asia` | country | conic-equal-area | iso3, iso2, isonum, name | yes |
| `africa` | country | azimuthal-equal-area | iso3, iso2, isonum, name | yes |
| `north-america` | country | albers | iso3, iso2, isonum, name | yes |
| `south-america` | country | azimuthal-equal-area | iso3, iso2, isonum, name | yes |
| `oceania` | country | azimuthal-equal-area | iso3, iso2, isonum, name | yes |
| `us-states` | state | albers-usa | fips, postal, name | yes |
| `us-counties` | county | albers-usa | fips | yes |
| `tw-counties` | county | azimuthal-equal-area | code, name | no |
| `tw-towns` | town | azimuthal-equal-area | code, name | no |
| `jp-prefectures` | prefecture | conic-equal-area | iso, jis, name | no |
| `kr-provinces` | province | conic-equal-area | iso, name | no |

Key types: `iso3`, `iso2` and `isonum` are ISO 3166-1 codes, `fips` are US FIPS codes (a county code is five digits and a missing leading zero is added back), `postal` is the US state abbreviation, `code` is the Taiwan Ministry of the Interior code, `iso` is ISO 3166-2 such as JP-13, `jis` is the Japanese prefecture number, `name` is any spelling in the nine label languages plus common aliases: World Bank, UN, IMF, WHO and everyday names for countries, and for the other regions the Associated Press state abbreviations (`Calif.`, `N.Y.`), Taiwan county names from before 2014 and bare city names (`Taipei`, `New Taipei`), the Korean provinces renamed in 2023 and 2024 and romanised Japanese suffixes (`Osaka-fu`, `Fukuoka-ken`). A name that fits two areas, such as `Chiayi`, is reported, never guessed.

Not in the table: `custom` draws boundaries from your own GeoJSON or TopoJSON file, see [config.md](config.md). Its projection is chosen from the extent of the file, and its key types are the properties of the file.

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
| `equal-earth` | yes | Equal-area world projection (Savric, Patterson, Jenny 2018). |
| `mollweide` | yes | Equal-area, strong shape distortion near the edges. |
| `natural-earth` | no | Compromise projection, mild area distortion. |
| `robinson` | no | Compromise projection. |
| `winkel-tripel` | no | Compromise projection. |
| `mercator` | no | Conformal, area grows with latitude. |
| `equirectangular` | no | Plate carree. |
| `albers` | yes | Albers equal-area conic. |
| `conic-equal-area` | yes | Equal-area conic, parameters per region. |
| `azimuthal-equal-area` | yes | Lambert azimuthal equal-area. |
| `transverse-mercator` | no | Conformal, accurate near the central meridian. |
| `orthographic` | no | Globe view. |
| `albers-usa` | yes | Albers equal-area with Alaska, Hawaii and Puerto Rico insets. |
