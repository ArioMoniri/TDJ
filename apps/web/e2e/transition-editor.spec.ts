/**
 * 2026-11 — the finished transition editor (docs/design/transition-editor.md): no Beta; a ruler, zoom and snap; the
 * Volume and EQ rows always open and set the curves (a curve adds a fade, an EQ swap makes a Blend); the gap pill
 * edits the gap; a curve's bend knob moves with the keyboard; a Spotify side draws a labelled estimated shape and the
 * editor says what Spotify Connect can do; mid-night with no headphones the audition asks before it plays in the room.
 */
import { type BrowserContextOptions, devices, expect, type Page, test } from "@playwright/test";

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

async function connect(page: Page) {
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
  await page.addInitScript(() =>
    Object.defineProperty(Navigator.prototype, "maxTouchPoints", { get: () => 5 }),
  );
}

async function openBooth(page: Page, o: { spotify?: boolean } = {}) {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
  });
  if (o.spotify) await connect(page);
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
const DESKTOP: BrowserContextOptions = { viewport: { width: 1440, height: 900 } };
const IPAD_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const IPAD: BrowserContextOptions = (() => {
  const { defaultBrowserType: _b, ...rest } = devices["iPad Pro 11 landscape"]!;
  return { ...rest, viewport: { width: 1180, height: 820 }, userAgent: IPAD_SAFARI };
})();

test("clips: real waveforms, a ruler, zoom, snap, Volume / EQ / gap rows that work, a bend knob on the keyboard", async ({
  browser,
}) => {
  const ctx = await browser.newContext(DESKTOP);
  const page = await ctx.newPage();
  await openBooth(page);
  const { ed } = await openEditor(page);
  await expect(ed).not.toContainText("Beta");
  await expect(ed.getByTestId("booth-tr-stage")).toHaveAttribute("data-has-bands", "true", {
    timeout: 20000,
  });
  await expect(ed.getByTestId("booth-tr-lane-out")).toContainText("30 s preview clip");
  await expect(ed.getByTestId("booth-tr-estimated")).toHaveCount(0);
  await expect(ed.getByTestId("booth-tr-plays")).toContainText("play exactly as drawn");
  // the ruler: seconds relative to the transition, 0 included
  await expect(ed.locator(".trx-tick-label.trx-zero")).toHaveCount(1);
  // zoom in narrows the view, fit brings it back
  const stage = ed.getByTestId("booth-tr-stage");
  const v0 = (await stage.getAttribute("data-view"))!;
  const span = (v: string) => {
    const [a, b] = v.split("…").map(Number);
    return b! - a!;
  };
  await ed.getByTestId("booth-tr-zoom-in").click();
  await expect.poll(async () => span((await stage.getAttribute("data-view"))!)).toBeLessThan(span(v0) * 0.6);
  await ed.getByTestId("booth-tr-zoom-fit").click();
  await expect(stage).toHaveAttribute("data-view", v0);
  // Volume opens on a gap: a curve adds a fade (the gap pill appears and edits the gap)
  await ed.getByTestId("booth-tr-preset-gap").click();
  await ed.getByTestId("booth-tr-volume").click();
  await ed.getByTestId("booth-tr-picker-volume-sCurve").click();
  await expect(ed.getByTestId("booth-tr-preset-fade")).toHaveAttribute("aria-checked", "true");
  await expect(ed.getByTestId("booth-tr-volume")).toContainText("S-curve");
  await ed.getByTestId("booth-tr-gap").click();
  await ed.getByTestId("booth-tr-picker-gap-3").click();
  await expect(ed.getByTestId("booth-tr-gap")).toHaveAttribute("data-value", "3");
  await expect(ed.getByTestId("booth-tr-box")).toHaveAttribute("data-in-start", "3");
  // the fade-out's bend knob: ↑ makes it fuller (equal power), the Volume row says the curves differ
  const knob = ed.getByTestId("booth-tr-bend-out");
  await expect(knob).toHaveAttribute("data-curve", "sCurve");
  await knob.focus();
  await page.keyboard.press("ArrowUp");
  await expect(knob).toHaveAttribute("data-curve", "linear");
  await page.keyboard.press("ArrowUp");
  await expect(knob).toHaveAttribute("data-curve", "equalPower");
  await expect(ed.getByTestId("booth-tr-volume")).toContainText("Preset curves");
  // EQ on a fade: a three-band swap makes it a Blend, the lanes draw low / mid / high
  await ed.getByTestId("booth-tr-eq").click();
  await ed.getByTestId("booth-tr-picker-eq-threeBand").click();
  await expect(ed.getByTestId("booth-tr-preset-blend")).toHaveAttribute("aria-checked", "true");
  await expect(ed.getByTestId("booth-tr-eq")).toContainText("Three-band swap");
  for (const id of ["booth-tr-eq-out", "booth-tr-eq-out-mid", "booth-tr-eq-out-high", "booth-tr-eq-in-mid"])
    await expect(ed.getByTestId(id)).toHaveCount(1);
  await expect(ed.getByTestId("booth-tr-overlap")).toHaveCount(1);
  // a blend's own handles: the overlap start (both lanes), the outgoing fade end, the incoming rise end
  await expect(ed.getByTestId("booth-tr-start")).toHaveAttribute("data-lane", "both");
  await expect(ed.getByTestId("booth-tr-out-end")).toHaveAttribute("data-lane", "out");
  await expect(ed.getByTestId("booth-tr-end")).toHaveAttribute("data-lane", "in");
  const out0 = Number(await ed.getByTestId("booth-tr-out-end").getAttribute("aria-valuenow"));
  await ed.getByTestId("booth-tr-out-end").focus();
  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(async () => Number(await ed.getByTestId("booth-tr-out-end").getAttribute("aria-valuenow")))
    .toBeLessThan(out0);
  // Save persists it per pair
  await ed.getByTestId("booth-tr-save").click();
  await expect(ed).toHaveCount(0);
  const saved = await page.evaluate(() => {
    const p = (
      window as unknown as {
        __tdjBooth: {
          getState: () => { playlist: { booth?: { transitions?: Record<string, { eq?: string }> } } };
        };
      }
    ).__tdjBooth.getState().playlist;
    return Object.values(p.booth?.transitions ?? {}).map((x) => x.eq);
  });
  expect(saved).toContain("threeBand");
  await ctx.close();
});

