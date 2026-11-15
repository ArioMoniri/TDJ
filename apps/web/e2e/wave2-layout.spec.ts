/**
 * Wave 2 (testers): layout, Database, Rooms, Share and Settings. Runs on an iPad Pro 11 in portrait and landscape,
 * an iPhone-sized phone and a desktop (playwright.config.ts `wave2-*`); each test skips where its device does not
 * apply.
 */
import { type Browser, expect, type Page, test } from "@playwright/test";

test.describe.configure({ timeout: 240_000 });

const W = (page: Page) => page.viewportSize()!.width;
const H = (page: Page) => page.viewportSize()!.height;
const project = () => test.info().project.name;
const isPhone = (page: Page) => W(page) < 640;
const isIpadPortrait = () => project().includes("ipad-portrait");
const isIpadLandscape = () => project().includes("ipad-landscape");
const isDesktop = () => project().includes("desktop");

/** the iPad's status bar and home indicator, as the round 23 spec simulates them */
const INSET = { top: 24, bottom: 20 };
async function simulateInsets(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: INSET }).catch(() => {});
}

async function featured(page: Page) {
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 150_000 });
  await page.waitForTimeout(800);
}

/** horizontal overflow of the document, in px */
const sideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("iPad portrait: a tanda ⋯ menu near the bottom stays inside the viewport and the safe area", async ({
  page,
}) => {
  test.skip(!isIpadPortrait(), "iPad portrait");
  await simulateInsets(page);
  await featured(page);
  for (const n of [3, 8]) {
    const trigger = page.getByRole("button", { name: `Tanda ${n} actions` });
    await trigger.scrollIntoViewIfNeeded();
    // put the trigger 70 px above the bottom edge, where the six items cannot fit below it
    await page.evaluate(
      ([label, h]) => {
        const el = document.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;
        window.scrollBy(0, el.getBoundingClientRect().bottom - (h - 70));
      },
      [`Tanda ${n} actions`, H(page)] as const,
    );
    await page.waitForTimeout(300);
    await trigger.click();
    const menu = page.getByRole("menu", { name: `Tanda ${n} actions` });
    await expect(menu).toBeVisible();
    await page.waitForTimeout(400);
    const box = (await menu.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(INSET.top);
    expect(box.y + box.height).toBeLessThanOrEqual(H(page) - INSET.bottom);
    expect(await menu.getAttribute("data-placement")).toBe("above");
    // every item is on screen and nothing sits on top of it
    const items = menu.getByRole("menuitem");
    expect(await items.count()).toBeGreaterThanOrEqual(5);
    for (const it of await items.all()) {
      const b = (await it.boundingBox())!;
      expect(b.y + b.height).toBeLessThanOrEqual(H(page) - INSET.bottom + 0.5);
      const hit = await page.evaluate(
        ([x, y]) => document.elementFromPoint(x, y)?.closest('[role="menuitem"]')?.textContent ?? "",
        [b.x + b.width / 2, b.y + b.height / 2] as const,
      );
      expect(hit).toBe(await it.textContent());
    }
    await page.keyboard.press("Escape");
  }
});

test("Database: grade cells are words with a legend, 44 px on touch; plain field names; Spotify as a link", async ({
  page,
}) => {
  test.skip(!isIpadPortrait() && !isDesktop(), "iPad portrait and desktop");
  await page.goto("/database");
  // the header keeps "· N changes" on its line
  await page.getByRole("radio", { name: "Orchestras" }).click();
  await expect(page.getByTestId("orchestra-card").first()).toBeVisible({ timeout: 20_000 });
  const disarli = page.locator('[data-orchestra="carlos-di-sarli"]');
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await disarli.getByTestId("edit-grades").click();
  const sheet = page.getByTestId("grades-sheet");
  await expect(sheet.getByTestId("grade-legend")).toContainText("Best");
  await expect(sheet.getByTestId("grade-legend")).toContainText("Not graded");
  const cells = sheet.getByTestId("grade-cell");
  const texts = await cells.allInnerTexts();
  expect(texts.length).toBeGreaterThan(10);
  for (const t of texts) expect(t.trim()).toMatch(/^(Best|Good|Uneven|Uneven, singles|Outside|Not graded)$/);
  const box = (await cells.first().boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(isIpadPortrait() ? 43.5 : 28); // sub-pixel: the sheet settles on a fraction
  // an edit counts as a change; the count stays on the subtitle's line
  await cells.first().click();
  await expect(page.getByTestId("db-changes")).toHaveText(/^1 change/);
  // " · 1 change" on one line: every box of the run has the same top
  const tops = await page
    .getByTestId("db-changes")
    .evaluate((el) => [...new Set([...el.parentElement!.getClientRects()].map((r) => Math.round(r.top)))]);
  expect(tops).toHaveLength(1);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await disarli.getByRole("button", { name: /details/ }).click();
  const detail = page.getByTestId("orchestra-detail");
  await expect(detail).toContainText("Importance");
  await expect(detail).toContainText("Earliest in the night");
  await expect(detail).toContainText("Parts of the night");
  for (const word of ["Tier", "Not before", "Phases", "Singer years"])
    await expect(detail).not.toContainText(word);
  await page.keyboard.press("Escape");
  // a recording: plain source names and Spotify as a link
  await page.goto("/database");
  await page.locator("#db-search").fill("Bahía Blanca");
  const song = page
    .locator("main")
    .getByText(/Bahía Blanca/)
    .first();
  await expect(song).toBeVisible({ timeout: 20_000 });
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/knowledge table|· index\b|Artwork\s+cached|spotify:track:/);
  const spotify = page.getByTestId("db-spotify-link").first();
  if (await spotify.count())
    await expect(spotify).toHaveAttribute("href", /^https:\/\/open\.spotify\.com\/track\//);
});

test("Library: orchestras sorted by recordings, counts labelled", async ({ page }) => {
  test.skip(!isDesktop(), "desktop");
  await page.goto("/library");
  const group = page.locator("main").getByText("Orchestras by recordings");
  await expect(group).toBeVisible({ timeout: 20_000 });
  const values = await page
    .locator("main .group-inset")
    .filter({ has: page.getByTestId("library-all-orchestras") })
    .locator(".cell-value")
    .allInnerTexts();
  const counts = values.slice(0, -1).map((v) => Number(v.replace(/\D/g, "")));
  expect(counts.length).toBeGreaterThan(5);
  for (let i = 1; i < counts.length; i++) expect(counts[i]!).toBeLessThanOrEqual(counts[i - 1]!);
  await expect(page.getByTestId("library-all-orchestras")).toContainText(/\d+ orchestras/);
});

test("Night: a damaged link opened after a good one in the same tab shows its error", async ({ browser }) => {
  test.skip(!isDesktop(), "desktop");
  const ctx = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  await featured(page);
  await page.keyboard.press("Meta+e");
  await expect(page.getByTestId("export-sheet")).toBeVisible();
  await page.locator("#export-share").click();
  const sheet = page.getByTestId("share-sheet");
  await expect(sheet.getByTestId("share-copy-link")).toBeEnabled({ timeout: 15_000 });
  await sheet.getByTestId("share-copy-link").click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/night#n1\./);
  await page.goto(link);
  const ready = page
    .locator("main")
    .getByText(/Import this night/)
    .first();
  await expect(ready).toBeVisible({ timeout: 30_000 });
  // the same tab, a damaged fragment: its error replaces the good night
  await page.evaluate(() => {
    location.hash = "n1.damaged-not-a-night";
  });
  await expect(page.locator("main").getByText(/Import this night/)).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId("night-error")).toBeVisible();
  await ctx.close();
});

test("navigation: every page on iPad portrait and iPhone, with a More tab", async ({ page }) => {
  test.skip(!isIpadPortrait() && !isPhone(page), "iPad portrait and phone");
  await page.goto("/history");
  if (isIpadPortrait()) {
    const pill = page.getByTestId("nav-pill");
    for (const name of [
      "Compose",
      "Booth",
      "Build by hand",
      "Library",
      "Database",
      "History",
      "Rooms",
      "Guide",
      "Settings",
    ])
      await expect(pill.getByRole("link", { name })).toHaveCount(1);
    // an icon's name shows on long-press / hover: an accessible description, never a title attribute
    expect(await pill.locator("[title]").count()).toBe(0);
    await expect(pill.getByRole("link", { name: "Rooms" })).toHaveAttribute("aria-description", "Rooms");
  } else {
    const bar = page.getByTestId("tab-bar");
    // wave 4: four tabs and More (the HIG's five at most); Database moved behind More
    for (const name of ["Compose", "Booth", "Library", "History"])
      await expect(bar.getByRole("link", { name })).toHaveCount(1);
    await bar.getByTestId("tab-more").click();
    const more = page.getByTestId("more-sheet");
    for (const name of ["Database", "Build by hand", "Rooms", "Guide", "Settings"])
      await expect(more.getByRole("link", { name })).toBeVisible();
    await more.getByRole("link", { name: "Rooms" }).click();
    await expect(page).toHaveURL(/\/rooms/);
    await expect(bar.getByTestId("tab-more")).toBeVisible();
    // iPhone History never scrolls sideways (the featured card pushed it 8 px wide)
    await page.goto("/history");
    await page.waitForTimeout(800);
    expect(await sideways(page)).toBeLessThanOrEqual(0);
  }
});

test("phone: a toast sits clear of the tab bar and the Compose / Export bar", async ({ page }) => {
  test.skip(!isPhone(page), "phone");
  await page.goto("/?featured=golden-double-peak");
  const toast = page.getByTestId("toast");
  await expect(toast).toContainText("loaded", { timeout: 150_000 });
  const t = (await toast.boundingBox())!;
  for (const id of ["tab-bar", "primary-bar"]) {
    const el = page.getByTestId(id);
    if (!(await el.isVisible().catch(() => false))) continue;
    const b = (await el.boundingBox())!;
    if (!b.width) continue;
    expect(t.y + t.height, `toast above ${id}`).toBeLessThan(b.y);
  }
});

async function twoDjs(browser: Browser) {
  const a = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const b = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  return { a, b, ana: await a.newPage(), ben: await b.newPage() };
}

test("Rooms: leaving is logged and drops the DJ from the presence list; the switch is 44 px; no toast over rows", async ({
  browser,
  baseURL,
}) => {
  test.skip(!isDesktop(), "desktop");
  const { a, b, ana, ben } = await twoDjs(browser);
  await featured(ana);
  await ana.goto("/rooms");
  const x0 = (await ana.getByTestId("page-title").boundingBox())!.x;
  await ana.getByTestId("room-user").fill("Ana");
  await ana.getByTestId("room-name").click();
  // the name is confirmed in the group's footer, not in a toast over the rows
  await expect(ana.getByTestId("room-user-note")).toContainText("Name saved");
  await expect(ana.getByTestId("toast")).toHaveCount(0);
  await ana.getByTestId("room-name").fill("Wave two");
  await ana.locator("#room-create").click();
  await expect(ana.getByTestId("room-tandas")).toBeVisible({ timeout: 20_000 });
  // the column stays put once in the room
  const x1 = (await ana.getByTestId("page-title").boundingBox())!.x;
  expect(Math.abs(x1 - x0)).toBeLessThanOrEqual(1);
  for (const r of await ana.getByRole("radiogroup", { name: "Room view" }).getByRole("radio").all())
    expect((await r.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await ana.getByRole("button", { name: "Invite" }).first().click();
  const code = (await ana.getByTestId("room-code").innerText()).replace(/\s+/g, "");
  await ana.keyboard.press("Escape");

  await ben.goto(`${baseURL}/rooms?join=${code}`);
  await ben.getByTestId("room-user").fill("Ben");
  await ben.getByTestId("room-join").click();
  await expect(ben.getByTestId("room-tandas")).toBeVisible({ timeout: 30_000 });
  await expect(ana.locator("main")).toContainText("with Ben", { timeout: 15_000 });
  await ben.locator("#room-leave").click();
  await expect(ana.locator("main")).not.toContainText("with Ben", { timeout: 15_000 });
  await ana.getByRole("radio", { name: /Log/ }).click();
  await expect(ana.getByTestId("room-log")).toContainText("Ben left the room", { timeout: 15_000 });
  await a.close();
  await b.close();
});

test("Settings: no check beside a provider with no key, Test says why it is off, the notes do not overlap", async ({
  page,
}) => {
  test.skip(!isDesktop(), "desktop");
  await page.goto("/settings");
  const rows = page.getByTestId("model-connections");
  await expect(rows).toBeVisible({ timeout: 20_000 });
  const anthropic = page.locator("#model-anthropic");
  await expect(anthropic).toContainText("No key");
  await expect(anthropic.getByLabel("In use")).toHaveCount(0);
  const test1 = page.getByTestId("model-anthropic-test");
  await expect(test1).toBeDisabled();
  await expect(test1).toHaveAttribute("aria-description", /add a .* key/i);
  // the own-key notes under Models do not overlap
  // (once the organiser's-key check has answered: with no shared key the own-key fields open by themselves and the
  // "Use my own key" row leaves, so a click aimed at it would wait for a row that is gone)
  await expect(page.locator("#ai-status")).not.toContainText("Checking", { timeout: 20_000 });
  const own = page.locator("#ai-own-key");
  if (await own.isVisible().catch(() => false)) await own.click();
  // (measured once the featured night's learned rules, which load late and are taller than a column, are in)
  await expect(page.getByTestId("featured-learned").getByTestId("learned-rule").first()).toBeVisible({
    timeout: 30_000,
  });
  const note = page.getByTestId("ai-workspace-note");
  if (await note.isVisible().catch(() => false)) {
    // both edges in one frame: the note sits under the Models footer, in the same column
    const { n, foot } = await note.evaluate((el) => {
      const prev = el.previousElementSibling?.querySelector(".section-foot") ?? el.previousElementSibling;
      const r = prev?.getBoundingClientRect();
      const m = el.getBoundingClientRect();
      return {
        n: { y: m.top, x: m.left },
        foot: r ? { bottom: r.bottom, x: r.left } : { bottom: 0, x: m.left },
      };
    });
    expect(n.y).toBeGreaterThanOrEqual(foot.bottom - 0.5);
    expect(Math.abs(n.x - foot.x)).toBeLessThanOrEqual(1);
  }
  // no group splits across the two columns (its rows in one, its footer in the other) and no footer runs over rows
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    for (const s of document.querySelectorAll("main section")) {
      const head = s.querySelector(":scope > .section-head")?.textContent ?? "";
      if (s.getClientRects().length > 1) out.push(`split: ${head}`);
      const body = s.querySelector(":scope > .group-inset")?.getBoundingClientRect();
      const foot = s.querySelector(":scope > .section-foot")?.getBoundingClientRect();
      if (body && foot && foot.top < body.bottom - 0.5) out.push(`footer over rows: ${head}`);
    }
    return out;
  });
  expect(bad).toEqual([]);
});

test("iPad landscape: toolbar capsules and chart dots are 44 px touch targets", async ({ page }) => {
  test.skip(!isIpadLandscape(), "iPad landscape");
  await featured(page);
  for (const id of ["toolbar-regenerate", "toolbar-export"]) {
    const el = page.getByTestId(id);
    if (await el.isVisible()) expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  const dot = page.locator('[role="button"][aria-label^="Tanda 1,"]').first();
  const d = (await dot.boundingBox())!;
  expect(Math.min(d.width, d.height)).toBeGreaterThanOrEqual(44);
  expect(await sideways(page)).toBeLessThanOrEqual(0);
});
