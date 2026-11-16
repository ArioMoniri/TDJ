/**
 * Round 21 (docs/specs/round21-engine.md): La Cumparsita opens the night matching the first tanda; one Swap sheet per
 * song (search with reasons, an AI pick that falls back to the engine's best fit without a key, the tanda stays
 * valid); tapping a booth row plays it (audition before the night); the faders say what they do.
 */
import { expect, type Page, test } from "@playwright/test";

function wav(sec = 12): Buffer {
  const rate = 22050;
  const n = rate * sec;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++)
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 0.3 * 32767), i * 2);
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

async function mockClips(page: Page) {
  await page.route(/dzcdn\.net|p\.scdn\.co|preview\.test|\/api\/preview\?/, (route) =>
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

async function openFeatured(page: Page) {
  await mockClips(page);
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
}

test("the night opens with La Cumparsita by the first tanda's orchestra", async ({ page }) => {
  await openFeatured(page);
  const opening = page.getByTestId("opening");
  await expect(opening).toBeVisible();
  await expect(opening).toContainText("La Cumparsita");
  await expect(opening).toContainText("D'Agostino");
  // the first tanda is D'Agostino's too
  await expect(page.locator("#result [data-tanda]").first()).toContainText("D'Agostino");
});

test("the Swap sheet: valid suggestions, search with reasons, AI pick falls back to the engine and keeps the tanda valid", async ({
  page,
}) => {
  await openFeatured(page);
  // the first tango tanda that is not pinned (tanda 1, D'Agostino / Vargas): its second side
  const card = page.locator("#result [data-tanda]").first();
  const row = card.locator("li[data-song]").nth(1);
  const before = await row.getAttribute("data-song");
  await row.getByRole("button", { name: "Track 2 actions" }).click();
  await page.getByRole("menuitem", { name: "Swap…" }).click();
  const sheet = page.getByTestId("swap-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("swap-option").first()).toBeVisible({ timeout: 20000 });
  // search: another orchestra's side is shown with why it cannot take the chair
  await sheet.getByLabel("Search the catalogue").fill("Biagi");
  await expect(
    sheet
      .getByTestId("swap-excluded")
      .filter({ hasText: /another orchestra/ })
      .first(),
  ).toBeVisible({
    timeout: 20000,
  });
  // AI pick without a key: the engine's best fit, labelled; 2026-11: shown as the suggestion, applied when chosen
  const ai = sheet.getByTestId("swap-ai-pick");
  await expect(ai).toContainText(/Suggested:/, { timeout: 20000 });
  await expect(ai).toContainText(/best fit/i);
  await expect(ai).not.toContainText(/engine/);
  await expect(card.locator("li[data-song]").nth(1)).toHaveAttribute("data-song", before ?? "");
  await ai.click();

  await expect(sheet).toBeHidden({ timeout: 20000 });
  await expect(card.locator("li[data-song]").nth(1)).not.toHaveAttribute("data-song", before ?? "", {
    timeout: 20000,
  });
  // the tanda is still one voice and one orchestra (the API judged it; the card shows the same family)
  await expect(card).toContainText("D'Agostino");
});

test("booth: tapping a row before the night tests it on this device; the faders say what they do", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFeatured(page);
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/);
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId("booth-ttc")).not.toHaveAttribute("data-resolving", "1", { timeout: 30000 });
  const row = page.locator('.booth-row[data-kind="track"]').nth(2);
  await row.getByTestId("booth-row-play").click();
  // round 22: the tap opens the song sheet; without headphones set, the test plays on this device (said so)
  await page.getByTestId("booth-prelisten").click();
  await expect(row).toHaveAttribute("data-auditioning", "true", { timeout: 10000 });
  await page.keyboard.press("Escape");
  // the night has not started: the strip still offers Start
  await expect(page.getByTestId("booth-start")).toBeVisible();
  // the faders: named for what they do, with a one-line hint in the Mix sheet
  await expect(page.getByRole("slider", { name: "Master volume" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Mix: levels and fades" }).click();
  await expect(page.getByRole("slider", { name: "Cortina volume" }).first()).toBeVisible();
  await expect(page.getByTestId("booth-cortina-fader-hint").last()).toContainText(/against the tangos/);
  await expect(page.getByTestId("booth-master-hint").last()).toContainText(/whole output/);
});

test("booth: during the night a tapped row offers Play now, Play next and its versions", async ({ page }) => {
  await openFeatured(page);
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/);
  await expect(page.getByTestId("booth-ttc")).not.toHaveAttribute("data-resolving", "1", { timeout: 30000 });
  await page.getByTestId("booth-start").click();
  await expect(page.getByTestId("booth-pause")).toBeVisible({ timeout: 20000 });
  const target = page.locator('.booth-row[data-kind="track"]').nth(6);
  await target.getByTestId("booth-row-play").click();
  const sheet = page.getByTestId("booth-play-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Play now (fade the current)" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Play next" })).toBeVisible();
  // round 22: no headphones output chosen: no pre-listen during the night (it would reach the room), said why
  await expect(sheet.getByTestId("booth-prelisten")).toHaveCount(0);
  await expect(sheet).toContainText(/headphones/i);
  await expect(sheet.getByTestId("booth-versions")).toBeVisible();
  const idx = Number(await target.getAttribute("data-plan-index"));
  await sheet.getByRole("button", { name: "Play now (fade the current)" }).click();
  await expect(page.locator(`.booth-row[data-plan-index="${idx}"]`)).toHaveAttribute("aria-current", "true", {
    timeout: 20000,
  });
});

test("bypass: Skip tonight passes a tanda over in the booth; Last 4 tandas tango only skips the tail's vals / milonga", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFeatured(page);
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/);
  await expect(page.getByTestId("booth-ttc")).not.toHaveAttribute("data-resolving", "1", { timeout: 30000 });
  // T18 is the vals the DJ asked for between the new tango tandas: skip it tonight
  const t18 = page.locator('.booth-tanda[data-tanda="18"]');
  await t18.getByTestId("booth-bypass").click();
  await expect(t18).toHaveAttribute("data-bypassed", "true");
  await expect(t18.getByTestId("booth-bypass")).toHaveAttribute("aria-pressed", "true");
  await t18.getByTestId("booth-bypass").click();
  await expect(t18).not.toHaveAttribute("data-bypassed", "true");
  // the setting: the vals (T23) and the milonga (T21) among the closing stretch are passed over
  // round 22: the switch lives in the night bar on top of the set list
  await page.getByTestId("booth-last4").click();
  await expect(page.getByTestId("booth-last4")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('.booth-tanda[data-tanda="23"]')).toHaveAttribute("data-bypassed", "true");
  await expect(page.locator('.booth-tanda[data-tanda="21"]')).toHaveAttribute("data-bypassed", "true");
  await expect(page.locator('.booth-tanda[data-tanda="24"]')).not.toHaveAttribute("data-bypassed", "true");
});
