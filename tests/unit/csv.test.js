import assert from "node:assert/strict";
import { test } from "node:test";
import { isNull, parseColumn, parseNumber, parseTable } from "../../src/csv.js";

test("parses quotes, embedded commas, quotes and line breaks", () => {
  const { columns, rows } = parseTable('name,note,value\n"Korea, Rep.","said ""hi""\nthere",1,\n');
  assert.deepEqual(columns, ["name", "note", "value"]);
  assert.equal(rows[0].name, "Korea, Rep.");
  assert.equal(rows[0].note, 'said "hi"\nthere');
});

test("strips a byte order mark and detects tabs and semicolons", () => {
  assert.deepEqual(parseTable("﻿a;b\n1;2\n").columns, ["a", "b"]);
  assert.equal(parseTable("a\tb\n1\t2\n").rows[0].b, "2");
});

test("handles CRLF and skips blank lines", () => {
  assert.equal(parseTable("a,b\r\n1,2\r\n\r\n3,4\r\n").rows.length, 2);
});

test("numbers as spreadsheets print them", () => {
  assert.equal(parseNumber("1,234,567"), 1234567);
  assert.equal(parseNumber("1.234,5"), 1234.5);
  assert.equal(parseNumber("12,5"), 12.5);
  assert.equal(parseNumber("45%"), 45);
  assert.equal(parseNumber("$3.50"), 3.5);
  assert.equal(parseNumber("−2.5"), -2.5);
  assert.equal(parseNumber("1e3"), 1000);
  assert.equal(parseNumber("12abc"), null);
});

test("null markers are not zero", () => {
  for (const marker of ["", "NA", "n/a", "..", "-", "NaN", "null"]) {
    assert.ok(isNull(marker));
    assert.equal(parseNumber(marker), null);
  }
  assert.equal(parseNumber("0"), 0);
});

test("one decimal mark per column: other cells decide what 1,234 means", () => {
  assert.deepEqual(parseColumn(["1,234", "12,5"]).values, [1.234, 12.5]);
  assert.deepEqual(parseColumn(["1.234", "3,5", "1.234,5"]).values, [1234, 3.5, 1234.5]);
  assert.deepEqual(parseColumn(["1,234", "3.5"]).values, [1234, 3.5]);
  assert.deepEqual(parseColumn(["1,234,567", "2"]).values, [1234567, 2]);
  assert.deepEqual(parseColumn(["1.234.567", "2"]).values, [1234567, 2]);
  // Without any proof the thousands reading stays, and a mixed column keeps the per-cell reading.
  assert.deepEqual(parseColumn(["1,234", "5,678"]), { values: [1234, 5678], decimal: null });
  assert.equal(parseColumn(["12,5", "3.5"]).decimal, null);
  assert.deepEqual(parseColumn(["$1,234.5", "n/a", "2%"]).values, [1234.5, null, 2]);
});
