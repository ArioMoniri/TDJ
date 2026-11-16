import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearEdits, nextRedo, nextUndo, recordEdit } from "./editHistory";
import { runHistory } from "./editToast";
import {
  type MotionSample,
  nativeShake,
  needsMotionPermission,
  ShakeDetector,
  shakeAlert,
  shakeOn,
  useShakePref,
} from "./shake";

/** samples at 60 Hz from `f(t)` (t in s) for `secs` */
const samples = (secs: number, f: (t: number) => [number, number, number], t0 = 0): MotionSample[] =>
  Array.from({ length: Math.round(secs * 60) }, (_, i) => {
    const t = i / 60;
    const [x, y, z] = f(t);
    return { x, y, z, t: t0 + t * 1000 };
  });
const fires = (d: ShakeDetector, xs: MotionSample[]) => xs.filter((s) => d.push(s)).map((s) => s.t);
/** a little hand tremor / sensor noise, repeatable */
const noise = (t: number, k: number) => 0.6 * Math.sin(t * 37.3 + k) * Math.cos(t * 11.1 + 2 * k);

describe("shake detector: a real shake fires once, walking and bumps never", () => {
  it("a shake (±20 m/s² at 5 Hz, side to side) fires once, early, then rests", () => {
    const d = new ShakeDetector();
    const at = fires(
      d,
      samples(1.2, (t) => [20 * Math.sin(2 * Math.PI * 5 * t) + noise(t, 1), noise(t, 2), noise(t, 3)]),
    );
    expect(at).toHaveLength(1);
    expect(at[0]!).toBeLessThan(500);
  });

  it("shaking on and on fires at most once a second", () => {
    const d = new ShakeDetector();
    const at = fires(
      d,
      samples(3.5, (t) => [0, 18 * Math.sin(2 * Math.PI * 6 * t), 4 * Math.sin(2 * Math.PI * 3 * t)]),
    );
    expect(at.length).toBeGreaterThanOrEqual(2);
    expect(at.length).toBeLessThanOrEqual(4);
    for (let i = 1; i < at.length; i++) expect(at[i]! - at[i - 1]!).toBeGreaterThanOrEqual(1000);
  });

  it("walking (a phone in the hand or a pocket: ±4 m/s² at 2 Hz, sway) never fires", () => {
    const d = new ShakeDetector();
    const at = fires(
      d,
      samples(20, (t) => [
        1.5 * Math.sin(2 * Math.PI * 1 * t) + noise(t, 4),
        4 * Math.sin(2 * Math.PI * 2 * t) + noise(t, 5),
        2 * Math.cos(2 * Math.PI * 2 * t) + noise(t, 6),
      ]),
    );
    expect(at).toEqual([]);
  });

  it("brisk walking with heel strikes (sharp 14 m/s² jolts at 2 Hz, one way) never fires", () => {
    const d = new ShakeDetector();
    const at = fires(
      d,
      samples(15, (t) => {
        const phase = (t * 2) % 1;
        const jolt = phase < 0.05 ? 14 : phase < 0.12 ? -6 : 0;
        return [noise(t, 7), jolt + noise(t, 8), noise(t, 9)];
      }),
    );
    expect(at).toEqual([]);
  });

  it("a bump (a knock on the table: a spike, a rebound, a ringing that dies) never fires", () => {
    const d = new ShakeDetector();
    const at = fires(
      d,
      samples(1, (t) => {
        const ring = t < 0.02 ? 30 : 30 * Math.exp(-t * 25) * Math.cos(2 * Math.PI * 9 * t);
        return [noise(t, 1), noise(t, 2), ring];
      }),
    );
    expect(at).toEqual([]);
    // knocks every 0.7 s: never four pushes within half a second
    const d2 = new ShakeDetector();
    const knocks = samples(5, (t) => {
      const p = t % 0.7;
      return [0, 0, p < 0.02 ? 25 : p < 0.05 ? -15 : noise(t, 3)];
    });
    expect(fires(d2, knocks)).toEqual([]);
  });

  it("a phone set down hard (one big push, no back and forth) never fires", () => {
    const d = new ShakeDetector();
    expect(
      fires(
        d,
        samples(0.5, (t) => [0, 0, t < 0.1 ? -22 : 0]),
      ),
    ).toEqual([]);
  });

  it("devicemotion without linear acceleration: gravity is filtered out of acceleration including gravity", () => {
    const d = new ShakeDetector();
    let n = 0;
    // lying still: gravity alone never fires
    for (const s of samples(2, () => [0, 0, 9.81]))
      if (d.pushMotion({ acceleration: null, accelerationIncludingGravity: { x: 0, y: 0, z: 9.81 } }, s.t))
        n++;
    expect(n).toBe(0);
    for (const s of samples(1, (t) => [22 * Math.sin(2 * Math.PI * 5 * t), 0, 9.81], 2000))
      if (d.pushMotion({ acceleration: { x: null, y: null, z: null }, accelerationIncludingGravity: s }, s.t))
        n++;
    expect(n).toBe(1);
    // linear acceleration when the device gives it
    const d2 = new ShakeDetector();
    const hits = samples(1, (t) => [0, 20 * Math.sin(2 * Math.PI * 5 * t), 0]).filter((s) =>
      d2.pushMotion({ acceleration: s, accelerationIncludingGravity: null }, s.t),
    );
    expect(hits).toHaveLength(1);
  });

  it("garbage samples are ignored; reset forgets a half shake", () => {
    const d = new ShakeDetector();
    expect(d.push({ x: Number.NaN, y: 0, z: 0, t: 0 })).toBe(false);
    expect(d.push({ x: 20, y: 0, z: 0, t: 10 })).toBe(false);
    expect(d.push({ x: -20, y: 0, z: 0, t: 100 })).toBe(false);
    expect(d.push({ x: 20, y: 0, z: 0, t: 200 })).toBe(false);
    d.reset();
    expect(d.push({ x: -20, y: 0, z: 0, t: 300 })).toBe(false);
    expect(d.push({ x: 20, y: 0, z: 0, t: 400 })).toBe(false);
    expect(d.push({ x: -20, y: 0, z: 0, t: 450 })).toBe(false);
    expect(d.push({ x: 20, y: 0, z: 0, t: 500 })).toBe(true);
  });
});

