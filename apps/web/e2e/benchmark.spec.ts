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
  // nothing is out of range on the featured night except notes
  await expect(sheet.locator('[data-testid="bench-check"][data-status="off"]')).toHaveCount(0);
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
    await route.continue({ postData: JSON.stringify({ ...body, vocalBias: 1, seed: 7 }) });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: /Compose the night/ })
    .first()
    .click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  let sheet = await openBenchmark(page);
  const instr = sheet.locator('[data-key="instrumental"]');
  const before = await instr.textContent();
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
  await expect(sheet.locator('[data-key="instrumental"]')).not.toHaveText(before ?? "");
  // Undo on a fresh run leaves the set as it is
  await page.getByTestId("improve-run").click();
  await expect(page.getByTestId("improve-summary")).toBeVisible({ timeout: 60000 });
  await page.getByTestId("improve-undo").click();
  await expect(page.getByTestId("improve-run")).toBeVisible();
});
