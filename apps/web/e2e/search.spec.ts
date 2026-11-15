import { expect, type Page, test } from "@playwright/test";

/**
 * 2026-11 — the shared search ("search in Library doesn't work nicely, and the regex isn't nice either"; "same
 * search issue for the Database"): accents, typos, words across fields, inline filters, chips with counts,
 * "Did you mean", keyboard, on the Library and the Database (desktop and iPhone 15 Pro projects).
 */

/** 0.25 s of silence: what every preview serves here (the player only needs something to load) */
function silentWav(): Buffer {
  const n = 5512;
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(22050, 24);
  b.writeUInt32LE(44100, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(n * 2, 40);
  return b;
}
async function mockPreviews(page: Page) {
  const wav = silentWav();
  await page.route(/dzcdn\.net|preview\.test|\/api\/preview\?/, (route) =>
    route.request().url().includes("json=1")
      ? route.fulfill({
          status: 200,
          contentType: "application/json",
          body: '{"url":"https://preview.test/a.wav"}',
        })
      : route.fulfill({
          status: 200,
          contentType: "audio/wav",
          body: wav,
          headers: { "access-control-allow-origin": "*" },
        }),
  );
}

const field = (page: Page) => page.locator("#library-search").first();
const rows = (page: Page) => page.getByTestId("library-row");
const total = async (page: Page) =>
  Number((await page.getByTestId("library-total").innerText()).replace(/\D/g, ""));

test.describe("Library search", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/library");
    await expect(field(page)).toBeVisible();
  });

  test("accents and case: “conoces” finds Ahora No Me Conocés, the word marked", async ({ page }) => {
    await field(page).fill("conoces");
    const first = rows(page).first();
    await expect(first).toContainText("Ahora No Me Conocés", { timeout: 20_000 });
    await expect(first.locator("mark.search-hit").first()).toHaveText(/Conocés|Conoces/);
  });

  test("words across fields with inline filters: di sarli 1941 instrumental", async ({ page }) => {
    await field(page).fill("di sarli 1941 instrumental");
    await expect(rows(page).first()).toBeVisible({ timeout: 20_000 });
    const titles = await page.getByTestId("library-row-title").allInnerTexts();
    expect(titles).toEqual(expect.arrayContaining(["La Cachila", "Marejada"]));
    const lines = await rows(page).allInnerTexts();
    for (const l of lines) {
      expect(l).toMatch(/Di Sarli/);
      expect(l).toMatch(/Instrumental/);
      expect(l).toMatch(/1941/);
    }
    // the inline "instrumental" is a filter: the Instrumental chip counts exactly the sides shown
    const inst = Number(
      (await page.getByTestId("library-chip-instrumental-count").innerText()).replace(/\D/g, ""),
    );
    expect(inst).toBe(await total(page));
  });

  test("a chip narrows the results to exactly the count it showed", async ({ page }) => {
    await field(page).fill("di sarli");
    await expect(rows(page).first()).toBeVisible({ timeout: 20_000 });
    const before = await total(page);
    const vals = page.getByTestId("library-chip-rhythm-vals");
    const n = Number(
      (await page.getByTestId("library-chip-rhythm-vals-count").innerText()).replace(/\D/g, ""),
    );
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(before);
    await vals.click();
    await expect(vals).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => total(page), { timeout: 15_000 }).toBe(n);
    for (const l of (await rows(page).allInnerTexts()).slice(0, 20)) expect(l).toMatch(/vals/);
    // the Vals chip keeps the Tango count beside it (each kind counts with the others on)
    expect(
      Number((await page.getByTestId("library-chip-rhythm-tango-count").innerText()).replace(/\D/g, "")),
    ).toBeGreaterThan(0);
    await vals.click();
    await expect.poll(() => total(page), { timeout: 15_000 }).toBe(before);
  });

  test("a typo past the tolerance offers “Did you mean”, which finds them", async ({ page }) => {
    await field(page).fill("zugliasse yumba");
    const dym = page.getByTestId("did-you-mean");
    await expect(dym).toBeVisible({ timeout: 20_000 });
    await expect(dym).toHaveText(/pugliese yumba/i);
    await dym.click();
    await expect(rows(page).first()).toContainText("La Yumba", { timeout: 20_000 });
    // a small typo needs no question: it is matched, and the line says so
    await field(page).fill("ventaron");
    await expect(rows(page).first()).toContainText("Ventarrón", { timeout: 20_000 });
    await expect(page.getByTestId("library-corrected")).toContainText("Ventarrón");
  });

  test("keyboard: ↓ moves, Enter plays in the app's player, Esc clears", async ({ page, request }) => {
    await mockPreviews(page);
    // a side with a preview to play (the catalogue's resolved previews), searched by its title and orchestra
    const pick = await (
      await request.post("/api/search", { data: { q: "d'arienzo", filters: { hasStream: true }, limit: 1 } })
    ).json();
    test.skip(!pick.items.length, "no preview in the index");
    const q = `${pick.items[0].song.title} d'arienzo`;
    const r = await (await request.post("/api/search", { data: { q, limit: 20 } })).json();
    const k = (r.items as Array<{ song: { resolved?: { previewUrl?: string } } }>).findIndex(
      (h) => !!h.song.resolved?.previewUrl,
    );
    test.skip(k < 0, "no preview in the index for this query");
    await field(page).fill(q);
    await expect(rows(page).first()).toBeVisible({ timeout: 20_000 });
    await field(page).focus();
    for (let i = 0; i <= k; i++) await page.keyboard.press("ArrowDown");
    await expect(rows(page).nth(k)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("mini-player")).toBeVisible({ timeout: 10_000 });
    await expect(rows(page).nth(k).getByTestId("play-button")).toHaveAttribute("aria-pressed", "true");
    await field(page).focus();
    await page.keyboard.press("Escape");
    await expect(field(page)).toHaveValue("");
    await expect(page.getByTestId("library-examples")).toBeVisible();
  });

  test("special characters never break it", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const q of ["(", "[di sarli", "*", "pugliese?", "a+b\\"]) {
      await field(page).fill(q);
      await page.waitForTimeout(250);
    }
    await field(page).fill("(pugliese)");
    await expect(rows(page).first()).toBeVisible({ timeout: 20_000 });
    expect(errors).toEqual([]);
  });

  test("no horizontal page scroll; chips and rows are 44 px targets on touch", async ({ page }, info) => {
    await field(page).fill("canaro");
    await expect(rows(page).first()).toBeVisible({ timeout: 20_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    if (info.project.name.includes("iphone")) {
      const h = await page.getByTestId("library-chip-rhythm-tango").boundingBox();
      expect(h!.height).toBeGreaterThanOrEqual(44);
      const fs = await field(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(fs).toBeGreaterThanOrEqual(16);
    }
  });
});

test.describe("Database search", () => {
  test("songs: “darienzo 1938” filters the cards, which stay editable", async ({ page }) => {
    await page.goto("/database");
    await page.locator("#db-search").fill("darienzo 1938");
    const cards = page.locator("main [data-song]");
    await expect(cards.first()).toBeVisible({ timeout: 20_000 });
    const n = Number((await page.getByTestId("db-total").innerText()).replace(/\D/g, ""));
    expect(n).toBeGreaterThan(10);
    for (const c of (await cards.allInnerTexts()).slice(0, 10)) {
      expect(c).toMatch(/D'Arienzo/);
      expect(c).toMatch(/1938/);
    }
    // editing still works on a found card
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    const year = cards.first().getByLabel(/^Year of /);
    await expect(year).toBeEditable();
  });

  test("songs: “ventaron” finds Ventarrón; the chips narrow it", async ({ page }) => {
    await page.goto("/database");
    await page.locator("#db-search").fill("ventaron");
    await expect(page.locator("main [data-song]").first()).toContainText("Ventarrón", { timeout: 20_000 });
    const before = Number((await page.getByTestId("db-total").innerText()).replace(/\D/g, ""));
    const vocal = Number((await page.getByTestId("db-chip-vocal-count").innerText()).replace(/\D/g, ""));
    await page.getByTestId("db-chip-vocal").click();
    await expect
      .poll(async () => Number((await page.getByTestId("db-total").innerText()).replace(/\D/g, "")), {
        timeout: 15_000,
      })
      .toBe(vocal);
    expect(vocal).toBeLessThanOrEqual(before);
  });

  test("cortinas: “tarkan” finds the Tarkan cues", async ({ page }) => {
    await page.goto("/database?tab=cortinas");
    const list = page.getByTestId("cortina-row");
    await expect(list.first()).toBeVisible({ timeout: 20_000 });
    const all = await list.count();
    await page.locator("#cortina-search").fill("tarkan");
    await expect.poll(() => list.count(), { timeout: 10_000 }).toBeLessThan(all);
    const texts = await list.allInnerTexts();
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) expect(t).toMatch(/Tarkan/);
    // by culture / genre as well, and typo-tolerant
    await page.locator("#cortina-search").fill("tarkn");
    await expect(list.first()).toContainText("Tarkan");
  });

  test("orchestras: an alias and an accent-blind name find the orchestra", async ({ page }) => {
    await page.goto("/database?tab=orchestras");
    await page.locator("#orchestra-filter").fill("otv");
    await expect(
      page
        .locator("main")
        .getByText(/Típica Víctor/)
        .first(),
    ).toBeVisible({ timeout: 20_000 });
    await page.locator("#orchestra-filter").fill("laurenz");
    await expect(
      page
        .locator("main")
        .getByText(/Láurenz/)
        .first(),
    ).toBeVisible();
  });
});
