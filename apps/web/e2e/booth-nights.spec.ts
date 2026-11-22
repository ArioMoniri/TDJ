/**
 * 2026-11 — the owner, in the web app and the Mac app:
 *  1 "Import from Spotify in the Booth tab is not seen, and the Booth only shows the previously imported night; you
 *    can't reset or close the night or import other nights" → the Booth header's Night menu (Load a night…, Import
 *    from Spotify, Import another way, Reset, Clear / Close) and an empty Booth that shows the choices in place;
 *    closing a night that plays asks first and Undo brings it back;
 *  2 "you can't select which night to play in the Booth, or from History" → Play in the Booth on History's rows and
 *    menus (asks first when another night plays: replace / cancel);
 *  3 "the Booth tab is always in dark mode" → it follows Appearance, AA contrast in light; "Always dark" is opt-in;
 *  4 the example night (the owner's night, the featured night) reads as a neutral example;
 *  + rename and delete everywhere (the sidebar's Recent nights and History), the protections kept.
 * Spotify's Web API is mocked; audio is a local tone. Screenshots go to $BOOTH_SHOTS when it is set.
 */
import { expect, type Page, test } from "@playwright/test";
import { contrastFailures } from "./contrast";

const SHOTS = process.env.BOOTH_SHOTS;
test.describe.configure({ timeout: 240_000 });
test.use({ viewport: { width: 1440, height: 900 } });

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

async function quiet(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
  });
  await page.route(/dzcdn\.net|p\.scdn\.co|preview\.test|\/api\/preview\?/, (r) =>
    r.request().url().includes("json=1")
      ? r.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ url: "https://preview.test/clip.wav" }),
        })
      : r.fulfill({
          status: 200,
          contentType: "audio/wav",
          body: WAV,
          headers: { "access-control-allow-origin": "*" },
        }),
  );
  await page.route(/open\.spotify\.com\/oembed/, (r) => r.fulfill({ status: 404, body: "" }));
}

/** nights in History (the featured night's music under these names), written as the app writes them */
async function seed(page: Page, names: string[]) {
  await page.goto("/history");
  await page.evaluate(async (names) => {
    const p = await (await fetch("/featured/golden-double-peak.json")).json();
    const now = Date.now();
    // "@featured": the shipped featured night as an older History entry kept it (the owner's notes and pins)
    const snaps = names.map((title, i) =>
      title === "@featured"
        ? {
            id: `seed-${i}`,
            createdAt: new Date(now - i * 60_000).toISOString(),
            title: "Featured night",
            options: p.options,
            playlist: { ...p, name: "Featured night" },
            score: p.score?.total ?? 90,
            source: "compose",
          }
        : {
            id: `seed-${i}`,
            createdAt: new Date(now - i * 60_000).toISOString(),
            title,
            options: p.options,
            // (the featured night's own notes and pins stay out: these are plain nights of the DJ's)
            playlist: {
              ...p,
              id: `seed-night-${i}`,
              name: title,
              tandas: p.tandas.map((t: Record<string, unknown>) => ({
                ...t,
                pinned: undefined,
                note: undefined,
              })),
            },
            score: p.score?.total ?? 90,
            source: "compose",
          },
    );
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("keyval-store");
      req.onupgradeneeded = () => req.result.createObjectStore("keyval");
      req.onsuccess = () => {
        const tx = req.result.transaction("keyval", "readwrite");
        const st = tx.objectStore("keyval");
        st.put(
          snaps.map((s) => s.id),
          "tdj-history-v2:index",
        );
        for (const s of snaps) st.put(s, `tdj-history-v2:${s.id}`);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
  }, names);
  await page.reload();
  await expect(page.getByTestId("history-row")).toHaveCount(names.length, { timeout: 30000 });
}

type Snap = { planIndex: number; state: string; started: boolean; name: string | null; id: string | null };
const snap = (page: Page) =>
  page.evaluate(() => {
    const s = (
      window as unknown as { __tdjBooth?: { getState: () => Record<string, unknown> } }
    ).__tdjBooth?.getState();
    const p = s?.playlist as { name: string; id: string } | null | undefined;
    return {
      planIndex: (s?.planIndex as number) ?? -1,
      state: (s?.state as string) ?? "",
      started: !!s?.started,
      name: p?.name ?? null,
      id: p?.id ?? null,
    } as Snap;
  });
async function ready(page: Page) {
  await expect(page.getByTestId("booth-now-title")).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId("booth-ttc")).not.toHaveAttribute("data-resolving", "1", { timeout: 30000 });
  const fresh = page
    .getByTestId("booth-resume")
    .getByRole("button", { name: /Start from the beginning|Baştan/ });
  if (await fresh.isVisible().catch(() => false)) await fresh.click();
}
async function start(page: Page) {
  await page.getByTestId("booth-start").click();
  await expect.poll(async () => (await snap(page)).state, { timeout: 20000 }).toBe("playing");
}
const nightMenu = (page: Page) =>
  page.getByTestId("page-toolbar").getByRole("button", { name: "Night", exact: true });
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

