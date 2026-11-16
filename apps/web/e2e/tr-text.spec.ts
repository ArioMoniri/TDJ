import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { ENGLISH_UI_WORDS_LIST } from "../src/lib/i18n/englishWords";

/**
 * 2026-11 (QA: English words on Turkish screens; the tab bar on an iPhone SE; 36 px sidebar rows and 28 px Settings
 * segments). In Turkish, the key screens — Compose's result and its tanda inspector, Build by hand's suggestions,
 * the Booth's timing, Settings — show no English UI word (Instrumental, Choose, steady, single, Follows, energy,
 * Fine, Mixed, Audible, Headline…) outside music data (song titles, orchestras and singers are marked lang="es" or
 * are names); every length reads "2,5 sn", never "2.5 s". At 320 px, in English and Turkish, the tab bar's names
 * never draw over each other and every tab is 44 px. On a desktop, every sidebar row and Settings segment is 44 px
 * high and a disabled Learn reads at 3:1 or more.
 */

const SHOTS = process.env.TDJ_SHOTS ?? "test-results/tr-text";
const WORDS = [...ENGLISH_UI_WORDS_LIST];

/** visible text and labels with an English UI word, outside music data and what is English on purpose */
async function englishWords(page: Page): Promise<string[]> {
  return page.evaluate((words) => {
    const re = new RegExp(`(?<![\\p{L}'’])(${words.join("|")})(?![\\p{L}])`, "u");
    const skip = '[lang="en"], [lang="es"], [data-music], script, style, [data-testid="song-title"]';
    const out: string[] = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const el = n.parentElement;
      const s = n.textContent ?? "";
      if (!el || !re.test(s) || el.closest(skip)) continue;
      if (!el.checkVisibility({ visibilityProperty: true })) continue;
      out.push(s.trim().slice(0, 120));
    }
    for (const el of document.querySelectorAll(
      "[placeholder],[aria-label],[aria-description],[data-hint],[alt]",
    )) {
      if (el.closest(skip)) continue;
      for (const a of ["placeholder", "aria-label", "aria-description", "data-hint", "alt"]) {
        const v = el.getAttribute(a);
        if (v && re.test(v)) {
          const id = el.closest("[data-testid]")?.getAttribute("data-testid") ?? el.tagName.toLowerCase();
          out.push(`[${a} in ${id}] ${v.slice(0, 120)}`);
        }
      }
    }
    // a native select's options are not "visible" text nodes: read them too (the compose selects' "Choose")
    for (const o of document.querySelectorAll("select option")) {
      const v = o.textContent ?? "";
      if (re.test(v) && !o.closest(skip)) out.push(`[option] ${v.trim()}`);
    }
    return [...new Set(out)];
  }, WORDS);
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(600);
}

test.describe("Turkish: no English UI words on the key screens", () => {
  test.use({ locale: "tr-TR", viewport: { width: 1440, height: 900 } });

  test("Compose result and inspector, Build by hand suggestions, Booth timing, Settings", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    mkdirSync(SHOTS, { recursive: true });
    const left: string[] = [];
    const scan = async (where: string) =>
      left.push(...(await englishWords(page)).map((s) => `${where}: ${s}`));
    await page.route(/open\.spotify\.com\/oembed/, (r) => r.fulfill({ status: 404, body: "" }));

    // Compose: the form (its pickers' "Choose"), then the night (verdict, arc shape, tanda chips, the inspector)
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "tr");
    await settle(page);
    await scan("/ (form)");
    await page.goto("/?featured=golden-double-peak");
    await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
    await expect(page.getByTestId("inspector-flow")).toBeVisible({ timeout: 30000 });
    await settle(page);
    await scan("/ (night)");
    await page.screenshot({ path: `${SHOTS}/compose-tr.png` });
    // the verdict and the arc shape under the score
    await expect(page.getByTestId("arc-shape")).not.toContainText(/single|double/);

    // Build by hand: suggestions with their reasons, after one tanda (how it follows) and on an empty night
    await page.goto("/build");
    await page.evaluate(() => localStorage.removeItem("tdj-build-draft"));
    await page.reload();
    const list = page.getByTestId("build-suggestions");
    await expect(list.getByTestId("build-reason").first()).toBeVisible({ timeout: 30000 });
    await scan("/build (empty)");
    await page.getByTestId("build-suggestion").first().locator("button.btn-ghost").first().click();
    await expect(page.getByTestId("build-tanda")).toHaveCount(1);
    await expect(list.getByTestId("build-reason").first()).toBeVisible({ timeout: 30000 });
    await settle(page);
    await scan("/build (one tanda)");
    await page.screenshot({ path: `${SHOTS}/build-tr.png` });
    await page.evaluate(() => localStorage.removeItem("tdj-build-draft"));

    // the Booth: the night's timing in Turkish units and decimal comma
    await page.goto("/?featured=golden-double-peak");
    await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
    await page.getByTestId("play-the-night").first().click();
    await expect(page).toHaveURL(/\/booth/, { timeout: 60000 });
    await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 30000 });
    const panel = page.getByTestId("booth-controls");
    if (!(await panel.isVisible())) await page.getByTestId("booth-controls-toggle").click();
    for (const id of ["ctl-gap", "ctl-fade-len", "ctl-crossfade-len"]) {
      const txt = (await page.getByTestId(id).innerText()).replace(/\s+/g, " ");
      expect(txt, id).toMatch(/\d+(,\d)? sn\b/);
      expect(txt, id).not.toMatch(/\d\.\d|\d s\b/);
    }
    // the set list's gap markers too
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/\b\d+\.\d s\b/);
    await settle(page);
    await scan("/booth");
    await page.screenshot({ path: `${SHOTS}/booth-tr.png` });

    // Settings
    await page.goto("/settings");
    await expect(page.getByTestId("page-title")).toHaveText("Ayarlar");
    await settle(page);
    await scan("/settings");
    await page.screenshot({ path: `${SHOTS}/settings-tr.png` });

    expect(left).toEqual([]);
  });
});

