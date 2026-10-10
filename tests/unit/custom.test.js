import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { topology } from "topojson-server";
import { loadCustomAreas } from "../../src/custom.js";
import { build, errors, fixture, ids } from "./helpers.js";

const readFixture = (path) => readFile(fixture(path), "utf8");
const squares = JSON.parse(await readFixture("squares.geojson"));

const spec = (extra = {}, data = {}) => ({
  title: "Squares",
  source: "Made up",
  region: "custom",
  boundaries: { file: "squares.geojson" },
  data: { file: "squares.csv", key: "region", value: "score", kind: "rate", label: "Score", ...data },
  ...extra,
});

test("polygons from a GeoJSON file join a table by name and are drawn", async () => {
  const result = await build(spec());
  assert.deepEqual(errors(result), []);
  assert.equal(result.analysis.join.rowsMatched, 4);
  assert.equal(result.analysis.join.kind, "name");
  assert.equal(result.analysis.areas.length, 4);
  assert.ok(result.scene);
  const svg = result.scene.items.flatMap((i) => (i.id === "areas" ? i.children : []));
  assert.equal(svg.length, 4);
});

test("features without a polygon are reported, not dropped silently", async () => {
  const result = await build(spec());
  const finding = result.findings.find((f) => f.id === "boundaries-skipped");
  assert.equal(finding.level, "warn");
  assert.match(finding.message, /^2 features of squares\.geojson are not drawn because they have no polygon/);
});

test("rings that wind either way give the area of the square, not the rest of the sphere", async () => {
  const { areas } = await loadCustomAreas({ file: "squares.geojson" }, readFixture);
  const R = 6371.0088;
  const box = (south, north) =>
    R ** 2 * ((2 * Math.PI) / 180) * (Math.sin((north * Math.PI) / 180) - Math.sin((south * Math.PI) / 180));
  // North West winds counter-clockwise (the GeoJSON standard), South West clockwise (what d3 expects).
  assert.ok(Math.abs(areas[0].areaKm2 / box(52, 54) - 1) < 0.005, String(areas[0].areaKm2));
  assert.ok(Math.abs(areas[2].areaKm2 / box(50, 52) - 1) < 0.005, String(areas[2].areaKm2));
});

test("every property that differs per feature is a key type of its own", async () => {
  const { areas, region } = await loadCustomAreas({ file: "squares.geojson" }, readFixture);
  assert.deepEqual(region.keys, ["name", "code", "pop", "slug"]);
  assert.deepEqual(areas[0].keys.code.sort(), ["01", "1"]);
  const byCode = await build(
    spec({}, { file: undefined, csv: "code,score\n1,3.5\n2,1.2\n03,4.8\n4,2.9\n", key: "code" }),
  );
  assert.equal(byCode.analysis.join.kind, "code");
  assert.equal(byCode.analysis.join.rowsMatched, 4);
});

test("data.keyType picks the property to join on", async () => {
  const result = await build(
    spec(
      {},
      {
        csv: "s,score\nnorth-west,3.5\nnorth-east,1.2\nsouth-west,4.8\nsouth-east,2.9\n",
        file: undefined,
        key: "s",
        keyType: "slug",
      },
    ),
  );
  assert.equal(result.analysis.join.rowsMatched, 4);
  const wrong = await build(spec({}, { keyType: "nope" }));
  assert.ok(errors(wrong).includes("spec"));
});

test("boundaries.name, key and population are used when given", async () => {
  const geojson = structuredClone(squares);
  geojson.features.forEach((f) => (f.properties.label = `Zone ${f.properties.code}`));
  const result = await build(
    spec(
      { boundaries: { geojson, name: "label", key: "code", population: "pop" } },
      {
        csv: "zone,people\nZone 01,5\nZone 02,6\nZone 03,7\nZone 04,8\n",
        file: undefined,
        key: "zone",
        value: "people",
        kind: "count",
        normalize: { by: "population", per: 1000 },
        label: "People per 1,000",
      },
    ),
  );
  assert.deepEqual(errors(result), []);
  assert.equal(result.analysis.join.rowsMatched, 4);
  assert.equal(result.analysis.areas[0].names[0], "Zone 01");
  assert.equal(result.analysis.areas[0].pop, 1200000);
});

