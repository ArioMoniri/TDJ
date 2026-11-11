/**
 * Round 18 (docs/specs/round18-booth.md): Play the night matches Spotify and fits every screen.
 * - the booth's lengths are the featured night's checked Spotify recordings; every row links that recording
 * - a rehearsal never plays a clip of another recording, and says which items it cannot rehearse
 * - logged into Spotify, the adapter plays exactly the stored uri (no search)
 * - phone: no horizontal overflow, the Start pill fits, nothing scrolls the Now card under the header, the strip
 *   never covers the end of the set; 1440: Time right under Now, the faders inside the strip
 */
import { expect, type Page, test } from "@playwright/test";

interface Side {
  id: string;
  title: string;
  rhythm?: string;
  spotify?: { uri: string; url?: string; durationMs?: number; previewUrl?: string } | null;
  resolved?: { durationMs?: number } | null;
}
interface Night {
  opening?: Side | null;
  closing?: Side | null;
  tandas: Array<{ songs: Side[]; cortina?: Side | null }>;
}
interface PlanItem {
  kind: string;
  id?: string;
  title: string;
  lengthSec: number;
}

/** every side and cortina in plan order */
function sides(n: Night): Side[] {
  const out: Side[] = [];
  if (n.opening) out.push(n.opening);
  for (const t of n.tandas) {
    out.push(...t.songs);
    if (t.cortina) out.push(t.cortina);
  }
  if (n.closing) out.push(n.closing);
  return out;
}

async function openFeaturedBooth(page: Page) {
  // no audio leaves the test: the clips are blocked (the plan and the sources do not need them)
  await page.route(/dzcdn\.net|p\.scdn\.co/, (r) => r.abort());
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/);
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("booth-ttc")).not.toHaveAttribute("data-resolving", "1", { timeout: 30000 });
  const night = (await (await page.request.get("/featured/golden-double-peak.json")).json()) as Night;
  const plan = (await page.evaluate(
    () => (window as unknown as { __tdjBoothPlan: { items: PlanItem[] } }).__tdjBoothPlan,
  )) as { items: PlanItem[] };
  return { night, plan };
}

test("the booth's lengths are the featured night's Spotify recordings, and every row links it", async ({
  page,
}) => {
  const { night, plan } = await openFeaturedBooth(page);
  const all = sides(night);
  expect(plan.items.length).toBe(all.length);
  let checked = 0;
  plan.items.forEach((it, i) => {
    const s = all[i]!;
    expect(it.id).toBe(s.id);
    if (it.kind === "cortina" || !s.spotify?.durationMs) return;
    expect(it.lengthSec, s.title).toBeCloseTo(s.spotify.durationMs / 1000, 2);
    checked++;
  });
  expect(checked).toBe(plan.items.filter((x) => x.kind !== "cortina").length);
  // the closing is the night's La Cumparsita (it printed "?" with no source before round 18)
  await expect(page.locator("[data-plan-index]").last().locator(".booth-row-title")).toHaveText(
    "La Cumparsita",
  );
  // Pensalo Bien: 2:16 (Spotify's 136.9 s transfer), not the catalogue's 2:30
  const pb = page.locator("[data-plan-index]", { hasText: "Pensalo Bien" });
  await expect(pb.getByTestId("booth-row-len")).toHaveText("2:16");
  // every row with a Spotify match links that exact recording (≥ 44 px target)
  const links = await page.locator('[data-testid="booth-spotify-link"]').evaluateAll((as) =>
    as.map((a) => {
      const r = a.getBoundingClientRect();
      return { href: a.getAttribute("href"), w: r.width, h: r.height };
    }),
  );
  const urls = new Set(all.map((s) => s.spotify?.url).filter(Boolean));
  expect(links.length).toBeGreaterThan(90);
  for (const l of links) {
    expect(urls.has(l.href!)).toBe(true);
    expect(l.w).toBeGreaterThanOrEqual(44);
    expect(l.h).toBeGreaterThanOrEqual(44);
  }
  // the rehearsal: never a clip of another recording; what it cannot rehearse is named with the reason
  await expect(page.getByTestId("booth-skipped")).toContainText(
    "1 not rehearsable: no clip of the Spotify recording",
  );
  const missing = await page
    .locator('[data-plan-index][data-source="missing"] .booth-row-title')
    .allTextContents();
  expect(missing.map((t) => t.trim())).toEqual(["Milongueando en el 40"]);
  // the Time card names the full night on Spotify beside the 30 s rehearsal
  const full = Number(await page.getByTestId("booth-full-night").getAttribute("data-remaining"));
  const sum = plan.items.reduce((a, it) => a + it.lengthSec, 0);
  expect(full).toBeGreaterThan(sum);
  expect(full).toBeLessThan(sum + plan.items.length * 6.5);
});

