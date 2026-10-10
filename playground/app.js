import { buildMap } from "../src/build.js";
import { decodeBytes, looksLikeYear, parseNumber, parseTable, sniffBinary } from "../src/csv.js";
import { loadCustomAreas } from "../src/custom.js";
import { exportMap } from "../src/export.js";
import { createFontStore } from "../src/fonts.js";
import { interactions } from "../src/html.js";
import { createTranslator } from "../src/i18n.js";
import { STATE_COLUMN, buildIndex, combinedKey, keyText, loadAliases, rankKeyColumns } from "../src/join.js";
import { loadAreas } from "../src/geo.js";
import { LANGS, normalizeLang } from "../src/lang.js";
import { listPalettes, paletteColors } from "../src/palettes.js";
import { REGIONS } from "../src/regions.js";
import { renderSvg } from "../src/render.js";

const NATIVE = {
  en: "English",
  "zh-Hant": "繁體中文",
  "zh-Hans": "简体中文",
  ja: "日本語",
  ko: "한국어",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português (Brasil)",
};
const EXAMPLES = [
  "covid-raw",
  "life-expectancy",
  "us-county-unemployment",
  "europe-gdp-per-capita",
  "population-symbols",
  "taiwan-township-area",
  "japan-regions",
];
const ENCODINGS = [
  ["windows-1252", "Windows-1252"],
  ["big5", "Big5"],
  ["shift_jis", "Shift_JIS"],
  ["euc-kr", "EUC-KR"],
  ["gbk", "GBK"],
  ["utf-8", "UTF-8"],
];
const TYPES = ["choropleth", "symbols", "categorical", "locator", "small-multiples"];
const KINDS = ["", "count", "rate", "share", "index", "other"];

const root = new URL("./", import.meta.url);
const cache = new Map();
const assets = {
  json: (name) => {
    if (!cache.has(name))
      cache.set(
        name,
        fetch(new URL(name, root)).then((r) => r.json()),
      );
    return cache.get(name);
  },
  bytes: async (name) => new Uint8Array(await (await fetch(new URL(name, root))).arrayBuffer()),
};
const store = createFontStore(assets);

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== false) node.setAttribute(k, v === true ? "" : v);
  }
  node.append(...children.flat().filter((c) => c !== null && c !== undefined));
  return node;
};

const fresh = () => ({
  title: "",
  subtitle: "",
  source: "",
  note: "",
  region: "world",
  type: "choropleth",
  key: "",
  value: "",
  values: [],
  kind: "",
  label: "",
  normalize: "none",
  per: 100000,
  method: "quantile",
  count: 5,
  palette: "",
  labels: "auto",
  language: "en",
  theme: document.documentElement.dataset.theme,
  center: "",
  highlight: "",
});

const state = {
  ui: "en",
  t: (key) => key,
  english: {},
  csv: "",
  table: null,
  spec: fresh(),
  base: null,
  extra: {},
  allow: new Set(),
  regionTouched: false,
  languageTouched: false,
  last: null,
  token: 0,
  fixes: [],
  example: "",
  signature: "",
  refocus: "",
  bytes: null,
  boundaries: null,
  period: null,
};

/** Counts the tables loaded, so a slow region lookup for an older table cannot change a newer one. */
let tableRun = 0;
/** Counts the files picked, so a slow read of an older file cannot replace a newer one. */
let fileRun = 0;

/* Language ------------------------------------------------------------- */

async function setUiLanguage(code) {
  state.ui = code;
  const [english, messages] = await Promise.all([assets.json("locales/en.json"), assets.json(`locales/${code}.json`)]);
  state.english = english;
  state.t = createTranslator(messages, english, code);
  document.documentElement.lang = { "zh-Hant": "zh-TW", "zh-Hans": "zh-CN", pt: "pt-BR" }[code] ?? code;
  try {
    localStorage.setItem("graticule.lang", code);
  } catch {}
  $("ui-lang").value = code;
  if (!state.languageTouched) {
    state.spec.language = code;
    $("map-lang").value = code;
  }
  translatePage();
  buildExports();
  buildSelects();
  buildPalettes();
  buildExamples();
  syncControls();
  schedule();
}

const ui = (key, params) => state.t(`ui.${key}`, params);

function translatePage() {
  document.querySelectorAll("[data-i18n]").forEach((node) => (node.textContent = ui(node.dataset.i18n)));
  document.querySelectorAll("[data-i18n-attr]").forEach((node) => {
    for (const pair of node.dataset.i18nAttr.split(",")) {
      const [attr, key] = pair.split(":");
      node.setAttribute(attr, ui(key));
    }
  });
  document.title = `Graticule: ${ui("tagline")}`;
}

/* Controls ------------------------------------------------------------- */

function options(select, entries, value) {
  select.replaceChildren(...entries.map(([v, label]) => el("option", { value: v }, label)));
  select.value = value;
}

