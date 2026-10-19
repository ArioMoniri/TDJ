// TEMPORARY: renders public/anim/*.json with lottie-web in headless Chromium and screenshots 3 frames each.
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const SCRATCH = "/tmp/claude-0/-home-user-TDJ/73d2c9cf-6bc0-5f5f-b08c-fd038ddd8f72/scratchpad";
const lottie = readFileSync(`${SCRATCH}/vendor/lottie.min.js`, "utf8");
const files = {
  "compose-loading": [12, 45, 70],
  "success-check": [6, 16, 30],
  "cortina-wave": [0, 12, 24],
};
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 520, height: 260 }, deviceScaleFactor: 2 });
for (const [name, frames] of Object.entries(files)) {
  const json = readFileSync(`public/anim/${name}.json`, "utf8");
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#181622;display:grid;place-items:center;height:260px">
  <div id="a" style="width:480px;height:240px"></div>
  <script>${lottie}</script>
  <script>window.anim = lottie.loadAnimation({container:document.getElementById('a'),renderer:'svg',loop:false,autoplay:false,animationData:${json}});</script>
  </body></html>`);
  await page.waitForFunction(() => window.anim && window.anim.isLoaded);
  for (const f of frames) {
    await page.evaluate((f) => window.anim.goToAndStop(f, true), f);
    await page.screenshot({ path: `${SCRATCH}/frames/${name}-f${f}.png` });
  }
  console.log(name, "ok");
}
await browser.close();
