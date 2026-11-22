/**
 * 2026-11 — the owner's screenshots, on a desktop, an iPad and a phone:
 * 1. the one player: "Tap again or hold to confirm" never covers the progress bar or the transport; a tap on the
 *    gramophone opens the player's card in place (Now playing is one tap further, on the card); the volume's purple
 *    fill ends at the thumb's centre (±2 px) at 0 / 50 / 100 %; Room opens the output picker over the page (the URL
 *    stays); the sidebar's player shares the sidebar's height through a handle (compact row, whole player, kept on
 *    the device, compact on its own in a short window);
 * 2. the Booth's tanda header: the title, the type and total and the actions never collide nor cut a word at 1024,
 *    1280 and 1440 (and an iPad);
 * 3. the dancers' Floor screen: nothing overlaps, nothing leaves the screen at 1920 × 1080, 1280 × 720 and
 *    393 × 852, nor in the second window the Booth opens;
 * 4. Build by hand: the song search is the page's centre, the night and the guidance beside it, What comes next on
 *    every size.
 * Screenshots (scale 2) go to $POLISH_SHOTS when set.
 */
import { type BrowserContextOptions, devices, expect, type Locator, type Page, test } from "@playwright/test";

const SHOTS = process.env.POLISH_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

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

const IPAD_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const dev = (name: string, extra: Partial<BrowserContextOptions> = {}): BrowserContextOptions => {
  const { defaultBrowserType: _b, ...rest } = devices[name]!;
  return { ...rest, deviceScaleFactor: 2, ...extra };
};
type View = { name: string; o: BrowserContextOptions; side: boolean };
const DESKTOP: View = {
  name: "desktop",
  o: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  side: true,
};
const IPAD_L: View = {
  name: "ipad-landscape",
  o: dev("iPad Pro 11 landscape", { viewport: { width: 1180, height: 820 }, userAgent: IPAD_SAFARI }),
  side: true,
};
const IPAD_P: View = {
  name: "ipad-portrait",
  o: dev("iPad Pro 11", { userAgent: IPAD_SAFARI }),
  side: false,
};
const PHONE: View = {
  name: "phone",
  o: { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  side: false,
};

async function quiet(page: Page) {
  await page.addInitScript(() => {
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
}

/** the featured night, in the Booth (started when asked) */
async function openBooth(page: Page, start = true) {
  await quiet(page);
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/, { timeout: 60000 });
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("booth-ttc")).not.toHaveAttribute("data-resolving", "1", { timeout: 30000 });
  if (!start) return;
  const fresh = page.getByTestId("booth-resume").getByRole("button", { name: "Start from the beginning" });
  if (await fresh.isVisible().catch(() => false)) await fresh.click();
  await page.getByTestId("booth-start").click();
  await expect.poll(async () => (await snap(page)).state, { timeout: 20000 }).toBe("playing");
}

const snap = (page: Page) =>
  page.evaluate(() => {
    const s = (
      window as unknown as { __tdjBooth: { getState: () => Record<string, unknown> } }
    ).__tdjBooth.getState();
    return { state: s.state as string, master: s.master as number };
  });

/** to the Library, client-side (a reload would end the night) */
async function toLibrary(page: Page) {
  const side = page.locator('[data-testid="sidebar"] a.side-row[href="/library"]');
  if (await side.isVisible().catch(() => false)) await side.click();
  else {
    const any = page.locator('a[href="/library"]:visible').first();
    if (await any.count()) await any.click();
    else {
      await page.getByTestId("booth-more").click();
      await page.getByRole("menuitem", { name: "Leave the booth" }).click();
      await page.locator('a[href="/library"]:visible').first().click();
    }
  }
  await expect(page).toHaveURL(/\/library/);
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++)
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
  await page.mouse.up();
}

type R = { l: number; t: number; r: number; b: number; w: number; h: number };
const box = (el: Locator) =>
  el.evaluate((e) => {
    const r = e.getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
  });
const meet = (a: R, b: R) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;

