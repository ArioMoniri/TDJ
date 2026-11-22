import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { DeviceStore, migrate, type SqlDriver } from "./app/store";
import { boundedHistory, historyAfter, historyForServer, makeSnapshot, mergeHistory } from "./history";
import type { HistorySnapshot, Playlist } from "./types";

/**
 * 2026-11 (the owner, Mac app: "History is empty … the sidebar's Recent nights section is missing"). The root cause:
 * the apps answer /api/db from the on-device SQLite, which replaces its history with what a save sends, and saves
 * sent the web server row's 300 KB budget — a real 4 h night with a few edits is over it, so an EMPTY list was sent
 * and the device's History was wiped on every save (the Recent nights only show when History has nights). Here: a
 * real night, edited, saved through the device's own store, comes back whole; an early save never wipes the list.
 */
const real = JSON.parse(
  readFileSync(join(__dirname, "../../public/featured/golden-double-peak.json"), "utf8"),
) as Playlist;

function sqlite(): SqlDriver {
  const raw = new DatabaseSync(":memory:");
  return {
    execute: async (sql, params = []) => raw.prepare(sql).run(...(params as never[])),
    select: async <T>(sql: string, params: unknown[] = []) =>
      raw.prepare(sql).all(...(params as never[])) as T[],
  };
}

/** a composed night and an imported one, the composed one edited twice (its versions kept inside it) */
function nights(): HistorySnapshot[] {
  let list: HistorySnapshot[] = [];
  let cur: string | null = null;
  const step = (ev: Parameters<typeof historyAfter>[2]) => {
    const r = historyAfter(list, cur, ev);
    list = r.list;
    cur = r.currentId;
  };
  step({
    kind: "new",
    snap: makeSnapshot({ ...real, id: "imported", name: "From Spotify" }, real.options, "import"),
  });
  step({
    kind: "new",
    snap: makeSnapshot({ ...real, id: "composed", name: "Saturday" }, real.options, "compose"),
  });
  step({
    kind: "edit",
    playlist: { ...real, id: "composed" },
    label: "Swapped a tanda",
    options: real.options,
  });
  step({ kind: "edit", playlist: { ...real, id: "composed" }, label: "Calmer", options: real.options });
  return list;
}

describe("History on the device (the apps' SQLite)", () => {
  it("the bug: the web row's byte budget turns a real edited night into an empty list", () => {
    const list = nights();
    expect(JSON.stringify(list[0]).length).toBeGreaterThan(300_000);
    expect(boundedHistory(list)).toEqual([]);
  });

  it("the device keeps every night, composed and imported, whatever its size", async () => {
    const list = nights();
    const sent = historyForServer(list, true);
    expect(sent.map((h) => h.id)).toEqual(list.map((h) => h.id));
    const db = sqlite();
    await migrate(db);
    const store = new DeviceStore(db);
    await store.putHistory(JSON.parse(JSON.stringify({ history: sent })).history);
    const back = await store.getHistory<HistorySnapshot>();
    expect(back.map((h) => h.id)).toEqual(list.map((h) => h.id));
    expect(back.map((h) => h.source)).toEqual(["compose", "import"]);
    expect(back[0]!.versions).toHaveLength(2);
  });

  it("the web keeps its row's budget (one DynamoDB item)", () => {
    expect(historyForServer(nights(), false)).toEqual(boundedHistory(nights()));
  });

  it("a night made before the database answered joins the stored ones (never replaces them)", () => {
    const stored = nights();
    const early = makeSnapshot({ ...real, id: "early", name: "Early" }, real.options, "compose");
    const merged = mergeHistory([early], stored, []);
    expect(merged.map((h) => h.playlist.id).sort()).toEqual(["composed", "early", "imported"]);
    // and the in-memory copy (a rename made meanwhile) wins over the stored one
    const renamed = { ...stored[0]!, title: "Renamed" };
    expect(mergeHistory([renamed], stored, stored).find((h) => h.id === renamed.id)?.title).toBe("Renamed");
  });
});
