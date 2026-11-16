"use client";
import { bypassedTandas } from "@tdj/core";
import { Headphones, Lock, Repeat2, Search, SlidersHorizontal } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { spotifyOf } from "@/lib/booth/clips";
import { cortinaStartOf } from "@/lib/booth/cortinaStart";
import { useIndicators } from "@/lib/booth/indicatorPrefs";
import { cortinaSpan, cortinaSwapLabel, swapLabel } from "@/lib/booth/nightView";
import { durationLabel } from "@/lib/booth/plan";
import { energyOf } from "@/lib/booth/songInfo";
import { useBooth } from "@/lib/booth/store";
import { useBoothSwap } from "@/lib/booth/swap";
import { t as tx } from "@/lib/i18n";
import { tempoLevel } from "@/lib/tempo";
import { toast } from "@/lib/toast";
import type { Playlist } from "@/lib/types";
import { metaLine, yearSpan, yearText } from "@/lib/year";
import { useTandaSwap } from "../TandaSwapSheet";
import { Artwork } from "../ui/Artwork";
import { BpmKey } from "../ui/BpmKey";
import { EraBadge } from "../ui/EraBadge";
import { TandaPlayCover } from "../ui/TandaPlay";
import { TandaTypeBadge } from "../ui/TandaTypeBadge";
import { FloorMenu, FloorReaction } from "./FloorReaction";
import { PraiseTanda } from "./PraiseTanda";
import { dragHandle } from "./reorder";
import { SongSheet } from "./SongSheet";
import { hasTransition, transitionSummary } from "./TransitionSheet";

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
  onTapRow,
  onOpenRow,
  onTransition,
  follow = false,
}: {
  /** 2026-11: a tapped row plays (the page decides how: from here before the night, the headphones during it) */
  onTapRow?: (planIndex: number) => void;
  /** the row's number opens its sheet (the page owns it, so Now's "Song info" opens the same one) */
  onOpenRow?: (planIndex: number) => void;
  /** 2026-11: the column scrolls on its own: keep the playing row in view (unless the DJ scrolled in the last 10 s),
   *  with "Back to now" while it is out of view */
  follow?: boolean;
  jumpTo: number | null;
  onFind: (itemId: string, title: string) => void;
  /** round 20: open the cortina's envelope sheet (fade in / fade out / stop at) */
  onCortina?: (planIndex: number) => void;
  /** wave 4: the gap marker between two items opens the transition editor (the outgoing item's plan index) */
  onTransition?: (planIndex: number) => void;
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
  // round 21: a tapped row (the play sheet during the night); 2026-11: a row's Swap opens the Booth's Swap sheet
  // (BoothSwapSheet, mounted with the search) for that place, a song or a cortina, also inside the running tanda
  const [tapped, setTapped] = useState<number | null>(null);
  const openSwap = useBoothSwap((s) => s.open);
  // round 22: tap any song — the sheet plays it (now, next, from here), pre-listens it, edits its cue, its versions
  const tap = useCallback((i: number) => (onTapRow ? onTapRow(i) : setTapped(i)), [onTapRow]);
  const open = useCallback((i: number) => (onOpenRow ? onOpenRow(i) : setTapped(i)), [onOpenRow]);
  const [away, setAway] = useState(false);
  const userAt = useRef(0);
  const hasPlan = !!plan && !!playlist;
  useEffect(() => {
    if (jumpTo === null) return;
    list.current
      ?.querySelector<HTMLElement>(`[data-plan-index="${jumpTo}"]`)
      ?.scrollIntoView({ block: "center" });
  }, [jumpTo]);
  // follow the playhead inside the column's own scroller only (on two columns the column scrolls): on a phone the
  // column is part of the page, and scrolling the window to the current row pushed the Now card under the header
  const scroller = useCallback((): HTMLElement | null => {
    const own = list.current;
    const scrolls = (el: HTMLElement | null) => {
      if (!el) return false;
      const oy = getComputedStyle(el).overflowY;
      return (oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight;
    };
    const col = own?.closest<HTMLElement>(".booth-col-set") ?? null;
    return scrolls(own ?? null) ? own : scrolls(col) ? col : null;
  }, []);
  const rowBox = useCallback(() => {
    const box = scroller();
    const row = list.current?.querySelector<HTMLElement>(
      `[data-plan-index="${useBooth.getState().planIndex}"]`,
    );
    if (!box || !row) return null;
    const b = box.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    // the column's foot is padded by the transport's space: the visible part ends above it
    const pad = Number.parseFloat(getComputedStyle(box).scrollPaddingBottom) || 0;
    // (2026-11: with the Controls panel open the night bar's clock stays pinned at the column's top: what the column
    // shows of the list starts under it)
    const night = box.querySelector<HTMLElement>(":scope > .booth-night");
    const head =
      night && getComputedStyle(night).position === "sticky"
        ? Math.max(b.top, night.getBoundingClientRect().bottom)
        : b.top;
    return { box, b, r, head, foot: b.bottom - pad };
  }, [scroller]);
  const toNow = useCallback(
    (force = false) => {
      const m = rowBox();
      if (!m) return;
      if (!force && Date.now() - userAt.current < 10_000) return;
      const { box, b, r, head, foot } = m;
      // 2026-11 (DJ review: the playing row sat on the bottom edge, under the fade and the toasts): the playing row
      // stays in the middle third of what the column shows; out of it, it comes back to the middle
      const h = foot - head;
      const mid = (r.top + r.bottom) / 2;
      let target = box.scrollTop;
      if (mid < head + h / 3 || mid > head + (2 * h) / 3) target += mid - (head + h / 2);
      // 2026-11 (the overlap pass: a half row "Lo Pasado Pasó" under the fade): the list ends on a whole row — the
      // nearest row foot comes to the column's foot, as long as the playing row stays in the middle third
      const at = (y: number) => y - b.top + box.scrollTop; // a viewport y in the scroller's content
      const ends = [...(list.current?.querySelectorAll<HTMLElement>(".booth-row") ?? [])].map((x) =>
        at(x.getBoundingClientRect().bottom),
      );
      const span = foot - b.top; // from the scroller's top to the visible foot
      const want = target + span;
      const end = ends.reduce<number | null>(
        (best, e) => (best === null || Math.abs(e - want) < Math.abs(best - want) ? e : best),
        null,
      );
      if (end !== null) {
        const t = end - span;
        const rel = at(mid) - t - (head - b.top);
        if (rel >= h / 3 && rel <= (2 * h) / 3) target = t;
      }
      target = Math.max(0, Math.min(box.scrollHeight - box.clientHeight, target));
      if (Math.abs(target - box.scrollTop) > 0.5) box.scrollTop = target;
    },
    [rowBox],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: the playhead moved
  useEffect(() => {
    // (before the night the column stays at its top: the night bar first; a tapped row is in view already)
    if (follow && !useBooth.getState().started) return;
    toNow(!follow);
    // (once more when the row has settled: the playing row grows by its badges)
    const t = setTimeout(() => toNow(!follow), 350);
    return () => clearTimeout(t);
  }, [planIndex, toNow, follow]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: attached once the set has rendered (hasPlan)
  useEffect(() => {
    if (!follow) return;
    const box = list.current?.closest<HTMLElement>(".booth-col-set");
    if (!box) return;
    const mark = () => {
      userAt.current = Date.now();
    };
    const check = () => {
      const m = rowBox();
      setAway(useBooth.getState().started && !!m && (m.r.bottom < m.head || m.r.top > m.foot));
    };
    box.addEventListener("wheel", mark, { passive: true });
    box.addEventListener("touchmove", mark, { passive: true });
    box.addEventListener("scroll", check, { passive: true });
    // the DJ left the list alone for 10 s: it comes back to the playing row
    const id = setInterval(() => {
      if (useBooth.getState().started) toNow();
      check();
    }, 2000);
    check();
    return () => {
      box.removeEventListener("wheel", mark);
      box.removeEventListener("touchmove", mark);
      box.removeEventListener("scroll", check);
      clearInterval(id);
    };
  }, [follow, rowBox, toNow, hasPlan]);

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
    // 2026-11: a tanda's Swap is a choice, not an instant swap: the tanda Swap sheet (booth/BoothTandaSwap.tsx)
    if (track === undefined) return useTandaSwap.getState().open(tanda - 1);
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
      if (!r.ok) throw new Error(tx("booth.setColumn.swap_failed_2", { status: r.status }));
      const np = (await r.json()) as Playlist;
      await apply({ ...np, tandas: np.tandas.map((t, i) => ({ ...t, locked: playlist.tandas[i]?.locked })) });
      toast(
        track === undefined
          ? tx("booth.setColumn.tanda_swapped", { tanda })
          : tx("booth.setColumn.track_of_tanda_swapped", { p1: track + 1, tanda }),
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : tx("booth.setColumn.swap_failed"));
    } finally {
      setBusy(null);
    }
  };
  if (!plan || !playlist) return null;
  const bypassedT = bypassedTandas(playlist);
  const groups: Array<{ tanda: number; items: Array<{ i: number }> }> = [];
  plan.items.forEach((it, i) => {
    const g = groups[groups.length - 1];
    if (g && g.tanda === it.tanda) g.items.push({ i });
    else groups.push({ tanda: it.tanda, items: [{ i }] });
  });
  return (
    <section
      ref={list}
      className="booth-set"
      data-testid="booth-set"
      aria-label={tx("booth.setColumn.set_list")}
    >
      {groups.map((g) => {
        const t = playlist.tandas[g.tanda - 1];
        const locked = started && g.tanda <= runningTanda && g.tanda > 0;
        const played = started && g.tanda < runningTanda;
        return (
          <section
            key={g.tanda}
            className={`booth-tanda ${played ? "booth-played" : ""}`}
            data-tanda={g.tanda}
            data-bypassed={bypassedT.has(g.tanda - 1) || undefined}
            data-locked={locked || undefined}
          >
            {/* 2026-11: two clusters that never overlap — the text (title, type, total) takes the room left and
                truncates or wraps; the actions keep their 44 px targets on the right, and move under the text when
                the column is too narrow for both (booth.css, .booth-tanda-head) */}
            <header
              className="booth-tanda-head"
              data-hint={t ? tandaHint(t) : undefined}
              data-testid="booth-tanda-head"
            >
              <span className="booth-tanda-text">
                <span
                  className="booth-tanda-title text-caption1 block truncate font-semibold uppercase tracking-wide text-[var(--label-2)]"
                  data-testid="booth-tanda-title"
                >
                  {g.tanda === 0 ? (
                    tx("booth.setColumn.opening")
                  ) : t ? (
                    <>
                      {`${g.tanda} · ${t.rhythm} · `}
                      {/* wave 3: names keep their Spanish capitals (no Turkish dotted İ) */}
                      <span lang="es">{`${t.orchestra}${t.singer ? ` / ${t.singer}` : ""}`}</span>
                    </>
                  ) : (
                    tx("booth.setColumn.closing")
                  )}
                </span>
                {/* 2026-11: the tanda's type in words and its total (songs and length, cues and trims counted) */}
                {t && (
                  <span className="booth-tanda-meta" data-testid="booth-tanda-meta">
                    <TandaTypeBadge rhythm={t.rhythm} vocal={t.vocal} singer={t.singer} />
                    <span className="booth-tanda-total tabular-nums" data-testid="booth-tanda-total">
                      {tandaTotal(g.items.map(({ i }) => plan.items[i]!))}
                    </span>
                  </span>
                )}
              </span>
              <span className="booth-tanda-acts" data-testid="booth-tanda-acts">
                {/* 2026-11: before the night, the tanda plays from its cover (this tanda, or on to the end) in the
                    app's player; during the night the rows keep the Booth's own pre-listen and confirmation */}
                {t && !started && (
                  <TandaPlayCover tanda={g.tanda - 1} night={playlist}>
                    <span className="tile-art" data-rhythm={t.rhythm} aria-hidden>
                      <span className="text-subhead tabular-nums">{g.tanda}</span>
                    </span>
                  </TandaPlayCover>
                )}
                {bypassedT.has(g.tanda - 1) && (
                  <span className="booth-skipped-chip" data-testid="booth-skipped-tonight">
                    {tx("booth.setColumn.skipped_tonight")}
                  </span>
                )}
                {/* the running tanda: a filled lock in tint ("Playing now"); the DJ's own lock stays gold */}
                {locked ? (
                  <Lock
                    size={14}
                    strokeWidth={2}
                    fill="currentColor"
                    className="text-[var(--tint)]"
                    aria-label={tx("booth.setColumn.playing_now_read_only")}
                  >
                    <title>{tx("booth.setColumn.playing_now")}</title>
                  </Lock>
                ) : (
                  t?.locked && (
                    <Lock
                      size={14}
                      strokeWidth={2}
                      className="text-[var(--system-gold)]"
                      aria-label={tx("booth.setColumn.locked")}
                    />
                  )
                )}
                {/* round 21: skip tonight — the player passes over it; it stays in the exports */}
                {t && !locked && (
                  <button
                    type="button"
                    className="booth-bypass"
                    data-testid="booth-bypass"
                    aria-pressed={!!bypassedT.has(g.tanda - 1)}
                    aria-label={tx("booth.setColumn.tanda_tonight", {
                      p1: bypassedT.has(g.tanda - 1)
                        ? tx("booth.setColumn.play_2")
                        : tx("booth.setColumn.skip"),
                      tanda: g.tanda,
                    })}
                    data-hint={
                      t.bypass
                        ? tx("booth.setColumn.skipped_tonight_the_player_passes_over")
                        : bypassedT.has(g.tanda - 1)
                          ? tx("booth.setColumn.skipped_by_last_4_tandas_tango")
                          : tx("booth.setColumn.skip_this_tanda_tonight_the_player")
                    }
                    disabled={!t.bypass && bypassedT.has(g.tanda - 1)}
                    onClick={() => void useBooth.getState().toggleBypass(g.tanda)}
                  >
                    {bypassedT.has(g.tanda - 1)
                      ? tx("booth.setColumn.play_it")
                      : tx("booth.setColumn.skip_tonight")}
                  </button>
                )}
                {/* 2026-11: how the floor took the tanda, once it plays (dancer favourites): three icons in a wide
                  column, one "Floor…" menu in a narrow one (the container query shows one of the two) */}
                {t && started && g.tanda <= runningTanda && (
                  <>
                    <span className="booth-floor-inline">
                      <FloorReaction scope="tanda" tanda={g.tanda} compact testPrefix={`set-${g.tanda}`} />
                    </span>
                    <FloorMenu tanda={g.tanda} testPrefix={`set-${g.tanda}`} />
                  </>
                )}
                {t && started && g.tanda <= runningTanda && (
                  <PraiseTanda tanda={g.tanda} compact testPrefix={`set-${g.tanda}`} />
                )}
                {t && (
                  <SwapButton
                    label={tx("booth.setColumn.swap_tanda", { tanda: g.tanda })}
                    disabled={locked}
                    busy={busy === `${g.tanda}-t`}
                    onClick={() => swap(g.tanda)}
                    title={locked ? tx("booth.setColumn.playing_locked") : undefined}
                  />
                )}
              </span>
            </header>
            <ol>
              {g.items.map(({ i }, k) => [
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
                    (plan.items[i]!.kind === "track" || plan.items[i]!.kind === "cortina") && t
                      ? openSwap
                      : undefined
                  }
                  onTap={tap}
                  onOpen={open}
                  onFind={onFind}
                  onCortina={onCortina}
                />,
                onTransition && hasTransition(plan.items, i) ? (
                  <GapMarker key={`gap-${i}`} i={i} played={started && i < planIndex} onOpen={onTransition} />
                ) : null,
              ])}
            </ol>
          </section>
        );
      })}
      {follow && away && (
        <button
          type="button"
          className="booth-to-now"
          onClick={() => {
            userAt.current = 0;
            toNow(true);
            setAway(false);
          }}
          data-testid="booth-back-to-now"
        >
          {tx("booth.setColumn.back_to_now")}
        </button>
      )}
      {!onTapRow && <SongSheet i={tapped} onClose={() => setTapped(null)} />}
    </section>
  );
}

