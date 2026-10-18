"use client";
import { Lock, LockOpen, Music2, RefreshCw } from "lucide-react";
import { motion } from "motion/react";
import type { Tanda } from "@/lib/types";

const TONE: Record<string, string> = {
  tango: "from-rose-400/60 to-rose-600/40",
  vals: "from-teal-300/60 to-teal-500/40",
  milonga: "from-violet-300/60 to-violet-500/40",
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
  const max = Math.max(...t.energyCurve, 1);
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(i * 0.03, 0.4) }}
      className={`glass overflow-hidden p-4 sm:p-5 ${active ? "ring-2 ring-rose-400/70" : ""}`}
      id={`tanda-${i + 1}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full bg-gradient-to-br px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white shadow ${TONE[t.rhythm]}`}
            >
              {t.rhythm}
            </span>
            <span className="text-muted text-xs">
              #{i + 1} · {t.phase} · {t.yearRange ? `${t.yearRange[0]}–${t.yearRange[1]}` : "year ?"}
            </span>
          </div>
          <h3 className="mt-1.5 truncate text-lg font-semibold leading-tight">{t.orchestra}</h3>
          <p className="text-muted truncate text-sm">{t.singer ?? "Instrumental"}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="text-right">
            <div className="text-2xl font-semibold tabular-nums">{t.energy}</div>
            <div className="text-muted -mt-1 text-[10px]">energy · target {t.targetEnergy}</div>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onLock}
              className="chip !min-h-9 !px-2.5"
              aria-label={t.locked ? "Unlock tanda" : "Lock tanda"}
            >
              {t.locked ? <Lock size={14} /> : <LockOpen size={14} />}
            </button>
            <button
              type="button"
              onClick={onSwap}
              disabled={busy || t.locked}
              className="chip !min-h-9 !px-2.5 disabled:opacity-40"
              aria-label="Swap tanda"
            >
              <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
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
            <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <span
                className="block h-full rounded-full bg-rose-400"
                style={{ width: `${((s.energy ?? 50) / max) * 100}%` }}
              />
            </span>
          </li>
        ))}
      </ol>
      {t.cortina && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-xs dark:bg-white/5">
          <Music2 size={14} className="shrink-0 opacity-70" />
          <span className="truncate">
            <b>Cortina</b> · {t.cortina.artist} – {t.cortina.title}{" "}
            <span className="text-muted">
              · {t.cortina.genre} · e{t.cortina.energy} · {t.cortina.lengthSec ?? 45}s
            </span>
          </span>
        </div>
      )}
    </motion.article>
  );
}
