"use client";
import { t as tx } from "@/lib/i18n";
import "./compose-db.css";
import { type Playlist, placements } from "@tdj/core";
import { ListPlus, Repeat2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMediaQuery } from "@/lib/hooks";
import { gateEdit } from "@/lib/ruleCheck";
import { clampPanel, PANEL_DEFAULT, PANEL_MAX, PANEL_MIN, type Target, targetsFor } from "@/lib/searchPanel";
import type { Version } from "@/lib/smartSearch";
import type { Song } from "@/lib/types";
import { useSmartSearch } from "@/lib/useSmartSearch";
import { Group, Row } from "../Form";
import { Menu } from "../Menu";
import { Sheet } from "../Sheet";
import { playVersion, SmartSearchField, SmartSearchResults } from "./SmartSearch";
import { Tip } from "./Tip";

const WIDTH_KEY = "tdj-search-panel-w";

/**
 * Round 22 — the song search side panel, shared by Compose and the Booth. 2026-11: the one smart search
 * (components/ui/SmartSearch.tsx: completions, "Did you mean", chips for rhythm, voice, era, orchestra and singer, the
 * versions by work, the connected services' recordings), or tonight's night only; every result says which tanda and
 * part of tonight's night it is in; swap it in, add it to a tanda or play it. A resizable column beside the page on
 * wide screens, a sheet on phones.
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
  const [inNight, setInNight] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [pick, setPick] = useState<{ song: Song; mode: "swap" | "add" } | null>(null);
  const [width, setWidth] = useState(PANEL_DEFAULT);
  const [dragging, setDragging] = useState(false);
  const panel = useRef<HTMLElement>(null);

  const where = useMemo(() => placements(playlist), [playlist]);
  // the catalogue on the server (the index is large) with the connected services; "Tonight" over the night here
  const tonight = useMemo(
    () => (inNight ? (playlist?.tandas.flatMap((t) => t.songs) ?? []) : null),
    [inNight, playlist],
  );
  const s = useSmartSearch({ local: tonight, services: !inNight, limit: 50 });

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
    const { changed: _c, reason: _r, ...after } = j;
    // the rule check first: an edit that breaks a tanda rule asks (a suggestion, "Do it as I said" or Cancel)
    const res = await gateEdit({
      before: playlist,
      after: after as Playlist,
      label: msg,
      apply: async (p, l) => {
        await onChange?.(p, l);
      },
      learn: false,
    });
    if (res === "cancelled") return;
    setNote({ text: res === "applied" ? msg : `${ok}.` });
  };
  // a connected service's recording is not in the catalogue: it goes in whole (POST /api/tanda-set)
  const external = (s: Song) => s.id.startsWith("ext:");
  const swapIn = (s: Song, tanda: number, track: number) =>
    external(s)
      ? post(
          "/api/tanda-set",
          {
            tandaIndex: tanda,
            sides: (playlist?.tandas[tanda]?.songs ?? []).map((x, k) => (k === track ? s : x.id)),
          },
          tx("songSearchPanel.swapped_into_tanda", { title: s.title, p1: tanda + 1 }),
        )
      : post(
          "/api/swap-track",
          { tandaIndex: tanda, trackIndex: track, songId: s.id, force: true, pin: true },
          tx("songSearchPanel.swapped_into_tanda", { title: s.title, p1: tanda + 1 }),
        );
  const addTo = (s: Song, tanda: number) =>
    external(s)
      ? post(
          "/api/tanda-set",
          { tandaIndex: tanda, sides: [...(playlist?.tandas[tanda]?.songs ?? []).map((x) => x.id), s] },
          tx("songSearchPanel.added_to_tanda", { title: s.title, p1: tanda + 1 }),
        )
      : post(
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

  const actions = (v: Version) => {
    const pl = where.get(v.song.id);
    if (!playlist || !onChange) return null;
    return (
      <Menu
        label={tx("songSearchPanel.actions_for", { title: v.song.title })}
        className="icon-btn-bare -my-2 -mr-3 h-11 w-10"
        items={[
          {
            label: target
              ? tx("songSearchPanel.swap_in_for_tanda_song", { p1: target.tanda + 1, p2: target.track + 1 })
              : tx("songSearchPanel.swap_in_2"),
            icon: Repeat2,
            onClick: () => startSwap(v.song),
            disabled: !!pl,
          },
          {
            label: tx("songSearchPanel.add_to_a_tanda"),
            icon: ListPlus,
            onClick: () => setPick({ song: v.song, mode: "add" }),
            disabled: !!pl,
          },
        ]}
      />
    );
  };
  const body = (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="song-search">
      <div className="px-4 pt-3">
        <SmartSearchField
          s={s}
          id="song-search-text"
          prefix="song-search"
          placeholder={tx("songSearchPanel.title_orchestra_or_singer")}
          label={tx("songSearchPanel.search_songs")}
          onEnter={(v) => void playVersion(v)}
        />
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Tip text={tx("songSearchPanel.only_the_sides_already_in_tonight")}>
            <button
              type="button"
              className="search-chip"
              aria-pressed={inNight}
              onClick={() => setInNight((v) => !v)}
              disabled={!playlist}
              data-testid="song-search-tonight"
            >
              {tx("songSearchPanel.tonight")}
            </button>
          </Tip>
        </div>
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
        <SmartSearchResults
          s={s}
          id="song-search-text"
          prefix="song-search"
          rowTestId="song-result"
          empty={
            <p className="text-subhead py-8 text-center text-[var(--label-2)]">
              {tx("songSearchPanel.type_a_title_an_orchestra_or")}
            </p>
          }
          note={(v) => {
            const pl = where.get(v.song.id);
            return pl ? (
              <Tip text={tx("songSearchPanel.where_this_side_plays_tonight")}>
                <span className="place-pill mt-0.5 inline-block" data-testid="song-pill">
                  {pl.label}
                </span>
              </Tip>
            ) : null;
          }}
          actions={actions}
        />
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
