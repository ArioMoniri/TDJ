/**
 * Round 6 (docs/reviews/round6-tablet-bug.webp): the sm–lg nav pill and the tanda grid on tablets.
 * - the pill never covers the score header (content starts below it; scrollIntoView lands under it) and never
 *   overlaps itself (its children sit side by side inside its box)
 * - nothing in the first two tanda cards is truncated: one column until a column can hold ≥ 480 px
 * - no horizontal overflow (the lg `main` used to be 220 px wider than the viewport)
 * - a card's ••• popover is opaque: the rows under it must not read through its items
 * Runs in the `tablet-ipad` (820 × 1180, touch) and `desktop-1024` (1024 × 768) projects only.
 */
import { inflateSync } from "node:zlib";
import { expect, type Page, test } from "@playwright/test";

/** Decodes a small RGB/RGBA 8-bit PNG (any filter) and returns the pixel at (x, y). */
function pixelAt(buf: Buffer, x: number, y: number): number[] {
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
  const raw = inflateSync(Buffer.concat(idat));
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
  const o = (y * w + x) * bpp;
  return [out[o]!, out[o + 1]!, out[o + 2]!];
}
const dist = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i]!)));

async function compose(page: Page) {
  await page.goto("/");
  // lg has the toolbar capsule and the form's inline secondary Compose; either composes
  await page.getByRole("button", { name: /Compose the night/ }).first().click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(1500);
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** The bar that overlays content at this viewport: the nav pill (sm–lg) or the sticky page toolbar (lg). */
function topBar(page: Page) {
  return page.viewportSize()!.width >= 1024 ? page.getByTestId("page-toolbar") : page.getByTestId("nav-pill");
}

test("no horizontal overflow, before and after a compose", async ({ page }) => {
  await page.goto("/");
  const over = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(await over()).toBeLessThanOrEqual(0);
  await compose(page);
  expect(await over()).toBeLessThanOrEqual(0);
  await page.evaluate(() => window.scrollBy(0, 900));
  await page.waitForTimeout(300);
  expect(await over()).toBeLessThanOrEqual(0);
});

test("the top bar never covers the score header and never overlaps itself", async ({ page }) => {
  await compose(page);
  const bar = topBar(page);
  await expect(bar).toBeVisible();
  const score = page.locator("#result .cell").first();
  // after the compose scroll (scroll-margin on #result keeps the header under the bar)
  expect(intersects((await bar.boundingBox())!, (await score.boundingBox())!)).toBe(false);
  // an explicit scroll to the header lands below the bar (scroll-padding-top)
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await score.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(400);
  expect(intersects((await bar.boundingBox())!, (await score.boundingBox())!)).toBe(false);
  // mid-page the bar's own pieces are inside its box and side by side (the pill collapses instead of overlapping)
  await page.evaluate(() => window.scrollBy(0, 900));
  await page.waitForTimeout(400);
  const children = await bar.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const kids = [...el.children].map((c) => c.getBoundingClientRect());
    return {
      box: { x: r.x, y: r.y, width: r.width, height: r.height },
      scroll: el.scrollWidth - el.clientWidth,
      kids,
    };
  });
  expect(children.scroll).toBeLessThanOrEqual(1);
  const sorted = [...children.kids].filter((k) => k.width > 0).sort((a, b) => a.left - b.left);
  for (let i = 1; i < sorted.length; i++)
    expect(sorted[i]!.left).toBeGreaterThanOrEqual(sorted[i - 1]!.right - 1);
  for (const k of sorted) {
    expect(k.left).toBeGreaterThanOrEqual(children.box.x - 1);
    expect(k.right).toBeLessThanOrEqual(children.box.x + children.box.width + 1);
  }
  if (page.viewportSize()!.width < 1024) {
    // sm–lg: the pill carries the page's actions once the title scrolled out, and nothing is cut off
    await expect(bar.getByRole("button", { name: "Export" })).toBeVisible();
    await expect(bar.getByRole("button", { name: /Compose the night/ })).toBeVisible();
    await expect(bar.getByRole("link", { name: "Library" })).toBeVisible();
  }
});

