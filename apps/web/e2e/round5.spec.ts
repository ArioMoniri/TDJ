/**
 * Round 5 (docs/specs/round5-design.md): primary action placement, motion fidelity and light mode.
 * - phone: the glass primary bar sits above the tab bar at the top, middle and bottom of the result; it hides under
 *   sheets; its ••• opens Tell the DJ in a bottom sheet (also from a tap on the score)
 * - desktop: ⌘↩ composes, ⌘K focuses Tell the DJ, ⌘E opens Export; the Compose capsule stays in the sticky toolbar
 * - reduced motion: no transform animation runs on a tanda card
 * - light mode: the wallpaper never tints a content cell (a sampled pixel is the cell colour)
 */
import { devices, expect, type Page, test } from "@playwright/test";

const BASE = process.env.TDJ_URL ?? "http://localhost:3000";

async function compose(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Compose the night/ }).click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
}

/** Decodes a small PNG (RGB / RGBA, 8-bit, any filter) and returns the pixel at (x, y). */
function pixelAt(buf: Buffer, x: number, y: number): number[] {
  const zlib = require("node:zlib") as typeof import("node:zlib");
  let p = 8;
  let w = 0;
  let h = 0;
  let bpp = 4;
  const idat: Buffer[] = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("ascii", p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bpp = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 1;
    }
    if (type === "IDAT") idat.push(data);
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let q = 0;
  for (let row = 0; row < h; row++) {
    const f = raw[q++]!;
    const line = raw.subarray(q, q + stride);
    q += stride;
    const prev = row ? out.subarray((row - 1) * stride, row * stride) : Buffer.alloc(stride);
    const cur = out.subarray(row * stride, (row + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp]! : 0;
      const b = prev[i]!;
      const c = i >= bpp ? prev[i - bpp]! : 0;
      let v = line[i]!;
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += Math.floor((a + b) / 2);
      else if (f === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - b);
        const pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 255;
    }
  }
  const o = y * stride + x * bpp;
  return [out[o]!, out[o + 1]!, out[o + 2]!];
}

