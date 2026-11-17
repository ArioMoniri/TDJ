/**
 * 2026-11 — the Booth's QA fix pass (the DJ and design QA reports, items 1–17) and the phone's bar redesign:
 *  1 a toast never sits in a sheet opened after it; "Undid: Crossfade" (no doubled verb);
 *  2 Change the end in Rehearsal says its clock, presets in two rows of three, a filled time field and "Preview";
 *  3 Next confirms by a second tap or a hold, the same armed state and hint everywhere (the mini bar's Next too);
 *  4 Space and m mid-night ask first, Resume / Unmute never wait; the mini bar's Pause asks and stands 12 px clear;
 *  5 1440 with Controls open: every deck card whole, nothing on the bar repeated in the panel, "Cancel · 4 s";
 *  6 the opening La Cumparsita without a clip is noted in Rehearsal and said on Start; "Tanda 1 of 25 · Tango";
 *  7 Scrub on or off, no Booth page scrolls sideways (320 / 393 / 834 / 1180 / 1440);
 *  8 an iPhone SE in Turkish: Pause is ≥ 44 × 44 with its glyph, the bar fits;
 *  9 iPad landscape with Controls open: the deck's cards whole, "Back to now" covers no control;
 * 10 the night card has the deck cards' inset; 11 the Controller sheet clears the sidebar, its labels ≥ 11 px;
 * 12 the transition editor: 28 px corners, Cancel / Done; the CUE / STOP flags ≥ 11 px;
 * 13 the Now card's tools at the 15 px token; 14 the phone bar's 16 px insets; 15 LRCLIB a 44 px target;
 * 16 the preview mini player on a desktop: opaque, beside the sidebar, never over the inspector, one player;
 * phone bar: the cover and title open Now playing, Set list and Controls are in •••.
 * Screenshots (scale 1) go to $BOOTH_SHOTS when set.
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

const dev = (name: string, extra: Partial<BrowserContextOptions> = {}): BrowserContextOptions => {
  const { defaultBrowserType: _b, ...rest } = devices[name]!;
  return { ...rest, deviceScaleFactor: 1, ...extra };
};

async function route(page: Page) {
  await page.route(/dzcdn\.net|p\.scdn\.co|preview\.test|\/api\/preview\?/, (r) =>
    r.request().url().includes("json=1")
      ? r.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ url: "https://preview.test/clip.wav" }),
        })
      : r.fulfill({
          status: 200,
          contentType: "audio/wav",
          body: WAV,
          headers: { "access-control-allow-origin": "*" },
        }),
  );
  await page.route(/open\.spotify\.com\/oembed/, (r) => r.fulfill({ status: 404, body: "" }));
}

async function openBooth(page: Page, o: { controls?: boolean } = {}) {
  await page.addInitScript((controls) => {
    try {
      localStorage.setItem("tdj-booth-theme", "dark");
      localStorage.setItem("tdj-booth-controls", controls ? "1" : "0");
    } catch {}
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
  }, !!o.controls);
  await route(page);
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/, { timeout: 60000 });
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("booth-ttc")).not.toHaveAttribute("data-resolving", "1", { timeout: 30000 });
  const fresh = page
    .getByTestId("booth-resume")
    .getByRole("button", { name: /Start from the beginning|Baştan/ });
  if (await fresh.isVisible().catch(() => false)) await fresh.click();
}

type Snap = { planIndex: number; state: string; cur: number | null; muted: boolean };
const snap = (page: Page) =>
  page.evaluate(() => {
    const s = (
      window as unknown as { __tdjBooth: { getState: () => Record<string, unknown> } }
    ).__tdjBooth.getState();
    return {
      planIndex: s.planIndex as number,
      state: s.state as string,
      cur: ((s.current as { planIndex: number } | null)?.planIndex ?? null) as number | null,
      muted: !!s.muted,
    } as Snap;
  });
async function start(page: Page) {
  await page.getByTestId("booth-start").click();
  await expect.poll(async () => (await snap(page)).state, { timeout: 20000 }).toBe("playing");
}
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
const box = (page: Page, sel: string) =>
  page.evaluate((s) => {
    const r = document.querySelector(s)?.getBoundingClientRect();
    return r ? { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height } : null;
  }, sel);

test.describe("desktop 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("1 + 3 + 4 + 5 + 6 + 10 + 13: toasts, confirmations, the cut keys, the panel, the deck, the night card", async ({
    page,
  }) => {
    await openBooth(page, { controls: true });
    // 6: the opening without a clip is noted; Start says it once; Up next and the next tanda in one style
    await expect(page.getByTestId("booth-opening-note")).toHaveText(
      "Rehearsal: the opening plays on the night (no clip)",
    );
    await page.getByTestId("booth-start").click();
    await expect(page.getByTestId("toast")).toContainText("the opening plays on the night");
    await expect.poll(async () => (await snap(page)).state, { timeout: 20000 }).toBe("playing");
    await expect(page.getByTestId("booth-next").locator(".text-caption1").first()).toHaveText(
      /^Tanda \d+ of \d+ · [A-Z]/,
    );
    // 10: the night card has the deck cards' inset; 13: the Now card's tools at 15 px
    const pads = await page.evaluate(() => {
      const p = (s: string) => getComputedStyle(document.querySelector(s)!).padding;
      return { night: p('[data-testid="booth-time"]'), card: p('[data-testid="booth-now"]') };
    });
    expect(pads.night).toBe(pads.card);
    for (const fs of await page
      .locator(".booth-tool")
      .evaluateAll((e) => e.map((x) => getComputedStyle(x).fontSize)))
      expect(fs).toBe("15px");
    // 5: every deck card whole above the open panel; the panel repeats nothing the bar shows
    const deck = await page.evaluate(() => {
      const d = document.querySelector<HTMLElement>(".booth-deck")!;
      const r = d.getBoundingClientRect();
      return [...d.children]
        .filter((c) => (c as HTMLElement).offsetHeight > 0)
        .map((c) => ({ b: c.getBoundingClientRect().bottom, foot: r.bottom }));
    });
    for (const c of deck) expect(c.b).toBeLessThanOrEqual(c.foot + 1);
    for (const id of [
      "ctl-fade",
      "ctl-crossfade",
      "ctl-next-gap",
      "ctl-stop",
      "ctl-mute",
      "ctl-talk",
      "ctl-master",
    ])
      await expect(page.getByTestId("booth-controls").getByTestId(id)).toBeHidden();
    await expect(page.getByTestId("booth-deck-more")).toBeVisible();
    await shot(page, "qa-desk-controls");

    // 3: Next — a tap arms (the label stays, one hint), a second tap runs
    const a = (await snap(page)).cur;
    const next = page.getByTestId("booth-next-now");
    await next.click();
    await expect(next).toHaveAttribute("data-armed", "true");
    await expect(page.getByTestId("booth-next-now-nudge")).toHaveText("Tap again or hold to confirm");
    await expect(next.locator(".booth-tbtn-l")).toHaveText("Next");
    await page.waitForTimeout(300);
    expect((await snap(page)).cur).toBe(a);
    await next.click();
    await expect.poll(async () => (await snap(page)).cur, { timeout: 15000 }).not.toBe(a);

    // 4: Space and m ask first mid-night; Resume and Unmute never wait
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Space");
    await expect(page.getByTestId("booth-pause")).toHaveAttribute("data-armed", "true");
    await expect(page.getByTestId("booth-pause-nudge")).toBeVisible();
    expect((await snap(page)).state).toBe("playing");
    await page.keyboard.press("Space");
    await expect.poll(async () => (await snap(page)).state).toBe("paused");
    await page.keyboard.press("Space");
    await expect.poll(async () => (await snap(page)).state).toBe("playing");
    await page.keyboard.press("m");
    await expect(page.getByTestId("booth-mute")).toHaveAttribute("data-armed", "true");
    expect((await snap(page)).muted).toBe(false);
    await page.keyboard.press("m");
    await expect.poll(async () => (await snap(page)).muted).toBe(true);
    await page.keyboard.press("m");
    await expect.poll(async () => (await snap(page)).muted).toBe(false);

    // 5: a running fade's word never truncates ("Cancel · 4 s")
    await hold(page, page.getByTestId("booth-strip-fade"));
    const word = page.getByTestId("booth-strip-fade").locator(".booth-tbtn-l");
    await expect(word).toHaveText(/^Cancel · \d s$/);
    expect(await word.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);

    // 1: "Undid: Crossfade"… and a sheet opened over a live Undo / Redo toast takes it away
    await page.getByTestId("booth-strip-fade").click(); // cancel the fade
    await expect.poll(async () => (await snap(page)).state, { timeout: 15000 }).toBe("playing");
    await hold(page, page.getByTestId("booth-strip-crossfade"));
    await expect(page.getByTestId("booth-strip-crossfade")).toHaveAttribute("data-running", "crossfade");
    await page.waitForTimeout(4000);
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("ControlOrMeta+z");
    await expect(page.getByTestId("toast")).toHaveText(/Undid: Crossfade/);
    await page.getByTestId("booth-stop").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByTestId("toast")).toHaveCount(0);
    await shot(page, "qa-desk-stop-sheet");
  });

  test("2 + 11 + 12: Change the end in Rehearsal, the Controller sheet, the transition editor", async ({
    page,
  }) => {
    await openBooth(page);
    await start(page);
    // 2
    await page.getByTestId("booth-change-end").click();
    const sheet = page.getByTestId("booth-end-sheet");
    await expect(sheet.getByTestId("booth-end-basis")).toContainText("Rehearsal times");
    const ys = await sheet
      .locator('[data-testid^="booth-end-plus-"], [data-testid^="booth-end-minus-"]')
      .evaluateAll((bs) => bs.map((b) => Math.round(b.getBoundingClientRect().top)));
    expect(ys).toHaveLength(6);
    expect(new Set(ys.slice(0, 3)).size).toBe(1);
    expect(new Set(ys.slice(3)).size).toBe(1);
    expect(ys[3]).toBeGreaterThan(ys[0]!);
    await expect(sheet.getByTestId("booth-end-at")).toHaveValue(/^\d\d:\d\d$/);
    await expect(sheet.getByTestId("booth-end-at-go")).toHaveText("Preview");
    await shot(page, "qa-end-sheet");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    // 11
    await page.getByTestId("booth-controls-toggle").click();
    await page.getByTestId("ctl-controller").click();
    await expect(page.getByTestId("virtual-controller")).toBeVisible();
    const side = (await box(page, '[data-testid="sidebar"]'))!;
    const dlg = await page.evaluate(() => {
      const r = document
        .querySelector('[data-testid="controller-sheet"]')!
        .closest('[role="dialog"]')!
        .getBoundingClientRect();
      return { l: r.left, r: r.right };
    });
    expect(dlg.l).toBeGreaterThanOrEqual(side.r + 8);
    const small = await page
      .locator(".vc-pad, .vc-knob, .vc-jog-label, .vc-deck-tag")
      .evaluateAll((es) => es.map((e) => Number.parseFloat(getComputedStyle(e).fontSize)));
    for (const fs of small) expect(fs).toBeGreaterThanOrEqual(11);
    await shot(page, "qa-controller");
    await page.keyboard.press("Escape");
    // 12: the transition editor's corners and header
    await page.locator('[data-testid="booth-gap"]').first().click();
    await expect(page.getByTestId("booth-tr-close")).toHaveText("Cancel");
    await expect(page.getByTestId("booth-tr-save")).toHaveText("Done");
    const radius = await page.evaluate(
      () => getComputedStyle(document.querySelector(".trx")!).borderTopLeftRadius,
    );
    expect(radius).toBe("28px");
    await shot(page, "qa-transition");
  });
});

test("7: Scrub on or off, no Booth page scrolls sideways (320 / 393 / 834 / 1180 / 1440)", async ({
  page,
}) => {
  test.setTimeout(240_000);
  // one night, the window resized through the five widths (the layout is per width)
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooth(page);
  const sw = () => page.evaluate(() => document.documentElement.scrollWidth);
  for (const w of [1440, 1180, 834, 393, 320]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(400);
    const tg = page.getByTestId("booth-scrub-toggle");
    // (in the middle of the screen: never under the bottom bar)
    await tg.evaluate((e) => e.scrollIntoView({ block: "center" }));
    // (what is measured is the page's width, not a tap: a programmatic click, whatever covers the card meanwhile)
    if ((await tg.getAttribute("aria-pressed")) === "true")
      await tg.evaluate((b) => (b as HTMLElement).click());
    await expect(tg).toHaveAttribute("aria-pressed", "false");
    expect(await sw(), `${w} off`).toBeLessThanOrEqual(w);
    await tg.evaluate((b) => (b as HTMLElement).click());
    await expect(tg).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(200);
    expect(await sw(), `${w} on`).toBeLessThanOrEqual(w);
  }
});

test("8 + 14 + phone bar: iPhone SE (Turkish) and iPhone 15 Pro — the bar fits, 16 px insets, its menu", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  for (const [name, opts] of [
    ["se-tr", { viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true, locale: "tr-TR" }],
    ["15pro", dev("iPhone 15 Pro")],
  ] as const) {
    const ctx = await browser.newContext(opts as BrowserContextOptions);
    const page = await ctx.newPage();
    await openBooth(page);
    await start(page);
    const vw = page.viewportSize()!.width;
    const strip = (await box(page, '[data-testid="booth-strip"]'))!;
    expect(Math.round(strip.l), name).toBe(16);
    expect(Math.round(vw - strip.r), name).toBe(16);
    const pause = (await box(page, '[data-testid="booth-pause"]'))!;
    expect(pause.w, name).toBeGreaterThanOrEqual(44);
    expect(pause.h, name).toBeGreaterThanOrEqual(44);
    expect((await box(page, '[data-testid="booth-pause"] svg'))!.w, name).toBeGreaterThan(10);
    // every control of the bar inside it, none under another
    const cells = await page.locator('[data-testid="booth-strip"] > button').evaluateAll((bs) =>
      bs
        .filter((b) => (b as HTMLElement).offsetWidth > 0)
        .map((b) => {
          const r = b.getBoundingClientRect();
          return { l: r.left, r: r.right, w: r.width, h: r.height };
        }),
    );
    for (const c of cells) {
      expect(c.l, name).toBeGreaterThanOrEqual(strip.l - 0.5);
      expect(c.r, name).toBeLessThanOrEqual(strip.r + 0.5);
      expect(Math.min(c.w, c.h), name).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth), name).toBeLessThanOrEqual(vw);
    await shot(page, `qa-phone-${name}`);
    // the cover opens Now playing; ••• holds Set list and Controls
    await page.getByTestId("booth-strip-now").click();
    await expect(page.getByTestId("now-view")).toBeVisible();
    await page.getByTestId("now-view-close").click();
    await expect(page.getByTestId("now-view")).toBeHidden();
    await boothAction(page, "booth-set-open");
    await expect(page.getByTestId("booth-set-sheet")).toBeVisible();
    await ctx.close();
  }
});

test("9: iPad landscape with Controls open — whole cards, Back to now covers no control", async ({
  browser,
}) => {
  const ctx = await browser.newContext(
    dev("iPad Pro 11 landscape", { viewport: { width: 1180, height: 820 } }),
  );
  const page = await ctx.newPage();
  await openBooth(page, { controls: true });
  await start(page);
  const deck = await page.evaluate(() => {
    const d = document.querySelector<HTMLElement>(".booth-deck")!;
    const r = d.getBoundingClientRect();
    return [...d.children]
      .filter((c) => (c as HTMLElement).offsetHeight > 0)
      .map((c) => ({ b: c.getBoundingClientRect().bottom, foot: r.bottom }));
  });
  for (const c of deck) expect(c.b).toBeLessThanOrEqual(c.foot + 1);
  // scroll the set list away from the playing row: "Back to now" shows
  // the DJ scrolls the set list away from the playing row: "Back to now" shows
  const set = (await box(page, ".booth-col-set .booth-set"))!;
  await page.mouse.move(set.l + set.w / 2, set.t + set.h / 2);
  for (let k = 0; k < 6; k++) await page.mouse.wheel(0, 900);
  const pill = page.getByTestId("booth-back-to-now");
  await expect(pill).toBeVisible({ timeout: 8000 });
  const hits = await page.evaluate(() => {
    const p = document.querySelector('[data-testid="booth-back-to-now"]')!.getBoundingClientRect();
    const out: string[] = [];
    for (const b of document.querySelectorAll<HTMLElement>(".booth-col-set button")) {
      if (b.dataset.testid === "booth-back-to-now") continue;
      const r = b.getBoundingClientRect();
      if (!r.width) continue;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      // a control you can see and tap (its centre is itself) must not sit under the bar
      if (document.elementFromPoint(cx, cy)?.closest("button") !== b) continue;
      if (r.bottom > p.top + 1 && r.top < p.bottom - 1 && r.right > p.left && r.left < p.right)
        out.push(b.textContent ?? "");
    }
    return out;
  });
  expect(hits).toEqual([]);
  await shot(page, "qa-ipad-backnow");
  await ctx.close();
});

test("3 + 4 + 16: the mini bar on Library (Pause and Next ask, a 12 px gap) and the desktop preview player", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooth(page);
  await start(page);
  await page.locator('[data-testid="sidebar"] a[href="/library"]').first().click();
  const mini = page.getByTestId("booth-mini");
  await expect(mini).toBeVisible({ timeout: 15000 });
  const tg = (await box(page, '[data-testid="booth-mini-toggle"]'))!;
  const nx = (await box(page, '[data-testid="booth-mini-next"]'))!;
  expect(nx.l - tg.r).toBeGreaterThanOrEqual(12);
  // Next: the first tap says so
  const cur = (await snap(page)).cur;
  await mini.getByTestId("booth-mini-next").click();
  await expect(mini.getByTestId("booth-mini-hint")).toHaveText("Tap again or hold to confirm");
  await page.waitForTimeout(300);
  expect((await snap(page)).cur).toBe(cur);
  await mini.getByTestId("booth-mini-next").click();
  await expect.poll(async () => (await snap(page)).cur, { timeout: 15000 }).not.toBe(cur);
  // Pause asks; Resume does not
  await mini.getByTestId("booth-mini-toggle").click();
  await expect(mini.getByTestId("booth-mini-toggle")).toHaveAttribute("data-armed", "true");
  expect((await snap(page)).state).toBe("playing");
  await mini.getByTestId("booth-mini-toggle").click();
  await expect.poll(async () => (await snap(page)).state).toBe("paused");
  await mini.getByTestId("booth-mini-toggle").click();
  await expect.poll(async () => (await snap(page)).state).toBe("playing");
  // the jump guide: its bubble over its marker, clear of the buttons; the marker on the bar
  const seek = (await box(page, '[data-testid="booth-mini-seek"]'))!;
  await page.waitForTimeout(600);
  await page.mouse.click(seek.l + seek.w * 0.2, seek.t + seek.h / 2);
  const arm = mini.getByTestId("booth-mini-seek-arm");
  await expect(arm).toBeVisible();
  await page.waitForTimeout(100);
  const g = await page.evaluate(() => {
    const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
    const a = r('[data-testid="booth-mini-seek-arm"]');
    const tip = Number.parseFloat(
      (document.querySelector('[data-testid="booth-mini-seek-arm"]') as HTMLElement).style.getPropertyValue(
        "--tip",
      ),
    );
    const mk = r(".booth-mini-target");
    const tr = r(".booth-mini-track");
    const btns = r(".booth-mini-btns");
    const cover = r('[data-testid="booth-mini-back"]');
    const bar = r('[data-testid="booth-mini"]');
    return {
      tipX: a.left + tip,
      markX: mk.left + mk.width / 2,
      markCy: mk.top + mk.height / 2,
      trackCy: tr.top + tr.height / 2,
      overBtns: a.right > btns.left && a.bottom > btns.top && a.top < btns.bottom,
      coverTop: cover.top,
      barTop: bar.top,
    };
  });
  expect(Math.abs(g.tipX - g.markX)).toBeLessThanOrEqual(3);
  expect(Math.abs(g.markCy - g.trackCy)).toBeLessThanOrEqual(1);
  expect(g.overBtns).toBe(false);
  expect(g.coverTop).toBeGreaterThanOrEqual(g.barTop);
  await shot(page, "qa-mini-library");
  // it goes with the arm (3 s)
  await expect(arm).toBeHidden({ timeout: 5000 });
});

test("16: the preview mini player on a desktop — opaque, beside the sidebar, clear of the inspector, one player", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await route(page);
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
  await page.locator("#tanda-1 li[data-song]").first().getByTestId("row-play").click();
  const mini = page.getByTestId("mini-player");
  await expect(mini).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(600);
  const m = (await box(page, '[data-testid="mini-player"]'))!;
  const side = (await box(page, '[data-testid="sidebar"]'))!;
  // 2026-11: the one player, docked in the sidebar (no card over the page)
  expect(m.l).toBeGreaterThanOrEqual(side.l);
  expect(m.r).toBeLessThanOrEqual(side.r);
  const insp = await box(page, '[data-testid="inspector"]');
  if (insp) expect(m.r <= insp.l || m.l >= insp.r || m.b <= insp.t || m.t >= insp.b).toBe(true);
  const bg = await mini.evaluate((e) => getComputedStyle(e, "::after").backgroundColor);
  expect(bg).toMatch(/^rgb\(/);
  await expect(page.getByTestId("sidebar-now")).toBeHidden();
  // the title's first letter is whole at rest (the edge fade sits outside the text)
  const t = page.getByTestId("mini-title-marquee");
  await t.evaluate((el) => {
    (el as HTMLElement).style.width = "40px";
  });
  await expect(t).toHaveAttribute("data-moving", "1");
  const gap = await t.evaluate((el) => {
    const inner = el.querySelector(".marquee-inner")!.firstElementChild!.getBoundingClientRect();
    return inner.left - el.getBoundingClientRect().left;
  });
  expect(gap).toBeGreaterThanOrEqual(5.5);
  await shot(page, "qa-preview-player");
});

test("12 + 15: the CUE / STOP flags and the LRCLIB link", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooth(page);
  await start(page);
  await page.getByTestId("booth-now-info").click();
  const flags = page.locator(".booth-wave-handle > span");
  if (await flags.count()) {
    for (const f of await flags.evaluateAll((es) =>
      es.map((e) => ({ fs: Number.parseFloat(getComputedStyle(e).fontSize), c: getComputedStyle(e).color })),
    )) {
      expect(f.fs).toBeGreaterThanOrEqual(11);
      expect(f.c).not.toBe("rgb(255, 255, 255)");
    }
  }
  await page.keyboard.press("Escape");
  await page.getByTestId("booth-now-full").click();
  await expect(page.getByTestId("now-view")).toBeVisible();
  const link = await page.getByTestId("now-view").evaluate((v) => {
    let a = v.querySelector<HTMLAnchorElement>('a[href^="https://lrclib.net"]');
    if (!a) {
      a = document.createElement("a");
      a.href = "https://lrclib.net/";
      a.textContent = "LRCLIB";
      v.append(a);
    }
    const r = a.getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
  expect(link.w).toBeGreaterThanOrEqual(44);
  expect(link.h).toBeGreaterThanOrEqual(44);
});

test("Energy tonight: one-line title, a compact Scrub, the plot across the card, 'we are here' clear of the dots", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  for (const [name, opts, controls] of [
    ["desktop", { viewport: { width: 1440, height: 900 } }, false],
    ["ipad-portrait-panel", dev("iPad Pro 11"), true],
  ] as const) {
    const ctx = await browser.newContext(opts as BrowserContextOptions);
    const page = await ctx.newPage();
    await openBooth(page, { controls });
    await start(page);
    const rail = page.getByTestId("booth-energy-rail");
    // (with the panel open a short deck folds the card: the pill brings it back)
    if (!(await rail.isVisible())) await page.getByTestId("booth-deck-more").click();
    await expect(rail).toBeVisible();
    await rail.scrollIntoViewIfNeeded();
    const m = await rail.evaluate((card) => {
      const r = (e: Element) => e.getBoundingClientRect();
      const eyebrow = card.querySelector(".booth-energy-head > .booth-eyebrow")!;
      const scrub = card.querySelector('[data-testid="booth-scrub-toggle"]')!;
      const svg = card.querySelector('[data-testid="booth-energy-svg"]')!;
      const dots = [...svg.querySelectorAll("circle")].map((c) => r(c));
      const label = card.querySelector('[data-testid="booth-here-label"] rect');
      const nums = [...svg.querySelectorAll("g:has(> circle) > text")].map((tx) => {
        const circle = tx.parentElement!.querySelector("circle")!;
        const a = r(tx);
        const b = r(circle);
        return Math.abs(a.top + a.height / 2 - (b.top + b.height / 2));
      });
      return {
        eyebrowH: r(eyebrow).height,
        eyebrowCut: (eyebrow as HTMLElement).scrollWidth > (eyebrow as HTMLElement).clientWidth + 1,
        scrubName: scrub.getAttribute("aria-label") ?? "",
        said: eyebrow.textContent ?? "",
        scrubHit: (() => {
          const a = getComputedStyle(scrub, "::after");
          const b = r(scrub);
          const pad = (v: string) => -(Number.parseFloat(v) || 0);
          return Math.min(b.width + pad(a.left) + pad(a.right), b.height + pad(a.top) + pad(a.bottom));
        })(),
        lineH: Number.parseFloat(getComputedStyle(eyebrow).lineHeight) || 17,
        scrubH: r(scrub).height,
        scrubCy: r(scrub).top + r(scrub).height / 2,
        eyebrowCy: r(eyebrow).top + r(eyebrow).height / 2,
        plot: r(svg),
        spread: Math.max(...dots.map((d) => d.right)) - Math.min(...dots.map((d) => d.left)),
        label: label ? r(label) : null,
        dots: dots.map((d) => ({ l: d.left, t: d.top, r: d.right, b: d.bottom })),
        nums,
      };
    });
    expect(m.eyebrowH, name).toBeLessThanOrEqual(m.lineH + 2);
    // the whole title on one line (no "ENERGY …"): Scrub shrinks to its icon on a narrow card, named for a reader
    expect(m.eyebrowCut, `${name}: the title is cut`).toBe(false);
    expect(m.scrubName, name).toBe("Scrub");
    expect(m.said, `${name}: a reader hears the full title`).toContain("Energy tonight");
    expect(m.scrubHit, `${name}: Scrub is a 44 px target`).toBeGreaterThanOrEqual(43.5);
    expect(m.scrubH, name).toBeLessThanOrEqual(36);
    expect(Math.abs(m.scrubCy - m.eyebrowCy), name).toBeLessThanOrEqual(2);
    // the dots use most of the plot's width (they sat in its middle third)
    expect(m.spread / m.plot.width, name).toBeGreaterThan(0.45);
    for (const n of m.nums) expect(n, name).toBeLessThanOrEqual(1.5);
    if (m.label)
      for (const d of m.dots)
        expect(
          d.r > m.label.l && d.l < m.label.r && d.b > m.label.t && d.t < m.label.b,
          `${name}: "we are here" over a dot`,
        ).toBe(false);
    await shot(page, `qa-energy-${name}`);
    await ctx.close();
  }
});

const bootedName = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __tdjBooth: { getState: () => { playlist: { name: string; tandas: unknown[] } | null } };
        }
      ).__tdjBooth.getState().playlist,
  );

test.describe("Load a night / Clear the Booth", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("clear + Undo", async ({ page }) => {
    await openBooth(page);
    // clear before the night: the Booth empties, Compose keeps its night; Undo loads it back
    await page.getByTestId("booth-more").click();
    await page.getByTestId("booth-menu-load").click();
    await expect(page.getByTestId("booth-load-sheet")).toBeVisible();
    await shot(page, "qa-load-sheet");
    await page.getByTestId("booth-load-clear").click();
    await expect(page.getByTestId("booth-empty")).toBeVisible();
    await expect(page.getByTestId("booth-empty-load")).toBeVisible();
    await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
    await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId("booth-start")).toBeVisible();
  });

  test("Import (a pasted list) → Play in the Booth loads it ready; mid-night a night from History asks first", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openBooth(page);
    await page.getByTestId("booth-more").click();
    await page.getByTestId("booth-menu-load").click();
    await page.getByTestId("booth-load-import").click();
    await expect(page).toHaveURL(/\/import/);
    await page.goto("/import?from=text");
    await page.getByTestId("import-text").fill(`Bahía Blanca – Carlos Di Sarli
Organito de la tarde – Carlos Di Sarli
El Cachafaz - Carlos Di Sarli
Don Juan – Carlos Di Sarli

Cortina: Yesterday – The Beatles
Pavadita – Juan D'Arienzo
Paciencia – Juan D'Arienzo
El flete – Juan D'Arienzo`);
    await page.locator("#import-text-go").click();
    await expect(page.getByTestId("import-tanda").first()).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("import-name").fill("Pasted for the Booth");
    await page.getByTestId("import-play-booth").click();
    await expect(page).toHaveURL(/\/booth/, { timeout: 30000 });
    await expect(page.getByTestId("booth-start")).toBeVisible({ timeout: 30000 });
    await expect
      .poll(async () => (await bootedName(page))?.name, { timeout: 30000 })
      .toBe("Pasted for the Booth");
    // mid-night: a night from History (the import is there) asks first; "Now" ends this one and loads it ready
    await start(page);
    await page.getByTestId("booth-more").click();
    await page.getByTestId("booth-menu-load").click();
    await page.getByTestId("booth-load-history-0").click();
    await expect(page.getByTestId("booth-load-replace")).toBeVisible();
    await expect(page.getByTestId("booth-load-after")).toBeVisible();
    await page.getByTestId("booth-load-now").click();
    await expect(page.getByTestId("booth-start")).toBeVisible({ timeout: 30000 });
    expect((await snap(page)).state).not.toBe("playing");
    await shot(page, "qa-load-history");
  });

  test("mid-night: a row's sheet opens on Play now (focused); Enter plays it in the room", async ({
    page,
  }) => {
    await openBooth(page);
    await start(page);
    const before = (await snap(page)).cur;
    // a row a few songs on: the tap opens its sheet, Play now armed and focused
    const pick = (from: number) =>
      page.evaluate((k) => {
        const s = (
          window as unknown as {
            __tdjBooth: {
              getState: () => {
                planIndex: number;
                sources: string[];
                plan: { items: Array<{ kind: string }> };
              };
            };
          }
        ).__tdjBooth.getState();
        return s.plan.items.findIndex(
          (it, i) => i >= s.planIndex + k && it.kind === "track" && s.sources[i] !== "missing",
        );
      }, from);
    const i1 = await pick(3);
    const row = page.locator(
      `.booth-col-set .booth-row[data-plan-index="${i1}"] [data-testid="booth-row-play"]`,
    );
    await row.scrollIntoViewIfNeeded();
    await row.click();
    const pn = page.getByTestId("booth-play-now");
    await expect(pn).toBeFocused();
    await expect(pn).toHaveAttribute("data-armed", "true");
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await snap(page)).cur, { timeout: 15000 }).not.toBe(before);
    // opened by its number (not armed): Enter arms, Enter again plays
    await expect.poll(async () => (await snap(page)).cur, { timeout: 15000 }).not.toBeNull();
    await expect.poll(async () => (await snap(page)).state, { timeout: 15000 }).toBe("playing");
    const now = (await snap(page)).cur;
    const i2 = await pick(3);
    const open = page.locator(
      `.booth-col-set .booth-row[data-plan-index="${i2}"] [data-testid="booth-row-open"]`,
    );
    await open.scrollIntoViewIfNeeded();
    await open.click();
    await expect(pn).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(pn).toHaveAttribute("data-armed", "true");
    expect((await snap(page)).cur).toBe(now);
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await snap(page)).cur, { timeout: 15000 }).not.toBe(now);
  });

  test("a toast: ✕ on hover dismisses it, Esc dismisses it, hover pauses its timer", async ({ page }) => {
    await openBooth(page);
    // Start in Rehearsal says the opening has no clip: an informational toast
    await page.getByTestId("booth-start").click();
    const toast = page.getByTestId("toast");
    await expect(toast).toBeVisible();
    const close = toast.getByTestId("toast-close");
    await expect(close).toHaveCSS("opacity", "0");
    await toast.hover();
    await expect(close).toHaveCSS("opacity", "1");
    await expect(close).toHaveAttribute("aria-label", "Dismiss");
    // hovering holds it past its 3.5 s
    await page.waitForTimeout(4500);
    await expect(toast).toBeVisible();
    await close.click();
    await expect(toast).toHaveCount(0);
    // Esc: another toast (⌘Z says what it undid or that there is nothing to undo), then Esc
    await page.mouse.move(5, 5);
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("ControlOrMeta+z");
    await expect(toast).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(toast).toHaveCount(0);
  });
});
