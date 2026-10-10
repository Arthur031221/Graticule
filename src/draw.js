import { geoCentroid, geoGraticule, geoOrthographic, geoPath } from "d3-geo";
import { feature as topoFeature } from "topojson-client";
import { readableOn } from "./color.js";
import { createProjection, fitExtent, fitWidth } from "./projections.js";
import { labelAnchor, placeLabels, ringsOf } from "./labels.js";
import { categoryLegend, classLegend, symbolLegend } from "./legend.js";
import { nameIn } from "./geo.js";
import { numberFormatter } from "./i18n.js";
import { boundaryCredit } from "./regions.js";
import { cjkFamily } from "./lang.js";
import { isCjk } from "./text.js";
import { minifyPath } from "./pathmin.js";

export const THEMES = {
  light: {
    bg: "#fbfaf7",
    ink: "#1b1f23",
    muted: "#5b626b",
    faint: "#939aa3",
    noData: "#e5e2d9",
    base: "#e9e6dd",
    stroke: "#ffffff",
    border: "#8d949d",
    accent: "#c8412b",
    ocean: "#eef1f3",
  },
  dark: {
    bg: "#14171c",
    ink: "#eef0f2",
    muted: "#a5adb7",
    faint: "#78808a",
    noData: "#2a2f37",
    base: "#262b33",
    stroke: "#14171c",
    border: "#6b737e",
    accent: "#ff7a59",
    ocean: "#1b2027",
  },
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Title, subtitle and footer lines plus the sizes derived from the canvas width. */
function basics(a, ctx) {
  const { spec } = a;
  const { measurer: m, t } = ctx;
  const theme = THEMES[spec.theme];
  const W = spec.size.width;
  const scale = W / 1200;
  const M = Math.round(Math.max(18, 42 * scale));
  const inner = W - 2 * M;
  const titleSize = Math.round(clamp(31 * scale, 18, 46));
  const subSize = Math.round(titleSize * 0.56);
  const noteSize = Math.max(10.5, Math.round(12 * scale * 10) / 10);

  const head = [];
  let y = M;
  if (spec.title) {
    for (const line of m.wrap(spec.title, inner, titleSize, "bold")) {
      head.push({
        type: "text",
        x: M,
        y: y + titleSize * 0.92,
        text: line,
        size: titleSize,
        weight: "bold",
        fill: theme.ink,
      });
      y += titleSize * 1.2;
    }
  }
  if (spec.subtitle) {
    y += 2 * scale;
    for (const line of m.wrap(spec.subtitle, inner, subSize)) {
      head.push({ type: "text", x: M, y: y + subSize * 0.92, text: line, size: subSize, fill: theme.muted });
      y += subSize * 1.35;
    }
  }
  const footLines = [];
  const stop = ["zh-Hant", "zh-Hans", "ja"].includes(spec.language) ? "\u3002" : ".";
  const sentence = (text) => (/[.!?\u3002\uff01\uff1f)]$/.test(text) ? text : text + stop);
  const sourceText = [spec.source ? t("footer.source", { source: spec.source }) : "", spec.note]
    .filter(Boolean)
    .map(sentence)
    .join(" ");
  if (sourceText) footLines.push(...m.wrap(sourceText, inner, noteSize));
  const credit = [
    spec.attribution === false ? "" : t("footer.made_with"),
    a.region ? boundaryCredit(spec.region, a.region.level === "custom" ? a.region : undefined) : "",
  ]
    .filter(Boolean)
    .join("  |  ");
  if (credit) footLines.push(...m.wrap(credit, inner, noteSize));
  return { spec, theme, W, scale, M, inner, titleSize, noteSize, head, headBottom: y, footLines, t, m };
}

function footer(b, bottomY) {
  return b.footLines.map((line, i) => ({
    type: "text",
    x: b.M,
    y: bottomY + b.noteSize * (1.15 + 1.35 * i),
    text: line,
    size: b.noteSize,
    fill: b.theme.faint,
  }));
}

const footerHeight = (b) => (b.footLines.length ? b.noteSize * (1.35 * b.footLines.length + 0.4) + 6 * b.scale : 0);

