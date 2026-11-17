/**
 * 2026-11 — screenshots of Now playing (desktop, iPad landscape, iPhone; dark and light; song 2 of a tanda and a
 * cortina) and of the dancers' Floor screen (1920 × 1080, 1280 × 720 and a phone; English and Turkish; a song and a
 * cortina), all at scale 2. Only with TDJ_SHOTS=<dir>.
 */
import { type Browser, type BrowserContextOptions, expect, type Page, test } from "@playwright/test";

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
  tandas: 12,
  stage: "start",
  next: { orchestra: "Francisco Canaro", rhythm: "vals", singer: "Ernesto Famá" },
  positionSec: 42,
  lengthSec: 171,
  playing: true,
  srcStartSec: 0,
  songId: null,
  at: Date.now(),
  follows: "song",
  itemStartSec: 5400,
  tandaEndSec: 5400 + 171 * 3,
  closingAtSec: 12600,
  nightSec: 12780,
  arc: [
    "tango",
    "tango",
    "vals",
    "tango",
    "milonga",
    "tango",
    "tango",
    "vals",
    "tango",
    "milonga",
    "tango",
    "tango",
  ],
  ...o,
});

async function floorShots(browser: Browser, locale: "en" | "tr") {
  for (const [w, h] of [
    [1920, 1080],
    [1280, 720],
    [393, 852],
  ] as const) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: h },
      deviceScaleFactor: 2,
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
        follows: "song",
        tandaEndSec: null,
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

type B = {
  __tdjBooth: {
    getState: () => {
      planIndex: number;
      plan: { items: Array<{ kind: string; tanda: number }> };
      playNow: (i: number) => Promise<void>;
    };
  };
};
const playNth = (page: Page, kind: "song2" | "cortina") =>
  page.evaluate(async (k) => {
    const s = (window as unknown as B).__tdjBooth.getState();
    const items = s.plan.items;
    const first = items.findIndex((x) => x.kind === "track");
    const i =
      k === "song2"
        ? items.findIndex((x, j) => j > first && x.kind === "track" && x.tanda === items[first]!.tanda)
        : items.findIndex((x) => x.kind === "cortina");
    await s.playNow(i);
  }, kind);

async function nowShots(page: Page, name: string) {
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 150000 });
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/, { timeout: 60000 });
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 60000 });
  await page.getByTestId("booth-start").evaluate((e) => (e as HTMLButtonElement).click());
  await page.waitForTimeout(3000);
  await playNth(page, "song2");
  // (a phone: the deck may sit under toasts or in a sheet; the button itself opens the view)
  await page
    .getByTestId("booth-now-full")
    .first()
    .evaluate((e) => (e as HTMLButtonElement).click());
  const view = page.getByTestId("now-view");
  await expect(view).toBeVisible();
  await page.waitForTimeout(2500);
  for (const theme of ["dark", "light"] as const) {
    await page.evaluate((th) => {
      document.documentElement.dataset.theme = th;
      document.documentElement.classList.toggle("dark", th === "dark");
    }, theme);
    for (const tab of ["lyrics", "rhythm"] as const) {
      if (theme === "light" && tab === "rhythm") continue;
      await view.getByTestId(`now-tab-${tab}`).click();
      await page.waitForTimeout(700);
      // (the tab click scrolls it into view: the shot shows the view from its top)
      await page.evaluate(() => document.querySelector(".now-view-body")?.scrollTo(0, 0));
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${SHOTS}/now-${name}-${theme}-${tab}.png` });
    }
  }
  await view.getByTestId("now-tab-lyrics").click();
  await playNth(page, "cortina");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOTS}/now-${name}-light-cortina.png` });
}

for (const [name, use] of [
  [
    "ipad-landscape",
    { viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  ],
  ["iphone", { viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }],
  ["desktop", { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }],
] as const satisfies ReadonlyArray<readonly [string, BrowserContextOptions]>)
  test(`Now playing, ${name}`, async ({ browser }) => {
    const ctx = await browser.newContext(use);
    const page = await ctx.newPage();
    await nowShots(page, name);
    await ctx.close();
  });
