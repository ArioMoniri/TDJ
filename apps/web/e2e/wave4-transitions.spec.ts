/**
 * Wave 4 — the Booth's transition editor (the interaction of a playlist "Mix" editor, in T-DJ's own look): it opens
 * from the gap marker between two items, the song sheet's "Transition…" and Mix → "Edit transitions…"; a preset and a
 * length are saved per transition (fromId→toId) with the night and re-time it; the audition plays in the headphones
 * (never the room) while the night runs. `TDJ_SHOTS=<dir>` also saves phone and iPad screenshots there.
 */
import { expect, type Page, test } from "@playwright/test";

const SHOTS = process.env.TDJ_SHOTS;

function wav(sec = 12): Buffer {
  const rate = 22050;
  const n = rate * sec;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    // a pulsing tone, so the waveform has a shape
    const env = 0.35 + 0.3 * Math.abs(Math.sin((2 * Math.PI * 1.7 * i) / rate));
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * env * 32767), i * 2);
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

/** Two outputs (this device + AirPods) and a recording `setSinkId` on media elements. */
async function fakeOutputs(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __sinks: string[] };
    w.__sinks = [];
    Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", {
      configurable: true,
      value(this: HTMLMediaElement, id: string) {
        w.__sinks.push(id);
        return Promise.resolve();
      },
    });
    const devs = [
      { kind: "audiooutput", deviceId: "default", label: "Default - Built-in Speakers", groupId: "g1" },
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
  });
}

async function openBooth(page: Page, o: { outputs?: boolean } = {}) {
  if (o.outputs) await fakeOutputs(page);
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
  await expect(page).toHaveURL(/\/booth/);
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("booth-ttc")).not.toHaveAttribute("data-resolving", "1", { timeout: 30000 });
}
type PlanItem = {
  id?: string;
  kind: string;
  gapAfterSec: number;
  transitionAfter?: { preset: string; fadeOutSec: number; fadeInSec: number; gapSec: number };
};
const planOf = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __tdjBoothPlan: { items: PlanItem[]; wallClockSec: number } }).__tdjBoothPlan,
  );

/** The plan index of song 4 of tanda 1 (followed by the tanda's cortina). */
async function song4(page: Page): Promise<number> {
  const rows = page.locator('.booth-tanda[data-tanda="1"] .booth-row[data-kind="track"]');
  await expect(rows).toHaveCount(4);
  const i = Number(await rows.nth(3).getAttribute("data-plan-index"));
  expect((await planOf(page)).items[i + 1]?.kind).toBe("cortina");
  return i;
}

test("song 4 → cortina: pick Fade, set 3 s, Save; it re-times the night and is there when reopened", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooth(page);
  const i = await song4(page);
  const before = await planOf(page);
  const marker = page.locator(`[data-testid="booth-gap"][data-from="${i}"]`);
  await expect(marker).toHaveText(`${before.items[i]!.gapAfterSec} s`);
  // the marker's target is 44 px tall
  expect((await marker.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await marker.click();
  const sheet = page.getByTestId("booth-transition-sheet");
  await expect(sheet.getByTestId("booth-tr-context")).toContainText("→ Cortina");
  await expect(sheet.getByTestId("booth-tr-preset-auto")).toHaveAttribute("aria-checked", "true");
  await expect(sheet.getByTestId("booth-tr-preset-cortinaCut")).toHaveCount(0);
  await expect(sheet).toContainText("Beta");
  // a side without decodable audio is a neutral bar, the volume lines still drawn
  if ((await page.locator(`.booth-row[data-plan-index="${i}"]`).getAttribute("data-source")) === "missing")
    await expect(sheet.getByTestId("booth-tr-noaudio")).toBeVisible();
  await expect(sheet.locator(".booth-tr-line-out")).toHaveCount(1);
  await expect(sheet.locator(".booth-tr-line-in")).toHaveCount(1);
  // every control in the editor is a 44 px target and carries a help tag
  const small = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '[data-testid="booth-transition-sheet"] .booth-tr button, [data-testid="booth-transition-sheet"] .booth-tr select, [data-testid="booth-transition-sheet"] [role="slider"]',
      ),
    ]
      .filter((b) => b.offsetParent)
      .map((b) => ({ id: b.dataset.testid ?? b.getAttribute("aria-label"), r: b.getBoundingClientRect() }))
      .filter((x) => x.r.width < 43.5 || x.r.height < 39.5)
      .map((x) => x.id),
  );
  expect(small).toEqual([]);
  for (const id of ["booth-tr-preset-fade", "booth-tr-audition", "booth-tr-start", "booth-tr-end"])
    await expect(sheet.getByTestId(id)).toHaveAttribute("data-hint", /\w/);

  await sheet.getByTestId("booth-tr-preset-fade").click();
  await expect(sheet.getByTestId("booth-tr-preset-fade")).toHaveAttribute("aria-checked", "true");
  if (await sheet.getByTestId("booth-tr-unit-sec").count())
    await sheet.getByTestId("booth-tr-unit-sec").click();
  await sheet.getByTestId("booth-tr-length").selectOption("3");
  await expect(sheet.getByTestId("booth-tr-unsaved")).toBeVisible();
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect
    .poll(async () => (await planOf(page)).items[i]?.transitionAfter)
    .toMatchObject({ preset: "fade", fadeOutSec: 3, fadeInSec: 3 });
  await expect(marker).toHaveText("Fade 3 s");
  await expect(marker.locator("xpath=..")).toHaveAttribute("data-edited", "true");
  // the night's clock follows (the fade's gap, 1 s, replaces the night's 2.5 s)
  const after = await planOf(page);
  expect(after.wallClockSec).toBeCloseTo(before.wallClockSec - (before.items[i]!.gapAfterSec - 1), 1);

  // reopen: it is Fade, 3 s
  await marker.click();
  await expect(sheet.getByTestId("booth-tr-preset-fade")).toHaveAttribute("aria-checked", "true");
  await expect(sheet.getByTestId("booth-tr-length")).toHaveValue("3");
  await page.keyboard.press("Escape");
  // and after a reload the night still has it (saved with the set, exported in .tdjnight)
  await page.reload();
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 20000 });
  await expect
    .poll(async () => (await planOf(page)).items[i]?.transitionAfter?.preset, { timeout: 20000 })
    .toBe("fade");
});

