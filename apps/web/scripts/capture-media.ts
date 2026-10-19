/** Real screenshots + usage video with Playwright (headless Chromium). Output: media/screenshots/*.png, media/video/usage.webm → ffmpeg → mp4/gif. */

import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium, devices } from "playwright";

const BASE = process.env.TDJ_URL ?? "http://localhost:3000";
const OUT = new URL("../../../media/", import.meta.url).pathname;
mkdirSync(`${OUT}screenshots`, { recursive: true });
mkdirSync(`${OUT}video`, { recursive: true });

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium",
    args: ["--no-sandbox"],
  });
  // Desktop, recorded
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
    recordVideo: { dir: `${OUT}video/raw`, size: { width: 1440, height: 900 } },
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}screenshots/01-home-dark.png` });
  await page.getByRole("button", { name: "Golden Age 35–55" }).click();
  await page.locator("#hours").fill("4");
  await page.getByRole("button", { name: "turkish" }).click();
  await page.getByLabel("Season (hemisphere-corrected)").selectOption("winter");
  await page.getByLabel("Event type").selectOption("marathon");
  await page.getByLabel("Mood request").selectOption("romantic");
  await page.locator("fieldset.chip-row").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}screenshots/14-tonight-context.png` });
  await page.getByRole("button", { name: /Compose the night/ }).click();
  await page.waitForSelector("#result", { timeout: 60000 });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}screenshots/02-result-arc.png` });
  await page.locator("#tanda-9").scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}screenshots/03-tandas.png` });
  // Listen: pick a tanda whose orchestra has a reference playlist
  const refCard = page
    .locator("article[id^=tanda-]")
    .filter({ has: page.locator("h3", { hasText: /D'Arienzo|Di Sarli|Troilo|Pugliese|Canaro|Fresedo/ }) })
    .first();
  await refCard.getByRole("button", { name: "Listen" }).click();
  await refCard.scrollIntoViewIfNeeded();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}screenshots/13-listen.png` });
  await refCard.getByRole("button", { name: "Hide player" }).click();
  await page.getByRole("button", { name: "Swap tanda" }).nth(2).click();
  await page.waitForTimeout(1500);
  await page
    .getByRole("button", { name: /Export/ })
    .first()
    .scrollIntoViewIfNeeded();
  await page
    .getByRole("button", { name: /Export/ })
    .first()
    .click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}screenshots/04-export.png` });
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Close" })
    .click()
    .catch(() => {});
  await page.goto(`${BASE}/library`, { waitUntil: "networkidle" });
  await page.getByPlaceholder(/Search title/).fill("di sarli rufino");
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}screenshots/05-library.png` });
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}screenshots/06-settings.png` });
  await page.getByRole("radio", { name: "OpenAI" }).click();
  await page.locator("#ai-key").fill("sk-demo-key-not-real");
  await page.locator("#folder-rekordbox").fill("/Users/dj/Music/Tango");
  await page.locator("#review-h").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}screenshots/15-settings-ai.png` });
  await page.goto(`${BASE}/database`, { waitUntil: "networkidle" });
  await page.getByLabel("Search the index").fill("di sarli rufino");
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}screenshots/12-database.png` });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await ctx.close();
  // Light mode desktop
  const light = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "light",
  });
  const lp = await light.newPage();
  await lp.goto(BASE, { waitUntil: "networkidle" });
  await lp.waitForTimeout(800);
  await lp.screenshot({ path: `${OUT}screenshots/07-home-light.png` });
  await light.close();
  // Mobile (iPhone 15 Pro)
  const m = await browser.newContext({ ...devices["iPhone 15 Pro"], colorScheme: "dark" });
  const mp = await m.newPage();
  await mp.goto(BASE, { waitUntil: "networkidle" });
  await mp.waitForTimeout(800);
  await mp.screenshot({ path: `${OUT}screenshots/08-mobile-home.png` });
  await mp.getByRole("button", { name: /Compose the night/ }).click();
  await mp.waitForSelector("#result", { timeout: 60000 });
  await mp.waitForTimeout(1500);
  await mp.screenshot({ path: `${OUT}screenshots/09-mobile-result.png` });
  await mp.locator("#tanda-3").scrollIntoViewIfNeeded();
  await mp.waitForTimeout(500);
  await mp.screenshot({ path: `${OUT}screenshots/10-mobile-tandas.png` });
  await mp
    .getByRole("button", { name: /Export/ })
    .first()
    .scrollIntoViewIfNeeded();
  await mp
    .getByRole("button", { name: /Export/ })
    .first()
    .click();
  await mp.waitForTimeout(800);
  await mp.screenshot({ path: `${OUT}screenshots/11-mobile-export.png` });
  await mp.keyboard.press("Escape");
  await mp.goto(`${BASE}/database`, { waitUntil: "networkidle" });
  await mp.getByLabel("Search the index").fill("troilo fiorentino");
  await mp.waitForTimeout(900);
  await mp.locator("tr[data-song]").nth(1).scrollIntoViewIfNeeded();
  await mp.waitForTimeout(300);
  await mp.screenshot({ path: `${OUT}screenshots/16-mobile-database.png` });
  await m.close();
  await browser.close();
  // Convert video
  const raw = `${OUT}video/raw/${execSync(`ls -t "${OUT}video/raw/"`).toString().trim().split("\n")[0]}`;
  execSync(
    `ffmpeg -y -loglevel error -i "${raw}" -vf "scale=1280:-2" -c:v libx264 -crf 24 -pix_fmt yuv420p -movflags +faststart "${OUT}video/usage.mp4"`,
  );
  execSync(
    `ffmpeg -y -loglevel error -i "${raw}" -vf "fps=12,scale=960:-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" "${OUT}video/usage.gif"`,
  );
  execSync(`rm -rf ${OUT}video/raw`);
  console.log("media captured");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
