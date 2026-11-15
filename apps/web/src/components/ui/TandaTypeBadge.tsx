"use client";
import { Music2, Music3, Music4 } from "lucide-react";
import { t } from "@/lib/i18n";

/**
 * 2026-11 ("tanda types shown better in all tabs"): a tanda's type in words, with its colour and glyph — Tango (rose),
 * Vals (teal), Milonga (violet) — and its mode: "Vocal · singer" or "Instrumental" (or "Mixed"). Never colour alone.
 * Shared by the Booth (set list, Now, Up Next) and the sidebar's Tonight list; Compose uses the same props.
 */
export interface TandaTypeProps {
  rhythm: string;
  vocal: boolean;
  singer?: string | null;
  mixed?: boolean;
}

const ICON = { tango: Music2, vals: Music3, milonga: Music4 } as const;

export function rhythmWord(rhythm: string): string {
  return rhythm === "vals"
    ? t("tandaType.vals")
    : rhythm === "milonga"
      ? t("tandaType.milonga")
      : rhythm === "tango"
        ? t("tandaType.tango")
        : rhythm;
}

export function modeWords({ vocal, singer, mixed }: Omit<TandaTypeProps, "rhythm">): string {
  if (mixed) return t("tandaType.mixed");
  if (!vocal) return t("tandaType.instrumental");
  return singer ? t("tandaType.vocal_singer", { singer }) : t("tandaType.vocal");
}

/** "Tango · Vocal · Angel Vargas" (the sidebar, a hint) */
export function tandaTypeWords(p: TandaTypeProps): string {
  return `${rhythmWord(p.rhythm)} · ${modeWords(p)}`;
}

export function TandaTypeBadge({
  rhythm,
  vocal,
  singer,
  mixed,
  compact = false,
}: TandaTypeProps & { compact?: boolean }) {
  const Icon = ICON[rhythm as keyof typeof ICON] ?? Music2;
  return (
    <span
      className="tanda-type"
      data-rhythm={rhythm}
      data-testid="tanda-type"
      title={tandaTypeWords({ rhythm, vocal, singer, mixed })}
    >
      <span className="tanda-type-rhythm">
        <Icon size={13} strokeWidth={2.25} aria-hidden />
        {rhythmWord(rhythm)}
      </span>
      {!compact && <span className="tanda-type-mode">{modeWords({ vocal, singer, mixed })}</span>}
    </span>
  );
}
