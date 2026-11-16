/**
 * 2026-11 — song details, Song DNA and the play view (the owner: "song lyrics and song DNA and other orchestra and
 * singer versions should be shown in song details … a better play page … synced to song positions"; "in Database I
 * can't click on these to see and play the list"). LRCLIB, Spotify's search, the previews and YouTube's IFrame API are
 * mocked: no live network.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";

/** a mono 22.05 kHz WAV of clicks at 120 BPM from 0.5 s, every 4th from the second one accented */
function clickWav(sec: number): Buffer {
  const rate = 22050;
  const n = rate * sec;
  const x = new Float32Array(n);
  for (let k = 0; ; k++) {
    const t0 = 0.5 + k * 0.5;
    if (t0 > sec - 0.2) break;
    const amp = k >= 1 && (k - 1) % 4 === 0 ? 0.9 : 0.3;
    const i0 = Math.round(t0 * rate);
    for (let j = 0; j < 800; j++) x[i0 + j] = amp * Math.sin(j * 0.9) * Math.exp(-j / 180);
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
/** the DJ's "file" (40 s of clicks) and a short clip for the 30 s previews (a night decodes many of them) */
const WAV = clickWav(40);
const CLIP = clickWav(6);

const LRC =
  "[00:00.50] Primera línea\n[00:02.00] Segunda línea\n[00:04.00] Tercera línea\n[00:30.00] Cuarta línea";

const FAKE_YT = `
window.__yt = { seeks: [], made: 0 };
window.YT = { Player: class {
  constructor(el, o) { window.__yt.made++; this.o = o; this.t = 0; this.s = -1;
    const f = document.createElement("div"); f.dataset.fakeYoutube = "1"; f.style.cssText = "width:100%;height:100%";
    el.replaceWith(f); setTimeout(() => o.events.onReady({ target: this }), 0); }
  mute() {} playVideo() { this.s = 1; } pauseVideo() { this.s = 2; } setVolume() {}
  seekTo(s) { this.t = s; window.__yt.seeks.push(s); } getCurrentTime() { return this.t; } getDuration() { return 200; }
  getPlayerState() { return this.s; } destroy() {} loadVideoById() {}
} };
window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady();
`;

async function mocks(page: Page, o: { previews?: boolean } = {}) {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem("tdj-lyrics-v1");
      localStorage.removeItem("tdj-song-marks-v1");
    } catch {}
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
  });
  await page.route("https://lrclib.net/**", (r) => {
    const u = new URL(r.request().url());
    const title = u.searchParams.get("track_name") ?? "";
    const artist = u.searchParams.get("artist_name") ?? "";
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify([
        { id: 7, trackName: title, artistName: artist, duration: null, syncedLyrics: LRC, plainLyrics: "x" },
      ]),
    });
  });
  await page.route("**/api/services/search", async (r) => {
    const q = (r.request().postDataJSON() as { q?: string }).q ?? "";
    const title =
      q
        .replace(/ tango$/, "")
        .split(" ")
        .slice(0, -1)
        .join(" ") || q;
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
                title: q.endsWith(" tango") ? q.replace(/ tango$/, "") : title,
                artists: ["Julio Sosa"],
                year: 1995,
                durationSec: 201,
              },
            ],
          },
        ],
      }),
    });
  });
  await page.route("https://www.youtube.com/iframe_api", (r) =>
    r.fulfill({ status: 200, contentType: "text/javascript", body: FAKE_YT }),
  );
  await page.route(/dzcdn\.net|preview\.test|p\.scdn\.co|\/api\/preview\?/, (r) =>
    r.request().url().includes("json=1")
      ? r.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ url: "https://preview.test/clip.wav" }),
        })
      : o.previews === false
        ? r.fulfill({ status: 404, body: "" })
        : r.fulfill({
            status: 200,
            contentType: "audio/wav",
            body: CLIP,
            headers: { "access-control-allow-origin": "*" },
          }),
  );
  await page.route(/open\.spotify\.com\/oembed/, (r) => r.fulfill({ status: 404, body: "" }));
}

