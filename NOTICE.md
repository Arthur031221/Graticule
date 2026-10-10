# Third-party notices

Graticule is MIT licensed (see LICENSE). It bundles or derives from the work below. Each item keeps its own license.

## Geography

- Natural Earth, public domain. Country, Japan prefecture and South Korea province boundaries and names. https://www.naturalearthdata.com
- US Census Bureau cartographic boundary files, 2017 edition, public domain, redistributed as TopoJSON by us-atlas (ISC, Mike Bostock). Population estimates for 2023 from the Census Bureau, public domain.
- Taiwan Ministry of the Interior boundary files for counties, cities and townships, published under the Open Government Data License 1.0 (compatible with CC BY 4.0), redistributed as TopoJSON by taiwan-atlas 2021.9.20 (MIT, Daniel Kao).

## Fonts

- Noto Sans and Noto Sans CJK, copyright Google, SIL Open Font License 1.1. The subsets in skills/graticule/fonts keep that license. The license text is in skills/graticule/fonts/LICENSE-OFL-1.1.

## Colors

- ColorBrewer, copyright Cynthia Brewer, Mark Harrower and The Pennsylvania State University, Apache License 2.0, through d3-scale-chromatic (ISC). The viridis family comes from the same package. Okabe and Ito (2008) and Paul Tol's bright scheme are published color sets.

## Code bundled into the program and the playground

- d3-geo, d3-geo-projection, d3-array, d3-color, topojson-client and polylabel, ISC license. Copyright Mike Bostock and contributors, Mapbox and contributors.
- pdfkit and its dependencies (fontkit, linebreak, png-js and others), MIT license.
- buffer, MIT license (browser build only).
- resvg compiled to WebAssembly (@resvg/resvg-wasm 2.6.2), Mozilla Public License 2.0, unmodified. Source: https://github.com/yisibl/resvg-js and https://github.com/linebender/resvg. The binary is skills/graticule/vendor/resvg.wasm.
- HarfBuzz subsetter compiled to WebAssembly (harfbuzzjs 1.6.3), MIT license, unmodified. The binary is skills/graticule/vendor/harfbuzz-subset.wasm.

## Data used by the examples and the checks

- World Bank Open Data, CC BY 4.0. WHO COVID-19 dashboard data, CC BY 4.0. US Bureau of Labor Statistics data via plotly/datasets, public domain. datasets/country-codes, PDDL. Each map in the gallery names its source.
