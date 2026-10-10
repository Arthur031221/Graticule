import { geoBounds } from "d3-geo";
import { lightnessSteps, paletteType, separation } from "./palettes.js";
import { getRegion } from "./regions.js";
import { PROJECTIONS } from "./projections.js";
import { declaredPer } from "./spec.js";

export const THRESHOLDS = {
  /** Smallest CIEDE2000 between neighbouring classes, normal and simulated vision. */
  sequentialError: 2.5,
  sequentialWarn: 4,
  categoricalError: 4,
  categoricalWarn: 8,
  /** Smallest lightness step between sequential classes (CIE L*). */
  lightnessStep: 2,
  maxClasses: 7,
  maxCategories: 8,
  populationCorrelation: 0.6,
  mercatorLatitudeSpan: 20,
  /** Below this latitude span the distortion of any projection is too small to matter. */
  smallRegionSpan: 10,
  skewShare: 0.7,
  noDataShare: 0.4,
  unmatchedShare: 0.5,
};

/**
 * The rules, in the order they are documented. `fires` says exactly when a
 * rule triggers; docs and `graticule rules` are generated from it.
 */
export const RULES = {
  "source-required": { level: "error", fires: "The spec has no source." },
  "title-required": { level: "warn", fires: "The spec has no title." },
  "legend-title": { level: "warn", fires: "Neither legend.title nor data.label is set, so the unit is not stated." },
  "kind-undeclared": {
    level: "warn",
    fires: "A choropleth has no data.kind and no normalize, and the values do not look like counts.",
  },
  "table-ragged": { level: "warn", fires: "Some rows of the table have more or fewer cells than the header." },
  "join-blank": { level: "warn", fires: "Some rows have an empty key and are not drawn." },
  "join-failed": {
    level: "error",
    fires: `No row matched an area, or fewer than ${THRESHOLDS.unmatchedShare * 100}% of the rows with a key did.`,
  },
  "join-unmatched": { level: "warn", fires: "Some rows matched no area. Lists them with the closest names." },
  "join-ambiguous": { level: "warn", fires: "A name fits more than one area. Those rows are not drawn." },
  "duplicate-keys": { level: "error", fires: "An area has more than one row and data.aggregate is not set." },
  "raw-counts": {
    level: "error",
    fires: `A choropleth has data.kind count, or no kind and a Spearman rank correlation of ${THRESHOLDS.populationCorrelation} or more between its values and the population of the areas, and no normalize.`,
  },
  "projection-mercator": {
    level: "error",
    fires: `The projection is Mercator on a region more than ${THRESHOLDS.mercatorLatitudeSpan} degrees of latitude tall.`,
  },
  "projection-not-equal-area": {
    level: "warn",
    fires: `A shaded map of a region more than ${THRESHOLDS.smallRegionSpan} degrees of latitude tall uses a projection that does not preserve area.`,
  },
  "max-classes": { level: "error", fires: `More than ${THRESHOLDS.maxClasses} classes.` },
  "class-breaks-coverage": { level: "error", fires: "Manual breaks stop short of the lowest or the highest value." },
  "empty-class": { level: "warn", fires: "A class holds no area." },
  "skewed-classes": {
    level: "warn",
    fires: `Equal or manual classes put more than ${THRESHOLDS.skewShare * 100}% of the areas in one class.`,
  },
  "palette-order": {
    level: "error",
    fires: `A palette for ordered classes, sequential or categorical, whose lightness does not move one way or moves less than ${THRESHOLDS.lightnessStep} L* between neighbours.`,
  },
  "cvd-separation": {
    level: "error",
    fires: `Neighbouring colours (all pairs for categories) come closer than CIEDE2000 ${THRESHOLDS.sequentialError} under normal vision or a simulated protanopia, deuteranopia or tritanopia. A warning below ${THRESHOLDS.sequentialWarn} (for categories: error below ${THRESHOLDS.categoricalError}, warning below ${THRESHOLDS.categoricalWarn}).`,
  },
  "diverging-center": { level: "error", fires: "A diverging palette is used without center." },
  "too-many-categories": {
    level: "error",
    fires: `A categorical map has more than ${THRESHOLDS.maxCategories} categories.`,
  },
  "normalize-missing": {
    level: "warn",
    fires: "Some areas have no bundled population or area to divide by and are shown as no data.",
  },
  "values-skipped": {
    level: "warn",
    fires:
      "Rows that matched an area hold a cell that is not a number, or a value whose denominator is missing or zero, and were left out.",
  },
  "no-data-share": {
    level: "warn",
    fires: `More than ${THRESHOLDS.noDataShare * 100}% of the areas have no value, in any panel.`,
  },
  "label-overlap": {
    level: "error",
    fires: "Two placed labels overlap. Checked on the final layout, so it guards the label placer itself.",
  },
};

