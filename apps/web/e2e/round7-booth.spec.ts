/**
 * Round 7: the Booth (docs/specs/round7-booth.md). The page renders the plan for a composed set with the time to
 * La Cumparsita; rehearsal mode plays through a mocked preview; a mocked folder auto-matches; keyboard controls;
 * the plan equals the export cue points; the Spotify row states Premium plainly.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";

/** 8 s mono 22.05 kHz WAV: a 220 Hz tone (what the previews and the "folder" serve). */
function syntheticWav(): Buffer {
  const rate = 22050;
  const sec = 8;
  const n = rate * sec;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const v = Math.sin((2 * Math.PI * 220 * i) / rate) * 0.3;
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
const WAV = syntheticWav();

/** The round-4 pattern: every preview URL (and /api/preview?…&json=1) serves the synthetic WAV. */
async function mockPreviews(page: Page) {
  await page.route(/dzcdn\.net|preview\.test|\/api\/preview\?/, (route) =>
    route.request().url().includes("json=1")
      ? route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ url: "https://preview.test/clip.wav" }),
        })
      : route.fulfill({
          status: 200,
          contentType: "audio/wav",
          body: WAV,
          headers: { "access-control-allow-origin": "*" },
        }),
  );
}

interface PlanItem {
  kind: string;
  tanda: number;
  lengthSec: number;
  gapAfterSec: number;
  trimInSec?: number;
  stopSec?: number;
  title: string;
  artist: string;
}
interface Plan {
  items: PlanItem[];
  wallClockSec: number;
}

async function compose(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Compose the night/ }).click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
}
async function openBooth(page: Page, query = "") {
  await page.goto(`/booth${query}`);
  await expect(page.getByTestId("booth")).toBeVisible({ timeout: 15000 });
  await expect
    .poll(() => page.evaluate(() => !!(window as unknown as { __tdjBoothPlan?: Plan }).__tdjBoothPlan), {
      timeout: 15000,
    })
    .toBe(true);
  return page.evaluate(() => (window as unknown as { __tdjBoothPlan: Plan }).__tdjBoothPlan);
}

test("booth: the plan for a composed set, time to Cumparsita, dark forced, no glass on content, 44 px controls", async ({
  page,
}) => {
  await compose(page);
  // a real button on the result header (not a link)
  await expect(page.getByRole("button", { name: "Booth: play the night" })).toHaveAttribute(
    "data-testid",
    "play-the-night",
  );
  await page.getByTestId("play-the-night").click();
  await expect(page).toHaveURL(/\/booth/);
  const plan = await openBooth(page);
  expect(plan.items.length).toBeGreaterThan(10);
  // time to Cumparsita from the playhead: every playable item after it (30 s when it plays from a preview) plus
  // its gap, items without a source left out, minus the closing
  const expected = await page.evaluate((items) => {
    const rows = [...document.querySelectorAll<HTMLElement>("[data-plan-index]")];
    const cur = rows.findIndex((r) => r.getAttribute("aria-current") === "true");
    const len = (i: number) => {
      const it = items[i]!;
      const src = rows[i]!.dataset.source;
      if (it.kind === "break") return it.lengthSec;
      return src === "preview" ? Math.min(30, it.lengthSec) : it.lengthSec;
    };
    const playable = (i: number) => items[i]!.kind === "break" || rows[i]!.dataset.source !== "missing";
    let rest = 0;
    for (let i = cur; i < items.length; i++) if (playable(i)) rest += len(i) + items[i]!.gapAfterSec;
    const lastI = items.length - 1;
    return rest - (playable(lastI) ? len(lastI) : 0);
  }, plan.items);
  const ttc = Number(await page.getByTestId("booth-time").getAttribute("data-ttc"));
  expect(Math.abs(ttc - expected)).toBeLessThanOrEqual(1);
  // the Now card shows the item at the playhead, the set column every item
  const curIdx = Number(
    await page.locator('[data-plan-index][aria-current="true"]').getAttribute("data-plan-index"),
  );
  await expect(page.getByTestId("booth-now-title")).toHaveText(plan.items[curIdx]!.title);
  expect(await page.locator("[data-plan-index]").count()).toBe(plan.items.length);
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "idle");
  // dark forced; the mini-player is hidden; content is not glass; every control ≥ 44 px
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByTestId("mini-player")).toHaveCount(0);
  const m = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="booth-now"]')!;
    const strip = document.querySelector('[data-testid="booth-strip"]')!;
    const small = [...strip.querySelectorAll("button, input")].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width < 44 || r.height < 44;
    }).length;
    const title = getComputedStyle(document.querySelector('[data-testid="booth-now-title"]')!).fontSize;
    const big = getComputedStyle(document.querySelector('[data-testid="booth-ttc"]')!).fontSize;
    return {
      cardBlur: getComputedStyle(card).backdropFilter,
      stripGlass: strip.classList.contains("glass"),
      glassInContent: document.querySelectorAll(".booth-grid .glass").length,
      small,
      title,
      big,
    };
  });
  expect(m.cardBlur === "none" || m.cardBlur === "").toBe(true);
  expect(m.stripGlass).toBe(true);
  expect(m.glassInContent).toBe(0);
  expect(m.small).toBe(0);
  expect(m.title).toBe("34px");
  expect(m.big).toBe("44px");
});

