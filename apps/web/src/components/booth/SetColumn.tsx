"use client";
import { Lock, Repeat2 } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { durationLabel } from "@/lib/booth/plan";
import { useBooth } from "@/lib/booth/store";
import { toast } from "@/lib/toast";
import type { Playlist } from "@/lib/types";

/**
 * The set (round7-booth.md §1.1): every plan item grouped by tanda; the current item highlighted, played items
 * dimmed, locked tandas with the lock glyph. Swap / per-track swap only ahead of the playhead: the running tanda
 * and everything before it are read-only and sent as locked to /api/swap*, so the engine never touches what has
 * played. No layout animation; the column subscribes to `planIndex` only.
 */
export function SetColumn({
  jumpTo,
  onFind,
}: {
  jumpTo: number | null;
  onFind: (itemId: string, title: string) => void;
}) {
  const plan = useBooth((s) => s.plan);
  const planIndex = useBooth((s) => s.planIndex);
  const sources = useBooth((s) => s.sources);
  const playlist = useBooth((s) => s.playlist);
  const started = useBooth((s) => s.started);
  const apply = useBooth((s) => s.applySwappedPlaylist);
  const list = useRef<HTMLElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (jumpTo === null) return;
    list.current
      ?.querySelector<HTMLElement>(`[data-plan-index="${jumpTo}"]`)
      ?.scrollIntoView({ block: "center" });
  }, [jumpTo]);
  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-plan-index="${planIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [planIndex]);

  const cur = plan?.items[planIndex];
  const runningTanda = cur
    ? cur.kind === "closing" && cur.tanda > 0
      ? Number.POSITIVE_INFINITY
      : cur.tanda
    : 0;
  // the running tanda and everything before it travel locked, so the engine never touches what has played
  const lockedPlaylist = useCallback(
    (p: Playlist): Playlist => ({
      ...p,
      tandas: p.tandas.map((t, i) => (started && i + 1 <= runningTanda ? { ...t, locked: true } : t)),
    }),
    [runningTanda, started],
  );
  const swap = async (tanda: number, track?: number) => {
    if (!playlist || (started && tanda <= runningTanda)) return;
    const key = `${tanda}-${track ?? "t"}`;
    setBusy(key);
    try {
      const body =
        track === undefined
          ? { playlist: lockedPlaylist(playlist), index: tanda - 1 }
          : { playlist: lockedPlaylist(playlist), tandaIndex: tanda - 1, trackIndex: track };
      const r = await fetch(track === undefined ? "/api/swap" : "/api/swap-track", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`swap failed (${r.status})`);
      const np = (await r.json()) as Playlist;
      await apply({ ...np, tandas: np.tandas.map((t, i) => ({ ...t, locked: playlist.tandas[i]?.locked })) });
      toast(track === undefined ? `Tanda ${tanda} swapped` : `Track ${track + 1} of tanda ${tanda} swapped`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Swap failed");
    } finally {
      setBusy(null);
    }
  };
  if (!plan || !playlist) return null;
  const groups: Array<{ tanda: number; items: Array<{ i: number }> }> = [];
  plan.items.forEach((it, i) => {
    const g = groups[groups.length - 1];
    if (g && g.tanda === it.tanda) g.items.push({ i });
    else groups.push({ tanda: it.tanda, items: [{ i }] });
  });
  return (
    <section ref={list} className="booth-set" data-testid="booth-set" aria-label="Set list">
      {groups.map((g) => {
        const t = playlist.tandas[g.tanda - 1];
        const locked = started && g.tanda <= runningTanda && g.tanda > 0;
        const played = started && g.tanda < runningTanda;
        return (
          <section
            key={g.tanda}
            className={`booth-tanda ${played ? "booth-played" : ""}`}
            data-tanda={g.tanda}
            data-locked={locked || undefined}
          >
            <header className="flex items-center gap-2 px-2 pt-3 pb-1">
              <span className="text-caption1 min-w-0 flex-1 truncate font-semibold uppercase tracking-wide text-[var(--label-2)]">
                {g.tanda === 0
                  ? "Opening"
                  : t
                    ? `${g.tanda} · ${t.rhythm} · ${t.orchestra}${t.singer ? ` / ${t.singer}` : ""}`
                    : "Closing"}
              </span>
              {(locked || t?.locked) && (
                <Lock size={14} strokeWidth={2} className="text-[var(--label-3)]" aria-label="Locked" />
              )}
              {t && (
                <SwapButton
                  label={`Swap tanda ${g.tanda}`}
                  disabled={locked}
                  busy={busy === `${g.tanda}-t`}
                  onClick={() => swap(g.tanda)}
                  title={locked ? "Playing: locked" : undefined}
                />
              )}
            </header>
            <ol>
              {g.items.map(({ i }) => (
                <Row
                  key={i}
                  i={i}
                  current={i === planIndex}
                  played={started && i < planIndex}
                  locked={locked}
                  source={sources[i] ?? "missing"}
                  busy={
                    busy ===
                    `${g.tanda}-${plan.items[i]!.kind === "track" ? g.items.findIndex((x) => x.i === i) : "t"}`
                  }
                  onSwap={
                    plan.items[i]!.kind === "track" && t
                      ? () =>
                          swap(
                            g.tanda,
                            t.songs.findIndex((s) => s.id === plan.items[i]!.id),
                          )
                      : undefined
                  }
                  onFind={onFind}
                />
              ))}
            </ol>
          </section>
        );
      })}
    </section>
  );
}

