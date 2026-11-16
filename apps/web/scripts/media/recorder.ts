/**
 * A Screen-Studio-style recorder for the README clips. The page is filmed with CDP `Page.startScreencast` (every
 * compositor frame, with its own timestamp) instead of Playwright's recordVideo, and every pointer move is an eased
 * path we plan ourselves. The recorder writes two things per clip:
 *
 * - `<name>.mp4`: the raw frames at 60 fps (each frame held until the next one arrived), at 2× pixels;
 * - `<name>.json`: the cursor path, the clicks, the focus points and the compressed waits, in CSS px and clip ms.
 *
 * apps/video (Remotion, composition "Clip") then draws the cursor, the click ripples, the gentle zoom, the rounded
 * window and the brand background over the raw video. Nothing here draws on the page itself.
 *
 * Slow motion: a software-rendered Chromium paints 2× frames at ~15 fps. So while recording, the page runs `SLOW`
 * times slower (CSS and Web Animations through CDP, and the page's clocks, rAF and timers through `installWarp`),
 * our own glides, scrolls and typing are `SLOW` times longer, and every timestamp is divided by `SLOW` again: the
 * clip plays at real speed with ~4× the frames.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import type { BrowserContext, CDPSession, Locator, Page } from "playwright";
import { ffmpegPath } from "./ffmpeg";

export type Pt = { x: number; y: number };
export type Track = {
  name: string;
  kind: "desktop" | "tablet" | "phone";
  pointer: "mouse" | "touch";
  width: number;
  height: number;
  durationMs: number;
  /** cursor samples, about every 1000/60 ms of clip time */
  cursor: Array<{ t: number; x: number; y: number }>;
  clicks: Array<{ t: number; x: number; y: number }>;
  /** where the camera should look from t on (zoom 1 = the whole window) */
  focus: Array<{ t: number; x: number; y: number; zoom: number }>;
  /** waits that play back compressed: clip ms from..to lasts `keep` ms */
  cuts: Array<{ from: number; to: number; keep: number }>;
  /** a second recording shown beside this one (two DJs in a room) */
  pair?: string;
  /** the page's background and colour scheme at the start: a phone frame's status bar takes them */
  bg?: string;
  dark?: boolean;
};

export const SLOW = Number(process.env.MEDIA_SLOWMO ?? 4);
const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The page's clocks, rAF timestamps and timers, scaled by a factor the recorder sets (1 = real time). Installed on
 * the context before any page loads, so the app's animation loops read the warped clock from their first frame.
 */
export async function installWarp(ctx: BrowserContext) {
  // a string, not a function: tsx would wrap the inner arrows in an esbuild `__name` helper the page lacks
  await ctx.addInitScript(WARP);
}
const WARP = `(() => {
  if (window.__tdjSetWarp) return;
  const pnow = performance.now.bind(performance);
  const raf = window.requestAnimationFrame.bind(window);
  const st = window.setTimeout.bind(window);
  const si = window.setInterval.bind(window);
  const origin = Date.now() - pnow();
  let s = 1;
  try { s = Number(sessionStorage.getItem("tdj-warp") || 1); } catch {}
  let rBase = pnow();
  let vBase = rBase;
  const v = (r) => vBase + (r - rBase) / s;
  performance.now = () => v(pnow());
  Date.now = () => Math.round(origin + v(pnow()));
  window.requestAnimationFrame = (cb) => raf((t) => cb(v(t)));
  window.setTimeout = (fn, d, ...a) => st(fn, (d || 0) * s, ...a);
  window.setInterval = (fn, d, ...a) => si(fn, (d || 0) * s, ...a);
  window.__tdjSetWarp = (n) => {
    const r = pnow();
    vBase = v(r);
    rBase = r;
    s = n;
    try { sessionStorage.setItem("tdj-warp", String(n)); } catch {}
  };
})();`;

export class Recorder {
  private cdp!: CDPSession;
  private frames: Array<{ ts: number; file: string }> = [];
  /** the real start (ms since epoch) */
  t0 = 0;
  private pos: Pt;
  private pending: Promise<unknown>[] = [];
  private zoom: number;
  private stopped = false;
  private slow: number;
  readonly track: Track;
  private dir: string;

  constructor(
    readonly page: Page,
    name: string,
    readonly outDir: string,
    opts: { kind?: Track["kind"]; pointer?: Track["pointer"]; zoom?: number; slow?: number; start?: Pt } = {},
  ) {
    const vp = page.viewportSize() ?? { width: 1280, height: 800 };
    this.pos = opts.start ?? { x: vp.width * 0.62, y: vp.height * 0.72 };
    this.zoom = opts.zoom ?? 1.45;
    this.slow = opts.slow ?? SLOW;
    this.track = {
      name,
      kind: opts.kind ?? "desktop",
      pointer: opts.pointer ?? "mouse",
      width: vp.width,
      height: vp.height,
      durationMs: 0,
      cursor: [],
      clicks: [],
      focus: [],
      cuts: [],
    };
    this.dir = `${outDir}/${name}.frames`;
  }

