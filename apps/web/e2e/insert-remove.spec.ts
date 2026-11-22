/**
 * 2026-11 (the owner: "songs and tandas insertable or removable in each tanda and before / after tandas, by AI and
 * manually; the AI guides; near the Cumparsitas it checks the Cumparsita; a setting for the last La Cumparsita"; and
 * "in the Booth, add or remove tandas to end the night at a time"; and "Build by hand: just search and add").
 * - Compose: a tanda's "Add song here" opens the Insert sheet (suggestions for the spot with a why, the smart search,
 *   Ask my AI); a suggestion goes in through the rule check, the guide says what changed, ⌘Z takes it back;
 *   "Insert a tanda before the first" offers tandas for the spot and the guide checks the opening La Cumparsita;
 *   "Remove tanda" takes it out with its cortina.
 * - Settings → Night → "The last La Cumparsita": 4 + 1 composes a night whose closing is the última's fifth song.
 * - The Booth: "Change the end…" +20 min previews the new end and the added tandas, Apply changes the plan, Undo.
 * - Build by hand: the plain search adds a version to the tanda (Enter) or as a new tanda (Shift+Enter), with the
 *   guide line under each version; every top-level card stands ≥ 16 px from the next, none intersects.
 */
import { expect, type Page, test } from "@playwright/test";

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
const tandaCount = (page: Page) => page.locator("#result article[data-tanda]").count();
const undo = (page: Page) => page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");

test("Compose: add a song at a place, insert a tanda before the first, remove a tanda — rule check, guide, undo", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFeatured(page);
  const n0 = await tandaCount(page);
  // a side in the first unlocked tanda: the Insert sheet with suggestions for that place
  const card = page
    .locator("#result article[data-tanda]")
    .filter({ has: page.getByTestId("tanda-add-song") })
    .first();
  const n = await card.getAttribute("data-tanda");
  const sides0 = await card.locator("li[data-song]").count();
  await card.getByTestId("tanda-add-song").click();
  const sheet = page.getByTestId("insert-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("insert-where")).toContainText(`Tanda ${n}`);
  await expect(sheet.getByTestId("insert-search")).toBeVisible();
  await expect(sheet.getByTestId("insert-ask-ai")).toBeVisible();
  const first = sheet.getByTestId("insert-suggestion").first();
  await expect(first).toBeVisible({ timeout: 30000 });
  await expect(first).toContainText(/energy \d+/);
  // place 1: the side goes in first
  await sheet.getByTestId("insert-place").first().click();
  await expect(sheet.getByTestId("insert-where")).toContainText("place 1");
  await sheet.getByTestId("insert-suggestion").first().click();
  // the edit applied (or the rule check asked: then "Do it as I said")
  const asked = page.getByTestId("rule-sheet");
  if (await asked.isVisible().catch(() => false)) await page.getByTestId("rule-as-said").click();
  await expect(card.locator("li[data-song]")).toHaveCount(sides0 + 1, { timeout: 20000 });
  // ⌘Z takes it back
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await undo(page);
  await expect(card.locator("li[data-song]")).toHaveCount(sides0, { timeout: 20000 });

  // a tanda before the first: tandas for the spot, then the guide (the night longer; the opening La Cumparsita)
  await page.getByTestId("insert-tanda-first-button").click();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("insert-where")).toContainText("Before the first tanda");
  const opt = sheet.getByTestId("insert-suggestion").first();
  await expect(opt).toBeVisible({ timeout: 60000 });
  await expect(opt).toContainText(/the arc wants \d+ here/);
  await opt.click();
  if (await asked.isVisible().catch(() => false)) await page.getByTestId("rule-as-said").click();
  await expect.poll(() => tandaCount(page), { timeout: 20000 }).toBe(n0 + 1);
  const guide = page.getByTestId("edit-guide");
  await expect(guide).toBeVisible({ timeout: 30000 });
  await expect(guide.locator("[data-key='length']")).toContainText("longer");
  const opening = guide.locator("[data-key='opening']");
  if (await opening.count()) {
    await expect(opening).toContainText("switch the opening La Cumparsita");
    await opening.getByTestId("edit-guide-fix").click();
    if (await asked.isVisible().catch(() => false)) await page.getByTestId("rule-as-said").click();
  }
  await page.getByTestId("edit-guide-close").click();
  await expect(guide).toBeHidden();

  // remove tanda 3 from its menu: one tanda fewer, the guide says a cortina went with it
  const n1 = await tandaCount(page);
  // an unlocked tanda past the first (the featured night keeps some of its tandas as they are)
  const t3 = page
    .locator("#result article[data-tanda]")
    .filter({ has: page.getByTestId("tanda-add-song") })
    .nth(1);
  // (its actions menu — the tanda's Play button is a menu too now: "Play this tanda / from here")
  await t3.getByRole("button", { name: /^Tanda \d+ actions$/ }).click();
  await page.getByRole("menuitem", { name: "Remove tanda" }).click();
  if (await asked.isVisible().catch(() => false)) await page.getByTestId("rule-as-said").click();
  await expect.poll(() => tandaCount(page), { timeout: 20000 }).toBe(n1 - 1);
  await expect(guide).toBeVisible({ timeout: 30000 });
  await expect(guide).toContainText(/shorter/);
});

