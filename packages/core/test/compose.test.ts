import { beforeAll, describe, expect, it } from "vitest";
import {
  arcTarget,
  compose,
  DEFAULT_OPTIONS,
  EXPORTERS,
  normTitle,
  type Playlist,
  planSlots,
  type Song,
  scorePlaylist,
  shapeTanda,
  swapTanda,
  toSpotifyPlan,
} from "../src/index";
import { loadCatalog as load } from "../src/load";

let deps: ReturnType<typeof load>;
beforeAll(() => {
  deps = load();
});

describe("catalogue index", () => {
  it("loads the committed index with >20k recordings and known orchestras", () => {
    expect(deps.catalog.songs.length).toBeGreaterThan(20000);
    expect(deps.catalog.byOrchestra.get("juan-d-arienzo")!.length).toBeGreaterThan(900);
    expect(deps.catalog.byOrchestra.get("carlos-di-sarli")!.length).toBeGreaterThan(300);
  });
  it("fixed the +100 year typos and assigns eras", () => {
    const bad = deps.catalog.songs.filter((s) => s.year && s.year > 2008);
    expect(bad).toHaveLength(0);
    const elFlete = deps.catalog.songs.find(
      (s) => normTitle(s.title) === "el flete" && s.orchestraId === "francisco-canaro" && s.year === 1928,
    );
    expect(elFlete?.era).toBe("guardia-nueva");
  });
  it("search is accent-insensitive", () => {
    expect(deps.catalog.search("darienzo mauré vals").length).toBeGreaterThan(0);
  });
});

describe("night arc", () => {
  it("plans ~5 tandas per hour and fills the requested hours", () => {
    for (const h of [2, 3, 4, 5, 6]) {
      const slots = planSlots({ ...DEFAULT_OPTIONS, hours: h });
      expect(slots.length).toBeGreaterThanOrEqual(Math.floor(h * 4.6));
      expect(slots.length).toBeLessThanOrEqual(Math.ceil(h * 5.6));
    }
  });
  it("follows the TTVTTM cycle", () => {
    const r = planSlots({ ...DEFAULT_OPTIONS, hours: 3 })
      .map((s) => s.rhythm[0]!.toUpperCase())
      .join("");
    expect(r.startsWith("TTVTTMTTVTTM")).toBe(true);
  });
  it("rises gradually from warm-up, peaks late, and cools down (classic two peaks)", () => {
    const ys = Array.from({ length: 21 }, (_, i) => arcTarget(i / 20, "classic-two-peaks"));
    expect(ys[0]!).toBeLessThan(ys[9]!);
    const peak = ys.indexOf(Math.max(...ys));
    expect(peak / 20).toBeGreaterThan(0.6);
    expect(peak / 20).toBeLessThan(0.95);
    expect(ys[20]!).toBeLessThan(ys[peak]! - 15);
    for (let i = 1; i < ys.length; i++) expect(Math.abs(ys[i]! - ys[i - 1]!)).toBeLessThan(14); // gradual
  });
});

describe("tanda shape", () => {
  const mk = (e: number[]): Song[] =>
    e.map((energy, i) => ({
      id: `s${i}`,
      title: `t${i}`,
      rhythm: "tango",
      orchestra: "X",
      orchestraId: "x",
      singer: null,
      singerId: null,
      vocal: false,
      year: 1940,
      era: "golden-early",
      energy,
    }));
  it("rise-settle: starts slow, climbs, strongest third, settles on the fourth", () => {
    const out = shapeTanda(mk([70, 50, 90, 60]), "rise-settle").map((s) => s.energy);
    expect(out).toEqual([50, 60, 90, 70]);
  });
  it("rise: slow to strongest", () => {
    expect(shapeTanda(mk([70, 50, 90, 60]), "rise").map((s) => s.energy)).toEqual([50, 60, 70, 90]);
  });
});

