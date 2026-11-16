#!/usr/bin/env node
/**
 * `pnpm media:frames`: renders the 3D device frames (src/three/DeviceFrame.tsx) to public/frames/<kind>.png, the
 * pictures every README clip and still is framed in. Run after changing the models; the PNGs are committed.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const dir = new URL("../", import.meta.url).pathname;
mkdirSync(`${dir}public/frames`, { recursive: true });
for (const kind of process.argv.slice(2).length ? process.argv.slice(2) : ["phone", "tablet", "desktop"]) {
  const t = Date.now();
  execFileSync(
    "npx",
    ["remotion", "still", "src/index.ts", "DeviceFrame", `public/frames/${kind}.png`].concat([
      `--props=${JSON.stringify({ kind })}`,
      "--image-format=png",
      "--gl=swangle",
      "--log=error",
    ]),
    { stdio: "inherit", cwd: dir },
  );
  console.log(`frame ${kind}: ${((Date.now() - t) / 1000).toFixed(0)} s`);
}
