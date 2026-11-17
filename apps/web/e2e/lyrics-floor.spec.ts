/**
 * 2026-11 — the owner: "lyrics are not matched with the playing song in real time … I should be able to jump the song
 * from the lyrics by clicking a lyric … from Compose, Booth, Database and Library"; Now playing ("Song info should show
 * without closing Now playing"); the dancers' Floor screen ("it should mirror on other screens while the main laptop
 * screen stays on the Booth tab"). LRCLIB and the previews are mocked (a 120 s recording, so its seconds are the
 * recording's), no live network.
 */
import { expect, type Locator, type Page, test } from "@playwright/test";

/** a 120 s mono tone at 8 kHz: a full-length "recording" (a 30 s clip would have no recording clock) */
function wav(sec = 120): Buffer {
  const rate = 8000;
  const n = rate * sec;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++)
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 0.1 * 32767), i * 2);
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
const WAV = wav();
/** the Booth decodes many previews for a night: a short, light clip there (its seconds are a clip's anyway) */
const CLIP = wav(30);
const LRC = [
  "[00:01.00] Uno",
  "[00:03.00] Dos",
  "[00:05.00] Tres",
  "[00:07.00] Cuatro",
  "[00:09.00] Cinco",
  "[00:20.00] Seis",
  "[00:40.00] Siete",
].join("\n");

async function mocks(page: Page, o: { clip?: boolean } = {}) {
  const body = o.clip ? CLIP : WAV;
  await page.addInitScript(() => {
    try {
      localStorage.removeItem("tdj-lyrics-v2");
      localStorage.removeItem("tdj-lyrics-own-v1");
      localStorage.removeItem("tdj-song-marks-v1");
    } catch {}
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
    // a headphones output the Booth may pick (setSinkId accepted)
    Object.defineProperty(HTMLMediaElement.prototype, "setSinkId", {
      configurable: true,
      value: () => Promise.resolve(),
    });
  });
  await page.route("https://lrclib.net/**", (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.endsWith("/api/get")) return r.fulfill({ status: 404, body: "" });
    const title = u.searchParams.get("track_name") ?? "";
    const artist = u.searchParams.get("artist_name") ?? "";
    if (!title) return r.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify([
        {
          id: 7,
          trackName: title,
          artistName: artist || "Orquesta",
          duration: null,
          syncedLyrics: LRC,
          plainLyrics: "x",
        },
      ]),
    });
  });
  await page.route(/dzcdn\.net|p\.scdn\.co|preview\.test|\/api\/preview\?/, (route) => {
    if (route.request().url().includes("json=1"))
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: "https://preview.test/clip.wav" }),
      });
    const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range ?? "");
    const base = { "access-control-allow-origin": "*", "accept-ranges": "bytes" };
    if (!range) return route.fulfill({ status: 200, contentType: "audio/wav", body, headers: base });
    const from = Number(range[1]);
    const to = range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
    return route.fulfill({
      status: 206,
      contentType: "audio/wav",
      body: body.subarray(from, to + 1),
      headers: { ...base, "content-range": `bytes ${from}-${to}/${body.length}` },
    });
  });
  await page.route(/\/api\/resolve$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        candidates: [
          {
            provider: "deezer",
            id: "123",
            title: "x",
            artist: "",
            previewUrl: "https://preview.test/clip.wav",
            confidence: 0.9,
          },
        ],
        suggestions: {},
      }),
    }),
  );
  await page.route(/\/api\/spotify\/me/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: '{"hosted":false,"user":null}' }),
  );
  await page.route(/open\.spotify\.com\/oembed/, (r) => r.fulfill({ status: 404, body: "" }));
}

const audio = (page: Page) =>
  page.evaluate(() => {
    const a = document.querySelector<HTMLAudioElement>("audio");
    return a ? { paused: a.paused, at: a.currentTime } : null;
  });

/** the sheet's lyrics: the side's work lyrics when it is an instrumental recording */
async function lyricsIn(sheet: Locator) {
  const anyway = sheet.getByTestId("song-lyrics-anyway");
  if (await anyway.isVisible().catch(() => false)) await anyway.click();
  const box = sheet.getByTestId("song-lyrics-text");
  await expect(box.locator("[data-line]")).toHaveCount(7, { timeout: 20000 });
  return box;
}

