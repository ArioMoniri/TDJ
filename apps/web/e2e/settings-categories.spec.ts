import { expect, type Page, test } from "@playwright/test";

/**
 * 2026-11 — Settings in categories with one search (components/settings/SettingsShell.tsx, lib/settingsIndex.ts), on
 * a desktop, an iPad and a phone (playwright.config.ts: settings-desktop / settings-ipad / settings-phone). The
 * categories beside a pane from a 640 px content width (desktop, iPad portrait), the iOS drill-down below it (phone).
 * SETTINGS_SHOTS=<dir> also saves the screens.
 */
const SHOTS = process.env.SETTINGS_SHOTS;
const CATS = [
  "general",
  "appearance",
  "booth",
  "audio",
  "keyboard",
  "night",
  "connections",
  "ai",
  "library",
  "rooms",
  "battery",
  "about",
];
const isPhone = () => test.info().project.name === "settings-phone";
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${test.info().project.name.slice(9)}-${name}.png` });
};

/** the element's box lies inside the viewport */
async function inView(page: Page, selector: string) {
  return page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight && r.height > 0;
    });
}

/** horizontal overflow of the page, and any visible element sticking out of the viewport */
async function overflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    if (document.documentElement.scrollWidth > vw + 1)
      out.push(`page ${document.documentElement.scrollWidth} > ${vw}`);
    for (const el of document.querySelectorAll<HTMLElement>('[data-testid="settings"] *')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      // (a clipped child of a scroller or a clipped box is not on screen)
      let clipped = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement)
        if (getComputedStyle(p).overflowX !== "visible") clipped = true;
      if (!clipped && r.right > vw + 1) out.push(`${el.tagName}.${el.className} → ${Math.round(r.right)}`);
    }
    return out.slice(0, 8);
  });
}

test("the categories render: a list with icons beside one pane, or the phone's grouped list", async ({
  page,
}) => {
  await page.goto("/settings");
  const nav = page.getByTestId("settings-nav");
  await expect(nav).toBeVisible();
  for (const c of CATS) await expect(page.getByTestId(`settings-cat-${c}`)).toBeVisible();
  await expect(nav.locator(".group-inset")).toHaveCount(5);
  await expect(page.getByTestId("settings-cat-booth")).toContainText("Booth & Playback");
  // every row a 44 px target
  const small = await nav
    .locator("a")
    .evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 44).map((e) => e.textContent));
  expect(small).toEqual([]);
  await expect(page.locator("#settings-search")).toBeVisible();
  if (isPhone()) {
    // the list alone; a category opens as its own page, and Back returns to the list
    await expect(page.getByTestId("settings-pane-general")).toBeHidden();
    await shot(page, "list");
    await page.getByTestId("settings-cat-appearance").click();
    await expect(page).toHaveURL(/\/settings\?section=appearance$/);
    await expect(page.getByTestId("settings-pane-appearance")).toBeVisible();
    await expect(nav).toBeHidden();
    await expect(page.getByRole("radiogroup", { name: "Theme" })).toBeVisible();
    await shot(page, "appearance");
    await page.getByTestId("settings-back").click();
    await expect(nav).toBeVisible();
    await expect(page.getByTestId("settings-pane-appearance")).toBeHidden();
    await expect(page).toHaveURL(/\/settings$/);
  } else {
    // General shows beside the list; a category swaps the pane in place
    await expect(page.getByTestId("settings-pane-general")).toBeVisible();
    await expect(page.getByTestId("settings-cat-general")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("settings-back")).toBeHidden();
    await shot(page, "general");
    await page.getByTestId("settings-cat-night").click();
    await expect(page.getByTestId("settings-pane-night")).toBeVisible();
    await expect(page.getByTestId("settings-pane-general")).toBeHidden();
    await expect(page.getByTestId("settings-cat-night")).toHaveAttribute("aria-current", "page");
    await expect(page).toHaveURL(/\/settings\?section=night$/);
    await expect(nav).toBeVisible();
    await shot(page, "night");
  }
  // one pane at a time (the phone's list: none)
  await expect(page.locator("[data-settings-section]:visible")).toHaveCount(isPhone() ? 0 : 1);
});

test("search finds a setting by its label, a synonym and a Turkish word, and lands on it", async ({
  page,
}) => {
  await page.goto("/settings");
  const search = page.locator("#settings-search");
  // ⌘F / Ctrl+F focuses the search
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("ControlOrMeta+f");
  await expect(search).toBeFocused();
  // a synonym
  await page.keyboard.type("dark mode");
  const results = page.getByTestId("settings-results");
  await expect(results).toBeVisible();
  await expect(results.getByTestId("settings-result-theme")).toBeVisible();
  await expect(results.locator(".section-head").first()).toHaveText(/Appearance/i);
  // Esc clears
  await page.keyboard.press("Escape");
  await expect(search).toHaveValue("");
  await expect(results).toBeHidden();
  // a Turkish word, without its Turkish letters too
  await search.fill("kulaklık");
  await expect(results.locator('[data-testid^="settings-result-"]').first()).toHaveAttribute(
    "data-testid",
    "settings-result-outputs",
  );
  await search.fill("kulaklik");
  await expect(results.getByTestId("settings-result-outputs")).toBeVisible();
  // nothing found says so
  await search.fill("zzqx");
  await expect(results).toContainText("No settings match");
  // a label: the result opens its category, scrolls to the row and lights it up
  await search.fill("cortina play length");
  await shot(page, "search");
  await results.getByTestId("settings-result-cortina-length").click();
  await expect(page.getByTestId("settings-pane-night")).toBeVisible();
  await expect(page).toHaveURL(/section=night/);
  await expect(search).toHaveValue("");
  const row = page.locator('[data-setting="cortina-length"]');
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute("data-flash", "");
  await expect.poll(() => inView(page, '[data-setting="cortina-length"]')).toBe(true);
  await shot(page, "landed");
  // Enter takes the first result
  if (isPhone()) await page.getByTestId("settings-back").click();
  await search.fill("battery saver");
  await search.press("Enter");
  await expect(page.getByTestId("settings-pane-battery")).toBeVisible();
  await expect(page.getByTestId("settings-power")).toBeVisible();
});

test("deep links: a category, an old anchor and a sign-in coming back", async ({ page }) => {
  await page.goto("/settings?section=ai");
  await expect(page.getByTestId("settings-pane-ai")).toBeVisible();
  await expect(page.getByTestId("ai-models")).toBeVisible();
  // the anchors other pages link to
  await page.goto("/settings#settings-keyboard");
  await expect(page.getByTestId("settings-pane-keyboard")).toBeVisible();
  await expect.poll(() => inView(page, "#settings-keyboard")).toBe(true);
  await page.goto("/settings#lyrics-sources");
  await expect(page.getByTestId("settings-pane-connections")).toBeVisible();
  await expect.poll(() => inView(page, "#lyrics-sources")).toBe(true);
  await page.goto("/settings#connections");
  await expect(page.locator("#connectors")).toBeVisible();
  await page.goto("/settings#ai-key");
  await expect(page.getByTestId("settings-pane-ai")).toBeVisible();
  await expect(page.locator("#ai-status")).not.toContainText("Checking", { timeout: 20_000 });
  const key = page.locator("#ai-key");
  if (await key.count()) await expect.poll(() => inView(page, "#ai-key")).toBe(true);
  // an element that arrives late (the Booth's audio groups load once the page is idle)
  await page.goto("/settings?section=audio");
  await expect(page.getByTestId("settings-booth-audio")).toBeVisible({ timeout: 20_000 });
  // a service's sign-in comes back to Connections
  await page.goto("/settings?connected=dropbox");
  await expect(page.getByTestId("settings-pane-connections")).toBeVisible();
  // an unknown section falls back to the list (phone) or General
  await page.goto("/settings?section=nope");
  if (isPhone()) await expect(page.getByTestId("settings-nav")).toBeVisible();
  else await expect(page.getByTestId("settings-pane-general")).toBeVisible();
});

test("no horizontal overflow in any category, at the device width and at 320 px", async ({ page }) => {
  test.setTimeout(180_000);
  const widths = isPhone() ? [0, 320] : [0];
  for (const w of widths) {
    if (w) await page.setViewportSize({ width: w, height: 640 });
    await page.goto("/settings");
    await page.waitForTimeout(300);
    expect(await overflow(page), `list @${w || "device"}`).toEqual([]);
    for (const c of CATS) {
      await page.goto(`/settings?section=${c}`);
      await expect(page.getByTestId(`settings-pane-${c}`)).toBeVisible();
      await page.waitForTimeout(c === "audio" || c === "booth" ? 2000 : 300);
      expect(await overflow(page), `${c} @${w || "device"}`).toEqual([]);
    }
    await page.goto("/settings");
    await page.locator("#settings-search").fill("transition");
    await expect(page.getByTestId("settings-results")).toBeVisible();
    expect(await overflow(page), `results @${w || "device"}`).toEqual([]);
    if (w === 320) await shot(page, "320-results");
  }
});

test.describe("dark", () => {
  test.use({ colorScheme: "dark" });
  test("the categories and a pane read in dark mode", async ({ page }) => {
    await page.goto(isPhone() ? "/settings" : "/settings?section=booth");
    await expect(page.getByTestId("settings-nav")).toBeVisible();
    await page.waitForTimeout(500);
    await shot(page, "dark");
    // the content sits on the cell surface: no glass (backdrop blur) inside Settings
    const blurred = await page.evaluate(
      () =>
        [...document.querySelectorAll<HTMLElement>('[data-testid="settings"] *')].filter(
          (e) => getComputedStyle(e).backdropFilter !== "none" && !e.closest(".bar-edge"),
        ).length,
    );
    expect(blurred).toBe(0);
  });
});
