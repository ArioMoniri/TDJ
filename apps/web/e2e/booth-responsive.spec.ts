/**
 * 2026-11 — the Booth follows the room it is given (the owner, Mac app at ~1000 px with the sidebar open: the Now card
 * crushed to one word per line, "This devi…", "Choo…", "Previo…", "Contr…", More cut: "UI issues in smaller screen
 * sizes and it is not dynamic. Also the buttons should slide the text in them if their full text is not seen").
 *
 * 1. A matrix of the page's column (`main`) at 800, 900, 1000, 1100, 1280 and 1440 px with the sidebar open and
 *    collapsed, plus iPad Pro 11 portrait / landscape and an iPhone, the Controls panel closed and open: no column
 *    is narrower than its floor, no text runs one word per line or breaks inside a word, no two boxes overlap, nothing
 *    scrolls sideways, the transport keeps every cell whole (≥ 44 px) inside its bar.
 * 2. FitText (components/ui/FitText.tsx): a label that fits never moves; a cut one slides on hover (its transform
 *    changes) and back; under Reduce Motion nothing moves and a transport word shows its short form; the accessible
 *    name stays the whole text.
 * Screenshots (scale 2) go to $BOOTH_SHOTS when it is set.
 */
import { type BrowserContextOptions, devices, expect, type Page, test } from "@playwright/test";

const SHOTS = process.env.BOOTH_SHOTS;
const SIDEBAR = 240;
const COLLAPSED = 52;

async function openBooth(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("tdj-booth-theme", "dark");
    } catch {}
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
  });
  await page.route(/open\.spotify\.com\/oembed/, (r) => r.fulfill({ status: 404, body: "" }));
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/, { timeout: 60000 });
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 30000 });
  const fresh = page.getByTestId("booth-resume").getByRole("button", { name: "Start from the beginning" });
  if (await fresh.isVisible().catch(() => false)) await fresh.click();
  // the hint bubble of a first visit stays out of the measure
  await page.mouse.move(1, 1);
}

async function setSidebar(page: Page, collapsed: boolean, w = SIDEBAR) {
  await page.addInitScript(
    ([c, width]) => {
      try {
        localStorage.setItem("tdj-sidebar", JSON.stringify({ w: width, collapsed: c }));
      } catch {}
    },
    [collapsed, w] as const,
  );
}

