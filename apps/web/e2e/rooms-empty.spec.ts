/**
 * 2026-11 (the owner: rooms — "Empty night, build it together"): a room starts empty from the night picker's first
 * option, opens in the room's night editor with Add a tanda / Compose / Build by hand / Import; two tandas added and a
 * cortina is there between them (mended like Compose); the owner's Night settings change the cortina length and the
 * other DJ sees it (a guest reads the settings, never edits them).
 */
import { type Browser, expect, type Page, test } from "@playwright/test";

test.describe.configure({ timeout: 300_000 });

async function twoDjs(browser: Browser) {
  const a = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const b = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  return { a, b, ana: await a.newPage(), ben: await b.newPage() };
}
async function ready(page: Page, sel: string) {
  await expect
    .poll(() =>
      page
        .locator(sel)
        .evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps")))
        .catch(() => false),
    )
    .toBe(true);
}
const tandaRows = (page: Page) => page.locator('[data-testid^="room-tanda-"][data-reorder-row]');
/** the Insert sheet's first whole tanda (the rule check may ask: "Do it as I said") */
async function takeFirstTanda(page: Page) {
  const sheet = page.getByTestId("insert-sheet");
  await expect(sheet).toBeVisible();
  const opt = sheet.getByTestId("insert-suggestion").first();
  await expect(opt).toBeVisible({ timeout: 90_000 });
  await opt.click();
  const asked = page.getByTestId("rule-sheet");
  await expect(async () => {
    if (await asked.isVisible().catch(() => false)) await page.getByTestId("rule-as-said").click();
    await expect(sheet).toBeHidden({ timeout: 1500 });
  }).toPass({ timeout: 30_000 });
  const guide = page.getByTestId("edit-guide-close");
  if (await guide.isVisible().catch(() => false)) await guide.click();
}

test("an empty room: built together, its cortinas come by themselves, the owner's cortina length reaches the other DJ", async ({
  browser,
  baseURL,
}) => {
  const { a, b, ana, ben } = await twoDjs(browser);
  await ana.goto("/rooms");
  await ready(ana, "#room-create");
  await ana.getByTestId("room-user").fill("Ana");
  await ana.getByTestId("room-name").fill("Built together");
  // the picker's first choice: an empty night
  await ana.getByTestId("room-choose-night").click();
  const picker = ana.getByTestId("night-picker");
  const empty = picker.getByTestId("night-choice-empty");
  await expect(empty).toContainText("Empty night — build it together");
  const first = await picker.locator('[data-testid^="night-choice"]').first().getAttribute("data-testid");
  expect(first).toBe("night-choice-empty");
  await empty.click();
  await picker.locator("#night-picker-use").click();
  await expect(picker).toBeHidden();
  await expect(ana.getByTestId("room-choose-night")).toContainText("Start empty");
  await ana.locator("#room-create").click();

  // the room's night editor, empty, with the ways to fill it
  const editor = ana.getByTestId("night-editor-empty");
  await expect(editor).toBeVisible({ timeout: 30_000 });
  for (const id of [
    "night-editor-add-tanda",
    "night-editor-compose",
    "night-editor-build",
    "night-editor-import",
  ])
    await expect(editor.getByTestId(id)).toBeVisible();
  await ana.getByRole("button", { name: "Invite" }).first().click();
  const code = (await ana.getByTestId("room-code").innerText()).replace(/\s+/g, "");
  await ana.keyboard.press("Escape");

  // Add a tanda → the first chair; then another after it → a cortina between them
  await editor.getByTestId("night-editor-add-tanda").click();
  await takeFirstTanda(ana);
  await expect(tandaRows(ana)).toHaveCount(1, { timeout: 30_000 });
  await ana.getByTestId("room-tanda-1").getByRole("button", { name: "Tanda 1 actions" }).click();
  await ana.getByRole("menuitem", { name: "Insert tanda after" }).click();
  await takeFirstTanda(ana);
  await expect(tandaRows(ana)).toHaveCount(2, { timeout: 30_000 });
  await expect(ana.getByTestId("room-tanda-1").getByTestId("cortina-row")).toBeVisible({ timeout: 30_000 });
  // each cortina row can be changed
  await expect(ana.getByTestId("room-tanda-1").getByTestId("cortina-change")).toBeVisible();

  // Ben joins and sees the two tandas and the cortina
  await ben.goto(`${baseURL}/rooms?join=${code}`);
  await ready(ben, '[data-testid="room-join"]');
  await ben.getByTestId("room-user").fill("Ben");
  await ben.getByTestId("room-join").click();
  await expect(tandaRows(ben)).toHaveCount(2, { timeout: 30_000 });
  await expect(ben.getByTestId("room-tanda-1").getByTestId("cortina-row")).toBeVisible();

  // the owner's Night settings: the cortina length → 30 s, for every cortina; Ben sees it, and reads only
  await ana.getByTestId("room-open-settings").click();
  const settings = ana.getByTestId("room-night-settings");
  await expect(settings).toBeVisible();
  await settings.getByLabel("Length", { exact: true }).selectOption("30");
  await expect(ana.getByTestId("toast")).toContainText("Length: 30 s", { timeout: 20_000 });
  await ana.keyboard.press("Escape");
  await expect(ana.getByTestId("room-tanda-1").getByTestId("cortina-len")).toHaveText("0:30");
  await expect(ben.getByTestId("room-tanda-1").getByTestId("cortina-len")).toHaveText("0:30", {
    timeout: 30_000,
  });
  await ben.getByTestId("room-open-settings").click();
  const bens = ben.getByTestId("room-night-settings");
  await expect(bens.getByTestId("room-settings-readonly")).toBeVisible();
  await expect(bens.getByLabel("Length", { exact: true })).toBeDisabled();
  await expect(bens.getByLabel("Length", { exact: true })).toHaveValue("30");
  await ben.keyboard.press("Escape");
  // the owner's change is one undo step
  await ana.locator("body").click({ position: { x: 5, y: 5 } });
  await ana.keyboard.press("ControlOrMeta+z");
  await expect(ana.getByTestId("room-tanda-1").getByTestId("cortina-len")).not.toHaveText("0:30", {
    timeout: 20_000,
  });
  await a.close();
  await b.close();
});
