/**
 * The rule check before an edit (lib/ruleCheck.ts, core editCheck.ts): a swap that breaks a tanda rule asks first,
 * with the facts and suggestions; "Use suggestion" keeps the rule, "Do it as I said" applies the edit as a one-night
 * exception ("Accepted by you (this night)"), which a freshly composed night never inherits; a legal swap asks
 * nothing; an AI edit (a mock agent) goes through the same check; the sheet fits a phone and an iPad with every
 * button ≥ 44 px. RULECHECK_SHOTS=<dir> also writes the iPhone 15 Pro captures of the sheet in English and Turkish.
 */
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import http from "node:http";
import type { Socket } from "node:net";
import { join } from "node:path";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { clickHydrated } from "./hydration";

/** De Pura Cepa (D'Agostino, 1943): an instrumental side, offered for a chair of tanda 1 (D'Agostino / Vargas) */
const INSTRUMENTAL = "De Pura Cepa";
const INSTRUMENTAL_ID = "1a194faf35";

async function openFeatured(page: Page) {
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
}

/** the Swap sheet of tanda 1, side 2 */
async function openSwap(page: Page) {
  const card = page.locator("#result [data-tanda]").first();
  const row = card.locator("li[data-song]").nth(1);
  // (right after a sheet closes, its focus hand-back can close a menu that just opened: open it until it stays)
  await expect(page.getByTestId("swap-sheet")).toHaveCount(0);
  await expect(async () => {
    await row.locator('button[aria-haspopup="menu"]').first().click();
    await page.locator('[role="menuitem"]').first().click({ timeout: 2000 });
  }).toPass({ timeout: 20000 });
  const sheet = page.getByTestId("swap-sheet");
  await expect(sheet).toBeVisible();
  return { sheet, card };
}

/** search-and-swap the instrumental side into the vocal tanda: the rule sheet opens */
async function breakTheRule(page: Page) {
  const { sheet, card } = await openSwap(page);
  await sheet.locator("#swap-search").fill(INSTRUMENTAL);
  const hit = sheet.locator(`[data-testid="swap-excluded"][data-song-id="${INSTRUMENTAL_ID}"]`).first();
  await expect(hit).toBeVisible({ timeout: 20000 });
  await hit.locator("button").first().click();
  const rule = page.getByTestId("rule-sheet");
  await expect(rule).toBeVisible({ timeout: 20000 });
  return { rule, sheet, card };
}

test("a swap that breaks a tanda rule: the facts, a suggestion that keeps one singer, or as said for this night only", async ({
  page,
}) => {
  await openFeatured(page);
  let { rule, card } = await breakTheRule(page);
  await expect(rule).toContainText("This breaks a tanda rule");
  await expect(rule.getByTestId("rule-violation").first()).toContainText("mixes instrumental and sung sides");
  await expect(rule.getByTestId("rule-fact").first()).toContainText(
    `${INSTRUMENTAL} exists only instrumental`,
  );
  await expect(rule.getByTestId("rule-fact").first()).toContainText("Angel Vargas");
  await expect(rule.getByTestId("rule-suggestion").first()).toBeVisible({ timeout: 30000 });
  expect(await rule.getByTestId("rule-suggestion").count()).toBeLessThanOrEqual(3);
  // "Use suggestion": the tanda stays one singer
  await rule.getByTestId("rule-use-suggestion").click();
  await expect(rule).toBeHidden();
  await expect(card).not.toContainText(INSTRUMENTAL);
  await expect(page.getByTestId("night-exceptions")).toHaveCount(0);

  // again, "Do it as I said": the side plays, the night's panel says it is accepted for this night
  ({ rule, card } = await breakTheRule(page));
  await expect(rule.getByTestId("rule-as-said")).toContainText("This night only");
  await rule.getByTestId("rule-as-said").click();
  await expect(rule).toBeHidden();
  await expect(card).toContainText(INSTRUMENTAL, { timeout: 20000 });
  const panel = page.getByTestId("night-exceptions");
  await expect(panel).toContainText("Accepted by you (this night)");
  await expect(panel.getByTestId("night-exception")).toHaveCount(1);
  await expect(panel).toContainText("all instrumental or all sung");

  // Database → Memory lists it under the night
  await page.waitForTimeout(800);
  await page.goto("/database");
  await page.getByRole("radio", { name: "Memory" }).click();
  await expect(page.getByTestId("memory-night-exceptions")).toContainText(INSTRUMENTAL);

  // a freshly composed night (Regenerate keeps the pinned tanda, as the DJ's) has no such exception
  await page.goto("/");
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId("night-exceptions")).toHaveCount(1);
  const idNow = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("tdj-v1") ?? "{}")?.state?.playlist?.id as string);
  const first = await idNow();
  await page.getByTestId("toolbar-regenerate").click();
  await expect.poll(idNow, { timeout: 120000 }).not.toBe(first);
  await expect(page.locator("#result")).toBeVisible();
  await expect(page.getByTestId("night-exceptions")).toHaveCount(0);
});

