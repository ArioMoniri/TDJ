/**
 * Wave 4 — the Booth's transition editor, laid out like a playlist "Mix" editor in T-DJ's own dark look: a full-screen
 * page (X, Beta, •••, Save) with the outgoing side's row, two full-bleed coloured waveform lanes on one time axis under
 * a panel over the transition (each lane's box with edges to drag, the volume and bass lines, the audition button,
 * the length pill), the incoming side's row, the presets and the Volume and EQ rows. It opens from the gap marker
 * between two items, the song sheet's "Transition…" and Mix → "Edit transitions…"; an edit is saved per transition
 * (fromId→toId) with the night and re-times it; the audition plays in the headphones (never the room) while the night
 * runs. Also (owner's iPhone feedback): the tab capsule never covers the guide box on Compose or the Guide.
 * `TDJ_SHOTS=<dir>` saves iPhone and iPad screenshots there.
 */
import { type Browser, type BrowserContextOptions, devices, expect, type Page, test } from "@playwright/test";

const SHOTS = process.env.TDJ_SHOTS;

function dev(name: keyof typeof devices): BrowserContextOptions {
  const { defaultBrowserType: _b, ...rest } = devices[name];
  return rest;
}
const touch = (w: number, h: number, scale = 2): BrowserContextOptions => ({
  viewport: { width: w, height: h },
  deviceScaleFactor: scale,
  isMobile: true,
  hasTouch: true,
});
// iPhone 15 Pro as a home-screen web app: the whole 393 × 852 screen (Safari's toolbars would take 193 px of it)
const IPHONE = {
  ...dev("iPhone 15 Pro"),
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
  colorScheme: "dark" as const,
};
/** a screenshot of the editor scrolled to its top, as it opens */
async function shot(page: Page, name: string) {
  await page.evaluate(() => {
    document.querySelector(".trx-scroll")?.scrollTo(0, 0);
    document.querySelector(".trx-presets")?.scrollTo(0, 0);
    // the dev server's own badge is not part of the page
    for (const el of document.querySelectorAll<HTMLElement>("nextjs-portal")) el.style.display = "none";
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}
const IPAD = touch(820, 1180);

function wav(sec = 12): Buffer {
  const rate = 22050;
  const n = rate * sec;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    // a kick-like low pulse, a mid tone and a little noise: every band of the waveform has a shape
    const t = i / rate;
    const beat = t % 0.5;
    const kick = Math.exp(-beat * 18) * Math.sin(2 * Math.PI * 60 * t) * 0.55;
    const mid = (0.2 + 0.15 * Math.abs(Math.sin(2 * Math.PI * 0.4 * t))) * Math.sin(2 * Math.PI * 440 * t);
    const hiss = (Math.random() * 2 - 1) * 0.05 * Math.exp(-((t * 4) % 1) * 6);
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, kick + mid + hiss)) * 32000), i * 2);
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

/** A transition between two songs that both have a (mocked) clip: both lanes draw a waveform. */
const clipPair = (page: Page) =>
  page.evaluate(() => {
    for (const r of document.querySelectorAll<HTMLElement>('.booth-row[data-kind="track"]')) {
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

/** The editor's controls that are smaller than 44 × 44 (the picker's rows count too). */
const smallTargets = (page: Page) =>
  page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '[data-testid="booth-transition-sheet"] button, [data-testid="booth-transition-sheet"] [role="slider"]',
      ),
    ]
      .filter((b) => b.getClientRects().length && !b.classList.contains("trx-picker-scrim"))
      .map((b) => ({ id: b.dataset.testid ?? b.getAttribute("aria-label"), r: b.getBoundingClientRect() }))
      .filter((x) => x.r.width < 43.5 || x.r.height < 43.5)
      .map((x) => x.id),
  );

