/**
 * 2026-11 (the owner on an iPad: "the sidebar structure breaks when sliding the sidebar"): drag the sidebar's edge to
 * its minimum (200 px) and maximum (360 px), collapse and bring it back, scroll its list, fold Tonight — on a 1440 × 900
 * desktop and an iPad Pro 11 in landscape (Chromium with its viewport, scale, touch and user agent). At every width
 * nothing leaves the sidebar, Tonight's rows keep one height and never overlap, the header's meta stays whole (on its
 * own line, never hidden), the page beside it follows the drag live (no gap), and touch-action keeps a drag on the edge
 * from scrolling and a swipe in the list from resizing. 2026-11 (design review): collapse and expand animate (the
 * sidebar slides, the page follows in step, ≤ 300 ms), the page title never moves down and keeps the content's edge,
 * with the Show button in the title's row. Screenshots (scale 2) go to $BOOTH_SHOTS when it is set.
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
      metaCut: !!meta && meta.scrollWidth > meta.clientWidth + 1,
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

    // to the minimum: the page beside it follows the drag live (no strip between them), the meta stays
    await dragEdge(page, -300, async () => {
      await page.waitForTimeout(50);
      const mid = await structure(page);
      expect(Math.abs(mid.main - mid.width), `main ${mid.main} vs sidebar ${mid.width}`).toBeLessThanOrEqual(
        2,
      );
      expect(mid.out).toEqual([]);
      expect(mid.meta).toBe(true);
    });
    await expect.poll(async () => (await structure(page)).width).toBe(200);
    const min = await structure(page);
    expect(min.out, min.out.join("\n")).toEqual([]);
    expect(min.overlap).toBe(0);
    expect(min.heights).toEqual([44]);
    expect(min.meta).toBe(true);
    expect(min.metaCut).toBe(false);
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

    // collapse and bring it back: it animates (a frame mid-way), the page follows in step, the title stays on its line
    // and on the content's edge; the same width and structure after
    const frame = () =>
      page.evaluate(() => {
        const side = document.querySelector('[data-testid="sidebar"]')!.getBoundingClientRect();
        const h1 = document.querySelector('[data-testid="page-title"]')!.getBoundingClientRect();
        const main = document.querySelector("main")!.getBoundingClientRect();
        const col = document.querySelector("main > div")!.getBoundingClientRect();
        return {
          side: side.right,
          main: main.left,
          h1T: h1.top,
          h1L: h1.left,
          h1M: (h1.top + h1.bottom) / 2,
          col: col.left,
        };
      });
    const open0 = await frame();
    await page.getByTestId("sidebar-hide").click();
    await page.waitForTimeout(90);
    const mid = await frame();
    expect(mid.side, "mid-collapse: the sidebar is sliding").toBeGreaterThan(5);
    expect(mid.side).toBeLessThan(open0.side - 5);
    expect(mid.main, "the page follows").toBeLessThan(open0.main - 5);
    await expect(page.getByTestId("sidebar")).toBeHidden();
    await page.waitForTimeout(350);
    const shut = await frame();
    expect(Math.abs(shut.h1T - open0.h1T), "no vertical jump of the title").toBeLessThanOrEqual(1);
    const pad = await page.evaluate(() =>
      Number.parseFloat(getComputedStyle(document.querySelector("main")!).paddingLeft),
    );
    expect(Math.abs(shut.h1L - (shut.main + pad)), "the title on the content's edge").toBeLessThanOrEqual(2);
    const show = (await page.getByTestId("sidebar-show").boundingBox())!;
    expect(show.x + show.width, "the Show button left of the title").toBeLessThanOrEqual(shut.h1L);
    expect(
      Math.abs(show.y + show.height / 2 - shut.h1M),
      "the Show button on the title's line",
    ).toBeLessThanOrEqual(3);
    await page.getByTestId("sidebar-show").click();
    await page.waitForTimeout(90);
    const mid2 = await frame();
    expect(mid2.side).toBeGreaterThan(5);
    expect(mid2.side).toBeLessThan(359);
    await expect(page.getByTestId("sidebar")).toBeVisible();
    await page.waitForTimeout(350);
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
