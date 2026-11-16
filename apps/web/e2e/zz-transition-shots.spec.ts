/**
 * Screenshots of the transition editor (not a check): `TDJ_SHOTS=<dir>` — iPad landscape, iPhone, desktop; light and
 * dark; 30 s clips (real waveforms) and Spotify Connect (no audio: the estimated shape). Skipped without TDJ_SHOTS.
 */
import { type BrowserContextOptions, devices, expect, type Page, test } from "@playwright/test";

const SHOTS = process.env.TDJ_SHOTS;
const PRESET = process.env.TDJ_SHOT_PRESET ?? "blend";

function wav(sec = 30): Buffer {
  const rate = 22050;
  const n = rate * sec;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const beat = t % 0.7;
    const kick = Math.exp(-beat * 14) * Math.sin(2 * Math.PI * 60 * t) * 0.55;
    const mid = (0.18 + 0.14 * Math.abs(Math.sin(2 * Math.PI * 0.23 * t))) * Math.sin(2 * Math.PI * 440 * t);
    const hiss = (Math.random() * 2 - 1) * 0.06 * Math.exp(-((t * 2.8) % 1) * 5);
    const env = t < 0.6 ? 0 : Math.min(1, (t - 0.6) * 3);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, (kick + mid + hiss) * env)) * 32000), i * 2);
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

async function spotify(page: Page) {
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
    const path = new URL(r.request().url()).pathname.replace("/v1", "");
    if (path === "/me/player/devices")
      return r.fulfill({
        json: {
          devices: [
            {
              id: "ipad",
              name: "iPad",
              type: "Tablet",
              is_active: true,
              supports_volume: true,
              volume_percent: 80,
            },
          ],
        },
      });
    return r.fulfill({ status: 204, body: "" });
  });
}

async function open(page: Page, o: { spotify: boolean; theme: "light" | "dark" }) {
  await page.addInitScript((theme) => {
    try {
      localStorage.setItem("tdj-booth-theme", theme);
      localStorage.setItem("tdj-theme", theme);
    } catch {}
    Object.defineProperty(Navigator.prototype, "maxTouchPoints", { get: () => 5 });
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
  }, o.theme);
  if (o.spotify) await spotify(page);
  await page.route(/dzcdn\.net|p\.scdn\.co|preview\.test|\/api\/preview\?/, (route) =>
    o.spotify
      ? route.fulfill({ status: 404 })
      : route.request().url().includes("json=1")
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

const IPAD: BrowserContextOptions = {
  viewport: { width: 1194, height: 834 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};
const { defaultBrowserType: _b, ...iphoneRest } = devices["iPhone 15 Pro"]!;
const IPHONE: BrowserContextOptions = {
  ...iphoneRest,
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
};
const DESKTOP: BrowserContextOptions = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };

const CASES: Array<[string, BrowserContextOptions, boolean]> = [
  ["ipad", IPAD, false],
  ["iphone", IPHONE, true],
  ["desktop", DESKTOP, false],
];
for (const [dev, use, phone] of CASES)
  for (const theme of ["dark", "light"] as const)
    for (const src of ["clips", "spotify"] as const)
      test(`${dev} ${theme} ${src}`, async ({ browser }) => {
        test.skip(!SHOTS, "TDJ_SHOTS not set");
        const ctx = await browser.newContext({ ...use, colorScheme: theme });
        const page = await ctx.newPage();
        await open(page, { spotify: src === "spotify", theme });
        if (phone) await page.getByTestId("booth-set-open").click();
        const scope = phone ? page.getByTestId("booth-set-sheet") : page;
        // the first track followed by a track (tanda 1, songs 1 → 2)
        const i = Number(
          await scope.locator('.booth-row[data-kind="track"]').first().getAttribute("data-plan-index"),
        );
        const marker = scope.locator(`[data-testid="booth-gap"][data-from="${i}"]`);
        await marker.scrollIntoViewIfNeeded();
        await marker.click();
        const ed = page.getByTestId("booth-transition-sheet");
        await expect(ed).toBeVisible();
        const preset = ed.getByTestId(`booth-tr-preset-${PRESET}`);
        if (await preset.count()) await preset.click();
        if (src === "clips")
          await expect(ed.getByTestId("booth-tr-stage")).toHaveAttribute("data-has-bands", "true", {
            timeout: 20000,
          });
        await page.evaluate(() => {
          document.querySelector(".trx-scroll")?.scrollTo(0, 0);
          for (const el of document.querySelectorAll<HTMLElement>("nextjs-portal")) el.style.display = "none";
        });
        await page.waitForTimeout(800);
        await page.screenshot({ path: `${SHOTS}/${dev}-${theme}-${src}.png` });
        await ctx.close();
      });
