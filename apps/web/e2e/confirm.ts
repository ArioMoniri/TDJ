/**
 * 2026-11: the Booth's light confirmation (lib/booth/confirm.ts). Mid-night a transport button that changes the
 * room's song is press-and-hold (0.6 s); a sheet, panel or card action is tap-to-arm (a second tap confirms).
 */
import { expect, type Locator, type Page } from "@playwright/test";

/** press and hold a transport button past its 0.6 s ring */
export async function hold(page: Page, loc: Locator, ms = 800) {
  await loc.scrollIntoViewIfNeeded();
  const b = (await loc.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

/** tap-to-arm: the first tap arms (the button says so), the second confirms */
export async function armAndConfirm(loc: Locator) {
  await loc.click();
  await expect(loc).toHaveAttribute("data-armed", "true");
  await loc.click();
}

/**
 * 2026-11 (the phone's bar redesign): a phone keeps Set list and Controls in ••• — tap the control where it shows,
 * else open ••• and tap its row (the row has the control's test id)
 */
export async function boothAction(page: Page, id: "booth-set-open" | "booth-controls-toggle") {
  const direct = page.getByTestId("booth-strip").getByTestId(id);
  if (await direct.isVisible().catch(() => false)) return direct.click();
  await page.getByTestId("booth-more").click();
  await page.getByTestId("booth-menu").getByTestId(id).click();
}
