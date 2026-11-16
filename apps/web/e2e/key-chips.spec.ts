/**
 * 2026-11 (the owner: "change keys everywhere should work as clicking on the key that is shown … then pressing the
 * keys that replace it, and also from Settings"): every key chip records (components/KeyChips.tsx), on a desktop and
 * an iPad (Chromium with the iPad's viewport, touch and user agent):
 * - the Booth's Keyboard sheet: Pause's Space chip → "Press keys…" → k; Esc on a conflict cancels it and leaves the
 *   sheet open; Replace takes a key from another action; a key the browser keeps (Ctrl+R) is refused with its reason;
 * - Settings (another tab, the same store) shows k at once; Reset to default there brings Space back in the Booth;
 * - k pauses the Booth;
 * - Reset all keys;
 * - the sheet's Cancel wears no focus ring when it opens (it opens on its title).
 */
import { type BrowserContextOptions, devices, expect, type Page, test } from "@playwright/test";

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

const IPAD_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const { defaultBrowserType: _b, ...ipadPro } = devices["iPad Pro 11 landscape"]!;
const VIEWS: Array<[string, BrowserContextOptions]> = [
  ["desktop", { viewport: { width: 1440, height: 900 } }],
  [
    "ipad",
    { ...ipadPro, viewport: { width: 1180, height: 820 }, userAgent: IPAD_SAFARI, deviceScaleFactor: 1 },
  ],
];

const PAUSE = "Pause / resume (a short fade)";