/** Spotify's Web API for the DJ's own playlists: one playlist of the featured night's first two tandas */
async function mockSpotify(page: Page) {
  const p = (await (await page.request.get("/featured/golden-double-peak.json")).json()) as {
    tandas: Array<{
      songs: Array<{
        title: string;
        orchestra: string;
        singer: string | null;
        durationSec?: number;
        spotify?: { uri: string };
      }>;
    }>;
  };
  const rows = p.tandas.slice(0, 2).flatMap((t) =>
    t.songs.map((s) => ({
      item: {
        type: "track",
        uri: s.spotify!.uri,
        name: s.title,
        artists: [{ name: s.orchestra }, ...(s.singer ? [{ name: s.singer }] : [])],
        album: { name: "Album", release_date: "2014-01-01" },
        duration_ms: (s.durationSec ?? 170) * 1000,
      },
    })),
  );
  await page.route("**/api/spotify/access", (r) =>
    r.fulfill({ json: { access: "tok", expires: Date.now() + 3_600_000 } }),
  );
  await page.route("https://api.spotify.com/v1/**", (r) => {
    const u = new URL(r.request().url());
    if (u.pathname === "/v1/me/playlists")
      return r.fulfill({
        json: {
          items: [{ id: "plsabado00000000000000", name: "Sábado milonga", tracks: { total: rows.length } }],
          next: null,
        },
      });
    if (/^\/v1\/playlists\/[^/]+$/.test(u.pathname))
      return r.fulfill({
        json: {
          name: "Sábado milonga",
          external_urls: { spotify: "https://open.spotify.com/playlist/plsabado00000000000000" },
        },
      });
    if (/^\/v1\/playlists\/[^/]+\/items$/.test(u.pathname))
      return r.fulfill({ json: { items: rows, next: null } });
    return r.fulfill({ status: 404, json: { error: "no" } });
  });
}

