/** A small CSV reader for the tables people paste into maps. */

const YEAR_NAME = /^(year|yr|fiscal[_ ]?year|survey[_ ]?year|census[_ ]?year|period)$/i;

/**
 * A column that says when, not how much: named year, or whole years that repeat down the rows (a long
 * table with one row per area and year). It is not the column to map, though its cells are numbers.
 * @param {string} name column name
 * @param {string[]} cells
 */
export function looksLikeYear(name, cells) {
  if (YEAR_NAME.test(name.trim())) return true;
  const filled = cells.filter((c) => c !== "");
  if (filled.length < 4 || !filled.every((c) => /^\d{4}$/.test(c))) return false;
  return filled.every((c) => Number(c) >= 1800 && Number(c) <= 2100) && new Set(filled).size <= filled.length / 2;
}

/** What a file is when it clearly is not a text table, or "" when it may be one. */
export function sniffBinary(bytes, { nul = true } = {}) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const starts = (...head) => head.every((byte, i) => b[i] === byte);
  if (starts(0x50, 0x4b, 0x03, 0x04))
    return "a zip archive or an Excel workbook (.xlsx). In Excel use Save As and choose CSV";
  if (starts(0xd0, 0xcf, 0x11, 0xe0)) return "an Excel workbook (.xls). In Excel use Save As and choose CSV";
  if (starts(0x25, 0x50, 0x44, 0x46)) return "a PDF";
  if (starts(0x89, 0x50, 0x4e, 0x47)) return "a PNG image";
  if (starts(0xff, 0xd8, 0xff)) return "a JPEG image";
  const utf16 = starts(0xff, 0xfe) || starts(0xfe, 0xff);
  if (nul && !utf16 && b.subarray(0, 4096).includes(0)) return "a binary file";
  return "";
}

/** A file that is not a table at all, such as an Excel workbook. */
export class NotATableError extends Error {}

/**
 * Decodes the bytes of a table file. A byte order mark settles UTF-8 or UTF-16.
 * Without one the bytes must be valid UTF-8; if they are not, the file is read
 * as Windows-1252 and `guessed` says so, because a spreadsheet on Windows saves
 * CSV in the system code page and no bytes can prove which one it was.
 * @param {ArrayBuffer | Uint8Array} bytes
 * @param {string} [label] an encoding name such as "big5" or "shift_jis", used as given
 * @returns {{ text: string, encoding: string, guessed: boolean }}
 * @throws {RangeError} when `label` is not an encoding name
 * @throws {NotATableError} when the bytes are an Excel workbook, an image or another binary file
 */
export function decodeBytes(bytes, label) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const binary = sniffBinary(data, { nul: !/^utf-?16/i.test(label ?? "") });
  if (binary) throw new NotATableError(`this is ${binary}, not a text table`);
  if (label) {
    const decoder = new TextDecoder(label);
    return { text: decoder.decode(data), encoding: decoder.encoding, guessed: false };
  }
  const mark = data.length > 1 ? `${data[0]},${data[1]}` : "";
  if (mark === "255,254")
    return { text: new TextDecoder("utf-16le").decode(data), encoding: "utf-16le", guessed: false };
  if (mark === "254,255")
    return { text: new TextDecoder("utf-16be").decode(data), encoding: "utf-16be", guessed: false };
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(data), encoding: "utf-8", guessed: false };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(data), encoding: "windows-1252", guessed: true };
  }
}

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
