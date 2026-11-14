/**
 * Step 1 of the store pipeline: raw captures of the bundled app UI at the store viewports.
 * Needs ui/dist (`pnpm --filter @tdj/desktop ui`). Output: store/out/raw/<platform>/<locale>/<scene>.png
 * Env: TDJ_STORE_BACKEND (default: the TDJ cloud), CHROMIUM (browser path; empty = Playwright's own).
 */
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { LOCALES, PLATFORMS, SCENES, type Scene, SIZES } from "./scenes";
import { DEFAULT_BACKEND, startPreview } from "./serve";

const OUT = fileURLToPath(new URL("./out/raw/", import.meta.url));
const PORT = Number(process.env.PORT ?? 4173);

async function run(page: Page, scene: Scene) {
  for (const step of scene.steps ?? []) {
    try {
      if ("click" in step) await page.locator(step.click).first().click({ timeout: 8000 });
      else if ("press" in step) await page.keyboard.press(step.press);
      else if ("scroll" in step)
        await page.locator(step.scroll).first().scrollIntoViewIfNeeded({ timeout: 8000 });
      else if ("fill" in step) await page.locator(step.fill).first().fill(step.text, { timeout: 8000 });
      else if ("blur" in step)
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      else if ("waitFor" in step) await page.waitForSelector(step.waitFor, { timeout: 60000 });
      else await page.waitForTimeout(step.wait);
    } catch (e) {
      console.warn(
        `  ${scene.id}: step ${JSON.stringify(step)} skipped (${(e as Error).message.split("\n")[0]})`,
      );
    }
  }
}

async function main() {
  const server = await startPreview(PORT, DEFAULT_BACKEND);
  const exe = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium";
  const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ["--no-sandbox"] });
  try {
    for (const platform of PLATFORMS) {
      const size = SIZES[platform];
      for (const locale of LOCALES) {
        mkdirSync(`${OUT}${platform}/${locale}`, { recursive: true });
        for (const scene of SCENES) {
          const ctx = await browser.newContext({
            viewport: { width: size.width, height: size.height },
            deviceScaleFactor: size.scale,
            hasTouch: size.touch,
            isMobile: false,
            colorScheme: scene.dark ? "dark" : "light",
            reducedMotion: "reduce",
            locale: locale === "tr" ? "tr-TR" : "en-US",
          });
          await ctx.addInitScript(
            ({ platform, server }) => {
              (window as unknown as Record<string, unknown>).__TDJ_NATIVE__ = Object.freeze({
                platform: platform === "mac" ? "macos" : "ipados",
                bundled: true,
                server,
                apiBase: location.origin,
                vibrancy: false,
              });
            },
            { platform, server: DEFAULT_BACKEND },
          );
          const page = await ctx.newPage();
          // `lang` is ignored until the UI has a Turkish switch (ROADMAP §7); then the tr set shows Turkish UI
          const sep = scene.path.includes("?") ? "&" : "?";
          await page.goto(`http://127.0.0.1:${PORT}${scene.path}${locale === "tr" ? `${sep}lang=tr` : ""}`, {
            waitUntil: "networkidle",
            timeout: 90000,
          });
          await run(page, scene);
          await page.screenshot({ path: `${OUT}${platform}/${locale}/${scene.id}.png` });
          console.log(`captured ${platform} ${locale} ${scene.id}`);
          await ctx.close();
        }
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
