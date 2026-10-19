/** Mobile smoke test in its own file: Playwright 1.64 rejects `test.use({ ...devices })` inside a describe block. */
import { devices, expect, test } from "@playwright/test";

test("mobile: tab bar visible, no horizontal overflow, compose works", async ({ browser }) => {
  const ctx = await browser.newContext({
    ...devices["iPhone 15 Pro"],
    baseURL: process.env.TDJ_URL ?? "http://localhost:3000",
  });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Primary mobile" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
  await page.getByRole("button", { name: /Compose the night/ }).click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await ctx.close();
});
