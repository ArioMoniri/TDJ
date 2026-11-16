/**
 * Round 22 (docs/ROADMAP.md §1, §4, §12; docs/design/r22-ia.md §4): the player laid out like a DJ app — the deck
 * and the set list side by side (a sheet on phones), the labelled transport in one fixed place, ROOM and HEADPHONES
 * outputs with a pre-listen that never reaches the room, tap any song to play / pre-listen / cue it / play another
 * version, the vertical energy chart with "we are here", and every indicator switchable with an explanation.
 */
import { expect, type Page, test } from "@playwright/test";
import { boothAction } from "./confirm";

function wav(sec = 12): Buffer {
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

type Outputs = "two" | "safari";
/** Two outputs (this device + AirPods) and a recording setSinkId; or Safari: no setSinkId at all. */
async function fakeOutputs(page: Page, mode: Outputs) {
  await page.addInitScript((m) => {
    const w = window as unknown as { __sinks: string[] };
    w.__sinks = [];
    if (m === "safari") {
      delete (HTMLMediaElement.prototype as unknown as { setSinkId?: unknown }).setSinkId;
      return;
    }
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
  }, mode);
}

async function openBooth(page: Page, o: { outputs?: Outputs; versions?: boolean } = {}) {
  if (o.outputs) await fakeOutputs(page, o.outputs);
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
  if (o.versions)
    // the catalogue answers with a second take of the searched side (same title, same orchestra, 1955)
    await page.route(/\/api\/search\?/, async (route) => {
      const res = await route.fetch();
      const list = (await res.json()) as Array<Record<string, unknown>>;
      const first = list[0];
      const extra = first
        ? [{ ...first, id: "take-1955", year: 1955, singer: "Tino García", resolved: null }]
        : [];
      await route.fulfill({ response: res, json: [...list, ...extra] });
    });
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/);
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("booth-ttc")).not.toHaveAttribute("data-resolving", "1", { timeout: 30000 });
}
const planOf = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __tdjBoothPlan: { items: Array<{ id?: string; kind: string; trimInSec?: number; cued?: boolean }> };
        }
      ).__tdjBoothPlan.items,
  );

test("1440: deck beside the set list, the labelled transport in one place, the night tools in the night bar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooth(page);
  const box = async (id: string) => (await page.getByTestId(id).first().boundingBox())!;
  const now = await box("booth-now");
  const set = await box("booth-set");
  expect(set.x).toBeGreaterThan(now.x + now.width - 1);
  // the night bar sits on top of the set list
  expect((await box("booth-time")).y).toBeLessThan(set.y);
  // the outputs: a glyph and a word each
  await expect(page.getByTestId("booth-out-room")).toContainText("Room");
  await expect(page.getByTestId("booth-out-cue")).toContainText("Headphones");
  // the transport: every control on the playing song, labelled
  const strip = page.getByTestId("booth-strip");
  for (const name of ["Fade", "Crossfade", "Skip next", "Mute", "Hold", "Talk", "Mix"])
    await expect(strip.getByText(name, { exact: true })).toBeVisible();
  await expect(strip.getByTestId("booth-strip-now")).toContainText(
    await page.getByTestId("booth-now-title").innerText(),
  );
  // the night tools
  for (const id of [
    "booth-rest-cumparsita",
    "booth-jump-cumparsita",
    "booth-last4",
    "booth-night-break",
    "booth-night-birthday",
  ])
    await expect(page.getByTestId(id)).toBeVisible();
  // the energy chart: one dot per tanda, "we are here" at the top before the night
  const rail = page.getByTestId("booth-energy-rail");
  await expect(rail).toBeVisible();
  await expect(rail.locator("circle")).toHaveCount(25);
  await expect(rail).toContainText("we are here");
  // indicators on the rows: artwork and the era badge
  const row = page.locator('.booth-row[data-kind="track"]').first();
  await expect(row.getByTestId("booth-art")).toBeVisible();
  await expect(row.getByTestId("booth-era")).toBeVisible();
  // every interactive control in the transport and the night bar is ≥ 44 px
  const small = await page.evaluate(
    () =>
      [...document.querySelectorAll<HTMLElement>('[data-testid="booth-strip"] button, .booth-night button')]
        .filter((b) => b.offsetParent)
        .map((b) => b.getBoundingClientRect())
        .filter((r) => r.width < 43.5 || r.height < 43.5).length,
  );
  expect(small).toBe(0);
  // no engineer-facing words on the page
  await expect(page.getByTestId("booth")).not.toContainText(/TDJ_|undefined|NaN|env var/);
});

