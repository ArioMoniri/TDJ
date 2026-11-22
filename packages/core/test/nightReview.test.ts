/**
 * 2026-11 — "Import a night" review (the owner: "When added to Compose or the Booth, the AI should check it and make
 * suggestions for change: in Compose more detailed suggestions, in the Booth only the most important ones … the last
 * 4 songs as tangos, songs whose year doesn't match, a song in a tanda that has another version closer to the others
 * in year or with the same singer, 3 songs with a singer and 1 instrumental"). Invariants written before the engine:
 *
 *  - a composed golden night has nothing important to fix (no blocker, no high finding, no reorder);
 *  - tanda coherence: a side in another rhythm is a blocker; another orchestra is high; an instrumental side in a sung
 *    tanda is high, its fix the same work sung by the tanda's singer; another singer and a year outlier are medium,
 *    their fix another version of the same work by the same orchestra, closer in years / with the tanda's singer;
 *    every such fix, applied, ends its finding;
 *  - the order: two vals / milonga tandas back to back and a vals / milonga among the last four (the DJ's "last four
 *    tango" rule) are high; the reorder suggestion ends them, moves only tandas that have not started, never adds a
 *    fault, and is deterministic;
 *  - a missing cortina between tandas and a missing closing La Cumparsita are high, each with a one-tap fix;
 *  - the Booth's level keeps the blockers and high findings only, on tandas still to come;
 *  - the findings follow the night rules given (the Compose settings), not only the night's own;
 *  - the review is deterministic and never edits the night it reads.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyReviewFix,
  applySafeFixes,
  isCumparsita,
  isTandaEligible,
  normTitle,
  type Playlist,
  type ReviewFinding,
  reorderTandas,
  reviewNight,
  rhythmCycleFaults,
  type Song,
  suggestReorder,
  type Tanda,
} from "../src/index";
import { loadCatalog } from "../src/load";
import { composeOnce } from "./composeOnce";

let deps: ReturnType<typeof loadCatalog>;
let golden: Playlist;
beforeAll(() => {
  deps = loadCatalog();
  golden = composeOnce({ hours: 4, seed: 1 }, deps);
}, 600_000);

const night = () => structuredClone(golden);
const used = (p: Playlist) => new Set(p.tandas.flatMap((t) => t.songs.map((s) => s.id)));
/** the night with side `si` of tanda `ti` replaced (the tanda keeps its own header, as an import would) */
function withSide(p: Playlist, ti: number, si: number, s: Song): Playlist {
  return {
    ...p,
    tandas: p.tandas.map((t, i) =>
      i === ti ? { ...t, songs: t.songs.map((x, k) => (k === si ? s : x)) } : t,
    ),
  };
}
const at = (fs: ReviewFinding[], kind: ReviewFinding["kind"], tanda?: number) =>
  fs.filter((f) => f.kind === kind && (tanda === undefined || f.tanda === tanda));
/** every tanda in the night's rhythm order, as letters */
const letters = (ts: Array<Pick<Tanda, "rhythm">>) => ts.map((t) => t.rhythm[0]!.toUpperCase()).join("");

/** a side of the night and a version of its work by the same orchestra that `want` accepts (not in the night) */
function versionCase(p: Playlist, want: (orig: Song, v: Song, t: Tanda) => boolean) {
  const u = used(p);
  for (const [ti, t] of p.tandas.entries())
    for (const [si, s] of t.songs.entries()) {
      if (si === 0) continue;
      const v = deps.catalog.songs
        .filter(
          (x) =>
            normTitle(x.title) === normTitle(s.title) &&
            x.orchestraId === t.orchestraId &&
            x.rhythm === t.rhythm &&
            !u.has(x.id) &&
            want(s, x, t),
        )
        .sort((a, b) => a.id.localeCompare(b.id))[0];
      if (v) return { ti, si, orig: s, v };
    }
  return null;
}

