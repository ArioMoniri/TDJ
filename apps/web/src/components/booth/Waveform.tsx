"use client";
import { useRef } from "react";
import { durationLabel } from "@/lib/booth/plan";
import { clampCue, cueFromX } from "@/lib/booth/waveform";
import { t } from "@/lib/i18n";

/**
 * Round 22: a side's waveform with two handles — Cue (where it starts) and Stop (where it ends). Drag a handle, or
 * focus it and use ← / → (⇧ for 5 s). Without decoded audio the bars are a flat line and the handles still work on
 * the side's length. `at` draws the pre-listen playhead in the headphones colour.
 */
export function Waveform({
  peaks,
  durationSec,
  cue,
  onChange,
  at,
  disabled = false,
}: {
  peaks: number[] | null;
  durationSec: number;
  cue: { inSec: number; outSec: number };
  onChange: (c: { inSec: number; outSec: number }, moving: "in" | "out") => void;
  at?: number | null;
  disabled?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const dur = Math.max(1, durationSec);
  const pct = (s: number) => `${(Math.max(0, Math.min(dur, s)) / dur) * 100}%`;
  const bars = peaks?.length ? peaks : new Array<number>(120).fill(0.04);
  const move = (which: "in" | "out", sec: number) => {
    const next = clampCue({ ...cue, [which === "in" ? "inSec" : "outSec"]: sec }, dur, which);
    if (next.inSec !== cue.inSec || next.outSec !== cue.outSec) onChange(next, which);
  };
  const drag = (which: "in" | "out") => (ev: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    ev.preventDefault();
    const el = ev.currentTarget;
    el.setPointerCapture(ev.pointerId);
    const onMove = (e: PointerEvent) => {
      const r = box.current?.getBoundingClientRect();
      if (r) move(which, cueFromX(e.clientX - r.left, r.width, dur));
    };
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  };
  const key = (which: "in" | "out") => (e: React.KeyboardEvent) => {
    if (disabled) return;
    const step = e.shiftKey ? 5 : 1;
    const v = which === "in" ? cue.inSec : cue.outSec;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") move(which, v - step);
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") move(which, v + step);
    else if (e.key === "Home") move(which, which === "in" ? 0 : cue.inSec);
    else if (e.key === "End") move(which, which === "in" ? cue.outSec : dur);
    else return;
    e.preventDefault();
  };
  const w = bars.length;
  return (
    <div
      className="booth-wave"
      ref={box}
      data-testid="booth-wave"
      data-has-peaks={peaks?.length ? true : undefined}
    >
      <svg viewBox={`0 0 ${w} 100`} preserveAspectRatio="none" aria-hidden>
        {bars.map((v, i) => {
          const h = Math.max(2, v * 92);
          const sec = ((i + 0.5) / w) * dur;
          const inside = sec >= cue.inSec && sec <= cue.outSec;
          return (
            <rect
              key={i}
              x={i + 0.15}
              y={50 - h / 2}
              width={0.7}
              height={h}
              fill={inside ? "var(--label-2)" : "var(--label-4)"}
            />
          );
        })}
      </svg>
      <div className="booth-wave-cut" style={{ left: 0, width: pct(cue.inSec) }} />
      <div className="booth-wave-cut" style={{ left: pct(cue.outSec), right: 0 }} />
      {typeof at === "number" && at > 0 && <div className="booth-wave-play" style={{ left: pct(at) }} />}
      {(["in", "out"] as const).map((which) => {
        const v = which === "in" ? cue.inSec : cue.outSec;
        return (
          <div
            key={which}
            className="booth-wave-handle"
            style={{ left: pct(v) }}
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-label={
              which === "in"
                ? t("booth.waveform.cue_where_the_song_starts")
                : t("booth.waveform.stop_where_the_song_ends")
            }
            aria-valuemin={0}
            aria-valuemax={Math.round(dur)}
            aria-valuenow={Math.round(v * 10) / 10}
            aria-valuetext={durationLabel(v)}
            aria-disabled={disabled || undefined}
            data-testid={which === "in" ? "booth-cue-in" : "booth-cue-out"}
            data-hint={
              which === "in"
                ? "Cue: drag to where the song should start (skips a long intro or noise)."
                : "Stop: drag to where the song should end (cuts a long ending or applause)."
            }
            onPointerDown={drag(which)}
            onKeyDown={key(which)}
          >
            <span style={which === "in" ? { left: 24 } : { right: 24 }}>
              {which === "in" ? t("booth.waveform.cue") : t("booth.waveform.stop")}
            </span>
          </div>
        );
      })}
    </div>
  );
}
