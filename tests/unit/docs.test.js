import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { RULES } from "../../src/checks.js";
import { LANGS } from "../../src/lang.js";
import { REGIONS } from "../../src/regions.js";
import { TYPES } from "../../src/spec.js";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (path) => readFile(join(root, path), "utf8");
const readmes = [
  "README.md",
  ...(await readdir(root)).filter((f) => /^README\.[a-z]{2}(-[A-Z]{2})?\.md$/.test(f)),
].sort();

test("there is a README in English and in each of the eight other languages", () => {
  assert.equal(readmes.length, LANGS.length);
});

for (const file of readmes) {
  test(`${file} states the real counts and lists every rule`, async () => {
    const text = await read(file);
    const numbers = [Object.keys(RULES).length, TYPES.length, Object.keys(REGIONS).length, LANGS.length];
    for (const n of numbers) assert.ok(text.includes(String(n)), `${n} missing in ${file}`);
    assert.match(
      text,
      new RegExp(
        `1[^\\n]*${TYPES.length}[^\\n]*${Object.keys(REGIONS).length}[^\\n]*${Object.keys(RULES).length}[^\\n]*${LANGS.length}`,
      ),
    );
    const listed = [...text.matchAll(/^\| `([a-z-]+)` \|/gm)].map((m) => m[1]);
    assert.deepEqual(listed.sort(), Object.keys(RULES).sort());
  });
}

test("every relative link and image in the READMEs and docs points at a file", async () => {
  const docs = (await readdir(join(root, "docs"))).filter((f) => f.endsWith(".md")).map((f) => `docs/${f}`);
  for (const file of [...readmes, ...docs, "CONTRIBUTING.md", "CHANGELOG.md", "NOTICE.md"]) {
    const text = await read(file);
    const targets = [...text.matchAll(/\]\(([^)\s]+)\)|(?:src|href)="([^"]+)"/g)].map((m) => m[1] ?? m[2]);
    for (const target of targets) {
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const path = resolve(join(root, dirname(file)), target.split("#")[0]);
      assert.ok(existsSync(path), `${file} links to ${target}`);
    }
  }
});

test("the reference pages in the skill are copies of the docs", async () => {
  for (const [doc, ref] of [
    ["config.md", "spec.md"],
    ["rules.md", "rules.md"],
    ["regions.md", "regions.md"],
    ["data.md", "data.md"],
  ]) {
    assert.equal(
      await read(`docs/${doc}`),
      await read(`skills/graticule/references/${ref}`),
      `${ref} differs from docs/${doc}`,
    );
  }
});

test("the version is the same everywhere", async () => {
  const { VERSION } = await import("../../src/version.js");
  assert.equal(JSON.parse(await read("package.json")).version, VERSION);
  assert.ok((await read("CHANGELOG.md")).includes(`## ${VERSION} `));
});
