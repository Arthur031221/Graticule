import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildMap } from "../../src/build.js";
import { nodeAssets } from "../../src/node-assets.js";

export const assets = nodeAssets();
export const fixture = (name) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));
export const readFixture = (name) => readFile(fixture(name), "utf8");

/** Builds a map from a spec whose table is inline rows. */
export function build(spec, options = {}) {
  return buildMap(spec, { assets, readText: readFixtureText, ...options });
}

async function readFixtureText(path) {
  return readFile(fixture(path), "utf8");
}

export const ids = (result) => result.findings.map((f) => f.id);
export const errors = (result) => result.findings.filter((f) => f.level === "error" && !f.allowed).map((f) => f.id);

export const base = (extra = {}) => ({
  title: "Test map",
  source: "Test data",
  region: "world",
  data: { rows: [], key: "iso3", value: "v", kind: "rate", label: "Units" },
  ...extra,
});
