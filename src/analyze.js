import { geoBounds } from "d3-geo";
import { loadAreas } from "./geo.js";
import {
  buildIndex,
  combinedKey,
  detectKind,
  joinKeys,
  keyText,
  kindsOf,
  loadAliases,
  rankKeyColumns,
} from "./join.js";
import { isNull, parseColumn, parseTable } from "./csv.js";
import { breaksFor, classOf, equalEdges, equalEdgesAround, niceEdges, spearman } from "./classify.js";
import { paletteColors, paletteType } from "./palettes.js";
import { normalizeSpec } from "./spec.js";
import { BoundaryError, loadCustomAreas } from "./custom.js";

const AGGREGATE = {
  sum: (v) => v.reduce((a, b) => a + b, 0),
  mean: (v) => v.reduce((a, b) => a + b, 0) / v.length,
  first: (v) => v[0],
  last: (v) => v[v.length - 1],
  min: (v) => Math.min(...v),
  max: (v) => Math.max(...v),
};

/**
 * @typedef {{ id: string, level: "error" | "warn" | "info", params: Record<string, any>, fix?: (spec: any) => void, fixText?: string }} Finding
 */

/**
 * Reads the table a spec points at. `readText` may return the text alone or,
 * for a file that was decoded, `{ text, encoding, guessed }`.
 * @param {any} data spec.data
 * @param {(path: string, encoding?: string) => Promise<string | { text: string, encoding: string, guessed: boolean }>} readText
 */
export async function loadTable(data, readText) {
  if (data.rows) {
    const columns = [...new Set(data.rows.flatMap((r) => Object.keys(r)))];
    const rows = data.rows.map((r) =>
      Object.fromEntries(columns.map((c) => [c, r[c] === undefined || r[c] === null ? "" : String(r[c])])),
    );
    return {
      columns,
      rows,
      problems: { duplicateColumns: [], unterminatedQuote: false, raggedRows: 0 },
      guessedEncoding: "",
    };
  }
  const read = data.csv ?? (await readText(data.file, data.encoding));
  const { text, encoding, guessed } = typeof read === "string" ? { text: read, encoding: "", guessed: false } : read;
  return { ...parseTable(text), guessedEncoding: guessed ? encoding : "" };
}

function applyFilter(rows, filter) {
  if (!filter) return rows;
  return rows.filter((row) =>
    Object.entries(filter).every(([column, wanted]) =>
      (Array.isArray(wanted) ? wanted.map(String) : [String(wanted)]).includes(row[column]),
    ),
  );
}

/**
 * Computes everything a map needs except the drawing: areas, join, values,
 * classes and the findings of the data and spec rules.
 * @param {any} input
 * @param {{ assets: any, readText: (path: string, encoding?: string) => Promise<string | { text: string, encoding: string, guessed: boolean }> }} ctx
 */
