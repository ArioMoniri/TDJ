import { expect, type Page, test } from "@playwright/test";

/**
 * 2026-11 — the owner: "while the tab changes from Songs to Orchestras or others in Database or Library, the written
 * text should not be deleted; also the search is so slow". One search text per page, shared by its tabs, kept in the
 * address (`?q=`) through reload and back / forward, cleared everywhere by one ⓧ; and the catalogue answered in the
 * browser (lib/localSearch.ts) once its index is ready, with no request per keystroke.
 */

const tab = (page: Page, name: string) => page.getByRole("radio", { name, exact: true }).first();
const qOf = (page: Page) => new URL(page.url()).searchParams.get("q");

test("Database: the words stay when the tab changes, in the address too, and one ⓧ clears them all", async ({
  page,
}) => {
  await page.goto("/database");
  await page.locator("#db-search").fill("pugliese");
  await expect(page.locator("main [data-song]").first()).toContainText(/Pugliese/, { timeout: 20_000 });
  await expect.poll(() => qOf(page), { timeout: 5_000 }).toBe("pugliese");

  await tab(page, "Orchestras").click();
  await expect(page.locator("#orchestra-filter")).toHaveValue("pugliese");
  await expect(
    page
      .locator("main")
      .getByText(/Osvaldo Pugliese/)
      .first(),
  ).toBeVisible({ timeout: 20_000 });

  await tab(page, "Cortinas").click();
  await expect(page.locator("#cortina-search")).toHaveValue("pugliese");
  await expect.poll(() => new URL(page.url()).searchParams.get("tab")).toBe("cortinas");

  // reload: the tab and the words come back
  await page.reload();
  await expect(page.locator("#cortina-search")).toHaveValue("pugliese", { timeout: 20_000 });

  await tab(page, "Songs").click();
  await expect(page.locator("#db-search")).toHaveValue("pugliese");
  await expect(page.locator("main [data-song]").first()).toContainText(/Pugliese/, { timeout: 20_000 });

  // the words typed on one tab are the next tab's: edit them on Orchestras, see them on Songs
  await tab(page, "Orchestras").click();
  await page.locator("#orchestra-filter").fill("troilo");
  await tab(page, "Songs").click();
  await expect(page.locator("#db-search")).toHaveValue("troilo");

  // one ⓧ clears every tab and the address
  await page.getByRole("button", { name: "Clear search" }).first().click();
  await expect(page.locator("#db-search")).toHaveValue("");
  await tab(page, "Orchestras").click();
  await expect(page.locator("#orchestra-filter")).toHaveValue("");
  await expect.poll(() => qOf(page)).toBeNull();
  await page.reload();
  await expect(page.locator("#orchestra-filter")).toHaveValue("", { timeout: 20_000 });
});

test("Library: the words survive reload, back / forward and a visit elsewhere", async ({ page }) => {
  await page.goto("/library");
  const field = page.locator("#library-search").first();
  await field.fill("di sarli");
  await expect(page.getByTestId("library-row").first()).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => qOf(page), { timeout: 5_000 }).toBe("di sarli");

  await page.reload();
  await expect(field).toHaveValue("di sarli", { timeout: 20_000 });
  await expect(page.getByTestId("library-row").first()).toContainText(/Di Sarli/, { timeout: 20_000 });

  // elsewhere and back
  await page.goto("/database");
  await expect(page.locator("#db-search")).toHaveValue("");
  await page.goBack();
  await expect(field).toHaveValue("di sarli", { timeout: 20_000 });
  await page.goForward();
  await expect(page.locator("#db-search")).toBeVisible({ timeout: 20_000 });

  // by the menu, without `?q=`: this tab's session brings the words back
  await page.goto("/library");
  await expect(field).toHaveValue("di sarli", { timeout: 20_000 });

  // a link that names other words wins
  await page.goto("/library?q=pugliese");
  await expect(field).toHaveValue("pugliese", { timeout: 20_000 });
  await expect(page.getByTestId("library-row").first()).toContainText(/Pugliese/, { timeout: 20_000 });
});

test("the catalogue answers in the browser: no request per keystroke once its index is ready", async ({
  page,
}) => {
  await page.goto("/library");
  await expect(page.locator("html")).toHaveAttribute("data-search", /ready|off/, { timeout: 60_000 });
  test.skip((await page.locator("html").getAttribute("data-search")) !== "ready", "no search worker here");
  let posts = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/search") posts++;
  });
  const field = page.locator("#library-search").first();
  await field.focus();
  await page.keyboard.type("fiorentino troilo", { delay: 40 });
  // the leader + singer alias ranks Fiorentino's sides first (the server's ranking, in the browser)
  const first = page.getByTestId("library-row").first();
  await expect(first).toContainText(/Fiorentino/, { timeout: 10_000 });
  await expect(page.locator('[data-answered="fiorentino troilo"]')).toHaveCount(1);
  expect(posts).toBe(0);
});