type Box = { name: string; l: number; t: number; r: number; b: number; w: number; h: number };
/** everything the checks need, measured in the page */
const audit = (page: Page) =>
  page.evaluate(() => {
    const vis = (el: Element | null): el is HTMLElement => {
      if (!(el instanceof HTMLElement)) return false;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      for (let e: HTMLElement | null = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.display === "none" || cs.visibility === "hidden") return false;
      }
      return true;
    };
    const box = (name: string, el: Element | null): Box | null => {
      if (!vis(el)) return null;
      const r = el.getBoundingClientRect();
      return { name, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
    };
    const q = (s: string) => document.querySelector(s);
    const main = document.querySelector("main")!;
    // one word per line, or a word broken over two lines: every text node of the page's content and bars
    const roots = [".booth-head-row", ".booth-deck", ".booth-col-set .booth-night", ".booth-strip"]
      .map((s) => q(s))
      .filter(vis);
    // the set list: the tanda heads and the rows on screen
    const setBox = q(".booth-col-set")?.getBoundingClientRect();
    for (const el of document.querySelectorAll(".booth-col-set .booth-tanda-head, .booth-col-set .booth-row"))
      if (vis(el)) {
        const r = el.getBoundingClientRect();
        if (!setBox || (r.top < setBox.bottom && r.bottom > setBox.top && r.top < innerHeight))
          roots.push(el);
      }
    const wordy: string[] = [];
    const broken: string[] = [];
    const range = document.createRange();
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const host = n.parentElement;
        if (
          !host ||
          !vis(host) ||
          host.closest(".sr-only, [aria-hidden='true'] .fit-short, .booth-primary-measure")
        )
          continue;
        // (a FitText's whole line is one line by design: it slides)
        if (host.closest(".marquee")) continue;
        const text = n.textContent ?? "";
        const words: Array<{ w: string; tops: number[] }> = [];
        for (const m of text.matchAll(/\S+/g)) {
          range.setStart(n, m.index!);
          range.setEnd(n, m.index! + m[0].length);
          const tops = [
            ...new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))),
          ];
          if (tops.length) words.push({ w: m[0], tops });
        }
        for (const w of words)
          if (w.tops.length > 1 && w.w.replace(/[^\p{L}]/gu, "").length >= 4)
            broken.push(`${w.w} in "${text.trim().slice(0, 40)}"`);
        const letters = words.filter((w) => /\p{L}{2,}/u.test(w.w));
        if (letters.length >= 3) {
          const lines = new Set(letters.map((w) => w.tops[0]));
          if (lines.size >= letters.length) wordy.push(text.trim().slice(0, 60));
        }
      }
    }
    const chips = [
      ...document.querySelectorAll(
        ".booth-head-row > .booth-toolbar > *, .booth-head-row [data-testid='booth-find-songs']",
      ),
    ]
      .map((el, i) => box(`chip${i}:${(el as HTMLElement).dataset.testid ?? el.className}`, el))
      .filter(Boolean) as Box[];
    const strip = box("strip", q('[data-testid="booth-strip"]'));
    const cells = [
      ...document.querySelectorAll(
        '[data-testid="booth-strip"] > button, [data-testid="booth-strip"] > .booth-strip-now, [data-testid="booth-strip"] > .booth-fader',
      ),
    ]
      .map((el) => box((el as HTMLElement).dataset.testid ?? el.className, el))
      .filter(Boolean) as Box[];
    // a cut label with no FitText to show the rest (an ellipsis cut mid-word)
    const silentCuts = [
      ...document.querySelectorAll<HTMLElement>(
        ".booth-strip .booth-tbtn-l, .booth-toolbar .booth-out-name, .booth-strip .booth-start-label",
      ),
    ]
      .filter(vis)
      .filter((el) => el.scrollWidth > el.clientWidth + 1 && !el.querySelector(".fit[data-overflow='1']"))
      .map((el) => el.textContent ?? "");
    return {
      vw: innerWidth,
      main: main.getBoundingClientRect().width,
      mainContent:
        main.clientWidth -
        Number.parseFloat(getComputedStyle(main).paddingLeft) -
        Number.parseFloat(getComputedStyle(main).paddingRight),
      hScroll: document.documentElement.scrollWidth - innerWidth,
      gridOverflow: (() => {
        const g = q(".booth-grid") as HTMLElement | null;
        return g ? g.scrollWidth - g.clientWidth : 0;
      })(),
      deckCol: box("deckCol", q(".booth-deck")),
      setCol: box("setCol", q(".booth-col-set")),
      grid: box("grid", q(".booth-grid")),
      cards: [
        box("now", q('[data-testid="booth-now"]')),
        box("adapt", q(".booth-deck > [data-testid='booth-adapt']")),
        box("next", q('[data-testid="booth-next"]')),
        box("energy", q('[data-testid="booth-energy-rail"]')),
      ].filter(Boolean) as Box[],
      sets: [
        box("night", q(".booth-col-set > .booth-night")),
        box("set", q(".booth-col-set > .booth-set")),
      ].filter(Boolean) as Box[],
      chips,
      strip,
      stripOverflow: (() => {
        const s = q('[data-testid="booth-strip"]') as HTMLElement | null;
        return s ? s.scrollWidth - s.clientWidth : 0;
      })(),
      cells,
      wordy,
      broken,
      silentCuts,
    };
  });
type Audit = Awaited<ReturnType<typeof audit>>;

const inter = (a: Box, b: Box) =>
  Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1;
