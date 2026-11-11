/**
 * Round 8 (docs/reviews/round8-ux.md, docs/specs/round8-web.md): the toolbar's tinted capsule after a set, the
 * first-run hero, the phone result header, the booth strip / tab bar / card order, the Now chips and the set
 * numbering, the docked mini-player, Settings order and plain statuses, the Database subtitle and phone tabs,
 * History naming, the admin title on a phone, the compose narrative painting one label at a time.
 */
import { type Browser, devices, expect, type Page, test } from "@playwright/test";

const BASE = process.env.TDJ_URL ?? "http://localhost:3000";

async function phone(browser: Browser, extra: Record<string, unknown> = {}) {
  const ctx = await browser.newContext({ ...devices["iPhone 15 Pro"], baseURL: BASE, ...extra });
  const page = await ctx.newPage();
  return { ctx, page };
}
async function compose(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Compose the night/ }).click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
}
/** 8 s mono WAV of a 220 Hz tone, served for every preview URL (the round-4 / round-7 pattern). */
function wav(): Buffer {
  const rate = 22050;
  const n = rate * 8;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++)
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 9830), i * 2);
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
async function mockPreviews(page: Page) {
  await page.route(/dzcdn\.net|preview\.test|\/api\/preview\?/, (route) =>
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
}

test("desktop: the hero leads the first run; after a set the tinted capsule is Export and Regenerate is the ghost; the score sheet shows no weights", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const hero = page.getByTestId("first-run");
  await expect(hero).toBeVisible();
  await expect(hero.getByRole("button", { name: /Compose a \d+ h/ })).toBeVisible();
  const toolbar = page.getByTestId("page-toolbar");
  await expect(toolbar.getByTestId("toolbar-compose")).toHaveClass(/btn-primary/);
  await hero.getByRole("button", { name: /Compose a \d+ h/ }).click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await expect(hero).toHaveCount(0);
  // one tinted capsule: Export; Regenerate next to it as a ghost; the share icon-button is gone
  await expect(toolbar.getByTestId("toolbar-export")).toHaveClass(/btn-primary/);
  await expect(toolbar.getByTestId("toolbar-regenerate")).toHaveClass(/btn-ghost/);
  expect(await toolbar.getByRole("button", { name: "Export", exact: true }).count()).toBe(1);
  await expect(toolbar.getByRole("button", { name: /Compose the night/ })).toHaveCount(0);
  // the legend is for assistive tech only; the Mood check names the yardstick as a thing
  await expect(page.locator("#result figcaption")).toHaveClass(/sr-only/);
  await expect(page.getByText("Against reference tandas (Aren León)")).toBeVisible();
  // the Written review row says whether it can run
  await expect(page.getByRole("button", { name: /Written review/ })).toContainText(
    /Ready|Off · needs an AI key/,
  );
  // score sheet: percent per factor, the weight as the bar's length, never "weight 10"
  await page.getByRole("button", { name: /How this set scored/ }).click();
  const sheet = page.getByRole("dialog", { name: "How this set scored" });
  await expect(sheet).toBeVisible();
  await expect(sheet).not.toContainText(/weight \d+/);
  const widths = await sheet
    .locator('[role="img"]')
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
  expect(new Set(widths.map((w) => Math.round(w))).size).toBeGreaterThan(1);
  await page.keyboard.press("Escape");
  // cohesion chips carry the name only; the number is in the accessible name
  const badge = page.getByTestId("cohesion-badge").first();
  await badge.scrollIntoViewIfNeeded();
  expect(await badge.innerText()).not.toMatch(/\d/);
  await expect(badge).toHaveAttribute("aria-label", /Cohesion \d+/);
});

test("compose narrative: one step label at a time", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?slow=1");
  await page.getByRole("button", { name: /Compose the night/ }).click();
  const narrative = page.getByTestId("compose-narrative");
  await expect(narrative).toBeVisible({ timeout: 3000 });
  for (let i = 0; i < 8; i++) {
    const labels = await narrative.locator("span.col-start-1").count();
    expect(labels, `sample ${i}: labels painted at once`).toBeLessThanOrEqual(1);
    await page.waitForTimeout(90);
  }
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
});