test("raw counts on custom boundaries are fixed by population when the file has it, and say what is missing when not", async () => {
  const counts = { file: "squares.csv", key: "region", value: "people", kind: "count", label: "People" };
  const withPopulation = await build(spec({ boundaries: { file: "squares.geojson", population: "pop" } }, counts), {
    fix: true,
  });
  assert.deepEqual(errors(withPopulation), []);
  assert.ok(withPopulation.fixes.some((f) => f.rule === "raw-counts"));
  const without = await build(spec({}, counts), { fix: true });
  assert.ok(errors(without).includes("raw-counts"));
  const byArea = await build(spec({}, { ...counts, normalize: { by: "area", per: 1 }, label: "People per km2" }));
  assert.deepEqual(errors(byArea), []);
});

test("a TopoJSON topology is read, with the object named or the only one", async () => {
  const topo = topology({ squares: { type: "FeatureCollection", features: squares.features.slice(0, 4) } });
  const result = await build(spec({ boundaries: { geojson: topo } }));
  assert.deepEqual(errors(result), []);
  assert.equal(result.analysis.join.rowsMatched, 4);
  const two = topology({ a: squares, b: squares });
  const unclear = await build(spec({ boundaries: { geojson: two } }));
  assert.ok(errors(unclear).includes("spec"));
  assert.match(unclear.findings.find((f) => f.id === "spec").message, /boundaries\.object must name one of: a, b/);
  const named = await build(spec({ boundaries: { geojson: two, object: "b" } }));
  assert.deepEqual(errors(named), []);
});

test("coordinates in metres are refused with the command that reprojects them", async () => {
  const result = await build(spec({ boundaries: { file: "utm.geojson" } }));
  assert.ok(errors(result).includes("spec"));
  assert.match(
    result.findings.find((f) => f.id === "spec").message,
    /not longitude and latitude.*ogr2ogr -t_srs EPSG:4326/,
  );
});

test("a missing file, invalid JSON and a file with no polygons each say so", async () => {
  const missing = await build(spec({ boundaries: { file: "nope.geojson" } }));
  assert.match(missing.findings.find((f) => f.id === "spec").message, /cannot read the boundaries file nope\.geojson/);
  const broken = await build(spec({ boundaries: { file: "squares.csv" } }));
  assert.match(broken.findings.find((f) => f.id === "spec").message, /squares\.csv is not valid JSON/);
  const points = { type: "FeatureCollection", features: [squares.features[4]] };
  const none = await build(spec({ boundaries: { geojson: points } }));
  assert.match(none.findings.find((f) => f.id === "spec").message, /no polygons/);
});

test("the spec says what is wrong with boundaries", async () => {
  const noBoundaries = await build(spec({ boundaries: undefined }));
  assert.match(noBoundaries.findings.find((f) => f.id === "spec").message, /boundaries/);
  const both = await build(spec({ boundaries: { file: "squares.geojson", geojson: squares } }));
  assert.match(both.findings.find((f) => f.id === "spec").message, /exactly one of file or geojson/);
  const stray = await build(
    spec({ region: "world", data: { rows: [{ iso3: "FRA", v: 1 }], key: "iso3", value: "v" } }),
  );
  assert.match(stray.findings.find((f) => f.id === "spec").message, /only used with region "custom"/);
  const typo = await build(spec({ boundaries: { file: "squares.geojson", nmae: "name" } }));
  assert.ok(ids(typo).includes("spec-unknown-key"));
  const wrongName = await build(spec({ boundaries: { file: "squares.geojson", name: "nope" } }));
  assert.match(wrongName.findings.find((f) => f.id === "spec").message, /no feature has the property "nope"/);
});

test("the projection follows the extent: azimuthal for a small place, conic for a wide band, Equal Earth for the world", async () => {
  const small = await loadCustomAreas({ geojson: squares }, readFixture);
  assert.equal(small.region.projection.name, "azimuthal-equal-area");
  const box = (w, s, e, n) => ({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "Band" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [w, s],
              [e, s],
              [e, n],
              [w, n],
              [w, s],
            ],
          ],
        },
      },
    ],
  });
  const wide = await loadCustomAreas({ geojson: box(-120, 30, -70, 48) }, readFixture);
  assert.equal(wide.region.projection.name, "conic-equal-area");
  const world = await loadCustomAreas({ geojson: box(-170, -60, 170, 80) }, readFixture);
  assert.equal(world.region.projection, "equal-earth");
});