/** the tab bar at 320 px: every tab 44 px wide and high; names never over each other, never out of their tab */
async function tabBarProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const bar = document.querySelector<HTMLElement>('[data-testid="tab-bar"]');
    if (!bar) return ["no tab bar"];
    const tabs = [...bar.querySelectorAll<HTMLElement>(".tab-item")].filter(
      (t) => t.getBoundingClientRect().width,
    );
    const boxes: DOMRect[] = [];
    for (const t of tabs) {
      const r = t.getBoundingClientRect();
      if (r.width < 44 - 0.5 || r.height < 44 - 0.5)
        out.push(`${t.textContent?.trim()}: ${r.width.toFixed(1)}×${r.height.toFixed(1)}`);
      const label = t.querySelector<HTMLElement>('[data-testid="tab-label"]');
      if (!label) continue;
      const lr = label.getBoundingClientRect();
      // a shown name is wider than 1 px; it must fit its tab
      if (lr.width > 1) {
        if (label.scrollWidth > Math.ceil(lr.width) + 1 || lr.left < r.left - 0.5 || lr.right > r.right + 0.5)
          out.push(`${label.textContent}: does not fit its tab`);
        boxes.push(lr);
      }
    }
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        if (a.left < b.right - 0.5 && b.left < a.right - 0.5) out.push(`names ${i} and ${j} overlap`);
      }
    return out;
  });
}

for (const locale of ["en-US", "tr-TR"] as const)
  test.describe(`iPhone SE tab bar (${locale})`, () => {
    test.use({
      locale,
      viewport: { width: 320, height: 568 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    test(`tabs keep 44 px and their names never overlap at 320 px (${locale})`, async ({ page }) => {
      mkdirSync(SHOTS, { recursive: true });
      const problems: string[] = [];
      for (const path of ["/library", "/", "/history", "/database"]) {
        await page.goto(path);
        await expect(page.getByTestId("tab-bar")).toBeVisible();
        await settle(page);
        problems.push(...(await tabBarProblems(page)).map((p) => `${path}: ${p}`));
        await page.screenshot({ path: `${SHOTS}/se-${locale}-${path.replace(/\W/g, "") || "compose"}.png` });
      }
      // every tab is still named for assistive tech (the full name, not the short one)
      await page.goto("/library");
      await expect(
        page
          .getByTestId("tab-bar")
          .getByRole("link", { name: locale === "tr-TR" ? "Gece oluştur" : "Compose" }),
      ).toBeVisible();
      expect(problems).toEqual([]);
    });
  });

test.describe("desktop touch targets", () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test("sidebar rows and Settings segments are 44 px; a disabled Learn reads at 3:1", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByTestId("page-title")).toBeVisible();
    await settle(page);
    const rows = await page
      .getByTestId("sidebar")
      .locator("a.side-row")
      .evaluateAll((els) =>
        els.map((e) => [e.textContent?.trim(), e.getBoundingClientRect().height] as const),
      );
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.filter(([, h]) => h < 44 - 0.5)).toEqual([]);
    for (const name of ["Language", "Theme"]) {
      const hs = await page
        .getByRole("radiogroup", { name })
        .getByRole("radio")
        .evaluateAll((els) => els.map((e) => [e.textContent, e.getBoundingClientRect().height] as const));
      expect(hs.length).toBeGreaterThan(2);
      expect(
        hs.filter(([, h]) => h < 44 - 0.5),
        name,
      ).toEqual([]);
    }
    // the controller's Learn buttons, disabled with no controller connected
    const learn = page.getByTestId("controller-learn-btn").first();
    if (!(await learn.isVisible())) {
      await page.getByText("MIDI Learn", { exact: true }).first().click();
    }
    await expect(learn).toBeVisible();
    await expect(learn).toBeDisabled();
    const ratio = await learn.evaluate((el) => {
      const rgba = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
      const lum = ([r, g, b]: number[]) => {
        const f = (v: number) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
      };
      // the backdrop: the background colours from the page up to the button, each over the one below
      const chain: HTMLElement[] = [];
      for (let e: HTMLElement | null = el as HTMLElement; e; e = e.parentElement) chain.unshift(e);
      let bg = [255, 255, 255];
      for (const e of chain) {
        const [r, g, b, a = 1] = rgba(getComputedStyle(e).backgroundColor);
        const op = Number(getComputedStyle(e).opacity);
        const alpha = a * (e === el ? op : 1);
        if (alpha > 0) bg = [r!, g!, b!].map((v, i) => v * alpha + bg[i]! * (1 - alpha));
      }
      const [r, g, b, a = 1] = rgba(getComputedStyle(el).color);
      const alpha = a * Number(getComputedStyle(el).opacity);
      const fg = [r!, g!, b!].map((v, i) => v * alpha + bg[i]! * (1 - alpha));
      const [l1, l2] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      return (l1! + 0.05) / (l2! + 0.05);
    });
    expect(ratio).toBeGreaterThanOrEqual(3);
  });
});
