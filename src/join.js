import { parseNumber } from "./csv.js";
import { damagedNamePattern, formalVariants, normalizeName, suggest } from "./names.js";

/**
 * @typedef {import("./geo.js").Area} Area
 * @typedef {{ area: Area, via: "name" | "alias" | "code" }} Entry
 * @typedef {{ kinds: Record<string, Map<string, Entry[]>>, labels: [string, string][], byId: Map<string, Area> }} Index
 */

const CODE_KINDS = new Set(["iso3", "iso2", "isonum", "fips", "postal", "code", "iso", "jis"]);
const PAD = { fips: 0, isonum: 3, jis: 2 };

function normalizeCode(kind, value) {
  const text = String(value).trim().toUpperCase();
  return kind === "isonum" || kind === "jis" ? text.replace(/^0+(?=\d)/, "") : text;
}

/**
 * Builds the lookup tables for a region. Country aliases come from
 * data/aliases.json; every other spelling comes from the boundary data.
 * @param {Area[]} areas
 * @param {Record<string, string>} [aliases] alias to ISO 3166-1 alpha-3
 * @returns {Index}
 */
export function buildIndex(areas, aliases = {}) {
  /** @type {Index} */
  const index = { kinds: {}, labels: [], byId: new Map(areas.map((a) => [a.id, a])) };
  const add = (kind, key, entry) => {
    const map = (index.kinds[kind] ??= new Map());
    const list = map.get(key) ?? [];
    if (!list.some((e) => e.area === entry.area)) list.push(entry);
    map.set(key, list);
  };
  for (const area of areas) {
    for (const [kind, values] of Object.entries(area.keys)) {
      for (const value of values) {
        if (kind === "name") {
          add(kind, normalizeName(value), { area, via: "name" });
          index.labels.push([normalizeName(value), area.names[0] ?? area.id]);
        } else add(kind, normalizeCode(kind, value), { area, via: "code" });
      }
    }
  }
  const byIso3 = new Map(areas.map((a) => [a.keys.iso3?.[0], a]));
  for (const [alias, iso3] of Object.entries(aliases)) {
    const area = byIso3.get(iso3);
    if (area) add("name", normalizeName(alias), { area, via: "alias" });
  }
  return index;
}

/** The key kinds this index can look up. */
export function kindsOf(index) {
  return Object.keys(index.kinds);
}

/**
 * @param {Index} index
 * @param {string} kind
 * @param {string} raw
 * @returns {{ entries: Entry[], padded: boolean }}
 */
export function lookup(index, kind, raw) {
  const map = index.kinds[kind];
  if (!map) return { entries: [], padded: false };
  if (!CODE_KINDS.has(kind)) {
    // A name with a replacement character lost a letter to a wrong text encoding. Folding it away would
    // let "Niger\uFFFD" match Niger, so such names are only matched by the pattern that keeps the gap.
    const damaged = damagedNamePattern(raw);
    if (damaged) {
      const hits = [...map].filter(([key]) => damaged.test(key)).map(([, list]) => list);
      return { entries: new Set(hits.flat().map((e) => e.area)).size === 1 ? hits[0] : [], padded: false };
    }
    const exact = map.get(normalizeName(raw));
    if (exact) return { entries: exact, padded: false };
    for (const short of formalVariants(raw)) {
      const hit = map.get(normalizeName(short));
      if (hit?.length === 1) return { entries: hit, padded: false };
    }
    return { entries: [], padded: false };
  }
  const key = normalizeCode(kind, raw);
  const direct = map.get(key);
  if (direct) return { entries: direct, padded: false };
  const width = PAD[kind] === 0 ? [...map.keys()][0]?.length : PAD[kind];
  if (width && /^\d+$/.test(key) && key.length < width) {
    const padded = map.get(key.padStart(width, "0"));
    if (padded) return { entries: padded, padded: true };
  }
  return { entries: [], padded: false };
}

/**
 * Chooses the key kind that matches the most distinct values of a column.
 * @param {string[]} values
 * @param {Index} index
 * @param {string[]} order preference order for ties
 */
