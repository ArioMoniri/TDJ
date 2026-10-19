"use client";
import { useEffect, useState } from "react";
import { clockLabel, driftLabel, durationLabel } from "@/lib/booth/plan";
import { useBooth } from "@/lib/booth/store";

/**
 * Time (round7-booth.md §1.1): wall clock at 28 pt, planned end, time to Cumparsita at 44 pt, drift chip, tandas
 * left, the break countdown while inside a break.
 */
export function TimeCard() {
  const plan = useBooth((s) => s.plan);
  const planIndex = useBooth((s) => s.planIndex);
  const remaining = useBooth((s) => s.remaining);
  const ttc = useBooth((s) => s.timeToCumparsita);
  const drift = useBooth((s) => s.drift);
  const breakUntil = useBooth((s) => s.breakUntil);
  const started = useBooth((s) => s.started);
  const startedWall = useBooth((s) => s.startedWall);
  const rehearsal = useBooth((s) => s.rehearsal);
  const playlist = useBooth((s) => s.playlist);
  // 0 until mounted: the server cannot know the DJ's clock (a hydration mismatch otherwise)
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!plan) return null;
  const cur = plan.items[planIndex];
  const tandas = playlist?.tandas.length ?? 0;
  const left = cur
    ? Math.max(0, tandas - (cur.kind === "closing" && cur.tanda > 0 ? tandas : cur.tanda))
    : tandas;
  const end = (started && startedWall ? startedWall : now) + remaining * 1000;
  return (
    <section
      className="booth-card"
      data-testid="booth-time"
      aria-label="Time"
      data-ttc={Math.round(ttc)}
      data-remaining={Math.round(remaining)}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="booth-clock" data-testid="booth-clock">
          {now ? clockLabel(now) : "--:--"}
        </span>
        <span className="text-subhead text-[var(--label-2)]">
          ends {now ? clockLabel(end) : "--:--"}
          {rehearsal ? " (rehearsal)" : ""}
        </span>
      </div>
      <p className="booth-eyebrow mt-3">Time to La Cumparsita</p>
      <span className="booth-big block" data-testid="booth-ttc">
        {durationLabel(ttc)}
      </span>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span
          className={`booth-chip tabular-nums ${Math.abs(drift) >= 60 ? "text-[var(--system-gold)]" : ""}`}
          data-testid="booth-drift"
        >
          {started
            ? `${driftLabel(drift)} ${drift > 1 ? "late" : drift < -1 ? "early" : "on plan"}`
            : "not started"}
        </span>
        <span className="booth-chip">
          {left} tanda{left === 1 ? "" : "s"} left
        </span>
        {breakUntil !== null && (
          <span className="booth-chip text-[var(--tint)]" data-testid="booth-break">
            break · {durationLabel(Math.max(0, (breakUntil - now) / 1000))}
          </span>
        )}
      </div>
    </section>
  );
}