export async function analyze(input, ctx) {
  const { spec, findings: specFindings } = normalizeSpec(input);
  /** @type {Finding[]} */
  const findings = [...specFindings];
  if (!spec || specFindings.some((f) => f.level === "error")) return { spec, findings, ok: false };

  let loaded;
  try {
    loaded =
      spec.region === "custom"
        ? await loadCustomAreas(spec.boundaries, ctx.readText)
        : await loadAreas(spec.region, ctx.assets);
  } catch (error) {
    if (!(error instanceof BoundaryError)) throw error;
    findings.push({ id: "spec", level: "error", params: { path: "boundaries", detail: error.message } });
    return { spec, findings, ok: false };
  }
  const { areas, borders, region } = loaded;
  if (loaded.skipped)
    findings.push({
      id: "boundaries-skipped",
      level: "warn",
      params: { count: loaded.skipped, file: loaded.file || "boundaries.geojson" },
    });
  const aliases = await loadAliases(spec.region, region, ctx.assets);
  const index = buildIndex(areas, aliases);
  const analysis = {
    spec,
    region,
    areas,
    borders,
    index,
    findings,
    table: null,
    join: null,
    series: [],
    classing: null,
    ok: true,
  };

  if (spec.type === "locator" && !spec.data.file && !spec.data.csv && !spec.data.rows) return analysis;
  let table;
  try {
    table = await loadTable(spec.data, ctx.readText);
  } catch (error) {
    findings.push({
      id: "spec",
      level: "error",
      params: { path: "data", detail: `cannot read the table: ${error.message}` },
    });
    return { ...analysis, ok: false };
  }
  analysis.table = table;
  if (table.guessedEncoding)
    findings.push({
      id: "table-encoding",
      level: "warn",
      params: { file: spec.data.file, encoding: table.guessedEncoding },
    });
  const columns = table.columns;
  const { duplicateColumns, unterminatedQuote, raggedRows } = table.problems;
  if (duplicateColumns.length)
    findings.push({
      id: "spec",
      level: "error",
      params: {
        path: "data",
        detail: `the table has the column name ${duplicateColumns.join(", ")} more than once, so it is not clear which one to use`,
      },
    });
  if (unterminatedQuote)
    findings.push({
      id: "spec",
      level: "error",
      params: {
        path: "data",
        detail: "a quoted field in the table never closes, which would swallow the rows after it",
      },
    });
  if (raggedRows) findings.push({ id: "table-ragged", level: "warn", params: { count: raggedRows } });
  const valueColumns = [].concat(spec.data.value ?? []);
  for (const column of valueColumns) {
    if (!columns.includes(column)) {
      findings.push({
        id: "spec",
        level: "error",
        params: { path: "data.value", detail: `column "${column}" not found. Columns: ${columns.join(", ")}` },
      });
    }
  }
  for (const column of [].concat(spec.data.key ?? [])) {
    if (!columns.includes(column))
      findings.push({
        id: "spec",
        level: "error",
        params: { path: "data.key", detail: `column "${column}" not found. Columns: ${columns.join(", ")}` },
      });
  }
  if (findings.some((f) => f.level === "error")) return { ...analysis, ok: false };

  const rows = applyFilter(table.rows, spec.data.filter);
  const keyColumns = [].concat(spec.data.key ?? guessKeyColumn(columns, rows, valueColumns, index, region));
  if (!keyColumns[0]) {
    findings.push({
      id: "spec",
      level: "error",
      params: {
        path: "data.key",
        detail: `could not find the column that names the areas. Columns: ${columns.join(", ")}`,
      },
    });
    return { ...analysis, ok: false };
  }
  const cells = rows.map((r) => keyText(r, keyColumns));
  const order = region.keys;
  const kind =
    spec.data.keyType && spec.data.keyType !== "auto" ? spec.data.keyType : detectKind(cells, index, order).kind;
  if (!kindsOf(index).includes(kind)) {
    findings.push({
      id: "spec",
      level: "error",
      params: {
        path: "data.keyType",
        detail: `region ${spec.region} has no key "${kind}". Use one of: ${order.join(", ")}`,
      },
    });
    return { ...analysis, ok: false };
  }
  const joined = joinKeys(cells, index, kind);
  analysis.join = {
    ...joined,
    column: keyColumns.join(" + "),
    columns: keyColumns,
    cells,
    rows: rows.length,
    rowsMatched: [...joined.rowsByArea.values()].reduce((n, r) => n + r.length, 0),
    tableRows: rows,
  };

  if (spec.type === "categorical") buildCategorical(analysis, rows, valueColumns[0]);
  else buildNumeric(analysis, rows, valueColumns);
  return analysis;
}

function guessKeyColumn(columns, rows, valueColumns, index, region) {
  const best = rankKeyColumns(columns, rows, index, region.keys, { exclude: valueColumns })[0];
  if (best && best.rate >= 0.5) return best.column;
  return combinedKey(columns, rows, index, region.keys, valueColumns)?.columns ?? "";
}

/**
 * One value per area from the rows that joined to it. With a denominator
 * column every row is a pair, and only complete pairs count: a missing or
 * zero denominator drops the row, never the pairing.
 */
