/**
 * Wave 4 — generated night covers (src/lib/cover): History shows each night's cover as its thumbnail (the same image
 * as the Share preview), and a Spotify export uploads the cover after the write — a JPEG under 256 KB at
 * PUT /v1/playlists/{id}/images — or, without the ugc-image-upload scope, sends nothing and says to reconnect.
 */
import { expect, type Page, test } from "@playwright/test";
import { exportNight } from "@tdj/core";

async function compose(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Compose the night/ }).click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
}

async function noConnectors(page: Page, spotifyMe: Record<string, unknown>, status = 200) {
  await page.route("**/api/spotify/me", (route) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(spotifyMe) }),
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
}

test("a short night link's preview is the night's own 1200 × 630 cover; other links get the brand image", async ({
  request,
}) => {
  const featured = await (await request.get("/featured/golden-double-peak.json")).json();
  const night = exportNight(featured);
  const made = await request.post("/api/night", { data: { night } });
  test.skip(made.status() === 503, "this server keeps no short links");
  const { id } = (await made.json()) as { id: string };
  const html = await (await request.get(`/night?s=${id}`)).text();
  expect(html).toMatch(new RegExp(`<meta property="og:image" content="[^"]*/api/night/og\\?s=${id}"`));
  const og = await request.get(`/api/night/og?s=${id}`, { maxRedirects: 0 });
  expect(og.status()).toBe(200);
  expect(og.headers()["content-type"]).toBe("image/png");
  const png = await og.body();
  // PNG signature, then IHDR's width and height
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  expect(png.readUInt32BE(16)).toBe(1200);
  expect(png.readUInt32BE(20)).toBe(630);
  // no data on the server: the generic brand image
  const plain = await (await request.get("/night")).text();
  expect(plain).toMatch(/<meta property="og:image" content="[^"]*\/og-night\.png"/);
  const miss = await request.get("/api/night/og?s=zzzzzzzzzz", { maxRedirects: 0 });
  expect(miss.status()).toBe(302);
  expect(miss.headers().location).toMatch(/\/og-night\.png$/);
});

test("History shows each night's cover as its thumbnail, the same image the Share sheet previews", async ({
  page,
}) => {
  await compose(page);
  await page.waitForTimeout(600);
  await page.goto("/history");
  const cover = page.getByTestId("history-cover").first();
  await expect(cover).toBeVisible({ timeout: 15000 });
  const img = cover.locator("img");
  await expect(img).toHaveAttribute("src", /^data:image\/svg\+xml/, { timeout: 15000 });
  const box = await cover.boundingBox();
  expect(Math.round(box!.width)).toBe(56);
  expect(Math.round(box!.height)).toBe(56);
  // it drew (a decoded image, not a broken one) and carries the score in its corner
  expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  await expect(cover.locator(".night-cover-score")).toHaveText(/^\d+$/);
  const historyHash = await cover.getAttribute("data-cover");
  expect(historyHash).toMatch(/^[0-9a-f]{8}$/);

  // the Share sheet's preview is the same night's cover (same hash), drawn large
  await page.goto("/");
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await page.keyboard.press("Meta+e");
  const sheet = page.getByTestId("export-sheet");
  await expect(sheet).toBeVisible();
  await sheet.locator("#export-share").click();
  const share = page.getByTestId("share-cover");
  await expect(share.locator("img")).toHaveAttribute("src", /^data:image\/svg\+xml/, { timeout: 15000 });
  expect(await share.getAttribute("data-cover")).toBe(historyHash);
});

