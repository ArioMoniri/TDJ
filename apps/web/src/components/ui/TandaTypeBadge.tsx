"use client";
import { Footprints, Music2, RotateCw } from "lucide-react";
import { t } from "@/lib/i18n";
import { Tip } from "./Tip";

/**
 * 2026-11 (the owner: "tanda types in all tabs should be shown better") — one badge for a tanda's type, shared by
 * Compose, the inspector, Build by hand, History and the shared night (and free for the Booth): the rhythm in words
 * with its colour and icon (Tango pink, Vals teal, Milonga violet, as the rhythm tiles), the mode ("Vocal · Roberto
 * Rufino" or "Instrumental") and a subtle "mixed" tag for a DJ exception or a tanda of mixed sides. Colours are
 * tokens in globals.css (`.tanda-type`), AA in light and dark.
 */
export function rhythmWord(rhythm: string): string {
  return rhythm === "vals"
    ? t("tandaType.vals")
    : rhythm === "milonga"
      ? t("tandaType.milonga")
      : rhythm === "tango"
        ? t("tandaType.tango")
        : rhythm;
}

const ICON = { tango: Music2, vals: RotateCw, milonga: Footprints } as const;

export function TandaTypeBadge({
  rhythm,
  singer,
  vocal,
  mixed = false,
  mixedWhy,
  compact = false,
  className = "",
}: {
  rhythm: string;
  singer?: string | null;
  /** vocal tanda (a singer named or not) */
  vocal?: boolean;
  /** a DJ exception, or sides of different orchestras / voices */
  mixed?: boolean;
  mixedWhy?: string;
  /** the rhythm only (no mode) */
  compact?: boolean;
  className?: string;
}) {
  const Icon = ICON[rhythm as keyof typeof ICON] ?? Music2;
  const mode = singer
    ? t("tandaType.vocal_singer", { singer })
    : vocal
      ? t("tandaType.vocal")
      : t("tandaType.instrumental");
  return (
    <span
      className={`tanda-type inline-flex min-w-0 max-w-full items-center gap-1.5 ${className}`}
      data-rhythm={rhythm}
      data-testid="tanda-type"
    >
      <span className="tanda-type-rhythm text-caption1 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-semibold">
        <Icon size={12} strokeWidth={2.25} aria-hidden />
        {rhythmWord(rhythm)}
      </span>
      {!compact && (
        <span
          className="text-caption1 min-w-0 truncate font-medium text-[var(--label-2)]"
          data-testid="tanda-mode"
        >
          {mode}
        </span>
      )}
      {mixed &&
        (mixedWhy ? (
          <Tip text={mixedWhy}>
            <span
              className="tanda-type-mixed text-caption2 shrink-0 rounded-full px-1.5 py-0.5"
              data-testid="tanda-mixed"
            >
              {t("tandaType.mixed")}
            </span>
          </Tip>
        ) : (
          <span
            className="tanda-type-mixed text-caption2 shrink-0 rounded-full px-1.5 py-0.5"
            data-testid="tanda-mixed"
          >
            {t("tandaType.mixed")}
          </span>
        ))}
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
