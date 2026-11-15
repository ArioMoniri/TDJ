"use client";
import { lazy, t as tx } from "@/lib/i18n";
import "./compose-db.css";
import { type Playlist, placements, type SongQuery, searchSongs } from "@tdj/core";
import { ListPlus, Repeat2, SlidersHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMediaQuery } from "@/lib/hooks";
import { clampPanel, PANEL_DEFAULT, PANEL_MAX, PANEL_MIN, type Target, targetsFor } from "@/lib/searchPanel";
import { useStore } from "@/lib/store";
import type { Song } from "@/lib/types";
import { Group, Row } from "../Form";
import { Menu } from "../Menu";
import { SearchField } from "../SearchField";
import { Sheet } from "../Sheet";
import { SongRow } from "./SongRow";
import { Tip } from "./Tip";

const WIDTH_KEY = "tdj-search-panel-w";
const RHYTHMS: Array<[string, string]> = lazy(() => [
  ["", tx("songSearchPanel.all")],
  ["tango", tx("songSearchPanel.tango")],
  ["vals", tx("songSearchPanel.vals")],
  ["milonga", tx("songSearchPanel.milonga")],
]);
const yearNum = (v: string) => {
  const n = Number(v);
  return v.length === 4 && n >= 1900 && n <= 2030 ? n : undefined;
};

/**
 * Round 22 — the song search side panel, shared by Compose and the Booth. Search the catalogue by title, orchestra,
 * singer, a year range and rhythm; every result says which tanda and part of tonight's night it is in; swap it in,
 * add it to a tanda or play its preview. A resizable column beside the page on wide screens, a sheet on phones.
 */