function buildSelects() {
  options(
    $("ui-lang"),
    LANGS.map((l) => [l, NATIVE[l]]),
    state.ui,
  );
  options(
    $("map-lang"),
    LANGS.map((l) => [l, NATIVE[l]]),
    state.spec.language,
  );
  options(
    $("region"),
    [...Object.keys(REGIONS), ...(state.boundaries ? ["custom"] : [])].map((id) => [id, ui(`regions.${id}`)]),
    state.spec.region,
  );
  options(
    $("kind"),
    KINDS.map((k) => [k, ui(`kind.${k || "unset"}`)]),
    state.spec.kind,
  );
  options(
    $("normalize"),
    ["none", "population", "area", ...(state.base?.data?.normalize?.by === "column" ? ["column"] : [])].map((k) => [
      k,
      ui(`norm.${k}`),
    ]),
    state.spec.normalize,
  );
  options(
    $("method"),
    ["quantile", "jenks", "equal", ...(state.base?.classes?.method === "manual" ? ["manual"] : [])].map((k) => [
      k,
      ui(`method.${k}`),
    ]),
    state.spec.method,
  );
  options(
    $("labels"),
    ["auto", "none", "all"].map((k) => [k, ui(`labels.${k}`)]),
    state.spec.labels,
  );
  options(
    $("map-theme"),
    ["light", "dark"].map((k) => [k, ui(`theme.${k}`)]),
    state.spec.theme,
  );
  const types = $("type");
  types.replaceChildren(
    ...TYPES.map((type) =>
      el(
        "label",
        {},
        el("input", { type: "radio", name: "type", value: type, checked: state.spec.type === type }),
        el("span", {}, ui(`type.${type}`)),
      ),
    ),
  );
  fillColumns();
}

function fillColumns() {
  const columns = state.table?.columns ?? [];
  options($("key"), [["", ui("map.keyAuto")], ...columns.map((c) => [c, c])], state.spec.key);
  options(
    $("value"),
    columns.map((c) => [c, c]),
    state.spec.value,
  );
  $("values").replaceChildren(
    ...columns.map((c) =>
      el("label", {}, el("input", { type: "checkbox", value: c, checked: state.spec.values.includes(c) }), c),
    ),
  );
}

function buildPalettes() {
  const categorical = state.spec.type === "categorical";
  const names = listPalettes().filter((p) => (p.type === "categorical") === categorical);
  const auto = el(
    "label",
    {},
    el("input", { type: "radio", name: "palette", value: "", checked: !state.spec.palette }),
    el("span", { class: "strip", style: "background:var(--line)" }),
    ui("labels.auto"),
  );
  $("palettes").replaceChildren(
    auto,
    ...names.map((p) =>
      el(
        "label",
        {},
        el("input", { type: "radio", name: "palette", value: p.name, checked: state.spec.palette === p.name }),
        el("span", { class: "strip" }, ...paletteColors(p.name, 5).map((c) => el("i", { style: `background:${c}` }))),
        p.name,
      ),
    ),
  );
}

function buildExamples() {
  $("examples").replaceChildren(
    ...EXAMPLES.map((id) =>
      el(
        "button",
        { class: "chip", type: "button", "aria-pressed": String(state.example === id), onclick: () => loadExample(id) },
        ui(`examples.${id}`),
      ),
    ),
  );
}

/** Shows only the controls that matter for the current map type and data. */
function syncControls() {
  const s = state.spec;
  const locator = s.type === "locator";
  const multiples = s.type === "small-multiples";
  const categorical = s.type === "categorical";
  const symbols = s.type === "symbols";
  $("field-value").hidden = locator || multiples;
  $("field-values").hidden = !multiples;
  $("field-highlight").hidden = !locator;
  $("row-kind").hidden = locator || categorical || symbols;
  $("row-normalize").hidden = locator || categorical || symbols;
  $("field-unit").hidden = locator;
  $("row-classes").hidden = locator || categorical || symbols;
  $("field-palette").hidden = locator || symbols;
  $("per").disabled = s.normalize === "none";
  $("count-out").textContent = s.count;
  for (const [id, key] of [
    ["title", "title"],
    ["subtitle", "subtitle"],
    ["source", "source"],
    ["note", "note"],
    ["unit", "label"],
    ["highlight", "highlight"],
    ["center", "center"],
  ]) {
    if (document.activeElement !== $(id)) $(id).value = s[key];
  }
  $("per").value = s.per;
  $("count").value = s.count;
  $("method").value = s.method;
  $("labels").value = s.labels;
  $("region").value = s.region;
  $("kind").value = s.kind;
  $("normalize").value = s.normalize;
  $("map-theme").value = s.theme;
  $("map-lang").value = s.language;
  if (state.table) {
    $("key").value = s.key;
    $("value").value = s.value;
  }
  document.querySelectorAll('input[name="type"]').forEach((r) => (r.checked = r.value === s.type));
}

