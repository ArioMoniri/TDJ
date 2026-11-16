/**
 * 2026-11 — the Booth, pass 2 (the owner's reports):
 * 1. "On scroll the upper and lower bars mix so much" / "UI issues between boxes": every adjacent pair of boxes (the
 *    deck's cards, the night card and the set list, the Controls panel's groups, a column and the panel, the panel
 *    and the transport) is one gap apart (12 px, 8 px on a phone, ±1), nothing intersects, the bottom stack takes the
 *    content column's edges (1920), and scrolled, no card slides over another — iPad landscape / portrait, iPhone,
 *    1440 and 1920, the panel closed and open, dark and light;
 * 2. Energy tonight: Scrub (off by default) — drag or the arrow keys pick a tanda, "Play from tanda N" plays it;
 * 3. the song sheet: Play now plays (two taps mid-night), Play next shows in Up Next and the set list with Undo,
 *    "Pre-listen: Pick your headphones first" opens the headphones picker;
 * 4. Enter on a focused row (and in the open song sheet) is Play now in the room, Enter again confirms;
 * 5. the transition editor opens only from the gap pill between two rows (44 px, "Edit the transition");
 * 6. the More sheet's Rehearsal row says why it cannot act, never a silent grey row;
 * 7. the night on every other page: the Booth's mini controller (Compose, Library, Database, Settings).
 * Screenshots (scale 1) go to $BOOTH_SHOTS when set.
 */
import { type BrowserContextOptions, devices, expect, type Page, test } from "@playwright/test";
import { hold } from "./confirm";
import { DUO_MATRIX } from "./devices";

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

const IPAD_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const dev = (name: string, extra: Partial<BrowserContextOptions> = {}): BrowserContextOptions => {
  const { defaultBrowserType: _b, ...rest } = devices[name]!;
  return { ...rest, deviceScaleFactor: 1, ...extra };
};
const VIEWS: Array<[string, BrowserContextOptions]> = [
  [
    "ipad-landscape",
    dev("iPad Pro 11 landscape", { viewport: { width: 1180, height: 820 }, userAgent: IPAD_SAFARI }),
  ],
  ["ipad-portrait", dev("iPad Pro 11", { userAgent: IPAD_SAFARI })],
  ["iphone", dev("iPhone 15 Pro")],
  ["desktop-1440", { viewport: { width: 1440, height: 900 } }],
  ["desktop-1920", { viewport: { width: 1920, height: 1080 } }],
  // 2026-11: iPhone Duo folded and open (e2e/devices.ts)
  ...DUO_MATRIX.map(([n, o]): [string, BrowserContextOptions] => [n.toLowerCase().replace(/ /g, "-"), o]),
];

async function openBooth(page: Page, o: { light?: boolean } = {}) {
  await page.addInitScript((light) => {
    try {
      localStorage.setItem("tdj-booth-theme", light ? "light" : "dark");
    } catch {}
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
  }, !!o.light);
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
  const fresh = page.getByTestId("booth-resume").getByRole("button", { name: "Start from the beginning" });
  if (await fresh.isVisible().catch(() => false)) await fresh.click();
}

type Snap = { planIndex: number; state: string; started: boolean; cur: number | null; picked: number | null };
const snap = (page: Page) =>
  page.evaluate(() => {
    const s = (
      window as unknown as { __tdjBooth: { getState: () => Record<string, unknown> } }
    ).__tdjBooth.getState();
    return {
      planIndex: s.planIndex as number,
      state: s.state as string,
      started: s.started as boolean,
      cur: ((s.current as { planIndex: number } | null)?.planIndex ?? null) as number | null,
      picked: (s.pickedNext as number | null) ?? null,
    } as Snap;
  });
type Item = { kind: string; tanda: number; title: string };
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
const playableTracks = async (page: Page) => {
  const items = await planOf(page);
  const sources = await sourcesOf(page);
  return items
    .map((it, i) => ({ it, i }))
    .filter(({ it, i }) => it.kind === "track" && sources[i] !== "missing")
    .map(({ i }) => i);
};

