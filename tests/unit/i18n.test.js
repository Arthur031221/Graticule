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

for (const lang of LANGS.filter((l) => l !== "en")) {
  test(`${lang} translates every message with the same placeholders`, async () => {
    const messages = new Map(flat(await assets.json(`locales/${lang}.json`)));
    const missing = [...english.keys()].filter((key) => !messages.has(key));
    const extra = [...messages.keys()].filter((key) => !english.has(key));
    assert.deepEqual(missing, [], `missing in ${lang}`);
    assert.deepEqual(extra, [], `unknown in ${lang}`);
    for (const [key, text] of messages) {
      assert.ok(String(text).trim(), `${lang} ${key} is empty`);
      assert.deepEqual(placeholders(text), placeholders(english.get(key)), `${lang} ${key}`);
    }
  });
}

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
