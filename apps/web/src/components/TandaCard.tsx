"use client";
import { AudioLines, ChevronRight, Headphones, Lock, LockOpen, Repeat2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
import { haptic } from "@/lib/haptics";
import { CARD_STAGGER_CAP, DUR, EASE, STAGGER } from "@/lib/motion";
import type { ReferencePlaylist, Tanda } from "@/lib/types";
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
}: {
  t: Tanda;
  i: number;
  onSwap: () => void;
  onSwapTrack: (k: number) => void;
  onLock: () => void;
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
  const ref = useRef<HTMLElement>(null);
  const dim = settling && !t.locked;
  const delay = reduced ? 0 : (fresh ? Math.min(i, CARD_STAGGER_CAP) : 0) * STAGGER.cards;
  const lock = () => {
    haptic(8);
    onLock();
  };
  const sub = [
    t.singer ?? "Instrumental",
    t.yearRange ? `${t.yearRange[0]}–${t.yearRange[1]}` : "year ?",
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
      className={`group-inset ${active ? "ring-2 ring-[var(--tint)]" : ""} ${
        t.locked ? "ring-1 ring-[color-mix(in_srgb,var(--system-gold)_60%,transparent)]" : ""
      }`}
      id={`tanda-${i + 1}`}
      aria-busy={busy || undefined}
      data-locked={t.locked || undefined}
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
          actions={[
            {
              kind: "lock",
              label: t.locked ? "Unlock" : "Lock",
              icon: t.locked ? LockOpen : Lock,
              onClick: lock,
            },
            { kind: "swap", label: "Swap", icon: Repeat2, onClick: onSwap, disabled: t.locked || busy },
          ]}
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
              {t.note && (
                <span
                  className="text-caption1 mt-0.5 inline-flex rounded-full bg-[color-mix(in_srgb,var(--tint)_14%,transparent)] px-2 py-0.5 font-medium text-[var(--tint)]"
                  data-testid="tanda-note"
                >
                  {t.note}
                </span>
              )}
            </span>
            <span className="text-right">
              <span className="text-headline block tabular-nums">
                <CountUp value={t.energy} from={prevEnergy ?? t.energy} duration={DUR.slow} />
              </span>
              <span className="text-caption1 block text-[var(--label-2)]">target {t.targetEnergy}</span>
            </span>
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
              className="-mr-3 hidden sm:inline-flex"
              contextRef={ref}
              items={[
                {
                  label: t.locked ? "Unlock tanda" : "Lock tanda",
                  icon: t.locked ? LockOpen : Lock,
                  onClick: lock,
                },
                { label: "Swap tanda", icon: Repeat2, onClick: onSwap, disabled: t.locked || busy },
                {
                  label: listen ? "Hide player" : "Listen",
                  icon: Headphones,
                  onClick: () => setListen((v) => !v),
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
                title={s.title}
                year={s.year}
                approx={(s as { yearApprox?: boolean }).yearApprox}
                energy={s.energy ?? 50}
                inFlight={swappingTrack === k}
                nudge={nudge?.k === k ? nudge.n : 0}
                onSwap={() => onSwapTrack(k)}
                disabled={t.locked}
                swapLabel={`Swap track ${k + 1} of tanda ${i + 1}`}
              />
            ))}
          </AnimatePresence>
        </ol>
        <button
          type="button"
          className="cell cell-tap w-full sm:hidden"
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
              className="cell cell-tap w-full"
              onClick={() => setCortinaOpen((v) => !v)}
              aria-expanded={cortinaOpen}
              aria-controls={`cortina-${i + 1}`}
            >
              <AudioLines size={16} strokeWidth={2} className="text-[var(--label-2)]" aria-hidden />
              <span className="text-footnote min-w-0 flex-1 truncate text-[var(--label-2)]">
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
