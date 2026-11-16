/**
 * 2026-11 — the owner's photos of the live Booth on an iPad in Safari (landscape, sidebar open): the bottom stack
 * overlapped the set list, Previous / Play / Next showed twice, the transport and the chips under the title had
 * every size, buttons on the night card could not be read, the two columns scrolled as one, a hint covered the
 * buttons, a mistaken tap cut the song. Here, on iPad Pro 11 (landscape with the sidebar open and collapsed,
 * portrait), an iPhone 15 Pro and a 1440 × 900 desktop (Chromium with each device's viewport, scale, touch and user
 * agent):
 * - the transport is one row of equal cells (the primary one fixed in width across states), every cell is hit where
 *   it is drawn, the chips under the title share one height;
 * - the transport, the Controls panel and the columns never overlap, and nothing shows through the transport;
 * - every button and chip text meets WCAG AA in dark and light;
 * - the columns scroll on their own, the playing row stays in view, "Back to now";
 * - a tap on touch shows no hint; the light confirmation (hold, tap-to-arm, the setting);
 * - a row, the artwork and Up Next play on one tap; the order inside a tanda changes (with Undo);
 * - the tanda's type and total; "Spotify · pick a device" on an iPad with Premium and no device.
 * Screenshots (scale 2) go to $BOOTH_SHOTS when it is set.
 */
import { type BrowserContextOptions, devices, expect, type Page, test } from "@playwright/test";
import { hold } from "./confirm";

const SHOTS = process.env.BOOTH_SHOTS;

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

/** iPadOS Safari reports a Mac; its touch points tell it apart */
const IPAD_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const dev = (name: string, extra: Partial<BrowserContextOptions> = {}): BrowserContextOptions => {
  const { defaultBrowserType: _b, ...rest } = devices[name]!;
  return { ...rest, deviceScaleFactor: 2, ...extra };
};
const IPAD_L = dev("iPad Pro 11 landscape", {
  viewport: { width: 1180, height: 820 },
  userAgent: IPAD_SAFARI,
});
const DEVICES: Array<[string, BrowserContextOptions, { collapse?: boolean }]> = [
  ["ipad-landscape", IPAD_L, {}],
  ["ipad-landscape-collapsed", IPAD_L, { collapse: true }],
  ["ipad-portrait", dev("iPad Pro 11", { userAgent: IPAD_SAFARI }), {}],
  ["iphone-15-pro", dev("iPhone 15 Pro"), {}],
  ["desktop", { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }, {}],
];

async function openBooth(page: Page, o: { light?: boolean; ipad?: boolean } = {}) {
  await page.addInitScript(
    ([light, ipad]) => {
      try {
        localStorage.setItem("tdj-booth-theme", light ? "light" : "dark");
      } catch {}
      if (ipad) Object.defineProperty(Navigator.prototype, "maxTouchPoints", { get: () => 5 });
      document.addEventListener("DOMContentLoaded", () => {
        const s = document.createElement("style");
        s.textContent = "nextjs-portal{display:none!important}";
        document.head.append(s);
      });
    },
    [!!o.light, !!o.ipad] as const,
  );
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
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("booth-ttc")).not.toHaveAttribute("data-resolving", "1", { timeout: 30000 });
}

type Snap = { planIndex: number; state: string; started: boolean; cur: number | null };
const snap = (page: Page) =>
  page.evaluate(() => {
    const s = (
      window as unknown as {
        __tdjBooth: {
          getState: () => {
            planIndex: number;
            state: string;
            started: boolean;
            current: { planIndex: number } | null;
          };
        };
      }
    ).__tdjBooth.getState();
    return {
      planIndex: s.planIndex,
      state: s.state,
      started: s.started,
      cur: s.current?.planIndex ?? null,
    } as Snap;
  });
type Item = { kind: string; tanda: number; id?: string; title: string; lengthSec: number };
const planOf = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as { __tdjBooth: { getState: () => { plan: { items: Item[] } } } }
      ).__tdjBooth.getState().plan.items,
  );
const sourcesOf = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __tdjBooth: { getState: () => { sources: string[] } } }).__tdjBooth.getState()
        .sources,
  );
async function start(page: Page) {
  await page.getByTestId("booth-start").click();
  await expect.poll(async () => (await snap(page)).state, { timeout: 20000 }).toBe("playing");
}

