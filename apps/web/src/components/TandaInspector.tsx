"use client";
import { Headphones, ListMusic } from "lucide-react";
import { useEffect } from "react";
import { haptic } from "@/lib/haptics";
import { sourceFor, trackFor, usePlayer } from "@/lib/player";
import { useStore } from "@/lib/store";
import type { Playlist } from "@/lib/types";
import { metaLine, yearText } from "@/lib/year";
import { RhythmTile } from "./Form";
import { SELECT_TANDA_EVENT } from "./Sidebar";
import { Tip } from "./ui/Tip";

const PHASE: Record<string, string> = {
  warmup: "Warm-up",
  build: "Build",
  peak: "Peak",
  cooldown: "Cool-down",
  close: "Close",
};
const years = (r: [number, number] | null) => (!r ? "year ?" : r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/**
 * Wide screens (round 23): the inspector beside the set (Music's / Finder's inspector). It follows the tanda the DJ
 * picks: a tap on a card, or a row in the sidebar's Tonight list. Content on `surface`, sticky under the toolbar.
 * Hidden below the width that holds two columns (CSS), where the cards carry everything themselves.
 */
export function TandaInspector({
  playlist,
  selected,
  onSelect,
}: {
  playlist: Playlist;
  selected: number;
  onSelect: (i: number) => void;
}) {
  const connected = useStore((s) => !!s.spotifyToken && s.spotifyToken.expires > Date.now());
  const track = usePlayer((s) => s.track);
  useEffect(() => {
    const on = (e: Event) => onSelect((e as CustomEvent<number>).detail);
    window.addEventListener(SELECT_TANDA_EVENT, on);
    // arriving from the sidebar on another page: /#tanda-N
    const m = /^#tanda-(\d+)$/.exec(location.hash);
    if (m) onSelect(Number(m[1]) - 1);
    return () => window.removeEventListener(SELECT_TANDA_EVENT, on);
  }, [onSelect]);
  const i = Math.min(Math.max(0, selected), playlist.tandas.length - 1);
  const t = playlist.tandas[i];
  if (!t) return null;
  const previews = t.songs.flatMap((s) => {
    const src = sourceFor(s, connected);
    return src?.kind === "preview" ? [trackFor(s, src)] : [];
  });
  return (
    <aside className="inspector" aria-label="Inspector" data-testid="inspector">
      <div className="group-inset p-4">
        <div className="flex items-center gap-3">
          <RhythmTile rhythm={t.rhythm} />
          <div className="min-w-0 flex-1">
            <p className="text-footnote text-[var(--label-2)]">
              Tanda {i + 1} of {playlist.tandas.length} · {t.rhythm}
            </p>
            <h2 className="text-title3 truncate" data-testid="inspector-title">
              {t.orchestra}
            </h2>
          </div>
        </div>
        <dl className="inspector-facts mt-3">
          <dt>Voice</dt>
          <dd>{t.singer ?? "Instrumental"}</dd>
          <dt>Years</dt>
          <dd>{years(t.yearRange)}</dd>
          <dt>Moment</dt>
          <dd>{PHASE[t.phase] ?? t.phase}</dd>
          <dt>Energy</dt>
          <dd>
            {Math.round(t.energy)}{" "}
            <span className="text-[var(--label-2)]">· target {Math.round(t.targetEnergy)}</span>
          </dd>
          <dt>Length</dt>
          <dd>{mmss(t.durationSec)}</dd>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <Tip text="Hear 10 seconds of each song in this tanda">
            <button
              type="button"
              className="btn btn-ghost min-h-[44px]"
              disabled={!previews.length}
              onClick={() => {
                haptic(4);
                usePlayer.getState().playQueue(`Tanda ${i + 1}`, previews, 10);
              }}
            >
              <Headphones size={16} aria-hidden /> Preview
            </button>
          </Tip>
          <Tip text="Scroll the set to this tanda">
            <button
              type="button"
              className="btn btn-ghost min-h-[44px]"
              onClick={() =>
                document
                  .getElementById(`tanda-${i + 1}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              <ListMusic size={16} aria-hidden /> Show in set
            </button>
          </Tip>
        </div>
      </div>
      <h3 className="section-head">Tracks</h3>
      <ol className="group-inset">
        {t.songs.map((s, k) => (
          <li key={s.id} className="cell" data-leading="num" data-now={track?.id === s.id || undefined}>
            <span className="text-subhead w-5 shrink-0 tabular-nums text-[var(--label-2)]">{k + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{s.title}</span>
              <span className="text-footnote block truncate text-[var(--label-2)]">
                {metaLine(yearText(s.year), s.singer)}
              </span>
            </span>
            <span className="text-subhead shrink-0 tabular-nums text-[var(--label-2)]">
              {Math.round(t.energyCurve[k] ?? t.energy)}
            </span>
          </li>
        ))}
        {t.cortina && (
          <li className="cell">
            <span className="text-footnote min-w-0 flex-1 truncate text-[var(--label-2)]">
              Cortina · {t.cortina.artist} – {t.cortina.title}
            </span>
          </li>
        )}
      </ol>
    </aside>
  );
}