test("Spotify Connect: a labelled estimated shape (never a fake waveform); the editor says only the gap plays", async ({
  browser,
}) => {
  const ctx = await browser.newContext(IPAD);
  const page = await ctx.newPage();
  await openBooth(page, { spotify: true });
  const { ed } = await openEditor(page);
  await expect(ed.getByTestId("booth-tr-est-out")).toHaveCount(1, { timeout: 15000 });
  await expect(ed.getByTestId("booth-tr-est-in")).toHaveCount(1);
  await expect(ed.getByTestId("booth-tr-wave-out")).toHaveCount(0);
  await expect(ed.getByTestId("booth-tr-estimated")).toHaveText(
    "Estimated shape (Spotify audio isn't available to the browser)",
  );
  await expect(ed.getByTestId("booth-tr-lane-out")).toContainText("Estimated shape");
  await expect(ed.getByTestId("booth-tr-plays")).toContainText("only the gap plays");
  await ed.getByTestId("booth-tr-eq").click();
  await expect(ed.getByTestId("booth-tr-picker-eq")).toContainText("Spotify plays one track at a time");
  await ctx.close();
});

test("mid-night with no headphones: Audition asks before it plays in the room, then plays there", async ({
  browser,
}) => {
  const ctx = await browser.newContext(DESKTOP);
  const page = await ctx.newPage();
  await openBooth(page);
  await page.getByTestId("booth-start").click();
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing", { timeout: 20000 });
  const { ed } = await openEditor(page);
  await expect(ed.getByTestId("booth-tr-audition")).toHaveAttribute("data-where", "room");
  await ed.getByTestId("booth-tr-audition").click();
  const ask = ed.getByTestId("booth-tr-picker-room");
  await expect(ask).toBeVisible();
  await expect(ask).toContainText("Play the audition in the room?");
  await ask.getByTestId("booth-tr-picker-room-go").click();
  await expect(ed.getByTestId("booth-tr-audition")).toHaveAttribute("aria-pressed", "true", {
    timeout: 15000,
  });
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing");
  await ed.getByTestId("booth-tr-audition").click();
  await expect(ed.getByTestId("booth-tr-audition")).toHaveAttribute("aria-pressed", "false");
  await ctx.close();
});
