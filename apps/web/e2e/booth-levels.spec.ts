/**
 * 2026-11 (the owner: "the decibel shower (level meter) doesn't work; also the master slider should automatically
 * match the song loudness with what's heard from the speakers and the environment"):
 * - files / clips: the meter moves with the music at the master output (peak and short-term LUFS), its numbers in the
 *   Controls panel's Mixer, and the night's normalisation says what it does to the side playing now;
 * - the room meter with a fake microphone (the speakers' sound at −15 dB plus a "crowd" the test turns up): Auto
 *   master is off by default, rises slowly (≤ 0.5 dB/s) within its maximum when the crowd gets louder, shows a badge,
 *   and one tap stops it (the boost ramps back to 0);
 * - Spotify Connect: "Level not available from Spotify" instead of a dead meter, and the advice to turn on Spotify's
 *   own Normalize volume.
 */
import { type BrowserContextOptions, devices, expect, type Page, test } from "@playwright/test";

const RATE = 22050;
const SEC = 8;
/** a 330 Hz tone at 0.5 with a slow tremolo (the meter must move), 8 s */
function toneWav(): Buffer {
  const n = RATE * SEC;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const am = 0.6 + 0.4 * Math.sin((2 * Math.PI * 0.5 * i) / RATE);
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 330 * i) / RATE) * 0.5 * am * 32767), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
const WAV = toneWav();

async function quiet(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("tdj-booth-theme", "dark");
    } catch {}
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
  });
}

/**
 * A fake microphone: what the booth's own master plays, 15 dB down (the speakers heard across the room), plus a
 * "crowd" (noise) whose level `window.__crowd(db)` sets. Built on the booth's context when the DJ turns the meter on.
 */
async function fakeMic(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __crowd: (db: number) => void;
      __crowdGain?: GainNode;
      __micAsked?: number;
      __tdjBoothEngine?: () => { ctx: AudioContext; master: AudioNode } | null;
    };
    w.__crowd = (db: number) => {
      if (w.__crowdGain) w.__crowdGain.gain.value = 10 ** (db / 20);
    };
    const md = navigator.mediaDevices ?? ({} as MediaDevices);
    if (!navigator.mediaDevices) Object.defineProperty(navigator, "mediaDevices", { value: md });
    md.getUserMedia = async () => {
      w.__micAsked = (w.__micAsked ?? 0) + 1;
      const eng = w.__tdjBoothEngine?.();
      const ctx = eng?.ctx ?? new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      if (eng) {
        const speakers = ctx.createGain();
        speakers.gain.value = 10 ** (-15 / 20);
        eng.master.connect(speakers);
        speakers.connect(dest);
      }
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let seed = 7;
      for (let i = 0; i < d.length; i++) {
        seed = (seed * 16807) % 2147483647;
        d[i] = (seed / 2147483647 - 0.5) * 2;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      noise.loop = true;
      const g = ctx.createGain();
      g.gain.value = 10 ** (-75 / 20);
      noise.connect(g);
      g.connect(dest);
      noise.start();
      w.__crowdGain = g;
      return dest.stream;
    };
  });
}

async function openClips(page: Page) {
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
  await expect(page.getByTestId("booth-start")).toHaveText(/30 s clips/);
}

const autoDb = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __tdjBoothEngine: () => { autoDb: number } }).__tdjBoothEngine().autoDb,
  );

