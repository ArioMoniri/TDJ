/**
 * 2026-11 (the owner: "all songs anywhere should be playable on click of them in Compose and Play pages"; "music
 * should play also on click of the image"; "order in each tanda should be changeable in all tabs"; "tanda types …
 * and the total and each song's length"). One tap on a song or cortina row plays it in the mini player (previews
 * mocked as clips), the mini player steps through the night, a second tap pauses, a row with no audio says why;
 * songs reorder by drag and by Move up with Undo, and the order survives a reload; the tanda badge and totals.
 * Desktop and iPhone 15 Pro (Chromium with its viewport, touch and user agent).
 */
import { type BrowserContextOptions, devices, expect, type Page, test } from "@playwright/test";

/** a 120 s mono tone: long enough that a cortina's chorus start (26 s, 96 s …) lies inside it */
function wav(sec = 120): Buffer {
  const rate = 8000;
  const n = rate * sec;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++)
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 0.2 * 32767), i * 2);
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
/** the side the mocked lookup finds nothing for */
const SILENT = "Tres Esquinas";

async function mock(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
  });
  // byte ranges, as the real preview hosts serve them: a clip is seekable (a cortina starts at its chorus)
  await page.route(/dzcdn\.net|p\.scdn\.co|preview\.test|\/api\/preview\?/, (route) => {
    const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range ?? "");
    const base = { "access-control-allow-origin": "*", "accept-ranges": "bytes" };
    if (!range) return route.fulfill({ status: 200, contentType: "audio/wav", body: WAV, headers: base });
    const from = Number(range[1]);
    const to = range[2] ? Math.min(Number(range[2]), WAV.length - 1) : WAV.length - 1;
    return route.fulfill({
      status: 206,
      contentType: "audio/wav",
      body: WAV.subarray(from, to + 1),
      headers: { ...base, "content-range": `bytes ${from}-${to}/${WAV.length}` },
    });
  });
  await page.route(/\/api\/resolve$/, async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as { title?: string };
    const none = body.title === SILENT;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        candidates: none
          ? []
          : [
              {
                provider: "deezer",
                id: `dz-${(body.title ?? "x").length}`,
                title: body.title,
                artist: "",
                previewUrl: "https://preview.test/clip.wav",
                confidence: 0.9,
              },
            ],
        suggestions: {},
      }),
    });
  });
  await page.route(/\/api\/spotify\/me/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: '{"hosted":false,"user":null}' }),
  );
  await page.route(/open\.spotify\.com\/oembed/, (r) => r.fulfill({ status: 404, body: "" }));
}

async function openCompose(page: Page) {
  await mock(page);
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
}

const mini = (page: Page) => page.getByTestId("mini-player");
const audioState = (page: Page) =>
  page.evaluate(() => {
    const a = document.querySelector("audio");
    return a ? { paused: a.paused, at: a.currentTime } : null;
  });
const rowTitles = (page: Page, tanda: number) =>
  page
    .locator(`#tanda-${tanda} li[data-song]`)
    .evaluateAll((els) =>
      els.map(
        (e) =>
          (
            e.querySelector('[data-testid="row-play"] .truncate') as HTMLElement | null
          )?.textContent?.trim() ?? "",
      ),
    );
async function expectPlaying(page: Page, title: string) {
  await expect(mini(page)).toBeVisible();
  await expect(page.getByTestId("mini-title")).toHaveText(title);
  await expect(page.getByTestId("mini-toggle")).toHaveAttribute("data-playing", "true");
  await expect.poll(async () => (await audioState(page))?.paused, { timeout: 10000 }).toBe(false);
}

const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 15 Pro"];
const DEVICES: Array<[string, BrowserContextOptions]> = [
  ["desktop", { viewport: { width: 1440, height: 900 } }],
  ["iPhone 15 Pro", iphone],
];