test("a legal swap applies at once: no rule sheet", async ({ page }) => {
  await openFeatured(page);
  const { sheet } = await openSwap(page);
  await expect(sheet.getByTestId("swap-option").first()).toBeVisible({ timeout: 20000 });
  await sheet.getByTestId("swap-option").first().click();
  await expect(sheet).toBeHidden({ timeout: 20000 });
  await expect(page.getByTestId("toast")).toContainText(/Swapped in/);
  await expect(page.getByTestId("rule-sheet")).toHaveCount(0);
});

/** a minimal ACP agent on a local WebSocket (as round22-ai.spec.ts): every prompt gets `reply` */
function mockAgent(reply: string) {
  const server = http.createServer((_q, r) => r.writeHead(426).end());
  const send = (sock: Socket, obj: unknown) => {
    const data = Buffer.from(JSON.stringify(obj));
    const head =
      data.length < 126
        ? Buffer.from([0x81, data.length])
        : Buffer.from([0x81, 126, data.length >> 8, data.length & 255]);
    sock.write(Buffer.concat([head, data]));
  };
  server.on("upgrade", (req, sock: Socket) => {
    const accept = createHash("sha1")
      .update(`${req.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest("base64");
    sock.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    let buf = Buffer.alloc(0);
    sock.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 2) {
        const op = buf[0]! & 15;
        let len = buf[1]! & 127;
        let off = 2;
        if (len === 126) {
          len = buf.readUInt16BE(2);
          off = 4;
        }
        const total = off + 4 + len;
        if (buf.length < total) return;
        const mask = buf.subarray(off, off + 4);
        const payload = Buffer.from(buf.subarray(off + 4, total));
        for (let i = 0; i < payload.length; i++) payload[i]! ^= mask[i % 4]!;
        buf = buf.subarray(total);
        if (op === 8) return void sock.end();
        if (op !== 1) continue;
        const m = JSON.parse(payload.toString("utf8"));
        if (m.method === "initialize")
          send(sock, {
            jsonrpc: "2.0",
            id: m.id,
            result: { protocolVersion: 1, agentInfo: { name: "Mock", version: "1" } },
          });
        else if (m.method === "session/new")
          send(sock, { jsonrpc: "2.0", id: m.id, result: { sessionId: "s1" } });
        else if (m.method === "session/prompt") {
          send(sock, {
            jsonrpc: "2.0",
            method: "session/update",
            params: {
              sessionId: "s1",
              update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: reply } },
            },
          });
          send(sock, { jsonrpc: "2.0", id: m.id, result: { stopReason: "end_turn" } });
        }
      }
    });
    sock.on("error", () => {});
  });
  return server;
}

test("an AI edit goes through the same check: the answer says what it breaks and asks before applying", async ({
  page,
}) => {
  const agent = mockAgent(
    `{"edits":[{"op":"swap","tanda":1,"position":2,"songId":"${INSTRUMENTAL_ID}"}],"note":"De Pura Cepa in tanda 1."}`,
  );
  await new Promise<void>((r) => agent.listen(0, "127.0.0.1", r));
  const port = (agent.address() as { port: number }).port;
  try {
    await page.goto("/settings");
    // (a click before the page hydrates is lost: wait until React owns the row)
    await clickHydrated(page.locator("#model-add-agent"));
    const sheet = page.getByTestId("agent-sheet");
    // (the two Settings columns rebalance while the page loads: a click can land while the button moves)
    // (2026-11: the hydrated click above usually opened it already — clicking the row again then waited forever on
    // the sheet's backdrop; click only while the sheet is not up, with a bounded click)
    await expect(async () => {
      if (!(await sheet.isVisible())) await page.locator("#model-add-agent").click({ timeout: 2000 });
      await expect(sheet).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20000 });
    await sheet.locator("#agent-name").fill("Mock Agent");
    await sheet.locator("#agent-url").fill(`ws://127.0.0.1:${port}`);
    await sheet.locator("#agent-test").click();
    await expect(sheet.getByTestId("agent-sheet-status")).toContainText("Connected", { timeout: 20000 });
    await sheet.locator("#agent-use").click();
    await openFeatured(page);
    await page.locator("#ai-edit-input").fill("put De Pura Cepa as the second song of tanda 1");
    await page.getByRole("button", { name: "Make the change" }).click();
    const rule = page.getByTestId("rule-sheet");
    await expect(rule).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId("ai-edit-breaks")).toContainText("breaks a tanda rule");
    await expect(rule.getByTestId("rule-fact").first()).toContainText(INSTRUMENTAL);
    // nothing applied while it asks
    const card = page.locator("#result [data-tanda]").first();
    await expect(card).not.toContainText(INSTRUMENTAL);
    await rule.getByTestId("rule-as-said").click();
    await expect(rule).toBeHidden();
    await expect(card).toContainText(INSTRUMENTAL, { timeout: 20000 });
    await expect(page.getByTestId("ai-edit-breaks")).toContainText("Done as you said");
    await expect(page.getByTestId("night-exceptions")).toBeVisible();
    // Undo in the AI bar puts the night back
    await page.getByTestId("ai-edit-undo").click();
    await expect(card).not.toContainText(INSTRUMENTAL);
  } finally {
    agent.close();
  }
});

