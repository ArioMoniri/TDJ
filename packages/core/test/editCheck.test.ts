/**
 * The rule check before an edit is applied (packages/core/src/editCheck.ts): what the DJ's swap, search-and-swap, a
 * tanda moved or replaced, a side added by hand, an AI edit or a setting breaks — with plain facts — the suggestions
 * that keep the rule, and the DJ's "Do it as I said" as a one-night exception (never a template, never inherited by
 * another night). Written before the code (docs/TDD.md).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  approveEdit,
  bypassedTandas,
  checkEdit,
  compose,
  type EditRule,
  emptyMemory,
  exceptionCovers,
  forgetException,
  learnFromEdit,
  mergeLearned,
  nightExceptionKeys,
  type Playlist,
  recordExceptions,
  replaceSide,
  type Song,
  strictChecks,
  suggestFixes,
  swapOptions,
  type Tanda,
  templateIdOf,
} from "../src/index";
import { findRoot, loadCatalog } from "../src/load";

let deps: ReturnType<typeof loadCatalog>;
let night: Playlist;
beforeAll(() => {
  deps = loadCatalog();
  night = JSON.parse(
    readFileSync(join(findRoot(), "apps/web/public/featured/golden-double-peak.json"), "utf8"),
  ) as Playlist;
}, 600000);

const withTanda = (p: Playlist, i: number, t: Partial<Tanda>): Playlist => ({
  ...p,
  tandas: p.tandas.map((x, k) => (k === i ? { ...x, ...t } : x)),
});
const songsOf = (orch: string) => deps.catalog.byOrchestra.get(orch) ?? [];
const sideIn = (orch: string, f: (s: Song) => boolean) => {
  const s = songsOf(orch).find((x) => f(x) && !!x.year && !x.yearApprox);
  if (!s) throw new Error(`no side for ${orch}`);
  return s;
};
const forced = (p: Playlist, ti: number, si: number, s: Song) =>
  replaceSide(p, ti, si, s.id, deps, { force: true }).playlist;
/** the featured night with no recorded opening fallback, so the opening rule judges it */
const judged = (p: Playlist): Playlist => ({ ...p, stats: { ...p.stats, settingFallbacks: [] } });
const rulesOf = (p: Playlist, q: Playlist) => checkEdit(p, q, { catalog: deps.catalog }).violations;
const one = (p: Playlist, q: Playlist, rule: EditRule) => {
  const v = rulesOf(p, q).find((x) => x.rule === rule);
  expect(v, `a ${rule} violation`).toBeTruthy();
  expect(v!.facts.length).toBeGreaterThan(0);
  expect(v!.facts.every((f) => f.text.length > 10 && f.key.startsWith("ruleCheck.fact."))).toBe(true);
  expect(v!.message.key).toBe(`ruleCheck.rule.${rule}`);
  return v!;
};
/** a Laurenz / Casas tanda (the spec's example) put in the slot of tanda 5 */
const casasNight = () => {
  const casas = songsOf("pedro-laurenz").filter(
    (s) => s.singer === "Juan Carlos Casas" && s.rhythm === "tango" && s.year === 1940,
  );
  expect(casas.length).toBeGreaterThanOrEqual(4);
  return withTanda(night, 4, {
    songs: casas.slice(0, 4),
    pinned: undefined,
    locked: false,
    singer: "Juan Carlos Casas",
  });
};

describe("checkEdit: no violation, no question", () => {
  it("an edit that keeps every rule returns no violation (a valid side of the Swap sheet)", () => {
    const ok = swapOptions(night, 0, 1, deps).suggestions[0]!;
    const r = replaceSide(night, 0, 1, ok.song.id, deps);
    expect(r.reason).toBeUndefined();
    expect(checkEdit(night, r.playlist).violations.filter((v) => v.severity === "hard")).toEqual([]);
    expect(checkEdit(night, night).violations).toEqual([]);
  });
  it("what the night already broke is not the edit's (the featured night's mixed tanda 5 stays quiet)", () => {
    // a lock touches no side
    const locked = withTanda(night, 4, { locked: true });
    expect(checkEdit(night, locked).violations).toEqual([]);
  });
});