test("the boundary credit appears in the footer when one is given", async () => {
  const result = await build(spec({ boundaries: { file: "squares.geojson", credit: "Example Survey (CC0)" } }));
  const texts = JSON.stringify(result.scene.items);
  assert.match(texts, /Boundaries: Example Survey \(CC0\)/);
});

const polygon = (name, ring, extra = {}, id) => ({
  type: "Feature",
  ...(id === undefined ? {} : { id }),
  properties: { name, ...extra },
  geometry: { type: "Polygon", coordinates: Array.isArray(ring[0][0]) ? ring : [ring] },
});
const collection = (...features) => ({ type: "FeatureCollection", features });
const R = 6371.0088;
const boxKm2 = (south, north, degrees) =>
  R ** 2 * ((degrees * Math.PI) / 180) * (Math.sin((north * Math.PI) / 180) - Math.sin((south * Math.PI) / 180));

test("a property called constructor, toString or __proto__ is only a property", async () => {
  const geojson = JSON.parse(
    '{"type":"FeatureCollection","features":[' +
      '{"type":"Feature","properties":{"name":"A","constructor":"x1","toString":"y1","__proto__":"z1"},"geometry":{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}},' +
      '{"type":"Feature","properties":{"name":"B","constructor":"x2","toString":"y2","__proto__":"z2"},"geometry":{"type":"Polygon","coordinates":[[[2,0],[3,0],[3,1],[2,1],[2,0]]]}}]}',
  );
  const result = await build(
    spec(
      { boundaries: { geojson } },
      { csv: "k,score\nx1,1\nx2,2\n", file: undefined, key: "k", keyType: "constructor" },
    ),
  );
  assert.deepEqual(errors(result), []);
  assert.equal(result.analysis.join.rowsMatched, 2);
});

test("a feature id joins, and names a feature that has no properties", async () => {
  const geojson = collection(
    {
      ...polygon(
        "x",
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
        {},
        101,
      ),
      properties: null,
    },
    {
      ...polygon(
        "x",
        [
          [2, 0],
          [3, 0],
          [3, 1],
          [2, 1],
          [2, 0],
        ],
        {},
        102,
      ),
      properties: null,
    },
  );
  const result = await build(
    spec({ boundaries: { geojson } }, { csv: "area,score\n101,1\n102,2\n", file: undefined, key: "area" }),
  );
  assert.deepEqual(errors(result), []);
  assert.equal(result.analysis.join.rowsMatched, 2);
  assert.deepEqual(
    result.analysis.areas.map((a) => a.names[0]),
    ["101", "102"],
  );
});

test("duplicate ids get suffixes that are themselves unused", async () => {
  const sq = (x) => [
    [x, 0],
    [x + 1, 0],
    [x + 1, 1],
    [x, 1],
    [x, 0],
  ];
  const geojson = collection(
    polygon("West", sq(0), { code: "A" }),
    polygon("Middle", sq(2), { code: "A#2" }),
    polygon("East", sq(4), { code: "A" }),
  );
  const { areas } = await loadCustomAreas({ geojson, key: "code" }, readFixture);
  assert.equal(new Set(areas.map((a) => a.id)).size, 3);
});

test("a polygon wider than a hemisphere keeps its inside", async () => {
  const band = [
    [-170, -60],
    [-90, -60],
    [0, -60],
    [90, -60],
    [170, -60],
    [170, 60],
    [90, 60],
    [0, 60],
    [-90, 60],
    [-170, 60],
    [-170, -60],
  ];
  const { areas } = await loadCustomAreas({ geojson: collection(polygon("Band", band)) }, readFixture);
  // Edges are great-circle arcs on the sphere, so the band covers 10.737 steradians, not a box of parallels.
  const expected = 10.737 * R ** 2;
  assert.ok(Math.abs(areas[0].areaKm2 / expected - 1) < 0.01, `${areas[0].areaKm2} vs ${expected}`);
  const flipped = [...band].reverse();
  const again = await loadCustomAreas({ geojson: collection(polygon("Band", flipped)) }, readFixture);
  assert.ok(Math.abs(again.areas[0].areaKm2 / expected - 1) < 0.01);
});

