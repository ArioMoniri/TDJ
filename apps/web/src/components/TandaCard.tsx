"use client";
import { tandaTone } from "@tdj/core";
import { AudioWaveform, Headphones, ListMusic, Lock, LockOpen, Repeat2, SkipForward } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { memo, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { analyseTanda } from "@/lib/analyze";
import { cohesionWith, patchedSong } from "@/lib/audio";
import { tandaNote } from "@/lib/djMessage";
import { haptic } from "@/lib/haptics";
import { useMediaQuery } from "@/lib/hooks";
import { lazy, lower, t as tx } from "@/lib/i18n";
import { type Cue, fmtLen, lengthOf, tandaTotal, totalText } from "@/lib/lengths";
import { CARD_STAGGER_CAP, DUR, EASE, STAGGER } from "@/lib/motion";
import { cortinaWindow, PlayListContext, useTapPlay } from "@/lib/playback";
import { type PlayItem, sourceFor, trackFor, usePlayer } from "@/lib/player";
import { useStore } from "@/lib/store";
import type { ReferencePlaylist, Tanda } from "@/lib/types";
import { CohesionBadge } from "./CohesionBadge";
import { CountUp } from "./CountUp";
import { I } from "./Icons";
import { Menu } from "./Menu";
import { SwipeRow } from "./SwipeRow";
import { TrackRow } from "./TrackRow";
import { NowBars } from "./ui/NowPlaying";
import { isMixedTanda, TandaTypeBadge } from "./ui/TandaTypeBadge";
import { Tip, useTip } from "./ui/Tip";
import { useDragReorder } from "./ui/useDragReorder";

/* Spotify embeds and the connected-account lookups load with the first "Listen" / cortina tap, not with the set. */
const TandaListen = dynamic(() => import("./Listen").then((m) => m.TandaListen), { ssr: false });
const CortinaPreview = dynamic(() => import("./Listen").then((m) => m.CortinaPreview), { ssr: false });

const PHASE: Record<string, string> = lazy(() => ({
  warmup: lower(tx("phase.warmup")),
  build: lower(tx("phase.build")),
  peak: lower(tx("phase.peak")),
  cooldown: lower(tx("phase.cooldown")),
  close: lower(tx("phase.close")),
}));

export interface TandaCardProps {
  t: Tanda;
  i: number;
  /** called with the tanda index */
  onSwap: (i: number) => void;
  /** called with the tanda index and the track index */
  onSwapTrack: (i: number, k: number) => void;
  /** called with the tanda index */
  onLock: (i: number) => void;
  /** round 21: "Skip tonight" — called with the tanda index (the player passes over it; exports keep it) */
  onBypass?: (i: number) => void;
  /** History: no swap / lock actions, everything else as on the composer */
  readOnly?: boolean;
  /** this tanda was replaced by the last chip / refine */
  changed?: boolean;
  busy?: boolean;
  swappingTrack?: number | null;
  active?: boolean;
  playlists: ReferencePlaylist[];
  /** a recompose is in flight: unlocked cards dim, locked ones hold */
  settling?: boolean;
  /** first reveal of a new set: stagger the entrance from index 0 (read once, at mount) */
  fresh?: boolean;
  /** a per-track swap found nothing: row `k` nudges once per `n` */
  nudge?: { k: number; n: number } | null;
  /** the energy before a swap, so the number counts from old to new */
  prevEnergy?: number;
  /**
   * This card is the one being swapped or locked right now: its rows get `layout` position animations.
   * Every other card renders without layout measurement (22 cards × 4 rows measured per render was the main
   * compose-time cost on phones).
   */
  animateLayout?: boolean;
  /** 2026-11: reorder a song inside the tanda — (tanda, from, to); absent on a read-only night */
  onMoveTrack?: (i: number, from: number, to: number) => void;
  /** the night's cue in / stop at per side (booth.songCues): the lengths honour them */
  cues?: Record<string, Cue> | null;
}

/** A tanda as one inset group: artwork tile + title row, track rows, cortina row, Listen (row on phone, menu on desktop). */
function TandaCardImpl({
  t,
  i,
  onSwap,
  onSwapTrack,
  onLock,
  onBypass,
  busy,
  swappingTrack,
  active,
  playlists,
  settling = false,
  fresh = false,
  nudge = null,
  prevEnergy,
  readOnly = false,
  changed = false,
  animateLayout = false,
  onMoveTrack,
  cues,
}: TandaCardProps) {
  const cortinaTip = useTip<HTMLButtonElement>(tx("tandaCard.the_cortina_after_this_tanda_open"));
  const reduced = useReducedMotion();
  const isPhone = useMediaQuery("(max-width: 599.98px)");
  const [listen, setListen] = useState(false);
  const [cortinaOpen, setCortinaOpen] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  // only this tanda's song patches: an analysis elsewhere in the set does not re-render this card
  const patches = useStore(useShallow((s) => t.songs.map((x) => s.overrides.songs?.[x.id])));
  const cohesion = useMemo(() => cohesionWith(t, patches), [t, patches]);
  // round 22: the tanda's tone — its mode and keys, its feel and mean tempo (the DJ's own keys win)
  const tone = useMemo(() => {
    const keys = patches.map((p) => p?.key);
    return tandaTone(
      t.songs.map((s, k) => patchedSong(s, patches[k])),
      keys.some(Boolean) ? keys : undefined,
    );
  }, [t, patches]);
  const connected = useStore((s) => !!s.spotifyToken && s.spotifyToken.expires > Date.now());
  /** "Preview tanda": the 30 s previews of this tanda back to back, 10 s each (round4-ux.md §10.1) */
  const previewTracks = useMemo(
    () =>
      t.songs.flatMap((song, k) => {
        const eff = patchedSong(song, patches[k]);
        const src = sourceFor(eff, connected);
        return src?.kind === "preview" ? [trackFor(eff, src)] : [];
      }),
    [t.songs, patches, connected],
  );
  const previewTanda = useCallback(() => {
    haptic(4);
    usePlayer.getState().playQueue(tx("tandaCard.tanda_2", { p1: i + 1 }), previewTracks, 10);
  }, [i, previewTracks]);
  const ref = useRef<HTMLElement>(null);
  // 2026-11: a tap plays from the night's list (Compose provides it), else from this tanda and its cortina
  const parentList = useContext(PlayListContext);
  const ownList = useMemo(() => {
    const where = tx("play.tanda", { n: i + 1 });
    const items: PlayItem[] = t.songs.map((song) => ({ kind: "song", song, where }));
    if (t.cortina)
      items.push({ kind: "cortina", cortina: t.cortina, where: tx("play.cortina_after", { n: i + 1 }) });
    return { label: where, items };
  }, [t.songs, t.cortina, i]);
  const playList = parentList ?? ownList;
  const total = useMemo(() => tandaTotal(t.songs, cues), [t.songs, cues]);
  const canMove = !readOnly && !!onMoveTrack;
  const moveTrack = useCallback((from: number, to: number) => onMoveTrack?.(i, from, to), [onMoveTrack, i]);
  const drag = useDragReorder(moveTrack, !canMove);
  // the ref stays: the stagger applies to the mount only; later renders (settling, swaps) must not inherit the delay
  const freshAtMount = useRef(fresh).current;
  const dim = settling && !t.locked;
  const analyseAll = async () => {
    setAnalysing(true);
    try {
      await analyseTanda(t.songs, t.rhythm);
    } finally {
      setAnalysing(false);
    }
  };
  const yr = (a: number, b: number) =>
    a === b
      ? String(a)
      : Math.floor(a / 100) === Math.floor(b / 100)
        ? `${a}–${String(b).slice(2)}`
        : `${a}–${b}`;
  const delay = reduced ? 0 : (freshAtMount ? Math.min(i, CARD_STAGGER_CAP) : 0) * STAGGER.cards;
  const lock = useCallback(() => {
    haptic(8);
    onLock(i);
  }, [onLock, i]);
  const swap = useCallback(() => onSwap(i), [onSwap, i]);
  const swapTrack = useCallback((k: number) => onSwapTrack(i, k), [onSwapTrack, i]);
  const sub = [
    t.singer ?? "Instrumental",
    t.yearRange ? yr(t.yearRange[0], t.yearRange[1]) : null,
    PHASE[t.phase] ?? t.phase,
    t.locked ? "locked" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const lockItem = !readOnly && {
    label: t.locked ? tx("tandaCard.unlock_tanda_2") : tx("tandaCard.lock_tanda_2"),
    icon: t.locked ? LockOpen : Lock,
    onClick: lock,
  };
  const bypassItem = !readOnly &&
    onBypass && {
      label: t.bypass ? tx("tandaCard.play_it_tonight") : tx("tandaCard.skip_tonight"),
      icon: SkipForward,
      onClick: () => onBypass(i),
    };
  // wave 2: a greyed-out action says why
  const swapWhy = t.pinned
    ? tx("tandaCard.swap_tanda_kept_as_is_unpin")
    : t.locked
      ? tx("tandaCard.swap_tanda_unlock_it_first")
      : busy
        ? tx("tandaCard.swap_tanda_swapping")
        : tx("tandaCard.swap_tanda_2");
  const swapItem = !readOnly && {
    label: swapWhy,
    icon: Repeat2,
    onClick: swap,
    disabled: t.locked || busy,
  };
  const analyseItem = {
    label: analysing ? tx("tandaCard.analysing") : tx("tandaCard.analyse_all_tracks"),
    icon: AudioWaveform,
    onClick: analyseAll,
    disabled: analysing,
  };
  const previewItem = {
    label: previewTracks.length
      ? tx("tandaCard.preview_tanda_10_s", { length: previewTracks.length })
      : tx("tandaCard.preview_tanda_no_previews_yet"),
    icon: ListMusic,
    onClick: previewTanda,
    disabled: previewTracks.length === 0,
  };

  return (
    <motion.article
      ref={ref}
      layout={animateLayout && !reduced ? "position" : false}
      initial={{ opacity: 0, y: reduced ? 0 : 12 }}
      animate={{
        opacity: dim ? 0.55 : 1,
        y: 0,
        scale: dim && !reduced ? 0.985 : 1,
        transition: { duration: dim ? DUR.base : 0.32, ease: EASE.out, delay: dim ? 0 : delay },
      }}
      exit={{ opacity: 0, scale: reduced ? 1 : 0.98, transition: { duration: DUR.fast, ease: EASE.in } }}
      className={`group-inset group/card tanda-card min-w-0 ${active ? "ring-2 ring-[var(--tint)]" : ""} ${
        t.locked ? "ring-1 ring-[color-mix(in_srgb,var(--system-gold)_60%,transparent)]" : ""
      }`}
      id={`tanda-${i + 1}`}
      aria-busy={busy || undefined}
      data-locked={t.locked || undefined}
      data-changed={changed || undefined}
      data-rhythm={t.rhythm}
      data-tanda={i + 1}
      data-pinned={t.pinned ? "dj" : undefined}
      data-bypass={t.bypass || undefined}
    >
      {/* curve dot → card hand-off: a one-shot ring pulse on arrival */}
      {active && !reduced && (
        <motion.span
          key={`pulse-${i}`}
          className="pointer-events-none absolute inset-0 z-[2] rounded-[inherit] ring-2 ring-[var(--tint)]"
          initial={{ scale: 1, opacity: 1 }}
          animate={{ scale: [1, 1.015, 1], opacity: [1, 0.6, 1] }}
          transition={{ duration: 0.5, ease: EASE.inOut }}
          aria-hidden
        />
      )}
      <div style={{ opacity: busy ? 0.6 : 1, transition: "opacity var(--dur-s) var(--ease-settle)" }}>
        <SwipeRow
          leading="art"
          actions={
            readOnly
              ? []
              : [
                  {
                    kind: "lock",
                    label: t.locked ? tx("tandaCard.unlock") : tx("tandaCard.lock"),
                    icon: t.locked ? "unlock" : "lock",
                    onClick: lock,
                  },
                  {
                    kind: "swap",
                    label: tx("tandaCard.swap"),
                    icon: "swap",
                    onClick: swap,
                    disabled: t.locked || busy,
                  },
                ]
          }
        >
          <div className="cell" data-leading="art">
            <div className="tile-art" data-rhythm={t.rhythm} aria-hidden>
              <span className="text-headline tabular-nums">{i + 1}</span>
            </div>
            <span className="min-w-0 flex-1">
              <h3 className="text-headline truncate">{t.orchestra}</h3>
              <span className="text-subhead block truncate text-[var(--label-2)]">
                <span className="sr-only">{t.rhythm} · </span>
                {sub}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <TandaTypeBadge
                  rhythm={t.rhythm}
                  singer={t.singer}
                  vocal={t.vocal}
                  mixed={isMixedTanda(t)}
                  mixedWhy={
                    t.pinned?.exception ? tx("tandaType.mixed_exception") : tx("tandaType.mixed_sides")
                  }
                />
                <span className="text-caption1 tabular-nums text-[var(--label-2)]" data-testid="tanda-total">
                  {tx("play.songs_total", { n: t.songs.length, total: totalText(total) })}
                </span>
                {/* round 21: the DJ's tanda — the rules leave it alone, its exceptions are the DJ's */}
                {t.pinned && (
                  <Tip text={t.pinned.reason}>
                    <span
                      className="text-caption1 inline-flex rounded-full bg-[color-mix(in_srgb,var(--system-gold)_18%,transparent)] px-2 py-0.5 font-medium text-[var(--label)]"
                      data-testid="tanda-pinned"
                    >
                      {tx("tandaCard.your_tanda_kept_as_is")}
                    </span>
                  </Tip>
                )}
                {t.bypass && (
                  <span
                    className="text-caption1 inline-flex rounded-full bg-[var(--fill-3)] px-2 py-0.5 font-medium text-[var(--label-2)]"
                    data-testid="tanda-bypass"
                  >
                    {tx("tandaCard.skipped_tonight_still_in_exports")}
                  </span>
                )}
                {t.note && (
                  <Tip text={tandaNote(t.note)}>
                    <span
                      className="tanda-note text-caption1 rounded-[10px] bg-[color-mix(in_srgb,var(--tint)_14%,transparent)] px-2 py-0.5 font-medium text-[var(--tint)]"
                      data-testid="tanda-note"
                    >
                      {tandaNote(t.note)}
                    </span>
                  </Tip>
                )}
                {cohesion && (
                  <CohesionBadge info={cohesion} tandaLabel={tx("tandaCard.tanda", { p1: i + 1 })} />
                )}
                {tone && (
                  <Tip
                    text={tx("tandaCard.the_tanda_s_tone_energy", {
                      p1: tone.mode
                        ? `${tone.mode === "mixed" ? tx("tandaCard.mixed_major_and_minor_keys") : tx("tandaCard.keys", { mode: tone.mode })}${tone.keys.length ? ` (${tone.keys.join(", ")})` : ""}, `
                        : "",
                      feel: tone.feel,
                      p2: tone.bpm ? tx("tandaCard.about_bpm", { bpm: tone.bpm }) : "",
                    })}
                  >
                    <span
                      className="text-caption1 inline-flex whitespace-nowrap rounded-full bg-[var(--fill-4)] px-2 py-0.5 font-medium text-[var(--label-2)]"
                      data-testid="tanda-tone"
                    >
                      {tone.label}
                    </span>
                  </Tip>
                )}
              </span>
            </span>
            <span className="text-right">
              <span className="text-headline block tabular-nums">
                <CountUp value={t.energy} from={prevEnergy ?? t.energy} duration={DUR.slow} />
              </span>
              {!isPhone && (
                <Tip text={tx("tandaCard.the_arc_s_target_energy_for")}>
                  <span className="text-caption1 block text-[var(--label-2)]">
                    {tx("tandaCard.target", { targetEnergy: t.targetEnergy })}
                  </span>
                </Tip>
              )}
            </span>
            {/* wave 2: the header's two actions are always on screen (they hid until hover), each with a tooltip;
                a locked tanda shows one lock: this button, gold and closed */}
            {!readOnly && !isPhone && (
              <span className="inline-flex items-center gap-0.5">
                <Tip
                  text={
                    t.locked
                      ? tx("tandaCard.unlock_the_next_compose_may_change")
                      : tx("tandaCard.lock_keep_this_tanda_when_you")
                  }
                >
                  <button
                    type="button"
                    className={`icon-btn icon-btn-bare -my-2 h-11 w-11 ${t.locked ? "text-[var(--system-gold)]" : "text-[var(--label-2)]"}`}
                    aria-label={
                      t.locked
                        ? tx("tandaCard.unlock_tanda", { p1: i + 1 })
                        : tx("tandaCard.lock_tanda", { p1: i + 1 })
                    }
                    aria-pressed={t.locked}
                    data-on={t.locked || undefined}
                    data-testid="tanda-lock"
                    onClick={lock}
                  >
                    <span key={t.locked ? "locked" : "open"} className="lock-pop">
                      <I name={t.locked ? "lock" : "unlock"} size={17} strokeWidth={t.locked ? 2.25 : 1.75} />
                    </span>
                  </button>
                </Tip>
                <Tip
                  text={
                    t.locked
                      ? tx("tandaCard.swap_unlock_the_tanda_first")
                      : busy
                        ? tx("tandaCard.swapping")
                        : tx("tandaCard.swap_another_tanda_of_the_same")
                  }
                >
                  <button
                    type="button"
                    className="icon-btn icon-btn-bare -my-2 h-11 w-11 text-[var(--label-2)] disabled:opacity-40"
                    aria-label={tx("tandaCard.swap_tanda", { p1: i + 1 })}
                    aria-disabled={t.locked || busy || undefined}
                    disabled={t.locked || busy}
                    data-testid="tanda-swap"
                    onClick={swap}
                  >
                    <I name="swap" size={17} strokeWidth={1.75} className={busy ? "animate-spin" : ""} />
                  </button>
                </Tip>
              </span>
            )}
            <AnimatePresence initial={false}>
              {t.locked && (readOnly || isPhone) && (
                <motion.span
                  key="locked"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: DUR.base, ease: EASE.out }}
                  className="inline-flex text-[var(--system-gold)]"
                >
                  <Lock size={14} strokeWidth={2.25} aria-label={tx("tandaCard.locked")} />
                </motion.span>
              )}
            </AnimatePresence>
            {/* the tanda's actions live on the header row at every width: the Listen row keeps one disclosure */}
            <Menu
              label={tx("tandaCard.tanda_actions", { p1: i + 1 })}
              className="-mr-3 inline-flex"
              contextRef={ref}
              icon={<I name="more" size={20} strokeWidth={2} />}
              items={[
                lockItem,
                swapItem,
                bypassItem,
                !isPhone && {
                  label: listen ? tx("tandaCard.hide_player") : tx("tandaCard.listen"),
                  icon: Headphones,
                  onClick: () => setListen((v) => !v),
                },
                previewItem,
                analyseItem,
              ]}
            />
          </div>
        </SwipeRow>
        <PlayListContext.Provider value={playList}>
          <ol data-reorder-list>
            <AnimatePresence mode="popLayout" initial={false}>
              {t.songs.map((s, k) => (
                <TrackRow
                  lengthSec={lengthOf(s, cues)}
                  count={t.songs.length}
                  onMove={canMove ? moveTrack : undefined}
                  dragHandle={canMove ? drag : undefined}
                  key={s.id}
                  n={k + 1}
                  song={s}
                  rhythm={t.rhythm}
                  inFlight={swappingTrack === k}
                  nudge={nudge?.k === k ? nudge.n : 0}
                  onSwap={swapTrack}
                  disabled={t.locked || readOnly}
                  swapLabel={tx("tandaCard.swap_track_of_tanda", { p1: k + 1, p2: i + 1 })}
                  lockedWhy={
                    readOnly
                      ? tx("tandaCard.open_the_night_in_compose_to")
                      : t.pinned
                        ? tx("tandaCard.the_tanda_is_kept_as_is")
                        : t.locked
                          ? tx("tandaCard.unlock_the_tanda_first")
                          : undefined
                  }
                  animateLayout={animateLayout}
                />
              ))}
            </AnimatePresence>
          </ol>
        </PlayListContext.Provider>
        {isPhone && (
          <div className="flex">
            <button
              type="button"
              className="cell cell-tap min-w-0 flex-1 text-left"
              aria-pressed={listen}
              aria-expanded={listen}
              aria-controls={`listen-${i + 1}`}
              onClick={() => setListen((v) => !v)}
              data-testid="listen-row"
            >
              {listen ? (
                <span className="wave text-[var(--tint)]" data-on aria-hidden>
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              ) : (
                <I name="headphones" size={16} strokeWidth={2} className="text-[var(--label-2)]" />
              )}
              <span className="min-w-0 flex-1 truncate">
                {listen ? tx("tandaCard.hide_player") : tx("tandaCard.listen")}
              </span>
              <I
                name="chevron"
                size={16}
                strokeWidth={2.5}
                className={`cell-chevron transition-transform ${listen ? "rotate-90" : ""}`}
              />
            </button>
          </div>
        )}
        <AnimatePresence initial={false}>
          {listen && (
            <motion.div
              id={`listen-${i + 1}`}
              key="listen"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0, transition: { duration: DUR.fast, ease: EASE.in } }}
              transition={{ duration: DUR.base, ease: EASE.out }}
              className="overflow-hidden"
            >
              <div className="cell flex-col items-stretch">
                <TandaListen t={t} playlists={playlists} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {t.cortina && (
          <>
            <CortinaRow
              c={t.cortina}
              list={playList}
              where={tx("play.cortina_after", { n: i + 1 })}
              open={cortinaOpen}
              listen={listen}
              onToggle={() => setCortinaOpen((v) => !v)}
              controls={`cortina-${i + 1}`}
              tip={cortinaTip}
            />
            <AnimatePresence initial={false}>
              {(cortinaOpen || listen) && (
                <motion.div
                  id={`cortina-${i + 1}`}
                  key="preview"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0, transition: { duration: DUR.fast, ease: EASE.in } }}
                  transition={{ duration: DUR.base, ease: EASE.out }}
                  className="overflow-hidden"
                >
                  <div className="cell flex-col items-stretch pt-0">
                    <CortinaPreview c={t.cortina} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </motion.article>
  );
}

/**
 * 2026-11: the cortina row — one tap plays it from its chorus for its cortina length (the row's body); the chevron
 * opens the preview panel (Spotify, the playlist links) as before. The length is the one it plays.
 */
function CortinaRow({
  c,
  list,
  where,
  open,
  listen,
  onToggle,
  controls,
  tip,
}: {
  c: NonNullable<Tanda["cortina"]>;
  list: { label: string; items: PlayItem[] };
  where: string;
  open: boolean;
  listen: boolean;
  onToggle: () => void;
  controls: string;
  tip: ReturnType<typeof useTip<HTMLButtonElement>>;
}) {
  const item = useMemo<PlayItem>(() => ({ kind: "cortina", cortina: c, where }), [c, where]);
  const play = useTapPlay(item, list);
  const settings = useStore((s) => s.settings);
  const edits = useStore((s) => s.playlist?.booth?.cortinaEdits);
  const w = cortinaWindow(c, { settings, edits });
  return (
    <div
      className={`cell gap-0 p-0 ${play.state ? "row-now" : ""}`}
      data-testid="cortina-row"
      data-now={play.state ?? undefined}
    >
      <button
        type="button"
        className="cell cell-tap min-w-0 flex-1 text-left"
        onClick={() => {
          haptic(4);
          void play.tap();
        }}
        aria-label={
          play.playing
            ? tx("play.pause_cortina", { title: c.title })
            : tx("play.play_cortina", { title: c.title, at: fmtLen(w.start) })
        }
        data-testid="cortina-row-play"
        {...tip.props}
      >
        {tip.tag}
        {play.state ? (
          <NowBars on={play.playing} />
        ) : (
          <span
            className={`wave ${open || listen ? "text-[var(--tint)]" : "text-[var(--label-2)]"}`}
            aria-hidden
          >
            <i />
            <i />
            <i />
            <i />
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[var(--label-2)]">
          {tx("tandaCard.cortina_s", {
            artist: c.artist,
            title: c.title,
            p1: Math.round(w.stop - w.start),
          })}
        </span>
        <span className="len text-subhead" data-testid="cortina-len">
          {fmtLen(w.stop - w.start)}
        </span>
      </button>
      <button
        type="button"
        className="icon-btn icon-btn-bare mr-1 h-11 w-11 shrink-0"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={controls}
        aria-label={open ? tx("play.hide_cortina_details") : tx("play.cortina_details")}
        data-testid="cortina-open"
      >
        <I
          name="chevron"
          size={16}
          strokeWidth={2.5}
          className={`cell-chevron transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>
    </div>
  );
}

/** `fresh` is consumed at mount only, so a flip of it alone never re-renders the card. */
export const TandaCard = memo(TandaCardImpl, (a, b) => {
  for (const k of Object.keys({ ...a, ...b }) as Array<keyof TandaCardProps>) {
    if (k === "fresh") continue;
    if (!Object.is(a[k], b[k])) return false;
  }
  return true;
});
