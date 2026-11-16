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
import { boothAction, hold } from "./confirm";

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
    // (a phone's bar keeps the transport: Controls is a row of its •••)
    if (m.vw >= 600)
      await expect(page.getByTestId("booth-strip").getByTestId("booth-controls-toggle")).toBeVisible();
    else await expect(page.getByTestId("booth-strip").getByTestId("booth-controls-toggle")).toHaveCount(0);
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

    // the Controls panel open: the same insets, docked above the transport, the columns end above it (a phone: •••)
    await boothAction(page, "booth-controls-toggle");
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
    await boothAction(page, "booth-controls-toggle");
    await ctx.close();
  });
}

/** every text on a Booth button or chip against its real (composited) background */
const contrastFailures = (page: Page) =>
  page.evaluate(async () => {
    // the colours at rest: a button that just became ready (Start, once the night's sources resolve) fades from its
    // disabled 0.55 opacity, and mid-fade it read as an enabled button at 3.1:1 (CI, 2026-11). Wait for the running
    // CSS transitions (never the endless animations: the level meter, the spinners) before reading a colour.
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a instanceof CSSTransition)
        .map((a) => a.finished.catch(() => {})),
    );
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
        // (and the tanda's number tile on its rhythm gradient, the tap-to-play cover: artwork too)
        if (e.closest(".booth-art, .tile-art, [data-testid='artwork']")) continue;
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
  // 2026-11 ("on scroll the upper and lower bars mix"): the deck scrolls as one column — the Now card moves with it
  // and never overlaps Up Next (it was pinned, and the cards slid under it)
  const now = (await page.getByTestId("booth-now").boundingBox())!;
  const nextCard = (await page.getByTestId("booth-next").boundingBox())!;
  expect(now.y).toBeLessThan(d.y);
  expect(nextCard.y - (now.y + now.height)).toBeGreaterThanOrEqual(11);
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
  // one tap: nothing changes, it arms — one bubble says "Tap again or hold to confirm" (the label stays "Next")
  await next.click();
  await expect(page.getByTestId("booth-next-now-nudge")).toHaveText("Tap again or hold to confirm");
  await expect(next.locator(".booth-tbtn-l")).toHaveText("Next");
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
    await expect(end).toContainText("Tap again or hold to confirm");
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
      await boothAction(page, "booth-set-open");
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
    // (the container query reads the list's content box: its width less 2 × 6 px of padding)
    const narrow = a.setW - 12 < 460;
    if (name === "ipad-landscape" || phone) expect(narrow).toBe(true);
    const menuBtn = head1.getByTestId("set-1-floor-menu-btn");
    if (SHOTS) {
      await page.screenshot({ path: `${SHOTS}/tanda-head-${name}.png` });
      await head1.screenshot({ path: `${SHOTS}/tanda-head-${name}-tanda1.png` });
    }
    if (narrow) {
      await expect(menuBtn).toBeVisible();
      await expect(menuBtn).toHaveText("Floor"); // (2026-11: the word and a chevron; "Floor…" read as cut)
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

/**
 * 2026-11 — the design review (iPad Pro 11 landscape, Safari, touch) and the DJ review after it: the Controls panel's
 * groups have one sizing scale (Cue inside its card, one Song row of 44 px controls, no second Previous / Play / Next)
 * and a capped height that keeps the Now card's countdown whole; no hint after a click or a tap; played rows and the
 * gap pill at ≥ 4.5:1 with colour tokens; the tanda header's buttons one family; the Start label whole in en and tr;
 * one row height; the set list keeps ≥ 6 rows while a night plays; the Booth's sheets near-opaque; Escape closes the
 * panel; a Turkish eyebrow without English words; iPad portrait's chips in two rows at most.
 */
/** the contrast of one element's text on its composited background (opacity on the way up included) */
const textContrast = (page: Page, sel: string) =>
  page.evaluate((s) => {
    type C = [number, number, number, number];
    const parse = (v: string): C | null => {
      const m = v.match(/rgba?\(([^)]+)\)/);
      if (!m) {
        const c = v.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/);
        return c ? [+c[1]! * 255, +c[2]! * 255, +c[3]! * 255, c[4] === undefined ? 1 : +c[4]] : null;
      }
      const p = m[1]!
        .split(/[\s,/]+/)
        .filter(Boolean)
        .map(Number);
      return [p[0]!, p[1]!, p[2]!, p[3] ?? 1];
    };
    const over = (t: C, u: C): C => [0, 1, 2].map((i) => t[i]! * t[3] + u[i]! * (1 - t[3])).concat(1) as C;
    const lum = (c: C) =>
      [0, 1, 2]
        .map((i) => {
          const v = c[i]! / 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        })
        .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i]!, 0);
    const el = document.querySelector<HTMLElement>(s);
    if (!el) return null;
    const layers: C[] = [];
    for (let e: Element | null = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c[3] > 0) layers.push(c);
      if (layers.length && layers.at(-1)![3] >= 0.999) break;
    }
    let bg: C = parse(getComputedStyle(document.documentElement).backgroundColor) ?? [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i]!, bg);
    let op = 1;
    for (let e: Element | null = el; e && e !== document.body; e = e.parentElement)
      op *= Number(getComputedStyle(e).opacity);
    const f = parse(getComputedStyle(el).color)!;
    const fg = over([f[0], f[1], f[2], f[3] * op], bg);
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    return { ratio: (a! + 0.05) / (b! + 0.05), size: Number.parseFloat(getComputedStyle(el).fontSize), op };
  }, sel);

