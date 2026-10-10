import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { buildMap } from "./build.js";
import { RULES, THRESHOLDS } from "./checks.js";
import { decodeBytes, parseTable } from "./csv.js";
import { BoundaryError, loadCustomAreas } from "./custom.js";
import { exportMap, FORMATS } from "./export.js";
import { createTranslator } from "./i18n.js";
import { loadAreas } from "./geo.js";
import { buildIndex, detectKind, joinKeys, loadAliases, rankKeyColumns } from "./join.js";
import { normalizeLang } from "./lang.js";
import { nodeAssets } from "./node-assets.js";
import { listPalettes, paletteColors, separation } from "./palettes.js";
import { PROJECTIONS } from "./projections.js";
import { REGIONS } from "./regions.js";
import { formatText, summarize } from "./report.js";
import { VERSION } from "./version.js";

const USAGE = `graticule ${VERSION}: maps that pass a checklist, from a small JSON spec.

Usage
  graticule render <spec.json> [-o base] [-f svg,png,pdf,html] [--fix] [--lang xx] [--dpi 300] [--json]
  graticule check  <spec.json> [--fix] [--write] [--lang xx] [--json]
  graticule join   <table.csv> --region <id> | --boundaries <file.geojson> [--key column] [--key-type kind] [--encoding name] [--json]
  graticule init   <table.csv> --region <id> | --boundaries <file.geojson> [--value column] [--encoding name] [-o spec.json]
  graticule regions | projections | palettes | rules [--lang xx]

Options
  -o, --out       output base name, or a folder ending in /
  -f, --format    comma separated: ${FORMATS.join(", ")} (default svg,png)
  --fix           apply the smallest change that satisfies each failed error rule
  --allow a,b     accept the listed rule ids, with a note in the report
  --lang          map label language and message language (en, zh-TW, zh-CN, ja, ko, es, fr, de, pt-BR)
  --dpi           PNG resolution, 96 is screen size, 300 is print (default 96)
  --json          print the report as JSON
  --encoding      how a table that is not UTF-8 is read: big5, shift_jis, euc-kr, gbk, windows-1252 (join, init)
  --data-root     also allow data files from this folder (by default only the spec's own folder)
Exit codes: 0 done, 1 usage or file error, 2 blocked by a rule.`;

const BOOLEAN = new Set(["fix", "json", "write", "help", "version"]);
const SHORT = { o: "out", f: "format", h: "help", v: "version" };

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("-") || arg === "-") {
      positional.push(arg);
      continue;
    }
    const name = arg.startsWith("--") ? arg.slice(2) : (SHORT[arg.slice(1)] ?? arg.slice(1));
    const [key, inline] = name.split(/=(.*)/s);
    if (BOOLEAN.has(key)) flags[key] = true;
    else {
      const value = inline ?? argv[++i];
      if (value === undefined) throw new UsageError(`option --${key} needs a value`);
      flags[key] = value;
    }
  }
  return { positional, flags };
}

class UsageError extends Error {}

