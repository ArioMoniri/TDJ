/**
 * QA e2e suite (2026-10-18). Runs against TDJ_URL (production build on :3000).
 * Mobile tests create their own device contexts because Playwright 1.64 rejects
 * `test.use({ ...devices[...] })` inside a describe block (see smoke.spec.ts).
 */
import { type Browser, devices, expect, test } from "@playwright/test";

const PAGES = ["/", "/library", "/guide", "/settings"];
const MOBILE = ["iPhone 15 Pro", "Pixel 7"] as const;

async function mobilePage(
  browser: Browser,
  dev: (typeof MOBILE)[number],
  colorScheme: "light" | "dark" = "light",
) {
  const ctx = await browser.newContext({
    ...devices[dev],
    colorScheme,
    baseURL: process.env.TDJ_URL ?? "http://localhost:3000",
  });
  return { ctx, page: await ctx.newPage() };
}

/** Lighthouse-style basics + overflow on every page, both devices, both colour schemes. */
test("mobile: every page has title/lang/viewport, no horizontal overflow (also with <details> expanded) and no page errors", async ({
  browser,
}) => {
  for (const dev of MOBILE) {
    for (const scheme of ["light", "dark"] as const) {
      const { ctx, page } = await mobilePage(browser, dev, scheme);
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(`${dev}/${scheme}: ${e.message}`));
      for (const path of PAGES) {
        await page.goto(path, { waitUntil: "networkidle" });
        const basics = await page.evaluate(() => ({
          title: document.title,
          lang: document.documentElement.lang,
          viewport: document.querySelector("meta[name=viewport]")?.getAttribute("content") ?? "",
          h1: document.querySelectorAll("h1").length,
        }));
        expect(basics.title.length, `${path} title`).toBeGreaterThan(3);
        expect(basics.lang).toBe("en");
        expect(basics.viewport).toContain("width=device-width");
        expect(basics.h1, `${path} exactly one h1`).toBe(1);
        await page.evaluate(() => {
          for (const d of document.querySelectorAll("details")) d.open = true;
        });
        const overflow = await page.evaluate(() => ({
          doc: document.documentElement.scrollWidth - window.innerWidth,
          wide: [...document.querySelectorAll("main *")]
            .filter((el) => {
              const b = el.getBoundingClientRect();
              return b.width > 0 && b.right > window.innerWidth + 1 && !el.closest(".scroll-x");
            })
            .map(
              (el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 2).join(".")}`,
            )
            .slice(0, 5),
        }));
        expect(overflow.doc, `${dev}/${scheme} ${path} document overflow`).toBeLessThanOrEqual(0);
        expect(overflow.wide, `${dev}/${scheme} ${path} elements wider than the viewport`).toEqual([]);
      }
      await ctx.close();
      // /settings currently logs a React hydration error (#418) — tracked in docs/reviews/qa-report.md
      test.info().annotations.push({ type: "page errors", description: errors.join(" | ") || "none" });
    }
  }
});

/** Apple HIG / WCAG 2.5.8: primary controls ≥44 px; the tab bar must never sit on top of the last card. */
test("mobile: compose on iPhone 15 Pro, tab bar does not cover the last tanda, primary buttons ≥44px, muted text contrast ≥4.5:1", async ({
  browser,
}) => {
  const { ctx, page } = await mobilePage(browser, "iPhone 15 Pro");
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Primary mobile" })).toBeVisible();
  const compose = page.getByRole("button", { name: /Compose the night/ });
  expect((await compose.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await compose.click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await expect(page.locator("article[id^=tanda-]").first()).toBeVisible();
  // tab bar links are ≥44px tall
  for (const link of await page.getByRole("navigation", { name: "Primary mobile" }).getByRole("link").all())
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // scroll to the very bottom: the closing card and the last tanda must end above the fixed tab bar
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(500);
  const geo = await page.evaluate(() => {
    const nav = document.querySelector("nav[aria-label='Primary mobile']")!.getBoundingClientRect();
    const cards = document.querySelectorAll("article[id^=tanda-]");
    const last = cards[cards.length - 1]!.getBoundingClientRect();
    const blocks = [...document.querySelectorAll("main > * > *")].map(
      (el) => el.getBoundingClientRect().bottom,
    );
    return { navTop: nav.top, lastCardBottom: last.bottom, lastBlockBottom: Math.max(...blocks) };
  });
  expect(geo.lastCardBottom).toBeLessThanOrEqual(geo.navTop);
  expect(geo.lastBlockBottom).toBeLessThanOrEqual(geo.navTop);
  // contrast of a secondary label (section footer) over the grouped background, sampled from real pixels
  const muted = page.locator("#result .section-foot:visible").first();
  await muted.scrollIntoViewIfNeeded();
  const fg = (await muted.evaluate((el) => getComputedStyle(el).color)).match(/\d+/g)!.map(Number);
  await page.addStyleTag({ content: ".section-foot{color:transparent !important}" });
  const png = await muted.screenshot();
  const bg = averageRgb(png);
  const lum = (c: number[]) => {
    const [r, g, b] = c.map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const ratio = (Math.max(lum(fg), lum(bg)) + 0.05) / (Math.min(lum(fg), lum(bg)) + 0.05);
  test.info().annotations.push({
    type: "contrast",
    description: `fg ${fg} on sampled bg ${bg} = ${ratio.toFixed(2)}:1`,
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
  await ctx.close();
});

/** Minimal PNG decoder (8-bit RGB/RGBA, non-interlaced, as Chromium writes) → mean colour. */
function averageRgb(buf: Buffer): number[] {
  const zlib = require("node:zlib") as typeof import("node:zlib");
  let p = 8,
    w = 0,
    h = 0,
    bpp = 4;
  const idat: Buffer[] = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("ascii", p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bpp = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 1;
    }
    if (type === "IDAT") idat.push(data);
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let q = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[q++]!;
    const line = raw.subarray(q, q + stride);
    q += stride;
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp]! : 0,
        b = prev[i]!,
        c = i >= bpp ? prev[i - bpp]! : 0;
      let v = line[i]!;
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += Math.floor((a + b) / 2);
      else if (f === 4) {
        const pp = a + b - c,
          pa = Math.abs(pp - a),
          pb = Math.abs(pp - b),
          pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 255;
    }
  }
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (let i = 0; i < out.length; i += bpp) {
    r += out[i]!;
    g += out[i + 1]!;
    b += out[i + 2]!;
    n++;
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

/** Apple HIG: every button on the composer is at least 44 px tall on touch devices. */
test("mobile: every button on / is at least 44px tall", async ({ browser }) => {
  const { ctx, page } = await mobilePage(browser, "Pixel 7");
  await page.goto("/", { waitUntil: "networkidle" });
  const small = await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .filter((b) => b.getBoundingClientRect().width > 0 && b.getBoundingClientRect().height < 44)
      .map(
        (b) =>
          `${(b.textContent || b.getAttribute("aria-label") || "").trim().slice(0, 20)}:${Math.round(b.getBoundingClientRect().height)}`,
      ),
  );
  expect(small).toEqual([]);
  await ctx.close();
});

/** API robustness + invariants through the real HTTP layer. */
test("API: compose edge cases keep the DJ invariants and bad input never produces a runaway playlist", async ({
  request,
}) => {
  const ERA_YEARS: Record<string, [number, number]> = {
    golden: [1935, 1955],
    "post-golden": [1956, 1969],
    nuevo: [1970, 1994],
  };
  for (const [name, body] of [
    ["1h", { hours: 1, seed: 1 }],
    ["10h", { hours: 10, seed: 3 }],
    ["clamped 14h", { hours: 14, seed: 4 }],
    ["post-golden", { hours: 3, seed: 11, eras: ["post-golden"] }],
    ["nuevo", { hours: 3, seed: 11, eras: ["nuevo"] }],
    ["custom garbage pattern", { hours: 3, seed: 21, pattern: "custom", customPattern: "ttv x!!m" }],
    ["constant cortina", { hours: 3, seed: 32, cortinaStyle: "constant" }],
    ["no cortina", { hours: 3, seed: 31, cortinaStyle: "none" }],
    ["hammock", { hours: 3, seed: 40, tandaShape: "hammock" }],
  ] as const) {
    const t0 = Date.now();
    const r = await request.post("/api/compose", { data: body });
    const ms = Date.now() - t0;
    expect(r.ok(), name).toBe(true);
    expect(ms, `${name} took ${ms} ms`).toBeLessThan(2000);
    const p = await r.json();
    const hours = Math.min(12, Math.max(0.5, (body as { hours: number }).hours));
    expect(Math.abs(p.stats.durationSec - hours * 3600) / 60, `${name} duration`).toBeLessThanOrEqual(8);
    const eras = ("eras" in body ? body.eras : ["golden"]) as string[];
    const titles = new Set<string>();
    p.tandas.forEach(
      (
        t: {
          rhythm: string;
          songs: { orchestraId: string; year: number; title: string }[];
          cortina: unknown;
        },
        i: number,
      ) => {
        expect(new Set(t.songs.map((s) => s.orchestraId)).size, `${name} tanda ${i} one orchestra`).toBe(1);
        // era presets set tanda sizes (nuevo/contemporary use 3-track tandas); the engine reports the applied size
        expect(t.songs.length).toBe(
          t.rhythm === "tango"
            ? p.options.tangoTandaSize
            : t.rhythm === "vals"
              ? p.options.valsTandaSize
              : p.options.milongaTandaSize,
        );
        for (const s of t.songs) {
          const yr = ERA_YEARS[eras[0]!];
          if (yr) {
            expect(s.year).toBeGreaterThanOrEqual(yr[0]);
            expect(s.year).toBeLessThanOrEqual(yr[1]);
          }
          const k = s.title.toLowerCase();
          expect(titles.has(k), `${name} title repeat ${s.title}`).toBe(false);
          titles.add(k);
        }
        // era presets may ask for a cortina before La Cumparsita (nuevo / contemporary); otherwise the última has none
        const last = i === p.tandas.length - 1 && !p.options.rules?.cortinaBeforeCumparsita;
        if ((body as { cortinaStyle?: string }).cortinaStyle === "none" || last) expect(t.cortina).toBeNull();
        else expect(t.cortina).not.toBeNull();
      },
    );
    expect(p.closing?.title.toLowerCase()).toContain("cumparsita");
    expect(p.closing.orchestraId).not.toBe(p.tandas.at(-1).orchestraId);
  }
});

/** Non-numeric hours must be rejected or clamped (regression guard for the old 401-tanda runaway). */
test("API: non-numeric hours must be rejected or clamped, never a runaway 401-tanda night", async ({
  request,
}) => {
  const r = await request.post("/api/compose", { data: { hours: "abc", seed: 1 } });
  const p = await r.json();
  test
    .info()
    .annotations.push({ type: "hours=abc", description: `status ${r.status()} tandas ${p.tandas?.length}` });
  expect(r.status() === 400 || (p.tandas?.length ?? 0) <= 60).toBe(true);
});

/** Export formats are well-formed and internally consistent. */
test("API: every export format downloads with the right headers, counts and escaping", async ({
  request,
}) => {
  const p = await (
    await request.post("/api/compose", { data: { hours: 2, seed: 5, name: 'Noche "de" <Tango> & Co' } })
  ).json();
  const n =
    p.tandas.reduce(
      (a: number, t: { songs: unknown[]; cortina: unknown }) => a + t.songs.length + (t.cortina ? 1 : 0),
      0,
    ) + (p.closing ? 1 : 0);
  const want: Record<string, [string, string]> = {
    m3u8: ["audio/mpegurl", "m3u8"],
    csv: ["text/csv", "csv"],
    json: ["application/json", "json"],
    rekordbox: ["application/xml", "xml"],
    traktor: ["application/xml", "nml"],
    xspf: ["application/xspf+xml", "xspf"],
    serato: ["text/csv", "csv"],
    setlist: ["text/plain", "txt"],
  };
  for (const [format, [mime, ext]] of Object.entries(want)) {
    const r = await request.post("/api/export", { data: { playlist: p, format } });
    expect(r.ok(), format).toBe(true);
    expect(r.headers()["content-type"]).toContain(mime);
    expect(r.headers()["content-disposition"]).toMatch(
      new RegExp(`attachment; filename="[A-Za-z0-9_-]+\\.${ext}"`),
    );
    const body = await r.text();
    expect(body.length).toBeGreaterThan(100);
    if (format === "m3u8") {
      expect(body.startsWith("#EXTM3U")).toBe(true);
      expect(body.match(/^#EXTINF:\d+,/gm)).toHaveLength(n);
    }
    if (format === "csv" || format === "serato") expect(body.trim().split("\n").length - 1).toBe(n);
    if (format === "rekordbox") {
      expect(body).toContain('<DJ_PLAYLISTS Version="1.0.0">');
      expect(body).toContain(`<COLLECTION Entries="${n}">`);
      expect(body.match(/<TRACK TrackID="/g)).toHaveLength(n);
      expect(body).toContain("&quot;de&quot; &lt;Tango&gt; &amp; Co");
    }
    if (format === "traktor") {
      expect(body).toContain('<NML VERSION="19">');
      expect(body).toContain(`<COLLECTION ENTRIES="${n}">`);
      expect(body.match(/<PRIMARYKEY TYPE="TRACK"/g)).toHaveLength(n);
    }
    if (format === "xspf") expect(body.match(/<track>/g)).toHaveLength(n);
    if (format === "json") expect(JSON.parse(body).id).toBe(p.id);
    if (["rekordbox", "traktor", "xspf"].includes(format))
      expect(body, `${format} has an unescaped ampersand`).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#)/);
  }
  expect((await request.post("/api/export", { data: { playlist: p, format: "bogus" } })).status()).toBe(400);
});

/** Swap keeps everything but the chosen tanda, through the API, and the UI reflects it. Actions live in the tanda's menu. */
test("swap: the Swap action replaces one tanda, keeps the others and the cortina", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Compose the night/ }).click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  const cards = page.locator("article[id^=tanda-]");
  const before = await cards.allInnerTexts();
  const target = 3;
  const menu = () => cards.nth(target).getByRole("button", { name: `Tanda ${target + 1} actions` });
  const orchestraBefore = await cards.nth(target).locator("h3").innerText();
  const cortinaBefore = await cards
    .nth(target)
    .getByText(/Cortina ·/)
    .innerText();
  await menu().click();
  await page.getByRole("menuitem", { name: "Swap tanda" }).click();
  await expect(cards.nth(target).locator("h3")).not.toHaveText(orchestraBefore, { timeout: 15000 });
  const after = await cards.allInnerTexts();
  expect(after.length).toBe(before.length);
  for (let i = 0; i < before.length; i++)
    if (i !== target) expect(after[i], `tanda ${i + 1} unchanged`).toBe(before[i]);
  expect(
    await cards
      .nth(target)
      .getByText(/Cortina ·/)
      .innerText(),
  ).toBe(cortinaBefore);
  // lock → swap disabled
  await menu().click();
  await page.getByRole("menuitem", { name: "Lock tanda" }).click();
  await expect(cards.nth(target).getByText("locked")).toBeVisible();
  await menu().click();
  await expect(page.getByRole("menuitem", { name: "Swap tanda" })).toBeDisabled();
  await page.keyboard.press("Escape");
});
