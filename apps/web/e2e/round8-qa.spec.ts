/**
 * Round 8 QA fixes (docs/reviews/round8-qa.md): no stale cards after recomposes (B1), a play button in Library
 * results (B2), the Export sheet's pinned primary and its cloud rows (B5, UX 9), Reopen in Compose (B11), the
 * booth Time card while sources resolve and the Start label (B7), Space with a queued break (B8), WAV names (B9),
 * the desktop ••• (B16), one Cancel in Clear history (B10), per-page titles (B17), the arc-shape control and the
 * featured night (deep link, hero card, Booth row).
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";

async function compose(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Compose the night/ }).click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
}
function wav(): Buffer {
  const rate = 22050;
  const n = rate * 8;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++)
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 9830), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
const WAV = wav();
async function mockPreviews(page: Page) {
  await page.route(/dzcdn\.net|preview\.test|\/api\/preview\?/, (route) =>
    route.request().url().includes("json=1")
      ? route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ url: "https://preview.test/clip.wav" }),
        })
      : route.fulfill({
          status: 200,
          contentType: "audio/wav",
          body: WAV,
          headers: { "access-control-allow-origin": "*" },
        }),
  );
}

test("B1: three regenerates keep one card per tanda and a bounded page height", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await compose(page);
  await page.waitForTimeout(800);
  const tandas = async () =>
    page.evaluate(
      () => JSON.parse(localStorage.getItem("tdj-v1") ?? "{}").state?.playlist?.tandas?.length ?? 0,
    );
  const h0 = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let i = 0; i < 3; i++) {
    const req = page.waitForRequest((r) => r.url().includes("/api/compose") && r.method() === "POST");
    await page.getByTestId("toolbar-regenerate").click();
    await req;
    await expect(page.getByTestId("toolbar-regenerate")).toBeEnabled({ timeout: 60000 });
    await page.waitForTimeout(1200);
    const n = await tandas();
    expect(await page.locator("article[id^=tanda-]").count(), `regenerate ${i + 1}: articles`).toBe(n);
    const ids = await page.locator("article[id^=tanda-]").evaluateAll((els) => els.map((e) => e.id));
    expect(new Set(ids).size, `regenerate ${i + 1}: unique ids`).toBe(ids.length);
  }
  const h3 = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(h3).toBeLessThan(h0 * 1.6);
  // the page still answers: a lock toggles at once
  await page.locator("#tanda-1").scrollIntoViewIfNeeded();
  await page.locator("#tanda-1").hover();
  await page.getByRole("button", { name: "Lock tanda 1", exact: true }).click();
  await expect(page.locator("#tanda-1")).toHaveAttribute("data-locked", "true", { timeout: 5000 });
});

test("B2/B3: Library results carry a play button and a second search still answers", async ({ page }) => {
  await page.goto("/library");
  await page.locator("#library-search").fill("Poema");
  await expect(page.getByRole("heading", { name: /results/ })).toBeVisible({ timeout: 15000 });
  expect(await page.getByTestId("play-button").count()).toBeGreaterThan(0);
  await expect(page.getByTestId("play-button").first()).toHaveAccessibleName(/Play |Find /);
  await page.locator("#library-search").fill("zzzzqqq");
  await expect(page.getByText(/Nothing matches/)).toBeVisible({ timeout: 15000 });
  await page.locator("#library-search").fill("Di Sarli");
  await expect(page.getByRole("heading", { name: /results/ })).toBeVisible({ timeout: 15000 });
});

test("B5 / UX 9: the Export footer is the M3U8 until Spotify is connected; cloud rows show Connect in Settings", async ({
  page,
}) => {
  await compose(page);
  await page.keyboard.press("Meta+e");
  const sheet = page.getByTestId("export-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("export-primary")).toContainText("M3U8");
  await expect(sheet.locator("#spotify-create")).toHaveCount(0);
  await expect(sheet.locator("#send-spotify")).toBeEnabled();
  await expect(sheet.locator("#send-spotify")).not.toContainText("Needs a Client ID");
  for (const id of ["send-youtube-off", "send-dropbox-off", "send-google_drive-off"]) {
    const row = sheet.locator(`#${id}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText("Connect in Settings");
    expect(await row.evaluate((el) => el.tagName)).toBe("DIV"); // a label, not an action
  }
  // the "N songs + cortinas" line explains the DJ software files
  await expect(sheet.locator("#export-count")).toContainText(/\d+ songs/);
  const dlPromise = page.waitForEvent("download");
  await sheet.getByTestId("export-primary").click();
  expect((await dlPromise).suggestedFilename()).toMatch(/\.m3u8$/);
});

test("B11 / B16 / B13: Reopen in Compose lands on the set; desktop ••• has Tell the DJ and Clear set; ⌘K shows the field", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await compose(page);
  await page.getByTestId("page-toolbar").getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Tell the DJ…" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Clear set" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Tell the DJ…" }).click();
  await expect(page.locator("#tell-dj")).toBeFocused();
  await expect(page.locator("#tell-dj")).toBeInViewport();
  await page.goto("/history");
  await page.locator('[id^="history-"]').first().click();
  await page.getByTestId("history-detail").getByRole("button", { name: "Reopen in Compose" }).click();
  await expect(page).toHaveURL(/\/#result|\/$/);
  await expect(page.locator("#result")).toBeVisible({ timeout: 15000 });
  expect(await page.locator("article[id^=tanda-]").count()).toBeGreaterThan(10);
  // Clear set from the desktop •••
  await page.getByTestId("page-toolbar").getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Clear set" }).click();
  await expect(page.locator("#result")).toHaveCount(0);
});

test("B7 / B8 / B9: the Time card says it is resolving, Start counts the clips, Space ends a queued break, WAV names match", async ({
  page,
}) => {
  await mockPreviews(page);
  await compose(page);
  // WAV files named like the exports match (B9), from files (a rehearsal plays the clips first)
  await page.goto("/booth");
  await expect(page.getByTestId("booth")).toBeVisible({ timeout: 15000 });
  await expect
    .poll(() => page.evaluate(() => !!(window as unknown as { __tdjBoothPlan?: unknown }).__tdjBoothPlan), {
      timeout: 15000,
    })
    .toBe(true);
  const plan = await page.evaluate(
    () =>
      (
        window as unknown as {
          __tdjBoothPlan: { items: Array<{ kind: string; title: string; artist: string }> };
        }
      ).__tdjBoothPlan,
  );
  const safe = (s: string) =>
    s
      .replace(/[/\\:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  const dir = mkdtempSync(join(tmpdir(), "tdj-wav-"));
  for (const t of plan.items.filter((i) => i.kind === "track").slice(0, 3))
    writeFileSync(join(dir, `${safe(t.artist)} - ${safe(t.title)}.wav`), WAV);
  await page.getByTestId("booth-folder-input").setInputFiles(dir);
  await expect
    .poll(() => page.locator('[data-plan-index][data-source="file"]').count(), { timeout: 20000 })
    .toBeGreaterThanOrEqual(1);
  // rehearsal: never a bare 0 while sources resolve (B7), the Start button counts the clips
  await page.goto("/booth?rehearsal=1");
  await expect(page.getByTestId("booth")).toBeVisible({ timeout: 15000 });
  await expect
    .poll(async () => {
      const ttc = page.getByTestId("booth-ttc");
      const resolving = (await ttc.getAttribute("data-resolving")) === "1";
      const text = (await ttc.textContent()) ?? "";
      return resolving || (/\d/.test(text) && text.trim() !== "0:00");
    })
    .toBe(true);
  await expect(page.getByTestId("booth-resolving")).toHaveCount(0, { timeout: 20000 });
  const ttc = Number(await page.getByTestId("booth-time").getAttribute("data-ttc"));
  expect(ttc).toBeGreaterThan(0);
  await expect(page.getByTestId("booth-start")).toHaveText(/Start with 30 s clips( · \d+ without a clip)?/);
  // Space with a queued break ends the break instead of leaving the transport unreadable (B8)
  await page.getByTestId("booth-start").click();
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing", { timeout: 20000 });
  await page.getByTestId("booth-more").click();
  await page.getByRole("menuitem", { name: "Break…" }).click();
  await page.getByRole("button", { name: /^Break for 10 min/ }).click();
  await expect(page.getByTestId("booth-play")).toHaveText(/End break/, { timeout: 5000 });
  await expect(page.getByRole("dialog")).toHaveCount(0); // keys are ignored while a sheet is up
  await page.keyboard.press("Space");
  await expect(page.getByTestId("booth-hold")).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing");
});

test("B10 / B17: one Cancel in Clear history; every page has its own title", async ({ page }) => {
  await compose(page);
  await expect(page).toHaveTitle("Compose · TDJ");
  await page.goto("/history");
  await expect(page).toHaveTitle("History · TDJ");
  await page.getByTestId("page-toolbar").getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Clear history…" }).click();
  const sheet = page.getByRole("dialog", { name: "Clear history" });
  await expect(sheet).toBeVisible();
  expect(await sheet.getByRole("button", { name: "Cancel" }).count()).toBe(1);
  await page.keyboard.press("Escape");
  for (const [path, title] of [
    ["/library", "Library"],
    ["/database", "Database"],
    ["/settings", "Settings"],
    ["/guide", "Guide"],
  ] as const) {
    await page.goto(path);
    await expect(page).toHaveTitle(`${title} · TDJ`);
  }
});

test("arc shape: the Set-up control travels as an explicit key and the result names the shape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  // under load the first click can land before hydration: retry until the control answers
  // one Arc control: picking "Two peaks" explicitly also fixes the engine's double-peak shape
  const single = page.getByRole("radio", { name: "Single peak" });
  const dbl = page.getByRole("radio", { name: "Two peaks" });
  await expect(async () => {
    await single.click();
    await expect(single).toHaveAttribute("aria-checked", "true", { timeout: 1500 });
  }).toPass({ timeout: 20000 });
  await dbl.click();
  await expect(dbl).toHaveAttribute("aria-checked", "true");
  const req = page.waitForRequest((r) => r.url().includes("/api/compose") && r.method() === "POST");
  await page.getByRole("button", { name: /Compose the night/ }).click();
  const body = (await req).postDataJSON();
  expect(body.arcShape).toBe("double");
  expect(body.explicit).toContain("arcShape");
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId("arc-shape")).toContainText(/double peak/);
  await expect(page.locator("#result figcaption")).toContainText(/arc shape: double peak/);
  // the control is explicit: it survives an era preset change
  await page.getByRole("button", { name: "Edit" }).first().click();
  await page.getByLabel("Era", { exact: true }).selectOption("nuevo");
  await expect(page.getByRole("radio", { name: "Two peaks" })).toHaveAttribute("aria-checked", "true");
});

test("featured night: the deep link loads it into the result with Export and Booth; the hero card and the Booth row load it too", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await expect(page.locator("#result")).toContainText(/double peak/);
  expect(await page.locator("article[id^=tanda-]").count()).toBeGreaterThan(10);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("tdj-v1") ?? "{}").state?.playlist?.options?.seed,
    ),
    // (round 16: the shipped night is seed 199 of the round-16 sweep, docs/specs/round16-best-night.md)
  ).toBe(199);
  await expect(page).toHaveURL(/\/$/);
  // the normal actions are there
  await expect(page.getByTestId("toolbar-export")).toBeVisible();
  await expect(page.getByTestId("play-the-night")).toBeVisible();
  await page.getByTestId("toolbar-export").click();
  await expect(page.getByTestId("export-sheet")).toBeVisible();
  await expect(page.getByTestId("export-sheet").locator("#send-spotify")).toBeVisible();
  await page.keyboard.press("Escape");
  // hero card on an empty home
  await page.getByTestId("page-toolbar").getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Clear set" }).click();
  await expect(page.getByTestId("first-run")).toBeVisible();
  await page.getByTestId("first-run").getByTestId("featured-card").click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await expect(page.locator("#result")).toContainText(/double peak/);
  // History and Library empty states carry the card
  await page.goto("/library");
  await expect(page.getByTestId("featured-card")).toHaveAttribute("href", "/?featured=golden-double-peak");
  // Booth: the onboarding row loads it (from a freshly composed set, so the row has something to replace)
  await page.goto("/");
  await expect(page.locator("#result")).toBeVisible({ timeout: 30000 });
  await page.getByTestId("page-toolbar").getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: "Clear set" }).click();
  await expect(page.getByTestId("first-run")).toBeVisible();
  await page.getByTestId("toolbar-compose").click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await page.goto("/booth");
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 15000 });
  await page.getByTestId("booth-more").click();
  await page.getByRole("menuitem", { name: /Set-up/ }).click();
  await page.locator("#booth-featured").click();
  await expect(page.getByTestId("booth-onboarding")).toHaveCount(0);
  await expect
    .poll(
      () =>
        page.evaluate(
          () => JSON.parse(localStorage.getItem("tdj-v1") ?? "{}").state?.playlist?.options?.seed,
        ),
      { timeout: 30000 },
    )
    .toBe(199);
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 15000 });
});
