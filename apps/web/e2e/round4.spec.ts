/**
 * Round 4: play buttons and the mini-player, in-browser analysis (worker) on a synthetic preview, Find on services
 * (mocked /api/resolve), History snapshots, editable Guide, Connectors / webhook export, plus the dancer-review
 * fixes: phone overflow after compose, honest feedback chips, honest "Tell the DJ" fallback, /api/db 200 in browser mode.
 */
import { devices, expect, type Page, test } from "@playwright/test";

/** 8 s mono 22.05 kHz WAV: a 220 Hz tone pulsed at 2 Hz (120 BPM) so the DSP finds a tempo and a key. */
function syntheticWav(): Buffer {
  const rate = 22050;
  const sec = 8;
  const n = rate * sec;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const beat = t % 0.5;
    const env = beat < 0.12 ? 1 : Math.exp(-(beat - 0.12) * 10);
    const v = (Math.sin(2 * Math.PI * 220 * t) * 0.6 + Math.sin(2 * Math.PI * 330 * t) * 0.3) * env;
    data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), i * 2);
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

/** Every Deezer preview URL (real ones from the committed cache, and the mocked candidate) serves the synthetic WAV. */
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
const RESOLVE_MOCK = {
  candidates: [
    {
      provider: "deezer",
      id: "123",
      title: "Milonga de Mis Amores",
      artist: "Pedro Laurenz",
      album: "Tango Argentino 1937",
      durationMs: 163000,
      previewUrl: "https://cdn.preview.test/milonga.wav",
      url: "https://www.deezer.com/track/123",
      artwork: "",
      matchedAt: "2026-10-19T00:00:00.000Z",
      confidence: 0.95,
    },
    {
      provider: "musicbrainz",
      id: "mb-1",
      title: "Milonga de mis amores",
      artist: "Pedro Laurenz feat. Juan Carlos Casas",
      year: 1937,
      durationMs: 162000,
      previewUrl: null,
      url: "https://musicbrainz.org/recording/mb-1",
      matchedAt: "2026-10-19T00:00:00.000Z",
      confidence: 0.6,
    },
  ],
  suggestions: { year: 1937, durationSec: 162 },
};

async function compose(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Compose the night/ }).click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
}

test("/api/db answers 200 in browser mode and the page boots without console errors", async ({
  page,
  request,
}) => {
  const r = await request.get("/api/db");
  expect(r.status()).toBe(200);
  const j = await r.json();
  expect(j.mode).toBe("browser");
  expect(j.enabled).toBe(false);
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !/vinyl\.json|AbortError/.test(m.text())) errors.push(m.text());
  });
  await page.goto("/");
  await page.goto("/library");
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test("play buttons: every resolved row plays its 30 s preview in the one mini-player; Find on the others", async ({
  page,
}) => {
  await mockPreviews(page);
  await compose(page);
  const plays = page.locator('[data-testid="play-button"][aria-label^="Play "]');
  expect(await plays.count()).toBeGreaterThan(3);
  // stable handles by song id: the label flips to "Pause …" once a row plays
  const ids = await page
    .locator("li[data-song]")
    .filter({ has: plays })
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-song")));
  const rowOf = (id: string | null) => page.locator(`li[data-song="${id}"]`).first();
  const firstRow = rowOf(ids[0]!);
  const secondRow = rowOf(ids[1]!);
  const first = firstRow.getByTestId("play-button");
  await first.click();
  const mini = page.getByTestId("mini-player");
  await expect(mini).toBeVisible();
  await expect(mini).toContainText("30 s preview");
  await expect(mini.getByRole("slider", { name: "Position" })).toBeVisible();
  // only one preview at a time: playing a second row moves the player, the first row shows its number again
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await secondRow.getByTestId("play-button").click();
  await expect(first).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator('[data-testid="play-button"][aria-pressed="true"]')).toHaveCount(1);
  // space on a focused row toggles it
  const row = page.locator("li[data-song][data-playing]").first();
  await row.focus();
  await page.keyboard.press("Space");
  await expect(page.locator('[data-testid="play-button"][aria-pressed="true"]')).toHaveCount(0);
  await mini.getByRole("button", { name: "Close player" }).click();
  await expect(mini).toBeHidden();
  // cohesion badges and key chips come from the committed audio cache
  expect(await page.getByTestId("cohesion-badge").count()).toBeGreaterThan(0);
  expect(await page.getByTestId("key-chip").count()).toBeGreaterThan(0);
  await page.getByTestId("cohesion-badge").first().click();
  await expect(page.getByRole("dialog", { name: /Cohesion/ })).toBeVisible();
});