function SwapButton({
  label,
  disabled,
  busy,
  onClick,
  title,
}: {
  label: string;
  disabled: boolean;
  busy: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      className="icon-btn icon-btn-bare h-11 w-11 shrink-0"
      aria-label={label}
      aria-disabled={disabled || undefined}
      title={title}
      disabled={busy}
      onClick={() => !disabled && onClick()}
      data-testid="booth-swap"
    >
      <Repeat2
        size={16}
        strokeWidth={2}
        className={`${busy ? "animate-spin" : ""} ${disabled ? "opacity-30" : ""}`}
        aria-hidden
      />
    </button>
  );
}

const Row = memo(function Row({
  i,
  current,
  played,
  locked,
  source,
  busy,
  onSwap,
  onFind,
}: {
  i: number;
  current: boolean;
  played: boolean;
  locked: boolean;
  source: string;
  busy: boolean;
  onSwap?: () => void;
  onFind: (itemId: string, title: string) => void;
}) {
  const it = useBooth((s) => s.plan?.items[i]);
  const rehearsal = useBooth((s) => s.sourceMode === "preview");
  if (!it) return null;
  const missing = source === "missing" && it.kind !== "break";
  return (
    <li
      className={`booth-row ${current ? "booth-row-on" : ""} ${played ? "booth-played" : ""}`}
      data-plan-index={i}
      data-kind={it.kind}
      aria-current={current ? "true" : undefined}
      data-source={source}
    >
      <span className="booth-row-n tabular-nums">
        {it.kind === "cortina" ? "♪" : it.kind === "break" ? "—" : it.n}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">
          {it.title}
          {it.birthday ? " · birthday" : ""}
        </span>
        <span className="text-footnote block truncate text-[var(--label-2)]">
          {it.kind === "cortina"
            ? `cortina · ${it.artist} · in ${durationLabel(it.trimInSec ?? 0)} · stop ${durationLabel(it.stopSec ?? 0)}`
            : it.artist}
          {it.year ? ` · ${it.year}` : ""}
          {source === "spotify" ? " · Spotify" : missing ? " · no source" : rehearsal ? " · 30 s" : ""}
        </span>
      </span>
      <span className="text-caption1 tabular-nums text-[var(--label-3)]">
        {durationLabel(rehearsal && it.kind !== "break" ? Math.min(30, it.lengthSec) : it.lengthSec)}
      </span>
      {missing && it.id && (
        <button
          type="button"
          className="btn-plain text-caption1 -mr-1"
          onClick={() => onFind(it.id!, it.title)}
          data-testid="booth-find"
        >
          Find…
        </button>
      )}
      {onSwap && (
        <SwapButton
          label={`Swap track ${it.n}`}
          disabled={locked}
          busy={busy}
          onClick={onSwap}
          title={locked ? "Playing: locked" : undefined}
        />
      )}
    </li>
  );
});
