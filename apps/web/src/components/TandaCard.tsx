"use client";
import { AudioLines, AudioWaveform, ChevronRight, Headphones, Lock, LockOpen, Repeat2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { analyseTanda } from "@/lib/analyze";
import { cohesionFor } from "@/lib/audio";
import { haptic } from "@/lib/haptics";
import { CARD_STAGGER_CAP, DUR, EASE, STAGGER } from "@/lib/motion";
import { useStore } from "@/lib/store";
import type { ReferencePlaylist, Tanda } from "@/lib/types";
import { CohesionBadge } from "./CohesionBadge";
import { CountUp } from "./CountUp";
import { CortinaPreview, TandaListen } from "./Listen";
import { Menu } from "./Menu";
import { SwipeRow } from "./SwipeRow";
import { TrackRow } from "./TrackRow";

const PHASE: Record<string, string> = {
  warmup: "warm-up",
  build: "build",
  peak: "peak",
  cooldown: "cool-down",
  close: "close",
};

/** A tanda as one inset group: artwork tile + title row, track rows, cortina row, Listen (row on phone, menu on desktop). */
export function TandaCard({
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
}: {
  t: Tanda;
  i: number;
  onSwap: () => void;
  onSwapTrack: (k: number) => void;
  onLock: () => void;
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
  /** first reveal of a new set: stagger the entrance from index 0 */
  fresh?: boolean;
  /** a per-track swap found nothing: row `k` nudges once per `n` */
  nudge?: { k: number; n: number } | null;
  /** the energy before a swap, so the number counts from old to new */
  prevEnergy?: number;
}) {
  const reduced = useReducedMotion();
  const [listen, setListen] = useState(false);
  const [cortinaOpen, setCortinaOpen] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const overrides = useStore((s) => s.overrides);
  const cohesion = useMemo(() => cohesionFor(t, overrides), [t, overrides]);
  const ref = useRef<HTMLElement>(null);
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
  const delay = reduced ? 0 : (fresh ? Math.min(i, CARD_STAGGER_CAP) : 0) * STAGGER.cards;
  const lock = () => {
    haptic(8);
    onLock();
  };
  const sub = [
    t.singer ?? "Instrumental",
    t.yearRange ? yr(t.yearRange[0], t.yearRange[1]) : "year ?",
    PHASE[t.phase] ?? t.phase,
    t.locked ? "locked" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <motion.article
      ref={ref}
      layout={reduced ? false : t.locked ? "position" : true}
      initial={{ opacity: 0, y: reduced ? 0 : 12 }}
      animate={{
        opacity: dim ? 0.55 : 1,
        y: 0,
        scale: dim && !reduced ? 0.985 : 1,
        transition: { duration: dim ? DUR.base : 0.32, ease: EASE.out, delay: dim ? 0 : delay },
      }}
      exit={{ opacity: 0, scale: reduced ? 1 : 0.98, transition: { duration: DUR.fast, ease: EASE.in } }}
      style={{ willChange: "transform, opacity" }}
      className={`group-inset group/card min-w-0 ${active ? "ring-2 ring-[var(--tint)]" : ""} ${
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
      <motion.div animate={{ opacity: busy ? 0.6 : 1 }} transition={{ duration: DUR.base }}>
        <SwipeRow
          leading="art"
          actions={
            readOnly
              ? []
              : [
                  {
                    kind: "lock",
                    label: t.locked ? "Unlock" : "Lock",
                    icon: t.locked ? LockOpen : Lock,
                    onClick: lock,
                  },
                  { kind: "swap", label: "Swap", icon: Repeat2, onClick: onSwap, disabled: t.locked || busy },
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
              <span
                className="text-caption1 hidden text-[var(--label-2)] sm:block"
                title="The arc's target energy for this slot"
              >
                target {t.targetEnergy}
              </span>
            </span>
            {!readOnly && (
              <span className="hidden items-center gap-0.5 sm:inline-flex">
                <button
                  type="button"
                  className="icon-btn icon-btn-bare -my-2 h-9 w-9 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/card:opacity-100 data-[on]:opacity-100"
                  aria-label={t.locked ? `Unlock tanda ${i + 1}` : `Lock tanda ${i + 1}`}
                  aria-pressed={t.locked}
                  data-on={t.locked || undefined}
                  onClick={lock}
                >
                  {t.locked ? (
                    <LockOpen size={17} strokeWidth={1.75} />
                  ) : (
                    <Lock size={17} strokeWidth={1.75} />
                  )}
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn-bare -my-2 h-9 w-9 opacity-0 transition-opacity focus-visible:opacity-100 disabled:opacity-0 group-hover/card:opacity-100"
                  aria-label={`Swap tanda ${i + 1}`}
                  disabled={t.locked || busy}
                  onClick={onSwap}
                >
                  <Repeat2 size={17} strokeWidth={1.75} className={busy ? "animate-spin" : ""} />
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
            <Menu
              label={`Tanda ${i + 1} actions`}
              className="-mr-3 max-sm:sr-only sm:inline-flex"
              contextRef={ref}
              items={[
                !readOnly && {
                  label: t.locked ? "Unlock tanda" : "Lock tanda",
                  icon: t.locked ? LockOpen : Lock,
                  onClick: lock,
                },
                !readOnly && {
                  label: "Swap tanda",
                  icon: Repeat2,
                  onClick: onSwap,
                  disabled: t.locked || busy,
                },
                {
                  label: listen ? "Hide player" : "Listen",
                  icon: Headphones,
                  onClick: () => setListen((v) => !v),
                },
                {
                  label: analysing ? "Analysing…" : "Analyse all tracks",
                  icon: AudioWaveform,
                  onClick: analyseAll,
                  disabled: analysing,
                },
              ]}
            />
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
                onSwap={() => onSwapTrack(k)}
                disabled={t.locked || readOnly}
                swapLabel={`Swap track ${k + 1} of tanda ${i + 1}`}
              />
            ))}
          </AnimatePresence>
        </ol>
        <div className="flex sm:hidden">
          <button
            type="button"
            className="cell cell-tap min-w-0 flex-1 text-left"
            aria-pressed={listen}
            aria-expanded={listen}
            aria-controls={`listen-${i + 1}`}
            onClick={() => setListen((v) => !v)}
          >
            <Headphones size={16} strokeWidth={2} className="text-[var(--label-2)]" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{listen ? "Hide player" : "Listen"}</span>
            <ChevronRight
              size={16}
              strokeWidth={2.5}
              className={`cell-chevron transition-transform ${listen ? "rotate-90" : ""}`}
              aria-hidden
            />
          </button>
          <Menu
            label={`Tanda ${i + 1} actions`}
            className="icon-btn-bare mr-2 self-center"
            items={[
              !readOnly && {
                label: t.locked ? "Unlock tanda" : "Lock tanda",
                icon: t.locked ? LockOpen : Lock,
                onClick: lock,
              },
              !readOnly && {
                label: "Swap tanda",
                icon: Repeat2,
                onClick: onSwap,
                disabled: t.locked || busy,
              },
              {
                label: analysing ? "Analysing…" : "Analyse all tracks",
                icon: AudioWaveform,
                onClick: analyseAll,
                disabled: analysing,
              },
            ]}
          />
        </div>
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
              <AudioLines size={16} strokeWidth={2} className="text-[var(--label-2)]" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[var(--label-2)]">
                Cortina · {t.cortina.artist} – {t.cortina.title} · {t.cortina.lengthSec ?? 45} s
              </span>
              <ChevronRight
                size={16}
                strokeWidth={2.5}
                className={`cell-chevron transition-transform ${cortinaOpen ? "rotate-90" : ""}`}
                aria-hidden
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
      </motion.div>
    </motion.article>
  );
}
