"use client";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef } from "react";
import { lazy, lower, t as tx } from "@/lib/i18n";
import { DUR, EASE, SPRING, STAGGER } from "@/lib/motion";
import type { Playlist } from "@/lib/types";

export const RHYTHM_COLORS: Record<string, string> = {
  tango: "#e0557a",
  vals: "#4fd1c5",
  milonga: "#8b7cf6",
};
const PHASES = ["warmup", "build", "peak", "cooldown"] as const;
const PHASE_LABEL: Record<string, string> = lazy(() => ({
  warmup: lower(tx("phase.warmup")),
  build: lower(tx("phase.build")),
  peak: lower(tx("phase.peak")),
  cooldown: lower(tx("phase.cooldown")),
}));

/**
 * Night arc (Health-style chart): target curve (dashed) vs actual tanda energy, two gridlines with the labels on the
 * right, phase bands, keyboard-reachable dots. A fresh set (new `playKey`) draws on once: bands and grid fade in, then
 * one left-to-right sweep (a clip) reveals the line and its fill together, each dot popping as the sweep reaches it.
 * A recompose with the same tanda count morphs: the path `d`, the fill and the dots tween in place.
 * Wave 2: the line and the fill used to run two animations (a pathLength draw, then a late fade of a `d` tween that
 * started from another shape), and band rects animated `x` from null (a console error on every render): one sweep now,
 * and SVG attributes are plain numbers (only opacity, `d`, cx/cy and transforms animate).
 */