for (const light of [false, true]) {
  const scheme = light ? "light" : "dark";
  test(`design review, iPad landscape ${scheme}: panel groups, countdown, played rows, tanda header, Start, rows, set list, hints, sheets`, async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ ...IPAD_L, colorScheme: scheme });
    const page = await ctx.newPage();
    await openBooth(page, { light, ipad: true });
    await page.waitForTimeout(400);
    // the Start label is whole (the primary is as wide as its longest word, Start / Pause / Resume)
    const label = async () =>
      page.evaluate(() => {
        const l = document.querySelector<HTMLElement>(".booth-primary .booth-start-label")!;
        return {
          sw: l.scrollWidth,
          cw: l.clientWidth,
          w: l.closest("button")!.getBoundingClientRect().width,
        };
      });
    const l0 = await label();
    expect(l0.sw, "the Start label is not cut").toBeLessThanOrEqual(l0.cw + 1);
    // one row height for every song, cortina and break
    const heights = await page.evaluate(() => [
      ...new Set(
        [...document.querySelectorAll(".booth-col-set .booth-row")].map((r) =>
          Math.round(r.getBoundingClientRect().height),
        ),
      ),
    ]);
    expect(heights, `row heights ${heights}`).toHaveLength(1);

    // the night runs, into tanda 2 (rows and a gap behind the playhead are played)
    await start(page);
    const l1 = await label();
    expect(Math.abs(l1.w - l0.w), "one primary width across states").toBeLessThanOrEqual(1);
    await page.evaluate(() => {
      const s = (
        window as unknown as {
          __tdjBooth: {
            getState: () => {
              plan: { items: Array<{ kind: string }> };
              sources: string[];
              playNow: (i: number) => Promise<void>;
            };
          };
        }
      ).__tdjBooth.getState();
      const i = s.plan.items.findIndex((x, k) => k > 3 && x.kind === "track" && s.sources[k] !== "missing");
      return s.playNow(i);
    });
    await expect.poll(async () => (await snap(page)).state, { timeout: 20000 }).toBe("playing");
    await page.waitForTimeout(1200);
    // played rows and the gap pill: de-emphasised with tokens (no opacity), every text at ≥ 4.5:1
    for (const sel of [
      ".booth-col-set .booth-row.booth-played .booth-row-title",
      ".booth-col-set .booth-row.booth-played .booth-row-sub",
      ".booth-col-set .booth-row.booth-played .booth-row-n",
      ".booth-col-set .booth-gap[data-played] .booth-gap-btn > span",
    ]) {
      const c = await textContrast(page, sel);
      expect(c, sel).not.toBeNull();
      expect(c!.op, `${sel} opacity`).toBe(1);
      expect(c!.ratio, `${sel} ${c!.ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    }
    // the set list keeps the column while a night plays: ≥ 6 rows whole in view, the playing one in the middle third
    const set = await page.evaluate(() => {
      const col = document.querySelector(".booth-col-set")!.getBoundingClientRect();
      const rows = [...document.querySelectorAll(".booth-col-set .booth-row")].filter((r) => {
        const b = r.getBoundingClientRect();
        return b.top >= col.top - 1 && b.bottom <= col.bottom + 1;
      });
      const on = document
        .querySelector('.booth-col-set .booth-row[aria-current="true"]')!
        .getBoundingClientRect();
      return { rows: rows.length, at: ((on.top + on.bottom) / 2 - col.top) / col.height };
    });
    expect(set.rows, "set-list rows in view").toBeGreaterThanOrEqual(6);
    expect(set.at).toBeGreaterThan(0.3);
    expect(set.at).toBeLessThan(0.7);
    // the tanda header's buttons: one family (one height, one radius, one fill)
    const heads = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".booth-col-set .booth-tanda-acts")].slice(0, 4).map((a) =>
        [...a.querySelectorAll<HTMLElement>(":scope > button, :scope > .booth-floor-menu > button")]
          .filter((b) => b.getBoundingClientRect().width > 0)
          .map((b) => {
            const cs = getComputedStyle(b);
            const lab = b.querySelector("span");
            return {
              h: Math.round(b.getBoundingClientRect().height),
              r: cs.borderRadius,
              bg: cs.backgroundColor,
              cut: !!lab && lab.scrollWidth > lab.clientWidth + 1,
              pressed: b.getAttribute("aria-pressed") === "true",
            };
          }),
      ),
    );
    expect(heads.flat().length).toBeGreaterThan(3);
    for (const row of heads) {
      if (!row.length) continue; // (the opening La Cumparsita has no tanda actions)
      for (const b of row) {
        expect(b).toMatchObject({ h: 44, r: row[0]!.r, cut: false });
        if (!b.pressed && !row[0]!.pressed) expect(b.bg).toBe(row[0]!.bg);
      }
    }

    // a tap on Next (touch) shows no tooltip and keeps its label (the hold asks in a bubble, never "Hold")
    await page.getByTestId("booth-next-now").tap();
    await page.waitForTimeout(1200);
    await expect(page.locator('[role="tooltip"]')).toHaveCount(0);
    await expect(page.getByTestId("booth-next-now").locator(".booth-tbtn-l")).toHaveText("Next");
    for (const id of ["booth-mute", "booth-talk"]) {
      const b = page.getByTestId(id);
      if (!(await b.count())) continue;
      await b.tap();
      await page.waitForTimeout(900);
      await expect(page.locator('[role="tooltip"]')).toHaveCount(0);
      await b.tap();
    }

    // the Controls panel, opened by a mouse click: no tooltip over it, one sizing scale per group
    const tg = (await page.getByTestId("booth-controls-toggle").boundingBox())!;
    await page.mouse.move(tg.x + tg.width / 2, tg.y + tg.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    await expect(page.getByTestId("booth-controls")).toBeVisible();
    await page.waitForTimeout(1300);
    const tips = await page.evaluate(() => {
      const p = document.querySelector('[data-testid="booth-controls"]')!.getBoundingClientRect();
      return [...document.querySelectorAll('[role="tooltip"]')].filter((t) => {
        const r = t.getBoundingClientRect();
        return r.width > 0 && r.bottom > p.top && r.top < p.bottom && r.right > p.left && r.left < p.right;
      }).length;
    });
    expect(tips, "no hint over the open panel").toBe(0);
    const ctl = await page.evaluate(() => {
      const p = document.querySelector<HTMLElement>('[data-testid="booth-controls"]')!;
      const b = (id: string) => p.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
      const glyphTop = (id: string) => {
        const btn = p.querySelector(`[data-testid="${id}"]`)!;
        return btn.querySelector("svg")!.getBoundingClientRect().top - btn.getBoundingClientRect().top;
      };
      const cue = p.querySelector('[data-testid="ctl-cue-next"], [data-testid="ctl-cue-stop"]')!;
      const card = cue.closest("fieldset")!.getBoundingClientRect();
      const cueR = cue.getBoundingClientRect();
      const deck = document.querySelector(".booth-deck")!.getBoundingClientRect();
      const ttc = document.querySelector('[data-testid="booth-remaining"]')!.getBoundingClientRect();
      const labels = [...p.querySelectorAll<HTMLElement>(".booth-ctl-body .booth-ctl-btn-l")]
        // (a control the bottom bar shows at this width is hidden in the panel)
        .filter((l) => l.getBoundingClientRect().height > 0)
        .map((l) => ({
          lines: Math.round(
            l.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(l).lineHeight),
          ),
        }));
      return {
        transport: ["ctl-next-gap", "ctl-fade", "ctl-crossfade", "ctl-stop"].map((id) => ({
          h: b(id).height,
          g: glyphTop(id),
        })),
        mixer: ["ctl-mute", "ctl-talk"].map((id) => b(id).height),
        song: ["ctl-trim-down", "ctl-trim-up", "ctl-start-point"].map((id) => ({
          h: b(id).height,
          t: b(id).top,
        })),
        trimDown: b("ctl-trim-down"),
        trimValue: b("ctl-trim-value"),
        cue: { l: cueR.left, r: cueR.right, cl: card.left, cr: card.right },
        countdown: {
          t: ttc.top,
          b: ttc.bottom,
          dt: deck.top,
          db: deck.bottom,
          pt: p.getBoundingClientRect().top,
        },
        panelH: p.getBoundingClientRect().height,
        head: [...p.querySelectorAll<HTMLElement>("[data-testid]")]
          .map((e) => e.dataset.testid)
          .filter((id) => id === "ctl-prev" || id === "ctl-play" || id === "ctl-next"),
        labels,
        more: !!p.querySelector('[data-testid="ctl-more"]'),
        scrolls: (() => {
          const body = p.querySelector<HTMLElement>(".booth-ctl-body")!;
          return body.scrollHeight > body.clientHeight + 2;
        })(),
      };
    });
    // Transport: one height, one glyph line; Mixer: the same scale; Song: one row of 44 px controls (QA 2026-11:
    // what the bottom bar shows at this width is not repeated in the panel — those are hidden, height 0)
    const shown = ctl.transport.filter((x) => x.h > 0);
    for (const x of shown) {
      expect(Math.abs(x.h - shown[0]!.h)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(x.g - shown[0]!.g)).toBeLessThanOrEqual(0.5);
    }
    for (const h of ctl.mixer.filter((h) => h > 0))
      expect(Math.abs(h - shown[0]!.h)).toBeLessThanOrEqual(0.5);
    for (const l of ctl.labels) expect(l.lines, "each word on one line").toBe(1);
    for (const x of ctl.song) {
      expect(x.h).toBeCloseTo(44, 0);
      expect(Math.abs(x.t - ctl.song[0]!.t)).toBeLessThanOrEqual(0.5);
    }
    expect(ctl.trimValue.left, "− clear of the value").toBeGreaterThanOrEqual(ctl.trimDown.right);
    // Cue inside its card
    expect(ctl.cue.l).toBeGreaterThanOrEqual(ctl.cue.cl - 0.5);
    expect(ctl.cue.r).toBeLessThanOrEqual(ctl.cue.cr + 0.5);
    // the countdown whole, in the deck above the panel; the panel at most ~46 % of the viewport
    expect(ctl.countdown.t).toBeGreaterThanOrEqual(ctl.countdown.dt - 0.5);
    expect(ctl.countdown.b).toBeLessThanOrEqual(Math.min(ctl.countdown.db, ctl.countdown.pt) + 0.5);
    // (2026-11, the overlap pass: ≤ 46 % — the Now card turns compact while the panel is open)
    expect(ctl.panelH).toBeLessThanOrEqual(820 * 0.46 + 1);
    // no second Previous / Play / Next; "More" while groups are below the fold
    expect(ctl.head).toEqual([]);
    expect(ctl.more).toBe(ctl.scrolls);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/design-ipad-landscape-${scheme}-controls.png` });
    // Escape closes the panel
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("booth-controls")).toHaveCount(0);

    // the Booth's sheets are near-opaque (nothing of the set list reads through)
    await page.getByTestId("booth-more").click();
    const sheet = page.getByTestId("booth-menu");
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(400);
    const alpha = await sheet.evaluate((el) => {
      const m = (el.closest(".sheet-material") ?? el.querySelector(".sheet-material") ?? el) as Element;
      const c = getComputedStyle(m, "::after").backgroundColor;
      const a = c.match(/\/\s*([\d.]+)\)|rgba\([^)]*,\s*([\d.]+)\)/);
      return a ? Number(a[1] ?? a[2]) : 1;
    });
    expect(alpha, "sheet backdrop alpha").toBeGreaterThanOrEqual(0.9);
    await page.keyboard.press("Escape");
    await ctx.close();
  });
}