/** the layout, measured in the page: cells, chips, the stack, the columns, what elementFromPoint hits */
const measure = (page: Page) =>
  page.evaluate(() => {
    const vis = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    };
    const box = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
      };
    };
    const strip = document.querySelector('[data-testid="booth-strip"]')!;
    const cells = [...strip.querySelectorAll<HTMLElement>(".booth-tbtn")].filter(vis);
    const primary = strip.querySelector<HTMLElement>(".booth-primary");
    const chips = [
      ...document.querySelectorAll<HTMLElement>(".booth-toolbar > *"),
      ...document.querySelectorAll<HTMLElement>('[data-testid="booth-find-songs"]'),
    ].filter(vis);
    const hit = [...cells, ...(primary ? [primary] : [])].map((b) => {
      const r = b.getBoundingClientRect();
      const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { id: b.dataset.testid, ok: !!at && (at === b || b.contains(at)) };
    });
    const deck = document.querySelector(".booth-deck");
    const col = document.querySelector(".booth-col-set");
    const panel = document.querySelector('[data-testid="booth-controls"]');
    const grid = document.querySelector(".booth-grid");
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      scrollY: window.scrollY,
      cells: cells.map((c) => ({
        id: c.dataset.testid,
        w: c.getBoundingClientRect().width,
        h: c.getBoundingClientRect().height,
      })),
      primary: box(primary),
      chips: chips.map((c) => ({ id: c.dataset.testid ?? c.className, h: c.getBoundingClientRect().height })),
      hit,
      strip: box(strip),
      panel: box(panel),
      deck: box(deck),
      col: col && vis(col) ? box(col) : null,
      grid: box(grid),
      twoCols: !!col && vis(col) && getComputedStyle(col).overflowY === "auto",
      stripBg: getComputedStyle(strip, "::after").backgroundColor,
      seps: [...strip.querySelectorAll<HTMLElement>(".booth-strip-sep")]
        .filter(vis)
        .map((s) => s.getBoundingClientRect().height),
    };
  });
const overlaps = (
  a: { left: number; right: number; top: number; bottom: number } | null,
  b: { left: number; right: number; top: number; bottom: number } | null,
) =>
  !!a && !!b && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;