test.describe("2026-11 the level meter and Auto master", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("files / clips: the meter moves with the music, LUFS and peak in the Mixer, the normalisation in words", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await quiet(page);
    await openClips(page);
    // nothing plays: the meter is at rest
    await expect(page.getByTestId("booth-meter")).toBeVisible();
    await page.getByTestId("booth-start").click();
    await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing", { timeout: 20000 });
    // the bar follows the tremolo: several distinct peaks over 2 s, all in the music's range
    const peaks = new Set<string>();
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(200);
      const p = await page.getByTestId("booth-meter").getAttribute("data-peak");
      if (p) peaks.add(p);
    }
    expect(peaks.size).toBeGreaterThan(3);
    for (const p of peaks) {
      expect(Number(p)).toBeGreaterThan(-30);
      expect(Number(p)).toBeLessThan(-0.5);
    }
    // short-term loudness near the night's target (−16 LUFS, the clip normalised by its gain)
    await expect(page.getByTestId("booth-meter-lufs")).toHaveText(/^-1[2-9] LUFS$/, { timeout: 5000 });
    await expect(page.getByTestId("booth-clip")).toHaveCount(0);
    // the Mixer: the same meter with its numbers, the normalisation and the room door
    await page.getByTestId("booth-controls-toggle").click();
    const panel = page.getByTestId("booth-controls");
    await expect(panel.getByTestId("ctl-meter")).toBeVisible();
    await expect(panel.getByTestId("ctl-meter-nums")).toHaveText(/^-1[2-9] LUFS$/);
    await expect(panel.getByTestId("ctl-meter-nums")).toHaveAttribute(
      "title",
      /Short-term -?\d+\.\d LUFS · Peak -?\d+\.\d dBFS/,
    );
    const box = await panel.getByTestId("ctl-room").boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    // its sheet: the meter again and the normalisation for the side playing now, in words
    await panel.getByTestId("ctl-room").click();
    const sheet = page.getByTestId("booth-room-sheet");
    await expect(sheet.getByTestId("ctl-norm")).toHaveAttribute("data-norm", "graph");
    await expect(sheet.getByTestId("ctl-norm")).toContainText("Every song plays at -16 LUFS");
    await sheet.getByRole("button", { name: "Done" }).click();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    // Auto master is off by default: no badge, no boost
    await expect(page.getByTestId("booth-auto-badge")).toHaveCount(0);
    expect(await autoDb(page)).toBe(0);
  });

  test("the room meter (a fake microphone): Auto master rises slowly within its maximum when the crowd gets louder; one tap stops it", async ({
    page,
  }) => {
    test.setTimeout(360_000);
    await quiet(page);
    await fakeMic(page);
    await openClips(page);
    await page.getByTestId("booth-start").click();
    await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing", { timeout: 20000 });
    await page.getByTestId("booth-controls-toggle").click();
    await page.getByTestId("ctl-room").click();
    const sheet = page.getByTestId("booth-room-sheet");
    await expect(sheet).toBeVisible();
    // never asked before the DJ turns it on
    expect(await page.evaluate(() => (window as unknown as { __micAsked?: number }).__micAsked ?? 0)).toBe(0);
    const auto = sheet.getByRole("switch", { name: "Auto master" });
    await expect(auto).toBeDisabled();
    await sheet.getByRole("switch", { name: "Room meter (microphone)" }).click();
    await expect(sheet.getByTestId("booth-room-db")).toContainText(/dB \(relative\)/, { timeout: 10000 });
    await expect(sheet).toContainText("Nothing is recorded or sent anywhere");
    // the room as it is when Auto master starts: its baseline comes from the first gap between two clips
    await expect(auto).toBeEnabled();
    await auto.click();
    await expect(auto).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("booth-auto-badge")).toBeVisible();
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (window as unknown as { __tdjLevels?: () => { baseline: number | null } }).__tdjLevels?.()
                .baseline ?? null,
          ),
        { timeout: 40000 },
      )
      .not.toBeNull();
    expect(await autoDb(page)).toBe(0);
    // the crowd arrives: +30 dB of chatter
    await page.evaluate(() => (window as unknown as { __crowd: (db: number) => void }).__crowd(-30));
    const samples: Array<{ t: number; db: number }> = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 60_000) {
      samples.push({ t: Date.now(), db: await autoDb(page) });
      if ((samples.at(-1)?.db ?? 0) >= 1) break;
      await page.waitForTimeout(250);
    }
    const top = Math.max(...samples.map((s) => s.db));
    expect(top).toBeGreaterThanOrEqual(1);
    // never faster than 0.5 dB/s over any 2 s or more (slack: one page tick, read late), never past the +3 dB maximum
    for (let i = 0; i < samples.length; i++)
      for (let j = i + 1; j < samples.length; j++) {
        const dt = (samples[j]!.t - samples[i]!.t) / 1000;
        if (dt >= 2) expect(samples[j]!.db - samples[i]!.db).toBeLessThanOrEqual(0.5 * dt + 0.5);
      }
    // and the rise as a whole took time: 1 dB is never reached in under 2 s of crowd
    expect((samples.at(-1)!.t - samples[0]!.t) / 1000).toBeGreaterThanOrEqual(2);
    expect(top).toBeLessThanOrEqual(3);
    await expect(page.getByTestId("booth-auto-badge")).toContainText(/Auto master \+\d\.\d dB/);
    // back on the Booth, the badge on the Now card: one tap stops it; the boost goes back down, slowly
    await sheet.getByRole("button", { name: "Done" }).click();
    await expect(sheet).toHaveCount(0);
    const badge = page.getByTestId("booth-auto-badge");
    await expect(badge).toHaveAttribute("data-on", "1");
    const bb = await badge.boundingBox();
    expect(bb!.height).toBeGreaterThanOrEqual(44);
    await badge.click();
    const at = await autoDb(page);
    await page.waitForTimeout(1000);
    const after = await autoDb(page);
    expect(after).toBeLessThan(at);
    expect(at - after).toBeLessThanOrEqual(0.6);
    await expect.poll(() => autoDb(page), { timeout: 20000 }).toBe(0);
    await expect(page.getByTestId("booth-auto-badge")).toHaveCount(0);
    // turning the room meter off stops the microphone
    await page.getByTestId("ctl-room").click();
    await expect(auto).toHaveAttribute("aria-checked", "false");
    await sheet.getByRole("switch", { name: "Room meter (microphone)" }).click();
    await expect(sheet.getByTestId("booth-room-db")).toHaveCount(0);
  });
});

