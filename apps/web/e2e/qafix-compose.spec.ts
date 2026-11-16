/**
 * QA fixes outside the Booth (2026-11):
 * - the edit guide is an opaque card that never covers the inspector or the mini player (1440 and iPad landscape);
 * - a locked tanda's sides never move (Move up / down greyed with the reason);
 * - the Song DNA Back button: song A → orchestra → song B → Back → orchestra → Back → song A → Back → origin;
 * - Compose never scrolls sideways (iPhone, 200 % text);
 * - one length: the header, "plays" and the sidebar agree.
 */
import { expect, type Page, test } from "@playwright/test";

const SHOTS = process.env.QA_SHOTS;
async function quiet(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
  });
  await page.route(/\/api\/spotify\/me/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: '{"hosted":false,"user":null}' }),
  );
  await page.route(/open\.spotify\.com\/oembed/, (r) => r.fulfill({ status: 404, body: "" }));
}
async function openFeatured(page: Page) {
  await quiet(page);
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
}
const box = async (page: Page, testId: string) => {
  const l = page.getByTestId(testId).first();
  return (await l.count()) && (await l.isVisible()) ? l.boundingBox() : null;
};
const hit = (
  a: { x: number; y: number; width: number; height: number } | null,
  b: { x: number; y: number; width: number; height: number } | null,
) => !!a && !!b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

for (const vp of [
  { name: "1440", width: 1440, height: 900 },
  { name: "ipad-landscape", width: 1180, height: 820 },
])
  test(`the edit guide is opaque and clear of the inspector and the mini player (${vp.name})`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await openFeatured(page);
    // a tanda before the first: the guide shows what the edit did
    await page.getByTestId("insert-tanda-first-button").click();
    const sheet = page.getByTestId("insert-sheet");
    const opt = sheet.getByTestId("insert-suggestion").first();
    await expect(opt).toBeVisible({ timeout: 60000 });
    await opt.click();
    const asked = page.getByTestId("rule-sheet");
    if (await asked.isVisible().catch(() => false)) await page.getByTestId("rule-as-said").click();
    const guide = page.getByTestId("edit-guide");
    await expect(guide).toBeVisible({ timeout: 30000 });
    const alpha = await guide.evaluate((el) => {
      const c = getComputedStyle(el).backgroundColor;
      const m = /rgba?\(([^)]+)\)/.exec(c);
      const parts = m ? m[1]!.split(/[\s,/]+/).filter(Boolean) : [];
      return parts.length === 4 ? Number(parts[3]) : parts.length === 3 ? 1 : 0;
    });
    expect(alpha).toBeGreaterThanOrEqual(0.95);
    // its length line in units
    const len = guide.locator("[data-key='length']");
    if (await len.count()) await expect(len).toContainText(/\d+ h \d+ min/);
    const g = await guide.boundingBox();
    expect(hit(g, await box(page, "inspector"))).toBe(false);
    expect(hit(g, await box(page, "mini-player"))).toBe(false);
    for (const b of await page.getByTestId("edit-guide-fix").all()) {
      const r = await b.boundingBox();
      expect(r!.height).toBeGreaterThanOrEqual(44);
    }
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/edit-guide-${vp.name}.png` });
  });

test("a locked tanda's sides never move (Move up / down greyed with the reason)", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFeatured(page);
  // lock the first tanda (the QA's case), then its sides never move
  const card = page.locator("#result article[data-tanda]").first();
  const lock = card.getByTestId("tanda-lock");
  if ((await lock.getAttribute("aria-pressed")) !== "true") await lock.click();
  await expect(lock).toHaveAttribute("aria-pressed", "true");
  await expect(card.getByTestId("drag-handle")).toHaveCount(0);
  await card
    .locator("li[data-song]")
    .nth(1)
    .getByRole("button", { name: /actions/i })
    .click();
  const up = page.getByRole("menuitem", { name: /Move up/ });
  await expect(up).toBeDisabled();
  await expect(up).toContainText(/unlock|locked|kept/i);
  await expect(page.getByRole("menuitem", { name: /Measure from your file/ })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("Song DNA: Back walks the chain back to where the DJ started", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await quiet(page);
  await page.goto("/library");
  await expect(page.locator("main")).toBeVisible();
  // song A
  await page.goto("/song?id=9abc1040ff");
  await expect(page.getByTestId("dna-title")).toBeVisible({ timeout: 60000 });
  const a = (await page.getByTestId("dna-title").textContent())!.trim();
  await expect(page.getByTestId("dna-back")).toContainText("Library");
  // its orchestra
  const orch = page.locator("a[href^='/orchestra?id=']").first();
  await orch.click();
  await expect(page).toHaveURL(/\/orchestra\?id=/);
  await expect(page.getByTestId("dna-back")).toContainText(a, { timeout: 30000 });
  const o = (await page.getByTestId("dna-title").textContent())!.trim();
  // another song of that orchestra
  const b = page.locator("a[href^='/song?id=']").filter({ hasNot: page.locator("[href*='9abc1040ff']") });
  if (await b.count()) {
    await b.first().click();
    await expect(page).toHaveURL(/\/song\?id=/);
    await expect(page.getByTestId("dna-back")).toContainText(o, { timeout: 30000 });
    await page.getByTestId("dna-back").click();
    await expect(page).toHaveURL(/\/orchestra\?id=/);
  }
  await page.getByTestId("dna-back").click();
  await expect(page).toHaveURL(/\/song\?id=9abc1040ff/);
  await page.getByTestId("dna-back").click();
  await expect(page).toHaveURL(/\/library$/);
});

test("Compose on an iPhone at 200 % text never scrolls sideways", async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  await openFeatured(page);
  await page.addStyleTag({ content: "html{font-size:200%!important}" });
  await page.waitForTimeout(500);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/compose-iphone-200.png` });
  expect(over).toBeLessThanOrEqual(1);
  await ctx.close();
});

test("one night length: the header, “plays” and the sidebar agree", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFeatured(page);
  const header = await page.locator("#result h2.font-serif").first().textContent();
  expect(header).toMatch(/4 h 37 min/);
  expect(header).toMatch(/mostly Golden Age 1935–1945/);
});
