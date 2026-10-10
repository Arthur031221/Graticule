import { PALETTE_DATA } from "./palette-data.js";
import { CVD_MATRICES, deltaE, hexToLab, simulate } from "./color.js";

export const CVD_KINDS = Object.keys(CVD_MATRICES);

/** @typedef {{ name: string, type: "sequential" | "diverging" | "categorical" }} PaletteInfo */

/** @returns {PaletteInfo[]} */
export function listPalettes() {
  return Object.entries(PALETTE_DATA).map(([name, p]) => ({ name, type: /** @type {any} */ (p.type) }));
}

/**
 * Colours for `k` classes.
 * @param {string} name
 * @param {number} k
 * @returns {string[]}
 */
export function paletteColors(name, k) {
  const palette = PALETTE_DATA[name.toLowerCase()];
  if (!palette) throw new Error(`unknown palette "${name}". Run: graticule palettes`);
  if (palette.type === "categorical") {
    if (k > palette.colors.length)
      throw new Error(`palette "${name}" has ${palette.colors.length} colours, ${k} needed`);
    return palette.colors.slice(0, k);
  }
  const available = Object.keys(palette.classes).map(Number);
  const [lo, hi] = [Math.min(...available), Math.max(...available)];
  if (k < 3) {
    const ends = palette.classes[lo];
    return k < 2 ? [ends[Math.floor(lo / 2)]] : [ends[0], ends[lo - 1]];
  }
  return palette.classes[Math.min(hi, k)];
}

export function paletteType(name) {
  return PALETTE_DATA[name.toLowerCase()]?.type;
}

/**
 * Smallest ΔE2000 between neighbouring colours (or any two, for categorical
 * palettes) over normal vision and the three simulated deficiencies.
 * @param {string[]} colors
 * @param {boolean} allPairs
 */
export function separation(colors, allPairs = false) {
  /** @type {Record<string, number>} */
  const result = {};
  for (const view of ["normal", ...CVD_KINDS]) {
    const seen = view === "normal" ? colors : colors.map((c) => simulate(c, /** @type {any} */ (view)));
    let min = Infinity;
    for (let i = 0; i < seen.length; i++) {
      for (let j = i + 1; j < (allPairs ? seen.length : Math.min(seen.length, i + 2)); j++)
        min = Math.min(min, deltaE(seen[i], seen[j]));
    }
    result[view] = min;
  }
  return result;
}

/**
 * Lightness (CIE L*) change between neighbouring colours. A sequential
 * palette must move one way: rainbow palettes go up and down and read as
 * false boundaries.
 * @param {string[]} colors
 */
export function lightnessSteps(colors) {
  const lightness = colors.map((c) => hexToLab(c)[0]);
  return lightness.slice(1).map((l, i) => l - lightness[i]);
}