/** the armed hint stands clear of the seek bar and of every button of the player */
async function hintClear(page: Page, mini: Locator, which: "booth-mini-toggle" | "booth-mini-next") {
  await mini.getByTestId(which).click();
  const hint = mini.getByTestId("booth-mini-hint");
  await expect(hint).toHaveText("Tap again or hold to confirm");
  const out = await mini.evaluate((m) => {
    const R = (e: Element) => {
      const r = e.getBoundingClientRect();
      return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
    };
    const vis = (e: Element) => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none";
    };
    const hint = m.querySelector('[data-testid="booth-mini-hint"]')!;
    const others = [
      ...m.querySelectorAll(
        '[data-testid="booth-mini-seek"], button, input, [data-testid="booth-mini-title"]',
      ),
    ]
      .filter(vis)
      .map((e) => ({ id: e.getAttribute("data-testid") ?? e.className, r: R(e) }));
    // the hint's words, not its box: a range around its text
    const range = document.createRange();
    range.selectNodeContents(hint);
    const tr = range.getBoundingClientRect();
    return {
      hint: { l: tr.left, t: tr.top, r: tr.right, b: tr.bottom, w: tr.width, h: tr.height },
      mini: R(m),
      others,
    };
  });
  const bad = out.others.filter(
    (o) => o.id !== "booth-mini-text" && !String(o.id).includes("booth-mini-text") && meet(out.hint, o.r),
  );
  expect(bad, `the hint covers ${bad.map((b) => b.id).join(", ")}`).toEqual([]);
  // inside the player
  expect(out.hint.l).toBeGreaterThanOrEqual(out.mini.l - 1);
  expect(out.hint.r).toBeLessThanOrEqual(out.mini.r + 1);
  expect(out.hint.t).toBeGreaterThanOrEqual(out.mini.t - 1);
  // let it lapse (3 s) without a second tap
  await expect(hint).toHaveCount(0, { timeout: 6000 });
}

/** the purple fill ends at the thumb's centre (±2 px) at 0, 50 and 100 % — and a click there keeps the value */
async function sliderLinesUp(page: Page, scope: Locator) {
  const input = scope.getByTestId("booth-mini-volume");
  const fill = scope.getByTestId("booth-mini-volume-fill");
  await expect(input).toBeVisible();
  for (const [v, frac] of [
    [-30, 0],
    [-12, 0.5],
    [6, 1],
  ] as const) {
    await input.fill(String(v));
    await expect.poll(async () => (await snap(page)).master).toBe(v);
    const m = await input.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const thumb = Number.parseFloat(getComputedStyle(el.parentElement!).getPropertyValue("--thumb")) || 18;
      return { l: r.left, w: r.width, y: r.top + r.height / 2, thumb };
    });
    const centre = m.l + m.thumb / 2 + frac * (m.w - m.thumb);
    // (the player redraws from the Booth at most 4 times a second)
    await expect
      .poll(async () => Math.abs((await box(fill)).r - centre), { message: `fill end at ${v} dB` })
      .toBeLessThanOrEqual(2);
    const f = await box(fill);
    expect(f.l).toBeLessThanOrEqual(m.l + 1);
    // the browser agrees on where the thumb is: a click on the fill's end leaves the value as it is
    await page.mouse.click(f.r, m.y);
    await page.waitForTimeout(150);
    expect(Math.abs((await snap(page)).master - v)).toBeLessThanOrEqual(1);
    await input.fill(String(v));
  }
  await input.fill("0");
}

