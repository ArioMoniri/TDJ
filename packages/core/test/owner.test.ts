/**
 * 2026-11 — owner contributions: the deployment owner's catalogue edits (Database corrections, filled values, added
 * sides and cortinas, Spotify / Deezer / YouTube matches, artwork) travel to the repo as contributions, are merged into
 * data/sources/owner-overrides.json (a keyed map with provenance) and projected into data/index/owner.json, which
 * every runtime applies under the DJ's own database. Written before src/owner.ts:
 *   - a batch is validated strictly (kinds, ids, field whitelist, ranges, sizes) and never carries a secret;
 *   - merging is idempotent, newer wins per key, a null value withdraws the owner's change;
 *   - personal categories (learning, favourites, history, grades) are archived but never change the catalogue;
 *   - the projection changes exactly the rows it names, and an empty layer changes nothing.
 */
import { describe, expect, it } from "vitest";
import {
  applyContributions,
  applyOwnerLayer,
  CONTRIB_LIMITS,
  type ContributionItem,
  type Cortina,
  emptyOwnerFile,
  emptyOwnerLayer,
  prepareItem,
  projectOwnerLayer,
  type Song,
  type StoredContribution,
  validateContributionBatch,
} from "../src/index";

const AT = "2026-11-16T10:00:00.000Z";
const LATER = "2026-11-16T11:00:00.000Z";
const song = (p: Partial<Song> = {}): Song => ({
  id: "s1",
  title: "Corazón",
  rhythm: "tango",
  orchestra: "Carlos Di Sarli",
  orchestraId: "carlos-di-sarli",
  singer: "Roberto Rufino",
  singerId: "roberto-rufino",
  vocal: true,
  year: 1939,
  era: "golden-early",
  ...p,
});
const item = (kind: ContributionItem["kind"], id: string, value: unknown, at = AT): ContributionItem => ({
  kind,
  id,
  value,
  at,
});
const batch = (items: unknown[]) => ({ v: 1, source: "web", items });
const contribution = (id: string, items: ContributionItem[], at = AT): StoredContribution => ({
  id,
  at,
  items,
});

