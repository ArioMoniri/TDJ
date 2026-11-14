/**
 * The native side of the app, mocked for a browser on Linux: what src-tauri answers to the bundled UI's
 * `__TAURI_INTERNALS__.invoke` calls. SQLite is real (node:sqlite, the same SQL tauri-plugin-sql runs), the Keychain
 * is a map, and the network commands answer from canned Deezer/MusicBrainz data, so nothing leaves this machine.
 * Used by the store screenshots (capture.ts) and the standalone check (standalone.ts).
 */
import { DatabaseSync } from "node:sqlite";
import type { BrowserContext } from "playwright";

export interface MockOptions {
  platform: "macos" | "ipados";
  /** SQLite file (kept across page loads, as the app's data folder is); ":memory:" for one load */
  dbPath?: string;
}
export interface Mock {
  calls: Array<{ cmd: string; args: Record<string, unknown> }>;
  db: DatabaseSync;
  secrets: Map<string, string>;
}

const json = (status: number, body: unknown) => ({
  status,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** Deezer and MusicBrainz as the native client would get them (no real network in a check). */
function cannedFetch(url: string) {
  const u = new URL(url);
  if (u.host === "api.deezer.com") {
    if (u.pathname === "/infos") return json(200, { open: true });
    if (u.pathname.startsWith("/track/"))
      return json(200, { preview: `http://127.0.0.1:9/preview/${u.pathname.split("/")[2]}.mp3` });
    if (u.pathname === "/search") return json(200, { data: [] });
  }
  if (u.host === "musicbrainz.org") return json(200, { recordings: [] });
  return { error: { message: "The app does not contact that site.", status: 403 } };
}

export async function installTauriMock(ctx: BrowserContext, o: MockOptions): Promise<Mock> {
  const db = new DatabaseSync(o.dbPath ?? ":memory:");
  const secrets = new Map<string, string>();
  const calls: Mock["calls"] = [];
  const handle = (cmd: string, args: Record<string, unknown>): unknown => {
    calls.push({ cmd, args });
    switch (cmd) {
      case "get_native_info":
        return {
          platform: o.platform,
          version: "0.1.0",
          bundled: true,
          linkedServer: null,
          apiBase: "tdjapi://localhost",
          appStore: false,
          updater: false,
        };
      case "plugin:sql|load":
        return args.db;
      case "plugin:sql|execute": {
        const r = db.prepare(String(args.query)).run(...((args.values as never[]) ?? []));
        return [Number(r.changes), Number(r.lastInsertRowid)];
      }
      case "plugin:sql|select":
        return db.prepare(String(args.query)).all(...((args.values as never[]) ?? []));
      case "secret_set":
        if (String(args.value)) secrets.set(String(args.name), String(args.value));
        else secrets.delete(String(args.name));
        return null;
      case "secret_has":
        return secrets.has(String(args.name));
      case "secret_delete":
        secrets.delete(String(args.name));
        return null;
      case "net_fetch":
        return cannedFetch(String((args.req as { url: string }).url));
      case "ai_complete": {
        const a = args.args as { provider: string; system: string };
        if (!secrets.has(`ai.${a.provider}`))
          return {
            error: {
              message: "No API key for this provider. Add one in Settings → Written reviews.",
              status: 401,
            },
          };
        return a.system.startsWith("You are a connection test") ? "OK" : "A calm, well-built night.";
      }
      case "spotify_access":
        return null;
      case "folder_list":
      case "cue_devices":
        return [];
      default:
        return null;
    }
  };
  await ctx.exposeBinding("__tdjNative", (_src, cmd: string, args: Record<string, unknown>) => {
    try {
      const v = handle(cmd, args ?? {});
      return v && typeof v === "object" && "error" in v && !Array.isArray(v)
        ? { __error: v.error }
        : { ok: v };
    } catch (e) {
      return { __error: { message: (e as Error).message, status: 500 } };
    }
  });
  // a string, not a function: tsx would add its `__name` helper to a function, which the page does not have
  await ctx.addInitScript(`(() => {
    window.__TDJ_NATIVE__ = Object.freeze({
      platform: ${JSON.stringify(o.platform)},
      bundled: true,
      linkedServer: null,
      apiBase: "tdjapi://localhost",
      vibrancy: false,
    });
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd, args) => {
        const r = await window.__tdjNative(cmd, args || {});
        if (r.__error) throw r.__error;
        return r.ok;
      },
    };
  })();`);
  return { calls, db, secrets };
}