test("the Booth's Night menu: load from History, close mid-night (asked, Undo), import from Spotify", async ({
  page,
}) => {
  await quiet(page);
  await mockSpotify(page);
  await seed(page, ["Night A", "Night B"]);
  await page.goto("/booth");
  // no night yet: the Booth shows its choices in place, Import from Spotify among them, and the Night menu
  await expect(page.getByTestId("booth-empty")).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("booth-empty-choices")).toBeVisible();
  await expect(page.getByTestId("booth-empty-spotify")).toBeVisible();
  await expect(page.getByTestId("booth-empty-history-0")).toContainText("Night A");
  await expect(nightMenu(page)).toBeVisible();
  await shot(page, "booth-empty-choices");

  // Night → Load a night… → a night from History
  await nightMenu(page).click();
  for (const id of [
    "booth-night-load",
    "booth-night-spotify",
    "booth-night-import",
    "booth-night-reset",
    "booth-night-clear",
  ])
    await expect(page.getByTestId(id)).toBeVisible();
  await shot(page, "booth-night-menu-empty");
  await page.getByTestId("booth-night-load").click();
  await expect(page.getByTestId("booth-load-sheet")).toBeVisible();
  await expect(page.getByTestId("booth-load-spotify")).toBeVisible();
  await shot(page, "booth-load-sheet");
  await page.getByTestId("booth-load-history-1").click();
  await ready(page);
  await expect.poll(async () => (await snap(page)).name).toBe("Night B");

  // mid-night: Close the night asks first; Undo brings the night back where it was, nothing playing
  await start(page);
  const at = (await snap(page)).planIndex;
  await nightMenu(page).click();
  await expect(page.getByTestId("booth-night-clear")).toContainText("Close the night");
  await shot(page, "booth-night-menu-live");
  await page.getByTestId("booth-night-clear").click();
  await expect(page.getByTestId("booth-load-clear-ask")).toBeVisible();
  await shot(page, "booth-close-ask");
  // Cancel keeps it playing
  await page.getByTestId("booth-ask-cancel").click();
  expect((await snap(page)).state).toBe("playing");
  await nightMenu(page).click();
  await page.getByTestId("booth-night-clear").click();
  await page.getByTestId("booth-load-clear-now").click();
  await expect(page.getByTestId("booth-empty")).toBeVisible();
  expect((await snap(page)).started).toBe(false);
  await expect(page.getByTestId("toast")).toContainText("Night closed");
  await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
  await ready(page);
  await expect.poll(async () => (await snap(page)).name).toBe("Night B");
  await expect.poll(async () => (await snap(page)).planIndex).toBe(at);
  expect((await snap(page)).state).not.toBe("playing");

  // Reset: the same night at its start
  await nightMenu(page).click();
  await page.getByTestId("booth-night-reset").click();
  await expect.poll(async () => (await snap(page)).planIndex, { timeout: 15000 }).toBeLessThanOrEqual(1);
  await expect(page.getByTestId("toast")).toContainText("back at its start");

  // Night → Import from Spotify: the import flow, then its Play in the Booth loads the playlist here
  await nightMenu(page).click();
  await page.getByTestId("booth-night-spotify").click();
  await expect(page).toHaveURL(/\/import\?from=spotify/);
  await page.getByTestId("import-show-lists").click();
  await page.getByTestId("import-my-list").first().click();
  await expect(page.getByTestId("import-tanda").first()).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("import-play-booth").click();
  await expect(page).toHaveURL(/\/booth/, { timeout: 30000 });
  await ready(page);
  await expect.poll(async () => (await snap(page)).name, { timeout: 30000 }).toBe("Sábado milonga");
  await shot(page, "booth-after-spotify-import");
});

test("History → Play in the Booth: another night playing asks first (cancel keeps it, replace loads, Undo)", async ({
  page,
}) => {
  await quiet(page);
  await seed(page, ["Night A", "Night B"]);
  // Night A from its row's menu: nothing plays, so it loads at once
  const rowA = page.getByTestId("history-row").filter({ hasText: "Night A" });
  await rowA.getByRole("button", { name: /Night A: actions/ }).click();
  await page.getByTestId("night-menu-play").click();
  await expect(page).toHaveURL(/\/booth/);
  await ready(page);
  await expect.poll(async () => (await snap(page)).name).toBe("Night A");
  await start(page);
  // back to History (client-side: the night keeps playing), Night B → Play in the Booth asks
  await page.getByRole("link", { name: "History" }).first().click();
  await expect(page).toHaveURL(/\/history/);
  const rowB = page.getByTestId("history-row").filter({ hasText: "Night B" });
  await rowB.getByRole("button", { name: /Night B: actions/ }).click();
  await page.getByRole("menu", { name: "Night B: actions" }).getByTestId("night-menu-play").click();
  const ask = page.getByTestId("play-in-booth-ask");
  await expect(ask).toBeVisible();
  await expect(ask).toContainText("Night A");
  await expect(ask).toContainText("Night B");
  await shot(page, "history-play-ask");
  await page.getByTestId("play-in-booth-cancel").click();
  await expect(ask).toBeHidden();
  await expect(page).toHaveURL(/\/history/);
  expect((await snap(page)).name).toBe("Night A");
  expect((await snap(page)).state).toBe("playing");
  // the detail sheet's Play in the Booth asks the same; Replace loads Night B in the Booth
  await rowB.locator("button").first().click();
  await page.getByTestId("history-detail").getByRole("button", { name: "Play in the Booth" }).click();
  await expect(ask).toBeVisible();
  await page.getByTestId("play-in-booth-replace").click();
  await expect(page).toHaveURL(/\/booth/, { timeout: 30000 });
  await ready(page);
  await expect.poll(async () => (await snap(page)).name).toBe("Night B");
  expect((await snap(page)).started).toBe(false);
  await expect(page.getByTestId("toast")).toContainText("Night B");
  // Undo brings Night A back (stopped, where it was)
  await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await snap(page)).name, { timeout: 30000 }).toBe("Night A");
});

