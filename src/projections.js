import {
  geoAlbers,
  geoAzimuthalEqualArea,
  geoConicEqualArea,
  geoEqualEarth,
  geoEquirectangular,
  geoMercator,
  geoNaturalEarth1,
  geoOrthographic,
  geoPath,
  geoTransverseMercator,
} from "d3-geo";
import { geoMollweide, geoRobinson, geoWinkel3 } from "d3-geo-projection";
import { composite } from "./composite.js";

/**
 * Projection catalogue. `equalArea` decides whether shading by area is fair,
 * `distortion` names what the projection gives up.
 * @type {Record<string, { make: (opts?: any) => any, equalArea: boolean, conformal?: boolean, note: string }>}
 */
export const PROJECTIONS = {
  "equal-earth": {
    make: () => geoEqualEarth(),
    equalArea: true,
    note: "Equal-area world projection (Savric, Patterson, Jenny 2018).",
  },
  mollweide: {
    make: () => geoMollweide(),
    equalArea: true,
    note: "Equal-area, strong shape distortion near the edges.",
  },
  "natural-earth": {
    make: () => geoNaturalEarth1(),
    equalArea: false,
    note: "Compromise projection, mild area distortion.",
  },
  robinson: { make: () => geoRobinson(), equalArea: false, note: "Compromise projection." },
  "winkel-tripel": { make: () => geoWinkel3(), equalArea: false, note: "Compromise projection." },
  mercator: {
    make: () => geoMercator(),
    equalArea: false,
    conformal: true,
    note: "Conformal, area grows with latitude.",
  },
  equirectangular: { make: () => geoEquirectangular(), equalArea: false, note: "Plate carree." },
  albers: {
    make: ({ parallels = [29.5, 45.5], rotate = [96, 0], center = [0, 38] } = {}) =>
      geoAlbers().parallels(parallels).rotate(rotate).center(center),
    equalArea: true,
    note: "Albers equal-area conic.",
  },
  "conic-equal-area": {
    make: ({ parallels = [20, 50], rotate = [-100, 0], center = [0, 35] } = {}) =>
      geoConicEqualArea().parallels(parallels).rotate(rotate).center(center),
    equalArea: true,
    note: "Equal-area conic, parameters per region.",
  },
  "azimuthal-equal-area": {
    make: ({ rotate = [0, 0] } = {}) => geoAzimuthalEqualArea().rotate(rotate),
    equalArea: true,
    note: "Lambert azimuthal equal-area.",
  },
  "transverse-mercator": {
    make: ({ meridian = 0 } = {}) => geoTransverseMercator().rotate([-meridian, 0]),
    equalArea: false,
    conformal: true,
    note: "Conformal, accurate near the central meridian.",
  },
  orthographic: {
    make: ({ rotate = [0, 0] } = {}) => geoOrthographic().rotate(rotate),
    equalArea: false,
    note: "Globe view.",
  },
  "albers-usa": {
    make: () => composite("us"),
    equalArea: true,
    note: "Albers equal-area with Alaska, Hawaii and Puerto Rico insets.",
  },
};

/**
 * @param {string | { name: string }} spec projection name or object
 */
export function createProjection(spec) {
  const { name, ...opts } = typeof spec === "string" ? { name: spec } : spec;
  const entry = PROJECTIONS[name];
  if (!entry) throw new Error(`unknown projection "${name}". Known: ${Object.keys(PROJECTIONS).join(", ")}`);
  return entry.make(opts);
}

/** Fits a projection (including composites) to a frame, centring the object. */
/**
 * @param {any} projection
 * @param {number[][]} extent [[x0, y0], [x1, y1]]
 * @param {any} object
 */
export function fitExtent(projection, [[x0, y0], [x1, y1]], object) {
  const width = x1 - x0;
  const height = y1 - y0;
  projection.scale(150).translate([0, 0]);
  const [[bx0, by0], [bx1, by1]] = geoPath(projection).bounds(object);
  const k = Math.min(width / (bx1 - bx0), height / (by1 - by0));
  projection.scale(150 * k).translate([x0 + (width - k * (bx1 + bx0)) / 2, y0 + (height - k * (by1 + by0)) / 2]);
  return projection;
}

/** Fits to a width and returns the height the object needs at that width. */
export function fitWidth(projection, width, object) {
  projection.scale(150).translate([0, 0]);
  const [[bx0, by0], [bx1, by1]] = geoPath(projection).bounds(object);
  const k = width / (bx1 - bx0);
  projection.scale(150 * k).translate([-k * bx0, -k * by0]);
  return k * (by1 - by0);
}
