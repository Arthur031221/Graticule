# Contributing

Thank you for helping. This page tells you how to run the project, what a good change looks like, and where the common additions go.

## Set up

You need Node 20 or newer. Python is only for the verification scripts.

```
git clone https://github.com/Arthur031221/Graticule
cd Graticule
npm ci
npm test
```

`npm test` runs the unit and snapshot tests in a few seconds. `npm run build` regenerates the program in `skills/graticule/scripts/graticule.mjs` and the reference pages in `skills/graticule/references`. Both are committed because the skill must work from a plain copy of its folder, so CI fails when they are out of date. Run `npm run build` before you commit a change to `src/`.

The playground is built with `node scripts/build.mjs --site` into `site/` and served with `node scripts/serve.mjs site`. Browser tests run with `npx playwright install chromium` and `npm run test:e2e`.

## What a good change looks like

- It has a test that fails without it. Rules in `src/checks.js` need a test in `tests/unit/checks.test.js` that shows the rule firing and, where a fix exists, the fix repairing it.
- It does not weaken a check to make a map pass. If a rule is wrong, change the rule and say why in the pull request, with the data that shows it.
- A number in the README or in `docs/verification.md` comes from a script in this repository. Add the script with the number.
- Prose is plain. No marketing words, no dashes, short sentences.
- Code follows the formatter (`npm run format`) and reads without comments that restate it.

## Common additions

### A new region

1. Put the boundaries in `scripts/build-data.mjs` and run `npm run build:data`. Each area needs an `id`, names in the nine languages in the order of `LANGS` (`src/lang.js`) and, if you have it, a population.
2. Describe the region in `src/regions.js`: file, level, projection, key types and, when parts of it need an inset, the `insets` list.
3. Add the key extraction for its level to `keysFor` in `src/geo.js`.
4. Add a gallery map in `scripts/build-gallery.mjs` that uses real public data, run `npm run gallery`, and look at the picture.
5. Add the source and the license to `skills/graticule/references/data.md` and `NOTICE.md`. A region without a license that allows redistribution cannot be added.

### A new rule

Add it to `RULES` in `src/checks.js` with the condition in `fires`, implement it in `checkAnalysis`, add a `message` and a `reason` to `skills/graticule/locales/en.json`, and add the translations (a test fails until all nine languages have the key with the same placeholders).

### A translation

Locale files are in `skills/graticule/locales`. Fix a string in place. A test checks that every language has every key and the same `{placeholders}`. READMEs are `README.<lang>.md` and should be translated by a person who reads the language.

### A new alias for country names

Add it to `skills/graticule/data/aliases.json` with the ISO 3166-1 alpha-3 code and run `node verify/join-rates.mjs`. The wrong-match count must stay at zero.

## Reporting a problem

Say what you gave Graticule (the spec and the first rows of the table), what you expected, and what happened. A map that looks wrong is a bug when the report says which rule should have caught it.