test("song 4 → cortina: pick Fade, set 3 s from the length pill, Save; it re-times the night and is there after a reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooth(page);
  const i = await song4(page);
  const before = await planOf(page);
  const marker = page.locator(`[data-testid="booth-gap"][data-from="${i}"]`);
  await expect(marker).toHaveText(`${before.items[i]!.gapAfterSec} s`);
  expect((await marker.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await marker.click();
  const ed = page.getByTestId("booth-transition-sheet");
  await expect(ed.getByTestId("booth-tr-in")).toContainText("Cortina");
  await expect(ed.getByTestId("booth-tr-preset-auto")).toHaveAttribute("aria-checked", "true");
  await expect(ed.getByTestId("booth-tr-preset-cortinaCut")).toHaveCount(0);
  await expect(ed).toContainText("Beta");
  // Save is dim until something changes
  await expect(ed.getByTestId("booth-tr-save")).toBeDisabled();
  // no explanatory paragraphs on the canvas: they live in the ••• menu
  await expect(ed.getByText(/No waveform for|The audition plays/)).toHaveCount(0);
  await expect(ed.locator(".booth-tr-line-out")).toHaveCount(1);
  await expect(ed.locator(".booth-tr-line-in")).toHaveCount(1);
  // a side with no clip is a flat placeholder lane, not text
  if ((await page.locator(`.booth-row[data-plan-index="${i}"]`).getAttribute("data-source")) === "missing")
    await expect(ed.getByTestId("booth-tr-flat-out")).toHaveCount(1);
  expect(await smallTargets(page)).toEqual([]);
  for (const id of [
    "booth-tr-preset-fade",
    "booth-tr-audition",
    "booth-tr-start",
    "booth-tr-end",
    "booth-tr-length",
  ])
    await expect(ed.getByTestId(id)).toHaveAttribute("data-hint", /\w/);

  await ed.getByTestId("booth-tr-preset-fade").click();
  await expect(ed.getByTestId("booth-tr-preset-fade")).toHaveAttribute("aria-checked", "true");
  await expect(ed.getByTestId("booth-tr-save")).toBeEnabled();
  // seconds, not bars, for this check (••• → Lengths in seconds when the BPM is known)
  await ed.getByTestId("booth-tr-more").click();
  if (await ed.getByTestId("booth-tr-picker-more-unit").count()) {
    if ((await ed.getByTestId("booth-tr-picker-more-unit").innerText()).includes("seconds"))
      await ed.getByTestId("booth-tr-picker-more-unit").click();
    else await page.keyboard.press("Escape");
  } else await page.keyboard.press("Escape");
  await expect(ed.getByTestId("booth-tr-picker-more")).toHaveCount(0);
  await ed.getByTestId("booth-tr-length").click();
  await ed.getByTestId("booth-tr-picker-length-3").click();
  await expect(ed.getByTestId("booth-tr-length")).toHaveAttribute("data-value", "3");
  await expect(ed.getByTestId("booth-tr-length")).toContainText("3 s");
  await ed.getByTestId("booth-tr-save").click();
  await expect(ed).toHaveCount(0);
  await expect
    .poll(async () => (await planOf(page)).items[i]?.transitionAfter)
    .toMatchObject({ preset: "fade", fadeOutSec: 3, fadeInSec: 3 });
  await expect(marker).toHaveText("Fade 3 s");
  await expect(marker.locator("xpath=..")).toHaveAttribute("data-edited", "true");
  // the night's clock follows (the fade's gap, 1 s, replaces the night's 2.5 s)
  const after = await planOf(page);
  expect(after.wallClockSec).toBeCloseTo(before.wallClockSec - (before.items[i]!.gapAfterSec - 1), 1);

  // after a reload the night still has it, and the editor reopens on it
  await page.reload();
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 20000 });
  await expect
    .poll(async () => (await planOf(page)).items[i]?.transitionAfter?.preset, { timeout: 20000 })
    .toBe("fade");
  await marker.click();
  await expect(ed.getByTestId("booth-tr-preset-fade")).toHaveAttribute("aria-checked", "true");
  await expect(ed.getByTestId("booth-tr-length")).toHaveAttribute("data-value", "3");
  await expect(ed.getByTestId("booth-tr-save")).toBeDisabled();
  await ed.getByTestId("booth-tr-close").click();
  await expect(ed).toHaveCount(0);
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
  const ed = page.getByTestId("booth-transition-sheet");
  const play = ed.getByTestId("booth-tr-audition");
  await expect(play).toHaveAttribute("data-where", "headphones");
  await expect(play).toHaveAttribute("data-hint", /AirPods Pro/);
  await ed.getByTestId("booth-tr-preset-fade").click();
  await play.click();
  await expect(play).toHaveAttribute("aria-pressed", "true", { timeout: 15000 });
  expect(await page.evaluate(() => (window as unknown as { __sinks: string[] }).__sinks)).toContain("hp");
  // where it plays, and a silent side, are said in the ••• menu
  await ed.getByTestId("booth-tr-more").click();
  await expect(ed.getByTestId("booth-tr-hear")).toContainText(/Playing in your headphones \(AirPods Pro\)/);
  if ((await page.locator(`.booth-row[data-plan-index="${i}"]`).getAttribute("data-source")) === "missing")
    await expect(ed.getByTestId("booth-tr-hear-note")).toContainText(/silent in the audition/);
  await page.keyboard.press("Escape");
  await expect(ed.getByTestId("booth-tr-picker-more")).toHaveCount(0);
  // the room plays on, untouched
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing");
  await expect(page.getByTestId("booth-now-title")).toHaveText(nowTitle);
  await play.click();
  await expect(play).toHaveAttribute("aria-pressed", "false");
});

