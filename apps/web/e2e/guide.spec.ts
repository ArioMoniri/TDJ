import { expect, test } from "@playwright/test";

/**
 * Wave 2 — the Guide: a tour of every round-22 feature in the DJ's words, with small Lottie loops and drawings that
 * play only on screen and hold still under reduced motion. The editable rules and house rules stay below it.
 */
const CHAPTERS = [
  "compose",
  "edit-with-ai",
  "build-by-hand",
  "booth",
  "closing",
  "era-badges",
  "rooms",
  "share",
  "find-songs",
  "versions-and-sources",
  "learned-preferences",
];

test("the tour explains every round-22 feature, each with a picture and a way there", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const lotties: Array<{ url: string; size: number }> = [];
  page.on("response", async (r) => {
    if (r.url().includes("/lottie/") && r.ok())
      lotties.push({ url: r.url(), size: (await r.body().catch(() => Buffer.alloc(0))).length });
  });
  await page.goto("/guide");
  await expect(page.getByTestId("page-title")).toHaveText("Guide");
  const tour = page.getByTestId("guide-tour");
  for (const id of CHAPTERS) await expect(tour.getByTestId(`tour-${id}`)).toHaveCount(1);
  for (const words of [
    "Edit with AI",
    "Build by hand",
    "Pre-listen in your headphones",
    "Cue and stop",
    "Skip tonight",
    "Last 4 tandas tango only",
    "Jump to La Cumparsita",
    "Era badges",
    "Rooms",
    "link, file or QR",
    "Find songs",
    "Versions and sources",
    "Learned preferences",
  ])
    await expect(tour).toContainText(words);
  // the era chapter shows the badges themselves, both looks
  const era = tour.getByTestId("tour-era-badges");
  await expect(era.getByTestId("era-legend")).toBeVisible();
  await expect(era.getByTestId("booth-era-legend")).toContainText("Best years");
  // scroll through: every chapter's Lottie loads, small
  for (const id of CHAPTERS) {
    await tour.getByTestId(`tour-${id}`).scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
  }
  await expect.poll(() => lotties.length, { timeout: 15000 }).toBeGreaterThanOrEqual(5);
  for (const l of lotties) expect(l.size, l.url).toBeLessThan(8 * 1024);
  await expect(tour.locator("canvas")).toHaveCount(5);
  await expect(tour.getByTestId("guide-illustration")).toHaveCount(5);
  // the jump list reaches a chapter; every jump and link is a 44 px target
  await page.evaluate(() => window.scrollTo(0, 0));
  await tour.getByTestId("tour-jump").filter({ hasText: "Rooms" }).click();
  await expect(tour.getByTestId("tour-rooms")).toBeInViewport();
  const small = await page.evaluate(
    () =>
      [...document.querySelectorAll<HTMLElement>('[data-testid="guide-tour"] a')]
        .map((a) => a.getBoundingClientRect())
        .filter((r) => r.height < 43.5).length,
  );
  expect(small).toBe(0);
  // the editable rules stay below the tour
  await expect(page.getByTestId("guide-tanda")).toContainText("3–4 recordings");
});

test("reduced motion: the pictures hold still", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(process.env.TDJ_URL ? `${process.env.TDJ_URL}/guide` : "http://localhost:3000/guide");
  const tour = page.getByTestId("guide-tour");
  await expect(tour).toBeVisible();
  for (const id of ["edit-with-ai", "share", "closing"]) {
    await tour.getByTestId(`tour-${id}`).scrollIntoViewIfNeeded();
  }
  // no running CSS animation anywhere in the tour; chapters are fully visible
  const running = await page.evaluate(
    () =>
      document
        .querySelector('[data-testid="guide-tour"]')!
        .getAnimations({ subtree: true })
        .filter((a) => a.playState === "running").length,
  );
  expect(running).toBe(0);
  const hidden = await page.evaluate(
    () =>
      [...document.querySelectorAll<HTMLElement>(".guide-chapter")].filter(
        (el) => Number(getComputedStyle(el).opacity) < 1,
      ).length,
  );
  expect(hidden).toBe(0);
  // the phone layout never scrolls sideways
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(wide).toBeLessThanOrEqual(1);
  await ctx.close();
});