describe("validateContributionBatch", () => {
  it("accepts catalogue edits and keeps only whitelisted fields", () => {
    const r = validateContributionBatch(
      batch([
        item("song", "8106c5a228", { year: 1938, singer: "Roberto Ray", bpm: 118, evil: "x", __proto__: 1 }),
        item("artwork", "8106c5a228", "https://i.scdn.co/image/abc"),
        item("youtube", "8106c5a228", "dQw4w9WgXcQ"),
      ]),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.batch.items[0]!.value).toEqual({ year: 1938, singer: "Roberto Ray", bpm: 118 });
    expect(r.batch.items).toHaveLength(3);
  });

  it("refuses unknown kinds, bad ids, out-of-range values and non-https urls", () => {
    const bad = [
      batch([item("connectors" as never, "x", {})]),
      batch([item("song", "../../etc/passwd", { year: 1938 })]),
      batch([item("song", "s1", { year: 3000 })]),
      batch([item("song", "s1", { bpm: "fast" })]),
      batch([item("artwork", "s1", "javascript:alert(1)")]),
      batch([item("artwork", "s1", "http://insecure.example/a.jpg")]),
      batch([item("youtube", "s1", "not a video id!")]),
      batch([item("song", "s1", {})]),
      { v: 2, items: [] },
      { v: 1, items: "nope" },
      null,
      [],
    ];
    for (const b of bad) expect(validateContributionBatch(b).ok, JSON.stringify(b)).toBe(false);
  });

  it("refuses an empty batch, too many items and oversized values", () => {
    expect(validateContributionBatch(batch([])).ok).toBe(false);
    const many = Array.from({ length: CONTRIB_LIMITS.items + 1 }, (_, i) =>
      item("youtube", `s${i}`, "dQw4w9WgXcQ"),
    );
    expect(validateContributionBatch(batch(many)).ok).toBe(false);
    const long = item("song", "s1", { title: "x".repeat(CONTRIB_LIMITS.str + 1) });
    expect(validateContributionBatch(batch([long])).ok).toBe(false);
    const big = item("learning", "learning", { blob: "x".repeat(CONTRIB_LIMITS.personalBytes) });
    expect(validateContributionBatch(batch([big])).ok).toBe(false);
  });

  it("refuses anything that looks like a secret, anywhere in the batch", () => {
    for (const secret of [
      "sk-ant-api03-abcdefghijklmnopqrstuvwxyz",
      "Bearer abcdefghijklmnop",
      "ghp_abcdefghijklmnopqrstuvwxyz0123",
      "AIzaSyA-abcdefghijklmnopqrstuvwx",
    ]) {
      const r = validateContributionBatch(batch([item("song", "s1", { notes: secret, year: 1940 })]));
      // notes is not whitelisted, so it is dropped: the batch is still checked as sent
      expect(r.ok, secret).toBe(false);
      const p = validateContributionBatch(batch([item("learning", "learning", { note: secret })]));
      expect(p.ok, secret).toBe(false);
    }
  });

  it("validates added sides and cortinas as whole records", () => {
    const side = song({ id: "dj-1", title: "Me Voy a Baraja", source: "dj-added" });
    expect(validateContributionBatch(batch([item("addedSong", "dj-1", side)])).ok).toBe(true);
    // the record's id must be the item's id; a side needs its title, orchestra and rhythm
    expect(validateContributionBatch(batch([item("addedSong", "dj-2", side)])).ok).toBe(false);
    expect(
      validateContributionBatch(batch([item("addedSong", "dj-1", { ...side, rhythm: "disco" })])).ok,
    ).toBe(false);
    const c: Cortina = {
      id: "c-own-1",
      title: "Hit the Road Jack",
      artist: "Ray Charles",
      genre: "soul",
      culture: "global",
      energy: 60,
    };
    expect(validateContributionBatch(batch([item("cortina", "c-own-1", c)])).ok).toBe(true);
    expect(validateContributionBatch(batch([item("cortina", "c-own-1", { ...c, energy: 900 })])).ok).toBe(
      false,
    );
  });

  it("null withdraws a catalogue change; personal kinds take a bounded JSON object", () => {
    expect(validateContributionBatch(batch([item("song", "s1", null)])).ok).toBe(true);
    expect(
      validateContributionBatch(batch([item("favourites", "favourites", { sides: { s1: 3 } })])).ok,
    ).toBe(true);
    // a personal kind is one document per category: its id is the category
    expect(validateContributionBatch(batch([item("favourites", "x", { a: 1 })])).ok).toBe(false);
  });
});

describe("prepareItem (the device side)", () => {
  it("keeps whitelisted fields, drops a bad one on its own, never sends free text or audio", () => {
    const it0 = prepareItem(
      "song",
      "s1",
      {
        year: 1938,
        bpm: 0,
        notes: "my password is hunter2",
        audio: { bpm: 120 },
        singer: "Roberto Ray",
      },
      AT,
    );
    expect(it0?.value).toEqual({ year: 1938, singer: "Roberto Ray" });
    expect(prepareItem("song", "s1", { notes: "only notes" }, AT)).toBeNull();
    expect(prepareItem("artwork", "s1", "http://insecure", AT)).toBeNull();
    // whatever prepareItem returns, the server's batch validation accepts
    const r = validateContributionBatch({ v: 1, source: "web", items: [it0] });
    expect(r.ok).toBe(true);
  });
});

