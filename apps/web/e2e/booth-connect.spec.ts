/**
 * 2026-11 — the DJ-user review on an iPad Pro 11 (landscape) with Spotify Premium: the Booth plays through the
 * Spotify app via Connect (no Web Playback SDK). A mocked Connect device "iPad" (as in booth-ipad.spec.ts) records
 * every Web API request:
 * - Mute sends volume 0 and unmute restores the device's 80 (Talk dips to 20 and restores 80);
 * - a device without volume control: Mute pauses (and says so), Talk and the master are disabled with the reason;
 * - Next sends exactly one play (no pause, no wait), "Starting…" until Spotify reports the track, then "Playing";
 * - Next → Previous → Next sends one play, for the final target;
 * - mid-night a single tap on the seek bar does not seek, a confirmed one does — with one `PUT /me/player/seek`
 *   (never a new play), the bar staying where it was released (never back to 0 or the old second);
 * - a reload while Spotify plays re-attaches ("Continue: … is playing on iPad"), no new play;
 * - Fade / Crossfade are disabled on Connect with the reason; ROOM ticks one device, no browser output;
 * - Compose's and the Booth's totals match.
 */
import { type BrowserContextOptions, devices, expect, type Page, test } from "@playwright/test";
import { hold } from "./confirm";

const IPAD_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const IPAD_L: BrowserContextOptions = (() => {
  const { defaultBrowserType: _b, ...rest } = devices["iPad Pro 11 landscape"]!;
  return { ...rest, viewport: { width: 1180, height: 820 }, userAgent: IPAD_SAFARI };
})();

interface Req {
  at: number;
  method: string;
  path: string;
  query: URLSearchParams;
  body: Record<string, unknown> | null;
}
/** a Spotify account with one Connect device, the iPad's Spotify app: it plays what it is asked, at its volume */
function connectMock(o: { supportsVolume?: boolean; volume?: number; confirmDelayMs?: number } = {}) {
  const st = {
    supportsVolume: o.supportsVolume !== false,
    volume: o.volume ?? 80,
    uri: null as string | null,
    /** the uri /me/player reports (switches `confirmDelayMs` after a play) */
    reported: null as string | null,
    playing: false,
    startedAt: 0,
    posMs: 0,
    confirmDelayMs: o.confirmDelayMs ?? 0,
  };
  const log: Req[] = [];
  const device = () => ({
    id: "ipad",
    name: "iPad",
    type: "Tablet",
    is_active: true,
    is_restricted: false,
    supports_volume: st.supportsVolume,
    volume_percent: st.supportsVolume ? st.volume : null,
  });
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
      let body: Record<string, unknown> | null = null;
      try {
        body = r.request().postDataJSON() as Record<string, unknown>;
      } catch {}
      log.push({ at: Date.now(), method, path, query: u.searchParams, body });
      if (method === "GET" && path === "/me/player/devices")
        return r.fulfill({ json: { devices: [device()] } });
      if (method === "GET" && path === "/me/player") {
        if (!st.uri) return r.fulfill({ status: 204, body: "" });
        return r.fulfill({
          json: {
            is_playing: st.playing,
            progress_ms: Math.min(progress(), 170_000),
            item: { uri: st.reported, duration_ms: 170_000 },
            device: device(),
          },
        });
      }
      if (method === "PUT" && path === "/me/player/play") {
        const uri = ((body?.uris as string[] | undefined) ?? [])[0] ?? st.uri;
        st.uri = uri;
        st.playing = true;
        st.posMs = Number(body?.position_ms ?? 0);
        st.startedAt = Date.now();
        if (st.confirmDelayMs) setTimeout(() => (st.reported = uri), st.confirmDelayMs);
        else st.reported = uri;
      } else if (method === "PUT" && path === "/me/player/pause") {
        st.posMs = progress();
        st.playing = false;
      } else if (method === "PUT" && path === "/me/player/seek") {
        // a real device applies a seek a moment later: /me/player reports the old position until then
        const to = Number(u.searchParams.get("position_ms"));
        setTimeout(() => {
          st.posMs = to;
          st.startedAt = Date.now();
        }, 400);
      } else if (method === "PUT" && path === "/me/player/volume") {
        if (!st.supportsVolume)
          return r.fulfill({ status: 403, json: { error: { status: 403, message: "x" } } });
        st.volume = Number(u.searchParams.get("volume_percent"));
      }
      return r.fulfill({ status: 204, body: "" });
    });
  }
  const plays = () => log.filter((x) => x.method === "PUT" && x.path === "/me/player/play");
  const seeks = () => log.filter((x) => x.method === "PUT" && x.path === "/me/player/seek");
  const pauses = () => log.filter((x) => x.method === "PUT" && x.path === "/me/player/pause");
  const volumes = () =>
    log
      .filter((x) => x.method === "PUT" && x.path === "/me/player/volume")
      .map((x) => Number(x.query.get("volume_percent")));
  return { st, log, install, plays, seeks, pauses, volumes };
}