test("analyse in browser: the worker turns a synthetic preview into key + BPM and the chip lands in the database", async ({
  page,
}) => {
  await mockPreviews(page);
  await page.goto("/database");
  await page.getByLabel("Search the index").fill("Milonga de Mis Amores");
  const card = page.locator('[data-song="ceafa509bc"]');
  await expect(card).toBeVisible({ timeout: 15000 });
  await expect(card.locator('[data-resolved="true"]')).toBeVisible();
  await card.getByRole("button", { name: /^Analyse/ }).click();
  await expect(page.getByTestId("toast")).toContainText(/Analysed: [A-G][♯]? (major|minor) · \d+ BPM/, {
    timeout: 30000,
  });
  await expect(card.getByText(/· \d+ BPM ·/)).toBeVisible();
  await expect(page.getByTestId("db-changes")).toHaveText(/[1-9]\d* change/);
  // the analysed features survive a reload (IndexedDB)
  await page.waitForTimeout(600);
  await page.reload();
  await page.getByLabel("Search the index").fill("Milonga de Mis Amores");
  await expect(card.getByText(/analysed here/)).toBeVisible({ timeout: 15000 });
});

test("find on services: the sheet lists mocked candidates, Use this stores the choice, Apply year writes the year", async ({
  page,
}) => {
  await mockPreviews(page);
  await page.route("**/api/resolve", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(RESOLVE_MOCK) })
      : route.continue(),
  );
  await compose(page);
  await page.getByRole("button", { name: "Track 1 actions" }).first().click();
  await page.getByRole("menuitem", { name: "Find on services…" }).click();
  const sheet = page.getByTestId("resolve-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("resolve-candidate")).toHaveCount(2);
  await expect(sheet).toContainText("Milonga de Mis Amores");
  await expect(sheet).toContainText("MusicBrainz");
  await sheet.getByRole("button", { name: "Use this" }).first().click();
  await expect(sheet.getByRole("button", { name: /In use/ })).toBeVisible();
  await expect(page.getByTestId("toast")).toContainText("Using Pedro Laurenz");
  const yearChip = sheet.getByRole("button", { name: /Apply year 1937/ });
  if (await yearChip.count()) {
    await yearChip.click();
    await expect(page.getByTestId("toast")).toContainText("Year set to 1937");
  }
  await page.keyboard.press("Escape");
  await page.goto("/database");
  await expect(page.getByTestId("db-changes")).toHaveText(/[1-9]\d* change/);
});