function areaValue(rowIdx, nums, dens, aggregate, per) {
  const usable = rowIdx.filter((i) => nums[i] !== null && (!dens || (dens[i] !== null && dens[i] > 0)));
  if (!usable.length) return null;
  const top = usable.map((i) => nums[i]);
  if (!dens) return aggregate ? AGGREGATE[aggregate](top) : top[top.length - 1];
  const bottom = usable.map((i) => dens[i]);
  const ratio = (n, d) => (n / d) * per;
  if (aggregate === "sum" || aggregate === "mean")
    return ratio(AGGREGATE[aggregate](top), AGGREGATE[aggregate](bottom));
  const pick =
    aggregate === "min"
      ? top.indexOf(Math.min(...top))
      : aggregate === "max"
        ? top.indexOf(Math.max(...top))
        : aggregate === "first"
          ? 0
          : top.length - 1;
  return ratio(top[pick], bottom[pick]);
}

function numbersFor(column, analysis, rows) {
  const { spec, join } = analysis;
  const cellsAll = rows.map((r) => r[column] ?? "");
  const nums = parseColumn(cellsAll).values;
  const nonEmpty = cellsAll.filter((c) => c.trim() !== "").length;
  const numeric = nums.filter((n) => n !== null).length;
  const mostlyText = nonEmpty > 0 && numeric / nonEmpty < 0.5;
  if (mostlyText) {
    analysis.findings.push({
      id: "value-not-numeric",
      level: "error",
      params: { column, example: cellsAll.find((c, i) => c.trim() && nums[i] === null) ?? "" },
    });
  }
  const rule = spec.data.normalize;
  const dens = rule?.by === "column" ? parseColumn(rows.map((r) => r[rule.column] ?? "")).values : null;
  /** @type {Map<string, number | null>} */
  const byArea = new Map();
  const duplicates = [];
  let missingDenominator = 0;
  // Rows that reached an area but cannot contribute: a cell that is not a number (a blank or "n/a" is a plain gap),
  // or a value whose denominator is missing or zero.
  const skipped = { count: 0, example: "" };
  const skip = (text) => {
    skipped.count++;
    skipped.example ||= text;
  };
  for (const [id, rowIdx] of join.rowsByArea) {
    if (rowIdx.length > 1) duplicates.push({ id, rows: rowIdx.length });
    const value = areaValue(rowIdx, nums, dens, spec.data.aggregate, rule?.per ?? 1);
    if (value === null && dens && rowIdx.some((i) => nums[i] !== null)) missingDenominator++;
    byArea.set(id, value);
    if (mostlyText) continue;
    for (const i of rowIdx) {
      if (nums[i] === null) {
        if (!isNull(cellsAll[i])) skip(cellsAll[i]);
        // An area left with no value because of its denominator is already counted by normalize-missing.
      } else if (dens && value !== null && !(dens[i] > 0)) skip(`${cellsAll[i]} / ${rows[i][rule.column] ?? ""}`);
    }
  }
  return {
    column,
    byArea,
    duplicates,
    aggregated: Boolean(spec.data.aggregate),
    normalizedMissing: missingDenominator,
    skipped,
  };
}

function normalizeByArea(analysis, series) {
  const { spec, index } = analysis;
  const rule = spec.data.normalize;
  if (!rule || rule.by === "column") return;
  for (const [id, value] of series.byArea) {
    if (value === null) continue;
    const area = index.byId.get(id);
    const denominator = rule.by === "population" ? area?.pop : area?.areaKm2;
    if (denominator > 0) series.byArea.set(id, (value / denominator) * (rule.per ?? 1));
    else {
      series.byArea.set(id, null);
      series.normalizedMissing++;
    }
  }
}