/**
 * Fits the region's projection to the frame. Returns one path string per
 * visible area, each with the path generator that drew it (an inset area
 * has its own projection).
 */
function geometry(a, frame) {
  const { spec, region, areas } = a;
  const config = spec.projection === "auto" ? region.projection : spec.projection;
  const insets = (region.insets ?? []).map((inset) => ({
    ...inset,
    members: areas.filter(
      (area) => inset.match.ids?.includes(area.id) || inset.match.county?.includes(area.props.county),
    ),
  }));
  const taken = new Set(insets.flatMap((inset) => inset.members.map((area) => area.id)));
  const mainAreas = areas.filter((area) => !taken.has(area.id));
  const object = region.box
    ? geoGraticule()
        .extent([
          [region.box[0], region.box[1]],
          [region.box[2], region.box[3]],
        ])
        .precision(1)
        .outline()
    : {
        type: "FeatureCollection",
        features: mainAreas.map((area) => ({ type: "Feature", properties: {}, geometry: area.geometry })),
      };
  const [[x0, y0], [x1, y1]] = frame;
  const natural = fitWidth(createProjection(config), x1 - x0, object);
  const height = Math.min(natural, y1 - y0);
  const mainFrame = [
    [x0, y0],
    [x1, y0 + height],
  ];
  const projection = createProjection(config);
  fitExtent(projection, mainFrame, object);
  if (typeof projection.clipExtent === "function" && !projection.parts) projection.clipExtent(mainFrame);
  const path = geoPath(projection).digits(1);
  const shapes = [];
  const add = (area, drawer) => {
    const feature = { type: "Feature", properties: {}, geometry: area.geometry };
    const raw = drawer(feature);
    if (raw) shapes.push({ area, feature, d: minifyPath(raw), path: drawer.owner });
  };
  const owned = (generator) => Object.assign((f) => generator(f), { owner: generator });
  const drawMain = owned(path);
  for (const area of mainAreas) add(area, drawMain);
  const frames = [];
  for (const inset of insets) {
    if (!inset.members.length) continue;
    const [px, py, pw, ph] = inset.place;
    const box = [
      [x0 + px * (x1 - x0), y0 + py * height],
      [x0 + (px + pw) * (x1 - x0), y0 + (py + ph) * height],
    ];
    const outline = geoGraticule()
      .extent([
        [inset.box[0], inset.box[1]],
        [inset.box[2], inset.box[3]],
      ])
      .precision(0.5)
      .outline();
    const insetProjection = createProjection(inset.projection);
    fitExtent(insetProjection, box, outline);
    const fitted = geoPath(insetProjection).bounds(outline);
    const clip = [
      [fitted[0][0], fitted[0][1]],
      [fitted[1][0], fitted[1][1]],
    ];
    insetProjection.clipExtent(clip);
    const drawer = owned(geoPath(insetProjection).digits(1));
    for (const area of inset.members) add(area, drawer);
    frames.push(clip);
  }
  return { projection, path, shapes, height, natural, frames };
}

function valueFormatter(lang) {
  const tag = { "zh-Hant": "zh-TW", "zh-Hans": "zh-CN", pt: "pt-BR" }[lang] ?? lang;
  const plain = new Intl.NumberFormat(tag, { maximumSignificantDigits: 4 });
  const compact = new Intl.NumberFormat(tag, { notation: "compact", maximumSignificantDigits: 3 });
  return (v) => (Math.abs(v) >= 100000 ? compact.format(v) : plain.format(v));
}

function legendTitle(a, t) {
  const { spec } = a;
  const base = spec.legend.title ?? spec.data.label ?? [].concat(spec.data.value ?? [])[0] ?? "";
  const per = (n) =>
    new Intl.NumberFormat(
      { "zh-Hant": "zh-TW", "zh-Hans": "zh-CN", pt: "pt-BR" }[spec.language] ?? spec.language,
    ).format(n);
  const n = spec.data.normalize;
  if (n && n.by === "population" && !spec.legend.title)
    return `${base} ${n.per === 1 ? t("legend.per_person") : t("legend.per_population", { per: per(n.per) })}`.trim();
  if (n && n.by === "area" && !spec.legend.title)
    return `${base} ${(n.per ?? 1) === 1 ? t("legend.per_km2") : t("legend.per_area", { per: per(n.per) })}`.trim();
  return base;
}

