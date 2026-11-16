/**
 * 2026-11 (the owner, live at a milonga: "when coming from other tabs to booth while booth is playing, booth becomes
 * paused music"). Navigation never touches the room: Booth → another page → Booth, by the sidebar, the phone's tab
 * bar, the mini player's cover, Leave the booth and browser back / forward, a few times quickly. Through all of it
 * the night keeps playing, its position keeps advancing, the room's media elements never fire `pause` and the
 * AudioContext is never suspended.
 */
import { expect, type Page, test } from "@playwright/test";

/** 30 s mono 22.05 kHz WAV, a 220 Hz tone (every clip serves it). */
function syntheticWav(sec = 30): Buffer {
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
const WAV = syntheticWav();

type Probe = {
  states: string[];
  pauses: string[];
  suspends: number;
  /** the scheduled next song was taken back (it then has to be prepared again, and comes late or not at all) */
  cancels: number;
};

async function openBooth(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
    // the probe: every pause of a media element (the keep-alive, a room output's sink), every context suspend,
    // and every state the Booth's store passes through once the night runs
    const w = window as unknown as {
      __navProbe: { states: string[]; pauses: string[]; suspends: number; cancels: number };
    };
    w.__navProbe = { states: [], pauses: [], suspends: 0, cancels: 0 };
    document.addEventListener(
      "pause",
      (e) => {
        const el = e.target as HTMLMediaElement;
        // the preview mini player is not the room
        if (el.closest?.("[data-testid='mini-player']")) return;
        w.__navProbe.pauses.push(el.dataset?.testid || el.src?.slice(0, 40) || el.tagName);
      },
      true,
    );
    const Ctx = window.AudioContext;
    if (Ctx) {
      const suspend = Ctx.prototype.suspend;
      Ctx.prototype.suspend = function (this: AudioContext) {
        w.__navProbe.suspends++;
        return suspend.call(this);
      };
    }
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
  const fresh = page.getByTestId("booth-resume").getByRole("button", { name: "Start from the beginning" });
  if (await fresh.isVisible().catch(() => false)) await fresh.click();
  await page.getByTestId("booth-start").click();
  await expect.poll(() => state(page), { timeout: 20000 }).toBe("playing");
  // from here on, every state the store passes through is recorded
  await page.evaluate(() => {
    const w = window as unknown as {
      __navProbe: Probe;
      __tdjBooth: { subscribe(cb: (s: { state: string }) => void): () => void };
      __tdjBoothEngine: () => { queued: unknown; cancelQueued(): void };
    };
    // the engine's scheduled next song: nothing in these tests may take it back (no edit, no skip, no transport)
    const e = w.__tdjBoothEngine();
    const cancel = e.cancelQueued.bind(e);
    e.cancelQueued = () => {
      if (e.queued) w.__navProbe.cancels++;
      cancel();
    };
    let last = "playing";
    w.__tdjBooth.subscribe((s) => {
      if (s.state !== last) w.__navProbe.states.push(s.state);
      last = s.state;
    });
    w.__navProbe.pauses.length = 0;
    w.__navProbe.suspends = 0;
  });
}

const state = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __tdjBooth?: { getState(): { state: string } } }).__tdjBooth?.getState().state,
  );
/** the night's clock: the current item and the engine's own position in it */
const clock = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as {
      __tdjBooth: { getState(): { planIndex: number } };
      __tdjBoothEngine: () => { position(): number; planIndex: number } | null;
    };
    const e = w.__tdjBoothEngine();
    return { i: e?.planIndex ?? w.__tdjBooth.getState().planIndex, pos: e?.position() ?? -1 };
  });
const probe = (page: Page) => page.evaluate(() => (window as unknown as { __navProbe: Probe }).__navProbe);

