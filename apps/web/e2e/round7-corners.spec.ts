/**
 * Round 7 (docs/reviews/round7-corners.md): every glass element keeps its rounded outline.
 * For each element and each of its corners, the pixel 2 px inside the bounding box (diagonally: outside the
 * rounded shape) must be the backdrop colour sampled 2 px outside the box (Δ ≤ 12), so nothing (fill, blur,
 * sheen, highlight, hover) paints a square block behind the capsule. A full-viewport shade (z-index 20, under
 * every bar and sheet) makes the backdrop uniform, so the comparison is about the element and not the page.
 * Runs in the `corners-*` projects: 430 (phone), 820 (tablet) and 1440 (desktop), dark and light.
 */
import { inflateSync } from "node:zlib";
import { expect, type Locator, type Page, test } from "@playwright/test";

/** Decodes a small RGB/RGBA 8-bit PNG (any filter) into a pixel accessor. */
function decode(buf: Buffer) {
  let p = 8;
  let w = 0;
  let h = 0;
  let bpp = 4;
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
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let q = 0;
  for (let row = 0; row < h; row++) {
    const f = raw[q++]!;
    const line = raw.subarray(q, q + stride);
    q += stride;
    const prev = row ? out.subarray((row - 1) * stride, row * stride) : Buffer.alloc(stride);
    const cur = out.subarray(row * stride, (row + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp]! : 0;
      const b = prev[i]!;
      const c = i >= bpp ? prev[i - bpp]! : 0;
      let v = line[i]!;
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += Math.floor((a + b) / 2);
      else if (f === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - b);
        const pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 255;
    }
  }
  return {
    w,
    h,
    px: (x: number, y: number) => {
      const o = (y * w + x) * bpp;
      return [out[o]!, out[o + 1]!, out[o + 2]!];
    },
  };
}
const dist = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i]!)));

type Corner = "tl" | "tr" | "bl" | "br";
const ALL: Corner[] = ["tl", "tr", "bl", "br"];
const TOP: Corner[] = ["tl", "tr"];

/** A uniform backdrop under the control layer: the page colour, above the content, below every bar and sheet. */
async function shade(page: Page) {
  await page.evaluate(() => {
    document.getElementById("qa-shade")?.remove();
    const d = document.createElement("div");
    d.id = "qa-shade";
    d.style.cssText =
      "position:fixed;inset:0;z-index:20;pointer-events:none;background:rgb(var(--bg-grouped))";
    document.body.appendChild(d);
  });
}

/**
 * `ring`: a 1 px ring drawn outside the box (the popover's spread shadow) is part of the shape: the box is grown
 * by it before sampling. `edge`: a band with no corners is sampled straight across its foot, not diagonally.
 */
async function corners(
  page: Page,
  loc: Locator,
  label: string,
  which: Corner[] = ALL,
  { ring = 0, edge = false }: { ring?: number; edge?: boolean } = {},
) {
  await expect(loc, label).toBeVisible();
  const shown = await loc.evaluate((el) => {
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && Number(cs.opacity) > 0.99;
  });
  expect(shown, `${label}: fully shown`).toBe(true);
  const b0 = (await loc.boundingBox())!;
  const box = { x: b0.x - ring, y: b0.y - ring, width: b0.width + 2 * ring, height: b0.height + 2 * ring };
  const vp = page.viewportSize()!;
  const pad = 8;
  const clip = {
    x: Math.max(0, box.x - pad),
    y: Math.max(0, box.y - pad),
    width: Math.min(vp.width, box.x + box.width + pad) - Math.max(0, box.x - pad),
    height: Math.min(vp.height, box.y + box.height + pad) - Math.max(0, box.y - pad),
  };
  const img = decode(await page.screenshot({ clip, scale: "device", animations: "disabled" }));
  const s = img.w / clip.width;
  const ox = (box.x - clip.x) * s;
  const oy = (box.y - clip.y) * s;
  const bw = box.width * s;
  const bh = box.height * s;
  const d = 2 * s;
  const pts: Record<Corner, { inside: [number, number]; outside: [number, number] }> = {
    tl: { inside: [ox + d, oy + d], outside: [ox - d, oy - d] },
    tr: { inside: [ox + bw - d, oy + d], outside: [ox + bw + d, oy - d] },
    bl: { inside: [ox + d, oy + bh - d], outside: [edge ? ox + d : ox - d, oy + bh + d] },
    br: { inside: [ox + bw - d, oy + bh - d], outside: [edge ? ox + bw - d : ox + bw + d, oy + bh + d] },
  };
  let checked = 0;
  for (const c of which) {
    const [ix, iy] = pts[c].inside.map(Math.round) as [number, number];
    let [qx, qy] = pts[c].outside.map(Math.round) as [number, number];
    // a corner on the viewport edge (a phone sheet spans the width): sample straight above / beside instead
    if (qx < 0 || qx >= img.w) qx = ix;
    if (qy < 0 || qy >= img.h) qy = iy;
    if (qx === ix && qy === iy) continue;
    const a = img.px(ix, iy);
    const b = img.px(qx, qy);
    expect(dist(a, b), `${label}: ${c} inside ${a} vs backdrop ${b}`).toBeLessThanOrEqual(12);
    checked++;
  }
  expect(checked, `${label}: at least one corner inside the viewport`).toBeGreaterThan(0);
}

