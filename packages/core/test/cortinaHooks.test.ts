/**
 * 2026-11 (the owner: "cortinas play 40 s from the start, so dancers don't recognise them"): every cortina starts at
 * its hook (data/cache/cortina_hooks.json, synced lyrics), compose writes it to `cortina.startSec` when Settings →
 * Cortinas → "Start cortinas at the chorus" is on (0 when off), the booth plan plays the night's cortina length from
 * there and never past the track's end, the DJ's own start wins, and the DJ-app exports put a cue at the hook.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  attachBooth,
  boothInputs,
  type CortinaHookFile,
  compose,
  cortinaDurationSec,
  cortinaStopFor,
  type Playlist,
  planBooth,
  toRekordboxXML,
  toTraktorNML,
  validCortinaStart,
  withCortinaStarts,
} from "../src/index";
import { findRoot, loadCatalog } from "../src/load";

const deps = loadCatalog();
const hooks = (
  JSON.parse(readFileSync(join(findRoot(), "data/cache/cortina_hooks.json"), "utf8")) as CortinaHookFile
).hooks;
let on: Playlist;
let off: Playlist;
beforeAll(() => {
  on = compose({ hours: 3, seed: 5, cortinaLengthSec: 45, cortinaCultures: ["turkish"] }, deps);
  off = compose(
    { hours: 3, seed: 5, cortinaLengthSec: 45, cortinaCultures: ["turkish"], cortinaHookStart: false },
    deps,
  );
});
afterEach(() => new Promise((r) => setTimeout(r, 0)));

describe("the hook data", () => {
  it("covers every cue of the pool (136), each with a source and a confidence", () => {
    expect(deps.cortinas.length).toBe(136);
    for (const c of deps.cortinas) {
      const h = hooks[c.id];
      expect(h, c.id).toBeDefined();
      expect(["lyrics", "audio", "manual", "none"]).toContain(h!.source);
      expect(h!.confidence).toBeGreaterThanOrEqual(0);
      expect(h!.confidence).toBeLessThanOrEqual(1);
      if (h!.source === "lyrics") expect(h!.line, c.id).toBeTruthy();
    }
    // most cues are sung: the lyrics place most of them
    expect(Object.values(hooks).filter((h) => h.source === "lyrics").length).toBeGreaterThan(60);
  });
  it("the loaded pool carries each hook, its start validated against the cue's length and recording", () => {
    for (const c of deps.cortinas) {
      expect(c.hook?.source).toBe(hooks[c.id]!.source);
      const len = c.lengthSec ?? 45;
      const dur = cortinaDurationSec(c);
      if (hooks[c.id]!.source === "none") continue;
      expect(c.startSec, c.id).toBe(validCortinaStart(hooks[c.id]!.startSec, len, dur));
      if (dur) expect(c.startSec! + len).toBeLessThanOrEqual(dur + 1e-6);
    }
  });
});

describe("compose", () => {
  it("on (the default): each cortina with hook data starts at its validated hook", () => {
    const cs = on.tandas.map((t) => t.cortina).filter((c) => !!c);
    expect(cs.length).toBeGreaterThan(5);
    let hooked = 0;
    for (const c of cs) {
      const h = hooks[c.id];
      const len = c.lengthSec ?? 45;
      if (h && h.source !== "none") {
        expect(c.startSec, c.id).toBe(validCortinaStart(h.startSec, len, cortinaDurationSec(c)));
        if (c.startSec! > 0) hooked++;
      }
      const dur = cortinaDurationSec(c);
      if (dur) expect((c.startSec ?? 0) + len).toBeLessThanOrEqual(dur + 1e-6);
    }
    expect(hooked).toBeGreaterThan(3);
  });
  it("off: every cortina starts at 0 (the same night otherwise)", () => {
    for (const t of off.tandas) if (t.cortina) expect(t.cortina.startSec ?? 0).toBe(0);
    expect(off.tandas.map((t) => t.cortina?.id)).toEqual(on.tandas.map((t) => t.cortina?.id));
  });
  it("withCortinaStarts pulls a start back so start + length ≤ the recording", () => {
    const c = { ...on.tandas.find((t) => t.cortina?.spotify?.durationMs)!.cortina! };
    const dur = cortinaDurationSec(c)!;
    const late = { ...c, hook: { startSec: dur - 5, source: "lyrics" as const, confidence: 0.8 } };
    const q = withCortinaStarts({ tandas: [{ cortina: late }] }, true);
    expect(q.tandas[0]!.cortina!.startSec).toBe(validCortinaStart(dur - 5, c.lengthSec ?? 45, dur));
    expect(q.tandas[0]!.cortina!.startSec! + (c.lengthSec ?? 45)).toBeLessThanOrEqual(dur + 1e-6);
  });
});

describe("the booth plan", () => {
  it("a cortina plays the night's length from its start: trimIn = startSec, stop = start + length ≤ the track", () => {
    const plan = planBooth(on);
    for (const it of plan.items.filter((i) => i.kind === "cortina")) {
      const c = on.tandas[it.tanda - 1]!.cortina!;
      const len = cortinaStopFor({}, c.lengthSec);
      expect(it.trimInSec).toBe(c.startSec ?? 0);
      expect(it.lengthSec).toBe(len);
      expect(it.stopSec).toBe((c.startSec ?? 0) + len);
      const dur = cortinaDurationSec(c);
      if (dur) expect(it.stopSec!).toBeLessThanOrEqual(dur + 1e-6);
      // a start inside the song gets a short fade in (≤ 1 s), and a fade out before the stop
      if ((c.startSec ?? 0) > 0) {
        expect(it.fadeInSec!).toBeGreaterThan(0);
        expect(it.fadeInSec!).toBeLessThanOrEqual(1);
      }
      expect(it.fadeOutSec!).toBeGreaterThan(0);
    }
  });
  it("the DJ's own start (cortinaEdits[id].startSec) wins, is validated, and survives attachBooth", () => {
    const c = on.tandas.find((t) => t.cortina?.spotify?.durationMs)!.cortina!;
    const dur = cortinaDurationSec(c)!;
    const b = planBooth(on, { cortinaEdits: { [c.id]: { startSec: 12 } } });
    const it = b.items.find((i) => i.kind === "cortina" && i.id === c.id)!;
    expect(it.trimInSec).toBe(12);
    expect(it.stopSec).toBe(12 + cortinaStopFor({}, c.lengthSec));
    const late = planBooth(on, { cortinaEdits: { [c.id]: { startSec: dur + 30 } } });
    const it2 = late.items.find((i) => i.kind === "cortina" && i.id === c.id)!;
    expect(it2.stopSec!).toBeLessThanOrEqual(dur + 1e-6);
    const kept = attachBooth(on, { cortinaEdits: { [c.id]: { startSec: 12 } } });
    expect(kept.booth!.cortinaEdits![c.id]!.startSec).toBe(12);
    expect(
      planBooth(kept, { ...boothInputs(kept.booth), cortinaHookStart: false }).items.find(
        (i) => i.id === c.id,
      )!.trimInSec,
    ).toBe(12);
  });
  it("the setting off (cortinaHookStart: false): the booth plays every cortina from 0", () => {
    const b = planBooth(on, { cortinaHookStart: false });
    for (const it of b.items.filter((i) => i.kind === "cortina")) expect(it.trimInSec ?? 0).toBe(0);
  });
});

describe("exports with cue points", () => {
  it("Rekordbox and Traktor get a cue at the hook", () => {
    const q = attachBooth(on, {});
    const it = q.booth!.items.find((i) => i.kind === "cortina" && (i.trimInSec ?? 0) > 0)!;
    expect(it).toBeDefined();
    const rb = toRekordboxXML(q);
    expect(rb).toContain(`Name="Cortina in`);
    expect(rb).toContain(`Start="${it.trimInSec!.toFixed(3)}"`);
    const nml = toTraktorNML(q);
    expect(nml).toContain(`NAME="Cortina in"`);
    expect(nml).toContain(`START="${(it.trimInSec! * 1000).toFixed(3)}"`);
  });
});

describe("the featured night", () => {
  const f = JSON.parse(
    readFileSync(join(findRoot(), "apps/web/public/featured/golden-double-peak.json"), "utf8"),
  ) as Playlist;
  it("has a startSec for every cortina with hook data (its validated hook)", () => {
    const cs = f.tandas.map((t) => t.cortina).filter((c) => !!c);
    // 25 tandas, a cortina between each two (none before the closing tanda's Cumparsita)
    expect(cs.length).toBe(f.tandas.length - 1);
    for (const c of cs) {
      const h = hooks[c.id];
      expect(h, c.id).toBeDefined();
      if (h!.source === "none") continue;
      const pooled = deps.cortinas.find((x) => x.id === c.id)!;
      expect(c.startSec, c.id).toBe(
        validCortinaStart(
          h!.startSec,
          c.lengthSec ?? 45,
          cortinaDurationSec(pooled) ?? cortinaDurationSec(c),
        ),
      );
    }
    expect(cs.filter((c) => (c.startSec ?? 0) > 0).length).toBeGreaterThan(15);
  });
});