/**
 * Draws a map as a scene.
 * @param {any} a analysis from analyze() (after the checks)
 * @param {{ measurer: any, t: (key: string, params?: any) => string, world110?: any, coverage: ReturnType<typeof import("./faces.js").createCoverage> }} ctx
 */
export function drawMap(a, ctx) {
  const b = basics(a, ctx);
  const draw = {
    choropleth: drawShaded,
    categorical: drawShaded,
    "small-multiples": drawMultiples,
    symbols: drawSymbols,
    locator: drawLocator,
  }[a.spec.type];
  const result = draw(a, ctx, b);
  const items = [...b.head, ...result.items, ...footer(b, result.height - footerHeight(b) - b.M * 0.15)];
  const allText = textOf(items);
  const cjkChars = [...allText].filter(isCjk).map((c) => c.codePointAt(0));
  const cjk = cjkChars.length ? cjkFamily(a.spec.language) || ctx.coverage.best(cjkChars) : "";
  const scene = {
    width: b.W,
    height: Math.ceil(result.height),
    background: b.theme.bg,
    title: a.spec.title || a.region.title,
    desc: [a.spec.subtitle, a.spec.source && ctx.t("footer.source", { source: a.spec.source })]
      .filter(Boolean)
      .join(". "),
    cjk,
    coverage: ctx.coverage,
    lang: a.spec.language,
    items,
    table: result.table ?? [],
    classes: result.classes ?? [],
  };
  const otherChars = [...allText].filter((c) => !isCjk(c) && !/[\s\p{C}]/u.test(c)).map((c) => c.codePointAt(0));
  const missing = [
    ...new Set([
      ...cjkChars.filter((cp) => !ctx.coverage.pick(cp, cjk)),
      ...otherChars.filter((cp) => !ctx.measurer.has(cp)),
    ]),
  ].map((cp) => String.fromCodePoint(cp));
  return { scene, stats: { ...result.stats, missingGlyphs: missing } };
}

function textOf(items) {
  return items
    .map((item) => (item.type === "text" ? item.text : item.type === "g" ? textOf(item.children) : ""))
    .join("");
}

function areaClasses(a, series) {
  const { classing } = a;
  const colors =
    a.spec.theme === "dark" && classing.method !== "categorical" && !classing.diverging
      ? [...classing.colors].reverse()
      : classing.colors;
  return { colorOf: (id) => ((series.assign.get(id) ?? -1) >= 0 ? colors[series.assign.get(id)] : null), colors };
}

function legendFor(a, ctx, b, x, y, width) {
  const { classing, spec } = a;
  const title = legendTitle(a, ctx.t);
  const noData = ctx.t("legend.no_data");
  const { colors } = areaClasses(a, a.series[0]);
  const hasNoData =
    a.areas.some((area) => !a.series.some((s) => (s.assign.get(area.id) ?? -1) >= 0)) || a.series.length > 1;
  if (classing.method === "categorical") {
    return categoryLegend({
      x,
      y,
      width,
      scale: b.scale,
      categories: classing.categories,
      colors,
      title,
      theme: b.theme,
      measurer: b.m,
      noDataLabel: noData,
      showNoData: hasNoData,
    });
  }
  const format = numberFormatter(spec.language, classing.edges);
  return classLegend({
    x,
    y,
    width,
    scale: b.scale,
    edges: classing.edges,
    colors,
    title,
    theme: b.theme,
    measurer: b.m,
    format,
    noDataLabel: noData,
    center: spec.center,
    showNoData: hasNoData,
  });
}

function tooltipOf(area, lang, valueText, t) {
  return `${nameIn(area, lang)}: ${valueText ?? t("legend.no_data")}`;
}

