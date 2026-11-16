/**
 * Store creative v2, step 1: raw captures of the bundled app UI (ui/dist) at each capture device's own size, in each
 * locale, with the native side mocked (../tauri-mock.ts) and the device's safe areas emulated.
 * Output: store/out/creative/raw/<capture>/<locale>/<shot>.png (and <shot>-full.png for the previews).
 * One browser, one static server (PORT, default 3986), one context at a time (two for the Rooms shots).
 * Flags: --captures=phone,mac  --shots=booth,rooms  --locales=tr
 */
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Browser, type BrowserContext, chromium, type Page } from "playwright";
import { run } from "../capture";
import { startPreview } from "../serve";
import { installTauriMock } from "../tauri-mock";
import { tangoBed, wav } from "./audio";
import { LINKED, RoomServer } from "./rooms";
import { CAPTURE, type CaptureId, LOCALES, type Locale, SHOTS, type Shot } from "./spec";

/**
 * Lyrics are someone else's words: a store picture never shows a song's full lyrics. The Floor screen shows two lines
 * (the line now and the next one), which stays; every other lyrics block (Now playing, song details) is blurred past
 * reading, so the layout still shows where the lyrics are.
 */
export const LYRICS_CSS =
  "[data-testid=song-lyrics-text],[data-testid=lyrics-candidate-text]{filter:blur(7px)!important;user-select:none}" +
  ".floor-lyrics p:nth-of-type(n+3){display:none!important}";

export const RAW = fileURLToPath(new URL("../out/creative/raw/", import.meta.url));
export const PORT = Number(process.env.PORT ?? 3986);

const UA = {
  phone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 27_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  tablet:
    "Mozilla/5.0 (iPad; CPU OS 27_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
};

/** the Booth's local clip (the mock's Deezer previews point at 127.0.0.1:9): the original bed of audio.ts, in mono, so
 * the transition editor draws the waveform of music */
const WAV = wav({ l: tangoBed(30, 22050, { fadeOut: 0.2 }).l }, 22050);

const arg = (k: string) =>
  process.argv
    .find((a) => a.startsWith(`--${k}=`))
    ?.split("=")[1]
    ?.split(",");

async function newContext(
  browser: Browser,
  id: CaptureId,
  locale: Locale,
  dark: boolean,
  rooms?: RoomServer,
): Promise<{ ctx: BrowserContext; page: Page }> {
  const d = CAPTURE[id];
  const ctx = await browser.newContext({
    viewport: { width: d.width, height: d.height },
    deviceScaleFactor: d.scale,
    hasTouch: d.touch,
    isMobile: d.touch,
    ...(d.ua ? { userAgent: UA[d.ua] } : {}),
    colorScheme: dark ? "dark" : "light",
    reducedMotion: "reduce",
    locale: locale === "tr" ? "tr-TR" : "en-US",
  });
  await installTauriMock(ctx, { platform: d.native, ...(rooms ? { linked: LINKED } : {}) });
  if (rooms) await rooms.attach(ctx);
  await ctx.route(/127\.0\.0\.1:9\/preview\//, (r) =>
    r.fulfill({ status: 200, contentType: "audio/wav", body: WAV }),
  );
  // first-run sounds off; no first-run tips over the screens
  await ctx.addInitScript(`(() => { try {
    if (sessionStorage.getItem("tdj-store-primed")) return;
    sessionStorage.setItem("tdj-store-primed", "1");
    const cur = JSON.parse(localStorage.getItem("tdj-v1") || "{}");
    const state = cur.state || {};
    state.settings = Object.assign({}, state.settings || {}, { sounds: false });
    localStorage.setItem("tdj-v1", JSON.stringify(Object.assign({ version: 4 }, cur, { state })));
  } catch (_) {} })();`);
  await ctx.addInitScript(`document.addEventListener("DOMContentLoaded", () => {
    const s = document.createElement("style");
    s.textContent = "[role=tooltip],.tip-bubble,[data-testid=tip-bubble],nextjs-portal{display:none!important}" + ${JSON.stringify(LYRICS_CSS)};
    document.head.appendChild(s);
  });`);
  const page = await ctx.newPage();
  const { safe } = d;
  if (safe.top || safe.bottom || safe.left || safe.right) {
    const cdp = await ctx.newCDPSession(page);
    await cdp
      .send("Emulation.setSafeAreaInsetsOverride" as never, { insets: safe } as never)
      .catch((e: Error) => console.warn(`  no safe-area emulation in this Chromium (${e.message})`));
  }
  return { ctx, page };
}

const base = () => `http://127.0.0.1:${PORT}`;