test("design review, iPad landscape in Turkish: the eyebrow has no English words, the Start label is whole", async ({
  browser,
}) => {
  const ctx = await browser.newContext({ ...IPAD_L, locale: "tr-TR" });
  const page = await ctx.newPage();
  await openBooth(page, { ipad: true });
  await expect(page.getByTestId("booth-now-title")).toBeVisible();
  const eyebrow = (await page.locator('[data-testid="booth-now"] .booth-eyebrow').innerText()).trim();
  expect(eyebrow).not.toMatch(/OPENING|CLOSING|BREAK|CORTINA|OPENİNG|CLOSİNG|TANDA \d+ OF/i);
  const l = await page.evaluate(() => {
    const e = document.querySelector<HTMLElement>(".booth-primary .booth-start-label")!;
    return { sw: e.scrollWidth, cw: e.clientWidth, text: e.textContent };
  });
  expect(l.text).toMatch(/Başlat/);
  expect(l.sw, `"${l.text}" is not cut`).toBeLessThanOrEqual(l.cw + 1);
  // every transport word on one line, none cut
  const words = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-testid="booth-strip"] .booth-tbtn-l')]
      .filter((w) => w.getBoundingClientRect().width > 0)
      .map((w) => ({
        t: w.textContent,
        cut: w.scrollWidth > w.clientWidth + 1,
        h: w.getBoundingClientRect().height,
      })),
  );
  for (const w of words) {
    expect(w.cut, `${w.t} is cut`).toBe(false);
    expect(Math.abs(w.h - words[0]!.h), `${w.t} wraps`).toBeLessThanOrEqual(0.5);
  }
  await ctx.close();
});