test("the nav pill has clearance inside its band and a rounded corner on all sides", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 1024, "the pill exists at sm–lg only");
  await page.goto("/");
  await page.waitForTimeout(400);
  const pill = page.getByTestId("nav-pill");
  const band = page.getByTestId("nav-pill-band");
  const check = async (label: string) => {
    const p = (await pill.boundingBox())!;
    const b = (await band.boundingBox())!;
    expect(p.x, `${label}: left clearance`).toBeGreaterThanOrEqual(b.x + 12);
    expect(p.y, `${label}: top clearance`).toBeGreaterThanOrEqual(b.y + 12);
    expect(b.x + b.width - (p.x + p.width), `${label}: right clearance`).toBeGreaterThanOrEqual(12);
    // nothing inside the capsule paints outside its rounded outline: 2 px outside the top-left corner (diagonally)
    // is the band's colour, the same as 2 px outside its left edge at mid-height; the capsule's middle is not
    const png = await page.screenshot({
      clip: { x: p.x - 8, y: p.y - 8, width: p.width + 16, height: p.height + 16 },
      scale: "css",
    });
    const outsideCorner = pixelAt(png, 8 + 2, 8 + 2); // 2 px in from the box's top-left: outside the rounded end
    const outsideLeft = pixelAt(png, 8 - 2, 8 + Math.round(p.height / 2));
    const inside = pixelAt(png, 8 + Math.round(p.width / 2), 8 + Math.round(p.height / 2));
    expect(
      dist(outsideCorner, outsideLeft),
      `${label}: corner pixel ${outsideCorner} vs band ${outsideLeft}`,
    ).toBeLessThanOrEqual(12);
    expect(
      dist(outsideCorner, inside),
      `${label}: corner pixel ${outsideCorner} is the capsule's ${inside}`,
    ).toBeGreaterThan(12);
  };
  await check("scroll 0");
  await page.getByRole("button", { name: /Compose the night/ }).first().click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollBy(0, 900));
  await page.waitForTimeout(600);
  await expect(band).toHaveAttribute("data-collapsed", "true");
  await check("scrolled");
});

test("nothing in the first two tanda cards is truncated", async ({ page }) => {
  await compose(page);
  await page.locator("#tanda-2").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    for (const id of ["tanda-1", "tanda-2"]) {
      const card = document.getElementById(id);
      if (!card) {
        out.push(`${id}: missing`);
        continue;
      }
      for (const el of card.querySelectorAll<HTMLElement>(".truncate"))
        if (el.scrollWidth > el.clientWidth) out.push(`${id}: "${el.textContent?.trim()}"`);
    }
    return out;
  });
  expect(bad).toEqual([]);
  // the grid is one column unless each column can hold ≥ 480 px
  const cols = await page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>(".tanda-grid")!;
    return { n: getComputedStyle(grid).gridTemplateColumns.split(" ").length, w: grid.clientWidth };
  });
  expect(cols.n).toBe(cols.w >= 2 * 480 + 16 ? 2 : 1);
});

test("a card's ••• popover is opaque and sits above the card", async ({ page }) => {
  await compose(page);
  await page.locator("#tanda-1").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Tanda 1 actions", exact: true }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Swap tanda/ })).toBeVisible();
  const style = await menu.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, z: cs.zIndex, position: cs.position };
  });
  // rgb(…) with no alpha channel, or rgba(…, 1): fully opaque
  const m = /^rgba?\(([^)]+)\)$/.exec(style.bg);
  expect(m).not.toBeNull();
  const parts = m![1]!.split(/[\s,/]+/).filter(Boolean);
  expect(parts.length === 3 || Number(parts[3]) === 1).toBe(true);
  expect(style.position).toBe("fixed");
  expect(Number(style.z)).toBeGreaterThanOrEqual(50);
  // the popover is the element on top at its centre (not clipped by the card, not under the top bar)
  const box = (await menu.boundingBox())!;
  const onTop = await page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x!, y!);
      return !!el?.closest('[role="menu"]');
    },
    [box.x + box.width / 2, box.y + box.height / 2],
  );
  expect(onTop).toBe(true);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
});