test("history: every compose stores a snapshot; rename, compare and reopen work; survives reload", async ({
  page,
}) => {
  await compose(page);
  await page.waitForTimeout(600);
  await page.goto("/history");
  const rows = page.locator('[id^="history-"]');
  await expect(rows.first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("heading", { level: 2, name: "Today" })).toBeVisible();
  await rows.first().click();
  const detail = page.getByTestId("history-detail");
  await expect(detail).toBeVisible();
  await expect(detail.locator("article[id^=tanda-]").first()).toBeVisible();
  await detail.getByRole("button", { name: "Set actions" }).click();
  await page.getByRole("menuitem", { name: "Rename…" }).click();
  await page.locator("#history-rename").fill("Saturday test night");
  await page.getByRole("dialog", { name: "Rename" }).getByRole("button", { name: "Save" }).click();
  await expect(detail.getByRole("heading", { name: "Saturday test night" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator('[id^="history-"]').first()).toContainText("Saturday test night", {
    timeout: 15000,
  });
  // a second set gives the trend and Compare
  await compose(page);
  await page.waitForTimeout(600);
  await page.goto("/history");
  await expect(page.locator('[id^="history-"]')).toHaveCount(2, { timeout: 15000 });
  await expect(page.getByTestId("score-trend")).toBeVisible();
  await page.locator('[id^="history-"]').first().click();
  await page.getByTestId("history-detail").getByRole("button", { name: "Set actions" }).click();
  await page.getByRole("menuitem", { name: "Compare…" }).click();
  await page
    .getByTestId("history-pick")
    .getByRole("button", { name: /Saturday test night/ })
    .click();
  const cmp = page.getByTestId("history-compare");
  await expect(cmp).toBeVisible();
  await expect(cmp).toContainText("Score factors");
  await expect(cmp).toContainText(/\d+ % → \d+ %/);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.locator('[id^="history-"]').nth(1).click();
  await page.getByTestId("history-detail").getByRole("button", { name: "Reopen in Compose" }).click();
  await expect(page).toHaveURL(/\/#result/);
  await expect(page.locator("#result")).toBeVisible();
});

test("guide: a section edit and the house rules persist after reload and travel with the AI request", async ({
  page,
}) => {
  await page.goto("/guide");
  await page.getByTestId("guide-edit-toggle").click();
  await page.getByRole("button", { name: "Edit Tanda" }).click();
  const box = page.locator("#guide-text");
  await box.fill("In my salón a tanda is four tangos, always.");
  await page.getByTestId("guide-edit").getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("guide-tanda")).toHaveText("In my salón a tanda is four tangos, always.");
  await page.getByRole("button", { name: "Edit What this DJ always does" }).click();
  await page.locator("#guide-text").fill("Never two Canaro tandas before midnight.");
  await page.getByTestId("guide-edit").getByRole("button", { name: "Save" }).click();
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.getByTestId("guide-tanda")).toHaveText("In my salón a tanda is four tangos, always.", {
    timeout: 15000,
  });
  await expect(page.getByTestId("guide-houseRules")).toContainText("Never two Canaro");
  await expect(page.getByTestId("guide-edit-toggle")).toHaveText("Edit (2)");
  // reset restores the built-in text
  await page.getByTestId("guide-edit-toggle").click();
  await page.getByRole("button", { name: "Edit Tanda" }).click();
  await page.getByRole("button", { name: "Reset section" }).click();
  await expect(page.getByTestId("guide-tanda")).toContainText("3–4 recordings of one orchestra");
  // the house rules ride with Tell the DJ
  await compose(page);
  const req = page.waitForRequest((r) => r.url().includes("/api/ai/refine") && r.method() === "POST");
  await page.getByLabel("Tell the DJ").fill("calmer");
  await page.getByRole("button", { name: "Apply" }).click();
  expect((await req).postDataJSON().houseRules).toContain("Never two Canaro");
});

test("feedback chips say what they changed and never leave a custom cycle empty", async ({ page }) => {
  await compose(page);
  await page.getByRole("button", { name: "More vals" }).click();
  await expect(page.getByTestId("toast")).toContainText(/More vals: Cycle → custom TTVTTMTTV/);
  await expect(page.locator("#result")).toHaveAttribute("aria-busy", "false", { timeout: 60000 });
  await expect(page.getByLabel("Cycle", { exact: true })).toHaveValue("custom");
  await expect(page.locator("#custom-pattern")).toHaveValue("TTVTTMTTV");
  await expect(page.getByTestId("change-summary")).toContainText(/score \d+ → \d+/);
  await page.getByRole("button", { name: "More playful" }).click();
  await expect(page.getByTestId("toast")).toContainText(/More playful: .*Mood → playful/);
});

test("tell the DJ without a key reports exactly what was applied and what was not", async ({ request }) => {
  const r = await request.post("/api/ai/refine", {
    data: { options: { hours: 4 }, instruction: "no Canaro, more Pugliese and a D'Arienzo vals tanda" },
  });
  const j = await r.json();
  expect(j.source).toBe("keywords");
  expect(j.applied).toEqual(expect.arrayContaining(["no Francisco Canaro", "more Osvaldo Pugliese"]));
  expect(j.notApplied).toEqual(["a D'Arienzo vals tanda"]);
  expect(j.note).toMatch(/Applied: no Francisco Canaro, more Osvaldo Pugliese\./);
  expect(j.note).toMatch(/Could not apply: "a D'Arienzo vals tanda"/);
  expect(j.feedback).not.toContain("more-dramatic");
  expect(j.options.excludeOrchestras).toContain("francisco-canaro");
  expect(j.options.includeOrchestras).toContain("osvaldo-pugliese");
});

test("compose sends only explicit keys plus the explicit list; the DJ CSV genre reads Tango / Vals; exports carry paths", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pin cortina length" }).click();
  await page.getByLabel("Era", { exact: true }).selectOption("nuevo");
  const req = page.waitForRequest((r) => r.url().includes("/api/compose") && r.method() === "POST");
  await page.getByRole("button", { name: /Compose the night/ }).click();
  const body = (await req).postDataJSON();
  expect(body.explicit).toEqual(expect.arrayContaining(["eras", "cortinaLengthSec"]));
  // the size steppers show a number, so that number is always a promise (nuevo preset shows 3)
  expect(body.explicit).toContain("tangoTandaSize");
  expect(body.tangoTandaSize).toBe(3);
  expect(body.eras).toEqual(["nuevo"]);
  expect(body.name).toMatch(/Milonga · 4 h · Nuevo/);
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  const p = await (await request.post("/api/compose", { data: { hours: 2, seed: 7 } })).json();
  const csv = await (await request.post("/api/export", { data: { playlist: p, format: "serato" } })).text();
  expect(csv).not.toContain("Tango tango");
  expect(csv).toMatch(/,"Tango",/);
  expect(csv).toMatch(/,"location"$/m);
  const xspf = await (
    await request.post("/api/export", { data: { playlist: p, format: "xspf", folder: "/Users/dj/Tango" } })
  ).text();
  expect(xspf).toContain("<location>file:///Users/dj/Tango/");
});

