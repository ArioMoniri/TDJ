/**
 * Round 15 — export matching (docs/specs/round15-engine.md §7): a Spotify export never writes a remake, a cover, another
 * singer's or another orchestra's recording. The browser (bring-your-own Client ID) path searches api.spotify.com, mocked
 * here with trap candidates beside the right one: only the right URIs are written, in the night's order, and the
 * sheet lists the side whose candidates were all traps.
 */
import { expect, type Page, test } from "@playwright/test";

async function compose(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Compose the night/ }).click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
}

test("a Spotify export writes only the right recordings, in order, and lists what it could not match", async ({
  page,
}) => {
  await page.route("**/api/spotify/me", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ hosted: false, user: null }),
    }),
  );
  await page.route("**/api/connect/accounts", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ enabled: false, accounts: [] }),
    }),
  );
  for (const p of ["google", "dropbox"])
    await page.route(`**/api/${p}/me`, (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ hosted: false, user: null }),
      }),
    );
  const written: string[] = [];
  const searched: string[] = [];
  let first = true;
  await page.route("https://api.spotify.com/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const json = (b: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (url.pathname.endsWith("/search")) {
      const q = url.searchParams.get("q") ?? "";
      const title = /track:"([^"]+)"/.exec(q)?.[1];
      const artist = /artist:"([^"]+)"/.exec(q)?.[1];
      if (!title || !artist) return json({ tracks: { items: [] } });
      const key = `${title}|${artist}`.replace(/[^A-Za-z0-9]/g, "");
      const hit = (uri: string, artists: string[], album: string, ms = 0) => ({
        uri,
        name: title,
        duration_ms: ms,
        artists: artists.map((name) => ({ name })),
        album: { name: album, release_date: "2005-01-01" },
        external_urls: { spotify: `https://open.spotify.com/track/${uri}` },
      });
      // the traps: another singer's credit, a modern orchestra's cover, a later re-recording album
      const traps = [
        hit(`spotify:track:trapSinger${key}`, [artist, "Julio Sosa"], "Grandes éxitos"),
        hit(`spotify:track:trapCover${key}`, ["Orquesta Típica Fernández Fierro"], "Envasado en origen"),
        hit(`spotify:track:trapLater${key}`, [artist], `${artist} (1956-1958)`),
      ];
      // the first searched side gets traps only: it must be reported, never guessed
      const only = first;
      first = false;
      searched.push(key);
      return json({
        tracks: {
          items: only ? traps : [...traps, hit(`spotify:track:ok${key}`, [artist], "Grabaciones completas")],
        },
      });
    }
    if (url.pathname.endsWith("/me")) return json({ id: "e2e-user" });
    if (url.pathname.endsWith("/playlists") && route.request().method() === "POST")
      return json({ id: "pl1", external_urls: { spotify: "https://open.spotify.com/playlist/pl1" } });
    if (/\/playlists\/pl1\/(items|tracks)$/.test(url.pathname)) {
      const body = JSON.parse(route.request().postData() ?? "{}") as { uris?: string[] };
      written.push(...(body.uris ?? []));
      return json({ snapshot_id: "s" });
    }
    return json({});
  });
  await compose(page);
  // a bring-your-own Client ID with a live token (the store is persisted in idle time: wait for it, then patch it)
  await page.waitForFunction(() => !!localStorage.getItem("tdj-v1"));
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("tdj-v1") ?? "{}");
    raw.state = raw.state ?? {};
    raw.state.settings = { ...(raw.state.settings ?? {}), spotifyClientId: "e2e-client" };
    raw.state.spotifyToken = { access: "e2e-token", expires: Date.now() + 3600_000 };
    localStorage.setItem("tdj-v1", JSON.stringify(raw));
  });
  await page.reload();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await page.keyboard.press("Meta+e");
  const sheet = page.getByTestId("export-sheet");
  await expect(sheet).toBeVisible();
  await sheet.locator("#send-spotify").click();
  await expect.poll(() => written.length, { timeout: 60000 }).toBeGreaterThan(0);
  await expect(sheet.getByTestId("export-missing")).toBeVisible({ timeout: 30000 });
  // never a trap; every searched side but the first is its right candidate, in the order it was searched
  expect(written.filter((u) => u.includes(":trap"))).toEqual([]);
  const ok = written.filter((u) => u.includes(":ok"));
  expect(ok).toEqual(
    searched
      .slice(1)
      .map((k) => `spotify:track:ok${k}`)
      .filter((u) => ok.includes(u)),
  );
  expect(ok.length).toBe(searched.length - 1);
  expect(await sheet.getByTestId("export-missing").locator("li").count()).toBeGreaterThanOrEqual(1);
});