/** Still playing, the position moved on since `before`, and nothing paused the room. */
async function stillPlaying(page: Page, before: { i: number; pos: number }, where: string) {
  await expect(page).toHaveURL(/\/booth/);
  await expect(page.getByTestId("booth")).toBeVisible();
  // let a mount effect (boot, a re-arm, a focus) land before judging
  await page.waitForTimeout(700);
  expect(["playing", "cortina"], where).toContain(await state(page));
  const after = await clock(page);
  expect(after.i > before.i || after.pos > before.pos + 0.3, `${where}: the position advanced`).toBe(true);
  const p = await probe(page);
  expect(
    p.states.filter((s) => s !== "playing" && s !== "cortina"),
    `${where}: store states`,
  ).toEqual([]);
  expect(p.pauses, `${where}: pause events`).toEqual([]);
  expect(p.suspends, `${where}: context suspends`).toBe(0);
  expect(p.cancels, `${where}: the scheduled next song was taken back`).toBe(0);
  const late = await page.evaluate(() => {
    const e = (
      window as unknown as { __tdjBoothEngine: () => { log: Array<{ reason?: string }> } }
    ).__tdjBoothEngine();
    return e.log.filter((x) => x.reason === "late").length;
  });
  expect(late, `${where}: a song started late`).toBe(0);
  await expect(page.getByTestId("booth-pause")).toBeVisible();
}

test("desktop: sidebar and browser back / forward between the Booth and the other pages keep the room playing", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooth(page);
  const side = (href: string) => page.getByTestId("sidebar").locator(`a.side-row[href="${href}"]`).first();
  for (let round = 0; round < 3; round++) {
    for (const href of ["/library", "/", "/database"]) {
      const before = await clock(page);
      await side(href).click();
      await expect(page).toHaveURL(new RegExp(href === "/" ? "/(\\?.*)?$" : href));
      await expect(page.getByTestId("booth-mini")).toBeVisible({ timeout: 10000 });
      expect(["playing", "cortina"]).toContain(await state(page));
      // back to the Booth: the sidebar, then the mini player's cover alternately
      if (round % 2 === 0) await page.getByTestId("booth-mini-back").click();
      else await side("/booth").click();
      await stillPlaying(page, before, `round ${round} ${href}`);
    }
    // browser back to the last page, forward to the Booth (quick: no wait between)
    const before = await clock(page);
    await page.goBack();
    await expect(page).not.toHaveURL(/\/booth/);
    await expect(page.getByTestId("booth-mini")).toBeVisible({ timeout: 10000 });
    await page.goForward();
    await stillPlaying(page, before, `round ${round} back/forward`);
    // a fast round trip: away and straight back before the page settles
    const b2 = await clock(page);
    await side("/library").click();
    await expect(page).toHaveURL(/\/library/);
    await page.goBack();
    await stillPlaying(page, b2, `round ${round} fast`);
  }
});

test("phone: Leave the booth, the tab bar, the mini player and browser back keep the room playing", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await openBooth(page);
  const tab = (href: string) => page.getByTestId("tab-bar").locator(`a[href="${href}"]`).first();
  const leave = async () => {
    // the way out on a phone mid-night: ••• → Leave the booth (Compose)
    await page.getByTestId("booth-more").tap();
    await page.getByRole("menuitem", { name: "Leave the booth" }).tap();
    await expect(page).not.toHaveURL(/\/booth/);
    await expect(page.getByTestId("booth-mini")).toBeVisible({ timeout: 10000 });
  };
  for (let round = 0; round < 3; round++) {
    // Leave → the tab bar to the Library → the mini player's cover back to the Booth
    let before = await clock(page);
    await leave();
    await tab("/library").tap();
    await expect(page).toHaveURL(/\/library/);
    expect(["playing", "cortina"]).toContain(await state(page));
    await page.getByTestId("booth-mini-back").tap();
    await stillPlaying(page, before, `phone round ${round} library → mini`);
    // browser back (the Library), forward to the Booth
    before = await clock(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/library/);
    await expect(page.getByTestId("booth-mini")).toBeVisible({ timeout: 10000 });
    await page.goForward();
    await stillPlaying(page, before, `phone round ${round} back / forward`);
    // Leave → the tab bar's Booth tab
    before = await clock(page);
    await leave();
    await tab("/booth").tap();
    await stillPlaying(page, before, `phone round ${round} tab bar`);
    // Leave → Library → browser back twice, quickly
    before = await clock(page);
    await leave();
    await tab("/library").tap();
    await expect(page).toHaveURL(/\/library/);
    await page.goBack();
    await expect(page).not.toHaveURL(/\/library/);
    await page.goBack();
    await stillPlaying(page, before, `phone round ${round} back × 2`);
  }
  await ctx.close();
});
