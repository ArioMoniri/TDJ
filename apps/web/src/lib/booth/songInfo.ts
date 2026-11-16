import { type Cortina, orchestraShortName, type Song } from "@tdj/core";
import { t } from "@/lib/i18n";

/**
 * Round 22: what a row prints about a side — BPM, key and energy — with where each number came from (shown on
 * hover / long-press). Only measured or curated numbers: an unknown stays unknown (an en dash), never 0.
 */
type Entity = Song | Cortina | null | undefined;
const isSong = (e: NonNullable<Entity>): e is Song => "rhythm" in e && "orchestraId" in e;

/**
 * "Carlos Di Sarli" → "Di Sarli", "Juan D'Arienzo" → "D'Arienzo", "Osvaldo Pugliese" → "Pugliese" (2026-11: one
 * implementation, @tdj/core nightShape.ts, in its "surname" mode)
 */
export const surnameOf = (orchestra: string): string => orchestraShortName(orchestra, "surname");

const TEMPO_SOURCE: Record<string, string> = {
  get dj() {
    return t("booth.songInfo.your_edit");
  },
  deezer: "Deezer",
  get audio() {
    return t("booth.songInfo.analysed_preview");
  },
  get index() {
    return t("booth.songInfo.catalogue_estimate");
  },
};

export interface Sourced<T> {
  value: T;
  source: string;
}

/** BPM, rounded: the DJ's, Deezer's or the analysed preview's (`tempo`), else the catalogue's estimate. */
export function bpmOf(e: Entity): Sourced<number> | null {
  if (!e || !isSong(e)) return null;
  if (e.tempo?.bpm && Number.isFinite(e.tempo.bpm))
    return { value: Math.round(e.tempo.bpm), source: TEMPO_SOURCE[e.tempo.source] ?? "Measured" };
  if (e.deezer?.bpm && Number.isFinite(e.deezer.bpm))
    return { value: Math.round(e.deezer.bpm), source: "Deezer" };
  if (e.audio?.bpm && Number.isFinite(e.audio.bpm))
    return { value: Math.round(e.audio.bpm), source: t("booth.songInfo.analysed_preview") };
  if (e.bpm && Number.isFinite(e.bpm))
    return { value: Math.round(e.bpm), source: t("booth.songInfo.catalogue_estimate") };
  return null;
}

/** Below this the analyser's key is a guess: not shown. */
export const KEY_MIN_CONFIDENCE = 0.15;
const SHARP = (k: string) => k.replace("#", "♯");

/** The key in Camelot ("1A") with its musical name ("G♯ minor"), from the analysed preview. */
export function keyOf(e: Entity): { camelot: string; name: string; source: string } | null {
  if (!e || !isSong(e)) return null;
  const a = e.audio;
  if (!a?.camelot || !a.key || !(a.keyConfidence >= KEY_MIN_CONFIDENCE)) return null;
  return {
    camelot: a.camelot,
    name: `${SHARP(a.key)} ${a.mode === "minor" ? t("booth.songInfo.minor") : t("booth.songInfo.major")}`,
    source: t("booth.songInfo.analysed_preview"),
  };
}

/** 0–100, rounded; null when the side has none. */
export function energyOf(e: Entity): number | null {
  if (!e || !isSong(e)) return null;
  const v = e.energy;
  return typeof v === "number" && Number.isFinite(v) ? Math.round(Math.max(0, Math.min(100, v))) : null;
}