test("rehearsal: the night plays through the mocked previews; space holds, esc held 600 ms stops, → arms the next", async ({
  page,
}) => {
  await mockPreviews(page);
  await compose(page);
  await openBooth(page, "?rehearsal=1");
  await expect(page.getByTestId("booth")).toHaveAttribute("data-rehearsal", "true");
  await page.getByTestId("booth-start").click();
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing", { timeout: 20000 });
  await expect(page.getByTestId("booth-source")).toHaveText("30 s rehearsal");
  const r1 = await page.getByTestId("booth-remaining").textContent();
  await page.waitForTimeout(1500);
  const r2 = await page.getByTestId("booth-remaining").textContent();
  expect(r1).not.toBe(r2);
  await expect(page.getByTestId("booth-keepalive")).toHaveCount(1);
  // space: hold → the song finishes (8 s clip), then paused; never a cut
  await page.keyboard.press("Space");
  await expect(page.getByTestId("booth-play")).toBeVisible();
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing");
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "paused", { timeout: 15000 });
  // space again: play; esc held 600 ms: emergency stop
  await page.keyboard.press("Space");
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "playing", { timeout: 15000 });
  await page.keyboard.down("Escape");
  await page.waitForTimeout(750);
  await page.keyboard.up("Escape");
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "stopped");
  const idx = Number(
    await page.locator('[data-plan-index][aria-current="true"]').getAttribute("data-plan-index"),
  );
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("booth")).toHaveAttribute("data-state", "armed");
  const idx2 = Number(
    await page.locator('[data-plan-index][aria-current="true"]').getAttribute("data-plan-index"),
  );
  expect(idx2).toBeGreaterThan(idx);
  // the running tanda's swap is refused, a later one is allowed
  const running = page.locator("[data-tanda][data-locked]").first();
  await expect(running.getByTestId("booth-swap").first()).toHaveAttribute("aria-disabled", "true");
  const ahead = page.locator("[data-tanda]:not([data-locked])").nth(2);
  expect(await ahead.getByTestId("booth-swap").first().getAttribute("aria-disabled")).toBeNull();
  // End the night → the log lands in History
  await page.getByTestId("booth-more").click();
  await page.getByRole("menuitem", { name: "End the night" }).click();
  await page.waitForTimeout(800);
  await page.goto("/history");
  await expect(page.locator('[id^="history-"]').first()).toContainText(
    /played .* · 1 hold · 1 stop · rehearsal/,
    { timeout: 15000 },
  );
});

