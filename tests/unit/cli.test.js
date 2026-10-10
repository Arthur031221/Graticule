import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";

const run = promisify(execFile);
const bin = fileURLToPath(new URL("../../src/bin.js", import.meta.url));
const gallery = fileURLToPath(new URL("../../gallery/", import.meta.url));

const graticule = (...args) =>
  run(process.execPath, [bin, ...args], { cwd: gallery }).then(
    ({ stdout, stderr }) => ({ code: 0, stdout, stderr }),
    (error) => ({ code: error.code, stdout: error.stdout, stderr: error.stderr }),
  );

test("--version and --help", async () => {
  assert.match((await graticule("--version")).stdout, /^\d+\.\d+\.\d+/);
  const help = await graticule("--help");
  assert.equal(help.code, 0);
  assert.match(help.stdout, /graticule render/);
  assert.equal((await graticule()).code, 1);
});

test("an unknown command and a missing file exit with 1", async () => {
  assert.equal((await graticule("paint")).code, 1);
  const missing = await graticule("render", "nope.json");
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /cannot read nope.json/);
});

test("render writes the files, the check log and exits 0", async () => {
  const out = await mkdtemp(join(tmpdir(), "graticule-"));
  const result = await graticule("render", "life-expectancy/spec.json", "-f", "svg,png,html", "-o", `${out}/`);
  assert.equal(result.code, 0, result.stdout + result.stderr);
  for (const file of ["spec.svg", "spec.png", "spec.html", "spec.check.json"])
    assert.ok((await stat(join(out, file))).size > 1000, file);
  const report = JSON.parse(await readFile(join(out, "spec.check.json"), "utf8"));
  assert.equal(report.ok, true);
  assert.equal(report.join.matchedAreas > 200, true);
});

test("a spec that breaks a rule exits 2, writes nothing and explains itself", async () => {
  const out = await mkdtemp(join(tmpdir(), "graticule-"));
  const spec = JSON.parse(await readFile(join(gallery, "covid-deaths/spec.raw.json"), "utf8"));
  spec.data.file = join(gallery, "covid-deaths/data.csv");
  await writeFile(join(out, "bad.json"), JSON.stringify(spec));
  const result = await graticule("render", join(out, "bad.json"), "--data-root", gallery);
  assert.equal(result.code, 2);
  assert.match(result.stdout, /error  raw-counts/);
  assert.match(result.stdout, /why: A map of counts/);
  assert.match(result.stdout, /fix: --fix will/);
  await assert.rejects(stat(join(out, "bad.svg")));
  const fixed = await graticule("render", join(out, "bad.json"), "--fix", "-f", "svg", "--data-root", gallery);
  assert.equal(fixed.code, 0, fixed.stdout);
  assert.ok((await stat(join(out, "bad.spec.json"))).size > 100);
  assert.equal(JSON.parse(await readFile(join(out, "bad.spec.json"), "utf8")).data.normalize.by, "population");
});

test("--allow accepts a rule and --lang translates the report", async () => {
  const out = await mkdtemp(join(tmpdir(), "graticule-"));
  const spec = JSON.parse(await readFile(join(gallery, "life-expectancy/spec.json"), "utf8"));
  delete spec.source;
  spec.data.file = join(gallery, "life-expectancy/data.csv");
  await writeFile(join(out, "m.json"), JSON.stringify(spec));
  assert.equal((await graticule("check", join(out, "m.json"), "--data-root", gallery)).code, 2);
  const allowed = await graticule(
    "check",
    join(out, "m.json"),
    "--allow",
    "source-required",
    "--lang",
    "ja",
    "--data-root",
    gallery,
  );
  assert.equal(allowed.code, 0);
  assert.match(allowed.stdout, /allowed error/);
  assert.match(allowed.stdout, /出典/);
});

test("join --json reports matches and unmatched rows", async () => {
  const result = await graticule("join", "life-expectancy/data.csv", "--region", "world", "--json");
  const report = JSON.parse(result.stdout);
  assert.equal(report.column === "iso3" || report.column === "country", true);
  assert.ok(report.matchedAreas > 200);
  assert.ok(Array.isArray(report.unmatched));
});

test("init writes a spec that checks cleanly once the text fields are filled", async () => {
  const out = await mkdtemp(join(tmpdir(), "graticule-"));
  const result = await graticule("init", "life-expectancy/data.csv", "--region", "world", "-o", join(out, "init.json"));
  assert.equal(result.code, 0, result.stderr);
  const spec = JSON.parse(await readFile(join(out, "init.json"), "utf8"));
  assert.ok(["iso3", "country"].includes(spec.data.key));
  assert.equal(spec.data.value, "life_expectancy");
});

