import { t } from "@/lib/i18n";
/** Round 21: "126 BPM · −11.5 dB" for a row — only what was measured (Deezer, the analysed preview or the DJ's) */
export function tempoLevel(s: { tempo?: { bpm: number } | null; level?: { gainDb: number } | null }): string {
  const out: string[] = [];
  if (s.tempo?.bpm) out.push(t("tempo.bpm", { p1: Math.round(s.tempo.bpm) }));
  if (typeof s.level?.gainDb === "number")
    out.push(t("tempo.db", { p1: s.level.gainDb.toFixed(1).replace("-", "−") }));
  return out.join(" · ");
}
