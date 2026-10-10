/**
 * Shrinks the path data d3 writes: drops points closer than `tolerance`
 * pixels to their neighbours, removes collinear runs (Douglas-Peucker) and
 * uses implicit line-to commands. Only handles the M, L and Z commands that
 * d3-geo emits for polygons and lines.
 * @param {string | null} d
 * @param {number} tolerance
 */
export function minifyPath(d, tolerance = 0.25) {
  if (!d) return "";
  const out = [];
  for (const part of d.match(/M[^M]*/g) ?? []) {
    const closed = part.endsWith("Z");
    const points = part
      .slice(1)
      .replace(/Z$/, "")
      .split("L")
      .map((pair) => pair.split(",").map(Number));
    const kept = simplify(radial(points, tolerance), tolerance, closed);
    if (kept.length < (closed ? 3 : 2)) continue;
    out.push(`M${kept.map(([x, y]) => `${x},${y}`).join(" ")}${closed ? "Z" : ""}`);
  }
  return out.join("");
}

function radial(points, tolerance) {
  const kept = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const [px, py] = kept[kept.length - 1];
    if (Math.hypot(points[i][0] - px, points[i][1] - py) >= tolerance) kept.push(points[i]);
  }
  return kept;
}

function simplify(points, tolerance, closed) {
  if (points.length < 4) return points;
  if (closed) {
    // Split the ring at its two farthest apart points so both halves are open runs.
    let far = 1;
    let best = 0;
    for (let i = 1; i < points.length; i++) {
      const dist = Math.hypot(points[i][0] - points[0][0], points[i][1] - points[0][1]);
      if (dist > best) {
        best = dist;
        far = i;
      }
    }
    const first = douglasPeucker(points.slice(0, far + 1), tolerance);
    const second = douglasPeucker([...points.slice(far), points[0]], tolerance);
    return [...first, ...second.slice(1, -1)];
  }
  return douglasPeucker(points, tolerance);
}

function douglasPeucker(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
    let index = -1;
    let max = tolerance;
    for (let i = lo + 1; i < hi; i++) {
      const dist = distance(points[i], points[lo], points[hi]);
      if (dist > max) {
        max = dist;
        index = i;
      }
    }
    if (index >= 0) {
      keep[index] = 1;
      stack.push([lo, index], [index, hi]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function distance([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  if (!length) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
