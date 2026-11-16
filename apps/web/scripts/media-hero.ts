/**
 * The README hero, end to end: `pnpm media:hero` (from the repo root).
 *
 *   1. capture  (scripts/media/hero.ts): the app filmed on a 1280 × 800 screen → apps/video/public/raw/hero.{mp4,json}
 *   2. compose  (apps/video, composition "Hero"): a laptop opens, the recording plays on its screen, the lid shuts
 *   3. encode   media/readme/hero.mp4 (H.264), hero.webm (VP9) for the website / store preview, and hero.gif for the
 *               README (≤ 8 MB, the largest width/fps on the ladder that fits; GitHub stops inlining at 10 MB)
 *   4. README   the hero `<img>` under the tagline points at hero.gif (linked to hero.mp4)
 *
 * Needs a production server: `pnpm --filter @tdj/web build && pnpm --filter @tdj/web start -p 3975`, then
 * TDJ_URL=http://localhost:3975 pnpm media:hero. Flags:
 *   --draft          write hero-draft.{mp4,webm,gif} and leave the README alone
 *   --skip=capture   reuse the last capture (re-compose / re-encode only)
 *   --keep-master    keep the lossless composite (media/readme/.hero.master.mp4); then --skip=capture,render re-encodes only
 *   --concurrency=N  Remotion's render threads (default 2: the machine is shared)
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { ffmpeg } from "./media/ffmpeg";
import { heroClip } from "./media/hero";

const BASE = process.env.TDJ_URL ?? "http://localhost:3000";
const ROOT = new URL("../../../", import.meta.url).pathname;
const RAW = `${ROOT}apps/video/public/raw`;
const OUT = `${ROOT}media/readme`;
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const skip = new Set(arg("skip")?.split(",") ?? []);
const draft = process.argv.includes("--draft");
const NAME = draft ? "hero-draft" : "hero";
const concurrency = arg("concurrency") ?? "2";
const GIF_MAX = 8 * 1024 * 1024;
const mb = (f: string) => `${(statSync(f).size / 1048576).toFixed(2)} MB`;
const clock = () => {
  const t = Date.now();
  return () => `${((Date.now() - t) / 1000).toFixed(0)} s`;
};

/**
 * The README shows the hero at 840 px. A GIF pays for every pixel that changes (a moving camera costs ~120 KB a
 * frame at 960 px), so: the camera holds still while the app plays (Hero's default), the intro and the outro (lid,
 * camera) run at half the frame rate, frames identical to the last one are dropped (mpdecimate; the GIF keeps the
 * timing), and bayer dithering keeps flat areas identical from frame to frame. Retina (1680) never fits 8 MB.
 */
const LADDER: Array<[fps: number, width: number, colors: number, dither: string]> = [
  [24, 960, 160, "bayer:bayer_scale=4"],
  [24, 840, 160, "bayer:bayer_scale=4"],
  [20, 840, 128, "bayer:bayer_scale=4"],
  [16, 840, 128, "bayer:bayer_scale=3"],
  [12, 840, 128, "none"],
];
/** Hero.tsx: INTRO and OUTRO, in seconds */
const INTRO_S = 2.9;
const OUTRO_S = 2.1;

function gif(src: string, dst: string) {
  const dur = Number(
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src])
      .toString()
      .trim(),
  );
  const motion = `lt(t,${INTRO_S})+gt(t,${(dur - OUTRO_S).toFixed(2)})`;
  for (const [fps, w, colors, dither] of LADDER) {
    const t = clock();
    ffmpeg([
      "-i",
      src,
      "-vf",
      `fps=${fps},select='if(${motion},not(mod(n,2)),1)',mpdecimate,scale=${w}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=diff[p];[b][p]paletteuse=dither=${dither}:diff_mode=rectangle`,
      "-fps_mode",
      "vfr",
      "-loop",
      "0",
      "-threads",
      "2",
      dst,
    ]);
    console.log(`  gif ${w} px · ${fps} fps · ${colors} colours: ${mb(dst)} (${t()})`);
    if (statSync(dst).size <= GIF_MAX) return { fps, w };
  }
  throw new Error("no GIF on the ladder fits 8 MB");
}

