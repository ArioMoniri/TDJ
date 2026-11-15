import { describe, expect, it } from "vitest";
import { autoImproveLine } from "./changes";
import { djMessage, djMessages, tandaNote } from "./djMessage";

/** what no line the DJ reads may carry (wave 2, item 2) */
const ENGINE_WORDS =
  /fell back|\bengine\b|benchmark|take their chairs|no swap keeps|\bT\d{1,2}\b|≥|[a-z]+-[a-z]+:|^\w+:/i;

describe("djMessage: every core fallback in the DJ's words", () => {
  const cases: Array<[string, RegExp]> = [
    [
      "bigFour: Juan D'Arienzo then Aníbal Troilo; Juan D'Arienzo then Carlos Di Sarli (no swap keeps the other rules)",
      /^The big four could not all be kept apart tonight: D'Arienzo and Troilo, D'Arienzo and Di Sarli play back to back\.$/,
    ],
    [
      "bigFour: Juan D'Arienzo again 3 tandas after tanda 4 (≥ 5) (no swap keeps the other rules)",
      /spaced 5 tandas apart tonight; D'Arienzo comes back sooner\./,
    ],
    [
      "bigFour: quartile 2 (tandas 6–11) has no big-four tanda (no swap keeps the other rules)",
      /The second quarter of the night has no big-four tanda\./,
    ],
    [
      "bigFour: no osvaldo-pugliese tanda (no swap keeps the other rules)",
      /Pugliese could not fit in tonight\./,
    ],
    [
      "opening: no Ángel D'Agostino La Cumparsita near 1941; its 1950 version (Ángel Vargas) opens",
      /^D'Agostino has no La Cumparsita from around 1941; the 1950 recording with Ángel Vargas opens instead\.$/,
    ],
    [
      "opening: Rodolfo Biagi has no La Cumparsita; Juan D'Arienzo 1943 (the same rhythmic style) opens",
      /^Biagi never recorded La Cumparsita; D'Arienzo's 1943 version opens instead, in the same rhythmic style\.$/,
    ],
    ["opening: no La Cumparsita to open with", /starts with the first tanda/],
    [
      "closer: no Miguel Caló La Cumparsita near 1942–43; its 1951 version closes",
      /^Caló has no La Cumparsita from around 1942–43; the 1951 recording closes instead\.$/,
    ],
    ["closer: no Felicia recording in the index; La Cumparsita closes instead", /No Felicia recording/],
    [
      "closer: no La Cumparsita in 1935–1945; Juan D'Arienzo 1951 closes",
      /No La Cumparsita was recorded in 1935–1945; D'Arienzo's 1951 version closes\./,
    ],
    [
      "opener: Carlos Di Sarli has no tango tanda in the night's years; the opener rule decides",
      /^Di Sarli has no tango tanda in tonight's years, so another orchestra opens\.$/,
    ],
    [
      "ultima: Osvaldo Pugliese has no tanda the night's years and gaps allow; Ricardo Tanturi closes instead",
      /^Pugliese could not take the última tonight; Tanturi closes instead\.$/,
    ],
    [
      "vocalStyle: only 2 tango families sing cantor; every vocal style plays (never mixed in one tanda)",
      /both vocal styles play/,
    ],
    [
      "cortinas: turkish has no Spotify-ready cue; greek / balkan instead",
      /^No turkish cortina plays on Spotify, so greek or balkan play instead\.$/,
    ],
    [
      "family cortinas: only 3 in the pool, fewer than the 21 a night of 22 tandas needs; era-matched cortinas used instead",
      /^Only 3 cortinas match your choice and the night needs 21/,
    ],
  ];
  for (const [raw, want] of cases)
    it(raw.slice(0, 60), () => {
      const out = djMessage(raw);
      expect(out).toMatch(want);
      expect(out).not.toMatch(ENGINE_WORDS);
      expect(out.length).toBeLessThan(180);
    });
  it("an unknown note keeps its words, never its key, ids or tanda codes", () => {
    const out = djMessage("someRule: T16 swapped for juan-d-arienzo-1938a (≥ 3)");
    expect(out).not.toMatch(ENGINE_WORDS);
    expect(out).toMatch(/tanda 16/i);
  });
  it("lists each note once", () => {
    expect(
      djMessages(["opening: no La Cumparsita to open with", "opening: no La Cumparsita to open with"]),
    ).toHaveLength(1);
  });
});

describe("tandaNote and the improve line", () => {
  it("drops the engine's bookkeeping from a moved tanda's note", () => {
    const n = tandaNote(
      "the última, Tanturi / Castillo: Pocas Palabras and La Vida Es Corta now play in T16, so Muñeca Brava and Como Se Pianta la Vida (1942) take their chairs; it still ends on Así Se Baila el Tango",
    );
    expect(n).toBe("The última, Tanturi / Castillo, ending on Así Se Baila el Tango");
    expect(n).not.toMatch(ENGINE_WORDS);
  });
  it("leaves a plain note alone", () => {
    expect(tandaNote("Vals de cumpleaños")).toBe("Vals de cumpleaños");
  });
  it("the auto-improve line carries no engine or benchmark numbers", () => {
    const line = autoImproveLine({
      changes: [
        { kind: "tighten", tanda: 3, text: "" },
        { kind: "heatmap", tanda: 5, text: "" },
      ],
      before: { score: 86, inRange: 15, scored: 18 },
      after: { score: 86, inRange: 15, scored: 18 },
    });
    expect(line).toBe("Polished against published DJ sets: 2 changes (one recording period, heatmap years)");
    expect(line).not.toMatch(ENGINE_WORDS);
  });
});