const SHADED = new Set(["choropleth", "small-multiples"]);

/** Projection the map will use. */
export function projectionNameOf(spec, region = getRegion(spec.region)) {
  if (spec.projection !== "auto") return typeof spec.projection === "string" ? spec.projection : spec.projection.name;
  const configured = region.projection;
  return typeof configured === "string" ? configured : configured.name;
}

function latitudeSpan(analysis) {
  const box = analysis.region.box ?? analysis.region.bounds;
  if (box) return box[3] - box[1];
  const collection = {
    type: "FeatureCollection",
    features: analysis.areas.map((a) => ({ type: "Feature", properties: {}, geometry: a.geometry })),
  };
  const [[, south], [, north]] = geoBounds(/** @type {any} */ (collection));
  return north - south;
}

function niceFloor(value) {
  const step = 10 ** Math.floor(Math.log10(Math.abs(value) || 1) - 1);
  return Math.floor(value / step) * step;
}
function niceCeil(value) {
  const step = 10 ** Math.floor(Math.log10(Math.abs(value) || 1) - 1);
  return Math.ceil(value / step) * step;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Data and spec rules. Returns findings; fixes are functions that edit a spec.
 * Rules that need the drawn map (label overlap) run in the renderer.
 * @param {any} a result of analyze()
 * @returns {import("./analyze.js").Finding[]}
 */
export function checkAnalysis(a) {
  const { spec, join, classing } = a;
  const findings = [];
  const add = (id, level, params = {}, fix, fixText, variant) =>
    findings.push({ id, level, params, fix, fixText, variant });
  const shaded = SHADED.has(spec.type);

  if (!spec.source) add("source-required", "error");
  if (!spec.title) add("title-required", "warn");
  if (spec.type !== "locator" && !spec.legend.title && !spec.data.label)
    add("legend-title", "warn", { column: [].concat(spec.data.value ?? []).join(", ") });

  if (join) checkJoin(a, add);
  for (const series of a.series) {
    if (series.duplicates?.length && !spec.data.aggregate) {
      const example = a.index.byId.get(series.duplicates[0].id)?.names[0] ?? series.duplicates[0].id;
      add("duplicate-keys", "error", { count: series.duplicates.length, example, rows: series.duplicates[0].rows });
      break;
    }
  }
  const unnormalized = Math.max(0, ...a.series.map((series) => series.normalizedMissing ?? 0));
  if (unnormalized) add("normalize-missing", "warn", { count: unnormalized, by: spec.data.normalize.by });
  const skipped = a.series.reduce((n, series) => n + (series.skipped?.count ?? 0), 0);
  if (skipped) {
    const example = a.series.find((series) => series.skipped?.count)?.skipped.example ?? "";
    add("values-skipped", "warn", { count: skipped, example });
  }
  if (shaded && a.series.length) checkRawCounts(a, add);
  if (spec.type !== "symbols" && spec.type !== "locator") checkProjection(a, add);
  if (classing && spec.type === "categorical") checkCategories(a, add);
  else if (classing) checkClasses(a, add);
  if (a.series.length && a.areas.length && spec.type !== "symbols") {
    const visible = a.areas.filter((area) => !a.frameIds || a.frameIds.has(area.id));
    // Each panel is a map of its own: the emptiest one decides.
    const empty = Math.max(
      ...a.series.map((series) => visible.filter((area) => series.byArea.get(area.id) == null).length),
    );
    const share = empty / visible.length;
    if (share > THRESHOLDS.noDataShare)
      add("no-data-share", "warn", { percent: Math.round(share * 100), count: empty, total: visible.length });
  }
  return findings;
}

/** The first names of a long list, with how many are left out. The full list is in the JSON report. */
const MAX_NAMES = 20;
const namesOf = (items, render) =>
  items.slice(0, MAX_NAMES).map(render).join("; ") +
  (items.length > MAX_NAMES ? `; ... (+${items.length - MAX_NAMES})` : "");

function checkJoin(a, add) {
  const { join } = a;
  const keyed = join.cells.filter((cell) => cell !== "").length;
  const share = keyed ? join.rowsMatched / keyed : 0;
  const examples = join.unmatched.slice(0, 3).map((u) => u.value);
  if (!join.rowsMatched || share < THRESHOLDS.unmatchedShare) {
    add("join-failed", "error", {
      column: join.column,
      kind: join.kind,
      percent: Math.round(share * 100),
      examples: examples.join(", "),
      region: a.spec.region,
    });
  } else if (join.unmatched.length) {
    const rows = join.unmatched.reduce((n, u) => n + u.rows.length, 0);
    add("join-unmatched", "warn", {
      count: rows,
      list: namesOf(join.unmatched, (u) =>
        u.suggestions.length ? `${u.value} (${u.suggestions.join(" or ")}?)` : u.value,
      ),
    });
  }
  if (join.blank) add("join-blank", "warn", { count: join.blank });
  if (join.ambiguous.length)
    add("join-ambiguous", "warn", {
      list: namesOf(join.ambiguous, (u) => `${u.value} (${u.candidates.join(" or ")})`),
    });
}

function checkRawCounts(a, add) {
  const { spec, population } = a;
  if (spec.data.normalize) return;
  const kind = spec.data.kind;
  const declared = kind === "count";
  const inferred = !kind && population.rho !== null && population.rho >= THRESHOLDS.populationCorrelation;
  if (!declared && !inferred) {
    if (!kind) add("kind-undeclared", "warn");
    return;
  }
  const fix = population.available
    ? (s, analysis) => {
        const ratios = analysis.series
          .flatMap((series) => [...series.byArea])
          .filter(([id, v]) => v !== null && analysis.index.byId.get(id)?.pop)
          .map(([id, v]) => v / analysis.index.byId.get(id).pop);
        const typical = ratios.length ? median(ratios) : 0;
        // A unit the spec already states ("per 100,000 people") is kept, so the numbers match their label.
        const per =
          declaredPer(s.legend?.title, s.data.label, s.title) ??
          [1000, 100000, 1000000].find((p) => typical * p >= 1) ??
          1000000;
        s.data.normalize = { by: "population", per };
        s.data.kind = "rate";
      }
    : undefined;
  add(
    "raw-counts",
    "error",
    { rho: population.rho === null ? "" : population.rho.toFixed(2) },
    fix,
    "normalize by population",
    declared ? "declared" : "correlated",
  );
}

function checkProjection(a, add) {
  const { spec } = a;
  const name = projectionNameOf(spec, a.region);
  const entry = PROJECTIONS[name];
  if (!entry || entry.equalArea || latitudeSpan(a) <= THRESHOLDS.smallRegionSpan) return;
  if (name === "mercator" && latitudeSpan(a) > THRESHOLDS.mercatorLatitudeSpan) {
    add(
      "projection-mercator",
      "error",
      { span: Math.round(latitudeSpan(a)) },
      (s) => (s.projection = "auto"),
      "use the region's equal-area projection",
    );
  } else if (spec.projection !== "auto" || !entry.equalArea) {
    add("projection-not-equal-area", "warn", { name });
  }
}

function checkClasses(a, add) {
  const { spec, classing } = a;
  const numbers = a.series.flatMap((s) => s.numbers ?? []);
  if (classing.k > THRESHOLDS.maxClasses) {
    const fix = classing.method === "manual" ? undefined : (s) => (s.classes.count = THRESHOLDS.maxClasses);
    add(
      "max-classes",
      "error",
      { count: classing.k, max: THRESHOLDS.maxClasses },
      fix,
      `use ${THRESHOLDS.maxClasses} classes`,
    );
  }
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  if (classing.method === "manual" && (min < classing.edges[0] || max > classing.edges[classing.edges.length - 1])) {
    const fix = (s) => {
      const b = s.classes.breaks.slice();
      if (min < b[0]) b.unshift(niceFloor(min));
      if (max > b[b.length - 1]) b.push(niceCeil(max));
      s.classes.breaks = b;
    };
    add(
      "class-breaks-coverage",
      "error",
      { low: classing.edges[0], high: classing.edges[classing.edges.length - 1], min, max },
      fix,
      "add classes for the missing range",
    );
  }
  classing.counts.forEach((n, i) => {
    if (n === 0) add("empty-class", "warn", { index: i + 1 });
  });
  const total = classing.counts.reduce((x, y) => x + y, 0);
  if (
    total >= 10 &&
    classing.method !== "quantile" &&
    classing.method !== "jenks" &&
    Math.max(...classing.counts) / total > THRESHOLDS.skewShare
  ) {
    add("skewed-classes", "warn", { percent: Math.round((100 * Math.max(...classing.counts)) / total) });
  }
  const type = Array.isArray(spec.palette) ? "sequential" : paletteType(classing.paletteName);
  // A categorical palette on ordered classes passes only if its lightness happens to run one way.
  const colors = classing.colors;
  if (type === "sequential" || type === "categorical") {
    const steps = lightnessSteps(colors);
    const direction = Math.sign(steps[0]);
    if (steps.some((d) => Math.sign(d) !== direction || Math.abs(d) < THRESHOLDS.lightnessStep)) {
      add(
        "palette-order",
        "error",
        { palette: classing.paletteName ?? "custom" },
        (s) => delete s.palette,
        "use the default sequential palette",
      );
    }
  }
  if (type === "diverging" && (spec.center === undefined || spec.center === null)) {
    const spans = min < 0 && max > 0;
    add(
      "diverging-center",
      "error",
      { palette: classing.paletteName },
      spans ? (s) => (s.center = 0) : undefined,
      "centre the palette on 0",
    );
  }
  const worst = Math.min(...Object.values(separation(colors)));
  if (worst < THRESHOLDS.sequentialWarn) {
    const level = worst < THRESHOLDS.sequentialError ? "error" : "warn";
    add(
      "cvd-separation",
      level,
      { worst: worst.toFixed(1), palette: classing.paletteName ?? "custom" },
      level === "error"
        ? (s) => {
            delete s.palette;
            s.classes.count = Math.min(s.classes.count, 7);
          }
        : undefined,
      "use the default palette",
    );
  }
}

function checkCategories(a, add) {
  const { classing } = a;
  if (classing.k > THRESHOLDS.maxCategories)
    add("too-many-categories", "error", { count: classing.k, max: THRESHOLDS.maxCategories });
  const worst = Math.min(...Object.values(separation(classing.colors.slice(0, 8), true)));
  if (worst < THRESHOLDS.categoricalWarn) {
    const level = worst < THRESHOLDS.categoricalError ? "error" : "warn";
    add(
      "cvd-separation",
      level,
      { worst: worst.toFixed(1), palette: classing.paletteName ?? "custom" },
      level === "error" ? (s) => delete s.palette : undefined,
      "use the default palette",
    );
  }
}
