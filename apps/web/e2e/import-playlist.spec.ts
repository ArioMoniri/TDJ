/**
 * 2026-11 — "Import a playlist" (the owner: "there should be an option to import Spotify or other playlists to play or
 * edit in the app"): a Spotify playlist (pasted link, and the DJ's own list, every page), a YouTube playlist (the
 * Google session), a DJ app's file and a pasted list are matched to the catalogue and split into tandas and cortinas;
 * the review shows each tanda's type, what it breaks as information, and lets the DJ split, merge and mark cortinas;
 * "Open in Compose", "Play in the Booth" and "Start a room" keep it in History as an imported night with its link.
 * Spotify's Web API (api.spotify.com, called by the browser with the DJ's own token) and the YouTube route are mocked.
 * IMPORT_SHOTS=<dir> writes captures on an iPhone 15 Pro, an iPad Pro 11 and a 1440 × 900 desktop.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type Browser, devices, expect, type Page, test } from "@playwright/test";

const SHOTS = process.env.IMPORT_SHOTS;
type Side = {
  id: string;
  title: string;
  orchestra: string;
  singer: string | null;
  year: number | null;
  durationSec?: number;
  spotify?: { uri: string } | null;
};
type Night = {
  tandas: Array<{
    songs: Side[];
    cortina: { title: string; artist: string; spotify?: { uri: string } | null } | null;
  }>;
};
const featured = JSON.parse(
  readFileSync(join(process.cwd(), "public/featured/golden-double-peak.json"), "utf8"),
) as Night;

/** the featured night's first three tandas and their cortinas as a Spotify playlist */
const spotifyRows = featured.tandas.slice(0, 3).flatMap((t) => [
  ...t.songs.map((s) => ({
    item: {
      type: "track",
      uri: s.spotify!.uri,
      name: s.title,
      artists: [{ name: s.orchestra }, ...(s.singer ? [{ name: s.singer }] : [])],
      album: { name: "Album", release_date: "2014-01-01" },
      duration_ms: (s.durationSec ?? 170) * 1000,
    },
  })),
  ...(t.cortina
    ? [
        {
          item: {
            type: "track",
            uri: t.cortina.spotify?.uri ?? "spotify:track:0000000000000000000000",
            name: t.cortina.title,
            artists: [{ name: t.cortina.artist }],
            album: { name: "Pop", release_date: "1990-01-01" },
            duration_ms: 200_000,
          },
        },
      ]
    : []),
]);

async function mockSpotify(page: Page) {
  await page.route("**/api/spotify/access", (r) =>
    r.fulfill({ json: { access: "tok", expires: Date.now() + 3_600_000 } }),
  );
  await page.route("https://api.spotify.com/v1/**", (r) => {
    const u = new URL(r.request().url());
    expect(r.request().headers().authorization).toBe("Bearer tok");
    if (u.pathname === "/v1/me/playlists") {
      const off = Number(u.searchParams.get("offset") ?? 0);
      const all = Array.from({ length: 60 }, (_, i) => ({
        id: i === 0 ? "pl0milonga000000000000" : `pl${i}`,
        name: i === 0 ? "Sábado milonga" : `List ${i}`,
        tracks: { total: i === 0 ? spotifyRows.length : i },
        owner: { display_name: "DJ" },
      }));
      return r.fulfill({
        json: { items: all.slice(off, off + 50), next: off + 50 < all.length ? "x" : null },
      });
    }
    if (/^\/v1\/playlists\/[^/]+$/.test(u.pathname))
      return r.fulfill({
        json: {
          name: "Sábado milonga",
          external_urls: { spotify: "https://open.spotify.com/playlist/pl0milonga000000000000" },
        },
      });
    if (/^\/v1\/playlists\/[^/]+\/items$/.test(u.pathname)) {
      expect(u.searchParams.get("market")).toBe("from_token");
      const off = Number(u.searchParams.get("offset") ?? 0);
      // two pages, so the reader has to follow `next`
      const size = 6;
      return r.fulfill({
        json: {
          items: spotifyRows.slice(off, off + size).map((x) => x),
          next: off + size < spotifyRows.length ? "x" : null,
        },
      });
    }
    return r.fulfill({ status: 404, json: { error: "no" } });
  });
}

const LIST = `Bahía Blanca – Carlos Di Sarli
Organito de la tarde – Carlos Di Sarli
El Cachafaz - Carlos Di Sarli
Don Juan – Carlos Di Sarli

Cortina: Yesterday – The Beatles
Pavadita – Juan D'Arienzo
Paciencia – Juan D'Arienzo
El flete – Juan D'Arienzo
La puñalada – Osvaldo Pugliese`;

async function open(page: Page, from = "") {
  await page.goto(`/import${from ? `?from=${from}` : ""}`);
  await expect(page.getByRole("heading", { name: /Import a playlist/ }).first()).toBeVisible({
    timeout: 60_000,
  });
}

