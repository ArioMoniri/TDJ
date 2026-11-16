/**
 * 2026-11 — the owner: "the transition guide doesn't really play the part of the transition between those songs, and
 * there should be an option to add custom templates for transitions."
 * - 30 s clips: Audition plays the outgoing clip's last N seconds, the gap, then the incoming clip, with a playhead
 *   moving across both lanes in step with what is heard; the editor says the clip is not the real ending; Space stops
 *   and starts it.
 * - Spotify Web Playback SDK (mocked player): Audition seeks the outgoing to (its end − N) on the player, plays, then
 *   plays the incoming at the gap — the real recordings, as the night will.
 * - Templates: Save as template…, the template next to the presets, Apply to the whole tanda (with its preview), and
 *   Undo puts the tanda back.
 */
import { type BrowserContextOptions, expect, type Page, test } from "@playwright/test";

function wav(sec = 30): Buffer {
  const rate = 22050;
  const n = rate * sec;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const kick = Math.exp(-(t % 0.5) * 18) * Math.sin(2 * Math.PI * 60 * t) * 0.55;
    data.writeInt16LE(Math.round((kick + 0.2 * Math.sin(2 * Math.PI * 440 * t)) * 30000), i * 2);
  }
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
const DESKTOP: BrowserContextOptions = { viewport: { width: 1440, height: 900 } };

type Booth = {
  getState: () => {
    playlist: { booth?: { transitions?: Record<string, { preset: string }> } };
    plan: {
      items: Array<{ id?: string; kind: string; tanda: number; lengthSec: number; headCutSec?: number }>;
    };
    audition: {
      transition?: {
        schedule: { out: { srcFrom: number }; in: { srcFrom: number; at: number }; leadSec: number };
      };
    } | null;
  };
};
const booth = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __tdjBooth: Booth }).__tdjBooth.getState();
    return {
      transitions: s.playlist.booth?.transitions ?? {},
      schedule: s.audition?.transition?.schedule ?? null,
    };
  });

/** a Spotify account on this browser's Web Playback SDK (a mocked player that records seeks and volumes) */
async function spotifySdk(page: Page) {
  const plays: Array<{ uri: string; positionMs: number; at: number }> = [];
  await page.addInitScript(() => {
    // Widevine, as Chrome has it: the SDK can play here
    Object.defineProperty(Navigator.prototype, "requestMediaKeySystemAccess", {
      configurable: true,
      value: () => Promise.resolve({}),
    });
  });
  await page.route("**/api/spotify/me", (r) =>
    r.fulfill({
      json: {
        hosted: true,
        user: { id: "e2e", display_name: "E2E", product: "premium" },
        token: { access: "e2e-token", expires: Date.now() + 3_600_000 },
        scopes: ["streaming", "user-modify-playback-state", "user-read-playback-state", "user-read-private"],
      },
    }),
  );
  await page.route("**/api/spotify/access", (r) => r.fulfill({ json: { access: "e2e-token" } }));
  await page.route("https://sdk.scdn.co/spotify-player.js", (r) =>
    r.fulfill({
      contentType: "application/javascript",
      body: `window.__sdk = { seeks: [], vols: [], pauses: 0 };
      window.Spotify = { Player: class {
        constructor() { this.l = {}; }
        connect() { setTimeout(() => this.l.ready && this.l.ready({ device_id: "web" }), 10); return Promise.resolve(true); }
        disconnect() {}
        addListener(e, cb) { this.l[e] = cb; }
        getCurrentState() { return Promise.resolve(null); }
        setVolume(v) { window.__sdk.vols.push(v); return Promise.resolve(); }
        pause() { window.__sdk.pauses++; return Promise.resolve(); }
        resume() { return Promise.resolve(); }
        seek(ms) { window.__sdk.seeks.push({ ms, at: Date.now() }); return Promise.resolve(); }
      } };
      window.onSpotifyWebPlaybackSDKReady && window.onSpotifyWebPlaybackSDKReady();`,
    }),
  );
  await page.route("https://api.spotify.com/**", (r) => {
    const u = new URL(r.request().url());
    const method = r.request().method();
    const path = u.pathname.replace("/v1", "");
    if (method === "GET" && path === "/me/player/devices")
      return r.fulfill({
        json: {
          devices: [
            {
              id: "web",
              name: "TDJ Booth",
              type: "Computer",
              is_active: true,
              supports_volume: true,
              volume_percent: 100,
            },
          ],
        },
      });
    if (method === "GET" && path === "/me/player") return r.fulfill({ status: 204, body: "" });
    if (method === "PUT" && path === "/me/player/play") {
      const body = r.request().postDataJSON() as { uris?: string[]; position_ms?: number } | null;
      plays.push({ uri: body?.uris?.[0] ?? "", positionMs: Number(body?.position_ms ?? 0), at: Date.now() });
    }
    return r.fulfill({ status: 204, body: "" });
  });
  return plays;
}

