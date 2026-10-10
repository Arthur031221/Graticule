const esc = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Pointer and keyboard behaviour of a map: a tooltip that follows the
 * pointer or the focused area, and a legend that dims the other classes.
 * Self-contained on purpose: the exported page embeds this function's source.
 * @param {SVGSVGElement} svg
 * @param {HTMLElement} tip
 */
export function interactions(svg, tip) {
  var areas = svg.querySelectorAll("path[data-id], circle[data-id]");
  var swatches = svg.querySelectorAll("rect[data-class]");
  var keyboard = areas.length <= 400;
  areas.forEach(function (el) {
    var title = el.querySelector("title");
    var text = title ? title.textContent : el.getAttribute("data-name");
    if (title) el.removeChild(title);
    el.setAttribute("data-tip", text);
    el.setAttribute("aria-label", text);
    el.setAttribute("role", "graphics-symbol");
    if (keyboard) el.setAttribute("tabindex", "0");
  });
  function show(el, x, y) {
    tip.textContent = el.getAttribute("data-tip");
    tip.hidden = false;
    var box = tip.getBoundingClientRect();
    tip.style.left = Math.min(window.innerWidth - box.width - 8, Math.max(8, x + 14)) + "px";
    tip.style.top = Math.max(8, y - box.height - 10) + "px";
    areas.forEach(function (a) {
      a.classList.toggle("hot", a === el);
    });
  }
  function hide() {
    tip.hidden = true;
    areas.forEach(function (a) {
      a.classList.remove("hot");
    });
  }
  svg.addEventListener("pointermove", function (e) {
    var el = /** @type {Element} */ (e.target).closest("[data-tip]");
    if (el) show(el, e.clientX, e.clientY);
    else hide();
  });
  svg.addEventListener("pointerleave", hide);
  svg.addEventListener("focusin", function (e) {
    var el = /** @type {Element} */ (e.target).closest("[data-tip]");
    if (!el) return;
    var box = el.getBoundingClientRect();
    show(el, box.left + box.width / 2, box.top);
  });
  svg.addEventListener("focusout", hide);
  function focusClass(index) {
    areas.forEach(function (a) {
      a.classList.toggle("dim", index !== null && a.getAttribute("data-class") !== index);
    });
    swatches.forEach(function (s) {
      s.classList.toggle("dim", index !== null && s.getAttribute("data-class") !== index);
    });
  }
  swatches.forEach(function (s) {
    s.addEventListener("pointerenter", function () {
      focusClass(s.getAttribute("data-class"));
    });
    s.addEventListener("pointerleave", function () {
      focusClass(null);
    });
  });
}

/**
 * One self-contained page: the map as inline SVG with a tooltip that
 * follows the pointer or the keyboard focus, a legend that dims other
 * classes on hover, and the data as a table for screen readers.
 * @param {string} svg SVG with embedded fonts
 * @param {any} scene
 * @param {(key: string, params?: any) => string} t
 */
export function renderHtml(svg, scene, t) {
  const dark = scene.background !== "#fbfaf7";
  const ink = dark ? "#eef0f2" : "#1b1f23";
  const rows = scene.table
    .map(
      (row) =>
        `<tr><th scope="row">${esc(row.name)}</th><td>${row.value === null ? esc(t("legend.no_data")) : esc(row.value)}</td></tr>`,
    )
    .join("");
  const table = scene.table.length
    ? `<details><summary>${esc(t("html.data_table"))}</summary><table><thead><tr><th>${esc(t("html.area"))}</th><th>${esc(t("html.value"))}</th></tr></thead><tbody>${rows}</tbody></table></details>`
    : "";
  return `<!doctype html>
<html lang="${esc(scene.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(scene.title)}</title>
<style>
html{background:${scene.background}}
body{margin:0;color:${ink};font:14px/1.5 system-ui,sans-serif}
main{max-width:${scene.width}px;margin:0 auto}
svg{display:block;width:100%;height:auto}
[data-tip]{cursor:default}
[data-tip].hot{stroke:${ink};stroke-width:1.6}
[data-tip]:focus{outline:none;stroke:${ink};stroke-width:2}
.dim{opacity:.22}
rect[data-class]{cursor:pointer}
#tip{position:fixed;z-index:2;max-width:260px;padding:6px 10px;border-radius:6px;background:${ink};color:${scene.background};font-size:13px;pointer-events:none;box-shadow:0 2px 10px rgba(0,0,0,.25)}
details{margin:12px 16px 24px}
summary{cursor:pointer;font-weight:600}
table{border-collapse:collapse;margin-top:8px;width:100%;max-width:560px}
th,td{text-align:left;padding:4px 8px;border-bottom:1px solid ${dark ? "#2a2f37" : "#e5e2d9"}}
</style>
</head>
<body>
<main>
${svg}
<div id="tip" role="status" hidden></div>
${table}
</main>
<script>(${interactions.toString()})(document.querySelector("svg"), document.getElementById("tip"));</script>
</body>
</html>
`;
}