function readControls() {
  const s = state.spec;
  const text = (id) => $(id).value;
  Object.assign(s, {
    region: text("region"),
    title: text("title"),
    subtitle: text("subtitle"),
    source: text("source"),
    note: text("note"),
    label: text("unit"),
    highlight: text("highlight"),
    center: text("center"),
    key: text("key"),
    value: text("value"),
    kind: text("kind"),
    normalize: text("normalize"),
    per: Number(text("per")) || 1,
    method: text("method"),
    count: Number(text("count")),
    labels: text("labels"),
    theme: text("map-theme"),
    values: [...document.querySelectorAll("#values input:checked")].map((i) => i.value),
  });
  if (state.period) state.period.value = $("period").value;
  const type = document.querySelector('input[name="type"]:checked');
  if (type) s.type = type.value;
  const palette = document.querySelector('input[name="palette"]:checked');
  s.palette = palette ? palette.value : "";
  if (s.palette) delete state.extra.palette;
}

/* Spec <-> state --------------------------------------------------------- */

/**
 * The engine spec for the current controls. A loaded spec is kept whole in
 * `state.base`, so fields without a control (aggregate, filter, a denominator
 * column, symbol options, panel titles, a custom palette) survive an edit.
 */
function toSpec() {
  const s = state.spec;
  const base = structuredClone(state.base ?? {});
  const spec = {
    ...base,
    title: s.title,
    subtitle: s.subtitle,
    source: s.source,
    note: s.note,
    region: s.region,
    type: s.type,
    classes: { ...(s.method === "manual" ? base.classes : { count: s.count }), method: s.method, count: s.count },
    language: s.language,
    labels: s.labels,
    theme: s.theme,
    checks: { allow: [...state.allow] },
  };
  if (s.method !== "manual") delete spec.classes.breaks;
  if (s.region === "custom" && state.boundaries) spec.boundaries = { geojson: state.boundaries.geojson };
  else delete spec.boundaries;
  if (state.extra.palette) spec.palette = state.extra.palette;
  else if (s.palette) spec.palette = s.palette;
  else delete spec.palette;
  if (s.center !== "" && Number.isFinite(Number(s.center))) spec.center = Number(s.center);
  else delete spec.center;
  if (s.type === "locator") {
    spec.highlight = s.highlight
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    spec.data = {};
    return spec;
  }
  const multiples = s.type === "small-multiples";
  const data = { ...base.data, csv: state.csv };
  delete data.file;
  if (state.period) data.filter = { ...base.data?.filter, [state.period.column]: state.period.value };
  if (s.key) data.key = s.key;
  else delete data.key;
  data.value = multiples ? s.values : s.value;
  if (s.type === "symbols") data.kind = "count";
  else if (s.kind) data.kind = s.kind;
  else delete data.kind;
  if (s.label) data.label = s.label;
  else delete data.label;
  if (["categorical", "symbols"].includes(s.type) || s.normalize === "none") {
    if (data.normalize?.by !== "column" || s.normalize !== "column") delete data.normalize;
  } else if (s.normalize === "column") data.normalize = { ...data.normalize, per: s.per };
  else data.normalize = { by: s.normalize, per: s.per };
  spec.data = data;
  if (multiples) {
    const kept = (base.panels ?? []).length === s.values.length ? base.panels : null;
    spec.panels = kept ?? s.values.map((v) => ({ title: v }));
  } else delete spec.panels;
  return spec;
}

/** Loads an engine spec into the controls and keeps it as the base for what the controls do not cover. */
function fromSpec(spec) {
  const d = spec.data ?? {};
  const s = fresh();
  s.title = spec.title ?? "";
  s.subtitle = spec.subtitle ?? "";
  s.source = spec.source ?? "";
  s.note = spec.note ?? "";
  s.region = spec.region ?? "world";
  s.type = spec.type ?? "choropleth";
  s.key = d.key ?? "";
  s.kind = d.kind ?? "";
  s.label = d.label ?? "";
  if (Array.isArray(d.value)) s.values = d.value;
  else s.value = d.value ?? "";
  s.normalize = ["population", "area", "column"].includes(d.normalize?.by) ? d.normalize.by : "none";
  s.per = d.normalize?.per ?? 100000;
  s.method = spec.classes?.method ?? "quantile";
  s.count = spec.classes?.count ?? 5;
  s.palette = typeof spec.palette === "string" ? spec.palette : "";
  s.labels = typeof spec.labels === "string" ? spec.labels : (spec.labels?.show ?? "auto");
  s.language = spec.language ?? state.ui;
  s.theme = spec.theme ?? s.theme;
  s.center = spec.center ?? "";
  s.highlight = (spec.highlight ?? []).join(", ");
  state.spec = s;
  state.base = structuredClone(spec);
  delete state.base.data?.csv;
  delete state.base.data?.file;
  state.extra = { palette: Array.isArray(spec.palette) ? spec.palette : undefined };
  state.languageTouched = Boolean(spec.language);
}

/* Data ------------------------------------------------------------------ */