/** a phone or tablet context (touch, its own size), optionally in Turkish */
async function device(browser: Browser, viewport: { width: number; height: number }, locale?: string) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    ...(locale ? { locale } : {}),
    baseURL: test.info().project.use.baseURL,
  });
  return { ctx, page: await ctx.newPage() };
}

/** every button inside the open rule sheet is at least 44 × 44 px, and the sheet is inside the viewport */
async function fits(page: Page, viewport: { width: number; height: number }) {
  const rule = page.getByTestId("rule-sheet");
  await expect(rule.getByTestId("rule-suggestion").first()).toBeVisible({ timeout: 30000 });
  // (the sheet's open animation settles first)
  await page.waitForTimeout(700);
  const box = (await rule.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  const small = await rule.evaluate((el) =>
    [...el.querySelectorAll<HTMLElement>("button, label")]
      .filter((b) => b.offsetParent !== null)
      .map((b) => {
        const r = b.getBoundingClientRect();
        return {
          t: (b.textContent || b.getAttribute("aria-label") || "").trim().slice(0, 40),
          w: r.width,
          h: r.height,
        };
      })
      .filter((r) => r.w < 44 || r.h < 44),
  );
  expect(small).toEqual([]);
  // the footer actions are on screen without scrolling
  for (const id of ["rule-use-suggestion", "rule-as-said", "rule-cancel"])
    await expect(rule.getByTestId(id)).toBeInViewport();
}

for (const [name, viewport] of [
  ["phone", { width: 390, height: 844 }],
  ["iPad", { width: 820, height: 1180 }],
] as const)
  test(`${name}: the rule sheet fits and every button is ≥ 44 px`, async ({ browser }) => {
    const { ctx, page } = await device(browser, viewport);
    try {
      await openFeatured(page);
      await breakTheRule(page);
      await fits(page, viewport);
      await page.getByTestId("rule-cancel").click();
      await expect(page.getByTestId("rule-sheet")).toBeHidden();
    } finally {
      await ctx.close();
    }
  });

test("captures: the rule sheet on an iPhone 15 Pro in English and Turkish", async ({ browser }) => {
  const dir = process.env.RULECHECK_SHOTS;
  test.skip(!dir, "set RULECHECK_SHOTS=<dir> to write the captures");
  mkdirSync(dir!, { recursive: true });
  const viewport = { width: 393, height: 852 };
  for (const locale of ["en-US", "tr-TR"]) {
    const { ctx, page } = await device(browser, viewport, locale);
    try {
      await openFeatured(page);
      await breakTheRule(page);
      await fits(page, viewport);
      // (the dev server's own badge is not the app)
      await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
      await page.screenshot({ path: join(dir!, `rule-sheet-iphone15pro-${locale.slice(0, 2)}.png`) });
    } finally {
      await ctx.close();
    }
  }
});
