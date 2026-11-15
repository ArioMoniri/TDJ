#!/usr/bin/env node
/** Copies the README clips (media/readme/*.mp4, from `pnpm media`) into public/clips for the launch video. */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";

const from = new URL("../../../media/readme/", import.meta.url).pathname;
const to = new URL("../public/clips/", import.meta.url).pathname;
mkdirSync(to, { recursive: true });
const clips = existsSync(from) ? readdirSync(from).filter((f) => f.endsWith(".mp4")) : [];
if (!clips.length) {
  console.error("no clips in media/readme: run `pnpm media` first");
  process.exit(1);
}
for (const f of clips) copyFileSync(from + f, to + f);
console.log(`launch video: ${clips.length} clips`);
