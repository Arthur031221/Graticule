import { createFontStore } from "./fonts.js";
import { renderHtml } from "./html.js";
import { renderPng, renderSvg } from "./render.js";

export const FORMATS = ["svg", "png", "pdf", "html"];

/**
 * Renders a built map in the requested formats.
 * @param {{ scene: any, t: (key: string, params?: any) => string, spec: any }} result output of buildMap()
 * @param {string[]} formats members of FORMATS
 * @param {{ assets: any, dpi?: number, store?: ReturnType<typeof createFontStore> }} ctx
 * @returns {Promise<{ svg?: string, png?: Uint8Array, pdf?: Uint8Array, html?: string }>}
 */
export async function exportMap(result, formats, ctx) {
  const store = ctx.store ?? createFontStore(ctx.assets);
  const out = {};
  let svg;
  const embedded = async () => (svg ??= await renderSvg(result.scene, store));
  for (const format of formats) {
    if (format === "svg") out.svg = await embedded();
    else if (format === "png") out.png = await renderPng(result.scene, store, ctx.assets, (ctx.dpi ?? 96) / 96);
    else if (format === "pdf")
      out.pdf = await (await import("./pdf.js")).renderPdf(result.scene, store, { subject: result.spec.source });
    else if (format === "html") out.html = renderHtml(await embedded(), result.scene, result.t);
    else throw new Error(`unknown format "${format}". Use: ${FORMATS.join(", ")}`);
  }
  return out;
}
