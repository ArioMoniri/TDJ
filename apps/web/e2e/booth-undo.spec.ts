/**
 * 2026-11 (the owner: "all actions like Next at gap … should have a Cmd+Z / Ctrl+Z-like shortcut, settable"):
 * - Skip next, Cortina early and the night's plan edits in the Booth undo / redo with ⌘Z / Ctrl+Z, each undo saying
 *   "Undid: Skip next (…)" with Redo; Next now mid-night says why it cannot be undone
 * - Settings → Keyboard lists every shortcut, records a new one, warns of a conflict, resets; the Booth follows the
 *   new key and its shortcut sheet shows it
 */
import { expect, type Page, test } from "@playwright/test";
import { clickHydrated } from "./hydration";

function wav(sec = 20): Buffer {
  const rate = 22050;
  const n = rate * sec;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++)
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 0.3 * 32767), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
const WAV = wav();

async function openBooth(page: Page) {
  await page.route(/dzcdn\.net|p\.scdn\.co|preview\.test|\/api\/preview\?/, (route) =>
    route.request().url().includes("json=1")
      ? route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ url: "https://preview.test/clip.wav" }),
        })
      : route.fulfill({
          status: 200,
          contentType: "audio/wav",
          body: WAV,
          headers: { "access-control-allow-origin": "*" },
        }),
  );
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/);
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("booth-ttc")).not.toHaveAttribute("data-resolving", "1", { timeout: 30000 });
}
const booth = (page: Page) =>
  page.evaluate(() => {
    const s = (
      window as unknown as {
        __tdjBooth: { getState(): { skipped: number[]; planIndex: number; holdBefore: number | null } };
      }
    ).__tdjBooth.getState();
    return { skipped: s.skipped, planIndex: s.planIndex };
  });
/** the items left out beyond those the night already passes over (no clip for them in this test) */
let base: number[] = [];
const added = async (page: Page) => (await booth(page)).skipped.filter((i) => !base.includes(i));
const toast = (page: Page) =>
  page
    .getByRole("status")
    .filter({ hasText: /Undid|Redone|Can't undo/ })
    .last();

test.use({ viewport: { width: 1440, height: 900 } });

test("Booth: Skip next and Cortina early undo with ⌘Z and redo; Next now says it already played", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await openBooth(page);
  await page.getByTestId("booth-start").click();
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing", { timeout: 20000 });
  // n: Skip next (the default key)
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  base = (await booth(page)).skipped;
  await page.keyboard.press("n");
  await expect.poll(() => added(page)).toHaveLength(1);
  await page.waitForTimeout(300);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => added(page)).toEqual([]);
  await expect(toast(page)).toContainText("Undid: Skip next (");
  // the toast's Redo
  await toast(page).getByRole("button", { name: "Redo" }).click();
  await expect.poll(() => added(page)).toHaveLength(1);
  await page.waitForTimeout(300);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => added(page)).toEqual([]);
  // c: Cortina early — the rest of the tanda is left out; undo brings it back
  await page.keyboard.press("c");
  await expect.poll(async () => (await added(page)).length).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => added(page)).toEqual([]);
  await expect(toast(page)).toContainText("Undid: Cortina early");
  // Next now mid-night: heard in the room, the undo says why
  const at = (await booth(page)).planIndex;
  await page.evaluate(() =>
    (window as unknown as { __tdjBooth: { getState(): { nextNow(): Promise<void> } } }).__tdjBooth
      .getState()
      .nextNow(),
  );
  await expect.poll(async () => (await booth(page)).planIndex).toBeGreaterThan(at);
  const moved = (await booth(page)).planIndex;
  await page.waitForTimeout(300);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(toast(page)).toContainText("already played in the room");
  expect((await booth(page)).planIndex).toBe(moved);
});

test("Settings → Keyboard: rebind Skip next, a conflict is named, the Booth and its sheet follow; reset", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.goto("/settings#settings-keyboard");
  const row = page.getByTestId("key-row-booth.skipNext");
  await clickHydrated(row);
  const sheet = page.getByTestId("key-sheet");
  await expect(sheet).toBeVisible();
  // a key another action holds is named first
  await sheet.getByTestId("key-recorder").focus();
  await page.keyboard.press("f");
  await expect(sheet.getByTestId("key-conflict")).toContainText("Fade out now");
  // a free one saves
  await page.keyboard.press("j");
  await expect(sheet.getByTestId("key-recorded")).toHaveText("j");
  await expect(sheet.getByTestId("key-conflict")).toHaveCount(0);
  await sheet.locator("#key-save").click();
  await expect(sheet).toBeHidden();
  await expect(row.getByTestId("key-binding")).toHaveText("j");
  // kept on this device
  expect(await page.evaluate(() => localStorage.getItem("tdj-keymap"))).toContain('"booth.skipNext":["j"]');
  // the Booth answers j, not n, and its shortcut sheet shows j
  await openBooth(page);
  await page.getByTestId("booth-start").click();
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing", { timeout: 20000 });
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  base = (await booth(page)).skipped;
  await page.keyboard.press("n");
  await page.waitForTimeout(300);
  expect(await added(page)).toEqual([]);
  await page.keyboard.press("j");
  await expect.poll(() => added(page)).toHaveLength(1);
  await page.keyboard.press("?");
  await expect(page.getByTestId("shortcut-booth.skipNext")).toContainText("j");
  await page.keyboard.press("Escape");
  // reset all
  await page.goto("/settings#settings-keyboard");
  await clickHydrated(page.locator("#keys-reset-all"));
  await expect(page.getByTestId("key-row-booth.skipNext").getByTestId("key-binding")).toHaveText("n");
});

test("Booth: Enter on a focused set-list row plays it now (mid-night: Enter again confirms); ⇧Enter plays it next", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await openBooth(page);
  await page.getByTestId("booth-start").click();
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing", { timeout: 20000 });
  const at = (await booth(page)).planIndex;
  const target = page.locator(`[data-plan-index="${at + 3}"]`).first();
  await target.locator("button").first().focus();
  await page.keyboard.press("Enter");
  // armed, not yet played
  await page.waitForTimeout(300);
  expect((await booth(page)).planIndex).toBe(at);
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await booth(page)).planIndex, { timeout: 15000 }).toBe(at + 3);
  // ⇧Enter on another row: it plays next
  const later = page.locator(`[data-plan-index="${at + 8}"]`).first();
  await later.locator("button").first().focus();
  await page.keyboard.press("Shift+Enter");
  await expect(page.getByRole("status").filter({ hasText: "plays next" }).last()).toBeVisible();
});
