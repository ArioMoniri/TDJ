/**
 * Artwork everywhere (the owner's "some song images are not shown"): every <Artwork> in Compose (the featured night),
 * the Booth's set list, Database → Songs and Library results shows a cover that loaded or the orchestra's
 * placeholder — never a broken image — on a desktop and on an iPad Pro 11 in landscape. The covers are mocked (a tiny
 * PNG for every CDN image, a fake oEmbed for live lookups), so the spec needs no network.
 */
import { expect, type Page, test } from "@playwright/test";

// 1 × 1 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function mockCovers(page: Page) {
  // the CDNs (Deezer, Spotify): a real image, so `naturalWidth > 0`
  await page.route(/cdn-images\.dzcdn\.net|spotifycdn\.com|i\.scdn\.co|mosaic\.scdn\.co/, (r) =>
    r.fulfill({ status: 200, contentType: "image/png", body: PNG }),
  );
  // Spotify's oEmbed, should the page ever ask it straight
  await page.route(/open\.spotify\.com\/oembed/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ thumbnail_url: "https://i.scdn.co/image/mock-oembed" }),
    }),
  );
  // the live lookup route (the shipped cache, GET /api/artwork with no query, stays real)
  await page.route(/\/api\/artwork\?/, (r) =>
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ url: "https://i.scdn.co/image/mock-live" }),
    }),
  );
  // the Booth's clips: silent, so loading the night touches no audio CDN
  await page.route(/cdnt-preview\.dzcdn\.net|p\.scdn\.co|\/api\/preview\?/, (r) =>
    r.fulfill({ status: 404, body: "" }),
  );
}

type Tally = { total: number; cover: number; placeholder: number; hidden: number; broken: string[] };
/** every artwork slot under `scope`, after its images settle */
async function tally(page: Page, scope: string, testId: "artwork" | "booth-art"): Promise<Tally> {
  // scroll every slot into view (lazy images and lookups start on screen), then let them settle
  await page.evaluate(
    async ({ scope, testId }) => {
      const els = [...document.querySelectorAll(`${scope} [data-testid="${testId}"]`)];
      for (const el of els) {
        el.scrollIntoView({ block: "center" });
        await new Promise((r) => setTimeout(r, 15));
      }
    },
    { scope, testId },
  );
  await expect
    .poll(
      () =>
        page.evaluate(
          ({ scope, testId }) =>
            [...document.querySelectorAll<HTMLImageElement>(`${scope} [data-testid="${testId}"] img`)]
              .filter((i) => i.getClientRects().length > 0)
              .every((i) => {
                // a lazy image starts once it is near the viewport: bring any still waiting into view
                if (!i.complete) i.scrollIntoView({ block: "center" });
                return i.complete;
              }),
          { scope, testId },
        ),
      { timeout: 15000 },
    )
    .toBe(true);
  await page.waitForTimeout(300);
  return page.evaluate(
    ({ scope, testId }) => {
      const out = { total: 0, cover: 0, placeholder: 0, hidden: 0, broken: [] as string[] };
      for (const el of document.querySelectorAll<HTMLElement>(`${scope} [data-testid="${testId}"]`)) {
        // a slot that is not laid out (a closed sheet, a hidden layout) shows nothing at all, broken or not
        if (!el.getClientRects().length) {
          out.hidden++;
          continue;
        }
        out.total++;
        const img = el.querySelector("img");
        if (img) {
          if (img.complete && img.naturalWidth > 0) out.cover++;
          else out.broken.push(img.src);
        } else if (el.dataset.art === "placeholder" && (el.textContent ?? "").trim()) out.placeholder++;
        else out.broken.push(`(empty slot) ${el.outerHTML.slice(0, 120)}`);
      }
      return out;
    },
    { scope, testId },
  );
}

async function openFeatured(page: Page) {
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
}

for (const device of ["desktop", "ipad-landscape"] as const) {
  test.describe(`artwork (${device})`, () => {
    if (device === "ipad-landscape")
      test.use({
        viewport: { width: 1194, height: 834 },
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true,
        userAgent:
          "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      });
    else test.use({ viewport: { width: 1440, height: 900 } });

    test("Compose and the Booth: a loaded cover or the placeholder on every side, never a broken image", async ({
      page,
    }) => {
      await mockCovers(page);
      await openFeatured(page);
      const compose = await tally(page, "#result", "artwork");
      console.log(
        `[artwork ${device}] compose`,
        JSON.stringify({ ...compose, broken: compose.broken.length }),
      );
      expect(compose.broken).toEqual([]);
      expect(compose.total).toBeGreaterThanOrEqual(92);
      // every featured-night song has a Spotify recording, so every one gets a real cover (before: 48 of 92)
      expect(compose.cover).toBe(compose.total);

      await page.getByTestId("play-the-night").first().click();
      await expect(page).toHaveURL(/\/booth/, { timeout: 60000 });
      await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 30000 });
      const booth = await tally(page, "body", "booth-art");
      console.log(`[artwork ${device}] booth`, JSON.stringify({ ...booth, broken: booth.broken.length }));
      expect(booth.broken).toEqual([]);
      expect(booth.total).toBeGreaterThan(90);
      expect(booth.cover).toBe(booth.total);
    });

    test("Database songs and Library results: a loaded cover or the placeholder, never a broken image", async ({
      page,
    }) => {
      await mockCovers(page);
      await page.goto("/database");
      await page.getByLabel("Search the index").fill("biagi");
      await expect(page.locator('[data-song] [data-testid="artwork"]').first()).toBeVisible({
        timeout: 60000,
      });
      const db = await tally(page, "[data-song]", "artwork");
      console.log(`[artwork ${device}] database`, JSON.stringify({ ...db, broken: db.broken.length }));
      expect(db.broken).toEqual([]);
      expect(db.total).toBeGreaterThan(0);
      // Biagi's sides mostly have a Spotify recording: covers, not initials
      expect(db.cover).toBeGreaterThan(db.total / 2);

      await page.goto("/library");
      const field = page.getByRole("searchbox").first();
      await field.fill("biagi");
      await expect(page.locator('main [data-testid="artwork"]').first()).toBeVisible({ timeout: 30000 });
      const lib = await tally(page, "main", "artwork");
      console.log(`[artwork ${device}] library`, JSON.stringify({ ...lib, broken: lib.broken.length }));
      expect(lib.broken).toEqual([]);
      expect(lib.total).toBeGreaterThan(0);
      expect(lib.cover).toBeGreaterThan(lib.total / 2);
    });

    test("with every image failing, each slot falls through to the placeholder", async ({ page }) => {
      await page.route(/cdn-images\.dzcdn\.net|spotifycdn\.com|i\.scdn\.co/, (r) =>
        r.fulfill({ status: 404 }),
      );
      await page.route(/\/api\/artwork\?/, (r) =>
        r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ url: null }) }),
      );
      await openFeatured(page);
      const t = await tally(page, "#result", "artwork");
      expect(t.broken).toEqual([]);
      expect(t.placeholder).toBe(t.total);
      // AA-readable initials: white on the placeholder's lighter stop
      const ratio = await page.evaluate(() => {
        const el = document.querySelector<HTMLElement>(
          '#result [data-testid="artwork"][data-art="placeholder"]',
        )!;
        return getComputedStyle(el).color;
      });
      expect(ratio).toBe("rgb(255, 255, 255)");
    });
  });
}