test("logged into Spotify Premium, the booth plays exactly the stored uri (one play call, no search)", async ({
  page,
}) => {
  const api: Array<{ url: string; method: string; body: string | null }> = [];
  await page.route("**/api/spotify/me", (r) =>
    r.fulfill({ json: { user: { id: "e2e", display_name: "E2E", product: "premium" } } }),
  );
  await page.route("**/api/spotify/access", (r) => r.fulfill({ json: { access: "e2e-token" } }));
  await page.route("https://sdk.scdn.co/spotify-player.js", (r) =>
    r.fulfill({
      contentType: "application/javascript",
      body: `window.Spotify = { Player: class {
        constructor(o) { this.l = {}; }
        connect() { setTimeout(() => this.l.ready && this.l.ready({ device_id: "e2e-device" }), 10); return Promise.resolve(true); }
        disconnect() {}
        addListener(e, cb) { this.l[e] = cb; }
        getCurrentState() { return Promise.resolve(null); }
        setVolume() { return Promise.resolve(); }
        pause() { return Promise.resolve(); }
        resume() { return Promise.resolve(); }
      } };
      window.onSpotifyWebPlaybackSDKReady && window.onSpotifyWebPlaybackSDKReady();`,
    }),
  );
  await page.route("https://api.spotify.com/**", (r) => {
    api.push({ url: r.request().url(), method: r.request().method(), body: r.request().postData() });
    return r.fulfill({ status: 204 });
  });
  const { night } = await openFeaturedBooth(page);
  // without a folder, Premium is the source of every item with a Spotify id
  await expect(page.locator('[data-plan-index][data-source="spotify"]').first()).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByTestId("booth-start")).toHaveText("Start · Spotify");
  await page.getByTestId("booth-start").click();
  await expect
    .poll(() => api.filter((c) => c.url.includes("/me/player/play")).length, { timeout: 20000 })
    .toBe(1);
  const play = api.find((c) => c.url.includes("/me/player/play"))!;
  expect(play.method).toBe("PUT");
  expect(play.url).toBe("https://api.spotify.com/v1/me/player/play?device_id=e2e-device");
  const first = sides(night)[0]!;
  expect(JSON.parse(play.body!).uris).toEqual([first.spotify!.uri]);
  // nothing else: no search, no track lookup, no re-match
  for (const c of api)
    expect(c.url).toMatch(/^https:\/\/api\.spotify\.com\/v1\/me\/player(\/play\?device_id=e2e-device)?$/);
  await page.keyboard.down("Escape");
  await page.waitForTimeout(700);
  await page.keyboard.up("Escape");
});

test.describe("phone 390 × 844", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("no overflow, the Start pill fits, the Now card stays under the title, the strip never covers the set", async ({
    page,
  }) => {
    await openFeaturedBooth(page);
    await page.waitForTimeout(800);
    const m = await page.evaluate(() => {
      const box = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      const start = box('[data-testid="booth-start"]');
      const label = document.querySelector<HTMLElement>(".booth-start-label")!;
      return {
        scrollY: window.scrollY,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        start: { left: start.left, right: start.right },
        labelCut: label.scrollWidth > label.clientWidth + 1,
        nowTop: box('[data-testid="booth-now"]').top,
        title: box('[data-testid="page-title"]').bottom,
        collapsed: document.querySelector('[data-testid="collapsed-bar"]')?.hasAttribute("data-collapsed"),
      };
    });
    // the set column used to scroll the window to the playhead, which slid the Now card under the glass bar
    expect(m.scrollY).toBe(0);
    expect(m.collapsed).toBe(false);
    expect(m.nowTop).toBeGreaterThan(m.title);
    expect(m.overflow).toBe(0);
    expect(m.start.left).toBeGreaterThanOrEqual(0);
    expect(m.start.right).toBeLessThanOrEqual(390);
    expect(m.labelCut).toBe(false);
    await expect(page.getByTestId("booth-start")).toHaveText("Start · 30 s clips");
    // at the foot of the page the last row of the set clears the strip, and the tab bar stays whole
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(600);
    const foot = await page.evaluate(() => {
      const rows = document.querySelectorAll("[data-plan-index]");
      const last = rows[rows.length - 1]!.getBoundingClientRect();
      const strip = document.querySelector('[data-testid="booth-strip"]')!.getBoundingClientRect();
      const nav = document.querySelector('nav[aria-label="Primary mobile"]')!;
      return { lastBottom: last.bottom, stripTop: strip.top, navMin: nav.hasAttribute("data-min") };
    });
    expect(foot.lastBottom).toBeLessThanOrEqual(foot.stripTop);
    expect(foot.navMin).toBe(false);
  });
});

test("1440 × 900: Time right under Now, the faders inside the strip, every row's length in one column", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFeaturedBooth(page);
  // (the strip re-lays out once while the sources settle: wait for the page to be still)
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    )
    .toBe(0);
  const m = await page.evaluate(() => {
    const box = (s: string) => document.querySelector(s)!.getBoundingClientRect();
    const strip = box('[data-testid="booth-strip"]');
    const faders = [...document.querySelectorAll('[data-testid="booth-strip"] input[type="range"]')].map(
      (e) => e.getBoundingClientRect(),
    );
    const lens = [...document.querySelectorAll('[data-testid="booth-row-len"]')]
      .slice(0, 30)
      .map((e) => Math.round(e.getBoundingClientRect().right));
    return {
      gap: box('[data-testid="booth-time"]').top - box('[data-testid="booth-now"]').bottom,
      stripH: strip.height,
      fadersInside: faders.every((f) => f.top >= strip.top - 0.5 && f.bottom <= strip.bottom + 0.5),
      lens: new Set(lens).size,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(m.gap).toBeLessThanOrEqual(16);
  expect(m.stripH).toBeLessThanOrEqual(72);
  expect(m.fadersInside).toBe(true);
  expect(m.lens).toBe(1);
  expect(m.overflow).toBe(0);
});
