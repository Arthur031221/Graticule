import { geoArea, geoBounds, geoCentroid } from "d3-geo";
import { feature as topoFeature } from "topojson-client";
import { nameVariants } from "./names.js";

const EARTH_RADIUS_KM = 6371.0088;
const NAME_PROPERTIES = ["name", "name_en", "name_1", "admin", "label", "title", "nom", "nombre"];
const MAX_KIND_LENGTH = 80;
const MAX_KINDS = 12;

/**
 * The message of a boundary file that cannot be used. The spec findings carry it.
 */
export class BoundaryError extends Error {}

/**
 * Reads the boundaries a spec brings: GeoJSON or TopoJSON, from a file or inline.
 * Every property whose value is different on every feature becomes a key type
 * of its own, so a table can join on whichever column matches. The display
 * name feeds the `name` key, which folds case, accents and punctuation.
 * @param {any} boundaries spec.boundaries
 * @param {(path: string) => Promise<string | { text: string }>} readText
 * @returns {Promise<{ areas: import("./geo.js").Area[], borders: null, region: any, skipped: number, file: string }>}
 */
export async function loadCustomAreas(boundaries, readText) {
  const file = boundaries.file ?? "";
  const source = boundaries.geojson ?? (await readJson(file, readText));
  const { features, skipped: dropped } = featuresOf(source, boundaries.object);
  const polygons = features.filter(
    (f) => /^(Multi)?Polygon$/.test(f.geometry?.type ?? "") && hasCoordinates(f.geometry),
  );
  const skipped = dropped + features.length - polygons.length;
  if (!polygons.length)
    throw new BoundaryError("the boundaries have no polygons: each feature needs a Polygon or MultiPolygon geometry");
  for (const f of polygons) checkCoordinates(f.geometry);

  // A feature id is a property too, unless the properties already have an "id".
  const rows = polygons.map((f) => ({ ...(text(f.id) ? { id: f.id } : {}), ...(f.properties ?? {}) }));
  const idProperty = chooseId(boundaries, polygons, rows);
  const nameProperty = chooseName(boundaries, rows);
  const kinds = chooseKinds(boundaries, rows, nameProperty);
  const populationProperty = boundaries.population;
  if (populationProperty && !rows.some((r) => numeric(r[populationProperty]) !== null))
    throw new BoundaryError(`boundaries.population: no feature has a number in the property "${populationProperty}"`);

  const used = new Set();
  const areas = polygons.map((f, i) => {
    const geometry = rewind(f.geometry);
    const props = rows[i];
    const label = String(props[nameProperty] ?? props.id ?? `Area ${i + 1}`).trim();
    const wanted = String(idProperty === "" ? (f.id ?? i + 1) : (props[idProperty] ?? f.id ?? i + 1)).trim();
    let id = wanted;
    for (let n = 2; used.has(id); n++) id = `${wanted}#${n}`;
    used.add(id);
    // No prototype: a property may be called "constructor" or "__proto__".
    /** @type {Record<string, string[]>} */
    const keys = Object.assign(Object.create(null), { name: [...new Set(nameVariants(label))] });
    for (const kind of kinds) {
      const raw = String(props[kind]).trim();
      keys[kind] = [...new Set([raw, raw.replace(/^0+(?=\d)/, "")])];
    }
    const wrapped = { type: "Feature", properties: {}, geometry };
    return {
      id,
      names: [label],
      alt: [],
      keys,
      pop: populationProperty ? (numeric(props[populationProperty]) ?? undefined) : undefined,
      areaKm2: geoArea(/** @type {any} */ (wrapped)) * EARTH_RADIUS_KM ** 2,
      geometry,
      props,
    };
  });

  const collection = {
    type: "FeatureCollection",
    features: areas.map((a) => ({ type: "Feature", properties: {}, geometry: a.geometry })),
  };
  const bounds = geoBounds(/** @type {any} */ (collection));
  const region = {
    file: "",
    object: "",
    level: "custom",
    projection: chooseProjection(collection, bounds),
    bounds: [bounds[0][0], bounds[0][1], bounds[1][0], bounds[1][1]],
    keys: ["name", ...kinds],
    title: boundaries.title ?? "Custom boundaries",
    population: Boolean(populationProperty),
    markers: true,
    credit: boundaries.credit ? `Boundaries: ${boundaries.credit}` : "",
  };
  return { areas, borders: null, region, skipped, file };
}

