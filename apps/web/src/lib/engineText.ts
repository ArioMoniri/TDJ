import type { SuggestWhy, TandaTone } from "@tdj/core";
import { capFirst, getLocale, lower, type MsgKey, t } from "@/lib/i18n";
import { successionText } from "@/lib/succession";

/**
 * 2026-11 (QA: English words on Turkish screens) — the engine's own words at the UI boundary. `packages/core` keeps
 * its English labels for the CLI, the benchmark and the AI prompts (the score's verdict, a tanda's tone, the
 * cohesion label, a suggestion's reasons); every screen says them through here, in the DJ's language.
 */

const VERDICT: Record<string, MsgKey> = {
  "Headline marathon DJ": "engine.verdict.headline",
  "Solid regular milonga DJ": "engine.verdict.solid",
  "Enthusiastic amateur": "engine.verdict.amateur",
  "Spotify radio": "engine.verdict.radio",
};
/** the score's one-line verdict ("Headline marathon DJ") in the DJ's language; an unknown one as it came */
export const verdictText = (v: string | undefined | null): string =>
  v && VERDICT[v] ? t(VERDICT[v]!) : (v ?? "");

/** the night's arc shape as words: "single peak arc" / "tek zirve eğrisi" */
export const arcShapeWord = (shape: "single" | "double" | string): string =>
  shape === "double" ? t("composer.double") : t("composer.single");

const COHESION: Record<string, MsgKey> = {
  seamless: "engine.cohesion.seamless",
  fine: "engine.cohesion.fine",
  "audible step": "engine.cohesion.audible_step",
  jarring: "engine.cohesion.jarring",
};
/** the cohesion label in sentence case ("Audible step" / "Duyulur geçiş") */
export const cohesionWord = (label: string): string =>
  capFirst(COHESION[label] ? t(COHESION[label]!) : label);

const MODE: Record<string, MsgKey> = {
  minor: "engine.tone.minor",
  major: "engine.tone.major",
};
const FEEL: Record<string, MsgKey> = {
  calm: "engine.tone.calm",
  steady: "engine.tone.steady",
  lively: "engine.tone.lively",
};
/** "minor" → "minor" / "minör" (lower case, for running text) */
export const toneMode = (mode: string | null | undefined): string =>
  mode && MODE[mode] ? t(MODE[mode]!) : (mode ?? "");
/** "steady" → "steady" / "dengeli" */
export const toneFeel = (feel: string): string => (FEEL[feel] ? t(FEEL[feel]!) : feel);
/** a tanda's tone chip: "Minor · steady · 138 BPM" / "Minör · dengeli · 138 BPM" (core tandaTone's label) */
export function toneText(tone: Pick<TandaTone, "mode" | "feel" | "bpm">): string {
  return [
    tone.mode === "mixed" ? t("engine.tone.mixed") : tone.mode ? capFirst(toneMode(tone.mode)) : null,
    tone.mode ? toneFeel(tone.feel) : capFirst(toneFeel(tone.feel)),
    tone.bpm ? t("engine.tone.bpm", { bpm: tone.bpm }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "1940s" / "1940'lar" (the Turkish suffix follows the decade's spoken last word: kırk → -lar, elli → -ler) */
export function decadeWord(decade: number): string {
  if (getLocale() !== "tr") return `${decade}s`;
  const d = Math.abs(decade) % 100;
  const back = d === 10 || d === 30 || d === 40 || d === 60 || d === 90;
  return `${decade}'${back ? "lar" : "ler"}`;
}

/** one Build by hand suggestion reason in the DJ's language (core suggest.ts `why`) */
export function suggestWhyText(w: SuggestWhy): string {
  const v = w.vars ?? {};
  switch (w.code) {
    case "succession":
      return w.succession ? successionText(w.succession, w.prev ?? "").text : "";
    case "same_decade":
      return t("suggest.why.same_decade", { decade: decadeWord(Number(v.decade)) });
    case "family_for_slot":
      return t(
        v.tier === "headline" ? "suggest.why.family_for_slot_headline" : "suggest.why.family_for_slot_strong",
        {
          rhythm: lower(String(v.rhythm ?? "")),
        },
      );
    default:
      return t(`suggest.why.${w.code}` as MsgKey, v);
  }
}

/** a suggestion's reasons to show: the data's words in the DJ's language, else (an older server) the English ones */
export function suggestReasons(s: { reasons: string[]; why?: SuggestWhy[] }): string[] {
  if (s.why?.length) return s.why.map(suggestWhyText).filter(Boolean);
  return getLocale() === "en" ? s.reasons : [];
}
