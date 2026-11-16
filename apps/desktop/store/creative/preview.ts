/**
 * Store creative v2, step 3: the app previews. For each device and locale: copy the captures the video reads into
 * apps/video/public/store-creative/, render the StorePreview composition with Remotion (concurrency 1), re-encode to
 * Apple's delivery spec with ffmpeg (H.264 High ≤ 4.0, 30 fps, ~11 Mbps, stereo AAC 256 kbps 48 kHz), take the
 * poster frame, and check the result with ffprobe. Output: <out>/app_previews/<locale>/<TYPE>_tdj.mp4 and
 * <out>/app_previews_posters/<locale>/<TYPE>_tdj.jpg.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fitHandheld, type HandheldKind, stillRect } from "../../../video/src/three/handheld";
import { laptopBounds } from "../../../video/src/three/laptop";
import { tangoBed, wav } from "./audio";
import { rawPath } from "./compose";
import { appRect, PLACE, renderHandheld, renderShowcase, type Tone } from "./showcase";
import {
  CAPTURE,
  type Locale,
  POSTER_SECONDS,
  PREVIEW_CHAPTERS,
  PREVIEW_FPS,
  PREVIEW_SECONDS,
  PREVIEWS,
  type PreviewSpec,
  posterFile,
  previewFile,
  SHOTS,
} from "./spec";

const VIDEO = fileURLToPath(new URL("../../../video/", import.meta.url));
const PUB = join(VIDEO, "public/store-creative/");
const REPO = fileURLToPath(new URL("../../../../", import.meta.url));

export const INTRO_FRAMES = 30;
export const OUTRO_FRAMES = 54;

export interface Probe {
  width: number;
  height: number;
  fps: number;
  duration: number;
  vcodec: string;
  profile: string;
  level: number;
  bitrate: number;
  acodec: string | null;
  channels: number;
  sampleRate: number;
}

export function probe(file: string): Probe {
  const r = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,codec_name,profile,level,width,height,r_frame_rate,channels,sample_rate:format=duration,bit_rate",
      "-of",
      "json",
      file,
    ],
    { encoding: "utf8" },
  );
  const j = JSON.parse(r.stdout) as {
    streams: Array<Record<string, string | number>>;
    format: { duration: string; bit_rate: string };
  };
  const v = j.streams.find((s) => s.codec_type === "video")!;
  const a = j.streams.find((s) => s.codec_type === "audio");
  const [num, den] = String(v.r_frame_rate).split("/").map(Number);
  return {
    width: Number(v.width),
    height: Number(v.height),
    fps: num! / (den || 1),
    duration: Number(j.format.duration),
    vcodec: String(v.codec_name),
    profile: String(v.profile),
    level: Number(v.level),
    bitrate: Number(j.format.bit_rate),
    acodec: a ? String(a.codec_name) : null,
    channels: a ? Number(a.channels) : 0,
    sampleRate: a ? Number(a.sample_rate) : 0,
  };
}

/** Apple's app preview rules for one file; [] when it passes */
export function previewProblems(p: Probe, spec: Pick<PreviewSpec, "width" | "height">): string[] {
  const out: string[] = [];
  if (p.width !== spec.width || p.height !== spec.height) out.push(`size ${p.width}×${p.height}`);
  if (p.duration < PREVIEW_SECONDS.min || p.duration > PREVIEW_SECONDS.max)
    out.push(`length ${p.duration.toFixed(2)} s`);
  if (p.fps > 30.01) out.push(`${p.fps} fps`);
  if (p.vcodec !== "h264") out.push(`codec ${p.vcodec}`);
  if (!/High|Main/.test(p.profile)) out.push(`profile ${p.profile}`);
  if (p.level > 40) out.push(`level ${p.level}`);
  if (p.acodec !== "aac" || p.channels !== 2 || ![44100, 48000].includes(p.sampleRate))
    out.push(`audio ${p.acodec} ${p.channels} ch ${p.sampleRate} Hz`);
  return out;
}