function drawShaded(a, ctx, b) {
  const { spec, theme } = b;
  const series = a.series[0];
  const { colorOf } = areaClasses(a, series);
  const legend = legendFor(a, ctx, b, b.M, b.headBottom + 16 * b.scale, b.inner);
  const mapTop = b.headBottom + 16 * b.scale + legend.height + 18 * b.scale;
  const fixedHeight = spec.size.height ? spec.size.height - mapTop - footerHeight(b) - b.M * 0.5 : b.inner * 0.82;
  const geo = geometry(a, [
    [b.M, mapTop],
    [b.W - b.M, mapTop + fixedHeight],
  ]);
  const fmt = valueFormatter(spec.language);

  const areaItems = [];
  const table = [];
  const markers = [];
  const labelCandidates = [];
  const wantsLabels = spec.labels.show !== "none";
  const forced = new Set((spec.labels.ids ?? []).map(String));
  const stats = { shown: geo.shapes.length, markers: 0, labelsPlaced: 0, labelsHidden: 0, outside: [] };
  const visible = new Set(geo.shapes.map((s) => s.area.id));
  for (const [id] of series.byArea) if (!visible.has(id)) stats.outside.push(id);

  for (const { area, feature, d, path } of geo.shapes) {
    const value = series.byArea.get(area.id);
    const fill = colorOf(area.id) ?? theme.noData;
    const text = value === null || value === undefined ? null : typeof value === "number" ? fmt(value) : value;
    const name = nameIn(area, spec.language);
    if (d)
      areaItems.push({
        type: "path",
        d,
        fill,
        stroke: theme.stroke,
        sw: Math.max(0.35, 0.6 * b.scale),
        title: tooltipOf(area, spec.language, text, ctx.t),
        attrs: {
          "data-id": area.id,
          "data-name": name,
          "data-class": String(series.assign.get(area.id) ?? -1),
          ...(text !== null ? { "data-value": text } : {}),
        },
      });
    table.push({ id: area.id, name, value: text, fill });
    const needRings = wantsLabels || (a.region.markers && text !== null);
    if (!needRings) continue;
    const rings = ringsOf(path, feature);
    const anchor = labelAnchor(rings);
    if (!anchor) continue;
    if (a.region.markers && text !== null && anchor.area < 14 * b.scale ** 2) {
      markers.push({
        type: "circle",
        cx: anchor.x,
        cy: anchor.y,
        r: 3.4 * b.scale,
        fill,
        stroke: theme.ink,
        sw: 0.6 * b.scale,
        opacity: 0.95,
        title: tooltipOf(area, spec.language, text, ctx.t),
        attrs: {
          "data-id": area.id,
          "data-name": name,
          "data-class": String(series.assign.get(area.id) ?? -1),
          "data-value": text,
        },
      });
      continue;
    }
    if (wantsLabels && (spec.labels.show === "all" || !spec.labels.ids || forced.has(area.id) || forced.size === 0)) {
      labelCandidates.push({ id: area.id, anchor, names: labelNames(area, spec.language), fill });
    }
  }
  stats.markers = markers.length;

  const frame = [b.M, mapTop, b.W - b.M, mapTop + geo.height];
  const sizes = [14, 13, 12, 11, 10, 9].map((s) => Math.max(8.5, s * b.scale));
  const placed = wantsLabels
    ? placeLabels(labelCandidates, {
        width: (text, size) => b.m.width(text, size),
        frame,
        sizes,
        loose: spec.labels.show === "all",
      })
    : { placed: [], hidden: 0 };
  stats.labelsPlaced = placed.placed.length;
  stats.labelsHidden = placed.hidden;
  stats.labelBoxes = placed.placed.map((p) => p.box);
  const fillById = new Map(labelCandidates.map((c) => [c.id, c.fill]));
  const labelItems = placed.placed.map((p) => ({
    type: "text",
    x: p.x,
    y: p.box.y + p.size * 0.93,
    text: p.text,
    size: p.size,
    anchor: "middle",
    fill: readableOn(fillById.get(p.id) ?? theme.noData, theme.ink, "#ffffff"),
    attrs: { "pointer-events": "none" },
  }));

  const items = [...legend.items];
  items.push({ type: "g", id: "areas", children: areaItems });
  if (a.borders) {
    const borderPath = geo.path(a.borders);
    if (borderPath)
      items.push({
        type: "path",
        d: borderPath,
        fill: "none",
        stroke: theme.border,
        sw: Math.max(0.5, 0.8 * b.scale),
        opacity: 0.8,
      });
  }
  items.push(...insetFrames(geo, theme, b.scale));
  items.push({ type: "g", id: "markers", children: markers });
  items.push({ type: "g", id: "labels", children: labelItems });
  const height = mapTop + geo.height + 14 * b.scale + footerHeight(b) + b.M * 0.5;
  const classes = legendClasses(a, ctx, areaClasses(a, series).colors);
  return { items, height: spec.size.height ?? height, table, stats, classes };
}