for (const [name, opts, o] of DEVICES) {
  test(`${name}: one aligned bottom stack, uniform transport cells, one chip height, nothing overlaps`, async ({
    browser,
  }) => {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await openBooth(page, { ipad: name.startsWith("ipad") });
    if (o.collapse) {
      await page.getByTestId("sidebar-hide").click();
      await expect(page.getByTestId("sidebar")).toBeHidden();
    }
    await page.waitForTimeout(500);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-before-start.png` });
    const before = await measure(page);
    await start(page);
    await page.waitForTimeout(500);
    const m = await measure(page);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-playing.png` });

    // the transport: every secondary cell the same width and height (±1 px), ≥ 44 px; the primary as tall
    expect(m.cells.length).toBeGreaterThanOrEqual(4);
    const w0 = m.cells[0]!.w;
    const h0 = m.cells[0]!.h;
    for (const c of m.cells) {
      expect(Math.abs(c.w - w0), `${c.id} width ${c.w} vs ${w0}`).toBeLessThanOrEqual(1);
      expect(Math.abs(c.h - h0), `${c.id} height ${c.h} vs ${h0}`).toBeLessThanOrEqual(1);
      expect(c.w).toBeGreaterThanOrEqual(43.5);
      expect(c.h).toBeGreaterThanOrEqual(43.5);
    }
    expect(Math.abs(m.primary!.h - h0)).toBeLessThanOrEqual(1);
    // the primary keeps its width from "Start · 30 s clips" to "Pause" (the phone's fills what is left)
    if (m.vw >= 600) expect(Math.abs(m.primary!.w - before.primary!.w)).toBeLessThanOrEqual(1);
    for (const s of m.seps) expect(Math.abs(s - m.seps[0]!)).toBeLessThanOrEqual(0.5);
    // one row, inside the viewport, every cell hit where it is drawn
    expect(m.strip!.h).toBeLessThanOrEqual(72);
    expect(m.strip!.left).toBeGreaterThanOrEqual(0);
    expect(m.strip!.right).toBeLessThanOrEqual(m.vw);
    for (const h of m.hit) expect(h.ok, `elementFromPoint on ${h.id}`).toBe(true);
    // solid: nothing shows through the transport
    expect(m.stripBg).toMatch(/^rgb\(/);
    // the stack is aligned with the content column (respecting the sidebar)
    if (m.vw >= 600) {
      expect(Math.abs(m.strip!.left - m.grid!.left)).toBeLessThanOrEqual(2);
      expect(Math.abs(m.strip!.right - m.grid!.right)).toBeLessThanOrEqual(2);
    }
    // the chips under the title: one height (44 px on touch)
    for (const c of m.chips) {
      expect(Math.abs(c.h - m.chips[0]!.h), `${c.id}`).toBeLessThanOrEqual(1);
      expect(c.h).toBeGreaterThanOrEqual(43.5);
    }
    // the collapsed Controls panel is only its toggle, in the transport row: no second Previous / Play / Next
    expect(m.panel).toBeNull();
    await expect(page.getByTestId("ctl-prev")).toHaveCount(0);
    await expect(page.getByTestId("booth-strip").getByTestId("booth-controls-toggle")).toBeVisible();
    // the columns (two on iPad landscape and a desktop) end above the transport, the page holds still
    if (m.twoCols) {
      expect(m.col!.bottom).toBeLessThanOrEqual(m.strip!.top + 1);
      expect(m.deck!.bottom).toBeLessThanOrEqual(m.strip!.top + 1);
      expect(overlaps(m.col, m.strip)).toBe(false);
      expect(m.scrollY).toBe(0);
      // the last visible set-list row is above the transport
      const last = await page.evaluate(() => {
        const col = document.querySelector(".booth-col-set")!.getBoundingClientRect();
        const rows = [...document.querySelectorAll(".booth-col-set .booth-row")].map((r) =>
          r.getBoundingClientRect(),
        );
        const seen = rows.filter((r) => r.top < col.bottom && r.bottom > col.top);
        return seen.at(-1)!;
      });
      expect(Math.min(last.bottom, m.col!.bottom)).toBeLessThanOrEqual(m.strip!.top + 1);
    } else {
      // one column: the page's foot clears the transport
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(400);
      const foot = await page.evaluate(() => {
        const cards = [...document.querySelectorAll(".booth-deck > *, .booth-col-set > *")];
        return Math.max(...cards.map((c) => c.getBoundingClientRect().bottom));
      });
      const strip = (await page.getByTestId("booth-strip").boundingBox())!;
      expect(foot).toBeLessThanOrEqual(strip.y + 1);
    }

    // the Controls panel open: the same insets, docked above the transport, the columns end above it
    await page.getByTestId("booth-controls-toggle").click();
    await expect(page.getByTestId("booth-controls")).toBeVisible();
    await page.waitForTimeout(400);
    const p = await measure(page);
    expect(overlaps(p.panel, p.strip)).toBe(false);
    expect(p.panel!.bottom).toBeLessThanOrEqual(p.strip!.top + 1);
    expect(Math.abs(p.panel!.left - p.strip!.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(p.panel!.right - p.strip!.right)).toBeLessThanOrEqual(1);
    if (p.twoCols) {
      expect(p.col!.bottom).toBeLessThanOrEqual(p.panel!.top + 1);
      expect(p.deck!.bottom).toBeLessThanOrEqual(p.panel!.top + 1);
    }
    for (const h of p.hit) expect(h.ok, `elementFromPoint on ${h.id} (panel open)`).toBe(true);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-controls-open.png` });
    await page.getByTestId("booth-controls-toggle").click();
    await ctx.close();
  });
}

/** every text on a Booth button or chip against its real (composited) background */
const contrastFailures = (page: Page) =>
  page.evaluate(() => {
    type C = [number, number, number, number];
    const parse = (s: string): C | null => {
      const m = s.match(/rgba?\(([^)]+)\)/);
      if (!m) {
        const c = s.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/);
        if (!c) return null;
        return [+c[1]! * 255, +c[2]! * 255, +c[3]! * 255, c[4] === undefined ? 1 : +c[4]];
      }
      const p = m[1]!
        .split(/[\s,/]+/)
        .filter(Boolean)
        .map(Number);
      return [p[0]!, p[1]!, p[2]!, p[3] ?? 1];
    };
    const over = (top: C, under: C): C => {
      const a = top[3] + under[3] * (1 - top[3]);
      if (a === 0) return [0, 0, 0, 0];
      return [0, 1, 2]
        .map((i) => (top[i]! * top[3] + under[i]! * under[3] * (1 - top[3])) / a)
        .concat(a) as C;
    };
    const lum = (c: C) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const ratio = (a: C, b: C) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x! + 0.05) / (y! + 0.05);
    };
    const page0 = parse(getComputedStyle(document.documentElement).backgroundColor)!;
    const bgOf = (el: Element): C => {
      const layers: C[] = [];
      for (let e: Element | null = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        const after = getComputedStyle(e, "::after");
        if (e.classList.contains("glass")) {
          const a = parse(after.backgroundColor);
          if (a && a[3] > 0) layers.push(a);
        }
        const c = parse(cs.backgroundColor);
        if (c && c[3] > 0) layers.push(c);
        if (layers.length && layers[layers.length - 1]![3] >= 0.999) break;
      }
      let acc: C = page0;
      for (let i = layers.length - 1; i >= 0; i--) acc = over(layers[i]!, acc);
      return acc;
    };
    const hosts = [
      ...document.querySelectorAll<HTMLElement>(
        ".booth button, .booth a, .booth .booth-chip, .booth .tanda-type, [data-testid='booth-strip'] button",
      ),
    ].filter((el) => {
      const r = el.getBoundingClientRect();
      return (
        r.width > 0 &&
        r.height > 0 &&
        !el.closest(".booth-played, [data-bypassed], [role='dialog'], .booth-row-energy") &&
        getComputedStyle(el).visibility !== "hidden"
      );
    });
    const out: string[] = [];
    let checked = 0;
    for (const h of hosts) {
      const texts = [h, ...h.querySelectorAll<HTMLElement>("*")].filter((e) =>
        [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim().length > 0),
      );
      for (const e of texts) {
        const cs = getComputedStyle(e);
        if (cs.visibility === "hidden" || e.getBoundingClientRect().width === 0) continue;
        // (an artwork placeholder's initials sit on a picture-like gradient: artwork, not text to read)
        if (e.closest(".booth-art, [data-testid='artwork']")) continue;
        // opacity on the way up (a dimmed group) scales the text
        let op = 1;
        // (up to the first opaque background: above it the text and its background fade together)
        for (let x: Element | null = e; x && x !== document.body; x = x.parentElement) {
          op *= Number(getComputedStyle(x).opacity);
          const bx = parse(getComputedStyle(x).backgroundColor);
          if (bx && bx[3] >= 0.999) break;
        }
        const bg = bgOf(e);
        const fg0 = parse(cs.color)!;
        const fg = over([fg0[0], fg0[1], fg0[2], fg0[3] * op], bg);
        const r = ratio(fg, bg);
        const size = Number.parseFloat(cs.fontSize);
        const bold = Number(cs.fontWeight) >= 700;
        const large = size >= 24 || (bold && size >= 18.66);
        const disabled = (e.closest("button") as HTMLButtonElement | null)?.disabled;
        const need = disabled || large ? 3 : 4.5;
        checked++;
        if (r < need - 0.01)
          out.push(
            `${(h.dataset.testid ?? h.className).slice(0, 40)} “${e.textContent!.trim().slice(0, 24)}” ${r.toFixed(2)} < ${need}`,
          );
      }
    }
    return { out, checked };
  });

for (const light of [false, true]) {
  const scheme = light ? "light" : "dark";
  test(`iPad landscape, ${scheme}: every Booth button and chip meets WCAG AA (before and during the night, panel open)`, async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ ...IPAD_L, colorScheme: scheme });
    const page = await ctx.newPage();
    await openBooth(page, { light, ipad: true });
    await page.waitForTimeout(400);
    const a = await contrastFailures(page);
    expect(a.checked).toBeGreaterThan(40);
    expect(a.out, a.out.join("\n")).toEqual([]);
    await start(page);
    await page.getByTestId("booth-controls-toggle").click();
    await page.waitForTimeout(400);
    const b = await contrastFailures(page);
    expect(b.out, b.out.join("\n")).toEqual([]);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/contrast-ipad-landscape-${scheme}.png` });
    await ctx.close();
  });
}