/** play from a line in the mini player; the lines advance in time; a tap on line 5 jumps to its second */
async function followAndJump(page: Page, sheet: Locator) {
  const box = await lyricsIn(sheet);
  // (a Database row plays on its tap: the details may open on a side already playing — a line then seeks)
  await expect(sheet.getByTestId("song-lyrics-follow")).toHaveAttribute(
    "data-state",
    /^(idle|follow:player)$/,
  );
  // not playing: a tap starts it at that line (the mini player)
  await box.locator('[data-line="0"]').click();
  await expect.poll(async () => (await audio(page))?.paused, { timeout: 15000 }).toBe(false);
  await expect(sheet.getByTestId("song-lyrics-follow")).toHaveAttribute("data-state", "follow:player", {
    timeout: 15000,
  });
  // the line follows the music in real time: from Uno (1 s) on to Dos (3 s)
  await expect(box).toHaveAttribute("data-current-line", /^[01]$/, { timeout: 10000 });
  await expect(box).toHaveAttribute("data-current-line", "1", { timeout: 10000 });
  // a tap on line 5 ("Seis", 20 s): the player jumps there, the line with it
  await box.locator('[data-line="5"]').click();
  await expect.poll(async () => (await audio(page))?.at ?? 0, { timeout: 10000 }).toBeGreaterThan(19.5);
  expect((await audio(page))!.at).toBeLessThan(26);
  await expect(box).toHaveAttribute("data-current-line", "5", { timeout: 5000 });
  await expect(box.locator('[data-line="5"]')).toHaveAttribute("data-current", "true");
  // the keyboard: ↓ moves to the next line, Enter plays from it
  await box.locator('[data-line="5"]').focus();
  await page.keyboard.press("ArrowUp");
  await expect(box.locator('[data-line="4"]')).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await audio(page))?.at ?? 99, { timeout: 10000 }).toBeLessThan(12);
  await expect(box).toHaveAttribute("data-current-line", "4", { timeout: 5000 });
  // the ±0.5 s shift is saved per side
  await sheet.getByTestId("song-lyrics-later").click();
  await expect(sheet.getByTestId("song-lyrics-offset")).toContainText("+0.5");
}

test.describe.configure({ timeout: 240_000 });

test("Library: lyrics follow the mini player, a tapped line plays from there", async ({ page }) => {
  await mocks(page);
  await page.goto("/library");
  await page.locator("#library-search").first().fill("malena troilo");
  const row = page.getByTestId("library-row").filter({ hasText: "Malena" }).first();
  await expect(row).toBeVisible({ timeout: 30000 });
  await row.getByTestId("song-info").click();
  await followAndJump(page, page.getByTestId("song-details-sheet"));
});

test("Compose: the details sheet behaves the same", async ({ page }) => {
  await mocks(page);
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 120000 });
  await page
    .getByRole("button", { name: /^Track \d+ actions$/ })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Song details" }).click();
  await followAndJump(page, page.getByTestId("song-details-sheet"));
});

test("Database: the details sheet behaves the same", async ({ page }) => {
  await mocks(page);
  await page.goto("/database");
  await page.getByLabel("Search the index").fill("malena troilo");
  const row = page.getByTestId("db-song-row").first();
  await expect(row).toBeVisible({ timeout: 30000 });
  await row.click();
  await page.getByTestId("db-song-details").first().click();
  await followAndJump(page, page.getByTestId("song-details-sheet"));
});

type BoothWin = {
  __tdjBooth: {
    getState: () => {
      state: string;
      started: boolean;
      planIndex: number;
      audition: { where: string; songId: string } | null;
      cuePos: { at: number; of: number };
      plan: { items: Array<{ kind: string; id?: string; tanda: number }> };
      outputs: Record<string, unknown>;
      nextNow: () => Promise<void>;
      playNow: (i: number) => Promise<void>;
      stopAudition: () => void;
    };
    setState: (s: Record<string, unknown>) => void;
  };
};
const booth = <T>(page: Page, f: (b: BoothWin["__tdjBooth"]) => T) =>
  page.evaluate((src) => {
    const b = (window as unknown as BoothWin).__tdjBooth;
    return new Function("b", `return (${src})(b)`)(b);
  }, f.toString()) as Promise<T>;

async function toBooth(page: Page) {
  await mocks(page, { clip: true });
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 120000 });
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/, { timeout: 60000 });
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 30000 });
}

/** the first song row after `from` (not a cortina, not a break) */
const songRow = (page: Page, from: number) =>
  booth(page, (b) => {
    const s = b.getState();
    return s.plan.items.findIndex(
      (x, i) => i > (globalThis as unknown as { __from: number }).__from && x.kind === "track",
    );
  }).catch(() => -1) as Promise<number>;