test("design review, iPad portrait: the chips under the title take at most two rows, Find songs on the first", async ({
  browser,
}) => {
  const ctx = await browser.newContext(dev("iPad Pro 11", { userAgent: IPAD_SAFARI }));
  const page = await ctx.newPage();
  await openBooth(page, { ipad: true });
  await page.waitForTimeout(400);
  const rows = await page.evaluate(() => {
    const els = [
      ...document.querySelectorAll<HTMLElement>(".booth-head-row .booth-toolbar > *"),
      document.querySelector<HTMLElement>('[data-testid="booth-find-songs"]')!,
    ].filter((e) => e.getBoundingClientRect().width > 0);
    const tops = [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)))].sort(
      (a, b) => a - b,
    );
    const find = Math.round(
      document.querySelector('[data-testid="booth-find-songs"]')!.getBoundingClientRect().top,
    );
    return { rows: tops.length, findFirst: find === tops[0] };
  });
  expect(rows.rows).toBeLessThanOrEqual(2);
  expect(rows.findFirst).toBe(true);
  // 2026-11 (the overlap pass): one row, before the night and while it plays (the words step aside, Show keeps its
  // glyph, the device names whole)
  expect(rows.rows).toBe(1);
  await start(page);
  await page.waitForTimeout(400);
  const playing = await overlap(page);
  expect(playing.chipTops).toBe(1);
  expect(playing.namesCut).toEqual([]);
  await expect(page.getByTestId("booth-show")).toHaveAccessibleName(/Show/);
  await ctx.close();
});

