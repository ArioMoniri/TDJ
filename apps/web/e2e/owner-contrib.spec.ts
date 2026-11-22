/**
 * 2026-11 — owner contributions end to end. A server with the in-memory config store seeded with a setup code (the
 * way the deploy workflow seeds SSM) and no table (contributions in memory):
 *   - a DJ who is not the owner never sees Settings → Owner and cannot contribute (401);
 *   - the owner unlocks, Settings → Owner appears; what was already on the device waits for "Send my existing
 *     changes", whose preview counts each kind (personal categories off); sending empties the queue and the server
 *     reports the contribution as pending;
 *   - "Export my changes as a contribution file" saves the file `pnpm data:apply-contributions` reads.
 * Run against a server you started (`TDJ_OWNER_E2E_URL`, e.g. `next dev -p 3931` with the env below) or let the spec
 * start `next start` on 3104 (after `pnpm build`, as CI does).
 */
import { type ChildProcess, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";

const SETUP_CODE = "fedcba9876543210fedcba9876543210";
const PORT = 3104;
const APP = process.env.TDJ_OWNER_E2E_URL ?? `http://127.0.0.1:${PORT}`;
const OWNER_E2E_ENV = {
  TDJ_CONFIG_BACKEND: "memory",
  TDJ_CONFIG_SEED: JSON.stringify({ SETUP_CODE: `${SETUP_CODE}.${Math.floor(Date.now() / 1000)}` }),
  TDJ_DB_TABLE: "",
  TDJ_COOKIE_SECRET: "",
  NEXT_PUBLIC_APP_URL: "",
};
const SONG = "878cad6151";

let server: ChildProcess | null = null;
test.describe.configure({ mode: "serial" });
test.use({ baseURL: APP });
test.beforeAll(async () => {
  if (!process.env.TDJ_OWNER_E2E_URL) {
    const cwd = path.resolve(__dirname, "..");
    server = spawn(
      process.execPath,
      [path.join(cwd, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT)],
      { cwd, env: { ...process.env, ...OWNER_E2E_ENV }, stdio: "ignore" },
    );
  }
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${APP}/api/admin/public`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("owner e2e server did not start");
});
test.afterAll(() => {
  server?.kill("SIGTERM");
});

/** what a DJ already did on this device before the owner flow existed: a correction, a YouTube match, a cover */
async function seedDevice(page: Page) {
  await page.evaluate(async (id) => {
    localStorage.setItem("tdj-youtube-matches", JSON.stringify({ [id]: "dQw4w9WgXcQ" }));
    localStorage.setItem("tdj-artwork-v1", JSON.stringify({ [id]: "https://i.scdn.co/image/owner-e2e" }));
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("keyval-store");
      open.onupgradeneeded = () => open.result.createObjectStore("keyval");
      open.onsuccess = () => {
        const tx = open.result.transaction("keyval", "readwrite");
        tx.objectStore("keyval").put(
          { songs: { [id]: { year: 1938, singer: "Roberto Ray" } }, guide: { houseRules: "private words" } },
          "tdj-overrides-v1",
        );
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      open.onerror = () => reject(open.error);
    });
  }, SONG);
}

test("a DJ who is not the owner sees no Owner section and cannot contribute", async ({ page }) => {
  await page.goto("/settings?section=ai");
  await expect(page.getByTestId("ai-models")).toBeVisible();
  const r = await page.request.post("/api/owner/contributions", {
    data: {
      v: 1,
      source: "web",
      items: [{ kind: "youtube", id: SONG, value: "dQw4w9WgXcQ", at: new Date().toISOString() }],
    },
  });
  expect(r.status()).toBe(401);
  expect((await page.request.get("/api/owner/contributions")).status()).toBe(401);
  await page.waitForTimeout(500);
  await expect(page.getByTestId("settings-owner")).toHaveCount(0);
});

test("the owner sends existing changes after a preview, then exports a contribution file", async ({
  page,
}) => {
  await page.goto("/settings?section=library");
  await seedDevice(page);
  const unlock = await page.request.post("/api/admin/unlock", { data: { secret: SETUP_CODE } });
  expect(unlock.status()).toBe(200);
  await page.reload();
  const owner = page.getByTestId("settings-owner");
  await expect(owner).toBeVisible({ timeout: 30_000 });
  // what was on the device before is the baseline: nothing goes out by itself
  await expect(owner.getByTestId("owner-waiting")).toHaveText("0");

  await owner.locator("#owner-send-existing").click();
  const sheet = page.getByTestId("owner-preview");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("owner-count-songs")).toHaveText("1");
  await expect(sheet.getByTestId("owner-count-matches")).toHaveText("1");
  await expect(sheet.getByTestId("owner-count-artwork")).toHaveText("1");
  // personal categories are off by default
  for (const k of ["learning", "favourites", "history", "grades"])
    await expect(sheet.getByTestId(`owner-count-${k}`)).toHaveCount(0);
  const before = (await (await page.request.get("/api/owner/contributions")).json()).pending as number;
  await sheet.getByTestId("owner-send-confirm").click();
  await expect(sheet).toBeHidden();
  const status = await (await page.request.get("/api/owner/contributions")).json();
  expect(status).toMatchObject({ owner: true, storage: "memory", pending: before + 1 });

  // sent once: the preview has nothing left
  await owner.locator("#owner-send-existing").click();
  await expect(sheet.getByTestId("owner-send-confirm")).toBeDisabled();
  await page.keyboard.press("Escape");

  const download = page.waitForEvent("download");
  await owner.locator("#owner-export").click();
  const file = JSON.parse(readFileSync(await (await download).path(), "utf8"));
  expect(file.format).toBe("tdj-owner-contribution");
  const items = file.contributions.flatMap((c: { items: unknown[] }) => c.items);
  expect(items).toHaveLength(3);
  // the Guide's house rules never leave the device
  expect(JSON.stringify(file)).not.toContain("private words");
});