describe("checkEdit: each rule with its facts", () => {
  it("singer: Garúa exists only with Alberto Podestá; the rest of this tanda is Juan Carlos Casas", () => {
    const base = casasNight();
    const garua = sideIn("pedro-laurenz", (s) => s.title === "Garúa");
    const v = one(base, forced(base, 4, 1, garua), "singer");
    expect(v.severity).toBe("hard");
    expect(v.tanda).toBe(4);
    expect(v.songIds[0]).toBe(garua.id);
    expect(v.facts[0]!.text).toBe(
      "Garúa exists only with Alberto Podestá; the rest of this tanda is Juan Carlos Casas",
    );
    expect(v.facts[0]!.params).toMatchObject({
      title: "Garúa",
      voice: "Alberto Podestá",
      rest: "Juan Carlos Casas",
    });
  });
  it("voice: an instrumental side in a vocal tanda", () => {
    const instr = sideIn(
      "angel-d-agostino",
      (s) => !s.vocal && s.rhythm === "tango" && s.year! >= 1940 && s.year! <= 1943,
    );
    const v = one(night, forced(night, 0, 1, instr), "voice");
    expect(v.severity).toBe("hard");
    expect(v.facts[0]!.text).toContain(instr.title);
    expect(v.facts[0]!.text).toContain("Angel Vargas");
  });
  it("orchestra: a side of another orchestra", () => {
    const ds = sideIn("carlos-di-sarli", (s) => s.rhythm === "tango" && s.vocal);
    const v = one(night, forced(night, 0, 1, ds), "orchestra");
    expect(v.facts[0]!.text).toMatch(/is by .*Di Sarli.*the rest of this tanda is .*D'Agostino/i);
  });
  it("rhythm: a vals in a tango tanda", () => {
    const vals = sideIn("angel-d-agostino", (s) => s.rhythm === "vals");
    const v = one(night, forced(night, 0, 1, vals), "rhythm");
    expect(v.facts[0]!.text).toContain("this is a tango tanda");
  });
  it("years: a side far from the tanda's years", () => {
    const late = sideIn(
      "angel-d-agostino",
      (s) => s.rhythm === "tango" && s.singer === "Angel Vargas" && s.year! >= 1946,
    );
    const v = one(night, forced(night, 0, 1, late), "years");
    expect(v.facts[0]!.params.year).toBe(late.year);
  });
  it("vocalStyle: a singer-led side in a rhythm-led tanda", () => {
    const t = night.tandas[0]!;
    const songs = t.songs.map((s, k) => ({
      ...s,
      vocalStyle: k === 1 ? ("cantor" as const) : ("estribillo" as const),
    }));
    const before = withTanda(night, 0, {
      songs: songs.map((s) => ({ ...s, vocalStyle: "estribillo" as const })),
    });
    const after = withTanda(night, 0, {
      songs: songs.map((s, k) => (k === 1 ? { ...s, id: `${s.id}-c` } : s)),
    });
    one(before, after, "vocalStyle");
  });
  it("repeat: a title that already plays tonight", () => {
    const t = night.tandas[0]!;
    const again = { ...t.songs[1]!, id: "again-1", title: "Ventarrón" };
    const v = one(
      night,
      withTanda(night, 0, { songs: t.songs.map((s, k) => (k === 1 ? again : s)) }),
      "repeat",
    );
    expect(v.facts[0]!.text).toBe("Ventarrón already plays in tanda 4");
  });
  it("lastFourTango: the setting would skip a tanda the DJ pinned", () => {
    const pinned = withTanda(night, 22, { pinned: { by: "dj", reason: "mine" }, locked: true });
    const on = {
      ...pinned,
      options: { ...pinned.options, rules: { ...pinned.options.rules, lastFourTango: true } },
    };
    one(pinned, on, "lastFourTango");
    const v = rulesOf(pinned, on).find((x) => x.rule === "lastFourTango" && x.tanda === 22)!;
    expect(v.severity).toBe("hard");
    // (tanda 21, Donato's milonga, is pinned in the featured night too: the setting would skip it as well)
    expect(
      rulesOf(pinned, on)
        .filter((x) => x.rule === "lastFourTango")
        .map((x) => x.tanda),
    ).toEqual([20, 22]);
  });
  it("soft: the big four back to back, the same orchestra back to back, the energy step, a missing cortina, the opening", () => {
    const move = (p: Playlist, from: number, to: number) => {
      const ts = p.tandas.slice();
      const [x] = ts.splice(from, 1);
      ts.splice(to, 0, x!);
      return { ...p, tandas: ts };
    };
    // D'Arienzo (tanda 8) right after Di Sarli (tanda 2)
    expect(one(night, move(night, 7, 2), "bigFour").severity).toBe("soft");
    // Caló / Iriarte (tanda 17) right after Caló's vals (tanda 3)
    expect(one(night, move(night, 16, 3), "backToBack").severity).toBe("soft");
    // Biagi's vals e82 (tanda 18) right after Troilo / Rufino e49 (tanda 14)
    expect(one(night, move(night, 17, 14), "energyStep").severity).toBe("soft");
    expect(one(night, withTanda(night, 0, { cortina: null }), "cortina").severity).toBe("soft");
    const other = deps.catalog.songs.find(
      (s) => s.title === "La Cumparsita" && s.orchestraId === "carlos-di-sarli" && !!s.year,
    )!;
    expect(one(judged(night), { ...judged(night), opening: other }, "cumparsitaOpener").severity).toBe(
      "soft",
    );
  });
});

describe("suggestFixes: concrete nights that keep the rule", () => {
  const passes = (before: Playlist, after: Playlist, rule: EditRule, at?: number) => {
    const v = rulesOf(before, after).find((x) => x.rule === rule && (at === undefined || x.tanda === at))!;
    const sug = suggestFixes(before, after, v, deps);
    expect(sug.length, `${rule} suggestions`).toBeGreaterThan(0);
    expect(sug.length).toBeLessThanOrEqual(3);
    for (const s of sug) {
      const left = checkEdit(before, s.playlist).violations;
      // (a violation is the same one when it names the same sides: a suggestion may move a tanda)
      const sameSides = (x: typeof v) =>
        x.songIds.length && v.songIds.length
          ? x.songIds.some((id) => v.songIds.includes(id))
          : x.tanda === v.tanda;
      expect(
        left.filter((x) => x.rule === rule && sameSides(x)),
        `${s.text}`,
      ).toEqual([]);
      // no hard violation the DJ's edit did not bring already (another pinned tanda under the same setting)
      const idOf = (x: typeof v) => `${x.rule}|${x.songIds.slice().sort().join(",")}`;
      const had = new Set(rulesOf(before, after).map(idOf));
      expect(
        left.filter((x) => x.severity === "hard" && !had.has(idOf(x))),
        `${s.text}`,
      ).toEqual([]);
      expect(s.text.length).toBeGreaterThan(10);
      expect(s.message.key).toMatch(/^ruleCheck\.suggest\./);
    }
    return sug;
  };
  it("a vocal tanda's song for an instrumental side: sides that keep the tanda one singer", () => {
    const instr = sideIn(
      "angel-d-agostino",
      (s) => !s.vocal && s.rhythm === "tango" && s.year! >= 1940 && s.year! <= 1943,
    );
    const after = forced(night, 0, 1, instr);
    const sug = passes(night, after, "voice");
    for (const s of sug) {
      const t = s.playlist.tandas[0]!;
      expect(new Set(t.songs.map((x) => x.singer)).size).toBe(1);
      // the side the DJ took out is Cancel, not a suggestion
      expect(t.songs[1]!.id).not.toBe(night.tandas[0]!.songs[1]!.id);
      // a suggestion is a normal edit: not pinned as an exception
      expect(t.pinned?.exception).toBeUndefined();
    }
  });
  it("Garúa in a Casas tanda: another Casas side of the same years", () => {
    const base = casasNight();
    const garua = sideIn("pedro-laurenz", (s) => s.title === "Garúa");
    passes(base, forced(base, 4, 1, garua), "singer");
  });
  it("the same title by another recording of the tanda's singer comes first", () => {
    // tanda 1 (D'Agostino / Vargas): a title Vargas recorded with D'Agostino, put in as another recording of it
    const t = night.tandas[0]!;
    const vargas = songsOf("angel-d-agostino").filter((s) => s.singer === "Angel Vargas");
    const title = vargas.find(
      (s) =>
        !t.songs.some((x) => x.title === s.title) &&
        songsOf("angel-d-agostino").some((y) => y.title === s.title && !y.vocal),
    );
    if (!title) return; // (no such title in the catalogue)
    const instr = songsOf("angel-d-agostino").find((y) => y.title === title.title && !y.vocal)!;
    const after = forced(night, 0, 1, instr);
    const v = rulesOf(night, after).find((x) => x.rule === "voice")!;
    expect(v.facts[0]!.text).toContain(`${instr.title} also exists with Angel Vargas`);
  });
  it("a setting over a pinned tanda: keep the setting and skip the tanda, or move it", () => {
    const pinned = withTanda(night, 22, { pinned: { by: "dj", reason: "mine" }, locked: true });
    const on = {
      ...pinned,
      options: { ...pinned.options, rules: { ...pinned.options.rules, lastFourTango: true } },
    };
    const sug = passes(pinned, on, "lastFourTango", 22);
    expect(sug.some((s) => s.kind === "skip" && s.playlist.tandas[22]!.bypass)).toBe(true);
    expect(sug.some((s) => s.kind === "position")).toBe(true);
    for (const s of sug) expect(s.playlist.options.rules?.lastFourTango).toBe(true);
  });
  it("a soft rule offers its fix too (a cortina, a place, the matching opening)", () => {
    passes(night, withTanda(night, 0, { cortina: null }), "cortina");
    const other = deps.catalog.songs.find(
      (s) => s.title === "La Cumparsita" && s.orchestraId === "carlos-di-sarli" && !!s.year,
    )!;
    passes(judged(night), { ...judged(night), opening: other }, "cumparsitaOpener");
  });
});

describe("Do it as I said: a one-night exception", () => {
  const edit = () => {
    const instr = sideIn(
      "angel-d-agostino",
      (s) => !s.vocal && s.rhythm === "tango" && s.year! >= 1940 && s.year! <= 1943,
    );
    const after = forced(night, 0, 1, instr);
    const vs = rulesOf(night, after);
    return { after, vs, ...approveEdit(after, vs, "Do it as I said", "2026-11-15T20:00:00.000Z") };
  };
  it("is scoped to the night id: the strict panel accepts the tanda in this night only", () => {
    const { playlist, exceptions } = edit();
    expect(exceptions).toHaveLength(1);
    const x = exceptions[0]!;
    expect(x).toMatchObject({
      nightId: night.id,
      source: "dj",
      rules: ["voice"],
      tandaId: templateIdOf(playlist.tandas[0]!),
    });
    expect(playlist.tandas[0]!.pinned?.exception).toEqual({ nightId: night.id, rules: ["voice"] });
    const L = recordExceptions(undefined, exceptions);
    const keys = nightExceptionKeys(L, night.id);
    expect(keys.has(templateIdOf(playlist.tandas[0]!))).toBe(true);
    expect(nightExceptionKeys(L, "another-night").size).toBe(0);
    const here = strictChecks(playlist, { approved: keys });
    expect(here.accepted?.some((v) => v.tanda === 0 && v.rule === "tandaVoice")).toBe(true);
    const there = strictChecks({ ...playlist }, { approved: nightExceptionKeys(L, "another-night") });
    expect(there.accepted?.some((v) => v.tanda === 0) ?? false).toBe(false);
    // the same edit again in this night asks nothing; in another night it does
    expect(
      checkEdit(night, playlist, { exceptions: L.night!.exceptions }).violations.filter(
        (v) => v.rule === "voice",
      ),
    ).toEqual([]);
    const elsewhere = { ...playlist, id: "another-night" };
    expect(
      checkEdit({ ...night, id: "another-night" }, elsewhere, {
        exceptions: L.night!.exceptions,
      }).violations.some((v) => v.rule === "voice"),
    ).toBe(true);
    // removed: the tanda is judged by the rules again
    const gone = forgetException(L, night.id, x.tandaId);
    expect(nightExceptionKeys(gone, night.id).size).toBe(0);
  });
  it("never becomes a template; the DJ's sides still teach", () => {
    const { playlist } = edit();
    const L = learnFromEdit(undefined, night, playlist);
    expect(L.templates).toEqual([]);
    expect(L.sides?.[playlist.tandas[0]!.songs[1]!.id]).toBeGreaterThan(0);
    // a pin without the exception marker is a template as before
    const pin = withTanda(night, 0, { pinned: { by: "dj" }, locked: true });
    expect(learnFromEdit(undefined, night, pin).templates).toHaveLength(1);
  });
  it("a new compose never inherits it", () => {
    const { exceptions } = edit();
    const memory = { ...emptyMemory(), learned: recordExceptions(undefined, exceptions) };
    // what compose reads of the DJ's memory carries no night exception
    const learned = mergeLearned(deps.catalog.learned, memory.learned);
    expect(learned.night).toBeUndefined();
    const fresh = compose({ hours: 2, seed: 7, learned }, deps);
    expect(fresh.id).not.toBe(night.id);
    expect(nightExceptionKeys(memory.learned, fresh.id).size).toBe(0);
    expect(fresh.tandas.some((t) => t.pinned?.exception)).toBe(false);
    expect(fresh.tandas.every((_t, i) => !exceptionCovers(exceptions, fresh, i, "voice"))).toBe(true);
  });
  it("the last-4-tango setting plays the approved tanda in that night only", () => {
    const pinned = withTanda(night, 22, { pinned: { by: "dj", reason: "mine" }, locked: true });
    const on = {
      ...pinned,
      options: { ...pinned.options, rules: { ...pinned.options.rules, lastFourTango: true } },
    };
    expect(bypassedTandas(on).has(22)).toBe(true);
    const vs = rulesOf(pinned, on);
    const ok = approveEdit(on, vs, "Do it as I said").playlist;
    expect(bypassedTandas(ok).has(22)).toBe(false);
    expect(checkEdit(pinned, ok).violations.some((v) => v.rule === "lastFourTango")).toBe(false);
    // another night (a copy with another id) skips it again
    expect(bypassedTandas({ ...ok, id: "another-night" }).has(22)).toBe(true);
  });
});
