/** A small CSV reader for the tables people paste into maps. */

const NULLS = new Set(["", "na", "n/a", "nan", "null", "none", "..", "-", "--", "\u2014", "#n/a"]);

/**
 * Parses CSV or TSV text. Detects the delimiter, strips a byte order mark and
 * honours quoted fields with embedded delimiters, quotes and line breaks.
 * Problems that would silently change the data are reported, not repaired:
 * repeated column names, a quote that never closes, rows with a different
 * number of cells than the header.
 * @param {string} text
 * @returns {{ columns: string[], rows: Record<string, string>[], delimiter: string, problems: { duplicateColumns: string[], unterminatedQuote: boolean, raggedRows: number } }}
 */
export function parseTable(text) {
  const source = text.replace(/^\uFEFF/, "");
  const delimiter = sniffDelimiter(source);
  /** @type {string[][]} */
  const records = [];
  let field = "";
  /** @type {string[]} */
  let record = [];
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      record.push(field);
      field = "";
      if (record.some((cell) => cell !== "")) records.push(record);
      record = [];
    } else field += ch;
  }
  record.push(field);
  if (record.some((cell) => cell !== "")) records.push(record);
  /** @type {{ duplicateColumns: string[], unterminatedQuote: boolean, raggedRows: number }} */
  const problems = { duplicateColumns: [], unterminatedQuote: quoted, raggedRows: 0 };
  if (!records.length) return { columns: [], rows: [], delimiter, problems };
  const columns = records[0].map((c) => c.trim());
  problems.duplicateColumns = [...new Set(columns.filter((c, i) => columns.indexOf(c) !== i))];
  problems.raggedRows = records.slice(1).filter((cells) => cells.length !== columns.length).length;
  const rows = records.slice(1).map((cells) => Object.fromEntries(columns.map((c, i) => [c, (cells[i] ?? "").trim()])));
  return { columns, rows, delimiter, problems };
}

/** The delimiter that splits the header line most often, ignoring delimiters inside quotes. */
function sniffDelimiter(text) {
  const header = text.split(/\r?\n/, 1)[0].replace(/"[^"]*"/g, "");
  /** @type {[string, number][]} */
  const counts = [",", "\t", ";"].map((d) => [d, header.split(d).length - 1]);
  const best = counts.sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ",";
}

/** True for the markers statistical tables use for "no value". */
export function isNull(text) {
  return NULLS.has(
    String(text ?? "")
      .trim()
      .toLowerCase(),
  );
}

/**
 * Parses a number the way spreadsheets print it: thousands separators,
 * percent signs, currency symbols and the Unicode minus. A lone separator
 * followed by exactly three digits is read as a thousands separator, unless
 * `decimal` says otherwise. Use parseColumn for a whole column.
 * @param {unknown} text
 * @param {"." | ","} [decimal] the decimal mark of the file, when known
 * @returns {number | null} null when the text is empty, a null marker or not a number
 */
export function parseNumber(text, decimal) {
  if (typeof text === "number") return Number.isFinite(text) ? text : null;
  let t = String(text ?? "").trim();
  if (isNull(t)) return null;
  t = t
    .replace(/−/g, "-")
    .replace(/^[$€£¥]\s*/, "")
    .replace(/\s*%$/, "");
  if (decimal === ",") {
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
    else if (/^-?\d+,\d+$/.test(t)) t = t.replace(",", ".");
  } else if (decimal === ".") {
    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, "");
  } else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, "");
  else if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d+,\d+$/.test(t)) t = t.replace(",", ".");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null;
  const value = Number(t);
  return Number.isFinite(value) ? value : null;
}

/** Cells that only one decimal convention can produce, such as "12,5" or "1,234.5". */
const POINT_PROOF = /^[-−]?(\d{1,3}(,\d{3})+\.\d+|\d*\.(\d{1,2}|\d{4,})|\d{1,3}(,\d{3}){2,})$/;
const COMMA_PROOF = /^[-−]?(\d{1,3}(\.\d{3})+,\d+|\d*,(\d{1,2}|\d{4,})|\d{1,3}(\.\d{3}){2,})$/;

/**
 * Parses the cells of one column with a single decimal mark. A cell such as
 * "1,234" is either 1234 or 1.234, so the other cells decide: "12,5" or
 * "1.234,5" make the column decimal-comma, "3.5" or "1,234,567" make it
 * decimal-point. With no such cell it is read as 1234.
 * @param {unknown[]} cells
 * @returns {{ values: (number | null)[], decimal: "." | "," | null }}
 */
export function parseColumn(cells) {
  const texts = cells.map((c) =>
    String(c ?? "")
      .trim()
      .replace(/^[$€£¥]\s*/, "")
      .replace(/\s*%$/, ""),
  );
  const point = texts.some((t) => POINT_PROOF.test(t));
  const comma = texts.some((t) => COMMA_PROOF.test(t));
  const decimal = point === comma ? null : point ? "." : ",";
  return { values: cells.map((c) => parseNumber(c, decimal ?? undefined)), decimal };
}
