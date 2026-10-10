import { geoAlbers, geoConicEqualArea } from "d3-geo";

const EPS = 1e-6;

// Each part is projected with its own projection and clipped to a window
// given in units of the main scale k, relative to the translate point. A
// shape only shows in the window of the part whose projection owns it.
const LAYOUTS = {
  us: {
    parts: () => [
      {
        name: "main",
        p: geoAlbers(),
        ratio: 1,
        at: [0, 0],
        window: [
          [-0.455, -0.238],
          [0.455, 0.238],
        ],
      },
      {
        name: "alaska",
        p: geoConicEqualArea().rotate([154, 0]).center([-2, 58.5]).parallels([55, 65]),
        ratio: 0.35,
        at: [-0.307, 0.201],
        window: [
          [-0.425, 0.12],
          [-0.214, 0.234],
        ],
      },
      {
        name: "hawaii",
        p: geoConicEqualArea().rotate([157, 0]).center([-3, 19.9]).parallels([8, 18]),
        ratio: 1,
        at: [-0.205, 0.212],
        window: [
          [-0.214, 0.166],
          [-0.115, 0.234],
        ],
      },
      {
        name: "puerto-rico",
        p: geoConicEqualArea().rotate([66, 0]).center([0, 18]).parallels([8, 18]),
        ratio: 1,
        at: [0.351, 0.204],
        window: [
          [0.312, 0.19],
          [0.381, 0.234],
        ],
      },
    ],
  },
};

/**
 * A d3 compatible projection made of several projections, in the manner of
 * d3.geoAlbersUsa.
 * @param {"us"} layout
 */
export function composite(layout) {
  const parts = LAYOUTS[layout].parts();
  let scale = 1;
  let translate = [0, 0];
  let cache;
  let cacheStream;
  /** @type {any} */
  const pointStream = { point: (x, y) => (picked = [x, y]) };
  let picked = null;
  let pointers = [];

  function projection(coordinates) {
    picked = null;
    for (const pointer of pointers) {
      pointer.point(coordinates[0], coordinates[1]);
      if (picked) return picked;
    }
    return null;
  }

  function apply() {
    const [x, y] = translate;
    const k = scale;
    pointers = parts.map((part) => {
      part.p.scale(k * part.ratio);
      part.p.translate([x + part.at[0] * k, y + part.at[1] * k]);
      part.p.clipExtent([
        [x + part.window[0][0] * k + EPS, y + part.window[0][1] * k + EPS],
        [x + part.window[1][0] * k - EPS, y + part.window[1][1] * k - EPS],
      ]);
      return part.p.stream(pointStream);
    });
    cache = cacheStream = null;
    return projection;
  }

  projection.stream = (stream) => {
    if (cache && cacheStream === stream) return cache;
    const streams = parts.map((part) => part.p.stream(stream));
    cacheStream = stream;
    cache = {
      point: (x, y) => streams.forEach((s) => s.point(x, y)),
      sphere: () => streams.forEach((s) => s.sphere()),
      lineStart: () => streams.forEach((s) => s.lineStart()),
      lineEnd: () => streams.forEach((s) => s.lineEnd()),
      polygonStart: () => streams.forEach((s) => s.polygonStart()),
      polygonEnd: () => streams.forEach((s) => s.polygonEnd()),
    };
    return cache;
  };
  projection.scale = (value) => {
    if (value === undefined) return scale;
    scale = +value;
    return apply();
  };
  projection.translate = (value) => {
    if (value === undefined) return translate;
    translate = [+value[0], +value[1]];
    return apply();
  };
  projection.precision = (value) => {
    parts.forEach((part) => part.p.precision(value));
    return projection;
  };
  projection.invert = () => {
    throw new Error("composite projections cannot be inverted");
  };
  projection.parts = parts;
  return projection.scale(1000);
}