for (const [name, opts] of DEVICES) {
  test.describe(name, () => {
    test.use(opts);

    test(`${name}: tap a song, the opening, a cortina; Next steps the tanda; a second tap pauses`, async ({
      page,
    }) => {
      await openCompose(page);
      // the 2nd song of tanda 3
      const titles = await rowTitles(page, 3);
      const row = page.locator("#tanda-3 li[data-song]").nth(1);
      await row.getByTestId("row-play").click();
      await expectPlaying(page, titles[1]!);
      await expect(row).toHaveAttribute("data-now", "playing");
      await expect(row.getByTestId("now-bars")).toBeVisible();
      // Next → the next song in that tanda
      await page.getByTestId("mini-next").click();
      await expectPlaying(page, titles[2]!);
      await expect(page.getByTestId("mini-where")).toHaveText("Tanda 3");
      // tap the playing row → pause
      const third = page.locator("#tanda-3 li[data-song]").nth(2);
      await third.getByTestId("row-play").click();
      await expect(page.getByTestId("mini-toggle")).not.toHaveAttribute("data-playing", "true");
      await expect.poll(async () => (await audioState(page))?.paused).toBe(true);
      await expect(third).toHaveAttribute("data-now", "paused");
      // the opening La Cumparsita (no cached preview: the lookup finds one)
      await page.getByTestId("opening").getByTestId("row-play").click();
      await expectPlaying(page, "La Cumparsita");
      // a cortina plays from its chorus start
      const cortina = page.locator("#tanda-2").getByTestId("cortina-row-play");
      await cortina.scrollIntoViewIfNeeded();
      // the row says where it starts ("… from 0:26"): the clip plays from there
      const label = (await cortina.getAttribute("aria-label")) ?? "";
      await cortina.click();
      await expect(mini(page)).toHaveAttribute("data-kind", "cortina");
      await expect.poll(async () => (await audioState(page))?.paused, { timeout: 10000 }).toBe(false);
      const m = /from (\d+):(\d\d)/.exec(label)!;
      const start = Number(m[1]) * 60 + Number(m[2]);
      expect(start).toBeGreaterThan(0);
      const at = (await audioState(page))!.at;
      expect(at).toBeGreaterThanOrEqual(start - 1);
      expect(at).toBeLessThan(start + 10);
    });

    test(`${name}: the artwork plays; a side with no audio says why`, async ({ page }) => {
      await openCompose(page);
      const titles = await rowTitles(page, 2);
      await page.locator("#tanda-2 li[data-song]").first().getByTestId("row-art").click();
      await expectPlaying(page, titles[0]!);
      // no preview cached, the lookup finds none, no Premium, no file: a toast and the hint
      const silent = page.locator("#tanda-1 li[data-song]").filter({ hasText: SILENT });
      await silent.getByTestId("row-play").click();
      // (2026-11: the real reason — not matched yet, or Spotify not connected here — never "no Spotify Premium")
      await expect(page.getByTestId("toast")).toContainText(/No audio|isn't connected on this device/);
      await expect(silent.getByTestId("no-audio")).toBeVisible();
    });

    test(`${name}: the tanda badge, each song's length and the tanda total`, async ({ page }) => {
      await openCompose(page);
      const card = page.locator("#tanda-2");
      await expect(card.getByTestId("tanda-type")).toContainText("Tango");
      // (2026-11, b3279c5: a vocal tanda with an instrumental side reads "Vocal & instrumental")
      await expect(card.getByTestId("tanda-mode")).toHaveText(/^Vocal( · |$| & instrumental)/);
      // (a card far below the fold is skipped by content-visibility: its innerText reads "" until it is near the
      // viewport — on a phone tanda 2 is; read what the rows say)
      await card.getByTestId("tanda-total").scrollIntoViewIfNeeded();
      const lens = await card.getByTestId("row-len").allTextContents();
      expect(lens).toHaveLength(4);
      // every side shows a length: m:ss, or the "–:–" placeholder when its length is unknown
      for (const l of lens) expect(l).toMatch(/(\d+:\d\d|–:–)\s*$/);
      const known = lens.map((l) => /(\d+):(\d\d)/.exec(l)).filter((m) => m !== null);
      const secs = known.map((m) => Number(m[1]) * 60 + Number(m[2]));
      const sum = secs.reduce((a, b) => a + b, 0);
      const want = `${Math.floor(sum / 60)}:${String(sum % 60).padStart(2, "0")}`;
      // (row lengths are rounded per side: the total is within a second of their sum; an unknown side leaves the
      // total partial, "≈")
      const partial = known.length < lens.length ? "≈ " : "";
      await expect(card.getByTestId("tanda-total")).toHaveText(
        new RegExp(`^4 songs · ${partial}${want.slice(0, -1)}\\d$`),
      );
      await expect(page.getByTestId("night-total")).toContainText(/plays (≈ )?\d+:\d\d:\d\d/);
    });

    test(`${name}: drag song 4 of tanda 1 to the top, Move up, Undo; the order survives a reload`, async ({
      page,
    }) => {
      await openCompose(page);
      // (215a2ad: a locked tanda's sides never move — no drag handle — and this night's tanda 2 is the DJ's locked
      // Di Sarli tanda; tanda 1 is a free tango tanda of four)
      await expect(page.locator("#tanda-1")).not.toHaveAttribute("data-locked", /.*/);
      const before = await rowTitles(page, 1);
      const rows = page.locator("#tanda-1 li[data-song]");
      const handle = rows.nth(3).getByTestId("drag-handle");
      await handle.scrollIntoViewIfNeeded();
      const h = (await handle.boundingBox())!;
      const top = (await rows.nth(0).boundingBox())!;
      if (name === "desktop") {
        await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
        await page.mouse.down();
        await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2 - 10, { steps: 3 });
        await page.mouse.move(h.x + h.width / 2, top.y + 4, { steps: 8 });
        await page.mouse.up();
      } else {
        // touch: a long-press on the handle, then the drag
        await handle.dispatchEvent("pointerdown", {
          pointerType: "touch",
          pointerId: 7,
          isPrimary: true,
          button: 0,
          clientX: h.x + h.width / 2,
          clientY: h.y + h.height / 2,
          bubbles: true,
        });
        await page.waitForTimeout(450);
        await page.evaluate(
          ([x, y]) => {
            window.dispatchEvent(
              new PointerEvent("pointermove", {
                pointerType: "touch",
                pointerId: 7,
                clientX: x,
                clientY: y,
                bubbles: true,
              }),
            );
            window.dispatchEvent(
              new PointerEvent("pointerup", { pointerType: "touch", pointerId: 7, bubbles: true }),
            );
          },
          [h.x + h.width / 2, top.y + 4],
        );
      }
      await expect.poll(() => rowTitles(page, 1)).toEqual([before[3], before[0], before[1], before[2]]);
      await expect(page.getByTestId("toast")).toContainText("Undo");
      // Move up (the ••• menu): the 3rd goes to the 2nd place
      await rows
        .nth(2)
        .getByRole("button", { name: /^Track \d+ actions$/ })
        .click();
      await page.getByRole("menuitem", { name: "Move up" }).click();
      await expect.poll(() => rowTitles(page, 1)).toEqual([before[3], before[1], before[0], before[2]]);
      // Undo puts it back
      await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
      await expect.poll(() => rowTitles(page, 1)).toEqual([before[3], before[0], before[1], before[2]]);
      // the order is the night's: it survives a reload
      await page.waitForTimeout(1200);
      await page.goto("/");
      await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
      await expect.poll(() => rowTitles(page, 1)).toEqual([before[3], before[0], before[1], before[2]]);
    });

    test(`${name}: Library and Build by hand rows play on a tap`, async ({ page }) => {
      await mock(page);
      await page.goto("/library");
      await page.getByLabel("Search the library").first().fill("di sarli");
      const first = page.getByTestId("library-row").first();
      await expect(first).toBeVisible({ timeout: 20000 });
      // the Library's search row (2026-11): its title is the row's own, the row and its play button both play
      const title = (await first.getByTestId("library-row-title").innerText()).trim();
      await first.getByTestId("play-button").click();
      await expectPlaying(page, title);
      await page.goto("/build");
      await page.evaluate(() => localStorage.removeItem("tdj-build-draft"));
      await page.reload();
      // (2026-11: the search is on the page at every size, no sheet)
      await page.getByLabel("Search for a song to add").first().fill("di sarli");
      const hit = page.getByTestId("build-hit").first();
      await expect(hit).toBeVisible({ timeout: 20000 });
      const ht = (await hit.getByTestId("row-play").locator(".truncate").first().innerText()).trim();
      await hit.getByTestId("row-play").click();
      await expectPlaying(page, ht);
    });
  });
}