async function readSpec(path) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    throw new UsageError(`cannot read ${path}: ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new UsageError(`${path} is not valid JSON: ${error.message}`);
  }
}

async function outputBase(specPath, out) {
  const name = basename(specPath, extname(specPath));
  if (!out) return join(dirname(resolve(specPath)), name);
  const isDir =
    out.endsWith("/") ||
    (await stat(out).then(
      (s) => s.isDirectory(),
      () => false,
    ));
  if (isDir) {
    await mkdir(out, { recursive: true });
    return join(out, name);
  }
  await mkdir(dirname(resolve(out)), { recursive: true });
  return out.replace(/\.(svg|png|pdf|html|json)$/i, "");
}

async function translator(assets, lang) {
  const english = await assets.json("locales/en.json");
  const code = normalizeLang(lang ?? "en") || "en";
  return createTranslator(
    code === "en" ? english : await assets.json(`locales/${code}.json`).catch(() => english),
    english,
    code,
  );
}

/**
 * Reads a data file named by a spec. Specs come from agents and from other
 * people, so a file outside the spec's folder (or --data-root) is refused,
 * symbolic links included.
 */
async function readInsideRoots(full, name, roots, encoding) {
  const real = await realpath(full);
  if (!roots.some((root) => real === root || real.startsWith(root + sep))) {
    throw new Error(
      `${name} is outside the folder of the spec. Move the file next to the spec or pass --data-root <folder>`,
    );
  }
  return decode(await readFile(real), encoding, name);
}

/** Decodes a data file, naming the file in the error when --encoding or data.encoding is not an encoding. */
function decode(bytes, encoding, name) {
  try {
    return decodeBytes(bytes, encoding);
  } catch (error) {
    if (error instanceof RangeError) throw new UsageError(`${name}: "${encoding}" is not an encoding name`);
    throw error;
  }
}

/** Reads the table of the join and init commands. A guessed encoding is said on stderr, once. */
async function readTable(path, encoding) {
  const { text, encoding: used, guessed } = decode(await readFile(path), encoding, path);
  if (guessed)
    console.error(
      `${path} is not valid UTF-8, so it was read as ${used}. If names look wrong, pass --encoding (big5, shift_jis, euc-kr, gbk) or save the file as UTF-8.`,
    );
  return parseTable(text);
}

/** Builds the map for the render and check commands. */
async function build(specPath, flags, assets) {
  const spec = await readSpec(specPath);
  if (flags.lang) spec.language = flags.lang;
  const base = dirname(resolve(specPath));
  const roots = await Promise.all(
    [base, ...(flags["data-root"] ? [resolve(String(flags["data-root"]))] : [])].map((dir) => realpath(dir)),
  );
  const result = await buildMap(spec, {
    assets,
    readText: (path, encoding) => readInsideRoots(resolve(base, path), path, roots, encoding),
    fix: Boolean(flags.fix),
    allow: flags.allow
      ? String(flags.allow)
          .split(",")
          .map((s) => s.trim())
      : [],
    locale: flags.lang,
  });
  return { result, summary: summarize(result) };
}

async function commandRender(args, assets, check) {
  const [specPath] = args.positional;
  if (!specPath) throw new UsageError("give the spec file: graticule render <spec.json>");
  const { result, summary } = await build(specPath, args.flags, assets);
  const files = [];
  if (!result.blocked && !check) {
    const formats = String(args.flags.format ?? "svg,png")
      .split(",")
      .map((f) => f.trim().toLowerCase());
    const bad = formats.find((f) => !FORMATS.includes(f));
    if (bad) throw new UsageError(`unknown format "${bad}". Use: ${FORMATS.join(", ")}`);
    const base = await outputBase(specPath, args.flags.out);
    const outputs = await exportMap(result, formats, { assets, dpi: args.flags.dpi ? Number(args.flags.dpi) : 96 });
    for (const [format, data] of Object.entries(outputs)) {
      await writeFile(`${base}.${format}`, data);
      files.push(`${base}.${format}`);
    }
    if (result.fixes.length) {
      await writeFile(`${base}.spec.json`, JSON.stringify(result.spec, null, 2) + "\n");
      files.push(`${base}.spec.json`);
    }
    await writeFile(`${base}.check.json`, JSON.stringify({ ...summary, files }, null, 2) + "\n");
  }
  if (check && args.flags.write && result.fixes.length && !result.blocked) {
    await writeFile(specPath, JSON.stringify(result.spec, null, 2) + "\n");
    files.push(specPath);
  }
  if (args.flags.json) console.log(JSON.stringify({ ...summary, files }, null, 2));
  else {
    console.log(formatText(summary, { name: basename(specPath) }));
    if (files.length)
      console.log(
        `wrote ${files.map((f) => relative(process.cwd(), resolve(f)) || f).join(" ")}${result.scene ? ` (${result.scene.width} x ${result.scene.height})` : ""}`,
      );
    if (result.blocked)
      console.log(
        "\nNo map was written. Fix the errors above, or rerun with --fix, or accept a rule with --allow <id>.",
      );
  }
  return result.blocked ? 2 : 0;
}

/**
 * The region a join or init command works on: a bundled one by --region, or the
 * boundaries of --boundaries <file.geojson>. Returns the lookup index with it.
 */
async function openRegion(args, assets, tablePath) {
  if (args.flags.boundaries) {
    const file = String(args.flags.boundaries);
    const readText = async (path) => decode(await readFile(path), undefined, path).text;
    let loaded;
    try {
      loaded = await loadCustomAreas({ file }, readText);
    } catch (error) {
      if (error instanceof BoundaryError) throw new UsageError(error.message);
      throw error;
    }
    return { regionId: "custom", region: loaded.region, index: buildIndex(loaded.areas, {}), boundaries: { file } };
  }
  const regionId = args.flags.region ?? "world";
  const region = REGIONS[regionId];
  if (!region) throw new UsageError(`unknown region "${regionId}". Run: graticule regions`);
  const { areas } = await loadAreas(regionId, assets);
  return { regionId, region, index: buildIndex(areas, await loadAliases(regionId, region, assets)) };
}

async function commandJoin(args, assets) {
  const [tablePath] = args.positional;
  if (!tablePath) throw new UsageError("give the table: graticule join <table.csv> --region world");
  const { regionId, region, index } = await openRegion(args, assets);
  const table = await readTable(tablePath, args.flags.encoding && String(args.flags.encoding));
  const ranked = rankKeyColumns(table.columns, table.rows, index, region.keys, {
    kind: args.flags["key-type"] && String(args.flags["key-type"]),
  });
  const column = args.flags.key ? String(args.flags.key) : (ranked[0]?.column ?? table.columns[0]);
  if (column === undefined) throw new UsageError("the table has no columns");
  if (!table.columns.includes(column))
    throw new UsageError(`no column "${column}" in ${tablePath}. Columns: ${table.columns.join(", ")}`);
  const cells = table.rows.map((r) => r[column] ?? "");
  const kind = String(args.flags["key-type"] ?? detectKind(cells, index, region.keys).kind);
  const best = { column, ...joinKeys(cells, index, kind) };
  const out = {
    column: best.column,
    keyType: best.kind,
    rows: table.rows.length,
    matchedAreas: best.rowsByArea.size,
    matchedBy: best.via,
    unmatched: best.unmatched.map((u) => ({ value: u.value, rows: u.rows.length, suggestions: u.suggestions })),
    ambiguous: best.ambiguous.map((u) => ({ value: u.value, candidates: u.candidates })),
  };
  if (args.flags.json) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(
      `column "${out.column}" matches ${out.matchedAreas} areas of ${regionId} as ${out.keyType} (${out.rows} rows)`,
    );
    console.log(
      `matched by: ${
        Object.entries(out.matchedBy)
          .filter(([, n]) => n)
          .map(([k, n]) => `${k} ${n}`)
          .join(", ") || "nothing"
      }`,
    );
    for (const u of out.unmatched)
      console.log(`not matched: ${u.value}${u.suggestions.length ? `  (${u.suggestions.join(" or ")}?)` : ""}`);
    for (const u of out.ambiguous) console.log(`ambiguous: ${u.value}  (${u.candidates.join(" or ")})`);
  }
  return 0;
}

async function commandInit(args, assets) {
  const [tablePath] = args.positional;
  if (!tablePath) throw new UsageError("give the table: graticule init <table.csv> --region world");
  const { regionId, region, index, boundaries } = await openRegion(args, assets);
  const table = await readTable(tablePath, args.flags.encoding && String(args.flags.encoding));
  const ranked = rankKeyColumns(table.columns, table.rows, index, region.keys, {
    exclude: args.flags.value ? [String(args.flags.value)] : [],
  });
  const key = ranked[0]?.rate >= 0.5 ? ranked[0] : null;
  if (!key)
    throw new UsageError(
      `no column of ${tablePath} looks like ${region.keys.join(", ")} of ${regionId}. Columns: ${table.columns.join(", ")}`,
    );
  const numeric = table.columns.filter(
    (c) =>
      c !== key.column &&
      table.rows.some((r) => Number.isFinite(Number(String(r[c]).replace(/,/g, ""))) && String(r[c]).trim() !== ""),
  );
  const value = args.flags.value ?? numeric[0];
  if (!value) throw new UsageError("no numeric column found. Pass --value <column>");
  // File names in a spec are relative to the spec, so the path is taken from where the spec will be saved.
  const specDir = args.flags.out ? dirname(resolve(String(args.flags.out))) : process.cwd();
  const file = relative(specDir, resolve(tablePath)).split(sep).join("/");
  const spec = {
    title: "",
    subtitle: "",
    source: "",
    region: regionId,
    ...(boundaries ? { boundaries: { file: relative(specDir, resolve(boundaries.file)).split(sep).join("/") } } : {}),
    type: "choropleth",
    data: {
      file,
      key: key.column,
      keyType: key.kind,
      ...(args.flags.encoding ? { encoding: String(args.flags.encoding) } : {}),
      value,
      label: value,
    },
    classes: { method: "quantile", count: 5 },
  };
  const text = JSON.stringify(spec, null, 2) + "\n";
  if (args.flags.out) await writeFile(String(args.flags.out), text);
  else process.stdout.write(text);
  console.error("Fill in title, source and data.kind (count, rate, share, index or other) before rendering.");
  return 0;
}

async function commandCatalog(name, args, assets) {
  const t = await translator(assets, args.flags.lang);
  if (name === "regions") {
    for (const [id, r] of Object.entries(REGIONS)) {
      const proj = typeof r.projection === "string" ? r.projection : r.projection.name;
      console.log(
        `${id.padEnd(16)} ${r.level.padEnd(10)} ${proj.padEnd(22)} keys: ${r.keys.join(", ")}${r.population ? "  (population bundled)" : ""}`,
      );
    }
  } else if (name === "projections") {
    for (const [id, p] of Object.entries(PROJECTIONS))
      console.log(`${id.padEnd(22)} ${p.equalArea ? "equal-area" : "not equal-area"}  ${p.note}`);
  } else if (name === "palettes") {
    for (const p of listPalettes()) {
      const colors = paletteColors(p.name, 5);
      const worst = Math.min(...Object.values(separation(colors, p.type === "categorical")));
      console.log(
        `${p.name.padEnd(13)} ${p.type.padEnd(12)} ${colors.join(" ")}  min CIEDE2000 at 5 classes: ${worst.toFixed(1)}`,
      );
    }
  } else {
    console.log(
      `Neighbouring-class CIEDE2000 limits: error below ${THRESHOLDS.sequentialError}, warning below ${THRESHOLDS.sequentialWarn}\n`,
    );
    for (const [id, rule] of Object.entries(RULES)) {
      console.log(
        `${id.padEnd(26)} ${rule.level.padEnd(6)} ${rule.fires}\n${" ".repeat(33)}why: ${t(`rules.${id}.reason`)}`,
      );
    }
  }
  return 0;
}

/**
 * @param {string[]} argv arguments after the program name
 * @returns {Promise<number>} exit code
 */
export async function main(argv) {
  try {
    const args = parseArgs(argv);
    const [command, ...rest] = args.positional;
    args.positional = rest;
    if (args.flags.version) {
      console.log(VERSION);
      return 0;
    }
    if (!command || args.flags.help || command === "help") {
      console.log(USAGE);
      return command || args.flags.help ? 0 : 1;
    }
    const assets = nodeAssets();
    switch (command) {
      case "render":
        return await commandRender(args, assets, false);
      case "check":
        return await commandRender(args, assets, true);
      case "join":
        return await commandJoin(args, assets);
      case "init":
        return await commandInit(args, assets);
      case "regions":
      case "projections":
      case "palettes":
      case "rules":
        return await commandCatalog(command, args, assets);
      default:
        throw new UsageError(`unknown command "${command}". Run: graticule --help`);
    }
  } catch (error) {
    console.error(`graticule: ${error.message}`);
    if (!(error instanceof UsageError) && process.env.GRATICULE_DEBUG) console.error(error.stack);
    return 1;
  }
}
