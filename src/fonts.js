import { initSubsetter, subsetFont } from "./subset.js";
import { isCjk } from "./text.js";
import { FONT } from "./scene.js";

const FILES = {
  regular: "fonts/NotoSans-Regular.ttf.gz",
  bold: "fonts/NotoSans-Bold.ttf.gz",
  tc: "fonts/NotoSansCJK-TC.otf.gz",
  sc: "fonts/NotoSansCJK-SC.otf.gz",
  jp: "fonts/NotoSansCJK-JP.otf.gz",
  kr: "fonts/NotoSansCJK-KR.otf.gz",
};

async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Loads the bundled fonts on demand and cuts per-map subsets.
 * @param {{ bytes: (name: string) => Promise<Uint8Array> }} assets
 */
export function createFontStore(assets) {
  const cache = new Map();
  let ready;
  const load = async (key) => {
    ready ??= assets.bytes("vendor/harfbuzz-subset.wasm").then(initSubsetter);
    await ready;
    if (!cache.has(key)) cache.set(key, assets.bytes(FILES[key]).then(gunzip));
    return cache.get(key);
  };
  return { load };
}

/**
 * Subsets of every font a scene uses, with the family name written in the SVG.
 * @param {{ items: any[], cjk: string, coverage: ReturnType<typeof import("./faces.js").createCoverage> }} scene
 * @param {ReturnType<typeof createFontStore>} store
 * @returns {Promise<{ key: string, family: string, weight: number, format: string, bytes: Uint8Array }[]>}
 */
export async function fontsForScene(scene, store) {
  const latin = { regular: new Set(), bold: new Set() };
  /** @type {Record<string, Set<number>>} */
  const cjk = {};
  const walk = (item) => {
    if (item.type === "g") item.children.forEach(walk);
    if (item.type !== "text") return;
    for (const char of item.text) {
      const cp = char.codePointAt(0);
      if (isCjk(char)) {
        const face = scene.coverage.pick(cp, scene.cjk);
        if (face) (cjk[face] ??= new Set()).add(cp);
      } else latin[item.weight === "bold" ? "bold" : "regular"].add(cp);
    }
  };
  scene.items.forEach(walk);
  const out = [];
  for (const [key, weight] of [
    ["regular", 400],
    ["bold", 700],
  ]) {
    if (latin[key].size)
      out.push({
        key,
        family: FONT.latin,
        weight,
        format: "truetype",
        bytes: subsetFont(await store.load(key), latin[key]),
      });
  }
  for (const [face, set] of Object.entries(cjk)) {
    out.push({
      key: face,
      family: FONT.cjk[face],
      weight: 400,
      format: "opentype",
      bytes: subsetFont(await store.load(face), set),
    });
  }
  return out;
}

/** CSS @font-face rules embedding the subsets as base64. */
export function fontCss(fonts) {
  return fonts
    .map(
      (f) =>
        `@font-face{font-family:'${f.family}';font-weight:${f.weight};src:url(data:font/${f.format === "opentype" ? "otf" : "ttf"};base64,${toBase64(f.bytes)}) format('${f.format}')}`,
    )
    .join("");
}

function toBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