export function detectKind(values, index, order) {
  const distinct = [...new Set(values.filter((v) => v !== ""))];
  let best = { kind: order[0], hits: -1 };
  for (const kind of order.filter((k) => index.kinds[k])) {
    const hits = distinct.filter((v) => lookup(index, kind, v).entries.length === 1).length;
    if (hits > best.hits) best = { kind, hits };
  }
  return {
    kind: best.kind,
    rate: distinct.length ? Math.max(0, best.hits) / distinct.length : 0,
    hits: Math.max(0, best.hits),
  };
}

/** A column of plain numbers, as opposed to text or zero-padded codes such as "06037". */
function isPlainNumbers(cells) {
  const filled = cells.filter((c) => c !== "");
  return filled.length > 0 && filled.every((c) => parseNumber(c) !== null && !/^0\d/.test(c));
}

/**
 * Ranks the columns of a table by how well they name the areas of a region.
 * Small whole numbers join codes by accident, so a plain number column ranks
 * below any text column that joins at least half of its distinct values.
 * @param {string[]} columns
 * @param {Record<string, string>[]} rows
 * @param {Index} index
 * @param {string[]} order key kinds of the region
 * @param {string[]} [exclude] columns that hold values, never keys
 * @returns {{ column: string, kind: string, rate: number, hits: number, strong: boolean }[]}
 */
export function rankKeyColumns(columns, rows, index, order, exclude = []) {
  const ranked = [];
  for (const column of columns) {
    if (exclude.includes(column)) continue;
    const cells = rows.map((r) => (r[column] ?? "").trim());
    if (new Set(cells.filter((c) => c !== "")).size < Math.min(3, cells.length)) continue;
    const { kind, rate, hits } = detectKind(cells, index, order);
    ranked.push({ column, kind, rate, hits, strong: !isPlainNumbers(cells) && rate >= 0.5 });
  }
  // Array.prototype.sort is stable, so columns that tie keep the order of the table.
  return ranked.sort((p, q) => Number(q.strong) - Number(p.strong) || q.rate - p.rate || q.hits - p.hits);
}

/**
 * Joins the values of a key column to areas.
 * @param {string[]} values one cell per data row, in row order
 * @param {Index} index
 * @param {string} kind
 */
export function joinKeys(values, index, kind) {
  /** @type {Map<string, number[]>} */
  const rowsByArea = new Map();
  /** @type {Map<string, { value: string, rows: number[] }>} */
  const unmatched = new Map();
  /** @type {Map<string, { value: string, rows: number[], candidates: string[] }>} */
  const ambiguous = new Map();
  const via = { code: 0, name: 0, alias: 0, padded: 0 };
  const seen = new Map();
  let blank = 0;
  values.forEach((raw, row) => {
    if (raw === "") {
      blank++;
      return;
    }
    let result = seen.get(raw);
    if (!result) {
      result = resolve(index, kind, raw);
      seen.set(raw, result);
    }
    if (result.area) {
      const rows = rowsByArea.get(result.area.id) ?? [];
      rows.push(row);
      rowsByArea.set(result.area.id, rows);
    } else {
      const bucket = result.candidates ? ambiguous : unmatched;
      const item = bucket.get(raw) ?? { value: raw, rows: [], candidates: result.candidates };
      item.rows.push(row);
      bucket.set(raw, item);
    }
  });
  for (const [raw, result] of seen) {
    if (!result.area) continue;
    const count = values.filter((v) => v === raw).length;
    via[result.padded ? "padded" : result.via] += count;
  }
  const missing = [...unmatched.values()].map((u) => ({
    ...u,
    suggestions: kind === "name" ? suggest(u.value, index.labels) : [],
  }));
  return { kind, rowsByArea, unmatched: missing, ambiguous: [...ambiguous.values()], via, blank };
}

function resolve(index, kind, raw) {
  let { entries, padded } = lookup(index, kind, raw);
  if (!entries.length && kind !== "name" && index.kinds.name) {
    const byName = lookup(index, "name", raw);
    if (byName.entries.length) entries = byName.entries;
  }
  if (entries.length === 1) return { area: entries[0].area, via: entries[0].via, padded };
  if (entries.length > 1) return { candidates: entries.map((e) => e.area.names[0] ?? e.area.id) };
  return {};
}