test("rename and delete everywhere: the sidebar's menu and History's inline title; the Booth and Compose follow", async ({
  page,
}) => {
  await quiet(page);
  await seed(page, ["Night A", "Night B"]);
  const recent = page.getByTestId("sidebar-recent-row");
  await expect(recent).toHaveCount(2);
  // the sidebar's "•••" on hover: Play in the Booth, Reopen, Rename…, Delete
  await recent.filter({ hasText: "Night A" }).hover();
  await recent
    .filter({ hasText: "Night A" })
    .getByRole("button", { name: /Night A: actions/ })
    .click();
  await expect(page.getByTestId("night-menu-rename")).toBeVisible();
  await expect(page.getByTestId("night-menu-delete")).toBeVisible();
  await shot(page, "sidebar-night-menu");
  await page.getByTestId("night-menu-rename").click();
  await page.getByTestId("rename-night-field").fill("Saturday at the club");
  await page.keyboard.press("Enter");
  await expect(recent.filter({ hasText: "Saturday at the club" })).toHaveCount(1);
  await expect(page.getByTestId("history-row").filter({ hasText: "Saturday at the club" })).toHaveCount(1);
  // Undo puts the old name back
  await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
  await expect(recent.filter({ hasText: "Night A" })).toHaveCount(1);

  // History: the title edits in place; the night open in the Booth takes the name
  const rowB = page.getByTestId("history-row").filter({ hasText: "Night B" });
  await rowB.getByRole("button", { name: /Night B: actions/ }).click();
  await page.getByRole("menu", { name: "Night B: actions" }).getByTestId("night-menu-play").click();
  await ready(page);
  await page.getByRole("link", { name: "History" }).first().click();
  await rowB.locator("button").first().click();
  const title = page.getByTestId("history-title-edit");
  await expect(title).toHaveValue("Night B");
  await title.fill("Sunday práctica");
  await title.press("Enter");
  await expect(page.getByTestId("history-row").filter({ hasText: "Sunday práctica" })).toHaveCount(1);
  expect((await snap(page)).name).toBe("Sunday práctica");
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("tdj-v1") ?? "{}").state?.playlist?.name))
    .toBe("Sunday práctica");
  await page.keyboard.press("Escape");

  // the night open in the Booth: its Delete is off with the reason; the other one deletes (asked), Undo
  const open = page.getByTestId("history-row").filter({ hasText: "Sunday práctica" });
  await open.click({ button: "right" });
  await expect(
    page.getByRole("menu", { name: "Sunday práctica: actions" }).getByTestId("night-menu-delete"),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await recent.filter({ hasText: "Night A" }).click({ button: "right" });
  await page.getByRole("menu", { name: "Night A: actions" }).getByTestId("night-menu-delete").click();
  await page.getByTestId("delete-nights").locator("#delete-nights-confirm").click();
  await expect(recent).toHaveCount(1);
  await page.getByTestId("toast").getByRole("button", { name: "Undo" }).click();
  await expect(recent).toHaveCount(2);
});