async function readJson(file, readText) {
  let text;
  try {
    const read = await readText(file);
    text = typeof read === "string" ? read : read.text;
  } catch (error) {
    throw new BoundaryError(`cannot read the boundaries file ${file}: ${error.message}`);
  }
  try {
    return JSON.parse(text.replace(/^﻿/, ""));
  } catch (error) {
    throw new BoundaryError(`${file} is not valid JSON: ${error.message}`);
  }
}

/** The features of a GeoJSON or TopoJSON document, and how many items had to be dropped on the way. */
function featuresOf(source, objectName) {
  if (!source || typeof source !== "object")
    throw new BoundaryError("the boundaries must be a GeoJSON or TopoJSON object");
  if (source.type === "Topology") {
    const names = Object.keys(source.objects ?? {});
    const name = objectName ?? (names.length === 1 ? names[0] : "");
    if (!name || !source.objects?.[name])
      throw new BoundaryError(
        objectName
          ? `boundaries.object "${objectName}" is not in the TopoJSON. Objects: ${names.join(", ")}`
          : `the TopoJSON has ${names.length} objects, so boundaries.object must name one of: ${names.join(", ")}`,
      );
    const out = topoFeature(source, source.objects[name]);
    return { features: out.type === "FeatureCollection" ? out.features : [out], skipped: 0 };
  }
  const crs = source.crs?.properties?.name;
  if (crs && !/crs84|epsg:{1,2}4326|wgs ?84/i.test(String(crs)))
    throw new BoundaryError(
      `the file declares the coordinate system ${crs}, not longitude and latitude (WGS84). Reproject it first, for example: ogr2ogr -t_srs EPSG:4326 out.geojson in.geojson`,
    );
  if (source.type === "FeatureCollection" && Array.isArray(source.features))
    return { features: source.features.filter((f) => f && f.type === "Feature"), skipped: 0 };
  if (source.type === "Feature") return { features: [source], skipped: 0 };
  throw new BoundaryError(
    `the boundaries are a ${source.type ?? "value"} with no features: give a GeoJSON FeatureCollection or a TopoJSON topology`,
  );
}

const hasCoordinates = (geometry) => Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0;

/** Longitude and latitude only: a file in metres (UTM, Web Mercator) would draw as a speck or not at all. */
function checkCoordinates(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const polygon of polygons)
    for (const ring of polygon)
      for (const [x, y] of ring)
        if (!(x >= -180 && x <= 180 && y >= -90 && y <= 90))
          throw new BoundaryError(
            `the coordinates are not longitude and latitude in degrees (found ${x}, ${y}). Reproject the file first, for example: ogr2ogr -t_srs EPSG:4326 out.geojson in.geojson`,
          );
}

/**
 * Signed area of a ring on the longitude and latitude plane, with the longitudes
 * unwrapped across the antimeridian. A ring that does not close once unwrapped goes
 * round a pole, which the plane cannot judge.
 * @param {number[][]} ring
 */
function planarArea(ring) {
  let sum = 0;
  let x = ring[0][0];
  const first = x;
  for (let i = 1; i < ring.length; i++) {
    let step = ring[i][0] - ring[i - 1][0];
    if (step > 180) step -= 360;
    else if (step < -180) step += 360;
    sum += x * ring[i][1] - (x + step) * ring[i - 1][1];
    x += step;
  }
  return { area: sum / 2, aroundPole: Math.abs(x - first) >= 180 };
}

