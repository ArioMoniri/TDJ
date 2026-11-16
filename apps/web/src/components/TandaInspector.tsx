"use client";
import {
  ArrowDown,
  ArrowUp,
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  GripVertical,
  Headphones,
  ListMusic,
  ListPlus,
  Trash2,
} from "lucide-react";
import { useCallback, useContext, useEffect, useMemo } from "react";
import { haptic } from "@/lib/haptics";
import { lazy, t as tx } from "@/lib/i18n";
import { lengthOf, tandaTotal, totalText } from "@/lib/lengths";
import { nightItems, PlayListContext, playTanda } from "@/lib/playback";
import type { Playlist } from "@/lib/types";
import { metaLine, yearText } from "@/lib/year";
import { Menu } from "./Menu";
import { SELECT_TANDA_EVENT } from "./Sidebar";
import { Artwork } from "./ui/Artwork";
import { PlayRow } from "./ui/PlayRow";
import { TandaArt } from "./ui/TandaArt";
import { isMixedTanda, TandaTypeBadge } from "./ui/TandaTypeBadge";
import { Tip } from "./ui/Tip";
import { useDragReorder } from "./ui/useDragReorder";

const PHASE: Record<string, string> = lazy(() => ({
  warmup: tx("phase.warmup"),
  build: tx("phase.build"),
  peak: tx("phase.peak"),
  cooldown: tx("phase.cooldown"),
  close: tx("phase.close"),
}));
const years = (r: [number, number] | null) => (!r ? "–" : r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`);
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
  onMoveTrack,
  onInsertSong,
  onRemoveSong,
  onInsertTanda,
  onRemoveTanda,
}: {
  playlist: Playlist;
  selected: number;
  onSelect: (i: number) => void;
  /** 2026-11: reorder a song inside the tanda (tanda, from, to) */
  onMoveTrack?: (i: number, from: number, to: number) => void;
  /** 2026-11: insert / remove (the same as the cards: the Insert sheet, the rule check, Undo, the guide) */
  onInsertSong?: (i: number, at: number) => void;
  onRemoveSong?: (i: number, k: number) => void;
  onInsertTanda?: (at: number) => void;
  onRemoveTanda?: (i: number) => void;
}) {
  // 2026-11: the night's play list (Compose provides it): the tracks and Preview play from it
  const ctx = useContext(PlayListContext);
  const nightList = useMemo(
    () => ctx ?? { label: playlist.name ?? "", items: nightItems(playlist) },
    [ctx, playlist],
  );
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
  const move = useCallback((from: number, to: number) => onMoveTrack?.(i, from, to), [onMoveTrack, i]);
  const drag = useDragReorder(move, !onMoveTrack || !!t?.locked);
  const cues = playlist.booth?.songCues;
  const total = useMemo(() => (t ? tandaTotal(t.songs, cues) : null), [t, cues]);
  if (!t) return null;
  const where = tx("play.tanda", { n: i + 1 });
  return (
    <aside className="inspector" aria-label={tx("tandaInspector.inspector")} data-testid="inspector">
      <div className="group-inset p-4">
        <div className="flex items-center gap-3">
          {/* 2026-11 (the owner: "image not getting loaded here"): the tanda's cover, its rhythm on the corner */}
          <TandaArt tanda={t} size={56} testId="inspector-art" />
          <div className="min-w-0 flex-1">
            <p className="text-footnote text-[var(--label-2)]">
              {tx("tandaInspector.tanda_of", { p1: i + 1, length: playlist.tandas.length, rhythm: t.rhythm })}
            </p>
            <h2 className="text-title3 truncate" data-testid="inspector-title">
              {t.orchestra}
            </h2>
            <TandaTypeBadge rhythm={t.rhythm} singer={t.singer} vocal={t.vocal} mixed={isMixedTanda(t)} />
          </div>
        </div>
        <dl className="inspector-facts mt-3">
          <dt>{tx("tandaInspector.voice")}</dt>
          <dd>{t.singer ?? tx("tandaInspector.instrumental")}</dd>
          <dt>{tx("tandaInspector.years")}</dt>
          <dd>{years(t.yearRange)}</dd>
          <dt>{tx("tandaInspector.moment")}</dt>
          <dd>{PHASE[t.phase] ?? t.phase}</dd>
          <dt>{tx("tandaInspector.energy")}</dt>
          <dd>
            {Math.round(t.energy)}{" "}
            <span className="text-[var(--label-2)]">
              {tx("tandaInspector.target", { p1: Math.round(t.targetEnergy) })}
            </span>
          </dd>
          <dt>{tx("tandaInspector.length")}</dt>
          <dd data-testid="inspector-total">
            {total
              ? tx("play.songs_total", { n: t.songs.length, total: totalText(total) })
              : mmss(t.durationSec)}
          </dd>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          {/* 2026-11 (the owner: "Preview won't work"): it was greyed out unless a side had a cached Deezer link and
              no Spotify login — now it pre-listens each side's start in turn (20 s: Spotify in full with Premium,
              else the 30 s clips, looked up when missing); a side with no audio is passed, and when none plays the
              toast says why with the fix */}
          <Tip text={tx("tandaInspector.hear_10_seconds_of_each_song")}>
            <button
              type="button"
              className="btn btn-ghost min-h-[44px]"
              data-testid="inspector-preview"
              onClick={() => {
                haptic(4);
                void playTanda(nightList, i, "tanda", { clipSec: 20 });
              }}
            >
              <Headphones size={16} aria-hidden /> {tx("tandaInspector.preview")}
            </button>
          </Tip>
          <Tip text={tx("tandaInspector.scroll_the_set_to_this_tanda")}>
            <button
              type="button"
              className="btn btn-ghost min-h-[44px]"
              onClick={() =>
                document
                  .getElementById(`tanda-${i + 1}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              <ListMusic size={16} aria-hidden /> {tx("tandaInspector.show_in_set")}
            </button>
          </Tip>
          {onInsertSong && !t.locked && (
            <button
              type="button"
              className="btn btn-ghost min-h-[44px]"
              onClick={() => onInsertSong(i, t.songs.length)}
              data-testid="inspector-add-song"
            >
              <ListPlus size={16} aria-hidden /> {tx("spot.add_song_here")}
            </button>
          )}
          {onInsertTanda && (
            <>
              <button
                type="button"
                className="btn btn-ghost min-h-[44px]"
                onClick={() => onInsertTanda(i)}
                data-testid="inspector-insert-before"
              >
                <BetweenHorizontalStart size={16} aria-hidden /> {tx("spot.insert_tanda_before")}
              </button>
              <button
                type="button"
                className="btn btn-ghost min-h-[44px]"
                onClick={() => onInsertTanda(i + 1)}
                data-testid="inspector-insert-after"
              >
                <BetweenHorizontalEnd size={16} aria-hidden /> {tx("spot.insert_tanda_after")}
              </button>
            </>
          )}
          {onRemoveTanda && !t.locked && (
            <button
              type="button"
              className="btn btn-ghost min-h-[44px] text-[var(--destructive)]"
              onClick={() => onRemoveTanda(i)}
              data-testid="inspector-remove-tanda"
            >
              <Trash2 size={16} aria-hidden /> {tx("spot.remove_tanda")}
            </button>
          )}
        </div>
      </div>
      <h3 className="section-head">{tx("tandaInspector.tracks")}</h3>
      <ol className="group-inset" data-reorder-list>
        {t.songs.map((s, k) => (
          <li key={s.id} className="relative" data-reorder-row>
            <PlayRow
              song={s}
              where={where}
              leadingKind="art"
              leading={
                <span className="inspector-track-art">
                  <Artwork entity={s} orchestra={s.orchestra} size={36} />
                  <span className="inspector-track-n tabular-nums" aria-hidden>
                    {k + 1}
                  </span>
                </span>
              }
              // 2026-11 (DJ review: titles cut to "Agu…" beside four columns): the energy and the length join the
              // sub-line (the singer only where it differs from the tanda's), the title may take two lines, the
              // drag handle and the menu are 44 px
              sub={metaLine(
                yearText(s.year),
                s.singer && s.singer !== t.singer ? s.singer : null,
                `${tx("tandaInspector.energy")} ${Math.round(t.energyCurve[k] ?? t.energy)}`,
                (() => {
                  const len = lengthOf(s, cues);
                  return typeof len === "number" && len > 0 ? mmss(len) : null;
                })(),
              )}
              testId="inspector-row"
              className="inspector-row"
              trailing={
                onMoveTrack &&
                !t.locked && (
                  <>
                    <button
                      type="button"
                      className="drag-handle icon-btn icon-btn-bare -my-2 h-11 w-11 shrink-0 text-[var(--label-3)]"
                      aria-label={tx("play.drag_to_reorder", { title: s.title })}
                      data-testid="drag-handle"
                      {...drag(k)}
                    >
                      <GripVertical size={16} aria-hidden />
                    </button>
                    <Menu
                      label={tx("play.song_actions", { title: s.title })}
                      className="icon-btn-bare -my-2 -mr-3 h-11 w-11"
                      items={[
                        {
                          label: tx("play.move_up"),
                          icon: ArrowUp,
                          onClick: () => move(k, k - 1),
                          disabled: k === 0,
                        },
                        {
                          label: tx("play.move_down"),
                          icon: ArrowDown,
                          onClick: () => move(k, k + 1),
                          disabled: k === t.songs.length - 1,
                        },
                        onInsertSong && {
                          label: tx("spot.add_song_before"),
                          icon: ListPlus,
                          onClick: () => onInsertSong(i, k),
                        },
                        onInsertSong && {
                          label: tx("spot.add_song_after"),
                          icon: ListPlus,
                          onClick: () => onInsertSong(i, k + 1),
                        },
                        onRemoveSong && {
                          label: tx("spot.remove_song"),
                          icon: Trash2,
                          onClick: () => onRemoveSong(i, k),
                          destructive: true,
                        },
                      ]}
                    />
                  </>
                )
              }
            />
          </li>
        ))}
        {t.cortina && (
          <li className="cell" data-leading="art" data-testid="inspector-cortina">
            <span className="inspector-track-art">
              <Artwork entity={t.cortina} orchestra={t.cortina.artist} size={36} />
            </span>
            <span className="text-footnote min-w-0 flex-1 truncate text-[var(--label-2)]">
              {tx("tandaInspector.cortina", { artist: t.cortina.artist, title: t.cortina.title })}
            </span>
          </li>
        )}
      </ol>
    </aside>
  );
}
