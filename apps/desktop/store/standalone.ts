/**
 * The standalone check: the bundled app UI (ui/dist, `pnpm --filter @tdj/desktop ui`) in Chromium with the Tauri
 * side mocked (tauri-mock.ts), and every request outside this machine blocked. It composes a night, finds it in
 * History after a reload (from the on-device SQLite), opens Settings → Connections (not linked), saves a model key
 * to the "Keychain", and fails if any request reached a TDJ server or any other host.
 *   pnpm --filter @tdj/desktop standalone      (CHROMIUM=/path/to/chrome; empty = Playwright's own)
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { startPreview } from "./serve";
import { installTauriMock } from "./tauri-mock";

const PORT = Number(process.env.PORT ?? 4174);
const ORIGIN = `http://127.0.0.1:${PORT}`;

/** The services' image CDNs the page may show artwork from (Deezer, Spotify, the Cover Art Archive). */
const MEDIA_HOSTS =
  /^(cdn-images\.dzcdn\.net|e-cdns-images\.dzcdn\.net|i\.scdn\.co|coverartarchive\.org|([a-z0-9-]+\.)*archive\.org)$/;

async function main() {
  const server = await startPreview(PORT);
  const exe = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium";
  const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ["--no-sandbox"] });
  const outside: string[] = [];
  // cover artwork the page shows straight from the services' image CDNs (round 22): no data about the DJ goes with
  // it, as with the audio previews; counted, refused here like everything else, and only these hosts
  const media: string[] = [];
  try {
    const dbPath = join(mkdtempSync(join(tmpdir(), "tdj-app-")), "tdj.db");
    const open = async () => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 } });
      const mock = await installTauriMock(ctx, { platform: "macos", dbPath });
      // nothing leaves the machine: a request to any other host is recorded and refused
      await ctx.route(
        (u) => !u.href.startsWith(ORIGIN) && !u.protocol.startsWith("data") && !u.protocol.startsWith("blob"),
        (route) => {
          const url = route.request().url();
          if (route.request().resourceType() === "image" && MEDIA_HOSTS.test(new URL(url).host))
            media.push(url);
          else outside.push(url);
          return route.abort();
        },
      );
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      if (process.env.DEBUG) page.on("console", (m) => console.log("console:", m.text()));
      return { ctx, mock, page };
    };
    const errors: string[] = [];

    const first = await open();
    await first.page.goto(`${ORIGIN}/`, { waitUntil: "load" });
    await first.page.getByRole("button", { name: /Compose the night/ }).click();
    await first.page.locator("#result").waitFor({ state: "visible", timeout: 120_000 });
    const tandas = await first.page.locator("article[id^=tanda-]").count();
    assert.ok(tandas > 14, `a 4 h night has more than 14 tandas (got ${tandas})`);
    console.log(`composed on the device: ${tandas} tandas`);
    await first.page.waitForTimeout(1500);
    if (process.env.DEBUG) {
      console.log(
        first.mock.calls.map((c) => `${c.cmd} ${String(c.args.query ?? "").slice(0, 40)}`),
        errors,
        server.apiHits,
      );
      console.log(
        await first.page.evaluate(async () => [
          typeof (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__,
          await fetch("/api/db").then((r) => r.text()),
        ]),
      );
    }
    const rows = first.mock.db.prepare("SELECT COUNT(*) AS n FROM history").get() as { n: number };
    assert.ok(rows.n >= 1, "the composed night was saved in SQLite");
    const versions = first.mock.db.prepare("SELECT version FROM schema_migrations ORDER BY version").all();
    console.log(
      `SQLite: ${rows.n} night(s), migrations ${versions.map((v) => (v as { version: number }).version).join(", ")}`,
    );
    await first.ctx.close();

    // a fresh web view (its own storage empty) finds the night in History, from the device database alone
    const { mock, page } = await open();
    await page.goto(`${ORIGIN}/history`, { waitUntil: "load" });
    await page.locator("[id^=history-]").first().waitFor({ timeout: 30_000 });
    console.log("History after a fresh start: the night is there (from SQLite)");

    // the server routes the app runs unchanged (apps/web/scripts/device-routes.mjs) answer from the bundle
    // (a string, not a function: tsx would add its `__name` helper, which the page does not have)
    const device = (await page.evaluate(`(async () => {
      const post = async (path, body) =>
        (await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();
      const found = await post("/api/song-search", { query: { text: "flete", limit: 3 } });
      const night = await post("/api/compose", { hours: 1, seed: 2 });
      const edit = await post("/api/ai/edit", { playlist: night, instruction: "more vals" });
      return { found: found.results?.length ?? 0, edit: edit.source, tandas: edit.playlist?.tandas?.length ?? 0 };
    })()`)) as { found: number; edit: string; tandas: number };
    assert.ok(device.found > 0, "song search answered on the device");
    assert.ok(device.tandas > 0 && typeof device.edit === "string", "Edit with AI answered on the device");
    console.log(
      `device routes: song search ${device.found} sides, Edit with AI (${device.edit}) on the device`,
    );

    // Settings: standalone, no server linked; a model key goes to the Keychain mock, never to the page's storage
    await page.goto(`${ORIGIN}/settings`, { waitUntil: "load" });
    await page.locator("#app-connections").waitFor({ timeout: 30_000 });
    assert.match(await page.locator("#app-server-status").innerText(), /Not linked/);
    await page.locator("#ai-key").fill("sk-ant-test-key");
    await page.waitForTimeout(1200);
    assert.equal(mock.secrets.get("ai.anthropic"), "sk-ant-test-key");
    const stored = await page.evaluate(() => localStorage.getItem("tdj-v1") ?? "");
    assert.ok(!stored.includes("sk-ant-test-key"), "the key is not in the page's storage");
    await page.locator("#ai-test").click();
    await page.getByText(/answered "OK"/).waitFor({ timeout: 30_000 });
    // the provider layer's own Anthropic request went out natively, carrying only the mark of a saved key
    assert.ok(mock.modelCalls.length > 0, "the connection test went through model_fetch");
    for (const c of mock.modelCalls) {
      assert.equal(new URL(c.url).host, "api.anthropic.com");
      assert.ok(!JSON.stringify(c).includes("sk-ant-test-key"), "the page never sends the key");
    }
    console.log("model key in the Keychain; the connection test ran on the provider layer, natively");
    const settingsRow = mock.db.prepare("SELECT value FROM settings WHERE key = 'user'").get() as
      | { value: string }
      | undefined;
    assert.ok(
      settingsRow && !settingsRow.value.includes("sk-ant-test-key"),
      "settings saved on the device, no key",
    );

    assert.deepEqual(server.apiHits, [], "no /api request reached a server");
    assert.deepEqual(outside, [], "no request left this machine");
    assert.deepEqual(errors, [], "no page errors");
    const cmds = [...new Set(mock.calls.map((c) => c.cmd))].sort();
    console.log(`native commands used: ${cmds.join(", ")}`);
    console.log(
      `standalone check passed: no TDJ server, no outside request (${media.length} artwork images from the services' CDNs)`,
    );
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