test("the Booth: before the night a tapped line pre-listens from there; mid-night the room asks first, headphones play", async ({
  page,
}) => {
  await toBooth(page);
  // before the night: the sheet of the playhead's song; a line pre-listens from its second (no headphones: this device)
  await page.getByTestId("booth-now-info").click();
  const sheet = page.getByTestId("booth-play-sheet");
  const box = await lyricsIn(sheet);
  await box.locator('[data-line="5"]').click();
  await expect
    .poll(() => booth(page, (b) => b.getState().audition?.where ?? null), { timeout: 15000 })
    .toBe("device");
  await expect.poll(() => booth(page, (b) => b.getState().cuePos.at), { timeout: 15000 }).toBeGreaterThan(19);
  await booth(page, (b) => b.getState().stopAudition());
  await page.keyboard.press("Escape");

  // the night starts
  await page.getByTestId("booth-start").click();
  await expect.poll(() => booth(page, (b) => b.getState().state), { timeout: 30000 }).toBe("playing");
  await page.evaluate(() => {
    (globalThis as unknown as { __from: number }).__from = (
      window as unknown as BoothWin
    ).__tdjBooth.getState().planIndex;
  });
  const target = await songRow(page, 0);
  expect(target).toBeGreaterThan(0);
  // mid-night, no headphones: a tonight's row asks to play in the room first
  await page.locator(`[data-plan-index="${target}"]`).first().click();
  const sheet2 = page.getByTestId("booth-play-sheet");
  const box2 = await lyricsIn(sheet2);
  await box2.locator('[data-line="5"]').click();
  await expect(sheet2.getByTestId("song-lyrics-confirm")).toBeVisible();
  expect(await booth(page, (b) => b.getState().planIndex)).not.toBe(target);
  await sheet2.getByTestId("song-lyrics-confirm-room").click();
  await expect.poll(() => booth(page, (b) => b.getState().planIndex), { timeout: 20000 }).toBe(target);

  // with headphones chosen: a line of another row pre-listens there, the room untouched (the sheet first: a row's
  // tap itself pre-listens once headphones are chosen)
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    (globalThis as unknown as { __from: number }).__from = (
      window as unknown as BoothWin
    ).__tdjBooth.getState().planIndex;
  });
  const other = await songRow(page, 0);
  await page.locator(`[data-plan-index="${other}"]`).first().click();
  const box3 = await lyricsIn(page.getByTestId("booth-play-sheet"));
  await booth(page, (b) =>
    b.setState({
      outputs: {
        ...b.getState().outputs,
        cueSupported: true,
        room: "default",
        cue: "pods",
        devices: [
          { id: "default", label: "Speakers", groupId: "g1" },
          { id: "pods", label: "AirPods", groupId: "g2" },
        ],
      },
    }),
  );
  await box3.locator('[data-line="5"]').click();
  await expect
    .poll(() => booth(page, (b) => b.getState().audition?.where ?? null), { timeout: 15000 })
    .toBe("headphones");
  expect(await booth(page, (b) => b.getState().planIndex)).toBe(target);
});

test("Now playing: Song info opens over it and closes back to it, still following; the beat is estimated", async ({
  page,
}) => {
  await toBooth(page);
  await page.getByTestId("booth-start").click();
  await expect.poll(() => booth(page, (b) => b.getState().state), { timeout: 30000 }).toBe("playing");
  await page.getByTestId("booth-now-full").click();
  const view = page.getByTestId("now-view");
  await expect(view).toBeVisible();
  await expect(view.getByTestId("now-place")).toBeVisible();
  // the rhythm tab: an estimated grid when nothing is measured
  await view.getByTestId("now-tab-rhythm").click();
  await expect(view.getByTestId("rhythm-lane")).toHaveAttribute("data-grid", /estimated|1/);
  await expect(view.getByTestId("rhythm-lane-foot")).toContainText(/Estimated|BPM/);
  await view.getByTestId("now-tab-lyrics").click();
  // Song info: a sheet over the view; Esc closes the sheet only
  await view.getByTestId("now-song-info").click();
  await expect(page.getByTestId("booth-play-sheet")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("booth-play-sheet")).toBeHidden();
  await expect(view).toBeVisible();
  const lyr = view.getByTestId("now-panel-lyrics");
  const anyway = lyr.getByTestId("song-lyrics-anyway");
  if (await anyway.isVisible().catch(() => false)) await anyway.click();
  await expect(lyr.getByTestId("song-lyrics-follow")).toHaveAttribute("data-state", /^(follow:booth|clip)$/, {
    timeout: 20000,
  });
  // Esc again closes Now playing; the night plays on
  await page.keyboard.press("Escape");
  await expect(view).toHaveCount(0);
  expect(await booth(page, (b) => b.getState().state)).toBe("playing");
});

