/**
 * 2026-11 — the owner: "Cue and Stop won't work." On each source (30 s clips, local files, the Spotify Web Playback
 * SDK, Spotify Connect), from the Controls panel (Transport → Stop, Cue → "Cue the next song in the headphones") and
 * from the bottom bar's Stop:
 * - Stop opens its confirm and stops the room (with a fade where the device can fade, at once otherwise);
 * - Cue plays the next song in the headphones output; with no headphones output chosen, a tap opens the output picker
 *   (or, where the browser has one output, says in one line that it needs a second device) — never nothing.
 */
import { type BrowserContextOptions, devices, expect, type Page, test } from "@playwright/test";

function wav(sec = 30): Buffer {
  const rate = 22050;
  const n = rate * sec;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++)
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 0.3 * 32767), i * 2);
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

/** Two outputs (this device + AirPods) and a recording `setSinkId` on media elements. */
async function fakeOutputs(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __sinks: string[] };
    w.__sinks = [];
    Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", {
      configurable: true,
      value(_id: string) {
        w.__sinks.push(_id);
        return Promise.resolve();
      },
    });
    const devs = [
      { kind: "audiooutput", deviceId: "default", label: "Default - Built-in Speakers", groupId: "g1" },
      { kind: "audiooutput", deviceId: "hp", label: "AirPods Pro", groupId: "g2" },
    ];
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: () => Promise.resolve(devs),
        getUserMedia: () => Promise.reject(new Error("no")),
        addEventListener() {},
        removeEventListener() {},
      },
    });
  });
}

/** a Connect account (the iPad's Spotify app) or the browser's own SDK player; records every Web API request */
function spotifyMock(_o: { sdk?: boolean } = {}) {
  const st = { uri: null as string | null, playing: false, posMs: 0, startedAt: 0 };
  const log: Array<{ method: string; path: string; query: URLSearchParams }> = [];
  const progress = () => (st.playing ? st.posMs + (Date.now() - st.startedAt) : st.posMs);
  async function install(page: Page) {
    await page.route("**/api/spotify/me", (r) =>
      r.fulfill({
        json: {
          hosted: true,
          user: { id: "e2e", display_name: "E2E", product: "premium" },
          token: { access: "e2e-token", expires: Date.now() + 3_600_000 },
          scopes: [
            "streaming",
            "user-modify-playback-state",
            "user-read-playback-state",
            "user-read-private",
          ],
        },
      }),
    );
    await page.route("**/api/spotify/access", (r) => r.fulfill({ json: { access: "e2e-token" } }));
    await page.route("https://sdk.scdn.co/**", (r) => r.fulfill({ status: 404, body: "" }));
    await page.route("https://api.spotify.com/**", (r) => {
      const u = new URL(r.request().url());
      const method = r.request().method();
      const path = u.pathname.replace("/v1", "");
      log.push({ method, path, query: u.searchParams });
      const device = { id: "ipad", name: "iPad", type: "Tablet", is_active: true, is_restricted: false };
      if (method === "GET" && path === "/me/player/devices")
        return r.fulfill({ json: { devices: [{ ...device, supports_volume: true, volume_percent: 80 }] } });
      if (method === "GET" && path === "/me/player") {
        if (!st.uri) return r.fulfill({ status: 204, body: "" });
        return r.fulfill({
          json: {
            is_playing: st.playing,
            progress_ms: Math.min(progress(), 170_000),
            item: { uri: st.uri, duration_ms: 170_000 },
            device: { ...device, supports_volume: true, volume_percent: 80 },
          },
        });
      }
      if (method === "PUT" && path === "/me/player/play") {
        const body = r.request().postDataJSON() as { uris?: string[]; position_ms?: number } | null;
        st.uri = body?.uris?.[0] ?? st.uri;
        st.playing = true;
        st.posMs = Number(body?.position_ms ?? 0);
        st.startedAt = Date.now();
      } else if (method === "PUT" && path === "/me/player/pause") {
        st.posMs = progress();
        st.playing = false;
      } else if (method === "PUT" && path === "/me/player/seek") {
        st.posMs = Number(u.searchParams.get("position_ms"));
        st.startedAt = Date.now();
      }
      return r.fulfill({ status: 204, body: "" });
    });
  }
  return {
    st,
    log,
    install,
    pauses: () => log.filter((x) => x.method === "PUT" && x.path === "/me/player/pause"),
  };
}

