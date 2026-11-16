/**
 * 2026-11 (the owner: "name won't slide to show all"): the mini player gives the title and artist the row's room
 * (the source badge under them), shows the song's cover (a tap opens its details), and a title that still does not
 * fit slides to its end and back; one that fits stays still; with Reduce Motion nothing moves (the whole title is the
 * hover tag). At 320 and 1440 px, in English and Turkish.
 */
import { expect, type Page, test } from "@playwright/test";

function wav(sec = 30): Buffer {
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

async function playFirstSong(page: Page) {
  await page.route(/dzcdn\.net|p\.scdn\.co|preview\.test|\/api\/preview\?/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "audio/wav",
      body: WAV,
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await page.route(/\/api\/resolve$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        candidates: [
          { provider: "deezer", id: "dz-1", title: "x", artist: "", previewUrl: "https://preview.test/clip.wav", confidence: 0.9 },
        ],
        suggestions: {},
      }),
    }),
  );
  await page.route(/\/api\/spotify\/me/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: '{"hosted":false,"user":null}' }),
  );
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
  await page.locator("#tanda-1 li[data-song]").first().getByTestId("row-play").click();
  await expect(page.getByTestId("mini-player")).toBeVisible({ timeout: 20000 });
}
const marquee = (page: Page) => page.getByTestId("mini-title-marquee");
const shift = (page: Page) =>
  marquee(page)
    .locator(".marquee-inner")
    .evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);

for (const [width, locale] of [
  [1440, "en-US"],
  [320, "en-US"],
  [320, "tr-TR"],
] as const)
  test.describe(`${width} px, ${locale}`, () => {
    test.use({ viewport: { width, height: 800 }, locale });

    test("the title fits or slides; the cover is there; the badge is under the title", async ({ page }) => {
      await playFirstSong(page);
      const m = marquee(page);
      // the title's whole text is reachable: it fits, or it slides (and is the hover tag)
      const fits = await m.evaluate((el) => {
        const inner = el.querySelector(".marquee-inner") as HTMLElement;
        return inner.scrollWidth <= el.clientWidth + 2;
      });
      await expect(m).toHaveAttribute("data-overflow", fits ? "0" : "1");
      await expect(page.getByTestId("mini-cover")).toBeVisible();
      // the badge is no longer on the title's line
      const title = (await m.boundingBox())!;
      const badge = (await page.getByTestId("player-badge").boundingBox())!;
      expect(badge.y).toBeGreaterThanOrEqual(title.y + title.height - 1);
      // squeezed: it slides (2 s still, then moves) …
      await m.evaluate((el) => {
        (el as HTMLElement).style.width = "40px";
      });
      await expect(m).toHaveAttribute("data-overflow", "1");
      await expect(m).toHaveAttribute("data-moving", "1");
      await expect(m).toHaveAttribute("title", /.+/);
      expect(Math.abs(await shift(page))).toBeLessThan(1);
      await expect.poll(() => shift(page), { timeout: 8000 }).toBeLessThan(-5);
      // … and with room to spare it stands still
      await m.evaluate((el) => {
        (el as HTMLElement).style.width = "2000px";
      });
      await expect(m).toHaveAttribute("data-overflow", "0");
      await expect(m).toHaveAttribute("data-moving", "0");
      expect(Math.abs(await shift(page))).toBeLessThan(1);
    });
  });

test.describe("Reduce Motion", () => {
  test.use({ viewport: { width: 320, height: 800 }, reducedMotion: "reduce" });
  test("a long title never moves: it ends in an ellipsis and its whole text is the hover tag", async ({ page }) => {
    await playFirstSong(page);
    const m = marquee(page);
    await m.evaluate((el) => {
      (el as HTMLElement).style.width = "40px";
    });
    await expect(m).toHaveAttribute("data-overflow", "1");
    await expect(m).toHaveAttribute("data-moving", "0");
    await page.waitForTimeout(3000);
    expect(Math.abs(await shift(page))).toBeLessThan(1);
    const text = await page.getByTestId("mini-title").innerText();
    await expect(m).toHaveAttribute("title", text);
  });
});