test("phone: an icon-only Booth button in the result header, one disclosure on the Listen row, the pill at the right edge, the mini-player docked on the tab bar", async ({
  browser,
}) => {
  const { ctx, page } = await phone(browser);
  await page.goto("/");
  await expect(page.getByTestId("first-run")).toBeVisible();
  await page.getByTestId("bar-compose").click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(800);
  const play = (await page.getByTestId("play-the-night").boundingBox())!;
  expect(play.width).toBeLessThanOrEqual(48);
  expect(play.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByTestId("play-the-night")).toHaveAccessibleName("Booth: play the night");
  // like / dislike are 44 pt
  for (const name of ["Mark as liked", "Mark as disliked"])
    expect((await page.getByRole("button", { name }).boundingBox())!.width).toBeGreaterThanOrEqual(44);
  // the first card: the actions on the header row, the Listen row with its chevron only
  const card = page.locator("#tanda-1");
  await card.scrollIntoViewIfNeeded();
  expect(await card.getByRole("button", { name: "Tanda 1 actions", exact: true }).count()).toBe(1);
  const listen = card.getByTestId("listen-row");
  await expect(listen).toBeVisible();
  expect(await listen.locator("..").getByRole("button").count()).toBe(1);
  // the ••• sheet leads with the Booth
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await page.getByTestId("primary-bar").getByRole("button", { name: "Set actions" }).click();
  const actions = page.getByTestId("actions-sheet");
  await expect(actions).toBeVisible();
  await expect(actions.getByRole("menuitem").first()).toHaveText("Play the night");
  await page.waitForTimeout(400);
  await actions.getByRole("button", { name: "Close" }).click();
  await expect(actions).toHaveCount(0);
  // scrolled down: the minimised pill sits at the right edge, clear of a tanda header's •••
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.evaluate(() => window.scrollTo(0, 300));
  await page.waitForTimeout(150);
  await page.evaluate((h) => window.scrollTo(0, h / 2), height);
  await page.waitForTimeout(700);
  await expect(page.getByTestId("tab-bar")).toHaveAttribute("data-min", "true");
  const pill = (await page.getByTestId("primary-pill").boundingBox())!;
  const vw = page.viewportSize()!.width;
  expect(vw - (pill.x + pill.width)).toBeLessThanOrEqual(14);
  expect(pill.x).toBeGreaterThan(vw / 2);
  // the mini-player: one glass unit with the tab bar; the primary bar leaves meanwhile
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  const playBtn = page.getByRole("button", { name: /^Play / }).first();
  await playBtn.scrollIntoViewIfNeeded();
  await playBtn.click();
  const player = page.getByTestId("mini-player");
  await expect(player).toBeVisible();
  await page.waitForTimeout(900);
  const geo = await page.evaluate(() => {
    const p = document.querySelector('[data-testid="mini-player"]')!.getBoundingClientRect();
    const t = document.querySelector('[data-testid="tab-bar"]')!;
    const tr = t.getBoundingClientRect();
    return {
      gap: tr.top - p.bottom,
      docked: t.hasAttribute("data-docked"),
      radius: getComputedStyle(document.querySelector('[data-testid="mini-player"]')!).borderBottomLeftRadius,
      barHidden: document.querySelector('[data-testid="primary-bar"]')!.getAttribute("data-hidden"),
      pillHidden: document.querySelector('[data-testid="primary-pill"]')!.getAttribute("aria-hidden"),
    };
  });
  expect(Math.abs(geo.gap)).toBeLessThanOrEqual(2);
  expect(geo.docked).toBe(true);
  expect(geo.radius).toBe("0px");
  expect(geo.barHidden).toBe("true");
  expect(geo.pillHidden).toBe("true");
  await page.getByRole("button", { name: "Close player" }).click();
  await expect(player).toBeHidden();
  await expect(page.getByTestId("tab-bar")).not.toHaveAttribute("data-docked", "1");
  await ctx.close();
});