/** A new table starts a new map: nothing from the previous one carries over except the language and theme. */
function resetForNewData() {
  tableRun++;
  state.period = null;
  fillPeriod();
  state.bytes = null;
  $("field-encoding").hidden = true;
  state.example = "";
  state.fixes = [];
  state.allow = new Set();
  state.regionTouched = false;
  state.extra = {};
  state.base = null;
  state.spec = { ...fresh(), language: state.spec.language, theme: state.spec.theme };
  if (state.boundaries) {
    state.spec.region = "custom";
    state.regionTouched = true;
  }
  // The fields of the last map go at once: a reader who types while the new table is read starts from empty ones.
  fillColumns();
  syncControls();
  $("sheet").classList.add("stale");
  buildExamples();
  buildPalettes();
}

/**
 * Loads a table file. A file that is not UTF-8 keeps its bytes, so the reader can
 * read it again with the encoding it really has.
 */
async function loadBytes(bytes, label) {
  let decoded;
  try {
    decoded = decodeBytes(bytes, label);
  } catch (error) {
    // An Excel workbook or an image: say what it is, and keep what was on the page.
    return setStatus(ui("data.error", { detail: error.message }), true);
  }
  state.bytes = decoded.guessed || label ? bytes : null;
  $("field-encoding").hidden = !state.bytes;
  if (state.bytes) {
    const known = ENCODINGS.some(([value]) => value === decoded.encoding);
    options($("encoding"), ENCODINGS, known ? decoded.encoding : "windows-1252");
  }
  const applied = await setTable(decoded.text);
  if (applied && decoded.guessed)
    $("data-status").textContent += ` ${ui("data.encodingNote", { encoding: decoded.encoding })}`;
}

/** Your own boundaries: a GeoJSON or TopoJSON file becomes a region of its own, next to the bundled ones. */
async function loadBoundaries(bytes, name) {
  let loaded;
  let geojson;
  try {
    geojson = JSON.parse(new TextDecoder().decode(bytes).replace(/^\uFEFF/, ""));
    loaded = await loadCustomAreas({ geojson }, async () => {
      throw new Error("no files in the browser");
    });
  } catch (error) {
    return setStatus(ui("data.error", { detail: error.message }), true);
  }
  state.boundaries = { geojson, name, loaded };
  tableRun++;
  if (state.example) {
    // The table of an example never names your areas, so it goes.
    resetForNewData();
    state.csv = "";
    state.table = null;
    fillColumns();
  } else {
    state.spec.region = "custom";
    state.regionTouched = true;
  }
  buildSelects();
  const note = ui("data.boundaries", { count: loaded.areas.length, file: name });
  if (state.csv) {
    await setTable(state.csv);
    toast(note);
  } else {
    syncControls();
    schedule();
    setStatus(note);
  }
}

function setStatus(text, error = false) {
  $("data-status").textContent = text;
  $("data-status").classList.toggle("error", error);
}

const REGION_ORDER = ["world", "us-states", "us-counties", "jp-prefectures", "kr-provinces", "tw-counties", "tw-towns"];
const cellsOf = (table, column) => table.rows.map((r) => (r[column] ?? "").trim());

/**
 * Columns whose cells are numbers, leaving out `except` (the column that names the areas) and the
 * columns that say when, unless nothing else is numeric.
 */
function numericColumns(table, except = []) {
  const sample = table.rows.slice(0, 60);
  const keys = [].concat(except);
  const numeric = table.columns.filter(
    (c) =>
      !keys.includes(c) &&
      sample.some((r) => (r[c] ?? "") !== "") &&
      sample.every((r) => (r[c] ?? "") === "" || parseNumber(r[c]) !== null),
  );
  const plain = numeric.filter((c) => !looksLikeYear(c, cellsOf(table, c)));
  return plain.length ? plain : numeric;
}

/** A long table has a row per area and year: the year to map, the latest unless the reader picks another. */
function periodOf(table, keyColumns) {
  if (!keyColumns.length) return null;
  const named = table.rows.map((r) => keyText(r, keyColumns)).filter(Boolean);
  if (new Set(named).size >= named.length) return null;
  const column = table.columns.find((c) => !keyColumns.includes(c) && looksLikeYear(c, cellsOf(table, c)));
  if (!column) return null;
  const values = [...new Set(cellsOf(table, column).filter(Boolean))].sort().reverse();
  return { column, values, value: values[0] };
}

function fillPeriod() {
  const period = state.period;
  $("field-period").hidden = !period;
  if (!period) return;
  $("period-label").textContent = period.column;
  options(
    $("period"),
    period.values.map((v) => [v, v]),
    period.value,
  );
}

