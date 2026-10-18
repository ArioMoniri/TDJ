/**
 * Edge / property tests for the TDJ engine (QA pass 2026-10-18).
 * Every test encodes an invariant a DJ would expect. Tests that document a known
 * defect in the current code are marked `it.fails` with the reason, so the suite
 * stays green until the fix lands — at which point the `fails` marker must be removed.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  arcTarget,
  type ComposeOptions,
  compose,
  DEFAULT_OPTIONS,
  ERA_PRESETS,
  type EraPreset,
  EXPORTERS,
  flatten,
  normTitle,
  type Playlist,
  patternString,
  planSlots,
  scorePlaylist,
  swapTanda,
  tandaDuration,
} from "../src/index";
import { loadCatalog } from "../src/load";

let deps: ReturnType<typeof loadCatalog>;
beforeAll(() => {
  deps = loadCatalog();
});

const SEEDS = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144];
const sizeFor = (o: ComposeOptions, r: string) =>
  r === "tango" ? o.tangoTandaSize : r === "vals" ? o.valsTandaSize : o.milongaTandaSize;
/** The planner stops at the tanda count nearest the target, so the worst case is half the longest tanda (+1 min for the Cumparsita/cortina rounding). */
const toleranceMin = (o: ComposeOptions) =>
  Math.max(...(["tango", "vals", "milonga"] as const).map((r) => tandaDuration(o, r))) / 2 / 60 + 1;

describe("night length", () => {
  it("duration stays within half a tanda of the requested hours for 1..10 h and every built-in pattern", () => {
    for (const hours of [1, 1.5, 2, 3, 4, 6, 8, 10]) {
      for (const pattern of ["classic", "TVTM", "TMTV", "tango-only"] as const) {
        const p = compose({ hours, pattern, seed: 7 }, deps);
        expect(
          Math.abs(p.stats.durationSec - hours * 3600) / 60,
          `hours=${hours} pattern=${pattern}`,
        ).toBeLessThanOrEqual(toleranceMin(p.options));
        if (pattern === "classic")
          expect(Math.abs(p.stats.durationSec - hours * 3600) / 60).toBeLessThanOrEqual(6);
      }
    }
  });
  it("tango tanda size 3/4/5 and vals size 4 are honoured on every tanda and keep the duration fit", () => {
    for (const [tangoTandaSize, valsTandaSize] of [
      [3, 3],
      [4, 4],
      [5, 3],
    ] as const) {
      const p = compose({ hours: 3, seed: 11, tangoTandaSize, valsTandaSize }, deps);
      for (const t of p.tandas)
        expect(t.songs.length, `${t.rhythm} #${t.index}`).toBe(sizeFor(p.options, t.rhythm));
      expect(Math.abs(p.stats.durationSec - 3 * 3600) / 60).toBeLessThanOrEqual(toleranceMin(p.options));
    }
  });
  it("planSlots never runs away: a non-finite `hours` must be rejected or clamped (currently yields 401 slots)", () => {
    // /api/compose does Math.min(10, Math.max(1, Number(body.hours))) — NaN survives both and reaches the engine.
    const slots = planSlots({ ...DEFAULT_OPTIONS, hours: Number.NaN });
    expect(slots.length).toBeLessThanOrEqual(60);
  });
  it("a tanda size of 0 must be rejected instead of producing empty tandas and a NaN score", () => {
    const p = compose({ hours: 2, seed: 1, tangoTandaSize: 0 as unknown as 4 }, deps);
    for (const t of p.tandas) expect(t.songs.length).toBeGreaterThan(0);
    expect(Number.isFinite(p.score.total)).toBe(true);
  });
  it("avgTrackSec is used consistently by the planner and the tanda duration (currently planner-only → 144 tandas for 2 h)", () => {
    const p = compose({ hours: 2, seed: 1, avgTrackSec: 1 }, deps);
    expect(Math.abs(p.stats.durationSec - 2 * 3600) / 60).toBeLessThanOrEqual(6);
  });
});