describe("shake alert: it always asks, and offers the redo after an undo", () => {
  it("what it offers", () => {
    expect(shakeAlert({ undo: null, redo: null, lastWasUndo: false })).toBeNull();
    expect(shakeAlert({ undo: "Swap", redo: null, lastWasUndo: false })).toEqual({
      main: { kind: "undo", label: "Swap" },
    });
    // a redo waiting, but the last thing done was an edit: the undo
    expect(shakeAlert({ undo: "Swap", redo: "Lock", lastWasUndo: false })).toEqual({
      main: { kind: "undo", label: "Swap" },
    });
    expect(shakeAlert({ undo: "Swap", redo: "Lock", lastWasUndo: true })).toEqual({
      main: { kind: "redo", label: "Lock" },
      other: { kind: "undo", label: "Swap" },
    });
    expect(shakeAlert({ undo: null, redo: "Lock", lastWasUndo: true })).toEqual({
      main: { kind: "redo", label: "Lock" },
    });
    // only a redo, and the last thing was not an undo (another page's): nothing
    expect(shakeAlert({ undo: null, redo: "Lock", lastWasUndo: false })).toBeNull();
  });

  describe("the flow over the one edit history", () => {
    let now = 1_000_000;
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(now);
      clearEdits();
    });
    afterEach(() => {
      vi.useRealTimers();
    });
    const step = () => {
      now += 1000;
      vi.setSystemTime(now);
    };

    it("shake → Undo “Tanda 2 was locked”? → Undo runs it; shake again → Redo; Cancel changes nothing", async () => {
      const night: string[] = [];
      const edit = (label: string) => {
        night.push(label);
        recordEdit({
          label,
          scope: "/",
          undo: () => void night.splice(night.lastIndexOf(label), 1),
          redo: () => void night.push(label),
        });
      };
      edit("Tanda 1 was locked");
      step();
      edit("Tanda 2 was locked");
      const ask = (lastWasUndo: boolean) =>
        shakeAlert({
          undo: nextUndo("/")?.label ?? null,
          redo: nextRedo("/")?.label ?? null,
          lastWasUndo,
        });
      // the first shake asks; nothing changed yet (never an undo without the alert)
      const a = ask(false);
      expect(a).toEqual({ main: { kind: "undo", label: "Tanda 2 was locked" } });
      expect(night).toEqual(["Tanda 1 was locked", "Tanda 2 was locked"]);
      // Cancel: nothing
      expect(night).toHaveLength(2);
      // Undo
      step();
      const done = await runHistory(a!.main.kind, { scope: "/" });
      expect(done?.label).toBe("Tanda 2 was locked");
      expect(night).toEqual(["Tanda 1 was locked"]);
      // the next shake offers the redo first, and the undo before it
      const b = ask(true);
      expect(b).toEqual({
        main: { kind: "redo", label: "Tanda 2 was locked" },
        other: { kind: "undo", label: "Tanda 1 was locked" },
      });
      step();
      await runHistory(b!.main.kind, { scope: "/" });
      expect(night).toEqual(["Tanda 1 was locked", "Tanda 2 was locked"]);
    });

    it("the Booth's rule holds: what the room already heard is not undone, it says why", async () => {
      let undone = false;
      recordEdit({
        label: "Next now",
        scope: "/booth",
        undo: () => {
          undone = true;
        },
        redo: () => {},
        blocked: () => "Can't undo Next now: it already played in the room.",
      });
      const a = shakeAlert({ undo: nextUndo("/booth")?.label ?? null, redo: null, lastWasUndo: false });
      expect(a?.main).toEqual({ kind: "undo", label: "Next now" });
      step();
      const r = await runHistory("undo", { scope: "/booth" });
      expect(r?.why).toMatch(/already played/);
      expect(undone).toBe(false);
    });
  });
});