function legendClasses(a, ctx, colors) {
  const { classing, spec } = a;
  if (classing.method === "categorical") return classing.categories.map((label, i) => ({ label, fill: colors[i] }));
  const format = numberFormatter(spec.language, classing.edges);
  return colors.map((fill, i) => ({ label: `${format(classing.edges[i])} – ${format(classing.edges[i + 1])}`, fill }));
}

const insetFrames = (geo, theme, scale) =>
  geo.frames.map(([[x0, y0], [x1, y1]]) => ({
    type: "rect",
    x: x0,
    y: y0,
    w: x1 - x0,
    h: y1 - y0,
    fill: "none",
    stroke: theme.border,
    sw: Math.max(0.6, 0.8 * scale),
    opacity: 0.6,
  }));

function labelNames(area, lang) {
  const main = nameIn(area, lang);
  const shorter =
    lang === "en"
      ? area.alt.filter((n) => n.length >= 4 && n.length < main.length).sort((p, q) => q.length - p.length)
      : [];
  return [main, ...shorter];
}

function drawMultiples(a, ctx, b) {
  const { spec, theme } = b;
  const legend = legendFor(a, ctx, b, b.M, b.headBottom + 16 * b.scale, b.inner);
  const top = b.headBottom + 16 * b.scale + legend.height + 18 * b.scale;
  const count = a.series.length;
  const cols = spec.columns ?? (count <= 3 ? count : count === 4 ? 2 : 3);
  const gap = 22 * b.scale;
  const panelW = (b.inner - gap * (cols - 1)) / cols;
  const titleSize = Math.round(15 * b.scale);
  const probe = geometry(a, [
    [0, 0],
    [panelW, panelW * 0.9],
  ]);
  const panelH = probe.height + titleSize * 1.9;
  const fmt = valueFormatter(spec.language);
  /** @type {any[]} */
  const items = [...legend.items];
  const table = [];
  // Areas too small to see get a dot in every panel, as on a single map, so a value is never lost.
  const tiny = a.region.markers
    ? probe.shapes
        .map(({ area, feature, path }) => ({ area, anchor: labelAnchor(ringsOf(path, feature)) }))
        .filter(({ anchor }) => anchor && anchor.area < 14 * b.scale ** 2)
    : [];
  const marked = new Set();
  a.series.forEach((series, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const { colorOf } = areaClasses(a, series);
    const ox = b.M + col * (panelW + gap);
    const oy = top + row * (panelH + gap);
    const label = spec.panels[i]?.title ?? series.column;
    /** @type {any[]} */
    const children = [
      { type: "text", x: 0, y: titleSize, text: label, size: titleSize, weight: "bold", fill: theme.ink },
    ];
    const shapes = probe.shapes.map(({ area, d }) => {
      const value = series.byArea.get(area.id);
      const text = value === null || value === undefined ? null : fmt(value);
      return {
        type: "path",
        d,
        fill: colorOf(area.id) ?? theme.noData,
        stroke: theme.stroke,
        sw: Math.max(0.3, 0.5 * b.scale),
        title: tooltipOf(area, spec.language, text, ctx.t),
        attrs: {
          "data-id": area.id,
          "data-name": nameIn(area, spec.language),
          "data-class": String(series.assign.get(area.id) ?? -1),
          ...(text !== null ? { "data-value": text } : {}),
        },
      };
    });
    children.push({ type: "g", transform: [0, titleSize * 1.5], children: shapes });
    const dots = tiny
      .filter(({ area }) => series.byArea.get(area.id) != null)
      .map(({ area, anchor }) => {
        marked.add(area.id);
        const fill = colorOf(area.id) ?? theme.noData;
        return {
          type: "circle",
          cx: anchor.x,
          cy: anchor.y,
          r: 2.6 * b.scale,
          fill,
          stroke: theme.ink,
          sw: 0.5 * b.scale,
          opacity: 0.95,
          title: tooltipOf(area, spec.language, fmt(series.byArea.get(area.id)), ctx.t),
          attrs: {
            "data-id": area.id,
            "data-name": nameIn(area, spec.language),
            "data-class": String(series.assign.get(area.id) ?? -1),
            "data-value": fmt(series.byArea.get(area.id)),
          },
        };
      });
    if (dots.length) children.push({ type: "g", transform: [0, titleSize * 1.5], children: dots });
    items.push({ type: "g", id: `panel-${i + 1}`, transform: [ox, oy], children });
    for (const area of a.areas) {
      const value = series.byArea.get(area.id);
      if (value !== null && value !== undefined)
        table.push({
          id: area.id,
          name: `${nameIn(area, spec.language)} (${label})`,
          value: fmt(value),
          fill: colorOf(area.id) ?? theme.noData,
        });
    }
  });
  const rows = Math.ceil(count / cols);
  const height = top + rows * panelH + (rows - 1) * gap + 14 * b.scale + footerHeight(b) + b.M * 0.5;
  return {
    items,
    height,
    table,
    stats: {
      shown: probe.shapes.length,
      panels: count,
      markers: marked.size,
      labelsPlaced: 0,
      labelsHidden: 0,
      outside: [],
    },
    classes: legendClasses(a, ctx, areaClasses(a, a.series[0]).colors),
  };
}