/** Room: the picker opens over this page; the URL does not change */
async function roomInPlace(page: Page, scope: Locator) {
  const url = page.url();
  const room = scope.getByTestId("booth-mini-out-room");
  // its focus ring is its own box
  await room.focus();
  const ring = await room.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { offset: Number.parseFloat(cs.outlineOffset), w: el.scrollWidth - el.clientWidth };
  });
  expect(ring.offset).toBeLessThanOrEqual(0);
  expect(ring.w).toBeLessThanOrEqual(1);
  await room.click();
  const sheet = page.getByTestId("booth-output-sheet");
  await expect(sheet).toBeVisible({ timeout: 10000 });
  await expect(sheet).toContainText("Room output");
  expect(page.url()).toBe(url);
  await expect(page.getByTestId("booth-toolbar")).toHaveCount(0);
  await shot(page, `room-picker-${(page.viewportSize()?.width ?? 0) < 600 ? "phone" : "wide"}`);
  await sheet.getByRole("button", { name: "Done" }).first().click();
  await expect(sheet).toBeHidden();
  expect(page.url()).toBe(url);
  expect(["playing", "cortina"]).toContain((await snap(page)).state);
}

for (const v of [DESKTOP, IPAD_L, IPAD_P, PHONE]) {
  test.describe(`player, ${v.name}`, () => {
    test.use(v.o);

    test(`${v.name}: the confirm hint clear of the bar, the gramophone opens the card, the volume's fill at its thumb, Room in place`, async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await openBooth(page);
      await toLibrary(page);
      const mini = page.getByTestId("booth-mini");
      await expect(mini).toBeVisible({ timeout: 10000 });
      expect(await page.getByTestId("player-dock").getAttribute("data-place")).toBe(v.side ? "side" : "bar");

      // 1a: Pause and Next armed: the hint never covers the progress bar nor a button
      await hintClear(page, mini, "booth-mini-toggle");
      await hintClear(page, mini, "booth-mini-next");
      await mini.getByTestId("booth-mini-toggle").click();
      await shot(page, `${v.name}-hint`);
      await mini.getByTestId("booth-mini-toggle").click();
      await expect.poll(async () => (await snap(page)).state).toBe("paused");
      await mini.getByTestId("booth-mini-toggle").click();
      await expect.poll(async () => (await snap(page)).state).toBe("playing");

      if (v.side) {
        // 1c, 1d in the sidebar, at its default width and at its widest
        await sliderLinesUp(page, mini);
        await roomInPlace(page, mini);
        await page.evaluate(() => document.documentElement.style.setProperty("--sidebar-open-w", "360px"));
        await page.waitForTimeout(200);
        await sliderLinesUp(page, mini);
        await page.evaluate(() => document.documentElement.style.removeProperty("--sidebar-open-w"));
        await shot(page, `${v.name}-sidebar`);
        await page.getByTestId("sidebar-hide").click();
      } else {
        const g = (await page.getByTestId("player-grip").boundingBox())!;
        const vp = page.viewportSize()!;
        await drag(
          page,
          { x: g.x + g.width / 2, y: g.y + g.height / 2 },
          { x: vp.width * 0.3, y: vp.height * 0.4 },
        );
      }
      const dock = page.getByTestId("player-dock");
      await expect.poll(() => dock.getAttribute("data-place")).toBe("disc");
      await page.waitForTimeout(400);

      // 1b: a tap on the gramophone opens the card here — never Now playing
      const url = page.url();
      await page.getByTestId("player-gramophone").click();
      await expect(dock).toHaveAttribute("data-quick", "true");
      await expect(page.getByTestId("player-panel")).toBeVisible();
      await expect(mini).toBeVisible();
      await page.waitForTimeout(600);
      expect(page.url()).toBe(url);
      await expect(page.getByTestId("now-view")).toHaveCount(0);
      await shot(page, `${v.name}-gramophone-card`);
      if (!v.side) {
        // the card carries the volume and Room on a phone and an iPad portrait
        await sliderLinesUp(page, mini);
        await roomInPlace(page, mini);
        await expect(dock).toHaveAttribute("data-quick", "true");
      }
      // a second tap closes it; a third opens it again
      await page.getByTestId("player-gramophone").click();
      await expect(dock).not.toHaveAttribute("data-quick", "true");
      await page.getByTestId("player-gramophone").click();
      await expect(dock).toHaveAttribute("data-quick", "true");
      // from the card, Now playing opens the full view
      await mini.getByTestId("booth-mini-now").click();
      await expect(page).toHaveURL(/\/booth/, { timeout: 20000 });
      await expect(page.getByTestId("now-view")).toBeVisible({ timeout: 15000 });
      expect(["playing", "cortina"]).toContain((await snap(page)).state);
    });
  });
}