test("Mix → Edit transitions; ••• steps through the night; a song's sheet has Transition…; the tango rules hold", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooth(page);
  await page.getByTestId("booth-mix").click();
  await page.getByTestId("booth-levels-sheet").getByRole("button", { name: "Edit transitions…" }).click();
  const ed = page.getByTestId("booth-transition-sheet");
  await expect(ed.getByTestId("booth-tr-stage")).toBeVisible();
  // ••• → Next transition walks the night's transitions
  const out0 = await ed.getByTestId("booth-tr-out").innerText();
  const in0 = await ed.getByTestId("booth-tr-in").innerText();
  await ed.getByTestId("booth-tr-more").click();
  await ed.getByTestId("booth-tr-picker-more-next").click();
  await expect
    .poll(
      async () =>
        `${await ed.getByTestId("booth-tr-out").innerText()}|${await ed.getByTestId("booth-tr-in").innerText()}`,
    )
    .not.toBe(`${out0}|${in0}`);
  // with an unsaved change, stepping waits for Save or Close
  await ed.getByTestId("booth-tr-preset-fade").click();
  await ed.getByTestId("booth-tr-more").click();
  await expect(ed.getByTestId("booth-tr-picker-more-next")).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(ed).toHaveCount(0);
  // the song sheet's Transition… opens the transition after that song
  const row = page.locator('.booth-tanda[data-tanda="2"] .booth-row[data-kind="track"]').first();
  await row.getByTestId("booth-row-play").click();
  await page.getByTestId("booth-play-sheet").getByRole("button", { name: "Transition…" }).click();
  await expect(ed.getByTestId("booth-tr-out")).toContainText(
    await row.locator(".booth-row-title").innerText(),
  );
  // inside a tanda Blend is an advanced opt-in with a gentle warning (none for Auto)
  await expect(ed.getByTestId("booth-tr-note")).toHaveCount(0);
  await ed.getByTestId("booth-tr-preset-blend").click();
  await expect(ed.getByTestId("booth-tr-note")).toContainText(/Careful: dancers expect/);
  // a blend overlaps: the EQ row offers the centre bass swap, drawn as the pink line
  await ed.getByTestId("booth-tr-eq").click();
  await ed.getByTestId("booth-tr-picker-eq-bassSwap").click();
  await expect(ed.getByTestId("booth-tr-eq")).toContainText("Centre bass swap");
  await expect(ed.getByTestId("booth-tr-eq-out")).toHaveCount(1);
  // the Volume row sets both curves
  await ed.getByTestId("booth-tr-volume").click();
  await ed.getByTestId("booth-tr-picker-volume-sCurve").click();
  await expect(ed.getByTestId("booth-tr-volume")).toContainText("S-curve");
  await page.keyboard.press("Escape");
  // into the closing La Cumparsita: no blend, no rise
  const items = (await planOf(page)).items;
  const last = items.length - 1;
  if (items[last]?.kind === "closing" && items[last - 1]?.kind !== "break") {
    await page.locator(`[data-testid="booth-gap"][data-from="${last - 1}"]`).click();
    await expect(ed.getByTestId("booth-tr-preset-blend")).toBeDisabled();
    await expect(ed.getByTestId("booth-tr-preset-rise")).toBeDisabled();
    await expect(ed.getByTestId("booth-tr-note")).toContainText(/La Cumparsita always plays whole/);
    await expect(ed.getByTestId("booth-tr-in")).toContainText("La Cumparsita");
    // on Auto its length cannot be dragged or set; a Fade can, on the other side only
    await expect(ed.getByTestId("booth-tr-length")).toBeDisabled();
    await ed.getByTestId("booth-tr-preset-fade").click();
    await expect(ed.getByTestId("booth-tr-length")).toBeEnabled();
    // the EQ needs an overlap, which La Cumparsita never has
    await expect(ed.getByTestId("booth-tr-eq")).toBeDisabled();
    if (items[last - 1]?.kind === "cortina")
      await expect(ed.getByTestId("booth-tr-preset-cortinaCut")).toBeVisible();
  }
});

