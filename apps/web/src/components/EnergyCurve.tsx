"use client";
import type { Playlist } from "@/lib/types";

const COLORS: Record<string, string> = { tango: "#e0557a", vals: "#4fd1c5", milonga: "#8b7cf6" };

/** Night arc: target curve (dashed) vs actual tanda energy (dots), coloured by rhythm. Touch-friendly: whole SVG scales with width. */
export function EnergyCurve({
  p,
  onPick,
  active,
}: {
  p: Playlist;
  onPick?: (i: number) => void;
  active?: number | null;
}) {
  const W = 720,
    H = 200,
    px = 28,
    py = 18;
  const n = Math.max(1, p.tandas.length - 1);
  const x = (i: number) => px + (i / n) * (W - px * 2);
  const y = (e: number) => H - py - (e / 100) * (H - py * 2);
  const path = (vals: number[]) =>
    vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const smooth = (vals: number[]) => {
    if (vals.length < 3) return path(vals);
    let d = `M${x(0)},${y(vals[0]!)}`;
    for (let i = 1; i < vals.length; i++) {
      const cx = (x(i - 1) + x(i)) / 2;
      d += ` C${cx},${y(vals[i - 1]!)} ${cx},${y(vals[i]!)} ${x(i)},${y(vals[i]!)}`;
    }
    return d;
  };
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full select-none"
      role="img"
      aria-label="Energy arc of the night"
    >
      <defs>
        <linearGradient id="arcfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e0557a" stopOpacity=".35" />
          <stop offset="1" stopColor="#e0557a" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[25, 50, 75].map((g) => (
        <line
          key={g}
          x1={px}
          x2={W - px}
          y1={y(g)}
          y2={y(g)}
          stroke="currentColor"
          strokeOpacity=".12"
          strokeDasharray="2 6"
        />
      ))}
      <path
        d={`${smooth(p.stats.energyArc)} L${x(p.tandas.length - 1)},${H - py} L${x(0)},${H - py} Z`}
        fill="url(#arcfill)"
      />
      <path
        d={smooth(p.stats.targetArc)}
        fill="none"
        stroke="currentColor"
        strokeOpacity=".35"
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
      {p.tandas.map((t, i) => (
        <g key={t.index} onClick={() => onPick?.(i)} style={{ cursor: onPick ? "pointer" : "default" }}>
          <circle
            cx={x(i)}
            cy={y(t.energy)}
            r={active === i ? 11 : 7}
            fill={COLORS[t.rhythm]}
            stroke="#fff"
            strokeWidth="2.5"
          />
          <circle cx={x(i)} cy={y(t.energy)} r="16" fill="transparent">
            <title>{`${i + 1}. ${t.orchestra}${t.singer ? ` / ${t.singer}` : ""} · ${t.rhythm} · energy ${t.energy} (target ${t.targetEnergy})`}</title>
          </circle>
        </g>
      ))}
      {["warmup", "build", "peak", "cooldown"].map((ph) => {
        const idx = p.tandas.findIndex((t) => t.phase === ph);
        return idx === -1 ? null : (
          <text key={ph} x={x(idx)} y={H - 2} fontSize="11" fill="currentColor" fillOpacity=".55">
            {ph}
          </text>
        );
      })}
    </svg>
  );
}
