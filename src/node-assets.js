import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Folder holding data/, fonts/ and locales/. The skill folder is the same whether the code runs from src/ or from the bundle. */
export function findAssetRoot() {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [join(here, ".."), join(here, "../skills/graticule"), join(here, "../../skills/graticule")]) {
    if (existsSync(join(candidate, "data/aliases.json"))) return candidate;
  }
  throw new Error("cannot find the Graticule data folder next to the program");
}

/** Reads bundled files from disk. */
export function nodeAssets(root = findAssetRoot()) {
  return {
    json: async (name) => JSON.parse(await readFile(join(root, name), "utf8")),
    bytes: async (name) => new Uint8Array(await readFile(join(root, name))),
  };
}
