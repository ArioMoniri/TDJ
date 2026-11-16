/**
 * 2026-11 (the owner: "Swap should have Cmd+Z, also function via keyboard. The swap button on a tanda or a song
 * directly swaps as an AI swap; I can't swap a tanda by searching, selecting and reordering songs from connected
 * platforms… a helper/corrector for song names, the versions after the name is complete, the song's type, in all
 * search boxes"):
 * - a song's Swap opens a sheet whose suggestion is only a suggestion; the smart search completes a title (Tab), shows
 *   its versions by work with rhythm badges and sources, the DJ's Spotify merged in (the same recording one row);
 *   a Spotify-only recording takes the chair through the rule check; ⌘Z / Ctrl+Z undoes, ⇧ redoes;
 * - a tanda's Swap opens the tanda sheet: reorder with Alt+↓, remove, the rules live, add from the search, Apply;
 * - S on a focused row opens its Swap sheet; the Booth's tanda Swap opens the same sheet instead of swapping;
 * - the Library shows the versions of a complete title, with the services' recordings.
 * Spotify's search is mocked (POST /api/services/search). SWAP_SHOTS=<dir> writes captures on an iPad Pro 11 in
 * landscape, an iPhone 15 Pro and a 1440 × 900 desktop, with every visible sheet button ≥ 44 px on the touch ones.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { type Browser, devices, expect, type Page, test } from "@playwright/test";

const SHOTS = process.env.SWAP_SHOTS;
const SPOTIFY = [
  // the catalogue's Di Sarli 1957 side (168 s): the same recording, one row with both sources
  {
    service: "spotify",
    id: "dsBB57",
    uri: "spotify:track:dsBB57",
    title: "Bahía Blanca",
    artists: ["Carlos Di Sarli y su Orquesta Típica"],
    album: "Bahía Blanca",
    year: 2005,
    durationSec: 169,
  },
  // a recording only Spotify has: a version of its own
  {
    service: "spotify",
    id: "ctBB",
    uri: "spotify:track:ctBB",
    title: "Bahía Blanca",
    artists: ["Color Tango"],
    album: "Tango Vivo",
    year: 1999,
    durationSec: 201,
  },
];

async function mockServices(page: Page) {
  await page.route("**/api/services/search", (route) =>
    route.fulfill({ json: { services: [{ id: "spotify", state: "ok", tracks: SPOTIFY }] } }),
  );
}
async function openFeatured(page: Page) {
  await mockServices(page);
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
}
/** the Swap sheet of tanda 1, side 2 (the row's menu, as rule-check.spec opens it) */
async function openSongSwap(page: Page) {
  const card = page.locator("#result [data-tanda]").first();
  const row = card.locator("li[data-song]").nth(1);
  await expect(page.getByTestId("swap-sheet")).toHaveCount(0);
  await expect(async () => {
    await row.locator('button[aria-haspopup="menu"]').first().click();
    await page.locator('[role="menuitem"]').first().click({ timeout: 2000 });
  }).toPass({ timeout: 20000 });
  const sheet = page.getByTestId("swap-sheet");
  await expect(sheet).toBeVisible();
  return { sheet, card, row };
}
const blur = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

test("a song's Swap: a suggestion, not a swap; Tab completes the title; versions with sources; ⌘Z and ⇧⌘Z", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFeatured(page);
  const { sheet, card, row } = await openSongSwap(page);
  const before = await row.getAttribute("data-song");
  // the engine's pick is shown at the top, and nothing changed
  const pick = sheet.getByTestId("swap-ai-pick");
  await expect(pick).toContainText("Suggested:", { timeout: 20000 });
  await expect(card.locator("li[data-song]").nth(1)).toHaveAttribute("data-song", before ?? "");
  // the field completes the title; Tab takes it; the versions come grouped by work
  const q = sheet.locator("#swap-search");
  await q.fill("bahia bl");
  const completion = sheet.getByTestId("swap-completion").first();
  await expect(completion).toContainText("Bahía Blanca", { timeout: 20000 });
  await q.press("Tab");
  await expect(q).toHaveValue("Bahía Blanca");
  const work = sheet.getByTestId("smart-work").first();
  await expect(work).toBeVisible({ timeout: 20000 });
  await expect(work.getByTestId("smart-work-count")).toContainText(/\d+ versions/);
  await expect(work.getByTestId("tanda-type").first()).toContainText("Tango");
  // the same recording from the catalogue and Spotify is one row with both sources; Spotify's own is its own version
  await expect(sheet.locator('[data-song-id="ab19e54122"] [data-testid="smart-sources"]')).toHaveAttribute(
    "data-sources",
    "catalogue spotify",
    { timeout: 20000 },
  );
  const ext = sheet.locator('[data-song-id="ext:spotify:ctBB"]');
  await expect(ext).toContainText("Color Tango");
  await expect(ext.getByTestId("smart-sources")).toHaveAttribute("data-sources", "spotify");
  // a misspelt word is corrected and said so
  await q.fill("bahia blamca");
  await expect(sheet.getByTestId("swap-did-you-mean")).toContainText("Blanca", { timeout: 20000 });
  await q.press("Tab");
  await expect(q).toHaveValue("bahia Blanca");
  // the Spotify-only recording takes the chair: another orchestra breaks a tanda rule, the rule check asks
  await ext.getByTestId("swap-use").click();
  const rule = page.getByTestId("rule-sheet");
  await expect(rule).toBeVisible({ timeout: 30000 });
  await rule.getByTestId("rule-as-said").click();
  await expect(sheet).toBeHidden({ timeout: 20000 });
  const chair = card.locator("li[data-song]").nth(1);
  await expect(chair).toHaveAttribute("data-song", "ext:spotify:ctBB", { timeout: 20000 });
  // ⌘Z / Ctrl+Z undoes it (outside a text field), ⇧ redoes it
  await blur(page);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(chair).toHaveAttribute("data-song", before ?? "", { timeout: 20000 });
  await expect(page.getByTestId("toast")).toContainText("Undid");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(chair).toHaveAttribute("data-song", "ext:spotify:ctBB", { timeout: 20000 });
  // Ctrl+Y redoes too: undo, then Ctrl+Y
  await page.keyboard.press("ControlOrMeta+z");
  await expect(chair).toHaveAttribute("data-song", before ?? "", { timeout: 20000 });
  await page.keyboard.press("Control+y");
  await expect(chair).toHaveAttribute("data-song", "ext:spotify:ctBB", { timeout: 20000 });
});

