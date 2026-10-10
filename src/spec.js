import { REGION_IDS, getRegion } from "./regions.js";
import { normalizeLang } from "./lang.js";
import { PROJECTIONS } from "./projections.js";
import { listPalettes } from "./palettes.js";

export const TYPES = ["choropleth", "symbols", "categorical", "locator", "small-multiples"];
export const KINDS = ["count", "rate", "share", "index", "other"];
export const METHODS = ["quantile", "equal", "jenks", "manual"];
export const AGGREGATES = ["sum", "mean", "first", "last", "min", "max"];

/**
 * The "per N" a unit label states, such as 100000 for "Deaths per 100,000 people", or null.
 * @param {...(string | undefined)} labels
 */
export function declaredPer(...labels) {
  for (const label of labels) {
    const m = /\bper\s+(\d{1,3}(?:[,. \u00a0\u202f]\d{3})+|\d+)(?![\d\p{L}])/iu.exec(label ?? "");
    const n = m ? Number(m[1].replace(/\D/g, "")) : 0;
    if (n > 0) return n;
  }
  return null;
}

const KEYS = {
  top: [
    "title",
    "subtitle",
    "source",
    "note",
    "region",
    "type",
    "data",
    "classes",
    "palette",
    "center",
    "projection",
    "language",
    "labels",
    "legend",
    "size",
    "theme",
    "grid",
    "highlight",
    "panels",
    "columns",
    "symbols",
    "attribution",
    "checks",
  ],
  data: [
    "file",
    "csv",
    "rows",
    "key",
    "keyType",
    "encoding",
    "value",
    "kind",
    "label",
    "normalize",
    "aggregate",
    "filter",
  ],
  classes: ["method", "count", "breaks"],
};

/**
 * Fills defaults and validates a map spec. Problems come back as findings
 * with the path of the offending field so an agent can fix them in one pass.
 * @param {any} input parsed JSON
 */
