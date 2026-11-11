/**
 * Round 12: the benchmark against published DJ sets (docs/specs/round12-benchmark.md). The featured night opens the
 * sheet with every check, its reference range and source; a vocal-heavy night is improved automatically, kept, and
 * the result card reads the kept night.
 */
import { expect, type Page, test } from "@playwright/test";

async function openBenchmark(page: Page) {
  const row = page.getByTestId("benchmark-row");
  await expect(row).toContainText(/\d+\/\d+/);
  await expect(row).toHaveAttribute("aria-label", /\d+\/\d+ in range/);
  await row.click();
  const sheet = page.getByTestId("benchmark-sheet");
  await expect(sheet).toBeVisible();
  return sheet;
}

test("the featured night: the benchmark row opens every check with its range and source", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  const sheet = await openBenchmark(page);
  const checks = sheet.getByTestId("bench-check");
  expect(await checks.count()).toBeGreaterThanOrEqual(13);
  await expect(sheet.locator('[data-key="pugliese"]')).toContainText("Reference:");
  await expect(sheet.locator('[data-key="instrumental"]')).toContainText("Victor Tran");
  await expect(sheet.locator('[data-key="cumparsita"]')).toHaveAttribute("data-status", "ok");
  // nothing is out of range on the featured night except notes; round 13: the round-11 featured night predates the
  // year-spread / golden-core / transitions / heatmap checks (the main session regenerates it), so those may read off
  await expect(
    sheet.locator(
      // round 14: and the strict panel, which finds the shipped night's 1946 sides and colour at a peak (round14.test.ts)
      '[data-testid="bench-check"][data-status="off"]:not([data-key="yearSpread"]):not([data-key="goldenCore"]):not([data-key="transitions"]):not([data-key="heatmapBest"]):not([data-key="strictPanel"])',
    ),
  ).toHaveCount(0);
  expect(await checks.count()).toBeGreaterThanOrEqual(17);
  // round 14: the strict panel lists its rules, each with its source review
  const rules = sheet.getByTestId("strict-rule");
  expect(await rules.count()).toBeGreaterThanOrEqual(20);
  await expect(sheet.locator('[data-testid="strict-rule"][data-key="range"]')).toContainText(
    "round14-dancer.md",
  );
  const run = page.getByTestId("improve-run");
  await expect(run).toHaveText(/Improve automatically/);
  const box = await run.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("a vocal-heavy night: Improve automatically, Keep, and the result card updates", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  // the composed night leans on singers (vocalBias 1, fixed seed): the instrumental hours fall short
  await page.route("**/api/compose", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}");
    // round 13: auto-improve is off for this request, so the sheet's own Improve automatically has work to do
    await route.continue({
      // (round 14: seed 8 — with the strict panel's acceptance rule seed 7 leaves the sheet nothing to change;
      // round 15: seed 14, the round-15 composer leaves seed 8 nothing to change)
      postData: JSON.stringify({ ...body, vocalBias: 1, seed: 14, autoImprove: false }),
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /Compose the night/ })
    .first()
    .click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  let sheet = await openBenchmark(page);
  // round 14: the improve run may mend the strict panel or other checks rather than the instrumental row; the kept
  // night shows in the sheet's values as a whole
  const allChecks = async () =>
    (await page.getByTestId("benchmark-sheet").getByTestId("bench-check").allTextContents()).join("|");
  const before = await allChecks();
  await page.getByTestId("improve-run").click();
  await expect(page.getByTestId("improve-summary")).toHaveText(
    /Engine \d+ → \d+ · Benchmark \d+\/\d+ → \d+\/\d+/,
    { timeout: 60000 },
  );
  const changes = page.getByTestId("improve-change");
  expect(await changes.count()).toBeGreaterThan(0);
  await expect(changes.first()).toContainText(/Tanda \d+|Cue into tanda/);
  const keep = page.getByTestId("improve-keep");
  expect((await keep.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await keep.click();
  await expect(page.getByTestId("benchmark-sheet")).toBeHidden();
  await expect(page.getByText("Improved set kept")).toBeVisible();
  // the store holds the kept night: the benchmark (computed from the result card's set) reads it
  sheet = await openBenchmark(page);
  await expect(sheet.getByTestId("bench-check").first()).toBeVisible();
  expect(await allChecks()).not.toBe(before);
  // Undo on a fresh run leaves the set as it is
  await page.getByTestId("improve-run").click();
  await expect(page.getByTestId("improve-summary")).toBeVisible({ timeout: 60000 });
  await page.getByTestId("improve-undo").click();
  await expect(page.getByTestId("improve-run")).toBeVisible();
});
