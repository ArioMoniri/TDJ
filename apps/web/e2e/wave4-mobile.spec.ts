/**
 * Wave 4 — native iOS 26 sizes, and a layout that holds at every size class.
 *
 * The owner's iPhone screenshots showed a full-width Regenerate / Export bar stacked on a big tab bar (a quarter of
 * the screen, text showing through under both), a 48 pt score, a 94 × 44 grey stepper, a monospace address running
 * off the sheet and a toast over the Export sheet's grabber and title. These checks pin the native sizes instead:
 * one 62 px tab capsule with at most one compact floating action that never overlaps it, the actions in the
 * navigation bar, a ≤ 34 pt large title, a ≤ 50 pt sheet button, a 94 × 32 stepper, toasts inside an open sheet,
 * and — on every device of the matrix (iPhone SE … 1920 desktop, light, dark, Turkish, 200 % text) — no sideways
 * overflow, nothing hidden under the bars, 44 px touch targets in the control layer, and no cut nav label.
 */
import { type Browser, type BrowserContextOptions, devices, expect, type Page, test } from "@playwright/test";
import { DUO_MATRIX } from "./devices";

const BASE = process.env.TDJ_URL ?? "http://localhost:3000";
const PAGES = ["/", "/booth", "/library", "/history", "/database", "/settings", "/rooms", "/build", "/guide"];

/** a device's viewport, scale, touch and user agent, in Chromium (the descriptors ask for WebKit) */
function dev(name: keyof typeof devices): BrowserContextOptions {
  const { defaultBrowserType: _b, ...rest } = devices[name];
  return rest;
}
const touch = (w: number, h: number, scale = 2): BrowserContextOptions => ({
  viewport: { width: w, height: h },
  deviceScaleFactor: scale,
  isMobile: true,
  hasTouch: true,
});
const MATRIX: Array<[string, BrowserContextOptions]> = [
  ["iPhone SE", touch(375, 667)],
  ["iPhone 15 Pro", dev("iPhone 15 Pro")],
  ["iPhone 15 Pro Max", dev("iPhone 15 Pro Max")],
  ["iPhone landscape", dev("iPhone 15 Pro landscape")],
  ["iPad mini portrait", touch(744, 1133)],
  ["iPad Pro 11 portrait", dev("iPad Pro 11")],
  ["iPad Pro 11 landscape", dev("iPad Pro 11 landscape")],
  ["iPad Pro 13 landscape", touch(1376, 1032)],
  ["iPad split view", touch(507, 1024)],
  ["desktop 1024", { viewport: { width: 1024, height: 768 } }],
  ["desktop 1440", { viewport: { width: 1440, height: 900 } }],
  ["desktop 1920", { viewport: { width: 1920, height: 1080 } }],
  // 2026-11: iPhone Duo folded (466 × 678) and open (951 × 669), e2e/devices.ts
  ...DUO_MATRIX,
];

async function open(
  browser: Browser,
  use: BrowserContextOptions,
  extra: BrowserContextOptions & { textScale?: number } = {},
) {
  const { textScale, ...more } = extra;
  const ctx = await browser.newContext({ ...use, ...more, baseURL: BASE });
  // the user's text size (iOS Larger Text / browser text zoom): the root font size, which every rem follows
  if (textScale)
    await ctx.addInitScript((s) => {
      const set = () => {
        document.documentElement.style.fontSize = `${s * 100}%`;
      };
      if (document.documentElement) set();
      document.addEventListener("DOMContentLoaded", set);
    }, textScale);
  return { ctx, page: await ctx.newPage() };
}

