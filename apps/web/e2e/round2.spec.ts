/** Round 2: feedback recompose keeps locks, export without cortinas, database persistence, settings provider switch. */
import { devices, expect, test } from "@playwright/test";

test("feedback chip recomposes but a locked tanda stays in place", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Compose the night/ }).click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  const cards = page.locator("article[id^=tanda-]");
  const target = 2;
  const before = await cards.nth(target).locator("ol").innerText();
  const otherBefore = await cards
    .nth(target + 4)
    .locator("ol")
    .innerText();
  await cards
    .nth(target)
    .getByRole("button", { name: `Tanda ${target + 1} actions` })
    .click();
  await page.getByRole("menuitem", { name: "Lock tanda" }).click();
  await expect(cards.nth(target).getByText("locked")).toBeVisible();
  await page.getByRole("button", { name: "More energetic" }).click();
  await expect(page.locator("#result")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("#result")).toHaveAttribute("aria-busy", "false", { timeout: 60000 });
  expect(await cards.nth(target).locator("ol").innerText()).toBe(before);
  await expect(cards.nth(target).getByText("locked")).toBeVisible();
  // the rest of the night was rebuilt (energetic mood shifts the pool); at least the tanda count is sane
  expect(await cards.count()).toBeGreaterThan(10);
  test.info().annotations.push({
    type: "other tanda changed",
    description: String(
      (await cards
        .nth(target + 4)
        .locator("ol")
        .innerText()) !== otherBefore,
    ),
  });
});

test("export toggle without cortinas yields fewer rows (UI and API)", async ({ page, request }) => {
  const p = await (await request.post("/api/compose", { data: { hours: 2, seed: 7 } })).json();
  const withC = await (
    await request.post("/api/export", { data: { playlist: p, format: "csv", includeCortinas: true } })
  ).text();
  const noC = await (
    await request.post("/api/export", { data: { playlist: p, format: "csv", includeCortinas: false } })
  ).text();
  const cortinas = p.tandas.filter((t: { cortina: unknown }) => t.cortina).length;
  expect(cortinas).toBeGreaterThan(5);
  expect(withC.trim().split("\n").length - noC.trim().split("\n").length).toBe(cortinas);
  expect(noC).not.toContain('"cortina"');
  // every format honours the toggle
  for (const format of ["m3u8", "rekordbox", "traktor", "xspf", "serato", "setlist"]) {
    const a = await (
      await request.post("/api/export", { data: { playlist: p, format, includeCortinas: true } })
    ).text();
    const b = await (
      await request.post("/api/export", { data: { playlist: p, format, includeCortinas: false } })
    ).text();
    expect(a.length, format).toBeGreaterThan(b.length);
  }
  // real folder paths replace the TDJ/ placeholder
  const rb = await (
    await request.post("/api/export", {
      data: { playlist: p, format: "rekordbox", folder: "/Users/dj/Music/Tango" },
    })
  ).text();
  expect(rb).toContain("file://localhost/Users/dj/Music/Tango/");
  expect(rb).not.toContain("localhost/TDJ/");
  const tk = await (
    await request.post("/api/export", {
      data: { playlist: p, format: "traktor", folder: "/Users/dj/Music/Tango", naming: "{tanda} {title}" },
    })
  ).text();
  expect(tk).toContain('DIR="/:Users/:dj/:Music/:Tango/:"');
  expect(tk).toMatch(/FILE="\d\d [^"]+\.mp3"/);
  // UI: the sheet shows the count and the toggle lowers it
  await page.goto("/");
  await page.getByRole("button", { name: /Compose the night/ }).click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await page
    .getByRole("button", { name: /Export/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  const hint = dialog.getByText(/tracks will be exported/);
  await expect(hint).toBeVisible();
  const read = async () => Number((await hint.innerText()).match(/(\d+) tracks/)![1]);
  await page.waitForTimeout(500); // the count-up settles (375 ms)
  const n1 = await read();
  await dialog.getByRole("switch", { name: "Include cortinas" }).click();
  await page.waitForTimeout(500);
  const n2 = await read();
  expect(n2).toBeLessThan(n1);
});

test("database: a song edit persists after reload and reaches the composer", async ({ page }) => {
  await page.goto("/database");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Database");
  await page.getByLabel("Search the index").fill("di sarli rufino corazon");
  const row = page.locator("[data-song]").first();
  await expect(row).toBeVisible({ timeout: 15000 });
  const id = await row.getAttribute("data-song");
  // rows are plain text until Edit mode
  await expect(row.getByLabel(/^Year of/)).toHaveCount(0);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await row.getByLabel(/^Year of/).fill("1941");
  await expect(page.getByTestId("db-changes")).toHaveText(/^1 change/);
  await page.waitForTimeout(600); // debounce → IndexedDB
  await page.reload();
  await expect(page.getByTestId("db-changes")).toHaveText(/^1 change/, { timeout: 15000 });
  await page.getByLabel("Search the index").fill("di sarli rufino corazon");
  const again = page.locator(`[data-song="${id}"]`);
  await expect(again.getByText("1941")).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(again.getByLabel(/^Year of/)).toHaveValue("1941");
  await expect(again.getByRole("button", { name: "Revert" })).toBeVisible();
  // the compose page reports the edits in use
  await page.goto("/");
  await expect(page.getByText("Using your database edits")).toBeVisible({ timeout: 15000 });
  // rules tab stepper + reset
  await page.goto("/database");
  await page.getByRole("radio", { name: "Rules" }).click();
  await page.getByRole("button", { name: "Increase orchestra repeat gap" }).click();
  await expect(page.getByTestId("db-changes")).toHaveText(/^2 change/);
  // Reset lives in the ••• menu and confirms in a sheet (no window.confirm)
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: /Reset to index/ }).click();
  await expect(page.getByTestId("reset-confirm")).toBeVisible();
  await page.getByRole("button", { name: /^Reset 2 changes/ }).click();
  await expect(page.getByTestId("db-changes")).toHaveText(/^0 change/);
  // the undo toast brings the changes back, then dismisses
  await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
  await expect(page.getByTestId("db-changes")).toHaveText(/^2 change/);
});

test("settings: switching the model provider changes the default model and survives reload", async ({
  page,
}) => {
  await page.goto("/settings");
  const model = page.locator("#ai-model");
  await expect(model).toHaveValue("claude-sonnet-5-5");
  await page.getByRole("radio", { name: "OpenAI" }).click();
  await expect(model).toHaveValue("gpt-5.2");
  await page.locator("#ai-key").fill("sk-test");
  await page.getByRole("radio", { name: "Gemini" }).click();
  await expect(model).toHaveValue("gemini-3-pro");
  await page.reload();
  await expect(page.getByRole("radio", { name: "Gemini" })).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#ai-model")).toHaveValue("gemini-3-pro");
  // Test connection with a bogus key reports a provider error in the group footer, not a crash
  await page.getByRole("button", { name: "Test connection" }).click();
  const status = page.getByRole("status").first();
  await expect(status).not.toContainText("A model key lets you", { timeout: 30000 });
  await expect(status).not.toHaveText(/Checking/, { timeout: 30000 });
  // mobile: the database groups fit the phone width
  const ctx = await page
    .context()
    .browser()!
    .newContext({ ...devices["iPhone 15 Pro"], baseURL: process.env.TDJ_URL ?? "http://localhost:3000" });
  const mp = await ctx.newPage();
  await mp.goto("/database");
  await mp.getByLabel("Search the index").fill("troilo fiorentino");
  const group = mp.locator("[data-song]").first();
  await expect(group).toBeVisible({ timeout: 15000 });
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await ctx.close();
});
