"""Writes tests/fixtures/classify.json and color.json from reference libraries.

    pip install numpy mapclassify colour-science colorspacious
    python3 scripts/make-fixtures.py

The Node tests compare the JavaScript implementations with these values. CI
regenerates the files and fails if they differ, so the fixtures cannot drift.
"""
import json
from pathlib import Path

import colour
import mapclassify
import numpy as np
from colorspacious import cspace_convert

OUT = Path(__file__).resolve().parent.parent / "tests/fixtures"


def datasets():
    rng = np.random.default_rng(20261010)
    return {
        "normal-200": np.round(rng.normal(60, 12, 200), 3),
        "lognormal-150": np.round(rng.lognormal(3, 1.1, 150), 3),
        "uniform-100": np.round(rng.uniform(0, 100, 100), 3),
        "ties-120": rng.integers(0, 40, 120).astype(float),
        "skewed-80": np.round(np.concatenate([rng.exponential(2, 70), rng.uniform(40, 90, 10)]), 3),
    }


def classify_cases():
    cases = []
    for name, values in datasets().items():
        for k in (3, 5, 7):
            for method, factory in (
                ("quantile", mapclassify.Quantiles),
                ("equal", mapclassify.EqualInterval),
                ("jenks", mapclassify.FisherJenks),
            ):
                result = factory(values, k=k)
                ssd = None
                if method == "jenks":
                    ssd = float(sum(((values[result.yb == i] - values[result.yb == i].mean()) ** 2).sum() for i in range(k) if (result.yb == i).any()))
                cases.append(
                    {
                        "dataset": name,
                        "method": method,
                        "k": k,
                        "values": values.tolist(),
                        "min": float(values.min()),
                        "bins": [float(b) for b in result.bins],
                        "counts": [int(c) for c in np.bincount(result.yb, minlength=k)],
                        "ssd": ssd,
                    }
                )
    return cases


def color_cases():
    rng = np.random.default_rng(7)
    colors = ["#" + "".join(f"{v:02x}" for v in rgb) for rgb in rng.integers(0, 256, (40, 3))]
    colors += ["#08519c", "#eff3ff", "#d7191c", "#fdae61", "#00ff00", "#ffffff", "#000000", "#808080"]
    kinds = {"protanopia": "protanomaly", "deuteranopia": "deuteranomaly", "tritanopia": "tritanomaly"}
    out = {"lab": {}, "cvd": {k: {} for k in kinds}, "pairs": []}
    for hexcolor in colors:
        rgb = np.array([int(hexcolor[i : i + 2], 16) for i in (1, 3, 5)]) / 255
        xyz = colour.sRGB_to_XYZ(rgb)
        out["lab"][hexcolor] = [float(v) for v in colour.XYZ_to_Lab(xyz, colour.CCS_ILLUMINANTS["CIE 1931 2 Degree Standard Observer"]["D65"])]
        for ours, theirs in kinds.items():
            seen = cspace_convert(rgb, {"name": "sRGB1+CVD", "cvd_type": theirs, "severity": 100}, "sRGB1")
            seen = np.clip(seen, 0, 1)
            out["cvd"][ours][hexcolor] = "#" + "".join(f"{int(round(v * 255)):02x}" for v in seen)
    for i in range(0, len(colors) - 1, 2):
        a, b = out["lab"][colors[i]], out["lab"][colors[i + 1]]
        out["pairs"].append({"a": colors[i], "b": colors[i + 1], "de2000": float(colour.delta_E(np.array(a), np.array(b), method="CIE 2000"))})
    return out


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "classify.json").write_text(json.dumps({"mapclassify": mapclassify.__version__, "numpy": np.__version__, "cases": classify_cases()}, separators=(",", ":")) + "\n")
    color = color_cases()
    color["colour_science"] = colour.__version__
    (OUT / "color.json").write_text(json.dumps(color, separators=(",", ":")) + "\n")
    print("fixtures written")