/** A finger (real touch events, a fingertip's radius) pressed at x, y and slid dx px sideways in a few steps. */
async function fingerDrag(page: Page, x: number, y: number, dx: number, steps = 6) {
  const cdp = await page.context().newCDPSession(page);
  const at = (px: number) => [{ x: px, y, radiusX: 11, radiusY: 11, force: 1, id: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(x) });
  for (let k = 1; k <= steps; k++)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(x + (dx * k) / steps) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

async function phoneEditorChecks(page: Page) {
  const ed = page.getByTestId("booth-transition-sheet");
  const vp = page.viewportSize()!;
  // a full-screen page, not a sheet (measured once its entrance has settled)
  await expect
    .poll(async () => (await ed.boundingBox())?.y ?? 99, { timeout: 5000 })
    .toBeLessThanOrEqual(0.5);
  const r = (await ed.boundingBox())!;
  expect(r.x).toBeLessThanOrEqual(0.5);
  expect(r.y).toBeLessThanOrEqual(0.5);
  expect(r.width).toBeGreaterThanOrEqual(vp.width - 1);
  expect(r.height).toBeGreaterThanOrEqual(vp.height - 1);
  // the lanes are full bleed, the panel in the middle 70 %
  const stage = (await ed.getByTestId("booth-tr-stage").boundingBox())!;
  expect(stage.x).toBeLessThanOrEqual(0.5);
  expect(stage.width).toBeGreaterThanOrEqual(vp.width - 1);
  // the reference's order, top to bottom: the outgoing row, the lanes, the length pill, the incoming row, Presets,
  // the preset tiles, Volume
  const y = async (sel: string) => (await ed.locator(sel).first().boundingBox())!.y;
  const order = [
    await y('[data-testid="booth-tr-out"]'),
    await y('[data-testid="booth-tr-stage"]'),
    await y('[data-testid="booth-tr-length"]'),
    await y('[data-testid="booth-tr-in"]'),
    await y(".trx-presets-head"),
    await y('[data-testid="booth-tr-preset-auto"]'),
    await y('[data-testid="booth-tr-volume"]'),
  ];
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  // the lanes take the larger part of the screen
  expect(stage.height).toBeGreaterThan(vp.height * 0.28);
  // the play button sits between the two lanes, on the panel's middle edge
  const play = (await ed.getByTestId("booth-tr-audition").boundingBox())!;
  expect(Math.abs(play.y + play.height / 2 - (stage.y + stage.height / 2))).toBeLessThan(4);
  // nothing sideways
  expect(
    await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(".trx-scroll")!;
      return el.scrollWidth <= el.clientWidth + 1;
    }),
  ).toBe(true);
  expect(await smallTargets(page)).toEqual([]);
}

