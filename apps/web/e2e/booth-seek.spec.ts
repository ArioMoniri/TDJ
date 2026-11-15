/**
 * 2026-11 (the owner, before a night: "can't start on whatever song I want by clicking on it, also can't go one
 * ahead or before"; "can't change the start point and slide the song"; "the song finder should find songs from the
 * created playlist"): start from any row, Previous / Next now, Play now mid-night, the seek bar, the start point
 * and tonight's search — with 30 s clips, on a desktop and on an iPhone 15 Pro (Chromium with its viewport, scale,
 * touch and user agent).
 */
import { type BrowserContextOptions, devices, expect, type Page, test } from "@playwright/test";

function wav(sec = 30): Buffer {
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

async function openBooth(page: Page) {
  // against `next dev` its overlay's badge sits over the phone transport's first button (Previous): not the app's
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
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
}

type Snap = { planIndex: number; state: string; started: boolean; position: number; cur: number | null };
const snap = (page: Page) =>
  page.evaluate(() => {
    const s = (
      window as unknown as {
        __tdjBooth: {
          getState: () => {
            planIndex: number;
            state: string;
            started: boolean;
            position: number;
            current: { planIndex: number } | null;
          };
        };
      }
    ).__tdjBooth.getState();
    return {
      planIndex: s.planIndex,
      state: s.state,
      started: s.started,
      position: s.position,
      cur: s.current?.planIndex ?? null,
    } as Snap;
  });
/** the next row after `i` that has a source and is not a break */
const nextPlayable = (page: Page, i: number, dir = 1) =>
  page.evaluate(
    ([from, d]) => {
      const s = (
        window as unknown as {
          __tdjBooth: { getState: () => { sources: string[]; plan: { items: Array<{ kind: string }> } } };
        }
      ).__tdjBooth.getState();
      for (let k = from + d; k >= 0 && k < s.plan.items.length; k += d)
        if (s.sources[k] !== "missing" && s.plan.items[k]!.kind !== "break") return k;
      return -1;
    },
    [i, dir] as const,
  );

const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 15 Pro"];
const DEVICES: Array<[string, BrowserContextOptions]> = [
  ["desktop", { viewport: { width: 1440, height: 900 } }],
  ["iPhone 15 Pro", iphone],
];

for (const [name, opts] of DEVICES) {
  const phone = name !== "desktop";
  /** the set list: the column on a desktop, a sheet on a phone */
  const setList = async (page: Page) => {
    if (!phone) return page.getByTestId("booth-set").first();
    if (!(await page.getByTestId("booth-set-sheet").isVisible()))
      await page.getByTestId("booth-set-open").click();
    const sheet = page.getByTestId("booth-set-sheet");
    await expect(sheet).toBeVisible();
    return sheet;
  };
  const closeSetList = async (page: Page) => {
    if (!phone) return;
    await page.getByTestId("booth-set-sheet").getByRole("button", { name: "Done" }).click();
    await expect(page.getByTestId("booth-set-sheet")).toHaveCount(0);
  };
  const tapRow = async (page: Page, i: number) => {
    const list = await setList(page);
    const row = list.locator(`.booth-row[data-plan-index="${i}"]`);
    await row.scrollIntoViewIfNeeded();
    // the row's number column (not the title): the whole row takes the tap
    if (phone) await row.locator(".booth-row-n").tap();
    else await row.locator(".booth-row-n").click();
  };

  test(`${name}: tap song 3 → Start plays song 3; Next → song 4; Previous → back; mid-night Play now`, async ({
    browser,
  }) => {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await openBooth(page);
    const list = await setList(page);
    const third = Number(
      await list.locator('.booth-row[data-kind="track"]').nth(2).getAttribute("data-plan-index"),
    );
    const title3 = (await page.evaluate(
      (i) =>
        (window as unknown as { __tdjBoothPlan: { items: Array<{ title: string }> } }).__tdjBoothPlan.items[
          i
        ]!.title,
      third,
    )) as string;
    await tapRow(page, third);
    // the tap selects it: the playhead and the Now card are on it before the night
    await expect.poll(async () => (await snap(page)).planIndex).toBe(third);
    await expect(page.getByTestId("booth-now-title")).toHaveText(title3);
    // the sheet it opened offers "Start the night here"; Done, then the transport's Start
    const ps = page.getByTestId("booth-play-sheet");
    await expect(ps.getByRole("button", { name: "Start the night here" })).toBeVisible();
    await ps.getByRole("button", { name: "Done" }).click();
    await expect(ps).toHaveCount(0);
    await closeSetList(page);
    await page.getByTestId("booth-start").click();
    await expect.poll(async () => (await snap(page)).cur, { timeout: 20000 }).toBe(third);
    expect((await snap(page)).state).toBe("playing");
    await expect(page.getByTestId("booth-now-title")).toHaveText(title3);

    // Next (now) → song 4
    const fourth = await nextPlayable(page, third);
    const prevBtn = page.getByTestId("booth-prev");
    const nextBtn = page.getByTestId("booth-next-now");
    for (const b of [prevBtn, nextBtn]) {
      const r = (await b.boundingBox())!;
      expect(r.width).toBeGreaterThanOrEqual(43.5);
      expect(r.height).toBeGreaterThanOrEqual(43.5);
    }
    await nextBtn.click();
    await expect.poll(async () => (await snap(page)).cur, { timeout: 15000 }).toBe(fourth);
    expect(["playing", "cortina"]).toContain((await snap(page)).state);
    // Previous (under 3 s in) → back to song 3
    await prevBtn.click();
    await expect.poll(async () => (await snap(page)).cur, { timeout: 15000 }).toBe(third);
    // Previous past 3 s restarts it
    await expect.poll(async () => (await snap(page)).position, { timeout: 15000 }).toBeGreaterThan(3.5);
    await prevBtn.click();
    await expect.poll(async () => (await snap(page)).position, { timeout: 10000 }).toBeLessThan(3);
    expect((await snap(page)).cur).toBe(third);

    // mid-night: a tap on a later row offers Play now (one obvious tap), it plays
    const later = await nextPlayable(page, fourth + 3);
    await tapRow(page, later);
    const sheet = page.getByTestId("booth-play-sheet");
    await expect(sheet).toBeVisible();
    // one tap did not cut the room
    expect((await snap(page)).cur).toBe(third);
    await sheet.getByRole("button", { name: "Play now (fade the current)" }).click();
    await expect.poll(async () => (await snap(page)).cur, { timeout: 15000 }).toBe(later);
    expect((await snap(page)).state).toBe("playing");
    // the phone's set list closed so the Now card shows it
    if (phone) await expect(page.getByTestId("booth-set-sheet")).toHaveCount(0);
    await expect(
      page.getByTestId("booth-strip-now").or(page.getByTestId("booth-now-title")).first(),
    ).toBeVisible();
    // the night's record (the log saved with the night) follows every jump
    const log = await page.evaluate(() =>
      (
        window as unknown as {
          __tdjBoothEngine: () => { snapshot: () => { planIndex: number; log: Array<{ reason?: string }> } };
        }
      )
        .__tdjBoothEngine()
        .snapshot(),
    );
    expect(log.planIndex).toBe(later);
    expect(log.log.map((l) => l.reason)).toEqual(expect.arrayContaining(["start", "play now"]));
    await ctx.close();
  });

  test(`${name}: the seek bar — drag, tap; the times follow`, async ({ browser }) => {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await openBooth(page);
    const bar = page.getByTestId("booth-seek");
    await expect(bar).toHaveAttribute("aria-disabled", "true");
    await page.getByTestId("booth-start").click();
    await expect.poll(async () => (await snap(page)).state, { timeout: 20000 }).toBe("playing");
    await expect(bar).not.toHaveAttribute("aria-disabled", "true");
    const box = (await bar.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(43.5);
    const len = Number(await bar.getAttribute("aria-valuemax"));
    expect(len).toBeGreaterThan(10);
    const ttc0 = await page.getByTestId("booth-ttc").innerText();
    // drag the thumb from the start to 60 %
    const y = box.y + box.height / 2;
    if (phone) {
      // touch: a tap at 60 %
      await page.touchscreen.tap(box.x + box.width * 0.6, y);
    } else {
      await page.mouse.move(box.x + 2, y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.3, y, { steps: 4 });
      await page.mouse.move(box.x + box.width * 0.6, y, { steps: 4 });
      await page.mouse.up();
    }
    await expect
      .poll(async () => (await snap(page)).position, { timeout: 10000 })
      .toBeGreaterThan(len * 0.6 - 1.5);
    expect((await snap(page)).position).toBeLessThan(len * 0.6 + 3);
    expect((await snap(page)).state).toBe("playing");
    // time to La Cumparsita moved with it
    await expect(page.getByTestId("booth-ttc")).not.toHaveText(ttc0);
    // a tap near the start goes back
    if (phone) await page.touchscreen.tap(box.x + box.width * 0.1, y);
    else await page.mouse.click(box.x + box.width * 0.1, y);
    await expect
      .poll(async () => (await snap(page)).position, { timeout: 10000 })
      .toBeLessThan(len * 0.1 + 2.5);
    if (!phone) {
      // the keyboard: focus the bar, → is +5 s (the night's → is not triggered)
      const cur = (await snap(page)).cur;
      await bar.focus();
      const p0 = (await snap(page)).position;
      await page.keyboard.press("ArrowRight");
      await expect.poll(async () => (await snap(page)).position, { timeout: 5000 }).toBeGreaterThan(p0 + 4);
      expect((await snap(page)).cur).toBe(cur);
    }
    await ctx.close();
  });

  test(`${name}: a start point per song — set as a number, saved with the night, reset in one tap`, async ({
    browser,
  }) => {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await openBooth(page);
    const list = await setList(page);
    const i = Number(
      await list.locator('.booth-row[data-kind="track"]').nth(4).getAttribute("data-plan-index"),
    );
    // a tap before the night selects the row and opens its sheet
    await tapRow(page, i);
    await expect.poll(async () => (await snap(page)).planIndex).toBe(i);
    const sheet = page.getByTestId("booth-play-sheet");
    await expect(sheet).toBeVisible();
    const input = sheet.getByTestId("booth-start-at");
    await input.scrollIntoViewIfNeeded();
    await input.fill("0:08");
    await input.press("Enter");
    await expect(sheet.getByTestId("booth-start-point")).toContainText("Start at 0:08");
    await expect(sheet.getByTestId("booth-cue-in-label")).toHaveText("Cue 0:08");
    const cued = () =>
      page.evaluate((k) => {
        const s = (
          window as unknown as {
            __tdjBooth: {
              getState: () => {
                plan: { items: Array<{ id: string; trimInSec?: number; cued?: boolean }> };
                playlist: { booth?: { songCues?: Record<string, { inSec?: number }> } };
              };
            };
          }
        ).__tdjBooth.getState();
        const it = s.plan.items[k]!;
        return {
          cued: !!it.cued,
          trimIn: it.trimInSec ?? 0,
          saved: s.playlist.booth?.songCues?.[it.id]?.inSec,
        };
      }, i);
    await expect.poll(cued).toEqual({ cued: true, trimIn: 8, saved: 8 });
    // the night starts there, from the start point
    await sheet.getByRole("button", { name: "Start the night here" }).click();
    await expect.poll(async () => (await snap(page)).cur, { timeout: 20000 }).toBe(i);
    // reset: one tap
    await tapRow(page, i);
    await expect(sheet).toBeVisible();
    // (the playing song is read-only: a later one takes a start point and a reset)
    await sheet.getByRole("button", { name: "Done" }).click();
    const j = await nextPlayable(page, i);
    await tapRow(page, j);
    await expect(sheet).toBeVisible();
    await sheet.getByTestId("booth-start-at").fill("5");
    await sheet.getByTestId("booth-start-at").press("Enter");
    await expect(sheet.getByTestId("booth-start-point")).toContainText("Start at 0:05");
    await sheet.getByTestId("booth-start-reset").click();
    await expect(sheet.getByTestId("booth-start-point")).toContainText("Start at 0:00");
    await expect(sheet.getByTestId("booth-start-reset")).toHaveCount(0);
    await ctx.close();
  });

  test(`${name}: the Controls panel opens and closes (remembered after a reload); Next, volume, Fade out now`, async ({
    browser,
  }) => {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await openBooth(page);
    const panel = page.getByTestId("booth-controls");
    const toggle = page.getByTestId("booth-controls-toggle");
    // collapsed: the handle and the essential transport only
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(panel.getByTestId("ctl-next")).toBeVisible();
    await expect(panel.getByTestId("ctl-master")).toHaveCount(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(panel.getByTestId("ctl-master")).toBeVisible();
    // it stays clear of the transport and the tab bar
    const p = (await panel.boundingBox())!;
    const strip = (await page.getByTestId("booth-strip").boundingBox())!;
    expect(p.y + p.height).toBeLessThanOrEqual(strip.y + 1);
    await page.reload();
    await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId("booth-ttc")).not.toHaveAttribute("data-resolving", "1", {
      timeout: 30000,
    });
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    // every control is ≥ 44 px
    const small = await page.evaluate(
      () =>
        [...document.querySelectorAll<HTMLElement>('[data-testid="booth-controls"] button')]
          .filter((b) => b.offsetParent)
          .map((b) => b.getBoundingClientRect())
          .filter((r) => r.width < 43.5 || r.height < 43.5).length,
    );
    expect(small).toBe(0);
    // Start from the panel, then Next
    await panel.getByTestId("ctl-play").click();
    await expect.poll(async () => (await snap(page)).state, { timeout: 20000 }).toBe("playing");
    const first = (await snap(page)).cur!;
    const second = await nextPlayable(page, first);
    await panel.getByTestId("ctl-next").click();
    await expect.poll(async () => (await snap(page)).cur, { timeout: 15000 }).toBe(second);
    // the master volume
    await panel.getByTestId("ctl-master").locator("input").fill("-6");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as unknown as { __tdjBooth: { getState: () => { master: number } } }
            ).__tdjBooth.getState().master,
        ),
      )
      .toBe(-6);
    // Fade out now (once the song sounds: Next starts it after the short fade)
    await expect.poll(async () => (await snap(page)).position, { timeout: 15000 }).toBeGreaterThan(1);
    await panel.getByTestId("ctl-fade").scrollIntoViewIfNeeded();
    await panel.getByTestId("ctl-fade").click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as unknown as { __tdjBoothEngine: () => { log: Array<{ reason?: string }> } })
            .__tdjBoothEngine()
            .log.some((l) => l.reason === "fade out now"),
        ),
      )
      .toBe(true);
    // collapse: remembered too
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await page.reload();
    await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 30000 });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await ctx.close();
  });
}

