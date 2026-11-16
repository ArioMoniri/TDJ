/**
 * The README hero's recording (`pnpm media:hero`): on a 1280 × 800 laptop screen, one tap composes a night, the
 * arc and the tandas (with their covers) appear, Play the night opens the Booth, and the transition between the
 * first two songs opens with both waveforms (stand-in tango audio, scripts/media/tango-audio.ts) and is set to
 * Fade. apps/video's "Hero" composition plays it inside the laptop. No help tags: newCtx sets the capture flag.
 */
import type { Browser } from "playwright";
import { DESKTOP, newCtx, offlineAudio, settle } from "./clips";
import { Recorder } from "./recorder";

export async function heroClip({ browser, base, raw }: { browser: Browser; base: string; raw: string }) {
  const ctx = await newCtx(browser, DESKTOP);
  const page = await ctx.newPage();
  await offlineAudio(page, true);
  await page.goto(base, { waitUntil: "networkidle" });
  await settle(page, 1200);
  const r = new Recorder(page, "hero", raw, { zoom: 1.3, start: { x: 900, y: 560 } });
  await r.start();
  await r.wait(700);
  // 1. one tap: the narrative for a moment, then the engine's wait played back fast
  await r.click(page.getByRole("button", { name: /Compose the night/ }).first(), { zoom: 1.3, settle: 0 });
  await r.wait(1100);
  await r.fast(() => page.locator("#result").waitFor({ timeout: 120_000 }), 700);
  r.focus(null);
  await r.wait(600);
  // 2. the arc, then a look down the tandas (covers) in the sidebar
  const arc = page.locator("#result svg").first();
  if (await arc.isVisible().catch(() => false)) {
    r.focus(await r.centre(arc), 1.25);
    await r.glide({ x: 640, y: 330 });
    await r.wait(1500);
  }
  r.focus(null);
  await r.wait(400);
  // 3. Play the night: the Booth
  await r.click(page.getByTestId("play-the-night").first(), { zoom: 1.3, settle: 0 });
  await r.fast(async () => {
    await page.getByTestId("booth-now-title").waitFor({ timeout: 30_000 });
    await page
      .locator('[data-testid="booth-ttc"]:not([data-resolving="1"])')
      .waitFor({ timeout: 60_000 })
      .catch(() => {});
    await settle(page, 600);
  }, 600);
  r.focus(null);
  await r.wait(900);
  // 4. the transition between the first two songs: two real-looking waveforms, then Fade
  await r.click(page.getByTestId("booth-gap").nth(1), { zoom: 1.25, settle: 0 });
  const ed = page.getByTestId("booth-transition-sheet");
  await r.fast(async () => {
    await ed.waitFor({ timeout: 15_000 });
    await page
      .locator('[data-testid="booth-transition-sheet"] [data-has-peaks]')
      .first()
      .waitFor({ timeout: 15_000 })
      .catch(() => {});
    await page.waitForTimeout(600);
  }, 450);
  const wave = ed.locator("[data-has-peaks]").first();
  r.focus((await wave.isVisible().catch(() => false)) ? await r.centre(wave) : null, 1.2);
  await r.glide({ x: 700, y: 330 });
  await r.wait(1700);
  await r.click(ed.getByTestId("booth-tr-preset-fade"), { zoom: 1.2, settle: 1500 });
  r.focus(null);
  await r.click(ed.getByTestId("booth-tr-close"), { zoom: false, settle: 900 });
  await r.stop();
  await ctx.close();
}
