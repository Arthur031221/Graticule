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
  await page.locator('.finding:has-text("source-required") button').click();
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