/** @returns {Promise<boolean>} false when a newer table or file replaced this one before it was applied */
async function setTable(text, { keepSpec = false } = {}) {
  const run = ++tableRun;
  let table;
  try {
    table = parseTable(text);
  } catch (error) {
    setStatus(ui("data.error", { detail: error.message }), true);
    return false;
  }
  if (!table.columns.length || !table.rows.length) {
    // An empty file is not an error to read: say what to do.
    setStatus(ui("data.empty"), true);
    return false;
  }
  state.csv = text;
  state.table = table;
  if (!keepSpec) {
    setStatus(ui("checks.pending"));
    const found = await detectKey(table);
    if (run !== tableRun) return false;
    if (found.region && found.region !== state.spec.region) {
      state.spec.region = found.region;
      toast(ui("status.detected", { region: ui(`regions.${found.region}`) }));
    }
    const columns = table.columns;
    const numeric = numericColumns(table, found.columns);
    state.period = periodOf(table, found.columns);
    state.spec.key = "";
    state.spec.value =
      state.spec.value && !found.columns.includes(state.spec.value) && columns.includes(state.spec.value)
        ? state.spec.value
        : (numeric[0] ?? columns.find((c) => !found.columns.includes(c)) ?? columns[0]);
    state.spec.values = numeric.slice(0, 3);
  }
  setStatus(ui("data.loaded", { rows: table.rows.length, count: table.rows.length, cols: table.columns.length }));
  fillColumns();
  fillPeriod();
  syncControls();
  schedule();
  return true;
}

/**
 * Finds the column that names the areas and, until the reader picks a region, the region it belongs to.
 * @returns {Promise<{ region: string, columns: string[] }>}
 */
async function detectKey(table) {
  const columns = table.columns.slice(0, 8);
  const rows = table.rows.slice(0, 400);
  const topOf = async (id) => {
    const { areas, region } = id === "custom" ? state.boundaries.loaded : await loadAreas(id, assets);
    const aliases = await loadAliases(id, region, assets);
    const index = buildIndex(areas, aliases);
    const top = rankKeyColumns(columns, rows, index, region.keys)[0];
    if (top?.strong) return top;
    // A county in one column and its state in another name an area together.
    const pair = combinedKey(columns, rows, index, region.keys);
    return pair ? { ...pair, column: pair.columns.join(" + "), strong: true } : top;
  };
  if (!state.regionTouched) {
    let best = { region: "", columns: [], rate: 0, strong: false, hits: 0 };
    for (const id of REGION_ORDER) {
      const top = await topOf(id);
      // Equal fits go to the key that uses more columns: county and state say more than state alone.
      const better =
        top &&
        (Number(top.strong) - Number(best.strong) ||
          top.rate - best.rate ||
          (top.columns?.length ?? 1) - best.columns.length) > 0;
      if (better)
        best = { region: id, columns: top.columns ?? [top.column], rate: top.rate, strong: top.strong, hits: top.hits };
      // A column called state fits the states of the US, and a county and its state would fit better: keep looking.
      const maybeCounties = best.columns.some((c) => STATE_COLUMN.test(c.trim()));
      if (best.rate >= 0.9 && best.strong && !maybeCounties) break;
    }
    // A handful of plain numbers that happen to be codes (1 to 4, say) is not evidence of a region.
    if (best.strong || (best.rate >= 0.6 && best.hits >= 8)) return best;
  }
  const top = await topOf(state.spec.region);
  return { region: "", columns: top && top.rate >= 0.5 ? (top.columns ?? [top.column]) : [] };
}

async function loadExample(id) {
  const run = ++fileRun;
  const dir = new URL(`examples/${id}/`, root);
  const [spec, csv] = await Promise.all([
    fetch(new URL("spec.json", dir)).then((r) => r.json()),
    fetch(new URL("data.csv", dir)).then((r) => r.text()),
  ]);
  if (run !== fileRun) return;
  tableRun++;
  state.period = null;
  fillPeriod();
  state.bytes = null;
  state.boundaries = null;
  $("field-encoding").hidden = true;
  state.example = id;
  state.allow = new Set();
  state.fixes = [];
  state.regionTouched = true;
  fromSpec(spec);
  if (spec.language === undefined) state.spec.language = state.ui;
  state.csv = csv;
  state.table = parseTable(csv);
  buildSelects();
  buildPalettes();
  buildExamples();
  setStatus(
    ui("data.loaded", {
      rows: state.table.rows.length,
      count: state.table.rows.length,
      cols: state.table.columns.length,
    }),
  );
  syncControls();
  schedule(0);
}

/* Rendering --------------------------------------------------------------- */

let timer = 0;
function schedule(delay = 160) {
  clearTimeout(timer);
  timer = setTimeout(render, delay);
}

const hasInput = () => state.spec.type === "locator" || Boolean(state.table);