describe("tanda integrity across seeds (golden era, 4 h)", () => {
  it("one orchestra, one rhythm, one singer, ≤maxYearSpread, no song or title reused, correct sizes", () => {
    for (const seed of SEEDS) {
      const p = compose({ hours: 4, seed }, deps);
      const ids = new Set<string>();
      const titles = new Set<string>();
      for (const t of p.tandas) {
        expect(new Set(t.songs.map((s) => s.orchestraId)).size).toBe(1);
        expect(new Set(t.songs.map((s) => s.rhythm)).size).toBe(1);
        expect(new Set(t.songs.map((s) => s.singerId)).size).toBe(1);
        expect(t.songs.length).toBe(sizeFor(p.options, t.rhythm));
        if (t.yearRange) expect(t.yearRange[1] - t.yearRange[0]).toBeLessThanOrEqual(p.options.maxYearSpread);
        for (const s of t.songs) {
          expect(ids.has(s.id), `seed ${seed}: song ${s.id} reused`).toBe(false);
          ids.add(s.id);
          const k = normTitle(s.title);
          expect(titles.has(k), `seed ${seed}: title "${s.title}" repeated`).toBe(false);
          titles.add(k);
        }
      }
      if (p.closing) expect(ids.has(p.closing.id)).toBe(false);
    }
  });
  it("no orchestra repeats inside the configured gap and the first tanda is a tango", () => {
    for (const seed of SEEDS) {
      const p = compose({ hours: 4, seed }, deps);
      expect(p.tandas[0]?.rhythm).toBe("tango");
      for (let i = 0; i < p.tandas.length; i++)
        for (let j = i + 1; j < Math.min(p.tandas.length, i + p.options.orchestraRepeatGap); j++)
          expect(
            p.tandas[i]!.orchestraId,
            `seed ${seed}: ${p.tandas[i]!.orchestraId} at ${i} and ${j}`,
          ).not.toBe(p.tandas[j]!.orchestraId);
    }
  });
  it("maxYearSpread 0 gives single-year tandas", () => {
    const p = compose({ hours: 3, seed: 2, maxYearSpread: 0 }, deps);
    for (const t of p.tandas) if (t.yearRange) expect(t.yearRange[0]).toBe(t.yearRange[1]);
  });
  it("thin pools (post-golden / nuevo) must never put the same orchestra in two adjacent tandas", () => {
    // buildTanda falls back to `viable` when no candidate respects the gap, allowing back-to-back repeats (seen with seed 11, nuevo: De Angelis #2 and #3).
    for (const eras of [["nuevo"], ["post-golden"]] as EraPreset[][]) {
      for (const seed of SEEDS) {
        const p = compose({ hours: 3, seed, eras }, deps);
        for (let i = 1; i < p.tandas.length; i++)
          expect(p.tandas[i]!.orchestraId, `${eras} seed ${seed} at ${i}`).not.toBe(
            p.tandas[i - 1]!.orchestraId,
          );
      }
    }
  });
});