/**
 * 2026-11 — the overlap pass (the owner's iPad Pro 11 landscape, sidebar open, Rehearsal, Controls panel open: "Solve
 * ui and overlap issues"):
 * - the chips under the title and Find songs are one row in English and Turkish (the device names whole);
 * - the Now card names the playing song's tanda type (the badge Up Next and the set list use), panel open or not;
 * - with the panel open the Now card is compact and whole in the deck: the countdown and the dots row inside it,
 *   above its fade and the panel;
 * - the panel's "More" is in its head and covers no control; its fold falls between rows of groups (none cut);
 * - the set list ends on a whole row above its fade;
 * - a tanda header's actions sit on the rows' right edge, centred on the type / total line (not a line of their own);
 * - the gap pills start on the rows' content edge.
 */
function overlap(page: Page) {
  return page.evaluate(() => {
    const R = (el: Element | null) => {
      const r = el?.getBoundingClientRect();
      return r ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height } : null;
    };
    const vis = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const chips = [
      ...document.querySelectorAll<HTMLElement>(".booth-head-row .booth-toolbar > *"),
      document.querySelector<HTMLElement>('[data-testid="booth-find-songs"]')!,
    ].filter(vis);
    const deckEl = document.querySelector(".booth-deck")!;
    const panel = document.querySelector<HTMLElement>('[data-testid="booth-controls"]');
    const col0 = document.querySelector<HTMLElement>(".booth-col-set");
    // (2026-11, pass 2: with the Controls panel open the night card is the column's fixed head and the set list is
    // the scroller under it)
    const col =
      col0 && getComputedStyle(col0).overflowY !== "auto"
        ? (col0.querySelector<HTMLElement>(":scope > .booth-set") ?? col0)
        : col0;
    const twoCols = !!col && vis(col) && getComputedStyle(col).overflowY === "auto";
    const set = (() => {
      if (!col || !twoCols) return null;
      const c = col.getBoundingClientRect();
      const foot = c.bottom - (Number.parseFloat(getComputedStyle(col).scrollPaddingBottom) || 0);
      const cut = [...col.querySelectorAll(".booth-row")]
        .map((r) => r.getBoundingClientRect())
        .filter((r) => r.top < foot - 4 && r.bottom > foot + 1).length;
      const firstRow = col.querySelector<HTMLElement>(".booth-row")!;
      const head = col.querySelector('.booth-tanda[data-tanda="1"] [data-testid="booth-tanda-head"]')!;
      return {
        cut,
        contentEdge:
          firstRow.getBoundingClientRect().left + Number.parseFloat(getComputedStyle(firstRow).paddingLeft),
        head: {
          meta: R(head.querySelector('[data-testid="booth-tanda-meta"]'))!,
          title: R(head.querySelector('[data-testid="booth-tanda-title"]'))!,
          acts: R(head.querySelector('[data-testid="booth-tanda-acts"]'))!,
          rowsRight: R(col.querySelector('[data-testid="booth-row-swap"]'))!.right,
        },
        gaps: [...col.querySelectorAll(".booth-gap-btn > span")]
          .slice(0, 4)
          .map((g) => g.getBoundingClientRect().left),
      };
    })();
    const body = panel?.querySelector<HTMLElement>(".booth-ctl-body") ?? null;
    const more = panel?.querySelector('[data-testid="ctl-more"]') ?? null;
    const b = body?.getBoundingClientRect();
    const type = document.querySelector('[data-testid="booth-now"] [data-testid="tanda-type"]');
    return {
      chipTops: new Set(chips.map((e) => Math.round(e.getBoundingClientRect().top))).size,
      namesCut: [...document.querySelectorAll<HTMLElement>(".booth-out-name")]
        .filter(vis)
        .filter((n) => n.scrollWidth > n.clientWidth + 1)
        .map((n) => n.textContent),
      deck: R(deckEl)!,
      fade: Number.parseFloat(getComputedStyle(deckEl).paddingBottom) || 0,
      panelTop: panel ? panel.getBoundingClientRect().top : null,
      now: R(document.querySelector('[data-testid="booth-now"]'))!,
      countdown: R(document.querySelector('[data-testid="booth-remaining"]'))!,
      dots: R(document.querySelector('[data-testid="booth-now"] .booth-now-dots'))!,
      type:
        type && vis(type) ? { text: type.textContent ?? "", h: type.getBoundingClientRect().height } : null,
      moreHits:
        more && panel
          ? [...panel.querySelectorAll<HTMLElement>(".booth-ctl-body button, .booth-ctl-body input")]
              .filter(vis)
              .filter((x) => {
                const r = x.getBoundingClientRect();
                const m = more.getBoundingClientRect();
                return r.left < m.right && m.left < r.right && r.top < m.bottom && m.top < r.bottom;
              })
              .map((x) => x.dataset.testid ?? x.getAttribute("aria-label"))
          : [],
      moreInHead: !!more?.closest(".booth-ctl-head"),
      groupsCut:
        b && body
          ? [...body.querySelectorAll<HTMLElement>(":scope > .booth-ctl-group")]
              .filter((g) => {
                const r = g.getBoundingClientRect();
                return r.top < b.bottom - 1 && r.bottom > b.bottom + 1;
              })
              .map((g) => g.querySelector("legend")?.textContent)
          : [],
      set,
    };
  });
}