export function EnergyCurve({
  p,
  onPick,
  active,
  compact = false,
  playKey,
  dimmed = false,
}: {
  p: Playlist;
  onPick?: (i: number) => void;
  active?: number | null;
  compact?: boolean;
  /** changes on a fresh set (new seed or different length): re-runs the draw-on */
  playKey?: string | number;
  /** a recompose is in flight: the energy line and dots drop to 0.4 */
  dimmed?: boolean;
}) {
  const reduced = useReducedMotion();
  const W = compact ? 360 : 720;
  const H = compact ? 170 : 210;
  const px = compact ? 8 : 12;
  const pr = 28;
  const py = 14;
  const bottom = 22;
  const fs = 11;
  const n = Math.max(1, p.tandas.length - 1);
  const plotW = W - px - pr;
  const plotH = H - py - bottom;
  const x = (i: number) => px + (i / n) * plotW;
  const y = (e: number) => py + plotH - (e / 100) * plotH;
  const smooth = (vals: number[]) => {
    if (vals.length < 3)
      return vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    let d = `M${x(0)},${y(vals[0]!)}`;
    for (let i = 1; i < vals.length; i++) {
      const cx = (x(i - 1) + x(i)) / 2;
      d += ` C${cx},${y(vals[i - 1]!)} ${cx},${y(vals[i]!)} ${x(i)},${y(vals[i]!)}`;
    }
    return d;
  };
  const half = plotW / n / 2;
  const bands: Array<{ ph: string; a: number; b: number }> = [];
  for (const ph of PHASES) {
    // the closing tanda sits inside the cool-down band so the two labels never collide
    const idx = p.tandas
      .map((t, i) => (t.phase === ph || (ph === "cooldown" && t.phase === "close") ? i : -1))
      .filter((i) => i >= 0);
    if (idx.length) bands.push({ ph, a: idx[0]!, b: idx[idx.length - 1]! });
  }
  const at = p.tandas[active ?? 0];
  const activeText = at
    ? tx("energyCurve.tanda_energy_of_target", {
        p1: (active ?? 0) + 1,
        rhythm: at.rhythm,
        orchestra: at.orchestra,
        p2: at.singer ? ` ${tx("energyCurve.with", { singer: at.singer })}` : "",
        energy: at.energy,
        targetEnergy: at.targetEnergy,
      })
    : "";
  const uid = useId();
  const id = `${compact ? "arcfill-compact" : "arcfill"}-${uid}`;
  const capId = `arc-caption-${uid}`;
  const last = p.tandas.length - 1;
  const key: string | number = playKey ?? p.options.seed ?? p.id;

  // morph mode: the same playKey as the last committed render (a recompose that kept the length) → tween in place.
  // (read from the last commit, not the last render: a render React throws away must not turn a fresh set's draw off)
  const lastKey = useRef<string | number | null>(null);
  const morph = lastKey.current === key;
  useEffect(() => {
    lastKey.current = key;
  }, [key]);

  const energyD = smooth(p.stats.energyArc);
  const areaD = `${energyD} L${x(last)},${y(0)} L${x(0)},${y(0)} Z`;
  const targetD = smooth(p.stats.targetArc);
  const morphT = { duration: DUR.slow, ease: EASE.inOut };
  /** the sweep: one linear reveal, so a dot at x pops exactly when the line reaches it */
  const SWEEP_DELAY = 0.3;
  const dotDelay = (i: number) => (reduced ? 0 : SWEEP_DELAY + (i / n) * DUR.draw);
  const clipId = `${id}-sweep`;
  const fadeV = (delay: number) => ({
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { delay: reduced ? 0 : delay, duration: DUR.base } },
  });
  // bands fade in on `opacity` (transform/opacity only); the fill itself is rgb(text / --band-alpha), lighter on cream
  const bandV = {
    hidden: { opacity: 0 },
    show: (k: number) => ({
      opacity: k % 2 ? 1 : 0,
      transition: { delay: reduced ? 0 : k * STAGGER.bands, duration: DUR.base },
    }),
  };
  const sweepV = {
    hidden: { width: reduced ? W : 0, opacity: reduced ? 0 : 1 },
    show: {
      width: W,
      opacity: 1,
      transition: reduced
        ? { duration: DUR.base }
        : { delay: SWEEP_DELAY, duration: DUR.draw + half / plotW, ease: "linear" as const },
    },
  };
  const dotV = {
    hidden: { scale: reduced ? 1 : 0, opacity: reduced ? 0 : 1 },
    show: (i: number) => ({
      scale: 1,
      opacity: 1,
      transition: reduced ? { duration: DUR.base } : { ...SPRING.snappy, delay: dotDelay(i) },
    }),
  };

  /**
   * QA fix 2026-11 (the dots' 43 px targets sat 9.6 px apart on a phone, overlapping): the chart is one slider — a
   * press or a drag anywhere picks the tanda whose column is under the finger or the mouse (the whole chart is the
   * target), the arrow keys step through the tandas, Home / End jump to the first / last.
   */
  const pickAt = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onPick) return;
    const r = e.currentTarget.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(p.tandas.length - 1, Math.round(((sx - px) / plotW) * n)));
    if (i !== active) onPick(i);
  };
  const onSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onPick) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pickAt(e);
  };

  return (
    <figure className="m-0" aria-describedby={capId}>
      <motion.svg
        key={key}
        initial={morph ? false : "hidden"}
        animate="show"
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto min-h-11 w-full touch-pan-y select-none rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--tint)]"
        {...(onPick
          ? {
              role: "slider",
              tabIndex: 0,
              "aria-valuemin": 1,
              "aria-valuemax": p.tandas.length,
              "aria-valuenow": (active ?? 0) + 1,
              "aria-valuetext": activeText,
              "aria-orientation": "horizontal" as const,
            }
          : { role: "img" })}
        aria-label={tx("energyCurve.energy_arc_of_the_night")}
        onPointerDown={onSvgPointerDown}
        onPointerMove={(e) => {
          if (e.buttons && onPick) pickAt(e);
        }}
        onKeyDown={(e) => {
          if (!onPick) return;
          const last = p.tandas.length - 1;
          const cur = active ?? 0;
          const to =
            e.key === "ArrowRight" || e.key === "ArrowUp"
              ? Math.min(last, cur + 1)
              : e.key === "ArrowLeft" || e.key === "ArrowDown"
                ? Math.max(0, cur - 1)
                : e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? last
                    : null;
          if (to === null) return;
          e.preventDefault();
          onPick(to);
        }}
        data-testid="energy-slider"
        data-mode={morph ? "morph" : "draw"}
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--tint)" stopOpacity=".22" />
            <stop offset="1" stopColor="var(--tint)" stopOpacity="0" />
          </linearGradient>
          <clipPath id={clipId}>
            <motion.rect variants={sweepV} x={0} y={0} height={H} />
          </clipPath>
        </defs>
        {bands.map((b, k) => {
          const bx = Math.max(px, x(b.a) - half);
          const bw = Math.min(W - pr, x(b.b) + half) - bx;
          return (
            <motion.rect
              key={b.ph}
              custom={k}
              variants={bandV}
              animate={morph ? { opacity: k % 2 ? 1 : 0 } : "show"}
              transition={morphT}
              x={bx}
              y={py}
              width={Math.max(0, bw)}
              height={plotH}
              fill="rgb(var(--text) / var(--band-alpha))"
            />
          );
        })}
        <motion.g variants={fadeV(0.2)}>
          {[50, 100].map((g) => (
            <g key={g}>
              <line x1={px} x2={W - pr + 4} y1={y(g)} y2={y(g)} stroke="currentColor" strokeOpacity={0.12} />
              <text
                x={W - 4}
                y={y(g) + 4}
                fontSize={fs}
                textAnchor="end"
                fill="currentColor"
                fillOpacity=".5"
                className="tabular-nums"
              >
                {g}
              </text>
            </g>
          ))}
          <motion.path
            initial={false}
            animate={{ d: targetD }}
            transition={morphT}
            fill="none"
            stroke="currentColor"
            strokeOpacity=".35"
            strokeWidth="1.5"
            strokeDasharray="3 4"
          />
        </motion.g>
        {/* the line and its fill share one clip: a single sweep reveals both, in step */}
        <g clipPath={`url(#${clipId})`}>
          <motion.path
            initial={false}
            animate={{ d: areaD, opacity: dimmed ? 0.4 : 1 }}
            transition={morphT}
            fill={`url(#${id})`}
            data-testid="energy-area"
          />
          <motion.path
            initial={false}
            animate={{ d: energyD, opacity: dimmed ? 0.4 : 1 }}
            transition={morphT}
            fill="none"
            stroke="var(--tint)"
            strokeWidth="2.5"
            strokeLinecap="round"
            data-testid="energy-path"
          />
        </g>
        {p.tandas.map((t, i) => {
          const cx = x(i);
          const cy = y(t.energy);
          const on = active === i;
          const r = (compact ? 4.5 : 5.5) + (on ? 2 : 0);
          return (
            <motion.g
              key={t.index}
              custom={i}
              variants={dotV}
              animate={morph ? { opacity: dimmed ? 0.4 : 1, scale: 1 } : "show"}
              style={{ transformBox: "fill-box", outline: "none", pointerEvents: "none" }}
              aria-hidden
              data-on={on || undefined}
              className="group/dot"
            >
              {/* the hit area: 14 units round with a mouse, 44 px across on touch (globals.css .dot-hit) */}
              <motion.circle
                initial={false}
                animate={{ cx, cy }}
                transition={morphT}
                r={r + 5}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={on && onPick ? "opacity-60" : "opacity-0"}
              />
              <motion.circle
                initial={false}
                animate={{ cx, cy }}
                transition={morphT}
                r={r}
                fill={RHYTHM_COLORS[t.rhythm]}
                stroke="rgb(var(--bg-cell))"
                strokeWidth="2"
              />
              {t.rhythm === "vals" && (
                <motion.circle initial={false} animate={{ cx, cy }} transition={morphT} r={1.8} fill="#fff" />
              )}
              {t.rhythm === "milonga" && (
                // a square marker positioned by transform (x/y on an SVG element are transforms in motion), so
                // no attribute ever animates from null
                <motion.rect
                  initial={false}
                  animate={{ x: cx - 1.8, y: cy - 1.8 }}
                  transition={morphT}
                  width={3.6}
                  height={3.6}
                  fill="#fff"
                />
              )}
            </motion.g>
          );
        })}
        <motion.g variants={fadeV(1.2)}>
          {bands.map((b) => (
            <text
              key={b.ph}
              x={(x(b.a) + x(b.b)) / 2}
              y={H - 6}
              fontSize={fs}
              textAnchor="middle"
              fill="currentColor"
              fillOpacity=".5"
            >
              {PHASE_LABEL[b.ph] ?? b.ph}
            </text>
          ))}
        </motion.g>
      </motion.svg>
      <motion.figcaption
        key={`legend-${key}`}
        id={capId}
        variants={fadeV(1.2)}
        initial={morph ? false : "hidden"}
        animate="show"
        className="sr-only"
      >
        {tx("energyCurve.line_energy_dashed_target_dots_tango")}
        {p.options.arcShape ? ` ${tx("energyCurve.arc_shape_peak", { arcShape: p.options.arcShape })}` : ""}
      </motion.figcaption>
    </figure>
  );
}
