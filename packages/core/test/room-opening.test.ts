/**
 * 2026-11 final QA (rooms): a room started empty gets its opening La Cumparsita from tanda 1 ("İlk tandadan önce; kaydı
 * varsa o tandanın orkestrasından ve yıllarından"), and it keeps that promise as the night changes. Written before
 * the code: after any edit that changes tanda 1 (an insert before it, its removal, a move), the room's mend leaves the
 * opening by tanda 1's orchestra near its years (±OPENING_YEAR_WINDOW), or another version with an "opening: …"
 * reason in stats.settingFallbacks — never the opening of the tanda that used to be first.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  emptyNight,
  insertTanda,
  mendNightCortinas,
  moveTanda,
  OPENING_YEAR_WINDOW,
  openingCumparsita,
  type Playlist,
  removeTanda,
} from "../src/index";
import { loadCatalog } from "../src/load";

let deps: ReturnType<typeof loadCatalog>;
beforeAll(() => {
  deps = loadCatalog();
}, 600000);

const yearDist = (y: number, yr: [number, number]) => Math.max(0, yr[0] - y, y - yr[1]);

/** four sides of one orchestra (tangos, not La Cumparsita, distinct titles) near `year` */
function sides(orchestraId: string, year: number): string[] {
  const xs = deps.catalog.songs
    .filter(
      (s) =>
        s.orchestraId === orchestraId &&
        s.rhythm === "tango" &&
        !!s.year &&
        Math.abs(s.year - year) <= 1 &&
        !/cumparsita/i.test(s.title),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of xs) {
    const k = s.title.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s.id);
    if (out.length === 4) break;
  }
  expect(out.length, `${orchestraId} ${year}`).toBe(4);
  return out;
}

const mend = (p: Playlist) => mendNightCortinas(p, deps, { cumparsitas: true });

/** the promise: tanda 1's orchestra near its years, or a stated fallback */
function followsFirst(p: Playlist) {
  const first = p.tandas[0]!;
  const op = p.opening;
  expect(op, "the opening La Cumparsita").toBeTruthy();
  const want = openingCumparsita(deps.catalog, p.options, first, p.closing).song;
  expect(op!.id, `the opening for tanda 1 (${first.orchestra})`).toBe(want?.id);
  const yr = first.yearRange ?? [op!.year!, op!.year!];
  const own = op!.orchestraId === first.orchestraId && yearDist(op!.year!, yr) <= OPENING_YEAR_WINDOW;
  const said = (p.stats.settingFallbacks ?? []).filter((x) => x.startsWith("opening:"));
  // every opening note is about the tanda 1 there is now
  for (const x of said) expect(x).toContain(first.orchestra);
  if (!own) expect(said.length, `a stated reason for ${op!.orchestra} ${op!.year}`).toBe(1);
}

describe("a room started empty: the opening La Cumparsita follows tanda 1", () => {
  it("Tanturi first, then a D'Agostino tanda becomes tanda 1: the opening is re-picked", () => {
    let p = emptyNight({ hours: 3 });
    p = mend(insertTanda(p, 0, { sides: sides("ricardo-tanturi", 1941) }, deps).playlist);
    expect(p.opening?.orchestraId).toBe("ricardo-tanturi");
    followsFirst(p);
    p = mend(insertTanda(p, 0, { sides: sides("angel-d-agostino", 1941) }, deps).playlist);
    expect(p.tandas[0]!.orchestraId).toBe("angel-d-agostino");
    expect(p.opening?.orchestraId).not.toBe("ricardo-tanturi");
    followsFirst(p);
    // tanda 1 removed: Tanturi is first again, and so is its opening
    const r = mend(removeTanda(p, 0, deps).playlist);
    expect(r.tandas[0]!.orchestraId).toBe("ricardo-tanturi");
    expect(r.opening?.orchestraId).toBe("ricardo-tanturi");
    followsFirst(r);
    // a move that changes tanda 1
    // (a tanda of the DJ's own sides is locked: unlocked to move it)
    const free = { ...p, tandas: p.tandas.map((t) => ({ ...t, locked: false })) };
    const mv = moveTanda(free, 1, 0, deps);
    expect(mv.reason).toBeUndefined();
    const m = mend(mv.playlist);
    expect(m.tandas[0]!.orchestraId).toBe("ricardo-tanturi");
    followsFirst(m);
  });

  it("an orchestra without a version near its years: another version opens, with the reason stated", () => {
    let p = emptyNight({ hours: 3 });
    p = mend(insertTanda(p, 0, { sides: sides("ricardo-tanturi", 1941) }, deps).playlist);
    // Caló's own versions are from the 1960s: a 1942 Caló tanda 1 falls back
    p = mend(insertTanda(p, 0, { sides: sides("miguel-calo", 1942) }, deps).playlist);
    expect(p.tandas[0]!.orchestraId).toBe("miguel-calo");
    followsFirst(p);
    expect((p.stats.settingFallbacks ?? []).some((x) => /^opening: .*Caló/.test(x))).toBe(true);
    // Tanturi first again: the note goes with the old tanda 1
    const r = mend(removeTanda(p, 0, deps).playlist);
    followsFirst(r);
    expect((r.stats.settingFallbacks ?? []).some((x) => /Caló/.test(x))).toBe(false);
  });

  it("an edit that leaves tanda 1 alone keeps the opening; the mend is stable", () => {
    let p = emptyNight({ hours: 3 });
    p = mend(insertTanda(p, 0, { sides: sides("angel-d-agostino", 1941) }, deps).playlist);
    const op = p.opening?.id;
    followsFirst(p);
    p = mend(insertTanda(p, 1, { sides: sides("ricardo-tanturi", 1941) }, deps).playlist);
    expect(p.opening?.id).toBe(op);
    expect(mend(p)).toBe(p);
  });

  it("the opening setting off: no opening comes back", () => {
    let p = emptyNight({ hours: 3, rules: { cumparsita: "close" } });
    p = mend(insertTanda(p, 0, { sides: sides("ricardo-tanturi", 1941) }, deps).playlist);
    p = mend(insertTanda(p, 0, { sides: sides("angel-d-agostino", 1941) }, deps).playlist);
    expect(p.opening ?? null).toBeNull();
  });
});
