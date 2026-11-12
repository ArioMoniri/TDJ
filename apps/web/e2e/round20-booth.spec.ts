/**
 * Round 20 (docs/specs/round20-booth.md): "stopping music is too hard, the DJ and fade features are not there, and
 * I can't hear the music".
 * - Start gives audible output: the master output (the analyser right before the speakers) has a non-silent RMS
 *   and the AudioContext runs
 * - Pause / Resume is one tap (and space), with a short fade measured at the output
 * - Stop is one tap + a confirm ("Fade out and stop" / "Stop now"); esc opens the same confirm
 * - Fade out now and Next with crossfade apply (gain measured at the output)
 * - a cortina's fade out / stop at is edited from the set and re-times the night
 * - in clip mode the local-files banner never shows; controls ≥ 44 px; no overflow at 390 and 1440
 */
import { expect, type Page, test } from "@playwright/test";

/** 20 s mono 22.05 kHz WAV, a 220 Hz tone at 0.3 (what every clip serves: long enough to measure fades in). */
function syntheticWav(sec = 20): Buffer {
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

async function mockClips(page: Page) {
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
}

async function openFeaturedBooth(page: Page) {
  await mockClips(page);
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/);
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("booth-ttc")).not.toHaveAttribute("data-resolving", "1", { timeout: 30000 });
  await expect(page.getByTestId("booth-start")).toHaveText(/30 s clips/);
}

/** The loudest RMS (dBFS) at the master output over `ms` (several analyser frames: a frame is 256 samples). */
async function rms(page: Page, ms = 240): Promise<number> {
  return page.evaluate(async (ms) => {
    const w = window as unknown as {
      __tdjBoothEngine: () => {
        analyser: { fftSize: number; getFloatTimeDomainData(b: Float32Array): void };
      } | null;
    };
    const e = w.__tdjBoothEngine();
    if (!e) return -200;
    const buf = new Float32Array(e.analyser.fftSize);
    let best = -200;
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      e.analyser.getFloatTimeDomainData(buf);
      let s = 0;
      for (const v of buf) s += v * v;
      best = Math.max(best, s > 0 ? 10 * Math.log10(s / buf.length) : -200);
      await new Promise((r) => setTimeout(r, 20));
    }
    return best;
  }, ms);
}
const planIndex = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __tdjBooth: { getState(): { planIndex: number } } }).__tdjBooth.getState()
        .planIndex,
  );
const AUDIBLE = -40;
const SILENT = -70;

