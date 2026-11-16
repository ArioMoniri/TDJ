/**
 * Round-22 invariants (docs/ROADMAP.md "Round 22 onward" §5, §12): editing a composed night from a prompt through
 * structured edits that the engine validates (nightEdit.ts), the live suggestions of the hand-built night
 * (suggest.ts) and the learned rules the DJ edits, weights and deletes (learnedRules.ts). Written before the code.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyNightEdits,
  BIG_FOUR,
  buildManualNight,
  compose,
  editCandidates,
  familyKey,
  forgetLearned,
  learnedRules,
  learnFromLock,
  type NightEditOp,
  nightFaults,
  nightSummary,
  type Playlist,
  parseEditCommand,
  parseEditOps,
  type Song,
  setLearnedWeight,
  suggestNext,
  swapOptions,
  tandaProblems,
} from "../src/index";
import { loadCatalog } from "../src/load";

let deps: ReturnType<typeof loadCatalog>;
let night: Playlist;
let night2: Playlist;
beforeAll(() => {
  deps = loadCatalog();
  night = compose({ hours: 4, seed: 1 }, deps);
  night2 = compose({ hours: 4, seed: 2 }, deps);
}, 600000);

const inCatalogue = (id: string) => deps.catalog.songs.some((s) => s.id === id || s.altIds?.includes(id));
const ids = (p: Playlist) => p.tandas.map((t) => t.songs.map((s) => s.id).join(","));
const isBig = (id: string) => (BIG_FOUR as readonly string[]).includes(id);

describe("parseEditOps: tool calls from any provider become checked edit operations", () => {
  it("reads an Anthropic tool_use block, an OpenAI tool call (JSON string arguments) and fenced JSON text", () => {
    const edits = [
      { op: "retune", tanda: 7, direction: "calmer" },
      { op: "swap", tanda: 3, position: 2, songId: "abc" },
    ];
    const a = parseEditOps([{ type: "tool_use", name: "edit_night", input: { edits, note: "ok" } }]);
    expect(a.ops).toEqual(edits);
    expect(a.note).toBe("ok");
    const o = parseEditOps({
      tool_calls: [{ function: { name: "edit_night", arguments: JSON.stringify({ edits }) } }],
    });
    expect(o.ops).toEqual(edits);
    const t = parseEditOps(`Here you go:\n\`\`\`json\n${JSON.stringify({ edits })}\n\`\`\``);
    expect(t.ops).toEqual(edits);
  });
  it("normalises aliases and numbers given as strings; refuses what it cannot read, with the reason", () => {
    const r = parseEditOps({
      edits: [
        { type: "reorder", tanda: "4", to: "1" },
        { op: "pin", tanda: 2 },
        { op: "retune_energy", tanda: 5, delta: 12 },
        { op: "replaceTanda", tanda: 6, orchestraId: "anibal-troilo" },
        { op: "teleport", tanda: 1 },
        { op: "swap", tanda: "x", position: 1 },
        { op: "swap", tanda: 1.5, position: 1 },
      ],
    });
    expect(r.ops).toEqual([
      { op: "move", tanda: 4, to: 1 },
      { op: "lock", tanda: 2, locked: true },
      { op: "retune", tanda: 5, direction: "livelier" },
      { op: "replace_tanda", tanda: 6, orchestraId: "anibal-troilo" },
    ]);
    expect(r.errors).toHaveLength(3);
    expect(r.errors.join(" ")).toMatch(/teleport/);
    expect(parseEditOps("no json here").ops).toEqual([]);
    expect(parseEditOps(null).errors.length).toBeGreaterThan(0);
  });
});

describe("applyNightEdits: every edit is validated by the engine; nothing breaks the night", () => {
  it("refuses an id that is not in the catalogue and leaves the night as it was", () => {
    const r = applyNightEdits(night, [{ op: "swap", tanda: 1, position: 2, songId: "not-a-real-id" }], deps);
    expect(r.applied).toHaveLength(0);
    expect(r.rejected[0]!.reason).toMatch(/catalogue/);
    expect(ids(r.playlist)).toEqual(ids(night));
  });
  it("applies a valid swap: one chair changes, the rest of the night stays, the score is recomputed", () => {
    // the first chair with a valid replacement (the Swap sheet's own list)
    const [ti, si] = night.tandas
      .flatMap((t, i) => t.songs.map((_, k) => [i, k] as const))
      .find(([i, k]) => swapOptions(night, i, k, deps).suggestions.length > 0)!;
    const sug = swapOptions(night, ti, si, deps).suggestions[0]!;
    const r = applyNightEdits(
      night,
      [{ op: "swap", tanda: ti + 1, position: si + 1, songId: sug.song.id }],
      deps,
    );
    expect(r.rejected).toEqual([]);
    expect(r.playlist.tandas[ti]!.songs[si]!.id).toBe(sug.song.id);
    for (let i = 0; i < night.tandas.length; i++)
      if (i !== ti) expect(ids(r.playlist)[i]).toBe(ids(night)[i]);
    expect(r.playlist.score.total).toBeGreaterThan(0);
    expect(r.applied[0]!.line).toContain(sug.song.title);
    expect(r.applied[0]!.before!.songs[si]!.id).toBe(night.tandas[ti]!.songs[si]!.id);
    expect(r.applied[0]!.after!.songs[si]!.id).toBe(sug.song.id);
  });
  it("refuses a side of another orchestra in a swap, with the rule it breaks", () => {
    const t = night.tandas[0]!;
    const other = deps.catalog.songs.find(
      (s) => s.rhythm === t.rhythm && s.orchestraId !== t.orchestraId && s.spotify?.uri,
    )!;
    const r = applyNightEdits(night, [{ op: "swap", tanda: 1, position: 1, songId: other.id }], deps);
    expect(r.applied).toHaveLength(0);
    expect(r.rejected[0]!.reason).toMatch(/orchestra/);
  });
  it("retunes a tanda calmer or livelier within the rules (tanda coherence, no new night faults)", () => {
    const before = nightFaults(night.tandas, night.options);
    let calmer = 0;
    let livelier = 0;
    for (const [i, t] of night.tandas.entries()) {
      if (i === 0 || i === night.tandas.length - 1) continue;
      const c = applyNightEdits(night, [{ op: "retune", tanda: i + 1, direction: "calmer" }], deps);
      if (c.applied.length) {
        calmer++;
        const nt = c.playlist.tandas[i]!;
        expect(nt.energy).toBeLessThanOrEqual(t.energy - 3);
        // the same family: every new side passed the Swap sheet's rules, so the tanda gains no coherence fault
        if (nt.orchestraId === t.orchestraId && nt.singer === t.singer)
          for (const p of tandaProblems(nt, night.options))
            expect(tandaProblems(t, night.options).map((x) => x.key)).toContain(p.key);
        const after = nightFaults(c.playlist.tandas, night.options);
        expect(after.filter((k) => !before.includes(k))).toEqual([]);
      } else expect(c.rejected[0]!.reason.length).toBeGreaterThan(5);
      const l = applyNightEdits(night, [{ op: "retune", tanda: i + 1, direction: "livelier" }], deps);
      if (l.applied.length) {
        livelier++;
        expect(l.playlist.tandas[i]!.energy).toBeGreaterThanOrEqual(t.energy + 3);
      }
      if (calmer >= 3 && livelier >= 3) break;
    }
    expect(calmer).toBeGreaterThanOrEqual(3);
    expect(livelier).toBeGreaterThanOrEqual(3);
  });
  it("locks and unlocks", () => {
    const r = applyNightEdits(night, [{ op: "lock", tanda: 4, locked: true }], deps);
    expect(r.playlist.tandas[3]!.locked).toBe(true);
    const u = applyNightEdits(r.playlist, [{ op: "lock", tanda: 4, locked: false }], deps);
    expect(u.playlist.tandas[3]!.locked).toBeFalsy();
  });
  it("moves a tanda only where the rhythm cycle stays; otherwise trades places or refuses", () => {
    const rh = (p: Playlist) => p.tandas.map((t) => t.rhythm).join("");
    const r = applyNightEdits(night, [{ op: "move", tanda: 2, to: 1 }], deps);
    expect(rh(r.playlist)).toBe(rh(night));
    if (r.applied.length) {
      expect(r.playlist.tandas[0]!.songs[0]!.id).toBe(night.tandas[1]!.songs[0]!.id);
      expect(r.playlist.tandas[1]!.songs[0]!.id).toBe(night.tandas[0]!.songs[0]!.id);
    } else expect(r.rejected[0]!.reason).toBeTruthy();
    // a vals into a tango chair: the cycle would break
    const v = night.tandas.findIndex((t) => t.rhythm === "vals");
    const m = applyNightEdits(night, [{ op: "move", tanda: v + 1, to: 1 }], deps);
    expect(rh(m.playlist)).toBe(rh(night));
    expect(m.applied).toHaveLength(0);
    expect(m.rejected[0]!.reason).toMatch(/cycle|rhythm/);
  });
  it("replaces a tanda with a named orchestra and singer where it fits, or says why not", () => {
    // (a family's free sides run out when the night already plays it twice: then the reason, never a broken tanda)
    const asks: Array<[string, string]> = [
      ["anibal-troilo", "Fiorentino"],
      ["carlos-di-sarli", "Rufino"],
      ["angel-d-agostino", "Vargas"],
      ["ricardo-tanturi", "Castillo"],
      ["osvaldo-fresedo", "Ray"],
    ];
    let done = 0;
    for (const p of [night, night2]) {
      const base = nightFaults(p.tandas, p.options, p.score.reasons);
      for (const [orch, singer] of asks)
        for (const [i, t] of p.tandas.entries()) {
          if (t.rhythm !== "tango" || t.orchestraId === orch) continue;
          const r = applyNightEdits(
            p,
            [{ op: "replace_tanda", tanda: i + 1, orchestraId: orch, singer }],
            deps,
          );
          if (!r.applied.length) {
            expect(r.rejected[0]!.reason.length).toBeGreaterThan(5);
            expect(ids(r.playlist)).toEqual(ids(p));
            continue;
          }
          const nt = r.playlist.tandas[i]!;
          expect(nt.orchestraId).toBe(orch);
          expect(nt.singer ?? "").toMatch(new RegExp(singer));
          expect(nt.songs.every((s) => inCatalogue(s.id))).toBe(true);
          const after = nightFaults(r.playlist.tandas, p.options, r.playlist.score.reasons);
          expect(after.filter((k) => !base.includes(k))).toEqual([]);
          done++;
          break;
        }
    }
    expect(done).toBeGreaterThanOrEqual(2);
  });
  it("refuses a hand-listed tanda that mixes orchestras", () => {
    const t = night.tandas[0]!;
    const other = deps.catalog.songs.find((s) => s.rhythm === t.rhythm && s.orchestraId !== t.orchestraId)!;
    const r = applyNightEdits(
      night,
      [{ op: "replace_tanda", tanda: 1, songIds: [t.songs[0]!.id, other.id, t.songs[2]!.id] }],
      deps,
    );
    expect(r.applied).toHaveLength(0);
    expect(r.rejected[0]!.reason).toMatch(/orchestra/);
  });
  it("numbers refer to the night as the DJ saw it, even after a move earlier in the same batch", () => {
    const seventh = night.tandas[6]!;
    const ops: NightEditOp[] = [
      { op: "move", tanda: 2, to: 1 },
      { op: "lock", tanda: 7, locked: true },
    ];
    const r = applyNightEdits(night, ops, deps);
    const now = r.playlist.tandas.find((t) => t.songs[0]!.id === seventh.songs[0]!.id)!;
    expect(now.locked).toBe(true);
  });
  it("every applied batch keeps catalogue ids only and adds no night fault", () => {
    const ops: NightEditOp[] = [
      { op: "retune", tanda: 5, direction: "calmer" },
      { op: "swap", tanda: 9, position: 3 },
      { op: "replace_tanda", tanda: 12, direction: "livelier" },
      { op: "lock", tanda: 2 },
    ];
    for (const p of [night, night2]) {
      const before = nightFaults(p.tandas, p.options);
      const r = applyNightEdits(p, ops, deps);
      expect(r.applied.length + r.rejected.length).toBe(ops.length);
      for (const t of r.playlist.tandas) for (const s of t.songs) expect(inCatalogue(s.id)).toBe(true);
      const after = nightFaults(r.playlist.tandas, p.options);
      expect(after.filter((k) => !before.includes(k))).toEqual([]);
    }
  });
});

describe("the model's context: small, from the night summary, with checked candidate ids", () => {
  it("summarises the night in a few kilobytes, one line per tanda", () => {
    const s = nightSummary(night);
    expect(s.length).toBeLessThan(6000);
    for (let i = 1; i <= night.tandas.length; i++) expect(s).toContain(`T${i} `);
  });
  it("offers candidate sides for the tandas and names the request mentions, every id from the catalogue", () => {
    const c = editCandidates(night, deps, "swap the 2nd song of tanda 5 for a Fiorentino");
    expect(c.text.length).toBeLessThan(7000);
    expect(c.ids.size).toBeGreaterThanOrEqual(2);
    for (const id of c.ids) expect(inCatalogue(id)).toBe(true);
    expect(c.text).toMatch(/Fiorentino/);
    expect(c.text).toMatch(/T5\.2/);
  });
});

describe("parseEditCommand: the plain-words fallback when no model is connected", () => {
  it("reads retune, lock, move and trade requests", () => {
    expect(parseEditCommand("make tanda 7 calmer", night, deps).ops).toEqual([
      { op: "retune", tanda: 7, direction: "calmer" },
    ]);
    expect(parseEditCommand("Tanda 4 more energetic please", night, deps).ops).toEqual([
      { op: "retune", tanda: 4, direction: "livelier" },
    ]);
    expect(parseEditCommand("lock tanda 3", night, deps).ops).toEqual([
      { op: "lock", tanda: 3, locked: true },
    ]);
    expect(parseEditCommand("unlock the 3rd tanda", night, deps).ops).toEqual([
      { op: "lock", tanda: 3, locked: false },
    ]);
    expect(parseEditCommand("move tanda 4 to 1", night, deps).ops).toEqual([{ op: "move", tanda: 4, to: 1 }]);
    expect(parseEditCommand("swap tanda 2 and 4", night, deps).ops).toEqual([
      { op: "move", tanda: 2, to: 4 },
      { op: "move", tanda: 4, to: 2 },
    ]);
    expect(parseEditCommand("what a lovely night", night, deps).ops).toEqual([]);
  });
  it("turns 'swap the 2nd song of tanda N for a <singer>' into a checked swap or a tanda replacement", () => {
    // a Fiorentino tanda and a chair of it with a valid replacement
    const at = [night, night2]
      .flatMap((p) =>
        p.tandas.flatMap((t, i) =>
          /Fiorentino/.test(t.singer ?? "") ? t.songs.map((_, k) => ({ p, i, k })) : [],
        ),
      )
      .find(({ p, i, k }) => swapOptions(p, i, k, deps).suggestions.length > 0)!;
    expect(at).toBeTruthy();
    const ord = ["1st", "2nd", "3rd", "4th", "5th"][at.k]!;
    const same = parseEditCommand(
      `swap the ${ord} song of tanda ${at.i + 1} for a Fiorentino`,
      at.p,
      deps,
    ).ops;
    expect(same).toHaveLength(1);
    expect(same[0]!.op).toBe("swap");
    const sw = same[0] as Extract<NightEditOp, { op: "swap" }>;
    expect(sw.position).toBe(at.k + 1);
    expect(inCatalogue(sw.songId!)).toBe(true);
    expect(applyNightEdits(at.p, same, deps).applied).toHaveLength(1);
    const j = night.tandas.findIndex((t) => t.rhythm === "tango" && !/Fiorentino/.test(t.singer ?? ""));
    const other = parseEditCommand(`swap the 2nd song of tanda ${j + 1} for a Fiorentino`, night, deps).ops;
    expect(other[0]).toMatchObject({ op: "replace_tanda", tanda: j + 1, singer: "Fiorentino" });
  });
});

describe("suggestNext: live guidance for the hand-built night", () => {
  const tandaOf = (p: Playlist, i: number) => p.tandas[i]!.songs;
  it("an empty night starts with a tango tanda, every suggestion with its reason, best first", () => {
    const r = suggestNext([], deps, { hours: 4 });
    expect(r.mode).toBe("tanda");
    expect(r.rhythm).toBe("tango");
    expect(r.suggestions.length).toBeGreaterThanOrEqual(4);
    for (const s of r.suggestions) {
      expect(s.reasons.length).toBeGreaterThan(0);
      // 2026-11: every reason also as data, in the same order (the app says it in the DJ's language)
      expect(s.why.length).toBe(s.reasons.length);
      expect(s.songs.length).toBe(4);
      expect(s.songs.every((x) => x.rhythm === "tango")).toBe(true);
    }
    const scores = r.suggestions.map((s) => s.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
  it("rotates the rhythm: after two tango tandas comes a vals or a milonga", () => {
    const t = night.tandas.filter((x) => x.rhythm === "tango");
    const r = suggestNext([t[0]!.songs, t[1]!.songs], deps, { hours: 4 });
    expect(["vals", "milonga"]).toContain(r.rhythm);
    expect(r.suggestions.every((s) => s.rhythm === r.rhythm)).toBe(true);
  });
  it("spaces orchestras and never puts two big-four tandas back to back", () => {
    const dar = night.tandas.find((t) => t.orchestraId === "juan-d-arienzo" && t.rhythm === "tango")!;
    const r = suggestNext([dar.songs], deps, { hours: 4 });
    expect(r.suggestions.some((s) => s.orchestraId === "juan-d-arienzo")).toBe(false);
    expect(r.suggestions.some((s) => isBig(s.orchestraId))).toBe(false);
  });
  it("lifts the energy after two calm tandas, and says so", () => {
    // (2026-11: from both composed nights — the succession model moved seed 1's calmest pair to 60.5, no longer
    // "two calm tandas"; the rule under test is the lift after two tandas under 60)
    const calm = [...night.tandas, ...night2.tandas]
      .filter((t) => t.rhythm === "tango" && !isBig(t.orchestraId))
      .sort((a, b) => a.energy - b.energy)
      .slice(0, 2);
    expect(calm.every((t) => t.energy < 60)).toBe(true);
    const mean = (calm[0]!.energy + calm[1]!.energy) / 2;
    const r = suggestNext(
      calm.map((t) => t.songs),
      deps,
      { hours: 4, rhythm: "tango" },
    );
    const top = r.suggestions[0]!;
    expect(top.energy).toBeGreaterThan(mean);
    expect(top.reasons.join(" ")).toMatch(/lifts the energy/i);
  });
  it("brings a big-four tanda when none played lately", () => {
    const others = night.tandas.filter((t) => t.rhythm === "tango" && !isBig(t.orchestraId)).slice(0, 3);
    const r = suggestNext(
      others.map((t) => t.songs),
      deps,
      { hours: 4, rhythm: "tango" },
    );
    const top3 = r.suggestions.slice(0, 3);
    expect(top3.some((s) => isBig(s.orchestraId))).toBe(true);
    expect(top3.find((s) => isBig(s.orchestraId))!.reasons.join(" ")).toMatch(/big four/i);
  });
  it("inside an unfinished tanda, suggests the next side of the same family within the year band", () => {
    const t = night.tandas.find((x) => x.rhythm === "tango" && x.vocal)!;
    const r = suggestNext([t.songs.slice(0, 2)], deps, { hours: 4 });
    expect(r.mode).toBe("song");
    expect(r.suggestions.length).toBeGreaterThan(0);
    const ys = t.songs.slice(0, 2).map((s) => s.year!);
    for (const s of r.suggestions) {
      const x = s.songs[0]!;
      expect(x.orchestraId).toBe(t.orchestraId);
      expect(x.singerId).toBe(t.songs[0]!.singerId);
      expect(Math.max(x.year!, ...ys) - Math.min(x.year!, ...ys)).toBeLessThanOrEqual(2);
      expect(t.songs.slice(0, 2).some((y) => y.id === x.id)).toBe(false);
      expect(s.reasons.length).toBeGreaterThan(0);
      expect(s.why.map((w) => w.code).length).toBe(s.reasons.length);
    }
  });
  it("never suggests a side already in the night and matches the era of what came before", () => {
    const draft = [tandaOf(night, 0), tandaOf(night, 1)];
    const used = new Set(draft.flat().map((s) => s.id));
    const r = suggestNext(draft, deps, { hours: 4 });
    for (const s of r.suggestions) for (const x of s.songs) expect(used.has(x.id)).toBe(false);
    expect(r.suggestions.some((s) => s.reasons.some((x) => /years|era|19\d0s/i.test(x)))).toBe(true);
    // …said as data too: one suggestion carries the reason of the years, or how it follows the last tanda
    for (const s of r.suggestions) expect(s.why.length).toBe(s.reasons.length);
    expect(
      r.suggestions.some((s) => s.why.some((w) => w.code === "same_decade" || w.code === "succession")),
    ).toBe(true);
  });
  it("a learned family ranks higher (what the DJ chose before)", () => {
    const r0 = suggestNext([], deps, { hours: 4 });
    const pick = r0.suggestions[r0.suggestions.length - 1]!;
    const key = familyKey(pick.songs[0]!);
    const r1 = suggestNext([], deps, { hours: 4, learned: { families: { [key]: 3 } } });
    const pos0 = r0.suggestions.findIndex((s) => s.key === pick.key);
    const pos1 = r1.suggestions.findIndex((s) => s.key === pick.key);
    expect(pos1).toBeGreaterThanOrEqual(0);
    expect(pos1).toBeLessThan(pos0);
    expect(r1.suggestions[pos1]!.reasons.join(" ")).toMatch(/you/i);
  });
});

describe("buildManualNight: a hand-picked night is a full night (stats, score, the DJ's pins)", () => {
  it("turns tandas of ids into a scored night whose tandas are the DJ's", () => {
    const draft = night.tandas.slice(0, 6).map((t) => t.songs.map((s) => s.id));
    const p = buildManualNight(draft, deps, { hours: 4 });
    expect(p.tandas).toHaveLength(6);
    expect(p.tandas.map((t) => t.songs.map((s) => s.id))).toEqual(draft);
    expect(p.tandas.every((t) => t.pinned?.by === "dj" && t.locked)).toBe(true);
    expect(p.stats.tandas).toBe(6);
    expect(p.score.total).toBeGreaterThan(0);
    expect(p.tandas[0]!.rhythm).toBe(night.tandas[0]!.rhythm);
  });
  it("drops ids that are not in the catalogue instead of inventing sides", () => {
    const p = buildManualNight([[night.tandas[0]!.songs[0]!.id, "nope"]], deps, { hours: 4 });
    expect(p.tandas[0]!.songs.map((s: Song) => s.id)).toEqual([night.tandas[0]!.songs[0]!.id]);
  });
});

describe("learned rules: a list the DJ can weight and delete", () => {
  it("lists families, sides and templates; weights clamp; delete removes; a lock teaches its family", () => {
    const t = night.tandas[0]!;
    let L = learnFromLock(undefined, t, true);
    const key = familyKey(t.songs[0]!);
    expect(L.families?.[key]).toBeGreaterThan(0);
    const rules = learnedRules(L, (id) => id.toUpperCase());
    const fam = rules.find((r) => r.id === `family:${key}`)!;
    expect(fam.kind).toBe("family");
    expect(fam.label).toContain(t.orchestraId.toUpperCase());
    expect(rules.some((r) => r.kind === "side")).toBe(true);
    L = setLearnedWeight(L, fam.id, 99);
    expect(L.families?.[key]).toBe(3);
    L = setLearnedWeight(L, fam.id, -99);
    expect(L.families?.[key]).toBe(-1);
    L = forgetLearned(L, fam.id);
    expect(L.families?.[key]).toBeUndefined();
    expect(learnedRules(L).some((r) => r.id === fam.id)).toBe(false);
    // unlocking teaches nothing new
    const u = learnFromLock(undefined, t, false);
    expect(Object.keys(u.families ?? {})).toHaveLength(0);
  });
});
