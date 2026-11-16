"use client";
import { singerDisplay } from "@tdj/core";
import { Footprints, Music2, RotateCw } from "lucide-react";
import { t } from "@/lib/i18n";
import { Tip } from "./Tip";

/**
 * 2026-11 (the owner: "tanda types in all tabs should be shown better") — one badge for a tanda's type, shared by
 * the Booth (set list, Now, Up Next), the sidebar's Tonight list (as words), Compose, the inspector, Build by hand,
 * History and the shared night: the rhythm in words with its colour and glyph (Tango rose, Vals teal, Milonga violet,
 * as the rhythm tiles), the mode ("Vocal · Roberto Rufino" or "Instrumental") and a subtle "mixed" tag for a DJ
 * exception or a tanda of mixed sides. Never colour alone. Colours are fixed pairs in globals.css (`.tanda-type`),
 * AA in light and dark.
 */
export interface TandaTypeProps {
  rhythm: string;
  /** a vocal tanda (a singer named or not); left out, a named singer means vocal */
  vocal?: boolean;
  singer?: string | null;
  /** a DJ exception, or sides of different orchestras / voices (`isMixedTanda`) */
  mixed?: boolean;
  /**
   * QA fix 2026-11: the tanda's sides, when known — a vocal tanda with an instrumental side reads "Vocal &
   * instrumental", a tango tanda with a vals in it carries the "+ vals" chip (the header never says less than the sides)
   */
  songs?: ReadonlyArray<{ vocal?: boolean; singer?: string | null; rhythm?: string }>;
}

const ICON = { tango: Music2, vals: RotateCw, milonga: Footprints } as const;

export function rhythmWord(rhythm: string): string {
  return rhythm === "vals"
    ? t("tandaType.vals")
    : rhythm === "milonga"
      ? t("tandaType.milonga")
      : rhythm === "tango"
        ? t("tandaType.tango")
        : rhythm;
}

/** "Vocal · Angel Vargas", "Vocal", "Vocal & instrumental" (sides of both) or "Instrumental" */
export function modeWords({ vocal, singer, songs }: Omit<TandaTypeProps, "rhythm">): string {
  if (songs?.length) {
    const sung = songs.filter((s) => s.vocal ?? !!s.singer).length;
    if (sung && sung < songs.length) return t("tandaType.vocal_and_instrumental");
    if (!sung) return t("tandaType.instrumental");
  }
  const isVocal = vocal ?? !!singer;
  if (!isVocal) return t("tandaType.instrumental");
  return singer ? t("tandaType.vocal_singer", { singer: singerDisplay(singer) }) : t("tandaType.vocal");
}

/** the other rhythms among the sides ("vals" in a tango tanda), in order of appearance */
export function otherRhythms(rhythm: string, songs?: TandaTypeProps["songs"]): string[] {
  return [...new Set((songs ?? []).map((s) => s.rhythm).filter((r): r is string => !!r && r !== rhythm))];
}

/** "Tango · Vocal · Angel Vargas" (· + vals · mixed) — the sidebar, a hint */
export function tandaTypeWords(p: TandaTypeProps): string {
  const others = otherRhythms(p.rhythm, p.songs).map(
    (r) => ` · ${t("tandaType.plus_rhythm", { rhythm: rhythmWord(r) })}`,
  );
  return `${rhythmWord(p.rhythm)} · ${modeWords(p)}${others.join("")}${p.mixed ? ` · ${t("tandaType.mixed")}` : ""}`;
}

export function TandaTypeBadge({
  rhythm,
  vocal,
  singer,
  mixed = false,
  songs,
  mixedWhy,
  compact = false,
  className = "",
}: TandaTypeProps & {
  /** the reason behind "mixed", shown on hover / long press */
  mixedWhy?: string;
  /** the rhythm only (no mode) */
  compact?: boolean;
  className?: string;
}) {
  const Icon = ICON[rhythm as keyof typeof ICON] ?? Music2;
  const tag = mixed && (
    <span className="tanda-type-mixed" data-testid="tanda-mixed">
      {t("tandaType.mixed")}
    </span>
  );
  return (
    <span
      className={`tanda-type ${className}`}
      data-rhythm={rhythm}
      data-testid="tanda-type"
      title={tandaTypeWords({ rhythm, vocal, singer, mixed, songs })}
    >
      <span className="tanda-type-rhythm">
        <Icon size={12} strokeWidth={2.25} aria-hidden />
        {rhythmWord(rhythm)}
      </span>
      {!compact && (
        <span className="tanda-type-mode" data-testid="tanda-mode">
          {modeWords({ vocal, singer, songs })}
        </span>
      )}
      {otherRhythms(rhythm, songs).map((r) => (
        <span key={r} className="tanda-type-mixed" data-testid="tanda-mixed-rhythm">
          {t("tandaType.plus_rhythm", { rhythm: rhythmWord(r) })}
        </span>
      ))}
      {tag && (mixedWhy ? <Tip text={mixedWhy}>{tag}</Tip> : tag)}
    </span>
  );
}

/** a tanda is "mixed": the DJ's exception, or more than one orchestra or voice among its sides */
export function isMixedTanda(t: {
  pinned?: { exception?: unknown } | null;
  songs: Array<{ orchestraId?: string; singer?: string | null; vocal?: boolean }>;
}): boolean {
  if (t.pinned?.exception) return true;
  const orch = new Set(t.songs.map((s) => s.orchestraId ?? ""));
  const voices = new Set(t.songs.filter((s) => s.vocal).map((s) => s.singer ?? ""));
  return orch.size > 1 || voices.size > 1;
}
