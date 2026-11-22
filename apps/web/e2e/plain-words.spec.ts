import { expect, type Page, test } from "@playwright/test";
import { ENGINEER_PATTERNS } from "../src/lib/plainWords";
import { W } from "./lang";

/**
 * Wave 2 — every screen speaks the DJ's language: no setting names, cloud services or plumbing words in the text, the
 * labels, the placeholders or the help tags. And every control on Compose, Settings, Database and History explains
 * itself on hover and long-press (the shared Tip), never with a title attribute.
 */
const PAGES = [
  "/",
  "/build",
  "/booth",
  "/library",
  "/history",
  "/database",
  "/settings",
  "/guide",
  "/rooms",
  "/night",
];

async function engineerWords(page: Page): Promise<string[]> {
  return page.evaluate(({ setting, plumbing }) => {
    const res = [new RegExp(setting), new RegExp(plumbing, "i")];
    const lines = [document.body.innerText];
    for (const el of document.querySelectorAll(
      "[placeholder],[aria-label],[aria-description],[data-hint],[title]:not(iframe)",
    ))
      for (const a of ["placeholder", "aria-label", "aria-description", "data-hint", "title"]) {
        const v = el.getAttribute(a);
        if (v) lines.push(v);
      }
    const hits: string[] = [];
    for (const line of lines.join("\n").split("\n"))
      for (const re of res) {
        const m = line.match(re);
        if (m) hits.push(`${m[0]} — ${line.slice(0, 120)}`);
      }
    return [...new Set(hits)];
  }, ENGINEER_PATTERNS);
}

test("no page shows engineer words", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const found: string[] = [];
  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
    found.push(...(await engineerWords(page)).map((h) => `${path}: ${h}`));
  }
  // the Database's other sections and Settings' own-key form
  await page.goto("/database");
  for (const tab of ["Orchestras", "Cortinas", "Rules", "Context", "Memory"].map((x) => W(x))) {
    await page.getByRole("radio", { name: tab }).click();
    await page.waitForTimeout(500);
    found.push(...(await engineerWords(page)).map((h) => `/database ${tab}: ${h}`));
  }
  await page.goto("/settings?section=ai");
  const own = page.locator("#ai-own-key");
  await own.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
  found.push(...(await engineerWords(page)).map((h) => `/settings own key: ${h}`));
  expect(found).toEqual([]);
});

async function untipped(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(
      'main button, main a[href], main [role="switch"], main select, main input:not([type=hidden]), main textarea',
    )) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || el.closest("[hidden]")) continue;
      if (el.closest("[aria-description]") || el.closest("[data-hint]")) continue;
      out.push((el.getAttribute("aria-label") || el.textContent || el.id || el.tagName).trim().slice(0, 60));
    }
    return [...new Set(out)];
  });
}

test("every control on Compose, Settings, Database and History explains itself, with no title attributes", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const missing: string[] = [];
  const titles: string[] = [];
  for (const path of ["/", "/settings", "/database", "/history"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(800);
    if (path === "/") for (const h of await page.locator(".fold-head").all()) await h.click();
    missing.push(...(await untipped(page)).map((n) => `${path}: ${n}`));
    titles.push(
      ...(
        await page.evaluate(() =>
          [...document.querySelectorAll("main [title]:not(iframe)")].map(
            (e) => e.getAttribute("title") ?? "",
          ),
        )
      ).map((t) => `${path}: ${t}`),
    );
  }
  expect(missing).toEqual([]);
  expect(titles).toEqual([]);
  // the tag itself: hover a Compose control and read what it does
  await page.goto("/");
  // (wave 2: where La Cumparsita plays is one picker: Open / Close / Both / Off)
  await page.locator("#night").getByLabel(W("La Cumparsita"), { exact: true }).hover();
  await expect(page.getByTestId("tip")).toContainText("La Cumparsita");
});
