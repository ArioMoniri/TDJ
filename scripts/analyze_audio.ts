/**
 * Analyse resolved previews (data/cache/resolve/tracks.json) with the pure-TS DSP in @tdj/core and store
 * data/cache/audio/features.json (committed). Needs ffmpeg on PATH for MP3 decoding.
 *   pnpm --filter @tdj/core exec tsx ../../scripts/analyze_audio.ts --limit=1000
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AudioFeatures, analyzePcm } from "../packages/core/src/audio/dsp";
import type { ResolvedTrack } from "../packages/core/src/audio/index";
import type { Song } from "../packages/core/src/types";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);
const ROOT = new URL("..", import.meta.url).pathname;
const OUT = `${ROOT}data/cache/audio/features.json`;
mkdirSync(`${ROOT}data/cache/audio`, { recursive: true });
const features: Record<string, AudioFeatures | null> = existsSync(OUT)
  ? JSON.parse(readFileSync(OUT, "utf8"))
  : {};
const resolved = JSON.parse(readFileSync(`${ROOT}data/cache/resolve/tracks.json`, "utf8")) as Record<
  string,
  ResolvedTrack | null
>;
const songs = new Map(
  (JSON.parse(readFileSync(`${ROOT}data/index/songs.json`, "utf8")) as Song[]).map((s) => [s.id, s]),
);

async function main() {
  const todo = Object.entries(resolved)
    .filter(([id, r]) => r?.previewUrl && !(id in features))
    .slice(0, Number(args.limit ?? 500));
  let n = 0;
  for (const [id, r] of todo) {
    const mp3 = join(tmpdir(), `tdj-${id}.mp3`),
      raw = join(tmpdir(), `tdj-${id}.f32`);
    try {
      const res = await fetch(r!.previewUrl!);
      if (!res.ok) {
        features[id] = null;
        continue;
      }
      writeFileSync(mp3, Buffer.from(await res.arrayBuffer()));
      execFileSync("ffmpeg", [
        "-y",
        "-loglevel",
        "error",
        "-i",
        mp3,
        "-ac",
        "1",
        "-ar",
        "22050",
        "-f",
        "f32le",
        raw,
      ]);
      const buf = readFileSync(raw);
      const pcm = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
      features[id] = analyzePcm(pcm, 22050, { rhythmHint: songs.get(id)?.rhythm });
    } catch (e) {
      console.error(id, (e as Error).message);
      features[id] = null;
    } finally {
      for (const f of [mp3, raw]) {
        try {
          unlinkSync(f);
        } catch {}
      }
    }
    n++;
    if (n % 25 === 0) {
      writeFileSync(OUT, JSON.stringify(features));
      console.log(`${n}/${todo.length}`);
    }
  }
  writeFileSync(OUT, JSON.stringify(features));
  const ok = Object.values(features).filter(Boolean).length;
  console.log(`done: ${n} analysed this run; ${ok} features cached`);
}
main();