test("audition: during the night it plays in the headphones (mock setSinkId), never the room", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooth(page, { outputs: true });
  await page.getByTestId("booth-out-cue").click();
  await page.getByTestId("booth-output-sheet").locator('[data-device="hp"]').click();
  await page.keyboard.press("Escape");
  await page.getByTestId("booth-start").click();
  await expect(page.getByTestId("booth-pause")).toBeVisible({ timeout: 20000 });
  const nowTitle = await page.getByTestId("booth-now-title").innerText();
  const i = await song4(page);
  await page.locator(`[data-testid="booth-gap"][data-from="${i}"]`).click();
  const sheet = page.getByTestId("booth-transition-sheet");
  const play = sheet.getByTestId("booth-tr-audition");
  await expect(play).toHaveAttribute("data-where", "headphones");
  await expect(sheet.getByTestId("booth-tr-hear")).toContainText("AirPods Pro");
  await sheet.getByTestId("booth-tr-preset-fade").click();
  await play.click();
  await expect(play).toHaveAttribute("aria-pressed", "true", { timeout: 15000 });
  expect(await page.evaluate(() => (window as unknown as { __sinks: string[] }).__sinks)).toContain("hp");
  await expect(sheet.getByTestId("booth-tr-hear")).toContainText(/Playing in your headphones/);
  // song 4 has no clip in this rehearsal: it is silence in the audition, said so; the cortina still plays
  if ((await page.locator(`.booth-row[data-plan-index="${i}"]`).getAttribute("data-source")) === "missing")
    await expect(sheet.getByTestId("booth-tr-hear-note")).toContainText(/silent in the audition/);
  // the room plays on, untouched
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing");
  await expect(page.getByTestId("booth-now-title")).toHaveText(nowTitle);
  await play.click();
  await expect(play).toHaveAttribute("aria-pressed", "false");
});

test("Mix → Edit transitions opens the editor; a song's sheet has Transition…; Cumparsita stays whole", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooth(page);
  await page.getByTestId("booth-mix").click();
  await page.getByTestId("booth-levels-sheet").getByRole("button", { name: "Edit transitions…" }).click();
  const sheet = page.getByTestId("booth-transition-sheet");
  await expect(sheet.getByTestId("booth-tr-stage")).toBeVisible();
  // ‹ › walk the night's transitions
  const ctx0 = await sheet.getByTestId("booth-tr-context").innerText();
  await sheet.getByTestId("booth-tr-next").click();
  await expect(sheet.getByTestId("booth-tr-context")).not.toHaveText(ctx0);
  await page.keyboard.press("Escape");
  // the song sheet's Transition… opens the transition after that song
  const row = page.locator('.booth-tanda[data-tanda="2"] .booth-row[data-kind="track"]').first();
  await row.getByTestId("booth-row-play").click();
  await page.getByTestId("booth-play-sheet").getByRole("button", { name: "Transition…" }).click();
  await expect(sheet.getByTestId("booth-tr-out")).toContainText(
    await row.locator(".booth-row-title").innerText(),
  );
  // inside a tanda Blend is an advanced opt-in with a gentle warning
  await expect(sheet.getByTestId("booth-tr-note")).toContainText(/Inside a tanda/);
  await sheet.getByTestId("booth-tr-preset-blend").click();
  await expect(sheet.getByTestId("booth-tr-note")).toContainText(/Careful: dancers expect/);
  await page.keyboard.press("Escape");
  // into the closing La Cumparsita: no blend, no rise
  const items = (await planOf(page)).items;
  const last = items.length - 1;
  if (items[last]?.kind === "closing" && items[last - 1]?.kind !== "break") {
    await page.locator(`[data-testid="booth-gap"][data-from="${last - 1}"]`).click();
    await expect(sheet.getByTestId("booth-tr-preset-blend")).toBeDisabled();
    await expect(sheet.getByTestId("booth-tr-preset-rise")).toBeDisabled();
    await expect(sheet.getByTestId("booth-tr-note")).toContainText(/La Cumparsita always plays whole/);
    // after a cortina, the cortina cut is offered
    if (items[last - 1]?.kind === "cortina")
      await expect(sheet.getByTestId("booth-tr-preset-cortinaCut")).toBeVisible();
  }
});