test("phone: the primary bar sits above the tab bar at the top, middle and bottom of the result, hides under sheets, and ••• opens Tell the DJ", async ({
  browser,
}) => {
  const ctx = await browser.newContext({ ...devices["iPhone 15 Pro"], baseURL: BASE });
  const page = await ctx.newPage();
  await page.goto("/");
  // no set: one full-width Compose capsule, 50 pt, directly above the tab bar
  const bar = page.getByTestId("primary-bar");
  const pill = page.getByTestId("primary-pill");
  const tab = page.getByTestId("tab-bar");
  await expect(bar).toBeVisible();
  const composeBtn = page.getByTestId("bar-compose");
  expect((await composeBtn.boundingBox())!.height).toBeGreaterThanOrEqual(50);
  const above = async () => {
    const m = await page.evaluate(() => {
      const t = document.querySelector('[data-testid="tab-bar"]')!.getBoundingClientRect();
      const pick = (id: string) => {
        const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
        const r = el.getBoundingClientRect();
        return { r, on: getComputedStyle(el).opacity !== "0" && r.width > 0 };
      };
      const full = pick("primary-bar");
      const min = pick("primary-pill");
      const shown = full.on ? full : min.on ? min : null;
      return shown
        ? {
            shown: true,
            bottom: shown.r.bottom,
            tabTop: t.top,
            inView: shown.r.top >= 0 && shown.r.bottom <= innerHeight,
          }
        : { shown: false, bottom: 0, tabTop: t.top, inView: false };
    });
    expect(m.shown).toBe(true);
    expect(m.inView).toBe(true);
    expect(m.bottom).toBeLessThanOrEqual(m.tabTop + 1);
  };
  await above();
  await composeBtn.click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(800);
  // with a set: Regenerate + Export + •••
  await expect(page.getByTestId("bar-regenerate")).toBeVisible();
  await expect(page.getByTestId("bar-export")).toBeVisible();
  await expect(bar.getByRole("button", { name: "Set actions" })).toBeVisible();
  // top
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await above();
  await expect(bar).toBeVisible();
  // middle: the tab bar minimises and the bar becomes the icon-only pill, still above the tab bar
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.evaluate(() => window.scrollTo(0, 300));
  await page.waitForTimeout(150);
  await page.evaluate((h) => window.scrollTo(0, h / 2), height);
  await page.waitForTimeout(600);
  await expect(tab).toHaveAttribute("data-min", "true");
  await expect(pill).toBeVisible();
  await expect(pill.getByRole("button", { name: "Export" })).toBeVisible();
  await above();
  // scrolling up (a finger, not a layout shift) brings the full bar back
  await page.evaluate(() => {
    const touch = (clientY: number) =>
      new Touch({ identifier: 1, target: document.body, clientX: 180, clientY });
    window.dispatchEvent(new TouchEvent("touchstart", { touches: [touch(200)] }));
    window.dispatchEvent(new TouchEvent("touchmove", { touches: [touch(420)] }));
    window.scrollBy(0, -400);
  }, height);
  await page.waitForTimeout(600);
  await expect(bar).toBeVisible();
  await above();
  // bottom
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(600);
  await above();
  // under a sheet the bar leaves the screen
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await page.getByTestId("bar-export").click();
  await expect(page.getByTestId("export-sheet")).toBeVisible();
  await expect(bar).toHaveAttribute("data-hidden", "true");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("export-sheet")).toHaveCount(0);
  await expect(bar).not.toHaveAttribute("data-hidden", "true");
  // ••• → Tell the DJ… opens the Adjust sheet with the chips and the field
  await bar.getByRole("button", { name: "Set actions" }).click();
  await page.getByRole("menuitem", { name: "Tell the DJ…" }).click();
  const adjust = page.getByTestId("adjust-sheet");
  await expect(adjust).toBeVisible();
  await expect(adjust.getByRole("button", { name: "More vals" })).toBeVisible();
  await expect(adjust.locator("#tell-dj")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(adjust).toHaveCount(0);
  // a tap on the score opens it too
  await page.getByTestId("score-button").click();
  await expect(page.getByTestId("adjust-sheet")).toBeVisible();
  await ctx.close();
});

test("desktop: ⌘↩ composes, ⌘K focuses Tell the DJ, ⌘E opens Export; Compose stays in the sticky toolbar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const req = page.waitForRequest((r) => r.url().includes("/api/compose") && r.method() === "POST");
  await page.keyboard.press("Meta+Enter");
  await req;
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  // the inline form Compose is a secondary affordance; the toolbar capsule is the primary
  await expect(page.getByRole("button", { name: /Compose the night/ })).toBeVisible();
  await page.keyboard.press("Meta+k");
  await expect(page.locator("#tell-dj")).toBeFocused();
  await page.keyboard.press("Meta+e");
  await expect(page.getByTestId("export-sheet")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("export-sheet")).toHaveCount(0);
  // the toolbar is sticky: scrolled into the tandas, the Compose capsule is still on screen at the top
  await page.locator("#tanda-6").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await expect(page.getByTestId("page-toolbar")).toHaveAttribute("data-collapsed", "true");
  const box = (await page.getByRole("button", { name: /Compose the night/ }).boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeLessThan(80);
  // the folded Set-up row's trailing control is Regenerate
  await expect(page.getByTestId("summary-regenerate")).toBeVisible();
});

test("reduced motion: no transform animation runs on a tanda card", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce", baseURL: BASE });
  const page = await ctx.newPage();
  await compose(page);
  // sample right away (mid-reveal) and again once settled: never a transform keyframe on a card
  const sample = () =>
    page.evaluate(() => {
      const cards = [...document.querySelectorAll("article[id^=tanda-]")];
      const anims = document.getAnimations().filter((a) => {
        const el = (a.effect as KeyframeEffect | null)?.target as Element | null;
        if (!el || !cards.some((c) => c === el || c.contains(el))) return false;
        const kf = (a.effect as KeyframeEffect).getKeyframes();
        return kf.some((k) => "transform" in k || "translate" in k || "scale" in k || "rotate" in k);
      });
      return {
        transformAnims: anims.length,
        transforms: cards.map((c) => getComputedStyle(c).transform),
      };
    });
  const first = await sample();
  expect(first.transformAnims).toBe(0);
  await page.waitForTimeout(600);
  const settled = await sample();
  expect(settled.transformAnims).toBe(0);
  for (const t of settled.transforms) expect(["none", "matrix(1, 0, 0, 1, 0, 0)"]).toContain(t);
  await ctx.close();
});

