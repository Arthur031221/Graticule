/** Map label languages, in the order used by the name arrays in the data files. */
export const LANGS = ["en", "zh-Hant", "zh-Hans", "ja", "ko", "es", "fr", "de", "pt"];

const ALIASES = {
  "zh-tw": "zh-Hant",
  "zh-hk": "zh-Hant",
  "zh-hant": "zh-Hant",
  "zh-cn": "zh-Hans",
  "zh-sg": "zh-Hans",
  "zh-hans": "zh-Hans",
  zh: "zh-Hans",
  "pt-br": "pt",
  "pt-pt": "pt",
};

/**
 * Maps a BCP 47 style tag such as "zh-TW" or "pt-BR" to one of LANGS.
 * @param {string} tag
 * @returns {string} a member of LANGS, or "" when the language is not supported
 */
export function normalizeLang(tag) {
  const key = String(tag ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (ALIASES[key]) return ALIASES[key];
  const base = key.split("-")[0];
  return LANGS.find((lang) => lang.toLowerCase() === key || lang === base) ?? "";
}

/** Index of a language in the name arrays of the data files. */
export function langIndex(lang) {
  return Math.max(0, LANGS.indexOf(lang));
}

/** The CJK font family a language needs, or "" for Latin script languages. */
export function cjkFamily(lang) {
  return { "zh-Hant": "tc", "zh-Hans": "sc", ja: "jp", ko: "kr" }[lang] ?? "";
}