function readme() {
  const f = `${ROOT}README.md`;
  const md = readFileSync(f, "utf8");
  const line =
    '<p align="center"><a href="media/readme/hero.mp4"><img src="media/readme/hero.gif" width="840" alt="T-DJ on a laptop: the lid opens, one tap composes a four-hour night, the Booth opens and a transition between two songs is set to Fade"/></a></p>';
  // the first centred media paragraph after the tagline
  const next = md.replace(
    /<p align="center"><a href="media\/readme\/[\w-]+\.mp4"><img src="media\/readme\/[\w-]+\.gif"[^\n]*<\/p>/,
    line,
  );
  if (next === md && !md.includes(line)) throw new Error("README: the hero line was not found");
  writeFileSync(f, next);
}

async function main() {
  mkdirSync(RAW, { recursive: true });
  mkdirSync(OUT, { recursive: true });
  const all = clock();
  if (!skip.has("capture")) {
    const t = clock();
    const browser = await chromium.launch({
      executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium",
      args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--force-device-scale-factor=2"],
    });
    try {
      await heroClip({ browser, base: BASE, raw: RAW });
    } finally {
      await browser.close();
    }
    // the screen is 1088 px on the stage and the camera goes in to ~1.6×: 2048 px of source is plenty, and half the
    // memory per decoded frame of the 2560 px capture (the compositor was killed for memory at full size)
    const raw = `${RAW}/hero.mp4`;
    ffmpeg(
      ["-i", raw, "-vf", "scale=2048:-2:flags=lanczos", "-c:v", "libx264", "-crf", "15", "-g", "30"].concat([
        "-pix_fmt",
        "yuv420p",
        "-threads",
        "2",
        `${RAW}/.hero.mp4`,
      ]),
    );
    renameSync(`${RAW}/.hero.mp4`, raw);
    console.log(`capture: ${t()}`);
  }
  if (!existsSync(`${RAW}/hero.json`)) throw new Error("no capture: run without --skip=capture");
  const master = `${OUT}/.${NAME}.master.mp4`;
  if (!skip.has("render")) {
    const t = clock();
    execFileSync(
      "pnpm",
      [
        "--filter",
        "@tdj/video",
        "exec",
        "remotion",
        "render",
        "src/index.ts",
        "Hero",
        master,
        `--props=${JSON.stringify({ name: "hero" })}`,
        "--codec=h264",
        "--crf=14",
        `--concurrency=${concurrency}`,
        // a bounded frame cache and one decoder thread: the machine is shared with servers and test runs
        "--offthreadvideo-cache-size-in-bytes=300000000",
        "--offthreadvideo-video-threads=1",
        "--log=error",
      ],
      { stdio: "inherit", cwd: ROOT },
    );
    console.log(`compose: ${t()}`);
  }
  const t = clock();
  const mp4 = `${OUT}/${NAME}.mp4`;
  const webm = `${OUT}/${NAME}.webm`;
  const tmp = `${OUT}/.${NAME}.tmp.mp4`;
  ffmpeg(
    ["-i", master, "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-tune", "animation"].concat([
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
  ffmpeg([
    "-i",
    master,
    "-c:v",
    "libvpx-vp9",
    "-b:v",
    "0",
    "-crf",
    "36",
    "-deadline",
    "good",
    "-cpu-used",
    "4",
    "-row-mt",
    "1",
    "-threads",
    "2",
    "-an",
    webm,
  ]);
  console.log(`  ${NAME}.mp4 ${mb(mp4)} · ${NAME}.webm ${mb(webm)} (${t()})`);
  const g = gif(master, `${OUT}/${NAME}.gif`);
  if (!draft) {
    readme();
    console.log("README: hero updated");
  }
  if (!process.argv.includes("--keep-master")) rmSync(master, { force: true });
  console.log(`hero: ${NAME}.gif at ${g.w} px / ${g.fps} fps; all in ${all()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
