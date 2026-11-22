/**
 * 2026-11 (the owner: "in Build by hand there should be a better UI to search and add and create, and help to
 * create the night") — the guided builder on a desktop and an iPhone 15 Pro (Chromium with its viewport, touch and
 * user agent): search with chips and multi-select into a new tanda, "Suggest next tanda" with one-tap add, a picked
 * cortina, reorder by drag and by the Move actions, a mismatched side (⚠ and the rule sheet), "Fill the rest" to the
 * target, and "Use this night" into Compose. Screenshots of the builder go to $BUILDER_SHOTS when set.
 */
import { type BrowserContextOptions, devices, expect, type Locator, type Page, test } from "@playwright/test";

const SHOTS = process.env.BUILDER_SHOTS;
const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 15 Pro"];
const { defaultBrowserType: _i2, ...ipad } = devices["iPad Pro 11 landscape"];
const DEVICES: Array<[string, BrowserContextOptions]> = [
  ["desktop", { viewport: { width: 1440, height: 900 } }],
  ["iPhone 15 Pro", iphone],
];

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
}
const sideTitles = (tanda: Locator) =>
  tanda
    .getByTestId("build-side")
    .evaluateAll((els) =>
      els.map((e) =>
        (e.querySelector('[data-testid="row-play"] .truncate') as HTMLElement | null)?.textContent?.trim(),
      ),
    );
/** the search and What comes next: on the page at every size (2026-11: the search is the page's centre) */
async function addPanel(page: Page, _phone: boolean) {
  await expect(page.getByTestId("build-add-panel")).toBeVisible();
  return page.getByTestId("build-layout");
}
async function closePanel(_page: Page, _phone: boolean) {}
/** Fill → Fill everything → the guide's preview → Apply (2026-11: Fill is a menu, previewed before it applies) */
async function fillAll(page: Page) {
  await page.getByTestId("build-fill").getByRole("button").click();
  await page.getByRole("menuitem", { name: "Fill everything" }).click();
  const preview = page.getByTestId("build-fill-preview");
  await expect(preview).toBeVisible({ timeout: 60000 });
  await preview.getByTestId("build-fill-apply").click();
  await expect(page.getByTestId("toast")).toContainText("Fill everything", { timeout: 20000 });
}
/** a soft rule toast or the hard-rule sheet: keep going ("Do it as I said") */
async function acceptRules(page: Page) {
  const sheet = page.getByTestId("rule-sheet");
  if (await sheet.isVisible().catch(() => false)) await sheet.getByTestId("rule-as-said").click();
}

