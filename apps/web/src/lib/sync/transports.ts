import { sha256 } from "./crypto";
import type { Item, PullResult, Transport } from "./engine";

/**
 * Where a sync space's encrypted records travel (docs/SYNC.md):
 * - the sync server: this site's `/api/sync`, the build's default (NEXT_PUBLIC_TDJ_SYNC_URL) or the DJ's own;
 * - iCloud Documents (the Mac, iPhone and iPad apps, when iCloud is on): one file per record in the app's ubiquity
 *   container, through the native commands `icloud_*` (apps/desktop/src-tauri/src/icloud.rs). Apple devices keep
 *   syncing with no server reachable; iCloud only ever holds the same ciphertext.
 */

export class SyncHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** the server transport: GET/PUT `/api/sync` with the space id and this device's tag in headers */
export function serverTransport(o: {
  base: string;
  id: string;
  device: string;
  fetch?: typeof fetch;
}): Transport {
  const url = `${o.base.replace(/\/$/, "")}/api/sync`;
  const f = o.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  const headers = { "x-tdj-sync-id": o.id, "x-tdj-device": o.device };
  const fail = async (r: Response) => {
    const j = (await r.json().catch(() => null)) as { error?: string } | null;
    return new SyncHttpError(r.status, j?.error || `HTTP ${r.status}`);
  };
  return {
    name: `server:${o.base || "here"}`,
    async pull(cursor): Promise<PullResult> {
      const r = await f(`${url}?since=${encodeURIComponent(cursor ?? "0")}`, { headers, cache: "no-store" });
      if (!r.ok) throw await fail(r);
      const j = (await r.json()) as {
        version: number;
        more?: boolean;
        records: Item[];
        devices?: Record<string, number>;
      };
      // a page that is not the last: the cursor moves on and the engine asks again
      const next = String(j.version ?? 0);
      return {
        items: j.records ?? [],
        cursor: next,
        more: !!j.more,
        devices: j.devices,
      };
    },
    async push(items) {
      const r = await f(url, {
        method: "PUT",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ records: items }),
      });
      if (!r.ok) throw await fail(r);
    },
  };
}

/** what the native side lists of a space's iCloud folder */
export interface ICloudFile {
  name: string;
  /** ms */
  modified: number;
  size: number;
}
export type Invoke = <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

export interface ICloudStatus {
  available: boolean;
  /** "off" (iCloud signed out or iCloud Drive off), "unsupported" (not an Apple build with iCloud), "error" */
  reason?: string;
}

export async function icloudStatus(invoke: Invoke): Promise<ICloudStatus> {
  try {
    return (await invoke<ICloudStatus>("icloud_status")) ?? { available: false, reason: "unsupported" };
  } catch {
    return { available: false, reason: "unsupported" };
  }
}

const REC = /^([A-Za-z0-9_-]{22})\.tdjsync$/;

/**
 * The iCloud transport. The space's folder is named after a hash of its id (never the id or the code); the cursor
 * is the list of files with their modification times last read, so a pull reads only the files that changed.
 */
export async function icloudTransport(id: string, invoke: Invoke): Promise<Transport> {
  const space = (await sha256(`tdj-icloud:${id}`)).slice(0, 32);
  return {
    name: "icloud",
    async pull(cursor) {
      const known = (() => {
        try {
          return cursor ? (JSON.parse(cursor) as Record<string, number>) : {};
        } catch {
          return {};
        }
      })();
      const files = await invoke<ICloudFile[]>("icloud_list", { space });
      const now: Record<string, number> = {};
      const items: Item[] = [];
      for (const f of files ?? []) {
        const m = REC.exec(f.name);
        if (!m) continue;
        now[f.name] = f.modified;
        if (known[f.name] === f.modified) continue;
        const blob = await invoke<string | null>("icloud_read", { space, name: f.name }).catch(() => null);
        // a file iCloud is still downloading is read on a later round (its time is not recorded yet)
        if (typeof blob !== "string" || !blob) {
          delete now[f.name];
          continue;
        }
        items.push({ rid: m[1]!, blob });
      }
      const next = JSON.stringify(now);
      // one pass reads everything that changed: the engine stops when the cursor stays the same
      return { items, cursor: items.length ? next : (cursor ?? next), more: false };
    },
    async push(items) {
      for (const it of items)
        await invoke("icloud_write", { space, name: `${it.rid}.tdjsync`, data: it.blob });
    },
  };
}

/** Removes this space's iCloud folder (Reset sync code). */
export async function icloudDrop(id: string, invoke: Invoke): Promise<void> {
  const space = (await sha256(`tdj-icloud:${id}`)).slice(0, 32);
  await invoke("icloud_remove", { space }).catch(() => {});
}