describe("era bounds", () => {
  const presets = (Object.keys(ERA_PRESETS) as EraPreset[]).filter(
    (k) => k !== "golden-extended" && k !== "all",
  );
  it.each(presets)("every song of a %s set lies inside the preset's advertised year range", (preset) => {
    const [lo, hi] = ERA_PRESETS[preset]!.years;
    const p = compose({ hours: 3, seed: 11, eras: [preset] }, deps);
    for (const t of p.tandas)
      for (const s of t.songs)
        if (s.year) {
          expect(s.year, `${s.title} (${s.orchestra})`).toBeGreaterThanOrEqual(lo);
          expect(s.year).toBeLessThanOrEqual(hi);
        }
  });
  it("golden-extended (advertised 1932–1960) must not surface 1928 or 1962 recordings", () => {
    // ERA_PRESETS["golden-extended"].eras includes the whole guardia-nueva and post-golden buckets (1926–1934 / 1956–1969),
    // so the `years` label and the UI chip "Golden ext. 32–60" lie. Fix: filter by yearRange too, or narrow the eras.
    const [lo, hi] = ERA_PRESETS["golden-extended"]!.years;
    const p = compose({ hours: 3, seed: 11, eras: ["golden-extended"] }, deps);
    for (const t of p.tandas)
      for (const s of t.songs)
        if (s.year) {
          expect(s.year, `${s.title} (${s.orchestra})`).toBeGreaterThanOrEqual(lo);
          expect(s.year).toBeLessThanOrEqual(hi);
        }
  });
  it("unknown or empty era presets yield an empty (not crashing) set", () => {
    expect(compose({ hours: 2, seed: 1, eras: ["bogus" as EraPreset] }, deps).tandas).toHaveLength(0);
    expect(compose({ hours: 2, seed: 1, eras: [] }, deps).tandas).toHaveLength(0);
  });
  it("eras given as a string (what a hand-written request sends) should be coerced, not throw inside Catalog.filter", () => {
    expect(() =>
      compose({ hours: 2, seed: 1, eras: "golden" as unknown as EraPreset[] }, deps),
    ).not.toThrow();
  });
});

describe("scoring", () => {
  it("score is a finite integer in 0..100 for every normal composition", () => {
    for (const seed of SEEDS) {
      const p = compose({ hours: 3, seed }, deps);
      expect(Number.isInteger(p.score.total)).toBe(true);
      expect(p.score.total).toBeGreaterThanOrEqual(0);
      expect(p.score.total).toBeLessThanOrEqual(100);
      expect(scorePlaylist(JSON.parse(JSON.stringify(p))).total).toBe(p.score.total);
    }
  });
  it("an empty set (0 tandas) must not score like a professional set (currently 82/100 'Solid regular milonga DJ')", () => {
    const p = compose({ hours: 3, seed: 1, includeOrchestras: ["nobody"] }, deps);
    expect(p.tandas).toHaveLength(0);
    expect(p.score.total).toBeLessThan(40);
  });
  it("composer and scorer agree on 'Pugliese after the midpoint' (composer uses k/(n-1), scorer uses i/n)", () => {
    // seed 5 / 2.5 h places Pugliese at index 6 of 13: allowed by notBefore (6/12 = 0.5) but penalised by the scorer (6/13 < 0.5).
    const p = compose({ hours: 2.5, seed: 5 }, deps);
    const i = p.tandas.findIndex((t) => t.orchestraId === "osvaldo-pugliese");
    expect(i).toBeGreaterThan(0);
    expect(p.score.factors.find((f) => f.key === "arc")!.detail).toMatch(/0 early Pugliese/);
  });
});

describe("arc", () => {
  const arcs: ComposeOptions["arc"][] = ["classic-two-peaks", "single-peak", "gentle", "marathon-plateau"];
  const moods: ComposeOptions["floorMood"][] = ["traditional", "balanced", "energetic", "romantic"];
  it("targets stay inside the mood's [lo-4, hi] band for every arc, mood and position", () => {
    for (const arc of arcs)
      for (const mood of moods)
        for (let i = 0; i <= 100; i++) {
          const y = arcTarget(i / 100, arc, mood);
          expect(y).toBeGreaterThanOrEqual(30);
          expect(y).toBeLessThanOrEqual(90);
          expect(Number.isInteger(y)).toBe(true);
        }
  });
  it("classic, single-peak and gentle arcs move gradually (<14 energy per 5 % of the night)", () => {
    for (const arc of ["classic-two-peaks", "single-peak", "gentle"] as const)
      for (let i = 1; i <= 20; i++)
        expect(
          Math.abs(arcTarget(i / 20, arc) - arcTarget((i - 1) / 20, arc)),
          `${arc} step ${i}`,
        ).toBeLessThan(14);
  });
  it("marathon-plateau cools down gradually too (currently drops ~18 points per 5 % after 90 %)", () => {
    for (let i = 1; i <= 20; i++)
      expect(
        Math.abs(arcTarget(i / 20, "marathon-plateau") - arcTarget((i - 1) / 20, "marathon-plateau")),
        `step ${i}`,
      ).toBeLessThan(14);
  });
  it("the planned slot count is monotonic in hours and the last slot is the 'close' phase", () => {
    let prev = 0;
    for (let h = 1; h <= 10; h++) {
      const slots = planSlots({ ...DEFAULT_OPTIONS, hours: h });
      expect(slots.length).toBeGreaterThanOrEqual(prev);
      prev = slots.length;
      expect(slots[slots.length - 1]!.phase).toBe("close");
    }
  });
});

