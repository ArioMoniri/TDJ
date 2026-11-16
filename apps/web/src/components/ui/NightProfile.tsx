"use client";
import { t as tx } from "@/lib/i18n";
import "./compose-db.css";
import { tandaTone } from "@tdj/core";
import { memo, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { patchedSong } from "@/lib/audio";
import { toneText } from "@/lib/engineText";
import { useMediaQuery } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import type { Playlist } from "@/lib/types";
import { EraLegend } from "./EraBadge";

const RHYTHM: Record<string, string> = { tango: "#e0557a", vals: "#4fd1c5", milonga: "#8b7cf6" };

/** a press that moves this far sideways (screen px) is a drag across the tandas, not a tap */
const DRAG_PX = 8;

/**
 * Round 22 — the night song by song: one bar per side (height = energy, colour = rhythm), the tandas apart, each with
 * its tone (mode, feel and mean BPM) under it on hover / focus, BPM and key of the side in its label. Tapping a tanda
 * scrolls to its card. With the era legend, so the badges on the rows read at a glance.
 *
 * 2026-11 (wave 2, iPad landscape: 25 tandas in ~550 px left each tanda a ~21 px target): the chart is one control.
 * For the keyboard and screen readers it is one slider (← / → one tanda, Home / End, Enter opens the tanda), its
 * value text naming the tanda. On a touch screen (`pointer: coarse`) the per-tanda targets go: a tap, or a sideways
 * drag, anywhere on the chart picks the tanda whose full-height column is under the finger, shows it in the readout
 * above the chart and, on release, opens it as a tap on the tanda did. A vertical swipe still scrolls the page
 * (touch-action: pan-y; the browser cancels the press). A mouse keeps its per-tanda hover and click.
 */
export const NightProfile = memo(function NightProfile({
  playlist,
  onPick,
}: {
  playlist: Playlist;
  onPick?: (i: number) => void;
}) {
  const ids = useMemo(() => playlist.tandas.flatMap((t) => t.songs.map((s) => s.id)), [playlist]);
  const patches = useStore(useShallow((s) => ids.map((id) => s.overrides.songs?.[id])));
  const coarse = useMediaQuery("(pointer: coarse)");
  const [hover, setHover] = useState<number | null>(null);
  // the slider's value: the tanda picked by a tap, a drag or the keys (null: none yet)
  const [sel, setSel] = useState<number | null>(null);
  const press = useRef<{ x: number; moved: boolean } | null>(null);
  const tandas = useMemo(() => {
    let k = 0;
    return playlist.tandas.map((t) => {
      const own = t.songs.map(() => patches[k++]);
      const songs = t.songs.map((s, j) => patchedSong(s, own[j]));
      // the DJ's own key wins over the analysed one
      const keys = own.map((p) => p?.key);
      return { t, songs, tone: tandaTone(songs, keys.some(Boolean) ? keys : undefined) };
    });
  }, [playlist, patches]);
  const n = tandas.length;
  // a new night with fewer tandas: the value stays in range
  const value = sel === null || !n ? null : Math.min(sel, n - 1);
  const bar = 5;
  const gap = 1.5;
  const tgap = 6;
  const H = 56;
  let x = 0;
  const layout = tandas.map(({ t, songs }, i) => {
    const x0 = x;
    const bars = songs.map((s, j) => {
      const e = Math.max(4, Math.min(100, s.energy ?? 50));
      const b = { x: x0 + j * (bar + gap), h: (e / 100) * (H - 4), s };
      return b;
    });
    x = x0 + songs.length * (bar + gap) - gap + tgap;
    return { i, t, x0, w: songs.length * (bar + gap) - gap, bars };
  });
  const W = Math.max(1, x - tgap);
  const shown = hover ?? value;
  const cur = shown !== null ? tandas[shown] : null;
  const label = (i: number) =>
    tx("nightProfile.tanda", {
      p1: i + 1,
      orchestra: tandas[i]?.t.orchestra ?? "",
      p2: tandas[i]?.tone ? toneText(tandas[i]!.tone!) : "",
    });
  /** the tanda whose full-height column (half the gap either side) holds the pointer's x */
  const tandaAt = (el: Element, clientX: number) => {
    const r = el.getBoundingClientRect();
    const u = r.width > 0 ? ((clientX - r.left) / r.width) * W : 0;
    const hit = layout.findIndex((l) => u < l.x0 + l.w + tgap / 2);
    return hit < 0 ? n - 1 : hit;
  };
  const open = (i: number) => onPick?.(i);
  // touch: the whole chart is the one target (no per-tanda targets)
  const touch = coarse && n > 0;
  return (
    <div className="group-inset px-4 py-3" data-testid="night-profile">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-subhead font-semibold">{tx("nightProfile.song_by_song")}</h3>
        <span
          className="text-footnote truncate text-[var(--label-2)]"
          aria-live="polite"
          data-testid="night-profile-caption"
        >
          {cur
            ? tx("nightProfile.tanda_2", {
                p1: cur.t.index + 1,
                orchestra: cur.t.orchestra,
                p2: cur.tone ? toneText(cur.tone) : "",
              })
            : coarse
              ? tx("nightProfile.energy_of_every_side_tap_a")
              : tx("nightProfile.energy_of_every_side_hover_a")}
        </span>
      </div>
      <div
        className="mt-2 block h-14 w-full touch-pan-y select-none rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--tint)]"
        role="slider"
        tabIndex={n ? 0 : -1}
        aria-label={tx("nightProfile.energy_of_each_of_the_sides", { length: ids.length })}
        aria-orientation="horizontal"
        aria-valuemin={1}
        aria-valuemax={Math.max(1, n)}
        aria-valuenow={(value ?? 0) + 1}
        aria-valuetext={n ? label(value ?? 0) : undefined}
        data-testid="night-profile-chart"
        data-selected={value ?? undefined}
        data-touch={touch || undefined}
        style={{ cursor: onPick && touch ? "pointer" : undefined }}
        onFocus={() => {
          if (sel === null && n) setSel(0);
        }}
        onKeyDown={(e) => {
          if (!n) return;
          const at = value ?? 0;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSel(at);
            open(at);
            return;
          }
          const to =
            e.key === "ArrowRight" || e.key === "ArrowUp"
              ? Math.min(n - 1, at + 1)
              : e.key === "ArrowLeft" || e.key === "ArrowDown"
                ? Math.max(0, at - 1)
                : e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? n - 1
                    : null;
          if (to === null) return;
          e.preventDefault();
          setSel(to);
        }}
        // touch: a tap or a sideways drag anywhere picks; a vertical swipe scrolls the page (the browser cancels the
        // press once it pans, so nothing is picked)
        onPointerDown={(e) => {
          if (!touch || (e.pointerType === "mouse" && e.button !== 0)) return;
          press.current = { x: e.clientX, moved: false };
        }}
        onPointerMove={(e) => {
          const p = press.current;
          if (!touch || !p) return;
          if (!p.moved && Math.abs(e.clientX - p.x) > DRAG_PX) {
            p.moved = true;
            e.currentTarget.setPointerCapture?.(e.pointerId);
          }
          if (p.moved) setSel(tandaAt(e.currentTarget, e.clientX));
        }}
        onPointerUp={(e) => {
          const p = press.current;
          press.current = null;
          if (!touch || !p) return;
          const i = tandaAt(e.currentTarget, e.clientX);
          setSel(i);
          open(i);
        }}
        onPointerCancel={() => {
          press.current = null;
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-full w-full" aria-hidden>
          {layout.map(({ i, t, x0, w, bars }) => (
            // a mouse keeps its per-tanda hover and click; touch and the keyboard go through the chart's slider
            // biome-ignore lint/a11y/noStaticElementInteractions: a pointer shortcut; the chart itself is the slider
            <g
              key={`${i}-${t.songs[0]?.id}`}
              data-column={i + 1}
              onPointerEnter={touch ? undefined : () => setHover(i)}
              onPointerLeave={touch ? undefined : () => setHover(null)}
              onClick={
                touch
                  ? undefined
                  : () => {
                      setSel(i);
                      open(i);
                    }
              }
              style={{ cursor: onPick && !touch ? "pointer" : undefined }}
            >
              <rect
                x={x0 - 1}
                y={0}
                width={w + 2}
                height={H}
                fill={shown === i ? "var(--fill-4)" : "transparent"}
                rx={2}
              />
              {bars.map((b) => (
                <rect
                  key={b.s.id}
                  x={b.x}
                  y={H - b.h}
                  width={bar}
                  height={b.h}
                  rx={1.5}
                  fill={RHYTHM[t.rhythm] ?? "#8e8e93"}
                  opacity={t.bypass ? 0.35 : shown === null || shown === i ? 1 : 0.55}
                >
                  <title>
                    {tx("nightProfile.energy", {
                      title: b.s.title,
                      p1: b.s.energy ?? 50,
                      p2:
                        b.s.tempo?.bpm || b.s.audio?.bpm
                          ? ` ${tx("nightProfile.bpm", { p1: Math.round((b.s.tempo?.bpm || b.s.audio?.bpm)!) })}`
                          : "",
                    })}
                  </title>
                </rect>
              ))}
            </g>
          ))}
        </svg>
      </div>
      <EraLegend className="mt-3" />
    </div>
  );
});
