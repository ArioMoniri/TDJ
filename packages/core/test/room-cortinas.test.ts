/**
 * 2026-11 (the owner: rooms — "Empty night, build it together"; cortinas generated automatically whenever tandas are
 * added, inserted, removed, reordered or built in a room, exactly like Compose; a room "Night settings" sheet that
 * re-mends the cortinas). Written before the code:
 *  - an empty night is a night (no tandas, the night's options) that survives the room's export / import;
 *  - after any edit, `mendNightCortinas` leaves every gap with one cortina (none with the "none" style), never the same
 *    cortina twice in a row, the última's cortina by the closing format, and a cortina the DJ picked where it was;
 *  - the night settings: the cortina culture re-picks the automatic cortinas from that culture and keeps the picked
 *    ones; the cortina length is every cortina's length; the closing format and the opening La Cumparsita follow;
 *    "Auto" forgets the picks.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyNightSettings,
  candidatesFor,
  closingFormatOf,
  compose,
  cortinaBeforeClosing,
  cortinaPool,
  emptyNight,
  exportNight,
  importNight,
  insertTanda,
  insertTandaOptions,
  mendNightCortinas,
  nightOptions,
  type Playlist,
  pickNightCortina,
  removeTanda,
  renight,
  type Tanda,
} from "../src/index";
import { loadCatalog } from "../src/load";

let deps: ReturnType<typeof loadCatalog>;
let night: Playlist;
beforeAll(() => {
  deps = loadCatalog();
  night = compose({ hours: 2, seed: 11 }, deps);
}, 600000);

const gapsOk = (p: Playlist) => {
  const ts = p.tandas;
  for (let i = 0; i < ts.length - 1; i++) expect(ts[i]!.cortina, `gap after tanda ${i + 1}`).toBeTruthy();
  for (let i = 1; i < ts.length; i++) {
    const a = ts[i - 1]!.cortina;
    const b = ts[i]!.cortina;
    if (a && b) expect(a.id, `cortinas ${i} and ${i + 1}`).not.toBe(b.id);
  }
  const last = ts.at(-1);
  if (last) {
    const want = cortinaBeforeClosing(closingFormatOf(p.options)) && !!p.closing;
    expect(!!last.cortina, "the última's cortina by the closing format").toBe(want);
  }
};
const sidesOf = (p: Playlist, i: number) => p.tandas[i]!.songs.map((s) => s.id);

describe("an empty room night", () => {
  it("has no tandas, keeps its options and survives the room's export / import", () => {
    const e = emptyNight({ hours: 3, cortinaCultures: ["turkish"] }, { name: "Saturday together" });
    expect(e.tandas).toEqual([]);
    expect(e.name).toBe("Saturday together");
    expect(e.options.hours).toBe(3);
    expect(e.options.cortinaCultures).toEqual(["turkish"]);
    const back = importNight(JSON.parse(JSON.stringify(exportNight(e, { exact: true }))), deps).playlist;
    expect(back.tandas).toEqual([]);
    expect(back.options.cortinaCultures).toEqual(["turkish"]);
  });

  it("two tandas added to an empty night: a cortina between them, mended like Compose", () => {
    let p = emptyNight({ hours: 3 });
    p = insertTanda(p, 0, { sides: sidesOf(night, 0) }, deps).playlist;
    expect(p.tandas).toHaveLength(1);
    p = mendNightCortinas(p, deps, { cumparsitas: true });
    p = insertTanda(p, 1, { sides: sidesOf(night, 1) }, deps).playlist;
    p = mendNightCortinas(p, deps, { cumparsitas: true });
    expect(p.tandas).toHaveLength(2);
    expect(p.tandas[0]!.cortina).toBeTruthy();
    // the closing format: a closing La Cumparsita is chosen once the night has tandas, the última's cortina by it
    if (closingFormatOf(p.options) !== "none") expect(p.closing).toBeTruthy();
    gapsOk(p);
  });
});

describe("Add a tanda to an empty night", () => {
  it("offers whole tandas for the first chair, and the second chair's insert mends the gap", () => {
    let p = emptyNight({ hours: 3 });
    const first = insertTandaOptions(p, 0, deps, { n: 3, seed: 5 });
    expect(first.length).toBeGreaterThan(0);
    p = first[0]!.playlist;
    expect(p.tandas).toHaveLength(1);
    const second = insertTandaOptions(p, 1, deps, { n: 3, seed: 6 });
    expect(second.length).toBeGreaterThan(0);
    p = mendNightCortinas(second[0]!.playlist, deps, { cumparsitas: true });
    expect(p.tandas).toHaveLength(2);
    expect(p.tandas[0]!.cortina).toBeTruthy();
    gapsOk(p);
  });
});

describe("mendNightCortinas", () => {
  it("fills every empty gap after a reorder that left holes, never twins, and changes nothing when all is right", () => {
    const holes = renight(
      night,
      night.tandas.map((t, i) => (i % 2 ? { ...t, cortina: null } : t)) as Tanda[],
    );
    const m = mendNightCortinas(holes, deps);
    gapsOk(m);
    // the cortinas that were there stay
    for (let i = 0; i < night.tandas.length - 1; i += 2)
      expect(m.tandas[i]!.cortina?.id).toBe(night.tandas[i]!.cortina?.id);
    expect(mendNightCortinas(m, deps)).toBe(m);
  });

  it("a twin (the same cortina in two gaps in a row) is re-picked, unless the DJ picked it", () => {
    const c = night.tandas[0]!.cortina!;
    const twins = renight(
      night,
      night.tandas.map((t, i) => (i === 1 ? { ...t, cortina: { ...c } } : t)),
    );
    gapsOk(mendNightCortinas(twins, deps));
    const picked = pickNightCortina(twins, 1, c);
    expect(picked.tandas[1]!.cortina?.picked).toBe(true);
    expect(mendNightCortinas(picked, deps).tandas[1]!.cortina?.id).toBe(c.id);
  });

  it("the 'none' style plays no cortina", () => {
    const p = mendNightCortinas({ ...night, options: { ...night.options, cortinaStyle: "none" } }, deps, {
      refresh: true,
    });
    expect(p.tandas.every((t) => !t.cortina)).toBe(true);
  });

  it("after removing a tanda the night is still mended", () => {
    const r = removeTanda(night, 2, deps).playlist;
    gapsOk(mendNightCortinas(r, deps));
  });
});

describe("the room's night settings", () => {
  it("a cortina culture re-picks the automatic cortinas from that culture and keeps the DJ's picks", () => {
    const pickedC = deps.cortinas.find((c) => c.culture !== "turkish")!;
    const base = pickNightCortina(night, 0, pickedC);
    const p = applyNightSettings(base, { cortinaCultures: ["turkish"] }, deps);
    expect(p.options.cortinaCultures).toEqual(["turkish"]);
    expect(p.tandas[0]!.cortina?.id).toBe(pickedC.id);
    const auto = p.tandas.slice(1, -1).map((t) => t.cortina!);
    expect(auto.length).toBeGreaterThan(0);
    // Compose's own candidates for the culture (a culture with too few cues falls back as Compose does)
    const cands = new Set(
      candidatesFor(cortinaPool(deps.cortinas), nightOptions(p.options)).map((c) => c.id),
    );
    for (const c of auto) expect(cands.has(c.id), c.title).toBe(true);
    expect(auto.every((c) => c.culture === "turkish")).toBe(true);
    gapsOk(p);
  });

  it("the cortina length is every cortina's length (and the booth's)", () => {
    const p = applyNightSettings(night, { cortinaLengthSec: 30 }, deps);
    expect(p.options.cortinaLengthSec).toBe(30);
    for (const t of p.tandas) if (t.cortina) expect(t.cortina.lengthSec).toBe(30);
    const q = applyNightSettings(night, { cortinaFadeOutSec: 5 }, deps);
    expect(q.booth?.settings.cortinaFadeOutSec).toBe(5);
  });

  it("the closing format and the opening La Cumparsita follow; Auto forgets the picks", () => {
    const none = applyNightSettings(night, { closingFormat: "none" }, deps);
    expect(none.closing).toBeNull();
    expect(none.tandas.at(-1)!.cortina).toBeNull();
    const after = applyNightSettings(none, { closingFormat: "after-cortina" }, deps);
    expect(after.closing).toBeTruthy();
    expect(after.tandas.at(-1)!.cortina).toBeTruthy();
    gapsOk(after);
    const open = applyNightSettings(night, { opening: true }, deps);
    expect(open.opening).toBeTruthy();
    expect(applyNightSettings(open, { opening: false }, deps).opening ?? null).toBeNull();
    const c = deps.cortinas[3]!;
    const picked = pickNightCortina(night, 1, c);
    const auto = applyNightSettings(picked, { cortinaChoice: "auto" }, deps);
    expect(auto.tandas.some((t) => t.cortina?.picked)).toBe(false);
    expect(auto.options.cortinaChoice).toBe("auto");
    const rules = applyNightSettings(night, { lastFourTango: true, pattern: "TVTM" }, deps);
    expect(rules.options.rules?.lastFourTango).toBe(true);
    expect(rules.options.pattern).toBe("TVTM");
  });

  it("a picked cortina survives the room's export / import", () => {
    const c = deps.cortinas[5]!;
    const picked = pickNightCortina(night, 1, c);
    const back = importNight(JSON.parse(JSON.stringify(exportNight(picked, { exact: true }))), deps).playlist;
    expect(back.tandas[1]!.cortina?.picked).toBe(true);
  });
});
