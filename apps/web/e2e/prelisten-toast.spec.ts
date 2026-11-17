/**
 * 2026-11 — the owner, on /library while the Booth played a night: "the text in the banner won't slide to see what is
 * written, and I can't play these songs even when there is another device connected".
 * 1. A long toast is readable whole (up to three lines, then all of it on hover / focus / a tap), held while hovered,
 *    with its ✕, on a desktop and a phone; the screen reader's live region has every word; it never covers the
 *    mini player's controls.
 * 2. The Booth plays a night to the room and the headphones are set: play on a Library row pre-listens there at
 *    once — "In your headphones" on the night's mini bar, with Stop — and the room is untouched.
 * 3. No headphones set: one question — Choose headphones (the outputs other than the room's) or "Play on this
 *    device's speaker anyway" (offered only because it is not the room's output); either plays there, never the room.
 * Audio outputs are faked: enumerateDevices, a recording setSinkId on media elements and on the room's AudioContext.
 */
import { type Browser, expect, type Page, test } from "@playwright/test";

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

const LONG =
  "The Booth is playing a night, so this stays out of the room: Pick your headphones first — HEADPHONES at the top of the Booth — or play it on this device's speaker when that is not the room's output.";
const MEDIUM = "Saved to your library: Que Nunca Me Falte by Ricardo Tanturi, 1940";

/* ---------------- 1. toasts ---------------- */

/** a toast with Undo (10 s of its own), or an informational one (3.5 s, more for a long text) */
const raise = (page: Page, text: string, undo = true) =>
  page.evaluate(
    ([t, u]) => {
      (window as unknown as { __tdjToast: (t: string, u?: () => void, l?: string) => void }).__tdjToast(
        t as string,
        u ? () => {} : undefined,
        u ? "Undo" : undefined,
      );
    },
    [text, undo] as const,
  );

async function openPage(browser: Browser, phone: boolean) {
  const ctx = await browser.newContext(
    phone
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 900 } },
  );
  const page = await ctx.newPage();
  await page.goto("/library");
  await page.waitForFunction(() => !!(window as unknown as { __tdjToast?: unknown }).__tdjToast);
  return { ctx, page };
}

/** the words fit their box (nothing cut) */
const whole = (page: Page) =>
  page.getByTestId("toast-text").evaluate((e) => e.scrollHeight <= e.clientHeight + 1);

for (const phone of [false, true]) {
  test(`a long toast is readable whole (${phone ? "phone" : "desktop"})`, async ({ browser }) => {
    const { ctx, page } = await openPage(browser, phone);
    await raise(page, LONG);
    const toastEl = page.getByTestId("toast");
    await expect(toastEl).toBeVisible();
    const text = page.getByTestId("toast-text");
    // every word is in the toast and in its live region (the screen reader reads it whole)
    await expect(text).toHaveText(LONG);
    await expect(page.getByRole("status").filter({ hasText: LONG })).toHaveCount(1);
    // at most three lines folded, never one line cut with an ellipsis
    const lh = await text.evaluate((e) => Number.parseFloat(getComputedStyle(e).lineHeight));
    const h = (await text.boundingBox())!.height;
    expect(h).toBeGreaterThan(lh * 1.5);
    expect(h).toBeLessThanOrEqual(lh * 3 + 14);
    expect(await text.evaluate((e) => getComputedStyle(e).textOverflow)).not.toBe("ellipsis");
    // the ✕ is there, a 44 px target
    const close = page.getByTestId("toast-close");
    const cb = (await close.boundingBox())!;
    expect(Math.min(cb.width, cb.height)).toBeGreaterThanOrEqual(43.5);
    if (phone) {
      // a tap opens it whole (and holds it); a second tap folds it
      await text.tap();
      await expect(text).toHaveAttribute("data-open", "true");
      await expect(text).toHaveAttribute("aria-expanded", "true");
      expect(await whole(page)).toBe(true);
      await page.waitForTimeout(13_000);
      await expect(toastEl).toBeVisible();
      await text.tap();
      await expect(text).not.toHaveAttribute("data-open", "true");
    } else {
      // the pointer over it shows it whole; keyboard focus does too
      await toastEl.hover();
      await expect.poll(() => whole(page)).toBe(true);
      await page.mouse.move(5, 450);
      await expect.poll(() => whole(page)).toBe(false);
      await text.focus();
      await expect.poll(() => whole(page)).toBe(true);
      await text.blur();
    }
    // the whole toast inside the viewport
    const tb = (await toastEl.boundingBox())!;
    const vp = page.viewportSize()!;
    expect(tb.x).toBeGreaterThanOrEqual(0);
    expect(tb.x + tb.width).toBeLessThanOrEqual(vp.width + 0.5);
    expect(tb.y + tb.height).toBeLessThanOrEqual(vp.height);
    await close.click();
    await expect(toastEl).toHaveCount(0);
    await ctx.close();
  });
}