test("a tanda's Swap: reorder with Alt+↓, remove, add from the search, the rules live, Apply; ⌘Z puts it back", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFeatured(page);
  const card = page.locator("#result [data-tanda]").first();
  const ids = await card
    .locator("li[data-song]")
    .evaluateAll((xs) => xs.map((x) => x.getAttribute("data-song")));
  await card.getByTestId("tanda-swap").click();
  const sheet = page.getByTestId("tanda-swap-sheet");
  await expect(sheet).toBeVisible();
  const sides = sheet.getByTestId("tanda-swap-side");
  await expect(sides).toHaveCount(ids.length);
  // nothing applied by opening it; the engine's whole tandas are only suggestions
  await expect(sheet.getByTestId("tanda-swap-option").first()).toBeVisible({ timeout: 60000 });
  await expect(sheet.getByTestId("tanda-swap-apply")).toBeDisabled();
  // Alt+↓ on the first side moves it down
  await sides.first().focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect(sides.nth(1)).toHaveAttribute("data-song-id", ids[0]!);
  await expect(sheet.getByTestId("tanda-swap-apply")).toBeEnabled();
  // remove one: the length rule says so
  await sides.last().getByTestId("tanda-swap-remove").click();
  await expect(sides).toHaveCount(ids.length - 1);
  await expect(sheet.locator('[data-rule="size"]')).toHaveAttribute("data-ok", "0");
  // add one from the smart search (Enter adds the first result): the length holds again
  const q = sheet.locator("#tanda-swap-q");
  await q.fill("d'agostino vargas");
  await expect(sheet.getByTestId("tanda-swap-result").first()).toBeVisible({ timeout: 20000 });
  await q.press("Enter");
  await expect(sides).toHaveCount(ids.length);
  await expect(sheet.locator('[data-rule="size"]')).toHaveCount(0);
  const draft = await sides.evaluateAll((xs) => xs.map((x) => x.getAttribute("data-song-id")));
  await sheet.getByTestId("tanda-swap-apply").click();
  // a broken rule asks first ("Do it as I said"); a kept one applies at once
  const rule = page.getByTestId("rule-sheet");
  await expect(async () => {
    if (await rule.isVisible()) await rule.getByTestId("rule-as-said").click();
    await expect(sheet).toBeHidden({ timeout: 1000 });
  }).toPass({ timeout: 30000 });
  await expect
    .poll(
      () => card.locator("li[data-song]").evaluateAll((xs) => xs.map((x) => x.getAttribute("data-song"))),
      {
        timeout: 20000,
      },
    )
    .toEqual(draft);
  await blur(page);
  await page.keyboard.press("ControlOrMeta+z");
  await expect
    .poll(
      () => card.locator("li[data-song]").evaluateAll((xs) => xs.map((x) => x.getAttribute("data-song"))),
      {
        timeout: 20000,
      },
    )
    .toEqual(ids);
});

test("S on a focused row opens its Swap sheet; the Booth's tanda Swap opens the tanda sheet, never swaps at once", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFeatured(page);
  const card = page.locator("#result [data-tanda]").first();
  await card.locator("li[data-song]").first().focus();
  await page.keyboard.press("s");
  await expect(page.getByTestId("swap-sheet")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("swap-sheet")).toBeHidden();
  // the Booth: the second tanda's Swap opens the sheet; the night is the same until Apply
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/);
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 30000 });
  const swaps = page.getByTestId("booth-swap");
  await expect(swaps.nth(1)).toBeVisible({ timeout: 20000 });
  const rows = () =>
    page.locator('.booth-row[data-kind="track"]').evaluateAll((xs) => xs.map((x) => x.textContent));
  const before = await rows();
  await swaps.nth(1).click();
  const sheet = page.getByTestId("booth-tanda-swap-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("tanda-swap-side").first()).toBeVisible();
  expect(await rows()).toEqual(before);
  // the keyboard help lists the new keys
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});