async function openBooth(page: Page, o: { spotify?: boolean } = {}) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("tdj-booth-controls", "1");
    } catch {}
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
  });
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
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("booth-ttc")).not.toHaveAttribute("data-resolving", "1", { timeout: 30000 });
  if (o.spotify) await expect(page.getByTestId("booth-mode")).toContainText("Spotify", { timeout: 15000 });
}
const state = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as { __tdjBooth: { getState: () => { state: string; audition: unknown } } }
      ).__tdjBooth.getState().state,
  );
async function start(page: Page) {
  await page.getByTestId("booth-start").click();
  await expect.poll(() => state(page), { timeout: 20000 }).toBe("playing");
}
async function controls(page: Page) {
  if (!(await page.getByTestId("booth-controls").isVisible()))
    await page.getByTestId("booth-controls-toggle").click();
  await expect(page.getByTestId("booth-controls")).toBeVisible();
}

/** Stop where it shows: the panel hides its copy while the transport carries Stop (ControlsPanel DUPS) */
const stopButton = (page: Page) =>
  page.getByTestId("ctl-stop").or(page.getByTestId("booth-stop")).filter({ visible: true }).first();

const DESKTOP: BrowserContextOptions = { viewport: { width: 1440, height: 900 } };
const IPAD_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const IPAD: BrowserContextOptions = (() => {
  const { defaultBrowserType: _b, ...rest } = devices["iPad Pro 11 landscape"]!;
  return { ...rest, viewport: { width: 1180, height: 820 }, userAgent: IPAD_SAFARI };
})();

test.describe("Stop", () => {
  test("30 s clips: the bottom bar's Stop → Fade out and stop", async ({ browser }) => {
    const ctx = await browser.newContext(DESKTOP);
    const page = await ctx.newPage();
    await openBooth(page);
    await start(page);
    await page.getByTestId("booth-stop").click();
    await expect(page.getByTestId("booth-stop-sheet")).toBeVisible();
    await page.getByTestId("booth-stop-fade").click();
    await expect.poll(() => state(page), { timeout: 10000 }).toBe("stopped");
    await ctx.close();
  });

  test("30 s clips: Controls → Transport → Stop → Stop now", async ({ browser }) => {
    const ctx = await browser.newContext(DESKTOP);
    const page = await ctx.newPage();
    await openBooth(page);
    await start(page);
    await controls(page);
    await stopButton(page).click();
    await expect(page.getByTestId("booth-stop-sheet")).toBeVisible();
    await page.getByTestId("booth-stop-now").click();
    await expect.poll(() => state(page), { timeout: 5000 }).toBe("stopped");
    await ctx.close();
  });

  test("iPhone 15 Pro, 30 s clips: the bar's Stop opens its confirm and stops", async ({ browser }) => {
    const { defaultBrowserType: _b, ...iphone } = devices["iPhone 15 Pro"]!;
    const ctx = await browser.newContext(iphone);
    const page = await ctx.newPage();
    await openBooth(page);
    await start(page);
    await page.getByTestId("booth-stop").tap();
    await expect(page.getByTestId("booth-stop-sheet")).toBeVisible();
    await page.getByTestId("booth-stop-now").tap();
    await expect.poll(() => state(page), { timeout: 5000 }).toBe("stopped");
    await ctx.close();
  });

  test("Spotify Web Playback SDK (desktop): Stop fades with volume steps, then pauses the player", async ({
    browser,
  }) => {
    const ctx = await browser.newContext(DESKTOP);
    const page = await ctx.newPage();
    const sp = spotifyMock({ sdk: true });
    await sp.install(page);
    await page.route("https://sdk.scdn.co/spotify-player.js", (r) =>
      r.fulfill({
        contentType: "application/javascript",
        body: `window.__sdk = { pauses: 0, vols: [] };
        window.Spotify = { Player: class {
          constructor() { this.l = {}; }
          connect() { setTimeout(() => this.l.ready && this.l.ready({ device_id: "ipad" }), 10); return Promise.resolve(true); }
          disconnect() {}
          addListener(e, cb) { this.l[e] = cb; }
          getCurrentState() { return Promise.resolve(null); }
          setVolume(v) { window.__sdk.vols.push(v); return Promise.resolve(); }
          pause() { window.__sdk.pauses++; return Promise.resolve(); }
          resume() { return Promise.resolve(); }
          seek(ms) { (window.__sdk.seeks ||= []).push(ms); return Promise.resolve(); }
        } };
        window.onSpotifyWebPlaybackSDKReady && window.onSpotifyWebPlaybackSDKReady();`,
      }),
    );
    await openBooth(page, { spotify: true });
    await start(page);
    await controls(page);
    await stopButton(page).click();
    await expect(page.getByTestId("booth-stop-fade")).toBeVisible();
    await page.getByTestId("booth-stop-fade").click();
    await expect.poll(() => state(page), { timeout: 5000 }).toBe("stopped");
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __sdk: { pauses: number } }).__sdk.pauses), {
        timeout: 15000,
      })
      .toBeGreaterThan(0);
    await ctx.close();
  });

  test("Spotify Connect (iPad): Stop stops at once — one pause request on the device", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ ...IPAD });
    const page = await ctx.newPage();
    const sp = spotifyMock();
    await sp.install(page);
    await page.addInitScript(() =>
      Object.defineProperty(Navigator.prototype, "maxTouchPoints", { get: () => 5 }),
    );
    await openBooth(page, { spotify: true });
    await start(page);
    await controls(page);
    await stopButton(page).click();
    await expect(page.getByTestId("booth-stop-sheet")).toBeVisible();
    await expect(page.getByTestId("booth-stop-fade")).toHaveCount(0);
    await page.getByTestId("booth-stop-now").click();
    await expect.poll(() => state(page), { timeout: 5000 }).toBe("stopped");
    await expect.poll(() => sp.pauses().length, { timeout: 5000 }).toBeGreaterThan(0);
    expect(sp.st.playing).toBe(false);
    await ctx.close();
  });
});

