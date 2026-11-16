"use client";
import { useEffect, useRef, useState } from "react";
import { durationLabel } from "@/lib/booth/plan";
import { t } from "@/lib/i18n";
import { seekFraction, seekStep } from "@/lib/seek";

/** a pointer that moves farther than this (px) is a drag, not a tap */
export const SEEK_DRAG_PX = 8;
/** an armed tap waits this long for its second tap (ms) */
export const SEEK_ARM_MS = 3000;

/**
 * A scrubbable progress bar (2026-11, "slide the song to change where it's playing"): drag the thumb, tap anywhere
 * on the bar, or focus it and use ← / → (±5 s), Home / End. The whole 44 px row takes the pointer; the visible
 * track is thin. While a drag runs the thumb follows the finger and the seek lands on release (one seek, not fifty).
 *
 * `confirmTap` (2026-11, the Booth mid-night: one stray tap moved the room's song): a drag (more than 8 px) still
 * seeks on release, but a single tap only marks the time and asks "Tap again to jump to 1:56"; a second tap near it
 * within 3 s jumps there. Before the night (and in a pre-listen) the bar seeks directly.
 */
export function SeekBar({
  value,
  max,
  onSeek,
  label,
  hint,
  disabled,
  confirmTap = false,
  testId,
  className = "",
}: {
  /** seconds in */
  value: number;
  /** the item's length, s */
  max: number;
  onSeek: (sec: number) => void;
  /** the accessible name */
  label: string;
  hint?: string;
  disabled?: boolean;
  /** a tap arms (shows the time), a second tap or a drag seeks */
  confirmTap?: boolean;
  testId?: string;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [armed, setArmed] = useState<number | null>(null);
  const press = useRef<{ x: number; moved: boolean } | null>(null);
  const len = Math.max(0, max);
  const shown = Math.max(0, Math.min(len, drag ?? value));
  const pct = len > 0 ? (shown / len) * 100 : 0;
  const at = (clientX: number) => {
    const r = el.current?.getBoundingClientRect();
    return r ? seekFraction(clientX, r.left, r.width) * len : 0;
  };
  const off = disabled || len <= 0;
  // an armed tap lapses after 3 s (and whenever the bar stops asking)
  useEffect(() => {
    if (armed === null) return;
    const id = setTimeout(() => setArmed(null), SEEK_ARM_MS);
    return () => clearTimeout(id);
  }, [armed]);
  useEffect(() => {
    if (!confirmTap || off) setArmed(null);
  }, [confirmTap, off]);
  /** a second tap lands "near" the armed time: within 4 % of the bar (at least 3 s) */
  const near = (sec: number) => armed !== null && Math.abs(sec - armed) <= Math.max(3, len * 0.04);
  const armPct = armed !== null && len > 0 ? (Math.min(len, armed) / len) * 100 : 0;
  return (
    <div
      ref={el}
      className={`seekbar ${className}`}
      role="slider"
      tabIndex={off ? -1 : 0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(len)}
      aria-valuenow={Math.round(shown)}
      aria-valuetext={`${durationLabel(shown)} / ${durationLabel(len)}`}
      aria-disabled={off || undefined}
      data-hint={hint}
      data-testid={testId}
      data-dragging={drag !== null || undefined}
      data-armed={armed !== null || undefined}
      data-confirm={confirmTap || undefined}
      onPointerDown={(e) => {
        if (off || (e.pointerType === "mouse" && e.button !== 0)) return;
        e.preventDefault();
        el.current?.focus({ preventScroll: true });
        e.currentTarget.setPointerCapture?.(e.pointerId);
        press.current = { x: e.clientX, moved: false };
        if (!confirmTap) setDrag(at(e.clientX));
      }}
      onPointerMove={(e) => {
        const p = press.current;
        if (!p) return;
        if (!p.moved && Math.abs(e.clientX - p.x) > SEEK_DRAG_PX) p.moved = true;
        if (!confirmTap || p.moved) setDrag(at(e.clientX));
      }}
      onPointerUp={(e) => {
        const p = press.current;
        press.current = null;
        if (!p) return;
        const to = at(e.clientX);
        setDrag(null);
        if (!confirmTap || p.moved) {
          setArmed(null);
          onSeek(to);
          return;
        }
        // a tap mid-night: the first marks the time, a second one near it jumps there
        if (near(to)) {
          const sec = armed!;
          setArmed(null);
          onSeek(sec);
        } else setArmed(to);
      }}
      onPointerCancel={() => {
        press.current = null;
        setDrag(null);
      }}
      onKeyDown={(e) => {
        if (off) return;
        if (e.key === "Escape" && armed !== null) {
          e.preventDefault();
          e.stopPropagation();
          setArmed(null);
          return;
        }
        // (with the focus on the bar, Enter confirms an armed tap)
        if (e.key === "Enter" && armed !== null) {
          e.preventDefault();
          e.stopPropagation();
          const sec = armed;
          setArmed(null);
          onSeek(sec);
          return;
        }
        const to = seekStep(e.key, value, len);
        if (to === null) return;
        e.preventDefault();
        e.stopPropagation();
        onSeek(to);
      }}
    >
      <span className="seekbar-track" aria-hidden>
        <span className="seekbar-fill" style={{ width: `${pct}%` }} />
        <span className="seekbar-thumb" style={{ left: `${pct}%` }} />
        {armed !== null && <span className="seekbar-mark" style={{ left: `${armPct}%` }} />}
      </span>
      {armed !== null && (
        <span
          className="seekbar-arm"
          role="status"
          data-testid={testId ? `${testId}-arm` : undefined}
          style={{ left: `${Math.min(85, Math.max(15, armPct))}%` }}
        >
          {t("booth.connect.tap_again_to_jump", { time: durationLabel(armed) })}
        </span>
      )}
    </div>
  );
}
