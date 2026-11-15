/**
 * 2026-11 (the owner: "in the pipeline, have a tracker of which songs are liked most by dancers; know them and use
 * them in place"). In the Booth with 30 s clips the DJ marks "Floor full ♥" on two songs; Database → Memory lists
 * them with their evidence; a compose with the same options and seed weighs their families more in their part of
 * the night (the API's debug readout `stats.favourites`); with the switch off the night is the night without.
 */
import { expect, type Page, test } from "@playwright/test";

function wav(sec = 30): Buffer {
  const rate = 22050;
  const n = rate * sec;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++)
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 0.3 * 32767), i * 2);
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

async function openBooth(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
  });
  await page.route(/dzcdn\.net|p\.scdn\.co|preview\.test|\/api\/preview\?/, (route) =>
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
  await page.route(/open\.spotify\.com\/oembed/, (r) => r.fulfill({ status: 404, body: "" }));
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/, { timeout: 60000 });
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("booth-ttc")).not.toHaveAttribute("data-resolving", "1", { timeout: 30000 });
}

type Booth = {
  getState: () => {
    planIndex: number;
    state: string;
    current: { planIndex: number } | null;
    entities: Array<{ id: string; title: string } | null>;
  };
};
const boothNow = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __tdjBooth: Booth }).__tdjBooth.getState();
    return {
      cur: s.current?.planIndex ?? null,
      state: s.state,
      id: s.entities[s.planIndex]?.id ?? null,
      title: s.entities[s.planIndex]?.title ?? "",
    };
  });

/** the DJ's memory as the app stored it (IndexedDB, idb-keyval's default store) */
const memoryOf = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<Record<string, unknown> | null>((resolve) => {
        const req = indexedDB.open("keyval-store");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("keyval", "readonly");
          const get = tx.objectStore("keyval").get("tdj-memory");
          get.onsuccess = () => resolve((get.result as Record<string, unknown>) ?? null);
          get.onerror = () => resolve(null);
        };
        req.onerror = () => resolve(null);
      }),
  );

type Trace = {
  key: string;
  role: string;
  factor: number;
  rankWith: number;
  rankWithout: number;
  shareWith: number;
  shareWithout: number;
};
type Night = { tandas: Array<{ songs: Array<{ id: string }> }>; stats: { favourites?: Trace[] } };
const composeVia = async (page: Page, options: Record<string, unknown>, favourites?: unknown) => {
  const r = await page.request.post("/api/compose", {
    data: { ...options, ...(favourites !== undefined ? { favourites } : {}) },
    timeout: 120000,
  });
  expect(r.ok()).toBe(true);
  return (await r.json()) as Night;
};
const ids = (n: Night) => n.tandas.map((t) => t.songs.map((s) => s.id).join(","));

test("Floor full on two songs → Memory lists them → their families weigh more at the same seed; off → no effect", async ({
  page,
}) => {
  test.setTimeout(240000);
  await openBooth(page);
  await page.getByTestId("booth-start").click();
  await expect.poll(async () => (await boothNow(page)).state, { timeout: 20000 }).toBe("playing");

  // song 1: Floor full ♥ on the Now card
  const first = await boothNow(page);
  const full = page.getByTestId("now-floor-full");
  await expect(full).toBeVisible();
  expect((await full.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await full.click();
  await expect(full).toHaveAttribute("aria-pressed", "true");

  // song 2: Next, then Floor full ♥ again (the Controls panel holds the same one-tap control)
  await page.getByTestId("ctl-next").click();
  await expect.poll(async () => (await boothNow(page)).id, { timeout: 20000 }).not.toBe(first.id);
  const second = await boothNow(page);
  await expect(page.getByTestId("now-floor-full")).toHaveAttribute("aria-pressed", "false");
  await page.getByTestId("booth-controls-toggle").click();
  await expect(page.getByTestId("ctl-song-floor-full")).toBeVisible();
  await page.getByTestId("ctl-song-floor-full").click();
  await expect(page.getByTestId("now-floor-full")).toHaveAttribute("aria-pressed", "true");

  // the memory holds both taps, each with its night, time and role
  await expect
    .poll(
      async () => ((await memoryOf(page))?.favourites as { taps?: unknown[] } | undefined)?.taps?.length ?? 0,
    )
    .toBe(2);
  const mem = (await memoryOf(page))!;
  const fav = mem.favourites as {
    taps: Array<{ songIds: string[]; role: string; nightId: string; at: string }>;
  };
  expect(fav.taps.map((t) => t.songIds[0]).sort()).toEqual([first.id, second.id].sort());
  for (const t of fav.taps) {
    expect(t.role).toMatch(/^(warmup|build|peak|cooldown|close)$/);
    expect(t.nightId).toContain("@");
    expect(Date.parse(t.at)).toBeGreaterThan(0);
  }

  // Database → Memory → Dancer favourites shows them with their evidence
  await page.goto("/database?tab=memory#dancer-favourites");
  const box = page.getByTestId("dancer-favourites");
  await expect(box).toBeVisible({ timeout: 30000 });
  for (const s of [first, second]) {
    const row = box.locator(`[data-testid="fav-song"][data-song-id="${s.id}"]`);
    await expect(row).toBeVisible();
    await expect(row).toContainText(s.title);
    await expect(row.getByTestId("fav-evidence")).toContainText("♥ 0 · full 1 · emptied 0 · 1 night");
  }
  await expect(box.getByTestId("fav-family").first()).toBeVisible();

  // compose again with the night's options and seed: their families rank higher where they filled the floor
  const featured = (await (await page.request.get("/featured/golden-double-peak.json")).json()) as {
    options: Record<string, unknown>;
  };
  const {
    learned: _l,
    favourites: _f,
    overrides: _o,
    recent: _r,
    explicit: _e,
    ...options
  } = featured.options;
  const opts = { ...options, seed: 4242 };
  const tracker = (await memoryOf(page))!.favourites as Record<string, unknown>;
  const plain = await composeVia(page, opts);
  const withFav = await composeVia(page, opts, tracker);
  expect(plain.stats.favourites).toBeUndefined();
  const trace = withFav.stats.favourites ?? [];
  expect(trace.length).toBeGreaterThan(0);
  for (const t of trace) {
    expect(t.factor).toBeGreaterThan(1);
    expect(t.factor).toBeLessThanOrEqual(1.8);
    expect(t.rankWith).toBeLessThanOrEqual(t.rankWithout);
    expect(t.shareWith).toBeGreaterThan(t.shareWithout);
  }
  // only in the roles where they were marked
  const roles = new Set(fav.taps.map((t) => t.role));
  for (const t of trace) expect(roles.has(t.role)).toBe(true);

  // the switch off (Database → Memory): the night is exactly the night without
  await box.getByRole("switch", { name: "Use dancer favourites when composing" }).click();
  await expect
    .poll(async () => ((await memoryOf(page))?.favourites as { off?: boolean } | undefined)?.off ?? false)
    .toBe(true);
  const off = await composeVia(page, opts, (await memoryOf(page))!.favourites);
  expect(off.stats.favourites).toBeUndefined();
  expect(ids(off)).toEqual(ids(plain));
});