for (const v of [DESKTOP, IPAD_L]) {
  test.describe(`sidebar split, ${v.name}`, () => {
    test.use(v.o);

    test(`${v.name}: the sidebar's player resizes from a handle, compact or whole, kept, compact in a short window`, async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await openBooth(page);
      await toLibrary(page);
      const side = page.getByTestId("sidebar");
      const split = page.getByTestId("sidebar-split");
      const mini = page.getByTestId("booth-mini");
      await expect(split).toBeVisible({ timeout: 10000 });
      await expect(side).toHaveAttribute("data-player", "full");
      await expect(mini.getByTestId("booth-mini-more")).toBeVisible();
      const navFull = (await box(page.locator(".side-scroll"))).h;
      const playerFull = (await box(page.getByTestId("sidebar-player"))).h;
      // the handle sits between the nav and the player
      const sp = await box(split);
      expect(sp.b).toBeLessThanOrEqual((await box(page.getByTestId("sidebar-player"))).t + 1);
      expect(sp.h).toBeGreaterThanOrEqual(8);

      // dragged down: the compact row (cover, title, play / pause, next, the progress line), the nav gains the room
      await drag(page, { x: sp.l + sp.w / 2, y: sp.t + sp.h / 2 }, { x: sp.l + sp.w / 2, y: sp.t + 600 });
      await expect(side).toHaveAttribute("data-player", "compact");
      await expect(mini.getByTestId("booth-mini-more")).toBeHidden();
      await expect(page.getByTestId("player-head")).toBeHidden();
      for (const id of [
        "booth-mini-back",
        "booth-mini-title",
        "booth-mini-toggle",
        "booth-mini-next",
        "booth-mini-seek",
      ])
        await expect(mini.getByTestId(id)).toBeVisible();
      const row = await mini.evaluate((m) =>
        ["booth-mini-back", "booth-mini-title", "booth-mini-toggle", "booth-mini-next"].map((id) => {
          const r = m.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
          return (r.top + r.bottom) / 2;
        }),
      );
      expect(Math.max(...row) - Math.min(...row), "one row").toBeLessThanOrEqual(8);
      const compactH = (await box(page.getByTestId("sidebar-player"))).h;
      expect(compactH).toBeLessThan(110);
      expect((await box(page.locator(".side-scroll"))).h).toBeGreaterThan(
        navFull + (playerFull - compactH) - 30,
      );
      for (const b of await mini.locator("button:not([aria-hidden]):visible").all()) {
        const r = (await b.boundingBox())!;
        expect(r.height).toBeGreaterThanOrEqual(43.5);
      }
      expect(await page.evaluate(() => localStorage.getItem("tdj-side-player"))).toBe("64");
      // the compact row still asks before it pauses, its hint where the title was
      await hintClear(page, mini, "booth-mini-toggle");
      await shot(page, `${v.name}-sidebar-compact`);

      // kept: another page, the same row
      await page.locator('[data-testid="sidebar"] a.side-row[href="/settings"]').click();
      await expect(page).toHaveURL(/\/settings/);
      await expect(side).toHaveAttribute("data-player", "compact");

      // dragged up to a height: the whole player, at that height (it scrolls inside it)
      const sp2 = await box(split);
      await drag(
        page,
        { x: sp2.l + sp2.w / 2, y: sp2.t + sp2.h / 2 },
        { x: sp2.l + sp2.w / 2, y: sp2.t - 240 },
      );
      await expect(side).toHaveAttribute("data-player", "full");
      const kept = Number(await page.evaluate(() => localStorage.getItem("tdj-side-player")));
      expect(kept).toBeGreaterThanOrEqual(220);
      expect(Math.abs((await box(page.getByTestId("sidebar-player"))).h - kept)).toBeLessThanOrEqual(12);
      // the keyboard: Home the compact row, End the whole player
      await split.focus();
      await page.keyboard.press("Home");
      await expect(side).toHaveAttribute("data-player", "compact");
      await page.keyboard.press("End");
      await expect(side).toHaveAttribute("data-player", "full");

      // a short window: compact by itself (the nav keeps its room); tall again: the whole player, as chosen
      const vp = page.viewportSize()!;
      await page.setViewportSize({ width: vp.width, height: 480 });
      await expect(side).toHaveAttribute("data-player", "compact");
      expect((await box(page.locator(".side-scroll"))).h).toBeGreaterThanOrEqual(150);
      await shot(page, `${v.name}-sidebar-short`);
      await page.setViewportSize(vp);
      await expect(side).toHaveAttribute("data-player", "full");
      // double-click: the compact row, again the whole player
      await split.dblclick();
      await expect(side).toHaveAttribute("data-player", "compact");
      await split.dblclick();
      await expect(side).toHaveAttribute("data-player", "full");
      expect(["playing", "cortina"]).toContain((await snap(page)).state);
    });
  });
}