async function render() {
  const token = ++state.token;
  const wrap = document.querySelector(".sheet-wrap");
  const note = $("stage-note");
  const showNote = (on) => wrap.classList.toggle("has-note", on);
  if (!hasInput()) {
    $("sheet").replaceChildren();
    note.className = "stage-note show";
    showNote(true);
    note.replaceChildren(el("div", {}, el("strong", {}, ui("tagline")), ui("data.empty")));
    wrap.classList.add("settled");
    return;
  }
  wrap.classList.add("loading");
  if (!$("sheet").firstElementChild && !note.classList.contains("show")) {
    note.className = "stage-note show";
    showNote(true);
    note.replaceChildren(el("div", {}, ui("stage.loading")));
  }
  try {
    const result = await buildMap(toSpec(), {
      assets,
      locale: state.ui,
      readText: async () => {
        throw new Error("no files in the browser");
      },
    });
    if (token !== state.token) return;
    state.last = result;
    showFindings(result);
    showJoin(result);
    if (result.scene && !result.blocked) {
      const svg = await renderSvg(result.scene, store);
      if (token !== state.token) return;
      const first = !$("sheet").firstElementChild || $("sheet").classList.contains("stale");
      $("sheet").innerHTML = svg;
      $("sheet").classList.remove("stale");
      $("sheet").classList.toggle("fresh", first);
      note.className = "stage-note";
      showNote(false);
      const svgEl = $("sheet").querySelector("svg");
      svgEl.removeAttribute("width");
      svgEl.removeAttribute("height");
      interactions(svgEl, tipElement());
      $("expand").hidden = false;
    } else {
      $("sheet").classList.add("stale");
      $("expand").hidden = true;
      note.className = "stage-note show";
      showNote(true);
      const errors = result.findings.filter((f) => f.level === "error" && !f.allowed);
      note.replaceChildren(
        el(
          "div",
          {},
          el("strong", {}, ui("checks.blocked", { count: errors.length })),
          state.example === "covid-raw" ? el("p", { class: "demo-note" }, ui("stage.demo")) : null,
          el(
            "ul",
            { class: "stage-errors" },
            ...errors
              .slice(0, 5)
              .map((f) =>
                el("li", {}, el("code", {}, f.id), el("span", {}, f.message, f.fixable ? null : gotoButton(f))),
              ),
          ),
          errors.some((f) => f.fixable)
            ? el(
                "div",
                { class: "cta" },
                el("button", { class: "btn primary", type: "button", onclick: fixAll }, ui("checks.fixAll")),
              )
            : null,
        ),
      );
    }
  } catch (error) {
    if (token !== state.token) return;
    $("sheet").classList.add("stale");
    note.className = "stage-note show";
    showNote(true);
    note.replaceChildren(el("div", {}, ui("stage.failed", { detail: error.message })));
    console.error(error);
  } finally {
    if (token === state.token) {
      wrap.classList.remove("loading");
      wrap.classList.add("settled");
    }
  }
}

/** The control that fixes each finding by hand, for the findings that have no mechanical repair. */
const FIELD = {
  "source-required": "source",
  "title-required": "title",
  "legend-title": "unit",
  "kind-undeclared": "kind",
  "join-failed": "key",
  "raw-counts": "normalize",
  "normalize-missing": "normalize",
  "max-classes": "count",
  "skewed-classes": "method",
  "palette-order": "palettes",
  "cvd-separation": "palettes",
  "diverging-center": "center",
  "label-overlap": "labels",
  "value-not-numeric": "value",
  "no-values": "value",
};

/** The spec path a "spec" finding names, as the control that holds it. */
const SPEC_FIELD = {
  highlight: "highlight",
  "data.value": "value",
  "data.key": "key",
  "data.kind": "kind",
  "data.normalize": "normalize",
  "classes.count": "count",
  palette: "palettes",
};

const fieldFor = (f) => {
  const id = f.id === "spec" ? SPEC_FIELD[/spec at ([\w.]+):/.exec(f.message)?.[1] ?? ""] : FIELD[f.id];
  const node = id && $(id);
  if (!node) return null;
  const target =
    node.id === "palettes"
      ? (node.querySelector("input:checked") ?? node.querySelector("input"))
      : node.id === "value" && !node.offsetParent
        ? ($("values").querySelector("input:checked") ?? $("values").querySelector("input"))
        : node;
  return target?.offsetParent ? target : null;
};

function focusField(target) {
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
  target.focus({ preventScroll: true });
}

const gotoButton = (f) => {
  const target = fieldFor(f);
  return target
    ? el("button", { class: "goto", type: "button", onclick: () => focusField(target) }, ui("checks.goto"))
    : null;
};

function tipElement() {
  let tip = document.getElementById("tip");
  if (!tip) {
    tip = el("div", { class: "tip", id: "tip", hidden: true });
    document.body.append(tip);
  }
  return tip;
}

