"""Re-opens exported maps with parsers that share no code with Graticule.

    python3 verify/parse_outputs.py [gallery ids...]

For each gallery map the CLI writes SVG, PDF and PNG. Then:
  SVG  parsed as XML, every path number finite, every embedded font opened with
       fontTools and checked for a glyph for every character the map draws.
  PDF  opened with pypdf: one page of the expected size, every font embedded,
       the title found in the extracted text.
  PNG  opened with Pillow: expected size and not blank.
Exit status 1 on the first failed check.
"""
import base64
import io
import json
import re
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

from fontTools.ttLib import TTFont
from PIL import Image
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
SVG = "{http://www.w3.org/2000/svg}"
DEFAULT = ["life-expectancy", "taiwan-township-area", "japan-regions", "korea-capital-region", "fertility-small-multiples", "taiwan-locator", "population-symbols"]


def fail(message):
    print("FAIL:", message)
    sys.exit(1)


def check_svg(path, spec):
    root = ET.parse(path).getroot()
    width, height = float(root.get("width")), float(root.get("height"))
    for el in root.iter(SVG + "path"):
        numbers = re.findall(r"-?\d+(?:\.\d+)?(?:e-?\d+)?", el.get("d", ""))
        if any(abs(float(n)) > 1e6 for n in numbers):
            fail(f"{path.name}: path number out of range")
    style = root.find(f"{SVG}defs/{SVG}style")
    cmaps = {}
    for family, data in re.findall(r"font-family:'([^']+)';font-weight:(?:\d+);src:url\(data:font/\w+;base64,([A-Za-z0-9+/=]+)\)", style.text if style is not None else ""):
        font = TTFont(io.BytesIO(base64.b64decode(data)))
        cmaps.setdefault(family, set()).update(font.getBestCmap())
    wide = re.compile("[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]")
    missing = set()
    for text in root.iter(SVG + "text"):
        for chunk in text.iter():
            content = (chunk.text or "") if chunk is text or chunk.tag == SVG + "tspan" else ""
            for ch in content:
                if ch.isspace():
                    continue
                cjk = bool(wide.match(ch))
                families = [f for f in cmaps if ("CJK" in f) == cjk]
                if not any(ord(ch) in cmaps[f] for f in families):
                    missing.add(ch)
    if missing:
        fail(f"{path.name}: no glyph in the embedded fonts for {''.join(sorted(missing))}")
    return width, height, sum(len(c) for c in cmaps.values())


def check_pdf(path, spec, width, height):
    reader = PdfReader(str(path))
    if len(reader.pages) != 1:
        fail(f"{path.name}: expected one page")
    box = reader.pages[0].mediabox
    if abs(float(box.width) - width * 0.75) > 1 or abs(float(box.height) - height * 0.75) > 1:
        fail(f"{path.name}: page size {box.width}x{box.height}")
    fonts = reader.pages[0]["/Resources"].get("/Font", {})
    for name, ref in fonts.items():
        font = ref.get_object()
        descendant = font["/DescendantFonts"][0].get_object() if "/DescendantFonts" in font else font
        descriptor = descendant.get("/FontDescriptor")
        if descriptor is None or not any(k in descriptor.get_object() for k in ("/FontFile", "/FontFile2", "/FontFile3")):
            fail(f"{path.name}: font {name} is not embedded")
    text = re.sub(r"\s+", "", reader.pages[0].extract_text())
    title = re.sub(r"\s+", "", spec["title"])
    if title not in text:
        fail(f"{path.name}: title not found in the PDF text ({title!r})")
    return len(fonts)


def check_png(path, width, height):
    image = Image.open(path).convert("RGB")
    if image.size != (round(width), round(height)):
        fail(f"{path.name}: size {image.size}")
    colours = image.getcolors(maxcolors=1_000_000)
    if colours is None or len(colours) < 8:
        fail(f"{path.name}: looks blank")


def main():
    ids = sys.argv[1:] or DEFAULT
    with tempfile.TemporaryDirectory() as tmp:
        for gallery_id in ids:
            spec_path = ROOT / "gallery" / gallery_id / "spec.json"
            spec = json.loads(spec_path.read_text(encoding="utf-8"))
            subprocess.run(["node", str(ROOT / "src/bin.js"), "render", str(spec_path), "-f", "svg,pdf,png", "-o", f"{tmp}/{gallery_id}"], check=True, capture_output=True)
            width, height, glyphs = check_svg(Path(tmp) / f"{gallery_id}.svg", spec)
            fonts = check_pdf(Path(tmp) / f"{gallery_id}.pdf", spec, width, height)
            check_png(Path(tmp) / f"{gallery_id}.png", width, height)
            print(f"ok  {gallery_id:30s} svg {int(width)}x{int(height)} ({glyphs} embedded glyphs)  pdf ({fonts} embedded fonts)  png")


if __name__ == "__main__":
    main()