test("the Booth follows Appearance: light by day with AA contrast everywhere; Always dark is opt-in", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await quiet(page);
  await seed(page, ["Night A"]);
  // the empty Booth, light: its choices and the Night menu read at AA
  await page.goto("/booth");
  await expect(page.getByTestId("booth-empty-choices")).toBeVisible({ timeout: 30000 });
  const theme = () =>
    page.evaluate(() => ({
      theme: document.documentElement.dataset.theme ?? "auto",
      dark: document.documentElement.classList.contains("dark"),
    }));
  expect(await theme()).toEqual({ theme: "light", dark: false });
  // (the empty state rises in after its grace: read it at rest)
  await page.waitForTimeout(1500);
  const e = await contrastFailures(page, "[data-testid='booth-empty']");
  expect(e.checked).toBeGreaterThan(10);
  expect(e.out, e.out.join("\n")).toEqual([]);
  // a night loaded, before and during the night: every Booth text at AA in light
  await page.getByTestId("booth-empty-history-0").click();
  await ready(page);
  expect(await theme()).toEqual({ theme: "light", dark: false });
  const a = await contrastFailures(page);
  expect(a.checked).toBeGreaterThan(40);
  expect(a.out, a.out.join("\n")).toEqual([]);
  await shot(page, "booth-light");
  await start(page);
  await page.waitForTimeout(400);
  const b = await contrastFailures(page);
  expect(b.out, b.out.join("\n")).toEqual([]);
  await shot(page, "booth-light-playing");
  // Settings → Appearance: Dark makes the Booth dark too (as every page)
  await page.goto("/settings");
  await page.getByRole("radio", { name: "Dark" }).first().click();
  await page.waitForTimeout(800);
  await page.goto("/booth");
  await ready(page);
  expect(await theme()).toEqual({ theme: "dark", dark: true });
  await page.goto("/settings");
  await page.getByRole("radio", { name: "Light" }).first().click();
  await page.waitForTimeout(800);
  // "Always dark in the Booth": off by default; on, the Booth alone is dark
  const sw = page.getByRole("switch", { name: "Always dark in the Booth" });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await sw.click();
  await page.waitForTimeout(800);
  await page.goto("/booth");
  await ready(page);
  expect(await theme()).toEqual({ theme: "dark", dark: true });
  const d = await contrastFailures(page);
  expect(d.out, d.out.join("\n")).toEqual([]);
  await shot(page, "booth-always-dark");
  await page.goto("/history");
  await expect(page.getByTestId("history-row")).toHaveCount(1, { timeout: 30000 });
  expect((await theme()).theme).toBe("light");
});

test("the example night (the featured night) reads as an example: nothing about its maker", async ({
  page,
}) => {
  await quiet(page);
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
  await expect(page.getByTestId("tanda-pinned").first()).toBeVisible();
  const OWNER = /your tanda|kept as (it )?is|your choice|kept tonight|the DJ's|DJ's own|Your pinned/i;
  const text = async () =>
    page.evaluate(() => {
      // every word on the page and in every tooltip, label and title
      const parts = [document.body.innerText];
      for (const el of document.querySelectorAll("[aria-label], [title], [data-tip]"))
        parts.push(
          el.getAttribute("aria-label") ?? "",
          el.getAttribute("title") ?? "",
          el.getAttribute("data-tip") ?? "",
        );
      return parts.join("\n");
    });
  const words = await text();
  expect(words.match(OWNER)?.[0] ?? null).toBeNull();
  await expect(page.getByTestId("tanda-pinned").first()).toHaveText("Hand-picked");
  // the pins stay (its choices hold for this night only): as many as the shipped night has
  const pinned = await page.getByTestId("tanda-pinned").count();
  expect(pinned).toBeGreaterThan(10);
  // the tooltip of a hand-picked tanda
  await page.getByTestId("tanda-pinned").first().hover();
  await page.waitForTimeout(900);
  expect((await text()).match(OWNER)?.[0] ?? null).toBeNull();
  await shot(page, "example-night-compose");
  // an older History entry of it (the owner's notes kept in it) reads the same
  await seed(page, ["@featured"]);
  const row = page.getByTestId("history-row").first();
  await expect(row).toBeVisible({ timeout: 30000 });
  await row.locator("button").first().click();
  await expect(page.getByTestId("history-detail")).toBeVisible();
  await expect(page.getByTestId("history-detail").getByTestId("tanda-pinned").first()).toHaveText(
    "Hand-picked",
  );
  expect((await text()).match(OWNER)?.[0] ?? null).toBeNull();
  // the featured night is the app's own: never renamed, only removed from the recents
  await expect(page.getByTestId("history-title-edit")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await row.click({ button: "right" });
  await expect(page.getByTestId("night-menu-rename")).toHaveCount(0);
  await expect(page.getByTestId("night-menu-delete")).toHaveText(/Remove from recents/);
  await page.keyboard.press("Escape");
  await shot(page, "example-night-history");
});