test("hovering a toast holds it past its time; it goes once the pointer leaves", async ({ browser }) => {
  const { ctx, page } = await openPage(browser, false);
  await raise(page, MEDIUM, false);
  const toastEl = page.getByTestId("toast");
  await toastEl.hover();
  // its reading time is about 6.5 s: hovered, it is still there after 8 s
  await page.waitForTimeout(8000);
  await expect(toastEl).toBeVisible();
  await page.mouse.move(5, 450);
  await expect(toastEl).toHaveCount(0, { timeout: 10_000 });
  await ctx.close();
});

/* ---------------- the Library's artist line ---------------- */

test("Gardel's guitarists read as names on the Library's rows; the search still finds and marks them", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/library");
  await page.getByLabel("Search the library").first().fill("barbieri gardel");
  const row = page.getByTestId("library-row").first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row).toContainText("Guillermo Barbieri");
  await expect(row).toContainText("(guitars)");
  await expect(row).toContainText("Carlos Gardel");
  await expect(row).not.toContainText("G.barbieri");
  // the matched surname is marked in the shown name
  await expect(row.locator("mark.search-hit").filter({ hasText: /^Barbieri$/ })).toHaveCount(1);
});

/* ---------------- 2–3. pre-listen while the Booth plays ---------------- */

type Desk = "two" | "desk";
/**
 * "two": the room on this laptop's speakers (the default) and AirPods; "desk": the default is a DDJ-400 (the room),
 * AirPods and the MacBook's own speakers. Media elements record their setSinkId (`__sinks`), the room's AudioContext
 * its own (`__roomSinks`).
 */
async function fakeOutputs(page: Page, desk: Desk) {
  await page.addInitScript((d) => {
    const w = window as unknown as { __sinks: string[]; __roomSinks: string[] };
    w.__sinks = [];
    w.__roomSinks = [];
    Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", {
      configurable: true,
      value(id: string) {
        w.__sinks.push(id);
        return Promise.resolve();
      },
    });
    Object.defineProperty(AudioContext.prototype, "setSinkId", {
      configurable: true,
      value(id: string) {
        w.__roomSinks.push(id);
        return Promise.resolve();
      },
    });
    const devs =
      d === "two"
        ? [
            { kind: "audiooutput", deviceId: "default", label: "Default - Built-in Speakers", groupId: "g1" },
            { kind: "audiooutput", deviceId: "hp", label: "AirPods Pro", groupId: "g2" },
          ]
        : [
            { kind: "audiooutput", deviceId: "default", label: "Default - DDJ-400", groupId: "g-ddj" },
            { kind: "audiooutput", deviceId: "ddj", label: "DDJ-400", groupId: "g-ddj" },
            { kind: "audiooutput", deviceId: "pods", label: "AirPods Pro", groupId: "g-pods" },
            { kind: "audiooutput", deviceId: "mac", label: "MacBook Pro Speakers", groupId: "g-mac" },
          ];
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: () => Promise.resolve(devs.map((x) => ({ ...x, toJSON: () => x }))),
        getUserMedia: () => Promise.reject(new Error("no")),
        addEventListener() {},
        removeEventListener() {},
      },
    });
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
  }, desk);
}

async function mockAudio(page: Page) {
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
  // the Library row's preview lookup (as the app's own player does it)
  await page.route(/\/api\/resolve$/, async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as { title?: string };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        candidates: [
          {
            provider: "deezer",
            id: `dz-${(body.title ?? "x").length}`,
            title: body.title,
            artist: "",
            previewUrl: "https://preview.test/clip.wav",
            confidence: 0.9,
          },
        ],
      }),
    });
  });
}