for (const locale of ["en-US", "tr-TR"] as const) {
  test(`overlap pass, iPad landscape (${locale}): one chip row, the Now card's tanda type, a compact whole Now card, More in the head, whole rows, the tanda header's actions and the gap pills aligned`, async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ ...IPAD_L, locale, colorScheme: "light" });
    const page = await ctx.newPage();
    await openBooth(page, { light: true, ipad: true });
    // the Now card says the tanda type before the night (the badge Up Next and the set list use)
    await expect(page.getByTestId("booth-now").getByTestId("tanda-type")).toBeVisible();
    await start(page);
    await page.waitForTimeout(2600);
    const a = await overlap(page);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/overlap-${locale}-closed.png` });
    expect(a.chipTops, "the chips and Find songs on one row").toBe(1);
    expect(a.namesCut, "the device names whole").toEqual([]);
    expect(a.type?.text).toMatch(/Tango|Vals|Milonga/);
    const s = a.set!;
    expect(s.cut, "the set list ends on a whole row").toBe(0);
    // the tanda header: the actions at the rows' right edge, centred on the type / total line, under the title
    expect(Math.abs(s.head.acts.right - s.head.rowsRight)).toBeLessThanOrEqual(1);
    expect(s.head.acts.top).toBeGreaterThanOrEqual(s.head.title.bottom - 1);
    expect(s.head.acts.top).toBeLessThan(s.head.meta.bottom);
    expect(
      Math.abs((s.head.acts.top + s.head.acts.bottom) / 2 - (s.head.meta.top + s.head.meta.bottom) / 2),
    ).toBeLessThanOrEqual(4);
    // the gap pills start on the rows' content edge
    expect(s.gaps.length).toBeGreaterThan(0);
    for (const g of s.gaps)
      expect(Math.abs(g - s.contentEdge), `pill at ${g} vs ${s.contentEdge}`).toBeLessThanOrEqual(1);

    // the Controls panel open
    await page.getByTestId("booth-controls-toggle").click();
    await expect(page.getByTestId("booth-controls")).toBeVisible();
    await page.waitForTimeout(2600);
    const p = await overlap(page);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/overlap-${locale}-open.png` });
    expect(p.chipTops).toBe(1);
    // the compact Now card: whole in the deck, above its fade and the panel; the countdown and the dots inside it
    const floor = Math.min(p.deck.bottom - p.fade, p.panelTop!) + 1;
    expect(p.now.top).toBeGreaterThanOrEqual(p.deck.top - 1);
    expect(p.now.bottom, "the Now card whole").toBeLessThanOrEqual(floor);
    for (const [k, r] of [
      ["countdown", p.countdown],
      ["dots", p.dots],
    ] as const) {
      expect(r.height, k).toBeGreaterThan(0);
      expect(r.top, k).toBeGreaterThanOrEqual(p.now.top);
      expect(r.bottom, k).toBeLessThanOrEqual(Math.min(p.now.bottom, floor));
    }
    // the tanda type stays, on one line
    expect(p.type?.text).toMatch(/Tango|Vals|Milonga/);
    expect(p.type!.h).toBeLessThanOrEqual(30);
    // "More" lives in the panel's head and covers nothing; the fold cuts no group
    expect(p.moreInHead).toBe(true);
    expect(p.moreHits).toEqual([]);
    expect(p.groupsCut, "groups cut by the panel's fold").toEqual([]);
    expect(p.set!.cut, "the set list ends on a whole row (panel open)").toBe(0);
    // "More" brings the next row of groups (below the fold) into view, whole
    const below = () =>
      page.evaluate(() => {
        const body = document.querySelector<HTMLElement>(".booth-ctl-body")!;
        const b = body.getBoundingClientRect();
        return [...body.querySelectorAll<HTMLElement>(":scope > .booth-ctl-group")].map((g) => {
          const r = g.getBoundingClientRect();
          return {
            g: g.querySelector("legend")?.textContent,
            hidden: r.top >= b.bottom - 1,
            whole: r.top >= b.top - 1 && r.bottom <= b.bottom + 1,
          };
        });
      });
    const before = (await below()).filter((x) => x.hidden).map((x) => x.g);
    expect(before.length, "groups below the fold").toBeGreaterThan(0);
    await page.getByTestId("ctl-more").click();
    await page.waitForTimeout(900);
    const after = await below();
    const next = after.filter((x) => before.includes(x.g) && x.whole).map((x) => x.g);
    expect(next.length, `a row of ${before.join(", ")} whole after More`).toBeGreaterThan(0);
    await ctx.close();
  });
}