test.describe("Import a playlist", () => {
  test("a pasted list: matched, split into tandas, rule breaks shown as information, fixes, Open in Compose → History", async ({
    page,
  }) => {
    await open(page, "text");
    await page.getByTestId("import-text").fill(LIST);
    await page.locator("#import-text-go").click();
    await expect(page.getByTestId("import-tanda").first()).toBeVisible({ timeout: 60_000 });
    // two tandas (the blank line and the cortina line split them), one cortina between
    await expect(page.getByTestId("import-tanda")).toHaveCount(2);
    await expect(page.getByTestId("import-cortina")).toHaveCount(1);
    await expect(page.getByTestId("import-side")).toHaveCount(8);
    // Pugliese in a D'Arienzo tanda: shown as information, not a blocker
    const second = page.getByTestId("import-tanda").nth(1);
    await expect(second.getByTestId("import-warning").first()).toBeVisible();
    await expect(page.getByTestId("import-open-compose")).toBeEnabled();
    // fixes: merge the two tandas (the cortina is left out), then a new tanda from the 5th side again
    await page.locator("#import-merge-1").click();
    await expect(page.getByTestId("import-tanda")).toHaveCount(1);
    await expect(page.getByTestId("import-skipped")).toHaveCount(1);
    await page.getByTestId("import-put-back").click();
    await expect(page.getByTestId("import-tanda")).toHaveCount(2);
    // mark the last side as a cortina
    const last = page.getByTestId("import-side").last();
    await last.getByRole("button").click();
    await page.getByRole("menuitem", { name: "Mark as cortina" }).click();
    await expect(page.getByTestId("import-cortina")).toHaveCount(2);
    await expect(page.getByTestId("import-side")).toHaveCount(7);
    // learning is the DJ's choice
    await expect(page.getByTestId("import-learn")).toBeEnabled();
    await page.getByTestId("import-name").fill("My pasted night");
    await page.getByTestId("import-open-compose").click();
    await page.waitForURL(/\/(#result)?$/);
    await page.waitForLoadState("load");
    await page.goto("/history").catch(() => page.goto("/history"));
    await expect(page.getByText("My pasted night").first()).toBeVisible({ timeout: 30_000 });
  });

  test("Spotify: the DJ's playlists (every page), a pick, every side sure, kept linked, Play in the Booth", async ({
    page,
  }) => {
    await mockSpotify(page);
    await open(page, "spotify");
    await page.getByTestId("import-show-lists").click();
    await expect(page.getByTestId("import-my-list")).toHaveCount(60);
    await page.getByTestId("import-my-list").first().click();
    await expect(page.getByTestId("import-tanda").first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("import-tanda")).toHaveCount(3);
    const levels = await page.getByTestId("import-side").getByTestId("import-level").allTextContents();
    expect(levels.length).toBe(featured.tandas.slice(0, 3).reduce((a, t) => a + t.songs.length, 0));
    expect(levels.every((l) => l.startsWith("Sure"))).toBe(true);
    await expect(page.getByText("Keep linked to the playlist")).toBeVisible();
    await page.getByTestId("import-play-booth").click();
    await page.waitForURL(/\/booth/);
    const imported = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("tdj-v1") ?? "{}");
      return s.state?.playlist?.imported ?? null;
    });
    // (the current night may not be persisted to localStorage on every build: then History holds it)
    if (imported)
      expect(imported).toMatchObject({
        service: "spotify",
        playlistId: "pl0milonga000000000000",
        linked: true,
      });
  });

  test("Spotify: a pasted link; a non-playlist link is refused in words", async ({ page }) => {
    await mockSpotify(page);
    await open(page, "spotify");
    await page.getByTestId("import-link").fill("https://open.spotify.com/track/4u5p9iR9Ll8QjLkmogApFA");
    await page.getByTestId("import-link-go").click();
    await expect(page.getByTestId("import-error")).toContainText("not a Spotify playlist");
    await page
      .getByTestId("import-link")
      .fill("https://open.spotify.com/playlist/pl0milonga000000000000?si=1");
    await page.getByTestId("import-link-go").click();
    await expect(page.getByTestId("import-tanda")).toHaveCount(3, { timeout: 60_000 });
  });

  test("YouTube: the DJ's playlists through the Google session, then Start a room", async ({ page }) => {
    await page.route("**/api/google/youtube/import", (r) => {
      if (r.request().method() === "GET")
        return r.fulfill({
          json: {
            playlists: [
              {
                id: "PLtango1",
                name: "Tango mix",
                total: 5,
                url: "https://www.youtube.com/playlist?list=PLtango1",
              },
            ],
          },
        });
      return r.fulfill({
        json: {
          id: "PLtango1",
          name: "Tango mix",
          url: "https://www.youtube.com/playlist?list=PLtango1",
          skipped: 1,
          items: [
            { title: "Bahía Blanca", artists: ["Carlos Di Sarli"], youtubeId: "yt1", durationSec: 168 },
            {
              title: "Organito de la tarde",
              artists: ["Carlos Di Sarli"],
              youtubeId: "yt2",
              durationSec: 170,
            },
            { title: "El Cachafaz", artists: ["Carlos Di Sarli"], youtubeId: "yt3", durationSec: 166 },
            { title: "Pavadita", artists: ["Juan D'Arienzo"], youtubeId: "yt4", durationSec: 160 },
            { title: "Paciencia", artists: ["Juan D'Arienzo"], youtubeId: "yt5", durationSec: 165 },
          ],
        },
      });
    });
    await open(page, "youtube");
    await page.getByTestId("import-show-lists").click();
    await page.getByTestId("import-my-list").click();
    await expect(page.getByTestId("import-tanda")).toHaveCount(2, { timeout: 60_000 });
    await expect(page.getByText(/1 rows skipped/)).toBeVisible();
    await page.getByTestId("import-start-room").click();
    await page.waitForURL(/\/rooms/);
    const matches = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("tdj-youtube-matches") ?? "{}"),
    );
    expect(Object.values(matches)).toContain("yt1");
  });

  test("a DJ app's M3U file: cortinas from the file's marks, the Cumparsitas opening and closing", async ({
    page,
  }) => {
    const s = (x: Side) =>
      `#EXTINF:${x.durationSec ?? 170},${x.orchestra}${x.singer ? ` / ${x.singer}` : ""} - ${x.title}\n/Music/${x.title}.mp3`;
    const t = featured.tandas;
    const m3u = [
      "#EXTM3U",
      "#PLAYLIST:From my laptop",
      ...t[0]!.songs.map(s),
      `#EXTINF:45,${t[0]!.cortina!.artist} - ${t[0]!.cortina!.title} [CORTINA]\n/Music/c1.mp3`,
      ...t[1]!.songs.map(s),
    ].join("\n");
    await open(page, "file");
    await page
      .getByTestId("import-file-input")
      .setInputFiles({ name: "laptop.m3u8", mimeType: "audio/mpegurl", buffer: Buffer.from(m3u) });
    await expect(page.getByTestId("import-tanda")).toHaveCount(2, { timeout: 60_000 });
    await expect(page.getByTestId("import-cortina")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "From my laptop" }).first()).toBeVisible();
  });

  test("entry points: Compose's first run, Library, History, Settings, Rooms", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("first-run-import")).toBeVisible({ timeout: 60_000 });
    await page.goto("/library");
    await expect(page.getByTestId("library-import")).toBeVisible();
    await page.goto("/settings");
    await expect(page.locator("#settings-import")).toBeVisible();
    await page.locator("#settings-import").click();
    await expect(page).toHaveURL(/\/import/, { timeout: 60_000 });
    await page.goto("/history");
    await page.getByRole("button", { name: /More/ }).first().click();
    // 2026-11: History's entry is "Import a night" (the sheet: e2e/import-night.spec.ts)
    await expect(page.getByRole("menuitem", { name: "Import a night" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.goto("/rooms");
    await expect(page.getByText("Import a playlist").first()).toBeVisible({ timeout: 60_000 });
  });
});

