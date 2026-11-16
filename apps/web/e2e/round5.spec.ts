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

test("phone: one compact Compose above the tab bar, then the set's actions in the navigation bar at the top, middle and bottom; ••• opens Tell the DJ", async ({
  browser,
}) => {
  // wave 4 (iOS 26): the full-width Regenerate / Export bar stacked on the tab bar is gone. No set: one compact
  // 50 pt Compose capsule at the trailing edge above the tab capsule; with a set: Regenerate, Export and ••• are
  // navigation-bar icon buttons (the large-title row, then the collapsed bar once scrolled)
  const ctx = await browser.newContext({ ...devices["iPhone 15 Pro"], baseURL: BASE });
  const page = await ctx.newPage();
  await page.goto("/");
  const bar = page.getByTestId("primary-bar");
  const tab = page.getByTestId("tab-bar");
  await expect(bar).toBeVisible();
  const composeBtn = page.getByTestId("bar-compose");
  const c = (await composeBtn.boundingBox())!;
  expect(c.height).toBe(50);
  expect(c.width).toBeLessThan(page.viewportSize()!.width * 0.75);
  expect(c.y + c.height).toBeLessThanOrEqual((await tab.boundingBox())!.y);
  // under a sheet the floating Compose leaves the screen
  await tab.getByTestId("tab-more").click();
  await expect(page.getByTestId("more-sheet")).toBeVisible();
  await expect(bar).toHaveAttribute("data-hidden", "true");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("more-sheet")).toHaveCount(0);
  await expect(bar).not.toHaveAttribute("data-hidden", "true");
  await composeBtn.click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(800);
  // with a set nothing floats over it but the tab capsule
  await expect(bar).toHaveCount(0);
  const actionsIn = async (where: "page-toolbar" | "collapsed-bar") => {
    const host = page.getByTestId(where);
    for (const id of ["bar-regenerate", "bar-export", "bar-more"]) {
      await expect(host.getByTestId(id)).toBeVisible();
      // in view, at the top of the screen, never under the tab capsule
      expect((await host.getByTestId(id).boundingBox())!.y).toBeGreaterThanOrEqual(0);
      expect((await host.getByTestId(id).boundingBox())!.y).toBeLessThan(120);
    }
  };
  // top: in the large-title row
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await actionsIn("page-toolbar");
  // middle and bottom: in the collapsed navigation bar
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.evaluate((h) => window.scrollTo(0, h / 2), height);
  await page.waitForTimeout(600);
  await expect(page.getByTestId("collapsed-bar")).toHaveAttribute("data-collapsed", "true");
  await actionsIn("collapsed-bar");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(600);
  await actionsIn("collapsed-bar");
  // Export opens its sheet from the navigation bar
  await page.getByTestId("collapsed-bar").getByTestId("bar-export").click();
  await expect(page.getByTestId("export-sheet")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("export-sheet")).toHaveCount(0);
  // ••• → Tell the DJ… opens the Adjust sheet with the chips and the field
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await page.getByTestId("page-toolbar").getByRole("button", { name: "Set actions" }).click();
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

test("desktop: ⌘↩ composes, ⌘K focuses Tell the DJ, ⌘E opens Export; Regenerate and Export stay in the sticky toolbar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const req = page.waitForRequest((r) => r.url().includes("/api/compose") && r.method() === "POST");
  await page.keyboard.press("Meta+Enter");
  await req;
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  // with a set the toolbar's tinted capsule is Export and Regenerate is the ghost next to it (round8-ux.md §1.2)
  const toolbar = page.getByTestId("page-toolbar");
  await expect(toolbar.getByTestId("toolbar-export")).toBeVisible();
  await expect(toolbar.getByTestId("toolbar-regenerate")).toBeVisible();
  await expect(toolbar.getByRole("button", { name: /Compose the night/ })).toHaveCount(0);
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
  const box = (await toolbar.getByTestId("toolbar-regenerate").boundingBox())!;
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
  // round 23: the first-run card grew (Build by hand), so the group now starts under the phone's fixed bottom chrome
  // (tab bar, primary bar, the scroll-edge fade over content): bring it to mid-screen, clear of every bar, first
  await cell.evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().top - 200));
  await page.waitForTimeout(400);
  const box = (await cell.boundingBox())!;
  // a pixel inside the first cell, clear of its text (6 px in from the right edge, 6 px down)
  const x = Math.round(box.x + box.width - 6);
  const y = Math.round(box.y + 6);
  // nothing fixed (a bar, a fade) sits over that pixel: what is sampled is the cell itself
  const topmost = await page.evaluate(
    ([px, py]) => {
      const el = document.elementFromPoint(px!, py!);
      return el?.closest("#night .group-inset") ? "cell" : `${el?.tagName}.${el?.className}`;
    },
    [x, y],
  );
  expect(topmost).toBe("cell");
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
  // 2026-11 (playback tanda scopes, lib/playback.ts playTanda): the menu item is "Pre-listen tanda (n × 20 s)" and
  // the chain is the night's list scoped to the tanda, said in the mini player as "Pre-listen · tanda n" (the old
  // "Tanda n · 1 of 4" queue badge is gone); the chain still moves on by itself, row by row
  await page.getByRole("menuitem", { name: /^Pre-listen tanda \(\d+ × 20 s\)/ }).click();
  const mini = page.getByTestId("mini-player");
  await expect(mini).toBeVisible();
  await expect(mini.getByTestId("mini-scope")).toHaveText(`Pre-listen · tanda ${n}`);
  const title = mini.getByTestId("mini-title");
  await expect(title).not.toHaveText("");
  const first = await title.innerText();
  // the clip ends and the chain moves on by itself (the element's own `ended`, fired here so the test does not
  // depend on audio timing under load; the mocked silence may already have ended it)
  await page.evaluate(() => document.querySelector("audio")?.dispatchEvent(new Event("ended")));
  await expect(title).not.toHaveText(first, { timeout: 10000 });
  await expect(mini.getByTestId("mini-scope")).toHaveText(`Pre-listen · tanda ${n}`);
  // a manual play on any row leaves the chain
  await page.locator('[data-testid="play-button"][aria-label^="Play "]').first().click();
  await expect(mini.getByTestId("mini-scope")).not.toHaveText(`Pre-listen · tanda ${n}`);
});