function SwapButton({
  label,
  disabled,
  busy,
  onClick,
  title,
  testId = "booth-swap",
}: {
  label: string;
  disabled: boolean;
  busy: boolean;
  onClick: () => void;
  title?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className="icon-btn icon-btn-bare h-11 w-11 shrink-0"
      aria-label={label}
      aria-disabled={disabled || undefined}
      data-hint={title}
      disabled={busy}
      onClick={() => !disabled && onClick()}
      data-testid={testId}
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
  source,
  rehearsal,
  busy,
  onSwap,
  onFind,
  onCortina,
  onTap,
  onOpen,
}: {
  onTap?: (i: number) => void;
  /** the number opens the row's sheet */
  onOpen?: (i: number) => void;
  i: number;
  /** the track's number inside its tanda (the DJ thinks "track 2 of tanda 7", not plan index 9) */
  k: number;
  current: boolean;
  played: boolean;
  /** the running or a played tanda (the per-row Swap stays open ahead of the playhead, 2026-11) */
  locked: boolean;
  source: string;
  rehearsal: boolean;
  busy: boolean;
  /** 2026-11: the one-tap Swap of this place (a song or a cortina); a played row is closed */
  onSwap?: (planIndex: number) => void;
  onFind: (itemId: string, title: string) => void;
  onCortina?: (planIndex: number) => void;
}) {
  const it = useBooth((s) => s.plan?.items[i]);
  const entity = useBooth((s) => s.entities[i]);
  const auditioning = useBooth((s) => s.audition?.i === i);
  const cueWhere = useBooth((s) => (s.audition?.i === i ? s.audition.where : null));
  const cortinaEdits = useBooth((s) => s.playlist?.booth?.cortinaEdits);
  const showEnergy = useIndicators().energy;
  if (!it) return null;
  const energy = showEnergy ? energyOf(entity) : null;
  const orchestra = entity && "orchestra" in entity ? entity.orchestra : it.artist;
  const missing = source === "missing" && it.kind !== "break";
  const sp = spotifyOf(entity);
  // one fixed action slot (44 px): Find… a file where the night needs one, else the checked Spotify recording
  const find = missing && !!it.id && (!rehearsal || !sp?.url);
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the row's own button is the keyboard control; the row widens its target
    <li
      className={`booth-row ${current ? "booth-row-on" : ""} ${played ? "booth-played" : ""}`}
      // 2026-11: the whole row takes the tap (the number, the artwork, the length), not only the title: on an iPhone
      // the title column is a narrow strip and taps beside it did nothing
      onClick={(e) => {
        if (!onTap || it.kind === "break") return;
        if ((e.target as HTMLElement).closest("button, a, input, select, [role='switch']")) return;
        onTap(i);
      }}
      data-plan-index={i}
      data-kind={it.kind}
      aria-current={current ? "true" : undefined}
      data-source={source}
      data-spotify={sp?.uri}
      data-auditioning={auditioning || undefined}
      data-cue={cueWhere === "headphones" || undefined}
    >
      {energy !== null && (
        <span
          className="booth-row-energy"
          style={{ ["--e" as string]: 0.2 + (energy / 100) * 0.8 }}
          data-hint={tx("booth.setColumn.energy_of_100", { energy })}
          aria-hidden
        />
      )}
      {it.kind === "break" ? (
        <span className="booth-row-n tabular-nums">—</span>
      ) : (
        // 2026-11: the number opens the sheet (Play next, pre-listen, the start point, versions); the rest plays
        <button
          type="button"
          className="booth-row-n tabular-nums"
          {...dragHandle(i, () => onOpen?.(i))}
          aria-label={tx("booth.setColumn.details", { title: it.title })}
          data-testid="booth-row-open"
        >
          {it.kind === "cortina" ? "♪" : k}
        </button>
      )}
      {it.kind !== "break" && <Artwork entity={entity} orchestra={orchestra} size={36} />}
      {/* round 21: the row itself is the play control — before the night it auditions the side, during the night it
          offers Play now / Play next / Preview only */}
      <button
        type="button"
        className="booth-row-tap min-h-11 min-w-0 flex-1 text-left"
        onClick={() => onTap?.(i)}
        disabled={!onTap || it.kind === "break"}
        aria-label={
          it.kind === "cortina"
            ? tx("booth.setColumn.play_the_cortina_after_tanda", { tanda: it.tanda, title: it.title })
            : tx("booth.setColumn.play", { title: it.title })
        }
        data-testid="booth-row-play"
      >
        <span className="booth-row-title block">
          {it.title}
          {it.birthday ? tx("booth.setColumn.birthday") : ""}
        </span>
        <span className="booth-row-sub text-footnote block truncate text-[var(--label-2)]">
          {it.kind === "cortina"
            ? metaLine(tx("booth.setColumn.cortina", { artist: it.artist }), yearText(it.year))
            : metaLine(it.artist, yearText(it.year))}
          {/* 2026-11: where the cortina starts (its chorus, so the floor knows it at once) */}
          {it.kind === "cortina" && (
            <span data-testid="booth-cortina-start" title={cortinaSpan(it.trimInSec ?? 0, it.stopSec ?? 0)}>
              {` · ${cortinaStartOf(it, cortinaEdits).label}`}
            </span>
          )}
          {entity && "tempo" in entity && tempoLevel(entity) ? ` · ${tempoLevel(entity)}` : ""}
          {source === "spotify"
            ? tx("booth.setColumn.spotify")
            : missing
              ? rehearsal
                ? tx("booth.setColumn.no_clip")
                : tx("booth.setColumn.no_source")
              : ""}
        </span>
      </button>
      {auditioning && (
        <Headphones
          size={16}
          strokeWidth={2}
          className="booth-row-cue"
          aria-label={
            cueWhere === "headphones"
              ? tx("booth.setColumn.in_your_headphones")
              : tx("booth.setColumn.testing_on_this_device")
          }
          data-testid="booth-row-cue"
        />
      )}
      {it.kind !== "break" && it.kind !== "cortina" && <BpmKey e={entity} compact />}
      {it.kind !== "break" && it.kind !== "cortina" && <EraBadge entity={entity} slot />}
      {/* the planned length (the Spotify recording's when the side has one), so the DJ can read the night */}
      <span
        className="booth-row-len text-caption1 tabular-nums text-[var(--label-3)]"
        data-testid="booth-row-len"
      >
        {lenLabel(it.lengthSec)}
      </span>
      <span className="booth-row-act">
        {find ? (
          <button
            type="button"
            className="icon-btn icon-btn-bare booth-find h-11 w-11"
            onClick={() => onFind(it.id!, it.title)}
            aria-label={tx("booth.setColumn.find_a_file_for", { title: it.title })}
            data-hint={tx("booth.setColumn.find_a_file")}
            data-testid="booth-find"
          >
            <Search size={16} strokeWidth={2} aria-hidden />
          </button>
        ) : it.kind === "cortina" && onCortina && !played ? (
          // 2026-11: a cortina's envelope takes its action slot, so its Swap sits in the swap column like a song's
          // and every row keeps its length in one column
          <button
            type="button"
            className="icon-btn icon-btn-bare h-11 w-11 shrink-0"
            aria-label={cortinaSwapLabel(it.tanda)}
            data-hint={tx("booth.setColumn.fade_in_fade_out_stop_at")}
            onClick={() => onCortina(i)}
            data-testid="booth-cortina-edit"
          >
            <SlidersHorizontal size={16} strokeWidth={2} aria-hidden />
          </button>
        ) : sp?.url ? (
          <a
            href={sp.url}
            target="_blank"
            rel="noopener noreferrer"
            className="booth-spotify icon-btn icon-btn-bare h-11 w-11"
            aria-label={tx("booth.setColumn.open_in_spotify_the_recording_the", { title: it.title })}
            data-hint={tx("booth.setColumn.the_spotify_recording_open_in_spotify")}
            data-testid="booth-spotify-link"
          >
            <SpotifyMark />
          </a>
        ) : null}
      </span>
      {/* 2026-11: one-tap Swap on every song and cortina (a place ahead of the playhead swaps at once; the playing
          one asks first in the sheet; a played one is closed) */}
      {onSwap ? (
        <SwapButton
          label={
            it.kind === "cortina" ? tx("boothSwap.swap_label", { title: it.title }) : swapLabel(it.tanda, k)
          }
          disabled={played}
          busy={busy}
          onClick={() => onSwap(i)}
          title={played ? tx("boothSwap.played_note") : tx("boothSwap.swap")}
          testId="booth-row-swap"
        />
      ) : (
        <span className="booth-row-act" aria-hidden />
      )}
    </li>
  );
});