type Snap = { planIndex: number; state: string; started: boolean; room: string; cue: string | null };
const snap = (page: Page) =>
  page.evaluate(() => {
    const s = (
      window as unknown as { __tdjBooth: { getState: () => Record<string, unknown> } }
    ).__tdjBooth.getState();
    const o = s.outputs as { room: string; cue: string | null };
    return {
      planIndex: s.planIndex as number,
      state: s.state as string,
      started: s.started as boolean,
      room: o.room,
      cue: o.cue,
    } as Snap;
  });
const sinks = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __sinks: string[]; __roomSinks: string[] };
    return { cue: [...w.__sinks], room: [...w.__roomSinks] };
  });

async function startNight(page: Page, o: { headphones?: string } = {}) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90_000 });
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/, { timeout: 60_000 });
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("booth-ttc")).not.toHaveAttribute("data-resolving", "1", { timeout: 30_000 });
  const fresh = page.getByTestId("booth-resume").getByRole("button", { name: "Start from the beginning" });
  if (await fresh.isVisible().catch(() => false)) await fresh.click();
  if (o.headphones) {
    await page.getByTestId("booth-out-cue").click();
    await page.getByTestId("booth-output-sheet").locator(`[data-device="${o.headphones}"]`).click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("booth-out-cue")).toContainText("AirPods");
  }
  await page.getByTestId("booth-start").click();
  await expect.poll(async () => (await snap(page)).state, { timeout: 20_000 }).toBe("playing");
}

async function libraryRow(page: Page, n = 0) {
  await page.getByTestId("sidebar").locator('a.side-row[href="/library"]').first().click();
  await expect(page).toHaveURL(/\/library/);
  await expect(page.getByTestId("booth-mini")).toBeVisible({ timeout: 10_000 });
  await page.getByLabel("Search the library").first().fill("di sarli");
  const row = page.getByTestId("library-row").nth(n);
  await expect(row).toBeVisible({ timeout: 20_000 });
  return row;
}

test("the Booth plays a night with headphones set: a Library row's play pre-listens there, the room untouched", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await fakeOutputs(page, "two");
  await mockAudio(page);
  await startNight(page, { headphones: "hp" });
  const before = await snap(page);
  const room0 = (await sinks(page)).room;
  const row = await libraryRow(page);
  const title = (await row.getByTestId("library-row-title").innerText()).trim();
  const cue0 = (await sinks(page)).cue.length;
  await row.getByTestId("play-button").click();
  // the night's mini bar says where it sounds — the headphones, never the room — with what and Stop
  const cue = page.getByTestId("booth-mini-cue");
  await expect(cue).toBeVisible({ timeout: 15_000 });
  await expect(cue).toHaveAttribute("data-where", "headphones");
  await expect(cue).toContainText("In your headphones");
  await expect(cue).toContainText("the room doesn't hear it");
  await expect(page.getByTestId("booth-mini-cue-title")).toHaveText(title);
  // the pre-listen element went to the headphones; the room's output and the night are untouched
  const after = await sinks(page);
  expect(after.cue.slice(cue0)).toEqual(["hp"]);
  expect(after.room).toEqual(room0);
  const now = await snap(page);
  expect(now.state).toBe("playing");
  expect(now.room).toBe(before.room);
  // no question was asked
  await expect(page.getByTestId("prelisten-sheet")).toHaveCount(0);
  // the toast ("Playing in your headphones…") never covers the night's controls
  const toastEl = page.getByTestId("toast");
  if (await toastEl.isVisible().catch(() => false)) {
    const tb = (await toastEl.boundingBox())!;
    const mb = (await page.getByTestId("booth-mini").boundingBox())!;
    // (2026-11: in the sidebar the player stands beside the page; at the page's foot the toast stands over it)
    const apart =
      tb.x >= mb.x + mb.width - 0.5 || tb.x + tb.width <= mb.x + 0.5 || tb.y + tb.height <= mb.y + 0.5;
    expect(apart).toBe(true);
  }
  // Stop: a 44 px target; the pre-listen ends, the room plays on
  const stop = page.getByTestId("booth-mini-cue-stop");
  const sb = (await stop.boundingBox())!;
  expect(Math.min(sb.width, sb.height)).toBeGreaterThanOrEqual(43.5);
  await stop.click();
  await expect(cue).toHaveCount(0);
  expect((await snap(page)).state).toBe("playing");
});

