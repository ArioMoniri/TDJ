/**
 * 2026-11 (the owner: "some songs play a lot of silent moments; those should be counted as the gap between songs
 * (e.g. the 2.5 s gap), or a setting to only apply the gap and transitions after the song has actually finished"):
 * - Settings → Booth → Gaps: three clear choices ("Silence counts as the gap", recommended and on by default; "Gap
 *   after the music ends"; "Off"), and the opt-in estimate for streaming tracks, off by default;
 * - with 30 s clips whose last 3 s are silent, the time the room hears between the last note of one item and the
 *   first note of the next (measured at the master output) is the gap (±150 ms) in "Silence counts as the gap",
 *   and the tail plus the gap in "Off".
 */
import { expect, type Page, test } from "@playwright/test";

const RATE = 22050;
const TONE_SEC = 6;
const TAIL_SEC = 3;
/** a 220 Hz tone at 0.3 for 6 s, then 3 s of digital silence (an old transfer's silent tail) */
function tailedWav(): Buffer {
  const n = RATE * (TONE_SEC + TAIL_SEC);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < RATE * TONE_SEC; i++)
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / RATE) * 0.3 * 32767), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
const WAV = tailedWav();

async function hideDevOverlay(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
  });
}

/** Settings → Booth → Gaps: pick a mode and wait until the app saved it (the store writes in idle time). */
async function chooseMode(page: Page, mode: "gap" | "after" | "off") {
  await page.goto("/settings?section=booth");
  const group = page.getByTestId("booth-silence");
  await expect(group).toBeVisible({ timeout: 30000 });
  await page.getByTestId(`booth-silence-${mode}`).click();
  await expect(page.getByTestId(`booth-silence-${mode}`)).toHaveAttribute("aria-checked", "true");
  await expect(group).toHaveAttribute("data-mode", mode);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("tdj-v1");
        const m = raw ? (JSON.parse(raw) as { state?: { settings?: { boothSilence?: string } } }) : null;
        return m?.state?.settings?.boothSilence ?? null;
      }),
    )
    .toBe(mode);
}

async function openBooth(page: Page) {
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
  await expect(page.getByTestId("booth-start")).toHaveText(/30 s clips/);
}

/**
 * At the master output, on the audio clock: the time the first item's music stops (64-sample RMS under −60 dBFS
 * after being over −40) and the time the next item's music starts (back over −40), with the gap the plan gives that
 * join. A tap on the master (a ScriptProcessor) stamps every block with its playback time, so a busy main thread
 * (the item change re-renders the booth) never delays the measurement.
 */
async function measureJoin(page: Page): Promise<{ silence: number; gap: number }> {
  return page.evaluate(async () => {
    const w = window as unknown as {
      __tdjBoothEngine: () => {
        ctx: AudioContext;
        master: AudioNode;
        planIndex: number;
        gapAfter(i: number): number;
      } | null;
    };
    const t0 = performance.now();
    let e = w.__tdjBoothEngine();
    while (!e && performance.now() - t0 < 10000) {
      await new Promise((r) => setTimeout(r, 20));
      e = w.__tdjBoothEngine();
    }
    if (!e) throw new Error("no engine");
    const eng = e;
    const ctx = eng.ctx;
    // the join after the item playing now
    const gap = eng.gapAfter(eng.planIndex);
    // runs on the audio thread: every 128-frame quantum stamped with the context's own time
    const code = `
      class SilenceTap extends AudioWorkletProcessor {
        constructor() { super(); this.audible = false; this.silentAt = null; this.done = false; }
        process(inputs) {
          const x = inputs[0] && inputs[0][0];
          if (this.done || !x) return true;
          let s = 0;
          for (let i = 0; i < x.length; i++) s += x[i] * x[i];
          const db = s > 0 ? 10 * Math.log10(s / x.length) : -200;
          const t = currentTime;
          if (db > -40) {
            // a silence shorter than 0.3 s inside the music is a dropout, not the item's end
            if (this.silentAt !== null && t - this.silentAt >= 0.3) {
              this.port.postMessage({ silence: t - this.silentAt });
              this.done = true;
            }
            this.audible = true;
            this.silentAt = null;
          } else if (db < -60 && this.audible && this.silentAt === null) this.silentAt = t;
          return true;
        }
      }
      registerProcessor("silence-tap", SilenceTap);`;
    const url = URL.createObjectURL(new Blob([code], { type: "application/javascript" }));
    await ctx.audioWorklet.addModule(url);
    const tap = new AudioWorkletNode(ctx, "silence-tap", { numberOfInputs: 1, numberOfOutputs: 1 });
    const mute = ctx.createGain();
    mute.gain.value = 0;
    eng.master.connect(tap);
    tap.connect(mute);
    mute.connect(ctx.destination);
    try {
      const silence = await new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("the next item never became audible")), 40000);
        tap.port.onmessage = (m: MessageEvent<{ silence: number }>) => {
          clearTimeout(timer);
          resolve(m.data.silence);
        };
      });
      return { silence, gap };
    } finally {
      eng.master.disconnect(tap);
      tap.disconnect();
      mute.disconnect();
    }
  });
}