for (const [name, view] of VIEWS) {
  test.describe(name, () => {
    test.use(view);

    test(`${name}: tap Pause's key in the Booth sheet, press k; Settings shows k; k pauses; conflict, reserved, reset`, async ({
      page,
      context,
    }) => {
      test.setTimeout(240_000);
      await openBooth(page);
      await page.getByTestId("booth-start").click();
      await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing", { timeout: 20000 });
      await page.locator("body").click({ position: { x: 5, y: 5 } });

      // the keyboard sheet opens on its title: no button wears a focus ring
      await page.keyboard.press("?");
      const sheet = page.getByTestId("booth-shortcuts");
      await expect(sheet).toBeVisible();
      await page.waitForTimeout(200);
      expect(
        await page.evaluate(() => {
          const a = document.activeElement as HTMLElement | null;
          return (
            a?.tagName === "H2" ||
            !a?.matches(":focus-visible") ||
            getComputedStyle(a).outlineStyle === "none"
          );
        }),
      ).toBe(true);

      // the chip is a button that says what it changes
      const pause = sheet.getByTestId("shortcut-booth.pause");
      const space = pause.getByRole("button", { name: `Change shortcut for ${PAUSE}, currently Space` });
      await expect(space).toBeVisible();
      const box = (await space.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
      await space.click();
      const rec = pause.getByTestId("key-recorder");
      await expect(rec).toBeFocused();
      await expect(rec).toHaveText("Press keys…");
      await expect(rec).toHaveAccessibleName(/Recording a new shortcut for Pause/);
      await expect(pause.getByTestId("key-status")).toContainText("Esc cancels");
      // a touch screen says a keyboard is needed
      if (name === "ipad")
        await expect(pause.getByTestId("key-touch-hint")).toContainText("needs a keyboard");
      else await expect(pause.getByTestId("key-touch-hint")).toHaveCount(0);

      // a key the browser keeps is refused with its reason; the chip keeps recording
      await page.keyboard.press("Control+r");
      await expect(pause.getByTestId("key-refused")).toContainText("reloads the page");
      await expect(rec).toBeVisible();

      // k replaces Space, at once, in the one store (and this device keeps it)
      await page.keyboard.press("k");
      await expect(pause.getByTestId("key-binding")).toHaveText("k");
      await expect(
        pause.getByRole("button", { name: `Change shortcut for ${PAUSE}, currently k` }),
      ).toBeFocused();
      expect(await page.evaluate(() => localStorage.getItem("tdj-keymap"))).toContain('"booth.pause":["k"]');

      // conflict: f is the fade's — named, Esc cancels it (the sheet stays open), nothing changes
      await pause.getByTestId("key-chip").click();
      await page.keyboard.press("f");
      await expect(pause.getByTestId("key-conflict")).toContainText("f is already used by Fade out now");
      await expect(pause.getByTestId("key-replace")).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(pause.getByTestId("key-conflict")).toHaveCount(0);
      await expect(sheet).toBeVisible();
      await expect(pause.getByTestId("key-binding")).toHaveText("k");
      await expect(sheet.getByTestId("shortcut-booth.fade").getByTestId("key-binding")).toHaveText("f");

      // conflict → Replace: Hold takes x from the crossfade (which then has none)
      const hold = sheet.getByTestId("shortcut-booth.hold");
      await hold.getByTestId("key-chip").click();
      await page.keyboard.press("x");
      await expect(hold.getByTestId("key-conflict")).toContainText("Next with crossfade");
      await hold.getByTestId("key-replace").click();
      await expect(hold.getByTestId("key-binding")).toHaveText("x");
      await expect(sheet.getByTestId("shortcut-booth.crossfade").getByTestId("key-binding")).toHaveText(
        "None",
      );

      // more than one key: redo's chips each record, "+" adds one
      const redo = sheet.getByTestId("shortcut-edit.redo");
      await expect(redo.getByTestId("key-chip")).toHaveCount(2);
      await redo.getByTestId("key-add").click();
      await page.keyboard.press("Control+Shift+y");
      await expect(redo.getByTestId("key-chip")).toHaveCount(3);
      await expect(redo.getByTestId("key-binding")).toContainText("Ctrl+Shift+Y");
      // ⌫ on a chip removes its key
      await redo.getByRole("button", { name: /currently Ctrl\+Shift\+Y/ }).click();
      await page.keyboard.press("Backspace");
      await expect(redo.getByTestId("key-chip")).toHaveCount(2);

      // Settings (another tab, the same store on this device) shows k
      const settings = await context.newPage();
      await settings.goto("/settings#settings-keyboard");
      const sPause = settings.getByTestId("key-row-booth.pause");
      await expect(sPause.getByTestId("key-binding")).toHaveText("k");
      await expect(settings.getByTestId("key-row-booth.hold").getByTestId("key-binding")).toHaveText("x");

      // back in the Booth: Esc closes the sheet, k pauses (mid-night a room cut asks twice)
      await page.bringToFront();
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
      await page.locator("body").click({ position: { x: 5, y: 5 } });
      await page.keyboard.press(" ");
      await page.waitForTimeout(300);
      await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing");
      await page.keyboard.press("k");
      await page.keyboard.press("k");
      await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "paused", { timeout: 10000 });

      // reset one row in Settings: Space is Pause's again, and the Booth's sheet follows
      await settings.bringToFront();
      await sPause.getByTestId("key-reset").click();
      await expect(sPause.getByTestId("key-binding")).toHaveText("Space");
      await expect(sPause.getByTestId("key-reset")).toHaveCount(0);
      await page.bringToFront();
      await page.keyboard.press("?");
      await expect(sheet.getByTestId("shortcut-booth.pause").getByTestId("key-binding")).toHaveText("Space");
      // Reset all keys (in the sheet): the crossfade has x again
      await sheet.locator("#shortcuts-reset-all").click();
      await expect(sheet.getByTestId("shortcut-booth.crossfade").getByTestId("key-binding")).toHaveText("x");
      await expect(sheet.getByTestId("shortcut-booth.hold").getByTestId("key-binding")).toHaveText("h");
      expect(await page.evaluate(() => localStorage.getItem("tdj-keymap"))).toBeNull();
      await settings.close();
    });
  });
}