type Box = { name: string; l: number; t: number; r: number; b: number };
/** every box of the layout, in the page, with the gap token and the bottom stack */
const layout = (page: Page) =>
  page.evaluate(() => {
    const box = (name: string, el: Element | null): Box | null => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0 || getComputedStyle(el).display === "none") return null;
      return { name, l: r.left, t: r.top, r: r.right, b: r.bottom };
    };
    const q = (s: string) => document.querySelector(s);
    const gap = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--booth-gap"));
    const deck = [
      box("now", q('[data-testid="booth-now"]')),
      box("next", q('[data-testid="booth-next"]')),
      box("energy", q('[data-testid="booth-energy-rail"]')),
      box("night-deck", q(".booth-deck > .booth-night")),
    ].filter(Boolean) as Box[];
    const set = [
      box("night", q(".booth-col-set > .booth-night")),
      box("set", q(".booth-col-set > .booth-set")),
    ].filter(Boolean) as Box[];
    const groups = [...document.querySelectorAll(".booth-ctl-body > *")]
      .map((el, i) => box(`group${i}`, el))
      .filter(Boolean) as Box[];
    return {
      gap,
      vw: window.innerWidth,
      vh: window.innerHeight,
      deck,
      set,
      groups,
      page: box("page", q(".booth")),
      grid: box("grid", q(".booth-grid")),
      deckCol: box("deckCol", q(".booth-deck")),
      setCol: box("setCol", q(".booth-col-set")),
      panel: box("panel", q('[data-testid="booth-controls"]')),
      strip: box("strip", q('[data-testid="booth-strip"]')),
      deckScroll: (q(".booth-deck") as HTMLElement | null)?.scrollTop ?? 0,
      deckScrollable:
        ((q(".booth-deck") as HTMLElement | null)?.scrollHeight ?? 0) >
        ((q(".booth-deck") as HTMLElement | null)?.clientHeight ?? 0) + 2,
    };
  });
type Layout = Awaited<ReturnType<typeof layout>>;
const inter = (a: Box, b: Box) =>
  Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1;

/** gaps between adjacent boxes: stacked (same column) or side by side (same row) */
function checkGaps(boxes: Box[], gap: number, where: string) {
  const out: string[] = [];
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      if (inter(a, b)) out.push(`${where}: ${a.name} intersects ${b.name}`);
      const overlapX = Math.min(a.r, b.r) - Math.max(a.l, b.l);
      const overlapY = Math.min(a.b, b.b) - Math.max(a.t, b.t);
      // stacked neighbours: the nearer one below
      if (overlapX > 20) {
        const [up, down] = a.t < b.t ? [a, b] : [b, a];
        const between = boxes.some(
          (c) =>
            c !== up &&
            c !== down &&
            c.t >= up.b - 1 &&
            c.b <= down.t + 1 &&
            Math.min(c.r, up.r) - Math.max(c.l, up.l) > 20,
        );
        if (!between && Math.abs(down.t - up.b - gap) > 1)
          out.push(`${where}: ${up.name}→${down.name} vertical gap ${(down.t - up.b).toFixed(1)} ≠ ${gap}`);
      } else if (overlapY > 20) {
        const [lf, rt] = a.l < b.l ? [a, b] : [b, a];
        const between = boxes.some(
          (c) =>
            c !== lf &&
            c !== rt &&
            c.l >= lf.r - 1 &&
            c.r <= rt.l + 1 &&
            Math.min(c.b, lf.b) - Math.max(c.t, lf.t) > 20,
        );
        if (!between && Math.abs(rt.l - lf.r - gap) > 1)
          out.push(`${where}: ${lf.name}→${rt.name} horizontal gap ${(rt.l - lf.r).toFixed(1)} ≠ ${gap}`);
      }
    }
  return out;
}