test("phone: the editor is a full-height sheet over the set list; the handles drag the box", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  await openBooth(page);
  await page.getByTestId("booth-set-open").click();
  const set = page.getByTestId("booth-set-sheet");
  const i = await song4(page);
  const marker = set.locator(`[data-testid="booth-gap"][data-from="${i}"]`);
  if (SHOTS) {
    await marker.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/iphone-set-gap-markers.png` });
  }
  await marker.click();
  const sheet = page.getByTestId("booth-transition-sheet");
  await expect(sheet.getByTestId("booth-tr-stage")).toBeVisible();
  await sheet.getByTestId("booth-tr-preset-blend").click();
  const box0 = Number(await sheet.getByTestId("booth-tr-box").getAttribute("data-start"));
  // the start handle, moved with the keyboard (← = half a second earlier), lengthens the overlap
  await sheet.getByTestId("booth-tr-start").focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(async () => Number(await sheet.getByTestId("booth-tr-box").getAttribute("data-start")))
    .toBe(box0 - 1);
  const r = (await sheet.boundingBox())!;
  expect(r.height).toBeGreaterThan(844 * 0.85);
  // no horizontal scroll inside the editor
  expect(
    await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(".booth-tr")!;
      return el.scrollWidth <= el.clientWidth + 1;
    }),
  ).toBe(true);
  if (SHOTS) {
    await sheet.getByTestId("booth-tr-context").scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}/iphone-blend.png` });
    await sheet.getByTestId("booth-tr-preset-fade").click();
    await sheet.getByTestId("booth-tr-context").scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/iphone-fade.png` });
    await sheet.locator(".booth-tr-presets-head").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/iphone-presets-advanced.png` });
  }
  await ctx.close();
});

test("iPad: the editor is a panel; the set list shows its gap markers", async ({ browser }) => {
  const ctx = await browser.newContext({
    viewport: { width: 820, height: 1180 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  await openBooth(page);
  const i = await song4(page);
  const marker = page.locator(`[data-testid="booth-gap"][data-from="${i}"]`);
  await marker.scrollIntoViewIfNeeded();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/ipad-set-gap-markers.png` });
  await marker.click();
  const sheet = page.getByTestId("booth-transition-sheet");
  await expect(sheet.getByTestId("booth-tr-stage")).toBeVisible();
  await sheet.getByTestId("booth-tr-preset-blend").click();
  const r = (await sheet.boundingBox())!;
  expect(r.width).toBeLessThanOrEqual(780);
  // the start handle, dragged left with the pointer, lengthens the overlap
  const box0 = Number(await sheet.getByTestId("booth-tr-box").getAttribute("data-start"));
  await page.waitForTimeout(500);
  await sheet.getByTestId("booth-tr-stage").scrollIntoViewIfNeeded();
  const h = (await sheet.getByTestId("booth-tr-start").boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 - 60, h.y + h.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(async () => Number(await sheet.getByTestId("booth-tr-box").getAttribute("data-start")))
    .toBeLessThan(box0);
  if (SHOTS) {
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}/ipad-blend.png` });
    await sheet.getByTestId("booth-tr-preset-rise").click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/ipad-rise.png` });
    // a song → song transition whose two sides both have a clip: both waveforms drawn
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    const k = await page.evaluate(() => {
      const rows = [...document.querySelectorAll<HTMLElement>('.booth-row[data-kind="track"]')];
      for (const r of rows) {
        const n = Number(r.dataset.planIndex);
        const next = document.querySelector<HTMLElement>(`.booth-row[data-plan-index="${n + 1}"]`);
        if (
          r.dataset.source === "preview" &&
          next?.dataset.kind === "track" &&
          next.dataset.source === "preview"
        )
          return n;
      }
      return -1;
    });
    if (k >= 0) {
      const m = page.locator(`[data-testid="booth-gap"][data-from="${k}"]`);
      await m.scrollIntoViewIfNeeded();
      await m.click();
      await sheet.getByTestId("booth-tr-preset-blend").click();
      await sheet
        .getByLabel("Bass swap")
        .click()
        .catch(() => {});
      await expect(sheet.getByTestId("booth-tr-stage")).toHaveAttribute("data-has-peaks", "true", {
        timeout: 15000,
      });
      await sheet.getByTestId("booth-tr-context").scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${SHOTS}/ipad-blend-waveforms.png` });
    }
  }
  await ctx.close();
});