async function openBooth(page: Page, o: { spotify?: boolean; lead?: number } = {}) {
  await page.addInitScript((lead) => {
    try {
      localStorage.setItem("tdj-audition-lead", String(lead));
    } catch {}
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
  }, o.lead ?? 5);
  await page.route(/dzcdn\.net|p\.scdn\.co|preview\.test|\/api\/preview\?/, (route) =>
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
  await page.route(/open\.spotify\.com\/oembed/, (r) => r.fulfill({ status: 404, body: "" }));
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/, { timeout: 60000 });
  await expect(page.getByTestId("booth-ttc")).not.toHaveAttribute("data-resolving", "1", { timeout: 30000 });
  if (o.spotify) await expect(page.getByTestId("booth-mode")).toContainText("Spotify", { timeout: 15000 });
}
/** the editor for tanda 1's songs 1 → 2 */
async function openEditor(page: Page) {
  const i = Number(
    await page.locator('.booth-row[data-kind="track"]').first().getAttribute("data-plan-index"),
  );
  const marker = page.locator(`[data-testid="booth-gap"][data-from="${i}"]`);
  await marker.scrollIntoViewIfNeeded();
  await marker.click();
  const ed = page.getByTestId("booth-transition-sheet");
  await expect(ed.getByTestId("booth-tr-stage")).toBeVisible();
  return { ed, i };
}

test("30 s clips: Audition plays the outgoing clip's end, the gap, then the incoming, with the playhead moving", async ({
  browser,
}) => {
  const ctx = await browser.newContext(DESKTOP);
  const page = await ctx.newPage();
  await openBooth(page, { lead: 5 });
  const { ed } = await openEditor(page);
  await expect(ed.getByTestId("booth-tr-stage")).toHaveAttribute("data-has-bands", "true", {
    timeout: 20000,
  });
  const play = ed.getByTestId("booth-tr-audition");
  await expect(play).toHaveAttribute("data-lead", "5");
  await play.click();
  await expect(play).toHaveAttribute("aria-pressed", "true", { timeout: 15000 });
  const s = (await booth(page)).schedule!;
  // the clip's last 5 s (a 30 s clip), then the incoming clip from its start after the gap
  expect(s.leadSec).toBe(5);
  expect(s.out.srcFrom).toBeCloseTo(25, 0);
  expect(s.in.srcFrom).toBe(0);
  await expect(ed.getByTestId("booth-tr-audition-note")).toContainText("not the real ending");
  const stage = ed.getByTestId("booth-tr-stage");
  await expect(ed.getByTestId("booth-tr-playhead")).toHaveCount(1);
  // heard in order: the outgoing first, the incoming after the gap; the playhead moves with it
  const seen: string[] = [];
  const heads: number[] = [];
  await expect
    .poll(
      async () => {
        const h = await stage.getAttribute("data-hearing");
        const p = await stage.getAttribute("data-playhead");
        if (h && seen.at(-1) !== h) seen.push(h);
        if (p) heads.push(Number(p));
        return seen.includes("in");
      },
      { timeout: 20000, intervals: [100] },
    )
    .toBe(true);
  expect(seen[0]).toBe("out");
  expect(seen.indexOf("out")).toBeLessThan(seen.indexOf("in"));
  expect(heads[0]!).toBeLessThan(0);
  expect(heads.at(-1)!).toBeGreaterThan(heads[0]! + 4);
  expect(heads.at(-1)!).toBeGreaterThan(0);
  // Space stops it (focus off the buttons), and starts it again
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Space");
  await expect(play).toHaveAttribute("aria-pressed", "false");
  await expect(ed.getByTestId("booth-tr-playhead")).toHaveCount(0);
  await page.keyboard.press("Space");
  await expect(play).toHaveAttribute("aria-pressed", "true", { timeout: 15000 });
  // Stop
  await play.click();
  await expect(play).toHaveAttribute("aria-pressed", "false");
  await ctx.close();
});

