import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { deltaE, deltaE2000, hexToLab, readableOn, simulate } from "../../src/color.js";
import { lightnessSteps, listPalettes, paletteColors, separation } from "../../src/palettes.js";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/color.json", import.meta.url), "utf8"));

test(`CIELAB matches colour-science ${fixture.colour_science}`, () => {
  for (const [hex, lab] of Object.entries(fixture.lab)) {
    const ours = hexToLab(hex);
    ours.forEach((v, i) => assert.ok(Math.abs(v - lab[i]) < 0.02, `${hex} channel ${i}: ${v} vs ${lab[i]}`));
  }
});

test("CIEDE2000 matches colour-science on random pairs", () => {
  for (const { a, b, de2000 } of fixture.pairs) assert.ok(Math.abs(deltaE(a, b) - de2000) < 0.02, `${a} ${b}`);
});

test("CIEDE2000 reproduces published pairs of Sharma, Wu and Dalal", () => {
  const pairs = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  ];
  for (const [x, y, expected] of pairs) assert.ok(Math.abs(deltaE2000(x, y) - expected) < 1e-3);
});

test("colour vision simulation matches colorspacious within one 8 bit step", () => {
  for (const [kind, table] of Object.entries(fixture.cvd)) {
    for (const [hex, expected] of Object.entries(table)) {
      const got = simulate(hex, kind);
      for (const i of [1, 3, 5])
        assert.ok(
          Math.abs(parseInt(got.slice(i, i + 2), 16) - parseInt(expected.slice(i, i + 2), 16)) <= 2,
          `${kind} ${hex}: ${got} vs ${expected}`,
        );
    }
  }
});

test("every bundled sequential palette gets monotonically lighter or darker", () => {
  for (const { name, type } of listPalettes().filter((p) => p.type === "sequential")) {
    for (let k = 3; k <= 9; k++) {
      const steps = lightnessSteps(paletteColors(name, k));
      assert.ok(
        steps.every((s) => Math.sign(s) === Math.sign(steps[0]) && Math.abs(s) >= 2),
        `${name} ${type} ${k}`,
      );
    }
  }
});

test("a rainbow palette is not monotonic and a categorical set stays apart", () => {
  const steps = lightnessSteps(["#00007f", "#0000ff", "#00ffff", "#ffff00", "#ff0000"]);
  assert.ok(steps.some((s) => s < 0) && steps.some((s) => s > 0));
  assert.ok(Math.min(...Object.values(separation(paletteColors("okabe-ito", 8), true))) > 8);
});

test("text colour follows the background", () => {
  assert.equal(readableOn("#ffffff"), "#1b1f23");
  assert.equal(readableOn("#08306b"), "#ffffff");
});

test("the text of a map reads on its background in both themes (WCAG AA, 4.5 to 1)", async () => {
  const { THEMES } = await import("../../src/draw.js");
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contrast = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  for (const [name, theme] of Object.entries(THEMES))
    for (const role of ["ink", "muted", "faint"])
      assert.ok(
        contrast(theme[role], theme.bg) >= 4.5,
        `${name} ${role}: ${contrast(theme[role], theme.bg).toFixed(2)}`,
      );
});