test("Library: a complete title shows its versions by work, Spotify's merged in, each with its rhythm", async ({
  page,
}) => {
  await mockServices(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/library");
  const field = page.locator("#library-search").first();
  await field.fill("bahia blanc");
  await expect(page.getByTestId("library-completion").first()).toContainText("Bahía Blanca", {
    timeout: 20000,
  });
  await field.press("Tab");
  await expect(field).toHaveValue("Bahía Blanca");
  const work = page.getByTestId("smart-work").first();
  await expect(work).toBeVisible({ timeout: 20000 });
  await expect(work.getByTestId("library-row").first()).toBeVisible();
  await expect(work.getByTestId("tanda-type").first()).toContainText("Tango");
  await expect(page.locator('[data-song-id="ext:spotify:ctBB"]')).toContainText("Color Tango", {
    timeout: 20000,
  });
  await expect(page.getByTestId("library-from-services")).toContainText("Spotify");
});

/** captures and touch targets on an iPad Pro 11 in landscape, an iPhone 15 Pro and a 1440 × 900 desktop */
test("captures: the Swap sheets and the versions on three devices; touch targets ≥ 44 px", async ({
  browser,
}) => {
  test.skip(!SHOTS, "SWAP_SHOTS=<dir> writes the captures");
  test.setTimeout(400_000);
  mkdirSync(SHOTS!, { recursive: true });
  const { defaultBrowserType: _a, ...iphone } = devices["iPhone 15 Pro"];
  const { defaultBrowserType: _b, ...ipad } = devices["iPad Pro 11 landscape"];
  const targets: Array<[string, Parameters<Browser["newContext"]>[0]]> = [
    ["iphone-15-pro", iphone],
    ["ipad-pro-11-landscape", ipad],
    ["desktop-1440", { viewport: { width: 1440, height: 900 } }],
  ];
  for (const [name, opts] of targets) {
    const ctx = await browser.newContext({
      ...opts,
      baseURL: process.env.TDJ_URL ?? "http://localhost:3000",
    });
    const page = await ctx.newPage();
    const touch = name !== "desktop-1440";
    await openFeatured(page);
    const { sheet } = await openSongSwap(page);
    await sheet.locator("#swap-search").fill("bahia bl");
    await expect(sheet.getByTestId("swap-completion").first()).toBeVisible({ timeout: 20000 });
    await sheet.getByTestId("swap-suggested").scrollIntoViewIfNeeded();

    await page.screenshot({ path: join(SHOTS!, `${name}-song-swap-completion.png`) });
    await sheet.locator("#swap-search").press("Tab");
    await expect(sheet.locator('[data-song-id="ext:spotify:ctBB"]')).toBeVisible({ timeout: 20000 });
    await sheet.locator('[data-song-id="ab19e54122"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(SHOTS!, `${name}-song-swap-versions.png`) });
    if (touch) await expectTargets(sheet);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    // (a phone has the tanda's Swap in its actions menu)
    const card = page.locator("#result [data-tanda]").first();
    if (await card.getByTestId("tanda-swap").isVisible()) await card.getByTestId("tanda-swap").click();
    else {
      await card.getByRole("button", { name: "Tanda 1 actions" }).click();
      await page.getByRole("menuitem", { name: /Swap tanda/ }).click();
    }
    const ts = page.getByTestId("tanda-swap-sheet");
    await expect(ts.getByTestId("tanda-swap-option").first()).toBeVisible({ timeout: 60000 });
    await page.screenshot({ path: join(SHOTS!, `${name}-tanda-swap.png`) });
    await ts.locator("#tanda-swap-q").fill("bahia blanca");
    await expect(ts.getByTestId("tanda-swap-result").first()).toBeVisible({ timeout: 20000 });
    await ts.locator("#tanda-swap-q").scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(SHOTS!, `${name}-tanda-swap-search.png`) });
    if (touch) await expectTargets(ts);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.keyboard.press("Escape");
    await page.goto("/library");
    await page.locator("#library-search").first().fill("Bahía Blanca");
    await expect(page.getByTestId("smart-work").first()).toBeVisible({ timeout: 20000 });
    await page.screenshot({ path: join(SHOTS!, `${name}-library-versions.png`) });
    await ctx.close();
  }
});

/** every visible button of a sheet's search and lists is at least 44 px tall (touch) */
async function expectTargets(scope: ReturnType<Page["locator"]>) {
  // (a switch is its whole row's target; the height is what a thumb needs, a 40 px-wide clear glyph sits in its field)
  const small = await scope.locator("button:visible:not([role=switch])").evaluateAll((bs) =>
    bs
      .map((b) => ({
        h: b.getBoundingClientRect().height,
        w: b.getBoundingClientRect().width,
        t: b.textContent?.trim() || b.getAttribute("aria-label") || "",
      }))
      .filter((r) => r.h > 0 && r.h < 43.5),
  );
  expect(small, JSON.stringify(small)).toEqual([]);
}