/* ---------------- 2. the tanda header ---------------- */

const heads = (page: Page) =>
  page.evaluate(() => {
    const vis = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none";
    };
    const R = (e: Element) => e.getBoundingClientRect();
    const meet = (a: DOMRect, b: DOMRect) =>
      a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    const out: string[] = [];
    let n = 0;
    const heights = new Set<number>();
    for (const h of document.querySelectorAll<HTMLElement>(
      '.booth-col-set [data-testid="booth-tanda-head"]',
    )) {
      if (!vis(h)) continue;
      const t = h.closest<HTMLElement>(".booth-tanda")?.dataset.tanda;
      n++;
      const hr = R(h);
      const parts = [
        h.querySelector('[data-testid="booth-tanda-title"]'),
        ...h.querySelectorAll('[data-testid="tanda-type"], [data-testid="booth-tanda-total"]'),
        ...[...h.querySelectorAll('[data-testid="booth-tanda-acts"] > *')],
      ].filter((e): e is Element => !!e && vis(e));
      for (let i = 0; i < parts.length; i++)
        for (let j = i + 1; j < parts.length; j++) {
          const a = parts[i]!;
          const b = parts[j]!;
          if (a.contains(b) || b.contains(a)) continue;
          if (meet(R(a), R(b)))
            out.push(
              `tanda ${t}: ${a.getAttribute("data-testid") ?? a.className} meets ${b.getAttribute("data-testid") ?? b.className}`,
            );
        }
      // nothing cut: no text box narrower than its words, nothing out of the header
      for (const e of h.querySelectorAll<HTMLElement>("*")) {
        if (!vis(e)) continue;
        if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== "visible")
          out.push(`tanda ${t}: ${e.getAttribute("data-testid") ?? e.className} is cut`);
        const r = R(e);
        if (r.right > hr.right + 1 || r.left < hr.left - 1)
          out.push(`tanda ${t}: ${e.getAttribute("data-testid") ?? e.className} leaves the header`);
      }
      // the actions: 44 px, one height, 8 px apart
      const acts = [...h.querySelectorAll<HTMLElement>('[data-testid="booth-tanda-acts"] button')].filter(
        vis,
      );
      for (const b of acts) {
        const r = R(b);
        heights.add(Math.round(r.height));
        if (r.height < 43.5 || r.width < 43.5)
          out.push(`tanda ${t}: ${b.dataset.testid ?? b.className} ${r.width}×${r.height}`);
      }
      const row = [...h.querySelectorAll<HTMLElement>('[data-testid="booth-tanda-acts"] > *')]
        .filter(vis)
        .map(R)
        .sort((a, b) => a.left - b.left);
      for (let i = 1; i < row.length; i++)
        if (Math.abs(row[i]!.top - row[i - 1]!.top) < 4 && row[i]!.left - row[i - 1]!.right < 7.5)
          out.push(`tanda ${t}: actions ${row[i]!.left - row[i - 1]!.right} px apart`);
    }
    if (h0()) out.push(...h0());
    return { n, out, heights: [...heights] };
    function h0() {
      return [] as string[];
    }
  });

