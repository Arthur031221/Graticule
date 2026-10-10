/**
 * Region catalogue. A region is a set of areas (countries, states, counties)
 * plus the projection that suits it. Boxes are [west, south, east, north].
 * @typedef {{
 *   file: string, object: string, level: "country" | "state" | "county" | "prefecture" | "province" | "town",
 *   projection: string | { name: string, [option: string]: any }, box?: number[], hide?: string[], parent?: string,
 *   keys: string[], title: string, strokeMesh?: string, markers?: boolean,
 *   population?: boolean, insets?: { match: { ids?: string[], county?: string[] }, box: number[], projection: any, place: number[] }[]
 * }} Region
 */

const TAIWAN_BOX = [119.2, 21.7, 122.2, 25.4];
const taiwanInsets = (match) => [
  {
    match: match("09020"),
    box: [118.1, 24.35, 118.62, 24.55],
    projection: { name: "azimuthal-equal-area", rotate: [-118.4, -24.45] },
    place: [0.03, 0.07, 0.24, 0.15],
  },
  {
    match: match("09007"),
    box: [119.85, 25.9, 120.55, 26.45],
    projection: { name: "azimuthal-equal-area", rotate: [-120.2, -26.2] },
    place: [0.03, 0.27, 0.2, 0.17],
  },
];