test("init takes the column of names as the key, not a column of numbers that look like codes", async () => {
  const out = await mkdtemp(join(tmpdir(), "graticule-"));
  const csv = ["state,electoral_votes", "Calif.,54", "N.Y.,28", "Texas,40", "Fla.,30", "Ohio,17", "Maine,4"].join("\n");
  await writeFile(join(out, "votes.csv"), csv);
  for (const extra of [[], ["--value", "electoral_votes"]]) {
    const result = await graticule("init", join(out, "votes.csv"), "--region", "us-states", ...extra);
    assert.equal(result.code, 0, result.stderr);
    const { data } = JSON.parse(result.stdout);
    assert.deepEqual([data.key, data.keyType, data.value], ["state", "name", "electoral_votes"]);
  }
  const join_ = await graticule("join", join(out, "votes.csv"), "--region", "us-states");
  assert.match(join_.stdout, /column "state" matches 6 areas/);
});

test("join and init read a table that is not UTF-8: a note on stderr, or --encoding", async () => {
  const fixtures = fileURLToPath(new URL("../fixtures/", import.meta.url));
  const guessed = await graticule("join", join(fixtures, "countries-latin1.csv"), "--region", "world");
  assert.equal(guessed.code, 0, guessed.stderr);
  assert.match(guessed.stderr, /not valid UTF-8, so it was read as windows-1252/);
  assert.match(guessed.stdout, /matches 5 areas/);

  const big5 = join(fixtures, "tw-counties-big5.csv");
  const wrong = await graticule("join", big5, "--region", "tw-counties");
  assert.match(wrong.stderr, /not valid UTF-8/);
  assert.match(wrong.stdout, /matches 0 areas/);
  const right = await graticule("join", big5, "--region", "tw-counties", "--encoding", "big5");
  assert.equal(right.stderr, "");
  assert.match(right.stdout, /column "county" matches 6 areas of tw-counties as name/);

  const init = await graticule("init", big5, "--region", "tw-counties", "--encoding", "big5");
  assert.equal(JSON.parse(init.stdout).data.encoding, "big5");
  const bad = await graticule("join", big5, "--region", "tw-counties", "--encoding", "klingon");
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /"klingon" is not an encoding name/);
});

test("a spec with data.encoding renders a Big5 file", async () => {
  const fixtures = fileURLToPath(new URL("../fixtures/", import.meta.url));
  const out = await mkdtemp(join(tmpdir(), "graticule-"));
  await writeFile(join(out, "counties.csv"), await readFile(join(fixtures, "tw-counties-big5.csv")));
  const spec = {
    title: "People per county",
    source: "Made up",
    region: "tw-counties",
    data: {
      file: "counties.csv",
      encoding: "big5",
      key: "county",
      value: "population",
      kind: "count",
      label: "People",
    },
    classes: { method: "quantile", count: 3 },
    checks: { allow: ["raw-counts"] },
  };
  await writeFile(join(out, "tw.json"), JSON.stringify(spec));
  const result = await graticule("render", join(out, "tw.json"), "-f", "svg");
  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.doesNotMatch(result.stdout, /table-encoding/);
});

test("join and init take --boundaries, and the spec init writes renders", async () => {
  const fixtures = fileURLToPath(new URL("../fixtures/", import.meta.url));
  const geojson = join(fixtures, "squares.geojson");
  const table = join(fixtures, "squares.csv");
  const joined = await graticule("join", table, "--boundaries", geojson);
  assert.equal(joined.code, 0, joined.stderr);
  assert.match(joined.stdout, /column "region" matches 4 areas of custom as name \(4 rows\)/);

  const out = await mkdtemp(join(tmpdir(), "graticule-"));
  await writeFile(join(out, "squares.geojson"), await readFile(geojson));
  await writeFile(join(out, "squares.csv"), await readFile(table));
  const init = await graticule(
    "init",
    join(out, "squares.csv"),
    "--boundaries",
    join(out, "squares.geojson"),
    "-o",
    join(out, "map.json"),
  );
  assert.equal(init.code, 0, init.stderr);
  const spec = JSON.parse(await readFile(join(out, "map.json"), "utf8"));
  assert.deepEqual(
    [spec.region, spec.boundaries, spec.data.file, spec.data.key],
    ["custom", { file: "squares.geojson" }, "squares.csv", "region"],
  );
  Object.assign(spec, { title: "Squares", source: "Made up" });
  Object.assign(spec.data, { kind: "rate", label: "Score" });
  await writeFile(join(out, "map.json"), JSON.stringify(spec));
  const rendered = await graticule("render", join(out, "map.json"), "-f", "svg");
  assert.equal(rendered.code, 0, rendered.stdout + rendered.stderr);
  assert.match(await readFile(join(out, "map.svg"), "utf8"), /data-name="North West"/);

  const bad = await graticule("join", table, "--boundaries", join(fixtures, "utm.geojson"));
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /not longitude and latitude/);
});