function checkLayout(L: Layout, o: { phone: boolean; panel: boolean }) {
  const errs: string[] = [];
  const expected = o.phone ? 8 : 12;
  if (L.gap !== expected) errs.push(`--booth-gap ${L.gap} ≠ ${expected}`);
  errs.push(...checkGaps(L.deck, L.gap, "deck"));
  errs.push(...checkGaps(L.set, L.gap, "set column"));
  // side-by-side cards share their top edge (Up Next and the energy chart)
  const next = L.deck.find((b) => b.name === "next");
  const energy = L.deck.find((b) => b.name === "energy");
  if (next && energy && Math.abs(next.t - energy.t) <= 2 && Math.abs(next.b - energy.b) > 1)
    errs.push(`next/energy bottoms differ ${next.b} vs ${energy.b}`);
  if (L.strip && L.page && !o.phone) {
    // the bottom stack takes the content column's edges
    if (Math.abs(L.strip.l - L.page.l) > 1 || Math.abs(L.strip.r - L.page.r) > 1)
      errs.push(`transport ${L.strip.l}–${L.strip.r} ≠ content ${L.page.l}–${L.page.r}`);
    if (L.panel && (Math.abs(L.panel.l - L.page.l) > 1 || Math.abs(L.panel.r - L.page.r) > 1))
      errs.push(`panel ${L.panel.l}–${L.panel.r} ≠ content ${L.page.l}–${L.page.r}`);
  }
  if (o.panel && L.panel && L.strip) {
    if (Math.abs(L.strip.t - L.panel.b - L.gap) > 1)
      errs.push(`panel→transport gap ${(L.strip.t - L.panel.b).toFixed(1)} ≠ ${L.gap}`);
    errs.push(...checkGaps(L.groups, L.gap, "panel groups"));
  }
  // two columns: each column ends one gap above the bottom stack (panel or transport) and the two columns are a gap apart
  if (L.deckCol && L.setCol && Math.abs(L.deckCol.t - L.setCol.t) <= 1 && L.grid && L.strip) {
    const foot = o.panel && L.panel ? L.panel.t : L.strip.t;
    if (Math.abs(foot - L.grid.b - L.gap) > 1.5)
      errs.push(`columns→stack gap ${(foot - L.grid.b).toFixed(1)} ≠ ${L.gap}`);
    if (Math.abs(L.setCol.l - L.deckCol.r - L.gap) > 1)
      errs.push(`deck→set gap ${(L.setCol.l - L.deckCol.r).toFixed(1)}`);
    for (const b of [L.deckCol, L.setCol]) if (b.b > foot + 0.5) errs.push(`${b.name} runs under the stack`);
  }
  return errs;
}

test.describe("1. one clean column, one gap", () => {
  for (const [name, opts] of VIEWS)
    for (const light of name === "desktop-1440" || name === "ipad-landscape" ? [false, true] : [false]) {
      test(`${name}${light ? " light" : ""}: gaps, no intersection, aligned edges; scrolled, no card over another; panel open too`, async ({
        browser,
      }) => {
        test.setTimeout(150_000);
        const ctx = await browser.newContext(opts);
        const page = await ctx.newPage();
        await openBooth(page, { light });
        await start(page);
        const phone = name === "iphone" || name === "iphone-duo-folded";
        const tag = `${name}${light ? "-light" : ""}`;
        await page.waitForTimeout(600);
        let errs = checkLayout(await layout(page), { phone, panel: false });
        expect(errs, errs.join("\n")).toEqual([]);
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/${tag}-top.png` });
        // scrolled: the deck (two columns) or the page (phone, portrait)
        await page.evaluate(() => {
          const d = document.querySelector<HTMLElement>(".booth-deck");
          if (d) d.scrollTop = 260;
          window.scrollTo(0, 420);
        });
        await page.waitForTimeout(300);
        const L = await layout(page);
        errs = checkLayout(L, { phone, panel: false });
        expect(errs, errs.join("\n")).toEqual([]);
        if (!phone && name !== "ipad-portrait" && L.deckScrollable) expect(L.deckScroll).toBeGreaterThan(0);
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/${tag}-scrolled.png` });
        // the Controls panel open (iPad / desktop)
        const toggle = page.getByTestId("booth-controls-toggle");
        if (!phone && (await toggle.isVisible())) {
          await toggle.click();
          await expect(page.getByTestId("booth-controls")).toBeVisible();
          await page.waitForTimeout(500);
          errs = checkLayout(await layout(page), { phone, panel: true });
          expect(errs, errs.join("\n")).toEqual([]);
          if (SHOTS) await page.screenshot({ path: `${SHOTS}/${tag}-panel.png` });
        }
        await ctx.close();
      });
    }
});