for (const [w, h] of [
  [1024, 768],
  [1280, 800],
  [1440, 900],
] as const)
  test(`the Booth's tanda header at ${w}: the title, the type and total and the actions never collide nor cut`, async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await openBooth(page, false);
    // a tanda skipped tonight (the longest cluster before the night) and the tile, the menu, swap
    const set = page.locator(".booth-col-set .booth-set");
    await expect(set).toBeVisible();
    await set.locator('.booth-tanda[data-tanda="2"] [data-testid="booth-bypass"]').click();
    await expect(set.locator('.booth-tanda[data-tanda="2"]')).toHaveAttribute("data-bypassed", "true");
    await page.waitForTimeout(400);
    const a = await heads(page);
    expect(a.n).toBeGreaterThanOrEqual(4);
    expect(a.out, a.out.join("\n")).toEqual([]);
    expect(a.heights).toEqual([44]);
    const head = set.locator('.booth-tanda[data-tanda="2"] [data-testid="booth-tanda-head"]');
    await head.scrollIntoViewIfNeeded();
    if (SHOTS) await head.screenshot({ path: `${SHOTS}/tanda-head-${w}.png` });
    await shot(page, `tanda-heads-${w}`);
    // started: the floor and praise join the actions
    await page.getByTestId("booth-start").click();
    await expect.poll(async () => (await snap(page)).state, { timeout: 20000 }).toBe("playing");
    await page.waitForTimeout(600);
    const b = await heads(page);
    expect(b.out, b.out.join("\n")).toEqual([]);
    await ctx.close();
  });

test.describe("the Booth's tanda header, iPad portrait", () => {
  test.use(IPAD_P.o);
  test("iPad portrait: the tanda header never collides nor cuts", async ({ page }) => {
    test.setTimeout(180_000);
    await openBooth(page, false);
    const a = await heads(page);
    if (a.n === 0) {
      // the set list in its sheet on a narrow Booth
      test.skip(true, "no set column on this layout");
    }
    expect(a.out, a.out.join("\n")).toEqual([]);
  });
});

/* ---------------- 3. the Floor screen ---------------- */

const floorState = (o: Record<string, unknown>) => ({
  v: 1,
  kind: "song",
  title: "Pájaro ciego de tanta lluvia en la ventana",
  orchestra: "Juan D'Arienzo y su Orquesta Típica",
  singer: "Alberto Echagüe y Armando Laborde",
  rhythm: "tango",
  year: 1957,
  k: 1,
  n: 4,
  tanda: 17,
  tandas: 22,
  stage: "start",
  next: { orchestra: "Francisco Canaro", rhythm: "vals", singer: null },
  positionSec: 42,
  lengthSec: 171,
  playing: true,
  srcStartSec: 0,
  songId: null,
  follows: "song",
  itemStartSec: 5400,
  tandaEndSec: 5400 + 171 * 3,
  closingAtSec: 12600,
  nightSec: 12780,
  arc: Array.from({ length: 22 }, (_, i) => (i % 3 === 2 ? "vals" : i % 5 === 4 ? "milonga" : "tango")),
  ...o,
});

const say = (page: Page, s: Record<string, unknown>) =>
  page.evaluate((st) => {
    const ch = new BroadcastChannel("tdj-floor");
    ch.postMessage({ type: "floor", state: { ...st, at: Date.now() } });
    ch.close();
  }, s);

