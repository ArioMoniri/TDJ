/**
 * 2026-11 (the owner: "songs and tandas insertable or removable in each tanda and before / after tandas, by AI and
 * manually; the AI guides; near the Cumparsitas it checks the Cumparsita; a setting for the last La Cumparsita").
 * Invariants written before the change:
 *  - the closing format: the default and a stored night keep the format they had (straight after the última, no
 *    cortina, on a golden night); "after-cortina" and "own-tanda" play a cortina before it, "straight" and "in-tanda"
 *    none, "in-tanda" closes with the última's own orchestra when it has a version, "none" has no closing; the Booth's
 *    time to La Cumparsita follows; the opening stays its own setting;
 *  - insert / remove: a side in at a place, a side out, a tanda in before / after another (an engine suggestion or the
 *    DJ's sides), a tanda out — re-timed and re-scored, tandas renumbered, every gap with one cortina, never the same
 *    cortina twice in a row, the última's cortina by the closing format;
 *  - the spot's suggestions fit it (a side of the tanda's family; a tanda at the energy the arc wants, each with a why);
 *  - the guide names what an edit did (length, rhythm cycle, cortinas, the opening / closing La Cumparsita) with a fix.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyGuideFix,
  attachBooth,
  closingFormatOf,
  closingLabel,
  closingRules,
  compose,
  cortinaBeforeClosing,
  editGuide,
  insertSong,
  insertSongOptions,
  insertTanda,
  insertTandaOptions,
  isCumparsita,
  maxTangoRun,
  type Playlist,
  removeSong,
  removeTanda,
  rhythmCycleFaults,
  type Tanda,
} from "../src/index";
import { findRoot, loadCatalog } from "../src/load";

let deps: ReturnType<typeof loadCatalog>;
let p: Playlist;
const nights = new Map<string, Playlist>();
const night = (fmt?: string) => {
  const k = fmt ?? "";
  if (!nights.has(k))
    nights.set(
      k,
      compose({ hours: 3, seed: 41, ...(fmt ? { rules: { closingFormat: fmt as never } } : {}) }, deps),
    );
  return nights.get(k)!;
};
beforeAll(() => {
  deps = loadCatalog();
  p = compose({ hours: 2, seed: 7 }, deps);
}, 600000);

const noTwinCortinas = (ts: Tanda[]) => {
  for (let i = 1; i < ts.length; i++) {
    const a = ts[i - 1]!.cortina,
      b = ts[i]!.cortina;
    if (a && b) expect(a.id, `cortinas after tandas ${i} and ${i + 1}`).not.toBe(b.id);
  }
};
const gapsHaveCortinas = (q: Playlist) =>
  q.tandas.slice(0, -1).forEach((t, i) => expect(t.cortina, `the gap after tanda ${i + 1}`).toBeTruthy());

describe("closing format", () => {
  it("the default stays what it is today: a golden night closes straight after the última", () => {
    expect(closingRules({})).toEqual({});
    const d = night();
    expect(closingFormatOf(d.options)).toBe("straight");
    expect(d.tandas.at(-1)!.cortina).toBeNull();
    expect(d.closing && isCumparsita(d.closing)).toBe(true);
    expect(d.booth?.closingFormat).toBeUndefined();
  }, 120000);
  it("the featured night keeps its own format exactly (legacy keys read as its format, its plan unchanged)", () => {
    const f = JSON.parse(
      readFileSync(join(findRoot(), "apps/web/public/featured/golden-double-peak.json"), "utf8"),
    ) as Playlist;
    expect(f.options.rules?.closingFormat).toBeUndefined();
    expect(closingFormatOf(f.options)).toBe("straight");
    expect(f.tandas.at(-1)!.cortina).toBeNull();
    const re = attachBooth(f);
    expect(re.booth!.items.map((x) => `${x.kind}:${x.id}`)).toEqual(
      f.booth!.items.map((x) => `${x.kind}:${x.id}`),
    );
    expect(re.booth!.markers.at(-1)!.label).toBe("La Cumparsita");
    expect(re.booth!.cumparsitaAtSec).toBeCloseTo(f.booth!.cumparsitaAtSec!, 0);
  });
  it("after the last tanda's cortina: the última has a cortina, then La Cumparsita", () => {
    const q = night("after-cortina");
    expect(q.tandas.at(-1)!.cortina).toBeTruthy();
    expect(q.closing).toBeTruthy();
    const items = q.booth!.items;
    expect(items.at(-1)!.kind).toBe("closing");
    expect(items.at(-2)!.kind).toBe("cortina");
    expect(q.booth!.cumparsitaAtSec).toBe(items.at(-1)!.startSec);
    expect(q.booth!.closingFormat).toBe("after-cortina");
  }, 120000);
  it("straight after the last tanda: no cortina between", () => {
    const q = night("straight");
    expect(q.tandas.at(-1)!.cortina).toBeNull();
    expect(q.booth!.items.at(-2)!.kind).toBe("track");
    expect(q.booth!.items.at(-1)!.kind).toBe("closing");
  }, 120000);
  it("4 + 1: La Cumparsita is the última's fifth side — no cortina, a four-side tango última, its orchestra preferred", () => {
    const q = night("in-tanda");
    const last = q.tandas.at(-1)!;
    expect(last.cortina).toBeNull();
    expect(last.rhythm).toBe("tango");
    expect(last.songs.length).toBe(4);
    expect(q.closing && isCumparsita(q.closing)).toBe(true);
    const own = deps.catalog.songs.some(
      (s) => isCumparsita(s) && s.orchestraId === last.orchestraId && s.rhythm === "tango" && !!s.year,
    );
    if (own) expect(q.closing!.orchestraId).toBe(last.orchestraId);
    expect(q.options.rules?.cumparsitaHarmony).toBe(true);
    expect(closingLabel(q)).toMatch(/side 5 of tanda/);
    expect(q.booth!.markers.at(-1)!.label).toMatch(/side 5/);
  }, 120000);
  it("its own tanda of one: a cortina, then La Cumparsita as a tanda", () => {
    const q = night("own-tanda");
    expect(q.tandas.at(-1)!.cortina).toBeTruthy();
    expect(q.booth!.items.at(-2)!.kind).toBe("cortina");
    expect(q.booth!.markers.at(-1)!.label).toBe(`Tanda ${q.tandas.length + 1} · La Cumparsita`);
  }, 120000);
  it("none: no closing, no time to La Cumparsita; the opening stays its own setting", () => {
    const q = night("none");
    expect(q.closing).toBeNull();
    expect(q.booth!.cumparsitaAtSec).toBeUndefined();
    expect(q.opening && isCumparsita(q.opening)).toBe(true);
    const off = compose(
      { hours: 2, seed: 41, rules: { closingFormat: "straight", cumparsita: "close" } },
      deps,
    );
    expect(off.opening ?? null).toBeNull();
    expect(off.closing).toBeTruthy();
  }, 120000);
  it("cortinaBeforeClosing", () => {
    expect(cortinaBeforeClosing("after-cortina")).toBe(true);
    expect(cortinaBeforeClosing("own-tanda")).toBe(true);
    expect(cortinaBeforeClosing("straight")).toBe(false);
    expect(cortinaBeforeClosing("in-tanda")).toBe(false);
  });
});

describe("insert and remove", () => {
  const tangoAt = () =>
    p.tandas.findIndex((t, i) => i > 0 && i < p.tandas.length - 1 && t.rhythm === "tango");
  it("a side in at a place: the tanda one longer, re-timed, the night re-scored", () => {
    const ti = tangoAt();
    const opt = insertSongOptions(p, ti, 2, deps).suggestions[0]!;
    expect(opt.ok).toBe(true);
    expect(opt.song.orchestraId).toBe(p.tandas[ti]!.orchestraId);
    expect(opt.why).toMatch(/energy/);
    const r = insertSong(p, ti, 2, opt.song.id, deps);
    expect(r.reason).toBeUndefined();
    const t = r.playlist.tandas[ti]!;
    expect(t.songs.length).toBe(p.tandas[ti]!.songs.length + 1);
    expect(t.songs[2]!.id).toBe(opt.song.id);
    expect(t.durationSec).toBeGreaterThan(p.tandas[ti]!.durationSec);
    expect(r.playlist.stats.durationSec).toBeGreaterThan(p.stats.durationSec);
    expect(r.playlist.score.total).toBeTypeOf("number");
    // the same side twice, La Cumparsita: refused, the night as it was
    expect(insertSong(r.playlist, ti, 0, opt.song.id, deps).reason).toMatch(/already/);
    const cump = deps.catalog.songs.find((s) => isCumparsita(s))!;
    expect(insertSong(p, ti, 0, cump.id, deps).reason).toMatch(/Cumparsita/);
  });
  it("a side out; the last side of a tanda takes the tanda with it", () => {
    const ti = tangoAt();
    const r = removeSong(p, ti, 0, deps);
    expect(r.playlist.tandas[ti]!.songs.length).toBe(p.tandas[ti]!.songs.length - 1);
    let q = p;
    for (let k = p.tandas[ti]!.songs.length; k > 0; k--) q = removeSong(q, ti, 0, deps).playlist;
    expect(q.tandas.length).toBe(p.tandas.length - 1);
  });
  it("a tanda out of the middle: renumbered, the gap keeps one cortina, never two alike in a row", () => {
    const ti = tangoAt();
    const r = removeTanda(p, ti, deps);
    expect(r.playlist.tandas.length).toBe(p.tandas.length - 1);
    r.playlist.tandas.forEach((t, k) => expect(t.index).toBe(k));
    gapsHaveCortinas(r.playlist);
    noTwinCortinas(r.playlist.tandas);
    expect(r.playlist.tandas.at(-1)!.cortina).toBeNull();
  });
  it("the última out: the new última follows the closing format (straight: no cortina; after-cortina: one)", () => {
    const r = removeTanda(p, p.tandas.length - 1, deps);
    expect(r.playlist.tandas.at(-1)!.cortina).toBeNull();
    const ac = night("after-cortina");
    const r2 = removeTanda(ac, ac.tandas.length - 1, deps);
    expect(r2.playlist.tandas.at(-1)!.cortina).toBeTruthy();
    expect(r2.playlist.tandas.at(-1)!.cortina!.id).toBe(ac.tandas.at(-1)!.cortina!.id);
  }, 120000);
  it("a tanda in before / after another: the engine's suggestions for the spot, each with a why", () => {
    const at = Math.floor(p.tandas.length / 2);
    const opts = insertTandaOptions(p, at, deps, { n: 3 });
    expect(opts.length).toBeGreaterThan(0);
    for (const o of opts) {
      expect(o.playlist.tandas.length).toBe(p.tandas.length + 1);
      expect(o.playlist.tandas[at]!.orchestraId).toBe(o.tanda.orchestraId);
      expect(o.why).toMatch(/energy \d+ \(the arc wants \d+ here\)/);
      gapsHaveCortinas(o.playlist);
      noTwinCortinas(o.playlist.tandas);
      // the tandas around it as they were
      expect(o.playlist.tandas[at - 1]!.songs.map((s) => s.id)).toEqual(
        p.tandas[at - 1]!.songs.map((s) => s.id),
      );
      expect(o.playlist.tandas[at + 1]!.songs.map((s) => s.id)).toEqual(p.tandas[at]!.songs.map((s) => s.id));
    }
    // a succession score, when given, ranks too
    const ranked = insertTandaOptions(p, at, deps, { n: 3, succession: () => 0.5 });
    expect(ranked[0]!.why).toMatch(/follows 50%/);
  }, 120000);
  it("the DJ's own sides as a tanda after the última: it takes the closing's place, the old última a gap cortina", () => {
    const ac = night("after-cortina");
    const n = ac.tandas.length;
    const used = new Set(ac.tandas.flatMap((t) => t.songs.map((s) => s.id)));
    const fam = deps.catalog.songs
      .filter(
        (s) =>
          s.orchestraId === "carlos-di-sarli" &&
          s.rhythm === "tango" &&
          !!s.year &&
          !used.has(s.id) &&
          !isCumparsita(s),
      )
      .filter((s, i, a) => a.findIndex((x) => x.title === s.title) === i)
      .slice(0, 3);
    const r = insertTanda(ac, n, { sides: fam.map((s) => s.id) }, deps);
    expect(r.reason).toBeUndefined();
    expect(r.playlist.tandas.length).toBe(n + 1);
    expect(r.playlist.tandas.at(-1)!.orchestraId).toBe("carlos-di-sarli");
    expect(r.playlist.tandas.at(-1)!.pinned?.by).toBe("dj");
    expect(r.playlist.tandas.at(-1)!.cortina!.id).toBe(ac.tandas.at(-1)!.cortina!.id);
    gapsHaveCortinas(r.playlist);
    noTwinCortinas(r.playlist.tandas);
  }, 120000);
});

describe("the rhythm cycle", () => {
  it("TTVTTM plays two tangos in a row; two non-tango tandas side by side is a fault", () => {
    expect(maxTangoRun(p.options)).toBe(2);
    const ts = (s: string) =>
      [...s].map((c) => ({ rhythm: c === "T" ? "tango" : c === "V" ? "vals" : "milonga" }) as Tanda);
    expect(rhythmCycleFaults(ts("TTVTTM"), p.options)).toEqual([]);
    expect(rhythmCycleFaults(ts("TTVVTT"), p.options)[0]).toMatchObject({ kind: "adjacent", at: 2, to: 3 });
    expect(rhythmCycleFaults(ts("TTTTVT"), p.options)[0]).toMatchObject({ kind: "tangoRun", at: 0, to: 3 });
  });
});

describe("the guide", () => {
  it("a removed tanda: the night shorter, a cortina removed with it", () => {
    const ti = p.tandas.findIndex((_t, i) => i > 0 && i < p.tandas.length - 1);
    const r = removeTanda(p, ti, deps);
    const g = editGuide(p, r.playlist, deps);
    expect(g.find((x) => x.key === "length")?.message.key).toBe("guide.shorter");
    expect(g.some((x) => x.message.key === "guide.cortina_removed")).toBe(true);
  });
  it("a vals tanda next to a vals: the cycle is broken, with a move that mends it", () => {
    const vi = p.tandas.findIndex((t, i) => i > 0 && t.rhythm === "vals");
    const v = p.tandas[vi]!;
    const dup: Tanda = {
      ...v,
      songs: v.songs.map((s) => ({ ...s, id: `${s.id}-x`, title: `${s.title} x` })),
    };
    const r = insertTanda(p, vi + 1, { tanda: dup }, deps);
    const g = editGuide(p, r.playlist, deps);
    const c = g.find((x) => x.key === "cycle");
    expect(c?.message.key).toBe("guide.cycle_adjacent");
    expect(c?.text).toMatch(/back to back/);
    if (c?.fix) {
      const fixed = applyGuideFix(r.playlist, c.fix.fix, deps);
      expect(rhythmCycleFaults(fixed.playlist.tandas, p.options).length).toBeLessThan(
        rhythmCycleFaults(r.playlist.tandas, p.options).length,
      );
    }
  });
  it("tanda 1 changed: the opening La Cumparsita is checked and the matching version suggested", () => {
    const q = night();
    // a tanda by another orchestra before the first
    const opts = insertTandaOptions(q, 0, deps, { n: 4 });
    const o = opts.find((x) => x.tanda.orchestraId !== q.opening?.orchestraId) ?? opts[0]!;
    const g = editGuide(q, o.playlist, deps);
    const line = g.find((x) => x.key === "opening");
    if (line) {
      expect(line.text).toMatch(/^Tanda 1 is now .*: switch the opening La Cumparsita to/);
      expect(line.fix?.fix.kind).toBe("opening");
      const fixed = applyGuideFix(o.playlist, line.fix!.fix, deps).playlist;
      expect(fixed.opening!.id).toBe((line.fix!.fix as { songId: string }).songId);
      expect(isCumparsita(fixed.opening)).toBe(true);
    } else expect(q.opening!.orchestraId).toBe(o.playlist.tandas[0]!.orchestraId);
  }, 120000);
  it("the última changed under 4 + 1: the closing version by its orchestra is suggested", () => {
    const q = night("in-tanda");
    const n = q.tandas.length;
    const opts = insertTandaOptions(q, n, deps, { n: 4, rhythm: "tango" });
    const o = opts.find((x) => x.tanda.orchestraId !== q.closing?.orchestraId);
    if (!o) return;
    const g = editGuide(q, o.playlist, deps);
    const own = deps.catalog.songs.some(
      (s) => isCumparsita(s) && s.orchestraId === o.tanda.orchestraId && s.rhythm === "tango" && !!s.year,
    );
    if (own) expect(g.find((x) => x.key === "closing")?.fix?.fix.kind).toBe("closing");
    // a cortina never appears before a 4 + 1 closing
    expect(o.playlist.tandas.at(-1)!.cortina).toBeNull();
  }, 120000);
});