describe("a composed golden night", () => {
  it("has nothing important to fix and no reorder to suggest", () => {
    const r = reviewNight(night(), deps);
    expect(r.findings.filter((f) => f.severity === "blocker" || f.severity === "high")).toEqual([]);
    expect(r.reorder).toBeNull();
    expect(reviewNight(night(), deps, { level: "booth" }).findings).toEqual([]);
  });

  it("is deterministic and never edits the night it reads", () => {
    const p = night();
    const copy = structuredClone(p);
    const a = reviewNight(p, deps);
    const b = reviewNight(p, deps);
    expect(a).toEqual(b);
    expect(p).toEqual(copy);
  });
});

describe("tanda coherence", () => {
  it("a side in another rhythm is a blocker", () => {
    const p = night();
    const ti = p.tandas.findIndex((t) => t.rhythm === "tango");
    const vals = deps.catalog.songs.find(
      (s) => s.rhythm === "vals" && s.orchestraId === p.tandas[ti]!.orchestraId && !used(p).has(s.id),
    )!;
    const q = withSide(p, ti, 1, vals);
    const f = at(reviewNight(q, deps).findings, "rhythm", ti);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe("blocker");
    expect(f[0]!.side).toBe(1);
    expect(f[0]!.text).toMatch(/vals/);
  });

  it("another orchestra is high; its fix puts a side of the tanda's orchestra back", () => {
    const p = night();
    const ti = p.tandas.findIndex((t) => t.rhythm === "tango" && !t.vocal);
    const t = p.tandas[ti]!;
    const other = deps.catalog.songs
      .filter(
        (s) =>
          s.rhythm === "tango" &&
          !s.vocal &&
          s.orchestraId !== t.orchestraId &&
          !used(p).has(s.id) &&
          !isCumparsita(s) &&
          s.year &&
          Math.abs(s.year - (t.yearRange?.[0] ?? 1940)) <= 2,
      )
      .sort((a, b) => a.id.localeCompare(b.id))[0]!;
    const q = withSide(p, ti, 2, other);
    const f = at(reviewNight(q, deps).findings, "orchestra", ti);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe("high");
    expect(f[0]!.side).toBe(2);
    expect(f[0]!.fix).toBeDefined();
    const r = applyReviewFix(q, f[0]!.fix!.fix, deps);
    expect(r.reason).toBeUndefined();
    expect(r.playlist.tandas[ti]!.songs[2]!.orchestraId).toBe(t.orchestraId);
    expect(at(reviewNight(r.playlist, deps).findings, "orchestra", ti)).toEqual([]);
  });

  it("an instrumental side in a sung tanda is high; the fix is a side sung by the tanda's singer", () => {
    const p = night();
    const ti = p.tandas.findIndex((t) => t.rhythm === "tango" && t.vocal && !!t.songs[1]?.singerId);
    const t = p.tandas[ti]!;
    const inst = deps.catalog.songs
      .filter(
        (s) =>
          s.orchestraId === t.orchestraId &&
          s.rhythm === "tango" &&
          !s.vocal &&
          !isCumparsita(s) &&
          !used(p).has(s.id) &&
          !!s.year &&
          s.year >= t.yearRange![0] &&
          s.year <= t.yearRange![1],
      )
      .sort((a, b) => a.id.localeCompare(b.id))[0]!;
    const q = withSide(p, ti, 1, inst);
    const f = at(reviewNight(q, deps).findings, "voice", ti);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe("high");
    expect(f[0]!.side).toBe(1);
    const r = applyReviewFix(q, f[0]!.fix!.fix, deps);
    const s = r.playlist.tandas[ti]!.songs[1]!;
    expect(s.vocal).toBe(true);
    expect(s.singerId).toBe(t.songs[0]!.singerId);
    expect(at(reviewNight(r.playlist, deps).findings, "voice", ti)).toEqual([]);
  });

  it("3 sung sides and 1 instrumental: the fix is the same work sung by the tanda's singer (a safe fix)", () => {
    // a work the catalogue holds sung and instrumental by one orchestra in the same years, and three more sides of
    // that orchestra and singer around it: the tanda an import brings with the instrumental take by mistake
    const songs = deps.catalog.songs.filter(
      (s) => s.rhythm === "tango" && isTandaEligible(s, false) && !isCumparsita(s),
    );
    let built: { sides: Song[]; sung: Song } | null = null;
    for (const sung of songs) {
      if (!sung.vocal || !sung.singerId || !sung.year) continue;
      const inst = songs.find(
        (x) =>
          !x.vocal &&
          x.orchestraId === sung.orchestraId &&
          normTitle(x.title) === normTitle(sung.title) &&
          !!x.year &&
          Math.abs(x.year - sung.year!) <= 1,
      );
      if (!inst) continue;
      const lo = Math.min(sung.year, inst.year!);
      const others: Song[] = [];
      for (const x of songs)
        if (
          x.vocal &&
          x.singerId === sung.singerId &&
          x.orchestraId === sung.orchestraId &&
          x.year &&
          x.year >= lo &&
          x.year <= lo + 1 &&
          normTitle(x.title) !== normTitle(sung.title) &&
          !others.some((y) => normTitle(y.title) === normTitle(x.title))
        )
          others.push(x);
      if (others.length >= 3) {
        built = { sides: [...others.slice(0, 3), inst], sung };
        break;
      }
    }
    expect(built).not.toBeNull();
    const p = night();
    const ti = 1;
    const ids = new Set(built!.sides.map((s) => s.id).concat(built!.sung.id));
    const q: Playlist = {
      ...p,
      // (the rest of the night without these recordings)
      tandas: p.tandas.map((t, i) =>
        i === ti ? { ...t, songs: built!.sides } : { ...t, songs: t.songs.filter((s) => !ids.has(s.id)) },
      ),
    };
    const f = at(reviewNight(q, deps).findings, "voice", ti);
    expect(f).toHaveLength(1);
    expect(f[0]!.side).toBe(3);
    expect(f[0]!.fix?.safe).toBe(true);
    expect(f[0]!.fix?.fix).toEqual({ kind: "side", tanda: ti, side: 3, songId: built!.sung.id });
    const r = applyReviewFix(q, f[0]!.fix!.fix, deps);
    expect(r.playlist.tandas[ti]!.songs.every((s) => s.vocal && s.singerId === built!.sung.singerId)).toBe(
      true,
    );
  });

  it("a year outlier is medium; the fix is a version of the same work closer in years", () => {
    const p = night();
    const c = versionCase(
      p,
      (orig, v) => orig.vocal === v.vocal && !!orig.year && !!v.year && Math.abs(v.year - orig.year) >= 8,
    );
    expect(c).not.toBeNull();
    const q = withSide(p, c!.ti, c!.si, c!.v);
    const fs = reviewNight(q, deps).findings.filter((f) => f.tanda === c!.ti && f.side === c!.si);
    expect(fs).toHaveLength(1);
    expect(["years", "singer"]).toContain(fs[0]!.kind);
    expect(fs[0]!.severity).toBe("medium");
    const r = applyReviewFix(q, fs[0]!.fix!.fix, deps);
    const s = r.playlist.tandas[c!.ti]!.songs[c!.si]!;
    expect(normTitle(s.title)).toBe(normTitle(c!.orig.title));
    expect(Math.abs((s.year ?? 0) - (c!.orig.year ?? 0))).toBeLessThan(Math.abs(c!.v.year! - c!.orig.year!));
    expect(
      reviewNight(r.playlist, deps).findings.filter((f) => f.tanda === c!.ti && f.side === c!.si),
    ).toEqual([]);
  });

  it("as many sung sides as instrumental ones: one finding for the tanda, not one per side", () => {
    const p = night();
    const ti = p.tandas.findIndex((t) => t.rhythm === "tango" && t.vocal && t.songs.length === 4);
    const t = p.tandas[ti]!;
    const inst = deps.catalog.songs
      .filter(
        (s) =>
          s.orchestraId === t.orchestraId &&
          s.rhythm === "tango" &&
          !s.vocal &&
          !isCumparsita(s) &&
          !used(p).has(s.id) &&
          !!s.year &&
          s.year >= t.yearRange![0] - 1 &&
          s.year <= t.yearRange![1] + 1,
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    expect(inst.length).toBeGreaterThanOrEqual(2);
    const q = withSide(withSide(p, ti, 2, inst[0]!), ti, 3, inst[1]!);
    const f = at(reviewNight(q, deps).findings, "voice", ti);
    expect(f).toHaveLength(1);
    expect(f[0]!.side).toBeNull();
    expect(f[0]!.severity).toBe("high");
  });

  it("an imported tanda (pinned as the DJ's) is still reviewed", () => {
    const p = night();
    const c = versionCase(
      p,
      (orig, v) => orig.vocal === v.vocal && !!orig.year && !!v.year && Math.abs(v.year - orig.year) >= 8,
    )!;
    const q = withSide(p, c.ti, c.si, c.v);
    q.tandas = q.tandas.map((t) => ({ ...t, locked: true, pinned: { by: "dj", reason: "Imported" } }));
    expect(reviewNight(q, deps).findings.filter((f) => f.tanda === c.ti && f.side === c.si)).toHaveLength(1);
  });
});

describe("the order of the night", () => {
  /** the night with tanda `from` moved to `to`, nothing else changed (an imported order) */
  const moved = (p: Playlist, from: number, to: number): Playlist => {
    const ts = p.tandas.slice();
    const [x] = ts.splice(from, 1);
    ts.splice(to, 0, x!);
    return { ...p, tandas: ts.map((t, i) => ({ ...t, index: i })) };
  };

  it("two non-tango tandas back to back are high; the reorder ends them and is deterministic", () => {
    const p = night();
    const v = p.tandas.findIndex((t) => t.rhythm === "vals");
    const m = p.tandas.findIndex((t, i) => i > v + 1 && t.rhythm === "milonga");
    const q = moved(p, v, m);
    expect(rhythmCycleFaults(q.tandas, q.options).length).toBeGreaterThan(0);
    const r = reviewNight(q, deps);
    const f = at(r.findings, "cycle");
    expect(f.length).toBeGreaterThan(0);
    expect(f.every((x) => x.severity === "high")).toBe(true);
    expect(r.reorder).not.toBeNull();
    const o = r.reorder!;
    expect([...o.order].sort((a, b) => a - b)).toEqual(q.tandas.map((_, i) => i));
    const after = o.order.map((i) => q.tandas[i]!);
    expect(rhythmCycleFaults(after, q.options)).toEqual([]);
    // the night still opens on a tango tanda
    expect(after[0]!.rhythm).toBe("tango");
    expect(o.moves.length).toBeGreaterThan(0);
    for (const mv of o.moves) expect(o.order[mv.to]).toBe(mv.tanda);
    expect(suggestReorder(q)).toEqual(o);
    const applied = reorderTandas(q, o.order, deps);
    expect(applied.reason).toBeUndefined();
    expect(letters(applied.playlist.tandas)).toBe(letters(after));
    expect(at(reviewNight(applied.playlist, deps).findings, "cycle")).toEqual([]);
  });

  it("the last-four-tango rule: a vals among the last four is high when the DJ's settings ask for it", () => {
    const p = night();
    const n = p.tandas.length;
    const v = p.tandas.findIndex((t, i) => i < n - 6 && t.rhythm === "vals");
    const q = moved(p, v, n - 3);
    // the night's own rules leave it; the DJ's Compose settings ask for it
    expect(at(reviewNight(q, deps).findings, "lastFour")).toEqual([]);
    const settings = { rules: { ...q.options.rules, lastFourTango: true } };
    const r = reviewNight(q, deps, { settings });
    const f = at(r.findings, "lastFour");
    expect(f.map((x) => x.tanda)).toContain(n - 3);
    expect(f.every((x) => x.severity === "high")).toBe(true);
    expect(r.reorder).not.toBeNull();
    const after = r.reorder!.order.map((i) => q.tandas[i]!);
    expect(after.slice(-4).every((t) => t.rhythm === "tango")).toBe(true);
    // (the rule itself ends the night on a run of tangos: only two non-tango tandas back to back would be a fault)
    expect(rhythmCycleFaults(after, q.options).filter((x) => x.kind === "adjacent")).toEqual([]);
    expect(at(reviewNight({ ...q, tandas: after }, deps, { settings }).findings, "tangoRun")).toEqual([]);
  });

  it("mid-night (the Booth) the reorder never moves a tanda that has started", () => {
    const p = night();
    const v = p.tandas.findIndex((t, i) => i > 12 && t.rhythm === "vals");
    const m = p.tandas.findIndex((t, i) => i > v + 1 && t.rhythm === "milonga");
    const q = moved(p, v, m);
    const fixedBefore = 12;
    const r = reviewNight(q, deps, { level: "booth", fixedBefore });
    expect(r.reorder).not.toBeNull();
    expect(r.reorder!.order.slice(0, fixedBefore)).toEqual(q.tandas.slice(0, fixedBefore).map((_, i) => i));
    for (const f of r.findings) expect(f.tanda === null || f.tanda >= fixedBefore).toBe(true);
  });
});

describe("cortinas and La Cumparsita", () => {
  it("a missing cortina between tandas is high; the fix puts one in", () => {
    const p = night();
    p.tandas[5] = { ...p.tandas[5]!, cortina: null };
    const f = at(reviewNight(p, deps).findings, "cortina", 5);
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe("high");
    expect(f[0]!.fix?.safe).toBe(true);
    const r = applyReviewFix(p, f[0]!.fix!.fix, deps);
    expect(r.playlist.tandas[5]!.cortina).not.toBeNull();
    expect(at(reviewNight(r.playlist, deps).findings, "cortina", 5)).toEqual([]);
  });

  it("a night that should close with La Cumparsita and does not is high; the fix closes it", () => {
    const p = { ...night(), closing: null };
    const f = at(reviewNight(p, deps).findings, "closing");
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe("high");
    const r = applyReviewFix(p, f[0]!.fix!.fix, deps);
    expect(normTitle(r.playlist.closing?.title ?? "")).toBe("la cumparsita");
    expect(at(reviewNight(r.playlist, deps).findings, "closing")).toEqual([]);
  });
});

describe("two levels", () => {
  it("the Booth keeps only blockers and high findings; Compose keeps every one", () => {
    const p = night();
    const c = versionCase(
      p,
      (orig, v) => orig.vocal === v.vocal && !!orig.year && !!v.year && Math.abs(v.year - orig.year) >= 8,
    )!;
    let q = withSide(p, c.ti, c.si, c.v);
    q = { ...q, tandas: q.tandas.map((t, i) => (i === 3 ? { ...t, cortina: null } : t)) };
    const compose = reviewNight(q, deps).findings;
    const booth = reviewNight(q, deps, { level: "booth" }).findings;
    expect(compose.some((f) => f.severity === "medium")).toBe(true);
    expect(booth.length).toBeGreaterThan(0);
    expect(booth.every((f) => f.severity === "blocker" || f.severity === "high")).toBe(true);
    expect(booth.length).toBeLessThan(compose.length);
    // most important first
    const rank = { blocker: 0, high: 1, medium: 2, low: 3 } as const;
    for (let i = 1; i < compose.length; i++)
      expect(rank[compose[i]!.severity]).toBeGreaterThanOrEqual(rank[compose[i - 1]!.severity]);
    // "Apply all safe fixes": both end, the night's own options stay, nothing else is touched
    const r = applySafeFixes(q, deps);
    expect(r.applied).toBe(2);
    const left = reviewNight(r.playlist, deps).findings;
    expect(left.filter((f) => f.fix?.safe)).toEqual([]);
    expect(at(left, "cortina", 3)).toEqual([]);
    expect(r.playlist.options).toEqual(q.options);
    expect(r.playlist.tandas.length).toBe(q.tandas.length);
  });
});
