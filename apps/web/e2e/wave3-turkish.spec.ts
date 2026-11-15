import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { englishSentences } from "./lang";

/**
 * Wave 3 — Turkish on every screen. The DJ switches Settings › Language to Türkçe; Compose, Booth, Database, Settings
 * and the Guide (with its tour) then read Turkish, and no English UI sentence is left anywhere on them: the visible
 * text, the labels, the placeholders and the help tags are scanned against every English dictionary value of four
 * words or more. Music data (titles, orchestras, singers) is never translated and may stay as recorded.
 * Auto follows the browser's language; on an iPhone and an iPad nothing overflows in Turkish.
 */

/** music data and names that may read like an English sentence (cortina song titles…); none needed so far */
const MUSIC_DATA: RegExp[] = [];
const SHOTS = process.env.TDJ_SHOTS ?? "test-results/turkish";

const SENTENCES = englishSentences();

async function englishLeft(page: Page): Promise<string[]> {
  return page.evaluate((sentences) => {
    // visible text only, and never what is marked as English on purpose (research notes kept as written: lang="en")
    let body = "";
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const el = n.parentElement;
      if (!el || el.closest('[lang="en"], script, style')) continue;
      if (!el.checkVisibility({ visibilityProperty: true })) continue;
      body += n.textContent ?? "";
    }
    const parts = [body];
    for (const el of document.querySelectorAll(
      "[placeholder],[aria-label],[aria-description],[data-hint],[data-tip],[alt]",
    )) {
      if (el.closest('[lang="en"]')) continue;
      for (const a of ["placeholder", "aria-label", "aria-description", "data-hint", "data-tip", "alt"]) {
        const v = el.getAttribute(a);
        if (v) parts.push(v);
      }
    }
    const text = parts.join("\n").replace(/\s+/g, " ");
    return sentences.filter((s) => text.includes(s));
  }, SENTENCES);
}
const filtered = (hits: string[]) => hits.filter((h) => !MUSIC_DATA.some((re) => re.test(h)));

async function settle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(700);
}

async function toTurkish(page: Page) {
  await page.goto("/settings");
  await expect(page.getByTestId("page-title")).toHaveText("Settings");
  await page.getByRole("radiogroup", { name: "Language" }).getByRole("radio", { name: "Türkçe" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  await expect(page.getByTestId("page-title")).toHaveText("Ayarlar");
}

test("Settings › Language › Türkçe: Compose, Booth, Database, Settings and the Guide read Turkish", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await toTurkish(page);
  const left: string[] = [];
  const scan = async (where: string) =>
    left.push(...filtered(await englishLeft(page)).map((s) => `${where}: ${s}`));

  // Settings, in Turkish, keeps the choice across a reload
  await page.reload();
  await expect(page.getByTestId("page-title")).toHaveText("Ayarlar");
  await expect(
    page.getByRole("radiogroup", { name: "Dil" }).getByRole("radio", { name: "Türkçe" }),
  ).toBeChecked();
  await expect(page.getByText("Görünüm", { exact: true })).toBeVisible();
  await settle(page);
  await scan("/settings");

  // Compose: the form, then a composed night
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Gece oluştur" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Kabin" }).first()).toBeVisible();
  await settle(page);
  await scan("/ (form)");
  await page
    .getByRole("button", { name: /Geceyi oluştur/ })
    .first()
    .click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await expect(page.locator("#result")).toContainText("tanda");
  await settle(page);
  await scan("/ (night)");
  await page.screenshot({ path: `${SHOTS}/desktop-compose.png` });

  // the Booth
  await page.goto("/booth");
  await expect(page.getByTestId("page-title")).toHaveText("Kabin");
  await settle(page);
  await scan("/booth");
  await page.screenshot({ path: `${SHOTS}/desktop-booth.png` });

  // the Database, every section
  await page.goto("/database");
  await expect(page.getByTestId("page-title")).toHaveText("Veritabanı");
  await settle(page);
  await scan("/database");
  for (const tab of ["Orkestralar", "Kortinalar", "Kurallar", "Bağlam", "Hafıza"]) {
    await page.getByRole("radio", { name: tab }).click();
    await page.waitForTimeout(700);
    await scan(`/database ${tab}`);
  }
  await page.screenshot({ path: `${SHOTS}/desktop-database.png` });

  // the Guide and its tour
  await page.goto("/guide");
  await expect(page.getByTestId("page-title")).toHaveText("Rehber");
  const tour = page.getByTestId("guide-tour");
  for (const words of ["Yapay zekâyla düzenle", "Kendin oluştur", "Kulaklığınızda ön dinleyin", "Odalar"])
    await expect(tour).toContainText(words);
  await settle(page);
  await scan("/guide");
  await page.screenshot({ path: `${SHOTS}/desktop-guide.png`, fullPage: true });

  // and the other screens on the way
  for (const [path, title] of [
    ["/history", "Geçmiş"],
    ["/library", "Kütüphane"],
    ["/build", "Kendin oluştur"],
    ["/rooms", "Odalar"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByTestId("page-title")).toHaveText(title);
    await settle(page);
    await scan(path);
  }
  await page.goto("/settings");
  await settle(page);
  await scan("/settings (end)");
  expect(left).toEqual([]);

  // and back to English
  await page.getByRole("radiogroup", { name: "Dil" }).getByRole("radio", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByTestId("page-title")).toHaveText("Settings");
});