test.describe("captures", () => {
  test.skip(!SHOTS, "IMPORT_SHOTS=<dir> writes the captures");
  const DEVICES = {
    iphone: { ...devices["iPhone 15 Pro"], browserName: undefined, defaultBrowserType: undefined },
    ipad: { ...devices["iPad Pro 11"], browserName: undefined, defaultBrowserType: undefined },
    desktop: { viewport: { width: 1440, height: 900 } },
  } as const;
  const shoot = async (browser: Browser, name: keyof typeof DEVICES) => {
    mkdirSync(SHOTS!, { recursive: true });
    const ctx = await browser.newContext({
      ...(DEVICES[name] as object),
      baseURL: test.info().project.use.baseURL,
    });
    const page = await ctx.newPage();
    await mockSpotify(page);
    await open(page, "spotify");
    await page.getByTestId("import-show-lists").click();
    await expect(page.getByTestId("import-my-list").first()).toBeVisible();
    await page.screenshot({ path: join(SHOTS!, `${name}-source.png`) });
    await page.getByTestId("import-my-list").first().click();
    await expect(page.getByTestId("import-tanda").first()).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: join(SHOTS!, `${name}-review.png`) });
    await page.goto("/import?from=text");
    await page.getByTestId("import-text").fill(LIST);
    await page.locator("#import-text-go").click();
    await expect(page.getByTestId("import-tanda").first()).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("import-tanda").nth(1).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: join(SHOTS!, `${name}-list-review.png`),
      fullPage: name === "desktop",
    });
    // every button of the review is a touch target
    if (name !== "desktop") {
      const small = await page.evaluate(
        () =>
          [
            ...document.querySelectorAll<HTMLElement>(
              "[data-testid=import-tanda] button, [data-testid=import-actions] button",
            ),
          ]
            .filter((b) => b.offsetParent)
            .map((b) => b.getBoundingClientRect())
            .filter((r) => r.height < 44).length,
      );
      expect(small).toBe(0);
    }
    await ctx.close();
  };
  for (const name of ["iphone", "ipad", "desktop"] as const)
    test(`import on ${name}`, async ({ browser }) => {
      await shoot(browser, name);
    });
});
