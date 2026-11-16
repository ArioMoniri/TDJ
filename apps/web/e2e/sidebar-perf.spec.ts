import { type BrowserContextOptions, devices, expect, type Page, test } from "@playwright/test";

/**
 * 2026-11 (the owner: "the parts resizing when the sidebar opens and closes is so laggy"; a trace of a long night:
 * ~100 ms of layout per frame of a collapse or a drag). Collapse, expand and a drag of the sidebar's edge, with a
 * long night on Compose and in the Booth, on a 1440 px desktop and an iPad Pro 11 in landscape:
 * - the page lays out at most twice per move (its new width at the start, and at the end), never per frame: a
 *   ResizeObserver on the page's column counts the size changes while it moves;
 * - the frames while it moves (requestAnimationFrame deltas, the first ones after the click left out: they hold
 *   the one layout) stay at 60 fps: the 90th percentile under $TDJ_FRAME_BUDGET ms (20 by default; a shared,
 *   loaded test machine can pass a larger one, the size-change count does not depend on it).
 * $TDJ_PERF_LOG prints the numbers.
 */

const { defaultBrowserType: _b, ...ipad } = devices["iPad Pro 11 landscape"];
const CASES: Array<[string, BrowserContextOptions]> = [
  ["desktop", { viewport: { width: 1440, height: 900 } }],
  ["ipad-landscape", { ...ipad, viewport: { width: 1180, height: 820 } }],
];
const BUDGET = Number(process.env.TDJ_FRAME_BUDGET ?? 20);

type W = { __rec: boolean; __frames: number[]; __long: number[]; __sizes: number };

async function record(page: Page, run: () => Promise<void>) {
  await page.evaluate(() => {
    const w = window as unknown as W;
    w.__frames = [];
    w.__long = [];
    w.__sizes = 0;
    w.__rec = true;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) w.__long.push(Math.round(e.duration));
    }).observe({ type: "longtask" });
    // the page's column: every size change is a layout of the night
    const col = document.querySelector("main > div");
    let first = true;
    const ro = new ResizeObserver(() => {
      if (first) first = false;
      else if (w.__rec) w.__sizes++;
      else ro.disconnect();
    });
    if (col) ro.observe(col);
    let last = performance.now();
    const f = (t: number) => {
      w.__frames.push(t - last);
      last = t;
      if (w.__rec) requestAnimationFrame(f);
    };
    requestAnimationFrame((t) => {
      last = t;
      requestAnimationFrame(f);
    });
  });
  await run();
  return page.evaluate(() => {
    const w = window as unknown as W;
    w.__rec = false;
    // (the first frames hold the click and the one layout at the new width, before anything moves)
    const fr = w.__frames.slice(3);
    const q = (p: number) =>
      fr.length ? Math.round([...fr].sort((a, b) => a - b)[Math.floor((fr.length - 1) * p)]! * 10) / 10 : 0;
    return {
      frames: fr.length,
      p50: q(0.5),
      p90: q(0.9),
      max: Math.round(Math.max(0, ...fr) * 10) / 10,
      sizes: w.__sizes,
      long: w.__long.length,
    };
  });
}

/** a click straight on the element (no locator round trip in the measured frames) */
const tap = (page: Page, id: string) =>
  page.evaluate((x) => (document.querySelector(`[data-testid="${x}"]`) as HTMLElement).click(), id);

async function exercise(page: Page, where: string, name: string) {
  const out: Array<[string, Awaited<ReturnType<typeof record>>]> = [];
  // warm: the first toggle compiles the animation's styles
  await tap(page, "sidebar-hide");
  await page.waitForTimeout(500);
  await tap(page, "sidebar-show");
  await page.waitForTimeout(500);
  out.push([
    "collapse",
    await record(page, async () => {
      await tap(page, "sidebar-hide");
      await page.waitForTimeout(350);
    }),
  ]);
  await page.waitForTimeout(300);
  out.push([
    "expand",
    await record(page, async () => {
      await tap(page, "sidebar-show");
      await page.waitForTimeout(350);
    }),
  ]);
  await page.waitForTimeout(300);
  const h = (await page.getByTestId("sidebar-resize").boundingBox())!;
  const x = h.x + h.width / 2;
  const y = h.y + h.height / 2;
  await page.mouse.move(x, y);
  out.push([
    "drag",
    await record(page, async () => {
      await page.mouse.down();
      for (let i = 1; i <= 24; i++) {
        await page.mouse.move(x + (i <= 12 ? i * 6 : (24 - i) * 6 - 40), y);
        await page.waitForTimeout(16);
      }
      await page.mouse.up();
      await page.waitForTimeout(150);
    }),
  ]);
  if (process.env.TDJ_PERF_LOG)
    for (const [k, r] of out) console.log(`${name} ${where} ${k}: ${JSON.stringify(r)}`);
  return out.map(([k, r]) => [`${where} ${k}`, r] as const);
}

for (const [name, opts] of CASES)
  test(`${name}: sidebar collapse, expand and drag lay the page out once, not per frame, at 60 fps (Compose and Booth)`, async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await page.route(/open\.spotify\.com\/oembed/, (r) => r.fulfill({ status: 404, body: "" }));
    await page.goto("/?featured=golden-double-peak");
    await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
    await expect(page.getByTestId("sidebar-tonight")).toBeVisible();
    await page.waitForTimeout(800);
    const results = await exercise(page, "compose", name);
    await page.getByTestId("play-the-night").first().click();
    await expect(page).toHaveURL(/\/booth/, { timeout: 60000 });
    await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(800);
    results.push(...(await exercise(page, "booth", name)));
    // the page's column changes size at most twice per move (start, end): never per frame
    expect(results.filter(([, r]) => r.sizes > 2).map(([k, r]) => `${k}: ${r.sizes} size changes`)).toEqual(
      [],
    );
    // and the frames while it moves stay within the budget
    expect(
      results.filter(([, r]) => r.p90 > BUDGET).map(([k, r]) => `${k}: p90 ${r.p90} ms (max ${r.max})`),
    ).toEqual([]);
    await ctx.close();
  });
