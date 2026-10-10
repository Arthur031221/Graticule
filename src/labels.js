import polylabel from "polylabel";

/** A path context that records the projected rings instead of drawing them. */
function recorder() {
  const rings = [];
  let current = null;
  return {
    rings,
    beginPath() {},
    moveTo(x, y) {
      current = [[x, y]];
      rings.push(current);
    },
    lineTo(x, y) {
      current.push([x, y]);
    },
    closePath() {},
    arc() {},
  };
}

const ringArea = (ring) => {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    sum += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return sum / 2;
};

/**
 * Projected rings of a feature, as the path generator clips them.
 * @param {import("d3-geo").GeoPath} path a path generator bound to a projection
 */
export function ringsOf(path, feature) {
  const context = recorder();
  const saved = path.context();
  path.context(context);
  path(feature);
  path.context(saved);
  return context.rings.filter((ring) => ring.length > 2);
}

/**
 * The visual centre of a feature: the point farthest from its borders in
 * the largest piece that is on the map.
 * @returns {{ x: number, y: number, radius: number, area: number, ring: number[][], holes: number[][][] } | null}
 */
export function labelAnchor(rings) {
  if (!rings.length) return null;
  const sorted = rings
    .map((ring) => ({ ring, area: ringArea(ring) }))
    .sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
  const outer = sorted[0];
  const holes = sorted
    .slice(1)
    .filter((r) => Math.sign(r.area) !== Math.sign(outer.area) && inside(r.ring[0], outer.ring))
    .map((r) => r.ring);
  const found = polylabel([outer.ring, ...holes], 1);
  return { x: found[0], y: found[1], radius: found.distance, area: Math.abs(outer.area), ring: outer.ring, holes };
}

/** Ray casting point in ring test. */
export function inside(point, ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

const overlaps = (a, b, pad) =>
  a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;

/**
 * Greedy label placement, largest areas first. A label is kept when its box
 * lies inside its own area (unless `loose`) and clear of every label placed
 * before it.
 * @param {{ id: string, anchor: NonNullable<ReturnType<typeof labelAnchor>>, names: string[] }[]} candidates
 * @param {{ width: (text: string, size: number) => number, frame: number[], sizes: number[], loose?: boolean, blocked?: {x:number,y:number,w:number,h:number}[], pad?: number, lineHeight?: number }} options
 */
export function placeLabels(candidates, options) {
  const { width, frame, sizes, loose = false, blocked = [], pad = 2, lineHeight = 1.15 } = options;
  const [fx0, fy0, fx1, fy1] = frame;
  const boxes = [...blocked];
  const placed = [];
  const order = [...candidates].sort((a, b) => b.anchor.area - a.anchor.area);
  for (const candidate of order) {
    const { x, y, ring, holes } = candidate.anchor;
    let done = false;
    for (const name of candidate.names) {
      for (const size of sizes) {
        const w = width(name, size);
        const h = size * lineHeight;
        const box = { x: x - w / 2, y: y - h / 2, w, h };
        if (box.x < fx0 || box.y < fy0 || box.x + w > fx1 || box.y + h > fy1) continue;
        if (!loose && !fits(box, ring, holes)) continue;
        if (boxes.some((other) => overlaps(box, other, pad))) continue;
        boxes.push(box);
        placed.push({ id: candidate.id, text: name, x, y, size, box });
        done = true;
        break;
      }
      if (done) break;
    }
  }
  return { placed, hidden: candidates.length - placed.length };
}

/** The box lies inside the ring and does not touch any hole. */
function fits({ x, y, w, h }, ring, holes) {
  const points = [
    [x, y],
    [x + w, y],
    [x, y + h],
    [x + w, y + h],
    [x + w / 2, y],
    [x + w / 2, y + h],
    [x, y + h / 2],
    [x + w, y + h / 2],
  ];
  if (!points.every((p) => inside(p, ring))) return false;
  return holes.every(
    (hole) =>
      !points.some((p) => inside(p, hole)) &&
      !hole.some(([hx, hy]) => hx >= x && hx <= x + w && hy >= y && hy <= y + h),
  );
}
