/**
 * Round 22 — Compose and Database (docs/ROADMAP.md "Round 22 onward" §2–§4, §12): the song search side panel, the
 * night song by song with a tone per tanda, artwork and era badges, the polished Swap sheet, every version of a title,
 * the DJ's own data and the fill from sources, the Orchestras tab with editable era grades, and Add a source.
 */
import { devices, expect, type Page, test } from "@playwright/test";
import { clickHydrated } from "./hydration";

async function openFeatured(page: Page) {
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
}

test("compose: the night song by song, a tone per tanda, artwork and era badges on the songs", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFeatured(page);
  await expect(page.getByTestId("night-profile")).toBeVisible();
  await expect(page.getByTestId("era-legend").first()).toBeVisible();
  expect(await page.getByTestId("tanda-tone").count()).toBeGreaterThan(5);
  const firstCard = page.locator("#result [data-tanda]").first();
  await expect(firstCard.getByTestId("artwork").first()).toBeVisible();
  expect(await page.locator("#result").getByTestId("era-badge").count()).toBeGreaterThan(10);
  // a tanda's tone explains itself on hover
  await page.getByTestId("tanda-tone").first().hover();
  await expect(page.getByTestId("tip")).toContainText(/tone/, { timeout: 5000 });
});

test("search panel: filters, where a side sits tonight, add a side to a tanda", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFeatured(page);
  await page.getByTestId("find-songs").click();
  const panel = page.getByTestId("song-search-panel");
  await expect(panel).toBeVisible();
  // the page makes room beside the panel
  expect(await page.evaluate(() => document.documentElement.hasAttribute("data-side-panel"))).toBe(true);
  // only tonight's sides: every result says where it plays (2026-11: the smart search's chips and inline years)
  await panel.getByTestId("song-search-tonight").click();
  await panel.getByLabel("Search songs").fill("1935-1955");
  await panel.getByTestId("song-search-chip-rhythm-tango").click();
  await expect(panel.getByTestId("song-result").first()).toBeVisible({ timeout: 20000 });
  const pills = await panel.getByTestId("song-pill").allInnerTexts();
  expect(pills.length).toBeGreaterThan(0);
  for (const p of pills) expect(p).toMatch(/^Tanda \d+ · song \d+/);
  // the whole catalogue, one year, every rhythm
  await panel.getByTestId("song-search-tonight").click();
  await panel.getByTestId("song-search-chip-rhythm-tango").click();
  await panel.getByLabel("Search songs").fill("milonga year:1941");
  await expect(panel.getByTestId("song-result").first()).toContainText("1941", { timeout: 20000 });
  // (the debounced search lands after the last keystroke: wait until every row is the new answer)
  await expect
    .poll(
      async () =>
        (await panel.getByTestId("song-result").getByTestId("smart-version-facts").allInnerTexts()).every(
          (t) => t.includes("1941"),
        ),
      { timeout: 20000 },
    )
    .toBe(true);
  // add the first side that is not in tonight's night to a tanda of its rhythm
  const free = panel
    .getByTestId("song-result")
    .filter({ hasNot: page.getByTestId("song-pill") })
    .first();
  const title = (await free.getByTestId("smart-version-title").innerText()).trim();

  await free.getByRole("button", { name: /^Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Add to a tanda…" }).click();
  const target = page.getByTestId("song-target");
  await expect(target).toBeVisible();
  await target.getByTestId("target-tanda").first().click();
  // a side of another orchestra or years breaks a tanda rule: the rule check asks first, the DJ keeps it as said
  const rule = page.getByTestId("rule-sheet");
  await expect(rule.or(panel.getByTestId("song-search-note"))).toBeVisible({ timeout: 30000 });
  if (await rule.isVisible()) await rule.getByTestId("rule-as-said").click();
  await expect(panel.getByTestId("song-search-note")).toContainText(`${title} added to tanda`, {
    timeout: 30000,
  });
  await expect(page.locator("#result")).toContainText(title, { timeout: 20000 });
  // the panel resizes from its handle and closes
  const handle = panel.getByRole("separator", { name: "Resize the panel" });
  const before = (await panel.boundingBox())!.width;
  await handle.focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  expect((await panel.boundingBox())!.width).toBeGreaterThan(before);
  await panel.getByRole("button", { name: "Close" }).click();
  await expect(panel).toBeHidden();
});

test("swap sheet: the side in the chair, suggestions ranked by fit with artwork", async ({ page }) => {
  await openFeatured(page);
  const card = page.locator("#result [data-tanda]").first();
  await card.locator("li[data-song]").nth(1).getByRole("button", { name: "Track 2 actions" }).click();
  await page.getByRole("menuitem", { name: "Swap…" }).click();
  const sheet = page.getByTestId("swap-sheet");
  await expect(sheet.getByTestId("swap-current")).toBeVisible();
  await expect(sheet.getByTestId("swap-option").first()).toBeVisible({ timeout: 20000 });
  await expect(sheet.getByTestId("swap-option").first().getByTestId("artwork")).toBeVisible();
  const fits = (await sheet.getByTestId("swap-option").getByTestId("song-pill").allInnerTexts()).map((t) =>
    Number(t.replace(/\D/g, "")),
  );
  expect(fits.length).toBeGreaterThan(0);
  expect(fits).toEqual([...fits].sort((a, b) => b - a));
});

test("database: versions together and playable, the DJ's own key wins, fill missing data from the sources", async ({
  page,
}) => {
  await page.route("**/api/fill", (route) => {
    const body = route.request().postDataJSON() as { source: string };
    const values =
      body.source === "deezer"
        ? { bpm: 131, gainDb: -9.5, artwork: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" }
        : body.source === "musicbrainz"
          ? { release: "1941-05-02" }
          : {};
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ source: body.source, values, ref: `${body.source}:x` }),
    });
  });
  await page.goto("/database");
  await page.getByLabel("Search the index").fill("di sarli corazon");
  const song = page.locator("[data-song]").first();
  await expect(song).toBeVisible({ timeout: 15000 });
  await song.getByTestId("db-versions").click();
  const versions = song.getByTestId("db-versions-list");
  await expect(versions.getByTestId("db-version").nth(1)).toBeVisible({ timeout: 20000 });
  await expect(versions.getByTestId("song-play").first()).toBeVisible();
  // a side missing data: fill it
  const gap = page
    .locator("[data-song]")
    .filter({ has: page.getByText("Fill missing data") })
    .first();
  await expect(gap).toBeVisible();
  await gap.getByTestId("db-fill").click();
  await expect(page.getByTestId("toast")).toContainText(/Filled|No new data|up to date/, { timeout: 20000 });
  // the DJ's key wins over every source
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await song.getByLabel(/^Key of/).fill("Em");
  await expect(page.getByTestId("db-changes")).toHaveText(/^1 change/);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(song.getByText("Key · yours")).toBeVisible();
});

