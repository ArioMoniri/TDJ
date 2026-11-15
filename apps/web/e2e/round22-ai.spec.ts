/**
 * Round 22: Edit with AI in Compose (a diff, Undo, every edit checked), an ACP agent used exactly like a key (a
 * mock agent on a local WebSocket answers through the browser relay), the hand-built night with live suggestions
 * that say why (switchable), and the learned rules in Database → Memory. No real model is called.
 */
import { createHash } from "node:crypto";
import http from "node:http";
import type { Socket } from "node:net";
import { expect, type Page, test } from "@playwright/test";

/** a minimal WebSocket server (text frames) speaking ACP: the answer comes from `answer(prompt)` */
function mockAcpAgent(answer: (prompt: string) => string) {
  const prompts: string[] = [];
  const server = http.createServer((_q, r) => r.writeHead(426).end());
  const send = (sock: Socket, obj: unknown) => {
    const data = Buffer.from(JSON.stringify(obj));
    const head =
      data.length < 126
        ? Buffer.from([0x81, data.length])
        : data.length < 65536
          ? Buffer.from([0x81, 126, data.length >> 8, data.length & 255])
          : (() => {
              const b = Buffer.alloc(10);
              b[0] = 0x81;
              b[1] = 127;
              b.writeBigUInt64BE(BigInt(data.length), 2);
              return b;
            })();
    sock.write(Buffer.concat([head, data]));
  };
  server.on("upgrade", (req, sock: Socket) => {
    const key = String(req.headers["sec-websocket-key"]);
    const accept = createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
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
        } else if (len === 127) {
          len = Number(buf.readBigUInt64BE(2));
          off = 10;
        }
        const masked = (buf[1]! & 128) !== 0;
        const total = off + (masked ? 4 : 0) + len;
        if (buf.length < total) return;
        const mask = masked ? buf.subarray(off, off + 4) : null;
        const payload = Buffer.from(buf.subarray(off + (masked ? 4 : 0), total));
        if (mask) for (let i = 0; i < payload.length; i++) payload[i]! ^= mask[i % 4]!;
        buf = buf.subarray(total);
        if (op === 8) {
          sock.end();
          return;
        }
        if (op !== 1) continue;
        const m = JSON.parse(payload.toString("utf8"));
        if (m.method === "initialize")
          send(sock, {
            jsonrpc: "2.0",
            id: m.id,
            result: { protocolVersion: 1, agentInfo: { name: "Mock Agent", version: "1.0" } },
          });
        else if (m.method === "session/new")
          send(sock, { jsonrpc: "2.0", id: m.id, result: { sessionId: "s1" } });
        else if (m.method === "session/prompt") {
          const text = (m.params.prompt as Array<{ text: string }>).map((p) => p.text).join("");
          prompts.push(text);
          send(sock, {
            jsonrpc: "2.0",
            method: "session/update",
            params: {
              sessionId: "s1",
              update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: answer(text) } },
            },
          });
          send(sock, { jsonrpc: "2.0", id: m.id, result: { stopReason: "end_turn" } });
        }
      }
    });
    sock.on("error", () => {});
  });
  return { server, prompts };
}

async function openFeatured(page: Page) {
  await page.goto("/?featured=golden-double-peak");
  await expect(page.locator("#result")).toBeVisible({ timeout: 90000 });
}

test("Edit with AI: a request becomes a checked edit with a diff, and Undo puts the night back", async ({
  page,
}) => {
  await openFeatured(page);
  const bar = page.getByTestId("ai-edit");
  await expect(bar).toBeVisible();
  await page.locator("#ai-edit-input").fill("lock tanda 2");
  await page.getByRole("button", { name: "Make the change" }).click();
  const diff = page.getByTestId("ai-edit-diff");
  await expect(diff).toContainText("Tanda 2", { timeout: 30000 });
  await expect(diff).toContainText("locked");
  await expect(diff).toContainText("read by keyword");
  await page.getByTestId("ai-edit-undo").click();
  await expect(diff).toHaveCount(0);
  // a request that names an unknown tanda is refused with its reason, nothing changes
  await page.locator("#ai-edit-input").fill("make tanda 99 calmer");
  await page.getByRole("button", { name: "Make the change" }).click();
  await expect(page.getByTestId("ai-edit-diff")).toContainText("Nothing to change", { timeout: 30000 });
});

