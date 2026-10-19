/**
 * Front-end performance probe (docs/design/performance-budget.md). Drives a production build with Playwright's
 * Chromium twice: a 1440 × 900 desktop at native speed and an iPhone 15 Pro with 4× CPU throttling. Prints one JSON
 * line per run: load time, JS transfer, DOM size before/after a compose, long tasks during the compose and the
 * 3 s that follow, scroll frame p95 and the compose payload size.
 *
 *   pnpm --filter @tdj/web perf                      # against the deployed site
 *   TDJ_URL=http://localhost:3000 pnpm --filter @tdj/web perf   # against a local `pnpm build && pnpm start`
 */
import { type BrowserContextOptions, chromium, devices } from "@playwright/test";

const URL = process.env.TDJ_URL ?? "https://d3k5k2c1l0s5ri.cloudfront.net";
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium";

declare global {
  interface Window {
    __lt: number[];
  }
}

/* evaluate() bodies are inlined: tsx wraps module-level functions with an esbuild `__name` helper the page lacks */
const COUNT_NODES = "document.querySelectorAll('*').length";
const COUNT_FILTERED = `[...document.querySelectorAll('*')].filter((e) => {
  const s = getComputedStyle(e);
  return (s.backdropFilter && s.backdropFilter !== 'none') || (s.filter && s.filter !== 'none');
}).length`;

async function run(name: string, ctxOpts: BrowserContextOptions, cpu: number) {
  const browser = await chromium.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] });
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  const t0 = Date.now();
  await page.goto(URL, { waitUntil: "networkidle" });
  const load = Date.now() - t0;
  const js = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((r) => r.name.endsWith(".js"))
      .reduce((a, r) => a + ((r as PerformanceResourceTiming).transferSize || 0), 0),
  );
  const nodes = (await page.evaluate(COUNT_NODES)) as number;
  const blur = (await page.evaluate(COUNT_FILTERED)) as number;
  const anims = await page.evaluate(() => document.getAnimations().length);
  // long tasks during the compose and the three seconds after the result appears
  await page.evaluate(() => {
    window.__lt = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(e.duration))).observe({
      type: "longtask",
      buffered: true,
    });
  });
  const t1 = Date.now();
  await page.getByRole("button", { name: /Compose the night/ }).click();
  await page.waitForSelector("#result", { timeout: 60000 });
  await page.waitForTimeout(3000);
  const compose = Date.now() - t1;
  const lt = await page.evaluate(() => window.__lt);
  const nodes2 = (await page.evaluate(COUNT_NODES)) as number;
  const blur2 = (await page.evaluate(COUNT_FILTERED)) as number;
  const anims2 = await page.evaluate(() => document.getAnimations().length);
  // scroll jank: frame times while scrolling 40 px per frame for 90 frames
  const frames = (await page.evaluate(`(async () => {
    const t = [];
    let last = performance.now();
    let n = 0;
    await new Promise((res) => {
      const f = () => {
        const now = performance.now();
        t.push(now - last);
        last = now;
        window.scrollBy(0, 40);
        if (++n < 90) requestAnimationFrame(f);
        else res();
      };
      requestAnimationFrame(f);
    });
    return t;
  })()`)) as number[];
  const p95 = frames.sort((a, b) => a - b)[Math.floor(frames.length * 0.95)] ?? 0;
  const payload = await (await page.request.post(`${URL}/api/compose`, { data: { hours: 4 } })).body();
  console.log(
    JSON.stringify({
      name,
      cpu,
      loadMs: load,
      jsKB: Math.round(js / 1024),
      nodes,
      nodes2,
      blur,
      blur2,
      anims,
      anims2,
      composeMs: compose,
      longTasks: lt.length,
      longTaskMaxMs: Math.round(Math.max(0, ...lt)),
      longTaskTotalMs: Math.round(lt.reduce((a, b) => a + b, 0)),
      scrollFrameP95Ms: Math.round(p95),
      composePayloadKB: Math.round(payload.length / 1024),
    }),
  );
  await browser.close();
}

(async () => {
  await run("desktop", { viewport: { width: 1440, height: 900 } }, 1);
  await run("iphone-4x-cpu", { ...devices["iPhone 15 Pro"] }, 4);
})();