function fontFiles() {
  const req = createRequire(join(VIDEO, "../web/package.json"));
  const f = (pkg: string, file: string) => join(dirname(req.resolve(`${pkg}/package.json`)), "files", file);
  return {
    "fraunces-400.woff2": f("@fontsource/fraunces", "fraunces-latin-400-normal.woff2"),
    "fraunces-ext-400.woff2": f("@fontsource/fraunces", "fraunces-latin-ext-400-normal.woff2"),
    "fraunces-800.woff2": f("@fontsource/fraunces", "fraunces-latin-800-normal.woff2"),
    "fraunces-ext-800.woff2": f("@fontsource/fraunces", "fraunces-latin-ext-800-normal.woff2"),
    "inter-700.woff2": f("@fontsource/inter", "inter-latin-700-normal.woff2"),
  };
}

/** the headline over a preview's device: its top and size (the product line is 0.36 of it, see video Stage.tsx) */
export function previewText(spec: Pick<PreviewSpec, "width" | "height" | "id">) {
  const { width: W, height: H } = spec;
  const longest = Math.max(
    ...PREVIEW_CHAPTERS.flatMap((c) => Object.values(c.words)).map((w) => [...w.replace(/\*/g, "")].length),
  );
  const size = Math.min(spec.id === "mac" ? H * 0.066 : W * 0.075, (W * 0.9) / (longest * 0.56));
  const top = spec.id === "mac" ? H * 0.035 : H * 0.04;
  // the product line, its gap, the headline
  return { top, size, bottom: top + size * (0.36 * 1.2 + 0.22 + 1.05) };
}

/** where a preview's handheld goes: the largest that fits under the words, centred */
export function previewHandheld(spec: PreviewSpec) {
  const kind: HandheldKind = spec.capture === "phone" ? "phone" : "tablet";
  const t = previewText(spec);
  const top = t.bottom + spec.height * 0.03;
  return fitHandheld(kind, {
    x: spec.width * 0.06,
    y: top,
    w: spec.width * 0.88,
    h: spec.height * 0.975 - top,
  });
}

/**
 * The preview's black stage: the device rendered once per run into the video's public folder (the laptop for
 * light and dark screens), where it goes, and the screen the captures are laid on.
 */
function stageFor(spec: PreviewSpec) {
  const text = previewText(spec);
  const rel = (png: string) => `store-creative/${basename(png)}`;
  if (spec.id === "mac") {
    const at = (tone: Tone) =>
      rel(
        renderShowcase({ width: spec.width, height: spec.height, place: PLACE.previewMac, tone, dir: PUB }),
      );
    const r = appRect(spec.width, spec.height, PLACE.previewMac);
    return {
      frame: { light: at("light"), dark: at("dark") },
      still: { x: 0, y: 0, w: spec.width, h: spec.height },
      screen: { ...r, r: 0 },
      statusTop: 0,
      text,
    };
  }
  const fit = previewHandheld(spec);
  const png = rel(renderHandheld({ kind: fit.kind, scale: fit.scale, dir: PUB }));
  const cap = CAPTURE[spec.capture];
  return {
    frame: { light: png, dark: png },
    still: stillRect(fit),
    screen: fit.screen,
    statusTop: (cap.safe.top * fit.screen.w) / cap.width,
    text,
  };
}

/** the Mac preview's laptop stays whole in the frame and under the words */
export const macPreviewFits = () => {
  const spec = PREVIEWS.find((p) => p.id === "mac")!;
  const b = laptopBounds(spec.width, spec.height, PLACE.previewMac);
  return b.top > previewText(spec).bottom && b.bottom < spec.height && b.left > 0 && b.right < spec.width;
};

