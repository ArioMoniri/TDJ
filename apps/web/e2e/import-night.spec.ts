/**
 * 2026-11 — "Import a night" (the owner: "the Import from Spotify in the Booth, Compose or History should show all the
 * user's playlists and allow importing from those … in Compose more detailed suggestions, in the Booth only the most
 * important ones … if the order doesn't match, suggest a reorder or let the user reorder by dragging … the Booth
 * shows the Compose settings via a button"). Spotify's Web API (api.spotify.com, called by the browser with the DJ's
 * own token) is mocked: 60 playlists over two pages, and one of them — four tandas of the featured night, the vals and
 * the milonga back to back, no cortina before the last tanda, no closing La Cumparsita.
 * IMPORT_NIGHT_SHOTS=<dir> writes captures.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";

const SHOTS = process.env.IMPORT_NIGHT_SHOTS;
const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
};

type Side = {
  title: string;
  orchestra: string;
  singer: string | null;
  durationSec?: number;
  spotify?: { uri: string } | null;
};
type Night = {
  tandas: Array<{
    songs: Side[];
    cortina: { title: string; artist: string; spotify?: { uri: string } | null } | null;
  }>;
};
const featured = JSON.parse(
  readFileSync(join(process.cwd(), "public/featured/golden-double-peak.json"), "utf8"),
) as Night;

// Di Sarli (tango), Caló (vals), Troilo (milonga), D'Arienzo (tango): the vals and the milonga back to back; the
// milonga's cortina left out
const PICK = [1, 2, 5, 7];
const track = (s: Side) => ({
  item: {
    type: "track",
    uri: s.spotify!.uri,
    name: s.title,
    artists: [{ name: s.orchestra }, ...(s.singer ? [{ name: s.singer }] : [])],
    album: { name: "Album", release_date: "2014-01-01" },
    duration_ms: (s.durationSec ?? 170) * 1000,
  },
});
const rows = PICK.flatMap((ti, k) => {
  const t = featured.tandas[ti]!;
  const cortina =
    t.cortina && k < PICK.length - 1 && ti !== 5
      ? [
          {
            item: {
              type: "track",
              uri: t.cortina.spotify?.uri ?? "spotify:track:0000000000000000000000",
              name: t.cortina.title,
              artists: [{ name: t.cortina.artist }],
              album: { name: "Pop", release_date: "1990-01-01" },
              duration_ms: 200_000,
            },
          },
        ]
      : [];
  return [...t.songs.map(track), ...cortina];
});

async function mockSpotify(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}";
      document.head.append(s);
    });
  });
  await page.route(/dzcdn\.net|p\.scdn\.co|\/api\/preview\?/, (r) => r.fulfill({ status: 404, body: "" }));
  await page.route(/open\.spotify\.com\/oembed/, (r) => r.fulfill({ status: 404, body: "" }));
  await page.route("**/api/spotify/access", (r) =>
    r.fulfill({ json: { access: "tok", expires: Date.now() + 3_600_000 } }),
  );
  await page.route("https://api.spotify.com/v1/**", (r) => {
    const u = new URL(r.request().url());
    if (u.pathname === "/v1/me/playlists") {
      const off = Number(u.searchParams.get("offset") ?? 0);
      const all = Array.from({ length: 60 }, (_, i) => ({
        id: i === 7 ? "pl7sabado00000000000000" : `pl${i}`,
        name: i === 7 ? "Sábado milonga" : `List ${i}`,
        items: { total: i === 7 ? rows.length : i },
        owner: { display_name: i === 7 ? "DJ Ana" : "DJ" },
        images: [{ url: "https://i.scdn.co/image/cover" }],
      }));
      return r.fulfill({
        json: { items: all.slice(off, off + 50), next: off + 50 < all.length ? "x" : null },
      });
    }
    if (/^\/v1\/playlists\/[^/]+$/.test(u.pathname))
      return r.fulfill({
        json: {
          name: "Sábado milonga",
          external_urls: { spotify: "https://open.spotify.com/playlist/pl7sabado00000000000000" },
        },
      });
    if (/^\/v1\/playlists\/[^/]+\/items$/.test(u.pathname)) {
      const off = Number(u.searchParams.get("offset") ?? 0);
      return r.fulfill({ json: { items: rows.slice(off, off + 100), next: null } });
    }
    return r.fulfill({ status: 404, json: { error: "no" } });
  });
  await page.route("https://i.scdn.co/**", (r) => r.fulfill({ status: 404, body: "" }));
}

