"use client";
import type { Playlist } from "@/lib/types";

const COLORS: Record<string, string> = { tango: "#e0557a", vals: "#4fd1c5", milonga: "#8b7cf6" };
const PHASES = ["warmup", "build", "peak", "cooldown"] as const;
const PHASE_LABEL: Record<string, string> = {
  warmup: "warm-up",
  build: "build",
  peak: "peak",
  cooldown: "cool-down",
};

/** Night arc: target curve (dashed) vs actual tanda energy, with axes, phase bands and keyboard-reachable dots. */
export function EnergyCurve({
  p,
  onPick,
  active,
  compact = false,
}: {
  p: Playlist;
  onPick?: (i: number) => void;
  active?: number | null;
  compact?: boolean;
}) {
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

  return (
    <figure className="m-0">
      {/* biome-ignore lint/a11y/useSemanticElements: SVG root grouping interactive dots; fieldset cannot wrap SVG content */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full select-none"
        role="group"
        aria-label="Energy arc of the night"
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e0557a" stopOpacity=".28" />
            <stop offset="1" stopColor="#e0557a" stopOpacity="0" />
          </linearGradient>
        </defs>
        {bands.map((b, k) => (
          <rect
            key={b.ph}
            x={Math.max(px, x(b.a) - half)}
            y={py}
            width={Math.min(W - px, x(b.b) + half) - Math.max(px, x(b.a) - half)}
            height={plotH}
            fill="currentColor"
            fillOpacity={k % 2 ? 0.05 : 0}
          />
        ))}
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
        <path
          d={`${smooth(p.stats.energyArc)} L${x(last)},${y(0)} L${x(0)},${y(0)} Z`}
          fill={`url(#${id})`}
        />
        <path
          d={smooth(p.stats.targetArc)}
          fill="none"
          stroke="currentColor"
          strokeOpacity=".45"
          strokeWidth="2"
          strokeDasharray="6 6"
        />
        <path
          d={smooth(p.stats.energyArc)}
          fill="none"
          stroke="#e0557a"
          strokeWidth="3"
          strokeLinecap="round"
        />
        {p.tandas.map((t, i) => {
          const cx = x(i);
          const cy = y(t.energy);
          const on = active === i;
          const r = on ? (compact ? 7 : 9) : compact ? 5 : 6.5;
          return (
            // biome-ignore lint/a11y/useSemanticElements: SVG has no native button element
            <g
              key={t.index}
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
              style={{ cursor: onPick ? "pointer" : "default", outline: "none" }}
              className="group/dot"
            >
              <circle
                cx={cx}
                cy={cy}
                r={r + 5}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="opacity-0 group-focus-visible/dot:opacity-100"
              />
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill={COLORS[t.rhythm]}
                stroke="rgb(var(--surface))"
                strokeWidth="2"
              />
              {t.rhythm === "vals" && <circle cx={cx} cy={cy} r={1.8} fill="#fff" />}
              {t.rhythm === "milonga" && (
                <rect x={cx - 1.8} y={cy - 1.8} width={3.6} height={3.6} fill="#fff" />
              )}
              <circle cx={cx} cy={cy} r="20" fill="transparent" stroke="none" />
            </g>
          );
        })}
        {bands.map((b) => (
          <text
            key={b.ph}
            x={(x(b.a) + x(b.b)) / 2}
            y={H - 4}
            fontSize={fs}
            textAnchor="middle"
            fill="currentColor"
            fillOpacity=".75"
          >
            {PHASE_LABEL[b.ph] ?? b.ph}
          </text>
        ))}
      </svg>
      <figcaption className="text-muted mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
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
      </figcaption>
    </figure>
  );
}