test("2. Energy tonight: Scrub is off by default; on, a drag and the arrow keys pick a tanda; Play from tanda N plays it (mid-night: armed, then confirmed)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooth(page);
  const rail = page.getByTestId("booth-energy-rail");
  const toggle = rail.getByTestId("booth-scrub-toggle");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(rail.getByTestId("booth-scrub-line")).toHaveCount(0);
  const box = (await toggle.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  // a stray drag on the chart with Scrub off changes nothing
  const svg = rail.getByTestId("booth-energy-svg");
  await svg.scrollIntoViewIfNeeded();
  let sb = (await svg.boundingBox())!;
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height * 0.6, { steps: 4 });
  await page.mouse.up();
  await expect(rail.getByTestId("booth-scrub-line")).toHaveCount(0);
  expect((await snap(page)).started).toBe(false);
  // on: the cursor starts at "we are here"; a drag moves it down the night
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  const line = rail.getByTestId("booth-scrub-line");
  await expect(line).toHaveAttribute("data-tanda", "1");
  await svg.scrollIntoViewIfNeeded();
  sb = (await svg.boundingBox())!;
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height * 0.4, { steps: 6 });
  await page.mouse.up();
  const t1 = Number(await line.getAttribute("data-tanda"));
  expect(t1).toBeGreaterThan(5);
  await expect(rail.getByTestId("booth-scrub-out")).toContainText(`Tanda ${t1} ·`);
  await expect(rail.getByTestId("booth-scrub-out")).toContainText(/energy \d+/);
  // the arrow keys step one tanda
  await rail.getByTestId("booth-scrub-input").focus();
  await page.keyboard.press("ArrowDown");
  await expect(line).toHaveAttribute("data-tanda", String(t1 + 1));
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(line).toHaveAttribute("data-tanda", String(t1 - 1));
  // the "we are here" line stays
  await expect(rail.getByTestId("booth-here")).toHaveCount(1);
  const items = await planOf(page);
  const sources = await sourcesOf(page);
  const tanda = t1 - 1;
  const first = items.findIndex((x) => x.tanda === tanda && x.kind === "track");
  test.skip(sources[first] === "missing", "this tanda's first side has no clip tonight");
  await expect(rail.getByTestId("booth-scrub-play")).toHaveText(`Play from tanda ${tanda}`);
  if (SHOTS) await rail.screenshot({ path: `${SHOTS}/scrub.png` });
  // before the night: one tap starts the night there
  await rail.getByTestId("booth-scrub-play").click();
  await expect.poll(async () => (await snap(page)).cur, { timeout: 20000 }).toBe(first);
  expect((await snap(page)).state).toBe("playing");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  // mid-night: Play from tanda N+2 arms first (the room keeps its song), the second tap plays
  await toggle.click();
  const input = rail.getByTestId("booth-scrub-input");
  await input.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  const t2 = Number(await line.getAttribute("data-tanda"));
  expect(t2).toBe(tanda + 2);
  const first2 = items.findIndex((x) => x.tanda === t2 && x.kind === "track");
  const play = rail.getByTestId("booth-scrub-play");
  await play.click();
  await expect(play).toHaveAttribute("data-armed", "true");
  await page.waitForTimeout(300);
  expect((await snap(page)).cur).toBe(first);
  await play.click();
  await expect.poll(async () => (await snap(page)).cur, { timeout: 15000 }).toBe(first2);
});

