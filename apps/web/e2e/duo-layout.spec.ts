/**
 * 2026-11 — iPhone Duo layout (the store captures): each check runs in the iphone-duo-* project of its posture
 * (e2e/devices.ts) and skips the others.
 *   1. Open (951 × 669): the sidebar layout, not the nav pill over one narrow centred column — Compose and Build use
 *      the whole width beside the sidebar; Build's floating Add sits at the content column's trailing edge, not in a
 *      gutter. (The sidebar starts at 900 px: an iPad Pro 11 portrait, 834, keeps the pill; round23 / wave2 check it.)
 *   2. Open, Booth: the Now card fits the short window — the big clock is in the deck's column above the transport,
 *      a long title takes at most two lines.
 *   3. Folded (466 × 678), the transition editor: the lanes stay in view while the presets and rows scroll by and a
 *      preset is picked.
 *   4. Open, Rooms: the sticky tanda bar is opaque, on the content surface (no blur, no row showing through).
 * Screenshots go to $DUO_SHOTS when set.
 */
import { expect, type Page, test } from "@playwright/test";
import { boothAction } from "./confirm";
import { type DuoPosture, duoSafeArea } from "./devices";

const SHOTS = process.env.DUO_SHOTS;

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

const posture = (info: { project: { metadata?: Record<string, unknown> } }) =>
  (info.project.metadata?.posture as DuoPosture | undefined) ?? "outer";

async function setup(page: Page, p: DuoPosture) {
  await duoSafeArea(page, p);
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
  });
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
}
async function compose(page: Page) {
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 120_000 });
}
async function openBooth(page: Page) {
  await compose(page);
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/, { timeout: 60_000 });
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 30_000 });
  const fresh = page.getByTestId("booth-resume").getByRole("button", { name: /beginning/ });
  if (await fresh.isVisible().catch(() => false)) await fresh.click();
}
const visible = (page: Page, testId: string) =>
  page.evaluate((id) => {
    const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  }, testId);
/** the content column: `main`'s content box (its padding off) */
const column = (page: Page) =>
  page.evaluate(() => {
    const m = document.querySelector("main")!;
    const r = m.getBoundingClientRect();
    const s = getComputedStyle(m);
    return {
      left: r.left + Number.parseFloat(s.paddingLeft),
      right: r.right - Number.parseFloat(s.paddingRight),
    };
  });

test("1. open: the sidebar layout on Compose and Build, the whole width used; Build's Add at the column's edge", async ({
  page,
}, info) => {
  const p = posture(info);
  test.skip(p !== "inner", "the open (landscape) display");
  test.setTimeout(180_000);
  await setup(page, p);
  const vw = page.viewportSize()!.width;
  await compose(page);
  expect(await visible(page, "sidebar"), "the sidebar").toBe(true);
  expect(await visible(page, "nav-pill"), "no nav pill").toBe(false);
  const side = (await page.getByTestId("sidebar").boundingBox())!;
  const col = await column(page);
  // the column starts beside the sidebar and runs to the window's edge (its padding): no empty right half
  expect(col.left).toBeGreaterThanOrEqual(side.x + side.width - 1);
  expect(vw - col.right, "the right margin").toBeLessThanOrEqual(48);
  const result = (await page.locator("#result").boundingBox())!;
  expect(result.x + result.width, "Compose's set reaches the column's edge").toBeGreaterThanOrEqual(
    col.right - 2,
  );
  // the set-up form keeps one column at this width (two need 720 px of `main`)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  ).toBeLessThanOrEqual(1);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/duo-open-compose.png` });

  await page.goto("/build");
  await expect(page.getByTestId("build-guide")).toBeVisible({ timeout: 30_000 });
  expect(await visible(page, "sidebar")).toBe(true);
  const guide = (await page.getByTestId("build-guide").boundingBox())!;
  const bcol = await column(page);
  expect(guide.x + guide.width, "the night uses the column's width").toBeGreaterThanOrEqual(bcol.right - 2);
  // too narrow for the Add panel beside the night: the floating Add, at the column's trailing edge
  await expect(page.getByTestId("build-add-panel")).toHaveCount(0);
  const add = (await page.getByTestId("build-add-open").boundingBox())!;
  expect(add.height).toBeGreaterThanOrEqual(44);
  expect(add.width).toBeGreaterThanOrEqual(44);
  expect(Math.abs(add.x + add.width - bcol.right), "Add's edge = the column's edge").toBeLessThanOrEqual(2);
  expect(add.x).toBeGreaterThanOrEqual(bcol.left);
  // the sheet still opens from it
  await page.getByTestId("build-add-open").click();
  await expect(page.getByTestId("build-add-sheet")).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/duo-open-build.png` });
});

test("2. open, Booth: the big clock above the transport, a long title on two lines at most", async ({
  page,
}, info) => {
  const p = posture(info);
  test.skip(p !== "inner", "the open (landscape) display");
  test.setTimeout(180_000);
  await setup(page, p);
  await openBooth(page);
  await page.getByTestId("booth-start").click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __tdjBooth: { getState: () => { state: string } } }).__tdjBooth.getState()
            .state,
      ),
    )
    .toBe("playing");
  // a long title, as the store captures had (the card's layout is what is measured)
  await page.getByTestId("booth-now-title").evaluate((el) => {
    el.textContent = "Recuerdo de bohemia, poema del arrabal y de la noche porteña";
  });
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => {
    const q = (s: string) => document.querySelector<HTMLElement>(s)!.getBoundingClientRect();
    const title = document.querySelector<HTMLElement>('[data-testid="booth-now-title"]')!;
    const lh = Number.parseFloat(getComputedStyle(title).lineHeight);
    return {
      clock: q('[data-testid="booth-remaining"]'),
      strip: q('[data-testid="booth-strip"]'),
      deck: q(".booth-deck"),
      lines: Math.round(title.getBoundingClientRect().height / lh),
      tabBar: !!document.querySelector('[data-testid="tab-bar"]')?.getBoundingClientRect().height,
    };
  });
  expect(m.lines, "title lines").toBeLessThanOrEqual(2);
  expect(m.clock.bottom, "the clock above the transport").toBeLessThanOrEqual(m.strip.top);
  expect(m.clock.bottom, "the clock inside the deck's column").toBeLessThanOrEqual(m.deck.bottom);
  expect(m.clock.top).toBeGreaterThanOrEqual(m.deck.top);
  // nothing covers it: the clock is what is hit at its centre
  const hit = await page.evaluate(() => {
    const r = document.querySelector<HTMLElement>('[data-testid="booth-remaining"]')!.getBoundingClientRect();
    return !!document
      .elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      ?.closest('[data-testid="booth-remaining"]');
  });
  expect(hit, "the clock is not covered").toBe(true);
  // the transport's buttons keep their 44 px
  for (const b of await page.locator('[data-testid="booth-strip"] button:visible').all()) {
    const r = (await b.boundingBox())!;
    expect(r.height).toBeGreaterThanOrEqual(44);
  }
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/duo-open-booth.png` });
});