/** every word of the screen inside it, and no two of them on top of each other */
async function floorClear(page: Page) {
  const r = await page.evaluate(() => {
    const vis = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none";
    };
    const sel = [
      ".floor-rhythm",
      ".floor-year",
      ".floor-tanda",
      ".floor-eyebrow",
      ".floor-songtitle",
      ".floor-orchestra",
      ".floor-singer",
      ".floor-count-line",
      ".floor-strip",
      ".floor-advice",
      ".floor-then",
      ".floor-then-tanda",
      ".floor-left",
      ".floor-cumparsita",
      ".night-strip",
      ".floor-title",
      ".floor-sub",
      ".floor-next",
      ".floor-count",
      ".floor-lyrics",
    ];
    const els = [...document.querySelectorAll(sel.join(","))].filter(vis);
    // a text's own line boxes (a block's box is wider than its words)
    const boxes = els.map((e) => {
      const range = document.createRange();
      range.selectNodeContents(e);
      // (its width from its words, its height from its own box: the font's glyph area runs past a tight line height)
      const b = e.getBoundingClientRect();
      const t = e.matches(".floor-strip, .night-strip") ? b : range.getBoundingClientRect();
      return { id: e.className.split(" ")[0]!, r: new DOMRect(t.left, b.top, t.width, b.height) };
    });
    const out: string[] = [];
    const W = window.innerWidth;
    const H = window.innerHeight;
    for (const b of boxes)
      if (b.r.left < -1 || b.r.top < -1 || b.r.right > W + 1 || b.r.bottom > H + 1)
        out.push(
          `${b.id} leaves the screen (${Math.round(b.r.left)},${Math.round(b.r.top)} – ${Math.round(b.r.right)},${Math.round(b.r.bottom)} in ${W}×${H})`,
        );
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!.r;
        const c = boxes[j]!.r;
        if (els[i]!.contains(els[j]!) || els[j]!.contains(els[i]!)) continue;
        if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1)
          out.push(`${boxes[i]!.id} meets ${boxes[j]!.id}`);
      }
    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth + 1) out.push("the page scrolls sideways");
    return { out, n: boxes.length };
  });
  expect(r.out, r.out.join("\n")).toEqual([]);
  return r.n;
}

async function floorChecks(page: Page, name: string) {
  await expect(page.getByTestId("floor-screen")).toBeVisible();
  await say(page, floorState({}));
  await expect(page.getByTestId("floor-song-of")).toHaveText("Song 2 of 4");
  await expect(page.getByTestId("floor-next-tanda")).toBeVisible();
  // the dancers' info is all there
  for (const id of [
    "floor-rhythm",
    "floor-title",
    "floor-orchestra",
    "floor-singer",
    "floor-then",
    "floor-tanda-left",
    "floor-cumparsita",
  ])
    await expect(page.getByTestId(id)).toBeVisible();
  expect(await floorClear(page)).toBeGreaterThanOrEqual(10);
  // read from across the room: the orchestra stays big
  const fs = await page
    .getByTestId("floor-orchestra")
    .evaluate((e) => Number.parseFloat(getComputedStyle(e).fontSize));
  expect(fs).toBeGreaterThanOrEqual(30);
  await shot(page, `floor-${name}-song`);
  // the last song (Next: cortina, then …), an opening with its eyebrow
  await say(page, floorState({ k: 3, stage: "last", follows: "cortina" }));
  await expect(page.getByTestId("floor-then")).toContainText("cortina");
  await floorClear(page);
  await say(page, floorState({ kind: "opening", k: -1, n: 0, stage: null, tanda: 0, singer: null }));
  await expect(page.getByTestId("floor-opening")).toBeVisible();
  await floorClear(page);
  // the cortina
  await say(
    page,
    floorState({
      kind: "cortina",
      title: "Cortina",
      orchestra: "",
      rhythm: "cortina",
      k: -1,
      n: 0,
      stage: null,
      positionSec: 12,
      lengthSec: 45,
      tandaEndSec: null,
    }),
  );
  await expect(page.getByTestId("floor-cortina-title")).toBeVisible();
  await floorClear(page);
  await shot(page, `floor-${name}-cortina`);
}

