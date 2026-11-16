/**
 * Wave 2 — the T-DJ test users' Compose, History, AI and Swap findings: the result in the DJ's words (no engine
 * notes, scores of the benchmark, tanda codes or ids), no console errors on Compose (the chart's rects), one Compose
 * button at a time, Swap tanda as a choice, and History keeping one entry per night with its edits as versions.
 */
import { expect, type Page, test } from "@playwright/test";

const FORBIDDEN = [/fell back/i, /\bengine\b/i, /benchmark/i, /take their chairs/i, /no swap keeps/i];
/** a catalogue id (10 hex), an orchestra id with a dash and a year, a tanda code "T16" */
const IDS = [/\b[0-9a-f]{10}\b/, /\b[a-z]+-[a-z]+-\d{4}[a-z]?\b/, /\bT\d{1,2}\b/];

async function composeNow(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: /Compose the night/ })
    .first()
    .click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
  await page.waitForTimeout(1500);
}

test("the Compose result speaks the DJ's language and logs no console errors", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await composeNow(page);
  // the featured night carries the DJ's own notes (one of them used to read "now play in T16 … take their chairs")
  for (const open of [false, true]) {
    if (open) {
      await page.goto("/?featured=golden-double-peak");
      await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
      await page.waitForTimeout(1500);
    }
    const text = await page.locator("#result").innerText();
    for (const re of [...FORBIDDEN, ...IDS]) expect(text, `${re} in the result`).not.toMatch(re);
  }
  expect(errors.filter((e) => !/favicon|net::ERR|Failed to load resource/i.test(e))).toEqual([]);
});

test("one Compose button at a time on the empty page", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto("/");
  await expect(page.getByTestId("first-run")).toBeVisible();
  await page.waitForTimeout(800);
  const visibleComposes = () =>
    page
      .locator('[data-testid="hero-compose"], [data-testid="form-compose"], [data-testid="toolbar-compose"]')
      .evaluateAll(
        (els) =>
          els.filter((e) => {
            const r = e.getBoundingClientRect();
            return (
              r.width > 0 &&
              r.bottom > 0 &&
              r.top < innerHeight &&
              getComputedStyle(e).visibility !== "hidden"
            );
          }).length,
      );
  expect(await visibleComposes()).toBe(1);
  await page.evaluate(() => window.scrollTo(0, 100_000));
  await page.waitForTimeout(500);
  expect(await visibleComposes()).toBe(1);
  await expect(page.getByTestId("form-compose")).toBeInViewport();
});

test("Swap tanda offers choices nearest the plan; the energy chart has one path pair and no BPM twice", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await composeNow(page);
  const card = page.locator("article[id^=tanda-]").nth(1);
  await card.getByRole("button", { name: "Tanda 2 actions" }).click();
  await page.getByRole("menuitem", { name: /Swap tanda/ }).click();
  // 2026-11: the choices are suggested whole tandas in the tanda Swap sheet: one loads, Apply puts it in
  const sheet = page.getByTestId("tanda-swap-sheet");
  const rows = sheet.getByTestId("tanda-swap-option");
  await expect(rows.first()).toBeVisible({ timeout: 60000 });
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThanOrEqual(3);
  const before = await card.locator("h3").innerText();
  const label = await rows.first().innerText();
  await rows.first().click();
  await expect(card.locator("h3")).toHaveText(before);
  await sheet.getByTestId("tanda-swap-apply").click();
  await expect(card.locator("h3")).not.toHaveText(before, { timeout: 15000 });

  expect(label).toContain((await card.locator("h3").innerText()).trim());
  // Undo from the toast puts it back
  await page.getByTestId("toast").getByRole("button", { name: /Undo/ }).click();
  await expect(card.locator("h3")).toHaveText(before, { timeout: 15000 });
  // the line and its fill: one path each
  await expect(page.locator('#result [data-testid="energy-path"]')).toHaveCount(1);
  await expect(page.locator('#result [data-testid="energy-area"]')).toHaveCount(1);
  // a key chip shows the key only (the BPM is printed once, elsewhere on the row)
  for (const chip of await page.locator('#result [data-testid="key-chip"]').all())
    expect(await chip.innerText()).not.toMatch(/\b\d{2,3}\b/);
});

test("History: a compose is one entry; a chip and AI edits are its versions; one entry is Current", async ({
  page,
}) => {
  test.setTimeout(360_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await composeNow(page);
  // a chip (recomposes the night)
  await page.getByRole("button", { name: "Calmer", exact: true }).first().click();
  await expect(page.getByTestId("compose-status")).toHaveText(/Set ready/, { timeout: 120000 });
  await page.waitForTimeout(1000);
  // an AI edit (the plain-words reader)
  await page.locator("#ai-edit-input").fill("lock tanda 2");
  await page.locator("#ai-edit-input").press("Enter");
  await expect(page.getByTestId("ai-edit-diff")).toContainText("Tanda 2", { timeout: 60000 });
  await page.getByTestId("ai-edit-done").click();
  // a whole-night request is its chip
  await page.locator("#ai-edit-input").fill("more vals please");
  await page.locator("#ai-edit-input").press("Enter");
  await expect(page.getByTestId("ai-edit-chip")).toContainText("more vals", { timeout: 60000 });
  await expect(page.getByTestId("compose-status")).toHaveText(/Composing/, { timeout: 30000 });
  await expect(page.getByTestId("compose-status")).toHaveText(/Set ready/, { timeout: 120000 });
  await page.waitForTimeout(1000);
  await page.goto("/history");
  const rows = page.locator('[id^="history-"]');
  await expect(rows).toHaveCount(1, { timeout: 15000 });
  await expect(page.getByText("Current", { exact: true })).toHaveCount(1);
  await expect(rows.first()).not.toContainText(/· (swap|refine)\b/);
  await expect(rows.first()).toContainText(/4 versions/);
  await rows.first().click();
  const versions = page.getByTestId("history-version");
  await expect(versions).toHaveCount(4);
  await expect(versions.first()).toContainText("More vals");
  await expect(versions.last()).toContainText("Composed");
  await expect(page.getByTestId("history-versions")).toContainText("Calmer");
  // restore the first version: it becomes current, the night on screen
  await versions
    .last()
    .getByRole("button", { name: /Restore/ })
    .click();
  await expect(versions).toHaveCount(5);
  await expect(versions.first()).toContainText("Back to “Composed”");
});

test("returning to Compose with a set: no frame over 200 ms (the set mounts in a second pass)", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await composeNow(page);
  const nav = page.getByTestId("sidebar");
  await nav.getByRole("link", { name: "History" }).click();
  await expect(page).toHaveURL(/\/history/, { timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const w = window as unknown as { __long: number[] };
    w.__long = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) w.__long.push(Math.round(e.duration));
    }).observe({ type: "longtask" });
  });
  await nav.getByRole("link", { name: "Compose" }).click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(2000);
  const long = await page.evaluate(() => (window as unknown as { __long: number[] }).__long);
  expect(Math.max(0, ...long), `long tasks on return: ${long.join(", ")}`).toBeLessThan(200);
});