test.describe("1440 × 900", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("Start is audible; Pause / Resume one tap with fades; fade out now; crossfade; Stop tap + confirm; esc", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await openFeaturedBooth(page);
    await page.getByTestId("booth-start").click();
    await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing", { timeout: 20000 });
    // can't hear: the context runs and the master output is far from silence within a few seconds of Start
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __tdjBoothCtx: () => string }).__tdjBoothCtx()))
      .toBe("running");
    await expect.poll(() => rms(page), { timeout: 8000 }).toBeGreaterThan(AUDIBLE);
    // clip mode: no "link your music folder" banner (the Now card says what cannot be rehearsed), no sound banner
    await expect(page.locator('[data-testid="booth-banners"] [data-key="missing"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="booth-banners"] [data-key="audio"]')).toHaveCount(0);

    // Pause: one tap; the output fades to silence in under a second and the item waits where it was
    const before = await planIndex(page);
    await page.getByTestId("booth-pause").click();
    await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "paused");
    await expect.poll(() => rms(page, 100), { timeout: 2500 }).toBeLessThan(SILENT);
    await expect(page.getByTestId("booth-play")).toHaveText(/Resume/);
    await expect(page.getByTestId("booth-now")).toContainText("Paused");
    const remainingPaused = await page.getByTestId("booth-remaining").textContent();
    await page.waitForTimeout(1200);
    expect(await page.getByTestId("booth-remaining").textContent()).toBe(remainingPaused);
    // Resume: one tap, the same item, audible again
    await page.getByTestId("booth-play").click();
    await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing");
    expect(await planIndex(page)).toBe(before);
    await expect.poll(() => rms(page), { timeout: 4000 }).toBeGreaterThan(AUDIBLE);
    // space pauses and resumes too
    await page.keyboard.press("Space");
    await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "paused");
    await page.keyboard.press("Space");
    await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing");
    await expect.poll(() => rms(page), { timeout: 4000 }).toBeGreaterThan(AUDIBLE);

    // Fade out now (4 s): the level falls through the fade (the −60 dB log curve), silence, then the next item
    await page.getByTestId("booth-mix").click();
    const mix = page.getByTestId("booth-levels-sheet");
    await expect(mix).toBeVisible();
    const startLevel = await rms(page);
    const atFade = await planIndex(page);
    await mix.getByTestId("booth-fade-now").click();
    await page.waitForTimeout(1500);
    const mid = await rms(page, 150);
    expect(mid).toBeLessThan(startLevel - 10);
    await expect.poll(() => rms(page, 100), { timeout: 5000 }).toBeLessThan(SILENT);
    await expect.poll(() => planIndex(page), { timeout: 10000 }).toBeGreaterThan(atFade);
    await expect.poll(() => rms(page), { timeout: 6000 }).toBeGreaterThan(AUDIBLE);

    // Next with crossfade (3 s): the next item starts at once, the output never drops to silence
    const atX = await planIndex(page);
    await mix.getByTestId("booth-crossfade").click();
    await expect.poll(() => planIndex(page), { timeout: 3000 }).toBeGreaterThan(atX);
    let quietest = 0;
    for (let k = 0; k < 6; k++) quietest = Math.min(quietest, await rms(page, 120));
    expect(quietest).toBeGreaterThan(-50);
    await page.keyboard.press("Escape");
    await expect(mix).toHaveCount(0);

    // Stop: one tap opens the confirm; "Stop now" silences the output at once and keeps the position
    await page.getByTestId("booth-stop").click();
    const sheet = page.getByTestId("booth-stop-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId("booth-stop-fade")).toBeFocused();
    await sheet.getByTestId("booth-stop-now").click();
    await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "stopped");
    await expect.poll(() => rms(page, 100), { timeout: 1500 }).toBeLessThan(SILENT);
    // Play restarts; esc opens the confirm, Enter fades out and stops
    await page.getByTestId("booth-play").click();
    await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing", { timeout: 10000 });
    await expect.poll(() => rms(page), { timeout: 4000 }).toBeGreaterThan(AUDIBLE);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("booth-stop-sheet")).toBeVisible();
    await expect(page.getByTestId("booth-stop-fade")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "stopped");
    await expect(page.getByTestId("booth-stop-sheet")).toHaveCount(0);
    // a fade, not a cut: still audible a moment after Enter, silent once the 3 s are through
    await expect.poll(() => rms(page, 100), { timeout: 5000 }).toBeLessThan(SILENT);
    // the shortcuts are shown
    await page.keyboard.press("?");
    await expect(page.getByTestId("booth-shortcuts")).toContainText("Pause / resume");
    await expect(page.getByTestId("booth-shortcuts")).toContainText("Fade out now");
  });

  test("a cortina's fade out and stop second are edited from the set, saved with the set, and re-time the night", async ({
    page,
  }) => {
    await openFeaturedBooth(page);
    const wall = () =>
      page.evaluate(
        () => (window as unknown as { __tdjBoothPlan: { wallClockSec: number } }).__tdjBoothPlan.wallClockSec,
      );
    const wall0 = await wall();
    const sheet = page.getByTestId("booth-cortina-sheet");
    // (the set re-renders once while its sources settle: tap again until the sheet is up)
    await expect(async () => {
      await page.getByTestId("booth-cortina-edit").first().click();
      await expect(sheet).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15000 });
    await sheet.getByRole("button", { name: "Increase fade out" }).click();
    await sheet.getByRole("button", { name: "Decrease stop at" }).click();
    await sheet.getByRole("button", { name: "Decrease stop at" }).click();
    const r = await page.evaluate(() => {
      const w = window as unknown as {
        __tdjBoothPlan: {
          items: Array<{ kind: string; id?: string; fadeOutSec?: number; stopSec?: number }>;
        };
        __tdjBooth: { getState(): { playlist: { booth?: { cortinaEdits?: Record<string, unknown> } } } };
      };
      const edits = w.__tdjBooth.getState().playlist.booth?.cortinaEdits ?? {};
      const id = Object.keys(edits)[0]!;
      const c = w.__tdjBoothPlan.items.find((i) => i.kind === "cortina" && i.id === id)!;
      return { edits, c };
    });
    expect(Object.keys(r.edits)).toHaveLength(1);
    expect(r.c.fadeOutSec).toBe(4.5);
    expect(r.c.stopSec).toBeLessThan(45);
    // the night is shorter by the cortina's two seconds (the plan the time card and the exports read)
    await expect.poll(wall).toBeCloseTo(wall0 - 2, 3);
    // back to the night's settings
    await sheet.getByRole("button", { name: "Use the night's settings" }).click();
    const left = await page.evaluate(
      () =>
        (
          window as unknown as {
            __tdjBooth: { getState(): { playlist: { booth?: { cortinaEdits?: Record<string, unknown> } } } };
          }
        ).__tdjBooth.getState().playlist.booth?.cortinaEdits,
    );
    expect(left).toBeUndefined();
  });

  test("1440 while playing: controls ≥ 44 px, no overflow, the strip's faders and Mix inside it", async ({
    page,
  }) => {
    await openFeaturedBooth(page);
    await page.getByTestId("booth-start").click();
    await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing", { timeout: 20000 });
    // (the strip re-lays out once as Start becomes Pause and the sources settle: wait for the page to be still)
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
      )
      .toBe(0);
    const m = await page.evaluate(() => {
      const strip = document.querySelector('[data-testid="booth-strip"]')!;
      const sr = strip.getBoundingClientRect();
      const visible = [...strip.querySelectorAll("button, input")].filter(
        (el) => el.getBoundingClientRect().width > 0,
      );
      return {
        small: visible.filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width < 44 || r.height < 44;
        }).length,
        outside: visible.filter((el) => {
          const r = el.getBoundingClientRect();
          return r.top < sr.top - 0.5 || r.bottom > sr.bottom + 0.5;
        }).length,
        stripH: sr.height,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        glassInContent: document.querySelectorAll(".booth-grid .glass").length,
      };
    });
    expect(m.small).toBe(0);
    expect(m.outside).toBe(0);
    expect(m.stripH).toBeLessThanOrEqual(72);
    expect(m.overflow).toBe(0);
    expect(m.glassInContent).toBe(0);
    await expect(page.getByTestId("booth-pause")).toBeVisible();
    await expect(page.getByTestId("booth-hold")).toBeVisible();
    await expect(page.getByTestId("booth-mix")).toBeVisible();
  });
});