test("phone booth: a 64 pt strip with the faders behind Levels, Time above Next, the tab bar leaves during the night", async ({
  browser,
}) => {
  const { ctx, page } = await phone(browser);
  await mockPreviews(page);
  await page.goto("/");
  await page.getByTestId("bar-compose").click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await page.goto("/booth?rehearsal=1");
  await expect(page.getByTestId("booth")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("page-title")).toHaveText("Booth");
  await expect(page.getByTestId("booth-mode")).toContainText("Rehearsal");
  await expect(page.getByTestId("booth-now")).toContainText("Ready");
  await expect(page.getByTestId("booth-now")).not.toContainText("tap Start");
  const strip = page.getByTestId("booth-strip");
  expect((await strip.boundingBox())!.height).toBeLessThanOrEqual(72);
  await expect(strip.getByTestId("booth-cortina-fader")).toHaveCount(0);
  await expect(strip.getByTestId("booth-levels")).toBeVisible();
  await expect(page.getByTestId("booth-start")).toHaveText(/^Start · 30 s clips$/);
  // the stop glyph is quiet until a night runs
  await expect(page.getByTestId("booth-stop")).not.toHaveClass(/booth-stop-armed/);
  // Time above Next; the Now chips never repeat
  const order = await page.evaluate(() => ({
    time: document.querySelector('[data-testid="booth-time"]')!.getBoundingClientRect().top,
    next: document.querySelector('[data-testid="booth-next"]')!.getBoundingClientRect().top,
    chips: [...document.querySelectorAll('[data-testid="booth-now"] .booth-chip')].map((c) => c.textContent),
  }));
  expect(order.time).toBeLessThan(order.next);
  expect(order.chips.filter((c) => c === "30 s rehearsal").length).toBeLessThanOrEqual(1);
  // the set column numbers tracks inside their tanda
  const firstOfTanda2 = page.locator('[data-tanda="2"] [data-kind="track"] .booth-row-n').first();
  await expect(firstOfTanda2).toHaveText("1");
  // Levels: the two faders in a sheet
  await strip.getByTestId("booth-levels").click();
  const levels = page.getByTestId("booth-levels-sheet");
  await expect(levels).toBeVisible();
  await expect(levels.getByTestId("booth-cortina-fader")).toBeVisible();
  await expect(levels.getByTestId("booth-master")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(levels).toHaveCount(0);
  // start: the tab bar leaves, the strip takes its place, no "no source" banner in a rehearsal
  await page.getByTestId("booth-start").click();
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing", { timeout: 20000 });
  await expect(page.getByTestId("booth-stop")).toHaveClass(/booth-stop-armed/);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const nav = document.querySelector<HTMLElement>('nav[aria-label="Primary mobile"]')!;
        const strip = document.querySelector('[data-testid="booth-strip"]')!.getBoundingClientRect();
        return {
          navHidden: getComputedStyle(nav).visibility === "hidden",
          stripBottomGap: window.innerHeight - strip.bottom,
        };
      }),
    )
    .toEqual({ navHidden: true, stripBottomGap: 12 });
  await expect(page.locator('[data-testid="booth-banners"] [data-key="missing"]')).toHaveCount(0);
  await page.getByTestId("booth-more").click();
  await expect(page.getByRole("menuitem", { name: "Leave the booth" })).toBeVisible();
  await page.keyboard.press("Escape");
  await ctx.close();
});

test("1440 booth: Time above Next in one column, the Cumparsita label whole, Find… only on hover", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await compose(page);
  await page.goto("/booth");
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 15000 });
  const m = await page.evaluate(() => {
    const t = document.querySelector('[data-testid="booth-time"]')!.getBoundingClientRect();
    const n = document.querySelector('[data-testid="booth-next"]')!.getBoundingClientRect();
    const label = [
      ...document.querySelectorAll<HTMLElement>('[data-testid="booth-time"] .booth-eyebrow'),
    ].find((e) => /Cumparsita/i.test(e.textContent ?? ""))!;
    const find = document.querySelector<HTMLElement>(".booth-find");
    return {
      timeAbove: t.bottom <= n.top + 1,
      sameColumn: Math.abs(t.left - n.left) < 2 && Math.abs(t.width - n.width) < 2,
      labelCut: label.scrollWidth > label.clientWidth + 1,
      findOpacity: find ? getComputedStyle(find).opacity : "none",
    };
  });
  expect(m.timeAbove).toBe(true);
  expect(m.sameColumn).toBe(true);
  expect(m.labelCut).toBe(false);
  if (m.findOpacity !== "none") {
    expect(m.findOpacity).toBe("0");
    const row = page.locator(".booth-row:has(.booth-find)").first();
    await row.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await expect
      .poll(async () => {
        await row.hover({ force: true });
        return row.locator(".booth-find").evaluate((el) => getComputedStyle(el).opacity);
      })
      .toBe("1");
  }
});

