// Projects a fixed set of points with every Graticule projection and writes
// them as JSON for verify/proj_check.py, which compares them with PROJ.
import { writeFileSync } from "node:fs";
import { PROJECTIONS } from "../src/projections.js";

const R = 6371008.8; // IUGG mean Earth radius in metres
const SAMPLE = 3000;

// Same generator as the Python side expects: a seeded sequence, no dependencies.
let seed = 20261010;
const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

/** Domain of each projection: where it is defined and where the check is meaningful. */
const DOMAIN = {
  mercator: { lat: [-80, 80] },
  "transverse-mercator": { lon: [-60, 60] },
  orthographic: { radius: 85 },
  albers: { lat: [-60, 80] },
  "conic-equal-area": { lat: [-60, 80] },
};

const out = {};
for (const [name, entry] of Object.entries(PROJECTIONS)) {
  if (name === "albers-usa") continue;
  const projection = entry.make();
  projection.center([0, 0]).scale(R).translate([0, 0]);
  const domain = DOMAIN[name] ?? {};
  const points = [];
  while (points.length < SAMPLE) {
    // Uniform on the sphere, then rejected into the domain.
    const lon = random() * 360 - 180;
    const lat = (Math.asin(random() * 2 - 1) * 180) / Math.PI;
    if (domain.lat && (lat < domain.lat[0] || lat > domain.lat[1])) continue;
    if (domain.lon && Math.abs(lon) > domain.lon[1]) continue;
    if (
      domain.radius &&
      Math.acos(Math.cos((lat * Math.PI) / 180) * Math.cos((lon * Math.PI) / 180)) > (domain.radius * Math.PI) / 180
    )
      continue;
    points.push([lon, lat]);
  }
  const xy = points.map((p) => projection(p));
  out[name] = {
    equalArea: entry.equalArea,
    rotate: projection.rotate?.() ?? [0, 0, 0],
    parallels: projection.parallels?.() ?? null,
    points,
    xy: xy.map(([x, y]) => (x === undefined ? null : [x, -y])),
  };
}
writeFileSync(process.argv[2] ?? "verify/projections.json", JSON.stringify({ radius: R, projections: out }));
console.log(`${Object.keys(out).length} projections, ${SAMPLE} points each`);