/** The element's material lives on its `::after` layer (round 7) and still blurs. */
async function hasMaterial(loc: Locator, label: string) {
  const bf = await loc.evaluate((el) => getComputedStyle(el, "::after").backdropFilter);
  expect(bf, `${label}: material layer`).toMatch(/blur/);
}

const kind = (page: Page) => {
  const w = page.viewportSize()!.width;
  return w < 640 ? "phone" : w < 1024 ? "tablet" : "desktop";
};

async function compose(page: Page) {
  await page
    .getByRole("button", { name: /Compose the night/ })
    .first()
    .click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(1500);
}

/** The bars of this breakpoint, in their current state. */
async function bars(page: Page, state: string) {
  const k = kind(page);
  if (k === "phone") {
    const tab = page.getByTestId("tab-bar");
    await corners(page, tab, `${state}: tab bar`);
    await hasMaterial(tab, "tab bar");
    for (const id of ["primary-bar", "primary-pill"]) {
      const el = page.getByTestId(id);
      if ((await el.count()) === 0) continue; // the composer's bar: not on /admin
      const on = await el.evaluate((e) => getComputedStyle(e).visibility === "visible");
      if (on) await corners(page, el, `${state}: ${id}`);
    }
  } else if (k === "tablet") {
    const pill = page.getByTestId("nav-pill");
    await corners(page, pill, `${state}: nav pill`);
    await hasMaterial(pill, "nav pill");
  } else {
    // lg: the toolbar is a band (no corners); its foot must blend into the page
    const bar = page.getByTestId("page-toolbar");
    if (await bar.getAttribute("data-collapsed"))
      await corners(page, bar, `${state}: toolbar band`, ["bl", "br"], { edge: true });
  }
}

test("bars before a set, and on the admin page", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(600);
  await shade(page);
  await bars(page, "scroll 0");
  await page.evaluate(() => window.scrollBy(0, 500));
  await page.waitForTimeout(600);
  await bars(page, "scrolled");
  await page.goto("/admin");
  await page.waitForTimeout(600);
  await shade(page);
  await bars(page, "admin");
});

test("bars, mini player, menu and sheets with a composed set", async ({ page }) => {
  const k = kind(page);
  await page.goto("/");
  await compose(page);
  await shade(page);
  await bars(page, "set, top");
  await page.evaluate(() => window.scrollBy(0, 900));
  await page.waitForTimeout(700);
  await bars(page, "set, scrolled down");
  await page.evaluate(() => window.scrollBy(0, -120));
  await page.waitForTimeout(700);
  await bars(page, "set, scrolled up");

  // mini player: a transform-animated glass card
  const play = page.getByRole("button", { name: /^Play / }).first();
  await play.scrollIntoViewIfNeeded();
  await play.click();
  const player = page.getByTestId("mini-player");
  await expect(player).toBeVisible();
  await page.waitForTimeout(900);
  await corners(page, player, "mini player");
  await hasMaterial(player, "mini player");
  await page.getByRole("button", { name: "Close player" }).click();
  await expect(player).toBeHidden();

  // card menu: popover (tablet, desktop) or sheet (phone), opened from inside a tanda card
  await page.locator("#tanda-1").scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Tanda 1 actions", exact: true }).click();
  if (k === "phone") {
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(900);
    // the sheet spans the viewport (not the card it was opened from) and its rows are inside it
    const box = (await sheet.boundingBox())!;
    expect(box.x, "menu sheet starts at the viewport edge").toBeLessThanOrEqual(1);
    expect(box.width, "menu sheet spans the viewport").toBeGreaterThanOrEqual(page.viewportSize()!.width - 2);
    await expect(sheet.getByRole("menuitem").first()).toBeInViewport();
    await corners(page, sheet, "menu sheet", TOP);
    await hasMaterial(sheet, "menu sheet");
  } else {
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await page.waitForTimeout(500);
    await corners(page, menu, "menu", ALL, { ring: 1 });
    await menu.getByRole("menuitem").first().hover();
    await page.waitForTimeout(200);
    await corners(page, menu, "menu, first row hovered", ALL, { ring: 1 });
    await menu.getByRole("menuitem").last().hover();
    await page.waitForTimeout(200);
    await corners(page, menu, "menu, last row hovered", ALL, { ring: 1 });
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // export sheet
  if (k === "phone") {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(600);
  }
  await page.getByRole("button", { name: "Export", exact: true }).locator("visible=true").first().click();
  const exportSheet = page.getByTestId("export-sheet");
  await expect(exportSheet).toBeVisible();
  await page.waitForTimeout(1000);
  await corners(page, exportSheet, "export sheet", k === "phone" ? TOP : ALL);
  await hasMaterial(exportSheet, "export sheet");
  await page.keyboard.press("Escape");
  await expect(exportSheet).toBeHidden();

  if (k === "phone") {
    const score = page.getByTestId("score-button");
    await score.scrollIntoViewIfNeeded();
    await score.click();
    const adjust = page.getByTestId("adjust-sheet");
    await expect(adjust).toBeVisible();
    await page.waitForTimeout(1000);
    await corners(page, adjust, "adjust sheet", TOP);
    await page.keyboard.press("Escape");
    await expect(adjust).toBeHidden();
  }
});
