import assert from "node:assert/strict";
import { test } from "node:test";
import { createTranslator, numberFormatter } from "../../src/i18n.js";
import { LANGS, normalizeLang } from "../../src/lang.js";
import { assets } from "./helpers.js";

const flat = (object, prefix = "") =>
  Object.entries(object).flatMap(([key, value]) =>
    value && typeof value === "object" ? flat(value, `${prefix}${key}.`) : [[`${prefix}${key}`, value]],
  );
const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const english = new Map(flat(await assets.json("locales/en.json")));
const ONE_FORM = new Set(["en", "es", "fr", "de", "pt"]);
const isOne = (key) => key.endsWith("_one");

for (const lang of LANGS.filter((l) => l !== "en")) {
  test(`${lang} translates every message with the same placeholders`, async () => {
    const messages = new Map(flat(await assets.json(`locales/${lang}.json`)));
    // Languages that use one form for every count carry no "_one" messages.
    const wanted = [...english.keys()].filter((key) => ONE_FORM.has(lang) || !isOne(key));
    const missing = wanted.filter((key) => !messages.has(key));
    const extra = [...messages.keys()].filter((key) => !wanted.includes(key));
    assert.deepEqual(missing, [], `missing in ${lang}`);
    assert.deepEqual(extra, [], `unknown in ${lang}`);
    for (const [key, text] of messages) {
      assert.ok(String(text).trim(), `${lang} ${key} is empty`);
      assert.deepEqual(placeholders(text), placeholders(english.get(key)), `${lang} ${key}`);
    }
  });
}

test("every singular message belongs to a message that exists", () => {
  for (const key of english.keys()) if (isOne(key)) assert.ok(english.has(key.slice(0, -4)), key);
});

test("a count of one picks the singular form of the language", () => {
  const en = { n: "{count} rows", n_one: "{count} row" };
  const fr = { n: "{count} lignes", n_one: "{count} ligne" };
  const ja = { n: "{count} 行" };
  assert.equal(createTranslator(en)("n", { count: 1 }), "1 row");
  assert.equal(createTranslator(en)("n", { count: 2 }), "2 rows");
  assert.equal(createTranslator(fr, en, "fr")("n", { count: 0 }), "0 ligne");
  assert.equal(createTranslator(ja, en, "ja")("n", { count: 1 }), "1 行");
  assert.equal(createTranslator(en)("n"), "{count} rows");
});

test("a missing key falls back to English and then to the key", () => {
  const t = createTranslator({ a: "x" }, { a: "y", b: "hello {name}" });
  assert.equal(t("a"), "x");
  assert.equal(t("b", { name: "you" }), "hello you");
  assert.equal(t("c"), "c");
  assert.equal(t("b"), "hello {name}");
});

test("language tags map to the supported languages", () => {
  assert.equal(normalizeLang("zh_TW"), "zh-Hant");
  assert.equal(normalizeLang("en-GB"), "en");
  assert.equal(normalizeLang("pt-PT"), "pt");
  assert.equal(normalizeLang("sv"), "");
  assert.equal(normalizeLang(undefined), "");
});

test("numbers follow the language and shorten when large", () => {
  assert.equal(numberFormatter("en", [0, 2.5, 5])(2.5), "2.5");
  assert.equal(numberFormatter("de", [0, 2.5, 5])(2.5), "2,5");
  assert.equal(numberFormatter("en", [0, 1500000])(1500000), "1.5M");
  assert.equal(numberFormatter("ja", [0, 150000000])(150000000), "1.5億");
});

test("small numbers keep the digits that tell neighbouring edges apart", () => {
  const edges = [0.00001, 0.00002, 0.00003];
  const format = numberFormatter("en", edges);
  assert.deepEqual(edges.map(format), ["0.00001", "0.00002", "0.00003"]);
});

test("a legend shows four significant digits, not the ten of an unrounded class edge", () => {
  const format = numberFormatter("en", [10, 26.666666667, 43.33333333, 60]);
  assert.deepEqual([10, 26.666666667, 43.33333333, 60].map(format), ["10.00", "26.67", "43.33", "60.00"]);
  assert.equal(numberFormatter("de", [0.5, 12.25])(12.25), "12,25");
});

test("class edges that are close together are never printed the same", () => {
  const close = [1.00001, 1.00002, 1.00003];
  const format = numberFormatter("en", close);
  assert.equal(new Set(close.map(format)).size, 3);
  const tiny = [1e-7, 2e-7, 3e-7];
  assert.equal(new Set(tiny.map(numberFormatter("en", tiny))).size, 3);
  assert.deepEqual(
    [10, 26.666666667, 43.33333333, 60].map(numberFormatter("en", [10, 26.666666667, 43.33333333, 60])),
    ["10.00", "26.67", "43.33", "60.00"],
  );
});