/**
 * d3 reads an exterior ring that winds clockwise and a hole that winds counter-clockwise,
 * the reverse of the GeoJSON standard, and files in the wild use either. Every ring is
 * turned to d3's way by its own winding. A polygon round a pole has no winding on the
 * plane, so it is judged by the area it covers: more than a hemisphere means it was
 * written the other way.
 */
function rewind(geometry) {
  const fix = (polygon) => {
    const rings = polygon.map(planarArea);
    if (rings.some((r) => r.aroundPole)) {
      const covered = geoArea(/** @type {any} */ ({ type: "Polygon", coordinates: polygon }));
      return covered > 2 * Math.PI ? polygon.map((ring) => [...ring].reverse()) : polygon;
    }
    return polygon.map((ring, i) => {
      const counterClockwise = rings[i].area > 0;
      const exterior = i === 0;
      return rings[i].area !== 0 && counterClockwise === exterior ? [...ring].reverse() : ring;
    });
  };
  return geometry.type === "Polygon"
    ? { type: "Polygon", coordinates: fix(geometry.coordinates) }
    : { type: "MultiPolygon", coordinates: geometry.coordinates.map(fix) };
}

const text = (value) => (typeof value === "string" || typeof value === "number") && String(value).trim() !== "";

function numeric(value) {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, ""));
  return String(value ?? "").trim() !== "" && Number.isFinite(n) ? n : null;
}

/** Properties that hold a different short value on every feature. */
function uniqueProperties(rows) {
  const names = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return names.filter((name) => {
    if (!rows.every((r) => text(r[name]) && String(r[name]).length <= MAX_KIND_LENGTH)) return false;
    return new Set(rows.map((r) => String(r[name]).trim())).size === rows.length;
  });
}

function chooseName(boundaries, rows) {
  if (boundaries.name) {
    if (!rows.some((r) => r[boundaries.name] !== undefined))
      throw new BoundaryError(`boundaries.name: no feature has the property "${boundaries.name}"`);
    return boundaries.name;
  }
  const names = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const labelled = NAME_PROPERTIES.map((p) => names.find((n) => n.toLowerCase() === p)).find(Boolean);
  if (labelled) return labelled;
  return (
    uniqueProperties(rows).find((p) => rows.some((r) => numeric(r[p]) === null)) ??
    names.find((p) => rows.some((r) => numeric(r[p]) === null && text(r[p]))) ??
    ""
  );
}

function chooseId(boundaries, features, rows) {
  if (boundaries.key) {
    if (!rows.some((r) => r[boundaries.key] !== undefined))
      throw new BoundaryError(`boundaries.key: no feature has the property "${boundaries.key}"`);
    return boundaries.key;
  }
  if (features.every((f) => text(f.id))) return "";
  return uniqueProperties(rows)[0] ?? "";
}

/** Every property that differs on each feature, the name property aside, is a key type: the one asked for first. */
function chooseKinds(boundaries, rows, nameProperty) {
  const unique = uniqueProperties(rows).filter(
    (p) => p !== nameProperty && p !== boundaries.population && p !== "name",
  );
  const first = unique.includes(boundaries.key) ? [boundaries.key] : [];
  return [...new Set([...first, ...unique])].slice(0, MAX_KINDS);
}

/**
 * An equal-area projection centred on the data: Equal Earth for a world sized
 * extent, an equal-area conic for a wide band, otherwise Lambert azimuthal.
 * Shading by area is only fair in an equal-area projection.
 */
function chooseProjection(collection, bounds) {
  const [[west, south], [east, north]] = bounds;
  const lon = east >= west ? east - west : east - west + 360;
  const lat = north - south;
  const [cx, cy] = geoCentroid(/** @type {any} */ (collection));
  if (lon >= 180 || lat >= 100) return "equal-earth";
  if (lon > 40 && lat < 80 && Math.abs(cy) < 65)
    return {
      name: "conic-equal-area",
      parallels: [south + lat / 6, north - lat / 6],
      rotate: [-cx, 0],
      center: [0, cy],
    };
  return { name: "azimuthal-equal-area", rotate: [-cx, -cy] };
}