/** an edit the rule check asks about: done as the DJ said */
async function asSaid(page: Page) {
  const b = page.getByTestId("rule-as-said");
  if (await b.isVisible().catch(() => false)) await b.click();
}

/** the playlist picker: 60 lists, 20 at a time, searched; the import of "Sábado milonga" */
async function pickSabado(page: Page) {
  const sheet = page.getByTestId("import-night-sheet");
  await expect(sheet).toBeVisible();
  await sheet.getByTestId("import-night-spotify").click();
  await expect(sheet.getByTestId("import-night-list")).toHaveCount(20, { timeout: 30_000 });
  await expect(sheet.getByTestId("import-night-list").first()).toContainText("List 0");
  await expect(sheet.getByTestId("import-night-list").first()).toContainText("0 songs · DJ");
  await sheet.locator("#import-night-more-lists").click();
  await expect(sheet.getByTestId("import-night-list")).toHaveCount(40);
  await sheet.locator("#import-night-search").fill("sabado");
  await expect(sheet.getByTestId("import-night-list")).toHaveCount(1);
  await expect(sheet.getByTestId("import-night-list")).toContainText(`${rows.length} songs · DJ Ana`);
  await shot(page, "1-playlist-picker");
  await sheet.getByTestId("import-night-list").click();
}

