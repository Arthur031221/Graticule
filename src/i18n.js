/**
 * Message lookup with {name} placeholders. A locale file holds nested groups
 * ("msg", "rules", "ui"); keys are dotted paths. Missing keys fall back to English.
 */

function dig(tree, path) {
  return path.split(".").reduce((node, part) => (node && typeof node === "object" ? node[part] : undefined), tree);
}

/**
 * @param {Record<string, any>} messages locale messages
 * @param {Record<string, any>} [fallback] English messages
 */
export function createTranslator(messages, fallback = messages) {
  return (key, params = {}) => {
    const template = dig(messages, key) ?? dig(fallback, key) ?? key;
    return String(template).replace(/\{(\w+)\}/g, (_, name) => (name in params ? String(params[name]) : `{${name}}`));
  };
}

/** Number formatting that follows the map language, compact for large values. */
export function numberFormatter(lang, edges = []) {
  const tag = { "zh-Hant": "zh-TW", "zh-Hans": "zh-CN", pt: "pt-BR" }[lang] ?? lang;
  const big = Math.max(...edges.map(Math.abs), 0) >= 10000;
  const decimals = Math.min(
    10,
    Math.max(
      0,
      ...edges.map((e) =>
        Number.isInteger(e) ? 0 : (Number(e.toPrecision(10)).toFixed(10).replace(/0+$/, "").split(".")[1] ?? "").length,
      ),
    ),
  );
  if (big) {
    const compact = new Intl.NumberFormat(tag, { notation: "compact", maximumFractionDigits: 2 });
    return (value) => compact.format(value);
  }
  const plain = new Intl.NumberFormat(tag, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (value) => plain.format(value);
}