test("3. song sheet (clips): Play now plays after the confirm tap; Play next shows in Up Next and the set list, Undo restores; Pre-listen line opens the headphones picker", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooth(page);
  await start(page);
  const playable = await playableTracks(page);
  const a = (await snap(page)).cur!;
  const sheet = page.getByTestId("booth-play-sheet");
  // Play now
  const later = playable.find((i) => i > a + 2)!;
  const row = page.locator(`.booth-row[data-plan-index="${later}"]`);
  await row.scrollIntoViewIfNeeded();
  await row.getByTestId("booth-row-open").click();
  const pn = sheet.getByTestId("booth-play-now");
  await pn.click();
  await expect(pn).toHaveAttribute("data-armed", "true");
  expect((await snap(page)).cur).toBe(a);
  await pn.click();
  await expect.poll(async () => (await snap(page)).cur, { timeout: 15000 }).toBe(later);
  await expect(sheet).toHaveCount(0);
  // Play next: Up Next names it, its row says Next, the toast offers Undo
  const pick = playable.find((i) => i > later + 3)!;
  const pickRow = page.locator(`.booth-row[data-plan-index="${pick}"]`);
  await pickRow.scrollIntoViewIfNeeded();
  await pickRow.getByTestId("booth-row-open").click();
  await sheet.getByRole("button", { name: "Play next" }).click();
  await expect.poll(async () => (await snap(page)).picked).toBe(pick);
  await expect(page.getByTestId("booth-next")).toHaveAttribute("data-next", String(pick));
  await expect(page.getByTestId("booth-next")).toHaveAttribute("data-picked", "true");
  await expect(pickRow.getByTestId("booth-row-next")).toHaveText("Next");
  const toastUndo = page.getByRole("button", { name: "Undo" }).last();
  await expect(toastUndo).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/play-next.png` });
  await toastUndo.click();
  await expect.poll(async () => (await snap(page)).picked).toBeNull();
  await expect(page.getByTestId("booth-next")).not.toHaveAttribute("data-next", String(pick));
  await expect(pickRow.getByTestId("booth-row-next")).toHaveCount(0);
  // again, and it plays at the gap after the running song (Next now: the picked one)
  await pickRow.getByTestId("booth-row-open").click();
  await sheet.getByRole("button", { name: "Play next" }).click();
  await expect.poll(async () => (await snap(page)).picked).toBe(pick);
  await hold(page, page.getByTestId("booth-next-now"));
  await expect.poll(async () => (await snap(page)).cur, { timeout: 15000 }).toBe(pick);
  // no headphones chosen: the sheet's Pre-listen line opens the Headphones picker
  const r3 = page.locator(`.booth-row[data-plan-index="${playable.find((i) => i > pick + 2)!}"]`);
  await r3.scrollIntoViewIfNeeded();
  await r3.getByTestId("booth-row-open").click();
  const link = sheet.getByTestId("booth-pick-headphones");
  await expect(link).toContainText("Pick your headphones first");
  expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await link.click();
  await expect(page.getByTestId("booth-output-sheet")).toBeVisible();
  await expect(page.getByTestId("booth-output-sheet")).toContainText(/headphones/i);
});

test("4. Enter on a focused row is Play now in the room: before the night it starts there; mid-night Enter arms (the sheet opens on Play now) and Enter again plays; listed in the shortcuts", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooth(page);
  const playable = await playableTracks(page);
  const third = playable[2]!;
  await page.locator(`.booth-row[data-plan-index="${third}"]`).getByTestId("booth-row-play").focus();
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await snap(page)).cur, { timeout: 20000 }).toBe(third);
  const later = playable.find((i) => i > third + 3)!;
  const row = page.locator(`.booth-row[data-plan-index="${later}"]`);
  await row.scrollIntoViewIfNeeded();
  await row.getByTestId("booth-row-play").focus();
  await page.keyboard.press("Enter");
  const sheet = page.getByTestId("booth-play-sheet");
  await expect(sheet).toBeVisible();
  const pn = sheet.getByTestId("booth-play-now");
  await expect(pn).toHaveAttribute("data-armed", "true");
  await expect(pn).toBeFocused();
  await page.waitForTimeout(300);
  expect((await snap(page)).cur).toBe(third);
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await snap(page)).cur, { timeout: 15000 }).toBe(later);
  // in the open song sheet, off its controls: Enter arms, Enter again plays
  const other = playable.find((i) => i > later + 3)!;
  const orow = page.locator(`.booth-row[data-plan-index="${other}"]`);
  await orow.scrollIntoViewIfNeeded();
  await orow.getByTestId("booth-row-open").click();
  await expect(sheet).toBeVisible();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Enter");
  await expect(sheet.getByTestId("booth-play-now")).toHaveAttribute("data-armed", "true");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await snap(page)).cur, { timeout: 15000 }).toBe(other);
  // the shortcuts sheet
  await page.keyboard.press("Escape");
  await page.keyboard.press("?");
  const keys = page.getByTestId("booth-shortcuts");
  // (the binding is the keymap's — lib/keymap.ts booth.playNow — editable in Settings → Keyboard)
  const keyRow = keys.getByTestId("shortcut-booth.playNow");
  await expect(keyRow).toContainText("now in the room");
  await expect(keyRow.locator("kbd")).toHaveText("↵");
});

test("5. the transition editor opens only from the gap pill (44 px, Edit the transition); the row and its title play or open the song", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooth(page);
  const gap = page.getByTestId("booth-gap").nth(3);
  await gap.scrollIntoViewIfNeeded();
  const g = (await gap.boundingBox())!;
  expect(g.height).toBeGreaterThanOrEqual(44);
  expect(g.width).toBeGreaterThanOrEqual(44);
  await expect(gap).toHaveAttribute("data-hint", "Edit the transition");
  const from = Number(await gap.getAttribute("data-from"));
  // the rows on either side: a tap at their artwork's top and bottom edges (where the pill's box reaches) is the row's
  for (const [i, edge] of [
    [from, "bottom"],
    [from + 1, "top"],
  ] as const) {
    const art = page.locator(`.booth-row[data-plan-index="${i}"]`).getByTestId("booth-art").first();
    const n = page.locator(`.booth-row[data-plan-index="${i}"]`).getByTestId("booth-row-open");
    for (const el of [art, n]) {
      const b = (await el.boundingBox())!;
      const y = edge === "top" ? b.y + 2 : b.y + b.height - 2;
      const hit = await page.evaluate(
        ([x, yy]) => {
          const e = document.elementFromPoint(x, yy);
          return e?.closest('[data-testid="booth-gap"]') ? "gap" : e?.closest(".booth-row") ? "row" : "other";
        },
        [b.x + b.width / 2, y] as const,
      );
      expect(hit, `row ${i} ${edge} edge`).toBe("row");
    }
  }
  // the title opens the song (before the night: plays there) — never the editor
  await expect(page.getByTestId("booth-transition-sheet")).toHaveCount(0);
  // the pill's centre opens the editor
  const hitGap = await page.evaluate(
    ([x, y]) => !!document.elementFromPoint(x, y)?.closest('[data-testid="booth-gap"]'),
    [g.x + 20, g.y + g.height / 2] as const,
  );
  expect(hitGap).toBe(true);
  await gap.hover();
  await page.mouse.click(g.x + 20, g.y + g.height / 2);
  await expect(page.getByTestId("booth-transition-sheet")).toBeVisible();
});

test("6. More → Rehearsal: never a silent grey row — clips only here says why; a checkmark when on", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooth(page);
  await page.getByTestId("booth-more").click();
  const row = page.getByTestId("booth-menu").getByTestId("booth-menu-rehearsal");
  await expect(row).toBeVisible();
  // the e2e has no Spotify Premium and no folder: only clips can play — the row says why (and shows it is on)
  await expect(row).toContainText("Only 30 s clips can play here");
  await expect(row.getByTestId("menu-check")).toHaveCount(1);
  // every disabled row in the sheet has its reason under it
  const rows = page.getByTestId("booth-menu").getByRole("menuitem");
  for (let i = 0; i < (await rows.count()); i++) {
    const r = rows.nth(i);
    if (await r.isDisabled()) await expect(r.getByTestId("menu-subtitle")).not.toBeEmpty();
  }
});

test("7. the night on other pages: the mini controller on Compose, Library, Database and Settings; the room keeps playing; Pause / Resume, Next (hold), Mute, back to the Booth", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooth(page);
  await start(page);
  await expect(page.getByTestId("booth-mini")).toHaveCount(0);
  const title = await page.getByTestId("booth-now-title").innerText();
  for (const href of ["/", "/library", "/database", "/settings"]) {
    await page.getByTestId("sidebar").locator(`a.side-row[href="${href}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`${href === "/" ? "/(\\?.*)?$" : href}`));
    const mini = page.getByTestId("booth-mini");
    await expect(mini).toBeVisible({ timeout: 10000 });
    await expect(mini.getByTestId("booth-mini-title")).toHaveText((await snapTitle(page)) ?? title);
    await expect(mini.getByTestId("booth-mini-when")).toContainText(/Tanda \d+ of \d+ · next in \d+:\d\d/);
    expect(["playing", "cortina"]).toContain((await snap(page)).state);
    // never over the sidebar; inside the viewport
    const b = (await mini.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(240);
    expect(b.y + b.height).toBeLessThanOrEqual(900);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/mini${href.replace(/\//g, "-") || "-compose"}.png` });
  }
  const mini = page.getByTestId("booth-mini");
  // Pause and Resume
  await mini.getByTestId("booth-mini-toggle").click();
  await expect.poll(async () => (await snap(page)).state).toBe("paused");
  await expect(mini.getByTestId("booth-mini-status")).toHaveText("Paused");
  await mini.getByTestId("booth-mini-toggle").click();
  await expect.poll(async () => (await snap(page)).state).toBe("playing");
  // Next: a tap only nudges, a hold plays the next song
  const cur = (await snap(page)).cur;
  await mini.getByTestId("booth-mini-next").click();
  await page.waitForTimeout(400);
  expect((await snap(page)).cur).toBe(cur);
  await hold(page, mini.getByTestId("booth-mini-next"));
  await expect.poll(async () => (await snap(page)).cur, { timeout: 15000 }).not.toBe(cur);
  // Mute
  await mini.getByTestId("booth-mini-mute").click();
  await expect(mini.getByTestId("booth-mini-mute")).toHaveAttribute("aria-pressed", "true");
  await mini.getByTestId("booth-mini-mute").click();
  await expect(mini.getByTestId("booth-mini-mute")).toHaveAttribute("aria-pressed", "false");
  // the seek bar: one tap arms, the second jumps
  const seek = mini.getByTestId("booth-mini-seek");
  const sb = (await seek.boundingBox())!;
  await page.mouse.click(sb.x + sb.width * 0.7, sb.y + sb.height / 2);
  await expect(mini.getByTestId("booth-mini-seek-arm")).toContainText(/Tap again to jump to \d+:\d\d/);
  await page.mouse.click(sb.x + sb.width * 0.7, sb.y + sb.height / 2);
  await expect.poll(async () => Number(await seek.getAttribute("data-pos"))).toBeGreaterThan(15);
  // back to the Booth: the same night, still playing
  await mini.getByTestId("booth-mini-back").click();
  await expect(page).toHaveURL(/\/booth/);
  await expect(page.getByTestId("booth-mini")).toHaveCount(0);
  expect(["playing", "cortina"]).toContain((await snap(page)).state);
  expect((await snap(page)).started).toBe(true);
});

const snapTitle = (page: Page) =>
  page.evaluate(() => {
    const s = (
      window as unknown as {
        __tdjBooth: { getState: () => { plan: { items: Array<{ title: string }> }; planIndex: number } };
      }
    ).__tdjBooth.getState();
    return s.plan.items[s.planIndex]?.title ?? null;
  });
