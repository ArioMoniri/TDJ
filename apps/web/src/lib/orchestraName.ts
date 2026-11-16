import { singerDisplay } from "@tdj/core";
import { t } from "@/lib/i18n";

/**
 * 2026-11 (the owner: "covers for the solo-singer-with-guitars sides"): the catalogue files a singer's own sides with
 * guitars under "Guitarras (solo singer)" — a label, not an orchestra. Wherever a side or tanda names its orchestra it
 * reads "Héctor Mauré with guitars" instead (display only: the data, the searches and the match rules keep the label;
 * lib/findMatch.ts isPseudoOrchestra reads it the same way). Every other orchestra reads as it is.
 */
const GUITARS = /^guitarras?\s*\(solo singer\)$/i;
export const isGuitarsLabel = (s: { orchestra?: string | null; orchestraId?: string | null }) =>
  s.orchestraId === "guitarras-solo-singer" || GUITARS.test((s.orchestra ?? "").trim());

export function orchestraName(s: {
  orchestra: string;
  orchestraId?: string | null;
  singer?: string | null;
}): string {
  if (!isGuitarsLabel(s)) return s.orchestra;
  const who = s.singer ? (singerDisplay(s.singer) as string) : "";
  return who ? t("orchestra.with_guitars", { singer: who }) : t("orchestra.singer_with_guitars");
}
