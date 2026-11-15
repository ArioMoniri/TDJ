/**
 * The README clips: each one 6–12 s of one thing a DJ does. Every clip gets its own browser context (2× pixels)
 * and its own Recorder; apps/video draws the cursor, zoom and frame afterwards.
 */
import type { Browser, BrowserContext, Page } from "playwright";
import { installWarp, Recorder } from "./recorder";

export type ClipCtx = { browser: Browser; base: string; raw: string };
type Clip = (c: ClipCtx) => Promise<void>;

const DESKTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 } as const;
const IPAD_LANDSCAPE = {
  viewport: { width: 1180, height: 820 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
  userAgent:
    "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
} as const;
const PHONE = {
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
} as const;

/** no first-run hints, sounds off (they are silent in a capture anyway), the theme asked for */
async function prime(ctx: BrowserContext, theme: "light" | "dark") {
  await ctx.addInitScript((t) => {
    try {
      if (sessionStorage.getItem("tdj-media-primed")) return;
      sessionStorage.setItem("tdj-media-primed", "1");
      const k = "tdj-v1";
      const cur = JSON.parse(localStorage.getItem(k) ?? "{}");
      const state = cur.state ?? {};
      state.settings = { ...(state.settings ?? {}), theme: t, sounds: false };
      localStorage.setItem(k, JSON.stringify({ version: 4, ...cur, state }));
    } catch {}
  }, theme);
}

export async function newCtx(
  browser: Browser,
  device: Record<string, unknown>,
  theme: "light" | "dark" = "light",
): Promise<BrowserContext> {
  const ctx = await browser.newContext({ ...device, colorScheme: theme });
  await prime(ctx, theme);
  await installWarp(ctx);
  return ctx;
}

/** a short sine WAV so the Booth can play without the network (previews are answered locally) */
function wav(sec = 20): Buffer {
  const rate = 22050;
  const n = rate * sec;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const v = Math.sin(2 * Math.PI * 220 * t) * 0.18 + Math.sin(2 * Math.PI * 330 * t) * 0.12;
    data.writeInt16LE(Math.round(v * (0.6 + 0.4 * Math.sin(t * 3)) * 32767), i * 2);
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

/** previews answered locally, and a second output ("AirPods Pro") for the headphones */
export async function offlineAudio(page: Page, outputs = false) {
  if (outputs)
    // a string: tsx would wrap these arrows in an esbuild `__name` helper the page lacks
    await page.addInitScript(`(() => {
      Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", {
        configurable: true,
        value: () => Promise.resolve(),
      });
      const devs = [
        { kind: "audiooutput", deviceId: "default", label: "MacBook Pro Speakers", groupId: "g1" },
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
    })();`);
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
}

export async function openFeatured(page: Page, base: string) {
  await page.goto(`${base}/?featured=golden-double-peak`, { waitUntil: "networkidle" });
  await page.locator("#result").waitFor({ timeout: 120_000 });
  await page.waitForTimeout(1500);
}

async function settle(page: Page, ms = 600) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
}

export const CLIPS: Record<string, Clip> = {
  /** 1. compose a night: one tap, the narrative, the arc and the tandas */
  async compose({ browser, base, raw }) {
    const ctx = await newCtx(browser, DESKTOP);
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "networkidle" });
    await settle(page, 1200);
    const r = new Recorder(page, "compose", raw);
    await r.start();
    await r.wait(500);
    await r.click(page.getByRole("button", { name: /Compose the night/ }).first(), { zoom: 1.35, settle: 0 });
    // the narrative plays for a moment, then the wait for the engine is played back fast
    await r.wait(1200);
    await r.fast(() => page.locator("#result").waitFor({ timeout: 90_000 }), 900);
    r.focus(null);
    await r.wait(1800);
    await r.glide({ x: 760, y: 520 });
    await r.scroll(520, 1400);
    await r.wait(900);
    await r.scroll(560, 1400);
    await r.wait(1400);
    await r.stop();
    await ctx.close();
  },

  /** 2. the Booth: AirPods as the headphones, start the night, pre-listen to a song while the room plays */
  async booth({ browser, base, raw }) {
    const ctx = await newCtx(browser, DESKTOP, "dark");
    const page = await ctx.newPage();
    await offlineAudio(page, true);
    await openFeatured(page, base);
    await page.getByTestId("play-the-night").first().click();
    await page.getByTestId("booth-now-title").waitFor({ timeout: 30_000 });
    await page
      .locator('[data-testid="booth-ttc"]:not([data-resolving="1"])')
      .waitFor({ timeout: 60_000 })
      .catch(() => {});
    await settle(page, 1200);
    const r = new Recorder(page, "booth", raw, { zoom: 1.3 });
    await r.start();
    await r.wait(500);
    await r.click(page.getByTestId("booth-out-cue"));
    const out = page.getByTestId("booth-output-sheet");
    await r.click(out.locator('[data-device="hp"]'), { settle: 500 });
    await page.keyboard.press("Escape");
    await r.wait(400);
    await r.click(page.getByTestId("booth-start"), { settle: 1000 });
    const row = page.locator('.booth-row[data-kind="track"]').nth(6);
    await r.click(row.getByTestId("booth-row-play"), { settle: 600 });
    const pre = page.getByTestId("booth-play-sheet").getByTestId("booth-prelisten");
    await r.click(pre, { settle: 700 });
    await page.keyboard.press("Escape");
    await r.wait(300);
    const line = page.getByTestId("booth-cueline");
    await line.waitFor({ timeout: 10_000 }).catch(() => {});
    r.focus(await r.centre(line), 1.35);
    await r.glide({ x: 820, y: 560 });
    await r.wait(1800);
    r.focus(null);
    await r.wait(1200);
    await r.stop();
    await ctx.close();
  },

  /** 3. Edit with AI without a key: "make tanda 7 calmer" → a checked change with a diff and Undo */
  async "ai-edit"({ browser, base, raw }) {
    const ctx = await newCtx(browser, DESKTOP);
    const page = await ctx.newPage();
    await openFeatured(page, base);
    const input = page.locator("#ai-edit-input");
    await input.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -160));
    await settle(page, 600);
    const r = new Recorder(page, "ai-edit", raw, { zoom: 1.5 });
    await r.start();
    await r.wait(500);
    await r.type(input, "make tanda 7 calmer");
    await r.click(page.getByRole("button", { name: "Make the change" }), { settle: 0 });
    const diff = page.getByTestId("ai-edit-diff");
    await r.fast(() => diff.waitFor({ timeout: 60_000 }), 500);
    await r.wait(300);
    r.focus(await r.centre(diff), 1.3);
    await r.glide(await r.centre(diff));
    await r.wait(2200);
    const undo = page.getByTestId("ai-edit-undo");
    if (await undo.isVisible().catch(() => false)) {
      await r.glide(await r.centre(undo));
      await r.wait(900);
    }
    r.focus(null);
    await r.wait(1000);
    await r.stop();
    await ctx.close();
  },

  /** 4. Rooms: a laptop makes a room, a phone joins by its code, a skip and a move reach the other side */
  async rooms({ browser, base, raw }) {
    const a = await newCtx(browser, DESKTOP);
    const b = await newCtx(browser, PHONE);
    const ana = await a.newPage();
    const ben = await b.newPage();
    await openFeatured(ana, base);
    await ana.goto(`${base}/rooms`, { waitUntil: "networkidle" });
    await ana.getByTestId("room-user").fill("Ana");
    await ben.goto(`${base}/rooms`, { waitUntil: "networkidle" });
    await ben.getByTestId("room-user").fill("Ben");
    await settle(ana, 600);
    const ra = new Recorder(ana, "rooms", raw, { zoom: 1 });
    const rb = new Recorder(ben, "rooms-phone", raw, { kind: "phone", pointer: "touch", zoom: 1 });
    ra.track.pair = "rooms-phone";
    await ra.start();
    await rb.start();
    rb.alignTo(ra);
    await ra.type(ana.getByTestId("room-name"), "Saturday at Galata", { zoom: false });
    await ra.click(ana.locator("#room-create"), { zoom: false, settle: 0 });
    await ra.fast(() => ana.getByTestId("room-tandas").waitFor({ timeout: 30_000 }), 500, [rb]);
    await ra.wait(400);
    await ra.click(ana.getByRole("button", { name: "Invite" }).first(), { zoom: false, settle: 900 });
    const code = (await ana.getByTestId("room-code").innerText()).replace(/\s+/g, "");
    await ana.keyboard.press("Escape");
    await rb.type(ben.getByTestId("room-code-input"), code, { zoom: false });
    await rb.click(ben.getByTestId("room-join"), { zoom: false, settle: 0 });
    await rb.fast(() => ben.getByTestId("room-tandas").waitFor({ timeout: 30_000 }), 500, [ra]);
    await rb.wait(700);
    await rb.click(ben.getByTestId("room-skip-2"), { zoom: false, settle: 0 });
    await ra.fast(
      () =>
        ana
          .locator('[data-testid="room-skip-2"][aria-pressed="true"]')
          .waitFor({ timeout: 15_000 })
          .catch(() => {}),
      400,
      [rb],
    );
    await ra.wait(600);
    await ra.click(ana.getByTestId("room-down-1"), { zoom: false, settle: 0 });
    await rb.fast(() => ben.waitForTimeout(1500), 400, [ra]);
    await ra.wait(500);
    await ra.click(ana.getByRole("radio", { name: /Log/ }), { zoom: false, settle: 1600 });
    await rb.stop();
    await ra.stop();
    await a.close();
    await b.close();
  },

  /** 5. share a night: Export → Share → a QR code another device can open */
  async share({ browser, base, raw }) {
    const ctx = await newCtx(browser, DESKTOP);
    const page = await ctx.newPage();
    await openFeatured(page, base);
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page, 600);
    const r = new Recorder(page, "share", raw, { zoom: 1.3 });
    await r.start();
    await r.wait(500);
    await r.click(page.getByRole("button", { name: "Export" }).first(), { settle: 700 });
    await r.click(page.locator("#export-share"), { settle: 600 });
    const sheet = page.getByTestId("share-sheet");
    await sheet
      .getByTestId("share-copy-link")
      .and(page.locator(":enabled"))
      .waitFor({ timeout: 20_000 })
      .catch(() => {});
    await r.click(sheet.getByTestId("share-show-code"), { settle: 0 });
    const qr = sheet.getByTestId("qr-code");
    await r.fast(() => qr.waitFor({ timeout: 20_000 }), 400);
    await r.wait(200);
    r.focus(await r.centre(qr), 1.45);
    await r.glide({ x: (await r.centre(qr)).x + 180, y: (await r.centre(qr)).y + 60 });
    await r.wait(2200);
    r.focus(null);
    await r.wait(900);
    await r.stop();
    await ctx.close();
  },

  /** 6. the iPad in landscape: the sidebar, the night, then the Booth, by touch */
  async ipad({ browser, base, raw }) {
    const ctx = await newCtx(browser, IPAD_LANDSCAPE);
    const page = await ctx.newPage();
    await offlineAudio(page);
    await openFeatured(page, base);
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page, 600);
    const r = new Recorder(page, "ipad", raw, { kind: "tablet", pointer: "touch", zoom: 1.25 });
    await r.start();
    await r.wait(700);
    await r.glide({ x: 760, y: 560 });
    await r.scroll(620, 1500);
    await r.wait(700);
    await r.scroll(520, 1300);
    await r.wait(600);
    const booth = page.getByRole("link", { name: "Booth" }).first();
    await r.click(booth, { settle: 0 });
    await r.fast(() => page.getByTestId("booth-now-title").waitFor({ timeout: 30_000 }), 500);
    r.focus(null);
    await r.wait(2200);
    await r.stop();
    await ctx.close();
  },

  /** 7. dark mode: Settings → Theme → Dark, then the night in the dark */
  async dark({ browser, base, raw }) {
    const ctx = await newCtx(browser, DESKTOP);
    const page = await ctx.newPage();
    await openFeatured(page, base);
    await page.goto(`${base}/settings`, { waitUntil: "networkidle" });
    await settle(page, 800);
    const r = new Recorder(page, "dark", raw, { zoom: 1.4 });
    await r.start();
    await r.wait(500);
    await r.click(page.getByRole("radio", { name: "Dark" }).first(), { settle: 1100 });
    r.focus(null);
    await r.click(page.getByRole("link", { name: "Compose" }).first(), { zoom: false, settle: 0 });
    await r.fast(() => page.locator("#result").waitFor({ timeout: 30_000 }), 500);
    await r.wait(900);
    await r.glide({ x: 780, y: 520 });
    await r.scroll(700, 1600);
    await r.wait(1500);
    await r.stop();
    await ctx.close();
  },
};
