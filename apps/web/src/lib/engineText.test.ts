import type { SuggestWhy, SuggestWhyCode } from "@tdj/core";
import { afterEach, describe, expect, it } from "vitest";
import {
  arcShapeWord,
  cohesionWord,
  decadeWord,
  suggestReasons,
  suggestWhyText,
  toneText,
  verdictText,
} from "./engineText";
import { fmtSec, setLocale } from "./i18n";
import { ENGLISH_UI_WORDS } from "./i18n/englishWords";

afterEach(() => setLocale("en"));

/** every reason code with the data it carries (core suggest.ts) */
const WHYS: SuggestWhy[] = (
  [
    ["lift_after_calm", { e: 64, after: 48 }],
    ["breather", { e: 52, after: 70 }],
    ["fits_arc", { e: 60, plan: 62 }],
    ["big_four_due", { n: 3 }],
    ["not_played", {}],
    ["last_played", { orchestra: "Carlos Di Sarli", n: 4 }],
    ["same_decade", { decade: 1940 }],
    ["liked_nights", {}],
    ["often_chosen", {}],
    ["disliked_nights", {}],
    ["replaced_before", {}],
    ["floor_filled_family", {}],
    ["floor_emptied_family", {}],
    ["floor_favourite", {}],
    ["family_for_slot", { tier: "headline", rhythm: "vals" }],
    ["same_singer_side", { singer: "Roberto Rufino", year: 1941, beside: "1940–1942" }],
    ["instrumental_side", { year: 1940, beside: "1940" }],
    ["lifts_tanda", { e: 66, after: 60 }],
    ["settles_tanda", { e: 55 }],
    ["side_chosen_before", {}],
    ["floor_filled_side", {}],
  ] as Array<[SuggestWhyCode, Record<string, string | number>]>
).map(([code, vars]) => ({ code, vars }));
const SUCCESSION: SuggestWhy = {
  code: "succession",
  prev: "Carlos Di Sarli",
  succession: {
    score: 0.6,
    points: 6,
    verdict: "good",
    parts: [
      { kind: "energy", points: 3, detail: { step: 4, plan: 2 } },
      { kind: "style", points: 2, detail: { from: "L", to: "R" } },
      { kind: "corpus", points: 1, detail: { count: 42 } },
    ],
  },
};

describe("the engine's words at the UI boundary", () => {
  it("English reads as the engine wrote it", () => {
    expect(verdictText("Headline marathon DJ")).toBe("Headline marathon DJ");
    expect(toneText({ mode: "minor", feel: "steady", bpm: 138 })).toBe("Minor · steady · 138 BPM");
    expect(toneText({ mode: "mixed", feel: "lively", bpm: null })).toBe("Mixed keys · lively");
    expect(toneText({ mode: null, feel: "calm", bpm: 120 })).toBe("Calm · 120 BPM");
    expect(cohesionWord("audible step")).toBe("Audible step");
    expect(arcShapeWord("single")).toBe("single");
    expect(decadeWord(1940)).toBe("1940s");
    expect(suggestWhyText(SUCCESSION)).toBe(
      "Follows Carlos Di Sarli well: energy +4 (plan +2), rhythmic after lyrical, common in DJ sets (42×)",
    );
    expect(suggestWhyText({ code: "same_decade", vars: { decade: 1940 } })).toBe(
      "stays in the 1940s, the years of the last tanda",
    );
  });

  it("Turkish: no English word left in a verdict, a tone, a cohesion label or any suggestion reason", () => {
    setLocale("tr");
    const all = [
      ...["Headline marathon DJ", "Solid regular milonga DJ", "Enthusiastic amateur", "Spotify radio"].map(
        verdictText,
      ),
      toneText({ mode: "minor", feel: "steady", bpm: 138 }),
      toneText({ mode: "major", feel: "lively", bpm: 120 }),
      toneText({ mode: "mixed", feel: "calm", bpm: null }),
      ...["seamless", "fine", "audible step", "jarring"].map(cohesionWord),
      arcShapeWord("single"),
      arcShapeWord("double"),
      ...WHYS.map(suggestWhyText),
      suggestWhyText(SUCCESSION),
    ];
    expect(all.filter((s) => !s.trim())).toEqual([]);
    expect(all.filter((s) => ENGLISH_UI_WORDS.test(s) || /\{\w+\}/.test(s))).toEqual([]);
    expect(verdictText("Headline marathon DJ")).toBe("Maratonun yıldız DJ'i");
    expect(toneText({ mode: "minor", feel: "steady", bpm: 138 })).toBe("Minör · dengeli · 138 BPM");
    expect(cohesionWord("fine")).toBe("İyi");
    expect(suggestWhyText({ code: "not_played" })).toBe("bu gece henüz çalınmadı");
    expect(suggestWhyText(SUCCESSION)).toBe(
      "Carlos Di Sarli sonrası iyi gider: enerji +4 (hedef +2), lirik ardından ritmik, DJ setlerinde yaygın (42×)",
    );
  });

  it("Turkish decades take the suffix of their spoken last word", () => {
    setLocale("tr");
    expect([1920, 1930, 1940, 1950, 1960].map(decadeWord)).toEqual([
      "1920'ler",
      "1930'lar",
      "1940'lar",
      "1950'ler",
      "1960'lar",
    ]);
  });

  it("a suggestion without reason data keeps its English only in English", () => {
    const s = { reasons: ["not played yet tonight"] };
    expect(suggestReasons(s)).toEqual(["not played yet tonight"]);
    setLocale("tr");
    expect(suggestReasons(s)).toEqual([]);
    expect(suggestReasons({ ...s, why: [{ code: "not_played" }] })).toEqual(["bu gece henüz çalınmadı"]);
  });
});

describe("fmtSec: one seconds formatter", () => {
  it("English: a point and s; Turkish: a decimal comma and sn", () => {
    expect([fmtSec(2.5), fmtSec(4), fmtSec(0.25)]).toEqual(["2.5 s", "4 s", "0.3 s"]);
    setLocale("tr");
    expect([fmtSec(2.5), fmtSec(4), fmtSec(30)]).toEqual(["2,5 sn", "4 sn", "30 sn"]);
  });
});
