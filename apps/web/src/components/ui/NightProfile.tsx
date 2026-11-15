"use client";
import "./compose-db.css";
import { tandaTone } from "@tdj/core";
import { memo, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { patchedSong } from "@/lib/audio";
import { useStore } from "@/lib/store";
import type { Playlist } from "@/lib/types";
import { EraLegend } from "./EraBadge";

const RHYTHM: Record<string, string> = { tango: "#e0557a", vals: "#4fd1c5", milonga: "#8b7cf6" };

/**
 * Round 22 — the night song by song: one bar per side (height = energy, colour = rhythm), the tandas apart, each with
 * its tone (mode, feel and mean BPM) under it on hover / focus, BPM and key of the side in its label. Tapping a tanda
 * scrolls to its card. With the era legend, so the badges on the rows read at a glance.
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
  const [hover, setHover] = useState<number | null>(null);
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
  const cur = hover !== null ? tandas[hover] : null;
  return (
    <div className="group-inset px-4 py-3" data-testid="night-profile">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-subhead font-semibold">Song by song</h3>
        <span
          className="text-footnote truncate text-[var(--label-2)]"
          aria-live="polite"
          data-testid="night-profile-caption"
        >
          {cur
            ? `Tanda ${cur.t.index + 1} · ${cur.t.orchestra} · ${cur.tone?.label ?? ""}`
            : "Energy of every side; hover a tanda for its tone"}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="mt-2 block h-14 w-full"
        role="img"
        aria-label={`Energy of each of the ${ids.length} sides, tanda by tanda`}
      >
        {layout.map(({ i, t, x0, w, bars }) => (
          // biome-ignore lint/a11y/useSemanticElements: an SVG group stands for the tanda; it is focusable and labelled
          <g
            key={`${i}-${t.songs[0]?.id}`}
            role="button"
            tabIndex={0}
            aria-label={`Tanda ${i + 1}, ${t.orchestra}: ${tandas[i]?.tone?.label ?? ""}`}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            onClick={() => onPick?.(i)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onPick?.(i);
              }
            }}
            style={{ cursor: onPick ? "pointer" : undefined, outline: "none" }}
          >
            <rect
              x={x0 - 1}
              y={0}
              width={w + 2}
              height={H}
              fill={hover === i ? "var(--fill-4)" : "transparent"}
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
                opacity={t.bypass ? 0.35 : hover === null || hover === i ? 1 : 0.55}
              >
                <title>
                  {`${b.s.title} · energy ${b.s.energy ?? 50}${b.s.tempo?.bpm || b.s.audio?.bpm ? ` · ${Math.round((b.s.tempo?.bpm || b.s.audio?.bpm)!)} BPM` : ""}`}
                </title>
              </rect>
            ))}
          </g>
        ))}
      </svg>
      <EraLegend className="mt-3" />
    </div>
  );
});