/* ---------- Spotify Connect: no audio to measure ---------- */
const IPAD_L: BrowserContextOptions = (() => {
  const { defaultBrowserType: _b, ...rest } = devices["iPad Pro 11 landscape"]!;
  return {
    ...rest,
    viewport: { width: 1180, height: 820 },
    userAgent:
      "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  };
})();

async function connect(page: Page) {
  const st = { uri: null as string | null, playing: false, at: 0, volume: 80 };
  const device = () => ({
    id: "ipad",
    name: "iPad",
    type: "Tablet",
    is_active: true,
    is_restricted: false,
    supports_volume: true,
    volume_percent: st.volume,
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
  await page.route("https://sdk.scdn.co/**", (r) => r.fulfill({ status: 404, body: "" }));
  await page.route("https://api.spotify.com/**", (r) => {
    const u = new URL(r.request().url());
    const method = r.request().method();
    const path = u.pathname.replace("/v1", "");
    if (method === "GET" && path === "/me/player/devices")
      return r.fulfill({ json: { devices: [device()] } });
    if (method === "GET" && path === "/me/player") {
      if (!st.uri) return r.fulfill({ status: 204, body: "" });
      return r.fulfill({
        json: {
          is_playing: st.playing,
          progress_ms: st.playing ? Date.now() - st.at : 0,
          item: { uri: st.uri, duration_ms: 170_000 },
          device: device(),
        },
      });
    }
    if (method === "PUT" && path === "/me/player/play") {
      let body: { uris?: string[] } | null = null;
      try {
        body = r.request().postDataJSON() as { uris?: string[] };
      } catch {}
      st.uri = body?.uris?.[0] ?? st.uri;
      st.playing = true;
      st.at = Date.now();
    } else if (method === "PUT" && path === "/me/player/pause") st.playing = false;
    else if (method === "PUT" && path === "/me/player/volume")
      st.volume = Number(u.searchParams.get("volume_percent"));
    return r.fulfill({ status: 204, body: "" });
  });
}

test("Spotify Connect: 'Level not available from Spotify' instead of a dead meter, and Spotify's own normalisation", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext(IPAD_L);
  const page = await ctx.newPage();
  await connect(page);
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "maxTouchPoints", { get: () => 5 });
  });
  await quiet(page);
  await page.route(/dzcdn\.net|p\.scdn\.co|preview\.test|\/api\/preview\?/, (r) =>
    r.fulfill({ status: 404 }),
  );
  await page.route(/open\.spotify\.com\/oembed/, (r) => r.fulfill({ status: 404, body: "" }));
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/, { timeout: 60000 });
  await expect(page.getByTestId("booth-ttc")).not.toHaveAttribute("data-resolving", "1", { timeout: 30000 });
  await expect(page.getByTestId("booth-mode")).toContainText("Spotify", { timeout: 15000 });
  await page.getByTestId("booth-start").click();
  await expect(page.getByTestId("booth-mode")).toContainText("Playing", { timeout: 20000 });
  const na = page.getByTestId("booth-meter-na");
  await expect(na).toContainText("Level not available from Spotify");
  await expect(page.getByTestId("booth-meter")).toHaveCount(0);
  await page.getByTestId("booth-controls-toggle").click();
  const panel = page.getByTestId("booth-controls");
  await expect(panel.getByTestId("ctl-meter-na")).toContainText("Level not available from Spotify");
  await panel.getByTestId("ctl-room").click();
  const sheet = page.getByTestId("booth-room-sheet");
  await expect(sheet.getByTestId("mix-meter-na")).toContainText("Level not available from Spotify");
  await expect(sheet.getByTestId("ctl-norm")).toHaveAttribute("data-norm", "spotify");
  await expect(sheet.getByTestId("ctl-norm")).toContainText("turn on Normalize volume in Spotify");
  await ctx.close();
});
