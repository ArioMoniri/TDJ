/**
 * 2026-11 — the owner: "Crossfade and Fade buttons don't change on long click, there's no UI change either, and they
 * can't be reversed." With 30 s clips, mid-night: holding Fade fills a ring and runs it; the button then counts down
 * ("Cancel fade · 4 s", pressed); a tap takes it back (the song plays on to its own end); a crossfade's Undo (⌘Z)
 * plays the song before it again; a short tap arms (a second one runs), as Next does.
 */
import { expect, type Page, test } from "@playwright/test";

function wav(sec = 30): Buffer {
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
  await page.addInitScript(() => {
    try {
      localStorage.setItem("tdj-booth-controls", "1");
    } catch {}
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
  });
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
  await page.route(/open\.spotify\.com\/oembed/, (r) => r.fulfill({ status: 404, body: "" }));
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/, { timeout: 60000 });
  await expect(page.getByTestId("booth-ttc")).not.toHaveAttribute("data-resolving", "1", { timeout: 30000 });
  await page.getByTestId("booth-start").click();
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing", { timeout: 20000 });
  if (!(await page.getByTestId("booth-controls").isVisible()))
    await page.getByTestId("booth-controls-toggle").click();
}
type S = { planIndex: number; state: string; fadeRun: { kind: string } | null; position: number };
const snap = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __tdjBooth: { getState: () => S } }).__tdjBooth.getState();
    return { planIndex: s.planIndex, state: s.state, fadeRun: s.fadeRun, position: s.position } as S;
  });
async function hold(page: Page, testId: string, ms = 800) {
  const b = (await page.getByTestId(testId).boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(150);
  // the ring fills and the label says so while held
  await expect(page.getByTestId(testId)).toHaveAttribute("data-holding", "true");
  await expect(page.getByTestId(testId)).toContainText(/Hold to/);
  await page.waitForTimeout(ms - 150);
  await page.mouse.up();
}

test.use({ viewport: { width: 1440, height: 900 } });

test("Fade: hold → the ring fills, it runs and counts down; a tap cancels it and the song plays on", async ({
  page,
}) => {
  await openBooth(page);
  const i0 = (await snap(page)).planIndex;
  await hold(page, "ctl-fade");
  const btn = page.getByTestId("ctl-fade");
  await expect(btn).toHaveAttribute("data-running", "fade");
  await expect(btn).toHaveAttribute("aria-pressed", "true");
  await expect(btn).toContainText(/Cancel fade · \d s/);
  expect((await snap(page)).fadeRun?.kind).toBe("fade");
  await page.waitForTimeout(600);
  await btn.click();
  await expect(btn).not.toHaveAttribute("data-running", "fade");
  await expect(btn).toHaveAttribute("aria-pressed", "false");
  // past the fade's length the same song still plays (it was taken back)
  await page.waitForTimeout(4500);
  const s = await snap(page);
  expect(s.planIndex).toBe(i0);
  expect(s.state).toBe("playing");
});

test("Fade: a short tap arms (Again), a second tap runs it", async ({ page }) => {
  await openBooth(page);
  const btn = page.getByTestId("ctl-fade");
  await btn.click();
  await expect(btn).toHaveAttribute("data-armed", "true");
  await expect(btn).not.toHaveAttribute("data-running", "fade");
  await btn.click();
  await expect(btn).toHaveAttribute("data-running", "fade");
});

test("Crossfade: hold → the next song starts; ⌘Z after it plays the song before it again from where it was", async ({
  page,
}) => {
  await openBooth(page);
  await page.waitForTimeout(2000);
  const before = await snap(page);
  await hold(page, "ctl-crossfade");
  await expect(page.getByTestId("ctl-crossfade")).toHaveAttribute("data-running", "crossfade");
  await expect.poll(async () => (await snap(page)).planIndex).not.toBe(before.planIndex);
  // through
  await expect.poll(async () => (await snap(page)).fadeRun, { timeout: 8000 }).toBeNull();
  await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
  await expect.poll(async () => (await snap(page)).planIndex, { timeout: 8000 }).toBe(before.planIndex);
  await expect.poll(async () => (await snap(page)).state).toBe("playing");
  expect((await snap(page)).position).toBeGreaterThan(before.position - 0.5);
});
