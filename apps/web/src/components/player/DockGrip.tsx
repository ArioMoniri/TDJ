"use client";
import { useDock } from "@/lib/dock/store";
import { t } from "@/lib/i18n";

/** what a tap (or Enter) on the grabber asks the shell: float the player as the gramophone */
export const DOCK_FLOAT_EVENT = "tdj:dock-float";

/**
 * The bottom bar's grabber (a phone, an iPad portrait): drag it off the bar and the player becomes the round
 * gramophone, wherever it is let go; a tap or Enter floats it too. Only the grabber starts a drag on the bar, so
 * the room's transport beside it never moves by accident.
 */
export function DockGrip() {
  const place = useDock((s) => s.place);
  if (place !== "bar") return null;
  return (
    <button
      type="button"
      className="dock-grip"
      aria-label={t("dock.float")}
      data-testid="player-grip"
      onPointerDown={(e) => useDock.getState().grip?.(e)}
      onClick={() => window.dispatchEvent(new Event(DOCK_FLOAT_EVENT))}
    >
      <span className="dock-grip-bar" aria-hidden />
    </button>
  );
}
