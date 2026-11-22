/**
 * 2026-11 — "YouTube, Spotify or other apps should work seamlessly": the Booth plays the videos the YouTube export
 * matched in YouTube's own (visible) player, and Settings / Set-up say what can play on this device. YouTube's
 * IFrame API is faked (no network): a player that reports PLAYING after each load.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";

const featured = JSON.parse(
  readFileSync(join(__dirname, "../public/featured/golden-double-peak.json"), "utf8"),
) as {
  opening?: { id: string } | null;
  closing?: { id: string } | null;
  tandas: Array<{ songs: Array<{ id: string }>; cortina?: { id: string } | null }>;
};
const ids = [
  featured.opening?.id,
  ...featured.tandas.flatMap((t) => [...t.songs.map((s) => s.id), t.cortina?.id]),
  featured.closing?.id,
].filter((x): x is string => !!x);
const MATCHES = Object.fromEntries(ids.map((id, i) => [id, `vid${String(i).padStart(8, "0")}`]));

const FAKE_YT = `
window.__yt = { loads: [], vols: [] };
window.YT = { Player: class {
  constructor(el, o) { this.o = o; const f = document.createElement("div"); f.dataset.fakeYoutube = "1";
    f.style.cssText = "width:100%;height:100%"; el.replaceWith(f); setTimeout(() => o.events.onReady({ target: this }), 0); }
  loadVideoById(v) { window.__yt.loads.push(v.videoId); setTimeout(() => this.o.events.onStateChange({ data: 1 }), 20); }
  playVideo() {} pauseVideo() {} setVolume(v) { window.__yt.vols.push(v); }
  getCurrentTime() { return 0; } getDuration() { return 180; }
} };
window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady();
`;

async function setup(page: Page, matches: Record<string, string> | null) {
  await page.addInitScript((m) => {
    try {
      if (m) localStorage.setItem("tdj-youtube-matches", JSON.stringify(m));
      else localStorage.removeItem("tdj-youtube-matches");
    } catch {}
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
  }, matches);
  await page.route("https://www.youtube.com/iframe_api", (r) =>
    r.fulfill({ status: 200, contentType: "text/javascript", body: FAKE_YT }),
  );
  await page.route(/open\.spotify\.com\/oembed/, (r) => r.fulfill({ status: 404, body: "" }));
  await page.route(/dzcdn\.net|p\.scdn\.co|\/api\/preview\?/, (r) => r.fulfill({ status: 404, body: "" }));
}

test("Settings → On this device lists every source with a line, and YouTube says how to get it", async ({
  page,
}) => {
  await setup(page, null);
  await page.goto("/settings?section=booth");
  const g = page.getByTestId("booth-device-sources");
  await expect(g).toBeVisible({ timeout: 30000 });
  const rows = g.getByTestId("booth-device-source");
  await expect(rows).toHaveCount(4);
  await expect(g.locator('[data-kind="youtube"]')).toHaveAttribute("data-ok", "0");
  await expect(g.locator('[data-kind="youtube"]')).toContainText("Export → YouTube");
  await expect(g.locator('[data-kind="preview"]')).toHaveAttribute("data-ok", "1");
});

test("the Booth plays the night from YouTube's matched videos in a visible player", async ({ page }) => {
  await setup(page, MATCHES);
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/, { timeout: 60000 });
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 30000 });
  await page.getByTestId("booth-more").click();
  await page.getByRole("menuitem", { name: /Set-up/ }).click();
  const row = page.getByTestId("booth-source-youtube");
  await expect(row).not.toHaveAttribute("aria-disabled", "true", { timeout: 15000 });
  await expect(page.getByTestId("booth-device-sources").locator('[data-kind="youtube"]')).toHaveAttribute(
    "data-ok",
    "1",
  );
  await row.click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __tdjBooth: { getState: () => { sources: string[] } } }).__tdjBooth
            .getState()
            .sources.filter((s) => s === "youtube").length,
      ),
    )
    .toBeGreaterThan(20);
  await page.keyboard.press("Escape");
  await page.getByTestId("booth-start").click();
  await expect(page.getByTestId("booth-youtube-dock")).toBeVisible({ timeout: 20000 });
  const box = await page.getByTestId("booth-youtube-dock").boundingBox();
  // YouTube's terms: the player stays visible, at least 200 px high
  expect(box!.height).toBeGreaterThanOrEqual(200);
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __yt?: { loads: string[] } }).__yt?.loads[0] ?? null),
    )
    .not.toBeNull();
  const first = await page.evaluate(() => (window as unknown as { __yt: { loads: string[] } }).__yt.loads[0]);
  expect(Object.values(MATCHES)).toContain(first);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __tdjBooth: { getState: () => { state: string } } }).__tdjBooth.getState()
            .state,
      ),
    )
    .toBe("playing");
});
