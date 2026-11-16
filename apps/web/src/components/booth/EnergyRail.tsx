"use client";
import { MoveVertical } from "lucide-react";
import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import { nightEnergy, scrubAt, scrubStep } from "@/lib/booth/energyChart";
import { energyDomain, energyTicks, hereLabelSpot } from "@/lib/booth/energyLayout";
import { useIndicators } from "@/lib/booth/indicatorPrefs";
import { useBooth } from "@/lib/booth/store";
import { useMediaQuery } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { ArmButton } from "./Confirm";

const RHYTHM_COLOR: Record<string, string> = {
  tango: "var(--tone-tango, #b3264f)",
  vals: "var(--tone-vals, #0f766e)",
  milonga: "var(--tone-milonga, #6d28d9)",
};

let measurer: CanvasRenderingContext2D | null | undefined;
/**
 * The "we are here" pill's text width as drawn (600 11 px in the page's font). 2026-11 (QA, 1440: the card's 154 px
 * chart had a 78 px clear run beside the night's first dots, and the old 6.2 px-per-letter guess asked for 81, so the
 * label went missing before the night): measured, the guess only where there is no canvas.
 */
function hereTextWidth(word: string): number {
  const guess = Math.ceil(word.length * 6.2);
  if (typeof document === "undefined") return guess;
  try {
    measurer ??= document.createElement("canvas").getContext("2d");
    if (!measurer) return guess;
    measurer.font = `600 11px ${getComputedStyle(document.body).fontFamily}`;
    const w = measurer.measureText(word).width;
    return w > 0 ? Math.ceil(w) : guess;
  } catch {
    return guess;
  }
}

/**
 * Round 22 — the night's energy, vertical like the night's arc: time runs down, energy to the right, one dot per
 * tanda in its rhythm colour, the composed shape dashed, and "we are here" at the playhead. Hover or long-press a
 * dot for its tanda. Tapping a dot shows that tanda in the set list. Hidden when Energy is off in Settings.
 *
 * 2026-11 ("a button to activate, then slide to an energy cross-section … to play from there"): Scrub (off by
 * default, so a stray touch never changes the room) puts a cursor line on the chart; dragging it or the arrow keys
 * move it tanda by tanda and say the tanda, the song at that point and its energy; "Play from tanda N" plays its
 * first song in the room (mid-night with the light confirmation), "Pre-listen" plays it in the headphones when they
 * are chosen. The "we are here" line stays.
 *
 * 2026-11 (wave 2: a tanda's ~9 px dot is far under the 44 px touch target): as on Compose's night chart, a touch
 * screen (`pointer: coarse`) has no per-tanda tap targets: the dots are a mouse shortcut only, and on touch the chart
 * is one control, through Scrub (a drag anywhere, the keys one tanda a step). With Scrub off a touch on the chart
 * does nothing at all, so a stray touch still never changes the room.
 */