/** elements wider than the viewport: anything whose box leaves the window sideways, outside a horizontal scroller */
const sideways = (page: Page) =>
  page.evaluate(() => {
    const w = window.innerWidth;
    const bad: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.right <= w + 1) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.position === "fixed") continue;
      // inside a sideways scroller (chips, segmented strip) or an off-screen / clipped layer: not overflow
      let p: HTMLElement | null = el.parentElement;
      let inside = false;
      while (p && p !== document.body) {
        const ps = getComputedStyle(p);
        if (/(auto|scroll|hidden|clip)/.test(ps.overflowX) && p.getBoundingClientRect().right <= w + 1) {
          inside = true;
          break;
        }
        if (ps.position === "fixed") {
          inside = p.getBoundingClientRect().right <= w + 1;
          if (inside) break;
        }
        p = p.parentElement;
      }
      if (!inside)
        bad.push(
          `${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 40)} → ${Math.round(r.right)}`,
        );
    }
    return bad.slice(0, 5);
  });

/** the bottom bars' top edge (tab capsule, the one floating action, the search circle) and how they relate */
const bottomBars = (page: Page) =>
  page.evaluate(() => {
    const ids = ["tab-bar", "primary-bar", "mini-player"];
    const boxes = ids
      .map((id) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`))
      .filter((el): el is HTMLElement => {
        if (!el) return false;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return (
          cs.visibility !== "hidden" &&
          cs.display !== "none" &&
          +cs.opacity > 0.1 &&
          r.width > 0 &&
          r.top < innerHeight
        );
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          id: el.dataset.testid!,
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
          h: r.height,
        };
      });
    return boxes;
  });

/** the lowest visible content box in `main` after scrolling to the end */
async function lastContentBottom(page: Page) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    let max = 0;
    for (const el of document.querySelectorAll<HTMLElement>("main *")) {
      if (el.closest("[aria-hidden='true'], [data-testid='collapsed-bar'], .sr-only")) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || +cs.opacity === 0) continue;
      // the control layer itself (a fixed bar and what is in it) is not content
      let fixed = false;
      for (let p: HTMLElement | null = el; p && p !== document.body; p = p.parentElement)
        if (getComputedStyle(p).position === "fixed") {
          fixed = true;
          break;
        }
      if (fixed) continue;
      if (el.children.length && !el.textContent?.trim()) continue;
      const r = el.getBoundingClientRect();
      if (!r.height || !r.width || r.top > innerHeight) continue;
      // text or a control: what a reader needs to reach
      const leaf = !el.children.length || /^(BUTTON|A|INPUT|SELECT|TEXTAREA|svg)$/.test(el.tagName);
      if (leaf && el.textContent?.trim()) max = Math.max(max, r.bottom);
    }
    return max;
  });
}

/** a control's touch area: its box, grown by a transparent hit-area pseudo-element (stepper, switch) */
const touchTargets = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const small: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (!r.width || !r.height || cs.visibility === "hidden" || el.closest("[aria-hidden='true']")) continue;
      if (r.bottom < 0 || r.top > innerHeight) continue;
      let w = r.width;
      let h = r.height;
      for (const pseudo of ["::after", "::before"]) {
        const a = getComputedStyle(el, pseudo);
        if (a.content === "none" || a.position !== "absolute") continue;
        const n = (v: string) => (v.endsWith("px") ? Math.max(0, -parseFloat(v)) : 0);
        w = Math.max(w, r.width + n(a.left) + n(a.right));
        h = Math.max(h, r.height + n(a.top) + n(a.bottom));
      }
      if (Math.min(w, h) < 43.5)
        small.push(
          `${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 20)} ${Math.round(w)}×${Math.round(h)}`,
        );
    }
    return small;
  }, selector);

/** nav labels cut short: a label wider than its box, or a tab label leaving its tab */
const cutNavLabels = (page: Page) =>
  page.evaluate(() => {
    const bad: string[] = [];
    const navs = document.querySelectorAll<HTMLElement>(
      '[data-testid="tab-bar"], [data-testid="nav-pill"], [data-testid="sidebar"] nav, [data-testid="more-sheet"]',
    );
    for (const nav of navs) {
      if (!nav.getBoundingClientRect().width) continue;
      for (const el of nav.querySelectorAll<HTMLElement>("a, button, span")) {
        if (el.classList.contains("sr-only") || el.closest("[aria-hidden='true']")) continue;
        const text = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim());
        if (!text) continue;
        const r = el.getBoundingClientRect();
        if (!r.width) continue;
        if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== "visible")
          bad.push(`${el.textContent?.trim()} (cut)`);
        const tab = el.closest<HTMLElement>(".tab-item");
        if (tab) {
          const t = tab.getBoundingClientRect();
          if (r.left < t.left - 1 || r.right > t.right + 1)
            bad.push(`${el.textContent?.trim()} (wider than its tab)`);
        }
      }
    }
    return bad;
  });

async function checkPage(page: Page, path: string, touchDevice: boolean, label: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(700);
  const where = `${label} ${path}`;
  expect(await sideways(page), `${where}: nothing leaves the window sideways`).toEqual([]);
  expect(await cutNavLabels(page), `${where}: nav labels are whole`).toEqual([]);
  if (touchDevice)
    expect(
      await touchTargets(
        page,
        '[data-testid="tab-bar"] .tab-item, [data-testid="nav-pill"] a, [data-testid="page-toolbar"] button, .tab-search, [data-testid="primary-bar"] button, [data-testid="sidebar"] a',
      ),
      `${where}: control-layer touch targets`,
    ).toEqual([]);
  const bars = await bottomBars(page);
  if (bars.length) {
    const top = Math.min(...bars.map((b) => b.top));
    const last = await lastContentBottom(page);
    expect(last, `${where}: the last row clears the bars (top ${Math.round(top)})`).toBeLessThanOrEqual(
      top + 1,
    );
  }
}

for (const [name, use] of MATRIX) {
  test(`${name}: no overflow, nothing under the bars, 44 px controls, whole nav labels`, async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const { ctx, page } = await open(browser, use);
    for (const p of PAGES) await checkPage(page, p, !!use.hasTouch, name);
    await ctx.close();
  });
}

for (const [name, use] of MATRIX.filter(([n]) => n === "iPhone SE" || n === "iPad split view"))
  for (const variant of [
    { colorScheme: "dark" as const },
    { locale: "tr-TR" },
    { locale: "tr-TR", colorScheme: "dark" as const },
  ])
    test(`${name} ${variant.locale ?? ""} ${variant.colorScheme ?? "light"}: the same checks`, async ({
      browser,
    }) => {
      test.setTimeout(240_000);
      const { ctx, page } = await open(browser, use, variant);
      for (const p of PAGES) await checkPage(page, p, true, `${name} ${JSON.stringify(variant)}`);
      await ctx.close();
    });

test("iPhone 15 Pro at 200 % text: the layout holds", async ({ browser }) => {
  test.setTimeout(240_000);
  const { ctx, page } = await open(browser, dev("iPhone 15 Pro"), { textScale: 2 });
  for (const p of ["/", "/settings", "/library", "/history"]) await checkPage(page, p, true, "200 %");
  // the text really is twice the size; the tab capsule keeps its height (its labels stop at 12 pt, as on iOS)
  const body = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  expect(body).toBe(32);
  expect((await page.getByTestId("tab-bar").boundingBox())!.height).toBeLessThanOrEqual(70);
  await ctx.close();
});

test.describe("iPhone 15 Pro", () => {
  async function composed(browser: Browser, colorScheme: "light" | "dark" = "light") {
    const { ctx, page } = await open(browser, dev("iPhone 15 Pro"), { colorScheme });
    await page.goto("/?featured=golden-double-peak");
    await expect(page.locator("#result")).toBeVisible({ timeout: 150_000 });
    await page.waitForTimeout(800);
    return { ctx, page };
  }

  test("tab capsule: ≤ 70 px, five items at most, the selection is a lens not a filled block", async ({
    browser,
  }) => {
    const { ctx, page } = await open(browser, dev("iPhone 15 Pro"));
    await page.goto("/library");
    const bar = page.getByTestId("tab-bar");
    const b = (await bar.boundingBox())!;
    expect(b.height).toBeLessThanOrEqual(70);
    expect(await bar.locator(".tab-item").count()).toBeLessThanOrEqual(5);
    // 24 px glyphs, 10–11 px labels
    const sizes = await bar.evaluate((el) => {
      const label =
        el.querySelector<HTMLElement>(".tab-label:not(.sr-only)") ??
        el.querySelector<HTMLElement>(".tab-label")!;
      const svg = el.querySelector("svg")!.getBoundingClientRect();
      return { label: parseFloat(getComputedStyle(label).fontSize), icon: svg.width };
    });
    expect(sizes.label).toBeGreaterThanOrEqual(10);
    expect(sizes.label).toBeLessThanOrEqual(11);
    expect(sizes.icon).toBe(24);
    const sel = bar.locator('[aria-current="page"]');
    await expect(sel).toHaveCount(1);
    const tint = await sel.evaluate((el) => {
      const lens = el.querySelector<HTMLElement>(".tab-lens");
      const bg = lens ? getComputedStyle(lens).backgroundColor : "";
      const alpha = Number(bg.match(/[\d.]+(?=\))/)?.[0] ?? 1);
      return { color: getComputedStyle(el).color, alpha };
    });
    // the selection's fill is faint (a lens), the colour carries it
    expect(tint.alpha).toBeLessThanOrEqual(0.12);
    expect(tint.color).not.toBe(
      await bar
        .locator(".tab-item:not([aria-current])")
        .first()
        .evaluate((el) => getComputedStyle(el).color),
    );
    await ctx.close();
  });

  test("Compose: no bar stacks on the tab bar, the actions are in the navigation bar, the title and score are compact", async ({
    browser,
  }) => {
    test.setTimeout(200_000);
    // the empty page: one compact floating Compose, clear of the tab capsule
    {
      const { ctx, page } = await open(browser, dev("iPhone 15 Pro"));
      await page.goto("/");
      await expect(page.getByTestId("bar-compose")).toBeVisible();
      const bars = await bottomBars(page);
      const tab = bars.find((b) => b.id === "tab-bar")!;
      const floating = bars.filter((b) => b.id !== "tab-bar" && b.bottom <= tab.top + 1);
      expect(floating.length).toBeLessThanOrEqual(1);
      for (const f of floating) {
        expect(f.bottom, "the floating action stays above the tab capsule").toBeLessThanOrEqual(tab.top);
        expect(f.h).toBeLessThanOrEqual(50);
        // compact: not a full-width bar
        expect(f.right - f.left).toBeLessThan(page.viewportSize()!.width * 0.75);
      }
      const title = await page
        .getByTestId("page-title")
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(title).toBeLessThanOrEqual(34);
      await ctx.close();
    }
    const { ctx, page } = await composed(browser);
    // a set: nothing floats over it but the tab capsule; Regenerate and Export are navigation-bar icon buttons
    const bars = await bottomBars(page);
    expect(bars.map((b) => b.id)).toEqual(["tab-bar"]);
    const toolbar = page.getByTestId("page-toolbar");
    for (const id of ["bar-regenerate", "bar-export"]) {
      const btn = toolbar.getByTestId(id);
      await expect(btn).toBeVisible();
      const box = (await btn.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(36);
      expect(box.width).toBeLessThanOrEqual(44);
      expect(box.height).toBeLessThanOrEqual(44);
    }
    // the score is a stat, not a hero number
    const score = await page
      .getByTestId("score-value")
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(score).toBeGreaterThanOrEqual(26);
    expect(score).toBeLessThanOrEqual(34);
    // the bottom of the set is reachable above the tab capsule
    const tab = bars[0];
    expect(await lastContentBottom(page)).toBeLessThanOrEqual(tab.top + 1);
    await ctx.close();
  });

  test("Export sheet: a ≤ 50 px primary, a 94 × 32 stepper, a system-font address, a toast inside the sheet", async ({
    browser,
  }) => {
    test.setTimeout(200_000);
    const { ctx, page } = await composed(browser);
    await page.getByTestId("bar-export").click();
    const sheet = page.getByTestId("export-sheet");
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(600);
    const primary = sheet.getByTestId("sheet-footer").getByRole("button").first();
    expect((await primary.boundingBox())!.height).toBeLessThanOrEqual(50);
    const stepper = (await sheet.locator(".stepper").first().boundingBox())!;
    expect(stepper.width).toBeLessThanOrEqual(100);
    expect(stepper.height).toBeLessThanOrEqual(34);
    // the stepper's halves keep a 44 px touch area
    expect(await touchTargets(page, '[data-testid="export-sheet"] .stepper button')).toEqual([]);
    const field = await sheet.locator("#spotify-target").evaluate((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        family: cs.fontFamily,
        size: parseFloat(cs.fontSize),
        right: r.right,
        sheet: el.closest("[role=dialog]")!.getBoundingClientRect().right,
      };
    });
    expect(field.family).not.toMatch(/mono/i);
    expect(field.size).toBe(15);
    expect(field.right).toBeLessThanOrEqual(field.sheet);
    // a long address shows its start and its end
    await sheet
      .locator("#spotify-target")
      .fill("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=0123456789abcdef");
    await sheet.locator("#spotify-target").blur();
    await expect(sheet.locator("#spotify-target")).toHaveValue(/^https:\/\/open\.spotify\.co.*….*abcdef$/);
    await sheet.locator("#spotify-target").fill("");
    // nothing in the sheet's rows is cut at the right edge
    expect(await sideways(page)).toEqual([]);
    // a toast raised while a sheet is open sits under its title, inside the sheet (the webhook sheet says an http://
    // address is refused, and stays open)
    await sheet.getByRole("button", { name: /^Webhook/ }).click();
    const hook = page.getByRole("dialog", { name: "Webhook" });
    await expect(hook).toBeVisible();
    await page.waitForTimeout(500);
    await hook.locator("#webhook-url").fill("http://example.com/hook");
    await hook.getByRole("button", { name: "Save" }).click();
    const toast = page.getByTestId("toast");
    await expect(toast).toBeVisible();
    await page.waitForTimeout(300);
    const t = (await toast.boundingBox())!;
    const head = (await hook.getByRole("heading").first().boundingBox())!;
    expect(t.y, "the toast starts below the sheet's title row").toBeGreaterThanOrEqual(head.y + head.height);
    const s = (await hook.boundingBox())!;
    expect(t.x).toBeGreaterThanOrEqual(s.x);
    expect(t.x + t.width).toBeLessThanOrEqual(s.x + s.width);
    // the grabber and the title stay clear: nothing else sits on the title row
    expect(t.y).toBeGreaterThan(s.y + 40);
    await ctx.close();
  });

  test("Settings: a switch row is 44 pt, the switch 51 × 31 with a 44 px touch area", async ({ browser }) => {
    const { ctx, page } = await open(browser, dev("iPhone 15 Pro"));
    await page.goto("/settings");
    const sw = page.getByRole("switch", { name: "Reduce transparency" });
    await sw.scrollIntoViewIfNeeded();
    const track = (await sw.locator(".switch-track").boundingBox())!;
    expect(Math.round(track.width)).toBe(51);
    expect(Math.round(track.height)).toBe(31);
    const row = await sw.evaluate((el) => el.closest(".cell")!.getBoundingClientRect().height);
    expect(row).toBeLessThanOrEqual(45);
    expect(await touchTargets(page, '[role="switch"]')).toEqual([]);
    await ctx.close();
  });
});
