import { emptyMemory } from "@tdj/core";
import { describe, expect, it } from "vitest";
import { formatCode, newCode } from "./code";
import { exportEncrypted, exportPlain, mergeImport, readLibraryFile } from "./file";
import type { Library } from "./library";

const CODE = formatCode("fefefefefefefefefefefefe00");
const night = (id: string, title: string, updatedAt?: string) =>
  ({
    id,
    createdAt: `2026-11-1${id.length}T20:00:00Z`,
    title,
    options: {},
    playlist: { tandas: [] },
    score: 1,
    source: "import",
    ...(updatedAt ? { updatedAt } : {}),
  }) as never;
const lib = (): Library =>
  ({
    history: [night("n1", "Friday")],
    memory: { ...emptyMemory(), notes: [{ at: "x", text: "Donato milongas work here", source: "dj" }] },
    settings: {
      theme: "dark",
      ai: { provider: "anthropic", key: "sk-ant-secret", model: "" },
      djApps: { rekordbox: { folder: "/Users/x" } },
    },
    overrides: { connectors: { a: 1 } },
  }) as never;

describe("library file (the fallback)", () => {
  it("plain JSON: nights, memory and settings, never keys or folders", async () => {
    const text = exportPlain(lib());
    expect(text).toContain("Donato milongas");
    expect(text).not.toMatch(/sk-ant|Users|connectors/);
    const r = await readLibraryFile(text);
    expect(r.ok && r.file.nights.map((n) => n.title)).toEqual(["Friday"]);
  });

  it("encrypted with the code: unreadable without it, refused with another", async () => {
    const text = await exportEncrypted(lib(), CODE);
    expect(text).not.toMatch(/Friday|Donato/);
    expect(await readLibraryFile(text)).toEqual({ ok: false, reason: "needs-code" });
    expect(await readLibraryFile(text, newCode())).toEqual({ ok: false, reason: "wrong-code" });
    const r = await readLibraryFile(text, CODE.toUpperCase());
    expect(r.ok && r.file.memory.notes).toEqual([
      { at: "x", text: "Donato milongas work here", source: "dj" },
    ]);
    expect(await readLibraryFile("not json")).toEqual({ ok: false, reason: "not-a-library" });
  });

  it("import adds nights, keeps the newer copy of one already here, and keeps this device's keys", async () => {
    const here = { ...lib(), history: [night("n1", "Friday (newer)", "2026-11-19T00:00:00Z")] } as Library;
    const file = await readLibraryFile(
      exportPlain({ ...lib(), history: [night("n1", "Friday"), night("n22", "Sunday")] }),
    );
    if (!file.ok) throw new Error("unreadable");
    const { next, added } = mergeImport(here, file.file);
    expect(added).toBe(1);
    expect(next.history!.map((h) => h.title).sort()).toEqual(["Friday (newer)", "Sunday"]);
    expect((next.settings as { theme?: string }).theme).toBe("dark");
    expect(next.settings!.ai).toBeUndefined(); // not in the file: this device's own stays (setSettings merges)
    expect(next.overrides!.connectors).toEqual({ a: 1 });
  });
});