function overlaps(boxes: Box[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      if (inter(boxes[i]!, boxes[j]!)) out.push(`${boxes[i]!.name} × ${boxes[j]!.name}`);
  return out;
}

function check(a: Audit, where: string, phone: boolean) {
  const problems: string[] = [];
  if (a.hScroll > 1) problems.push(`page scrolls sideways by ${a.hScroll}`);
  if (a.gridOverflow > 1) problems.push(`grid overflows by ${a.gridOverflow}`);
  if (a.stripOverflow > 1) problems.push(`transport overflows by ${a.stripOverflow}`);
  // the floors: two columns side by side keep theirs; one column takes the page's width
  const two =
    a.deckCol && a.setCol && Math.abs(a.deckCol.t - a.setCol.t) < 2 && a.setCol.l >= a.deckCol.r - 1;
  if (two) {
    if (a.deckCol!.w < 299) problems.push(`deck ${a.deckCol!.w} < 300`);
    if (a.setCol!.w < 319) problems.push(`set list ${a.setCol!.w} < 320`);
  }
  const now = a.cards.find((c) => c.name === "now");
  if (now && now.w < (phone ? 300 : 280)) problems.push(`Now card ${now.w}`);
  const energy = a.cards.find((c) => c.name === "energy");
  if (energy && energy.w < 150) problems.push(`Energy card ${energy.w}`);
  for (const c of a.cards) if (c.w < 150) problems.push(`${c.name} ${c.w}`);
  problems.push(...overlaps(a.cards).map((x) => `cards: ${x}`));
  problems.push(...overlaps(a.sets).map((x) => `set column: ${x}`));
  if (two) problems.push(...overlaps([a.deckCol!, a.setCol!]).map((x) => `columns: ${x}`));
  problems.push(...overlaps(a.chips).map((x) => `chips: ${x}`));
  for (const c of a.chips) if (c.h < 43.5) problems.push(`chip ${c.name} ${c.h} px tall`);
  problems.push(...overlaps(a.cells).map((x) => `transport: ${x}`));
  if (a.strip)
    for (const c of a.cells) {
      if (c.l < a.strip.l - 1 || c.r > a.strip.r + 1) problems.push(`transport: ${c.name} leaves the bar`);
      if (c.name !== "booth-strip-now" && !c.name.includes("fader") && (c.w < 43.5 || c.h < 43.5))
        problems.push(`transport: ${c.name} ${c.w}×${c.h}`);
    }
  // at two columns the grid ends above the transport
  if (a.grid && a.strip && a.vw >= 900 && a.grid.b > a.strip.t + 1)
    problems.push("grid runs under the transport");
  problems.push(...a.wordy.map((x) => `one word per line: "${x}"`));
  problems.push(...a.broken.map((x) => `word broken: ${x}`));
  problems.push(...a.silentCuts.map((x) => `cut with no slide: "${x}"`));
  expect(problems, `${where} (vw ${a.vw}, main ${a.main})`).toEqual([]);
}

const { defaultBrowserType: _a, ...ipadP } = devices["iPad Pro 11"];
const { defaultBrowserType: _b, ...ipadL } = devices["iPad Pro 11 landscape"];
const { defaultBrowserType: _c, ...iphone } = devices["iPhone 15 Pro"];

type Case = {
  name: string;
  opts: BrowserContextOptions;
  collapsed?: boolean;
  phone?: boolean;
  sidebarW?: number;
};
const CASES: Case[] = [
  ...[800, 900, 1000, 1100, 1280, 1440].flatMap((w): Case[] => [
    { name: `main-${w}-sidebar-open`, opts: { viewport: { width: w + SIDEBAR, height: 820 } } },
    {
      name: `main-${w}-sidebar-collapsed`,
      opts: { viewport: { width: w + COLLAPSED, height: 820 } },
      collapsed: true,
    },
  ]),
  // the owner's window: ~1000 px with the sidebar open
  { name: "window-1000-sidebar-open", opts: { viewport: { width: 1000, height: 760 } } },
  // a wide sidebar (360 px) on that window, and a 900 px window: the column is under 660 px, one column
  { name: "window-1000-sidebar-wide", opts: { viewport: { width: 1000, height: 760 } }, sidebarW: 360 },
  { name: "window-900-sidebar-open", opts: { viewport: { width: 900, height: 760 } } },
  { name: "ipad-portrait", opts: ipadP },
  { name: "ipad-landscape", opts: ipadL },
  { name: "iphone", opts: iphone, phone: true },
];

for (const c of CASES) {
  test(`booth layout fits: ${c.name}`, async ({ browser }) => {
    test.setTimeout(150_000);
    const ctx = await browser.newContext({ ...c.opts, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await setSidebar(page, !!c.collapsed, c.sidebarW);
    await openBooth(page);
    await page.waitForTimeout(600);
    const a = await audit(page);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${c.name}.png` });
    check(a, c.name, !!c.phone);
    if (!c.phone) {
      await page.getByTestId("booth-controls-toggle").click();
      await expect(page.getByTestId("booth-controls")).toBeVisible();
      await page.waitForTimeout(600);
      await page.mouse.move(1, 1);
      const b = await audit(page);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${c.name}-controls.png` });
      check(b, `${c.name}, Controls open`, false);
    }
    await ctx.close();
  });
}