  /** clip time in ms */
  now() {
    return (Date.now() - this.t0) / this.slow;
  }
  /** real ms for `ms` of clip time */
  private real(ms: number) {
    return ms * this.slow;
  }

  private async warp(n: number) {
    await this.page.evaluate(
      (k) => (window as unknown as { __tdjSetWarp?: (k: number) => void }).__tdjSetWarp?.(k),
      n,
    );
    await this.cdp.send("Animation.enable").catch(() => {});
    await this.cdp.send("Animation.setPlaybackRate", { playbackRate: 1 / n }).catch(() => {});
  }

  async start() {
    rmSync(this.dir, { recursive: true, force: true });
    mkdirSync(this.dir, { recursive: true });
    this.cdp = await this.page.context().newCDPSession(this.page);
    const vp = this.page.viewportSize()!;
    let n = 0;
    this.cdp.on("Page.screencastFrame", (f) => {
      if (this.stopped) return;
      const file = `${this.dir}/${String(n++).padStart(5, "0")}.jpg`;
      this.frames.push({ ts: f.metadata.timestamp ?? Date.now() / 1000, file });
      writeFileSync(file, Buffer.from(f.data, "base64"));
      this.cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
    });
    // a page that navigates while recording keeps the slow motion (the warp itself rides in sessionStorage)
    this.page.on("framenavigated", (fr) => {
      if (fr === this.page.mainFrame() && !this.stopped)
        this.cdp.send("Animation.setPlaybackRate", { playbackRate: 1 / this.slow }).catch(() => {});
    });
    await this.warp(this.slow);
    // the screencast at the page's own pixels: 2× on a laptop or an iPad, 3× on a phone
    const dpr = await this.page.evaluate(() => window.devicePixelRatio || 2);
    const look = await this.page.evaluate(() => {
      const top = document.elementFromPoint(window.innerWidth / 2, 2) ?? document.body;
      let el: Element | null = top;
      let bg = "rgba(0, 0, 0, 0)";
      while (el && /rgba\(0, 0, 0, 0\)|transparent/.test(bg)) {
        bg = getComputedStyle(el).backgroundColor;
        el = el.parentElement;
      }
      return { bg, dark: matchMedia("(prefers-color-scheme: dark)").matches };
    });
    this.track.bg = look.bg;
    this.track.dark = look.dark;
    await this.cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: Number(process.env.MEDIA_JPEG_Q ?? 92),
      maxWidth: Math.round(vp.width * Math.max(2, dpr)),
      maxHeight: Math.round(vp.height * Math.max(2, dpr)),
      everyNthFrame: 1,
    });
    this.t0 = Date.now();
    this.sample();
    this.track.focus.push({ t: 0, x: vp.width / 2, y: vp.height / 2, zoom: 1 });
    await this.page.evaluate(() => document.body.getBoundingClientRect());
    await sleep(300);
  }

  /** a second recorder filmed alongside shares the first one's clock (and so its timeline) */
  alignTo(other: Recorder) {
    this.t0 = other.t0;
    this.track.cursor = [];
    this.sample();
  }

  private sample() {
    this.track.cursor.push({ t: this.now(), x: this.pos.x, y: this.pos.y });
  }

  /** hold still for `ms` of clip time, the cursor resting where it is */
  async wait(ms: number) {
    const end = Date.now() + this.real(ms);
    while (Date.now() < end) {
      this.sample();
      await sleep(Math.min(50, end - Date.now()));
    }
    this.sample();
  }

  /** an eased glide of the cursor to `to` (the real mouse follows, so hovers show) */
  async glide(to: Pt, ms = 700) {
    const from = { ...this.pos };
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const dur = this.real(Math.max(260, Math.min(ms, 280 + dist * 0.8)));
    // a slight arc, as a hand moves
    const bend = { x: -(to.y - from.y) * 0.08, y: (to.x - from.x) * 0.08 };
    const start = Date.now();
    for (;;) {
      const p = Math.min(1, (Date.now() - start) / dur);
      const e = ease(p);
      const arc = Math.sin(Math.PI * e);
      this.pos = {
        x: from.x + (to.x - from.x) * e + bend.x * arc,
        y: from.y + (to.y - from.y) * e + bend.y * arc,
      };
      this.sample();
      if (this.track.pointer === "mouse") await this.page.mouse.move(this.pos.x, this.pos.y);
      if (p >= 1) break;
      await sleep(16);
    }
  }

  /** run `fn` (a compose, a page load) and play the time it took back in `keep` ms */
  async fast<T>(fn: () => Promise<T>, keep = 700, also: Recorder[] = []): Promise<T> {
    const from = this.now();
    const sampler = setInterval(() => this.sample(), 50);
    try {
      return await fn();
    } finally {
      clearInterval(sampler);
      const to = this.now();
      if (to - from > keep + 100) for (const r of [this, ...also]) r.track.cuts.push({ from, to, keep });
    }
  }

  /** the camera looks at `at` (CSS px) from now on; null shows the whole window */
  focus(at: Pt | null, zoom = this.zoom) {
    const vp = this.page.viewportSize()!;
    this.track.focus.push(
      at
        ? { t: this.now(), x: at.x, y: at.y, zoom }
        : { t: this.now(), x: vp.width / 2, y: vp.height / 2, zoom: 1 },
    );
  }

  async centre(l: Locator): Promise<Pt> {
    await l.scrollIntoViewIfNeeded();
    const b = await l.boundingBox();
    if (!b) throw new Error(`no box for ${l}`);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }

  /** glide to the element and press it (a ripple in the composite); the camera follows unless `zoom: false` */
  async click(l: Locator, o: { zoom?: number | false; settle?: number; focusAt?: Pt } = {}) {
    const c = await this.centre(l);
    if (o.zoom !== false) this.focus(o.focusAt ?? c, o.zoom ?? this.zoom);
    await this.glide(c);
    await this.wait(90);
    this.track.clicks.push({ t: this.now(), ...c });
    if (this.track.pointer === "touch") await this.page.touchscreen.tap(c.x, c.y);
    else await l.click({ timeout: 10000 });
    await this.wait(o.settle ?? 300);
  }

  /** click into a field, then type it like a person */
  async type(l: Locator, text: string, o: { zoom?: number | false } = {}) {
    await this.click(l, { ...o, settle: 150 });
    for (const ch of text) {
      await this.page.keyboard.type(ch);
      await this.wait(34 + Math.random() * 40);
    }
    await this.wait(220);
  }

  /** a smooth scroll of whatever is under the cursor by dy, over ms of clip time */
  async scroll(dy: number, ms = 900) {
    // timed by the clock, not by the step count: a wheel event can take longer than a frame on a busy machine
    const dur = this.real(ms);
    const start = Date.now();
    let done = 0;
    for (;;) {
      const p = Math.min(1, (Date.now() - start) / dur);
      const want = Math.round(dy * ease(p));
      if (want !== done) await this.page.mouse.wheel(0, want - done);
      done = want;
      this.sample();
      if (p >= 1) break;
      await sleep(16);
    }
    await this.wait(100);
  }

  async stop(): Promise<Track> {
    await this.wait(150);
    await this.cdp.send("Page.stopScreencast");
    this.stopped = true;
    await this.warp(1).catch(() => {});
    await this.cdp.detach().catch(() => {});
    await Promise.all(this.pending);
    this.track.durationMs = this.now();
    const fr = this.frames;
    if (!fr.length) throw new Error(`${this.track.name}: no frames`);
    // frame times in clip seconds; the concat list holds each frame until the next
    const at = (ts: number) => (ts - this.t0 / 1000) / this.slow;
    const lines: string[] = [];
    for (let i = 0; i < fr.length; i++) {
      const start = i === 0 ? 0 : at(fr[i]!.ts);
      const end = i + 1 < fr.length ? at(fr[i + 1]!.ts) : this.track.durationMs / 1000;
      lines.push(`file '${fr[i]!.file}'`, `duration ${Math.max(0.0005, end - start).toFixed(5)}`);
    }
    lines.push(`file '${fr[fr.length - 1]!.file}'`);
    writeFileSync(`${this.dir}/list.txt`, lines.join("\n"));
    execFileSync(ffmpegPath(), [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      `${this.dir}/list.txt`,
      "-vf",
      "fps=60,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "16",
      "-threads",
      "2",
      `${this.outDir}/${this.track.name}.mp4`,
    ]);
    writeFileSync(`${this.outDir}/${this.track.name}.json`, JSON.stringify(this.track));
    const secs = this.track.durationMs / 1000;
    const gaps = fr
      .slice(1)
      .map((f, i) => at(f.ts) - at(fr[i]!.ts))
      .filter((g) => g < 0.1)
      .sort((a, b) => a - b);
    const med = gaps[Math.floor(gaps.length / 2)] ?? 1;
    console.log(
      `  ${this.track.name}: ${fr.length} frames, ${secs.toFixed(1)} s of clip; while moving ≈ ${(1 / med).toFixed(0)} fps`,
    );
    rmSync(this.dir, { recursive: true, force: true });
    return this.track;
  }
}