test("3. folded: the transition editor keeps the lanes in view while a preset is picked", async ({
  page,
}, info) => {
  const p = posture(info);
  test.skip(p !== "outer", "the folded (portrait) display");
  test.setTimeout(180_000);
  await setup(page, p);
  await openBooth(page);
  await boothAction(page, "booth-set-open");
  await page.locator('[data-testid="booth-set-sheet"] [data-testid="booth-gap"]').nth(2).click();
  const ed = page.getByTestId("booth-transition-sheet");
  await expect(ed.getByTestId("booth-tr-stage")).toBeVisible();
  await page.waitForTimeout(600);
  const inView = () =>
    page.evaluate(() => {
      const box = document.querySelector<HTMLElement>(".trx-scroll")!.getBoundingClientRect();
      const s = document
        .querySelector<HTMLElement>('[data-testid="booth-tr-stage"]')!
        .getBoundingClientRect();
      return { top: s.top - box.top, bottom: box.bottom - s.bottom, h: s.height };
    });
  for (const preset of ["blend", "fade", "gap", "rise"]) {
    const tile = ed.getByTestId(`booth-tr-preset-${preset}`);
    await tile.click();
    await expect(tile).toHaveAttribute("aria-checked", "true");
    const v = await inView();
    expect(v.top, `${preset}: the lanes' top in view (${JSON.stringify(v)})`).toBeGreaterThanOrEqual(-1);
    expect(v.bottom, `${preset}: the lanes' bottom in view`).toBeGreaterThanOrEqual(-1);
    // the tiles stay full touch targets
    expect((await tile.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
  }
  // the lanes keep a usable height, and the Volume row (under the presets) is reachable with them in view
  const v = await inView();
  expect(v.h).toBeGreaterThanOrEqual(150);
  await ed.getByTestId("booth-tr-volume").scrollIntoViewIfNeeded();
  const after = await inView();
  expect(after.top).toBeGreaterThanOrEqual(-1);
  expect(after.bottom).toBeGreaterThanOrEqual(-1);
  const vol = (await ed.getByTestId("booth-tr-volume").boundingBox())!;
  const st = (await ed.getByTestId("booth-tr-stage").boundingBox())!;
  expect(vol.y, "Volume below the pinned lanes").toBeGreaterThanOrEqual(st.y + st.height - 1);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/duo-folded-transition.png` });
});

test("4. open, Rooms: the sticky tanda bar is opaque, on the content surface", async ({ page }, info) => {
  const p = posture(info);
  test.skip(p !== "inner", "the open (landscape) display");
  test.setTimeout(180_000);
  await setup(page, p);
  await compose(page);
  await page.goto("/rooms");
  await expect
    .poll(() =>
      page
        .locator("#room-create")
        .evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps")))
        .catch(() => false),
    )
    .toBe(true);
  await page.getByTestId("room-user").fill("Ana");
  await page.getByTestId("room-name").fill("Duo");
  await page.locator("#room-create").click();
  await expect(page.getByTestId("room-tandas")).toBeVisible({ timeout: 20_000 });
  // tanda 2's songs scroll under its bar
  await page.getByTestId("room-tanda-2").scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 220);
  await page.waitForTimeout(500);
  const bar = page.getByTestId("room-tanda-2").getByTestId("editor-tanda-bar");
  const s = await bar.evaluate((el) => {
    const cs = getComputedStyle(el);
    const probe = document.createElement("i");
    probe.style.color = "rgb(var(--surface))";
    el.append(probe);
    const surface = getComputedStyle(probe).color;
    probe.remove();
    return { bg: cs.backgroundColor, blur: cs.backdropFilter, surface };
  });
  expect(s.bg, "the content surface").toBe(s.surface);
  expect(s.bg).not.toMatch(/rgba\(.*,\s*0?\.\d+\)/);
  expect(s.blur === "none" || s.blur === "").toBe(true);
  // the bar's targets stay 44 px
  const drag = (await bar.getByTestId("editor-tanda-drag").boundingBox())!;
  expect(drag.height).toBeGreaterThanOrEqual(44);
  expect(drag.width).toBeGreaterThanOrEqual(44);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/duo-open-rooms.png` });
});