test("light mode: the wallpaper does not tint content (a sampled cell pixel is the cell colour) and glass keeps a dark hairline", async ({
  browser,
}) => {
  const ctx = await browser.newContext({ ...devices["iPhone 15 Pro"], colorScheme: "light", baseURL: BASE });
  const page = await ctx.newPage();
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const cell = page.locator("#night .group-inset").first();
  const box = (await cell.boundingBox())!;
  // a pixel inside the first cell, clear of its text (6 px in from the right edge, 6 px down)
  const x = Math.round(box.x + box.width - 6);
  const y = Math.round(box.y + 6);
  const png = await page.screenshot({ clip: { x, y, width: 1, height: 1 } });
  const [r, g, b] = pixelAt(png, 0, 0);
  const want = await cell.evaluate((el) => getComputedStyle(el).backgroundColor.match(/\d+/g)!.map(Number));
  expect(Math.abs(r! - want[0]!)).toBeLessThanOrEqual(1);
  expect(Math.abs(g! - want[1]!)).toBeLessThanOrEqual(1);
  expect(Math.abs(b! - want[2]!)).toBeLessThanOrEqual(1);
  // the page behind the cells carries the wallpaper (not white): the grouped background, not the cell colour
  const bg = page.locator("body");
  const bgColor = await bg.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bgColor).not.toBe(`rgb(${want.join(", ")})`);
  // P2-5: the glass ring in light mode is a dark hairline, not the white one that vanishes on cream
  const ring = await page.getByTestId("tab-bar").evaluate((el) => getComputedStyle(el).borderTopColor);
  expect(ring).toMatch(/^rgba\(0, 0, 0/);
  await ctx.close();
});

/** 1.2 s of silence as a WAV: enough for the <audio> element to play, tick and end. */
function silentWav(): Buffer {
  const rate = 8000;
  const n = Math.round(rate * 1.2);
  const data = Buffer.alloc(n * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

test("preview tanda: the tanda menu chains the tanda's previews in the mini-player, one after the other", async ({
  page,
}) => {
  const wav = silentWav();
  await page.route(/dzcdn\.net|\/api\/preview\?/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "audio/wav",
      body: wav,
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await compose(page);
  // a tanda with at least two preview-able rows (a one-track chain has nothing to hand over to)
  const n = await page
    .locator("article[id^=tanda-]")
    .evaluateAll(
      (cards) =>
        cards
          .find((c) => c.querySelectorAll('[data-testid="play-button"][aria-label^="Play "]').length >= 2)
          ?.id.replace("tanda-", "") ?? "",
    );
  expect(n).not.toBe("");
  const card = page.locator(`#tanda-${n}`);
  await card.getByRole("button", { name: `Tanda ${n} actions`, exact: true }).click();
  await page.getByRole("menuitem", { name: /^Preview tanda \(\d+ × 10 s\)/ }).click();
  const mini = page.getByTestId("mini-player");
  await expect(mini).toBeVisible();
  const badge = mini.getByTestId("player-badge");
  await expect(badge).toContainText(new RegExp(`Tanda ${n} · 1 of \\d`));
  // the clip ends and the chain moves on by itself (the element's own `ended`, fired here so the test does not
  // depend on audio timing under load; the mocked silence may already have ended it, hence 2 or 3)
  await page.evaluate(() => document.querySelector("audio")?.dispatchEvent(new Event("ended")));
  await expect(badge).toContainText(new RegExp(`Tanda ${n} · [23] of \\d`), { timeout: 10000 });
  // a manual play on any row leaves the chain
  await page.locator('[data-testid="play-button"][aria-label^="Play "]').first().click();
  await expect(badge).toHaveText("30 s preview");
});
