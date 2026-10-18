import { devices, expect, test } from "@playwright/test";

test("compose a 4h golden set on desktop and export sheet opens", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Compose a milonga");
  await page.getByRole("button", { name: /Compose the night/ }).click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await expect(page.locator("article[id^=tanda-]")).toHaveCount(
    await page.locator("article[id^=tanda-]").count(),
  );
  expect(await page.locator("article[id^=tanda-]").count()).toBeGreaterThan(14);
  await page
    .getByRole("button", { name: /Export/ })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: /Rekordbox XML/ })).toBeVisible();
});

test.describe("mobile", () => {
  test.use({ ...devices["iPhone 15 Pro"] });
  test("tab bar visible, no horizontal overflow, compose works", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Primary mobile" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
    await page.getByRole("button", { name: /Compose the night/ }).click();
    await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  });
});

test("API: compose respects hours and era", async ({ request }) => {
  const r = await request.post("/api/compose", { data: { hours: 2, eras: ["golden"], seed: 1 } });
  const p = await r.json();
  expect(Math.abs(p.stats.durationSec - 7200)).toBeLessThan(400);
  for (const t of p.tandas)
    for (const s of t.songs) {
      expect(s.year).toBeGreaterThanOrEqual(1935);
      expect(s.year).toBeLessThanOrEqual(1955);
    }
});