test("an ACP agent works like a key: Settings → Models tests it, Edit with AI and the review use it", async ({
  page,
}) => {
  const agent = mockAcpAgent((prompt) =>
    prompt.includes("edit_night")
      ? '{"edits":[{"op":"lock","tanda":3}],"note":"Tanda 3 stays as it is."}'
      : "OK",
  );
  // a free port of its own: other suites and other checkouts on this machine use the fixed ones
  await new Promise<void>((r) => agent.server.listen(0, "127.0.0.1", r));
  const port = (agent.server.address() as { port: number }).port;
  try {
    await page.goto("/settings");
    const models = page.getByTestId("model-connections");
    await models.scrollIntoViewIfNeeded();
    await expect(models).toContainText("Anthropic");
    await expect(models).toContainText("No key");
    await page.locator("#model-add-agent").click();
    const sheet = page.getByTestId("agent-sheet");
    await sheet.locator("#agent-name").fill("Mock Agent");
    await sheet.locator("#agent-url").fill(`ws://127.0.0.1:${port}`);
    await sheet.locator("#agent-test").click();
    await expect(sheet.getByTestId("agent-sheet-status")).toContainText("Connected · Mock Agent 1.0", {
      timeout: 20000,
    });
    await sheet.locator("#agent-use").click();
    await expect(page.locator("#ai-status")).toContainText("Using Mock Agent");
    await expect(models.locator("[data-active]")).toContainText("Mock Agent");
    await expect(models).toContainText("Connected · Mock Agent 1.0");

    await openFeatured(page);
    await page.locator("#ai-edit-input").fill("keep the third tanda");
    await page.getByRole("button", { name: "Make the change" }).click();
    const diff = page.getByTestId("ai-edit-diff");
    await expect(diff).toContainText("Tanda 3", { timeout: 30000 });
    await expect(diff).toContainText("Tanda 3 stays as it is.");
    await expect(diff).not.toContainText("read by keyword");
    expect(agent.prompts.some((p) => p.includes("T3 ") && p.includes("edit_night"))).toBe(true);
  } finally {
    agent.server.close();
  }
});

test("build by hand: suggestions with reasons update after each pick, switch off, and the night lands on Compose", async ({
  page,
}) => {
  await page.goto("/build");
  await page.evaluate(() => localStorage.removeItem("tdj-build-draft"));
  await page.reload();
  const list = page.getByTestId("build-suggestions");
  await expect(list).toContainText("Tanda 1: a tango", { timeout: 30000 });
  const first = page.getByTestId("build-suggestion").first();
  await expect(first.getByTestId("build-reason").first()).toBeVisible();
  await first.getByRole("button", { name: /^Add/ }).click();
  await expect(page.getByTestId("build-tanda")).toHaveCount(1);
  await expect(list).toContainText("Tanda 2", { timeout: 30000 });
  await page.getByTestId("build-suggestion").first().getByRole("button", { name: /^Add/ }).click();
  await expect(page.getByTestId("build-tanda")).toHaveCount(2);
  // after two tango tandas the cycle asks for a vals or a milonga
  await expect(list).toContainText(/Tanda 3: a (vals|milonga)/, { timeout: 30000 });
  // a song from search starts a tanda of its own
  await page.getByLabel("Search for a song to add").fill("la cachila");
  await expect(page.getByTestId("build-hit").first()).toBeVisible({ timeout: 20000 });
  // suggestions can be switched off
  await page.getByRole("switch", { name: "Suggestions" }).click();
  await expect(list).toHaveCount(0);
  await page.getByRole("switch", { name: "Suggestions" }).click();
  await expect(page.getByTestId("build-suggestions")).toBeVisible();
  await page.getByTestId("build-finish").click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId("ai-edit")).toBeVisible();
});

test("learned rules: a lock teaches, Database → Memory lists it, the DJ weights and deletes it", async ({
  page,
}) => {
  await openFeatured(page);
  await page.locator("#ai-edit-input").fill("lock tanda 4");
  await page.getByRole("button", { name: "Make the change" }).click();
  await expect(page.getByTestId("ai-edit-diff")).toContainText("Tanda 4", { timeout: 30000 });
  // the memory is written to this browser's database a moment after the edit
  await page.waitForTimeout(1000);
  await page.goto("/database");
  const memoryTab = page.getByRole("radio", { name: "Memory" });
  if (await memoryTab.isVisible()) await memoryTab.click();
  else {
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Memory" }).click();
  }
  await expect(page.getByTestId("learned-rules")).toBeVisible();
  const rule = page.getByTestId("learned-rule").first();
  await expect(rule).toBeVisible();
  const before = await rule.getByTestId("learned-weight").innerText();
  await rule.getByRole("button", { name: /^Weigh .* more$/ }).click();
  await expect(page.getByTestId("learned-rule").first().getByTestId("learned-weight")).not.toHaveText(before);
  const n = await page.getByTestId("learned-rule").count();
  await page
    .getByTestId("learned-rule")
    .first()
    .getByRole("button", { name: /^Delete / })
    .click();
  await expect(page.getByTestId("learned-rule")).toHaveCount(n - 1);
  await expect(page.getByRole("switch", { name: "Learn from my edits" })).toBeVisible();
});