async function openBooth(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("tdj-booth-theme", "dark");
    } catch {}
    Object.defineProperty(Navigator.prototype, "maxTouchPoints", { get: () => 5 });
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
  });
  await page.route(/dzcdn\.net|p\.scdn\.co|preview\.test|\/api\/preview\?/, (r) =>
    r.fulfill({ status: 404 }),
  );
  await page.route(/open\.spotify\.com\/oembed/, (r) => r.fulfill({ status: 404, body: "" }));
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/, { timeout: 60000 });
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("booth-ttc")).not.toHaveAttribute("data-resolving", "1", { timeout: 30000 });
  await expect(page.getByTestId("booth-mode")).toContainText("Spotify", { timeout: 15000 });
}

type Snap = { planIndex: number; state: string; cur: number | null; muted: boolean; starting: boolean };
const snap = (page: Page) =>
  page.evaluate(() => {
    const s = (
      window as unknown as { __tdjBooth: { getState: () => Record<string, unknown> } }
    ).__tdjBooth.getState();
    return {
      planIndex: s.planIndex as number,
      state: s.state as string,
      cur: ((s.current as { planIndex: number } | null)?.planIndex ?? null) as number | null,
      muted: s.muted as boolean,
      starting: s.starting as boolean,
    } as Snap;
  });
async function start(page: Page) {
  await page.getByTestId("booth-start").click();
  await expect.poll(async () => (await snap(page)).state, { timeout: 20000 }).toBe("playing");
  await expect(page.getByTestId("booth-mode")).toContainText("Playing", { timeout: 10000 });
}