/**
 * Wave 4: the marker between two items — the silence (or the edited transition) in a small chip; tapping it opens the
 * transition editor. Its 44 px target reaches over the next rows' number and artwork columns, which take no taps.
 */
const GapMarker = memo(function GapMarker({
  i,
  played,
  onOpen,
}: {
  i: number;
  played: boolean;
  onOpen: (i: number) => void;
}) {
  const it = useBooth((s) => s.plan?.items[i]);
  const next = useBooth((s) => s.plan?.items[i + 1]);
  if (!it || !next) return null;
  const summary = transitionSummary(it);
  const edited = !!it.transitionAfter;
  return (
    <li className="booth-gap" data-edited={edited || undefined} data-played={played || undefined}>
      <button
        type="button"
        className="booth-gap-btn"
        onClick={() => onOpen(i)}
        aria-label={tx("booth.transition.marker_label", { from: it.title, to: next.title, summary })}
        data-hint={tx("booth.transition.marker_hint", { summary })}
        data-testid="booth-gap"
        data-from={i}
      >
        <span className="tabular-nums">{summary}</span>
      </button>
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

/** The hover / long-press line of a tanda header. */
function tandaHint(t: Playlist["tandas"][number]): string {
  const span = yearSpan(t.yearRange);
  const years = span ? ` · ${span}` : "";
  const e =
    typeof t.energy === "number" ? ` ${tx("booth.setColumn.energy", { p1: Math.round(t.energy) })}` : "";
  return tx("booth.setColumn.tanda", {
    rhythm: t.rhythm,
    orchestra: t.orchestra,
    p1: t.singer ? ` / ${t.singer}` : "",
    years,
    e,
  });
}

/** a length the plan knows, else "–:–" (never "0:00" for an unknown one) */
export function lenLabel(sec: number | null | undefined): string {
  return typeof sec === "number" && Number.isFinite(sec) && sec > 0 ? durationLabel(sec) : "–:–";
}

/** "4 songs · 11:48" — the songs' planned lengths (start and stop cues, trims); "≈" when one is unknown */
export function tandaTotal(items: Array<{ kind: string; lengthSec: number }>): string {
  const songs = items.filter((x) => x.kind === "track");
  const known = songs.filter((x) => Number.isFinite(x.lengthSec) && x.lengthSec > 0);
  const sec = known.reduce((s, x) => s + x.lengthSec, 0);
  const length = `${known.length < songs.length ? "≈" : ""}${known.length ? durationLabel(sec) : "–:–"}`;
  return songs.length === 1
    ? tx("booth.setColumn.tanda_total_one", { length })
    : tx("booth.setColumn.tanda_total", { count: songs.length, length });
}