test("folder: injected files auto-match ≥ 1 track by the exporter's file name and the badge says file", async ({
  page,
}) => {
  await compose(page);
  const plan = await openBooth(page);
  const safe = (s: string) =>
    s
      .replace(/[/\\:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  const tracks = plan.items.filter((i) => i.kind === "track").slice(0, 3);
  // a webkitdirectory input takes a directory: the "music folder" is a temp dir of WAV bytes named like the exports
  const dir = mkdtempSync(join(tmpdir(), "tdj-booth-"));
  for (const t of tracks) writeFileSync(join(dir, `${safe(t.artist)} - ${safe(t.title)}.mp3`), WAV);
  writeFileSync(join(dir, "Unrelated - Something else.mp3"), WAV);
  await page.getByTestId("booth-folder-input").setInputFiles(dir);
  await expect
    .poll(() => page.locator('[data-plan-index][data-source="file"]').count(), { timeout: 15000 })
    .toBeGreaterThanOrEqual(1);
  await page.getByTestId("booth-more").click();
  await page.getByRole("menuitem", { name: /Set-up/ }).click();
  await expect(page.getByTestId("booth-source-file")).toContainText(/\d+ of \d+ matched/);
  // the start button says how many items have no source
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("booth-start")).toContainText(/without source/);
});

test("the plan equals the export cue points (M3U8 stop/start lines) and History's Play the night opens the booth", async ({
  page,
  request,
}) => {
  await compose(page);
  const plan = await openBooth(page);
  await page.waitForTimeout(1200); // the store flushes to localStorage in idle time
  const playlist = await page.evaluate(
    () => JSON.parse(localStorage.getItem("tdj-v1") ?? "{}").state?.playlist,
  );
  expect(playlist?.booth?.items?.length).toBe(plan.items.length);
  const m3u = await (await request.post("/api/export", { data: { playlist, format: "m3u8" } })).text();
  const stops = [...m3u.matchAll(/#EXTVLCOPT:stop-time=(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  const cortinas = plan.items.filter((i) => i.kind === "cortina");
  expect(stops).toEqual(cortinas.map((c) => c.stopSec));
  const starts = [...m3u.matchAll(/#EXTVLCOPT:start-time=(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  if (starts.length)
    expect(starts).toEqual(cortinas.filter((c) => (c.trimInSec ?? 0) > 0).map((c) => c.trimInSec));
  // History → Play the night
  await page.goto("/history");
  await page.locator('[id^="history-"]').first().click();
  await page.getByTestId("history-detail").getByRole("button", { name: "Play the night" }).click();
  await expect(page).toHaveURL(/\/booth/);
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 15000 });
  const idx = Number(
    await page.locator('[data-plan-index][aria-current="true"]').getAttribute("data-plan-index"),
  );
  await expect(page.getByTestId("booth-now-title")).toHaveText(plan.items[idx]!.title);
});

test("spotify source: a free account sees the plain statement and the row is disabled; Premium shows the licence note", async ({
  page,
}) => {
  await page.route("**/api/spotify/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ hosted: true, user: { id: "u", name: "DJ", product: "free" } }),
    }),
  );
  await compose(page);
  await openBooth(page);
  await page.getByTestId("booth-more").click();
  await page.getByRole("menuitem", { name: /Set-up/ }).click();
  const row = page.getByTestId("booth-source-spotify");
  await expect(row).toContainText("not Premium: Spotify does not allow playback in the browser", {
    timeout: 15000,
  });
  await expect(row).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");
  await page.unroute("**/api/spotify/me");
  await page.route("**/api/spotify/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ hosted: true, user: { id: "u", name: "DJ", product: "premium" } }),
    }),
  );
  await page.getByTestId("booth-more").click();
  await page.getByRole("menuitem", { name: /Set-up/ }).click();
  await expect(row).toContainText("Premium", { timeout: 15000 });
  await row.click();
  await expect(page.getByTestId("booth-onboarding")).toContainText(
    "Spotify's SDK terms restrict commercial use",
  );
});

test("without a set the booth says Compose a night first; the sidebar has a Booth item", async ({ page }) => {
  await page.goto("/booth");
  await expect(page.getByText("Compose a night first")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Primary sidebar" }).getByRole("link", { name: "Booth" }),
  ).toBeVisible();
});

