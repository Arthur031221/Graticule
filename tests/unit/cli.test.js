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
  assert.match(join_.stdout, /column "state" matches 3 areas/);
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