async function open(page: Page, path: string) {
  await page.goto(base() + path, { waitUntil: "load", timeout: 90000 });
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function shoot(page: Page, file: string, full = false) {
  await page.screenshot({ path: file, animations: "disabled" });
  // the previews pan down long pages on portrait screens only (a landscape frame already shows enough of it)
  const vp0 = page.viewportSize()!;
  if (full && vp0.height > vp0.width) {
    // the previews pan down the page: at most three screens of it
    const h = await page.evaluate(() =>
      Math.min(document.documentElement.scrollHeight, window.innerHeight * 3),
    );
    const vp = page.viewportSize()!;
    if (h > vp.height + 40) {
      await page.setViewportSize({ width: vp.width, height: h });
      await page.waitForTimeout(800);
      await page.screenshot({ path: file.replace(/\.png$/, "-full.png"), animations: "disabled" });
      await page.setViewportSize(vp);
    }
  }
}

const ROOM_WORDS: Record<Locale, { host: string; guest: string; name: string }> = {
  "en-US": { host: "Ana", guest: "Ben", name: "Saturday at Galata" },
  tr: { host: "Ayşe", guest: "Deniz", name: "Cumartesi, Galata" },
};

/** Two DJs in one room: the host composes and opens a room with the night, the guest joins and edits; both shot. */
async function roomShots(browser: Browser, id: CaptureId, locale: Locale, dir: string, want: Set<string>) {
  const server = new RoomServer();
  const w = ROOM_WORDS[locale];
  const host = await newContext(browser, id, locale, false, server);
  const T = (x: string) => `[data-testid="${x}"]`;
  await open(host.page, "/?featured=golden-double-peak");
  await run(host.page, [{ waitFor: "#result" }, { wait: 1200 }], `${id} ${locale} room host`);
  await open(host.page, "/rooms");
  await run(
    host.page,
    [
      { fill: T("room-user"), text: w.host },
      { fill: T("room-name"), text: w.name },
      { click: "#room-create" },
      { waitFor: T("room-tandas") },
      { wait: 800 },
    ],
    `${id} ${locale} room create`,
  );
  const code = [...server.rooms.keys()][0];
  const guest = await newContext(browser, id, locale, false, server);
  if (code) {
    await open(guest.page, `/rooms?join=${code}`);
    await run(
      guest.page,
      [
        { fill: T("room-user"), text: w.guest },
        { click: T("room-join") },
        { waitFor: T("room-tandas") },
        { wait: 600 },
        { click: T("room-skip-3") },
        { wait: 2500 },
      ],
      `${id} ${locale} room join`,
    );
    // the host sees the guest arrive and the edit
    await run(
      host.page,
      [{ click: T("room-down-2"), optional: true }, { wait: 3500 }],
      `${id} ${locale} room host edit`,
    );
    await run(
      guest.page,
      [{ click: "role=radio[name=/^(Log|Kayıt|Günlük)/]", optional: true }, { wait: 3000 }],
      `${id} ${locale} room log`,
    );
  } else console.warn(`  ${id} ${locale}: no room was made (the linked server got no request)`);
  // the host's edit can leave the page scrolled: both screens from the top, the room's name and its DJs in view
  for (const p of [host.page, guest.page]) await p.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await host.page.waitForTimeout(600);
  if (want.has("rooms")) await shoot(host.page, `${dir}/rooms.png`);
  if (want.has("rooms-guest")) await shoot(guest.page, `${dir}/rooms-guest.png`);
  console.log(`captured ${id} ${locale} rooms, rooms-guest`);
  await guest.ctx.close();
  await host.ctx.close();
}

export async function capture(o: { captures: CaptureId[]; shots?: string[]; locales?: Locale[] }) {
  const locales = o.locales ?? LOCALES;
  const server = await startPreview(PORT);
  const exe = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium";
  const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ["--no-sandbox"] });
  try {
    for (const id of o.captures) {
      for (const locale of locales) {
        const dir = `${RAW}${id}/${locale}`;
        mkdirSync(dir, { recursive: true });
        const list: Shot[] = SHOTS.filter((s) => !o.shots || o.shots.includes(s.id));
        const roomWant = new Set(list.filter((s) => s.room).map((s) => s.id));
        for (const shot of list.filter((s) => !s.room)) {
          // one retry: a renderer that runs out of memory on a busy machine crashes the page, not the run
          for (let attempt = 1; attempt <= 2; attempt++) {
            const { ctx, page } = await newContext(browser, id, locale, !!shot.dark);
            try {
              await open(page, shot.path);
              await run(page, shot.stepsFor?.[id] ?? shot.steps ?? [], `${id} ${locale} ${shot.id}`);
              await shoot(page, `${dir}/${shot.id}.png`, shot.full);
              console.log(`captured ${id} ${locale} ${shot.id}`);
              break;
            } catch (e) {
              if (attempt === 2) throw e;
              console.warn(`  ${id} ${locale} ${shot.id}: ${(e as Error).message.split("\n")[0]}; once more`);
            } finally {
              await ctx.close().catch(() => {});
            }
          }
        }
        if (roomWant.size) await roomShots(browser, id, locale, dir, roomWant);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  capture({
    captures: (arg("captures") as CaptureId[] | undefined) ?? (Object.keys(CAPTURE) as CaptureId[]),
    shots: arg("shots"),
    locales: arg("locales") as Locale[] | undefined,
  }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