test("Settings → Night: the last La Cumparsita as 4 + 1 composes it as the última's fifth song", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await quiet(page);
  await page.goto("/settings?section=night");
  const night = page.getByTestId("settings-night");
  await expect(night).toBeVisible({ timeout: 30000 });
  await expect(night.getByRole("combobox", { name: "The last La Cumparsita" })).toHaveValue("straight");
  // (the store hydrates after the first paint: the choice is made again until it holds)
  await expect(async () => {
    await night.getByRole("combobox", { name: "The last La Cumparsita" }).selectOption("in-tanda");
    await expect(night).toContainText("A four-song última", { timeout: 2000 });
  }).toPass({ timeout: 30000 });
  await page.waitForFunction(() =>
    (localStorage.getItem("tdj-v1") ?? "").includes('"closingFormat":"in-tanda"'),
  );
  await page.goto("/");
  await page.getByRole("button", { name: /Compose the night/ }).click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 120000 });
  await expect(page.locator("#result")).toContainText("4 + 1: the fifth song of tanda", { timeout: 30000 });
  const last = page.locator("#result article[data-tanda]").last();
  await expect(last).toHaveAttribute("data-rhythm", "tango");
});

test("Booth: Change the end… +20 min previews the added tandas and the new end, Apply, Undo", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFeatured(page);
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/, { timeout: 60000 });
  const items = () =>
    page.evaluate(
      () =>
        (
          window as unknown as { __tdjBooth: { getState: () => { plan: { items: unknown[] } | null } } }
        ).__tdjBooth.getState().plan?.items.length ?? 0,
    );
  await expect.poll(items, { timeout: 60000 }).toBeGreaterThan(0);
  const n0 = await items();
  await page.getByTestId("booth-change-end").first().click();
  const sheet = page.getByTestId("booth-end-sheet");
  await expect(sheet).toBeVisible();
  await sheet.getByTestId("booth-end-plus-20").click();
  await expect(sheet.getByTestId("booth-end-result")).toContainText(/Ends \d\d?:\d\d/, { timeout: 90000 });
  await expect(sheet.getByTestId("booth-end-added").first()).toBeVisible();
  await expect(sheet.getByTestId("end-energy")).toHaveCount(2);
  await sheet.getByTestId("booth-end-apply").click();
  const asked = page.getByTestId("rule-sheet");
  if (await asked.isVisible().catch(() => false)) await page.getByTestId("rule-as-said").click();
  await expect(sheet).toBeHidden({ timeout: 20000 });
  await expect.poll(items, { timeout: 20000 }).toBeGreaterThan(n0);
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await undo(page);
  await expect.poll(items, { timeout: 20000 }).toBe(n0);
});

