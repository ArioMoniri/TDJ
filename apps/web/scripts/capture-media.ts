/**
 * README media, captured from the real app (`pnpm media`).
 *
 *   1. clips  (scripts/media/clips.ts): each clip filmed with CDP screencast at 2× pixels, with a planned, eased
 *      cursor path → apps/video/public/raw/<clip>.{mp4,json}
 *   2. render (apps/video, composition "Clip"): cursor, click ripples, gentle zoom, rounded window on the brand
 *      background, 60 fps H.264 → media/readme/<clip>.mp4, then a looping GIF for the README → <clip>.gif
 *   3. stills (scripts/media/stills.ts): framed screenshots → media/readme/<still>.webp
 *
 * Run against a production build (`pnpm --filter @tdj/web build && pnpm --filter @tdj/web start -p 3417`) and
 * TDJ_URL=http://localhost:3417. Flags: --only=compose,booth  --skip=stills,clips,render
 * The machine is shared with the test suites: clips are filmed one at a time, and with --wait-load=N each clip waits
 * until the 1-minute load average drops under N.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { loadavg } from "node:os";
import { chromium } from "playwright";
import { CLIPS } from "./media/clips";
import { ffmpeg } from "./media/ffmpeg";
import { STILLS } from "./media/stills";

const BASE = process.env.TDJ_URL ?? "http://localhost:3000";
const ROOT = new URL("../../../", import.meta.url).pathname;
const RAW = `${ROOT}apps/video/public/raw`;
const OUT = `${ROOT}media/readme`;
mkdirSync(RAW, { recursive: true });
mkdirSync(OUT, { recursive: true });

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const only = arg("only")?.split(",");
const skip = new Set(arg("skip")?.split(",") ?? []);
const waitLoad = Number(arg("wait-load") ?? 0);
const pick = <T>(all: Record<string, T>) => Object.entries(all).filter(([k]) => !only || only.includes(k));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const kb = (f: string) => `${Math.round(statSync(f).size / 1024)} KB`;

async function quiet() {
  if (!waitLoad) return;
  while (loadavg()[0]! > waitLoad) {
    console.log(`  load ${loadavg()[0]!.toFixed(1)} > ${waitLoad}: waiting`);
    await sleep(30_000);
  }
}

/** the Remotion composite, then a README GIF (two-pass palette, 25 fps, ≤ 4 MB by stepping the width down) */
function render(name: string) {
  const mp4 = `${OUT}/${name}.mp4`;
  execFileSync(
    "pnpm",
    [
      "--filter",
      "@tdj/video",
      "exec",
      "remotion",
      "render",
      "src/index.ts",
      "Clip",
      mp4,
      `--props=${JSON.stringify({ name })}`,
      "--codec=h264",
      "--crf=23",
      "--concurrency=2",
      "--log=error",
    ],
    { stdio: "inherit", cwd: ROOT },
  );
  const gif = `${OUT}/${name}.gif`;
  for (const w of [800, 720, 640, 560]) {
    ffmpeg([
      "-i",
      mp4,
      "-vf",
      `fps=25,scale=${w}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle`,
      "-loop",
      "0",
      gif,
    ]);
    if (statSync(gif).size < 4 * 1024 * 1024) break;
  }
  console.log(`  ${name}.mp4 ${kb(mp4)} · ${name}.gif ${kb(gif)}`);
}

const failed: string[] = [];

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium",
    // the screencast sends frames at the window's pixels: this makes them 2× (deviceScaleFactor alone does not)
    args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--force-device-scale-factor=2"],
  });
  try {
    if (!skip.has("clips"))
      for (const [name, clip] of pick(CLIPS)) {
        await quiet();
        console.log(`clip ${name}`);
        try {
          await clip({ browser, base: BASE, raw: RAW });
        } catch (e) {
          failed.push(name);
          console.error(`  ${name} failed: ${(e as Error).message.split("\n")[0]}`);
        }
      }
    if (!skip.has("stills"))
      for (const [name, still] of pick(STILLS)) {
        console.log(`still ${name}`);
        try {
          await still({ browser, base: BASE, out: OUT });
        } catch (e) {
          failed.push(name);
          console.error(`  ${name} failed: ${(e as Error).message.split("\n")[0]}`);
        }
      }
  } finally {
    await browser.close();
  }
  if (!skip.has("render"))
    for (const [name] of pick(CLIPS)) {
      if (!existsSync(`${RAW}/${name}.json`)) continue;
      await quiet();
      console.log(`render ${name}`);
      render(name);
    }
  if (failed.length) {
    console.error(`failed: ${failed.join(", ")}`);
    process.exit(1);
  }
  console.log("media captured");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