test("a Spotify export uploads the night's cover: a base64 JPEG under 256 KB, after the write", async ({
  page,
}) => {
  await noConnectors(page, { hosted: false, user: null }, 401);
  const covers: Array<{ id: string; body: string; type: string | null }> = [];
  let wrote = false;
  await page.route("https://api.spotify.com/v1/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (b: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (url.pathname.endsWith("/search")) {
      const n = Math.floor(Math.random() * 1e9);
      const q = url.searchParams.get("q") ?? "";
      const title = /track:"([^"]+)"/.exec(q)?.[1] ?? "x";
      const artist = /artist:"([^"]+)"/.exec(q)?.[1] ?? "x";
      return json({
        tracks: {
          items: [
            {
              uri: `spotify:track:ok${n}`,
              name: title,
              duration_ms: 0,
              artists: [{ name: artist }],
              album: { name: "Grabaciones", release_date: "1940-01-01" },
              external_urls: { spotify: "https://open.spotify.com/track/x" },
            },
          ],
        },
      });
    }
    if (url.pathname.endsWith("/me")) return json({ id: "e2e-user" });
    if (url.pathname.endsWith("/playlists") && req.method() === "POST")
      return json({ id: "pl1", external_urls: { spotify: "https://open.spotify.com/playlist/pl1" } });
    if (/\/playlists\/pl1\/(items|tracks)$/.test(url.pathname)) {
      wrote = true;
      return json({ snapshot_id: "s" });
    }
    if (/\/playlists\/pl1\/images$/.test(url.pathname) && req.method() === "PUT") {
      covers.push({ id: "pl1", body: req.postData() ?? "", type: req.headers()["content-type"] ?? null });
      return route.fulfill({ status: 202, body: "" });
    }
    return json({});
  });
  await compose(page);
  await page.waitForFunction(() => !!localStorage.getItem("tdj-v1"));
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("tdj-v1") ?? "{}");
    raw.state = raw.state ?? {};
    raw.state.settings = { ...(raw.state.settings ?? {}), spotifyClientId: "e2e-client" };
    raw.state.spotifyToken = {
      access: "e2e-token",
      expires: Date.now() + 3600_000,
      scope: "playlist-modify-private playlist-modify-public ugc-image-upload",
    };
    localStorage.setItem("tdj-v1", JSON.stringify(raw));
  });
  await page.reload();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await page.keyboard.press("Meta+e");
  const sheet = page.getByTestId("export-sheet");
  await expect(sheet).toBeVisible();
  await sheet.locator("#send-spotify").click();
  await expect.poll(() => covers.length, { timeout: 90000 }).toBe(1);
  expect(wrote).toBe(true);
  const { body, type } = covers[0]!;
  expect(type).toBe("image/jpeg");
  // the body is the JPEG in base64 (no data: prefix), under Spotify's 256 KB
  expect(body.length).toBeLessThanOrEqual(256 * 1024);
  expect(body).toMatch(/^[A-Za-z0-9+/]+=*$/);
  const bytes = Buffer.from(body, "base64");
  expect(bytes[0]).toBe(0xff);
  expect(bytes[1]).toBe(0xd8);
  await expect(sheet).toContainText("Cover added to the playlist.", { timeout: 15000 });
});

test("without the image scope the cover is skipped quietly with a reconnect hint", async ({ page }) => {
  await noConnectors(page, {
    hosted: true,
    user: { id: "e2e", name: "E2E DJ" },
    token: { access: "hosted-token", expires: Date.now() + 3600_000 },
    scopes: ["playlist-modify-private", "playlist-modify-public", "streaming"],
  });
  const puts: string[] = [];
  await page.route("https://api.spotify.com/v1/**", async (route) => {
    if (route.request().method() === "PUT") puts.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.route("**/api/spotify/access", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ access: "fresh" }),
    }),
  );
  await page.route("**/api/spotify/match", async (route) => {
    const { items } = JSON.parse(route.request().postData() ?? "{}") as { items: Array<{ id: string }> };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        matches: items.map((it, i) => ({
          id: it.id,
          uri: `spotify:track:h${i}${it.id.replace(/[^A-Za-z0-9]/g, "")}`,
          name: "x",
          artist: "x",
          album: "x",
          year: null,
          durationMs: 0,
          score: 1,
        })),
        missing: [],
      }),
    });
  });
  let created = false;
  await page.route("**/api/spotify/playlist", (route) => {
    created = true;
    const { uris } = JSON.parse(route.request().postData() ?? "{}") as { uris: string[] };
    const n = uris?.length ?? 0;
    // the hosted route answers with the read-back check (lib/spotifyWrite.ts): here every row is in place
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "pl2",
        url: "https://open.spotify.com/playlist/pl2",
        added: n,
        missing: [],
        check: {
          expected: n,
          actual: n,
          inPlace: n,
          ok: true,
          missing: [],
          extra: [],
          outOfOrder: [],
          unavailable: [],
          snapshotChanged: true,
          repairs: 0,
          replaced: [],
          uris: uris ?? [],
          rows: (uris ?? []).map((uri) => ({ uri, playable: true, local: false })),
        },
        market: "from_token",
      }),
    });
  });
  await compose(page);
  await page.keyboard.press("Meta+e");
  const sheet = page.getByTestId("export-sheet");
  await expect(sheet).toBeVisible();
  await sheet.locator("#send-spotify").click();
  await expect.poll(() => created, { timeout: 90000 }).toBe(true);
  // the export finishes as always; one line says how to get the cover
  await expect(sheet).toContainText("Reconnect Spotify to add the cover.", { timeout: 15000 });
  await expect(sheet.getByRole("button", { name: "Open in Spotify" })).toBeVisible();
  expect(puts).toEqual([]);
});