test("fresh browser (no folder, no Premium): previews are the automatic fallback and the Next card never says End of the night before the end", async ({
  page,
}) => {
  await compose(page);
  const plan = await openBooth(page);
  // (1) every item with a Deezer preview plays its clip: the button and the badge say so, "without source" is gone
  await expect(page.getByTestId("booth-start")).toHaveText("Start · rehearsal (30 s clips)");
  await expect(page.getByTestId("booth-source")).toHaveText("30 s rehearsal");
  expect(await page.locator('[data-plan-index][data-source="preview"]').count()).toBeGreaterThan(
    plan.items.length / 4,
  );
  // the playhead sits on the first playable item, never on one without a source
  const current = page.locator('[data-plan-index][aria-current="true"]');
  await expect(current).toHaveAttribute("data-source", "preview");
  // (4) Next shows the first playable item after the playhead
  const next = await page.evaluate(() => {
    const rows = [...document.querySelectorAll<HTMLElement>("[data-plan-index]")];
    const i = rows.findIndex((r) => r.getAttribute("aria-current") === "true");
    const n = rows.slice(i + 1).find((r) => r.dataset.source !== "missing");
    return n?.querySelector(".booth-row-title")?.textContent?.trim() ?? null;
  });
  expect(next).not.toBeNull();
  await expect(page.getByTestId("booth-next-title")).toHaveText(next!);
  await expect(page.getByTestId("booth-next")).not.toContainText("End of the night");
  // the time to Cumparsita counts 30 s clips, not full tracks
  const ttc = Number(await page.getByTestId("booth-time").getAttribute("data-ttc"));
  expect(ttc).toBeLessThan(plan.wallClockSec / 2);
});

test("1440 × 900: the set column keeps whole titles (≥ 360 px), the transport capsule fits its controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await compose(page);
  await openBooth(page);
  const m = await page.evaluate(() => {
    const set = document.querySelector('[data-testid="booth-set"]')!.getBoundingClientRect();
    const titles = [...document.querySelectorAll<HTMLElement>(".booth-row-title")];
    const cut = titles.filter((t) => t.scrollWidth > t.clientWidth + 1).length;
    const subs = document.querySelectorAll(".booth-row-sub").length;
    const subVisible = [...document.querySelectorAll<HTMLElement>(".booth-row-sub")].filter(
      (s) => s.offsetParent !== null,
    ).length;
    const strip = document.querySelector<HTMLElement>('[data-testid="booth-strip"]')!;
    const sr = strip.getBoundingClientRect();
    const out = [...strip.querySelectorAll<HTMLElement>("button, label")].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.right > sr.right + 1 || r.left < sr.left - 1 || r.bottom > sr.bottom + 1;
    }).length;
    const secondary = [...strip.querySelectorAll<HTMLElement>(".booth-secondary")].filter(
      (b) => b.offsetParent !== null,
    ).length;
    return {
      setWidth: set.width,
      cut,
      subs,
      subVisible,
      out,
      stripScroll: strip.scrollWidth - strip.clientWidth,
      secondary,
      stripRight: sr.right,
      vw: window.innerWidth,
    };
  });
  expect(m.setWidth).toBeGreaterThanOrEqual(360);
  expect(m.cut).toBe(0);
  expect(m.subVisible).toBe(m.subs);
  expect(m.out).toBe(0);
  expect(m.stripScroll).toBeLessThanOrEqual(1);
  expect(m.secondary).toBe(3);
  expect(m.stripRight).toBeLessThanOrEqual(m.vw);
  // below 1200 px the secondary controls leave the capsule for the overflow menu
  await page.setViewportSize({ width: 1100, height: 800 });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          [...document.querySelectorAll<HTMLElement>('[data-testid="booth-strip"] .booth-secondary')].filter(
            (b) => b.offsetParent !== null,
          ).length,
      ),
    )
    .toBe(0);
});
