/** Name normalisation and fuzzy suggestions for joining tables to areas. */

/**
 * Folds a name to a comparison key: no case, accents, spaces or punctuation,
 * "St." read as "Saint", "&" as "and", and the Taiwanese variant character
 * 臺 read as 台.
 * @param {unknown} value
 */
export function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(the\)/g, "")
    .replace(/臺/g, "台")
    .replace(/&/g, " and ")
    .replace(/\bst\.?(?=\s|$)/g, "saint")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

const ADMIN_SUFFIX = [
  / prefecture$/i,
  / metropolis$/i,
  / metropolitan city$/i,
  / special city$/i,
  / special self-governing (city|province)$/i,
  / province$/i,
  /-(ken|to|fu|do)$/i,
  /(특별자치시|특별자치도|특별시|광역시|도)$/,
  /[都道府県県]$/,
];

/**
 * Extra spellings of one name: without a trailing "(the)" or a parenthetical,
 * without a leading "the", and without an administrative suffix.
 * @param {string} name
 */
export function nameVariants(name) {
  const out = new Set();
  const noParen = name.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  for (const base of new Set([name, noParen])) {
    out.add(base);
    out.add(base.replace(/^the\s+/i, ""));
    for (const suffix of ADMIN_SUFFIX) {
      const stripped = base.replace(suffix, "");
      if (stripped && stripped !== base && [...stripped].length > 1) out.add(stripped);
    }
  }
  return [...out].filter(Boolean);
}

/** Edit distance (insertions, deletions, substitutions, adjacent swaps). */
export function editDistance(a, b) {
  const x = [...a];
  const y = [...b];
  const d = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array(y.length).fill(0)]);
  for (let j = 0; j <= y.length; j++) d[0][j] = j;
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[x.length][y.length];
}

/**
 * Closest known names to a failed lookup. Suggestions are for the person
 * reading the report; they are never applied automatically.
 * @param {string} value
 * @param {Iterable<[string, string]>} candidates [normalised name, label]
 * @param {number} limit
 */
export function suggest(value, candidates, limit = 2) {
  const key = normalizeName(value);
  if (key.length < 3) return [];
  const best = new Map();
  for (const [norm, label] of candidates) {
    // Names are normalised without spaces, so "Chiayi" starts both "chiayicity" and "chiayicounty".
    const prefix =
      key.length >= 4 && norm.length > key.length && norm.startsWith(key) && norm.length - key.length <= 12;
    if (!prefix && Math.abs(norm.length - key.length) > 4) continue;
    const distance = prefix ? 1 : editDistance(key, norm);
    if (distance <= Math.max(2, Math.floor(key.length * 0.25)) && distance < (best.get(label) ?? Infinity))
      best.set(label, distance);
  }
  return [...best]
    .sort((p, q) => p[1] - q[1])
    .slice(0, limit)
    .map(([label]) => label);
}

/**
 * Names damaged by a wrong text encoding carry U+FFFD where an accented
 * letter was. Returns a pattern that matches normalised names with any one
 * or two characters in those places, or null when the name is intact.
 * @param {string} value
 */
export function damagedNamePattern(value) {
  if (!String(value).includes("\uFFFD")) return null;
  const parts = String(value)
    .split("\uFFFD")
    .map((part) => normalizeName(part).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`^${parts.join(".")}$`, "u");
}

const FORMAL_PREFIX =
  /^(?:the\s+)?(?:(?:people's\s+democratic|democratic\s+socialist|co-operative|federal\s+democratic|islamic|federative|federal|plurinational|bolivarian|oriental|arab|united|independent|hashemite|socialist|people's)\s+)*(?:republic|kingdom|state|principality|commonwealth|union|sultanate|emirate|grand\s+duchy|confederation)\s+of\s+(?:the\s+)?/i;

/**
 * Short forms of a formal country name: "the Republic of Albania" gives
 * "Albania". Used only after the full name matched nothing, and the caller
 * accepts a result only when it is one area.
 * @param {string} value
 */
export function formalVariants(value) {
  const stripped = String(value).trim().replace(FORMAL_PREFIX, "");
  return stripped && stripped !== String(value).trim() ? [stripped] : [];
}
