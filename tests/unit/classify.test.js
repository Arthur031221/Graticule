import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { breaksFor, classOf, equalEdges, equalEdgesAround, jenks, niceEdges, spearman } from "../../src/classify.js";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/classify.json", import.meta.url), "utf8"));

const ssd = (values, edges) => {
  let total = 0;
  for (let i = 0; i < edges.length - 1; i++) {
    const members = values.filter((v) => classOf(v, edges) === i);
    const mean = members.reduce((a, b) => a + b, 0) / (members.length || 1);
    total += members.reduce((a, v) => a + (v - mean) ** 2, 0);
  }
  return total;
};

for (const c of fixture.cases) {
  test(`${c.method} k=${c.k} on ${c.dataset} matches mapclassify ${fixture.mapclassify}`, () => {
    const edges = breaksFor(c.values, c.method, c.k);
    assert.equal(edges[0], c.min);
    if (c.method === "jenks") {
      // Several partitions can share the optimum when values tie, so compare the optimum itself.
      assert.ok(
        Math.abs(ssd(c.values, edges) - c.ssd) < 1e-6 * Math.max(1, c.ssd),
        "within-class variance equals the optimum",
      );
      if (c.dataset !== "ties-120") assert.deepEqual(edges.slice(1), c.bins);
    } else {
      assert.equal(edges.length - 1, c.bins.length);
      edges
        .slice(1)
        .forEach((edge, i) => assert.ok(Math.abs(edge - c.bins[i]) < 1e-9, `edge ${i + 1}: ${edge} vs ${c.bins[i]}`));
    }
    if (c.method !== "jenks" || c.dataset !== "ties-120") {
      const counts = Array(edges.length - 1).fill(0);
      for (const v of c.values) counts[classOf(v, edges)]++;
      assert.deepEqual(counts, c.counts);
    }
  });
}

test("a value on an inner edge belongs to the lower class", () => {
  const edges = [0, 10, 20];
  assert.equal(classOf(0, edges), 0);
  assert.equal(classOf(10, edges), 0);
  assert.equal(classOf(10.001, edges), 1);
  assert.equal(classOf(20, edges), 1);
  assert.equal(classOf(20.001, edges), -1);
  assert.equal(classOf(-1, edges), -1);
});

test("jenks separates obvious groups", () => {
  assert.deepEqual(jenks([1, 2, 3, 10, 11, 12, 50, 51, 52], 3), [1, 3, 12, 52]);
});

test("jenks breaks do not move when every value is shifted far from zero", () => {
  const values = [1, 2, 3, 10, 11, 12];
  assert.deepEqual(jenks(values, 2), [1, 3, 12]);
  assert.deepEqual(
    jenks(
      values.map((v) => v + 1e12),
      2,
    ),
    [1, 3, 12].map((v) => v + 1e12),
  );
});

test("quantile edges collapse when values tie", () => {
  const edges = breaksFor([1, 1, 1, 1, 1, 1, 1, 2, 3, 4], "quantile", 5);
  assert.deepEqual(edges, [...new Set(edges)]);
  assert.ok(edges.length < 6);
});

test("nice edges give every value the class it had and use few digits", () => {
  for (const c of fixture.cases.filter((x) => x.method !== "equal" && x.dataset !== "ties-120")) {
    const raw = breaksFor(c.values, c.method, c.k);
    const edges = niceEdges(raw, c.values);
    assert.ok(edges[0] <= Math.min(...c.values) && edges.at(-1) >= Math.max(...c.values));
    for (const v of c.values) assert.equal(classOf(v, edges), classOf(v, raw), `${c.dataset} ${c.method} ${c.k}`);
  }
  assert.deepEqual(niceEdges([10, 45.96, 90.3], [10, 45.96, 46.2, 60, 70.1, 70.5, 90.3]).slice(1, -1), [46]);
});

test("equal-interval classes have one round width and cover the data", () => {
  assert.deepEqual(equalEdges(3.2, 29.6, 4), [0, 10, 20, 30]);
  assert.deepEqual(equalEdges(0, 100, 5), [0, 20, 40, 60, 80, 100]);
  assert.deepEqual(equalEdges(0.0000123, 0.0000987, 5), [0, 0.00002, 0.00004, 0.00006, 0.00008, 0.0001]);
  const values = [0, 4.8, 9];
  const edges = equalEdges(0, 9, 2);
  assert.ok(edges.length - 1 <= 2 && edges[0] <= 0 && edges.at(-1) >= 9);
  for (const v of values) assert.ok(classOf(v, edges) >= 0);
  assert.deepEqual(equalEdgesAround(-14, 38, 0, 3), [-20, 0, 20, 40]);
});

test("spearman handles ties and reversed order", () => {
  assert.equal(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1);
  assert.equal(spearman([1, 2, 3, 4], [40, 30, 20, 10]), -1);
  assert.ok(Math.abs(spearman([1, 2, 2, 3], [1, 2, 3, 4]) - 0.9487) < 1e-3);
});
