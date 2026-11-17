/**
 * 2026-11 — the one song menu on every song row (the owner: "song details and Song DNA from every row"): a right-click
 * (desktop) and a long press (touch) on a row in Compose, the Library, the Database and the Booth open it, and its
 * "Song details" opens the details; in the Booth, Song info → Song DNA → Back keeps the night playing; the versions
 * list shows covers with "This recording" first; the recordings chart never widens a 393 px page. Spotify's search,
 * LRCLIB and the previews are mocked: no live network.
 */
import { expect, type Locator, type Page, test } from "@playwright/test";

/** a mono WAV of clicks (the 30 s previews the night plays) */
function clickWav(sec: number, rate = 22050): Buffer {
  const n = rate * sec;
  const x = new Float32Array(n);
  for (let k = 0; ; k++) {
    const t0 = 0.5 + k * 0.5;
    if (t0 > sec - 0.2) break;
    const i0 = Math.round(t0 * rate);
    for (let j = 0; j < 800; j++) x[i0 + j] = 0.5 * Math.sin(j * 0.9) * Math.exp(-j / 180);
  }
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round((x[i] ?? 0) * 32767), i * 2);
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

const CLIP = clickWav(30);
const SPOTIFY_IMAGE = "https://i.scdn.co/image/sosa-300";

async function mocks(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
  });
  await page.route("https://lrclib.net/**", (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: "[]",
    }),
  );
  await page.route("**/api/services/search", async (r) => {
    const q = (r.request().postDataJSON() as { q?: string }).q ?? "";
    const title = q.endsWith(" tango") ? q.replace(/ tango$/, "") : q.split(" ").slice(0, -1).join(" ") || q;
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        services: [
          {
            id: "spotify",
            state: "ok",
            tracks: [
              {
                service: "spotify",
                id: "sosa1",
                uri: "spotify:track:sosa1",
                title,
                artists: ["Julio Sosa"],
                year: 1995,
                durationSec: 201,
                image: SPOTIFY_IMAGE,
              },
            ],
          },
        ],
      }),
    });
  });
  await page.route(/i\.scdn\.co|i\.ytimg\.com/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#888"/></svg>',
    }),
  );
  await page.route(/dzcdn\.net|preview\.test|p\.scdn\.co|\/api\/preview\?/, (r) =>
    r.request().url().includes("json=1")
      ? r.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ url: "https://preview.test/clip.wav" }),
        })
      : r.fulfill({
          status: 200,
          contentType: "audio/wav",
          body: CLIP,
          headers: { "access-control-allow-origin": "*" },
        }),
  );
  await page.route(/open\.spotify\.com\/oembed/, (r) => r.fulfill({ status: 404, body: "" }));
}

/** a touch long press on the row (pointer events, as a finger sends them), held past the menu's 500 ms */
async function longPress(page: Page, row: Locator) {
  const box = (await row.boundingBox())!;
  const at = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
  const init = { pointerType: "touch", pointerId: 7, isPrimary: true, bubbles: true, button: 0, ...at };
  await row.dispatchEvent("pointerdown", init);
  await page.waitForTimeout(700);
  await row.dispatchEvent("pointerup", init);
}