test.describe("Import a night", () => {
  test.setTimeout(240_000);

  test("Compose: the playlists appear; the import gives detailed suggestions; a fix applies and undoes; reorder and drag", async ({
    page,
  }) => {
    await mockSpotify(page);
    await page.goto("/");
    const entry = page.getByTestId("first-run-import");
    await expect(entry).toBeVisible({ timeout: 60_000 });
    await expect
      .poll(() => entry.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps"))))
      .toBe(true);
    await entry.click();
    await pickSabado(page);

    const panel = page.getByTestId("review-panel");
    await expect(panel).toBeVisible({ timeout: 90_000 });
    await expect(panel.getByTestId("review-finding").first()).toBeVisible({ timeout: 30_000 });
    // detailed: the important ones and the minor ones, grouped
    await expect(panel.getByTestId("review-group-high")).toBeVisible();
    await expect(panel.locator('[data-kind="cycle"]').first()).toBeVisible();
    await expect(panel.locator('[data-kind="closing"]')).toHaveCount(1);
    await expect(panel.locator('[data-kind="cortina"]')).toHaveCount(1);
    await expect(panel.getByTestId("review-reorder")).toBeVisible();
    await shot(page, "2-compose-suggestions");

    // one fix: the missing cortina; then Undo brings the finding back
    await panel.locator('[data-kind="cortina"]').getByTestId("review-apply").click();
    await asSaid(page);
    await expect(panel.locator('[data-kind="cortina"]')).toHaveCount(0, { timeout: 30_000 });
    await panel.getByTestId("review-undo").click();
    await expect(panel.locator('[data-kind="cortina"]')).toHaveCount(1, { timeout: 30_000 });

    // Apply all safe fixes: the cortina and the closing La Cumparsita at once
    await panel.getByTestId("review-apply-safe").click();
    await asSaid(page);
    await expect(panel.locator('[data-kind="cortina"]')).toHaveCount(0, { timeout: 30_000 });
    await expect(panel.locator('[data-kind="closing"]')).toHaveCount(0);

    // the reorder as a diff, applied: no two non-tango tandas back to back any more
    await expect(panel.getByTestId("review-reorder-move").first()).toBeVisible();
    await panel.getByTestId("review-reorder-apply").click();
    await asSaid(page);
    await expect(panel.locator('[data-kind="cycle"]')).toHaveCount(0, { timeout: 30_000 });
    await shot(page, "3-compose-after-fixes");

    // drag: the first tanda below the second
    const rowsList = panel.getByTestId("review-order-row");
    await expect(rowsList).toHaveCount(4);
    const first = /Tanda \d+ · ([^\n]+)/.exec(await rowsList.nth(0).innerText())![1]!.trim();
    const grip = rowsList.nth(0).getByTestId("review-order-grip");
    const to = await rowsList.nth(1).boundingBox();
    const from = await grip.boundingBox();
    await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
    await page.mouse.down();
    await page.mouse.move(from!.x + from!.width / 2, from!.y + 20, { steps: 4 });
    await page.mouse.move(from!.x + from!.width / 2, to!.y + to!.height - 4, { steps: 8 });
    await page.mouse.up();
    await asSaid(page);
    await expect(rowsList.nth(1)).toContainText(first, { timeout: 30_000 });
    await expect(rowsList.nth(0)).not.toContainText(first);
  });

  test("the Booth: the import shows only the important problems; Night rules opens the Compose settings", async ({
    page,
  }) => {
    await mockSpotify(page);
    await page.goto("/booth");
    const open = page.getByTestId("import-night-open-booth");
    await expect(open).toBeVisible({ timeout: 60_000 });
    await expect
      .poll(() => open.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps"))))
      .toBe(true);
    await open.click();
    await pickSabado(page);

    await expect(page.getByTestId("booth")).toBeVisible({ timeout: 90_000 });
    const fresh = page.getByTestId("booth-resume").getByRole("button", { name: /Start from the beginning/ });
    if (await fresh.isVisible().catch(() => false)) await fresh.click();
    const banner = page.getByTestId("review-banner");
    await expect(banner).toBeVisible({ timeout: 60_000 });
    await expect(banner.getByTestId("review-finding").first()).toBeVisible({ timeout: 30_000 });
    const n = await banner.getByTestId("review-finding").count();
    expect(n).toBeLessThanOrEqual(3);
    for (const sev of await banner
      .getByTestId("review-finding")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-severity"))))
      expect(["blocker", "high"]).toContain(sev);
    // never the minor ones (the opening La Cumparsita, a size)
    await expect(banner.locator('[data-severity="low"], [data-severity="medium"]')).toHaveCount(0);
    await shot(page, "4-booth-banner");
    /** every important finding: the rows shown and "N more in Compose" */
    const total = async () => {
      const shown = await banner.getByTestId("review-finding").count();
      const more = await banner
        .getByTestId("review-banner-more")
        .innerText()
        .catch(() => "0");
      return shown + Number(/\d+/.exec(more)?.[0] ?? 0);
    };
    const before = await total();

    // Night rules: the Compose settings as a sheet; "Last 4 tandas tango only" makes the vals / milonga there count
    await page.getByTestId("booth-night-rules").first().click();
    const sheet = page.getByTestId("night-rules-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText("Last 4 tandas tango only")).toBeVisible();
    await shot(page, "5-booth-night-rules");
    const sw = sheet.getByRole("switch", { name: "Last 4 tandas tango only" });
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "true");
    await sheet.getByRole("button", { name: "Done" }).first().click();
    await expect(sheet).toBeHidden();
    // the review reads the new rule at once: more important findings than before (the banner still shows three)
    await expect.poll(() => total(), { timeout: 30_000 }).toBeGreaterThan(before);
    await expect(banner.getByTestId("review-finding")).toHaveCount(3);
    // the setting is Compose's own (the app's stored settings): after a reload the sheet still shows it on
    await page.reload();
    await expect(page.getByTestId("booth")).toBeVisible({ timeout: 90_000 });
    const again = page.getByTestId("booth-night-rules").first();
    await expect
      .poll(() => again.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps"))), {
        timeout: 30_000,
      })
      .toBe(true);
    await again.click();
    await expect(
      page.getByTestId("night-rules-sheet").getByRole("switch", { name: "Last 4 tandas tango only" }),
    ).toHaveAttribute("aria-checked", "true");
  });
});
