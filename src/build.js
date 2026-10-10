import { analyze } from "./analyze.js";
import { checkAnalysis, RULES } from "./checks.js";
import { drawMap } from "./draw.js";
import { createTranslator } from "./i18n.js";
import { createMeasurer } from "./text.js";
import { createCoverage } from "./faces.js";
import { normalizeLang } from "./lang.js";
import { lookup } from "./join.js";

const MAX_PASSES = 4;

/**
 * Builds a map: analyses the data, runs the rules, optionally applies fixes,
 * and draws a scene when no blocking finding is left.
 *
 * @param {any} input the spec as parsed JSON
 * @param {{ assets: any, readText?: (path: string) => Promise<string>, fix?: boolean, allow?: string[], locale?: string, force?: boolean }} ctx
 */
export async function buildMap(input, ctx) {
  const readText =
    ctx.readText ??
    (async () => {
      throw new Error("no file reader available");
    });
  const english = await ctx.assets.json("locales/en.json");
  const wanted = normalizeLang(ctx.locale ?? input?.language ?? "en") || "en";
  const t = createTranslator(
    wanted === "en" ? english : await ctx.assets.json(`locales/${wanted}.json`).catch(() => english),
    english,
  );

  let spec = structuredClone(input);
  const fixes = [];
  let analysis;
  let findings;
  for (let pass = 0; pass <= MAX_PASSES; pass++) {
    analysis = await analyze(spec, { assets: ctx.assets, readText });
    resolveHighlight(analysis);
    findings =
      analysis.ok === false && !analysis.index ? analysis.findings : [...analysis.findings, ...checkAnalysis(analysis)];
    markAllowed(findings, [...(analysis.spec?.checks.allow ?? []), ...(ctx.allow ?? [])]);
    const fixable = ctx.fix ? findings.filter((f) => f.level === "error" && !f.allowed && f.fix) : [];
    if (!fixable.length || pass === MAX_PASSES) break;
    for (const finding of fixable) {
      finding.fix(spec, analysis);
      fixes.push({ rule: finding.id, text: finding.fixText ?? "" });
    }
  }
  const blocked = findings.some((f) => f.level === "error" && !f.allowed);
  const result = { spec: analysis.spec, analysis, fixes, blocked, scene: null, stats: null, t };
  if ((!blocked || ctx.force) && analysis.ok !== false) {
    const metrics = await ctx.assets.json("fonts/metrics.json");
    const world110 = analysis.spec.type === "locator" ? await ctx.assets.json("data/world-110m.json") : undefined;
    const coverage = createCoverage(await ctx.assets.json("fonts/coverage.json"));
    const { scene, stats } = drawMap(analysis, { measurer: createMeasurer(metrics), t, world110, coverage });
    result.scene = scene;
    result.stats = stats;
    findings.push(...postDrawFindings(analysis, stats));
  }
  for (const fix of fixes)
    findings.push({ id: "fix-applied", level: "info", params: { rule: fix.rule, text: fix.text } });
  result.findings = findings.map((f) => describe(f, t));
  result.blocked = result.findings.some((f) => f.level === "error" && !f.allowed);
  return result;
}

function markAllowed(findings, allow) {
  for (const finding of findings) {
    if (allow.includes(finding.id) && finding.level !== "info") finding.allowed = true;
  }
}

function resolveHighlight(analysis) {
  if (analysis.spec?.type !== "locator" || !analysis.index) return;
  const ids = [];
  const missing = [];
  for (const token of analysis.spec.highlight) {
    const hit = analysis.region.keys
      .map((kind) => lookup(analysis.index, kind, token).entries)
      .find((e) => e.length === 1);
    if (hit) ids.push(hit[0].area.id);
    else missing.push(token);
  }
  analysis.highlightIds = ids;
  if (missing.length)
    analysis.findings.push({ id: "highlight-unmatched", level: "warn", params: { list: missing.join(", ") } });
  if (!analysis.spec.highlight.length)
    analysis.findings.push({
      id: "spec",
      level: "error",
      params: { path: "highlight", detail: "a locator map needs at least one area in highlight" },
    });
}

function postDrawFindings(analysis, stats) {
  const out = [];
  const boxes = stats.labelBoxes ?? [];
  let overlaps = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const p = boxes[i];
      const q = boxes[j];
      if (p.x < q.x + q.w && p.x + p.w > q.x && p.y < q.y + q.h && p.y + p.h > q.y) overlaps++;
    }
  }
  if (overlaps) out.push({ id: "label-overlap", level: "error", params: { count: overlaps } });
  if (stats.missingGlyphs?.length)
    out.push({ id: "glyphs-missing", level: "warn", params: { list: stats.missingGlyphs.slice(0, 12).join(" ") } });
  if (stats.labelsHidden) out.push({ id: "labels-hidden", level: "info", params: { count: stats.labelsHidden } });
  if (stats.symbolsMinSize)
    out.push({ id: "symbols-min-size", level: "info", params: { count: stats.symbolsMinSize } });
  if (stats.markers) out.push({ id: "small-areas-marked", level: "info", params: { count: stats.markers } });
  if (stats.outside.length) {
    const names = stats.outside.slice(0, 5).map((id) => analysis.index.byId.get(id)?.names[0] ?? id);
    out.push({
      id: "outside-frame",
      level: "info",
      params: { count: stats.outside.length, list: names.join(", ") + (stats.outside.length > 5 ? ", ..." : "") },
    });
  }
  if (analysis.spec.type === "symbols") {
    const bad = [...analysis.series[0].byArea.values()].filter((v) => v !== null && v <= 0).length;
    if (bad) out.push({ id: "symbols-negative", level: "warn", params: { count: bad } });
  }
  return out;
}

function describe(finding, t) {
  const key = finding.variant ? `rules.${finding.id}.message_${finding.variant}` : `rules.${finding.id}.message`;
  if (finding.params?.by) finding = { ...finding, params: { ...finding.params, by: t(`terms.${finding.params.by}`) } };
  return {
    id: finding.id,
    level: finding.allowed ? "info" : finding.level,
    was: finding.allowed ? finding.level : undefined,
    allowed: Boolean(finding.allowed),
    message: t(key, finding.params),
    reason: t(`rules.${finding.id}.reason`, finding.params),
    fixable: Boolean(finding.fix),
    fixText: finding.fixText,
  };
}

export { RULES };