export function SongSearchPanel({
  open,
  onClose,
  playlist,
  onChange,
  closedBefore,
  target,
}: {
  open: boolean;
  onClose: () => void;
  playlist: Playlist | null;
  /** a swap or an add came back from the engine: the new night and what happened */
  onChange?: (p: Playlist, note: string) => void | Promise<void>;
  /** the Booth: tandas up to this index are playing or played and cannot change */
  closedBefore?: number;
  /** the chair the panel was opened for ("Find a replacement"): Swap in goes straight there */
  target?: { tanda: number; track: number } | null;
}) {
  const wide = useMediaQuery("(min-width: 1024px)");
  const overrides = useStore((s) => s.overrides);
  const [text, setText] = useState("");
  const [rhythm, setRhythm] = useState("");
  const [orchestra, setOrchestra] = useState("");
  const [singer, setSinger] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [inNight, setInNight] = useState(false);
  const [more, setMore] = useState(false);
  const [results, setResults] = useState<Song[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [pick, setPick] = useState<{ song: Song; mode: "swap" | "add" } | null>(null);
  const [width, setWidth] = useState(PANEL_DEFAULT);
  const [dragging, setDragging] = useState(false);
  const panel = useRef<HTMLElement>(null);

  const query: SongQuery = useMemo(
    () => ({
      text: text.trim() || undefined,
      orchestra: orchestra.trim() || undefined,
      singer: singer.trim() || undefined,
      yearFrom: yearNum(from),
      yearTo: yearNum(to),
      rhythms: rhythm ? [rhythm] : undefined,
      inNight: inNight || undefined,
    }),
    [text, orchestra, singer, from, to, rhythm, inNight],
  );
  const where = useMemo(() => placements(playlist), [playlist]);
  const ready = !!(
    (query.text && query.text.length >= 2) ||
    query.orchestra ||
    query.singer ||
    query.yearFrom ||
    query.yearTo ||
    query.inNight ||
    (query.rhythms && (query.text || query.yearFrom || query.yearTo))
  );

  // the catalogue search runs on the server (the index is large); "only tonight" runs over the night in the browser
  useEffect(() => {
    if (!open) return;
    if (!ready) {
      setResults([]);
      return;
    }
    if (query.inNight) {
      const songs = playlist?.tandas.flatMap((t) => t.songs) ?? [];
      setResults(searchSongs(songs, query, playlist).map((h) => h.song));
      return;
    }
    const ctl = new AbortController();
    setBusy(true);
    const h = setTimeout(() => {
      fetch("/api/song-search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, overrides }),
        signal: ctl.signal,
      })
        .then((r) => r.json())
        .then((j: { results?: Song[] }) => setResults(j.results ?? []))
        .catch(() => {})
        .finally(() => setBusy(false));
    }, 220);
    return () => {
      clearTimeout(h);
      ctl.abort();
    };
  }, [open, ready, query, overrides, playlist]);

  // wide screens: the page makes room beside the panel; the width is remembered in this browser
  useEffect(() => {
    try {
      const w = Number(localStorage.getItem(WIDTH_KEY));
      if (w) setWidth(clampPanel(w));
    } catch {}
  }, []);
  useEffect(() => {
    const el = document.documentElement;
    if (!open || !wide) {
      delete el.dataset.sidePanel;
      return;
    }
    el.dataset.sidePanel = "";
    el.style.setProperty("--side-panel-w", `${width}px`);
    return () => {
      delete el.dataset.sidePanel;
    };
  }, [open, wide, width]);
  const saveWidth = useCallback((w: number) => {
    const c = clampPanel(w);
    setWidth(c);
    try {
      localStorage.setItem(WIDTH_KEY, String(c));
    } catch {}
  }, []);
  useEffect(() => {
    if (!open || !wide) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pick) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, wide, onClose, pick]);
  useEffect(() => {
    if (open && wide) setTimeout(() => panel.current?.querySelector<HTMLInputElement>("input")?.focus(), 30);
  }, [open, wide]);

  const post = async (url: string, body: Record<string, unknown>, ok: string) => {
    if (!playlist) return;
    setNote(null);
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playlist, ...body }),
    });
    const j = (await r.json().catch(() => ({}))) as Playlist & { changed?: boolean; reason?: string };
    if (!j.changed) {
      setNote({
        text: j.reason
          ? tx("songSearchPanel.not_changed_2", { reason: j.reason })
          : tx("songSearchPanel.not_changed"),
        error: true,
      });
      return;
    }
    const msg = j.reason ? tx("songSearchPanel.the_tanda_is_yours_now", { ok, reason: j.reason }) : `${ok}.`;
    setNote({ text: msg });
    await onChange?.(j, msg);
  };
  const swapIn = (s: Song, tanda: number, track: number) =>
    post(
      "/api/swap-track",
      { tandaIndex: tanda, trackIndex: track, songId: s.id, force: true, pin: true },
      tx("songSearchPanel.swapped_into_tanda", { title: s.title, p1: tanda + 1 }),
    );
  const addTo = (s: Song, tanda: number) =>
    post(
      "/api/add-side",
      { tandaIndex: tanda, songId: s.id },
      tx("songSearchPanel.added_to_tanda", { title: s.title, p1: tanda + 1 }),
    );
  const startSwap = (s: Song) => {
    const t = target && playlist?.tandas[target.tanda];
    if (t && t.rhythm === s.rhythm && !(closedBefore !== undefined && target!.tanda <= closedBefore))
      void swapIn(s, target!.tanda, target!.track);
    else setPick({ song: s, mode: "swap" });
  };

  const body = (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="song-search">
      <div className="px-4 pt-3">
        <SearchField
          id="song-search-text"
          value={text}
          onChange={setText}
          placeholder={tx("songSearchPanel.title_orchestra_or_singer")}
          label={tx("songSearchPanel.search_songs")}
          busy={busy}
        />
        <fieldset className="mt-2 flex flex-wrap items-center gap-1.5 border-0 p-0">
          <legend className="sr-only">{tx("songSearchPanel.rhythm_and_filters")}</legend>
          {RHYTHMS.map(([k, l]) => (
            <button
              key={k || "all"}
              type="button"
              className="chip-filter min-h-11 sm:min-h-8"
              aria-pressed={rhythm === k}
              onClick={() => setRhythm(k)}
            >
              {l}
            </button>
          ))}
          <Tip text={tx("songSearchPanel.only_the_sides_already_in_tonight")}>
            <button
              type="button"
              className="chip-filter min-h-11 sm:min-h-8"
              aria-pressed={inNight}
              onClick={() => setInNight((v) => !v)}
              disabled={!playlist}
            >
              {tx("songSearchPanel.tonight")}
            </button>
          </Tip>
          <Tip text={tx("songSearchPanel.orchestra_singer_and_a_year_range")}>
            <button
              type="button"
              className="icon-btn icon-btn-bare h-11 w-11"
              aria-expanded={more}
              aria-label={tx("songSearchPanel.more_filters")}
              onClick={() => setMore((v) => !v)}
            >
              <SlidersHorizontal size={18} strokeWidth={2} />
            </button>
          </Tip>
        </fieldset>
        {more && (
          <div className="group-inset mt-2" data-testid="song-search-filters">
            <label className="cell" htmlFor="ss-orchestra">
              <span className="w-24 shrink-0">{tx("songSearchPanel.orchestra")}</span>
              <input
                id="ss-orchestra"
                className="field field-value min-w-0 flex-1"
                value={orchestra}
                onChange={(e) => setOrchestra(e.target.value)}
                placeholder={tx("songSearchPanel.any")}
                autoComplete="off"
              />
            </label>
            <label className="cell" htmlFor="ss-singer">
              <span className="w-24 shrink-0">{tx("songSearchPanel.singer")}</span>
              <input
                id="ss-singer"
                className="field field-value min-w-0 flex-1"
                value={singer}
                onChange={(e) => setSinger(e.target.value)}
                placeholder={tx("songSearchPanel.any_or_instrumental")}
                autoComplete="off"
              />
            </label>
            <div className="cell">
              <span className="w-24 shrink-0">{tx("songSearchPanel.years")}</span>
              <input
                aria-label={tx("songSearchPanel.from_year")}
                className="field field-value min-w-0 flex-1"
                inputMode="numeric"
                value={from}
                onChange={(e) => setFrom(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="1935"
              />
              <span className="text-[var(--label-2)]">–</span>
              <input
                aria-label={tx("songSearchPanel.to_year")}
                className="field field-value min-w-0 flex-1"
                inputMode="numeric"
                value={to}
                onChange={(e) => setTo(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="1945"
              />
            </div>
          </div>
        )}
        {note && (
          <p
            className={`text-footnote mt-2 ${note.error ? "text-[var(--destructive)]" : "text-[var(--label-2)]"}`}
            role="status"
            data-testid="song-search-note"
          >
            {note.text}
          </p>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6" data-testid="song-search-results">
        {!ready ? (
          <p className="text-subhead py-8 text-center text-[var(--label-2)]">
            {tx("songSearchPanel.type_a_title_an_orchestra_or")}
          </p>
        ) : !busy && !results.length ? (
          <p className="text-subhead py-8 text-center text-[var(--label-2)]">
            {tx("songSearchPanel.nothing_matches")}
          </p>
        ) : (
          <div className="group-inset mt-3">
            {results.map((s) => {
              const pl = where.get(s.id);
              return (
                <SongRow
                  key={s.id}
                  song={s}
                  testId="song-result"
                  pill={pl ? pl.label : undefined}
                  pillTip={pl ? tx("songSearchPanel.where_this_side_plays_tonight") : undefined}
                  trailing={
                    playlist && onChange ? (
                      <Menu
                        label={tx("songSearchPanel.actions_for", { title: s.title })}
                        className="icon-btn-bare -my-2 -mr-3 h-11 w-10"
                        items={[
                          {
                            label: target
                              ? tx("songSearchPanel.swap_in_for_tanda_song", {
                                  p1: target.tanda + 1,
                                  p2: target.track + 1,
                                })
                              : tx("songSearchPanel.swap_in_2"),
                            icon: Repeat2,
                            onClick: () => startSwap(s),
                            disabled: !!pl,
                          },
                          {
                            label: tx("songSearchPanel.add_to_a_tanda"),
                            icon: ListPlus,
                            onClick: () => setPick({ song: s, mode: "add" }),
                            disabled: !!pl,
                          },
                        ]}
                      />
                    ) : undefined
                  }
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  const targets: Target[] = pick ? targetsFor(playlist, pick.song.rhythm, { closedBefore }) : [];
  const picker = (
    <Sheet
      open={!!pick}
      onClose={() => setPick(null)}
      title={
        pick
          ? pick.mode === "swap"
            ? tx("songSearchPanel.swap_in", { title: pick.song.title })
            : tx("songSearchPanel.add", { title: pick.song.title })
          : ""
      }
      detents={["large"]}
      testId="song-target"
    >
      {pick && !targets.length && (
        <p className="text-subhead px-4 py-6 text-[var(--label-2)]">
          {tx("songSearchPanel.tonight_has_no_tanda", { rhythm: pick.song.rhythm })}
        </p>
      )}
      {pick &&
        targets.map((t) => (
          <Group key={t.tanda} header={t.label} footer={t.closed ?? t.sub}>
            {pick.mode === "swap" ? (
              t.chairs.map((c) => (
                <Row
                  key={c.track}
                  label={tx("songSearchPanel.replace", { title: c.title })}
                  sub={c.year ? String(c.year) : undefined}
                  disabled={!!t.closed}
                  onClick={
                    t.closed
                      ? undefined
                      : () => {
                          const s = pick.song;
                          setPick(null);
                          void swapIn(s, t.tanda, c.track);
                        }
                  }
                  data-testid="target-chair"
                />
              ))
            ) : (
              <Row
                label={tx("songSearchPanel.add_as_song", { p1: t.chairs.length + 1 })}
                disabled={!!t.closed}
                onClick={
                  t.closed
                    ? undefined
                    : () => {
                        const s = pick.song;
                        setPick(null);
                        void addTo(s, t.tanda);
                      }
                }
                data-testid="target-tanda"
              />
            )}
          </Group>
        ))}
    </Sheet>
  );

  if (!wide)
    return (
      <>
        <Sheet
          open={open}
          onClose={onClose}
          title={tx("songSearchPanel.find_songs")}
          detents={["large"]}
          testId="song-search-sheet"
        >
          {body}
        </Sheet>
        {picker}
      </>
    );
  if (!open) return picker;
  return (
    <>
      <aside
        ref={panel}
        className="side-panel"
        style={{ width }}
        aria-label={tx("songSearchPanel.find_songs")}
        data-testid="song-search-panel"
      >
        <Tip text={tx("songSearchPanel.drag_to_make_the_panel_wider")}>
          {/* biome-ignore lint/a11y/useSemanticElements: a focusable splitter (WAI-ARIA window splitter), resized with the arrow keys */}
          <button
            type="button"
            className="side-panel-handle"
            aria-label={tx("songSearchPanel.resize_the_panel")}
            role="separator"
            aria-orientation="vertical"
            aria-valuemin={PANEL_MIN}
            aria-valuemax={PANEL_MAX}
            aria-valuenow={width}
            data-dragging={dragging || undefined}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") saveWidth(width + 20);
              if (e.key === "ArrowRight") saveWidth(width - 20);
            }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setDragging(true);
            }}
            onPointerMove={(e) => {
              if (dragging) setWidth(clampPanel(window.innerWidth - e.clientX));
            }}
            onPointerUp={(e) => {
              setDragging(false);
              saveWidth(window.innerWidth - e.clientX);
            }}
          />
        </Tip>
        <header className="flex min-h-[52px] items-center gap-2 border-b border-[var(--separator)] px-4">
          <h2 className="text-headline min-w-0 flex-1 truncate">{tx("songSearchPanel.find_songs")}</h2>
          <button
            type="button"
            className="icon-btn icon-btn-bare -mr-2 h-11 w-11"
            aria-label={tx("songSearchPanel.close")}
            onClick={onClose}
          >
            <X size={18} strokeWidth={2} />
          </button>
        </header>
        {body}
      </aside>
      {picker}
    </>
  );
}
