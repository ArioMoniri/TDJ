/**
 * 2026-11 (the owner: "add a shortcut like Ctrl or Cmd+Y to redo, and like undo it should be editable; on phones,
 * shaking the phone is undo"):
 * - Compose: a tanda locked, ⌘Z / Ctrl+Z unlocks it, Ctrl+Y (Windows / Linux) and ⌘Y (a Mac) lock it again;
 *   Settings → Keyboard & gestures lists ⌘Y under Redo;
 * - an iPhone 15 Pro (Chromium with the phone's viewport, touch and user agent): a shake (synthetic devicemotion)
 *   asks "Undo “Tanda 1 was locked”?", Undo unlocks it; the next shake offers the redo; Cancel changes nothing;
 *   Settings → Keyboard & gestures has the "Shake to undo" switch, on.
 */
import { type Browser, devices, expect, type Page, test } from "@playwright/test";

async function quiet(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
  });
  await page.route(/\/api\/spotify\/me/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: '{"hosted":false,"user":null}' }),
  );
  await page.route(/open\.spotify\.com\/oembed/, (r) => r.fulfill({ status: 404, body: "" }));
}
async function openFeatured(page: Page) {
  await quiet(page);
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
}
const blur = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());

async function macPage(browser: Browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // a Mac's navigator: ⌘ is the command key
  await ctx.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "platform", { get: () => "MacIntel" });
  });
  return { ctx, page: await ctx.newPage() };
}

test("Compose: Ctrl+Y (and ⌘Y on a Mac) redoes after an undo; Settings lists it", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFeatured(page);
  const card = page
    .locator("#result article[data-tanda]")
    .filter({ has: page.getByTestId("tanda-lock") })
    .first();
  await expect(card).not.toHaveAttribute("data-locked", /.*/);
  await card.getByTestId("tanda-lock").click();
  await expect(card).toHaveAttribute("data-locked", "true");
  await blur(page);
  await page.keyboard.press("Control+z");
  await expect(card).not.toHaveAttribute("data-locked", /.*/);
  await page.keyboard.press("Control+y");
  await expect(card).toHaveAttribute("data-locked", "true");
  await expect(page.getByText(/Redone: Tanda \d+ was locked/)).toBeVisible();

  // Settings → Keyboard & gestures: Redo reads Ctrl+Shift+Z, Ctrl+Y (once)
  await page.goto("/settings#settings-keyboard");
  const redo = page.getByTestId("key-row-edit.redo");
  await expect(redo).toContainText("Ctrl+Y");
  await expect(redo.locator("kbd")).toHaveText(["Ctrl+Shift+Z", "Ctrl+Y"]);
  await expect(page.getByTestId("settings-keyboard")).toContainText("Keyboard & gestures");

  // a Mac: ⌘Y
  const mac = await macPage(browser);
  try {
    const p = mac.page;
    await openFeatured(p);
    const c = p
      .locator("#result article[data-tanda]")
      .filter({ has: p.getByTestId("tanda-lock") })
      .first();
    await c.getByTestId("tanda-lock").click();
    await expect(c).toHaveAttribute("data-locked", "true");
    await blur(p);
    await p.keyboard.press("Meta+z");
    await expect(c).not.toHaveAttribute("data-locked", /.*/);
    // the browser's own ⌘Y (History) never gets it: the page took it
    // (the listener is in place before the key: an un-awaited evaluate could install it after the press, and its
    // promise then waited for a key that never came, or died with the page's next navigation)
    await p.evaluate(() => {
      const w = window as unknown as { __yPrevented?: boolean | null };
      w.__yPrevented = null;
      const on = (e: KeyboardEvent) => {
        if (e.key !== "y") return;
        window.removeEventListener("keydown", on);
        setTimeout(() => {
          w.__yPrevented = e.defaultPrevented;
        });
      };
      window.addEventListener("keydown", on);
    });
    await p.keyboard.press("Meta+y");
    await expect
      .poll(() => p.evaluate(() => (window as unknown as { __yPrevented?: boolean | null }).__yPrevented))
      .toBe(true);
    await expect(c).toHaveAttribute("data-locked", "true");
    await p.goto("/settings#settings-keyboard");
    await expect(p.getByTestId("key-row-edit.redo").locator("kbd")).toHaveText(["⇧⌘Z", "⌘Y", "⌃Y"]);
  } finally {
    await mac.ctx.close();
  }
});

