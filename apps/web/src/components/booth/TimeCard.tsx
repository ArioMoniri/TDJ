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
  const resolving = useBooth((s) => s.resolving);
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
      {/* ≥ 1024: the clock + "ends" and the Cumparsita number side by side (`.booth-time-row`, round8-ux.md §1.6) */}
      <div className="booth-time-row">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0">
          <span className="booth-clock" data-testid="booth-clock">
            {now ? clockLabel(now) : "--:--"}
          </span>
          <span className="text-subhead text-[var(--label-2)]">
            ends {now ? clockLabel(end) : "--:--"}
            {rehearsal ? " · rehearsal" : ""}
          </span>
        </div>
        <div className="mt-3 lg:mt-0">
          <p className="booth-eyebrow booth-eyebrow-wrap">Time to La Cumparsita</p>
          {/* 0 while the sources are still being matched read as a bug (round8-qa.md B7) */}
          {resolving && !started ? (
            <span
              className="booth-big block text-[var(--label-3)]"
              data-testid="booth-ttc"
              data-resolving="1"
            >
              …
            </span>
          ) : (
            <span className="booth-big block" data-testid="booth-ttc">
              {durationLabel(ttc)}
            </span>
          )}
        </div>
      </div>
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
        {resolving && !started && (
          <span className="booth-chip" data-testid="booth-resolving">
            resolving sources…
          </span>
        )}
        {breakUntil !== null && (
          <span className="booth-chip text-[var(--tint)]" data-testid="booth-break">
            break · {durationLabel(Math.max(0, (breakUntil - now) / 1000))}
          </span>
        )}
      </div>
    </section>
  );
}