test("no headphones set: one question — choose headphones, or this device's speaker (not the room) — never the room", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await fakeOutputs(page, "desk");
  await mockAudio(page);
  await startNight(page);
  const before = await snap(page);
  expect(before.cue).toBeNull();
  const room0 = (await sinks(page)).room;
  const row = await libraryRow(page);
  await row.getByTestId("play-button").click();
  const sheet = page.getByTestId("prelisten-sheet");
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  await expect(sheet.getByTestId("prelisten-why")).toHaveAttribute("data-why", "none");
  await expect(sheet.getByTestId("prelisten-lead")).toContainText("never in the room");
  // (final QA) the title is whole at a phone's width too: it wraps, never "Pre-listen while the night …"
  const title = sheet.getByTestId("sheet-title");
  for (const w of [1440, 390]) {
    await page.setViewportSize({ width: w, height: w > 600 ? 900 : 844 });
    await expect(title).toHaveText("Pre-listen while the night plays");
    const cut = await title.evaluate(
      (e) =>
        e.scrollWidth > e.clientWidth + 1 ||
        e.scrollHeight > e.clientHeight + 1 ||
        getComputedStyle(e).textOverflow === "ellipsis",
    );
    expect(cut, `title cut at ${w} px`).toBe(false);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  // the outputs offered for the headphones: never the room's (the DDJ, the default)
  const outs = sheet.getByTestId("prelisten-output");
  const ids = await outs.evaluateAll((els) => els.map((e) => e.getAttribute("data-device")));
  expect(ids).toEqual(["pods"]);
  expect(ids).not.toContain("default");
  expect(ids).not.toContain("ddj");
  // the built-in speakers are not headphones: listed once, as the device speaker (it is not the room's output)
  expect(ids).not.toContain("mac");
  await expect(sheet.getByTestId("prelisten-speaker")).toContainText("MacBook Pro Speakers");
  await expect(sheet.getByText("MacBook Pro Speakers")).toHaveCount(1);
  // every choice is a 44 px target
  for (const b of await sheet.locator("button").all()) {
    const bb = await b.boundingBox();
    if (bb) expect(bb.height).toBeGreaterThanOrEqual(43.5);
  }
  // nothing has played yet, the room unchanged
  expect((await sinks(page)).cue).toEqual([]);
  expect((await snap(page)).state).toBe("playing");
  // Choose headphones: AirPods — the song plays there at once
  await outs.filter({ hasText: "AirPods" }).click();
  await expect(sheet).toHaveCount(0, { timeout: 10_000 });
  const cue = page.getByTestId("booth-mini-cue");
  await expect(cue).toHaveAttribute("data-where", "headphones", { timeout: 15_000 });
  expect((await sinks(page)).cue).toEqual(["pods"]);
  expect((await snap(page)).cue).toBe("pods");
  await page.getByTestId("booth-mini-cue-stop").click();
  await expect(cue).toHaveCount(0);

  // headphones turned off again: the speaker path
  await page.evaluate(() =>
    (
      window as unknown as { __tdjBooth: { getState: () => { setCueOutput: (id: string | null) => void } } }
    ).__tdjBooth
      .getState()
      .setCueOutput(null),
  );
  await page.getByTestId("library-row").nth(1).getByTestId("play-button").click();
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  await sheet.getByTestId("prelisten-speaker").click();
  await expect(sheet).toHaveCount(0, { timeout: 10_000 });
  await expect(cue).toHaveAttribute("data-where", "device", { timeout: 15_000 });
  await expect(cue).toContainText("On this device's speaker");
  expect((await sinks(page)).cue).toEqual(["pods", "mac"]);
  // the room: the same output, the same song, still playing
  const now = await snap(page);
  expect(now.state).toBe("playing");
  expect(now.room).toBe(before.room);
  expect((await sinks(page)).room).toEqual(room0);
  await page.getByTestId("booth-mini-cue-stop").click();
  await expect(cue).toHaveCount(0);
});