const run = (cmd: string, args: string[], cwd?: string) => {
  const r = spawnSync(cmd, args, { cwd, stdio: ["ignore", "inherit", "inherit"] });
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 3).join(" ")} … failed (${r.status})`);
};

export async function previews(o: {
  out: string;
  locales: Locale[];
  ids?: PreviewSpec["id"][];
}): Promise<string[]> {
  const written: string[] = [];
  mkdirSync(join(PUB, "fonts"), { recursive: true });
  for (const [name, from] of Object.entries(fontFiles())) copyFileSync(from, join(PUB, "fonts", name));
  copyFileSync(join(REPO, "brand/lockup-mono.svg"), join(PUB, "lockup.svg"));
  const stages = new Map<PreviewSpec["id"], ReturnType<typeof stageFor>>();
  try {
    for (const spec of PREVIEWS.filter((p) => !o.ids || o.ids.includes(p.id))) {
      const cap = CAPTURE[spec.capture];
      for (const locale of o.locales) {
        const chapters = PREVIEW_CHAPTERS.map((c) => {
          const dark = !!SHOTS.find((s) => s.id === c.shot)?.dark;
          const rel = `store-creative/${spec.capture}/${locale}/${c.shot}.png`;
          const dest = join(PUB, rel.replace("store-creative/", ""));
          mkdirSync(dirname(dest), { recursive: true });
          copyFileSync(rawPath(spec.capture, locale, c.shot), dest);
          const fullFrom = rawPath(spec.capture, locale, c.shot, true);
          let full: string | undefined;
          // a long page pans only on portrait screens (a landscape frame shows enough of it)
          if (existsSync(fullFrom) && spec.height > spec.width) {
            full = rel.replace(/\.png$/, "-full.png");
            copyFileSync(fullFrom, join(PUB, full.replace("store-creative/", "")));
          }
          return {
            src: rel,
            full,
            words: c.words[locale],
            frames: Math.round(c.seconds * PREVIEW_FPS),
            dark,
          };
        });
        const frames = INTRO_FRAMES + OUTRO_FRAMES + chapters.reduce((n, c) => n + c.frames, 0);
        const seconds = frames / PREVIEW_FPS;
        writeFileSync(join(PUB, "bed.wav"), wav(tangoBed(seconds + 0.2), 48000));
        const props = {
          stage: stages.get(spec.id) ?? stages.set(spec.id, stageFor(spec)).get(spec.id),
          width: spec.width,
          height: spec.height,
          fps: PREVIEW_FPS,
          kind: spec.capture === "phone" ? "phone" : spec.capture === "tablet" ? "tablet" : "mac",
          statusTop: Math.round((cap.safe.top * spec.width) / cap.width),
          lang: locale === "tr" ? "tr" : "en",
          intro: INTRO_FRAMES,
          outro: OUTRO_FRAMES,
          outroWords: locale === "tr" ? "Tango DJ'leri için" : "For tango DJs",
          chapters,
          audio: "store-creative/bed.wav",
        };
        const propsFile = join(PUB, "props.json");
        writeFileSync(propsFile, JSON.stringify(props));
        const tmp = join(PUB, "render.mp4");
        run(
          "npx",
          [
            "remotion",
            "render",
            "src/index.ts",
            "StorePreview",
            tmp,
            `--props=${propsFile}`,
            "--codec=h264",
            "--crf=14",
            `--concurrency=${process.env.REMOTION_CONCURRENCY ?? 1}`,
            "--log=error",
          ],
          VIDEO,
        );
        const target = join(o.out, previewFile(spec, locale));
        mkdirSync(dirname(target), { recursive: true });
        run("ffmpeg", [
          "-y",
          "-v",
          "error",
          "-i",
          tmp,
          "-c:v",
          "libx264",
          "-profile:v",
          "high",
          "-level:v",
          "4.0",
          "-pix_fmt",
          "yuv420p",
          "-r",
          String(PREVIEW_FPS),
          "-b:v",
          "11M",
          "-maxrate",
          "12M",
          "-bufsize",
          "24M",
          "-preset",
          "slow",
          "-c:a",
          "aac",
          "-b:a",
          "256k",
          "-ar",
          "48000",
          "-ac",
          "2",
          "-movflags",
          "+faststart",
          target,
        ]);
        rmSync(tmp, { force: true });
        const problems = previewProblems(probe(target), spec);
        if (problems.length) throw new Error(`${target}: ${problems.join(", ")}`);
        const poster = join(o.out, posterFile(spec, locale));
        mkdirSync(dirname(poster), { recursive: true });
        run("ffmpeg", [
          "-y",
          "-v",
          "error",
          "-ss",
          String(POSTER_SECONDS),
          "-i",
          target,
          "-frames:v",
          "1",
          "-q:v",
          "2",
          poster,
        ]);
        written.push(target, poster);
        console.log(`preview ${spec.id} ${locale}: ${seconds.toFixed(1)} s → ${target}`);
      }
    }
  } finally {
    rmSync(PUB, { recursive: true, force: true });
  }
  return written;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (k: string) =>
    process.argv
      .find((a) => a.startsWith(`--${k}=`))
      ?.split("=")[1]
      ?.split(",");
  previews({
    out: arg("out")?.[0] ?? fileURLToPath(new URL("../../fastlane/", import.meta.url)),
    locales: (arg("locales") as Locale[] | undefined) ?? ["en-US", "tr"],
    ids: arg("previews") as PreviewSpec["id"][] | undefined,
  }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