test("export → webhook POSTs the chosen format to the DJ's URL (browser-only setting)", async ({ page }) => {
  let received: { body: string; format: string | undefined } | null = null;
  await page.route("https://hook.test/**", (route) => {
    received = { body: route.request().postData() ?? "", format: route.request().headers()["x-tdj-format"] };
    route.fulfill({ status: 200, body: "ok", headers: { "access-control-allow-origin": "*" } });
  });
  await page.goto("/settings");
  await page.locator("#connector-webhook").click();
  await page.locator("#connector-webhook-url").fill("https://hook.test/catch");
  await page.getByRole("dialog", { name: "Your automation" }).getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#connector-webhook")).toContainText("Set");
  await expect(page.locator("#connector-deezer")).toContainText(/Deezer/);
  await page.waitForTimeout(600); // debounce → IndexedDB
  await compose(page);
  await page.getByRole("button", { name: "Export" }).first().click();
  const sheet = page.getByTestId("export-sheet");
  await expect(sheet).toContainText(/\d+ songs \+ \d+ cortinas/);
  await sheet.locator("#send-webhook").click();
  await expect(page.getByTestId("toast")).toContainText("Webhook accepted", { timeout: 20000 });
  expect(received!.format).toBe("m3u8");
  expect(received!.body).toContain("#EXTM3U");
  // never persisted server-side: the PUT would carry no connectors (browser mode here, so no PUT at all)
});

