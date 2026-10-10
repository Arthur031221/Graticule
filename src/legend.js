/** Legends: a segmented bar for classes, swatches for categories, nested circles for symbols. */

/**
 * @param {any} o position (x, y, width), scale (canvas width / 1200), edges, colors, title, theme, measurer, format and the no data label
 */
export function classLegend(o) {
  const { x, y, width, scale, edges, colors, title, theme, measurer, format, noDataLabel, center, showNoData } = o;
  const items = [];
  const titleSize = Math.max(11, 13 * scale);
  const tickSize = Math.max(10.5, 12 * scale);
  const barH = Math.max(10, 13 * scale);
  const k = colors.length;
  const noDataW = showNoData ? 28 * scale + 8 + measurer.width(noDataLabel, tickSize) + 24 * scale : 0;
  const cell = Math.min(88 * scale, Math.max(34 * scale, (width - noDataW) / k));
  const gap = Math.max(1, 1.5 * scale);

  let cursor = y + titleSize;
  if (title) items.push({ type: "text", x, y: cursor, text: title, size: titleSize, weight: "bold", fill: theme.ink });
  cursor += title ? 9 * scale : 0;
  const barTop = cursor;
  colors.forEach((fill, i) =>
    items.push({
      type: "rect",
      x: x + i * cell,
      y: barTop,
      w: cell - gap,
      h: barH,
      fill,
      rx: 1.5 * scale,
      attrs: { "data-class": String(i) },
    }),
  );

  const labels = edges.map((edge) => format(edge));
  const widths = labels.map((l) => measurer.width(l, tickSize));
  // Show every edge when they fit, otherwise every second, third... edge that
  // still includes both ends of the bar.
  const last = labels.length - 1;
  const steps = Array.from({ length: last }, (_, i) => i + 1).filter((n) => last % n === 0);
  // The first label starts at the bar, the last one ends at it, the others are centred on their edge.
  const span = (i) => {
    const at = i * cell - gap / 2;
    if (i === 0) return [0, widths[0]];
    if (i === last) return [at - widths[i], at];
    return [at - widths[i] / 2, at + widths[i] / 2];
  };
  const clear = (step) => {
    for (let i = 0; i + step <= last; i += step) {
      if (span(i + step)[0] - span(i)[1] < Math.max(8, 14 * scale)) return false;
    }
    return true;
  };
  const step = steps.find(clear) ?? last;
  const tickY = barTop + barH + 6 * scale + tickSize * 0.85;
  for (let i = 0; i <= last; i += step) {
    const isCenter = center !== undefined && center !== null && edges[i] === center;
    items.push({
      type: "text",
      x: x + i * cell - gap / 2,
      y: tickY,
      text: labels[i],
      size: tickSize,
      anchor: i === 0 ? "start" : i === last ? "end" : "middle",
      weight: isCenter ? "bold" : "regular",
      fill: theme.muted,
    });
  }
  if (showNoData) {
    const nx = x + k * cell + 24 * scale;
    items.push({ type: "rect", x: nx, y: barTop, w: 28 * scale, h: barH, fill: theme.noData, rx: 1.5 * scale });
    items.push({ type: "text", x: nx, y: tickY, text: noDataLabel, size: tickSize, fill: theme.muted });
  }
  const height = tickY - y + 4 * scale;
  return { items, height, width: k * cell + noDataW };
}

export function categoryLegend(o) {
  const { x, y, width, scale, categories, colors, title, theme, measurer, noDataLabel, showNoData } = o;
  const items = [];
  const titleSize = Math.max(11, 13 * scale);
  const size = Math.max(11, 13 * scale);
  const swatch = size;
  let cursor = y + titleSize;
  if (title) {
    items.push({ type: "text", x, y: cursor, text: title, size: titleSize, weight: "bold", fill: theme.ink });
    cursor += 9 * scale;
  }
  let cx = x;
  let rowTop = cursor;
  const rowH = size * 1.7;
  const entries = categories.map((name, i) => ({ name, fill: colors[i] }));
  if (showNoData) entries.push({ name: noDataLabel, fill: theme.noData });
  for (const entry of entries) {
    const w = swatch + 7 + measurer.width(entry.name, size) + 20 * scale;
    if (cx > x && cx + w > x + width) {
      cx = x;
      rowTop += rowH;
    }
    items.push({
      type: "rect",
      x: cx,
      y: rowTop,
      w: swatch,
      h: swatch,
      fill: entry.fill,
      rx: 2 * scale,
      attrs: { "data-class": String(entries.indexOf(entry) >= categories.length ? -1 : entries.indexOf(entry)) },
    });
    items.push({
      type: "text",
      x: cx + swatch + 7,
      y: rowTop + swatch * 0.88,
      text: entry.name,
      size,
      fill: theme.muted,
    });
    cx += w;
  }
  return { items, height: rowTop + rowH - y, width };
}

/** Nested circles drawn to the same area scale as the symbols on the map. */
export function symbolLegend(o) {
  const { x, y, scale, values, radiusOf, title, theme, measurer, format, fill, stroke } = o;
  const items = [];
  const titleSize = Math.max(11, 13 * scale);
  const tickSize = Math.max(10.5, 12 * scale);
  let cursor = y + titleSize;
  if (title) {
    items.push({ type: "text", x, y: cursor, text: title, size: titleSize, weight: "bold", fill: theme.ink });
    cursor += 8 * scale;
  }
  const radii = values.map(radiusOf);
  const big = Math.max(...radii);
  const baseline = cursor + 2 * big;
  const labelX = x + 2 * big + 10 * scale;
  values.forEach((value, i) => {
    const r = radii[i];
    items.push({ type: "circle", cx: x + big, cy: baseline - r, r, fill, stroke, sw: 1, opacity: 0.55 });
    const ly = baseline - 2 * r;
    items.push({
      type: "text",
      x: labelX,
      y: ly + tickSize * 0.35,
      text: format(value),
      size: tickSize,
      fill: theme.muted,
    });
    items.push({
      type: "path",
      d: `M${x + big},${ly} L${labelX - 4},${ly}`,
      fill: "none",
      stroke: theme.faint,
      sw: 0.7,
    });
  });
  const width = 2 * big + 10 * scale + Math.max(...values.map((v) => measurer.width(format(v), tickSize)));
  return { items, height: baseline - y + 4 * scale, width };
}