test("iPad landscape: the columns scroll on their own, end above the transport, follow the playing row; Back to now; no hint on a tap", async ({
  browser,
}) => {
  const ctx = await browser.newContext(IPAD_L);
  const page = await ctx.newPage();
  await openBooth(page, { ipad: true });
  const col = page.locator(".booth-col-set");
  const deck = page.locator(".booth-deck");
  const top = (sel: string) => page.evaluate((s) => document.querySelector(s)!.scrollTop, sel);
  // the right column scrolls, the left one and the page stay
  await col.evaluate((el) => {
    el.scrollTop = 400;
  });
  expect(await top(".booth-col-set")).toBeGreaterThan(100);
  expect(await top(".booth-deck")).toBe(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  // and the other way round (the wheel over the deck moves the deck only)
  const d = (await deck.boundingBox())!;
  await page.mouse.move(d.x + d.width / 2, d.y + d.height - 60);
  await page.mouse.wheel(0, 300);
  await expect.poll(() => top(".booth-deck")).toBeGreaterThan(0);
  expect(await top(".booth-col-set")).toBeGreaterThan(100);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  // the Now card stays at the deck's top
  const now = (await page.getByTestId("booth-now").boundingBox())!;
  expect(Math.abs(now.y - d.y)).toBeLessThanOrEqual(2);
  await deck.evaluate((el) => {
    el.scrollTop = 0;
  });
  await col.evaluate((el) => {
    el.scrollTop = 0;
  });
  // a tap on touch never shows a hint over the controls
  await page.getByTestId("booth-clock").tap();
  await page.getByTestId("booth-last4").tap();
  await page.waitForTimeout(900);
  await expect(page.getByTestId("booth-hint")).toHaveCount(0);
  await expect(page.getByTestId("tip")).toHaveCount(0);
  await page.getByTestId("booth-last4").tap();
  await page.waitForTimeout(300);

  // during the night the playing row stays in view as songs advance
  await start(page);
  const inView = () =>
    page.evaluate(() => {
      const c = document.querySelector(".booth-col-set")!.getBoundingClientRect();
      const r = document
        .querySelector('.booth-col-set .booth-row[aria-current="true"]')
        ?.getBoundingClientRect();
      return !!r && r.top >= c.top - 1 && r.bottom <= c.bottom + 1;
    });
  for (let k = 0; k < 6; k++) {
    const cur = (await snap(page)).cur;
    await page.evaluate(() =>
      (window as unknown as { __tdjBooth: { getState: () => { nextNow: () => Promise<void> } } }).__tdjBooth
        .getState()
        .nextNow(),
    );
    await expect.poll(async () => (await snap(page)).cur, { timeout: 15000 }).not.toBe(cur);
    await expect.poll(inView, { timeout: 6000 }).toBe(true);
  }
  // scrolled away by the DJ: it stays there (no jump back under the finger), with "Back to now"
  const c = (await col.boundingBox())!;
  await page.mouse.move(c.x + c.width / 2, c.y + 80);
  await page.mouse.wheel(0, -4000);
  await expect.poll(inView).toBe(false);
  await expect(page.getByTestId("booth-back-to-now")).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(2500);
  expect(await inView()).toBe(false);
  await page.getByTestId("booth-back-to-now").click();
  await expect.poll(inView).toBe(true);
  // both columns still end above the transport
  const strip = (await page.getByTestId("booth-strip").boundingBox())!;
  for (const b of [await col.boundingBox(), await deck.boundingBox()])
    expect(b!.y + b!.height).toBeLessThanOrEqual(strip.y + 1);
  await ctx.close();
});

test("the light confirmation: before the night none; mid-night a tap on Next does nothing, a hold or a second tap does; keys; Settings turns it off", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooth(page);
  const next = page.getByTestId("booth-next-now");
  // before the night: one tap moves the playhead at once
  const p0 = (await snap(page)).planIndex;
  await next.click();
  await expect.poll(async () => (await snap(page)).planIndex).not.toBe(p0);
  await start(page);
  const a = (await snap(page)).cur;
  // one tap: nothing changes, the button says to hold
  await next.click();
  await expect(next).toContainText("Hold");
  await page.waitForTimeout(600);
  expect((await snap(page)).cur).toBe(a);
  // the hold plays the next one
  await hold(page, next);
  await expect.poll(async () => (await snap(page)).cur, { timeout: 15000 }).not.toBe(a);
  const b = (await snap(page)).cur;
  // the keyboard: → arms (the transport's Next says "Tap again"), Esc cancels, → → confirms
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("ArrowRight");
  await expect(next).toHaveAttribute("data-armed", "true");
  await page.keyboard.press("Escape");
  await expect(next).not.toHaveAttribute("data-armed", "true");
  await page.waitForTimeout(300);
  expect((await snap(page)).cur).toBe(b);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await snap(page)).cur, { timeout: 15000 }).not.toBe(b);
  // End tanda after this song: tap-to-arm
  const end = page.getByTestId("booth-end-tanda");
  if (await end.isEnabled()) {
    await end.click();
    await expect(end).toHaveAttribute("data-armed", "true");
    await expect(end).toContainText("Tap again to confirm");
  }
  // Settings → Booth → off: a single tap advances
  await page.goto("/settings");
  const sw = page.getByRole("switch", { name: "Confirm actions that change the song" });
  await expect(sw).toBeChecked();
  await sw.click();
  await expect(sw).not.toBeChecked();
  await page.goto("/booth");
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("booth-ttc")).not.toHaveAttribute("data-resolving", "1", { timeout: 30000 });
  // (a night younger than 12 h offers to resume: start from the beginning)
  const fresh = page.getByTestId("booth-resume").getByRole("button", { name: "Start from the beginning" });
  await fresh.waitFor({ timeout: 5000 }).catch(() => {});
  if (await fresh.isVisible().catch(() => false)) await fresh.click();
  await expect(page.getByTestId("booth-resume")).toHaveCount(0);
  await start(page);
  const c = (await snap(page)).cur;
  await page.getByTestId("booth-next-now").click();
  await expect.poll(async () => (await snap(page)).cur, { timeout: 15000 }).not.toBe(c);
});

