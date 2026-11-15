/**
 * Wave 2 (testers): the era grades read in one vocabulary everywhere. The badge, the legend, the Database grade
 * cells and the booth's legend in Settings all take their words from `ERA_WORDS` / `gradeWord`.
 */
import { describe, expect, it } from "vitest";
import { ERA_MARK_LABEL, ERA_MARKS, ERA_WORDS, eraMark, gradeWord } from "../src/index";

describe("one vocabulary for the era grades", () => {
  it("every grade's word starts with its mark's word, so a cell and a badge never disagree", () => {
    for (const g of [0, 1, 2, 3, 4] as const) {
      const w = gradeWord(g);
      const mark = eraMark(g, true)!;
      expect(w.mark).toBe(mark);
      expect(w.word.startsWith(ERA_WORDS[mark].word)).toBe(true);
    }
  });

  it("uses plain words, never digits or the old fantastic / avoid / weaker set", () => {
    const all = [
      ...ERA_MARKS.flatMap((m) => [
        ERA_WORDS[m].word,
        ERA_WORDS[m].label,
        ERA_WORDS[m].meaning,
        ERA_MARK_LABEL[m],
      ]),
      ...([0, 1, 2, 3, 4, null] as const).flatMap((g) => [gradeWord(g).word, gradeWord(g).meaning]),
    ].join(" | ");
    expect(all).not.toMatch(/\d|fantastic|weaker|avoid/i);
  });

  it("names the four marks Best, Good, Uneven and Outside", () => {
    expect(ERA_MARKS.map((m) => ERA_WORDS[m].word)).toEqual(["Best", "Good", "Uneven", "Outside"]);
    expect(ERA_MARK_LABEL.best).toBe(ERA_WORDS.best.label);
  });

  it("tells an ungraded year apart", () => {
    expect(gradeWord(null).word).toBe("Not graded");
    expect(gradeWord(undefined).mark).toBeUndefined();
  });
});