/** Ids of the areas that are drawn: inside the region's box, or in one of its insets. */
function idsInFrame(analysis) {
  const { region, areas } = analysis;
  if (!region.box) return null;
  const [west, south, east, north] = region.box;
  const inside = new Set();
  for (const area of areas) {
    const [[w, s], [e, n]] = geoBounds({ type: "Feature", properties: {}, geometry: area.geometry });
    const overlapsLongitude = w <= e ? w <= east && e >= west : w <= east || e >= west;
    const inInset = (region.insets ?? []).some(
      (inset) => inset.match.ids?.includes(area.id) || inset.match.county?.includes(area.props.county),
    );
    if (inInset || (overlapsLongitude && s <= north && n >= south)) inside.add(area.id);
  }
  return inside;
}

function buildNumeric(analysis, rows, valueColumns) {
  const { spec, index } = analysis;
  const frame = idsInFrame(analysis);
  analysis.frameIds = frame;
  analysis.series = valueColumns.map((column) => {
    const series = numbersFor(column, analysis, rows);
    normalizeByArea(analysis, series);
    // Classes and symbol sizes describe the map that is drawn, not the rest of the table.
    series.numbers = [...series.byArea].filter(([id, v]) => v !== null && (!frame || frame.has(id))).map(([, v]) => v);
    return series;
  });
  const rho = (series) => {
    const known = [...series.byArea].filter(([id, v]) => v !== null && index.byId.get(id)?.pop);
    return known.length >= 10
      ? spearman(
          known.map(([, v]) => v),
          known.map(([id]) => index.byId.get(id).pop),
        )
      : null;
  };
  // Every panel is a map of its own, so the strongest population correlation among them decides.
  const rhos = spec.data.normalize ? [] : analysis.series.map(rho).filter((r) => r !== null);
  analysis.population = {
    rho: rhos.length ? Math.max(...rhos) : null,
    available: analysis.region.population === true,
  };
  const all = analysis.series.flatMap((s) => s.numbers);
  const usable = spec.type === "symbols" ? all.filter((v) => v > 0) : all;
  if (!usable.length) {
    analysis.findings.push({ id: "no-values", level: "error", params: {} });
    analysis.ok = false;
    return;
  }
  if (spec.type === "symbols") return;
  analysis.classing = classifyNumbers(all, spec);
  const custom = Array.isArray(spec.palette) ? spec.palette.length : Infinity;
  if (custom < analysis.classing.k) {
    analysis.findings.push({
      id: "spec",
      level: "error",
      params: {
        path: "palette",
        detail: `${analysis.classing.k} classes need ${analysis.classing.k} colours but the palette has ${custom}`,
      },
    });
  }
  for (const series of analysis.series) {
    series.assign = new Map(
      [...series.byArea].map(([id, v]) => [id, v === null ? -1 : classOf(v, analysis.classing.edges)]),
    );
  }
  analysis.classing.counts = countClasses(analysis.series, analysis.classing.edges.length - 1, frame);
}

/** Areas per class, summed over the panels that share the classes. */
function countClasses(allSeries, k, frame) {
  const counts = Array(k).fill(0);
  for (const series of allSeries)
    for (const [id, cls] of series.assign) if (cls >= 0 && (!frame || frame.has(id))) counts[cls]++;
  return counts;
}

/** Class edges and colours for a set of numbers. */
export function classifyNumbers(numbers, spec) {
  const { method, count, breaks } = spec.classes;
  const diverging = spec.center !== undefined && spec.center !== null;
  const customColors = Array.isArray(spec.palette) ? spec.palette : null;
  let edges;
  if (method === "manual") edges = breaks.slice();
  else if (diverging) edges = divergingEdges(numbers, spec.center, count, method);
  else {
    const k = Math.min(count, Math.max(2, new Set(numbers).size));
    const raw = breaksFor(numbers, method, k);
    edges = method === "equal" ? equalEdges(raw[0], raw[raw.length - 1], k) : niceEdges(raw, numbers);
  }
  if (edges.length < 2) edges = [numbers[0], numbers[0]];
  if (edges[0] === edges[1] && edges.length === 2) edges = [edges[0], edges[0] + 1];
  const k = edges.length - 1;
  const paletteName = customColors ? null : (spec.palette ?? (diverging ? "rdbu" : "blues"));
  let colors;
  if (customColors) colors = customColors.slice(0, k);
  else if (diverging && paletteType(paletteName) === "diverging")
    colors = divergingColors(paletteName, edges, spec.center);
  else {
    const reach = Math.min(k, paletteType(paletteName) === "diverging" ? 11 : 9);
    const pool = paletteColors(paletteName, Math.max(3, reach));
    colors =
      k <= 9
        ? paletteColors(paletteName, k)
        : Array.from({ length: k }, (_, i) => pool[Math.round((i * (pool.length - 1)) / (k - 1))]);
  }
  return { method, edges, k, colors, paletteName, diverging, counts: [] };
}