test("one tap plays: a row before the night starts there; the artwork and Up Next do what the row does; mid-night a row arms Play now in the room", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooth(page);
  const items = await planOf(page);
  const sources = await sourcesOf(page);
  const playable = items
    .map((it, i) => ({ it, i }))
    .filter(({ it, i }) => it.kind === "track" && sources[i] !== "missing")
    .map(({ i }) => i);
  const third = playable[2]!;
  // before the night: a tap on the row (its title) plays it in the room, the night starts there
  await page.locator(`.booth-row[data-plan-index="${third}"]`).getByTestId("booth-row-play").click();
  await expect.poll(async () => (await snap(page)).cur, { timeout: 20000 }).toBe(third);
  expect((await snap(page)).state).toBe("playing");
  // mid-night, no headphones chosen: a tap on a later row's artwork opens its sheet with Play now armed, the room
  // keeps its song
  const later = playable[8]!;
  const row = page.locator(`.booth-row[data-plan-index="${later}"]`);
  await row.scrollIntoViewIfNeeded();
  await row.getByTestId("booth-art").first().click();
  const sheet = page.getByTestId("booth-play-sheet");
  await expect(sheet).toBeVisible();
  const playNow = sheet.getByTestId("booth-play-now");
  await expect(playNow).toHaveAttribute("data-armed", "true");
  expect((await snap(page)).cur).toBe(third);
  await playNow.click();
  await expect.poll(async () => (await snap(page)).cur, { timeout: 15000 }).toBe(later);
  // Up Next: the same rule (its sheet, armed)
  await page.getByTestId("booth-next-play").click();
  await expect(sheet.getByTestId("booth-play-now")).toHaveAttribute("data-armed", "true");
  expect((await snap(page)).cur).toBe(later);
  await page.keyboard.press("Escape");
});

