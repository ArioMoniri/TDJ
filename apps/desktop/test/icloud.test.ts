import { describe, expect, it } from "vitest";
import { formatCode } from "../../web/src/lib/sync/code";
import { deriveKeys, open } from "../../web/src/lib/sync/crypto";
import { type Persist, SyncEngine, type Transport } from "../../web/src/lib/sync/engine";
import type { Library, Night } from "../../web/src/lib/sync/library";
import { type Invoke, icloudStatus, icloudTransport } from "../../web/src/lib/sync/transports";
import { type ICloudDrive, icloudCommand, newDrive } from "../store/icloud-mock";

/**
 * docs/SYNC.md: the Apple apps mirror the sync log into iCloud Documents. Two app instances on the mocked native side
 * (store/icloud-mock.ts, used by store/tauri-mock.ts) signed in to one iCloud account sync with no server at all.
 */
const CODE = formatCode("ac1ccd0ac1ccd0ac1ccd0ac1cc");

/** the page's `invoke` against the mock (errors thrown, as the real bridge does) */
const invokeOn =
  (drive: ICloudDrive, available = true): Invoke =>
  async <T>(cmd: string, args: Record<string, unknown> = {}) => {
    const r = icloudCommand(drive, cmd, args, available) as { error?: { message: string } } | T;
    if (r && typeof r === "object" && "error" in (r as object)) throw (r as { error: unknown }).error;
    return r as T;
  };

const night = (id: string, title: string): Night => ({
  id,
  createdAt: `2026-11-2${id.length}T20:00:00Z`,
  title,
  source: "compose",
  playlist: { tandas: [] },
});
function device() {
  const d = {
    lib: { history: [], memory: { notes: [] }, settings: {}, overrides: {} } as Library,
    read: () => d.lib,
    write: (p: Partial<Library>) => {
      d.lib = { ...d.lib, ...p };
    },
  };
  return d;
}
const persist = (): Persist => {
  const m = new Map<string, unknown>();
  return {
    get: async <T>(k: string) => structuredClone(m.get(k)) as T | undefined,
    set: async (k, v) => void m.set(k, structuredClone(v)),
    del: async (k) => void m.delete(k),
  };
};

describe("iCloud path (tauri mock)", () => {
  it("two Apple devices on one iCloud account sync renames and deletes with no server", async () => {
    const drive = newDrive();
    const keys = await deriveKeys(CODE);
    const tA: Transport = await icloudTransport(keys.id, invokeOn(drive));
    const tB: Transport = await icloudTransport(keys.id, invokeOn(drive));
    const a = device();
    const b = device();
    const ea = new SyncEngine(keys, { id: "macAAAAA", name: "Mac", platform: "app-mac" }, a, [tA], persist());
    const eb = new SyncEngine(
      keys,
      { id: "ipadBBBB", name: "iPad", platform: "app-ipad" },
      b,
      [tB],
      persist(),
    );

    a.lib = { ...a.lib, history: [night("n1", "Saturday"), night("n22", "Práctica")] };
    await ea.sync();
    await eb.sync();
    expect(b.lib.history.map((h) => h.title).sort()).toEqual(["Práctica", "Saturday"]);

    b.lib = {
      ...b.lib,
      history: b.lib.history.filter((h) => h.id !== "n22").map((h) => ({ ...h, title: "Sábado" })),
    };
    await eb.sync();
    await ea.sync();
    expect(a.lib.history.map((h) => h.title)).toEqual(["Sábado"]);
    expect(
      ea
        .devices()
        .map((d) => d.name)
        .sort(),
    ).toEqual(["Mac", "iPad"]);

    // the folder holds ciphertext under a hash of the space id: no title, no code, no id
    const dump = JSON.stringify([...drive.files]);
    expect(dump).not.toMatch(/Sábado|Saturday|Práctica/);
    expect(dump).not.toContain(keys.id);
    const [key, file] = [...drive.files][0]!;
    const rid = key.split("/")[1]!.replace(".tdjsync", "");
    expect(await open(keys, file.data, rid)).toHaveProperty("k");
  });

  it("status: on, iCloud Drive off, and the DMG (no iCloud)", async () => {
    const drive = newDrive();
    expect(await icloudStatus(invokeOn(drive))).toEqual({ available: true });
    drive.signedIn = false;
    expect(await icloudStatus(invokeOn(drive))).toEqual({ available: false, reason: "off" });
    expect(await icloudStatus(invokeOn(newDrive(), false))).toEqual({
      available: false,
      reason: "unsupported",
    });
    // a page outside the apps: no native side at all
    expect(await icloudStatus(() => Promise.reject(new Error("no bridge")))).toEqual({
      available: false,
      reason: "unsupported",
    });
  });

  it("the native side refuses paths out of the folder and anything but a sealed record", () => {
    const drive = newDrive();
    const space = "abcdefghijklmnopqrstuvwxyzABCDEF";
    const name = "AAAAAAAAAAAAAAAAAAAAAA.tdjsync";
    expect(icloudCommand(drive, "icloud_write", { space: "../..", name, data: "AQID" })).toHaveProperty(
      "error",
    );
    expect(icloudCommand(drive, "icloud_write", { space, name: "../x", data: "AQID" })).toHaveProperty(
      "error",
    );
    expect(icloudCommand(drive, "icloud_write", { space, name, data: '{"title":"x"}' })).toHaveProperty(
      "error",
    );
    expect(icloudCommand(drive, "icloud_write", { space, name, data: "AQID" })).toBeNull();
    icloudCommand(drive, "icloud_remove", { space });
    expect(icloudCommand(drive, "icloud_list", { space })).toEqual([]);
  });
});
