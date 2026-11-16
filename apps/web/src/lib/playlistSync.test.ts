import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Playlist } from "@tdj/core";
import { beforeEach, describe, expect, it } from "vitest";

// (vitest runs in node: a Map stands in for the browser's localStorage)
const mem = new Map<string, string>();
(
  globalThis as unknown as { localStorage: Pick<Storage, "getItem" | "setItem" | "removeItem"> }
).localStorage = {
  getItem: (k) => mem.get(k) ?? null,
  setItem: (k, v) => void mem.set(k, String(v)),
  removeItem: (k) => void mem.delete(k),
};

const {
  createSyncer,
  rememberExport,
  recordOf,
  setSyncEnabled,
  signatureOf,
  statusOf,
  SYNC_DELAY_MS,
  BURST_RETRY_MS,
  syncRows,
} = await import("./playlistSync");
type Syncer = ReturnType<typeof createSyncer>;

/** a fake clock: timers run when the test moves time on */
function clock() {
  let now = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    setTimer: (fn: () => void, ms: number) => {
      const id = ++seq;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer: (h: unknown) => void timers.delete(h as number),
    async advance(ms: number) {
      now += ms;
      for (const [id, t] of [...timers].sort((a, b) => a[1].at - b[1].at))
        if (t.at <= now) {
          timers.delete(id);
          t.fn();
          await new Promise((r) => setTimeout(r, 0));
          await new Promise((r) => setTimeout(r, 0));
        }
    },
  };
}

let night: Playlist;
beforeEach(() => {
  mem.clear();
  night = JSON.parse(
    readFileSync(join(__dirname, "../../public/featured/golden-double-peak.json"), "utf8"),
  ) as Playlist;
});

const swapFirstTwo = (p: Playlist): Playlist => {
  const t = [...p.tandas];
  [t[0], t[1]] = [t[1]!, t[0]!];
  return { ...p, tandas: t };
};

describe("exported playlists follow the night (lib/playlistSync.ts)", () => {
  it("an export is remembered per night and turns the sync on", () => {
    rememberExport(night, {
      service: "spotify",
      id: "pl1",
      url: "https://open.spotify.com/playlist/pl1",
      includeCortinas: true,
    });
    const r = recordOf(night.id)!;
    expect(r.enabled).toBe(true);
    expect(r.targets).toHaveLength(1);
    expect(r.targets[0]!.signature).toBe(signatureOf(night, true));
    expect(statusOf(night.id, "spotify").state).toBe("ok");
  });

  it("edits are debounced: one write 5 s after the last change, with the change count; undo syncs too", async () => {
    const c = clock();
    const writes: Array<{ service: string; rows: number }> = [];
    const s: Syncer = createSyncer({
      ...c,
      write: async (service, p, t) => {
        writes.push({ service, rows: syncRows(p, t.includeCortinas).length });
        return { ok: true };
      },
    });
    rememberExport(night, { service: "spotify", id: "pl1", url: "u", includeCortinas: true });
    rememberExport(night, { service: "youtube", id: "yt1", url: "u", includeCortinas: false });
    const a = swapFirstTwo(night);
    s.noteChange(a);
    await c.advance(2000);
    const b = { ...a, tandas: a.tandas.map((t, i) => (i === 2 ? { ...t, bypass: true } : t)) };
    s.noteChange(b);
    expect(statusOf(night.id, "spotify")).toMatchObject({ state: "pending", changes: 2 });
    await c.advance(SYNC_DELAY_MS - 1);
    expect(writes).toHaveLength(0);
    await c.advance(1);
    expect(writes.map((w) => w.service)).toEqual(["spotify", "youtube"]);
    // Skip tonight leaves the tanda out of the synced playlists
    expect(writes[0]!.rows).toBe(syncRows(night, true).length - (night.tandas[2]!.songs.length + 1));
    expect(statusOf(night.id, "spotify")).toMatchObject({ state: "ok", changes: 2 });
    // undo: the night as it was is a change again
    s.noteChange(night);
    await c.advance(SYNC_DELAY_MS);
    expect(writes).toHaveLength(4);
    expect(recordOf(night.id)!.targets[0]!.signature).toBe(signatureOf(night, true));
  });

  it("a change that leaves the rows as they were (a lock) writes nothing", async () => {
    const c = clock();
    let n = 0;
    const s = createSyncer({ ...c, write: async () => ((n += 1), { ok: true }) });
    rememberExport(night, { service: "spotify", id: "pl1", url: "u", includeCortinas: true });
    s.noteChange({ ...night, tandas: night.tandas.map((t) => ({ ...t, locked: true })) });
    await c.advance(SYNC_DELAY_MS);
    expect(n).toBe(0);
  });

  it("never during a Spotify Connect play request burst: it waits and then writes", async () => {
    const c = clock();
    let busy = true;
    let n = 0;
    const s = createSyncer({ ...c, busy: () => busy, write: async () => ((n += 1), { ok: true }) });
    rememberExport(night, { service: "spotify", id: "pl1", url: "u", includeCortinas: true });
    s.noteChange(swapFirstTwo(night));
    await c.advance(SYNC_DELAY_MS);
    expect(n).toBe(0);
    await c.advance(BURST_RETRY_MS);
    expect(n).toBe(0);
    busy = false;
    await c.advance(BURST_RETRY_MS);
    expect(n).toBe(1);
  });

  it("an error is shown with Retry; Retry writes again; the switch off stops the sync", async () => {
    const c = clock();
    let fail = true;
    let n = 0;
    const s = createSyncer({
      ...c,
      write: async () => {
        n++;
        return fail ? { ok: false, error: "Spotify answered 502" } : { ok: true };
      },
    });
    rememberExport(night, { service: "spotify", id: "pl1", url: "u", includeCortinas: true });
    const a = swapFirstTwo(night);
    s.noteChange(a);
    await c.advance(SYNC_DELAY_MS);
    expect(statusOf(night.id, "spotify")).toMatchObject({ state: "error", error: "Spotify answered 502" });
    fail = false;
    await s.flush(a);
    expect(statusOf(night.id, "spotify").state).toBe("ok");
    expect(n).toBe(2);
    setSyncEnabled(night.id, false);
    s.noteChange(night);
    await c.advance(SYNC_DELAY_MS);
    expect(n).toBe(2);
  });

  it("the cover follows: a new cover key is a change for Spotify even when the rows stay", async () => {
    const c = clock();
    const covers: string[] = [];
    const key = (p: Playlist) => p.name;
    const s = createSyncer({
      ...c,
      coverKey: key,
      write: async (_s, p) => {
        covers.push(key(p));
        return { ok: true, cover: "added", coverKey: key(p) };
      },
    });
    rememberExport(night, { service: "spotify", id: "pl1", url: "u", includeCortinas: true });
    s.noteChange(swapFirstTwo(night));
    await c.advance(SYNC_DELAY_MS);
    expect(covers).toEqual([night.name]);
    s.noteChange({ ...swapFirstTwo(night), name: "Renamed" });
    await c.advance(SYNC_DELAY_MS);
    expect(covers).toEqual([night.name, "Renamed"]);
    expect(statusOf(night.id, "spotify").cover).toBe("added");
  });
});
