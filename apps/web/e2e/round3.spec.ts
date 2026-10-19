/** Round 3: night rules (opening / double Cumparsita), era presets with pinned controls, agent memory. */
import { expect, test } from "@playwright/test";

test("night rules: opening with La Cumparsita shows the Opening card; Buenos Aires closes with two", async ({
  page,
  request,
}) => {
  // engine: the última tanda ends with its own Cumparsita and the standalone closing follows; a break is reported
  const p = await (
    await request.post("/api/compose", {
      data: { hours: 2, seed: 3, rules: { openWithCumparsita: true, cumparsitaCount: 2, showBreakAt: 0.5 } },
    })
  ).json();
  expect(p.opening?.title.toLowerCase()).toContain("cumparsita");
  expect(p.closing?.title.toLowerCase()).toContain("cumparsita");
  // the última takes its own La Cumparsita only when that orchestra recorded one; when it does, it is announced
  const ult = p.tandas.at(-1);
  if (ult.songs.at(-1).title.toLowerCase().includes("cumparsita"))
    expect(ult.note).toContain("own La Cumparsita");
  else expect(ult.note ?? "").not.toContain("own La Cumparsita");
  expect(p.breaks?.[0]?.minutes).toBe(20);
  // the break reaches the set list and the CSV as a row
  const txt = await (await request.post("/api/export", { data: { playlist: p, format: "setlist" } })).text();
  expect(txt).toContain("Show / break · 20 min");
  const csv = await (await request.post("/api/export", { data: { playlist: p, format: "csv" } })).text();
  expect(csv).toContain('"break"');

  // UI: the rules group drives the compose request and the result renders opening, note and break
  await page.goto("/");
  await page.getByRole("switch", { name: "Open with La Cumparsita" }).click();
  await page.getByRole("radio", { name: "Two (Buenos Aires)" }).click();
  await page.getByRole("switch", { name: "Show or break" }).click();
  await page.getByRole("switch", { name: "Birthday vals" }).click();
  const req = page.waitForRequest((r) => r.url().includes("/api/compose") && r.method() === "POST");
  const res = page.waitForResponse(
    (r) => r.url().includes("/api/compose") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: /Compose the night/ }).click();
  const body = (await req).postDataJSON();
  expect(body.rules.openWithCumparsita).toBe(true);
  expect(body.rules.cumparsitaCount).toBe(2);
  expect(body.rules.showBreakAt).toBe(0.5);
  const set = (await (await res).json()) as { tandas: Array<{ note?: string }> };
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId("opening")).toBeVisible();
  await expect(page.getByTestId("break")).toContainText("Show / break · 20 min");
  await expect(page.getByTestId("tanda-note").filter({ hasText: "Vals de cumpleaños" })).toBeVisible();
  // the última only takes its own La Cumparsita when that orchestra recorded one (seed-dependent in the UI)
  if (set.tandas.at(-1)?.note?.includes("own La Cumparsita")) {
    await expect(page.getByTestId("tanda-note").filter({ hasText: "own La Cumparsita" })).toBeVisible();
    await expect(page.locator("article[id^=tanda-]").last().locator("ol")).toContainText(/Cumparsita/);
  }
  await expect(page.getByRole("heading", { name: "Closing" })).toBeVisible();
});

test("era presets: switching era applies its defaults unless a control is pinned; reset restores them", async ({
  page,
}) => {
  await page.goto("/");
  const era = page.getByLabel("Era", { exact: true });
  await expect(era).toHaveValue("golden");
  await expect(page.getByText("4 tracks").first()).toBeVisible();
  await era.selectOption("nuevo");
  await expect(page.getByText(/^Era defaults applied:/)).toBeVisible();
  await expect(page.getByText("3 tracks").first()).toBeVisible();
  await expect(page.getByText("30 s").first()).toBeVisible();
  await expect(page.getByRole("radio", { name: "Matched" })).toHaveAttribute("aria-checked", "true");
  // pin the cortina length, go back to Golden: the pinned control keeps 30 s, the rest follows the era
  await page.getByRole("button", { name: "Pin cortina length" }).click();
  await era.selectOption("golden");
  await expect(page.getByText("30 s").first()).toBeVisible();
  await expect(page.getByText("4 tracks").first()).toBeVisible();
  await expect(page.getByRole("radio", { name: "Family" })).toHaveAttribute("aria-checked", "true");
  // reset applies every era default, pins or not
  await page.getByRole("button", { name: "Reset to era defaults" }).click();
  await expect(page.getByText("45 s").first()).toBeVisible();
  // pins never leave the browser
  const req = page.waitForRequest((r) => r.url().includes("/api/compose") && r.method() === "POST");
  await page.getByRole("button", { name: /Compose the night/ }).click();
  const body = (await req).postDataJSON();
  expect(body.pinned).toBeUndefined();
  expect(body.eras).toEqual(["golden"]);
  expect(body.cortinaLengthSec).toBe(45);
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
});

test("memory: a note survives a reload and travels with the review request", async ({ page }) => {
  const note = `Thursday crowd likes Donato milongas ${Date.now().toString(36)}`;
  await page.goto("/database");
  await page.getByRole("radio", { name: "Memory" }).click();
  await page.getByRole("button", { name: "Add a note…" }).click();
  await page.locator("#memory-note").fill(note);
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("memory-notes")).toContainText(note);
  await page.waitForTimeout(600); // debounce → IndexedDB
  await page.reload();
  await page.getByRole("radio", { name: "Memory" }).click();
  await expect(page.getByTestId("memory-notes")).toContainText(note, { timeout: 15000 });
  // the settings row shows what is stored
  await page.goto("/settings");
  await expect(page.getByText(/In this browser · \d+ items?/)).toBeVisible();
  await expect(page.getByRole("switch", { name: /learn from my feedback/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  // a composed set is remembered, and the review request carries the memory (the provider error path is fine)
  await page.goto("/");
  await page.getByRole("button", { name: /Compose the night/ }).click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  const review = page.waitForRequest((r) => r.url().includes("/api/ai/review") && r.method() === "POST");
  await page.getByRole("button", { name: "Written review" }).click();
  const body = (await review).postDataJSON();
  expect(body.memory.notes.map((n: { text: string }) => n.text)).toContain(note);
  expect(body.memory.sets.length).toBeGreaterThan(0);
  await expect(page.getByRole("dialog", { name: "Written review" })).toContainText(/key|Settings/i, {
    timeout: 30000,
  });
  await page.keyboard.press("Escape");
  // liked flag on the result header lands in the set history
  await page.getByRole("button", { name: "Mark as liked" }).click();
  await page.waitForTimeout(600); // debounce → IndexedDB
  await page.goto("/database");
  await page.getByRole("radio", { name: "Memory" }).click();
  await expect(page.getByText(/· liked/).first()).toBeVisible();
});
