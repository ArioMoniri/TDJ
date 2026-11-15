"use client";
import { useRef, useState } from "react";
import { durationLabel } from "@/lib/booth/plan";
import { seekFraction, seekStep } from "@/lib/seek";

/**
 * A scrubbable progress bar (2026-11, "slide the song to change where it's playing"): drag the thumb, tap anywhere
 * on the bar, or focus it and use ← / → (±5 s), Home / End. The whole 44 px row takes the pointer; the visible
 * track is thin. While a drag runs the thumb follows the finger and the seek lands on release (one seek, not fifty).
 */
export function SeekBar({
  value,
  max,
  onSeek,
  label,
  hint,
  disabled,
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
  testId?: string;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const len = Math.max(0, max);
  const shown = Math.max(0, Math.min(len, drag ?? value));
  const pct = len > 0 ? (shown / len) * 100 : 0;
  const at = (clientX: number) => {
    const r = el.current?.getBoundingClientRect();
    return r ? seekFraction(clientX, r.left, r.width) * len : 0;
  };
  const off = disabled || len <= 0;
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
      onPointerDown={(e) => {
        if (off || (e.pointerType === "mouse" && e.button !== 0)) return;
        e.preventDefault();
        el.current?.focus({ preventScroll: true });
        e.currentTarget.setPointerCapture?.(e.pointerId);
        setDrag(at(e.clientX));
      }}
      onPointerMove={(e) => {
        if (drag === null) return;
        setDrag(at(e.clientX));
      }}
      onPointerUp={(e) => {
        if (drag === null) return;
        const to = at(e.clientX);
        setDrag(null);
        onSeek(to);
      }}
      onPointerCancel={() => setDrag(null)}
      onKeyDown={(e) => {
        if (off) return;
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
      </span>
    </div>
  );
}
