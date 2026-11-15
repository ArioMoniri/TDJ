/**
 * Share a night (ROADMAP §13): the `.tdjnight` export → import round trip is identical, nothing personal travels,
 * every side resolves by id then by title / orchestra / year, a side the catalogue lacks is listed (never dropped),
 * and the link codec keeps to its size limits in both directions.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  appNightLink,
  compose,
  decodeNightPayload,
  encodeNightPayload,
  exportNight,
  importNight,
  MAX_LINK_PAYLOAD,
  MAX_NIGHT_BYTES,
  NIGHT_LINK_PREFIX,
  type NightFile,
  NightFormatError,
  NightLinkError,
  nightFileName,
  nightFileText,
  nightLink,
  type Playlist,
  parseNightFile,
  payloadFromLink,
} from "../src/index";
import { type Loaded, loadCatalog } from "../src/load";

let cat: Loaded;
let p: Playlist;
let file: NightFile;
beforeAll(() => {
  cat = loadCatalog();
  p = compose({ hours: 4, seed: 7 }, cat);
  // the DJ's own flags travel with the night
  p.tandas[2] = { ...p.tandas[2]!, locked: true };
  p.tandas[5] = { ...p.tandas[5]!, bypass: true };
  file = exportNight(p);
}, 180_000);

describe(".tdjnight round trip", () => {
  it("export → file text → import → export is identical", () => {
    const text = nightFileText(file);
    const back = importNight(JSON.parse(text), cat);
    expect(back.missing).toEqual([]);
    expect(exportNight(back.playlist)).toEqual(file);
  });

  it("the imported night is the same night: sides, cortinas, Cumparsitas, flags, settings", () => {
    const { playlist: q } = importNight(file, cat);
    expect(q.tandas.map((t) => t.songs.map((s) => s.id))).toEqual(
      p.tandas.map((t) => t.songs.map((s) => s.id)),
    );
    expect(q.tandas.map((t) => t.cortina?.id ?? null)).toEqual(p.tandas.map((t) => t.cortina?.id ?? null));
    expect(q.closing?.id).toBe(p.closing?.id);
    expect(q.opening?.id ?? null).toBe(p.opening?.id ?? null);
    expect(q.tandas[2]!.locked).toBe(true);
    expect(q.tandas[5]!.bypass).toBe(true);
    expect(q.options.hours).toBe(4);
    expect(q.options.seed).toBe(7);
    expect(q.score.total).toBe(p.score.total);
    expect(q.booth?.items.length).toBe(p.booth?.items.length);
  });

  it("carries every stream id and the score, and nothing personal", () => {
    const sides = file.tandas.flatMap((t) => t.sides);
    expect(sides.filter((s) => s.streams?.spotify).length).toBe(
      p.tandas.flatMap((t) => t.songs).filter((s) => s.spotify?.uri).length,
    );
    expect(file.score.total).toBe(p.score.total);
    const withPrivate = exportNight({
      ...p,
      options: {
        ...p.options,
        learned: { version: 1 } as never,
        overrides: { songs: {} } as never,
        recent: { titles: ["x"] },
        explicit: ["hours"],
      },
    });
    for (const k of ["learned", "overrides", "recent", "explicit", "contextApplied"])
      expect(withPrivate.options).not.toHaveProperty(k);
    const text = nightFileText(withPrivate);
    expect(text).not.toMatch(/previewUrl|hdnea|token|apiKey|secret|access_token|@/i);
    expect(JSON.stringify(withPrivate.booth ?? {})).not.toContain("measurements");
  });
});

describe("import against another catalogue", () => {
  it("resolves by title / orchestra / year when the id is unknown", () => {
    const f = structuredClone(file);
    const s = f.tandas[0]!.sides[0]!;
    const want = s.id;
    s.id = "not-a-real-id";
    const r = importNight(f, cat);
    expect(r.playlist.tandas[0]!.songs[0]!.id).toBe(want);
    expect(r.matched.byTitle).toBe(1);
    expect(r.missing).toEqual([]);
  });

  it("lists a side the catalogue lacks and keeps it in its tanda with its stream id", () => {
    const f = structuredClone(file);
    f.tandas[1]!.sides[1] = {
      id: "zz-unknown",
      title: "Un Tango Que No Existe",
      orchestra: "Orquesta Imaginaria",
      orchestraId: "orquesta-imaginaria",
      singer: null,
      year: 1941,
      rhythm: "tango",
      streams: { spotify: "spotify:track:0123456789abcdefghijkl" },
    };
    const r = importNight(f, cat);
    expect(r.missing).toEqual([
      {
        where: "Tanda 2, side 2",
        title: "Un Tango Que No Existe",
        by: "Orquesta Imaginaria",
        year: 1941,
        streamable: true,
      },
    ]);
    const kept = r.playlist.tandas[1]!.songs[1]!;
    expect(kept.title).toBe("Un Tango Que No Existe");
    expect(kept.spotify?.uri).toBe("spotify:track:0123456789abcdefghijkl");
    expect(r.playlist.tandas[1]!.songs.length).toBe(p.tandas[1]!.songs.length);
  });

  it("refuses what is not a night, and a night from a newer version, in plain words", () => {
    expect(() => parseNightFile("{}")).toThrow(NightFormatError);
    expect(() => parseNightFile("not json")).toThrow("not a T-DJ night");
    expect(() => parseNightFile({ ...file, version: 99 })).toThrow("newer T-DJ");
  });

  it("names the file after the night", () => {
    expect(nightFileName("Milonga del Sábado · 4 h")).toBe("Milonga del Sabado 4 h.tdjnight");
    expect(nightFileName("///")).toBe("Night.tdjnight");
  });
});

describe("share-link codec", () => {
  it("a 4 h night fits a link and decodes to the same document", async () => {
    const payload = await encodeNightPayload(file);
    expect(payload.startsWith(NIGHT_LINK_PREFIX)).toBe(true);
    expect(payload.length).toBeLessThanOrEqual(MAX_LINK_PAYLOAD);
    expect(payload).toMatch(/^n1\.[A-Za-z0-9_-]+$/);
    expect(await decodeNightPayload(payload)).toEqual(file);
    const link = nightLink("https://a.example/", payload);
    expect(link).toBe(`https://a.example/night#${payload}`);
    expect(payloadFromLink(link)).toBe(payload);
    expect(payloadFromLink(appNightLink(payload))).toBe(payload);
    expect(payloadFromLink("https://a.example/night")).toBeNull();
  });

  it("refuses to make a link past the size limit", async () => {
    await expect(encodeNightPayload(file, 200)).rejects.toMatchObject({ code: "too-large" });
    // an 8 h night of random titles does not compress into a link
    const big = structuredClone(file);
    big.tandas = Array.from({ length: 60 }, (_x, i) => ({
      ...file.tandas[i % file.tandas.length]!,
      sides: Array.from({ length: 4 }, (_y, k) => ({
        ...file.tandas[0]!.sides[0]!,
        id: `${i}-${k}-${Math.random().toString(36).slice(2)}`,
        title: Array.from({ length: 6 }, () => Math.random().toString(36).slice(2)).join(" "),
      })),
    }));
    await expect(encodeNightPayload(big)).rejects.toBeInstanceOf(NightLinkError);
  });

  it("refuses a payload that inflates past the byte limit, and damaged payloads", async () => {
    const bomb = { ...file, name: "x".repeat(MAX_NIGHT_BYTES + 10) };
    const payload = await encodeNightPayload(bomb, Number.POSITIVE_INFINITY);
    expect(payload.length).toBeLessThan(MAX_LINK_PAYLOAD); // it compresses well…
    await expect(decodeNightPayload(payload)).rejects.toMatchObject({ code: "too-large" }); // …but never inflates
    await expect(decodeNightPayload("n1.@@@")).rejects.toMatchObject({ code: "damaged" });
    await expect(decodeNightPayload("n1.AAAA")).rejects.toMatchObject({ code: "damaged" });
    await expect(decodeNightPayload("hello")).rejects.toMatchObject({ code: "damaged" });
  });
});
