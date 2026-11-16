"use client";
import { closingFormatOf } from "@tdj/core";
import { Plus } from "lucide-react";
import { t } from "@/lib/i18n";
import type { MsgKey } from "@/lib/i18n/en";
import type { Playlist } from "@/lib/types";

/**
 * 2026-11 — "Insert tanda here" between the night's tandas and around them (Compose, the Booth's set list, Rooms):
 * one thin row with a ≥ 44 px target that opens the Insert sheet for the spot.
 */
export function InsertGap({
  label,
  onClick,
  testId,
  disabled,
}: {
  label: string;
  onClick: () => void;
  testId?: string;
  disabled?: boolean;
}) {
  return (
    <div className="insert-gap my-2 flex items-center gap-2" data-testid={testId}>
      <span className="h-px flex-1 bg-[var(--separator)]" aria-hidden />
      <button
        type="button"
        // (QA fix 2026-11: at 200 % text its one line ran 86 px past an iPhone: it wraps)
        className="btn-plain text-footnote inline-flex min-h-11 min-w-0 max-w-full items-center gap-1.5 whitespace-normal px-3 text-center text-[var(--tint)] disabled:text-[var(--label-3)]"
        onClick={onClick}
        disabled={disabled}
        data-testid={testId ? `${testId}-button` : undefined}
      >
        <Plus size={14} strokeWidth={2.5} aria-hidden />
        {label}
      </button>
      <span className="h-px flex-1 bg-[var(--separator)]" aria-hidden />
    </div>
  );
}

const FORMAT_LINE: Record<string, MsgKey> = {
  "after-cortina": "spot.format_line.after-cortina",
  straight: "spot.format_line.straight",
  "in-tanda": "spot.format_line.in-tanda",
  "own-tanda": "spot.format_line.own-tanda",
  none: "spot.format_line.none",
};
/** the night's closing format in one line ("4 + 1: the fifth side of tanda 22") */
export function closingFormatLine(p: Pick<Playlist, "options" | "tandas">): string {
  const f = closingFormatOf(p.options);
  return t(FORMAT_LINE[f]!, { n: p.tandas.length, n1: p.tandas.length + 1 });
}