test("Build by hand: search and add (Enter, Shift+Enter) with the guide line; the cards keep 16 px apart", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await quiet(page);
  await page.goto("/build");
  await page.evaluate(() => {
    localStorage.removeItem("tdj-build-draft");
    localStorage.removeItem("tdj-build-meta");
  });
  await page.reload();
  await expect(page.getByTestId("build-guide")).toBeVisible({ timeout: 30000 });
  const panel = page.getByTestId("build-add-panel");
  // the plain search leads the panel
  const box = await panel.boundingBox();
  const search = await panel.getByTestId("build-search-first").boundingBox();
  expect(search!.y - box!.y).toBeLessThan(60);
  const field = panel.locator("#build-search");
  await field.fill("Bahía Blanca");
  const version = panel.getByTestId("build-version").first();
  await expect(version).toBeVisible({ timeout: 30000 });
  await expect(panel.getByTestId("build-fit-line").first()).toContainText(/starts a new tanda/);
  await field.press("Enter");
  const tandas = page.getByTestId("build-tanda");
  await expect(tandas).toHaveCount(1, { timeout: 20000 });
  await expect(tandas.first().getByTestId("build-side")).toHaveCount(1);
  // the next search: each version says what it does to that tanda (orchestra, singer, years, length)
  await field.fill("Comme il faut");
  // (the results answer the new words — the search worker answers a moment later; until then the list, and Enter,
  // are still Bahía Blanca's, whose fit line reads the same)
  await expect(panel.getByTestId("build-smart")).toHaveAttribute("data-answered", "Comme il faut", {
    timeout: 30000,
  });
  await expect(panel.getByTestId("build-version").first()).toBeVisible({ timeout: 30000 });
  await expect(panel.getByTestId("build-fit-line").first()).toContainText(/tanda \d+:\d\d/);
  await expect(panel.getByTestId("build-fit-line").first()).toContainText(/years \d{4}/);
  // Shift+Enter: a new tanda with it
  await field.press("Shift+Enter");
  const asked = page.getByTestId("rule-sheet");
  // (the rule check may ask a moment after the key: answer it whenever it shows)
  await expect(async () => {
    if (await asked.isVisible().catch(() => false)) await page.getByTestId("rule-as-said").click();
    await expect(tandas).toHaveCount(2, { timeout: 1500 });
  }).toPass({ timeout: 20000 });
  // covers on the tanda and on each side
  await expect(tandas.first().getByTestId("build-tanda-art")).toBeVisible();
  await expect(tandas.first().getByTestId("build-side").first().getByTestId("row-art")).toBeVisible();
  // one vertical rhythm: every top-level card ≥ 16 px from the next, none intersecting — measured once the new tanda's
  // entrance (a 6 px rise) has settled: mid-flight it read 14.95 px
  await page.waitForFunction(() =>
    [...document.querySelectorAll<HTMLElement>("[data-reorder-row]")].every((e) => {
      const tr = getComputedStyle(e).transform;
      return tr === "none" || tr === "matrix(1, 0, 0, 1, 0, 0)";
    }),
  );
  const gaps = await page.evaluate(() => {
    const col = document.querySelector("section.build-stack[aria-label]") as HTMLElement;
    const blocks: DOMRect[] = [];
    const take = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.height > 0) blocks.push(r);
    };
    for (const el of Array.from(col.children)) {
      if (el.matches("[data-reorder-list]")) for (const t of Array.from(el.children)) take(t);
      else if (!el.matches("h2")) take(el);
    }
    const out: number[] = [];
    for (let i = 1; i < blocks.length; i++) out.push(blocks[i]!.top - blocks[i - 1]!.bottom);
    return out;
  });
  expect(gaps.length).toBeGreaterThan(3);
  for (const g of gaps) expect(g).toBeGreaterThanOrEqual(15.5);
  // the guidance actions are buttons with 44 px targets
  for (const b of await page.getByTestId("build-fix").all()) {
    const r = await b.boundingBox();
    if (r) expect(r.height).toBeGreaterThanOrEqual(44);
  }
});