test.describe("2026-11: a song's own silence and the gap", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("Settings → Booth → Gaps: three clear choices, 'Silence counts as the gap' by default; the estimate is off", async ({
    page,
  }) => {
    await hideDevOverlay(page);
    await page.goto("/settings?section=booth");
    const group = page.getByTestId("settings-gaps");
    await expect(group).toBeVisible({ timeout: 30000 });
    await expect(group).toContainText("Gaps");
    await expect(page.getByTestId("booth-silence")).toHaveAttribute("data-mode", "gap");
    await expect(page.getByTestId("booth-silence").getByRole("radio")).toHaveCount(3);
    await expect(page.getByTestId("booth-silence-gap")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("booth-silence-gap")).toContainText("Silence counts as the gap");
    await expect(page.getByTestId("booth-silence-gap")).toContainText("Recommended");
    await expect(page.getByTestId("booth-silence-after")).toContainText("Gap after the music ends");
    await expect(page.getByTestId("booth-silence-off")).toContainText("Off (play files to their edges)");
    const estimate = group.getByRole("switch", { name: "Estimate silence for streaming tracks" });
    await expect(estimate).toHaveAttribute("aria-checked", "false");
    await expect(group).toContainText("Spotify can't be measured");
    // every choice is a 44 px target
    for (const m of ["gap", "after", "off"]) {
      const box = await page.getByTestId(`booth-silence-${m}`).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await chooseMode(page, "after");
    await page.reload();
    await expect(page.getByTestId("booth-silence-after")).toHaveAttribute("aria-checked", "true");
  });

  test("'Silence counts as the gap': the room hears the gap between the last note and the next first note (±150 ms)", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await hideDevOverlay(page);
    await chooseMode(page, "gap");
    await openBooth(page);
    await page.getByTestId("booth-start").click();
    await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing", { timeout: 20000 });
    const { silence, gap } = await measureJoin(page);
    expect(gap).toBeGreaterThan(0);
    console.log(`heard ${silence.toFixed(3)} s of silence (gap ${gap} s)`);
    expect(Math.abs(silence - gap)).toBeLessThanOrEqual(0.15);
  });

  test("'Off': the file's 3 s silent tail plays, then the gap (tail + gap, ±150 ms)", async ({ page }) => {
    test.setTimeout(180_000);
    await hideDevOverlay(page);
    await chooseMode(page, "off");
    await openBooth(page);
    await page.getByTestId("booth-start").click();
    await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing", { timeout: 20000 });
    const { silence, gap } = await measureJoin(page);
    console.log(`heard ${silence.toFixed(3)} s of silence (gap ${gap} s)`);
    expect(Math.abs(silence - (TAIL_SEC + gap))).toBeLessThanOrEqual(0.15);
  });
});
