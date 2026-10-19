"use client";
import { motion, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { DUR, EASE, SPRING, STAGGER } from "@/lib/motion";
import type { Playlist } from "@/lib/types";

const COLORS: Record<string, string> = { tango: "#e0557a", vals: "#4fd1c5", milonga: "#8b7cf6" };
const PHASES = ["warmup", "build", "peak", "cooldown"] as const;
const PHASE_LABEL: Record<string, string> = {
  warmup: "warm-up",
  build: "build",
  peak: "peak",
  cooldown: "cool-down",
};

/**
 * Night arc: target curve (dashed) vs actual tanda energy, with axes, phase bands and keyboard-reachable dots.
 * A fresh set (new `playKey`) draws on: bands → grid → path (pathLength) → dots → area → legend (1.3 s).
 * A recompose with the same tanda count morphs: the path's `d`, the dots' `cx`/`cy` and the bands tween in place.
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
  const px = compact ? 30 : 36;
  const py = 14;
  const bottom = 22;
  const fs = compact ? 11 : 12;
  const n = Math.max(1, p.tandas.length - 1);
  const plotW = W - px * 2;
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
  const id = compact ? "arcfill-compact" : "arcfill";
  const last = p.tandas.length - 1;
  const key: string | number = playKey ?? p.options.seed ?? p.id;

  // morph mode: same playKey as the previous render (a recompose that kept the length) → tween in place
  const lastKey = useRef<string | number | null>(null);
  const morph = lastKey.current === key;
  lastKey.current = key;

  const energyD = smooth(p.stats.energyArc);
  const areaD = `${energyD} L${x(last)},${y(0)} L${x(0)},${y(0)} Z`;
  const targetD = smooth(p.stats.targetArc);
  const morphT = { duration: DUR.slow, ease: EASE.inOut };
  const dotDelay = (i: number) => (reduced ? 0 : 0.3 + (i / n) * DUR.draw);
  const fadeV = (delay: number) => ({
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { delay: reduced ? 0 : delay, duration: DUR.base } },
  });
  const bandV = {
    hidden: { fillOpacity: 0 },
    show: (k: number) => ({
      fillOpacity: k % 2 ? 0.05 : 0,
      transition: { delay: reduced ? 0 : k * STAGGER.bands, duration: DUR.base },
    }),
  };
  const lineV = {
    hidden: { d: energyD, pathLength: reduced ? 1 : 0, opacity: reduced ? 0 : 1 },
    show: {
      d: energyD,
      pathLength: 1,
      opacity: 1,
      transition: { delay: reduced ? 0 : 0.3, duration: reduced ? DUR.base : DUR.draw, ease: EASE.out },
    },
  };
  const areaV = {
    hidden: { d: areaD, opacity: 0 },
    show: { d: areaD, opacity: 1, transition: { delay: reduced ? 0 : 1.1, duration: DUR.slow } },
  };
  const targetV = { hidden: { d: targetD }, show: { d: targetD } };
  const dotV = {
    hidden: { scale: reduced ? 1 : 0, opacity: reduced ? 0 : 1 },
    show: (i: number) => ({
      scale: 1,
      opacity: 1,
      transition: reduced ? { duration: DUR.base } : { ...SPRING.snappy, delay: dotDelay(i) },
    }),
  };

  /** Phones: accept the nearest dot within 22 px of the touch so a thumb near the line always lands. */
  const onSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onPick || e.pointerType !== "touch") return;
    const r = e.currentTarget.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * W;
    const sy = ((e.clientY - r.top) / r.height) * H;
    let best = -1;
    let bestD = 22 * (W / r.width);
    p.tandas.forEach((t, i) => {
      const d = Math.hypot(x(i) - sx, y(t.energy) - sy);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0) {
      e.preventDefault();
      onPick(best);
    }
  };

  return (
    <figure className="m-0">
      <motion.svg
        key={key}
        initial={morph ? false : "hidden"}
        animate="show"
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full select-none"
        role="group"
        aria-label="Energy arc of the night"
        onPointerDown={onSvgPointerDown}
        data-mode={morph ? "morph" : "draw"}
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e0557a" stopOpacity=".28" />
            <stop offset="1" stopColor="#e0557a" stopOpacity="0" />
          </linearGradient>
        </defs>
        {bands.map((b, k) => {
          const bx = Math.max(px, x(b.a) - half);
          const bw = Math.min(W - px, x(b.b) + half) - bx;
          return (
            <motion.rect
              key={b.ph}
              custom={k}
              variants={{
                hidden: { ...bandV.hidden, attrX: bx, width: bw },
                show: (j: number) => ({ ...bandV.show(j), attrX: bx, width: bw }),
              }}
              animate={morph ? { attrX: bx, width: bw, fillOpacity: k % 2 ? 0.05 : 0 } : "show"}
              transition={morphT}
              y={py}
              height={plotH}
              fill="currentColor"
            />
          );
        })}
        <motion.g variants={fadeV(0.2)}>
          {[0, 50, 100].map((g) => (
            <g key={g}>
              <line
                x1={px}
                x2={W - px}
                y1={y(g)}
                y2={y(g)}
                stroke="currentColor"
                strokeOpacity={g === 50 ? 0.14 : 0.22}
                strokeDasharray={g === 50 ? "2 6" : undefined}
              />
              <text
                x={px - 6}
                y={y(g) + 4}
                fontSize={fs}
                textAnchor="end"
                fill="currentColor"
                fillOpacity=".75"
              >
                {g}
              </text>
            </g>
          ))}
          <motion.path
            variants={targetV}
            animate={morph ? { d: targetD } : "show"}
            transition={morphT}
            fill="none"
            stroke="currentColor"
            strokeOpacity=".45"
            strokeWidth="2"
            strokeDasharray="6 6"
          />
        </motion.g>
        <motion.path
          variants={areaV}
          animate={morph ? { d: areaD, opacity: dimmed ? 0.4 : 1 } : "show"}
          transition={morphT}
          fill={`url(#${id})`}
        />
        <motion.path
          variants={lineV}
          animate={morph ? { d: energyD, opacity: dimmed ? 0.4 : 1, pathLength: 1 } : "show"}
          transition={morphT}
          fill="none"
          stroke="#e0557a"
          strokeWidth="3"
          strokeLinecap="round"
          data-testid="energy-path"
        />
        {p.tandas.map((t, i) => {
          const cx = x(i);
          const cy = y(t.energy);
          const on = active === i;
          const r = on ? (compact ? 7 : 9) : compact ? 5 : 6.5;
          return (
            <motion.g
              key={t.index}
              custom={i}
              variants={dotV}
              animate={morph ? { opacity: dimmed ? 0.4 : 1, scale: 1 } : "show"}
              style={{ transformBox: "fill-box", outline: "none" }}
              role="button"
              tabIndex={onPick ? 0 : -1}
              aria-pressed={on}
              aria-label={`Tanda ${i + 1}, ${t.rhythm}, ${t.orchestra}${t.singer ? ` with ${t.singer}` : ""}, energy ${t.energy} of target ${t.targetEnergy}`}
              onClick={() => onPick?.(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onPick?.(i);
                }
              }}
              className={`group/dot ${onPick ? "cursor-pointer" : ""}`}
            >
              <motion.circle
                initial={false}
                animate={{ cx, cy }}
                transition={morphT}
                r={r + 5}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="opacity-0 group-focus-visible/dot:opacity-100"
              />
              <motion.circle
                initial={false}
                animate={{ cx, cy }}
                transition={morphT}
                r={r}
                fill={COLORS[t.rhythm]}
                stroke="rgb(var(--surface))"
                strokeWidth="2"
              />
              {t.rhythm === "vals" && (
                <motion.circle initial={false} animate={{ cx, cy }} transition={morphT} r={1.8} fill="#fff" />
              )}
              {t.rhythm === "milonga" && (
                <motion.rect
                  initial={false}
                  animate={{ attrX: cx - 1.8, attrY: cy - 1.8 }}
                  transition={morphT}
                  width={3.6}
                  height={3.6}
                  fill="#fff"
                />
              )}
              <motion.circle
                initial={false}
                animate={{ cx, cy }}
                transition={morphT}
                r="20"
                fill="transparent"
                stroke="none"
              />
            </motion.g>
          );
        })}
        <motion.g variants={fadeV(1.2)}>
          {bands.map((b) => (
            <motion.text
              key={b.ph}
              initial={false}
              animate={{ attrX: (x(b.a) + x(b.b)) / 2 }}
              transition={morphT}
              y={H - 4}
              fontSize={fs}
              textAnchor="middle"
              fill="currentColor"
              fillOpacity=".75"
            >
              {PHASE_LABEL[b.ph] ?? b.ph}
            </motion.text>
          ))}
        </motion.g>
      </motion.svg>
      <motion.figcaption
        key={`legend-${key}`}
        variants={fadeV(1.2)}
        initial={morph ? false : "hidden"}
        animate="show"
        className="text-muted mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-5 rounded bg-[#e0557a]" /> Energy
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0 w-5 border-t-2 border-dashed border-current opacity-60" /> Target arc
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS.tango }} /> Tango
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="relative h-2.5 w-2.5 rounded-full" style={{ background: COLORS.vals }}>
            <span className="absolute inset-[3px] rounded-full bg-white" />
          </span>{" "}
          Vals
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="relative h-2.5 w-2.5 rounded-full" style={{ background: COLORS.milonga }}>
            <span className="absolute inset-[3px] bg-white" />
          </span>{" "}
          Milonga
        </span>
      </motion.figcaption>
    </figure>
  );
}
