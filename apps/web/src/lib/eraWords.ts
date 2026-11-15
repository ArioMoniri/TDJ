import { type EraMark, eraMark, type HeatGrade } from "@tdj/core";
import { t } from "@/lib/i18n";

/**
 * Wave 3 — the app's one era vocabulary (core ERA_WORDS, wave 2) in the DJ's language. The English values are the
 * core's own words, so an English screen reads exactly as before; every badge, legend, grade cell and tooltip in the
 * web app takes its words from here instead of from the core.
 */
export function eraWords(m: EraMark): { word: string; label: string; meaning: string } {
  switch (m) {
    case "best":
      return { word: t("era.best.word"), label: t("era.best.label"), meaning: t("era.best.meaning") };
    case "good":
      return { word: t("era.good.word"), label: t("era.good.label"), meaning: t("era.good.meaning") };
    case "weak":
      return { word: t("era.weak.word"), label: t("era.weak.label"), meaning: t("era.weak.meaning") };
    default:
      return {
        word: t("era.outside.word"),
        label: t("era.outside.label"),
        meaning: t("era.outside.meaning"),
      };
  }
}
export const eraMarkLabel = (m: EraMark) => eraWords(m).label;

/** core gradeWord in the DJ's language: a heatmap grade (0–4); the grade cells tell the two uneven grades apart */
export function gradeWords(g: HeatGrade | number | null | undefined): {
  word: string;
  meaning: string;
  mark?: EraMark;
} {
  if (g === null || g === undefined)
    return { word: t("era.not_graded.word"), meaning: t("era.not_graded.meaning") };
  const mark = eraMark(g, true)!;
  if (g === 1) return { word: t("era.singles.word"), meaning: t("era.singles.meaning"), mark };
  const w = eraWords(mark);
  return { word: w.word, meaning: w.meaning, mark };
}