export function normalizeSpec(input) {
  /** @type {{ id: string, level: "error" | "warn", params: Record<string, any> }[]} */
  const findings = [];
  const bad = (path, detail) => findings.push({ id: "spec", level: "error", params: { path, detail } });
  const unknown = (path, object, allowed) => {
    for (const key of Object.keys(object ?? {})) {
      if (!allowed.includes(key))
        findings.push({
          id: "spec-unknown-key",
          level: "warn",
          params: { path: `${path}${key}`, allowed: allowed.join(", ") },
        });
    }
  };
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    bad("spec", "the spec must be a JSON object");
    return { spec: null, findings };
  }
  unknown("", input, KEYS.top);

  const text = (value, path) => {
    if (value === undefined || value === null) return "";
    if (typeof value !== "string") bad(path, "must be a string");
    return typeof value === "string" ? value.trim() : "";
  };
  const oneOf = (value, list, path, fallback) => {
    if (value === undefined) return fallback;
    if (!list.includes(value)) {
      bad(path, `must be one of: ${list.join(", ")}`);
      return fallback;
    }
    return value;
  };

  const region = oneOf(input.region, REGION_IDS, "region", "world");
  const type = oneOf(input.type, TYPES, "type", "choropleth");
  const data = input.data && typeof input.data === "object" ? input.data : {};
  if (!input.data || typeof input.data !== "object") {
    if (type !== "locator") bad("data", "is required: give a file, csv text or rows");
  } else unknown("data.", data, KEYS.data);
  if (data.normalize !== undefined) {
    const n = data.normalize;
    const ok =
      n && ["population", "area", "column"].includes(n.by) && (n.by !== "column" || typeof n.column === "string");
    if (!ok)
      bad("data.normalize", 'must look like {"by": "population" | "area" | "column", "per": 100000, "column": "name"}');
    else if (n.per !== undefined && !(Number.isFinite(n.per) && n.per > 0))
      bad("data.normalize.per", "must be a number above 0, such as 1000 or 100000");
    else {
      const per = n.per ?? 1;
      for (const [field, label] of [
        ["legend.title", input.legend?.title],
        ["data.label", data.label],
        ["title", input.title],
      ]) {
        const stated = declaredPer(label);
        if (stated && stated !== per) bad("data.normalize.per", `is ${per} but ${field} says "per ${stated}"`);
      }
    }
  }
  if (data.aggregate !== undefined && !AGGREGATES.includes(data.aggregate))
    bad("data.aggregate", `must be one of: ${AGGREGATES.join(", ")}`);
  if (type === "categorical" && data.aggregate !== undefined && !["first", "last"].includes(data.aggregate))
    bad("data.aggregate", "categories can only use first or last");
  if (data.kind !== undefined && !KINDS.includes(data.kind)) bad("data.kind", `must be one of: ${KINDS.join(", ")}`);
  if (data.encoding !== undefined) {
    try {
      new TextDecoder(String(data.encoding));
    } catch {
      bad("data.encoding", "must be an encoding name such as utf-8, windows-1252, big5, shift_jis, euc-kr or gbk");
    }
  }
  const sources = ["file", "csv", "rows"].filter((k) => data[k] !== undefined);
  if (input.data && type !== "locator" && sources.length !== 1)
    bad("data", `give exactly one of file, csv or rows (found ${sources.length})`);
  if (type !== "locator" && input.data && !(Array.isArray(data.value) ? data.value.length : data.value))
    bad("data.value", "is required: the column to map");
  if (Array.isArray(data.value) && type !== "small-multiples")
    bad("data.value", 'a list of columns is only for type "small-multiples"');

  const classes = { method: "quantile", count: 5, ...(input.classes ?? {}) };
  unknown("classes.", input.classes, KEYS.classes);
  if (!METHODS.includes(classes.method)) bad("classes.method", `must be one of: ${METHODS.join(", ")}`);
  if (!Number.isInteger(classes.count) || classes.count < 2) bad("classes.count", "must be an integer of at least 2");
  if (classes.method === "manual" || classes.breaks !== undefined) {
    const b = classes.breaks;
    if (
      !Array.isArray(b) ||
      b.length < 2 ||
      b.some((v) => typeof v !== "number") ||
      b.some((v, i) => i && v <= b[i - 1])
    ) {
      bad(
        "classes.breaks",
        "must be an ascending list of numbers: every class edge, from the lowest value to the highest",
      );
    } else classes.method = "manual";
  }

  const palette = input.palette;
  if (palette !== undefined) {
    const names = listPalettes().map((p) => p.name);
    if (Array.isArray(palette)) {
      if (palette.length < 2 || palette.some((c) => !/^#[0-9a-f]{6}$/i.test(c)))
        bad("palette", "a custom palette is a list of at least two #rrggbb colours");
    } else if (typeof palette !== "string" || !names.includes(palette.toLowerCase()))
      bad("palette", `unknown palette. Known: ${names.join(", ")}, or a list of #rrggbb colours`);
  }
  const projection = input.projection ?? "auto";
  const projectionName = typeof projection === "string" ? projection : projection?.name;
  if (projection !== "auto" && !PROJECTIONS[projectionName])
    bad("projection", `unknown projection. Known: auto, ${Object.keys(PROJECTIONS).join(", ")}`);

  const language = input.language === undefined ? "en" : normalizeLang(input.language);
  if (!language)
    bad("language", "must be one of: en, zh-Hant (zh-TW), zh-Hans (zh-CN), ja, ko, es, fr, de, pt (pt-BR)");

  const labels = typeof input.labels === "string" ? { show: input.labels } : { show: "auto", ...(input.labels ?? {}) };
  if (!["auto", "none", "all"].includes(labels.show)) bad("labels", 'must be "auto", "none" or "all"');

  const size = { width: 1200, ...(input.size ?? {}) };
  if (!(size.width >= 320 && size.width <= 6000)) bad("size.width", "must be between 320 and 6000 pixels");
  if (size.height !== undefined && !(size.height >= 200 && size.height <= 8000))
    bad("size.height", "must be between 200 and 8000 pixels");

  const symbols = input.symbols ?? {};
  if (symbols.color !== undefined && !/^#[0-9a-f]{6}$/i.test(symbols.color))
    bad("symbols.color", "must be a #rrggbb colour");
  if (symbols.maxRadius !== undefined && !(symbols.maxRadius >= 4 && symbols.maxRadius <= 200))
    bad("symbols.maxRadius", "must be between 4 and 200 pixels");
  const theme = oneOf(input.theme, ["light", "dark"], "theme", "light");
  const allow = input.checks?.allow ?? [];
  if (!Array.isArray(allow)) bad("checks.allow", "must be a list of rule ids");

  const spec = {
    title: text(input.title, "title"),
    subtitle: text(input.subtitle, "subtitle"),
    source: text(input.source, "source"),
    note: text(input.note, "note"),
    region,
    type,
    data: { ...data, ...(data.normalize ? { normalize: { ...data.normalize, per: data.normalize.per ?? 1 } } : {}) },
    classes,
    palette: typeof palette === "string" ? palette.toLowerCase() : palette,
    center: input.center,
    projection,
    language: language || "en",
    labels,
    legend: { ...(input.legend ?? {}) },
    size,
    theme,
    grid: Boolean(input.grid),
    highlight: Array.isArray(input.highlight) ? input.highlight.map(String) : [],
    panels: Array.isArray(input.panels) ? input.panels : [],
    columns: Number.isInteger(input.columns) && input.columns >= 1 && input.columns <= 4 ? input.columns : undefined,
    attribution: input.attribution !== false,
    symbols: { ...symbols },
    checks: { allow: Array.isArray(allow) ? allow.map(String) : [] },
  };
  if (!REGION_IDS.includes(region)) return { spec, findings };
  if (spec.labels.show === "auto" && getRegion(region).level === "county" && region === "us-counties")
    spec.labels.show = "none";
  if (spec.labels.show === "auto" && region === "tw-towns") spec.labels.show = "none";
  return { spec, findings };
}