test("orchestras: grouped, best years and singers, the era heatmap and editable grades", async ({ page }) => {
  await page.goto("/database");
  await page.getByRole("radio", { name: "Orchestras" }).click();
  await expect(page.getByTestId("orchestra-card").first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("orchestra-group").first()).toContainText("The core");
  const disarli = page.locator('[data-orchestra="carlos-di-sarli"]');
  await expect(disarli.getByTestId("heatmap")).toBeVisible();
  await expect(disarli.getByTestId("best-instrumental")).toHaveText(/19\d\d/);
  await expect(disarli.getByTestId("orchestra-singers")).toBeVisible();
  await page.getByRole("radio", { name: "Style" }).click();
  await expect(page.getByTestId("orchestra-group").first()).toBeVisible();
  // edit one grade: it counts as a change and marks the cell as the DJ's
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await disarli.getByTestId("edit-grades").click();
  const sheet = page.getByTestId("grades-sheet");
  await sheet.getByTestId("grade-cell").first().click();
  await expect(page.getByTestId("db-changes")).toHaveText(/^1 change/);
  await expect(sheet.locator("[data-edited]").first()).toBeVisible();
  // the details sheet keeps the engine fields
  await page.keyboard.press("Escape");
  await disarli.getByRole("button", { name: /details/ }).click();
  await expect(page.getByTestId("orchestra-detail")).toContainText("Earliest in the night");
});

test("settings: add a source; Discogs takes the DJ's token and stays in this browser", async ({ page }) => {
  await page.goto("/settings?section=library");
  const group = page.locator("#data-sources");
  await expect(group.getByTestId("source-deezer")).toContainText("On");
  // (a click before the page hydrates is lost: wait until React owns the button)
  await clickHydrated(group.getByRole("button", { name: "Add a source…" }));
  await page.getByTestId("add-source").getByTestId("add-discogs").click();
  const sheet = page.getByTestId("source-sheet");
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("Token").fill("abc123");
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(group.getByTestId("source-discogs")).toContainText("On");
  // (the indicators live under Settings → Appearance)
  await page.goto("/settings?section=appearance");
  await expect(page.getByRole("switch", { name: "Era badges" })).toBeVisible();
});

test("phone: the search panel is a sheet and nothing overflows", async ({ browser }) => {
  const { defaultBrowserType: _d, ...iphone } = devices["iPhone 15 Pro"];
  const ctx = await browser.newContext({
    ...iphone,
    baseURL: process.env.TDJ_URL ?? "http://localhost:3000",
  });
  const page = await ctx.newPage();
  await openFeatured(page);
  await page.getByTestId("find-songs").click();
  const sheet = page.getByTestId("song-search-sheet");
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("Search songs").fill("corazon");
  await expect(sheet.getByTestId("song-result").first()).toBeVisible({ timeout: 20000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await ctx.close();
});