test("Spotify Web Playback SDK: Audition seeks the outgoing to (its end − N), plays, then plays the incoming at the gap", async ({
  browser,
}) => {
  const ctx = await browser.newContext(DESKTOP);
  const page = await ctx.newPage();
  const plays = await spotifySdk(page);
  await openBooth(page, { spotify: true, lead: 5 });
  const { ed, i } = await openEditor(page);
  const play = ed.getByTestId("booth-tr-audition");
  await expect(play).toHaveAttribute("data-where", "spotify");
  await play.click();
  await expect(play).toHaveAttribute("aria-pressed", "true", { timeout: 15000 });
  const s = (await booth(page)).schedule!;
  const items = await page.evaluate(
    () => (window as unknown as { __tdjBooth: Booth }).__tdjBooth.getState().plan.items,
  );
  const a = items[i]!;
  // A's seek point: its end on the player less the 5 s lead (its silent tail may be cut)
  expect(s.out.srcFrom).toBeGreaterThan(a.lengthSec + (a.headCutSec ?? 0) - 5 - 3);
  expect(s.out.srcFrom).toBeLessThanOrEqual(a.lengthSec + (a.headCutSec ?? 0) + 3);
  await expect.poll(() => plays.length, { timeout: 10000 }).toBeGreaterThan(0);
  expect(plays[0]!.positionMs).toBe(Math.round(s.out.srcFrom * 1000));
  const seeks = () =>
    page.evaluate(
      () => (window as unknown as { __sdk: { seeks: Array<{ ms: number; at: number }> } }).__sdk.seeks,
    );
  await expect.poll(async () => (await seeks()).length, { timeout: 10000 }).toBeGreaterThan(0);
  expect((await seeks())[0]!.ms).toBe(Math.round(s.out.srcFrom * 1000));
  // then B from its start, at the gap
  await expect.poll(() => plays.length, { timeout: 20000 }).toBeGreaterThan(1);
  expect(plays[1]!.uri).not.toBe(plays[0]!.uri);
  expect(plays[1]!.positionMs).toBe(Math.round(s.in.srcFrom * 1000));
  expect(plays[1]!.at - (await seeks())[0]!.at).toBeGreaterThan((s.in.at - 1.5) * 1000);
  await play.click();
  await expect(play).toHaveAttribute("aria-pressed", "false");
  await ctx.close();
});

test("templates: save one, apply it to the whole tanda (with a preview), then undo", async ({ browser }) => {
  const ctx = await browser.newContext(DESKTOP);
  const page = await ctx.newPage();
  await openBooth(page);
  let { ed } = await openEditor(page);
  await ed.getByTestId("booth-tr-preset-fade").click();
  await ed.getByTestId("booth-tr-save-template").click();
  await ed.getByTestId("booth-tr-template-name").fill("Soft fade");
  await ed.getByTestId("booth-tr-template-save").click();
  const chip = ed.locator('[data-template="Soft fade"]');
  await expect(chip).toHaveAttribute("aria-checked", "true");
  await expect(ed.getByTestId("booth-tr-preset-fade")).toHaveAttribute("aria-checked", "false");
  // ••• → Apply to the whole tanda: the preview lists the joins inside this tanda
  await ed.getByTestId("booth-tr-more").click();
  await ed.getByTestId("booth-tr-picker-more-apply-tanda").click();
  const preview = ed.getByTestId("booth-tr-applyTanda-preview");
  await expect(preview).toBeVisible();
  const n = Number(await preview.getAttribute("data-count"));
  expect(n).toBeGreaterThan(1);
  await expect(preview.locator("li")).toHaveCount(Math.min(n, 8));
  await ed.getByTestId("booth-tr-picker-applyTanda-go").click();
  await expect(page.getByTestId("booth-transition-sheet")).toHaveCount(0);
  await expect.poll(async () => Object.values((await booth(page)).transitions).length).toBe(n);
  expect(Object.values((await booth(page)).transitions).every((x) => x.preset === "fade")).toBe(true);
  // the shared history: ⌘Z / Ctrl+Z puts the tanda back
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => Object.values((await booth(page)).transitions).length).toBe(0);
  // the template stays, next to the presets, on this device
  ({ ed } = await openEditor(page));
  await expect(ed.locator('[data-template="Soft fade"]')).toHaveCount(1);
  await ctx.close();
});
