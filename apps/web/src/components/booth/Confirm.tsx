"use client";
import {
  type ButtonHTMLAttributes,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { confirmNeeded, disarm, guard, HOLD_MS, useArmed } from "@/lib/booth/confirm";
import { haptic } from "@/lib/haptics";
import { t } from "@/lib/i18n";

/**
 * The one mid-night confirmation for a control that changes what the room hears (lib/booth/confirm.ts; QA 2026-11:
 * Next was hold-only, Play now tap-twice-only, the mini player's Next silent on a tap): BOTH a second tap within 3 s
 * and a press-and-hold (a ring fills in 0.6 s) confirm. The first tap arms it — the same armed state everywhere
 * (`data-armed`, the countdown ring, the hint "Tap again or hold to confirm"). The keyboard (a click with no pointer)
 * arms too: Enter again confirms, Esc cancels. When no confirmation is needed (before the night, the setting off) a
 * tap runs at once.
 */
export function useHoldConfirm(key: string, run: () => void) {
  const armed = useArmed(key);
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // the pointer already answered this press (a hold that ran, or a tap that armed / confirmed): its click is spent
  const handled = useRef(false);
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  return {
    armed,
    holding,
    handlers: {
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        handled.current = false;
        if (e.button !== 0 || !confirmNeeded()) return;
        setHolding(true);
        timer.current = setTimeout(() => {
          timer.current = null;
          handled.current = true;
          setHolding(false);
          haptic(12);
          disarm();
          runRef.current();
        }, HOLD_MS);
      },
      onPointerUp: () => {
        if (!timer.current) return;
        // a short tap: the first arms, a second within 3 s confirms
        stop();
        handled.current = true;
        if (guard(key, () => runRef.current()) === "armed") haptic(6);
      },
      onPointerLeave: stop,
      onPointerCancel: stop,
      onClick: () => {
        if (handled.current) {
          handled.current = false;
          return;
        }
        if (!confirmNeeded()) {
          disarm();
          runRef.current();
          return;
        }
        // a click without a pointer press (the keyboard: Enter / Space) arms, a second one confirms
        guard(key, () => runRef.current());
      },
    },
  };
}

/** The words an armed control shows (one hint everywhere): "Tap again or hold to confirm". */
export function ConfirmHint({
  className = "booth-tbtn-nudge",
  testId,
}: {
  className?: string;
  testId?: string;
}) {
  return (
    <span className={className} role="status" data-testid={testId}>
      {t("booth.confirm.tap_again")}
    </span>
  );
}

/** The ring a confirm control draws while armed (3 s countdown) or held (0.6 s fill). */
export function ConfirmRing() {
  return <span className="confirm-ring" aria-hidden />;
}

/**
 * A sheet, menu, row or card action that changes the room (Play now, End tanda…): the same confirmation as the
 * transport (a second tap or a hold); with no confirmation needed the first tap runs. The words are added to the
 * button, so its name keeps its own words.
 */
export function ArmButton({
  armKey,
  onConfirm,
  children,
  className = "",
  ...rest
}: {
  armKey: string;
  onConfirm: () => void;
  children: ReactNode;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick">) {
  const hold = useHoldConfirm(armKey, onConfirm);
  return (
    <button
      type="button"
      {...rest}
      className={`${className} confirm-host`}
      data-armed={hold.armed || undefined}
      data-holding={hold.holding || undefined}
      {...hold.handlers}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
      {hold.armed && <ConfirmHint className="confirm-tag" testId="confirm-tag" />}
      {(hold.armed || hold.holding) && <ConfirmRing />}
    </button>
  );
}