test("thumbs up teaches: a toast says so, the next night composes with it, Database → Memory lists it from nights you liked", async ({
  page,
}) => {
  await openFeatured(page);
  const up = page.getByRole("button", { name: "Mark as liked" });
  await up.click();
  await expect(up).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("toast")).toContainText(
    "Got it: future nights will lean towards these tandas.",
  );
  // compose again: the liked night's families ride with the request
  const compose = page.waitForRequest((r) => r.url().includes("/api/compose") && r.method() === "POST");
  await page.getByTestId("toolbar-regenerate").click();
  const body = (await compose).postDataJSON();
  expect(Object.values(body.learned?.likes ?? {})).toHaveLength(1);
  await expect(page.getByTestId("toolbar-regenerate")).toBeEnabled({ timeout: 90000 });
  // the memory is written to this browser's database a moment after the edit
  await page.waitForTimeout(1000);
  await page.goto("/database");
  const memoryTab = page.getByRole("radio", { name: "Memory" });
  if (await memoryTab.isVisible()) await memoryTab.click();
  else {
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Memory" }).click();
  }
  const rated = page.getByTestId("learned-from-likes");
  await expect(rated).toBeVisible();
  await expect(rated.getByTestId("learned-source").first()).toContainText(/from nights you liked/i);
  const n = await rated.getByTestId("learned-rule").count();
  await rated
    .getByTestId("learned-rule")
    .first()
    .getByRole("button", { name: /^Delete / })
    .click();
  await expect(rated.getByTestId("learned-rule")).toHaveCount(n - 1);
});

test("a fresh profile sees what the featured night's edits taught: Settings and Database → Memory list it, and it switches off", async ({
  page,
}) => {
  await page.goto("/settings");
  const group = page.getByTestId("featured-learned");
  await group.scrollIntoViewIfNeeded();
  await expect(group).toContainText("Learned from your edits to the featured night", { timeout: 30000 });
  expect(await group.getByTestId("learned-rule").count()).toBeGreaterThan(10);
  await expect(group).toContainText("Last 4 tandas tango only");
  await expect(group.getByTestId("featured-exceptions")).toContainText("Exception for this night only");
  await expect(page.getByText("Nothing learned yet")).toHaveCount(0);
  await page.goto("/database");
  const memoryTab = page.getByRole("radio", { name: "Memory" });
  if (await memoryTab.isVisible()) await memoryTab.click();
  else {
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Memory" }).click();
  }
  const db = page.getByTestId("featured-learned");
  await expect(db.getByTestId("learned-rule").first()).toBeVisible({ timeout: 30000 });
  await expect(page.getByText("Nothing learned yet")).toHaveCount(0);
  // one rule deleted, then the whole store switched off: both are the DJ's overrides, and compose receives them
  const n = await db.getByTestId("learned-rule").count();
  await db
    .getByTestId("learned-rule")
    .first()
    .getByRole("button", { name: /^Delete / })
    .click();
  await expect(db.getByTestId("learned-rule")).toHaveCount(n - 1);
  await db.getByRole("switch", { name: "Use the featured night's edits" }).click();
  await expect(db.getByTestId("learned-rule")).toHaveCount(0);
  await expect(db).toContainText("Off: compose does not use the featured night's edits.");
  await page.waitForTimeout(1000);
  await page.goto("/");
  const compose = page.waitForRequest((r) => r.url().includes("/api/compose") && r.method() === "POST");
  await page
    .getByRole("button", { name: /Compose the night/ })
    .first()
    .click();
  const body = (await compose).postDataJSON();
  expect(body.learned?.repo?.off).toBe(true);
  expect(body.learned?.repo?.deleted).toHaveLength(1);
});
