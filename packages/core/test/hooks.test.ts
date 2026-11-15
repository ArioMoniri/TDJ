/**
 * 2026-11 (the owner: "cortinas play 40 s from the start, so dancers don't recognise them: the first part is mostly
 * melody"). A cortina starts at its most recognisable part — the chorus, else the first vocal line after a long
 * intro — and the start + the play length never run past the track's end.
 */
import { describe, expect, it } from "vitest";
import {
  CORTINA_HOOK_LEAD_SEC,
  energyHook,
  parseSyncedLyrics,
  pickHook,
  validCortinaStart,
} from "../src/hooks";

const lrc = (rows: Array<[number, string]>) =>
  rows
    .map(([t, s]) => {
      const m = Math.floor(t / 60);
      const sec = (t - m * 60).toFixed(2).padStart(5, "0");
      return `[${String(m).padStart(2, "0")}:${sec}] ${s}`;
    })
    .join("\n");

describe("synced lyrics", () => {
  it("parses [mm:ss.xx] lines, keeps empty lines as breaks and sorts by time", () => {
    const rows = parseSyncedLyrics(
      "[00:12.50] Hello there\n[00:10.00] First\n[00:15.20]\n[01:02.25] Later line",
    );
    expect(rows.map((r) => r.t)).toEqual([10, 12.5, 15.2, 62.25]);
    expect(rows[2]!.text).toBe("");
    expect(rows[3]!.text).toBe("Later line");
  });

  it("chorus: the most-repeated block of ≥ 2 lines, at its first occurrence minus ~1 s", () => {
    const chorus = ["Dudu dudu dudu", "Kalbimi çaldın", "Gel bana gel"];
    const text = lrc([
      [18.4, "Verse one line one"],
      [22.1, "Verse one line two"],
      [26.0, "Verse one line three"],
      [41.3, chorus[0]!],
      [44.0, chorus[1]!],
      [47.2, chorus[2]!],
      [60.0, "Verse two line one"],
      [64.0, "Verse two line two"],
      [90.5, chorus[0]!],
      [93.1, chorus[1]!],
      [96.0, chorus[2]!],
      [150.2, chorus[0]!],
      [153.0, chorus[1]!],
      [156.0, chorus[2]!],
    ]);
    const h = pickHook(text, { durationSec: 230 })!;
    expect(h.kind).toBe("chorus");
    expect(h.startSec).toBeCloseTo(41.3 - CORTINA_HOOK_LEAD_SEC, 6);
    expect(h.line).toBe("Dudu dudu dudu");
    expect(h.repeats).toBe(3);
    expect(h.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("chorus matching ignores case, punctuation and accents; a single repeated line is not a chorus", () => {
    const text = lrc([
      [12, "Oh!"],
      [20, "A line"],
      [24, "Another line"],
      [30, "oh"],
      [33, "Ben sana vurgunum,"],
      [36, "Yandım ben"],
      [50, "Something else"],
      [70, "ben sana VURGUNUM"],
      [73, "yandim ben!"],
    ]);
    const h = pickHook(text)!;
    expect(h.kind).toBe("chorus");
    expect(h.startSec).toBeCloseTo(32, 6);
    expect(h.repeats).toBe(2);
  });

  it("no repetition: the first vocal line after an intro longer than 8 s", () => {
    const text = lrc([
      [24.6, "Once upon a time"],
      [30, "There was a song"],
      [36, "That never repeated"],
      [42, "A single line twice"],
    ]);
    const h = pickHook(text, { durationSec: 200 })!;
    expect(h.kind).toBe("first-vocal");
    expect(h.startSec).toBeCloseTo(23.6, 6);
    expect(h.line).toBe("Once upon a time");
    expect(h.confidence).toBeLessThan(0.8);
  });

  it("no repetition and a short intro (≤ 8 s): the song starts at once, so it plays from 0", () => {
    const text = lrc([
      [3.2, "Straight in"],
      [7, "Second line"],
      [11, "Third line"],
    ]);
    const h = pickHook(text)!;
    expect(h.kind).toBe("intro-short");
    expect(h.startSec).toBe(0);
  });

  it("a long intro before a chorus: the chorus wins over the first vocal", () => {
    const text = lrc([
      [52, "First words after a long intro"],
      [58, "More words"],
      [75, "Hey hey hey"],
      [78, "Come on now"],
      [120, "Hey hey hey"],
      [123, "Come on now"],
    ]);
    const h = pickHook(text, { durationSec: 240 })!;
    expect(h.kind).toBe("chorus");
    expect(h.startSec).toBeCloseTo(74, 6);
  });

  it("a chorus too late for the play length falls back to an earlier repeat or the first vocal", () => {
    // the chorus first comes at 3:10 of a 3:40 track: 45 s from there would run past the end
    const text = lrc([
      [20, "Verse a"],
      [25, "Verse b"],
      [190, "Late chorus x"],
      [193, "Late chorus y"],
      [205, "Late chorus x"],
      [208, "Late chorus y"],
    ]);
    const h = pickHook(text, { durationSec: 220, lengthSec: 45 })!;
    expect(h.startSec + 45).toBeLessThanOrEqual(220);
    expect(h.kind).toBe("first-vocal");
    expect(h.startSec).toBeCloseTo(19, 6);
  });

  it("no synced lyrics (instrumental, plain lyrics only): null", () => {
    expect(pickHook("")).toBeNull();
    expect(pickHook("Just plain lyrics\nwithout timestamps")).toBeNull();
  });
});

describe("validation: start + length ≤ the track's duration", () => {
  it("a start that fits is kept (rounded to 0.1 s)", () => {
    expect(validCortinaStart(41.27, 45, 230)).toBe(41.3);
  });
  it("a start too late is pulled back so the cortina ends at the track's end", () => {
    expect(validCortinaStart(200, 45, 220)).toBe(175);
  });
  it("a track shorter than the length plays from 0; a negative or missing start is 0", () => {
    expect(validCortinaStart(30, 45, 40)).toBe(0);
    expect(validCortinaStart(-3, 45, 200)).toBe(0);
    expect(validCortinaStart(undefined, 45, 200)).toBe(0);
  });
  it("an unknown duration keeps the start", () => {
    expect(validCortinaStart(52, 45, undefined)).toBe(52);
  });
});

describe("audio fallback (energy over a full track)", () => {
  it("the first sustained rise to the loud part after the intro", () => {
    // 1 frame = 0.5 s: 20 s quiet intro, 30 s medium verse, then the loud chorus at 50 s
    const env = [
      ...Array.from({ length: 40 }, () => 0.1),
      ...Array.from({ length: 60 }, () => 0.35),
      ...Array.from({ length: 60 }, () => 0.8),
      ...Array.from({ length: 40 }, () => 0.4),
    ];
    const h = energyHook(env, 0.5)!;
    expect(h.kind).toBe("energy");
    expect(h.startSec).toBeGreaterThanOrEqual(48);
    expect(h.startSec).toBeLessThanOrEqual(50.5);
    expect(h.confidence).toBeLessThan(0.7);
  });
  it("a flat track has no hook", () => {
    expect(
      energyHook(
        Array.from({ length: 300 }, () => 0.5),
        0.5,
      ),
    ).toBeNull();
  });
});