async function rightClickDetails(page: Page, row: Locator) {
  await row.click({ button: "right" });
  const menu = page.getByTestId("song-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByTestId("song-menu-dna")).toBeVisible();
  await expect(menu.getByTestId("song-menu-copy")).toBeVisible();
  await menu.getByTestId("song-menu-details").click();
  await expect(menu).toHaveCount(0);
}

async function longPressDetails(page: Page, row: Locator) {
  await longPress(page, row);
  const sheet = page.getByTestId("song-menu-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("song-menu-head")).toBeVisible();
  // the finger lifting is not a tap on the backdrop: the sheet stays
  await page.waitForTimeout(300);
  await expect(sheet).toBeVisible();
  await sheet.getByTestId("song-menu-details").click();
  await expect(sheet).toHaveCount(0);
}

const closeDetails = async (page: Page) => {
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("song-details-sheet")).toHaveCount(0);
};

test("Compose: right-click and long press on a track row open the song menu → Song details", async ({
  page,
}) => {
  await mocks(page);
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
  const row = page.locator("li[data-song]").nth(1);
  const id = await row.getAttribute("data-song");
  await rightClickDetails(page, row);
  const details = page.getByTestId("song-details-sheet");
  await expect(details.getByTestId("song-details")).toHaveAttribute("data-song", id!);
  await closeDetails(page);
  // the menu carries the tanda's own Swap… and Insert…
  await row.click({ button: "right" });
  await expect(page.getByTestId("song-menu-swap")).toBeVisible();
  await expect(page.getByTestId("song-menu-insert")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("song-menu")).toHaveCount(0);
  await longPressDetails(page, row);
  await expect(details.getByTestId("song-details")).toHaveAttribute("data-song", id!);
  await closeDetails(page);
  // "i" on a focused row opens its details
  await row.focus();
  await page.keyboard.press("i");
  await expect(details.getByTestId("song-details")).toHaveAttribute("data-song", id!);
});

test("Library and Database: the menu on a result, and the versions: covers, “This recording” first", async ({
  page,
}) => {
  await mocks(page);
  await page.goto("/library");
  await page.locator("#library-search").first().fill("malena troilo");
  const row = page.getByTestId("library-row").filter({ hasText: "Malena" }).first();
  await expect(row).toBeVisible({ timeout: 30000 });
  const id = await row.getAttribute("data-song");
  await rightClickDetails(page, row);
  const sheet = page.getByTestId("song-details-sheet");
  await expect(sheet.getByTestId("song-details")).toHaveAttribute("data-song", id!);
  // the versions: this recording first and highlighted, every row with a cover, Spotify's album image on its row
  const versions = sheet.getByTestId("song-versions");
  await expect(versions.getByTestId("song-versions-counts")).toContainText("on Spotify", { timeout: 20000 });
  const first = versions.getByTestId("song-version").first();
  await expect(first).toHaveAttribute("data-current", "true");
  await expect(first.getByTestId("song-version-this")).toBeVisible();
  await expect(versions.locator('[data-testid="song-version"][data-current]')).toHaveCount(1);
  const n = await versions.getByTestId("song-version").count();
  expect(await versions.getByTestId("song-version").getByTestId("artwork").count()).toBe(n);
  await versions.getByTestId("song-versions-all").click();
  const sosa = versions.locator('[data-testid="song-version"][data-sources="spotify"]');
  await expect(sosa).toContainText("Julio Sosa");
  await expect(sosa.locator("img").first()).toHaveAttribute("src", SPOTIFY_IMAGE);
  await expect(sosa.getByTestId("song-version-year-note")).toContainText("≈ 1995 · album year");
  // "Tempo · key · energy" shows the tempo and key when known, else Measure
  const tempo = sheet.getByTestId("song-tempo");
  await expect(
    tempo
      .getByTestId("song-bpm")
      .or(tempo.getByTestId("song-key"))
      .or(tempo.getByTestId("song-tempo-measure"))
      .first(),
  ).toBeVisible();
  // a version row has the menu too (right-click → Song DNA is there)
  await versions.getByTestId("song-version").nth(1).click({ button: "right" });
  await expect(page.getByTestId("song-menu").getByTestId("song-menu-dna")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("song-menu")).toHaveCount(0);
  await expect(sheet).toBeVisible();
  await closeDetails(page);
  await longPressDetails(page, row);
  await expect(sheet.getByTestId("song-details")).toHaveAttribute("data-song", id!);
  await closeDetails(page);

  await page.goto("/database");
  await page.getByLabel("Search the index").fill("malena troilo");
  const db = page.getByTestId("db-song-row").first();
  await expect(db).toBeVisible({ timeout: 30000 });
  await rightClickDetails(page, db);
  await expect(page.getByTestId("song-details-sheet")).toBeVisible();
  await closeDetails(page);
  await longPressDetails(page, db);
  await expect(page.getByTestId("song-details-sheet")).toBeVisible();
});

test("Song DNA at 393 px: the recordings chart scrolls inside its frame, never the page; marks play", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await mocks(page);
  await page.goto("/library");
  await page.locator("#library-search").first().fill("malena troilo");
  const row = page.getByTestId("library-row").filter({ hasText: "Malena" }).first();
  await expect(row).toBeVisible({ timeout: 30000 });
  await row.getByTestId("song-info").click();
  await page.getByTestId("song-details-sheet").getByTestId("song-dna-link").click();
  await expect(page).toHaveURL(/\/song\?id=/, { timeout: 30000 });
  const chart = page.getByTestId("dna-timeline");
  await expect(chart).toBeVisible({ timeout: 30000 });
  await expect(chart.getByTestId("dna-chart-img")).toHaveAttribute("aria-label", /This recording: /);
  await expect(chart.locator('[data-testid="dna-chart-mark"][data-current]')).toHaveCount(1);
  const lanes = Number(await chart.getAttribute("data-lanes"));
  expect(lanes).toBeGreaterThan(3);
  expect(await chart.getByTestId("dna-chart-mark").count()).toBeGreaterThanOrEqual(lanes);
  // no page overflow; the frame scrolls on its own
  const sizes = await page.evaluate(() => {
    const f = document.querySelector<HTMLElement>('[data-testid="dna-chart-frame"]')!;
    return {
      page: document.documentElement.scrollWidth,
      view: window.innerWidth,
      frame: f.getBoundingClientRect().right,
      inner: f.scrollWidth,
      outer: f.clientWidth,
    };
  });
  expect(sizes.page).toBeLessThanOrEqual(sizes.view);
  expect(sizes.frame).toBeLessThanOrEqual(sizes.view);
  expect(sizes.inner).toBeGreaterThanOrEqual(sizes.outer);
  // every mark is a 44 px target
  const box = await chart.getByTestId("dna-chart-mark").first().boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(43.5);
  // a mark plays its recording in the app's player
  const mark = chart.locator('[data-testid="dna-chart-mark"][data-current]');
  await mark.scrollIntoViewIfNeeded();
  await mark.focus();
  await expect(chart.getByTestId("dna-chart-tip")).toBeVisible();
  await mark.click();
  await expect(chart.locator('[data-testid="dna-chart-mark"][data-now]')).toHaveCount(1, { timeout: 15000 });
  // the versions list is on the page too, this recording first
  const versions = page.getByTestId("song-versions");
  await expect(versions.getByTestId("song-version").first()).toHaveAttribute("data-current", "true", {
    timeout: 20000,
  });
});