test("a spec may not read boundaries from outside its folder", async () => {
  const fixtures = fileURLToPath(new URL("../fixtures/", import.meta.url));
  const out = await mkdtemp(join(tmpdir(), "graticule-"));
  await writeFile(join(out, "squares.csv"), await readFile(join(fixtures, "squares.csv")));
  const spec = {
    title: "Squares",
    source: "Made up",
    region: "custom",
    boundaries: { file: join(fixtures, "squares.geojson") },
    data: { file: "squares.csv", key: "region", value: "score", kind: "rate", label: "Score" },
  };
  await writeFile(join(out, "map.json"), JSON.stringify(spec));
  const result = await graticule("check", join(out, "map.json"));
  assert.equal(result.code, 2);
  assert.match(result.stdout, /outside the folder of the spec/);
});

test("join and init warn about a table with a quote that never closes, repeated columns or short rows", async () => {
  const out = await mkdtemp(join(tmpdir(), "graticule-"));
  await writeFile(join(out, "quote.csv"), 'country,value\n"France,1\nJapan,3\nBrazil,5\n');
  await writeFile(join(out, "dup.csv"), "country,value,value\nFrance,1,2\nJapan,3,4\nBrazil,5,6\n");
  await writeFile(join(out, "short.csv"), "country,value\nFrance,1\nJapan\nBrazil,5\nKenya,2\n");
  const quote = await graticule("join", join(out, "quote.csv"), "--region", "world");
  assert.match(quote.stderr, /quote\.csv: a quoted field never closes/);
  const dup = await graticule("join", join(out, "dup.csv"), "--region", "world");
  assert.match(dup.stderr, /the column name value appears more than once/);
  const short = await graticule("init", join(out, "short.csv"), "--region", "world");
  assert.match(short.stderr, /1 row has a different number of cells than the header/);
  await writeFile(join(out, "header.csv"), "country,value\n");
  const header = await graticule("join", join(out, "header.csv"), "--region", "world");
  assert.equal(header.code, 1);
  assert.match(header.stderr, /header\.csv has a header but no rows below it/);
  const clean = await graticule("join", "life-expectancy/data.csv", "--region", "world");
  assert.equal(clean.stderr, "");
});

test("an unknown option, a rule id with a typo and a dpi out of range are refused with a message", async () => {
  const bogus = await graticule("render", "life-expectancy/spec.json", "--bogusflag");
  assert.equal(bogus.code, 1);
  assert.match(bogus.stderr, /unknown option --bogusflag/);
  const typo = await graticule("check", "covid-deaths/spec.raw.json", "--allow", "raw-count");
  assert.equal(typo.code, 2);
  assert.match(typo.stdout, /"raw-count" is not a rule\. The rules are: source-required/);
  for (const dpi of ["abc", "0", "-5", "3000", "2.5"]) {
    const result = await graticule("render", "life-expectancy/spec.json", "--dpi", dpi);
    assert.equal(result.code, 1, dpi);
    assert.match(result.stderr, /--dpi must be a whole number from 24 to 600/);
  }
  const encoding = await graticule("check", "life-expectancy/spec.json", "--encoding", "big5");
  assert.match(encoding.stderr, /--encoding applies to join and init/);
});

test("an Excel workbook, an image and a binary file are named instead of being read as a table", async () => {
  const out = await mkdtemp(join(tmpdir(), "graticule-"));
  const files = {
    "book.xlsx": Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(40, 1)]),
    "old.xls": Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0]), Buffer.alloc(40, 1)]),
    "pic.png": Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(40, 1)]),
    "blob.csv": Buffer.from("country,value\nFrance\u0000,1\n"),
  };
  const expected = {
    "book.xlsx": /Excel workbook \(\.xlsx\)/,
    "old.xls": /Excel workbook \(\.xls\)/,
    "pic.png": /PNG image/,
    "blob.csv": /binary file/,
  };
  for (const [name, bytes] of Object.entries(files)) {
    await writeFile(join(out, name), bytes);
    const result = await graticule("join", join(out, name), "--region", "world");
    assert.equal(result.code, 1, name);
    assert.match(result.stderr, expected[name], name);
    assert.match(result.stderr, /not a text table/, name);
  }
});

test("the closing line says only what can help: --fix when a rule has a repair, --allow for a rule", async () => {
  const raw = await graticule("check", "covid-deaths/spec.raw.json");
  assert.match(raw.stdout, /Fix the errors above, rerun with --fix, or accept a rule with --allow <id>\./);
  const fixed = await graticule("check", "covid-deaths/spec.raw.json", "--fix", "--allow", "source-required");
  assert.doesNotMatch(fixed.stdout, /rerun with --fix/);
  const out = await mkdtemp(join(tmpdir(), "graticule-"));
  await writeFile(join(out, "bad.json"), JSON.stringify({ region: "mars", data: { rows: [], value: "v" } }));
  const bad = await graticule("check", join(out, "bad.json"));
  assert.equal(bad.code, 2);
  assert.match(bad.stdout, /No map was written\. Fix the errors above\.$/m);
});