test("settings: the DJ's own preferences first, accounts after Memory, statuses in plain words", async ({
  page,
}) => {
  await page.goto("/settings");
  const heads = page.locator("h2.section-head");
  await expect(heads.first()).toHaveText(/Appearance/i);
  const texts = (await heads.allInnerTexts()).map((t) => t.trim().toLowerCase());
  expect(texts.indexOf("memory")).toBeLessThan(texts.indexOf("accounts and services"));
  expect(texts.indexOf("accounts and services")).toBeLessThan(texts.indexOf("written reviews"));
  await expect(page.locator("#connector-deezer")).toContainText("Built in");
  await expect(page.locator("#connector-webhook")).toContainText("Off");
  await expect(page.locator("#connector-webhook")).not.toContainText("Not set");
  await expect(page.locator("#ai-status")).not.toContainText("No key");
});

test("database: recordings and the update date in the subtitle, no '0 changes'; phones get three tabs and More", async ({
  page,
  browser,
}) => {
  await page.goto("/database");
  await expect(page.getByText(/recordings · updated/)).toBeVisible();
  // "0 changes" is for assistive tech only (its wrapper is sr-only) until the DJ has edits
  const w = await page
    .getByTestId("db-changes")
    .evaluate((el) => el.parentElement!.getBoundingClientRect().width);
  expect(w).toBeLessThanOrEqual(1);
  const { ctx, page: p } = await phone(browser);
  await p.goto("/database");
  const radios = p.getByRole("radiogroup", { name: "Section" }).first().getByRole("radio");
  await expect(radios).toHaveCount(4);
  await expect(radios.nth(3)).toHaveText(/More/);
  await radios.nth(3).click();
  await p.getByTestId("db-more").getByRole("menuitem", { name: "Memory" }).click();
  await expect(radios.nth(3)).toHaveText(/Memory/);
  await expect(radios.nth(3)).toHaveAttribute("aria-checked", "true");
  await ctx.close();
});

test("history: nights are named by the event, the sub-line reads plainly, the empty state offers Compose", async ({
  page,
}) => {
  await page.goto("/history");
  await expect(page.getByTestId("empty-state").getByRole("link", { name: "Compose a night" })).toBeVisible();
  await compose(page);
  await page.goto("/history");
  const row = page.locator('[id^="history-"]').first();
  await expect(row).toBeVisible({ timeout: 15000 });
  await expect(row).toContainText(
    /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) (milonga|práctica|marathon|encuentro|festival night|wedding|show night)/,
  );
  await expect(row).toContainText(/\d+ h · \d+ tandas · Golden age · Two peaks · composed/);
  await expect(row).not.toContainText(/\d{4}-\d{2}-\d{2}/);
  await row.click();
  const detail = page.getByTestId("history-detail");
  await expect(detail).toContainText(/Composed \d+ \w{3}, \d\d:\d\d/);
  await expect(detail).not.toContainText(/Seed \d+/);
});

test("admin on a phone: the title stays whole and the guide link is a glyph", async ({ browser }) => {
  const { ctx, page } = await phone(browser);
  await page.goto("/admin");
  await expect(page.getByTestId("page-title")).toHaveText("Owner setup");
  const cut = await page.getByTestId("page-title").evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(cut).toBe(false);
  const guide = (await page.locator("#admin-guide").boundingBox())!;
  expect(guide.width).toBeLessThanOrEqual(48);
  expect(guide.height).toBeGreaterThanOrEqual(44);
  await expect(page.locator("#admin-guide")).toHaveAccessibleName("Owner guide");
  await ctx.close();
});

test("light theme: the wallpaper is near neutral", async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: "light", baseURL: BASE });
  const page = await ctx.newPage();
  await page.goto("/");
  const blob = await page
    .locator(".ambient")
    .evaluate((el) => getComputedStyle(el).getPropertyValue("--ambient-blob").trim());
  expect(blob).toBe("6%");
  await ctx.close();
});
