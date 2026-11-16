/**
 * 2026-11 — screenshots of Now playing (iPad landscape, iPhone, desktop; dark and light) and of the dancers' Floor
 * screen (1920 × 1080 and 1280 × 720; English and Turkish; a song and a cortina). Only with TDJ_SHOTS=<dir>.
 */
import { type Browser, expect, type Page, test } from "@playwright/test";

const SHOTS = process.env.TDJ_SHOTS;
test.skip(!SHOTS, "screenshots only (TDJ_SHOTS)");
test.describe.configure({ timeout: 600_000 });

const floorState = (o: Record<string, unknown>) => ({
  v: 1,
  kind: "song",
  title: "Bahía Blanca",
  orchestra: "Carlos Di Sarli",
  singer: null,
  rhythm: "tango",
  year: 1957,
  k: 1,
  n: 4,
  tanda: 7,
  tandas: 23,
  stage: "start",
  next: { orchestra: "Francisco Canaro", rhythm: "vals", singer: "Ernesto Famá" },
  positionSec: 42,
  lengthSec: 171,
  playing: true,
  srcStartSec: 0,
  songId: null,
  at: Date.now(),
  ...o,
});

async function floorShots(browser: Browser, locale: "en" | "tr") {
  for (const [w, h] of [
    [1920, 1080],
    [1280, 720],
  ] as const) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: h },
      locale: locale === "tr" ? "tr-TR" : "en-US",
    });
    const page = await ctx.newPage();
    await page.goto("/screen");
    await expect(page.getByTestId("floor-screen")).toBeVisible();
    const say = (s: Record<string, unknown>) =>
      page.evaluate((st) => {
        const ch = new BroadcastChannel("tdj-floor");
        ch.postMessage({ type: "floor", state: { ...st, at: Date.now() } });
        ch.close();
      }, s);
    await say(floorState({}));
    await expect(page.getByTestId("floor-song-of")).toBeVisible();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/floor-song-${w}x${h}-${locale}.png` });
    await say(
      floorState({
        kind: "cortina",
        title: "Cortina",
        orchestra: "",
        rhythm: "cortina",
        k: -1,
        n: 0,
        stage: null,
        positionSec: 12,
        lengthSec: 45,
      }),
    );
    await expect(page.getByTestId("floor-cortina")).toBeVisible();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/floor-cortina-${w}x${h}-${locale}.png` });
    await ctx.close();
  }
}

test("Floor screen, English", async ({ browser }) => floorShots(browser, "en"));
test("Floor screen, Turkish", async ({ browser }) => floorShots(browser, "tr"));

async function nowShots(page: Page, name: string) {
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 150000 });
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/, { timeout: 60000 });
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 60000 });
  await page.evaluate(() =>
    (window as unknown as { __tdjBooth: { getState: () => { nextNow: () => Promise<void> } } }).__tdjBooth
      .getState()
      .nextNow(),
  );
  await page.getByTestId("booth-now-full").click();
  const view = page.getByTestId("now-view");
  await expect(view).toBeVisible();
  await page.waitForTimeout(1500);
  for (const theme of ["dark", "light"] as const) {
    await page.evaluate((th) => {
      document.documentElement.dataset.theme = th;
      document.documentElement.classList.toggle("dark", th === "dark");
    }, theme);
    for (const tab of ["lyrics", "rhythm", "video"] as const) {
      await view.getByTestId(`now-tab-${tab}`).click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${SHOTS}/now-${name}-${theme}-${tab}.png` });
    }
  }
}

for (const [name, use] of [
  [
    "ipad-landscape",
    { viewport: { width: 1194, height: 834 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  ],
  ["iphone", { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }],
  ["desktop", { viewport: { width: 1440, height: 900 } }],
] as const)
  test(`Now playing, ${name}`, async ({ browser }) => {
    const ctx = await browser.newContext(use);
    const page = await ctx.newPage();
    await nowShots(page, name);
    await ctx.close();
  });