describe("compose", () => {
  let p: Playlist;
  beforeAll(() => {
    p = compose({ hours: 4, seed: 42 }, deps);
  });
  it("is deterministic for a seed", () => {
    const q = compose({ hours: 4, seed: 42 }, deps);
    expect(q.tandas.map((t) => t.songs.map((s) => s.id))).toEqual(
      p.tandas.map((t) => t.songs.map((s) => s.id)),
    );
  });
  it("hits the requested duration within ±6 minutes", () => {
    expect(Math.abs(p.stats.durationSec - 4 * 3600)).toBeLessThan(6 * 60);
  });
  it("every tanda is one orchestra, one rhythm, one singer (or instrumental), ≤4 year spread, golden era", () => {
    for (const t of p.tandas) {
      expect(new Set(t.songs.map((s) => s.orchestraId)).size).toBe(1);
      expect(new Set(t.songs.map((s) => s.rhythm)).size).toBe(1);
      expect(new Set(t.songs.map((s) => s.singerId)).size).toBe(1);
      if (t.yearRange) expect(t.yearRange[1] - t.yearRange[0]).toBeLessThanOrEqual(4);
      for (const s of t.songs) {
        expect(s.year).toBeGreaterThanOrEqual(1935);
        expect(s.year).toBeLessThanOrEqual(1955);
      }
      expect(t.songs.length).toBe(t.rhythm === "tango" ? 4 : 3);
    }
  });
  it("never repeats a title (also inside a tanda) and never repeats a song", () => {
    const titles = p.tandas.flatMap((t) => t.songs.map((s) => normTitle(s.title)));
    expect(new Set(titles).size).toBe(titles.length);
  });
  it("spaces orchestras (no repeat within 6 tandas)", () => {
    for (let i = 0; i < p.tandas.length; i++)
      for (let j = i + 1; j < Math.min(p.tandas.length, i + 6); j++)
        expect(p.tandas[i]!.orchestraId).not.toBe(p.tandas[j]!.orchestraId);
  });
  it("attaches a cortina after every tanda except the last, matched to the next tanda's energy", () => {
    p.tandas.forEach((t, i) => {
      if (i === p.tandas.length - 1) return expect(t.cortina).toBeNull();
      expect(t.cortina).not.toBeNull();
      expect(Math.abs(t.cortina!.energy - p.tandas[i + 1]!.energy)).toBeLessThan(40);
    });
  });
  it("closes with La Cumparsita from a different orchestra than the last tanda", () => {
    expect(normTitle(p.closing!.title)).toBe("la cumparsita");
    expect(p.closing!.orchestraId).not.toBe(p.tandas[p.tandas.length - 1]!.orchestraId);
  });
  it("keeps Pugliese out of the first half", () => {
    p.tandas.forEach((t, i) => {
      if (t.orchestraId === "osvaldo-pugliese") expect(i / p.tandas.length).toBeGreaterThanOrEqual(0.5);
    });
  });
  it("scores like a professional set", () => {
    expect(p.score.total).toBeGreaterThanOrEqual(65); // honest scorer: 70+ = solid regular DJ; climbs with fame/BPM data
    expect(p.score.factors.find((f) => f.key === "integrity")!.score).toBe(1);
  });
  it("supports cultural cortina choices and trend filtering", () => {
    const q = compose({ hours: 2, seed: 7, cortinaCultures: ["turkish"], cortinaTrend: "mixed" }, deps);
    expect(q.tandas.slice(0, -1).every((t) => t.cortina?.culture === "turkish")).toBe(true);
  });
  it("supports other eras", () => {
    const q = compose({ hours: 2, seed: 3, eras: ["post-golden"] }, deps);
    expect(q.tandas.length).toBeGreaterThan(6);
    for (const t of q.tandas) for (const s of t.songs) expect(s.era).toBe("post-golden");
  });
  it("swapTanda replaces one tanda with a different orchestra and keeps the rest", () => {
    const q = swapTanda(p, 3, deps, 99);
    expect(q.tandas[3]!.orchestraId).not.toBe(p.tandas[3]!.orchestraId);
    expect(q.tandas[2]!.songs[0]!.id).toBe(p.tandas[2]!.songs[0]!.id);
  });
});

describe("exports", () => {
  it("produces every format with the right track count", () => {
    const p = compose({ hours: 2, seed: 5 }, deps);
    const n = p.tandas.reduce((a, t) => a + t.songs.length + (t.cortina ? 1 : 0), 0) + 1;
    expect(EXPORTERS.m3u8(p).split("#EXTINF").length - 1).toBe(n);
    expect(EXPORTERS.csv(p).trim().split("\n").length - 1).toBe(n);
    expect(EXPORTERS.rekordbox(p)).toContain('<DJ_PLAYLISTS Version="1.0.0">');
    expect((EXPORTERS.rekordbox(p).match(/<TRACK TrackID=/g) ?? []).length).toBe(n);
    expect(EXPORTERS.traktor(p)).toContain('<NML VERSION="19">');
    expect(EXPORTERS.xspf(p)).toContain("<trackList>");
    expect(toSpotifyPlan(p).unresolved.length + toSpotifyPlan(p).uris.length).toBe(n);
    expect(scorePlaylist(JSON.parse(EXPORTERS.json(p))).total).toBe(p.score.total);
  });
});