test("init skips a year column when it picks the value, and says how to map one year", async () => {
  const out = await mkdtemp(join(tmpdir(), "graticule-"));
  const rows = ["France", "Japan", "Brazil", "Kenya"].flatMap((name, i) =>
    [2020, 2021, 2022].map((year) => `${name},${year},${i * 10 + year - 2019}`),
  );
  await writeFile(join(out, "long.csv"), ["country,year,value", ...rows].join("\n"));
  const result = await graticule("init", join(out, "long.csv"), "--region", "world");
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).data.value, "value");
  assert.match(result.stderr, /Several rows name the same area\. Add "filter": \{ "year": "2022" \}/);
  const missing = await graticule("init", join(out, "long.csv"), "--region", "world", "--value", "nope");
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /no column "nope" in .*long\.csv\. Columns: country, year, value/);
});

test("join --key takes two columns and init writes them as a list", async () => {
  const out = await mkdtemp(join(tmpdir(), "graticule-"));
  await writeFile(
    join(out, "counties.csv"),
    "county,state,rate\nLos Angeles,CA,4.1\nCook,IL,3.8\nHarris,TX,3.2\nMaricopa,AZ,2.9\n",
  );
  const table = join(out, "counties.csv");
  const auto = await graticule("join", table, "--region", "us-counties");
  assert.match(auto.stdout, /column "county \+ state" matches 4 areas of us-counties as name \(4 rows\)/);
  const named = await graticule("join", table, "--region", "us-counties", "--key", "county,state");
  assert.match(named.stdout, /column "county \+ state" matches 4 areas/);
  const alone = await graticule("join", table, "--region", "us-counties", "--key", "county");
  assert.match(alone.stdout, /matches 0 areas/);
  const init = await graticule("init", table, "--region", "us-counties", "-o", join(out, "map.json"));
  assert.equal(init.code, 0, init.stderr);
  const spec = JSON.parse(await readFile(join(out, "map.json"), "utf8"));
  assert.deepEqual([spec.data.key, spec.data.keyType, spec.data.value], [["county", "state"], "name", "rate"]);
  await writeFile(join(out, "bare.csv"), "county,rate\nLos Angeles,4.1\nCook,3.8\nHarris,3.2\n");
  const none = await graticule("init", join(out, "bare.csv"), "--region", "us-counties");
  assert.equal(none.code, 1);
  assert.match(none.stderr, /If an area is named over two columns/);
});

test("init writes the table's path relative to where the spec will be saved", async () => {
  const out = await mkdtemp(join(tmpdir(), "graticule-"));
  await writeFile(join(out, "data.csv"), await readFile(join(gallery, "life-expectancy/data.csv"), "utf8"));
  const beside = await graticule("init", join(out, "data.csv"), "-o", join(out, "init.json"));
  assert.equal(beside.code, 0, beside.stderr);
  assert.equal(JSON.parse(await readFile(join(out, "init.json"), "utf8")).data.file, "data.csv");
  const printed = await graticule("init", "life-expectancy/data.csv");
  assert.equal(JSON.parse(printed.stdout).data.file, "life-expectancy/data.csv");
});

test("regions, projections, palettes and rules print catalogues", async () => {
  assert.match((await graticule("regions")).stdout, /us-counties\s+county\s+albers-usa/);
  assert.match((await graticule("projections")).stdout, /equal-earth\s+equal-area/);
  assert.match((await graticule("palettes")).stdout, /okabe-ito\s+categorical/);
  const rules = (await graticule("rules")).stdout;
  assert.match(rules, /raw-counts\s+error/);
  assert.match((await graticule("rules", "--lang", "zh-TW")).stdout, /算工|原始計數|計數/);
});

test("a data file outside the spec folder is refused unless the folder is allowed", async () => {
  const out = await mkdtemp(join(tmpdir(), "graticule-"));
  const spec = JSON.parse(await readFile(join(gallery, "life-expectancy/spec.json"), "utf8"));
  spec.data.file = join(gallery, "life-expectancy/data.csv");
  await writeFile(join(out, "m.json"), JSON.stringify(spec));
  const refused = await graticule("check", join(out, "m.json"));
  assert.equal(refused.code, 2);
  assert.match(refused.stdout, /outside the folder of the spec/);
  spec.data.file = "../" + out.split("/").pop() + "/../../../etc/hostname";
  await writeFile(join(out, "n.json"), JSON.stringify(spec));
  assert.match((await graticule("check", join(out, "n.json"))).stdout, /outside the folder|cannot read/);
});