describe("custom pattern", () => {
  it("sanitises arbitrary strings to a non-empty T/V/M cycle", () => {
    for (const customPattern of ["ttv x!!m", "", "   ", "ТТВ🎵", "12345", "TV".repeat(500), "mmm", "vVvV"]) {
      const s = patternString({ ...DEFAULT_OPTIONS, pattern: "custom", customPattern });
      expect(s).toMatch(/^[TVM]+$/);
    }
  });
  it("a V/M-only custom pattern still composes (falls back to tango when the pool is thin) and keeps the duration", () => {
    for (const customPattern of ["VVVV", "MMMM"]) {
      const p = compose({ hours: 2, seed: 3, pattern: "custom", customPattern }, deps);
      expect(p.tandas.length).toBeGreaterThan(5);
      expect(Math.abs(p.stats.durationSec - 7200) / 60).toBeLessThanOrEqual(6);
    }
  });
  it("a numeric customPattern (JSON body `customPattern: 12345`) must not throw", () => {
    expect(() =>
      patternString({ ...DEFAULT_OPTIONS, pattern: "custom", customPattern: 12345 as unknown as string }),
    ).not.toThrow();
  });
});

describe("cortinas", () => {
  it("'none' yields no cortinas and still fills the night", () => {
    const p = compose({ hours: 3, seed: 4, cortinaStyle: "none" }, deps);
    expect(p.tandas.every((t) => t.cortina === null)).toBe(true);
    expect(Math.abs(p.stats.durationSec - 3 * 3600) / 60).toBeLessThanOrEqual(6);
  });
  it("'constant' uses the same cortina after every tanda except the last; 'matched' never attaches one to the last tanda", () => {
    const c = compose({ hours: 3, seed: 4, cortinaStyle: "constant" }, deps);
    const ids = new Set(c.tandas.slice(0, -1).map((t) => t.cortina?.id));
    expect(ids.size).toBe(1);
    expect(c.tandas.at(-1)!.cortina).toBeNull();
    const m = compose({ hours: 3, seed: 4 }, deps);
    expect(
      m.tandas
        .slice(0, -1)
        .every((t) => t.cortina && (t.cortina.lengthSec ?? 0) >= 25 && (t.cortina.lengthSec ?? 0) <= 60), // cortina lengths flex ±15 s to land the night on time
    ).toBe(true);
    expect(m.tandas.at(-1)!.cortina).toBeNull();
  });
  it("an unknown culture falls back to the whole pool instead of leaving gaps", () => {
    const p = compose({ hours: 2, seed: 4, cortinaCultures: ["klingon"] }, deps);
    expect(p.tandas.slice(0, -1).every((t) => t.cortina)).toBe(true);
  });
});

