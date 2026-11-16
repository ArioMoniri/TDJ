/**
 * 2026-11 (the owner: "notifications and plug-outs and opening other apps and notification sounds should not disrupt
 * playing … should be able to see those settings, also if traceable, the connection and chain, and set them").
 * - Settings → Booth → Audio lists every output with its kind, channels, rate and latency, ROOM / HEADPHONES, the chain
 *   line, a DJ controller's channel pairs, and Before the night.
 * - The Booth's ROOM sheet shows the chain and its warnings (Bluetooth in the room).
 * - The room's output unplugged mid-night holds the song and offers Resume (never on into the laptop speakers).
 * - A call (the native app's interruption event) holds the night; its end with shouldResume plays on by itself.
 * Platform APIs are faked: enumerateDevices / devicechange, setSinkId, a 4-channel destination.
 * Screenshots go to $OUTPUT_SHOTS when it is set.
 */
import { expect, type Page, test } from "@playwright/test";

const SHOTS = process.env.OUTPUT_SHOTS;

function wav(sec = 20): Buffer {
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

/**
 * A DJ's desk: the system default is a 4-channel DDJ-400 (USB), AirPods and the MacBook speakers are there too.
 * `window.__unplug()` removes the DDJ (the default falls back to the speakers) and fires `devicechange`.
 */
async function fakeDesk(page: Page, o: { channels?: number } = {}) {
  await page.addInitScript((channels) => {
    const w = window as unknown as { __unplug: () => void; __sinks: string[] };
    w.__sinks = [];
    let devs = [
      { kind: "audiooutput", deviceId: "default", label: "Default - DDJ-400", groupId: "g-ddj" },
      { kind: "audiooutput", deviceId: "ddj", label: "DDJ-400", groupId: "g-ddj" },
      { kind: "audiooutput", deviceId: "pods", label: "AirPods Pro", groupId: "g-pods" },
      { kind: "audiooutput", deviceId: "mac", label: "MacBook Pro Speakers", groupId: "g-mac" },
    ];
    const listeners: Array<() => void> = [];
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: () => Promise.resolve(devs.map((d) => ({ ...d, toJSON: () => d }))),
        getUserMedia: () => Promise.reject(new Error("no")),
        addEventListener: (t: string, cb: () => void) => t === "devicechange" && listeners.push(cb),
        removeEventListener() {},
      },
    });
    w.__unplug = () => {
      devs = [
        {
          kind: "audiooutput",
          deviceId: "default",
          label: "Default - MacBook Pro Speakers",
          groupId: "g-mac",
        },
        { kind: "audiooutput", deviceId: "pods", label: "AirPods Pro", groupId: "g-pods" },
        { kind: "audiooutput", deviceId: "mac", label: "MacBook Pro Speakers", groupId: "g-mac" },
      ];
      for (const cb of listeners) cb();
    };
    for (const proto of [HTMLMediaElement.prototype, AudioContext.prototype])
      Object.defineProperty(proto, "setSinkId", {
        configurable: true,
        value(id: string) {
          w.__sinks.push(id);
          return Promise.resolve();
        },
      });
    // the controller's 4 output channels (headless Chromium opens 2): the destination reports and keeps 4
    const counts = new WeakMap<object, number>();
    Object.defineProperty(AudioDestinationNode.prototype, "maxChannelCount", {
      configurable: true,
      get: () => channels,
    });
    const desc = Object.getOwnPropertyDescriptor(AudioNode.prototype, "channelCount")!;
    Object.defineProperty(AudioDestinationNode.prototype, "channelCount", {
      configurable: true,
      get() {
        return counts.get(this) ?? desc.get!.call(this);
      },
      set(v: number) {
        counts.set(this, v);
        if (v <= 2) desc.set!.call(this, v);
      },
    });
  }, o.channels ?? 4);
}

async function routes(page: Page) {
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

async function openBooth(page: Page) {
  await routes(page);
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
  await page.getByTestId("play-the-night").first().click();
  // (a dev server compiles the Booth on its first visit)
  await expect(page).toHaveURL(/\/booth/, { timeout: 60000 });
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("booth-ttc")).not.toHaveAttribute("data-resolving", "1", { timeout: 30000 });
}