test("tonight's search: Garúa is Láurenz in T5 and plays; a song not tonight shows nothing until the whole catalogue", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openBooth(page);
  await page.getByTestId("booth-find-songs").click();
  const sheet = page.getByTestId("booth-tonight-search");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("radio", { name: "Tonight" })).toHaveAttribute("aria-checked", "true");
  await sheet.getByTestId("booth-tonight-q").fill("Garúa");
  const hit = sheet.getByTestId("booth-tonight-hit").first();
  await expect(hit).toContainText("Láurenz");
  await expect(hit.getByTestId("booth-tonight-where")).toHaveText(/^T5 · \d$/);
  const i = Number(await hit.getAttribute("data-plan-index"));
  for (const b of await hit.getByRole("button").all()) {
    const r = (await b.boundingBox())!;
    expect(r.height).toBeGreaterThanOrEqual(43.5);
  }
  await hit.getByTestId("booth-tonight-play").click();
  await expect(sheet).toHaveCount(0);
  await expect.poll(async () => (await snap(page)).cur, { timeout: 20000 }).toBe(i);
  await expect(page.getByTestId("booth-now-title")).toHaveText("Garúa");
  // a song that is not in tonight's night: nothing, until the whole catalogue
  await page.getByTestId("booth-find-songs").click();
  await expect(sheet.getByRole("radio", { name: "Tonight" })).toHaveAttribute("aria-checked", "true");
  await sheet.getByTestId("booth-tonight-q").fill("Bahía Blanca");
  await expect(sheet.getByTestId("booth-tonight-empty")).toBeVisible();
  await expect(sheet.getByTestId("booth-tonight-hit")).toHaveCount(0);
  await sheet.getByRole("radio", { name: "Whole catalogue" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId("song-search")).toBeVisible();
  // T5 lists that tanda (and Enter goes to it in the set list); tonight is the scope again
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("song-search")).toHaveCount(0);
  await page.getByTestId("booth-find-songs").click();
  await sheet.getByTestId("booth-tonight-q").fill("T5");
  await expect(sheet.getByTestId("booth-tonight-hit").first().getByTestId("booth-tonight-where")).toHaveText(
    "T5 · 1",
  );
});
