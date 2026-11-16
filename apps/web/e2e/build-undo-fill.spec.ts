/**
 * 2026-11 (the owner: Build by hand — "Undo / Redo in the header, Reset with a confirm; Fill the rest becomes a menu,
 * each previewed in the guide; two-line version rows with one + Add and a … menu; the rule chips 44 px; nothing fits
 * offers Search instead / Change the rhythm"; and Compose's floating button must never cover "Import a playlist").
 */
import { devices, expect, type Page, test } from "@playwright/test";

test.describe.configure({ timeout: 240_000 });

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
}
async function fresh(page: Page) {
  await quiet(page);
  await page.goto("/build");
  await page.evaluate(() => {
    localStorage.removeItem("tdj-build-draft");
    localStorage.removeItem("tdj-build-meta");
  });
  await page.reload();
  await expect(page.getByTestId("build-guide")).toBeVisible({ timeout: 30000 });
  // React owns the header's buttons
  await expect
    .poll(() =>
      page
        .getByTestId("page-toolbar")
        .getByTestId("build-reset")
        .evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps")))
        .catch(() => false),
    )
    .toBe(true);
}
/** Fill → one scope → its preview in the guide → Apply */
async function fill(page: Page, scope: RegExp) {
  await page.getByTestId("build-fill").getByRole("button").click();
  await page.getByRole("menuitem", { name: scope }).click();
  const preview = page.getByTestId("build-fill-preview");
  await expect(preview).toBeVisible({ timeout: 60000 });
  return preview;
}
const tandas = (page: Page) => page.getByTestId("build-tanda");

test("Build by hand: Undo / Redo in the header and on ⌘Z / Ctrl+Y, Reset with a confirm (undoable), the Fill menu previewed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fresh(page);
  await expect(page.getByTestId("page-toolbar").getByTestId("build-undo")).toBeDisabled();
  await expect(page.getByTestId("page-toolbar").getByTestId("build-redo")).toBeDisabled();

  // the Fill menu: four scopes, the preview says what it adds before anything changes
  await page.getByTestId("build-fill").getByRole("button").click();
  for (const name of [
    "Fill the next tanda",
    /Fill one cycle \(T T V T T M\)/,
    "Fill to the target length",
    "Fill everything",
  ])
    await expect(page.getByRole("menuitem", { name })).toBeVisible();
  await page.keyboard.press("Escape");
  let preview = await fill(page, /Fill the next tanda/);
  await expect(preview.getByTestId("build-fill-summary")).toContainText("New tandas: 1 (");
  await expect(tandas(page)).toHaveCount(0);
  await preview.getByTestId("build-fill-apply").click();
  await expect(tandas(page)).toHaveCount(1);
  await expect(page.getByTestId("toast")).toContainText("Fill the next tanda");

  // Undo / Redo: the header's buttons
  await page.getByTestId("page-toolbar").getByTestId("build-undo").click();
  await expect(tandas(page)).toHaveCount(0);
  await expect(page.getByTestId("page-toolbar").getByTestId("build-redo")).toBeEnabled();
  await page.getByTestId("page-toolbar").getByTestId("build-redo").click();
  await expect(tandas(page)).toHaveCount(1);
  // … and the keys (⌘Z / Ctrl+Z, ⌘Y / Ctrl+Y)
  await page.locator("body").click({ position: { x: 5, y: 300 } });
  await page.keyboard.press("ControlOrMeta+z");
  await expect(tandas(page)).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+y");
  await expect(tandas(page)).toHaveCount(1);

  // one cycle: the night's rhythm cycle of new tandas, previewed; Cancel changes nothing
  preview = await fill(page, /Fill one cycle/);
  await expect(preview.getByTestId("build-fill-summary")).toContainText(/New tandas: 6 \([TVM ]+\)/);
  await preview.getByTestId("build-fill-cancel").click();
  await expect(page.getByTestId("build-fill-preview")).toHaveCount(0);
  await expect(tandas(page)).toHaveCount(1);
  preview = await fill(page, /Fill one cycle/);
  await preview.getByTestId("build-fill-apply").click();
  await expect(tandas(page)).toHaveCount(7);

  // Reset: confirmed once, an empty night; itself undoable
  await page.getByTestId("page-toolbar").getByTestId("build-reset").click();
  const sheet = page.getByTestId("build-reset-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("build-reset-tonight")).toBeVisible();
  await sheet.getByTestId("build-reset-empty").click();
  await expect(tandas(page)).toHaveCount(0);
  await page.getByTestId("page-toolbar").getByTestId("build-undo").click();
  await expect(tandas(page)).toHaveCount(7);
  // the draft survives a reload as it is now
  await page.reload();
  await expect(tandas(page)).toHaveCount(7, { timeout: 30000 });
});

