/**
 * 2026-11 — Battery saver (lib/power.ts; the owner: "a battery saving mode for lower usage, for the apps and web").
 * The Booth with a night playing through Spotify Connect (an iPad), the same minute measured with the saver off and
 * on: requestAnimationFrame callbacks and polling requests (`GET /me/player`) per minute — at least 50 % fewer each
 * with the saver on — while the night plays the same (the commands, the playing state). Then the controls: Settings
 * → General, the More sheet's toggle, the leaf in the status chip, the solid materials.
 */
import { type BrowserContextOptions, devices, expect, type Page, test } from "@playwright/test";

const WINDOW_MS = 30_000;

/** a Connect account (the iPad's Spotify app): records every Web API request with its time */
function spotifyMock() {
  const st = { uri: null as string | null, playing: false, posMs: 0, startedAt: 0 };
  const log: Array<{ method: string; path: string; at: number }> = [];
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
    await page.route(/open\.spotify\.com\/oembed/, (r) => r.fulfill({ status: 404, body: "" }));
    await page.route("https://api.spotify.com/**", (r) => {
      const u = new URL(r.request().url());
      const method = r.request().method();
      const path = u.pathname.replace("/v1", "");
      log.push({ method, path, at: Date.now() });
      const device = { id: "ipad", name: "iPad", type: "Tablet", is_active: true, is_restricted: false };
      if (method === "GET" && path === "/me/player/devices")
        return r.fulfill({ json: { devices: [{ ...device, supports_volume: true, volume_percent: 80 }] } });
      if (method === "GET" && path === "/me/player") {
        if (!st.uri) return r.fulfill({ status: 204, body: "" });
        return r.fulfill({
          json: {
            is_playing: st.playing,
            progress_ms: progress(),
            // long sides: the measured minute is mid-song (the saver reads every second near an end)
            item: { uri: st.uri, duration_ms: 1_000_000 },
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
      }
      return r.fulfill({ status: 204, body: "" });
    });
  }
  return { st, log, install };
}

const IPAD: BrowserContextOptions = (() => {
  const { defaultBrowserType: _b, ...rest } = devices["iPad Pro 11 landscape"]!;
  return {
    ...rest,
    viewport: { width: 1180, height: 820 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  };
})();

/** the saver's mode before the page loads, and a counter of requestAnimationFrame callbacks */
async function prepare(page: Page, mode: "off" | "on") {
  await page.addInitScript((m) => {
    try {
      localStorage.setItem("tdj-power", m);
      localStorage.setItem("tdj-booth-controls", "1");
    } catch {}
    const w = window as unknown as { __raf: number };
    w.__raf = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) =>
      raf((t) => {
        w.__raf++;
        cb(t);
      });
    Object.defineProperty(Navigator.prototype, "maxTouchPoints", { get: () => 5 });
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
  }, mode);
}

const boothState = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __tdjBooth: { getState: () => { state: string } } }).__tdjBooth.getState()
        .state,
  );

async function playNight(page: Page) {
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90_000 });
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/, { timeout: 60_000 });
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("booth-mode")).toContainText("Spotify", { timeout: 15_000 });
  await page.getByTestId("booth-start").click();
  await expect.poll(() => boothState(page), { timeout: 20_000 }).toBe("playing");
}

/** one window of a playing night: rAF callbacks and /me/player reads, per minute */
async function measure(page: Page, sp: ReturnType<typeof spotifyMock>) {
  // past the start's confirmation and settling (every poll runs then, saver or not)
  await page.waitForTimeout(10_000);
  const from = Date.now();
  const raf0 = await page.evaluate(() => (window as unknown as { __raf: number }).__raf);
  await page.waitForTimeout(WINDOW_MS);
  const raf1 = await page.evaluate(() => (window as unknown as { __raf: number }).__raf);
  const to = Date.now();
  const polls = sp.log.filter(
    (x) => x.method === "GET" && x.path === "/me/player" && x.at >= from && x.at < to,
  );
  const scale = 60_000 / (to - from);
  return { rafPerMin: Math.round((raf1 - raf0) * scale), pollsPerMin: Math.round(polls.length * scale) };
}

test.describe("Battery saver", () => {
  test("the Booth playing a night: ≥ 50 % fewer animation frames and polling requests with the saver on", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const runs: Record<string, { rafPerMin: number; pollsPerMin: number; plays: number }> = {};
    for (const mode of ["off", "on"] as const) {
      const ctx = await browser.newContext(IPAD);
      const page = await ctx.newPage();
      const sp = spotifyMock();
      await sp.install(page);
      await prepare(page, mode);
      await playNight(page);
      if (mode === "on") await expect(page.locator("html")).toHaveClass(/power-saver/);
      else await expect(page.locator("html")).not.toHaveClass(/power-saver/);
      const m = await measure(page, sp);
      // the night plays the same: still playing, one play command for the song, the slider moving
      expect(await boothState(page)).toBe("playing");
      const plays = sp.log.filter((x) => x.method === "PUT" && x.path === "/me/player/play").length;
      runs[mode] = { ...m, plays };
      await ctx.close();
    }
    console.log(`battery saver: ${JSON.stringify(runs)}`);
    expect(runs.off!.rafPerMin).toBeGreaterThan(600);
    expect(runs.on!.rafPerMin).toBeLessThanOrEqual(runs.off!.rafPerMin * 0.5);
    expect(runs.off!.pollsPerMin).toBeGreaterThanOrEqual(40);
    expect(runs.on!.pollsPerMin).toBeLessThanOrEqual(runs.off!.pollsPerMin * 0.5);
    expect(runs.on!.plays).toBe(runs.off!.plays);
  });

  test("Settings → General, the More sheet's toggle, the leaf in the status chip, solid glass", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const ctx = await browser.newContext(IPAD);
    const page = await ctx.newPage();
    const sp = spotifyMock();
    await sp.install(page);
    await prepare(page, "off");
    await page.goto("/settings?section=battery");
    const group = page.getByTestId("settings-power");
    await expect(group).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("power-state")).toHaveAttribute("data-active", "0");
    await group.getByRole("radio", { name: "On" }).click();
    await expect(page.getByTestId("power-state")).toHaveAttribute("data-active", "1");
    await expect(page.locator("html")).toHaveClass(/power-saver/);
    expect(await page.evaluate(() => localStorage.getItem("tdj-power"))).toBe("on");
    // no element blurs its backdrop while saving
    const blurred = await page.evaluate(
      () =>
        [...document.querySelectorAll("*")].filter((e) =>
          [null, "::before", "::after"].some((p) => {
            const b = getComputedStyle(e, p).backdropFilter;
            return b && b !== "none";
          }),
        ).length,
    );
    expect(blurred).toBe(0);
    await group.getByRole("radio", { name: "Off" }).click();
    await expect(page.locator("html")).not.toHaveClass(/power-saver/);

    // the Booth: the More sheet turns it on; the status chip shows the leaf
    await playNight(page);
    await expect(page.getByTestId("power-leaf")).toHaveCount(0);
    await page.getByTestId("booth-more").click();
    await page.getByTestId("booth-menu-power").click();
    await expect(page.getByTestId("power-leaf")).toBeVisible();
    await expect(page.locator("html")).toHaveClass(/power-saver/);
    expect(await boothState(page)).toBe("playing");
    await page.getByTestId("booth-more").click();
    await expect(page.getByTestId("booth-menu-power").getByTestId("menu-check")).toBeVisible();
    await page.getByTestId("booth-menu-power").click();
    await expect(page.getByTestId("power-leaf")).toHaveCount(0);
    await ctx.close();
  });
});
