/**
 * Search latency probe (2026-11, "the search is so slow"): drives the Library and the Database's Songs tab with
 * Playwright's Chromium on a 1440 × 900 desktop at native speed and an iPhone 15 Pro with 4× CPU throttling, types
 * queries key by key and prints, per run:
 *
 *  - keystroke → results painted: from the input event's timestamp to the frame after the results' `data-answered`
 *    (components/ui/SmartSearch.tsx) names that exact query, for a DJ typing one key every 300 ms (p50 / p95 / max);
 *  - settled: a fast typist (60 ms a key) — the last key to its results painted;
 *  - input → next frame: how long a keystroke waits for its frame (jank), p95 / max, and the long tasks while typing.
 *
 *   TDJ_URL=http://localhost:3931 pnpm --filter @tdj/web exec tsx scripts/search-perf.ts
 */
import { type BrowserContextOptions, chromium, devices, type Page } from "@playwright/test";

const URL = process.env.TDJ_URL ?? "http://localhost:3000";
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium";

/* evaluate() bodies are strings: tsx wraps functions with an esbuild `__name` helper the page lacks */
const INSTRUMENT = `(() => {
  const w = window;
  w.__in = {}; w.__frame = []; w.__paint = {}; w.__lt = [];
  document.addEventListener('input', (e) => {
    const v = e.target && e.target.value;
    if (typeof v !== 'string') return;
    const t = e.timeStamp;
    w.__in[v] = t;
    requestAnimationFrame(() => { const c = new MessageChannel(); c.port1.onmessage = () => w.__frame.push(performance.now() - t); c.port2.postMessage(0); });
  }, true);
  const seen = (el) => {
    const v = el.getAttribute('data-answered');
    if (!v || w.__paint[v] !== undefined) return;
    w.__paint[v] = -1;
    requestAnimationFrame(() => { const c = new MessageChannel(); c.port1.onmessage = () => { w.__paint[v] = performance.now(); }; c.port2.postMessage(0); });
  };
  new MutationObserver((ms) => { for (const m of ms) { if (m.type === 'attributes') seen(m.target); else m.addedNodes.forEach((n) => n.nodeType === 1 && n.querySelectorAll && [n, ...n.querySelectorAll('[data-answered]')].forEach((x) => x.hasAttribute && x.hasAttribute('data-answered') && seen(x))); } })
    .observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-answered'] });
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__lt.push(e.duration))).observe({ type: 'longtask' }); } catch {}
})()`;

const pct = (xs: number[], p: number) => {
  if (!xs.length) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))]!;
};
const r = (x: number) => Math.round(x);

async function typeQuery(page: Page, sel: string, q: string, gap: number) {
  await page.locator(sel).first().fill("");
  await page.waitForTimeout(400);
  await page.evaluate("window.__in = {}; window.__paint = {}; window.__frame = []; window.__lt = []");
  await page.locator(sel).first().focus();
  for (const ch of q) {
    await page.keyboard.type(ch);
    await page.waitForTimeout(gap);
  }
  // the last answer
  await page
    .waitForFunction((v) => (window as unknown as { __paint: Record<string, number> }).__paint[v] > 0, q, {
      timeout: 15_000,
    })
    .catch(() => {});
  if (process.env.DEBUG)
    console.log(
      await page.evaluate(
        "JSON.stringify({ in: window.__in, paint: window.__paint, f: window.__frame, a: [...document.querySelectorAll('[data-answered]')].map((e) => e.getAttribute('data-answered')) })",
      ),
    );
  return (await page.evaluate(
    "({ in: window.__in, paint: window.__paint, frame: window.__frame, lt: window.__lt })",
  )) as {
    in: Record<string, number>;
    paint: Record<string, number>;
    frame: number[];
    lt: number[];
  };
}

async function probe(page: Page, sel: string, queries: string[]) {
  const perKey: number[] = [];
  const settled: number[] = [];
  const frames: number[] = [];
  const lts: number[] = [];
  let missed = 0;
  for (const q of queries) {
    const a = await typeQuery(page, sel, q, 300);
    for (let i = 2; i <= q.length; i++) {
      const v = q.slice(0, i);
      if (v.trim().length < 2 || v !== v.trimEnd()) continue;
      const p = a.paint[v];
      if (p && p > 0 && a.in[v] !== undefined) perKey.push(p - a.in[v]!);
      else missed++;
    }
    frames.push(...a.frame);
    lts.push(...a.lt);
    const b = await typeQuery(page, sel, q, 60);
    const p = b.paint[q];
    if (p && p > 0 && b.in[q] !== undefined) settled.push(p - b.in[q]!);
    frames.push(...b.frame);
    lts.push(...b.lt);
  }
  return {
    keyToPaint: {
      p50: r(pct(perKey, 0.5)),
      p95: r(pct(perKey, 0.95)),
      max: r(Math.max(...perKey)),
      n: perKey.length,
      missed,
    },
    settled: { p50: r(pct(settled, 0.5)), max: r(Math.max(...settled)) },
    inputToFrame: { p95: r(pct(frames, 0.95)), max: r(Math.max(...frames)) },
    longTasks: { n: lts.length, max: r(Math.max(0, ...lts)), total: r(lts.reduce((x, y) => x + y, 0)) },
  };
}

const QUERIES = (process.env.QUERIES ?? "pugliese,di sarli 1941,la cumparsita,fiorentino troilo,tango").split(
  ",",
);

async function run(name: string, ctxOpts: BrowserContextOptions, cpu: number) {
  const browser = await chromium.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] });
  const ctx = await browser.newContext(ctxOpts);
  await ctx.addInitScript(INSTRUMENT);
  const page = await ctx.newPage();
  // warm the server's index first (its one-off build is not what a keystroke costs)
  await page.request.post(`${URL}/api/search`, { data: { q: "warm", limit: 1 } }).catch(() => {});
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  const out: Record<string, unknown> = { run: name, cpu };
  // server round trips while typing (the browser's index, once ready, makes none)
  let posts = 0;
  ctx.on("request", (r) => {
    if (r.method() === "POST" && new globalThis.URL(r.url()).pathname === "/api/search") posts++;
  });
  const ready = async () => {
    const t = Date.now();
    // the browser's index (lib/localSearch.ts marks <html data-search="ready">); a build without one: the timeout
    await page
      .waitForFunction("/ready|off/.test(document.documentElement.dataset.search || '')", null, {
        timeout: Number(process.env.READY_MS ?? 30_000),
      })
      .catch(() => {});
    return Date.now() - t;
  };
  for (const [key, path, sel, qs] of [
    ["library", "/library", "#library-search", QUERIES],
    ["database", "/database", "#db-search", QUERIES.slice(0, 3)],
  ] as const) {
    const t0 = Date.now();
    await page.goto(`${URL}${path}`, { waitUntil: "load" });
    const load = Date.now() - t0;
    const indexReady = await ready();
    await page.waitForTimeout(1000);
    posts = 0;
    out[key] = { load, indexReady, ...(await probe(page, sel, [...qs])), serverRequests: posts };
  }
  console.log(JSON.stringify(out));
  await browser.close();
}

void (async () => {
  if (process.env.RUN !== "iphone") await run("desktop", { viewport: { width: 1440, height: 900 } }, 1);
  if (process.env.RUN !== "desktop") await run("iphone-4x", { ...devices["iPhone 15 Pro"] }, 4);
})();