describe("determinism and seeds", () => {
  it("seed 0, negative, fractional and huge seeds are deterministic", () => {
    for (const seed of [0, -5, 1.5, 1e18, 2 ** 31]) {
      const a = compose({ hours: 2, seed }, deps);
      const b = compose({ hours: 2, seed }, deps);
      expect(a.tandas.map((t) => t.songs.map((s) => s.id))).toEqual(
        b.tandas.map((t) => t.songs.map((s) => s.id)),
      );
      expect(a.id).toBe(b.id);
    }
  });
  it("different seeds give different sets", () => {
    const a = compose({ hours: 2, seed: 1 }, deps);
    const b = compose({ hours: 2, seed: 2 }, deps);
    expect(a.tandas.map((t) => t.songs[0]!.id)).not.toEqual(b.tandas.map((t) => t.songs[0]!.id));
  });
});

describe("swapTanda", () => {
  let p: Playlist;
  beforeAll(() => {
    p = compose({ hours: 4, seed: 42 }, deps);
  });
  it("invalid indexes return the playlist untouched", () => {
    for (const i of [-1, 999, Number.NaN, 1.5]) expect(swapTanda(p, i, deps, 1)).toBe(p);
  });
  it("15 consecutive swaps of the same slot keep rhythm/size/cortina, change the orchestra, never repeat a title and leave the other tandas intact", () => {
    let cur = p;
    const idx = 5;
    for (let k = 0; k < 15; k++) {
      const nxt = swapTanda(cur, idx, deps, 1000 + k);
      const t = nxt.tandas[idx]!;
      expect(t.rhythm).toBe(p.tandas[idx]!.rhythm);
      expect(t.songs.length).toBe(p.tandas[idx]!.songs.length);
      expect(t.cortina?.id).toBe(p.tandas[idx]!.cortina?.id);
      expect(t.orchestraId).not.toBe(cur.tandas[idx]!.orchestraId);
      const titles = nxt.tandas.flatMap((x) => x.songs.map((s) => normTitle(s.title)));
      expect(new Set(titles).size).toBe(titles.length);
      expect(nxt.tandas.filter((_, j) => j !== idx).map((x) => x.songs.map((s) => s.id).join())).toEqual(
        cur.tandas.filter((_, j) => j !== idx).map((x) => x.songs.map((s) => s.id).join()),
      );
      for (const s of t.songs) {
        expect(s.year).toBeGreaterThanOrEqual(1935);
        expect(s.year).toBeLessThanOrEqual(1955);
      }
      cur = nxt;
    }
  });
  it("a swapped tanda respects the orchestra gap on BOTH sides (recentOrchestras is built in playlist order, so right-hand neighbours slip through `indexOf < gap`)", () => {
    let cur = p;
    const idx = 5;
    for (let k = 0; k < 15; k++) {
      const nxt = swapTanda(cur, idx, deps, 1000 + k);
      const t = nxt.tandas[idx]!;
      for (let j = 0; j < nxt.tandas.length; j++)
        if (j !== idx && Math.abs(j - idx) < p.options.orchestraRepeatGap)
          expect(nxt.tandas[j]!.orchestraId, `swap #${k}: ${t.orchestraId} now at ${idx} and ${j}`).not.toBe(
            t.orchestraId,
          );
      cur = nxt;
    }
  });
});

