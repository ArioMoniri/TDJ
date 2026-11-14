"use client";
import { nightEnergy } from "@/lib/booth/energyChart";
import { useIndicators } from "@/lib/booth/indicatorPrefs";
import { useBooth } from "@/lib/booth/store";

const RHYTHM_COLOR: Record<string, string> = {
  tango: "var(--tone-tango, #b3264f)",
  vals: "var(--tone-vals, #0f766e)",
  milonga: "var(--tone-milonga, #6d28d9)",
};

/**
 * Round 22 — the night's energy, vertical like the night's arc: time runs down, energy to the right, one dot per
 * tanda in its rhythm colour, the composed shape dashed, and "we are here" at the playhead. Hover or long-press a
 * dot for its tanda. Tapping a dot shows that tanda in the set list. Hidden when Energy is off in Settings.
 */
export function EnergyRail({ onJump }: { onJump?: (planIndex: number) => void }) {
  const on = useIndicators().energy;
  const plan = useBooth((s) => s.plan);
  const playlist = useBooth((s) => s.playlist);
  const planIndex = useBooth((s) => s.planIndex);
  // the marker moves per tanda item, not per frame: position is read once per item change
  const position = useBooth((s) => Math.floor(s.position / 15) * 15);
  if (!on || !plan || !playlist?.tandas.length) return null;
  const c = nightEnergy(playlist, plan, planIndex, position);
  const W = 200;
  const H = 300;
  const padT = 10;
  const padB = 14;
  const padL = 26;
  const padR = 10;
  const x = (e: number) => padL + (e / 100) * (W - padL - padR);
  const y = (f: number) => padT + f * (H - padT - padB);
  const mid = (p: { at: number; end: number }) => (p.at + p.end) / 2;
  const line = c.points.map((p) => `${x(p.energy)},${y(mid(p))}`).join(" ");
  const target = c.points.filter((p) => p.target !== null);
  return (
    <section
      className="booth-card booth-energy"
      data-testid="booth-energy-rail"
      aria-label="The night's energy"
    >
      <p
        className="booth-eyebrow"
        data-hint="How lively each tanda is, from the start of the night (top) to the end"
      >
        Energy tonight
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Energy of ${c.points.length} tandas; we are in tanda ${c.hereTanda}`}
      >
        {[25, 50, 75].map((g) => (
          <line
            key={g}
            x1={x(g)}
            x2={x(g)}
            y1={padT}
            y2={H - padB}
            stroke="var(--separator)"
            strokeWidth={0.5}
          />
        ))}
        {target.length > 1 && (
          <polyline
            points={target.map((p) => `${x(p.target!)},${y(mid(p))}`).join(" ")}
            fill="none"
            stroke="var(--label-3)"
            strokeWidth={1.2}
            strokeDasharray="3 3"
          />
        )}
        <polyline
          points={line}
          fill="none"
          stroke="var(--label-2)"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        {c.points.map((p) => {
          const first = plan.items.findIndex((it) => it.tanda === p.tanda && it.kind === "track");
          const done = p.tanda < c.hereTanda;
          return (
            <g key={p.tanda}>
              {(p.tanda === 1 || p.tanda % 5 === 0) && (
                <text x={2} y={y(mid(p)) + 3} fontSize={9} fill="var(--label-3)">
                  {p.tanda}
                </text>
              )}
              {/* biome-ignore lint/a11y/noStaticElementInteractions: a pointer shortcut; the set list has every tanda */}
              <circle
                cx={x(p.energy)}
                cy={y(mid(p))}
                r={p.tanda === c.hereTanda ? 6 : 4.5}
                fill={RHYTHM_COLOR[p.rhythm] ?? "var(--label-2)"}
                opacity={done ? 0.45 : 1}
                stroke={p.tanda === c.hereTanda ? "var(--label)" : "none"}
                strokeWidth={1.5}
                data-hint={`Tanda ${p.tanda} · ${p.rhythm} · ${p.label} · energy ${p.energy}${p.target !== null ? ` (planned ${Math.round(p.target)})` : ""}`}
                style={{ cursor: onJump ? "pointer" : undefined }}
                onClick={() => first >= 0 && onJump?.(first)}
              />
            </g>
          );
        })}
        <g data-testid="booth-here" data-here={c.here.toFixed(3)}>
          <line
            x1={padL - 6}
            x2={W - padR}
            y1={y(c.here)}
            y2={y(c.here)}
            stroke="var(--room)"
            strokeWidth={1.2}
          />
          <path
            d={`M ${padL - 8} ${y(c.here) - 5} L ${padL - 1} ${y(c.here)} L ${padL - 8} ${y(c.here) + 5} Z`}
            fill="var(--room)"
          />
          <text
            x={W - padR}
            y={y(c.here) - 4}
            fontSize={10}
            fontWeight={600}
            textAnchor="end"
            fill="var(--room)"
          >
            we are here
          </text>
        </g>
      </svg>
      <div className="booth-energy-legend" aria-hidden>
        <span>
          <i style={{ background: RHYTHM_COLOR.tango }} />
          tango
        </span>
        <span>
          <i style={{ background: RHYTHM_COLOR.vals }} />
          vals
        </span>
        <span>
          <i style={{ background: RHYTHM_COLOR.milonga }} />
          milonga
        </span>
        <span>┄ planned</span>
      </div>
    </section>
  );
}
