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
 * Press-and-hold for a transport button (lib/booth/confirm.ts): while a confirmation is needed a press arms a ring
 * that fills in 0.6 s and then runs the action; a shorter tap runs nothing and says "Hold to confirm". The keyboard
 * (a click with no pointer) arms the control instead: Enter again confirms, Esc cancels. When no confirmation is
 * needed (before the night, the setting off) a tap runs at once.
 */
export function useHoldConfirm(key: string, run: () => void) {
  const armed = useArmed(key);
  const [holding, setHolding] = useState(false);
  const [nudge, setNudge] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
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
    nudge,
    handlers: {
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (e.button !== 0 || !confirmNeeded()) return;
        fired.current = false;
        setNudge(false);
        setHolding(true);
        timer.current = setTimeout(() => {
          timer.current = null;
          fired.current = true;
          setHolding(false);
          haptic(12);
          disarm();
          runRef.current();
        }, HOLD_MS);
      },
      onPointerUp: () => {
        if (!timer.current) return;
        stop();
        setNudge(true);
        if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
        nudgeTimer.current = setTimeout(() => setNudge(false), 1600);
      },
      onPointerLeave: stop,
      onPointerCancel: stop,
      onClick: (e: { detail: number }) => {
        if (fired.current) {
          fired.current = false;
          return;
        }
        if (!confirmNeeded()) {
          disarm();
          runRef.current();
          return;
        }
        // a click without a pointer: the keyboard (Enter / Space) arms, a second one confirms
        if (e.detail === 0) guard(key, () => runRef.current());
      },
    },
  };
}

/** The ring a confirm control draws while armed (3 s countdown) or held (0.6 s fill). */
export function ConfirmRing() {
  return <span className="confirm-ring" aria-hidden />;
}

/**
 * Tap-to-arm (sheets, menus, rows, cards): the first tap arms ("Tap again to confirm", a 3 s countdown ring), the
 * second runs; with no confirmation needed the first tap runs. The words are added to the button, so its name keeps
 * its own words.
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
  const armed = useArmed(armKey);
  return (
    <button
      type="button"
      {...rest}
      className={`${className} confirm-host`}
      data-armed={armed || undefined}
      onClick={() => {
        if (guard(armKey, onConfirm) === "armed") haptic(6);
      }}
    >
      {children}
      {armed && (
        <>
          <span className="confirm-tag" role="status" data-testid="confirm-tag">
            {t("booth.confirm.tap_again")}
          </span>
          <ConfirmRing />
        </>
      )}
    </button>
  );
}