test.describe("Auto follows the browser", () => {
  test.use({ locale: "tr-TR" });
  test("a Turkish browser opens T-DJ in Turkish; a choice in Settings wins", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "tr");
    await expect(page.getByRole("button", { name: /Geceyi oluştur/ }).first()).toBeVisible();
    await expect(page).toHaveTitle(/Gece oluştur · T-DJ/);
    await page.goto("/settings");
    await expect(
      page.getByRole("radiogroup", { name: "Dil" }).getByRole("radio", { name: "Otomatik" }),
    ).toBeChecked();
    await page.getByRole("radiogroup", { name: "Dil" }).getByRole("radio", { name: "English" }).click();
    await expect(page.getByTestId("page-title")).toHaveText("Settings");
    await page.reload();
    await expect(page.getByTestId("page-title")).toHaveText("Settings");
  });
});

for (const [device, viewport, ua] of [
  [
    "iphone",
    { width: 390, height: 844 },
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  ],
  [
    "ipad",
    { width: 834, height: 1194 },
    "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  ],
] as const)
  test.describe(`${device} in Turkish`, () => {
    test.use({
      locale: "tr-TR",
      viewport,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent: ua,
    });
    test(`nothing overflows or truncates in the control layer (${device})`, async ({ page }) => {
      test.setTimeout(180_000);
      mkdirSync(SHOTS, { recursive: true });
      const problems: string[] = [];
      for (const [path, name] of [
        ["/", "compose"],
        ["/booth", "booth"],
        ["/database", "database"],
        ["/history", "history"],
        ["/library", "library"],
        ["/rooms", "rooms"],
        ["/build", "build"],
        ["/settings", "settings"],
        ["/guide", "guide"],
      ] as const) {
        await page.goto(path);
        await expect(page.locator("html")).toHaveAttribute("lang", "tr");
        await settle(page);
        problems.push(
          ...(
            await page.evaluate(() => {
              const out: string[] = [];
              const vw = document.documentElement.clientWidth;
              if (document.documentElement.scrollWidth > vw + 1)
                out.push(`page is ${document.documentElement.scrollWidth}px wide in ${vw}px`);
              // the control layer and the form labels: a label cut short or pushed out of its box
              for (const el of document.querySelectorAll<HTMLElement>(
                "nav a, nav button, [data-testid=tab-bar] *, [data-testid=page-title], [role=radio], [role=tab], .cell-label, .seg-row label, button",
              )) {
                const r = el.getBoundingClientRect();
                if (!r.width || !r.height) continue;
                if (el.closest("[data-music], .song-row, .track-row, [data-testid=song-title]")) continue;
                const cs = getComputedStyle(el);
                if (r.right > vw + 1 && cs.position !== "fixed")
                  out.push(`off screen: ${el.textContent?.trim().slice(0, 40)}`);
                if (
                  cs.textOverflow === "ellipsis" &&
                  el.scrollWidth > el.clientWidth + 1 &&
                  el.closest("nav, [data-testid=tab-bar]")
                )
                  out.push(`truncated: ${el.textContent?.trim().slice(0, 40)}`);
              }
              return out;
            })
          ).map((p) => `${path}: ${p}`),
        );
        await page.screenshot({ path: `${SHOTS}/${device}-${name}.png` });
      }
      if (device === "iphone") {
        // the iPhone More sheet
        await page.getByTestId("tab-more").click();
        const more = page.getByTestId("more-sheet");
        await expect(more).toBeVisible();
        for (const label of ["Kendin oluştur", "Odalar", "Rehber", "Ayarlar"])
          await expect(more).toContainText(label);
        await page.screenshot({ path: `${SHOTS}/iphone-more.png` });
      }
      expect(problems).toEqual([]);
    });
  });
