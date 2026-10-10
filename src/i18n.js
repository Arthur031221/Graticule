/**
 * Message lookup with {name} placeholders. A locale file holds nested groups
 * ("msg", "rules", "ui"); keys are dotted paths. Missing keys fall back to English.
 */

const PLURAL_TAGS = { "zh-Hant": "zh-TW", "zh-Hans": "zh-CN", pt: "pt-BR" };

function dig(tree, path) {
  return path.split(".").reduce((node, part) => (node && typeof node === "object" ? node[part] : undefined), tree);
}

/**
 * A message with a numeric `count` parameter may carry a plural form under the
 * same key plus a category suffix ("checks.blocked_one"). The plain key is the
 * "other" form, so a language that needs no extra form needs no extra keys.
 * @param {Record<string, any>} messages locale messages
 * @param {Record<string, any>} [fallback] English messages
 * @param {string} [lang] language of `messages`, for the plural rule
 */
export function createTranslator(messages, fallback = messages, lang = "en") {
  const own = new Intl.PluralRules(PLURAL_TAGS[lang] ?? lang);
  const english = new Intl.PluralRules("en");
  const pick = (tree, key, category) =>
    (category === "other" ? undefined : dig(tree, `${key}_${category}`)) ?? dig(tree, key);
  return (key, params = {}) => {
    const count = typeof params.count === "number" ? params.count : null;
    const template =
      pick(messages, key, count === null ? "other" : own.select(count)) ??
      pick(fallback, key, count === null ? "other" : english.select(count)) ??
      key;
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