test("hover explains an indicator; Show and Settings turn indicators off everywhere", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooth(page);
  const era = page.locator('.booth-row[data-kind="track"]').first().getByTestId("booth-era");
  await era.hover();
  await expect(page.getByTestId("booth-hint")).toContainText(/Era: .*years/);
  // Show: era off → no badge anywhere; artwork off → no covers
  await page.getByTestId("booth-show").click();
  const sheet = page.getByTestId("booth-show-sheet");
  await expect(sheet.getByTestId("booth-era-legend")).toContainText("Best years");
  await sheet.getByRole("switch", { name: "Era badge" }).click();
  await sheet.getByRole("switch", { name: "Artwork" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("booth-era")).toHaveCount(0);
  await expect(page.getByTestId("booth-art")).toHaveCount(0);
  // the same switches in Settings, with their one-line explanations
  await page.goto("/settings");
  const group = page.getByTestId("indicator-switches");
  await expect(group).toContainText("best years");
  await expect(group.getByRole("switch", { name: "Era badge" })).not.toBeChecked();
  await group.getByRole("switch", { name: "Era badge" }).click();
  await group.getByRole("switch", { name: "Energy" }).click();
  await page.goBack();
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 20000 });
  await expect(page.locator('.booth-row[data-kind="track"]').first().getByTestId("booth-era")).toBeVisible();
  await expect(page.getByTestId("booth-energy-rail")).toHaveCount(0);
});

test("headphone pre-listen: the cue goes to the headphones output, the room keeps playing, the UI says HEADPHONES", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooth(page, { outputs: "two" });
  await page.getByTestId("booth-out-cue").click();
  const out = page.getByTestId("booth-output-sheet");
  await expect(out.locator('[data-device="hp"]')).toContainText("AirPods Pro");
  await out.locator('[data-device="hp"]').click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("booth-out-cue")).toContainText("AirPods Pro");
  await page.getByTestId("booth-start").click();
  await expect(page.getByTestId("booth-pause")).toBeVisible({ timeout: 20000 });
  const nowTitle = await page.getByTestId("booth-now-title").innerText();
  const target = page.locator('.booth-row[data-kind="track"]').nth(6);
  // the row's sheet offers the pre-listen in the headphones
  await target.getByTestId("booth-row-open").click();
  const sheet = page.getByTestId("booth-play-sheet");
  await expect(sheet.getByTestId("booth-prelisten")).toHaveAttribute("data-where", "headphones");
  await expect(sheet.getByTestId("booth-prelisten")).toContainText("Pre-listen in headphones");
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  // 2026-11: mid-night, with headphones chosen, one tap on the row pre-listens it at once (the room untouched)
  await target.getByTestId("booth-row-play").click();
  await expect(target).toHaveAttribute("data-cue", "true", { timeout: 10000 });
  // the cue element was sent to the headphones; the room still plays the same song
  expect(await page.evaluate(() => (window as unknown as { __sinks: string[] }).__sinks)).toContain("hp");
  const line = page.getByTestId("booth-cueline");
  await expect(line).toContainText("Headphones");
  await expect(page.getByTestId("booth-out-cue")).toHaveAttribute("data-live", "true");
  await expect(page.getByTestId("booth-now-title")).toHaveText(nowTitle);
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing");
  await page.getByTestId("booth-cueline-stop").click();
  await expect(line).toHaveCount(0);
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing");
});

test("Safari (no setSinkId): the headphones picker is hidden and explained; no pre-listen during the night", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooth(page, { outputs: "safari" });
  await expect(page.getByTestId("booth-out-cue")).toHaveCount(0);
  const chip = page.getByTestId("booth-out-cue-unsupported");
  await expect(chip).toHaveAttribute("data-hint", /Safari/);
  await chip.hover();
  await expect(page.getByTestId("booth-hint")).toContainText(/second output/);
  // before the night the row's sheet tests the song on this device, said so
  const row = page.locator('.booth-row[data-kind="track"]').nth(2);
  await row.getByTestId("booth-row-open").click();
  const sheet = page.getByTestId("booth-play-sheet");
  await expect(sheet.getByTestId("booth-prelisten")).toHaveAttribute("data-where", "device");
  await sheet.getByTestId("booth-prelisten").click();
  await expect(row).toHaveAttribute("data-auditioning", "true", { timeout: 10000 });
  await expect(page.getByTestId("booth-cueline")).toContainText("This device");
  await page.keyboard.press("Escape");
  // during the night the room's output is never used for a pre-listen
  await page.getByTestId("booth-start").click();
  await expect(page.getByTestId("booth-pause")).toBeVisible({ timeout: 20000 });
  // no headphones: a tap opens the sheet with Play now in the room armed (one more tap plays)
  await page.locator('.booth-row[data-kind="track"]').nth(6).getByTestId("booth-row-play").click();
  await expect(sheet.getByRole("button", { name: "Play next" })).toBeVisible();
  await expect(sheet.getByTestId("booth-play-now")).toHaveAttribute("data-armed", "true");
  await expect(sheet.getByTestId("booth-prelisten")).toHaveCount(0);
  await expect(sheet).toContainText(/Safari/);
});

