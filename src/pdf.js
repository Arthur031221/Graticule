import PDFDocument from "pdfkit";
import { fontsForScene } from "./fonts.js";
import { isCjk } from "./text.js";

const PX_TO_PT = 0.75;

/**
 * Vector PDF of a scene, one page sized to the map. Text stays text and
 * every font used is embedded.
 * @param {any} scene
 * @param {ReturnType<typeof import("./fonts.js").createFontStore>} store
 * @param {{ author?: string, subject?: string }} [meta]
 * @returns {Promise<Uint8Array>}
 */
export async function renderPdf(scene, store, meta = {}) {
  const fonts = await fontsForScene(scene, store);
  const doc = new PDFDocument({
    size: [scene.width * PX_TO_PT, scene.height * PX_TO_PT],
    margin: 0,
    compress: true,
    autoFirstPage: true,
    font: null,
    info: {
      Title: scene.title,
      Author: meta.author ?? "Graticule",
      Subject: meta.subject ?? scene.desc,
      Creator: "Graticule",
    },
  });
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const finished = new Promise((resolve) => doc.on("end", resolve));
  const byKey = {};
  for (const font of fonts) {
    doc.registerFont(font.key, font.bytes);
    byKey[font.key] = font;
  }
  doc.scale(PX_TO_PT);
  doc.rect(0, 0, scene.width, scene.height).fill(scene.background);

  const drawText = (item) => {
    const bold = item.weight === "bold";
    const runs = [];
    for (const char of item.text) {
      const cjk = isCjk(char);
      const key = cjk ? scene.coverage.pick(char.codePointAt(0), scene.cjk) : bold ? "bold" : "regular";
      if (!key) continue;
      const last = runs[runs.length - 1];
      if (last && last.key === key) last.text += char;
      else runs.push({ key, text: char, cjk });
    }
    const usable = runs;
    const widths = usable.map((run) => doc.font(run.key).fontSize(item.size).widthOfString(run.text));
    const total = widths.reduce((a, b) => a + b, 0);
    let x = item.x - (item.anchor === "middle" ? total / 2 : item.anchor === "end" ? total : 0);
    doc.save();
    if (item.opacity !== undefined) doc.fillOpacity(item.opacity);
    usable.forEach((run, i) => {
      doc.font(run.key).fontSize(item.size).fillColor(item.fill);
      const thick = bold && run.cjk;
      if (thick)
        doc
          .strokeColor(item.fill)
          .lineWidth(item.size * 0.04)
          .lineJoin("round");
      doc.text(run.text, x, item.y, { lineBreak: false, baseline: "alphabetic", fill: true, stroke: thick });
      x += widths[i];
    });
    doc.restore();
  };

  const paint = (item) => {
    switch (item.type) {
      case "rect": {
        doc.save();
        if (item.opacity !== undefined) doc.opacity(item.opacity);
        if (item.rx) doc.roundedRect(item.x, item.y, item.w, item.h, item.rx);
        else doc.rect(item.x, item.y, item.w, item.h);
        fillStroke(item);
        doc.restore();
        break;
      }
      case "path":
        doc.save();
        if (item.opacity !== undefined) doc.opacity(item.opacity);
        doc.path(item.d);
        fillStroke(item);
        doc.restore();
        break;
      case "circle":
        doc.save();
        if (item.opacity !== undefined) doc.opacity(item.opacity);
        doc.circle(item.cx, item.cy, item.r);
        fillStroke(item);
        doc.restore();
        break;
      case "text":
        drawText(item);
        break;
      case "g":
        doc.save();
        if (item.transform) doc.translate(item.transform[0], item.transform[1]);
        if (item.clip) doc.rect(...item.clip).clip();
        item.children.forEach(paint);
        doc.restore();
        break;
    }
  };

  const fillStroke = (item) => {
    const hasFill = item.fill && item.fill !== "none";
    if (item.stroke) doc.lineWidth(item.sw ?? 1).lineJoin("round");
    if (hasFill && item.stroke) doc.fillAndStroke(item.fill, item.stroke);
    else if (hasFill) doc.fill(item.fill);
    else if (item.stroke) doc.stroke(item.stroke);
    else doc.undash();
  };

  scene.items.forEach(paint);
  doc.end();
  await finished;
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