/** @type {Record<string, Region>} */
export const REGIONS = {
  world: {
    file: "world-50m.json",
    object: "countries",
    level: "country",
    projection: "equal-earth",
    box: [-180, -57, 180, 84],
    hide: ["ATA"],
    keys: ["iso3", "iso2", "isonum", "name"],
    title: "World countries (Natural Earth 1:50m)",
    population: true,
    markers: true,
  },
  europe: {
    parent: "world",
    file: "world-50m.json",
    object: "countries",
    level: "country",
    projection: { name: "azimuthal-equal-area", rotate: [-10, -52] },
    box: [-25, 34, 45, 72],
    hide: ["ATA"],
    keys: ["iso3", "iso2", "isonum", "name"],
    title: "Europe (Lambert azimuthal equal-area)",
    population: true,
    markers: true,
  },
  asia: {
    parent: "world",
    file: "world-50m.json",
    object: "countries",
    level: "country",
    projection: { name: "conic-equal-area", parallels: [15, 60], rotate: [-95, 0], center: [0, 35] },
    box: [25, -11, 150, 56],
    hide: ["ATA"],
    keys: ["iso3", "iso2", "isonum", "name"],
    title: "Asia (conic equal-area)",
    population: true,
    markers: true,
  },
  africa: {
    parent: "world",
    file: "world-50m.json",
    object: "countries",
    level: "country",
    projection: { name: "azimuthal-equal-area", rotate: [-20, -2] },
    box: [-20, -36, 55, 38],
    hide: ["ATA"],
    keys: ["iso3", "iso2", "isonum", "name"],
    title: "Africa (Lambert azimuthal equal-area)",
    population: true,
    markers: true,
  },
  "north-america": {
    parent: "world",
    file: "world-50m.json",
    object: "countries",
    level: "country",
    projection: { name: "albers", parallels: [20, 60], rotate: [100, 0], center: [0, 45] },
    box: [-170, 6, -50, 75],
    hide: ["ATA"],
    keys: ["iso3", "iso2", "isonum", "name"],
    title: "North America (Albers equal-area conic)",
    population: true,
    markers: true,
  },
  "south-america": {
    parent: "world",
    file: "world-50m.json",
    object: "countries",
    level: "country",
    projection: { name: "azimuthal-equal-area", rotate: [60, 15] },
    box: [-83, -57, -33, 14],
    hide: ["ATA"],
    keys: ["iso3", "iso2", "isonum", "name"],
    title: "South America (Lambert azimuthal equal-area)",
    population: true,
    markers: true,
  },
  oceania: {
    parent: "world",
    file: "world-50m.json",
    object: "countries",
    level: "country",
    projection: { name: "azimuthal-equal-area", rotate: [-150, 25] },
    box: [110, -48, 180, 2],
    hide: ["ATA"],
    keys: ["iso3", "iso2", "isonum", "name"],
    title: "Oceania (Lambert azimuthal equal-area)",
    population: true,
    markers: true,
  },
  "us-states": {
    file: "us-states.json",
    object: "states",
    level: "state",
    projection: "albers-usa",
    hide: ["60", "66", "69", "78"],
    keys: ["fips", "postal", "name"],
    title: "United States, states (US Census cartographic boundaries)",
    population: true,
  },
  "us-counties": {
    file: "us-counties.json",
    object: "counties",
    level: "county",
    projection: "albers-usa",
    hide: ["60", "66", "69", "78"],
    keys: ["fips"],
    title: "United States, counties (US Census cartographic boundaries)",
    strokeMesh: "states",
    population: true,
  },
  "tw-counties": {
    file: "tw-counties.json",
    object: "counties",
    level: "county",
    projection: { name: "azimuthal-equal-area", rotate: [-121, -23.7] },
    box: TAIWAN_BOX,
    insets: taiwanInsets((code) => ({ ids: [code] })),
    keys: ["code", "name"],
    title: "Taiwan, counties and cities (Ministry of the Interior)",
  },
  "tw-towns": {
    file: "tw-towns.json",
    object: "towns",
    level: "town",
    projection: { name: "azimuthal-equal-area", rotate: [-121, -23.7] },
    box: TAIWAN_BOX,
    insets: taiwanInsets((code) => ({ county: [code] })),
    keys: ["code", "name"],
    title: "Taiwan, townships and districts (Ministry of the Interior)",
  },
  "jp-prefectures": {
    file: "jp-prefectures.json",
    object: "prefectures",
    level: "prefecture",
    projection: { name: "conic-equal-area", parallels: [30, 45], rotate: [-137, 0], center: [0, 38] },
    box: [128.8, 30, 146.5, 45.8],
    insets: [
      {
        match: { ids: ["JP-47"] },
        box: [122.7, 23.8, 131.5, 28],
        projection: { name: "conic-equal-area", parallels: [24, 28], rotate: [-127.5, 0], center: [0, 26.5] },
        place: [0.66, 0.68, 0.3, 0.28],
      },
    ],
    keys: ["iso", "jis", "name"],
    title: "Japan, prefectures (Natural Earth 1:10m)",
  },
  "kr-provinces": {
    file: "kr-provinces.json",
    object: "provinces",
    level: "province",
    projection: { name: "conic-equal-area", parallels: [33, 38], rotate: [-127.5, 0], center: [0, 36] },
    keys: ["iso", "name"],
    title: "South Korea, provinces and metropolitan cities (Natural Earth 1:10m)",
  },
};

export const REGION_IDS = Object.keys(REGIONS);

/** @returns {Region} */
export function getRegion(id) {
  const region = REGIONS[id];
  if (!region) throw new Error(`unknown region "${id}". Known: ${REGION_IDS.join(", ")}`);
  return region;
}

/** Attribution line for the region's boundaries. */
export const BOUNDARY_CREDIT = {
  world: "Boundaries: Natural Earth (public domain)",
  "us-states": "Boundaries: US Census Bureau (public domain)",
  "us-counties": "Boundaries: US Census Bureau (public domain)",
  "tw-counties": "Boundaries: Ministry of the Interior, Taiwan (Open Government Data License 1.0)",
  "tw-towns": "Boundaries: Ministry of the Interior, Taiwan (Open Government Data License 1.0)",
  "jp-prefectures": "Boundaries: Natural Earth (public domain)",
  "kr-provinces": "Boundaries: Natural Earth (public domain)",
};

export function boundaryCredit(id) {
  const region = getRegion(id);
  return BOUNDARY_CREDIT[region.parent ?? id];
}