describe("applyContributions", () => {
  it("writes a keyed map with provenance and is idempotent", () => {
    const c = contribution("c1", [item("song", "s1", { year: 1938 })]);
    const a = applyContributions(emptyOwnerFile(), [c]);
    expect(a.applied).toEqual(["c1"]);
    expect(a.file.entries.song?.s1).toEqual({ value: { year: 1938 }, at: AT, contribution: "c1" });
    const b = applyContributions(a.file, [c]);
    expect(b.applied).toEqual([]);
    expect(b.skipped).toEqual([{ id: "c1", why: "already merged" }]);
    expect(b.file).toEqual(a.file);
  });

  it("the newer value wins per key, whatever order the contributions arrive in", () => {
    const older = contribution("c1", [item("song", "s1", { year: 1938 }, AT)], AT);
    const newer = contribution("c2", [item("song", "s1", { year: 1941 }, LATER)], LATER);
    const x = applyContributions(emptyOwnerFile(), [newer, older]).file;
    const y = applyContributions(emptyOwnerFile(), [older, newer]).file;
    expect(x.entries.song?.s1?.value).toEqual({ year: 1941 });
    expect(y.entries).toEqual(x.entries);
  });

  it("null withdraws the entry; personal kinds land in their own section", () => {
    const f1 = applyContributions(emptyOwnerFile(), [
      contribution("c1", [item("song", "s1", { year: 1938 }), item("learning", "learning", { w: 1 })]),
    ]).file;
    expect(f1.personal.learning?.value).toEqual({ w: 1 });
    expect((f1.entries as Record<string, unknown>).learning).toBeUndefined();
    const f2 = applyContributions(f1, [contribution("c2", [item("song", "s1", null, LATER)], LATER)]).file;
    expect(f2.entries.song?.s1).toBeUndefined();
  });

  it("re-validates stored contributions: a tampered one is skipped, the rest apply", () => {
    const ok = contribution("c1", [item("youtube", "s1", "dQw4w9WgXcQ")]);
    const bad = contribution("c2", [item("artwork", "s1", "javascript:alert(1)")]);
    const r = applyContributions(emptyOwnerFile(), [ok, bad]);
    expect(r.applied).toEqual(["c1"]);
    expect(r.skipped.map((s) => s.id)).toEqual(["c2"]);
  });
});