test("song sheet: drag-free cue / stop with the keyboard re-times the plan; another version plays tonight", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooth(page, { versions: true });
  const row = page.locator('.booth-row[data-kind="track"]').nth(3);
  const idx = Number(await row.getAttribute("data-plan-index"));
  await row.getByTestId("booth-row-open").click();
  const sheet = page.getByTestId("booth-play-sheet");
  await expect(sheet.getByRole("button", { name: "Start the night here" })).toBeVisible();
  const cueIn = sheet.getByTestId("booth-cue-in");
  await cueIn.focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press("Shift+ArrowRight");
  await expect(sheet.getByTestId("booth-cue-in-label")).toHaveText("Cue 0:15");
  await expect.poll(async () => (await planOf(page))[idx]).toMatchObject({ trimInSec: 15, cued: true });
  // the stop handle, dragged with the pointer
  const wave = (await sheet.getByTestId("booth-wave").boundingBox())!;
  const out = (await sheet.getByTestId("booth-cue-out").boundingBox())!;
  await page.mouse.move(out.x + out.width / 2 - 8, out.y + out.height / 2);
  await page.mouse.down();
  await page.mouse.move(wave.x + wave.width * 0.8, out.y + out.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect
    .poll(async () => ((await planOf(page))[idx] as { stopSec?: number } | undefined)?.stopSec ?? 0)
    .toBeGreaterThan(15);
  // versions: the 1955 take is listed and plays tonight instead
  const v = sheet.getByTestId("booth-version").filter({ hasText: "1955" });
  await expect(v).toBeVisible({ timeout: 20000 });
  await v.getByTestId("booth-version-use").click();
  // a 1955 take in a 1941 tanda breaks the close-years rule: the rule check asks first, the DJ keeps the choice
  const asSaid = page.getByTestId("rule-as-said");
  await expect(asSaid).toBeVisible({ timeout: 10000 });
  await asSaid.click();
  await expect.poll(async () => (await planOf(page))[idx]?.id).toBe("take-1955");
});

test("Mix: a transition style sets gap, end fade and crossfade, each explained; cortina length re-times the night", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooth(page);
  await page.getByTestId("booth-mix").click();
  const mix = page.getByTestId("booth-levels-sheet");
  await mix.getByRole("radio", { name: "Smooth" }).click();
  await expect(mix.getByTestId("booth-mix-gap")).toContainText("1 s");
  await expect(mix.getByTestId("booth-mix-transitions")).toContainText(/automix/);
  await expect(mix.getByTestId("booth-mix-gap")).toContainText(/Silence between two items/);
  // (a rehearsal caps every item at 30 s, so the plan's own clock is what moves)
  const clock = () =>
    page.evaluate(
      () => (window as unknown as { __tdjBoothPlan: { wallClockSec: number } }).__tdjBoothPlan.wallClockSec,
    );
  const before = await clock();
  await mix
    .getByTestId("booth-mix-cortina-length")
    .getByRole("button", { name: "Decrease cortina length" })
    .click();
  await expect.poll(clock).toBeLessThan(before);
});

test("phone: the set list is a sheet, the transport keeps one row, the night bar is on the deck", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  await openBooth(page);
  await expect(page.getByTestId("booth-set")).toHaveCount(0);
  await expect(page.getByTestId("booth-time")).toBeVisible();
  expect((await page.getByTestId("booth-strip").boundingBox())!.height).toBeLessThanOrEqual(72);
  await boothAction(page, "booth-set-open");
  const sheet = page.getByTestId("booth-set-sheet");
  await expect(sheet.getByTestId("booth-set")).toBeVisible();
  await sheet.locator('.booth-row[data-kind="track"]').nth(2).getByTestId("booth-row-open").click();
  await expect(page.getByTestId("booth-play-sheet")).toBeVisible();
  await ctx.close();
});