function niceSymbolValues(max) {
  const exponent = Math.floor(Math.log10(max));
  const top = [5, 2, 1].map((m) => m * 10 ** exponent).find((v) => v <= max) ?? max;
  const next = (v) => [5, 2, 1].map((m) => m * 10 ** Math.floor(Math.log10(v / 4))).find((c) => c <= v / 4) ?? v / 4;
  const mid = next(top);
  return [top, mid, next(mid)];
}

function drawSymbols(a, ctx, b) {
  const { spec, theme } = b;
  const series = a.series[0];
  const color = spec.symbols.color ?? theme.accent;
  const vmax = Math.max(...series.numbers.filter((v) => v > 0));
  const mapProbeTop = b.headBottom + 16 * b.scale;
  const rMax = (spec.symbols.maxRadius ?? 38) * b.scale;
  const minRadius = 1.4 * b.scale;
  const radiusOf = (v) => rMax * Math.sqrt(v / vmax);
  const fmt = valueFormatter(spec.language);
  const legendValues = niceSymbolValues(vmax);
  const legend = symbolLegend({
    x: b.M,
    y: mapProbeTop,
    scale: b.scale,
    values: legendValues,
    radiusOf,
    title: legendTitle(a, ctx.t),
    theme,
    measurer: b.m,
    format: numberFormatter(spec.language, legendValues),
    fill: color,
    stroke: color,
  });
  const mapTop = mapProbeTop + legend.height + 14 * b.scale;
  const fixedHeight = spec.size.height ? spec.size.height - mapTop - footerHeight(b) - b.M * 0.5 : b.inner * 0.8;
  const geo = geometry(a, [
    [b.M, mapTop],
    [b.W - b.M, mapTop + fixedHeight],
  ]);
  const base = geo.shapes.map(({ area, d }) => ({
    type: "path",
    d,
    fill: theme.base,
    stroke: theme.stroke,
    sw: Math.max(0.35, 0.6 * b.scale),
    attrs: { "data-id": area.id },
  }));
  const dots = [];
  const table = [];
  const placed = [];
  for (const { area, feature, path } of geo.shapes) {
    const value = series.byArea.get(area.id);
    if (value === null || value === undefined || value <= 0) continue;
    const anchor = labelAnchor(ringsOf(path, feature));
    if (!anchor) continue;
    const name = nameIn(area, spec.language);
    placed.push({ area, name, value, x: anchor.x, y: anchor.y, r: radiusOf(value) });
  }
  placed.sort((p, q) => q.r - p.r);
  for (const p of placed) {
    dots.push({
      type: "circle",
      cx: p.x,
      cy: p.y,
      r: Math.max(minRadius, p.r),
      fill: color,
      stroke: color,
      sw: Math.max(0.6, 0.9 * b.scale),
      opacity: 0.5,
      title: `${p.name}: ${fmt(p.value)}`,
      attrs: { "data-id": p.area.id, "data-name": p.name, "data-value": fmt(p.value) },
    });
    table.push({ id: p.area.id, name: p.name, value: fmt(p.value), fill: color });
  }
  const items = [
    ...legend.items,
    { type: "g", id: "areas", children: base },
    { type: "g", id: "symbols", children: dots },
  ];
  const height = mapTop + geo.height + 14 * b.scale + footerHeight(b) + b.M * 0.5;
  const stats = {
    shown: geo.shapes.length,
    markers: 0,
    symbols: dots.length,
    symbolsMinSize: placed.filter((p) => p.r < minRadius).length,
    labelsPlaced: 0,
    labelsHidden: 0,
    outside: [],
    labelBoxes: [],
  };
  return { items, height: spec.size.height ?? height, table, stats, classes: [] };
}