test.describe("Cue", () => {
  test("with headphones chosen: the next song plays in the headphones (setSinkId hp), the room plays on", async ({
    browser,
  }) => {
    const ctx = await browser.newContext(DESKTOP);
    const page = await ctx.newPage();
    await fakeOutputs(page);
    await openBooth(page);
    await page.getByTestId("booth-out-cue").click();
    await page.getByTestId("booth-output-sheet").locator('[data-device="hp"]').click();
    await page.keyboard.press("Escape");
    await start(page);
    await controls(page);
    const cue = page.getByTestId("ctl-cue-next");
    await expect(cue).toBeEnabled();
    await cue.click();
    await expect(page.getByTestId("ctl-cue-stop")).toBeVisible({ timeout: 10000 });
    expect(await page.evaluate(() => (window as unknown as { __sinks: string[] }).__sinks)).toContain("hp");
    expect(await state(page)).toBe("playing");
    await page.getByTestId("ctl-cue-stop").click();
    await expect(page.getByTestId("ctl-cue-next")).toBeVisible();
    await ctx.close();
  });

  test("no headphones chosen mid-night: Cue opens the output picker (never a dead button)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext(DESKTOP);
    const page = await ctx.newPage();
    await fakeOutputs(page);
    await openBooth(page);
    await start(page);
    await controls(page);
    const cue = page.getByTestId("ctl-cue-next");
    await expect(cue).toBeEnabled();
    await cue.click();
    await expect(page.getByTestId("booth-output-sheet")).toBeVisible();
    await page.getByTestId("booth-output-sheet").locator('[data-device="hp"]').click();
    // picked: the cue plays there
    await expect(page.getByTestId("ctl-cue-stop")).toBeVisible({ timeout: 10000 });
    expect(await state(page)).toBe("playing");
    await ctx.close();
  });

  test("Spotify Connect on an iPad: Cue says in one line that the headphones need a second device", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ ...IPAD });
    const page = await ctx.newPage();
    const sp = spotifyMock();
    await sp.install(page);
    await page.addInitScript(() =>
      Object.defineProperty(Navigator.prototype, "maxTouchPoints", { get: () => 5 }),
    );
    await openBooth(page, { spotify: true });
    await start(page);
    await controls(page);
    const cue = page.getByTestId("ctl-cue-next");
    await expect(cue).toBeEnabled();
    await cue.click();
    await expect(page.getByTestId("ctl-cue-why")).toContainText(/second device/i);
    expect(await state(page)).toBe("playing");
    await ctx.close();
  });
});
