/**
 * Round 22 review captures (Compose, the search panel, the Swap sheet, Database songs and orchestras, Settings data
 * sources) at a desktop and a phone width. `TDJ_URL=http://localhost:3000 OUT=/tmp/shots tsx scripts/shots-compose-db.ts`
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, devices, type Page } from "playwright";

const URL = process.env.TDJ_URL ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "/tmp/tdj-shots";
mkdirSync(OUT, { recursive: true });
const exe = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium";

async function featured(page: Page) {
  await page.goto(`${URL}/?featured=golden-double-peak`);
  await page.locator("#result").waitFor({ timeout: 90000 });
  await page.waitForTimeout(1500);
}

async function run(
  name: string,
  opts: Parameters<Awaited<ReturnType<typeof chromium.launch>>["newContext"]>[0],
) {
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const ctx = await browser.newContext({ ...opts, colorScheme: "light" });
  const page = await ctx.newPage();
  const shot = (n: string, full = false) =>
    page.screenshot({ path: join(OUT, `${name}-${n}.png`), fullPage: full });
  await featured(page);
  await page.locator('[data-testid="night-profile"]').scrollIntoViewIfNeeded();
  await shot("compose-result");
  await page.locator("#tanda-1").scrollIntoViewIfNeeded();
  await shot("compose-tanda");
  await page.getByTestId("find-songs").click();
  await page.getByLabel("Search songs").fill("corazon");
  await page.getByTestId("song-result").first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  await shot("search-panel");
  if (name === "desktop") await page.getByRole("button", { name: "Close" }).first().click();
  else await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await page.locator("#tanda-1").scrollIntoViewIfNeeded();
  await page.locator("#tanda-1").getByRole("button", { name: "Track 2 actions" }).click();
  await page.getByRole("menuitem", { name: "Swap…" }).click();
  await page.getByTestId("swap-option").first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(600);
  await shot("swap-sheet");
  await page.keyboard.press("Escape");
  await page.goto(`${URL}/database`);
  await page.getByLabel("Search the index").fill("di sarli corazon");
  await page.locator("[data-song]").first().waitFor({ timeout: 20000 });
  await page.getByTestId("db-versions").first().click();
  await page.getByTestId("db-version").first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  await shot("database-song", true);
  await page.goto(`${URL}/database`);
  await page.getByRole("radio", { name: "Orchestras" }).click();
  await page.getByTestId("orchestra-card").first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  await shot("orchestras");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByTestId("edit-grades").first().click();
  await page.getByTestId("grades-sheet").waitFor();
  await page.waitForTimeout(500);
  await shot("grades-sheet");
  await page.goto(`${URL}/settings`);
  await page.locator("#data-sources").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await shot("settings-sources");
  await page.getByRole("button", { name: "Add a source…" }).click();
  await page.getByTestId("add-source").waitFor();
  await page.waitForTimeout(500);
  await shot("add-source");
  await browser.close();
}

async function main() {
  await run("desktop", { viewport: { width: 1440, height: 900 } });
  const { defaultBrowserType: _d, ...iphone } = devices["iPhone 15 Pro"];
  await run("phone", iphone);
  console.log(`shots in ${OUT}`);
}
void main();
