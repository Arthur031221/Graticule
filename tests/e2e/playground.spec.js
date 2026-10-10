import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const svg = (page) => page.locator("#sheet svg");

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

test("the bad example is blocked, one click fixes it, and the legend says per 100,000", async ({ page }) => {
  await page.goto("/?example=covid-raw");
  await expect(page.locator("#stage-note")).toContainText("4 problems stop this map");
  await expect(page.locator("#findings .finding.error")).toHaveCount(4);
  for (const id of ["raw-counts", "projection-mercator", "max-classes", "palette-order"])
    await expect(page.locator("#findings")).toContainText(id);
  await page.locator("#stage-note .btn.primary").click();
  await expect(svg(page)).toBeVisible();
  await expect(svg(page)).toContainText("Deaths per 100,000 people");
  await expect(page.locator("#check-summary")).not.toHaveClass(/error/);
  await expect(page.locator("#findings")).toContainText("Fixed:");
});

test("hovering an area shows its name and value, and the keyboard reaches areas too", async ({ page }) => {
  await page.goto("/?example=life-expectancy");
  await expect(svg(page)).toBeVisible();
  const germany = page.locator('#sheet [data-id="DEU"]').first();
  await germany.hover();
  await expect(page.locator("#tip")).toContainText("Germany");
  await expect(page.locator("#tip")).toContainText("8");
  await page.locator('#sheet [data-id="FRA"]').first().focus();
  await expect(page.locator("#tip")).toContainText("France");
});