/**
 * 2026-11 — the owner's desktop capture ("ui issues on controls boxes", ~1500 × 900, the panel open): no text leaves
 * its group box, a group's button cells share one height, the groups of one row share a top and a height, the
 * countdown and the night's clock stay in view, no hint is left over the panel after a click on Controls.
 */
for (const [w, h] of [
  [1440, 900],
  [1920, 1080],
] as const) {
  test(`overlap pass, desktop ${w}×${h}: the Controls panel's boxes hold their contents, rows align, the countdown and the clock stay, no hint`, async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await openBooth(page);
    await start(page);
    // a mouse click on Controls, the pointer left on it
    const tg = (await page.getByTestId("booth-controls-toggle").boundingBox())!;
    await page.mouse.move(tg.x + tg.width / 2, tg.y + tg.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    await expect(page.getByTestId("booth-controls")).toBeVisible();
    await page.waitForTimeout(2600);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/overlap-desktop-${w}x${h}.png` });
    const m = await page.evaluate(() => {
      const vis = (e: Element) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden";
      };
      const panel = document.querySelector<HTMLElement>('[data-testid="booth-controls"]')!;
      const groups = [...panel.querySelectorAll<HTMLElement>(".booth-ctl-group")].filter(vis);
      const out: string[] = [];
      const cells: Record<string, number[]> = {};
      for (const g of groups) {
        const name = g.querySelector("legend")?.textContent ?? "?";
        const gr = g.getBoundingClientRect();
        for (const e of g.querySelectorAll<HTMLElement>("*")) {
          if (!vis(e)) continue;
          const r = e.getBoundingClientRect();
          if (r.left < gr.left - 1 || r.right > gr.right + 1 || r.bottom > gr.bottom + 1)
            out.push(`${name}: ${e.dataset.testid ?? e.className} leaves the box`);
          if (
            (e.tagName === "BUTTON" || e.tagName === "SPAN") &&
            e.scrollWidth > e.clientWidth + 1 &&
            getComputedStyle(e).textOverflow !== "ellipsis" &&
            getComputedStyle(e).overflowX !== "visible"
          )
            out.push(`${name}: ${e.dataset.testid ?? e.className} cut`);
        }
        cells[name] = [...g.querySelectorAll<HTMLElement>(".booth-ctl-row > .booth-ctl-btn")]
          .filter(vis)
          .map((b) => b.getBoundingClientRect().height);
      }
      const rows: Record<number, number[]> = {};
      for (const g of groups) {
        const r = g.getBoundingClientRect();
        const k = Math.round(r.top);
        rows[k] = [...(rows[k] ?? []), r.height];
      }
      const deck = document.querySelector(".booth-deck")!.getBoundingClientRect();
      const col = document.querySelector(".booth-col-set")!.getBoundingClientRect();
      const ttc = document.querySelector('[data-testid="booth-ttc"]')!.getBoundingClientRect();
      const clock = document.querySelector('[data-testid="booth-clock"]')!.getBoundingClientRect();
      const cd = document.querySelector('[data-testid="booth-remaining"]')!.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      return {
        out,
        cells,
        rows: Object.values(rows).map((hs) => Math.max(...hs) - Math.min(...hs)),
        countdown: cd.top >= deck.top - 1 && cd.bottom <= Math.min(deck.bottom, p.top) + 1 && cd.height > 0,
        clock:
          [ttc, clock].every((r) => r.height > 0 && r.top >= col.top - 1 && r.bottom <= col.bottom + 1) &&
          ttc.bottom <= p.top,
        tips: [...document.querySelectorAll('[role="tooltip"]')].filter(vis).length,
        head: [...panel.querySelectorAll<HTMLElement>(".booth-ctl-head [data-testid]")].map(
          (e) => e.dataset.testid,
        ),
      };
    });
    expect(m.out, m.out.join("\n")).toEqual([]);
    for (const [g, hs] of Object.entries(m.cells))
      for (const x of hs) expect(Math.abs(x - hs[0]!), `${g} cells`).toBeLessThanOrEqual(0.5);
    for (const d of m.rows) expect(d, "the groups of one row share a height").toBeLessThanOrEqual(1);
    expect(m.countdown, "the countdown whole above the panel").toBe(true);
    expect(m.clock, "the night's clock and the time to La Cumparsita in view").toBe(true);
    expect(m.tips, "no hint after clicking Controls").toBe(0);
    // the head: Controls, More, the keys — never Previous / Play / Next again
    expect(m.head.filter((id) => /ctl-(prev|play|next)$/.test(id ?? ""))).toEqual([]);
    await ctx.close();
  });
}

/**
 * 2026-11 — the iPhone store screenshots in Turkish: the tab bar (its label translated) stayed over the Booth's
 * transport, the chip row was cut at the edge, the transition editor's presets ran off the screen.
 */
test("iPhone 15 Pro in Turkish: no tab bar over the transport, a chip row that says it scrolls, every preset in view", async ({
  browser,
}) => {
  const ctx = await browser.newContext({ ...dev("iPhone 15 Pro"), locale: "tr-TR" });
  const page = await ctx.newPage();
  await openBooth(page);
  const tab = await page.evaluate(() => {
    const n = document.querySelector('nav[data-testid="tab-bar"]');
    return n ? getComputedStyle(n).visibility : "none";
  });
  expect(tab).not.toBe("visible");
  const start = (await page.getByTestId("booth-start").boundingBox())!;
  const hit = await page.evaluate(
    ([x, y]) => !!document.elementFromPoint(x!, y!)?.closest('[data-testid="booth-start"]'),
    [start.x + start.width / 2, start.y + start.height / 2],
  );
  expect(hit, "Başlat is tappable").toBe(true);
  const row = await page.evaluate(() => {
    const r = document.querySelector<HTMLElement>(".booth-head-row")!;
    return { mask: getComputedStyle(r).maskImage, scrolls: r.scrollWidth > r.clientWidth };
  });
  if (row.scrolls) expect(row.mask, "an edge fade where the row scrolls").toContain("gradient");
  // the transition editor: the presets in rows, every tile on the screen
  await boothAction(page, "booth-set-open");
  await page.locator('[data-testid="booth-set-sheet"] [data-testid="booth-gap"]').first().click();
  await expect(page.getByTestId("booth-tr-preset-auto")).toBeVisible();
  const vw = page.viewportSize()!.width;
  const tiles = await page.locator(".trx-presets > button").evaluateAll((bs) =>
    bs.map((b) => {
      const r = b.getBoundingClientRect();
      return { l: r.left, r: r.right, h: r.height, cut: b.scrollWidth > b.clientWidth + 1 };
    }),
  );
  expect(tiles.length).toBeGreaterThanOrEqual(5);
  for (const t of tiles) {
    expect(t.l).toBeGreaterThanOrEqual(0);
    expect(t.r).toBeLessThanOrEqual(vw);
    expect(t.h).toBeGreaterThanOrEqual(43.5);
    expect(t.cut).toBe(false);
  }
  await ctx.close();
});