for (const [name, use] of [
  ["1920x1080", { viewport: { width: 1920, height: 1080 } }],
  ["1280x720", { viewport: { width: 1280, height: 720 } }],
  ["393x852", { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true }],
  ["852x393", { viewport: { width: 852, height: 393 }, isMobile: true, hasTouch: true }],
  ["2560x1080", { viewport: { width: 2560, height: 1080 } }],
] as const)
  test(`the Floor screen at ${name}: nothing overlaps, nothing leaves the screen`, async ({ browser }) => {
    const ctx = await browser.newContext({ ...use, deviceScaleFactor: 2, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/screen?extras=0");
    await floorChecks(page, name);
    await ctx.close();
  });

test("the Floor screen in its second window (as the Booth opens it): nothing overlaps", async ({
  browser,
}) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/settings");
  const [win] = await Promise.all([
    ctx.waitForEvent("page"),
    page.evaluate(() => {
      window.open("/screen?extras=0", "tdj-floor-screen", "popup,width=1280,height=720");
    }),
  ]);
  await win.waitForLoadState();
  // (headless gives the popup the size it asked for; a smaller window the DJ drags is the same screen)
  for (const [w, h] of [
    [1280, 720],
    [960, 540],
    [640, 360],
  ] as const) {
    await win.setViewportSize({ width: w, height: h });
    await floorChecks(win, `window-${w}x${h}`);
  }
  await ctx.close();
});

/* ---------------- 4. Build by hand ---------------- */

async function build(page: Page) {
  await quiet(page);
  await page.goto("/build");
  await page.evaluate(() => {
    localStorage.removeItem("tdj-build-draft");
    localStorage.removeItem("tdj-build-meta");
  });
  await page.reload();
  await expect(page.getByTestId("build-guide")).toBeVisible({ timeout: 30000 });
}

for (const v of [
  DESKTOP,
  { ...DESKTOP, name: "desktop-1280", o: { viewport: { width: 1280, height: 800 } } },
  IPAD_L,
  IPAD_P,
  PHONE,
])
  test.describe(`Build by hand, ${v.name}`, () => {
    test.use(v.o);
    test(`${v.name}: the search is the page's centre; the night, the guidance and What comes next beside it`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await build(page);
      const layout = await box(page.getByTestId("build-layout"));
      const main = await box(page.getByTestId("build-main"));
      const night = await box(page.getByTestId("build-night"));
      const guide = await box(page.getByTestId("build-guide"));
      const next = page.getByTestId("build-next-panel");
      await expect(page.getByTestId("build-add-open")).toHaveCount(0);
      await expect(page.locator("#build-search")).toBeVisible();
      // the search's centre is the layout's centre (±2 px)
      expect(Math.abs((main.l + main.r) / 2 - (layout.l + layout.r) / 2)).toBeLessThanOrEqual(2);
      const three = layout.w >= 960;
      if (three) {
        // night | search | guidance and What comes next, the search the widest
        expect(night.r).toBeLessThanOrEqual(main.l + 1);
        expect(guide.l).toBeGreaterThanOrEqual(main.r - 1);
        expect(main.w).toBeGreaterThan(night.w);
        expect(main.w).toBeGreaterThan(guide.w);
        expect(Math.abs(main.t - night.t)).toBeLessThanOrEqual(2);
      } else {
        // the search across the top, the panels under it
        expect(main.w).toBeGreaterThanOrEqual(layout.w - 2);
        expect(night.t).toBeGreaterThanOrEqual(main.b - 1);
        expect(guide.t).toBeGreaterThanOrEqual(main.b - 1);
      }
      // nothing overlaps: the search, the night, the guidance, What comes next
      const nx = await box(next);
      for (const [a, b] of [
        [main, night],
        [main, guide],
        [main, nx],
        [night, guide],
        [night, nx],
      ] as const)
        expect(meet(a, b)).toBe(false);
      // What comes next is on the page at every size, its suggestions reachable
      await next.scrollIntoViewIfNeeded();
      await expect(next).toBeVisible();
      await expect(next.getByRole("heading", { name: "What comes next" })).toBeVisible();
      await expect(page.getByTestId("build-suggestions")).toBeVisible({ timeout: 30000 });
      // no sideways scroll
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(1);
      // the search works where it is
      await page.locator("#build-search").fill("Bahía Blanca");
      await expect(page.getByTestId("build-version").first()).toBeVisible({ timeout: 30000 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, `build-${v.name}`);
    });
  });