describe("exports", () => {
  const weird = (): Playlist => {
    const p: Playlist = JSON.parse(
      JSON.stringify(compose({ hours: 1, seed: 9, name: 'Milonga "La" <Noche> & co' }, deps)),
    );
    p.tandas[0]!.songs[0]!.title = "A & B <\"C\"> 'D', E\nF";
    return p;
  };
  it("escapes XML special characters in Rekordbox, Traktor and XSPF attributes/text", () => {
    const p = weird();
    for (const f of ["rekordbox", "traktor", "xspf"] as const) {
      const x = EXPORTERS[f](p);
      expect(x).toContain("&amp;");
      expect(x).toContain("&lt;");
      expect(x).not.toMatch(/="[^"]*<[^"]*"/);
      expect(x).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#)/);
    }
  });
  it("CSV keeps a constant column count when titles contain quotes, commas and newlines", () => {
    const csv = EXPORTERS.csv(weird());
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let q = false;
    for (let i = 0; i < csv.length; i++) {
      const c = csv[i]!;
      if (q) {
        if (c === '"' && csv[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ",") {
        row.push(cell);
        cell = "";
      } else if (c === "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else cell += c;
    }
    const widths = new Set(rows.map((r) => r.length));
    expect(widths.size).toBe(1);
    expect(rows.length - 1).toBe(flatten(weird()).length);
  });
  it("M3U8 has one integer-seconds EXTINF per track and marks cortinas", () => {
    const p = compose({ hours: 2, seed: 9 }, deps);
    const lines = EXPORTERS.m3u8(p).split("\n");
    const ext = lines.filter((l) => l.startsWith("#EXTINF:"));
    expect(lines[0]).toBe("#EXTM3U");
    expect(ext).toHaveLength(flatten(p).length);
    for (const l of ext) expect(l).toMatch(/^#EXTINF:\d+,.+/);
    expect(ext.filter((l) => l.endsWith("[CORTINA]"))).toHaveLength(p.tandas.length - 1);
  });
  it("Rekordbox collection Entries and playlist Keys are consistent", () => {
    const x = EXPORTERS.rekordbox(compose({ hours: 2, seed: 9 }, deps));
    const n = Number(x.match(/<COLLECTION Entries="(\d+)"/)![1]);
    expect((x.match(/<TRACK TrackID="/g) ?? []).length).toBe(n);
    const keys = [...x.matchAll(/<TRACK Key="(\d+)"\/>/g)].map((m) => Number(m[1]));
    expect(keys.slice(0, n)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    for (const k of keys) expect(k).toBeLessThanOrEqual(n);
    for (const node of x.matchAll(
      /<NODE Name="[^"]*" Type="1" KeyType="0" Entries="(\d+)">([\s\S]*?)<\/NODE>/g,
    ))
      expect((node[2]!.match(/<TRACK Key=/g) ?? []).length).toBe(Number(node[1]));
  });
  it.fails("generated file names must not contain '/', which breaks Traktor DIR/FILE, M3U paths and Rekordbox Locations (artist is 'Orchestra / Singer')", () => {
    const p = compose({ hours: 2, seed: 9 }, deps);
    expect(EXPORTERS.traktor(p)).not.toMatch(/FILE="[^"]*\/[^"]*"/);
    expect(
      EXPORTERS.m3u8(p)
        .split("\n")
        .filter((l) => l.endsWith(".mp3")),
    ).toSatisfy((ls: string[]) => ls.every((l) => !l.includes("/")));
  });
  it.fails("Traktor NML carries a 32-hex playlist UUID, a non-empty VOLUME and the MUSICFOLDERS/INDEXING elements the reference fixture has", () => {
    const x = EXPORTERS.traktor(compose({ hours: 1, seed: 9 }, deps));
    expect(x).toMatch(/UUID="[0-9a-f]{32}"/);
    expect(x).not.toContain('VOLUME=""');
    expect(x).toContain("<MUSICFOLDERS");
    expect(x).toContain("<INDEXING");
  });
});

describe("search", () => {
  it("accents and apostrophe variants return the same recordings", () => {
    const ids = (q: string) => deps.catalog.search(q, 40).map((s) => s.id);
    expect(ids("Mauré")).toEqual(ids("Maure"));
    expect(ids("D'Arienzo")).toEqual(ids("D’Arienzo"));
    expect(ids("D'Arienzo")).toEqual(ids("darienzo"));
    expect(ids("bahía blanca di sarli").length).toBeGreaterThan(0);
  });
  it("empty / whitespace / 5000-char queries do not throw and return quickly", () => {
    const t0 = performance.now();
    expect(deps.catalog.search("")).toBeInstanceOf(Array);
    expect(deps.catalog.search("   ")).toBeInstanceOf(Array);
    expect(deps.catalog.search("a".repeat(5000))).toHaveLength(0);
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});