test("Library → song details: length, voice, credits, lyrics from LRCLIB, every version, then its Song DNA page", async ({
  page,
}) => {
  await mocks(page);
  await page.goto("/library");
  await page.locator("#library-search").first().fill("malena troilo");
  const row = page.getByTestId("library-row").filter({ hasText: "Malena" }).first();
  await expect(row).toBeVisible({ timeout: 30000 });
  await row.getByTestId("song-info").click();
  const sheet = page.getByTestId("song-details-sheet");
  await expect(sheet.getByTestId("song-length")).toContainText(/\d:\d\d|–:–/);
  await expect(sheet.getByTestId("song-voice")).not.toBeEmpty();
  await expect(sheet.getByTestId("song-credits")).toContainText("Lucio Demare");
  await expect(sheet.getByTestId("song-credits")).toContainText("Homero Manzi");
  await expect(sheet.getByTestId("tanda-type").first()).toContainText("Tango");
  // lyrics: LRCLIB's synced lines, credited
  await expect(sheet.getByTestId("song-lyrics-text")).toContainText("Segunda línea", { timeout: 15000 });
  await expect(sheet.getByTestId("song-lyrics")).toContainText("LRCLIB");
  // other versions: the catalogue's (every orchestra) and Spotify's, counted; the Spotify-only one marked
  const versions = sheet.getByTestId("song-versions");
  await expect(versions.getByTestId("song-versions-counts")).toContainText("in the catalogue", {
    timeout: 20000,
  });
  await expect(versions.getByTestId("song-versions-counts")).toContainText("on Spotify");
  expect(Number(await versions.getAttribute("data-catalogue"))).toBeGreaterThan(20);
  await expect(versions.locator('[data-testid="song-version"][data-current]')).toHaveCount(1);
  await expect(versions).not.toContainText("Only this recording");
  await versions.getByTestId("song-versions-all").click();
  await expect(versions.locator('[data-testid="song-version"][data-sources="spotify"]')).toContainText(
    "Julio Sosa",
  );
  // every touch target in the sheet is at least 44 px
  for (const b of await sheet.getByTestId("song-version-play").all()) {
    const box = await b.boundingBox();
    if (box) expect(box.height).toBeGreaterThanOrEqual(43.5);
  }
  // Song DNA: the work's page
  await sheet.getByTestId("song-dna-link").click();
  await expect(page).toHaveURL(/\/song\?id=/, { timeout: 30000 });
  await expect(page.getByTestId("dna-title")).toHaveText("Malena", { timeout: 30000 });
  await expect(page.getByTestId("dna-credit")).toContainText("Homero Manzi");
  await expect(page.getByTestId("dna-timeline").locator("[data-current]")).toHaveCount(1);
  await expect(page.getByTestId("dna-recordings").getByTestId("library-row").first()).toBeVisible();
  await expect(page.getByTestId("dna-related")).toContainText("Sur");
  await expect(page.getByTestId("dna-you")).toBeVisible();
  await page.getByTestId("dna-open-orchestra").first().click();
  await expect(page).toHaveURL(/\/orchestra\?id=/, { timeout: 30000 });
  await expect(page.getByTestId("orchestra-dna")).toBeVisible({ timeout: 30000 });
});

test("Database → Orchestras → Miguel Caló: a singer's sides open, play, and lead to the singer's page", async ({
  page,
}) => {
  await mocks(page);
  await page.goto("/database");
  await page.getByRole("radio", { name: "Orchestras" }).click();
  await page.locator('[data-orchestra="miguel-calo"]').first().getByRole("button").first().click();
  const detail = page.getByTestId("orchestra-detail");
  await expect(detail.getByTestId("orchestra-open-page")).toBeVisible();
  const iriarte = detail.getByTestId("orchestra-singer-row").filter({ hasText: "Iriarte" });
  const box = await iriarte.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(43.5);
  await iriarte.click();
  const sides = page.getByTestId("sides-sheet");
  await expect(sides.getByTestId("library-row").first()).toBeVisible({ timeout: 20000 });
  expect(await sides.getByTestId("library-row").count()).toBeGreaterThan(30);
  await expect(sides.getByTestId("tanda-type").first()).toBeVisible();
  // a tap plays the side in the app's player
  await sides.getByTestId("library-row").first().getByTestId("play-button").click();
  await expect(sides.locator('[data-testid="library-row"][data-now]')).toHaveCount(1, { timeout: 15000 });
  await expect(sides.getByTestId("sides-play-all")).toBeVisible();
  await sides.getByTestId("sides-open-singer").click();
  await expect(page).toHaveURL(/\/singer\?id=/, { timeout: 30000 });
  await expect(page.getByTestId("singer-dna")).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("dna-people")).toContainText("Miguel Caló");
});

