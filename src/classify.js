/** Classification methods and the legend-honest rounding of class breaks. */

/** Quantile with linear interpolation (numpy.percentile default, "R-7"). */
export function quantileSorted(sorted, p) {
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (h - lo);
}

/**
 * Class edges, k + 1 numbers from the minimum to the maximum.
 * @param {number[]} values finite numbers
 * @param {"quantile" | "equal" | "jenks"} method
 * @param {number} k
 */
export function breaksFor(values, method, k) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return [];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (min === max) return [min, max];
  if (method === "equal") return Array.from({ length: k + 1 }, (_, i) => (i === k ? max : min + ((max - min) * i) / k));
  if (method === "quantile") {
    const edges = Array.from({ length: k + 1 }, (_, i) => quantileSorted(sorted, i / k));
    return edges.filter((e, i) => i === 0 || e > edges[i - 1]);
  }
  if (method === "jenks") return jenks(sorted, k);
  throw new Error(`unknown classification method "${method}"`);
}

/**
 * Fisher-Jenks optimal breaks: minimises the within-class sum of squared
 * deviations exactly, in O(k n^2). Matches mapclassify.FisherJenks.
 * @param {number[]} sorted ascending
 * @param {number} k
 */
export function jenks(sorted, k) {
  const n = sorted.length;
  k = Math.min(k, new Set(sorted).size);
  if (k < 2) return [sorted[0], sorted[n - 1]];
  // Deviations are shift invariant, and a common origin keeps the squared sums small when values sit far from zero.
  const origin = sorted[0];
  const prefix = new Float64Array(n + 1);
  const prefix2 = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const x = sorted[i] - origin;
    prefix[i + 1] = prefix[i] + x;
    prefix2[i + 1] = prefix2[i] + x * x;
  }
  // Sum of squared deviations of sorted[i..j] inclusive.
  const ssd = (i, j) => {
    const count = j - i + 1;
    const sum = prefix[j + 1] - prefix[i];
    return prefix2[j + 1] - prefix2[i] - (sum * sum) / count;
  };
  let previous = new Float64Array(n);
  for (let j = 0; j < n; j++) previous[j] = ssd(0, j);
  const split = Array.from({ length: k }, () => new Int32Array(n));
  for (let c = 1; c < k; c++) {
    const current = new Float64Array(n).fill(Infinity);
    for (let j = c; j < n; j++) {
      for (let i = c; i <= j; i++) {
        const cost = previous[i - 1] + ssd(i, j);
        if (cost < current[j]) {
          current[j] = cost;
          split[c][j] = i;
        }
      }
    }
    previous = current;
  }
  const edges = [sorted[n - 1]];
  let end = n - 1;
  for (let c = k - 1; c >= 1; c--) {
    const start = split[c][end];
    edges.unshift(sorted[start - 1]);
    end = start - 1;
  }
  edges.unshift(sorted[0]);
  return edges;
}

/**
 * Index of the class holding `value`. Classes are (edge_i, edge_i+1] and the
 * first one is closed on both sides, like the bins of mapclassify: a value
 * equal to an inner edge belongs to the lower class.
 * @param {number} value
 * @param {number[]} edges
 * @returns {number} -1 when the value lies outside the edges
 */
