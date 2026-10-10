import { projectionNameOf } from "./checks.js";
import { PROJECTIONS } from "./projections.js";
import { VERSION } from "./version.js";

const MAX_LISTED = 12;

/** The machine readable record of a build: what matched, what was classed, what the rules found. */
export function summarize(result) {
  const a = result.analysis;
  const spec = result.spec;
  const join = a.join
    ? {
        column: a.join.column,
        keyType: a.join.kind,
        rows: a.join.rows,
        matchedRows: a.join.rowsMatched,
        matchedAreas: a.join.rowsByArea.size,
        matchedBy: a.join.via,
        unmatched: a.join.unmatched.map((u) => ({ value: u.value, rows: u.rows.length, suggestions: u.suggestions })),
        ambiguous: a.join.ambiguous.map((u) => ({ value: u.value, candidates: u.candidates })),
      }
    : null;
  const classing = a.classing
    ? {
        method: a.classing.method,
        edges: a.classing.edges,
        categories: a.classing.categories,
        counts: a.classing.counts,
        colors: a.classing.colors,
        palette: a.classing.paletteName,
      }
    : null;
  const projection = spec ? projectionNameOf(spec) : null;
  return {
    graticule: VERSION,
    ok: !result.blocked,
    region: spec?.region,
    type: spec?.type,
    projection: projection && { name: projection, equalArea: PROJECTIONS[projection]?.equalArea ?? false },
    join,
    classes: classing,
    labels: result.stats
      ? { placed: result.stats.labelsPlaced, hidden: result.stats.labelsHidden, dots: result.stats.markers }
      : null,
    findings: result.findings,
    fixes: result.fixes,
    spec,
  };
}

const list = (items, render) =>
  items.slice(0, MAX_LISTED).map(render).join("; ") +
  (items.length > MAX_LISTED ? `; and ${items.length - MAX_LISTED} more` : "");

/** Plain text report for people and agents reading a terminal. */
export function formatText(summary, { name = "map" } = {}) {
  const lines = [`Graticule ${summary.graticule}  ${name}`];
  if (summary.region)
    lines.push(
      `region: ${summary.region}, type: ${summary.type}${summary.projection ? `, projection: ${summary.projection.name}${summary.projection.equalArea ? " (equal-area)" : ""}` : ""}`,
    );
  const j = summary.join;
  if (j) {
    lines.push(
      `join: ${j.matchedRows} of ${j.rows} rows matched ${j.matchedAreas} areas (column "${j.column}" as ${j.keyType})`,
    );
    const via = Object.entries(j.matchedBy).filter(([, n]) => n);
    if (via.length) lines.push(`  matched by: ${via.map(([how, n]) => `${how} ${n}`).join(", ")}`);
    if (j.unmatched.length)
      lines.push(
        `  not matched (${j.unmatched.length}): ${list(j.unmatched, (u) => (u.suggestions.length ? `${u.value} (${u.suggestions.join(" or ")}?)` : u.value))}`,
      );
    if (j.ambiguous.length)
      lines.push(
        `  ambiguous (${j.ambiguous.length}): ${list(j.ambiguous, (u) => `${u.value} (${u.candidates.join(" or ")})`)}`,
      );
  }
  const c = summary.classes;
  if (c?.edges?.length)
    lines.push(
      `classes: ${c.method}, ${c.edges.length - 1} classes, edges ${c.edges.join(" | ")}, areas per class ${c.counts.join(" ")}`,
    );
  if (c?.categories) lines.push(`categories: ${c.categories.map((cat, i) => `${cat} (${c.counts[i]})`).join(", ")}`);
  if (summary.labels && (summary.labels.placed || summary.labels.dots))
    lines.push(
      `labels: ${summary.labels.placed} placed, ${summary.labels.hidden} left out, ${summary.labels.dots} small areas as dots`,
    );
  for (const f of summary.findings) {
    const level = f.allowed ? `allowed ${f.was}` : f.level;
    lines.push(`${level.padEnd(5)}  ${f.id}: ${f.message}`);
    if (f.level !== "info" || f.allowed) lines.push(`       why: ${f.reason}`);
    if (f.fixable && !f.allowed && f.level === "error") lines.push(`       fix: --fix will ${f.fixText}`);
  }
  return lines.join("\n");
}
