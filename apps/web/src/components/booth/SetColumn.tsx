"use client";
import { Lock, Repeat2, Search, SlidersHorizontal } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { spotifyOf } from "@/lib/booth/clips";
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
  onCortina,
}: {
  jumpTo: number | null;
  onFind: (itemId: string, title: string) => void;
  /** round 20: open the cortina's envelope sheet (fade in / fade out / stop at) */
  onCortina?: (planIndex: number) => void;
}) {
  const plan = useBooth((s) => s.plan);
  const planIndex = useBooth((s) => s.planIndex);
  const sources = useBooth((s) => s.sources);
  const playlist = useBooth((s) => s.playlist);
  const started = useBooth((s) => s.started);
  const rehearsal = useBooth((s) => s.rehearsal);
  const apply = useBooth((s) => s.applySwappedPlaylist);
  const list = useRef<HTMLElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (jumpTo === null) return;
    list.current
      ?.querySelector<HTMLElement>(`[data-plan-index="${jumpTo}"]`)
      ?.scrollIntoView({ block: "center" });
  }, [jumpTo]);
  // follow the playhead inside the column's own scroller only (≥ 1024 the column scrolls): on a phone the column is
  // part of the page, and scrolling the window to the current row pushed the Now card under the glass header
  useEffect(() => {
    const box = list.current;
    const row = box?.querySelector<HTMLElement>(`[data-plan-index="${planIndex}"]`);
    if (!box || !row) return;
    const oy = getComputedStyle(box).overflowY;
    if ((oy !== "auto" && oy !== "scroll") || box.scrollHeight <= box.clientHeight) return;
    const b = box.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    if (r.top < b.top) box.scrollTop -= b.top - r.top + 8;
    else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 8;
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
              {/* the running tanda: a filled lock in tint ("Playing now"); the DJ's own lock stays gold */}
              {locked ? (
                <Lock
                  size={14}
                  strokeWidth={2}
                  fill="currentColor"
                  className="text-[var(--tint)]"
                  aria-label="Playing now: read-only"
                >
                  <title>Playing now</title>
                </Lock>
              ) : (
                t?.locked && (
                  <Lock size={14} strokeWidth={2} className="text-[var(--system-gold)]" aria-label="Locked" />
                )
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
              {g.items.map(({ i }, k) => (
                <Row
                  key={i}
                  i={i}
                  k={g.items.slice(0, k).filter((x) => plan.items[x.i]!.kind === "track").length + 1}
                  current={i === planIndex}
                  played={started && i < planIndex}
                  locked={locked}
                  source={sources[i] ?? "missing"}
                  rehearsal={rehearsal}
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
                  onCortina={onCortina}
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
  k,
  current,
  played,
  locked,
  source,
  rehearsal,
  busy,
  onSwap,
  onFind,
  onCortina,
}: {
  i: number;
  /** the track's number inside its tanda (the DJ thinks "track 2 of tanda 7", not plan index 9) */
  k: number;
  current: boolean;
  played: boolean;
  locked: boolean;
  source: string;
  rehearsal: boolean;
  busy: boolean;
  onSwap?: () => void;
  onFind: (itemId: string, title: string) => void;
  onCortina?: (planIndex: number) => void;
}) {
  const it = useBooth((s) => s.plan?.items[i]);
  const entity = useBooth((s) => s.entities[i]);
  if (!it) return null;
  const missing = source === "missing" && it.kind !== "break";
  const sp = spotifyOf(entity);
  // one fixed action slot (44 px): Find… a file where the night needs one, else the checked Spotify recording
  const find = missing && !!it.id && (!rehearsal || !sp?.url);
  return (
    <li
      className={`booth-row ${current ? "booth-row-on" : ""} ${played ? "booth-played" : ""}`}
      data-plan-index={i}
      data-kind={it.kind}
      aria-current={current ? "true" : undefined}
      data-source={source}
      data-spotify={sp?.uri}
    >
      <span className="booth-row-n tabular-nums">
        {it.kind === "cortina" ? "♪" : it.kind === "break" ? "—" : k}
      </span>
      <span className="min-w-0 flex-1">
        <span className="booth-row-title block">
          {it.title}
          {it.birthday ? " · birthday" : ""}
        </span>
        <span className="booth-row-sub text-footnote block truncate text-[var(--label-2)]">
          {it.kind === "cortina"
            ? `cortina · ${it.artist} · in ${durationLabel(it.trimInSec ?? 0)} · stop ${durationLabel(it.stopSec ?? 0)}`
            : it.artist}
          {it.year ? ` · ${it.year}` : ""}
          {source === "spotify" ? " · Spotify" : missing ? (rehearsal ? " · no clip" : " · no source") : ""}
        </span>
      </span>
      {/* the planned length (the Spotify recording's when the side has one), so the DJ can read the night */}
      <span
        className="booth-row-len text-caption1 tabular-nums text-[var(--label-3)]"
        data-testid="booth-row-len"
      >
        {durationLabel(it.lengthSec)}
      </span>
      <span className="booth-row-act">
        {find ? (
          <button
            type="button"
            className="icon-btn icon-btn-bare booth-find h-11 w-11"
            onClick={() => onFind(it.id!, it.title)}
            aria-label={`Find a file for ${it.title}`}
            title="Find a file…"
            data-testid="booth-find"
          >
            <Search size={16} strokeWidth={2} aria-hidden />
          </button>
        ) : sp?.url ? (
          <a
            href={sp.url}
            target="_blank"
            rel="noopener noreferrer"
            className="booth-spotify icon-btn icon-btn-bare h-11 w-11"
            aria-label={`Open ${it.title} in Spotify (the recording the booth plays)`}
            title="The Spotify recording · open in Spotify"
            data-testid="booth-spotify-link"
          >
            <SpotifyMark />
          </a>
        ) : null}
      </span>
      {onSwap ? (
        <SwapButton
          label={`Swap track ${it.n}`}
          disabled={locked}
          busy={busy}
          onClick={onSwap}
          title={locked ? "Playing: locked" : undefined}
        />
      ) : it.kind === "cortina" && onCortina && !played ? (
        <button
          type="button"
          className="icon-btn icon-btn-bare h-11 w-11 shrink-0"
          aria-label={`Fades and stop of the cortina ${it.title}`}
          title="Fade in, fade out, stop at"
          onClick={() => onCortina(i)}
          data-testid="booth-cortina-edit"
        >
          <SlidersHorizontal size={16} strokeWidth={2} aria-hidden />
        </button>
      ) : (
        <span className="booth-row-act" aria-hidden />
      )}
    </li>
  );
});

/** Spotify's mark (the attribution its guidelines ask for beside a link to a track), 16 px, in the label colour */
function SpotifyMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden className="booth-spotify-mark">
      <circle cx="12" cy="12" r="11" fill="currentColor" />
      <path
        d="M6.5 9.3c3.6-1.1 8-.8 11.2 1.1M7.1 12.4c3-.9 6.5-.6 9.2 1M7.7 15.3c2.4-.7 5.1-.5 7.2.8"
        fill="none"
        stroke="rgb(var(--bg-cell))"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
