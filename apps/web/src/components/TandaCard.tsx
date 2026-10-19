"use client";
import { AudioWaveform, Headphones, Lock, LockOpen, Repeat2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { analyseTanda } from "@/lib/analyze";
import { cohesionWith } from "@/lib/audio";
import { haptic } from "@/lib/haptics";
import { useMediaQuery } from "@/lib/hooks";
import { CARD_STAGGER_CAP, DUR, EASE, STAGGER } from "@/lib/motion";
import { useStore } from "@/lib/store";
import type { ReferencePlaylist, Tanda } from "@/lib/types";
import { CohesionBadge } from "./CohesionBadge";
import { CountUp } from "./CountUp";
import { I } from "./Icons";
import { Menu } from "./Menu";
import { SwipeRow } from "./SwipeRow";
import { TrackRow } from "./TrackRow";

/* Spotify embeds and the connected-account lookups load with the first "Listen" / cortina tap, not with the set. */
const TandaListen = dynamic(() => import("./Listen").then((m) => m.TandaListen), { ssr: false });
const CortinaPreview = dynamic(() => import("./Listen").then((m) => m.CortinaPreview), { ssr: false });

const PHASE: Record<string, string> = {
  warmup: "warm-up",
  build: "build",
  peak: "peak",
  cooldown: "cool-down",
  close: "close",
};

export interface TandaCardProps {
  t: Tanda;
  i: number;
  /** called with the tanda index */
  onSwap: (i: number) => void;
  /** called with the tanda index and the track index */
  onSwapTrack: (i: number, k: number) => void;
  /** called with the tanda index */
  onLock: (i: number) => void;
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
}

/** A tanda as one inset group: artwork tile + title row, track rows, cortina row, Listen (row on phone, menu on desktop). */
function TandaCardImpl({
  t,
  i,
  onSwap,
  onSwapTrack,
  onLock,
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
}: TandaCardProps) {
  const reduced = useReducedMotion();
  const isPhone = useMediaQuery("(max-width: 639px)");
  const [listen, setListen] = useState(false);
  const [cortinaOpen, setCortinaOpen] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  // only this tanda's song patches: an analysis elsewhere in the set does not re-render this card
  const patches = useStore(useShallow((s) => t.songs.map((x) => s.overrides.songs?.[x.id])));
  const cohesion = useMemo(() => cohesionWith(t, patches), [t, patches]);
  const ref = useRef<HTMLElement>(null);
  // the stagger applies to the mount only; later renders (settling, swaps) must not inherit the delay
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
    t.yearRange ? yr(t.yearRange[0], t.yearRange[1]) : "year ?",
    PHASE[t.phase] ?? t.phase,
    t.locked ? "locked" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const lockItem = !readOnly && {
    label: t.locked ? "Unlock tanda" : "Lock tanda",
    icon: t.locked ? LockOpen : Lock,
    onClick: lock,
  };
  const swapItem = !readOnly && {
    label: "Swap tanda",
    icon: Repeat2,
    onClick: swap,
    disabled: t.locked || busy,
  };
  const analyseItem = {
    label: analysing ? "Analysing…" : "Analyse all tracks",
    icon: AudioWaveform,
    onClick: analyseAll,
    disabled: analysing,
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
                    label: t.locked ? "Unlock" : "Lock",
                    icon: t.locked ? "unlock" : "lock",
                    onClick: lock,
                  },
                  { kind: "swap", label: "Swap", icon: "swap", onClick: swap, disabled: t.locked || busy },
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
                {t.note && (
                  <span
                    className="text-caption1 inline-flex rounded-full bg-[color-mix(in_srgb,var(--tint)_14%,transparent)] px-2 py-0.5 font-medium text-[var(--tint)]"
                    data-testid="tanda-note"
                  >
                    {t.note}
                  </span>
                )}
                {cohesion && <CohesionBadge info={cohesion} tandaLabel={`tanda ${i + 1}`} />}
              </span>
            </span>
            <span className="text-right">
              <span className="text-headline block tabular-nums">
                <CountUp value={t.energy} from={prevEnergy ?? t.energy} duration={DUR.slow} />
              </span>
              {!isPhone && (
                <span
                  className="text-caption1 block text-[var(--label-2)]"
                  title="The arc's target energy for this slot"
                >
                  target {t.targetEnergy}
                </span>
              )}
            </span>
            {!readOnly && !isPhone && (
              <span className="inline-flex items-center gap-0.5">
                <button
                  type="button"
                  className="icon-btn icon-btn-bare -my-2 h-9 w-9 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/card:opacity-100 data-[on]:opacity-100"
                  aria-label={t.locked ? `Unlock tanda ${i + 1}` : `Lock tanda ${i + 1}`}
                  aria-pressed={t.locked}
                  data-on={t.locked || undefined}
                  onClick={lock}
                >
                  <I name={t.locked ? "unlock" : "lock"} size={17} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn-bare -my-2 h-9 w-9 opacity-0 transition-opacity focus-visible:opacity-100 disabled:opacity-0 group-hover/card:opacity-100"
                  aria-label={`Swap tanda ${i + 1}`}
                  disabled={t.locked || busy}
                  onClick={swap}
                >
                  <I name="swap" size={17} strokeWidth={1.75} className={busy ? "animate-spin" : ""} />
                </button>
              </span>
            )}
            <AnimatePresence initial={false}>
              {t.locked && (
                <motion.span
                  key="locked"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: DUR.base, ease: EASE.out }}
                  className="inline-flex text-[var(--system-gold)]"
                >
                  <Lock size={14} strokeWidth={2.25} aria-label="Locked" />
                </motion.span>
              )}
            </AnimatePresence>
            {!isPhone && (
              <Menu
                label={`Tanda ${i + 1} actions`}
                className="-mr-3 inline-flex"
                contextRef={ref}
                icon={<I name="more" size={20} strokeWidth={2} />}
                items={[
                  lockItem,
                  swapItem,
                  {
                    label: listen ? "Hide player" : "Listen",
                    icon: Headphones,
                    onClick: () => setListen((v) => !v),
                  },
                  analyseItem,
                ]}
              />
            )}
          </div>
        </SwipeRow>
        <ol>
          <AnimatePresence mode="popLayout" initial={false}>
            {t.songs.map((s, k) => (
              <TrackRow
                key={s.id}
                n={k + 1}
                song={s}
                rhythm={t.rhythm}
                inFlight={swappingTrack === k}
                nudge={nudge?.k === k ? nudge.n : 0}
                onSwap={swapTrack}
                disabled={t.locked || readOnly}
                swapLabel={`Swap track ${k + 1} of tanda ${i + 1}`}
                animateLayout={animateLayout}
              />
            ))}
          </AnimatePresence>
        </ol>
        {isPhone && (
          <div className="flex">
            <button
              type="button"
              className="cell cell-tap min-w-0 flex-1 text-left"
              aria-pressed={listen}
              aria-expanded={listen}
              aria-controls={`listen-${i + 1}`}
              onClick={() => setListen((v) => !v)}
            >
              <I name="headphones" size={16} strokeWidth={2} className="text-[var(--label-2)]" />
              <span className="min-w-0 flex-1 truncate">{listen ? "Hide player" : "Listen"}</span>
              <I
                name="chevron"
                size={16}
                strokeWidth={2.5}
                className={`cell-chevron transition-transform ${listen ? "rotate-90" : ""}`}
              />
            </button>
            <Menu
              label={`Tanda ${i + 1} actions`}
              className="icon-btn-bare mr-2 self-center"
              icon={<I name="more" size={20} strokeWidth={2} />}
              items={[lockItem, swapItem, analyseItem]}
            />
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
            <button
              type="button"
              className="cell cell-tap w-full text-left"
              onClick={() => setCortinaOpen((v) => !v)}
              aria-expanded={cortinaOpen}
              aria-controls={`cortina-${i + 1}`}
            >
              <I name="cortina" size={16} strokeWidth={2} className="text-[var(--label-2)]" />
              <span className="min-w-0 flex-1 truncate text-[var(--label-2)]">
                Cortina · {t.cortina.artist} – {t.cortina.title} · {t.cortina.lengthSec ?? 45} s
              </span>
              <I
                name="chevron"
                size={16}
                strokeWidth={2.5}
                className={`cell-chevron transition-transform ${cortinaOpen ? "rotate-90" : ""}`}
              />
            </button>
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

/** `fresh` is consumed at mount only, so a flip of it alone never re-renders the card. */
export const TandaCard = memo(TandaCardImpl, (a, b) => {
  for (const k of Object.keys({ ...a, ...b }) as Array<keyof TandaCardProps>) {
    if (k === "fresh") continue;
    if (!Object.is(a[k], b[k])) return false;
  }
  return true;
});