test("Song DNA on an iPhone: the page starts under the status bar / Dynamic Island and Back stays in view", async ({
  page,
}) => {
  const SAFE = 59; // an iPhone 15 Pro's top inset (Chromium has none: the token the bars read is overridden)
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript((top) => {
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = `:root{--safe-top:${top}px !important}`;
      document.head.append(s);
    });
  }, SAFE);
  await mocks(page);
  await page.goto("/library");
  await page.locator("#library-search").first().fill("malena troilo");
  const row = page.getByTestId("library-row").filter({ hasText: "Malena" }).first();
  await expect(row).toBeVisible({ timeout: 30000 });
  await row.getByTestId("song-info").click();
  await page.getByTestId("song-details-sheet").getByTestId("song-dna-link").click();
  await expect(page).toHaveURL(/\/song\?id=/, { timeout: 30000 });
  const title = page.getByTestId("dna-title");
  await expect(title).toBeVisible({ timeout: 30000 });
  const back = page.getByTestId("dna-back");
  const bar = page.getByTestId("dna-page-bar");
  const b0 = (await back.boundingBox())!;
  const barBox = (await bar.boundingBox())!;
  expect(b0.y).toBeGreaterThanOrEqual(SAFE);
  expect(b0.height).toBeGreaterThanOrEqual(43.5);
  // the page's content (the cover, the title) starts below the bar, never under the inset
  expect((await title.boundingBox())!.y).toBeGreaterThanOrEqual(barBox.y + barBox.height - 1);
  const art = page.getByTestId("song-dna").locator("header").first();
  expect((await art.boundingBox())!.y).toBeGreaterThanOrEqual(SAFE);
  // scrolled far down, Back is still at the top, below the inset
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  const b1 = (await back.boundingBox())!;
  expect(b1.y).toBeGreaterThanOrEqual(SAFE);
  expect(b1.y + b1.height).toBeLessThanOrEqual(SAFE + 60);
  await expect(back).toBeInViewport();
  await back.click();
  await expect(page).toHaveURL(/\/library/, { timeout: 30000 });
});