test("mobile: no horizontal overflow after compose, cards fill the column, tab bar keeps every link while minimised", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    ...devices["iPhone 15 Pro"],
    baseURL: process.env.TDJ_URL ?? "http://localhost:3000",
  });
  const page = await ctx.newPage();
  await compose(page);
  await page.waitForTimeout(1500); // entrance animations settle
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
    card: document.querySelector("#tanda-1")?.getBoundingClientRect().width ?? 0,
    main: document.querySelector("main")?.getBoundingClientRect().width ?? 0,
    over: [...document.querySelectorAll("#result *")].filter((el) => {
      const cs = getComputedStyle(el);
      if (cs.position === "fixed" || cs.opacity === "0" || cs.display === "none") return false;
      return el.getBoundingClientRect().right > window.innerWidth + 1;
    }).length,
  }));
  expect(m.sw).toBeLessThanOrEqual(m.iw);
  expect(m.over).toBe(0);
  expect(m.card).toBeGreaterThan(m.iw - 40);
  expect(await page.getByRole("navigation", { name: "Primary mobile" }).locator("a").count()).toBe(6);
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(150);
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(600);
  await expect(page.getByTestId("tab-bar")).toHaveAttribute("data-min", "true");
  expect(await page.getByTestId("tab-bar").locator("a").count()).toBe(6);
  // the mini-player sits above the accessory bar on phones
  await page.goto("/library");
  await page.waitForTimeout(300);
  const gap = await page.evaluate(() => {
    const tab = document.querySelector('[data-testid="tab-bar"]')!.getBoundingClientRect();
    const search = document.querySelector('button[aria-label="Search"]')!.getBoundingClientRect();
    return search.left - tab.right;
  });
  expect(gap).toBeGreaterThanOrEqual(8);
  await ctx.close();
});

test("a práctica context never shrinks the tango tandas the stepper shows", async ({ page }) => {
  await page.goto("/");
  const req = page.waitForRequest((r) => r.url().includes("/api/compose") && r.method() === "POST");
  await page.getByLabel("Event type").selectOption("practica");
  await page.getByRole("button", { name: /Compose the night/ }).click();
  const body = (await req).postDataJSON();
  expect(body.explicit).toContain("tangoTandaSize");
  expect(body.tangoTandaSize).toBe(4);
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  const counts = await page
    .locator("#result article")
    .evaluateAll((cards) =>
      cards.map((c) => ({ rhythm: c.getAttribute("data-rhythm"), n: c.querySelectorAll("ol > li").length })),
    );
  for (const c of counts.filter((x) => x.rhythm === "tango")) expect(c.n).toBe(4);
});

test("cortina preview: the Preview cortina button starts the mini-player and keeps playing", async ({
  page,
}) => {
  await page.route(/\/api\/resolve/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        candidates: [
          {
            provider: "deezer",
            id: "123",
            title: "x",
            artist: "y",
            previewUrl: "https://preview.test/c.wav",
          },
        ],
        suggestions: {},
      }),
    }),
  );
  await page.route(/dzcdn\.net|preview\.test|\/api\/preview\?/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "audio/wav",
      body: WAV,
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: /Compose the night/ })
    .first()
    .click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  const row = page.getByRole("button", { name: /^Cortina/ }).first();
  await row.scrollIntoViewIfNeeded();
  await row.click();
  await page
    .getByRole("button", { name: /Preview cortina/ })
    .first()
    .click();
  const mini = page.locator("[data-testid=mini-player]");
  await expect(mini).toContainText(/cortina · \d+ s/);
  await expect(mini.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect
    .poll(
      async () =>
        page
          .locator("audio")
          .first()
          .evaluate((a: HTMLAudioElement) => (a.paused ? -1 : a.currentTime)),
      {
        timeout: 8000,
      },
    )
    .toBeGreaterThan(0);
});