function drawLocator(a, ctx, b) {
  const { spec, theme } = b;
  const ids = new Set(a.highlightIds ?? []);
  const mapTop = b.headBottom + 18 * b.scale;
  const fixedHeight = spec.size.height ? spec.size.height - mapTop - footerHeight(b) - b.M * 0.5 : b.inner * 0.78;
  const geo = geometry(a, [
    [b.M, mapTop],
    [b.W - b.M, mapTop + fixedHeight],
  ]);
  const children = [];
  const lit = [];
  const candidates = [];
  const bounds = new Map();
  for (const { area, feature, d, path } of geo.shapes) {
    const on = ids.has(area.id);
    if (d)
      children.push({
        type: "path",
        d,
        fill: on ? theme.accent : theme.base,
        stroke: theme.stroke,
        sw: Math.max(0.4, 0.7 * b.scale),
        title: nameIn(area, spec.language),
        attrs: { "data-id": area.id, "data-name": nameIn(area, spec.language) },
      });
    if (!on) continue;
    lit.push(area);
    bounds.set(area.id, path.bounds(feature));
    const anchor = labelAnchor(ringsOf(path, feature));
    if (anchor) candidates.push({ id: area.id, anchor, names: labelNames(area, spec.language) });
  }
  const frame = [b.M, mapTop, b.W - b.M, mapTop + geo.height];
  const sizes = [15, 14, 13, 12, 11, 10].map((s) => s * b.scale);
  const placed = placeLabels(candidates, {
    width: (text, size) => b.m.width(text, size, "bold"),
    frame,
    sizes,
  });
  // A highlighted area whose name does not fit inside it is marked with a ring and named beside it.
  const callouts = lit
    .filter((area) => !placed.placed.some((p) => p.id === area.id))
    .map((area) => {
      const [[bx0, by0], [bx1, by1]] = bounds.get(area.id);
      return { area, x: (bx0 + bx1) / 2, y: (by0 + by1) / 2, r: Math.max(bx1 - bx0, by1 - by0) / 2 + 7 * b.scale };
    });
  /** @type {any[]} */
  const labelItems = placed.placed.map((p) => ({
    type: "text",
    x: p.x,
    y: p.box.y + p.size * 0.93,
    text: p.text,
    size: p.size,
    weight: "bold",
    anchor: "middle",
    fill: readableOn(theme.accent, theme.ink, "#ffffff"),
    attrs: { "pointer-events": "none" },
  }));
  const size = 14 * b.scale;
  const boxes = placed.placed.map((p) => p.box);
  for (const c of callouts) {
    const name = nameIn(c.area, spec.language);
    const w = b.m.width(name, size, "bold");
    const right = c.x + c.r + 6 * b.scale + w < frame[2];
    const x = right ? c.x + c.r + 6 * b.scale : c.x - c.r - 6 * b.scale;
    labelItems.push({
      type: "circle",
      cx: c.x,
      cy: c.y,
      r: c.r,
      fill: "none",
      stroke: theme.accent,
      sw: 1.6 * b.scale,
    });
    labelItems.push({
      type: "text",
      x,
      y: c.y + size * 0.35,
      text: name,
      size,
      weight: "bold",
      anchor: right ? "start" : "end",
      fill: theme.ink,
      attrs: { "pointer-events": "none" },
    });
    boxes.push({ x: right ? x : x - w, y: c.y - size * 0.6, w, h: size * 1.2 });
  }
  const items = [
    { type: "g", id: "areas", children },
    ...insetFrames(geo, theme, b.scale),
    { type: "g", id: "labels", children: labelItems },
  ];
  if (ctx.world110 && lit.length) items.push(globeInset(a, ctx, b, lit, frame));
  const height = mapTop + geo.height + 14 * b.scale + footerHeight(b) + b.M * 0.5;
  const table = lit.map((area) => ({
    id: area.id,
    name: nameIn(area, spec.language),
    value: null,
    fill: theme.accent,
  }));
  return {
    items,
    height: spec.size.height ?? height,
    table,
    stats: {
      shown: geo.shapes.length,
      markers: 0,
      labelsPlaced: placed.placed.length + callouts.length,
      labelsHidden: placed.hidden,
      outside: [],
      labelBoxes: boxes,
    },
    classes: [],
  };
}

