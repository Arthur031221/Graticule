"""Builds the font subsets in skills/graticule/fonts from the installed Noto fonts.

    python3 scripts/build_fonts.py

Needs fontTools. Noto Sans and Noto Sans CJK are SIL OFL 1.1 licensed.
Writes gzip compressed Latin and CJK subsets plus metrics.json, the advance
widths the layout code uses to measure text without loading a font.
"""
import gzip
import json
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTCollection, TTFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "skills/graticule/fonts"
DATA = ROOT / "skills/graticule/data"
NOTO = Path("/usr/share/fonts/truetype/noto")
CJK = Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc")

# Index of each language's face inside the collection, and its name index in the data files.
FACES = {"jp": (0, 3), "kr": (1, 4), "sc": (2, 2), "tc": (3, 1)}

LATIN_RANGES = [
    (0x20, 0x7E), (0xA0, 0x24F), (0x2B0, 0x2FF), (0x370, 0x3FF), (0x400, 0x4FF), (0x1E00, 0x1EFF),
    (0x2000, 0x206F), (0x20A0, 0x20CF), (0x2190, 0x21FF), (0x2200, 0x22FF), (0x25A0, 0x25FF),
]
CJK_COMMON = [(0x20, 0x7E), (0xA0, 0xFF), (0x2000, 0x206F), (0x3000, 0x303F), (0xFF00, 0xFFEF), (0x2190, 0x21FF), (0x25A0, 0x25FF)]


def expand(ranges):
    return {cp for lo, hi in ranges for cp in range(lo, hi + 1)}


def codec_chars(codec, leads, trails=range(0xA1, 0xFF)):
    chars = set()
    for lead in leads:
        for trail in trails:
            try:
                text = bytes([lead, trail]).decode(codec)
            except UnicodeDecodeError:
                continue
            if len(text) == 1:
                chars.add(ord(text))
    return chars


def dataset_chars(index):
    chars = set()
    for path in DATA.glob("*.json"):
        if path.name == "aliases.json":
            continue
        topo = json.loads(path.read_text(encoding="utf-8"))
        for obj in topo["objects"].values():
            for g in obj["geometries"]:
                names = g["properties"].get("nm", [])
                if index < len(names):
                    chars.update(ord(c) for c in names[index])
    return chars


def cjk_set(face):
    chars = expand(CJK_COMMON)
    if face == "tc":
        chars |= codec_chars("big5", range(0xA4, 0xC7), list(range(0x40, 0x7F)) + list(range(0xA1, 0xFF)))
    elif face == "sc":
        chars |= codec_chars("gb2312", range(0xB0, 0xD8))
    elif face == "jp":
        chars |= expand([(0x3040, 0x30FF), (0x31F0, 0x31FF)]) | codec_chars("euc_jp", range(0xB0, 0xD0))
    elif face == "kr":
        chars |= expand([(0x3131, 0x318E)]) | codec_chars("euc_kr", range(0xB0, 0xC9))
    return chars | dataset_chars(FACES[face][1])


def subsetted(font, unicodes, flavor_ttf):
    options = subset.Options()
    options.layout_features = ["kern", "liga", "ccmp", "locl", "mark", "mkmk"] if flavor_ttf else ["kern", "locl"]
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6]
    options.name_legacy = False
    options.name_languages = [0x409]
    options.hinting = False
    options.notdef_outline = True
    options.glyph_names = False
    options.legacy_kern = True
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=sorted(unicodes))
    subsetter.subset(font)
    return font


def save_gz(font, name):
    tmp = OUT / (name + ".tmp")
    font.save(tmp)
    data = tmp.read_bytes()
    tmp.unlink()
    (OUT / name).write_bytes(gzip.compress(data, 9, mtime=0))
    print(f"{name:28s}{len(data) / 1024:8.0f} KB raw {(OUT / name).stat().st_size / 1024:8.0f} KB gz")


def ranges(codepoints):
    """Sorted code points as a flat [start, end, start, end, ...] list of inclusive runs."""
    out = []
    for cp in sorted(codepoints):
        if out and cp == out[-1] + 1:
            out[-1] = cp
        else:
            out.extend([cp, cp])
    return out


def metrics(path, codepoints):
    font = TTFont(path)
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    return {str(cp): hmtx[cmap[cp]][0] for cp in sorted(codepoints) if cp in cmap}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    latin = expand(LATIN_RANGES)
    table = {"upm": 1000}
    for style, file in (("regular", "NotoSans-Regular.ttf"), ("bold", "NotoSans-Bold.ttf")):
        table[style] = metrics(NOTO / file, latin)
        save_gz(subsetted(TTFont(NOTO / file), latin, True), f"NotoSans-{style.capitalize()}.ttf.gz")
    (OUT / "metrics.json").write_text(json.dumps(table, separators=(",", ":")))
    collection = TTCollection(CJK)
    coverage = {}
    for face, (index, _) in FACES.items():
        font = collection.fonts[index]
        font = subsetted(font, cjk_set(face), False)
        coverage[face] = ranges(font.getBestCmap().keys())
        save_gz(font, f"NotoSansCJK-{face.upper()}.otf.gz")
    (OUT / "coverage.json").write_text(json.dumps(coverage, separators=(",", ":")))


if __name__ == "__main__":
    sys.exit(main())
