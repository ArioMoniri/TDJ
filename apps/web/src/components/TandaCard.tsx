"use client";
import { type DotLottie, DotLottieReact } from "@lottiefiles/dotlottie-react";
import { AudioLines, Headphones, Lock, LockOpen, RefreshCw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";
import { useInViewport } from "@/lib/hooks";
import { CARD_STAGGER_CAP, DUR, EASE, SPRING, STAGGER, fade, lineSwap, rise } from "@/lib/motion";
import type { ReferencePlaylist, Tanda } from "@/lib/types";
import { CountUp } from "./CountUp";
import { CortinaPreview, TandaListen } from "./Listen";

const PILL: Record<string, string> = {
  tango: "bg-rose-700 text-white",
  vals: "bg-teal-700 text-white",
  milonga: "bg-violet-700 text-white",
};
const PHASE: Record<string, string> = {
  warmup: "warm-up",
  build: "build",
  peak: "peak",
  cooldown: "cool-down",
  close: "close",
};

/** Ambient "this tanda has audio" marker in the Listen chip: ≤ 1 loop per viewport (the one nearest centre). */
function ListenBars({ active }: { active: boolean }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInViewport(ref, 0.6);
  return (
    <span ref={ref} className="inline-block h-4 w-4" aria-hidden>
      <DotLottieReact
        src="/anim/listen-bars.json"
        loop
        autoplay={active && inView && !reduced}
        style={{ width: "100%", height: "100%" }}
      />
    </span>
  );
}

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
  const [hover, setHover] = useState(false);
  const wave = useRef<DotLottie | null>(null);
  const wavePlaying = (hover || cortinaOpen || listen) && !reduced;
  useEffect(() => {
    const w = wave.current;
    if (!w) return;
    if (wavePlaying) w.play();
    else {
      w.pause();
      w.setFrame(0);
    }
  }, [wavePlaying]);
  const dim = settling && !t.locked;
  const delay = reduced ? 0 : (fresh ? Math.min(i, CARD_STAGGER_CAP) : 0) * STAGGER.cards;

  return (
    <motion.article
      layout={reduced ? false : t.locked ? "position" : true}
      initial={{ opacity: 0, y: reduced ? 0 : 12 }}
      animate={{
        opacity: dim ? 0.55 : 1,
        y: 0,
        scale: dim && !reduced ? 0.985 : 1,
        transition: { duration: dim ? DUR.base : 0.32, ease: EASE.out, delay: dim ? 0 : delay },
      }}
      exit={{ opacity: 0, scale: reduced ? 1 : 0.98, transition: { duration: DUR.fast, ease: EASE.in } }}
      transition={SPRING.gentle}
      style={{ willChange: "transform, opacity" }}
      className={`surface overflow-hidden p-4 sm:p-5 ${active ? "ring-2 ring-[var(--accent)]" : ""} ${
        t.locked
          ? settling
            ? "border-[color-mix(in_srgb,var(--color-gold)_70%,transparent)]"
            : "border-[color-mix(in_srgb,var(--color-gold)_40%,transparent)]"
          : ""
      }`}
      id={`tanda-${i + 1}`}
      aria-busy={busy || undefined}
      data-locked={t.locked || undefined}
    >
      {/* curve dot → card hand-off: a one-shot ring pulse on arrival */}
      {active && !reduced && (
        <motion.span
          key={`pulse-${i}`}
          className="pointer-events-none absolute inset-0 rounded-[16px] ring-2 ring-[var(--accent)]"
          initial={{ scale: 1, opacity: 1 }}
          animate={{ scale: [1, 1.015, 1], opacity: [1, 0.6, 1] }}
          transition={{ duration: 0.5, ease: EASE.inOut }}
          aria-hidden
        />
      )}
      <motion.div animate={{ opacity: busy ? 0.6 : 1 }} transition={{ duration: DUR.base }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${PILL[t.rhythm]}`}
              >
                {t.rhythm}
              </span>
              <span className="text-muted text-xs">
                #{i + 1} · {PHASE[t.phase] ?? t.phase} ·{" "}
                {t.yearRange ? `${t.yearRange[0]}–${t.yearRange[1]}` : "year ?"}
              </span>
              <AnimatePresence initial={false}>
                {t.locked && (
                  <motion.span
                    key="locked"
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -4 }}
                    transition={{ duration: DUR.base, ease: EASE.out }}
                    className="text-muted inline-flex items-center gap-1 text-xs"
                  >
                    <Lock size={11} /> locked
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <h3 className="mt-1.5 truncate text-lg font-semibold leading-tight">{t.orchestra}</h3>
            <p className="text-muted truncate text-sm">{t.singer ?? "Instrumental"}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="text-right">
              <div className="text-2xl font-semibold tabular-nums">
                <CountUp value={t.energy} from={prevEnergy ?? t.energy} duration={DUR.slow} />
              </div>
              <div className="text-muted -mt-1 text-xs">of {t.targetEnergy} target</div>
            </div>
            <div className="flex gap-2">
              <motion.button
                type="button"
                onClick={() => {
                  haptic(8);
                  onLock();
                }}
                className="icon-btn"
                aria-pressed={!!t.locked}
                aria-label={`${t.locked ? "Unlock" : "Lock"} tanda ${i + 1}`}
                whileTap={{ scale: 0.92 }}
                animate={{
                  backgroundColor: t.locked ? "rgb(var(--text) / 0.12)" : "rgb(var(--text) / 0.05)",
                }}
                transition={{ duration: DUR.fast }}
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={t.locked ? "locked" : "open"}
                    initial={{ scale: 0.85, opacity: 0, rotate: t.locked ? -8 : 0 }}
                    animate={{ scale: 1, opacity: 1, rotate: 0 }}
                    exit={{ scale: 0.85, opacity: 0 }}
                    transition={SPRING.snappy}
                    className="inline-flex"
                  >
                    {t.locked ? <Lock size={16} /> : <LockOpen size={16} />}
                  </motion.span>
                </AnimatePresence>
              </motion.button>
              <button
                type="button"
                onClick={onSwap}
                disabled={busy || t.locked}
                className="icon-btn"
                aria-label={`Swap tanda ${i + 1}`}
              >
                <RefreshCw size={16} className={busy ? "animate-spin" : ""} />
              </button>
            </div>
          </div>
        </div>
        {t.reason && <p className="text-muted mt-2 line-clamp-2 text-xs leading-snug">{t.reason}</p>}
        <ol className="mt-3 space-y-0.5">
          <AnimatePresence mode="popLayout" initial={false}>
            {t.songs.map((s, k) => {
              const inFlight = swappingTrack === k;
              return (
                <motion.li
                  key={s.id}
                  layout={reduced ? false : "position"}
                  variants={lineSwap}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  className="flex min-h-11 items-center gap-2 text-sm"
                >
                  <span className="text-muted w-4 shrink-0 text-right tabular-nums">{k + 1}</span>
                  <motion.span
                    className="min-w-0 flex-1 truncate"
                    animate={{
                      opacity: inFlight ? 0.6 : 1,
                      x: nudge?.k === k && !reduced ? [0, -3, 3, 0] : 0,
                    }}
                    transition={{ duration: nudge?.k === k ? 0.24 : DUR.fast }}
                    key={`${s.id}-${nudge?.k === k ? nudge.n : 0}`}
                  >
                    {s.title}{" "}
                    <span className="text-muted">
                      ({(s as { yearApprox?: boolean }).yearApprox ? "c. " : ""}
                      {s.year ?? "?"})
                    </span>
                  </motion.span>
                  <span
                    className="relative h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-[rgb(var(--text)/.12)] sm:w-16"
                    role="img"
                    aria-label={`Energy ${s.energy ?? 50} of 100`}
                  >
                    <motion.span
                      className="block h-full w-full origin-left rounded-full bg-[#e0557a]"
                      initial={false}
                      animate={{ scaleX: (s.energy ?? 50) / 100 }}
                      transition={{ duration: DUR.slow, ease: EASE.inOut }}
                    />
                  </span>
                  <button
                    type="button"
                    onClick={() => onSwapTrack(k)}
                    disabled={t.locked || inFlight}
                    className="icon-btn opacity-70 hover:opacity-100"
                    aria-label={`Swap track ${k + 1} of tanda ${i + 1}`}
                    title="Swap this track for another of the same family"
                  >
                    <RefreshCw size={14} className={inFlight ? "animate-spin" : ""} />
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
        <div className="mt-2">
          <button
            type="button"
            className="chip"
            aria-pressed={listen}
            aria-expanded={listen}
            aria-controls={`listen-${i + 1}`}
            onClick={() => setListen((v) => !v)}
          >
            {listen ? <ListenBars active /> : <Headphones size={14} />} {listen ? "Hide player" : "Listen"}
          </button>
          <AnimatePresence initial={false}>
            {listen && (
              <motion.div
                id={`listen-${i + 1}`}
                key="listen"
                variants={rise}
                initial="hidden"
                animate="show"
                exit={fade.exit}
                className="mt-3"
              >
                <TandaListen t={t} playlists={playlists} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {t.cortina && (
          <div className="mt-3 rounded-xl border border-[rgb(var(--text)/.08)] text-xs">
            <motion.button
              type="button"
              onClick={() => setCortinaOpen((v) => !v)}
              onHoverStart={() => setHover(true)}
              onHoverEnd={() => setHover(false)}
              onFocus={() => setHover(true)}
              onBlur={() => setHover(false)}
              whileTap={{ scale: 0.995 }}
              animate={{
                backgroundColor: hover || cortinaOpen ? "rgb(var(--text) / 0.07)" : "rgb(var(--text) / 0.04)",
              }}
              transition={{ duration: DUR.fast }}
              aria-expanded={cortinaOpen}
              aria-controls={`cortina-${i + 1}`}
              className="flex min-h-11 w-full items-start gap-2 rounded-xl px-3 py-2 text-left"
            >
              <span className="mt-0.5 inline-grid h-4 w-5 shrink-0 place-items-center" aria-hidden>
                {reduced ? (
                  <AudioLines size={14} className="opacity-70" />
                ) : (
                  <DotLottieReact
                    src="/anim/cortina-wave.json"
                    loop
                    autoplay={false}
                    dotLottieRefCallback={(d) => {
                      wave.current = d;
                    }}
                    style={{ width: 20, height: 10 }}
                  />
                )}
              </span>
              <span className="min-w-0">
                <b>Cortina</b> · {t.cortina.artist} – {t.cortina.title}
                <span className="text-muted block sm:inline">
                  {" "}
                  · {t.cortina.genre} · energy {t.cortina.energy} · {t.cortina.lengthSec ?? 45} s
                </span>
              </span>
            </motion.button>
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
                  <div className="px-3 pb-2">
                    <CortinaPreview c={t.cortina} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </motion.article>
  );
}