test("Build by hand: two-line version rows of one height with + Add and …, 44 px rule chips, nothing fits offers a way on", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await fresh(page);
  const panel = page.getByTestId("build-add-panel");
  // the rule chips: every chip and both selects 44 px; the Favourites heart sits on the word's line
  const chips = panel.getByTestId("build-chips");
  for (const el of await chips.locator("button, select").all()) {
    const b = (await el.boundingBox())!;
    expect(Math.round(b.height), await el.innerText().catch(() => "select")).toBe(44);
  }
  const fav = chips.getByTestId("build-chip-fav");
  const heart = (await fav.locator("svg").boundingBox())!;
  const word = (await fav.locator("span").boundingBox())!;
  expect(Math.abs(heart.y + heart.height / 2 - (word.y + word.height / 2))).toBeLessThan(4);

  // version rows: title + one fit line, one + Add and a … menu, the same height every row
  await panel.locator("#build-search").fill("Bahía Blanca");
  const rows = panel.getByTestId("build-version");
  await expect(rows.first()).toBeVisible({ timeout: 30000 });
  const n = Math.min(await rows.count(), 6);
  const heights = new Set<number>();
  for (let i = 0; i < n; i++) {
    const r = rows.nth(i);
    heights.add(Math.round((await r.boundingBox())!.height));
    await expect(r.getByTestId("build-version-add")).toHaveCount(1);
    await expect(r.getByTestId("build-version-more")).toHaveCount(1);
    await expect(r.getByTestId("build-fit-line")).toHaveCount(1);
  }
  expect(heights.size).toBe(1);
  // the ⓘ opens every reason
  await rows.first().getByTestId("build-version-info").click();
  await expect(rows.first().getByTestId("build-version-info-pop")).toBeVisible();
  await page.keyboard.press("Escape");
  await rows.first().getByTestId("build-version-add").click();
  await expect(tandas(page)).toHaveCount(1, { timeout: 20000 });
  // the … menu starts a new tanda with another version
  await rows.nth(1).getByTestId("build-version-more").getByRole("button").click();
  await page.getByRole("menuitem", { name: /Start a new tanda/ }).click();
  const asked = page.getByTestId("rule-sheet");
  await expect(async () => {
    if (await asked.isVisible().catch(() => false)) await page.getByTestId("rule-as-said").click();
    await expect(tandas(page)).toHaveCount(2, { timeout: 1500 });
  }).toPass({ timeout: 20000 });

  // a search result that breaks the tanda: its warning on its own line, never cut
  await tandas(page).first().getByTestId("build-tanda-select").click();
  await panel.locator("#build-search").fill("");
  await panel.getByRole("button", { name: "Milonga", exact: true }).click();
  const bad = panel.locator('[data-testid="build-hit"][data-fits="false"]').first();
  await expect(bad).toBeVisible({ timeout: 20000 });
  const why = bad.getByTestId("build-why");
  await expect(why).toContainText(/^⚠\s*A /);
  expect(await why.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
});

test("phone: the floating Compose never covers Import a playlist", async ({ browser, baseURL }) => {
  const { defaultBrowserType: _d, ...iphone } = devices["iPhone 15 Pro"];
  const ctx = await browser.newContext({ ...iphone, baseURL });
  const page = await ctx.newPage();
  await quiet(page);
  await page.goto("/");
  const bar = page.getByTestId("bar-compose");
  await expect(bar).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(800);
  const clash = async () => {
    const b = await bar.boundingBox();
    const r = await page.getByTestId("first-run-import").boundingBox();
    const shown = await page
      .getByTestId("primary-bar")
      .evaluate((e) => getComputedStyle(e).visibility === "visible" && getComputedStyle(e).opacity !== "0");
    if (!b || !r || !shown) return false;
    return r.y + r.height > b.y && r.y < b.y + b.height && r.x + r.width > b.x;
  };
  expect(await clash()).toBe(false);
  // through a slow scroll the row passes the button's band: the button steps aside, then comes back
  for (let y = 0; y <= 600; y += 40) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(260);
    expect(await clash(), `at ${y}`).toBe(false);
  }
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.getByTestId("primary-bar")).not.toHaveAttribute("data-hidden", "true");
  await ctx.close();
});
