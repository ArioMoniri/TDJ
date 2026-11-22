/**
 * 2026-11 (the owner: "the song won't play on click on images across tabs; it needs exactly the play button"; "a
 * button on the tanda image to play that tanda only, or from there till the end"; "Preview also won't work";
 * "a setting so a click continues to the last, or stops after the clicked one"). The cover — not the play button —
 * plays the side in each tab (Compose, the inspector, the Swap sheet, History, Library, Database, Build by hand, the
 * Booth's set list); a tanda's cover plays that tanda only or on to the end, and the mini player says which; the
 * inspector's Preview pre-listens the tanda; Settings → Playback decides what a plain tap continues to; a side with
 * nothing to play says why and opens "Find on services", whose candidates say why they match and play once picked.
 * Previews are mocked as a WAV clip; no live network.
 */
import { expect, type Page, test } from "@playwright/test";

function wav(sec = 60): Buffer {
  const rate = 8000;
  const n = rate * sec;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++)
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 0.2 * 32767), i * 2);
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
/** the side the mocked services find nothing for */
const SILENT = "Tres Esquinas";

async function mock(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
  });
  await page.route(/dzcdn\.net|p\.scdn\.co|preview\.test|\/api\/preview\?/, (route) => {
    const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range ?? "");
    const base = { "access-control-allow-origin": "*", "accept-ranges": "bytes" };
    if (route.request().url().includes("json=1"))
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: "https://preview.test/clip.wav" }),
      });
    if (!range) return route.fulfill({ status: 200, contentType: "audio/wav", body: WAV, headers: base });
    const from = Number(range[1]);
    const to = range[2] ? Math.min(Number(range[2]), WAV.length - 1) : WAV.length - 1;
    return route.fulfill({
      status: 206,
      contentType: "audio/wav",
      body: WAV.subarray(from, to + 1),
      headers: { ...base, "content-range": `bytes ${from}-${to}/${WAV.length}` },
    });
  });
  // the Find on services answer: a Deezer preview and a MusicBrainz year, with their reasons; Spotify not connected
  await page.route(/\/api\/resolve$/, async (route) => {
    if (route.request().method() !== "POST") return route.fulfill({ status: 200, body: "{}" });
    const body = JSON.parse(route.request().postData() ?? "{}") as { title?: string; singer?: string };
    const none = body.title === SILENT;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        candidates: none
          ? []
          : [
              {
                provider: "deezer",
                id: `dz-${(body.title ?? "x").length}`,
                title: body.title,
                artist: body.singer || "Orquesta",
                previewUrl: "https://preview.test/clip.wav",
                confidence: 0.9,
                matchedAt: "2026-11-16T00:00:00Z",
                why: [{ k: "title" }, { k: "singer", v: body.singer || "Orquesta" }],
              },
              {
                provider: "musicbrainz",
                id: "mb-1",
                title: body.title,
                artist: body.singer || "Orquesta",
                year: 1946,
                previewUrl: null,
                confidence: 0.8,
                matchedAt: "2026-11-16T00:00:00Z",
                why: [{ k: "title" }, { k: "year", v: "1946" }],
              },
            ],
        suggestions: {},
        services: [
          { id: "deezer", state: "ok", queries: 2 },
          { id: "musicbrainz", state: "ok", queries: 2 },
          { id: "spotify", state: "signed-out", queries: 0 },
        ],
        refused: none ? 0 : 3,
      }),
    });
  });
  await page.route(/\/api\/spotify\/me/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: '{"hosted":true,"user":null}' }),
  );
  await page.route(/open\.spotify\.com\/oembed/, (r) => r.fulfill({ status: 404, body: "" }));
}

const mini = (page: Page) => page.getByTestId("mini-player");
const audioPaused = (page: Page) =>
  page.evaluate(() => {
    const a = document.querySelector("audio");
    return a ? a.paused : null;
  });
async function expectPlaying(page: Page, title?: string) {
  await expect(mini(page)).toBeVisible({ timeout: 15000 });
  if (title) await expect(page.getByTestId("mini-title")).toHaveText(title);
  await expect(page.getByTestId("mini-toggle")).toHaveAttribute("data-playing", "true");
  await expect.poll(() => audioPaused(page), { timeout: 10000 }).toBe(false);
}
const stopPlayer = async (page: Page) => {
  await page.getByRole("button", { name: "Close player" }).click();
  await expect(mini(page)).toHaveCount(0);
};
const rowTitle = (row: ReturnType<Page["locator"]>) =>
  row.getByTestId("row-play").locator(".truncate").first().innerText();

