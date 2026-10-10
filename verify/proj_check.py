"""Compares Graticule's projections with PROJ on a sphere.

    node verify/dump-projections.mjs verify/projections.json
    python3 verify/proj_check.py verify/projections.json [--write docs/verification-proj.md]

Each projection is evaluated at 3,000 seeded random points on the sphere with
R = 6371008.8 m. PROJ is the reference. Exit status 1 if any maximum error
exceeds the tolerance below (in metres on the ground).
"""
import json
import math
import sys

import numpy as np
import pyproj

# Robinson is defined by a table of numbers. d3 and PROJ normalise it differently
# (a uniform scale) and interpolate between rows differently, so it is compared
# after fitting one scale factor, with a limit of 0.2% of the radius.
FIT_SCALE = {"robinson"}
TOLERANCE_M = {"robinson": 15000.0}
DEFAULT_TOLERANCE_M = 0.01

PROJ4 = {
    "equal-earth": "+proj=eqearth +lon_0=0",
    "mollweide": "+proj=moll +lon_0=0",
    "natural-earth": "+proj=natearth +lon_0=0",
    "robinson": "+proj=robin +lon_0=0",
    "winkel-tripel": f"+proj=wintri +lon_0=0 +lat_1={math.degrees(math.acos(2 / math.pi)):.10f}",
    "mercator": "+proj=merc +lon_0=0",
    "equirectangular": "+proj=eqc +lon_0=0",
    "albers": "+proj=aea +lat_1=29.5 +lat_2=45.5 +lat_0=0 +lon_0=-96",
    "conic-equal-area": "+proj=aea +lat_1=20 +lat_2=50 +lat_0=0 +lon_0=100",
    "azimuthal-equal-area": "+proj=laea +lat_0=0 +lon_0=0",
    "transverse-mercator": "+proj=tmerc +lat_0=0 +lon_0=0 +k=1",
    "orthographic": "+proj=ortho +lat_0=0 +lon_0=0",
}


def main():
    data = json.load(open(sys.argv[1]))
    radius = data["radius"]
    rows = []
    worst = 0.0
    failed = []
    for name, entry in data["projections"].items():
        proj = pyproj.Proj(f"{PROJ4[name]} +R={radius} +units=m +no_defs")
        points = np.array(entry["points"])
        ours = np.array(entry["xy"], dtype=float)
        x, y = proj(points[:, 0], points[:, 1])
        ref = np.column_stack([x, y])
        scale = 1.0
        if name in FIT_SCALE:
            scale = float((ours * ref).sum() / (ref * ref).sum())
        err = np.hypot(*(ours - scale * ref).T)
        keep = np.isfinite(err)
        err = err[keep]
        tolerance = TOLERANCE_M.get(name, DEFAULT_TOLERANCE_M)
        rows.append((name, int(keep.sum()), float(np.median(err)), float(err.max()), tolerance, scale))
        worst = max(worst, float(err.max()))
        if err.max() > tolerance:
            failed.append(name)
    print(f"PROJ {pyproj.proj_version_str}, pyproj {pyproj.__version__}, R = {radius} m")
    print(f"{'projection':22s}{'points':>8s}{'median error':>16s}{'max error':>16s}{'limit':>10s}")
    for name, n, median, maximum, tol, scale in rows:
        print(f"{name:22s}{n:8d}{median:14.6f} m{maximum:14.6f} m{tol:10.2f} m" + (f"  (scale fitted: {scale:.5f})" if scale != 1.0 else ""))
    if "--write" in sys.argv:
        path = sys.argv[sys.argv.index("--write") + 1]
        with open(path, "w") as out:
            out.write(f"PROJ {pyproj.proj_version_str} (pyproj {pyproj.__version__}), sphere radius {radius} m, 3,000 seeded random points per projection.\n\n")
            out.write("| Projection | Points | Median error (m) | Maximum error (m) | Note |\n| --- | --- | --- | --- | --- |\n")
            for name, n, median, maximum, tol, scale in rows:
                note = f"compared after fitting one scale factor ({scale:.5f}), the tables are interpolated differently" if scale != 1.0 else ""
                out.write(f"| {name} | {n} | {median:.6f} | {maximum:.6f} | {note} |\n")
    if failed:
        print("FAILED:", ", ".join(failed))
        sys.exit(1)


if __name__ == "__main__":
    main()