test("the Booth: song info follows the room (synced lyrics, rhythm lane, Mark now, Measure), and Now playing full screen", async ({
  page,
}) => {
  await mocks(page);
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/, { timeout: 60000 });
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 30000 });
  type S = {
    getState: () => {
      planIndex: number;
      plan: { items: Array<{ id?: string; title: string; artist: string }> };
    };
  };
  const now = await page.evaluate(() => {
    const s = (window as unknown as { __tdjBooth: S }).__tdjBooth.getState();
    return s.plan.items[s.planIndex]!;
  });
  // the DJ's music folder holds this side: it plays from the file, whose clock the details follow
  const safe = (s: string) =>
    s
      .replace(/[/\\:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  const dir = mkdtempSync(join(tmpdir(), "tdj-dna-"));
  writeFileSync(join(dir, `${safe(now.artist)} - ${safe(now.title)}.mp3`), WAV);
  await page.evaluate(
    ([id]) => localStorage.setItem("tdj-youtube-matches", JSON.stringify({ [id!]: "vid00000001" })),
    [now.id],
  );
  await page.getByTestId("booth-folder-input").setInputFiles(dir);
  await expect(page.locator('[data-plan-index][data-source="file"]').first()).toBeVisible({ timeout: 15000 });
  await page.getByTestId("booth-start").click();
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as unknown as { __tdjBooth: { getState: () => { state: string } } }).__tdjBooth.getState()
              .state,
        ),
      { timeout: 30000 },
    )
    .toBe("playing");
  await page.getByTestId("booth-now-info").click();
  const sheet = page.getByTestId("booth-play-sheet");
  await expect(sheet.getByTestId("rhythm-lane")).toBeVisible();
  // the synced line follows the room's second
  await expect(sheet.locator('[data-testid="song-lyrics-text"] [data-current]')).toBeVisible({
    timeout: 15000,
  });
  await sheet.getByTestId("song-mark-downbeat-now").click();
  await expect(sheet.getByTestId("song-mark-downbeat")).toContainText("your mark");
  // Measure from the file: the first downbeat of the clicks (0.5 s + one beat), unless the DJ's mark stands
  await sheet.getByTestId("song-mark-downbeat").getByRole("button", { name: "Clear" }).click();
  await sheet.getByTestId("song-measure").click();
  await expect(sheet.getByTestId("song-measure")).toHaveAttribute("data-result", "ok", { timeout: 20000 });
  await expect(sheet.getByTestId("song-mark-downbeat")).toContainText("measured from your file", {
    timeout: 20000,
  });
  await expect(sheet.getByTestId("song-mark-downbeat")).toContainText("0:01.0");
  await expect(sheet.getByTestId("song-mark-start")).toContainText("0:00.5");
  // the grid is drawn from the measured tempo and downbeat
  await expect(sheet.getByTestId("rhythm-lane")).toHaveAttribute("data-grid", "1");
  await page.keyboard.press("Escape");
  // Now playing, full screen: artwork, lane, lyrics, and the matched video muted beside the room's source
  await page.getByTestId("booth-now-full").click();
  const view = page.getByTestId("now-view");
  await expect(view.getByTestId("now-view-title")).toHaveText(now.title);
  await expect(view.locator('[data-testid="song-lyrics-text"] [data-current]')).toBeVisible({
    timeout: 15000,
  });
  await expect(view.getByTestId("synced-video")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __yt?: { made: number } }).__yt?.made ?? 0))
    .toBe(1);
  const vbox = await view.getByTestId("synced-video").locator("div").first().boundingBox();
  expect(vbox!.height).toBeGreaterThanOrEqual(200);
  // the night keeps playing under the view
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __tdjBooth: { getState: () => { state: string } } }).__tdjBooth.getState()
          .state,
    ),
  ).toBe("playing");
  await view.getByTestId("now-view-close").click();
  await expect(view).toHaveCount(0);
});