async function openCompose(page: Page) {
  await mock(page);
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
}

test.use({ viewport: { width: 1440, height: 900 } });

test("the cover, not the play button, plays the side: Compose, the inspector, the Swap sheet, History", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await openCompose(page);
  // Compose: the cover of tanda 2's first side
  const row = page.locator("#tanda-2 li[data-song]").first();
  const title = (await rowTitle(row)).trim();
  await row.getByTestId("row-art").click();
  await expectPlaying(page, title);
  await stopPlayer(page);
  // the inspector's Preview (it was greyed out): the tanda's sides in turn, 20 s each, said in the mini player
  await page.getByTestId("inspector-preview").click();
  await expectPlaying(page);
  await expect(page.getByTestId("mini-scope")).toHaveText(/^Pre-listen · tanda \d+$/);
  await stopPlayer(page);
  // the Swap sheet: a suggestion's cover pre-listens it (its body would swap it in)
  const second = page.locator("#tanda-1 li[data-song]").nth(1);
  await expect(async () => {
    await second.locator('button[aria-haspopup="menu"]').first().click();
    await page.getByRole("menuitem", { name: /^Swap/ }).first().click({ timeout: 2000 });
  }).toPass({ timeout: 20000 });
  const sheet = page.getByTestId("swap-sheet");
  const option = sheet.getByTestId("swap-option").first();
  await expect(option).toBeVisible({ timeout: 60000 });
  const before = await second.getAttribute("data-song");
  await option.getByTestId("art-play").click();
  await expectPlaying(page);
  // (the cover played; nothing was swapped)
  expect(await second.getAttribute("data-song")).toBe(before);
  await page.keyboard.press("Escape");
  await stopPlayer(page);
  // History: the saved night's rows play from their covers too
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("button", { name: /Compose the night|^Regenerate$/ })
    .first()
    .click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.goto("/history");
  await page.locator('[id^="history-"]').first().click({ timeout: 20000 });
  const detail = page.getByTestId("history-detail");
  const hrow = detail.locator("article[id^=tanda-] li[data-song]").first();
  await expect(hrow).toBeVisible({ timeout: 15000 });
  await hrow.getByTestId("row-art").click();
  await expectPlaying(page, (await rowTitle(hrow)).trim());
});

test("the cover plays in the Library", async ({ page }) => {
  await mock(page);
  await page.goto("/library");
  await page.getByLabel("Search the library").first().fill("di sarli");
  const lib = page.getByTestId("library-row").first();
  await expect(lib).toBeVisible({ timeout: 20000 });
  const lt = (await lib.getByTestId("library-row-title").innerText()).trim();
  await lib.getByTestId("row-art").click();
  await expectPlaying(page, lt);
});

test("the cover plays in the Database's songs", async ({ page }) => {
  await mock(page);
  await page.goto("/database");
  await page.getByLabel("Search the index").fill("di sarli");
  const db = page.getByTestId("db-song-row").first();
  await expect(db).toBeVisible({ timeout: 20000 });
  await db.getByTestId("row-art").click();
  await expectPlaying(page);
});

test("the cover plays in Build by hand", async ({ page }) => {
  await mock(page);
  await page.goto("/build");
  await page.evaluate(() => localStorage.removeItem("tdj-build-draft"));
  await page.reload();
  await page.getByLabel("Search for a song to add").first().fill("di sarli");
  const hit = page.getByTestId("build-hit").first();
  await expect(hit).toBeVisible({ timeout: 20000 });
  const ht = (await hit.getByTestId("row-play").locator(".truncate").first().innerText()).trim();
  await hit.getByTestId("row-art").click();
  await expectPlaying(page, ht);
});

test("the Booth before the night: a row's cover starts the night from it (like its title)", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openCompose(page);
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/, { timeout: 60000 });
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 20000 });
  const brow = page.locator('.booth-row[data-kind="track"]').nth(2);
  const bt = (await brow.locator(".booth-row-title").innerText()).trim();
  await brow.locator(".booth-row-tap").scrollIntoViewIfNeeded();
  // the cover sits between the number and the title (outside the title's button)
  await brow.locator('[data-testid="booth-row-open"] + *').click();
  await expect(page.getByTestId("booth-pause")).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("booth-now-title")).toHaveText(bt);
});