/**
 * Colours for classes around a centre. Classes below the centre take the cool half of the palette and classes
 * above it the other half, each counted outwards from the centre, so equal distances get equal colours and a
 * class on one side never borrows the other side's hue.
 */
function divergingColors(name, edges, center) {
  const above = edges.slice(0, -1).map((low, i) => (low + edges[i + 1]) / 2 >= center);
  const nAbove = above.filter(Boolean).length;
  const nBelow = above.length - nAbove;
  const side = Math.max(nAbove, nBelow);
  const size = 2 * side;
  const pool = paletteColors(name, Math.min(size, 11));
  const full =
    size <= 11 ? pool : Array.from({ length: size }, (_, i) => pool[Math.round((i * (pool.length - 1)) / (size - 1))]);
  const below = full.slice(side - nBelow, side);
  const upper = full.slice(side, side + nAbove);
  let b = 0;
  let u = 0;
  return above.map((isAbove) => (isAbove ? upper[u++] : below[b++]));
}

function divergingEdges(numbers, center, count, method) {
  const side = Math.max(1, Math.floor(count / 2));
  if (method === "equal") return equalEdgesAround(Math.min(...numbers), Math.max(...numbers), center, side);
  const below = numbers.filter((v) => v < center);
  const above = numbers.filter((v) => v >= center);
  const half = (values) =>
    values.length
      ? breaksFor([...values, center], method === "jenks" ? "jenks" : "quantile", Math.min(side, new Set(values).size))
      : [center];
  const merged = [...half(below), ...half(above).slice(1)].filter((e, i, all) => i === 0 || e > all[i - 1]);
  return niceEdges(merged.includes(center) ? merged : [...merged, center].sort((a, b) => a - b), numbers, [center]);
}

function buildCategorical(analysis, rows, column) {
  const { spec, join } = analysis;
  const order = spec.legend.order;
  /** @type {Map<string, string | null>} */
  const byArea = new Map();
  const duplicates = [];
  for (const [id, rowIdx] of join.rowsByArea) {
    if (rowIdx.length > 1) duplicates.push({ id, rows: rowIdx.length });
    const chosen = spec.data.aggregate === "first" ? rowIdx[0] : rowIdx[rowIdx.length - 1];
    const cell = (rows[chosen][column] ?? "").trim();
    byArea.set(id, cell === "" ? null : cell);
  }
  const tally = new Map();
  for (const v of byArea.values()) if (v !== null) tally.set(v, (tally.get(v) ?? 0) + 1);
  const categories = Array.isArray(order)
    ? order.filter((c) => tally.has(c)).concat([...tally.keys()].filter((c) => !order.includes(c)))
    : [...tally].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c);
  const colors = Array.isArray(spec.palette) ? spec.palette : (spec.palette ?? "okabe-ito");
  const palette = Array.isArray(colors) ? colors : paletteColors(colors, Math.min(categories.length, 8));
  const assign = new Map([...byArea].map(([id, v]) => [id, v === null ? -1 : categories.indexOf(v)]));
  analysis.series = [{ column, byArea, duplicates, aggregated: false, assign }];
  analysis.classing = {
    method: "categorical",
    categories,
    colors: categories.map((_, i) => palette[i % palette.length]),
    k: categories.length,
    edges: [],
    counts: categories.map((c) => tally.get(c)),
    paletteName: Array.isArray(colors) ? null : colors,
  };
}