test("a dropped CSV becomes a map and the region is detected", async ({ page }) => {
  await page.goto("/");
  await expect(svg(page)).toHaveCount(0);
  const csv = ["state,score", "California,5", "Texas,4", "New York,3", "Florida,2", "Ohio,1", "Maine,6"].join("\n");
  await page.locator("#file").setInputFiles({ name: "states.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.locator("#region")).toHaveValue("us-states");
  await page.fill("#title", "Scores");
  await page.fill("#source", "Made up");
  await expect(svg(page)).toBeVisible();
  await expect(svg(page)).toContainText("Scores");
  await expect(page.locator("#join-summary")).toContainText("6 of 6 rows matched 6 areas");
});

test("a table whose first column is a numeric code keeps the codes as the key and the next column as the value", async ({
  page,
}) => {
  await page.goto("/");
  const csv = ["fips,rate", "06037,5.1", "48201,4.2", "17031,6.3", "04013,3.9", "12086,4.4", "36061,5.5"].join("\n");
  await page.locator("#file").setInputFiles({ name: "counties.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.locator("#region")).toHaveValue("us-counties");
  await expect(page.locator("#value")).toHaveValue("rate");
  await expect(page.locator("#join-summary")).toContainText("6 of 6 rows matched 6 areas");
});

test("a column of names wins over a column of numbers that happen to be codes", async ({ page }) => {
  await page.goto("/");
  const csv = ["state,electoral_votes", "Calif.,54", "N.Y.,28", "Texas,40", "Fla.,30", "Ohio,17", "Maine,4"].join("\n");
  await page.locator("#file").setInputFiles({ name: "votes.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.locator("#region")).toHaveValue("us-states");
  await expect(page.locator("#value")).toHaveValue("electoral_votes");
  await expect(page.locator("#join-summary")).toContainText("state");
});

test("switching the interface language translates the page and the checker", async ({ page }) => {
  await page.goto("/?example=covid-raw&lang=ja");
  await expect(page.locator("h2 >> nth=0")).toContainText("データ");
  await expect(page.locator("#stage-note")).toContainText("4 件の問題");
  await page.selectOption("#ui-lang", "zh-Hant");
  await expect(page.locator("#stage-note")).toContainText("4 個問題");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-TW");
  await page.selectOption("#ui-lang", "en");
  await expect(page.locator("#stage-note")).toContainText("4 problems");
});

test("labels switch language and the SVG carries the CJK font it needs", async ({ page }) => {
  await page.goto("/?example=europe-gdp-per-capita");
  await expect(svg(page)).toContainText("Germany");
  await page.selectOption("#map-lang", "ja");
  await expect(svg(page)).toContainText("ドイツ");
  const download = page.waitForEvent("download");
  await page.locator('[data-export="svg"]').click();
  const file = await (await download).path();
  const text = await readFile(file, "utf8");
  expect(text).toContain("Noto Sans CJK JP");
  expect(text.startsWith("<svg")).toBe(true);
});

test("PNG, PDF and HTML downloads are real files", async ({ page }) => {
  await page.goto("/?example=life-expectancy");
  await expect(svg(page)).toBeVisible();
  for (const [id, magic] of [
    ["png", "\u0089PNG"],
    ["pdf", "%PDF-"],
    ["html", "<!doctype html>"],
  ]) {
    const download = page.waitForEvent("download");
    await page.locator(`[data-export="${id}"]`).click();
    const bytes = await readFile(await (await download).path());
    expect(bytes.toString("latin1").startsWith(magic)).toBe(true);
  }
});

test("export buttons carry translated names, not message keys", async ({ page }) => {
  await page.goto("/?example=life-expectancy");
  await expect(page.locator('[data-export="png3x"]')).toContainText("PNG for print");
  await expect(page.locator('[data-export="html"]')).toContainText("Interactive HTML");
  await expect(page.locator("#exports")).not.toContainText("ui.export");
  await page.selectOption("#ui-lang", "de");
  await expect(page.locator('[data-export="html"]')).not.toContainText("Interactive HTML");
  await expect(page.locator("#exports")).not.toContainText("ui.export");
});

test("accepting a rule lets a blocked map through and keeps it in the list", async ({ page }) => {
  await page.goto("/?example=life-expectancy");
  await expect(svg(page)).toBeVisible();
  await page.fill("#source", "");
  await expect(page.locator("#stage-note")).toContainText("problem");
  await page.locator('.finding:has-text("source-required") [data-allow]').click();
  await expect(svg(page)).toBeVisible();
  await expect(page.locator('.finding:has-text("source-required")')).toContainText("Accepted");
});

test("dark theme and mobile width do not overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/?example=life-expectancy");
  await expect(svg(page)).toBeVisible();
  await page.locator("#theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("no request leaves the origin", async ({ page }) => {
  const external = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== "http://localhost:4173" && url.protocol.startsWith("http")) external.push(request.url());
  });
  await page.goto("/?example=us-county-unemployment");
  await expect(svg(page)).toBeVisible();
  expect(external).toEqual([]);
});

test("on a phone the Fix button stays inside the blocked note", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto("/?example=covid-raw");
  const button = page.locator("#stage-note .btn.primary");
  await expect(button).toBeVisible();
  const [note, box] = await Promise.all([page.locator(".sheet-wrap").boundingBox(), button.boundingBox()]);
  expect(box.y + box.height).toBeLessThanOrEqual(note.y + note.height + 0.5);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
});

test("a single problem is written in the singular", async ({ page }) => {
  await page.goto("/?example=life-expectancy");
  await expect(svg(page)).toBeVisible();
  await page.fill("#source", "");
  await expect(page.locator("#stage-note")).toContainText("1 problem stops this map.");
  await page.selectOption("#ui-lang", "fr");
  await expect(page.locator("#stage-note")).toContainText("1 problème empêche");
});

test("a finding with no mechanical repair leads to its field, and Fix puts focus on the map", async ({ page }) => {
  await page.goto("/");
  const csv = ["country,rate", "France,12", "Japan,8", "Brazil,5", "Kenya,4"].join("\n");
  await page.locator("#file").setInputFiles({ name: "rates.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.fill("#title", "Rates");
  await expect(page.locator("#stage-note")).toContainText("source-required");
  await page.locator("#stage-note .goto").first().click();
  await expect(page.locator("#source")).toBeFocused();
  await page.fill("#source", "Made up");
  await expect(svg(page)).toBeVisible();

  await page.goto("/?example=covid-raw");
  await page.locator("#stage-note .btn.primary").click();
  await expect(svg(page)).toBeVisible();
  await expect(page.locator("#sheet")).toBeFocused();
});

test("the map is one tab stop and the arrow keys move between areas", async ({ page }) => {
  await page.goto("/?example=europe-gdp-per-capita");
  await expect(svg(page)).toBeVisible();
  await expect(page.locator('#sheet [data-id][tabindex="0"]')).toHaveCount(1);
  const first = page.locator('#sheet [data-id][tabindex="0"]');
  await first.focus();
  const before = await first.getAttribute("data-id");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#tip")).toBeVisible();
  const after = await page.evaluate(() => document.activeElement.getAttribute("data-id"));
  expect(after).not.toBe(before);
  await expect(page.locator('#sheet [data-id][tabindex="0"]')).toHaveCount(1);
});

for (const theme of ["light", "dark"]) {
  test(`the playground has no serious accessibility violations in the ${theme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto("/?example=life-expectancy");
    await expect(svg(page)).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const { violations } = await new AxeBuilder({ page }).disableRules(["svg-img-alt"]).analyze();
    const serious = violations.filter((v) => ["serious", "critical"].includes(v.impact));
    expect(
      serious.map(
        (v) =>
          `${v.id}: ${v.nodes
            .map((n) => n.target.join(" "))
            .slice(0, 3)
            .join(" | ")}`,
      ),
    ).toEqual([]);
  });
}

test("a file that is not UTF-8 can be read again with the encoding it has", async ({ page }) => {
  await page.goto("/");
  await page.locator("#file").setInputFiles("tests/fixtures/tw-counties-big5.csv");
  await expect(page.locator("#field-encoding")).toBeVisible();
  await expect(page.locator("#data-status")).toContainText("not UTF-8");
  await expect(page.locator("#encoding")).toHaveValue("windows-1252");
  await page.selectOption("#encoding", "big5");
  await expect(page.locator("#region")).toHaveValue("tw-counties");
  await expect(page.locator("#join-summary")).toContainText("6 of 6 rows matched 6 areas");
  await expect(page.locator("#data-status")).not.toContainText("not UTF-8");
  await page.locator("#file").setInputFiles("tests/fixtures/countries-latin1.csv");
  await expect(page.locator("#join-summary")).toContainText("5 of 5 rows matched 5 areas");
  await page.getByRole("button", { name: "Life expectancy" }).click();
  await expect(page.locator("#field-encoding")).toBeHidden();
});

test("a slow region lookup for an uploaded table cannot change an example loaded after it", async ({ page }) => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  await page.route("**/data/us-states.json", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/?example=life-expectancy");
  await expect(svg(page)).toBeVisible();
  const csv = ["state,score", "California,5", "Texas,4", "New York,3"].join("\n");
  await page.locator("#file").setInputFiles({ name: "states.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Europe GDP" }).click();
  await expect(svg(page)).toBeVisible();
  release();
  await page.waitForTimeout(1500);
  await expect(page.locator("#region")).toHaveValue("europe");
  await expect(page.locator("#value")).toHaveValue("gdp_per_person");
});

test("Fix leaves focus on the remaining error while the map is still blocked", async ({ page }) => {
  await page.goto("/?example=covid-raw");
  await page.fill("#source", "");
  await expect(page.locator("#stage-note")).toContainText("source-required");
  await page.locator("#stage-note .btn.primary").click();
  await expect(page.locator("#stage-note")).toContainText("source-required");
  await expect(page.locator("#sheet")).not.toBeFocused();
  await expect(page.locator("#stage-note button").first()).toBeFocused();
});

test("with small multiples a value error still leads to a visible field", async ({ page }) => {
  await page.goto("/");
  const csv = [
    "country,description,rate",
    "France,high,5.1",
    "Japan,low,6.2",
    "Brazil,medium,7.3",
    "Kenya,low,2.2",
  ].join("\n");
  await page.locator("#file").setInputFiles({ name: "d.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.locator('#type [value="small-multiples"], #type button:has-text("Small multiples")').first().click();
  await page.locator('#values input[value="rate"]').uncheck();
  await page.locator('#values input[value="description"]').check();
  await expect(page.locator("#findings")).toContainText("value-not-numeric");
  const go = page.locator("#findings .finding:has-text('value-not-numeric') .goto");
  await expect(go).toBeVisible();
  await go.click();
  await expect(page.locator(`#values input[value="description"]`)).toBeFocused();
});

test("on a phone the blocked list is one column and the form controls keep their padding", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto("/?example=covid-raw");
  const columns = await page
    .locator(".stage-errors li")
    .first()
    .evaluate((li) => getComputedStyle(li).gridTemplateColumns.split(" ").length);
  expect(columns).toBe(1);
  const padding = await page.locator("#stage-note").evaluate((n) => getComputedStyle(n).paddingLeft);
  expect(padding).toBe("16px");
});

test("a GeoJSON file becomes a region of its own, before or after the table", async ({ page }) => {
  await page.goto("/");
  await page.locator("#file").setInputFiles("tests/fixtures/squares.geojson");
  await expect(page.locator("#data-status")).toContainText("4 areas read from squares.geojson");
  await expect(page.locator("#region")).toHaveValue("custom");
  await page.locator("#file").setInputFiles("tests/fixtures/squares.csv");
  await expect(page.locator("#region")).toHaveValue("custom");
  await expect(page.locator("#join-summary")).toContainText("4 of 4 rows matched 4 areas");
  await page.fill("#title", "Squares");
  await page.fill("#source", "Made up");
  await page.selectOption("#kind", "rate");
  await page.fill("#unit", "Score");
  await expect(svg(page)).toBeVisible();
  await expect(svg(page)).toContainText("North West");
  await page.selectOption("#region", "world");
  await expect(page.locator("#region")).toHaveValue("world");
  await expect(page.locator("#stage-note")).toContainText("names the areas");
  await page.selectOption("#region", "custom");
  await expect(page.locator("#region")).toHaveValue("custom");
  await expect(page.locator("#join-summary")).toContainText("4 of 4 rows matched 4 areas");
  await expect(svg(page)).toBeVisible();

  await page.goto("/");
  await page.locator("#file").setInputFiles("tests/fixtures/squares.csv");
  await expect(page.locator("#data-status")).toContainText("rows");
  await page.locator("#file").setInputFiles("tests/fixtures/squares.geojson");
  await expect(page.locator("#region")).toHaveValue("custom");
  await expect(page.locator("#join-summary")).toContainText("4 of 4 rows matched 4 areas");
  await expect(page.locator("#value")).toHaveValue("score");
});

test("a boundary file in metres is refused with the fix", async ({ page }) => {
  await page.goto("/");
  await page.locator("#file").setInputFiles("tests/fixtures/utm.geojson");
  await expect(page.locator("#data-status")).toContainText("not longitude and latitude");
  await expect(page.locator("#data-status")).toHaveClass(/error/);
});

test("the region picker changes the map and the choice stays", async ({ page }) => {
  await page.goto("/?example=life-expectancy");
  await expect(svg(page)).toBeVisible();
  await expect(page.locator('#sheet [data-id="USA"]')).toHaveCount(1);
  await page.selectOption("#region", "europe");
  await expect(page.locator('#sheet [data-id="USA"]')).toHaveCount(0);
  await expect(page.locator('#sheet [data-id="FRA"]')).toHaveCount(1);
  await page.fill("#title", "Europe only");
  await expect(svg(page)).toContainText("Europe only");
  await expect(page.locator("#region")).toHaveValue("europe");
  await page.selectOption("#region", "world");
  await expect(page.locator('#sheet [data-id="USA"]')).toHaveCount(1);
});

test("boundaries added after a file that is not UTF-8 keep the encoding picker", async ({ page }) => {
  await page.goto("/");
  await page.locator("#file").setInputFiles("tests/fixtures/tw-counties-big5.csv");
  await expect(page.locator("#field-encoding")).toBeVisible();
  await page.locator("#file").setInputFiles("tests/fixtures/squares.geojson");
  await expect(page.locator("#region")).toHaveValue("custom");
  await expect(page.locator("#field-encoding")).toBeVisible();
  await page.selectOption("#encoding", "big5");
  await expect(page.locator("#region")).toHaveValue("custom");
  await expect(page.locator("#data-status")).not.toContainText("not UTF-8");
});
