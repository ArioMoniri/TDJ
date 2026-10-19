"use client";
import { AudioLines, Headphones, Lock, LockOpen, RefreshCw } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import type { ReferencePlaylist, Tanda } from "@/lib/types";
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
}) {
  const [listen, setListen] = useState(false);
  return (
    <motion.article
      layout
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`surface overflow-hidden p-4 sm:p-5 ${active ? "ring-2 ring-[var(--accent)]" : ""}`}
      id={`tanda-${i + 1}`}
      aria-busy={busy || undefined}
    >
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
            {t.locked && (
              <span className="text-muted inline-flex items-center gap-1 text-xs">
                <Lock size={11} /> locked
              </span>
            )}
          </div>
          <h3 className="mt-1.5 truncate text-lg font-semibold leading-tight">{t.orchestra}</h3>
          <p className="text-muted truncate text-sm">{t.singer ?? "Instrumental"}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="text-right">
            <div className="text-2xl font-semibold tabular-nums">{t.energy}</div>
            <div className="text-muted -mt-1 text-xs">of {t.targetEnergy} target</div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onLock}
              className="icon-btn"
              aria-pressed={!!t.locked}
              aria-label={`${t.locked ? "Unlock" : "Lock"} tanda ${i + 1}`}
            >
              {t.locked ? <Lock size={16} /> : <LockOpen size={16} />}
            </button>
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
        {t.songs.map((s, k) => (
          <li key={s.id} className="flex min-h-11 items-center gap-2 text-sm">
            <span className="text-muted w-4 shrink-0 text-right tabular-nums">{k + 1}</span>
            <span className="min-w-0 flex-1 truncate">
              {s.title}{" "}
              <span className="text-muted">
                ({(s as { yearApprox?: boolean }).yearApprox ? "c. " : ""}
                {s.year ?? "?"})
              </span>
            </span>
            <span
              className="relative h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-[rgb(var(--text)/.12)] sm:w-16"
              role="img"
              aria-label={`Energy ${s.energy ?? 50} of 100`}
            >
              <span
                className="block h-full rounded-full bg-[#e0557a]"
                style={{ width: `${s.energy ?? 50}%` }}
              />
            </span>
            <button
              type="button"
              onClick={() => onSwapTrack(k)}
              disabled={t.locked || swappingTrack === k}
              className="icon-btn opacity-70 hover:opacity-100"
              aria-label={`Swap track ${k + 1} of tanda ${i + 1}`}
              title="Swap this track for another of the same family"
            >
              <RefreshCw size={14} className={swappingTrack === k ? "animate-spin" : ""} />
            </button>
          </li>
        ))}
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
          <Headphones size={14} /> {listen ? "Hide player" : "Listen"}
        </button>
        {listen && (
          <div id={`listen-${i + 1}`} className="mt-3">
            <TandaListen t={t} playlists={playlists} />
          </div>
        )}
      </div>
      {t.cortina && (
        <div className="mt-3 rounded-xl border border-[rgb(var(--text)/.08)] bg-[rgb(var(--text)/.04)] px-3 py-2 text-xs">
          <div className="flex items-start gap-2">
            <AudioLines size={14} className="mt-0.5 shrink-0 opacity-70" />
            <span className="min-w-0">
              <b>Cortina</b> · {t.cortina.artist} – {t.cortina.title}
              <span className="text-muted block sm:inline">
                {" "}
                · {t.cortina.genre} · energy {t.cortina.energy} · {t.cortina.lengthSec ?? 45} s
              </span>
            </span>
          </div>
          {listen && (
            <div className="mt-2">
              <CortinaPreview c={t.cortina} />
            </div>
          )}
        </div>
      )}
    </motion.article>
  );
}
