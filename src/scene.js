/**
 * The scene is a plain list of drawing items. Every output format (SVG, PNG,
 * PDF, HTML) is produced from the same scene, so they cannot disagree.
 *
 * @typedef {{ type: "rect", x: number, y: number, w: number, h: number, fill: string, stroke?: string, sw?: number, rx?: number, opacity?: number }} RectItem
 * @typedef {{ type: "path", d: string, fill: string, stroke?: string, sw?: number, opacity?: number, attrs?: Record<string, string>, title?: string, lineJoin?: string }} PathItem
 * @typedef {{ type: "circle", cx: number, cy: number, r: number, fill: string, stroke?: string, sw?: number, opacity?: number, attrs?: Record<string, string>, title?: string }} CircleItem
 * @typedef {{ type: "text", x: number, y: number, text: string, size: number, weight?: "regular" | "bold", anchor?: "start" | "middle" | "end", fill: string, opacity?: number, attrs?: Record<string, string> }} TextItem
 * @typedef {{ type: "g", id?: string, attrs?: Record<string, string>, transform?: [number, number], clip?: [number, number, number, number], children: Item[] }} GroupItem
 * @typedef {RectItem | PathItem | CircleItem | TextItem | GroupItem} Item
 */

import { isCjk } from "./text.js";

const esc = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const num = (value) => String(Math.round(value * 100) / 100);

const attrString = (attrs = {}) =>
  Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${esc(v)}"`)
    .join("");

/** Names of the font families written into SVG text. */
export const FONT = {
  latin: "Noto Sans",
  cjk: { tc: "Noto Sans CJK TC", sc: "Noto Sans CJK SC", jp: "Noto Sans CJK JP", kr: "Noto Sans CJK KR" },
};

/**
 * @param {{ width: number, height: number, background: string, title: string, desc: string, items: Item[], cjk: string, lang: string }} scene
 * @param {{ fontCss?: string }} [options]
 */
export function toSvg(scene, options = {}) {
  const family = [`'${FONT.latin}'`, scene.cjk ? `'${FONT.cjk[scene.cjk]}'` : "", "sans-serif"]
    .filter(Boolean)
    .join(", ");
  let clipId = 0;
  const defs = [];
  const emit = (item) => {
    switch (item.type) {
      case "rect":
        return `<rect x="${num(item.x)}" y="${num(item.y)}" width="${num(item.w)}" height="${num(item.h)}"${item.rx ? ` rx="${num(item.rx)}"` : ""} fill="${esc(item.fill)}"${item.stroke ? ` stroke="${esc(item.stroke)}" stroke-width="${num(item.sw ?? 1)}"` : ""}${item.opacity !== undefined ? ` opacity="${item.opacity}"` : ""}${attrString(item.attrs)}/>`;
      case "path": {
        const body = `<path d="${esc(item.d)}" fill="${esc(item.fill)}"${item.stroke ? ` stroke="${esc(item.stroke)}" stroke-width="${num(item.sw ?? 1)}" stroke-linejoin="${item.lineJoin ?? "round"}"` : ""}${item.opacity !== undefined ? ` opacity="${item.opacity}"` : ""}${attrString(item.attrs)}`;
        return item.title ? `${body}><title>${esc(item.title)}</title></path>` : `${body}/>`;
      }
      case "circle": {
        const body = `<circle cx="${num(item.cx)}" cy="${num(item.cy)}" r="${num(item.r)}" fill="${esc(item.fill)}"${item.stroke ? ` stroke="${esc(item.stroke)}" stroke-width="${num(item.sw ?? 1)}"` : ""}${item.opacity !== undefined ? ` opacity="${item.opacity}"` : ""}${attrString(item.attrs)}`;
        return item.title ? `${body}><title>${esc(item.title)}</title></circle>` : `${body}/>`;
      }
      case "text":
        return `<text x="${num(item.x)}" y="${num(item.y)}" font-size="${num(item.size)}" fill="${esc(item.fill)}"${item.weight === "bold" ? ' font-weight="700"' : ""}${item.anchor && item.anchor !== "start" ? ` text-anchor="${item.anchor}"` : ""}${item.opacity !== undefined ? ` opacity="${item.opacity}"` : ""}${attrString(item.attrs)}>${runs(item.text, scene, item)}</text>`;
      case "g": {
        let clip = "";
        if (item.clip) {
          const id = `clip${++clipId}`;
          const [x, y, w, h] = item.clip;
          defs.push(
            `<clipPath id="${id}"><rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}"/></clipPath>`,
          );
          clip = ` clip-path="url(#${id})"`;
        }
        const transform = item.transform
          ? ` transform="translate(${num(item.transform[0])} ${num(item.transform[1])})"`
          : "";
        return `<g${item.id ? ` id="${item.id}"` : ""}${transform}${clip}${attrString(item.attrs)}>${item.children.map(emit).join("")}</g>`;
      }
      default:
        return "";
    }
  };
  const body = scene.items.map(emit).join("\n");
  const style = options.fontCss ? `<style>${options.fontCss}</style>` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" viewBox="0 0 ${scene.width} ${scene.height}" role="img" aria-labelledby="graticule-title graticule-desc" font-family="${esc(family)}">\n` +
    `<title id="graticule-title">${esc(scene.title)}</title><desc id="graticule-desc">${esc(scene.desc)}</desc>\n` +
    `<defs>${style}${defs.join("")}</defs>\n` +
    `<rect width="${scene.width}" height="${scene.height}" fill="${esc(scene.background)}"/>\n${body}\n</svg>\n`
  );
}

/**
 * CJK characters go into a tspan with the face that can draw them named
 * explicitly, and are thickened with a stroke when the item is bold, because
 * only the regular weight of the CJK fonts is embedded. A character no face
 * can draw is left out and reported by the checker.
 */
function runs(text, scene, item) {
  if (!scene.cjk) return esc(text);
  const groups = [];
  for (const char of text) {
    const cjk = isCjk(char);
    const face = cjk ? scene.coverage.pick(char.codePointAt(0), scene.cjk) : null;
    const last = groups[groups.length - 1];
    if (last && last.cjk === cjk && last.face === face) last.text += char;
    else groups.push({ cjk, face, text: char });
  }
  return groups
    .map(({ cjk, face, text: part }) => {
      if (!cjk) return esc(part);
      if (!face) return "";
      const bold =
        item.weight === "bold"
          ? ` stroke="${esc(item.fill)}" stroke-width="${num(item.size * 0.04)}" stroke-linejoin="round"`
          : "";
      return `<tspan font-family="'${FONT.cjk[face]}'" font-weight="400"${bold}>${esc(part)}</tspan>`;
    })
    .join("");
}

/** Text drawn by the scene, for font subsetting. */
export function sceneText(scene) {
  const out = [];
  const walk = (item) => {
    if (item.type === "text") out.push(item.text);
    if (item.type === "g") item.children.forEach(walk);
  };
  scene.items.forEach(walk);
  return out.join("");
}