test("a tanda's cover: this tanda only, or on to the end; the tap setting; a side with no audio opens Find", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openCompose(page);
  // tanda 3's cover → Play this tanda: the mini player says so, Next stops at its last side
  await page.getByRole("button", { name: "Play tanda 3" }).click();
  await page.getByRole("menuitem", { name: "Play this tanda" }).click();
  await expectPlaying(page);
  await expect(page.getByTestId("mini-scope")).toHaveText("Tanda 3 only");
  const songs = await page.locator("#tanda-3 li[data-song]").count();
  for (let k = 1; k < songs; k++) await page.getByTestId("mini-next").click();
  await expect(page.getByTestId("mini-next")).toBeDisabled();
  await expect(page.getByTestId("mini-where")).toHaveText("Tanda 3");
  // Play from here to the end: on past the tanda (its cortina, the next tandas)
  await page.getByRole("button", { name: "Play tanda 3" }).click();
  await page.getByRole("menuitem", { name: "Play from here to the end" }).click();
  await expect(page.getByTestId("mini-scope")).toHaveText("From tanda 3 to the end");
  for (let k = 1; k < songs; k++) await page.getByTestId("mini-next").click();
  await expect(page.getByTestId("mini-next")).toBeEnabled();
  await page.getByTestId("mini-next").click();
  await expect(mini(page)).toHaveAttribute("data-kind", "cortina");
  await stopPlayer(page);
  // a plain tap continues to the end by default …
  await page.locator("#tanda-2 li[data-song]").first().getByTestId("row-art").click();
  await expect(page.getByTestId("mini-scope")).toHaveText("From tanda 2 to the end");
  await stopPlayer(page);
  // … or, with Settings → Playback → Play only it, plays that song only (no Previous / Next)
  await page.goto("/settings?section=booth");
  const pb = page.getByTestId("settings-playback");
  await pb.getByRole("radio", { name: "Play only it" }).click();
  await page.goto("/");
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await page.locator("#tanda-2 li[data-song]").first().getByTestId("row-art").click();
  await expectPlaying(page);
  await expect(page.getByTestId("mini-scope")).toHaveText("This song only");
  await expect(page.getByTestId("mini-next")).toHaveCount(0);
  await stopPlayer(page);
  // a side nothing plays: the toast names the real reason (never "no Premium") and Find… opens the sheet
  const silent = page.locator("#result li[data-song]").filter({ hasText: SILENT }).first();
  await silent.getByTestId("row-art").click();
  const toast = page.getByTestId("toast");
  await expect(toast).toContainText(/isn't connected on this device|no Spotify recording is matched/);
  await expect(toast).not.toContainText("no Spotify Premium");
  // with Spotify not connected here the toast offers Connect Spotify; a side with no recording also offers Find…
  await expect(toast.getByRole("button", { name: /Connect Spotify|Find…/ }).first()).toBeVisible();
  const find = toast.getByRole("button", { name: "Find…" });
  if (await find.count()) {
    await find.click();
    await expect(page.getByTestId("resolve-sheet")).toBeVisible();
    await expect(page.getByTestId("resolve-nothing")).toContainText("Nothing matched on Deezer, MusicBrainz");
  }
});

test("Find on services: candidates from every service with why they match; Use this plays it", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await openCompose(page);
  // the side's ••• menu → Find on services…
  const row = page.locator("#tanda-2 li[data-song]").nth(1);
  await expect(async () => {
    await row.locator('button[aria-haspopup="menu"]').first().click();
    await page.getByRole("menuitem", { name: "Find on services…" }).click({ timeout: 2000 });
  }).toPass({ timeout: 20000 });
  const sheet = page.getByTestId("resolve-sheet");
  await expect(sheet).toBeVisible({ timeout: 15000 });
  await expect(sheet.getByTestId("resolve-candidate")).toHaveCount(2, { timeout: 15000 });
  await expect(sheet.getByTestId("resolve-why").first()).toContainText("same title");
  await expect(sheet.getByTestId("resolve-services")).toContainText("Spotify: not connected on this device");
  await expect(sheet.getByTestId("resolve-connect-spotify")).toBeVisible();
  await sheet.locator('[data-provider="deezer"]').getByTestId("resolve-use").click();
  await expectPlaying(page);
});