test.describe("iPad + Spotify Connect (the DJ-user review)", () => {
  test("Mute sends volume 0 and unmute restores 80; Talk dips to 20 and restores 80; ROOM and HEADPHONES say what is true", async ({
    browser,
  }) => {
    const ctx = await browser.newContext(IPAD_L);
    const page = await ctx.newPage();
    const sp = connectMock({ volume: 80 });
    await sp.install(page);
    await openBooth(page);
    await start(page);
    const mute = page.getByTestId("booth-mute");
    await mute.click();
    await expect.poll(() => sp.volumes()).toEqual([0]);
    await expect(mute).toHaveAttribute("aria-pressed", "true");
    await mute.click();
    await expect.poll(() => sp.volumes()).toEqual([0, 80]);
    const talk = page.getByTestId("booth-talk");
    await talk.click();
    await expect.poll(() => sp.volumes()).toEqual([0, 80, 20]);
    await talk.click();
    await expect.poll(() => sp.volumes()).toEqual([0, 80, 20, 80]);
    // ROOM: exactly one ticked room (the iPad), no browser output, no microphone permission row
    await page.getByTestId("booth-out-room").click();
    const sheet = page.getByTestId("booth-output-sheet");
    await expect(sheet).toContainText("iPad");
    await expect(sheet.getByLabel("Chosen")).toHaveCount(1);
    await expect(sheet.locator('[data-device="this"]')).toHaveCount(0);
    await expect(sheet).not.toContainText("Show device names");
    await expect(sheet).not.toContainText("This browser");
    await page.keyboard.press("Escape");
    // HEADPHONES: a second device, said plainly
    await expect(page.getByTestId("booth-out-cue-unsupported")).toContainText("2nd device");
    await expect(page.getByTestId("booth-out-cue-unsupported")).toHaveAttribute(
      "data-hint",
      /needs a second device: open T-DJ on your phone with headphones/,
    );
    await ctx.close();
  });

  test("a device without volume control: Mute pauses (and says so), Talk and the master are disabled with the reason", async ({
    browser,
  }) => {
    const ctx = await browser.newContext(IPAD_L);
    const page = await ctx.newPage();
    const sp = connectMock({ supportsVolume: false });
    await sp.install(page);
    await openBooth(page);
    await start(page);
    const mute = page.getByTestId("booth-mute");
    await expect(mute).toHaveAttribute("aria-label", "Mute (pauses — this device has no volume control)");
    const talk = page.getByTestId("booth-talk");
    await expect(talk).toBeDisabled();
    await expect(talk).toHaveAttribute("aria-description", "Not available on this device");
    await expect(page.getByTestId("booth-master").locator("input")).toBeDisabled();
    const before = sp.pauses().length;
    await mute.click();
    await expect.poll(() => sp.pauses().length).toBeGreaterThan(before);
    await expect.poll(async () => (await snap(page)).state).toBe("paused");
    expect(sp.volumes()).toEqual([]);
    await expect(mute).toHaveAttribute("aria-label", "Unmute (resumes)");
    const plays = sp.plays().length;
    await mute.click();
    await expect.poll(async () => (await snap(page)).state).toBe("playing");
    await expect.poll(() => sp.plays().length).toBe(plays + 1);
    expect(Number(sp.plays().at(-1)!.body?.position_ms)).toBeGreaterThan(0);
    expect(sp.volumes()).toEqual([]);
    await ctx.close();
  });

  test("Next: exactly one play, no pause, no wait; Starting… until Spotify reports the track, then Playing within 1 s", async ({
    browser,
  }) => {
    const ctx = await browser.newContext(IPAD_L);
    const page = await ctx.newPage();
    const sp = connectMock({ confirmDelayMs: 1200 });
    await sp.install(page);
    await openBooth(page);
    await start(page);
    const a = (await snap(page)).cur!;
    const plays = sp.plays().length;
    const pauses = sp.pauses().length;
    const released = Date.now();
    await hold(page, page.getByTestId("booth-next-now"));
    await expect.poll(() => sp.plays().length, { timeout: 5000 }).toBe(plays + 1);
    const play = sp.plays().at(-1)!;
    // one play, at once (the hold, then ~250 ms of coalescing), with the next song's uri; no pause before it
    expect(play.at - released).toBeLessThan(800 + 900);
    expect(sp.pauses().length).toBe(pauses);
    expect(((play.body?.uris as string[] | undefined) ?? [])[0]).toMatch(/^spotify:track:/);
    await expect.poll(async () => (await snap(page)).cur).not.toBe(a);
    // Spotify has not switched yet: the status says Starting…
    await expect(page.getByTestId("booth-mode")).toHaveText("Starting…");
    // … and Playing within 1 s of the confirmation (1.2 s after the play)
    await expect(page.getByTestId("booth-mode")).toContainText("Playing", { timeout: 1200 + 1000 + 300 });
    expect(Date.now() - (play.at + 1200)).toBeLessThan(1000 + 400);
    await page.waitForTimeout(1500);
    expect(sp.plays().length).toBe(plays + 1);
    expect(sp.pauses().length).toBe(pauses);
    await ctx.close();
  });

  test("Next → Previous → Next sends one play, for the final target", async ({ browser }) => {
    const ctx = await browser.newContext(IPAD_L);
    const page = await ctx.newPage();
    const sp = connectMock();
    await sp.install(page);
    await openBooth(page);
    await start(page);
    const a = (await snap(page)).cur!;
    const plays = sp.plays().length;
    // three presses inside the coalescing window (the store's actions, as the transport calls them)
    await page.evaluate(async () => {
      const b = (
        window as unknown as {
          __tdjBooth: { getState: () => { nextNow: () => Promise<void>; previous: () => Promise<void> } };
        }
      ).__tdjBooth;
      await b.getState().nextNow();
      await b.getState().previous();
      await b.getState().nextNow();
    });
    await page.waitForTimeout(1200);
    expect(sp.plays().length).toBe(plays + 1);
    expect(sp.pauses().length).toBe(0);
    const s = await snap(page);
    expect(s.cur).not.toBe(a);
    expect(s.state).toBe("playing");
    await ctx.close();
  });

  test("mid-night a single tap on the seek bar does not seek; a second tap (confirmed) does", async ({
    browser,
  }) => {
    const ctx = await browser.newContext(IPAD_L);
    const page = await ctx.newPage();
    const sp = connectMock();
    await sp.install(page);
    await openBooth(page);
    await start(page);
    const bar = page.getByTestId("booth-seek");
    const box = (await bar.boundingBox())!;
    const y = box.y + box.height / 2;
    const plays = sp.plays().length;
    await page.touchscreen.tap(box.x + box.width * 0.6, y);
    await expect(page.getByTestId("booth-seek-arm")).toContainText(/Tap again to jump to \d+:\d\d/);
    await page.waitForTimeout(800);
    expect(sp.plays().length).toBe(plays);
    // 2026-11 (the owner: "the slider goes to zero for a second, then the song plays late"): the second tap jumps
    // with one seek request on the device — no new play — and the bar never drops below where it was released
    await page.evaluate(() => {
      const w = window as unknown as {
        __minPos: number;
        __tdjBooth: { getState: () => { position: number }; subscribe: (f: () => void) => void };
      };
      w.__minPos = Number.POSITIVE_INFINITY;
      w.__tdjBooth.subscribe(() => {
        if ((w as unknown as { __arm?: boolean }).__arm)
          w.__minPos = Math.min(w.__minPos, w.__tdjBooth.getState().position);
      });
    });
    await page.touchscreen.tap(box.x + box.width * 0.6, y);
    // from the release on, every position the store reads
    await page.evaluate(() => {
      (window as unknown as { __arm: boolean }).__arm = true;
    });
    await expect.poll(() => sp.seeks().length).toBe(1);
    expect(sp.plays().length).toBe(plays);
    const len = Number(await bar.getAttribute("aria-valuemax"));
    const at = Number(sp.seeks()[0]!.query.get("position_ms")) / 1000;
    expect(at).toBeGreaterThan(len * 0.5);
    expect(sp.seeks()[0]!.query.get("device_id")).toBe("ipad");
    await page.waitForTimeout(1500);
    const min = await page.evaluate(() => (window as unknown as { __minPos: number }).__minPos);
    expect(min).toBeGreaterThanOrEqual(at - 1.5);
    expect(Number(await bar.getAttribute("aria-valuenow"))).toBeGreaterThanOrEqual(Math.floor(at - 1.5));
    // a lone tap lapses after 3 s
    await page.touchscreen.tap(box.x + box.width * 0.2, y);
    await expect(page.getByTestId("booth-seek-arm")).toBeVisible();
    await expect(page.getByTestId("booth-seek-arm")).toHaveCount(0, { timeout: 4000 });
    expect(sp.plays().length).toBe(plays);
    expect(sp.seeks().length).toBe(1);
    await ctx.close();
  });

  test("a reload while Spotify plays re-attaches: Continue on iPad, no new play, Playing", async ({
    browser,
  }) => {
    const ctx = await browser.newContext(IPAD_L);
    const page = await ctx.newPage();
    const sp = connectMock();
    await sp.install(page);
    await openBooth(page);
    await start(page);
    await hold(page, page.getByTestId("booth-next-now"));
    await expect.poll(async () => (await snap(page)).cur).not.toBe(0);
    await expect(page.getByTestId("booth-mode")).toContainText("Playing", { timeout: 5000 });
    const cur = (await snap(page)).cur!;
    const title = await page.getByTestId("booth-now-title").innerText();
    await page.waitForTimeout(5500); // the night is saved every 5 s (and on each change)
    await page.reload();
    const sheet = page.getByTestId("booth-resume");
    await expect(sheet).toBeVisible({ timeout: 30000 });
    await expect(sheet).toContainText(`Continue: ${title} is playing on iPad`);
    await expect(sheet).not.toContainText("cannot survive a reload");
    const plays = sp.plays().length;
    await sheet.getByRole("button", { name: `Continue: ${title} is playing on iPad` }).click();
    await expect.poll(async () => (await snap(page)).state, { timeout: 15000 }).toBe("playing");
    expect((await snap(page)).cur).toBe(cur);
    await expect(page.getByTestId("booth-mode")).toContainText("Playing");
    await expect(page.getByTestId("booth-out-room")).toContainText("iPad");
    await page.waitForTimeout(1500);
    expect(sp.plays().length).toBe(plays);
    // the position comes from Spotify (seconds in, not 0)
    const pos = await page.evaluate(
      () =>
        (window as unknown as { __tdjBooth: { getState: () => { position: number } } }).__tdjBooth.getState()
          .position,
    );
    expect(pos).toBeGreaterThan(4);
    await ctx.close();
  });

  test("Fade and Crossfade are disabled on Connect with the reason; Stop stops at once (no fade promised)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext(IPAD_L);
    const page = await ctx.newPage();
    const sp = connectMock();
    await sp.install(page);
    await openBooth(page);
    await start(page);
    for (const id of ["booth-strip-fade", "booth-strip-crossfade"]) {
      const b = page.getByTestId(id);
      if (!(await b.isVisible())) continue;
      await expect(b).toBeDisabled();
      await expect(b).toHaveAttribute("aria-description", "This device can't fade");
    }
    await page.getByTestId("booth-stop").click();
    const stop = page.getByTestId("booth-stop-sheet");
    await expect(stop.getByTestId("booth-stop-fade")).toHaveCount(0);
    await expect(stop.getByTestId("booth-stop-now")).toContainText(
      /stops at once \(this device can't fade\)/i,
    );
    await stop.getByTestId("booth-stop-cancel").click();
    // the Controls panel says the same
    await page.getByTestId("booth-controls-toggle").click();
    const panel = page.getByTestId("booth-controls");
    for (const id of ["ctl-fade", "ctl-crossfade"]) {
      await expect(panel.getByTestId(id)).toBeDisabled();
      await expect(panel.getByTestId(id)).toHaveAttribute("aria-description", "This device can't fade");
    }
    await expect(panel.getByTestId("ctl-jump-cumparsita")).toContainText("at once: this device can't fade");
    await page.getByTestId("booth-controls-toggle").click();
    // no gain chip for a level Spotify does not apply
    await expect(page.getByTestId("booth-gain")).toHaveCount(0);
    expect(sp.pauses().length).toBe(0);
    await ctx.close();
  });

  test("Compose and the Booth print the same totals (tanda 1, the night's music)", async ({ browser }) => {
    const ctx = await browser.newContext(IPAD_L);
    const page = await ctx.newPage();
    const sp = connectMock();
    await sp.install(page);
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "maxTouchPoints", { get: () => 5 });
    });
    await page.goto("/?featured=golden-double-peak");
    await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
    const composeTanda = (await page.getByTestId("tanda-total").first().innerText()).trim();
    const composeNight = (await page.getByTestId("night-total").first().innerText()).trim();
    await page.getByTestId("play-the-night").first().click();
    await expect(page).toHaveURL(/\/booth/, { timeout: 60000 });
    await expect(page.getByTestId("booth-ttc")).not.toHaveAttribute("data-resolving", "1", {
      timeout: 30000,
    });
    const boothTanda = (
      await page.locator('.booth-tanda[data-tanda="1"]').getByTestId("booth-tanda-total").innerText()
    ).trim();
    const mmss = (s: string) => s.match(/\d+:\d\d(?::\d\d)?/)?.[0];
    expect(mmss(boothTanda)).toBe(mmss(composeTanda));
    // the Booth's night: the same music as Compose's, plus its gaps
    const total = page.getByTestId("booth-night-total");
    await expect(total).toContainText(/music \+ .* gaps/);
    const music = Number(await total.getAttribute("data-music-sec"));
    const h = mmss(composeNight)!.split(":").map(Number);
    const composeSec = h.length === 3 ? h[0]! * 3600 + h[1]! * 60 + h[2]! : h[0]! * 60 + h[1]!;
    expect(Math.abs(music - composeSec)).toBeLessThanOrEqual(1);
    await ctx.close();
  });
});