/** A small globe, centred on the highlighted areas, drawn in the top right of the map frame. */
function globeInset(a, ctx, b, lit, frame) {
  const { theme } = b;
  const radius = Math.min(96 * b.scale, (frame[2] - frame[0]) * 0.14);
  const cx = frame[2] - radius - 4 * b.scale;
  const cy = frame[1] + radius + 4 * b.scale;
  const features = lit.map((area) => ({ type: "Feature", properties: {}, geometry: area.geometry }));
  const center = geoCentroid({ type: "FeatureCollection", features });
  const projection = geoOrthographic().rotate([-center[0], -center[1]]).translate([cx, cy]).scale(radius).clipAngle(90);
  const path = geoPath(projection).digits(1);
  const world = topoFeature(ctx.world110, ctx.world110.objects.countries);
  const litIso = new Set(lit.map((area) => area.keys.iso3?.[0]).filter(Boolean));
  const land = world.features
    .filter((f) => f.properties.id !== "ATA")
    .map((f) => ({
      type: "path",
      d: path(f),
      fill: litIso.has(f.properties.id) ? theme.accent : theme.base,
      stroke: theme.stroke,
      sw: 0.4,
    }))
    .filter((p) => p.d);
  const rings = [
    {
      type: "path",
      d: path(geoGraticule().step([30, 30])()),
      fill: "none",
      stroke: theme.faint,
      sw: 0.4,
      opacity: 0.5,
    },
  ];
  // An area too small to see on the globe gets a ring around it, a region with no country polygon a dot.
  const [[gx0, gy0], [gx1, gy1]] = geoPath(projection).bounds({ type: "FeatureCollection", features });
  const tiny = gx1 - gx0 < 10 * b.scale && gy1 - gy0 < 10 * b.scale;
  const marker = !litIso.size
    ? [{ type: "circle", cx, cy, r: 3.5 * b.scale, fill: theme.accent, stroke: theme.ink, sw: 1 }]
    : tiny
      ? [
          {
            type: "circle",
            cx: (gx0 + gx1) / 2,
            cy: (gy0 + gy1) / 2,
            r: 8 * b.scale,
            fill: "none",
            stroke: theme.accent,
            sw: 1.4,
          },
        ]
      : [];
  return {
    type: "g",
    id: "inset",
    children: [
      { type: "circle", cx, cy, r: radius, fill: theme.ocean, stroke: theme.border, sw: 1 },
      ...land,
      ...rings,
      ...marker,
      { type: "circle", cx, cy, r: radius, fill: "none", stroke: theme.border, sw: 1 },
    ],
  };
}
