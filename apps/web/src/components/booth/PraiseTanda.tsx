"use client";
import { Star } from "lucide-react";
import { useState } from "react";
import { useBooth } from "@/lib/booth/store";
import { haptic } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { isPraised, praiseTanda } from "@/lib/praise";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { Group } from "../Form";
import { Sheet } from "../Sheet";

/**
 * 2026-11 — "Praise this tanda ★", next to the floor reactions (the Controls panel's Floor group, a set-list tanda's
 * header): the DJ records feedback that the tanda was great (a ♥ for its songs). A sheet asks for an optional short
 * note; the praise is kept in the DJ's memory (lib/praise.ts) for any night. Praised already: a tap takes it back.
 * 44 pt; `compact` shows the star only.
 */
export function PraiseTanda({
  tanda: tandaProp,
  compact,
  testPrefix,
}: {
  /** the plan's tanda (1-based); default: the playing item's */
  tanda?: number;
  compact?: boolean;
  testPrefix: string;
}) {
  const playlist = useBooth((s) => s.playlist);
  const item = useBooth((s) => s.plan?.items[s.planIndex]);
  const memory = useStore((s) => s.memory);
  const tanda = tandaProp ?? item?.tanda ?? 0;
  const disabled = !playlist?.tandas[tanda - 1];
  const praised = !disabled && isPraised(memory, playlist, tanda);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const label = praised
    ? t("praise.praised_tanda", { tanda: Math.max(1, tanda) })
    : t("praise.action_tanda", { tanda: Math.max(1, tanda) });
  const tap = () => {
    if (!playlist || disabled) return;
    haptic(8);
    if (praised) {
      useStore.getState().updateMemory((m) => praiseTanda(m, playlist, tanda));
      toast(t("praise.cleared_toast"));
      return;
    }
    setNote("");
    setOpen(true);
  };
  const save = () => {
    if (!playlist) return;
    useStore.getState().updateMemory((m) => praiseTanda(m, playlist, tanda, note));
    setOpen(false);
    toast(t("praise.saved_toast"));
  };
  return (
    <>
      <button
        type="button"
        className={`booth-floor-btn booth-praise-btn ${compact ? "booth-praise-compact" : ""}`}
        aria-pressed={praised}
        aria-label={compact ? label : undefined}
        title={compact ? label : undefined}
        disabled={disabled}
        onClick={tap}
        data-testid={`${testPrefix}-praise`}
      >
        <Star size={16} strokeWidth={2} aria-hidden fill={praised ? "currentColor" : "none"} />
        {!compact && <span>{praised ? t("praise.praised") : t("praise.action")}</span>}
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t("praise.sheet_title", { tanda: Math.max(1, tanda) })}
        trailing={t("praise.save")}
        onTrailing={save}
        detents={["medium"]}
        testId="praise-sheet"
      >
        <Group footer={t("praise.sheet_footer")}>
          <label htmlFor={`${testPrefix}-praise-note`} className="cell">
            <span className="sr-only">{t("praise.note_label")}</span>
            <input
              id={`${testPrefix}-praise-note`}
              className="field min-h-11 w-full"
              value={note}
              maxLength={120}
              placeholder={t("praise.note_placeholder")}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
              }}
              data-testid="praise-note"
            />
          </label>
        </Group>
      </Sheet>
    </>
  );
}