test("iPhone: open from the gap marker, Fade, a length from the bars pill, drag a box edge, Save, persisted after a reload", async ({
  browser,
}) => {
  const ctx = await browser.newContext(IPHONE);
  const page = await ctx.newPage();
  await openBooth(page);
  await page.getByTestId("booth-set-open").click();
  const set = page.getByTestId("booth-set-sheet");
  const k = await clipPair(page);
  const i = k >= 0 ? k : await song4(page);
  const marker = set.locator(`[data-testid="booth-gap"][data-from="${i}"]`);
  await marker.scrollIntoViewIfNeeded();
  await marker.click();
  const ed = page.getByTestId("booth-transition-sheet");
  await expect(ed.getByTestId("booth-tr-stage")).toBeVisible();
  await phoneEditorChecks(page);
  if (k >= 0) {
    // both sides have a clip: two coloured lanes (low / mid / high)
    await expect(ed.getByTestId("booth-tr-stage")).toHaveAttribute("data-has-bands", "true", {
      timeout: 20000,
    });
    await expect(ed.locator('[data-testid="booth-tr-wave-out"] .trx-band-low')).toHaveCount(2);
  }
  if (SHOTS) {
    await shot(page, "iphone-auto");
  }

  await ed.getByTestId("booth-tr-preset-fade").click();
  if (SHOTS) await shot(page, "iphone-fade");
  // the length pill reads bars when the BPM is known; pick another length from its menu: the shortest one not in
  // use, so the fade out has room to grow (the menu's lengths are sorted, the longest is the limit)
  const pill = ed.getByTestId("booth-tr-length");
  const v0 = await pill.getAttribute("data-value");
  await pill.click();
  const opts = ed.locator('[data-testid^="booth-tr-picker-length-"][role="menuitemradio"]');
  const pickIt = opts.filter({ hasNot: page.locator("svg") }).first();
  const want = (await pickIt.getAttribute("data-testid"))!.replace("booth-tr-picker-length-", "");
  const longest = (await opts.last().getAttribute("data-testid"))!.replace("booth-tr-picker-length-", "");
  expect(Number(want)).toBeLessThan(Number(longest));
  await pickIt.click();
  await expect(pill).toHaveAttribute("data-value", want);
  expect(want).not.toBe(v0);
  // the outgoing box starts where the picked fade out begins
  const box = ed.getByTestId("booth-tr-box");
  await expect(box).toHaveAttribute("data-out-start", String(-Number(want)));
  const start0 = Number(await box.getAttribute("data-out-start"));
  // drag the outgoing box's left edge 50 px left with a finger, straight after the pick (the menu is still fading
  // out: it must let the finger through): the fade out gets longer
  const h = (await ed.getByTestId("booth-tr-start").boundingBox())!;
  await fingerDrag(page, h.x + h.width / 2, h.y + h.height / 2, -50);
  await expect.poll(async () => Number(await box.getAttribute("data-out-start"))).toBeLessThan(start0);
  const dragged = Number(await box.getAttribute("data-out-start"));
  await ed.getByTestId("booth-tr-save").click();
  await expect(ed).toHaveCount(0);
  const saved = (await planOf(page)).items[i]?.transitionAfter;
  expect(saved).toMatchObject({ preset: "fade", fadeOutSec: -dragged });

  await page.reload();
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 20000 });
  await expect
    .poll(async () => (await planOf(page)).items[i]?.transitionAfter?.fadeOutSec, { timeout: 20000 })
    .toBe(-dragged);
  await page.getByTestId("booth-set-open").click();
  await set.locator(`[data-testid="booth-gap"][data-from="${i}"]`).scrollIntoViewIfNeeded();
  await set.locator(`[data-testid="booth-gap"][data-from="${i}"]`).click();
  await expect(ed.getByTestId("booth-tr-preset-fade")).toHaveAttribute("aria-checked", "true");
  await expect(ed.getByTestId("booth-tr-box")).toHaveAttribute("data-out-start", String(dragged));
  await expect(ed.getByTestId("booth-tr-save")).toBeDisabled();

  if (SHOTS) {
    // Blend with the bass swap, as in the reference
    await ed.getByTestId("booth-tr-preset-blend").click();
    await ed.getByTestId("booth-tr-eq").click();
    await ed.getByTestId("booth-tr-picker-eq-bassSwap").click();
    await shot(page, "iphone-blend");
    await ed.getByTestId("booth-tr-more").click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/iphone-more-menu.png` });
  }
  await ctx.close();
});

test("iPad: the same page as a full-height panel at most 760 px wide; the edges drag with the pointer", async ({
  browser,
}) => {
  const ctx = await browser.newContext(IPAD);
  const page = await ctx.newPage();
  await openBooth(page);
  const k = await clipPair(page);
  const i = k >= 0 ? k : await song4(page);
  const marker = page.locator(`[data-testid="booth-gap"][data-from="${i}"]`);
  await marker.scrollIntoViewIfNeeded();
  await marker.click();
  const ed = page.getByTestId("booth-transition-sheet");
  await expect(ed.getByTestId("booth-tr-stage")).toBeVisible();
  await ed.getByTestId("booth-tr-preset-blend").click();
  const r = (await ed.boundingBox())!;
  expect(r.width).toBeLessThanOrEqual(760);
  expect(r.height).toBeGreaterThanOrEqual(1179);
  expect(Math.abs(r.x + r.width / 2 - 410)).toBeLessThan(2);
  const box = ed.getByTestId("booth-tr-box");
  const box0 = Number(await box.getAttribute("data-start"));
  await page.waitForTimeout(400);
  const h = (await ed.getByTestId("booth-tr-start").boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 - 60, h.y + h.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Number(await box.getAttribute("data-start"))).toBeLessThan(box0);
  // the keyboard moves an edge too (a beat, or half a second without a BPM)
  const s1 = Number(await box.getAttribute("data-start"));
  await ed.getByTestId("booth-tr-start").focus();
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => Number(await box.getAttribute("data-start"))).toBeLessThan(s1);
  expect(await smallTargets(page)).toEqual([]);
  if (SHOTS) {
    if (k >= 0)
      await expect(ed.getByTestId("booth-tr-stage")).toHaveAttribute("data-has-bands", "true", {
        timeout: 20000,
      });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/ipad-blend.png` });
  }
  await ctx.close();
});

