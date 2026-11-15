/**
 * 2026-11 (the owner on an iPad: "the sidebar structure breaks when sliding the sidebar"): drag the sidebar's edge to
 * its minimum (200 px) and maximum (360 px), collapse and bring it back, scroll its list, fold Tonight — on a 1440 × 900
 * desktop and an iPad Pro 11 in landscape (Chromium with its viewport, scale, touch and user agent). At every width
 * nothing leaves the sidebar, Tonight's rows keep one height and never overlap, the header's meta gives way at the
 * minimum, the page beside it does not move during the drag, and touch-action keeps a drag on the edge from
 * scrolling and a swipe in the list from resizing. Screenshots (scale 2) go to $BOOTH_SHOTS when it is set.
 */
import { type BrowserContextOptions, devices, expect, type Page, test } from "@playwright/test";

const SHOTS = process.env.BOOTH_SHOTS;
const { defaultBrowserType: _b, ...ipad } = devices["iPad Pro 11 landscape"];
const CASES: Array<[string, BrowserContextOptions]> = [
  ["desktop", { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }],
  ["ipad-landscape", { ...ipad, viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2 }],
];

/** the sidebar's structure: anything outside it, Tonight's rows (height, overlap), the meta */
const structure = (page: Page) =>
  page.evaluate(() => {
    const side = document.querySelector<HTMLElement>('[data-testid="sidebar"]')!;
    const s = side.getBoundingClientRect();
    const out = [...side.querySelectorAll<HTMLElement>("*")]
      .filter((el) => !el.closest(".side-resize, .sr-only, [hidden]"))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        // (a scrolled list's rows are clipped by the list itself)
        const scroller = el.closest(".side-scroll");
        if (scroller) {
          const c = scroller.getBoundingClientRect();
          if (r.bottom < c.top || r.top > c.bottom) return false;
        }
        return r.right > s.right + 1 || r.left < s.left - 1;
      })
      .map((el) => `${el.tagName}.${el.className}`.slice(0, 60));
    const rows = [...side.querySelectorAll<HTMLElement>(".side-tanda")]
      .filter((r) => r.offsetParent)
      .map((r) => r.getBoundingClientRect());
    let overlap = 0;
    for (let i = 1; i < rows.length; i++) if (rows[i]!.top < rows[i - 1]!.bottom - 0.5) overlap++;
    const meta = side.querySelector<HTMLElement>('[data-testid="sidebar-tonight-meta"]');
    const head = side
      .querySelector<HTMLElement>('[data-testid="sidebar-tonight-toggle"]')!
      .getBoundingClientRect();
    return {
      width: s.width,
      out,
      heights: [...new Set(rows.map((r) => Math.round(r.height)))],
      overlap,
      rows: rows.length,
      meta: !!meta && meta.getBoundingClientRect().width > 0,
      headH: head.height,
      main: document.querySelector("main")!.getBoundingClientRect().left,
      resizeTouch: getComputedStyle(side.querySelector(".side-resize")!).touchAction,
      listTouch: getComputedStyle(side.querySelector(".side-scroll")!).touchAction,
    };
  });

async function dragEdge(page: Page, dx: number, during?: () => Promise<void>) {
  const h = (await page.getByTestId("sidebar-resize").boundingBox())!;
  const x = h.x + h.width / 2;
  const y = h.y + h.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y, { steps: 6 });
  await during?.();
  await page.mouse.move(x + dx, y, { steps: 6 });
  await page.mouse.up();
}

for (const [name, opts] of CASES) {
  test(`${name}: the sidebar keeps its structure from 200 to 360 px, collapsed and back, scrolled, Tonight folded`, async ({
    browser,
  }) => {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const s = document.createElement("style");
        s.textContent = "nextjs-portal{display:none!important}";
        document.head.append(s);
      });
    });
    await page.goto("/?featured=golden-double-peak");
    await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
    await expect(page.getByTestId("sidebar-tonight")).toBeVisible();
    const s0 = await structure(page);
    expect(s0.resizeTouch).toBe("none");
    expect(s0.listTouch).toBe("pan-y");

    // to the minimum: the page beside it holds still during the drag, then follows once
    await dragEdge(page, -300, async () => {
      const mid = await structure(page);
      expect(mid.main).toBe(s0.main);
      expect(mid.out).toEqual([]);
    });
    await expect.poll(async () => (await structure(page)).width).toBe(200);
    const min = await structure(page);
    expect(min.out, min.out.join("\n")).toEqual([]);
    expect(min.overlap).toBe(0);
    expect(min.heights).toEqual([44]);
    expect(min.meta).toBe(false);
    expect(min.headH).toBeLessThanOrEqual(45);
    expect(min.main).toBeLessThan(s0.main);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/sidebar-${name}-min.png` });

    // to the maximum
    await dragEdge(page, 400);
    await expect.poll(async () => (await structure(page)).width).toBe(360);
    const max = await structure(page);
    expect(max.out, max.out.join("\n")).toEqual([]);
    expect(max.overlap).toBe(0);
    expect(max.heights).toEqual([44]);
    expect(max.meta).toBe(true);
    expect(max.headH).toBeLessThanOrEqual(45);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/sidebar-${name}-max.png` });

    // the list scrolls without resizing anything
    const list = page.locator('[data-testid="sidebar"] .side-scroll');
    const lb = (await list.boundingBox())!;
    await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2);
    await page.mouse.wheel(0, 600);
    await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect((await structure(page)).width).toBe(360);

    // collapse and bring it back: the same width, the same structure
    await page.getByTestId("sidebar-hide").click();
    await expect(page.getByTestId("sidebar")).toBeHidden();
    await page.getByTestId("sidebar-show").click();
    await expect(page.getByTestId("sidebar")).toBeVisible();
    const back = await structure(page);
    expect(back.width).toBe(360);
    expect(back.out).toEqual([]);
    expect(back.overlap).toBe(0);

    // fold Tonight and open it again
    await list.evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.getByTestId("sidebar-tonight-toggle").click();
    await expect(page.locator("#side-tonight-list")).toBeHidden();
    expect((await structure(page)).out).toEqual([]);
    await page.getByTestId("sidebar-tonight-toggle").click();
    await expect(page.locator("#side-tonight-list")).toBeVisible();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/sidebar-${name}-back.png` });
    await ctx.close();
  });
}
