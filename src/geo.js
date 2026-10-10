import { feature, mesh } from "topojson-client";
import { geoArea } from "d3-geo";
import { getRegion } from "./regions.js";
import { langIndex, LANGS } from "./lang.js";
import { nameVariants } from "./names.js";

const EARTH_RADIUS_KM = 6371.0088;

/**
 * @typedef {{
 *   id: string, names: string[], alt: string[], keys: Record<string, string[]>,
 *   pop?: number, areaKm2: number, geometry: any, props: any
 * }} Area
 */

/**
 * Loads the areas of a region from the bundled data.
 * @param {string} regionId
 * @param {{ json: (name: string) => Promise<any> }} assets
 * @returns {Promise<{ areas: Area[], borders: any | null, region: ReturnType<typeof getRegion> }>}
 */
export async function loadAreas(regionId, assets) {
  const region = getRegion(regionId);
  const topo = await assets.json("data/" + region.file);
  const object = topo.objects[region.object];
  const kept = object.geometries.filter((g) => !region.hide?.includes(g.properties.id));
  const collection = feature(topo, { type: "GeometryCollection", geometries: kept });
  const areas = collection.features.map((f) => toArea(region.level, f));
  const borders =
    region.strokeMesh && topo.objects[region.strokeMesh]
      ? mesh(topo, topo.objects[region.strokeMesh], (a, b) => a !== b)
      : null;
  return { areas, borders, region };
}

function toArea(level, f) {
  const p = f.properties;
  const names = p.nm ?? [];
  return {
    id: String(p.id),
    names,
    alt: p.alt ?? [],
    keys: keysFor(level, p, names),
    pop: p.pop,
    areaKm2: geoArea(f) * EARTH_RADIUS_KM ** 2,
    geometry: f.geometry,
    props: p,
  };
}

function keysFor(level, p, names) {
  const all = [...names, ...(p.alt ?? [])].filter(Boolean);
  const spellings = [...new Set(all.flatMap(nameVariants))];
  switch (level) {
    case "country":
      return { iso3: [p.id], iso2: p.a2 ? [p.a2] : [], isonum: p.n3 ? [p.n3] : [], name: spellings };
    case "state":
      return { fips: [p.id], postal: p.postal ? [p.postal] : [], name: spellings };
    case "county":
      return p.iso ? { code: [p.id], name: spellings } : { fips: [p.id], name: [] };
    case "town":
      return {
        code: [p.id],
        name: [
          ...spellings,
          `${p.countyName}${names[1]}`,
          `${p.countyName} ${names[1]}`,
          `${names[0]}, ${p.countyEng}`,
        ],
      };
    case "prefecture":
      return { iso: [p.id], jis: [p.id.slice(3)], name: spellings };
    default:
      return { iso: [p.id], name: spellings };
  }
}

const FALLBACK = {
  "zh-Hans": ["zh-Hans", "zh-Hant", "en"],
  "zh-Hant": ["zh-Hant", "zh-Hans", "en"],
  ja: ["ja", "zh-Hant", "en"],
};

/**
 * Display name of an area in a language, falling back along a short chain
 * when the data has no translation.
 * @param {Area} area
 * @param {string} lang
 */
export function nameIn(area, lang) {
  for (const code of FALLBACK[lang] ?? [lang, "en"]) {
    const name = area.names[langIndex(code)];
    if (name) return name;
  }
  return area.names[0] ?? area.id;
}

/** Name of the same area in every supported language that has one. */
export function allNames(area) {
  return Object.fromEntries(LANGS.map((lang, i) => [lang, area.names[i]]).filter(([, name]) => name));
}