export function EnergyRail({ onJump }: { onJump?: (planIndex: number) => void }) {
  const on = useIndicators().energy;
  const plan = useBooth((s) => s.plan);
  const playlist = useBooth((s) => s.playlist);
  const planIndex = useBooth((s) => s.planIndex);
  const started = useBooth((s) => s.started);
  const cue = useBooth((s) => s.outputs.cue);
  // the marker moves per tanda item, not per frame: position is read once per item change
  const position = useBooth((s) => Math.floor(s.position / 15) * 15);
  // 2026-11 (DJ review: the chart's labels were 7 px once the 200-unit chart shrank into its column): the labels keep
  // 11 px on screen whatever the chart's drawn width (`k`: chart units per screen pixel)
  const svg = useRef<SVGSVGElement>(null);
  // 2026-11 (the owner: the dots squeezed into the middle third): the drawing takes the box's own shape (no letterbox)
  const [boxW, setBoxW] = useState(200);
  const [boxH, setBoxH] = useState(300);
  const [scrub, setScrub] = useState(false);
  const [at, setAt] = useState<number | null>(null);
  const drag = useRef(false);
  const coarse = useMediaQuery("(pointer: coarse)");
  useEffect(() => {
    const el = svg.current;
    if (!el || typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setBoxW(Math.round(r.width));
        setBoxH(Math.round(r.height));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  });
  if (!on || !plan || !playlist?.tandas.length) return null;
  const c = nightEnergy(playlist, plan, planIndex, position);
  // one chart unit is one screen pixel: the labels keep 11 px, the plot spans the card's width
  const W = boxW;
  const H = boxH;
  const k = 1;
  const padT = 10;
  const padB = 14;
  const padL = 26;
  const padR = 10;
  // the night's own energy range (QA: its 48–66 sat in the middle third of a 0–100 axis)
  const dom = energyDomain([
    ...c.points.map((p) => p.energy),
    ...c.points.flatMap((p) => (p.target === null ? [] : [p.target])),
  ]);
  const x = (e: number) => padL + ((e - dom[0]) / (dom[1] - dom[0])) * (W - padL - padR);
  const y = (f: number) => padT + f * (H - padT - padB);
  const mid = (p: { at: number; end: number }) => (p.at + p.end) / 2;
  // "we are here": a pill on the line's side and at the x where it covers no dot (never over the chart's dots)
  const hereWord = t("booth.energyRail.we_are_here");
  const HERE_H = 16;
  const hereW = hereTextWidth(hereWord) + 12;
  const here = hereLabelSpot(
    y(c.here),
    c.points.map((p) => ({ x: x(p.energy), y: y(mid(p)), r: 6 })),
    hereW,
    HERE_H,
    [padL, W - padR],
    3,
    [0, H],
  );
  const line = c.points.map((p) => `${x(p.energy)},${y(mid(p))}`).join(" ");
  const target = c.points.filter((p) => p.target !== null);
  const s = scrub && at !== null ? scrubAt(c, plan, at) : null;
  const sItem = s && s.item >= 0 ? plan.items[s.item] : null;
  const what = s
    ? t("booth.ui2.scrub_what", {
        tanda: s.tanda,
        label: s.label,
        title: sItem?.title ?? "",
        energy: s.energy,
      })
    : "";
  /** the pointer's place on the night's clock (0–1), from its y on the drawn chart */
  const fracOf = (clientX: number, clientY: number) => {
    const el = svg.current;
    if (!el) return 0;
    // the chart's own units (the drawing is letterboxed inside its box: viewBox, preserveAspectRatio)
    const m = el.getScreenCTM?.();
    let u: number;
    if (m && typeof DOMPoint === "function")
      u = new DOMPoint(clientX, clientY).matrixTransform(m.inverse()).y;
    else {
      const r = el.getBoundingClientRect();
      if (r.height <= 0) return 0;
      u = ((clientY - r.top) / r.height) * H;
    }
    return Math.max(0, Math.min(1, (u - padT) / (H - padT - padB)));
  };
  const toggle = () => {
    if (!scrub) setAt(c.here);
    setScrub(!scrub);
  };
  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    if (!scrub) return;
    drag.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setAt(fracOf(e.clientX, e.clientY));
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (scrub && drag.current) setAt(fracOf(e.clientX, e.clientY));
  };
  const onUp = () => {
    drag.current = false;
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!scrub) return;
    const cur = scrubAt(c, plan, at ?? c.here).tanda;
    let to: number | null = null;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") to = scrubStep(c, cur, 1);
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") to = scrubStep(c, cur, -1);
    else if (e.key === "Home") to = scrubStep(c, c.points[0]?.tanda ?? 1, -1);
    else if (e.key === "End") to = scrubStep(c, c.points[c.points.length - 1]?.tanda ?? 1, 1);
    if (to === null) return;
    e.preventDefault();
    e.stopPropagation();
    setAt(to);
  };
  const playFrom = (i: number) => {
    const b = useBooth.getState();
    setScrub(false);
    if (!b.started) {
      if (b.select(i)) void b.start();
      return;
    }
    b.playNow(i).catch(() => toast(t("booth.ui2.play_now_failed", { title: plan.items[i]?.title ?? "" })));
  };
  const canCue = !!cue && !useBooth.getState().cueBlocked();
  return (
    <section
      className="booth-card booth-energy"
      data-testid="booth-energy-rail"
      aria-label={t("booth.energyRail.the_night_s_energy")}
    >
      <div className="booth-energy-head">
        <p className="booth-eyebrow" data-hint={t("booth.energyRail.how_lively_each_tanda_is_from")}>
          {t("booth.energyRail.energy_tonight")}
        </p>
        <button
          type="button"
          className="booth-scrub-toggle"
          aria-pressed={scrub}
          onClick={toggle}
          data-hint={t("booth.ui2.scrub_hint")}
          data-testid="booth-scrub-toggle"
        >
          <MoveVertical size={14} strokeWidth={2.25} aria-hidden />
          <span>{t("booth.ui2.scrub")}</span>
        </button>
      </div>
      {/* with Scrub on, the keyboard's slider (one step a tanda); the pointer drags on the chart itself */}
      {scrub && s && (
        <input
          type="range"
          className="sr-only booth-scrub-input"
          min={1}
          max={Math.max(1, c.points.length)}
          step={1}
          value={s.tanda}
          aria-label={t("booth.ui2.scrub_slider")}
          aria-valuetext={what}
          onChange={(e) => {
            const p = c.points.find((x) => x.tanda === Number(e.target.value));
            if (p) setAt((p.at + p.end) / 2);
          }}
          onKeyDown={onKey}
          data-testid="booth-scrub-input"
        />
      )}
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        data-scrub={scrub || undefined}
        data-testid="booth-energy-svg"
        aria-label={t("booth.energyRail.energy_of_tandas_we_are_in", {
          length: c.points.length,
          hereTanda: c.hereTanda,
        })}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {energyTicks(dom).map((g) => (
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
                <text
                  x={padL - 12}
                  y={y(mid(p))}
                  fontSize={11 * k}
                  textAnchor="end"
                  dominantBaseline="central"
                  fill="var(--label-2)"
                >
                  {p.tanda}
                </text>
              )}
              {/* biome-ignore lint/a11y/noStaticElementInteractions: a pointer shortcut; the set list has every tanda */}
              <circle
                cx={x(p.energy)}
                cy={y(mid(p))}
                r={p.tanda === c.hereTanda || p.tanda === s?.tanda ? 6 : 4.5}
                fill={RHYTHM_COLOR[p.rhythm] ?? "var(--label-2)"}
                opacity={done ? 0.45 : 1}
                stroke={p.tanda === c.hereTanda || p.tanda === s?.tanda ? "var(--label)" : "none"}
                strokeWidth={1.5}
                data-hint={t("booth.energyRail.tanda_energy", {
                  tanda: p.tanda,
                  rhythm: p.rhythm,
                  label: p.label,
                  energy: p.energy,
                  p1:
                    p.target !== null
                      ? ` ${t("booth.energyRail.planned_2", { p1: Math.round(p.target) })}`
                      : "",
                })}
                style={{ cursor: onJump && !scrub && !coarse ? "pointer" : undefined }}
                onClick={coarse ? undefined : () => !scrub && first >= 0 && onJump?.(first)}
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
          {here && (
            <g data-testid="booth-here-label">
              <rect
                x={here.x}
                y={here.y}
                width={hereW}
                height={HERE_H}
                rx={HERE_H / 2}
                fill="rgb(var(--bg-cell))"
                stroke="var(--room)"
                strokeWidth={1}
              />
              <text
                x={here.x + hereW / 2}
                y={here.y + HERE_H / 2}
                fontSize={11 * k}
                fontWeight={600}
                textAnchor="middle"
                dominantBaseline="central"
                fill="var(--room)"
              >
                {hereWord}
              </text>
            </g>
          )}
        </g>
        {s && (
          <g data-testid="booth-scrub-line" data-tanda={s.tanda} data-at={s.at.toFixed(3)}>
            <line
              x1={padL - 6}
              x2={W - padR}
              y1={y(s.at)}
              y2={y(s.at)}
              stroke="var(--label)"
              strokeWidth={1.4}
              strokeDasharray="4 3"
            />
            <text
              x={padL}
              y={y(s.at) + (s.at > 0.9 ? -4 : 12 * k)}
              fontSize={11 * k}
              fontWeight={700}
              fill="var(--label)"
            >
              {t("booth.ui2.scrub_mark", { tanda: s.tanda, energy: s.energy })}
            </text>
          </g>
        )}
      </svg>
      {s && s.first >= 0 ? (
        <div className="booth-scrub-out" data-testid="booth-scrub-out">
          <p className="booth-scrub-what" aria-live="polite">
            {what}
          </p>
          <ArmButton
            armKey={`play-now:${s.first}`}
            onConfirm={() => playFrom(s.first)}
            data-testid="booth-scrub-play"
            disabled={started && s.first === planIndex}
          >
            {t("booth.ui2.play_from_tanda", { tanda: s.tanda })}
          </ArmButton>
          {started && canCue && (
            <button
              type="button"
              data-cue
              data-testid="booth-scrub-cue"
              onClick={() => void useBooth.getState().prelisten({ i: s.first })}
            >
              {t("booth.ui2.prelisten_tanda", { tanda: s.tanda })}
            </button>
          )}
        </div>
      ) : (
        <div className="booth-energy-legend" aria-hidden>
          <span>
            <i style={{ background: RHYTHM_COLOR.tango }} />

            {t("booth.energyRail.tango")}
          </span>
          <span>
            <i style={{ background: RHYTHM_COLOR.vals }} />

            {t("booth.energyRail.vals")}
          </span>
          <span>
            <i style={{ background: RHYTHM_COLOR.milonga }} />

            {t("booth.energyRail.milonga")}
          </span>
          <span>{t("booth.energyRail.planned")}</span>
        </div>
      )}
    </section>
  );
}