test("Settings → Booth → Audio: every output with its connection, the chain, a controller's pairs, Before the night", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await fakeDesk(page);
  await page.goto("/settings");
  const audio = page.getByTestId("settings-booth-audio");
  const row = (id: string) => audio.locator(`[data-testid="booth-output-info"][data-device="${id}"]`);
  // (the outputs are listed once the page has asked the browser)
  await expect(row("pods")).toBeVisible({ timeout: 20000 });
  await audio.scrollIntoViewIfNeeded();
  await expect(row("default")).toHaveAttribute("data-kind", "usb");
  await expect(row("default")).toHaveAttribute("data-roles", "room");
  await expect(row("default").getByTestId("booth-output-facts")).toContainText("USB / USB-C · 4 ch");
  await expect(row("pods")).toHaveAttribute("data-kind", "bluetooth");
  await expect(row("pods").getByTestId("booth-output-facts")).toHaveText("Bluetooth · ~200 ms");
  await expect(row("mac")).toHaveAttribute("data-kind", "built-in");
  const chain = page.getByTestId("booth-chain").first();
  await expect(chain).toContainText("T-DJ → This device (DDJ-400) (USB / USB-C, 4 ch) → ROOM");
  // the controller's ch 3–4 carry the headphones
  await page.getByRole("radio", { name: "ch 3–4" }).first().click();
  await expect(chain).toContainText("ch 1–2 ROOM · ch 3–4 HEADPHONES");
  await expect(row("default")).toHaveAttribute("data-roles", "room cue");
  // the disconnect choice and Before the night
  await expect(page.getByRole("radio", { name: "Pause and ask" })).toHaveAttribute("aria-checked", "true");
  const before = page.getByTestId("booth-before-night");
  await expect(before.locator('[data-id="focus"]')).toContainText("Do Not Disturb");
  await expect(before.locator('[data-id="bluetooth"]')).toHaveAttribute("data-status", "ok");
  if (SHOTS) {
    await audio.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/settings-audio.png`, fullPage: false });
    await before.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/settings-before-night.png` });
  }
});

test("the Booth's ROOM sheet: the chain line, a Bluetooth room warned", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await fakeDesk(page, { channels: 2 });
  await openBooth(page);
  await page.getByTestId("booth-out-room").click();
  const sheet = page.getByTestId("booth-output-sheet");
  await expect(sheet.getByTestId("booth-chain")).toContainText("→ ROOM");
  await sheet.locator('[data-testid="booth-output"][data-device="pods"]').click();
  await expect(sheet.getByTestId("booth-chain")).toContainText("AirPods Pro (Bluetooth, ~200 ms) → ROOM");
  await expect(sheet.locator('[data-testid="booth-chain-warn"][data-id="bt-room"]')).toContainText("200 ms");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/booth-room-sheet-bluetooth.png` });
});

test("the room's output unplugged mid-night: the song holds where it was, one tap resumes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await fakeDesk(page, { channels: 2 });
  await openBooth(page);
  await page.getByTestId("booth-start").click();
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing", { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => (window as unknown as { __unplug: () => void }).__unplug());
  const banner = page.locator('.booth-banner[data-key="guard"]');
  await expect(banner).toContainText(/DDJ-400 disconnected: paused at .+ · \d:\d\d/);
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "paused");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/booth-output-lost.png` });
  await banner.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing", { timeout: 10000 });
  await expect(banner).toHaveCount(0);
});

test("a call (the app's interruption event): held, and played on when it ends with shouldResume", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await fakeDesk(page, { channels: 2 });
  await openBooth(page);
  await page.getByTestId("booth-start").click();
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing", { timeout: 20000 });
  const fire = (detail: unknown) =>
    page.evaluate((d) => window.dispatchEvent(new CustomEvent("tdj:audio", { detail: d })), detail);
  await fire({ type: "interruption", phase: "began" });
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "paused");
  await expect(page.locator('.booth-banner[data-key="guard"]')).toContainText("interrupted");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/booth-interrupted.png` });
  await fire({ type: "interruption", phase: "ended", shouldResume: true });
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing", { timeout: 10000 });
  await expect(page.locator('.booth-banner[data-key="guard"]')).toHaveCount(0);
});
