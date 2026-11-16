"use client";
import "./fade.css";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { confirmNeeded, disarm, guard, HOLD_MS, useArmed } from "@/lib/booth/confirm";
import { useBooth } from "@/lib/booth/store";
import { haptic } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { ConfirmHint, ConfirmRing } from "./Confirm";

/**
 * 2026-11 (the owner: "Crossfade and Fade don't change on long click, there's no UI change, and they can't be
 * reversed") — the Fade and Crossfade buttons of the transport bar and the Controls panel, one behaviour:
 * - mid-night, press and hold: a ring fills in 0.6 s while the label says "Hold to fade", then it runs; a short tap
 *   arms it ("Again", a 3 s countdown ring) and a second tap runs it (as Next); the keyboard arms, Enter confirms;
 * - while it runs the button is pressed, counts down ("Cancel fade · 3 s") and a tap takes it back at once;
 * - after it, ⌘Z / Undo plays the song before it again from where it was (lib/booth/store.ts, lib/editHistory.ts);
 * - where the room's player cannot fade (Spotify Connect) it stays dim and a tap says why — never silently nothing.
 */
export function FadeButton({
  kind,
  label,
  short,
  why,
  hint,
  onRun,
  live,
  className,
  wordClass,
  testId,
  children,
}: {
  kind: "fade" | "crossfade";
  /** the accessible name */
  label: string;
  /** the visible word */
  short: string;
  /** why it cannot run (shown on a tap) */
  why?: string;
  hint?: string;
  onRun: () => void;
  /** the night sounds (nothing to fade otherwise) */
  live: boolean;
  className: string;
  wordClass: string;
  testId: string;
  children: ReactNode;
}) {
  const run = useBooth((s) => (s.fadeRun?.kind === kind ? s.fadeRun : null));
  const cancel = useBooth((s) => s.cancelFade);
  const armed = useArmed(kind);
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handled = useRef(false);
  const runRef = useRef(onRun);
  runRef.current = onRun;
  // the countdown while it runs
  const [, tick] = useState(0);
  useEffect(() => {
    if (!run) return;
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [run]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const blocked = !!why;
  const off = !live && !run;
  const left = run ? Math.max(0, Math.ceil((run.endsAtMs - Date.now()) / 1000)) : 0;
  const fire = () => {
    disarm();
    haptic(12);
    runRef.current();
  };
  const stopHold = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  // QA 2026-11: "Cancel fade · 4 s" was cut in a 70 px cell — the visible word is "Cancel · 4 s" (the accessible name
  // keeps the whole sentence); armed, the label stays and the one hint bubble says "Tap again or hold to confirm"
  const word = run
    ? t("booth.fade.cancel_short", { sec: left })
    : holding
      ? t(kind === "fade" ? "booth.fade.hold_fade" : "booth.fade.hold_crossfade")
      : short;
  return (
    <button
      type="button"
      className={`${className} confirm-host booth-fadebtn`}
      aria-label={
        run
          ? t(kind === "fade" ? "booth.fade.cancel_fade_label" : "booth.fade.cancel_crossfade_label")
          : label
      }
      aria-pressed={!!run}
      aria-disabled={off || blocked || undefined}
      aria-description={why ?? hint}
      title={why ?? hint ?? label}
      data-why={why}
      data-testid={testId}
      data-running={run ? kind : undefined}
      data-holding={holding || undefined}
      data-armed={armed || undefined}
      style={run ? ({ "--fade-sec": `${run.sec}s` } as React.CSSProperties) : undefined}
      onPointerDown={(e) => {
        handled.current = false;
        if (e.button !== 0 || run || off || blocked || !confirmNeeded()) return;
        setHolding(true);
        timer.current = setTimeout(() => {
          timer.current = null;
          handled.current = true;
          setHolding(false);
          fire();
        }, HOLD_MS);
      }}
      onPointerUp={() => {
        if (!timer.current) return;
        // a short tap: it arms (a second tap runs), as Next does
        stopHold();
        handled.current = true;
        if (guard(kind, () => runRef.current()) === "armed") haptic(6);
      }}
      onPointerLeave={stopHold}
      onPointerCancel={stopHold}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (handled.current) {
          handled.current = false;
          return;
        }
        if (run) {
          cancel();
          haptic(8);
          return;
        }
        if (blocked) {
          toast(why!);
          return;
        }
        if (off) return;
        guard(kind, () => runRef.current());
      }}
    >
      {children}
      <span className={wordClass} aria-hidden>
        {word}
      </span>
      {(holding || armed) && !run && <ConfirmRing />}
      {armed && !holding && !run && <ConfirmHint testId={`${testId}-nudge`} />}
      {run && <span className="booth-fadebtn-run" aria-hidden />}
      {run && (
        <span className="sr-only" role="status">
          {t(kind === "fade" ? "booth.fade.fading" : "booth.fade.crossfading", { sec: left })}
        </span>
      )}
    </button>
  );
}