test.describe("phone 390 × 844", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("one row: Pause, Next, Stop, Mix, •••; ≥ 44 px; no overflow; the Mix and Stop sheets fit; no files banner", async ({
    page,
  }) => {
    await openFeaturedBooth(page);
    await page.getByTestId("booth-start").click();
    await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing", { timeout: 20000 });
    await expect(page.locator('[data-testid="booth-banners"] [data-key="missing"]')).toHaveCount(0);
    const m = await page.evaluate(() => {
      const strip = document.querySelector('[data-testid="booth-strip"]')!;
      const visible = [...strip.querySelectorAll("button")].filter(
        (el) => el.getBoundingClientRect().width > 0,
      );
      return {
        labels: visible.map((el) => el.getAttribute("aria-label")),
        small: visible.filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width < 44 || r.height < 44;
        }).length,
        right: Math.max(...visible.map((el) => el.getBoundingClientRect().right)),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(m.labels).toEqual(["Pause", "Next at gap", "Stop…", "Mix: levels and fades", "More"]);
    expect(m.small).toBe(0);
    expect(m.right).toBeLessThanOrEqual(390);
    expect(m.overflow).toBe(0);
    // Pause with one tap on a phone
    await page.getByTestId("booth-pause").tap();
    await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "paused");
    await page.getByTestId("booth-play").tap();
    await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing");
    // the Mix sheet: the actions and the fade settings, every row ≥ 44 px, nothing wider than the screen
    await page.getByTestId("booth-levels").tap();
    const mix = page.getByTestId("booth-levels-sheet");
    await expect(mix.getByTestId("booth-fade-now")).toBeVisible();
    await expect(mix).toContainText("Song end fade");
    const s = await page.evaluate(() => {
      const sheet = document.querySelector('[data-testid="booth-levels-sheet"]')!;
      const btns = [...sheet.querySelectorAll("button")].filter((el) => el.getBoundingClientRect().width > 0);
      return {
        small: btns
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.height < 44 || r.width < 44;
          })
          .map((el) => el.getAttribute("aria-label") || el.textContent),
        wide: btns.filter((el) => el.getBoundingClientRect().right > 390.5).length,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(s.small).toEqual([]);
    expect(s.wide).toBe(0);
    expect(s.overflow).toBe(0);
    await page.getByRole("button", { name: "Done" }).tap();
    await expect(mix).toHaveCount(0);
    // Stop: one tap, the confirm, Stop now
    await page.getByTestId("booth-stop").tap();
    await page.getByTestId("booth-stop-now").tap();
    await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "stopped");
  });
});
