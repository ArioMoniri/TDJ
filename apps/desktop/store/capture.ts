/**
 * Step 1 of the store pipeline: raw captures of the bundled app UI at each device's own size.
 * Needs ui/dist (`pnpm --filter @tdj/desktop ui`). Output: store/out/raw/<device>/<locale>/<scene>.png
 * The bundle is standalone (its own adapter answers /api) and the native side is mocked (tauri-mock.ts), so no
 * server is involved. Env: CHROMIUM (browser path; empty = Playwright's own).
 * Flags: --devices=iphone69,mac  --scenes=02_booth  --locales=tr
 */
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type BrowserContextOptions, chromium, type Page } from "playwright";
import {
  DEVICES,
  type Device,
  LOCALES,
  type Locale,
  type Scene,
  SIZES,
  type Step,
  scenesFor,
} from "./scenes";
import { startPreview } from "./serve";
import { installTauriMock } from "./tauri-mock";

const OUT = fileURLToPath(new URL("./out/raw/", import.meta.url));
const PORT = Number(process.env.PORT ?? 4173);
const arg = (k: string) =>
  process.argv
    .find((a) => a.startsWith(`--${k}=`))
    ?.split("=")[1]
    ?.split(",");

const UA = {
  phone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  tablet:
    "Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
};

/** A short tone the Booth can play without the network (the mock's Deezer previews point at 127.0.0.1:9). */
function wav(sec = 20): Buffer {
  const rate = 22050;
  const n = rate * sec;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const v = Math.sin(2 * Math.PI * 220 * t) * 0.18 + Math.sin(2 * Math.PI * 330 * t) * 0.12;
    data.writeInt16LE(Math.round(v * 32767 * 0.5), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
const WAV = wav();

export async function run(page: Page, steps: Step[], label: string) {
  for (const step of steps) {
    const optional = "optional" in step && step.optional;
    const timeout = optional ? 2500 : 15000;
    try {
      if ("click" in step) await page.locator(step.click).first().click({ timeout });
      else if ("press" in step) await page.keyboard.press(step.press);
      else if ("scroll" in step)
        await page
          .locator(step.scroll)
          .first()
          .evaluate(
            (el, block) => el.scrollIntoView({ block: block as ScrollLogicalPosition }),
            step.block ?? "center",
          );
      else if ("scrollTop" in step) await page.evaluate(() => window.scrollTo(0, 0));
      else if ("scrollBy" in step) await page.evaluate((y) => window.scrollBy(0, y), step.scrollBy);
      else if ("fill" in step) await page.locator(step.fill).first().fill(step.text, { timeout });
      else if ("blur" in step)
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      else if ("waitFor" in step)
        await page.waitForSelector(step.waitFor, { timeout: optional ? 8000 : 90000 });
      else await page.waitForTimeout(step.wait);
    } catch (e) {
      if (!optional)
        console.warn(
          `  ${label}: step ${JSON.stringify(step)} skipped (${(e as Error).message.split("\n")[0]})`,
        );
    }
  }
}

function contextFor(device: Device, locale: Locale, scene: Scene): BrowserContextOptions {
  const size = SIZES[device];
  const touch = size.kind !== "mac";
  return {
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: size.scale,
    hasTouch: touch,
    isMobile: touch,
    ...(touch ? { userAgent: size.kind === "phone" ? UA.phone : UA.tablet } : {}),
    colorScheme: scene.dark ? "dark" : "light",
    reducedMotion: "reduce",
    // Settings → Language is Auto by default: the app follows the system language
    locale: locale === "tr" ? "tr-TR" : "en-US",
  };
}

async function main() {
  const devices = (arg("devices") as Device[] | undefined) ?? DEVICES;
  const locales = (arg("locales") as Locale[] | undefined) ?? LOCALES;
  const only = arg("scenes");
  const server = await startPreview(PORT);
  const exe = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium";
  const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ["--no-sandbox"] });
  try {
    for (const device of devices) {
      for (const locale of locales) {
        mkdirSync(`${OUT}${device}/${locale}`, { recursive: true });
        for (const scene of scenesFor(device)) {
          if (only && !only.includes(scene.id)) continue;
          const ctx = await browser.newContext(contextFor(device, locale, scene));
          // the app's native side, mocked (SQLite in memory, no network): the bundle runs as it does on the device
          await installTauriMock(ctx, { platform: SIZES[device].native });
          // the canned Deezer previews: a local tone, so the Booth plays
          await ctx.route(/127\.0\.0\.1:9\/preview\//, (r) =>
            r.fulfill({ status: 200, contentType: "audio/wav", body: WAV }),
          );
          // first-run sounds off (silent in a capture anyway)
          await ctx.addInitScript(`(() => { try {
            if (sessionStorage.getItem("tdj-store-primed")) return;
            sessionStorage.setItem("tdj-store-primed", "1");
            const cur = JSON.parse(localStorage.getItem("tdj-v1") || "{}");
            const state = cur.state || {};
            state.settings = Object.assign({}, state.settings || {}, { sounds: false });
            localStorage.setItem("tdj-v1", JSON.stringify(Object.assign({ version: 4 }, cur, { state })));
          } catch (_) {} })();`);
          const page = await ctx.newPage();
          // the notch / Dynamic Island and the home indicator, as on the device (checks the app's safe areas too)
          const { safe } = SIZES[device];
          if (safe.top || safe.bottom) {
            const cdp = await ctx.newCDPSession(page);
            await cdp
              .send("Emulation.setSafeAreaInsetsOverride" as never, { insets: safe } as never)
              .catch((e: Error) => console.warn(`  no safe-area emulation in this Chromium (${e.message})`));
          }
          await page.goto(`http://127.0.0.1:${PORT}${scene.path}`, { waitUntil: "load", timeout: 90000 });
          await page.waitForLoadState("networkidle").catch(() => {});
          await run(page, scene.stepsFor?.[device] ?? scene.steps ?? [], `${device} ${locale} ${scene.id}`);
          await page.screenshot({ path: `${OUT}${device}/${locale}/${scene.id}.png` });
          console.log(`captured ${device} ${locale} ${scene.id}`);
          await ctx.close();
        }
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
