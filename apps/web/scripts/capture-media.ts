/**
 * README media, captured from the real app (`pnpm media`).
 *
 *   1. clips  (scripts/media/clips.ts): each clip filmed with CDP screencast at 2× pixels, with a planned, eased
 *      cursor path → apps/video/public/raw/<clip>.{mp4,json}
 *   2. render (apps/video, composition "Clip"): cursor, click ripples, gentle zoom, rounded window on the brand
 *      background, 60 fps H.264 → media/readme/<clip>.mp4, then a looping GIF for the README (840 or 1680 px wide) → <clip>.gif
 *   3. stills (scripts/media/stills.ts): framed screenshots → media/readme/<still>.webp
 *
 * Run against a production build (`pnpm --filter @tdj/web build && pnpm --filter @tdj/web start -p 3417`) and
 * TDJ_URL=http://localhost:3417. Flags: --only=compose,booth  --skip=stills,clips,render  (--skip=… --gifs: GIFs only)
 * The machine is shared with the test suites: clips are filmed one at a time, and with --wait-load=N each clip waits
 * until the 1-minute load average drops under N.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, statSync } from "node:fs";
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

/**
 * A raw capture no wider than 2048 px (a 2560 px desktop or 2360 px iPad frame comes down; the 1179 px phone stays).
 * OffthreadVideo hands each decoded frame to Chromium as an uncompressed bitmap; one over Chromium's 10 MB
 * shared-memory blob size goes through a file instead, which Chromium refuses on a nearly full disk ("Failed to
 * fetch"). 2048 × 1280 is 7.9 MB, and the clip's stage is 1600 px wide, so nothing is lost.
 */
function fitRaw(raw: string) {
  const w = Number(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width",
      "-of",
      "csv=p=0",
      raw,
    ])
      .toString()
      .trim(),
  );
  if (!(w > 2048)) return;
  const tmp = raw.replace(/\.mp4$/, ".fit.mp4");
  ffmpeg(
    ["-i", raw, "-vf", "scale=2048:-2:flags=lanczos", "-c:v", "libx264", "-crf", "15", "-g", "30"].concat([
      "-pix_fmt",
      "yuv420p",
      "-threads",
      "2",
      tmp,
    ]),
  );
  renameSync(tmp, raw);
}

/** the Remotion composite, then a README GIF (two-pass palette, 25 fps, ≤ 4 MB by stepping the width down) */
function render(name: string) {
  const mp4 = `${OUT}/${name}.mp4`;
  for (const raw of [`${RAW}/${name}.mp4`, `${RAW}/${name}-phone.mp4`]) if (existsSync(raw)) fitRaw(raw);
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
      "--crf=18",
      "--concurrency=2",
      "--log=error",
    ],
    { stdio: "inherit", cwd: ROOT },
  );
  // Remotion's encode is quick and large: a slower x264 pass keeps a clip at 1-3 MB (README size budget)
  const tmp = `${OUT}/.${name}.mp4`;
  ffmpeg(
    ["-i", mp4, "-c:v", "libx264", "-preset", "slow", "-crf", "28", "-tune", "animation"].concat([
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-threads",
      "2",
      tmp,
    ]),
  );
  renameSync(tmp, mp4);
  gif(name);
}

/**
 * The README GIF from the 60 fps MP4. The README shows every clip at 840 px wide in one 16:10 column (2026-11,
 * owner): 1680 px (retina) where it fits under 8 MB (GitHub stops inlining at 10 MB), else 840 px, never narrower;
 * the frame rate gives way first. The README links each GIF to its MP4 for the full 60 fps.
 */
const GIF_MAX = 8 * 1024 * 1024;
const GIF_LADDER: Array<[fps: number, width: number, dither: string]> = [
  [25, 1680, "sierra2_4a"],
  [20, 1680, "sierra2_4a"],
  [25, 840, "sierra2_4a"],
  [20, 840, "bayer:bayer_scale=3"],
  [15, 840, "bayer:bayer_scale=3"],
  [12, 840, "none"],
  [10, 840, "none"],
  [8, 840, "none"],
];
function gif(name: string) {
  const mp4 = `${OUT}/${name}.mp4`;
  const gif = `${OUT}/${name}.gif`;
  for (const [fps, w, dither] of GIF_LADDER) {
    ffmpeg([
      "-i",
      mp4,
      "-vf",
      `fps=${fps},scale=${w}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=${dither}:diff_mode=rectangle`,
      "-loop",
      "0",
      "-threads",
      "2",
      gif,
    ]);
    if (statSync(gif).size < GIF_MAX) break;
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
  else if (process.argv.includes("--gifs"))
    // only the GIFs again, from the MP4s already rendered
    for (const [name] of pick(CLIPS)) if (existsSync(`${OUT}/${name}.mp4`)) gif(name);
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