test("the Floor screen: opened from the Booth, it follows the night (Song k of n, Next, the cortina)", async ({
  page,
  context,
}) => {
  await toBooth(page);
  await page.getByTestId("booth-start").click();
  await expect.poll(() => booth(page, (b) => b.getState().state), { timeout: 30000 }).toBe("playing");
  // go to the first song of a tanda
  const first = await booth(page, (b) => b.getState().plan.items.findIndex((x) => x.kind === "track"));
  await booth(page, (b) => {
    const s = b.getState();
    return s.playNow(s.plan.items.findIndex((x) => x.kind === "track"));
  });
  await expect.poll(() => booth(page, (b) => b.getState().planIndex), { timeout: 20000 }).toBe(first);
  await page.getByTestId("booth-more").click();
  const [screen] = await Promise.all([
    context.waitForEvent("page"),
    page.getByTestId("booth-menu-floor").click(),
  ]);
  await screen.waitForLoadState();
  await expect(screen.getByTestId("floor-screen")).toBeVisible();
  await expect(screen.getByTestId("floor-song-of")).toHaveText("Song 1 of 4", { timeout: 15000 });
  await expect(screen.getByTestId("floor-strip")).toHaveAttribute("data-stage", "invite");
  // (final QA) every stage pill's word meets WCAG AA on its own pill; the song playing now stands out (solid fill)
  await screen.waitForTimeout(800);
  const pills = await screen.getByTestId("floor-strip").evaluate((strip) => {
    const rgb = (c: string) => {
      const m = c.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/);
      if (m) return [1, 2, 3].map((i) => Number(m[i]) * 255);
      return (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    };
    const lum = (c: number[]) => {
      const [r, g, b] = c.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    return [...strip.children].map((el) => {
      const cs = getComputedStyle(el);
      const a = lum(rgb(cs.color));
      const b = lum(rgb(cs.backgroundColor));
      return {
        on: el.hasAttribute("data-on"),
        ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        opacity: Number(cs.opacity),
        bgL: b,
      };
    });
  });
  for (const p of pills) {
    expect(p.ratio, JSON.stringify(p)).toBeGreaterThanOrEqual(4.5);
    expect(p.opacity).toBe(1);
  }
  const on = pills.find((p) => p.on)!;
  for (const p of pills.filter((x) => !x.on)) expect(on.bgL).toBeGreaterThan(p.bgL * 4);
  // Next in the Booth: the screen follows within a second
  await booth(page, (b) => b.getState().nextNow());
  await expect(screen.getByTestId("floor-song-of")).toHaveText("Song 2 of 4", { timeout: 5000 });
  await expect(screen.getByTestId("floor-advice")).toHaveText("A good time to start dancing");
  // (2026-11 redesign) the title, what comes next and the time left in the tanda
  await expect(screen.getByTestId("floor-title")).not.toBeEmpty();
  await expect(screen.getByTestId("floor-then")).toHaveText("Next: song 3 of 4");
  await expect(screen.getByTestId("floor-tanda-left")).toContainText("left in this tanda");
  // the cortina: change partners, the next tanda and its countdown
  await booth(page, (b) => {
    const s = b.getState();
    return s.playNow(s.plan.items.findIndex((x, i) => i > s.planIndex && x.kind === "cortina"));
  });
  await expect(screen.getByTestId("floor-cortina")).toBeVisible({ timeout: 10000 });
  await expect(screen.getByTestId("floor-cortina-title")).toHaveText("Cortina — clear the floor");
  await expect(screen.getByTestId("floor-next")).toContainText("Next:");
  await expect(screen.getByTestId("floor-countdown")).toContainText(/Next tanda in \d:\d\d/);
  // no controls on the dancers' screen
  await expect(screen.locator("button, a[href], input").filter({ visible: true })).toHaveCount(0);
});

test("the Floor screen on another device follows the room's booth", async ({ browser, baseURL }) => {
  const dj = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await dj.newPage();
  await mocks(page, { clip: true });
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 120000 });
  await page.goto("/rooms");
  await page.getByTestId("room-user").fill("Ana");
  await page.getByTestId("room-name").fill("Floor test");
  await page.locator("#room-create").click();
  await expect(page.getByTestId("room-tandas")).toBeVisible({ timeout: 20000 });
  await page.getByRole("button", { name: "Invite" }).first().click();
  const code = (await page.getByTestId("room-code").innerText()).replace(/\s+/g, "");
  await page.keyboard.press("Escape");
  await page.goto("/booth");
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 60000 });
  await page.getByTestId("booth-start").click();
  await expect.poll(() => booth(page, (b) => b.getState().state), { timeout: 30000 }).toBe("playing");
  await booth(page, (b) => {
    const s = b.getState();
    return s.playNow(s.plan.items.findIndex((x) => x.kind === "track"));
  });
  // a TV's browser: the room's screen link
  const tv = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const screen = await tv.newPage();
  await screen.goto(`${baseURL}/screen?room=${code}`);
  await expect(screen.getByTestId("floor-song-of")).toHaveText("Song 1 of 4", { timeout: 20000 });
  await booth(page, (b) => b.getState().nextNow());
  await expect(screen.getByTestId("floor-song-of")).toHaveText("Song 2 of 4", { timeout: 8000 });
  await dj.close();
  await tv.close();
});
