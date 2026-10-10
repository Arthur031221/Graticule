import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { decodeBytes, isNull, parseColumn, parseNumber, parseTable } from "../../src/csv.js";
import { fixture } from "./helpers.js";

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

const bytesOf = (name) => readFile(fixture(name));

test("valid UTF-8 and a byte order mark are read as UTF-8 without a guess", () => {
  const plain = decodeBytes(new TextEncoder().encode("name\nTürkiye"));
  assert.deepEqual([plain.text, plain.encoding, plain.guessed], ["name\nTürkiye", "utf-8", false]);
  const marked = decodeBytes(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("a,b")]));
  assert.deepEqual([marked.text, marked.guessed], ["a,b", false]);
});

test("UTF-16 with a byte order mark is read as UTF-16", async () => {
  const { text, encoding, guessed } = decodeBytes(await bytesOf("countries-utf16.csv"));
  assert.equal(encoding, "utf-16le");
  assert.equal(guessed, false);
  assert.match(text, /^country,value\nCôte d'Ivoire,3/);
});

test("bytes that are not UTF-8 are read as Windows-1252 and flagged as a guess", async () => {
  const { text, encoding, guessed } = decodeBytes(await bytesOf("countries-latin1.csv"));
  assert.equal(encoding, "windows-1252");
  assert.equal(guessed, true);
  assert.match(text, /Côte d'Ivoire,3\nTürkiye,5\nCuraçao,2/);
});

test("a stated encoding is used as given and is never a guess", async () => {
  const big5 = decodeBytes(await bytesOf("tw-counties-big5.csv"), "big5");
  assert.deepEqual([big5.encoding, big5.guessed], ["big5", false]);
  assert.match(big5.text, /臺北市,2494813/);
  const sjis = decodeBytes(await bytesOf("jp-prefectures-shift-jis.csv"), "shift_jis");
  assert.match(sjis.text, /東京都,14047594/);
  assert.throws(() => decodeBytes(new Uint8Array(), "not-an-encoding"), RangeError);
});
