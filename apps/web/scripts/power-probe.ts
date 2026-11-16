/**
 * Battery saver probe (lib/power.ts): where the page's power goes during a long night.
 * Drives a production build with Playwright's Chromium and, for each scene and saver mode, records over a window:
 * - CDP `Performance.getMetrics` deltas: script, layout, style recalc and task time (CPU ms per minute);
 * - a CDP sampling profile (`Profiler`, 1 ms): self time by function and script position (the top consumers);
 * - the page's own counts: requestAnimationFrame callbacks and timer callbacks by the line that asked for them,
 *   requests by path, running animations, elements with a backdrop filter;
 * - a short `devtools.timeline` trace (15 s): paint, raster and composite time.
 *
 * Scenes: `booth` — the featured night playing through Spotify Connect (a mocked Web API on an iPad viewport, the
 * slider, the clock, the polls); `compose` — the Compose page idle after a compose.
 *
 *   pnpm build && PORT=3985 pnpm start &
 *   TDJ_URL=http://localhost:3985 PROBE_MIN=10 pnpm --filter @tdj/web exec tsx scripts/power-probe.ts booth off
 */
import { writeFileSync } from "node:fs";
import { type BrowserContextOptions, chromium, devices, type Page } from "@playwright/test";

const URL = process.env.TDJ_URL ?? "http://localhost:3985";
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium";
const MIN = Number(process.env.PROBE_MIN ?? 10);
const scene = (process.argv[2] ?? "booth") as "booth" | "compose";
const mode = (process.argv[3] ?? "off") as "off" | "on";
const out = process.argv[4];

/* the page's counters: installed before any script (evaluate bodies are strings: tsx's helpers are not in the page) */
const COUNTERS = `(() => {
  const w = window;
  w.__probe = { raf: {}, timer: {}, req: {}, rafN: 0, timerN: 0 };
  const site = () => {
    const s = (new Error().stack || '').split('\\n');
    // [0] Error, [1] site(), [2] the wrapper, [3] the caller
    return (s[3] || '').trim().replace(/^at /, '').replace(location.origin, '');
  };
  const raf = w.requestAnimationFrame.bind(w);
  w.requestAnimationFrame = (cb) => { const k = site(); return raf((t) => { w.__probe.rafN++; w.__probe.raf[k] = (w.__probe.raf[k] || 0) + 1; cb(t); }); };
  const wrapT = (name) => {
    const orig = w[name].bind(w);
    w[name] = (cb, ms, ...a) => {
      if (typeof cb !== 'function') return orig(cb, ms, ...a);
      const k = name + ' ' + (ms || 0) + ' ' + site();
      return orig((...x) => { w.__probe.timerN++; w.__probe.timer[k] = (w.__probe.timer[k] || 0) + 1; cb(...x); }, ms, ...a);
    };
  };
  wrapT('setTimeout');
  wrapT('setInterval');
  const f = w.fetch.bind(w);
  w.fetch = (i, o) => {
    try {
      const u = new URL(typeof i === 'string' ? i : i.url, location.href);
      const k = ((o && o.method) || (i && i.method) || 'GET') + ' ' + u.host + u.pathname;
      w.__probe.req[k] = (w.__probe.req[k] || 0) + 1;
    } catch {}
    return f(i, o);
  };
})();`;