/** a shake: ±22 m/s² side to side at ~6 Hz for half a second, as devicemotion events */
const shake = (page: Page) =>
  page.evaluate(async () => {
    for (let i = 0; i < 14; i++) {
      const x = (i % 2 ? -1 : 1) * 22;
      window.dispatchEvent(
        new DeviceMotionEvent("devicemotion", {
          acceleration: { x, y: 0, z: 0 },
          accelerationIncludingGravity: { x, y: 0, z: 9.81 },
          interval: 16,
        }),
      );
      await new Promise((r) => setTimeout(r, 40));
    }
  });

test("iPhone: a shake asks “Undo …?”, Undo works, the next shake offers the redo, Cancel leaves it", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const { defaultBrowserType: _, ...iphone } = devices["iPhone 15 Pro"];
  // a phone's motion sensors are allowed, as on a real device (Chrome on Android: Site settings › Motion sensors,
  // allowed by default). A fresh Playwright context does not grant them, and a Chromium with the Device Orientation
  // spec's DeviceMotionEvent.requestPermission() then reads like iOS: Shake to Undo waits for the grant
  // (lib/shake.ts adoptMotionGrant)
  const ctx = await browser.newContext({ ...iphone, permissions: ["accelerometer", "gyroscope"] });
  const page = await ctx.newPage();
  try {
    await openFeatured(page);
    const card = page.locator("#result article[data-tanda]").first();
    const n = await card.getAttribute("data-tanda");
    // the phone locks from the tanda's menu
    await expect(async () => {
      await card.getByRole("button", { name: `Tanda ${n} actions` }).click();
      await page.getByRole("menuitem", { name: "Lock tanda" }).click({ timeout: 2000 });
    }).toPass({ timeout: 20000 });
    await expect(card).toHaveAttribute("data-locked", "true");
    await blur(page);
    // (a shake right after a scroll is the hand moving the page)
    await page.waitForTimeout(800);

    await shake(page);
    const alert = page.getByTestId("shake-alert");
    // (what this browser offers the shake, said when it does not answer)
    const motion = () =>
      page.evaluate(async () => {
        const dme = DeviceMotionEvent as unknown as { requestPermission?: unknown };
        let sensor = "n/a";
        try {
          sensor = (await navigator.permissions.query({ name: "accelerometer" as PermissionName })).state;
        } catch (e) {
          sensor = `throws ${(e as Error).name}`;
        }
        return JSON.stringify({
          ua: navigator.userAgent.slice(-40),
          requestPermission: typeof dme.requestPermission,
          sensor,
          coarse: matchMedia("(pointer: coarse)").matches,
          touchPoints: navigator.maxTouchPoints,
          hidden: document.hidden,
          pref: localStorage.getItem("tdj-shake-undo"),
          granted: localStorage.getItem("tdj-shake-motion"),
        });
      });
    await expect(alert, `Chromium ${browser.version()}: ${await motion()}`).toBeVisible();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expect(page.getByTestId("shake-alert-title")).toHaveText(`Undo “Tanda ${n} was locked”?`);
    // it asked: nothing undone yet
    await expect(card).toHaveAttribute("data-locked", "true");
    const undo = page.getByTestId("shake-undo");
    expect((await undo.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await undo.click();
    await expect(alert).toHaveCount(0);
    await expect(card).not.toHaveAttribute("data-locked", /.*/);

    // the next shake (a second later) offers the redo; Cancel leaves the night as it is
    await page.waitForTimeout(1100);
    await shake(page);
    await expect(page.getByTestId("shake-alert-title")).toHaveText(`Redo “Tanda ${n} was locked”?`);
    await page.getByTestId("shake-cancel").click();
    await expect(alert).toHaveCount(0);
    await expect(card).not.toHaveAttribute("data-locked", /.*/);

    // Settings → Keyboard & gestures: Shake to undo, on by default on a phone
    await page.goto("/settings#settings-keyboard");
    const sw = page.getByTestId("settings-shake").getByRole("switch", { name: "Shake to undo" });
    await expect(sw).toHaveAttribute("aria-checked", "true");
    // off, kept on this device
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "false");
    expect(await page.evaluate(() => localStorage.getItem("tdj-shake-undo"))).toBe("off");
  } finally {
    await ctx.close();
  }
});
