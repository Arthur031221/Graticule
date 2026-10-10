# Changelog

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
