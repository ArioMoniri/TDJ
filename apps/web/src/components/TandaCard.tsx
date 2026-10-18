"use client";
import { AudioLines, Lock, LockOpen, RefreshCw } from "lucide-react";
import { motion } from "motion/react";
import type { Tanda } from "@/lib/types";

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
  onLock,
  busy,
  active,
}: {
  t: Tanda;
  i: number;
  onSwap: () => void;
  onLock: () => void;
  busy?: boolean;
  active?: boolean;
}) {
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
      <ol className="mt-3 space-y-1.5">
        {t.songs.map((s, k) => (
          <li key={s.id} className="flex items-center gap-3 text-sm">
            <span className="text-muted w-4 shrink-0 text-right tabular-nums">{k + 1}</span>
            <span className="min-w-0 flex-1 truncate">
              {s.title} <span className="text-muted">({s.year ?? "?"})</span>
            </span>
            <span
              className="relative h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-[rgb(var(--text)/.12)]"
              role="img"
              aria-label={`Energy ${s.energy ?? 50} of 100`}
            >
              <span
                className="block h-full rounded-full bg-[#e0557a]"
                style={{ width: `${s.energy ?? 50}%` }}
              />
            </span>
          </li>
        ))}
      </ol>
      {t.cortina && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-[rgb(var(--text)/.08)] bg-[rgb(var(--text)/.04)] px-3 py-2 text-xs">
          <AudioLines size={14} className="mt-0.5 shrink-0 opacity-70" />
          <span className="min-w-0 sm:truncate">
            <b>Cortina</b> · {t.cortina.artist} – {t.cortina.title}{" "}
            <span className="text-muted">
              · {t.cortina.genre} · energy {t.cortina.energy} · {t.cortina.lengthSec ?? 45} s
            </span>
          </span>
        </div>
      )}
    </motion.article>
  );
}