describe("owner layer", () => {
  const base = () => ({
    songs: [song(), song({ id: "s2", title: "Bahía Blanca", year: 1957, singer: null, vocal: false })],
    profiles: [{ id: "carlos-di-sarli", name: "Carlos Di Sarli", style: "lyrical" as const, energy: 55 }],
    cortinas: [{ id: "c1", title: "A", artist: "B", genre: "pop", culture: "global", energy: 50 } as Cortina],
    deezer: {},
  });

  it("an empty layer changes nothing", () => {
    const b = base();
    expect(applyOwnerLayer(b, emptyOwnerLayer())).toEqual(b);
    expect(applyOwnerLayer(b, undefined)).toEqual(b);
    expect(projectOwnerLayer(emptyOwnerFile())).toEqual(emptyOwnerLayer());
  });

  it("projects the catalogue kinds and applies exactly the rows they name", () => {
    const file = applyContributions(emptyOwnerFile(), [
      contribution("c1", [
        item("song", "s1", { year: 1938, bpm: 120 }),
        item("addedSong", "dj-1", song({ id: "dj-1", title: "Nueva", source: "dj-added" })),
        item("cortina", "c-own", {
          id: "c-own",
          title: "Own",
          artist: "Me",
          genre: "jazz",
          culture: "global",
          energy: 40,
        }),
        item("profile", "carlos-di-sarli", { energy: 60 }),
        item("scraped", "s2", {
          deezerId: "12345",
          bpm: 112,
          gainDb: -6.5,
          artwork: "https://cdn.example/s2.jpg",
          fields: { deezerId: "deezer", bpm: "deezer", gainDb: "deezer", artwork: "deezer" },
        }),
        item("spotify", "s2", { uri: "spotify:track:0123456789abcdefghijkl", matched: "Di Sarli – Bahía" }),
        item("youtube", "s1", "dQw4w9WgXcQ"),
        item("learning", "learning", { w: 1 }),
      ]),
    ]).file;
    const layer = projectOwnerLayer(file);
    expect(layer.youtube).toEqual({ s1: "dQw4w9WgXcQ" });
    expect(layer.artwork).toEqual({ s2: "https://cdn.example/s2.jpg" });
    // personal kinds never reach the catalogue
    expect(JSON.stringify(layer)).not.toContain('"w":1');
    const out = applyOwnerLayer(base(), layer);
    expect(out.songs.find((s) => s.id === "s1")).toMatchObject({ year: 1938, bpm: 120 });
    expect(out.songs.find((s) => s.id === "s2")?.spotify?.uri).toBe("spotify:track:0123456789abcdefghijkl");
    expect(out.songs.find((s) => s.id === "s2")?.bpm).toBe(112);
    expect(out.songs.map((s) => s.id)).toEqual(["s1", "s2", "dj-1"]);
    expect(out.cortinas.map((c) => c.id)).toEqual(["c1", "c-own"]);
    expect(out.profiles[0]!.energy).toBe(60);
    expect((out.deezer as Record<string, unknown>).s2).toMatchObject({
      id: "12345",
      bpm: 112,
      gain: -6.5,
      source: "owner",
    });
  });

  it("hiding: a copy hides its row, a title hides every copy of that orchestra and title", () => {
    const b = base();
    b.songs.push(song({ id: "s3", title: "Corazón", year: 1951 }));
    const copy = projectOwnerLayer(
      applyContributions(emptyOwnerFile(), [
        contribution("c1", [item("song", "s3", { hidden: true, hiddenScope: "copy" })]),
      ]).file,
    );
    expect(applyOwnerLayer(b, copy).songs.map((s) => s.id)).toEqual(["s1", "s2"]);
    const title = projectOwnerLayer(
      applyContributions(emptyOwnerFile(), [contribution("c1", [item("song", "s1", { hidden: true })])]).file,
    );
    expect(applyOwnerLayer(b, title).songs.map((s) => s.id)).toEqual(["s2"]);
  });

  it("an added side never replaces an indexed row with the same id", () => {
    const layer = projectOwnerLayer(
      applyContributions(emptyOwnerFile(), [
        contribution("c1", [item("addedSong", "s1", song({ id: "s1", title: "Impostor" }))]),
      ]).file,
    );
    const out = applyOwnerLayer(base(), layer);
    expect(out.songs.filter((s) => s.id === "s1").map((s) => s.title)).toEqual(["Corazón"]);
  });
});

describe("the committed layer (data/index/owner.json) in buildLoaded", () => {
  it("is listed with the data files, so the apps bundle it", async () => {
    const { DATA_FILES } = await import("../src/data");
    expect(DATA_FILES.owner).toBe("data/index/owner.json");
  });

  it("buildLoaded applies the layer under the DJ's own database; the per-DJ catalogue keeps it", async () => {
    const { buildLoaded } = await import("../src/data");
    const { readDataFiles } = await import("../src/load");
    const files = readDataFiles();
    const songs = files.songs as Song[];
    const target = songs.find((s) => s.rhythm === "tango" && s.year && s.year > 1935)!;
    const layer = { ...emptyOwnerLayer(), songs: { [target.id]: { year: 1931, album: "Owner album" } } };
    const loaded = buildLoaded({ ...files, owner: layer });
    const got = loaded.catalog.songs.find((s) => s.id === target.id)!;
    expect(got.year).toBe(1931);
    expect(got.album).toBe("Owner album");
    expect(loaded.raw.songs.find((s) => s.id === target.id)!.year).toBe(1931);
    // the DJ's own edit still wins over the owner's
    const mine = buildLoaded({ ...files, owner: layer }, { songs: { [target.id]: { year: 1944 } } });
    expect(mine.catalog.songs.find((s) => s.id === target.id)!.year).toBe(1944);
    // and a malformed file changes nothing
    const plain = buildLoaded({ ...files, owner: "garbage" });
    expect(plain.catalog.songs.find((s) => s.id === target.id)!.year).toBe(target.year);
  });
});