/* ---------- the owner's iPhone feedback: the tab capsule over the guide box ---------- */

const GUIDE_DEVICES: Array<[string, BrowserContextOptions]> = [
  ["iPhone SE", touch(375, 667)],
  ["iPhone 15 Pro", dev("iPhone 15 Pro")],
  ["iPad split view", touch(507, 1024)],
];

/** The guide box clears the tab capsule, and each of its buttons is the element at its own centre. */
async function guideClear(page: Page, box: string, buttons: string, atLoad = false) {
  const tab = page.getByTestId("tab-bar");
  await expect(tab).toBeVisible();
  const g = page.locator(box);
  await expect(g).toBeVisible();
  const overlaps = async () => {
    const a = (await g.boundingBox())!;
    const t = (await tab.boundingBox())!;
    const vp = page.viewportSize()!;
    // only the part of the box on screen can be under the capsule
    const top = Math.max(a.y, 0);
    const bottom = Math.min(a.y + a.height, vp.height);
    return bottom > t.y + 0.5 && top < t.y + t.height && a.x < t.x + t.width && a.x + a.width > t.x;
  };
  const tappable = (k: number) =>
    page
      .locator(buttons)
      .nth(k)
      .evaluate((el) => {
        const r = el.getBoundingClientRect();
        const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!at && (at === el || el.contains(at));
      });
  const n = await page.locator(buttons).count();
  expect(n).toBeGreaterThan(0);
  if (atLoad) {
    // as the page opens, before any scroll: the whole box and every button in it clear the bottom chrome
    await page
      .getByTestId("bar-compose")
      .waitFor({ state: "visible", timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(1200);
    expect(await overlaps(), `${box} under the tab bar as the page opens`).toBe(false);
    for (let k = 0; k < n; k++)
      expect(await tappable(k), `${buttons} #${k} covered as the page opens`).toBe(true);
  }
  // scrolled to its end: its foot sits above the capsule (and the floating Compose button)
  await g.evaluate((el) => el.scrollIntoView({ block: "end" }));
  await page.waitForTimeout(400);
  expect(await overlaps()).toBe(false);
  for (let k = 0; k < n; k++) {
    await page
      .locator(buttons)
      .nth(k)
      .evaluate((el) => el.scrollIntoView({ block: "nearest" }));
    await page.waitForTimeout(250);
    expect(await tappable(k), `${buttons} #${k} is covered`).toBe(true);
  }
}

for (const [name, use] of GUIDE_DEVICES)
  test(`${name}: the tab capsule never covers the guide box (Compose's first run, the Guide's tour)`, async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    const ctx = await browser.newContext({ ...use });
    const page = await ctx.newPage();
    await page.goto("/");
    await guideClear(
      page,
      '[data-testid="first-run"]',
      '[data-testid="featured-card"], [data-testid="first-run-build"]',
      true,
    );
    // the Guide's tour: its last chapter and its link
    await page.goto("/guide");
    await guideClear(
      page,
      '[data-testid="guide-tour"] section:last-of-type',
      '[data-testid="guide-tour"] section:last-of-type a',
    );
    if (SHOTS && name === "iPhone 15 Pro") {
      const c2 = await browser.newContext(IPHONE);
      const p2 = await c2.newPage();
      await p2.goto("/");
      await p2.getByTestId("first-run").waitFor();
      await p2.waitForTimeout(1200);
      await p2.evaluate(() => {
        for (const el of document.querySelectorAll<HTMLElement>("nextjs-portal")) el.style.display = "none";
      });
      await p2.screenshot({ path: `${SHOTS}/iphone-compose-guide.png` });
      await c2.close();
    }
    await ctx.close();
  });