test("the order inside a tanda: mid-night songs 3 and 4 change places (Undo restores); after song 2, song 4 plays", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooth(page);
  const items = await planOf(page);
  // a tanda whose four songs all have a clip tonight (the rehearsal passes over one without)
  const sources = await sourcesOf(page);
  const tracksOf = (t: number) =>
    items
      .map((it, i) => ({ it, i }))
      .filter(({ it }) => it.kind === "track" && it.tanda === t)
      .map(({ i }) => i);
  const tanda = [...new Set(items.map((x) => x.tanda))].find(
    (t) => t > 0 && tracksOf(t).length >= 4 && tracksOf(t).every((i) => sources[i] !== "missing"),
  )!;
  const t1 = tracksOf(tanda);
  expect(t1.length).toBeGreaterThanOrEqual(4);
  const [s1, s2, s3, s4] = t1 as [number, number, number, number];
  const id3 = items[s3]!.id;
  const id4 = items[s4]!.id;
  // start on song 1
  await page.locator(`.booth-row[data-plan-index="${s1}"]`).getByTestId("booth-row-play").click();
  await expect.poll(async () => (await snap(page)).cur, { timeout: 20000 }).toBe(s1);
  // song 4's sheet: Move up (no confirmation: the room's song is untouched)
  await page.locator(`.booth-row[data-plan-index="${s4}"]`).getByTestId("booth-row-open").click();
  await page.getByTestId("booth-play-sheet").getByRole("button", { name: "Move up" }).click();
  await expect.poll(async () => (await planOf(page))[s3]!.id).toBe(id4);
  expect((await planOf(page))[s4]!.id).toBe(id3);
  expect((await snap(page)).cur).toBe(s1);
  // Undo restores
  await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await planOf(page))[s3]!.id).toBe(id3);
  // by drag (the row's number is the handle)
  const from = (await page
    .locator(`.booth-row[data-plan-index="${s4}"] [data-testid="booth-row-open"]`)
    .boundingBox())!;
  const to = (await page.locator(`.booth-row[data-plan-index="${s3}"]`).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await planOf(page))[s3]!.id).toBe(id4);
  // the playing song cannot move
  await page.locator(`.booth-row[data-plan-index="${s1}"]`).getByTestId("booth-row-open").click();
  await expect(page.getByTestId("booth-play-sheet").getByRole("button", { name: "Move up" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  // after song 2, song 4 plays
  await hold(page, page.getByTestId("booth-next-now"));
  await expect.poll(async () => (await snap(page)).cur, { timeout: 15000 }).toBe(s2);
  await hold(page, page.getByTestId("booth-next-now"));
  await expect.poll(async () => (await snap(page)).cur, { timeout: 15000 }).toBe(s3);
  expect((await planOf(page))[s3]!.id).toBe(id4);
  // Compose's set follows (the store's playlist)
  const order = await page.evaluate((t) => {
    const p = JSON.parse(localStorage.getItem("tdj-v1") ?? "{}")?.state?.playlist;
    return p?.tandas?.[t - 1]?.songs?.map((s: { id: string }) => s.id) ?? null;
  }, tanda);
  if (order) expect(order.indexOf(id4)).toBeLessThan(order.indexOf(id3));
});

test("the tanda's type and total: tanda 1's badge and '4 songs · m:ss' match the plan; every row has its length", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooth(page);
  const items = await planOf(page);
  const songs = items.filter((x) => x.kind === "track" && x.tanda === 1);
  const sec = songs.reduce((s, x) => s + x.lengthSec, 0);
  const mmss = `${Math.floor(Math.round(sec) / 60)}:${String(Math.round(sec) % 60).padStart(2, "0")}`;
  const head = page.locator('.booth-tanda[data-tanda="1"]');
  await expect(head.getByTestId("booth-tanda-total")).toHaveText(`${songs.length} songs · ${mmss}`);
  const pl = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem("tdj-v1") ?? "{}")?.state?.playlist;
    const t = p?.tandas?.[0];
    return t
      ? { rhythm: t.rhythm as string, vocal: !!t.vocal, singer: (t.singer as string | null) ?? null }
      : null;
  });
  const badge = head.getByTestId("tanda-type");
  if (pl) {
    await expect(badge).toContainText(pl.rhythm[0]!.toUpperCase() + pl.rhythm.slice(1));
    await expect(badge).toContainText(
      pl.vocal ? (pl.singer ? `Vocal · ${pl.singer}` : "Vocal") : "Instrumental",
    );
  }
  // the Now card and the next tanda carry the badge too
  await expect(page.getByTestId("booth-now").getByTestId("tanda-type")).toBeVisible();
  // every row: its length, tabular
  const lens = await page
    .locator('.booth-row[data-kind="track"] [data-testid="booth-row-len"]')
    .allInnerTexts();
  expect(lens.length).toBeGreaterThan(20);
  for (const l of lens) expect(l).toMatch(/^(\d+:\d\d|–:–)$/);
  // a single year never reads "1941–1941"
  await expect(page.getByTestId("booth")).not.toContainText(/\b(\d{4})–\1\b/);
});