test("holes are cut out whichever way the file winds the rings", async () => {
  const outer = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ];
  const hole = [
    [4, 4],
    [6, 4],
    [6, 6],
    [4, 6],
    [4, 4],
  ];
  const rev = (ring) => [...ring].reverse();
  const expected = boxKm2(0, 10, 10) - boxKm2(4, 6, 2);
  const windings = {
    "standard (exterior counter-clockwise, hole clockwise)": [outer, rev(hole)],
    "d3 (exterior clockwise, hole counter-clockwise)": [rev(outer), hole],
    "both counter-clockwise": [outer, hole],
    "both clockwise": [rev(outer), rev(hole)],
  };
  for (const [label, rings] of Object.entries(windings)) {
    const { areas } = await loadCustomAreas({ geojson: collection(polygon("Ring", rings)) }, readFixture);
    assert.ok(Math.abs(areas[0].areaKm2 / expected - 1) < 0.01, `${label}: ${areas[0].areaKm2} vs ${expected}`);
  }
});

test("a polygon across the antimeridian has the area of its box", async () => {
  const ring = [
    [170, 0],
    [-170, 0],
    [-170, 10],
    [170, 10],
    [170, 0],
  ];
  const { areas } = await loadCustomAreas({ geojson: collection(polygon("Fiji-ish", ring)) }, readFixture);
  assert.ok(Math.abs(areas[0].areaKm2 / boxKm2(0, 10, 20) - 1) < 0.01, String(areas[0].areaKm2));
});

test("a declared projected coordinate system is refused, WGS84 is accepted", async () => {
  const sq = [
    [0, 0],
    [2, 0],
    [2, 2],
    [0, 2],
    [0, 0],
  ];
  const withCrs = (name) => ({ ...collection(polygon("Square", sq)), crs: { type: "name", properties: { name } } });
  const refused = await build(spec({ boundaries: { geojson: withCrs("urn:ogc:def:crs:EPSG::3857") } }));
  assert.match(refused.findings.find((f) => f.id === "spec").message, /EPSG::3857, not longitude and latitude/);
  const wgs84 = await loadCustomAreas({ geojson: withCrs("urn:ogc:def:crs:OGC:1.3:CRS84") }, readFixture);
  assert.equal(wgs84.areas.length, 1);
  const epsg = await loadCustomAreas({ geojson: withCrs("EPSG:4326") }, readFixture);
  assert.equal(epsg.areas.length, 1);
});

test("a numeric key names its area and joins by name when the feature has nothing else", async () => {
  const sq = (x) => [
    [x, 0],
    [x + 1, 0],
    [x + 1, 1],
    [x, 1],
    [x, 0],
  ];
  const geojson = collection(
    { ...polygon("x", sq(0)), properties: { code: 101 } },
    { ...polygon("x", sq(2)), properties: { code: 102 } },
  );
  const { areas } = await loadCustomAreas({ geojson, key: "code" }, readFixture);
  assert.deepEqual(
    areas.map((a) => a.names[0]),
    ["101", "102"],
  );
  const result = await build(
    spec(
      { boundaries: { geojson, key: "code" } },
      { csv: "k,score\n101,1\n102,2\n", file: undefined, key: "k", keyType: "name" },
    ),
  );
  assert.equal(result.analysis.join.rowsMatched, 2);
});

test("every spelling of the WGS84 coordinate system is accepted, projected ones are not", async () => {
  const sq = [
    [0, 0],
    [2, 0],
    [2, 2],
    [0, 2],
    [0, 0],
  ];
  const withCrs = (name) => ({ ...collection(polygon("Square", sq)), crs: { type: "name", properties: { name } } });
  for (const name of [
    "EPSG:4326",
    "urn:ogc:def:crs:EPSG::4326",
    "urn:ogc:def:crs:EPSG:6.6:4326",
    "http://www.opengis.net/def/crs/EPSG/0/4326",
    "urn:ogc:def:crs:OGC:1.3:CRS84",
    "urn:ogc:def:crs:OGC::CRS84",
    "WGS 84",
  ]) {
    const { areas } = await loadCustomAreas({ geojson: withCrs(name) }, readFixture);
    assert.equal(areas.length, 1, name);
  }
  for (const name of [
    "EPSG:3857",
    "urn:ogc:def:crs:EPSG::32633",
    "EPSG:43260",
    "http://www.opengis.net/def/crs/EPSG/0/2154",
  ])
    await assert.rejects(loadCustomAreas({ geojson: withCrs(name) }, readFixture), /not longitude and latitude/, name);
});