describe("the iPhone / iPad app: UIKit's shake, no motion permission", () => {
  const iphone =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 27_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
  const ipad = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)";
  const env = (o: { app: boolean; ua: string; touch: number }) => {
    const motion = Object.assign(function DeviceMotionEvent() {}, {
      requestPermission: async () => "granted",
    });
    vi.stubGlobal("window", {
      DeviceMotionEvent: motion,
      matchMedia: () => ({ matches: o.touch > 0 }),
      ...(o.app ? { __TAURI_INTERNALS__: {} } : {}),
    });
    vi.stubGlobal("navigator", { userAgent: o.ua, maxTouchPoints: o.touch });
  };
  afterEach(() => {
    vi.unstubAllGlobals();
    useShakePref.setState({ pref: null, granted: false });
  });
  it("in the app on an iPhone or an iPad it listens without asking for motion; the DJ's off still wins", () => {
    for (const ua of [iphone, ipad]) {
      env({ app: true, ua, touch: 5 });
      expect(nativeShake()).toBe(true);
      expect(needsMotionPermission()).toBe(false);
      expect(shakeOn({ pref: null, granted: false })).toBe(true);
      expect(shakeOn({ pref: false, granted: false })).toBe(false);
    }
  });
  it("Safari on an iPhone still needs the grant; the Mac app is no shake device", () => {
    env({ app: false, ua: iphone, touch: 5 });
    expect(nativeShake()).toBe(false);
    expect(needsMotionPermission()).toBe(true);
    expect(shakeOn({ pref: null, granted: false })).toBe(false);
    expect(shakeOn({ pref: null, granted: true })).toBe(true);
    env({ app: true, ua: ipad, touch: 0 });
    expect(nativeShake()).toBe(false);
  });
});