function showFindings(result) {
  const list = $("findings");
  const shown = result.findings.filter((f) => f.level !== "info" || f.allowed);
  const errors = shown.filter((f) => f.level === "error").length;
  const warns = shown.filter((f) => f.level === "warn").length;
  const summary = $("check-summary");
  summary.className = `summary ${errors ? "error" : warns ? "warn" : ""}`;
  summary.replaceChildren(
    el("span", { class: "dot" }),
    errors
      ? ui("checks.blocked", { count: errors })
      : warns
        ? ui("checks.warnings", { count: warns })
        : ui("checks.ok"),
  );
  const fixable = result.findings.some((f) => f.fixable && f.level === "error");
  $("fix-all").hidden = !fixable;
  const items = [];
  if (state.fixes.length)
    items.push(
      el(
        "li",
        { class: "finding" },
        el("div", { class: "head" }, el("span", { class: "tag" }, ui("level.info"))),
        el("p", {}, ui("checks.fixed", { list: state.fixes.map((f) => f.text || f.rule).join(", ") })),
      ),
    );
  for (const f of result.findings.filter((x) => x.level !== "info" || x.allowed)) {
    const level = f.allowed ? "info" : f.level;
    const canAllow =
      !["spec", "no-values", "value-not-numeric"].includes(f.id) &&
      (f.level === "error" || f.was === "error" || f.level === "warn");
    items.push(
      el(
        "li",
        { class: `finding ${level}` },
        el(
          "div",
          { class: "head" },
          el("span", { class: "tag" }, ui(`level.${f.allowed ? (f.was ?? "info") : f.level}`)),
          el("code", {}, f.id),
        ),
        el("p", {}, f.message, f.fixable || f.level === "info" ? null : gotoButton(f)),
        el("details", {}, el("summary", {}, ui("checks.why")), f.reason),
        (canAllow && f.level !== "info") || f.allowed
          ? el(
              "div",
              { class: "actions" },
              el(
                "button",
                { class: "btn small", type: "button", "data-allow": f.id, onclick: () => toggleAllow(f.id) },
                f.allowed ? ui("checks.allowed") : ui("checks.allow"),
              ),
            )
          : null,
      ),
    );
  }
  const signature = result.findings.map((f) => `${f.id}:${f.level}`).join();
  list.classList.toggle("enter", signature !== state.signature);
  state.signature = signature;
  list.replaceChildren(...items);
  if (state.refocus) list.querySelector(`[data-allow="${state.refocus}"]`)?.focus({ preventScroll: true });
  state.refocus = "";
}

function toggleAllow(id) {
  if (state.allow.has(id)) state.allow.delete(id);
  else state.allow.add(id);
  state.refocus = id;
  schedule(0);
}

function showJoin(result) {
  const j = result.analysis?.join;
  const pills = [];
  if (j) {
    pills.push(
      el(
        "span",
        { class: "pill" },
        ui("checks.matched", { matched: j.rowsMatched, rows: j.rows, areas: j.rowsByArea.size }),
      ),
    );
    pills.push(el("span", { class: "pill" }, `${j.column} → ${j.kind}`));
    if (j.unmatched.length)
      pills.push(
        el(
          "span",
          { class: "pill bad", title: j.unmatched.map((u) => u.value).join("; ") },
          ui("checks.unmatched", {
            list:
              j.unmatched
                .slice(0, 3)
                .map((u) => u.value)
                .join(", ") + (j.unmatched.length > 3 ? ", ..." : ""),
          }),
        ),
      );
  }
  $("join-summary").replaceChildren(...pills);
}

async function fixAll() {
  const button = $("fix-all");
  button.disabled = true;
  try {
    const result = await buildMap(toSpec(), {
      assets,
      locale: state.ui,
      fix: true,
      readText: async () => {
        throw new Error("no files");
      },
    });
    state.fixes = result.fixes;
    fromSpec(result.spec);
    buildSelects();
    buildPalettes();
    syncControls();
    await render();
    const drawn = state.last && !state.last.blocked;
    (drawn ? $("sheet") : ($("stage-note").querySelector("button") ?? $("check-summary"))).focus({
      preventScroll: true,
    });
  } finally {
    button.disabled = false;
  }
}

/* Larger view ------------------------------------------------------------- */

/** On a phone the map is small, so it opens full screen at a size where the labels can be read. */
function openViewer() {
  const svg = $("sheet").querySelector("svg");
  if (!svg) return;
  const copy = svg.cloneNode(true);
  copy.removeAttribute("style");
  // The page keeps the original: the copy must not repeat its ids, and names itself instead.
  copy.removeAttribute("aria-labelledby");
  copy.querySelectorAll("#graticule-title, #graticule-desc").forEach((node) => node.removeAttribute("id"));
  const viewer = $("viewer");
  viewer.style.setProperty("--viewer-width", `${Math.round(Math.max(960, window.innerWidth * 2.4))}px`);
  $("viewer-title").textContent = svg.querySelector("title")?.textContent ?? "";
  viewer.setAttribute("aria-label", $("viewer-title").textContent);
  copy.setAttribute("aria-label", $("viewer-title").textContent);
  $("viewer-body").replaceChildren(copy);
  interactions(copy, $("viewer-tip"));
  viewer.showModal();
}

/* Export ------------------------------------------------------------------ */

const EXPORTS = [
  ["svg", "export.svg", ".svg", "image/svg+xml"],
  ["png", "export.png", ".png", "image/png"],
  ["png3x", "export.png3x", "@300dpi.png", "image/png"],
  ["pdf", "export.pdf", ".pdf", "application/pdf"],
  ["html", "export.html", ".html", "text/html"],
  ["spec", "export.spec", ".json", "application/json"],
];

function buildExports() {
  $("exports").replaceChildren(
    ...EXPORTS.map(([id, label, ext]) =>
      el(
        "button",
        { class: "btn", type: "button", "data-export": id, onclick: () => download(id) },
        ui(label),
        el("small", {}, ext),
      ),
    ),
  );
}

const slug = () =>
  (state.spec.title || "map")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "map";

