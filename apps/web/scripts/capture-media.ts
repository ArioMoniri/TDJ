/** Real screenshots + usage video with Playwright (headless Chromium). Output: media/screenshots/*.png, media/video/usage.webm → ffmpeg → mp4/gif. */

import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium, devices, type Page } from "playwright";

const BASE = process.env.TDJ_URL ?? "http://localhost:3000";
const OUT = new URL("../../../media/", import.meta.url).pathname;
mkdirSync(`${OUT}screenshots`, { recursive: true });
mkdirSync(`${OUT}video`, { recursive: true });

const compose = async (page: Page) => {
  await page.getByRole("button", { name: /Compose the night/ }).click();
  await page.waitForSelector("#result", { timeout: 60000 });
};

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
  await page.getByLabel("Era", { exact: true }).selectOption("golden");
  await page.locator("#hours").fill("4");
  await page.getByRole("button", { name: "Cultures" }).click();
  await page.getByRole("checkbox", { name: "Turkish" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
  await page.getByLabel("Season (hemisphere-corrected)").selectOption("winter");
  await page.getByLabel("Event type").selectOption("marathon");
  await page.getByLabel("Mood request").selectOption("romantic");
  await page.locator("#tonight").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}screenshots/14-tonight-context.png` });
  // night rules group
  await page.locator("#night-rules").scrollIntoViewIfNeeded();
  await page.getByRole("switch", { name: "Open with La Cumparsita" }).click();
  await page.getByRole("radio", { name: "Two (Buenos Aires)" }).click();
  await page.getByRole("switch", { name: "Show or break" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}screenshots/17-rules.png` });
  await page.evaluate(() => window.scrollTo(0, 0));
  await compose(page);
  await page.waitForTimeout(1800);
  await page.evaluate(() => window.scrollBy(0, -72));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}screenshots/02-result-arc.png` });
  await page.locator("#tanda-9").scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}screenshots/03-tandas.png` });
  // Listen: pick a tanda whose orchestra has a reference playlist
  const refCard = page
    .locator("article[id^=tanda-]")
    .filter({ has: page.locator("h3", { hasText: /D'Arienzo|Di Sarli|Troilo|Pugliese|Canaro|Fresedo/ }) })
    .first();
  const refMenu = refCard.getByRole("button", { name: /Tanda \d+ actions/ });
  await refMenu.click();
  await page.getByRole("menuitem", { name: "Listen" }).click();
  await refCard.scrollIntoViewIfNeeded();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}screenshots/13-listen.png` });
  await refMenu.click();
  await page.getByRole("menuitem", { name: "Hide player" }).click();
  await page.waitForTimeout(800);
  await page.locator("#tanda-3").scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Tanda 3 actions", exact: true }).click();
  await page.getByRole("menu").waitFor();
  await page.getByRole("menuitem", { name: "Swap tanda" }).click();
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "Export" }).click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}screenshots/04-export.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await page.goto(`${BASE}/library`, { waitUntil: "networkidle" });
  await page.getByLabel("Search the library").fill("di sarli rufino");
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}screenshots/05-library.png` });
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}screenshots/06-settings.png` });
  // connectors sheet (Spotify): one primary action, Advanced folded
  await page.locator("#connector-spotify").click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}screenshots/20-connectors.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  await page.getByRole("radio", { name: "OpenAI" }).click();
  await page.locator("#ai-key").fill("sk-demo-key-not-real");
  await page.getByRole("button", { name: "Rekordbox" }).click();
  await page.locator("#folder-rekordbox").fill("/Users/dj/Music/Tango");
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}screenshots/15-settings-ai.png` });
  await page.goto(`${BASE}/database`, { waitUntil: "networkidle" });
  await page.getByLabel("Search the index").fill("di sarli rufino");
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}screenshots/12-database.png` });
  // memory tab with a note
  await page.getByRole("radio", { name: "Memory" }).click();
  await page.getByRole("button", { name: "Add a note…" }).click();
  await page.locator("#memory-note").fill("Thursday crowd likes Donato milongas; keep the peak before 1 am.");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}screenshots/18-memory.png` });
  // history: the sets composed in this run
  await page.goto(`${BASE}/history`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}screenshots/19-history.png` });
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
  await compose(mp);
  await mp.waitForTimeout(1500);
  await mp.locator("#result").scrollIntoViewIfNeeded();
  await mp.evaluate(() => window.scrollBy(0, -60));
  await mp.waitForTimeout(500);
  await mp.screenshot({ path: `${OUT}screenshots/09-mobile-result.png` });
  // mid-list on the way up: the full primary bar (Regenerate + Export + •••) above the tab bar
  await mp.locator("#tanda-3").scrollIntoViewIfNeeded();
  await mp.waitForTimeout(400);
  // a finger scrolling up (the bars only return on a gesture, never on a layout shift) brings the full bar back
  // (inlined: tsx wraps inner helper functions with an esbuild `__name` call the page lacks)
  await mp.evaluate(`(() => {
    const t = (y) => new Touch({ identifier: 1, target: document.body, clientX: 180, clientY: y });
    window.dispatchEvent(new TouchEvent("touchstart", { touches: [t(200)] }));
    window.dispatchEvent(new TouchEvent("touchmove", { touches: [t(420)] }));
    window.scrollBy(0, -60);
  })()`);
  await mp.waitForTimeout(700);
  await mp.screenshot({ path: `${OUT}screenshots/10-mobile-tandas.png` });
  // scrolling down minimises the tab bar; the primary bar becomes an icon-only pill
  await mp.evaluate(() => window.scrollBy(0, 300));
  await mp.waitForTimeout(150);
  await mp.evaluate(() => window.scrollBy(0, 500));
  await mp.waitForTimeout(700);
  await mp.screenshot({ path: `${OUT}screenshots/21-mobile-bar-min.png` });
  await mp.evaluate(() => window.scrollTo(0, 0));
  await mp.waitForTimeout(500);
  // Adjust sheet (feedback chips + Tell the DJ) from the bar's •••
  await mp.getByRole("button", { name: "Set actions" }).click();
  await mp.getByRole("menuitem", { name: "Tell the DJ…" }).click();
  await mp.waitForTimeout(800);
  await mp.screenshot({ path: `${OUT}screenshots/22-mobile-adjust.png` });
  await mp.keyboard.press("Escape");
  await mp.waitForTimeout(400);
  await mp.getByTestId("bar-export").click();
  await mp.waitForTimeout(800);
  await mp.screenshot({ path: `${OUT}screenshots/11-mobile-export.png` });
  await mp.keyboard.press("Escape");
  await mp.goto(`${BASE}/database`, { waitUntil: "networkidle" });
  await mp.getByLabel("Search the index").fill("troilo fiorentino");
  await mp.waitForTimeout(900);
  await mp.locator("[data-song]").nth(1).scrollIntoViewIfNeeded();
  await mp.waitForTimeout(300);
  await mp.screenshot({ path: `${OUT}screenshots/16-mobile-database.png` });
  await mp.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
  await mp.waitForTimeout(600);
  await mp.screenshot({ path: `${OUT}screenshots/19-mobile-settings.png` });
  await mp.locator("#connector-spotify").click();
  await mp.waitForTimeout(800);
  await mp.screenshot({ path: `${OUT}screenshots/20-mobile-connectors.png` });
  await mp.keyboard.press("Escape");
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