function wav(sec = 30): Buffer {
  const rate = 8000;
  const n = rate * sec;
  const data = Buffer.alloc(n * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

/** a Connect account whose iPad plays what the Booth asks (as e2e/booth-cue-stop.spec.ts) */
async function spotify(page: Page) {
  const st = { uri: null as string | null, playing: false, posMs: 0, startedAt: 0 };
  const progress = () => (st.playing ? st.posMs + (Date.now() - st.startedAt) : st.posMs);
  await page.route("**/api/spotify/me", (r) =>
    r.fulfill({
      json: {
        hosted: true,
        user: { id: "probe", display_name: "Probe", product: "premium" },
        token: { access: "probe-token", expires: Date.now() + 3_600_000 },
        scopes: ["streaming", "user-modify-playback-state", "user-read-playback-state", "user-read-private"],
      },
    }),
  );
  await page.route("**/api/spotify/access", (r) => r.fulfill({ json: { access: "probe-token" } }));
  await page.route("https://sdk.scdn.co/**", (r) => r.fulfill({ status: 404, body: "" }));
  await page.route(/open\.spotify\.com\/oembed/, (r) => r.fulfill({ status: 404, body: "" }));
  await page.route("https://api.spotify.com/**", (r) => {
    const u = new globalThis.URL(r.request().url());
    const method = r.request().method();
    const path = u.pathname.replace("/v1", "");
    const device = { id: "ipad", name: "iPad", type: "Tablet", is_active: true, is_restricted: false };
    if (method === "GET" && path === "/me/player/devices")
      return r.fulfill({ json: { devices: [{ ...device, supports_volume: true, volume_percent: 80 }] } });
    if (method === "GET" && path === "/me/player") {
      if (!st.uri) return r.fulfill({ status: 204, body: "" });
      return r.fulfill({
        json: {
          is_playing: st.playing,
          progress_ms: progress(),
          item: { uri: st.uri, duration_ms: 1_000_000 },
          device: { ...device, supports_volume: true, volume_percent: 80 },
        },
      });
    }
    if (method === "PUT" && path === "/me/player/play") {
      const body = r.request().postDataJSON() as { uris?: string[]; position_ms?: number } | null;
      st.uri = body?.uris?.[0] ?? st.uri;
      st.playing = true;
      st.posMs = Number(body?.position_ms ?? 0);
      st.startedAt = Date.now();
    } else if (method === "PUT" && path === "/me/player/pause") {
      st.posMs = progress();
      st.playing = false;
    }
    return r.fulfill({ status: 204, body: "" });
  });
  const WAV = wav();
  await page.route(/dzcdn\.net|p\.scdn\.co|preview\.test|\/api\/preview\?/, (route) =>
    route.fulfill({ status: 200, contentType: "audio/wav", body: WAV }),
  );
}

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROMIUM,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"],
  });
  const { defaultBrowserType: _b, ...ipad } = devices["iPad Pro 11 landscape"]!;
  const ctxOpts: BrowserContextOptions =
    scene === "booth"
      ? {
          ...ipad,
          viewport: { width: 1180, height: 820 },
          userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        }
      : { viewport: { width: 1440, height: 900 } };
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  await page.addInitScript(`try{localStorage.setItem("tdj-power", ${JSON.stringify(mode)})}catch(e){}`);
  await page.addInitScript(COUNTERS);
  if (scene === "booth") {
    await page.addInitScript(() =>
      Object.defineProperty(Navigator.prototype, "maxTouchPoints", { get: () => 5 }),
    );
    await spotify(page);
  }
  await page.goto(`${URL}/?featured=golden-double-peak`);
  await page.locator("#result").waitFor({ timeout: 120_000 });
  if (scene === "booth") {
    await page.getByTestId("play-the-night").first().click();
    await page.waitForURL(/\/booth/, { timeout: 60_000 });
    await page.getByTestId("booth-now-title").waitFor({ timeout: 30_000 });
    await page.getByTestId("booth-start").click();
    await page.waitForFunction(
      () =>
        (window as unknown as { __tdjBooth: { getState: () => { state: string } } }).__tdjBooth?.getState()
          .state === "playing",
      undefined,
      { timeout: 30_000 },
    );
  }
  await page.waitForTimeout(10_000);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 1000 });
  const metrics = async () =>
    Object.fromEntries(
      (
        (await cdp.send("Performance.getMetrics")) as { metrics: Array<{ name: string; value: number }> }
      ).metrics.map((m) => [m.name, m.value]),
    ) as Record<string, number>;
  await page.evaluate(
    "(() => { const p = window.__probe; p.raf = {}; p.timer = {}; p.req = {}; p.rafN = 0; p.timerN = 0; })()",
  );
  const m0 = await metrics();
  await cdp.send("Profiler.start");
  const ms = MIN * 60_000;
  // the last 15 s also go into a timeline trace (paint / raster / composite)
  await page.waitForTimeout(Math.max(0, ms - 15_000));
  await browser.startTracing(page, {
    categories: ["devtools.timeline", "disabled-by-default-devtools.timeline"],
  });
  await page.waitForTimeout(Math.min(ms, 15_000));
  const trace = JSON.parse((await browser.stopTracing()).toString()) as {
    traceEvents: Array<{ name: string; dur?: number; ph: string }>;
  };
  const prof = (await cdp.send("Profiler.stop")) as {
    profile: {
      nodes: Array<{
        id: number;
        callFrame: { functionName: string; url: string; lineNumber: number; columnNumber: number };
      }>;
      samples: number[];
      timeDeltas: number[];
    };
  };
  const m1 = await metrics();
  const probe = (await page.evaluate("window.__probe")) as {
    raf: Record<string, number>;
    timer: Record<string, number>;
    req: Record<string, number>;
    rafN: number;
    timerN: number;
  };
  const extra = (await page.evaluate(`(() => ({
    animations: document.getAnimations().filter((a) => a.playState === 'running').length,
    backdrop: [...document.querySelectorAll('*')].filter((e) => [e, ':before', ':after'].some((p) => {
      const s = p === e ? getComputedStyle(e) : getComputedStyle(e, p);
      return s.backdropFilter && s.backdropFilter !== 'none';
    })).length,
    saver: document.documentElement.classList.contains('power-saver'),
  }))()`)) as { animations: number; backdrop: number; saver: boolean };

  // self time per function position
  const byNode = new Map(prof.profile.nodes.map((n) => [n.id, n]));
  const self = new Map<string, number>();
  let total = 0;
  prof.profile.samples.forEach((id, i) => {
    const n = byNode.get(id)!;
    const dt = prof.profile.timeDeltas[i] ?? 0;
    const f = n.callFrame;
    const key = f.url
      ? `${f.functionName || "(anon)"} ${f.url.replace(URL, "")}:${f.lineNumber + 1}:${f.columnNumber + 1}`
      : f.functionName;
    self.set(key, (self.get(key) ?? 0) + dt);
    total += dt;
  });
  const perMin = (v: number) => Math.round((v / MIN) * 10) / 10;
  const sec = (k: string) => Math.round(((m1[k] ?? 0) - (m0[k] ?? 0)) * 1000);
  const busy = [...self.entries()].filter(([k]) => k !== "(idle)" && k !== "(program)");
  const top = (o: Record<string, number>, n = 12) =>
    Object.entries(o)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k, v]) => ({ site: k, perMin: perMin(v) }));
  const tr = (names: string[]) =>
    Math.round(
      trace.traceEvents
        .filter((e) => names.includes(e.name) && e.ph === "X")
        .reduce((a, e) => a + (e.dur ?? 0), 0) / 1000,
    );
  const result = {
    scene,
    mode,
    minutes: MIN,
    saverClass: extra.saver,
    cpuMsPerMin: {
      task: perMin(sec("TaskDuration")),
      script: perMin(sec("ScriptDuration")),
      layout: perMin(sec("LayoutDuration")),
      style: perMin(sec("RecalcStyleDuration")),
      profiledBusy: perMin(busy.reduce((a, [, v]) => a + v, 0) / 1000),
    },
    rafPerMin: perMin(probe.rafN),
    timersPerMin: perMin(probe.timerN),
    requestsPerMin: perMin(Object.values(probe.req).reduce((a, b) => a + b, 0)),
    requests: top(probe.req),
    rafSites: top(probe.raf),
    timerSites: top(probe.timer),
    profileTop: busy
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([k, v]) => ({ fn: k, msPerMin: perMin(v / 1000) })),
    trace15s: {
      paintMs: tr(["Paint", "PaintImage"]),
      rasterMs: tr(["RasterTask", "Rasterize"]),
      compositeMs: tr(["CompositeLayers", "UpdateLayerTree", "Layerize"]),
      styleLayoutMs: tr(["UpdateLayoutTree", "Layout"]),
      frames: trace.traceEvents.filter((e) => e.name === "DrawFrame" || e.name === "BeginMainThreadFrame")
        .length,
    },
    runningAnimations: extra.animations,
    backdropElements: extra.backdrop,
    profiledMs: Math.round(total / 1000),
  };
  const s = JSON.stringify(result, null, 2);
  if (out) writeFileSync(out, s);
  console.log(s);
  await browser.close();
}
void main();
