import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { fontCss, fontsForScene } from "./fonts.js";
import { toSvg } from "./scene.js";

let resvgReady = null;

/** SVG text with the used glyphs of every font embedded. */
export async function renderSvg(scene, store) {
  return toSvg(scene, { fontCss: fontCss(await fontsForScene(scene, store)) });
}

/**
 * PNG bytes. `scale` multiplies the pixel size: 1 for screen, 3.125 for
 * 300 dpi print (the scene is laid out at 96 dpi).
 */
export async function renderPng(scene, store, assets, scale = 1) {
  resvgReady ??= assets.bytes("vendor/resvg.wasm").then((bytes) => initWasm(bytes));
  await resvgReady;
  const fonts = await fontsForScene(scene, store);
  const resvg = new Resvg(toSvg(scene), {
    fitTo: { mode: "zoom", value: scale },
    font: { fontBuffers: fonts.map((f) => f.bytes), loadSystemFonts: false, defaultFontFamily: "Noto Sans" },
  });
  return resvg.render().asPng();
}