test("the Booth: the menu on a set-list row; Song info → Song DNA → Back keeps the night playing", async ({
  page,
}) => {
  await mocks(page);
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/, { timeout: 60000 });
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 30000 });
  type S = { getState: () => { state: string } };
  const state = () =>
    page.evaluate(() => (window as unknown as { __tdjBooth: S }).__tdjBooth.getState().state);
  // the night plays its (mocked) 30 s clips: no file needed
  await expect(page.getByTestId("booth-ttc")).not.toHaveAttribute("data-resolving", "1", { timeout: 30000 });
  await page.getByTestId("booth-start").click();
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing", { timeout: 30000 });

  // a set-list row: right-click → Song details opens the Booth's own song sheet
  const row = page.locator('.booth-row[data-kind="track"]').nth(2);
  await row.scrollIntoViewIfNeeded();
  await row.click({ button: "right" });
  await expect(page.getByTestId("song-menu-play")).toContainText("Pre-listen");
  await page.getByTestId("song-menu-details").click();
  const sheet = page.getByTestId("booth-play-sheet");
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  // a long press on the same row
  await longPress(page, row);
  await expect(page.getByTestId("song-menu-sheet")).toBeVisible();
  await page.getByTestId("song-menu-sheet").getByTestId("song-menu-details").click();
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  // Song info → Song DNA (the overlay: the Booth's page never leaves) → Back → the sheet, the night still playing
  await page.getByTestId("booth-now-info").click();
  await expect(sheet).toBeVisible();
  await sheet.getByTestId("song-dna-link").click();
  const overlay = page.getByTestId("dna-overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay.getByTestId("dna-title")).toBeVisible({ timeout: 30000 });
  await expect(page).toHaveURL(/\/booth/);
  // the menu works inside the overlay too (its versions)
  await overlay.getByTestId("dna-overlay-back").click();
  await expect(overlay).toHaveCount(0);
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(/\/booth/);
  expect(await state()).toBe("playing");
  // the Now card has the menu too
  await page.keyboard.press("Escape");
  await page.getByTestId("booth-now-title").click({ button: "right" });
  await expect(page.getByTestId("song-menu-dna")).toBeVisible();
  await page.getByTestId("song-menu-dna").click();
  await expect(overlay).toBeVisible();
  await expect(page).toHaveURL(/\/booth/);
  await overlay.getByTestId("dna-overlay-close").click();
  expect(await state()).toBe("playing");
});

test("a real finger (touch through the browser, as an iPhone sends it): the menu stays open when it lifts, and nothing under it runs", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await mocks(page);
  await page.goto("/library");
  await page.locator("#library-search").first().fill("malena demare");
  const row = page.getByTestId("library-row").filter({ hasText: "Malena" }).first();
  await expect(row).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(500);
  const box = (await row.boundingBox())!;
  const at = { x: box.x + box.width * 0.45, y: box.y + box.height / 2 };
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at] });
  const sheet = page.getByTestId("song-menu-sheet");
  // the menu opens under the finger while it is still down
  await expect(sheet).toBeVisible({ timeout: 3000 });
  await page.waitForTimeout(500);
  const under = await page.evaluate(
    ({ x, y }) =>
      document.elementFromPoint(x, y)?.closest("[role=menuitem]")?.getAttribute("data-testid") ?? null,
    at,
  );
  const url = page.url();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(800);
  // the lift was no tap: the sheet is still up and the item that was under the finger did not run
  expect(under).not.toBeNull();
  await expect(sheet).toBeVisible();
  expect(page.url()).toBe(url);
  await expect(page.getByTestId("song-details-sheet")).toHaveCount(0);
  // the DJ's own tap on an item does run
  await sheet.getByTestId("song-menu-details").tap();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId("song-details-sheet")).toBeVisible();
  await ctx.close();
});