function save(data, name, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  el("a", { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function download(id) {
  const result = state.last;
  if (id === "spec") return save(JSON.stringify(toSpec(), null, 2) + "\n", `${slug()}.spec.json`, "application/json");
  if (!result?.scene || result.blocked) return toast(ui("stage.blocked"));
  const button = document.querySelector(`[data-export="${id}"]`);
  button.disabled = true;
  const label = button.firstChild.textContent;
  button.firstChild.textContent = ui("export.working");
  try {
    const format = id === "png3x" ? "png" : id;
    const out = await exportMap(result, [format], { assets, store, dpi: id === "png3x" ? 300 : 96 });
    const [, , ext, type] = EXPORTS.find((e) => e[0] === id);
    save(out[format], `${slug()}${ext}`, type);
  } catch (error) {
    toast(ui("stage.failed", { detail: error.message }));
  } finally {
    button.firstChild.textContent = label;
    button.disabled = false;
  }
}

let toastTimer = 0;
function toast(text) {
  const node = $("toast");
  node.textContent = text;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (node.hidden = true), 3200);
}

/* Wiring -------------------------------------------------------------------- */

function wire() {
  const drop = $("drop");
  const file = $("file");
  const readFile = async (f) => {
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) return setStatus(ui("data.error", { detail: "25 MB" }), true);
    const run = ++fileRun;
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (run !== fileRun) return;
    const text = new TextDecoder().decode(bytes.subarray(0, 4096)).trimStart();
    if (/\.(geo|topo)?json$/i.test(f.name) || text.startsWith("{")) return loadBoundaries(bytes, f.name);
    // Refuse a workbook or an image before anything of the current map is cleared.
    const binary = sniffBinary(bytes);
    if (binary) return setStatus(ui("data.error", { detail: `this is ${binary}, not a text table` }), true);
    resetForNewData();
    await loadBytes(bytes);
  };
  drop.addEventListener("click", () => file.click());
  drop.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), file.click()));
  file.addEventListener("change", () => readFile(file.files[0]));
  $("expand").addEventListener("click", openViewer);
  $("viewer-close").addEventListener("click", () => $("viewer").close());
  $("encoding").addEventListener("change", async () => {
    const bytes = state.bytes;
    resetForNewData();
    await loadBytes(bytes, $("encoding").value);
  });
  for (const type of ["dragenter", "dragover"])
    drop.addEventListener(type, (e) => (e.preventDefault(), drop.classList.add("over")));
  for (const type of ["dragleave", "drop"])
    drop.addEventListener(type, (e) => (e.preventDefault(), drop.classList.remove("over")));
  drop.addEventListener("drop", (e) => readFile(e.dataTransfer.files[0]));
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    if (!drop.contains(e.target)) {
      e.preventDefault();
      readFile(e.dataTransfer.files[0]);
    }
  });
  $("paste").addEventListener("input", () => {
    if ($("paste").value.trim()) {
      resetForNewData();
      setTable($("paste").value);
    }
  });

  const panel = $("panel");
  panel.addEventListener("input", (e) => {
    if (["paste", "file", "encoding"].includes(e.target.id)) return;
    readControls();
    if (e.target.id === "region") state.regionTouched = true;
    if (e.target.id === "map-lang") {
      state.languageTouched = true;
      state.spec.language = e.target.value;
    }
    if (e.target.name === "type") {
      state.spec.type = e.target.value;
      // Small multiples need columns to draw: start with the numeric ones.
      if (state.spec.type === "small-multiples" && !state.spec.values.length && state.table) {
        state.spec.values = numericColumns(
          state.table,
          state.spec.key || (state.last?.analysis?.join?.columns ?? []),
        ).slice(0, 3);
        fillColumns();
      }
      state.extra.palette = undefined;
      buildPalettes();
    }
    syncControls();
    schedule(e.target.type === "text" || e.target.type === "number" ? 220 : 60);
  });
  $("map-lang").addEventListener("change", (e) => {
    state.languageTouched = true;
    state.spec.language = e.target.value;
    schedule(0);
  });
  $("ui-lang").addEventListener("change", (e) => setUiLanguage(e.target.value));
  $("fix-all").addEventListener("click", fixAll);
  $("theme-toggle").addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme !== "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    $("theme-toggle").setAttribute("aria-pressed", String(dark));
    try {
      localStorage.setItem("graticule.theme", dark ? "dark" : "light");
    } catch {}
  });
}

function startLanguage() {
  const params = new URLSearchParams(location.search);
  let saved = "";
  try {
    saved = localStorage.getItem("graticule.lang") ?? "";
  } catch {}
  return normalizeLang(params.get("lang") ?? "") || normalizeLang(saved) || normalizeLang(navigator.language) || "en";
}

wire();
$("theme-toggle").setAttribute("aria-pressed", String(document.documentElement.dataset.theme === "dark"));
await setUiLanguage(startLanguage());
const wanted = new URLSearchParams(location.search).get("example");
if (wanted && EXAMPLES.includes(wanted)) await loadExample(wanted);
else await loadExample("covid-raw");
window.graticule = { state, render, loadExample };
