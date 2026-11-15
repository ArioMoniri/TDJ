/**
 * Round 23: the top chrome on iPad, the Mac window and phones; the scroll-edge material; the sidebar; wide layouts;
 * scrolling, overscroll and zoom; the Compose form; the gramophone; one page transition per tab.
 *
 * Runs in the `r23-*` projects: iPad Pro 11 portrait and landscape, a 1440 × 900 desktop and a 390 × 844 phone, light
 * and dark. iPads and phones get a simulated status bar: the real `env(safe-area-inset-*)` through Chromium's
 * safe-area override, and the same inset as a CSS override of the `--safe-top` token the bars read.
 */
import { expect, type Locator, type Page, test } from "@playwright/test";

const INSET: Record<string, { top: number; bottom: number }> = {
  ipad: { top: 24, bottom: 20 },
  phone: { top: 47, bottom: 34 },
  desktop: { top: 0, bottom: 0 },
};
const kind = (page: Page) => {
  const w = page.viewportSize()!.width;
  return w < 640 ? "phone" : test.info().project.name.includes("ipad") ? "ipad" : "desktop";
};
const lg = (page: Page) => page.viewportSize()!.width >= 1024;

async function simulateInsets(page: Page) {
  const inset = INSET[kind(page)]!;
  if (!inset.top) return inset;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: inset }).catch(() => {});
  await page.addInitScript((top) => {
    const add = () => {
      const s = document.createElement("style");
      s.textContent = `:root{--safe-top:${top}px !important}`;
      document.head.appendChild(s);
    };
    if (document.head) add();
    else document.addEventListener("DOMContentLoaded", add);
  }, inset.top);
  return inset;
}

async function compose(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: /Compose the night/ })
    .first()
    .click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(1200);
}