/** narrows a label's box so its text is cut (FitText measures again on the resize) */
const squeeze = (page: Page, sel: string, px: number) =>
  page.evaluate(
    ([s, w]) => {
      const el = document.querySelector<HTMLElement>(s as string)!;
      el.style.maxWidth = `${w}px`;
      el.style.width = `${w}px`;
    },
    [sel, px] as const,
  );
const transformOf = (page: Page, sel: string) =>
  page.evaluate((s) => getComputedStyle(document.querySelector(s)!).transform, sel);

test("FitText: still when it fits, slides on hover when cut, keeps the whole accessible name", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await openBooth(page);
  const more = '[data-testid="booth-more"] .fit';
  // fits: nothing moves on hover
  await expect(page.locator(more)).toHaveAttribute("data-overflow", "0");
  await page.getByTestId("booth-more").hover();
  await page.waitForTimeout(700);
  expect(await transformOf(page, `${more} > .marquee-inner`)).toBe("none");
  await expect(page.locator(more)).not.toHaveAttribute("data-sliding", "1");
  // cut: the start and an ellipsis at rest, then the rest slides in on hover, and back
  await page.mouse.move(1, 1);
  const room = '[data-testid="booth-out-room"] .booth-out-name';
  await squeeze(page, room, 30);
  await expect(page.locator(`${room} .fit`)).toHaveAttribute("data-overflow", "1");
  expect(await transformOf(page, `${room} .marquee-inner`)).toBe("none");
  await page.getByTestId("booth-out-room").hover();
  await expect(page.locator(`${room} .fit`)).toHaveAttribute("data-sliding", "1");
  await expect
    .poll(async () => {
      const m = (await transformOf(page, `${room} .marquee-inner`)).match(/matrix\(([^)]+)\)/);
      return m ? Number(m[1]!.split(",")[4]) : 0;
    })
    .toBeLessThan(-2);
  // it comes back to its start when the pointer leaves
  await page.mouse.move(1, 1);
  await expect(page.locator(`${room} .fit`)).not.toHaveAttribute("data-sliding", "1");
  expect(await transformOf(page, `${room} .marquee-inner`)).toBe("none");
  // keyboard focus reveals it too
  await page.getByTestId("booth-out-room").focus();
  await expect(page.locator(`${room} .fit`)).toHaveAttribute("data-sliding", "1");
  // the accessible name is the whole text
  await expect(page.getByTestId("booth-out-room")).toHaveAccessibleName(/This device/);
  await expect(page.getByTestId("booth-prev")).toHaveAccessibleName("Previous");
  // a tanda's singer in the set list: the whole words in the text, cut or not
  const mode = page.locator(".booth-col-set [data-testid='tanda-mode']").first();
  await expect(mode).toHaveText(/^(Vocal|Instrumental)/);
  await ctx.close();
});

test("FitText: nothing moves under Reduce Motion; a cut transport word shows its short form", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  await openBooth(page);
  const room = '[data-testid="booth-out-room"] .booth-out-name';
  await squeeze(page, room, 30);
  await expect(page.locator(`${room} .fit`)).toHaveAttribute("data-overflow", "1");
  await page.getByTestId("booth-out-room").hover();
  await page.waitForTimeout(900);
  expect(await transformOf(page, `${room} .marquee-inner`)).toBe("none");
  await expect(page.locator(`${room} .fit`)).not.toHaveAttribute("data-sliding", "1");
  await expect(page.getByTestId("booth-out-room")).toHaveAccessibleName(/This device/);
  // Previous, cut: "Prev" drawn, "Previous" still its name
  await squeeze(page, '[data-testid="booth-prev"] .booth-tbtn-l', 26);
  const prev = page.locator('[data-testid="booth-prev"] .fit');
  await expect(prev).toHaveAttribute("data-short", "1");
  await expect(prev.locator(".fit-short")).toHaveText("Prev");
  await expect(page.getByTestId("booth-prev")).toHaveAccessibleName("Previous");
  await page.getByTestId("booth-prev").hover();
  await page.waitForTimeout(600);
  expect(await transformOf(page, '[data-testid="booth-prev"] .marquee-inner')).toBe("none");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/fittext-reduced-motion.png` });
  await ctx.close();
});
