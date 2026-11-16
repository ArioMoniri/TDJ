import { expect, type Locator } from "@playwright/test";

/**
 * 2026-11 — a server-rendered button is on screen (and Playwright "clicks" it) before React has attached its
 * handlers: a click then is lost, the sheet never opens. Wait until React owns the element (its props key is on the
 * node), then act. Used by the Settings flows (add a source, add an agent), whose page hydrates after first paint.
 */
export async function hydrated(loc: Locator, timeout = 30_000) {
  await expect(loc).toBeVisible({ timeout });
  await expect
    .poll(() => loc.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps"))), { timeout })
    .toBe(true);
  return loc;
}

/** click once React owns the element */
export async function clickHydrated(loc: Locator, timeout = 30_000) {
  await (await hydrated(loc, timeout)).click();
}