for (const [name, opts] of DEVICES) {
  const phone = name !== "desktop";
  test.describe(name, () => {
    test.use(opts);
    test(`${name}: search, multi-select, suggest, cortina, reorder, a mismatch, fill, use`, async ({
      page,
    }) => {
      test.setTimeout(240_000);
      await fresh(page);
      // 0. (final QA) a night with no tandas: the energy arc and the rhythm cycle are not checked yet (no ✓, no "–")
      const guide = page.getByTestId("build-guide");
      for (const key of ["energy", "cycle"]) {
        const line = guide.locator(`[data-testid="build-guide-line"][data-key="${key}"]`);
        await expect(line).toHaveAttribute("data-pending", "true");
        await expect(line).not.toHaveAttribute("data-ok", /.*/);
        await expect(line).toContainText("checked from the first tanda");
        await expect(line).not.toContainText("–,");
      }
      // 1. search "di sarli" with the Tango and Instrumental chips → select 4 → a new tanda
      let panel = await addPanel(page, phone);
      await panel.getByRole("button", { name: "Tango", exact: true }).click();
      await panel.getByRole("button", { name: "Instrumental", exact: true }).click();
      await panel.getByLabel("Search for a song to add").fill("di sarli");
      // (the debounced search lands after the last change: wait until every row is the new answer)
      await expect
        .poll(
          async () => {
            const rows = await panel.getByTestId("build-hit").allInnerTexts();
            return rows.length > 3 && rows.every((r) => r.includes("Di Sarli"));
          },
          { timeout: 20000 },
        )
        .toBe(true);
      await expect(panel.getByTestId("build-hit").first()).toBeVisible({ timeout: 20000 });
      await expect(panel.getByTestId("build-hit").first()).toContainText("Di Sarli");
      await panel.getByTestId("build-multi").click();
      for (let k = 0; k < 4; k++) await panel.getByTestId("build-pick").nth(k).click();
      await expect(panel.getByTestId("build-multi-bar")).toContainText("4 selected");
      await panel.getByTestId("build-add-picked-new").click();
      await page.waitForTimeout(300);
      await acceptRules(page);
      await closePanel(page, phone);
      const t1 = page.getByTestId("build-tanda").first();
      await expect(page.getByTestId("build-tanda")).toHaveCount(1);
      await expect(t1.getByTestId("build-side")).toHaveCount(4);
      await expect(t1.getByTestId("tanda-type")).toContainText("Tango");
      await expect(t1.getByTestId("tanda-mode")).toHaveText("Instrumental");
      await expect(t1.getByTestId("tanda-total")).toContainText(/^4 songs · (≈ )?\d+:\d\d/);
      if (SHOTS)
        await page.screenshot({ path: `${SHOTS}/${phone ? "iphone" : "desktop"}-1-first-tanda.png` });

      // 2. Suggest next tanda → three options with reasons → add one
      await page.getByTestId("build-suggest-next").click();
      panel = await addPanel(page, phone);
      const list = panel.getByTestId("build-suggestions");
      await expect(list).toContainText("Tanda 2", { timeout: 30000 });
      const opts3 = list.getByTestId("build-suggestion");
      await expect(opts3.first().getByTestId("build-reason").first()).toBeVisible();
      expect(await opts3.count()).toBeLessThanOrEqual(3);
      expect(await opts3.first().getByTestId("build-suggestion-song").count()).toBeGreaterThan(1);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${phone ? "iphone" : "desktop"}-2-suggest.png` });
      await opts3.first().getByRole("button", { name: /^Add/ }).click();
      await closePanel(page, phone);
      await expect(page.getByTestId("build-tanda")).toHaveCount(2);

      // 3. pick a cortina between tanda 1 and 2
      await page.getByTestId("build-cortina").first().getByTestId("build-cortina-pick").click();
      const cs = page.getByTestId("build-cortina-sheet");
      await expect(cs.getByTestId("build-cortina-option").first()).toBeVisible({ timeout: 20000 });
      await cs.getByTestId("build-cortina-option").first().locator("button").first().click();
      await expect(cs).toBeHidden();
      await expect(page.getByTestId("build-cortina").first()).toHaveAttribute("data-picked", /.+/);

      // 4. reorder: song 4 of tanda 1 to the top by drag, then Move up on the 3rd; tanda 2 moves up and back
      const before = await sideTitles(t1);
      const handle = t1.getByTestId("build-side").nth(3).getByTestId("drag-handle");
      await handle.scrollIntoViewIfNeeded();
      const h = (await handle.boundingBox())!;
      const top = (await t1.getByTestId("build-side").first().boundingBox())!;
      if (!phone) {
        await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
        await page.mouse.down();
        await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2 - 10, { steps: 3 });
        await page.mouse.move(h.x + h.width / 2, top.y + 4, { steps: 8 });
        await page.mouse.up();
      } else {
        await handle.dispatchEvent("pointerdown", {
          pointerType: "touch",
          pointerId: 9,
          isPrimary: true,
          button: 0,
          clientX: h.x + h.width / 2,
          clientY: h.y + h.height / 2,
        });
        await page.waitForTimeout(450);
        await page.evaluate(
          ([x, y]) => {
            window.dispatchEvent(
              new PointerEvent("pointermove", { pointerType: "touch", pointerId: 9, clientX: x, clientY: y }),
            );
            window.dispatchEvent(new PointerEvent("pointerup", { pointerType: "touch", pointerId: 9 }));
          },
          [h.x + h.width / 2, top.y + 4],
        );
      }
      await expect.poll(() => sideTitles(t1)).toEqual([before[3], before[0], before[1], before[2]]);
      await t1
        .getByTestId("build-side")
        .nth(2)
        .getByRole("button", { name: /^Actions for / })
        .click();
      await page.getByRole("menuitem", { name: "Move up" }).click();
      await expect.poll(() => sideTitles(t1)).toEqual([before[3], before[1], before[0], before[2]]);
      const fam2 =
        (await page.getByTestId("build-tanda").nth(1).getByTestId("build-tanda-select").textContent()) ?? "";
      await page.getByRole("button", { name: "Move tanda 2 up" }).click();
      await expect(page.getByTestId("build-tanda").first().getByTestId("build-tanda-select")).toHaveText(
        fam2,
      );
      await page.getByRole("button", { name: "Move tanda 2 up" }).click();
      await expect(page.getByTestId("build-tanda").nth(1).getByTestId("build-tanda-select")).toHaveText(fam2);

      // 5. a mismatched side: with tanda 1 (Di Sarli) selected, a Pugliese side is ⚠ with its reason; "+" asks
      await page.getByTestId("build-tanda").first().getByTestId("build-tanda-select").click();
      panel = await addPanel(page, phone);
      await panel.getByRole("button", { name: "Clear filters" }).click();
      await panel.getByLabel("Search for a song to add").fill("pugliese recuerdo");
      const bad = panel.locator('[data-testid="build-hit"][data-fits="false"]').first();
      await expect(bad).toBeVisible({ timeout: 20000 });
      await expect(bad.getByTestId("build-fit")).toHaveText("⚠");
      await expect(bad.getByTestId("build-why")).toContainText(/another orchestra/i);
      await bad.getByTestId("build-add").click();
      const rules = page.getByTestId("rule-sheet");
      await expect(rules).toBeVisible({ timeout: 15000 });
      await expect(rules.getByTestId("rule-violation").first()).toBeVisible();
      await rules.getByTestId("rule-cancel").click();
      await expect(rules).toBeHidden();
      await closePanel(page, phone);
      await expect(page.getByTestId("build-tanda").first().getByTestId("build-side")).toHaveCount(4);

      // 6. Fill everything (2026-11: a menu, previewed in the guide): the night reaches the planned number of tandas
      await fillAll(page);
      const counts = await page.getByTestId("build-summary").innerText();
      const m = /(\d+) of (\d+) tandas/.exec(counts)!;
      expect(Number(m[1])).toBe(Number(m[2]));
      await expect(page.getByTestId("build-tanda")).toHaveCount(Number(m[2]));
      // the picked cortina is still after tanda 1
      await expect(page.getByTestId("build-cortina").first()).toHaveAttribute("data-picked", /.+/);
      if (SHOTS) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: `${SHOTS}/${phone ? "iphone" : "desktop"}-3-filled.png`,
          fullPage: !phone,
        });
      }

      // 7. Use this night → Compose
      await (phone
        ? page.getByTestId("build-finish-phone")
        : page.locator('[data-testid="build-finish"]:visible').first()
      ).click();
      await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
      await expect(page.locator("#result [data-tanda]").first()).toBeVisible();
    });
  });
}

test.describe("iPad landscape", () => {
  test.use(ipad);
  test("iPad landscape: the search across the top, the night and the guidance side by side under it", async ({
    page,
  }) => {
    await fresh(page);
    await expect(page.getByTestId("build-add-panel")).toBeVisible();
    await expect(page.getByTestId("build-add-open")).toHaveCount(0);
    const a = (await page.getByTestId("build-guide").boundingBox())!;
    const n = (await page.getByTestId("build-night").boundingBox())!;
    const b = (await page.getByTestId("build-add-panel").boundingBox())!;
    expect(a.x).toBeGreaterThan(n.x + n.width - 2);
    expect(n.y).toBeGreaterThan(b.y + b.height - 2);
    await fillAll(page);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/ipad-landscape.png` });
  });
});