/** The bar that content scrolls under at this width. */
function topBar(page: Page): Locator {
  const w = page.viewportSize()!.width;
  return page.getByTestId(w < 640 ? "collapsed-bar" : w < 1024 ? "nav-pill-band" : "page-toolbar");
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width - 0.5 &&
  b.x < a.x + a.width - 0.5 &&
  a.y < b.y + b.height - 0.5 &&
  b.y < a.y + a.height - 0.5;

/** The bar's material (::before) and hairline (::after) as computed. */
const edge = (bar: Locator) =>
  bar.evaluate((el) => {
    const b = getComputedStyle(el, "::before");
    const a = getComputedStyle(el, "::after");
    const r = el.getBoundingClientRect();
    return {
      materialOpacity: Number(b.opacity),
      materialBg: b.backgroundColor,
      materialRadius: b.borderTopLeftRadius,
      hairlineOpacity: Number(a.opacity),
      hairlineHeight: Number.parseFloat(a.height),
      box: { x: r.x, y: r.y, width: r.width, height: r.height },
      scrolled: el.hasAttribute("data-scrolled"),
    };
  });

/** sRGB luminance of a computed colour (`color(srgb …)`, `rgb()` / `rgba()`, `oklab` falls back to NaN). */
function luminance(css: string): number {
  const m = css.match(/[\d.]+/g)?.map(Number) ?? [];
  if (css.startsWith("color(srgb")) return 0.2126 * m[0]! + 0.7152 * m[1]! + 0.0722 * m[2]!;
  return (0.2126 * m[0]! + 0.7152 * m[1]! + 0.0722 * m[2]!) / 255;
}

test.describe("top chrome and the scroll edge", () => {
  test("the header starts at or below the status bar / title bar inset", async ({ page }) => {
    const inset = await simulateInsets(page);
    await compose(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    const title = (await page.getByTestId("page-title").boundingBox())!;
    expect(title.y, "large title below the inset").toBeGreaterThanOrEqual(inset.top + 4);
    const w = page.viewportSize()!.width;
    if (w >= 640 && w < 1024) {
      const pill = (await page.getByTestId("nav-pill").boundingBox())!;
      expect(pill.y, "nav pill: inset + spacing").toBeGreaterThanOrEqual(inset.top + 8);
    }
    if (lg(page)) {
      const logo = (await page.getByTestId("sidebar").getByRole("link", { name: "TDJ home" }).boundingBox())!;
      expect(logo.y).toBeGreaterThanOrEqual(inset.top);
    }
    // collapsed: the phone's inline title sits in the 44 pt under the inset
    await page.evaluate(() => window.scrollTo(0, 900));
    await page.waitForTimeout(500);
    if (w < 640) {
      const inline = (await page
        .getByTestId("collapsed-bar")
        .getByText("Compose", { exact: true })
        .boundingBox())!;
      expect(inline.y).toBeGreaterThanOrEqual(inset.top);
    }
    // an open sheet stays below the inset too
    if (w < 1024) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(400);
      await (w < 640
        ? page.getByTestId("bar-export")
        : page.getByRole("button", { name: "Export" }).filter({ visible: true }).first()
      ).click();
      const sheet = page.getByRole("dialog").first();
      await expect(sheet).toBeVisible({ timeout: 20000 });
      await page.waitForTimeout(600);
      expect((await sheet.boundingBox())!.y).toBeGreaterThanOrEqual(inset.top);
    }
  });

  test("scroll 0: no material behind the title; scrolled: full-width material and a hairline", async ({
    page,
  }) => {
    await simulateInsets(page);
    await compose(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    const bar = topBar(page);
    const top = await edge(bar);
    expect(top.scrolled).toBe(false);
    expect(top.materialOpacity, "no material at the top").toBe(0);
    expect(top.hairlineOpacity, "no hairline at the top").toBe(0);

    await page.evaluate(() => window.scrollTo(0, 900));
    await page.waitForTimeout(700);
    const s = await edge(bar);
    expect(s.scrolled).toBe(true);
    expect(s.materialOpacity).toBe(1);
    expect(s.hairlineOpacity).toBe(1);
    expect(s.hairlineHeight).toBeLessThanOrEqual(1);
    // square, edge to edge (sidebar edge to window edge on lg), from the very top (the inset included)
    expect(s.materialRadius).toBe("0px");
    expect(s.box.y).toBeLessThanOrEqual(0.5);
    const vw = page.viewportSize()!.width;
    const left = lg(page) ? (await page.getByTestId("sidebar").boundingBox())!.width : 0;
    expect(Math.abs(s.box.x - left)).toBeLessThanOrEqual(1);
    expect(Math.abs(s.box.x + s.box.width - vw)).toBeLessThanOrEqual(1);
    // the theme's material, never an opaque dark blob on a light page
    const dark = test.info().project.name.endsWith("dark");
    const lum = luminance(s.materialBg);
    if (!Number.isNaN(lum)) {
      if (dark) expect(lum).toBeLessThan(0.3);
      else expect(lum).toBeGreaterThan(0.75);
    }
    // the title and the bar's controls never overlap one another
    const title = page.getByTestId(vw < 640 ? "collapsed-bar" : "page-title");
    const buttons = await (vw >= 640 && vw < 1024 ? page.getByTestId("nav-pill") : topBar(page))
      .getByRole("button")
      .all();
    const t = vw < 640 ? null : await title.boundingBox();
    for (const b of buttons) {
      const bb = await b.boundingBox();
      if (t && bb && bb.width > 0) expect(overlaps(t, bb)).toBe(false);
    }
  });

  test("macOS window: the page reserves the title bar and the traffic lights, and full screen drops them", async ({
    page,
  }) => {
    test.skip(kind(page) !== "desktop", "the Mac app's window");
    await page.addInitScript(() => {
      (window as unknown as { __TDJ_NATIVE__: unknown }).__TDJ_NATIVE__ = Object.freeze({
        platform: "macos",
        titleBar: "overlay",
      });
    });
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/titlebar-overlay/);
    const lights = { x: 0, y: 0, width: 78, height: 28 };
    const logo = (await page.getByTestId("sidebar").getByRole("link", { name: "TDJ home" }).boundingBox())!;
    const title = (await page.getByTestId("page-title").boundingBox())!;
    expect(overlaps(lights, logo), "logo under the traffic lights").toBe(false);
    expect(logo.y).toBeGreaterThanOrEqual(28);
    expect(title.y).toBeGreaterThanOrEqual(28);
    await expect(page.getByTestId("page-toolbar")).toHaveAttribute("data-tauri-drag-region");
    // collapsed sidebar: the show button and the title stay clear of the lights
    await page.getByTestId("sidebar-hide").click();
    const show = (await page.getByTestId("sidebar-show").boundingBox())!;
    expect(overlaps(lights, show)).toBe(false);
    expect(overlaps(show, (await page.getByTestId("page-title").boundingBox())!)).toBe(false);
    await page.getByTestId("sidebar-show").click();
    // full screen (the app sets the attribute from the window event)
    await page.evaluate(() => document.documentElement.setAttribute("data-fullscreen", ""));
    await page.waitForTimeout(100);
    expect((await page.getByTestId("page-title").boundingBox())!.y).toBeLessThan(28);
  });
});

test.describe("sidebar and wide layouts", () => {
  test("sections, Tonight jumps to a tanda and the inspector follows; collapse and width are remembered", async ({
    page,
  }) => {
    test.skip(!lg(page), "the sidebar exists at lg");
    await simulateInsets(page);
    await compose(page);
    const side = page.getByTestId("sidebar");
    await expect(side.getByRole("heading", { name: "Library" })).toBeVisible();
    await expect(side.getByRole("heading", { name: /Tonight/ })).toBeVisible();
    await expect(side.getByRole("heading", { name: "Recent nights" })).toBeVisible();
    await expect(side.getByRole("link", { name: "Settings" })).toBeVisible();
    // Settings stays pinned at the foot
    const settings = (await side.getByRole("link", { name: "Settings" }).boundingBox())!;
    expect(settings.y + settings.height).toBeGreaterThan(page.viewportSize()!.height - 80);
    // touch targets on touch screens
    if (kind(page) === "ipad")
      for (const l of await side.locator(".side-row").all())
        expect((await l.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    // Tonight → tanda 3
    const third = side.getByTestId("sidebar-tonight").getByRole("button").nth(2);
    const orchestra = (await third.locator("span.truncate").innerText()).replace(/^Tanda 3:\s*/, "").trim();
    await third.click();
    await page.waitForTimeout(900);
    const card = (await page.locator("#tanda-3").boundingBox())!;
    expect(card.y).toBeGreaterThanOrEqual(0);
    expect(card.y).toBeLessThan(page.viewportSize()!.height / 2);
    const inspector = page.getByTestId("inspector");
    await expect(inspector).toBeVisible();
    await expect(page.getByTestId("inspector-title")).toHaveText(orchestra);
    // two columns: the set and the inspector side by side, nothing overlapping
    const set = (await page.locator(".result-main").boundingBox())!;
    const ins = (await inspector.boundingBox())!;
    expect(overlaps(set, ins)).toBe(false);
    expect(ins.x).toBeGreaterThan(set.x + set.width - 1);
    // resize from the keyboard, collapse, reload: both remembered
    const handle = page.getByTestId("sidebar-resize");
    await handle.focus();
    await page.keyboard.press("End");
    expect(Math.round((await side.boundingBox())!.width)).toBe(360);
    await page.getByTestId("sidebar-hide").click();
    await expect(side).toBeHidden();
    await page.reload();
    await expect(page.getByTestId("sidebar-show")).toBeVisible();
    await expect(page.getByTestId("sidebar")).toBeHidden();
    // the page uses the room: main starts at the window edge
    expect((await page.locator("main").boundingBox())!.x).toBeLessThanOrEqual(1);
    await page.getByTestId("sidebar-show").click();
    expect(Math.round((await page.getByTestId("sidebar").boundingBox())!.width)).toBe(360);
  });

  test("Compose form: essentials first, folded sections, Compose in reach at every scroll position", async ({
    page,
  }) => {
    await simulateInsets(page);
    await page.goto("/");
    await page.waitForTimeout(600);
    // folded by default with a summary, and opening one shows its rows
    const structure = page.locator("#structure");
    await expect(structure.getByRole("button", { name: /Structure/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(page.getByLabel("Cycle", { exact: true })).toBeHidden();
    await structure.getByRole("button", { name: /Structure/ }).click();
    await expect(page.getByLabel("Cycle", { exact: true })).toBeVisible();
    // the primary action is on screen at the top and at the bottom of the form
    const compose =
      kind(page) === "phone"
        ? page.getByTestId("primary-bar").getByRole("button").first()
        : page.getByTestId("form-compose");
    for (const y of [0, 100_000]) {
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.waitForTimeout(400);
      await expect(compose).toBeInViewport();
    }
    // two columns from lg: essentials beside the folds
    if (lg(page)) {
      const night = (await page.locator("#night").boundingBox())!;
      const fold = (await structure.boundingBox())!;
      expect(fold.x).toBeGreaterThan(night.x + night.width - 1);
    }
  });

  test("choice rows: label left, control right, the row's width used", async ({ page }) => {
    test.skip(kind(page) === "phone", "phones put the control on its own full-width line");
    await page.goto("/");
    const row = page.locator("#night .seg-row").filter({ hasText: "Cortinas" });
    const r = (await row.boundingBox())!;
    const seg = (await row.getByRole("radiogroup").boundingBox())!;
    const label = (await row.getByText("Cortinas", { exact: true }).boundingBox())!;
    expect(r.x + r.width - (seg.x + seg.width), "control is trailing").toBeLessThanOrEqual(24);
    // on the label's line, or (a narrow column) on its own line at the row's full width: never half a row empty
    const sameLine = Math.abs(seg.y + seg.height / 2 - (label.y + label.height / 2)) <= 8;
    if (sameLine) expect(seg.width).toBeLessThan(r.width * 0.75);
    else expect(seg.width).toBeGreaterThanOrEqual(r.width - 48);
    // a long list is a pop-up, not a row of segments
    await page.goto("/settings");
    await expect(page.getByRole("radiogroup", { name: "Theme" })).toBeVisible();
  });
});

test.describe("tanda cards", () => {
  test("a long tanda note never squeezes a card: titles keep their room, the note wraps to two lines", async ({
    page,
  }) => {
    await page.goto("/?featured=golden-double-peak");
    await expect(page.locator("#tanda-2")).toBeVisible({ timeout: 60000 });
    await page.waitForTimeout(800);
    for (const collapsed of [false, true]) {
      if (collapsed) {
        if (!lg(page)) break;
        await page.getByTestId("sidebar-hide").click();
        await page.waitForTimeout(300);
      }
      const r = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const cards = [...document.querySelectorAll<HTMLElement>("article[id^=tanda-]")];
        const narrow = cards
          .filter((c) => c.getBoundingClientRect().width < Math.min(440, vw - 40))
          .map((c) => c.id);
        const collapsedTitles: string[] = [];
        for (const li of document.querySelectorAll<HTMLElement>("article[id^=tanda-] li[data-song]")) {
          const t = li.querySelector<HTMLElement>(".truncate");
          if (t && t.clientWidth < Math.min(t.scrollWidth, 64))
            collapsedTitles.push(`${t.textContent}:${t.clientWidth}`);
        }
        const note = document.querySelector<HTMLElement>("#tanda-2 [data-testid=tanda-note]");
        const lh = note ? Number.parseFloat(getComputedStyle(note).lineHeight) : 0;
        return { narrow, collapsedTitles, noteLines: note ? Math.round(note.clientHeight / lh) : 0 };
      });
      expect(r.narrow, "cards narrower than 440 px").toEqual([]);
      expect(r.collapsedTitles, "titles collapsed to a letter").toEqual([]);
      expect(r.noteLines).toBeLessThanOrEqual(2);
    }
  });
});

test.describe("scrolling, overscroll and zoom", () => {
  test("no element is wider than the viewport, on every page", async ({ page }) => {
    await simulateInsets(page);
    await compose(page);
    for (const path of ["/", "/settings", "/library", "/history", "/database", "/guide", "/booth"]) {
      if (path !== "/") await page.goto(path);
      await page.waitForTimeout(800);
      const wide = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const out: string[] = [];
        const clipped = (el: Element) => {
          for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const o = getComputedStyle(p).overflowX;
            if (o !== "visible") return true;
          }
          return false;
        };
        for (const el of document.body.querySelectorAll("*")) {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          if (getComputedStyle(el).position === "fixed" && r.left >= vw) continue;
          if ((r.right > vw + 1 || r.left < -1) && !clipped(el))
            out.push(
              `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} ${Math.round(r.left)}–${Math.round(r.right)}`,
            );
        }
        return out.slice(0, 8);
      });
      expect(wide, `${path}: wider than ${page.viewportSize()!.width}`).toEqual([]);
    }
  });

  test("the root carries the theme background, rubber-bands vertically and never zooms out", async ({
    page,
  }) => {
    await page.goto("/");
    const css = await page.evaluate(() => {
      const h = getComputedStyle(document.documentElement);
      const b = getComputedStyle(document.body);
      return {
        html: h.backgroundColor,
        body: b.backgroundColor,
        y: h.overscrollBehaviorY,
        bodyY: b.overscrollBehaviorY,
        x: h.overscrollBehaviorX,
        viewport: document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "",
      };
    });
    expect(css.html).toBe(css.body);
    expect(css.html).not.toBe("rgba(0, 0, 0, 0)");
    expect(css.y).not.toBe("none");
    expect(css.bodyY).not.toBe("none");
    expect(css.x).toBe("none");
    expect(css.viewport).toContain("viewport-fit=cover");
    expect(css.viewport).toMatch(/minimum-scale=1/);
  });

  test("the trackpad and the wheel scroll the page after sheets open and close", async ({ page }) => {
    test.skip(kind(page) === "phone", "a pointer with a wheel");
    await compose(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    // two sheets whose lives overlap: Export opens, closes, the benchmark opens right away
    await page.getByRole("button", { name: "Export" }).filter({ visible: true }).first().click();
    // the export sheet loads with its first use
    await expect(page.getByRole("dialog").first()).toBeVisible({ timeout: 20000 });
    await page.keyboard.press("Escape");
    await page
      .locator("#result")
      .getByText(/Benchmark/)
      .first()
      .click();
    await page.waitForTimeout(150);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
    await expect(page.locator("html")).not.toHaveAttribute("data-scroll-lock");
    await page.mouse.move(page.viewportSize()!.width / 2, page.viewportSize()!.height / 2);
    const before = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(before + 100);
  });
});

test.describe("motion", () => {
  test("a tab plays one page transition, not two", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const w = window as unknown as { __mounts: number; __dips: number };
      w.__mounts = 0;
      w.__dips = 0;
      new MutationObserver((ms) => {
        for (const m of ms)
          for (const n of m.addedNodes)
            if (n instanceof HTMLElement && n.matches('[data-testid="page-transition"]')) w.__mounts++;
      }).observe(document.querySelector("main")!, { childList: true, subtree: true });
      // a drop in opacity of the same page element is a second animation (the old exit + enter); a new element
      // starting from 0 is the one fade-in
      let last = 1;
      let lastEl: Element | null = null;
      const tick = () => {
        const el = document.querySelector<HTMLElement>('[data-testid="page-transition"]');
        const o = el ? Number(getComputedStyle(el).opacity) : 1;
        if (el === lastEl && o < last - 0.05) w.__dips++;
        last = o;
        lastEl = el;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const nav =
      kind(page) === "phone"
        ? page.getByTestId("tab-bar")
        : lg(page)
          ? page.getByTestId("sidebar")
          : page.getByTestId("nav-pill");
    await nav.getByRole("link", { name: "History" }).click();
    await expect(page).toHaveURL(/\/history/, { timeout: 15000 });
    await page.waitForTimeout(1200);
    const r = await page.evaluate(() => {
      const w = window as unknown as { __mounts: number; __dips: number };
      return { mounts: w.__mounts, dips: w.__dips };
    });
    expect(r.mounts, "the page mounts once").toBe(1);
    expect(r.dips, "it fades in once: its opacity never drops mid-way").toBe(0);
  });

  test("the gramophone rises only when pulled past the end, and springs back", async ({ page }) => {
    test.skip(kind(page) === "phone", "the wheel; touch pulls are the same code path");
    await page.goto("/");
    await page.waitForTimeout(800);
    const g = page.getByTestId("gramophone");
    await expect(g).not.toHaveAttribute("data-visible");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(400);
    await page.mouse.move(400, 400);
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 60);
    await expect(g).toHaveAttribute("data-visible", "");
    await expect(g).toHaveAttribute("data-arm", "");
    await expect(g).toBeInViewport();
    // let go: back down
    await page.waitForTimeout(1200);
    await expect(g).not.toHaveAttribute("data-visible");
  });
});