test("iPad Safari with Spotify Premium and no device: 'Spotify · pick a device', ROOM asks, never 30 s clips", async ({
  browser,
}) => {
  const ctx = await browser.newContext(IPAD_L);
  const page = await ctx.newPage();
  let devicesList: unknown[] = [];
  await page.route("**/api/spotify/me", (r) =>
    r.fulfill({
      json: {
        hosted: true,
        user: { id: "e2e", display_name: "E2E", product: "premium" },
        token: { access: "e2e-token", expires: Date.now() + 3_600_000 },
        scopes: ["streaming", "user-modify-playback-state", "user-read-playback-state", "user-read-private"],
      },
    }),
  );
  await page.route("**/api/spotify/access", (r) => r.fulfill({ json: { access: "e2e-token" } }));
  const sdk: string[] = [];
  await page.route("https://sdk.scdn.co/**", (r) => {
    sdk.push(r.request().url());
    return r.fulfill({ status: 404, body: "" });
  });
  await page.route("https://api.spotify.com/**", (r) =>
    r.request().url().endsWith("/me/player/devices")
      ? r.fulfill({ json: { devices: devicesList } })
      : r.fulfill({ status: 204 }),
  );
  await openBooth(page, { ipad: true });
  const mode = page.getByTestId("booth-mode");
  await expect(mode).toHaveText("Spotify · pick a device", { timeout: 15000 });
  await expect(mode).toHaveAttribute("data-state", "pick-device");
  await expect(page.getByTestId("booth-out-room")).toHaveAttribute("data-attention", "true");
  await expect(page.getByTestId("booth-start")).toHaveText("Start · Spotify");
  expect(sdk).toEqual([]);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/ipad-landscape-spotify-pick-device.png` });
  // the iPad's Spotify app shows up: ROOM lists it, the status says full tracks
  devicesList = [{ id: "ipad", name: "iPad", type: "Tablet", is_active: true }];
  await page.getByTestId("booth-out-room").click();
  await expect(page.getByTestId("booth-output-sheet")).toContainText("iPad", { timeout: 10000 });
  await page.keyboard.press("Escape");
  await expect(mode).toHaveText("Spotify · full tracks");
  await expect(page.getByTestId("booth-out-room")).not.toHaveAttribute("data-attention", "true");
  await ctx.close();
});

/**
 * 2026-11 (the owner's iPad, landscape, sidebar open): the floor reactions were drawn over the first tanda header's
 * "4 songs · 11:41". Every tanda header is two clusters: no button's box meets the title, the type badge or the
 * total; nothing leaves the header; every button keeps 44 px. A narrow column shows one "Floor…" menu, a wide one
 * the three icons.
 */
const tandaHeads = (page: Page) =>
  page.evaluate(() => {
    const vis = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      // (an sr-only legend is a 1 px clipped box: not drawn)
      return r.width > 1 && r.height > 1 && cs.visibility !== "hidden";
    };
    const meet = (a: DOMRect, b: DOMRect) =>
      a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    const out: string[] = [];
    let heads = 0;
    let buttons = 0;
    let texts = 0;
    for (const h of document.querySelectorAll<HTMLElement>('[data-testid="booth-tanda-head"]')) {
      if (!vis(h)) continue;
      heads++;
      const n = h.closest<HTMLElement>(".booth-tanda")?.dataset.tanda;
      const hr = h.getBoundingClientRect();
      const words = [
        ...h.querySelectorAll<HTMLElement>(
          '[data-testid="booth-tanda-title"], [data-testid="tanda-type"], [data-testid="booth-tanda-total"]',
        ),
      ].filter(vis);
      texts += words.length;
      for (const b of [...h.querySelectorAll<HTMLElement>("button")].filter(vis)) {
        buttons++;
        const br = b.getBoundingClientRect();
        if (br.width < 43.5 || br.height < 43.5)
          out.push(`tanda ${n}: ${b.dataset.testid} ${br.width.toFixed(0)}×${br.height.toFixed(0)} < 44`);
        for (const w of words)
          if (meet(br, w.getBoundingClientRect()))
            out.push(`tanda ${n}: ${b.dataset.testid ?? b.className} over ${w.dataset.testid}`);
      }
      // the total is never cut (the title may end in an ellipsis)
      const total = h.querySelector<HTMLElement>('[data-testid="booth-tanda-total"]');
      if (total && total.scrollWidth > total.clientWidth + 1) out.push(`tanda ${n}: the total is cut`);
      if (h.scrollWidth > h.clientWidth + 1) out.push(`tanda ${n}: the header scrolls sideways`);
      for (const e of h.querySelectorAll("*")) {
        if (!vis(e)) continue;
        // what is drawn: the box cut by any clipping ancestor inside the header (a truncated title's long name)
        const r = e.getBoundingClientRect();
        let [l, t, rt, bt] = [r.left, r.top, r.right, r.bottom];
        for (let x = e.parentElement; x && x !== h; x = x.parentElement) {
          const cs = getComputedStyle(x);
          if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
          const c = x.getBoundingClientRect();
          [l, t, rt, bt] = [
            Math.max(l, c.left),
            Math.max(t, c.top),
            Math.min(rt, c.right),
            Math.min(bt, c.bottom),
          ];
        }
        if (rt - l <= 0 || bt - t <= 0) continue;
        if (l < hr.left - 1 || rt > hr.right + 1 || t < hr.top - 1 || bt > hr.bottom + 1)
          out.push(
            `tanda ${n}: ${(e as HTMLElement).dataset.testid ?? e.getAttribute("class") ?? e.tagName} “${(e.textContent ?? "").slice(0, 30)}” leaves the header`,
          );
      }
    }
    const set = document.querySelector<HTMLElement>(".booth-set-sheet .booth-set, .booth-col-set .booth-set");
    return { heads, buttons, texts, out, setW: set?.clientWidth ?? 0 };
  });

for (const [name, opts, o] of DEVICES) {
  test(`${name}: every tanda header keeps its buttons off the title, type and total; nothing leaves it`, async ({
    browser,
  }) => {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await openBooth(page, { ipad: name.startsWith("ipad") });
    if (o.collapse) {
      await page.getByTestId("sidebar-hide").click();
      await expect(page.getByTestId("sidebar")).toBeHidden();
    }
    await start(page);
    const phone = name === "iphone-15-pro";
    if (phone) {
      await page.getByTestId("booth-set-open").click();
      await expect(page.getByTestId("booth-set-sheet")).toBeVisible();
    }
    const set = page.locator(phone ? ".booth-set-sheet .booth-set" : ".booth-col-set .booth-set");
    // the longest action clusters: the playing tanda (the floor, praise, swap) and a tanda skipped tonight
    await set.locator('.booth-tanda[data-tanda="2"] [data-testid="booth-bypass"]').click();
    await expect(set.locator('.booth-tanda[data-tanda="2"]')).toHaveAttribute("data-bypassed", "true");
    await page.waitForTimeout(400);
    const head1 = set.locator('.booth-tanda[data-tanda="1"] [data-testid="booth-tanda-head"]');
    await expect(head1.getByTestId("booth-tanda-total")).toHaveText(/\d songs · \d+:\d\d/);
    const a = await tandaHeads(page);
    expect(a.heads).toBeGreaterThanOrEqual(10);
    expect(a.texts).toBeGreaterThanOrEqual(a.heads * 2);
    expect(a.out, a.out.join("\n")).toEqual([]);
    // a narrow column shows one "Floor…" menu, a wide one the three icons (the iPad's landscape with the sidebar
    // open and the iPhone are narrow)
    const narrow = a.setW < 460;
    if (name === "ipad-landscape" || phone) expect(narrow).toBe(true);
    const menuBtn = head1.getByTestId("set-1-floor-menu-btn");
    if (SHOTS) {
      await page.screenshot({ path: `${SHOTS}/tanda-head-${name}.png` });
      await head1.screenshot({ path: `${SHOTS}/tanda-head-${name}-tanda1.png` });
    }
    if (narrow) {
      await expect(menuBtn).toBeVisible();
      await expect(menuBtn).toHaveText("Floor…");
      await expect(head1.getByTestId("set-1-floor")).toBeHidden();
      await menuBtn.click();
      await expect(menuBtn).toHaveAttribute("aria-expanded", "true");
      const pop = head1.getByTestId("set-1-floor-pop");
      await expect(pop).toBeVisible();
      const pb = (await pop.boundingBox())!;
      expect(pb.x).toBeGreaterThanOrEqual(0);
      expect(pb.x + pb.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      for (const r of ["full", "ok", "emptied"]) {
        const bb = (await pop.getByTestId(`set-1-menu-floor-${r}`).boundingBox())!;
        expect(bb.height).toBeGreaterThanOrEqual(43.5);
      }
      await expect(pop.getByTestId("set-1-menu-floor-full")).toHaveText("Floor full ♥");
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/tanda-head-${name}-floor-menu.png` });
      await pop.getByTestId("set-1-menu-floor-full").click();
      await expect(pop).toHaveCount(0);
      await expect(menuBtn).toHaveAttribute("data-reaction", "full");
      await expect(menuBtn).toHaveAttribute("aria-expanded", "false");
      // Escape and a tap outside close it too
      await menuBtn.click();
      await expect(pop).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(pop).toHaveCount(0);
      // (the menu only: the phone's set-list sheet stays open)
      if (phone) await expect(page.getByTestId("booth-set-sheet")).toBeVisible();
      await menuBtn.click();
      await expect(pop).toBeVisible();
      await head1.getByTestId("booth-tanda-title").click();
      await expect(pop).toHaveCount(0);
    } else {
      await expect(menuBtn).toBeHidden();
      await head1.getByTestId("set-1-floor-full").click();
      await expect(head1.getByTestId("set-1-floor-full")).toHaveAttribute("aria-pressed", "true");
    }
    // with a reaction chosen (the menu button shows its glyph) the header still holds
    await page.waitForTimeout(200);
    const b = await tandaHeads(page);
    expect(b.out, b.out.join("\n")).toEqual([]);
    if (SHOTS) await head1.screenshot({ path: `${SHOTS}/tanda-head-${name}-tanda1-reacted.png` });
    await ctx.close();
  });
}