export function classOf(value, edges) {
  const last = edges.length - 2;
  if (!(value >= edges[0]) || value > edges[last + 1]) return -1;
  let lo = 0;
  let hi = last;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (value <= edges[mid + 1]) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** The smallest "round" step (1, 2, 2.5, 5 times a power of ten) that is at least `raw`. */
function niceStep(raw) {
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  return ([1, 2, 2.5, 5, 10].find((m) => m * magnitude >= raw * (1 - 1e-9)) ?? 10) * magnitude;
}

const clean = (value) => Number(value.toPrecision(12));

/**
 * Equal-interval edges on round numbers: classes of one width, a width of
 * 1, 2, 2.5 or 5 times a power of ten, starting at a multiple of that width.
 * There may be fewer than `k` classes. Every class has exactly the width the
 * legend prints.
 * @param {number} min
 * @param {number} max
 * @param {number} k at most this many classes
 */
export function equalEdges(min, max, k) {
  if (min === max) return [min, max];
  let step = niceStep((max - min) / k);
  for (;;) {
    const low = clean(Math.floor(min / step + 1e-9) * step);
    const count = Math.ceil((max - low) / step - 1e-9);
    if (count <= k) return Array.from({ length: count + 1 }, (_, i) => clean(low + i * step));
    step = niceStep(step * 1.01);
  }
}

/**
 * Equal-interval edges that include `center` as an edge: classes of one
 * round width on both sides of it, `side` classes at most on the longer side.
 */
export function equalEdgesAround(min, max, center, side) {
  const reach = Math.max(center - min, max - center);
  const step = niceStep(reach / side);
  const below = Math.max(0, Math.ceil((center - min) / step - 1e-9));
  const above = Math.max(0, Math.ceil((max - center) / step - 1e-9));
  return Array.from({ length: below + above + 1 }, (_, i) => clean(center + (i - below) * step));
}

/**
 * Moves every inner edge to the roundest number that gives each value the
 * same class. Quantile and Jenks edges can sit anywhere between the last
 * value of one class and the first of the next, so "45.96" becomes "46"
 * without changing a single area's colour. Edges in `fixed` stay as they are.
 * @param {number[]} edges
 * @param {number[]} values the numbers that were classified
 * @param {number[]} [fixed]
 */
export function niceEdges(edges, values, fixed = []) {
  if (edges.length < 3) return edges.slice();
  const sorted = [...values].sort((a, b) => a - b);
  const out = edges.slice();
  out[0] = floorTo(sorted[0], 2);
  out[out.length - 1] = ceilTo(sorted[sorted.length - 1], 2);
  for (let i = 1; i < edges.length - 1; i++) {
    if (fixed.includes(edges[i])) continue;
    const below = sorted.filter((v) => v <= edges[i]);
    const above = sorted.filter((v) => v > edges[i]);
    if (!below.length || !above.length) continue;
    const low = below[below.length - 1];
    const high = above[0];
    out[i] = roundestIn(low, high, edges[i]);
  }
  const increasing = out.every((e, i) => i === 0 || e > out[i - 1]);
  return increasing ? out : edges.slice();
}

/** The number with the fewest significant digits in [low, high), nearest to `target`. */
function roundestIn(low, high, target) {
  const scale = Math.floor(Math.log10(Math.max(Math.abs(low), Math.abs(high), Number.MIN_VALUE)));
  for (let digits = 1; digits <= 12; digits++) {
    const step = 10 ** (scale - digits + 1);
    const first = Math.ceil(low / step - 1e-9);
    const last = Math.ceil(high / step - 1e-9) - 1;
    if (first <= last) {
      const pick = Math.min(last, Math.max(first, Math.round(target / step)));
      return Number((pick * step).toPrecision(12));
    }
  }
  return target;
}

function floorTo(value, digits) {
  if (value === 0) return 0;
  const step = 10 ** (Math.floor(Math.log10(Math.abs(value))) - digits + 1);
  return Number((Math.floor(value / step + 1e-9) * step).toPrecision(12));
}

function ceilTo(value, digits) {
  if (value === 0) return 0;
  const step = 10 ** (Math.floor(Math.log10(Math.abs(value))) - digits + 1);
  return Number((Math.ceil(value / step - 1e-9) * step).toPrecision(12));
}

/** Spearman rank correlation with average ranks for ties. */
export function spearman(xs, ys) {
  const rank = (values) => {
    const order = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const ranks = new Array(values.length);
    for (let i = 0; i < order.length;) {
      let j = i;
      while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
      for (let t = i; t <= j; t++) ranks[order[t][1]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return ranks;
  };
  const rx = rank(xs);
  const ry = rank(ys);
  const n = xs.length;
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}
