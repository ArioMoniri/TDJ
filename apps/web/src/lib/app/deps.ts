import { buildLoaded, type DataFiles } from "@tdj/core/data";
import { LlmError } from "@/lib/ai/provider";
import { catalogStore } from "@/lib/api/catalog";
import type { ApiDeps } from "@/lib/api/deps";
import type { ReferencePlaylist } from "@/lib/types";
import type { HostCalls, HostError } from "./host";
import type { DeviceRuntime } from "./server/runtime";
import { DeviceStore, migrate, type SqlDriver } from "./store";

export type AppDeps = ApiDeps & {
  host: HostCalls;
  /** the on-device database, migrated on first use */
  store(): Promise<DeviceStore>;
};

/**
 * The apps' runtime for the shared route handlers: the bundled index, the native HTTP client for Deezer and
 * MusicBrainz, the Spotify session in the Keychain and the on-device database. Runs inside the engine worker (src/workers/engine.worker.ts).
 */
export function appDeps(files: DataFiles, host: HostCalls): AppDeps {
  const catalog = catalogStore(() => ({
    ...buildLoaded(files),
    referencePlaylists:
      (files.referencePlaylists as { playlists?: ReferencePlaylist[] } | undefined)?.playlists ?? [],
  }));
  const driver: SqlDriver = {
    execute: (sql, params = []) => host.sql("execute", sql, params),
    select: async <T>(sql: string, params: unknown[] = []) => (await host.sql("select", sql, params)) as T[],
  };
  let store: Promise<DeviceStore> | null = null;
  return {
    ...catalog,
    host,
    store: () => {
      if (!store)
        store = migrate(driver)
          .then(() => new DeviceStore(driver))
          .catch((e) => {
            store = null;
            throw e;
          });
      return store;
    },
    storage: () => "device",
    // every request comes from the app's own pages
    guard: async () => null,
    fetch: async (url, init = {}) => {
      const headers: Record<string, string> = {};
      new Headers(init.headers).forEach((v, k) => {
        headers[k] = v;
      });
      const signal = init.signal;
      if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
      const call = host.fetch({
        url,
        method: init.method ?? "GET",
        headers,
        body: typeof init.body === "string" ? init.body : undefined,
      });
      const r = await (signal
        ? Promise.race([
            call,
            new Promise<never>((_, no) =>
              signal.addEventListener("abort", () =>
                no(new DOMException("The operation was aborted.", "AbortError")),
              ),
            ),
          ])
        : call);
      return new Response(r.status === 204 || r.status === 304 ? null : r.body, {
        status: r.status,
        headers: r.headers,
      });
    },
    spotify: {
      enabled: () => host.spotify.enabled(),
      session: async () => {
        const a = await host.spotify.access();
        return a ? { access: a.access, expires: a.expires, scopes: a.scopes } : null;
      },
    },
  };
}

/** The runtime of the server routes the app runs unchanged (lib/app/server/*): the same index, the page's model call. */
export function deviceRuntime(d: AppDeps): DeviceRuntime {
  return {
    catalog: d.catalog,
    catalogFor: d.catalogFor,
    ask: async (ai, req) => {
      try {
        return await d.host.ask(ai, req);
      } catch (e) {
        const h = e as HostError;
        throw new LlmError(h?.message || "The model request failed.", h?.status ?? 502);
      }
    },
  };
}
