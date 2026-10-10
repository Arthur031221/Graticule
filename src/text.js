/** Text measurement without a font file: advance tables for Latin, one em for CJK. */

/** Wide characters take a full em in Noto Sans CJK. */
function isWide(cp) {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

/** Characters that may not start a line in CJK text. */
const NO_LINE_START = new Set("，。、．：；！？）」』】》〉”’%".split(""));

export const isCjk = (char) => isWide(char.codePointAt(0));

/**
 * @param {{ upm: number, regular: Record<string, number>, bold: Record<string, number> }} metrics
 */
export function createMeasurer(metrics) {
  const advance = (cp, bold) =>
    (bold ? metrics.bold : metrics.regular)[cp] ?? (bold ? metrics.bold : metrics.regular)[0x6d] ?? 600;

  /** Width in px of one line. */
  function width(text, size, weight = "regular") {
    let total = 0;
    for (const char of String(text)) {
      const cp = char.codePointAt(0);
      total += isWide(cp) ? 1000 : advance(cp, weight === "bold");
    }
    return (total / metrics.upm) * size;
  }

  /**
   * Greedy line breaking: at spaces for Latin text, between any two
   * characters for CJK, never before closing punctuation.
   * @returns {string[]}
   */
  function wrap(text, maxWidth, size, weight = "regular") {
    const lines = [];
    let line = "";
    const tokens =
      String(text).match(
        /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}]|[^\s\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}]+|\s+/gu,
      ) ?? [];
    for (const token of tokens) {
      const next = line + token;
      if (line && width(next.trimEnd(), size, weight) > maxWidth && !NO_LINE_START.has(token)) {
        lines.push(line.trimEnd());
        line = token.trimStart();
      } else line = next;
    }
    if (line.trim()) lines.push(line.trimEnd());
    return lines;
  }

  /** True when the bundled Latin face has a glyph for the code point (its advance table is its cmap). */
  const has = (cp) => metrics.regular[cp] !== undefined;

  return { width, wrap, has };
}
