"use client";
import type { Playlist, SongSearchHit } from "@tdj/core";
import { Heart, Info, Plus } from "lucide-react";
import dynamic from "next/dynamic";
import { memo, useMemo, useState } from "react";
import { Group, Row } from "@/components/Form";
import { I } from "@/components/Icons";
import { Sheet } from "@/components/Sheet";
import { Highlight } from "@/components/search/Highlight";
import { Artwork } from "@/components/ui/Artwork";
import { NowBars } from "@/components/ui/NowPlaying";
import { SourceIcons } from "@/components/ui/SmartSearch";
import { TandaTypeBadge } from "@/components/ui/TandaTypeBadge";
import { coverFor } from "@/lib/artwork";
import { haptic } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { fmtLen } from "@/lib/lengths";
import { creditName, creditSpans } from "@/lib/orchestraName";
import { useTapPlay } from "@/lib/playback";
import type { PlayItem } from "@/lib/player";
import { gateEdit } from "@/lib/ruleCheck";
import { targetsFor } from "@/lib/searchPanel";
import type { SourceId } from "@/lib/smartSearch";
import { useSongMenuProps } from "@/lib/songMenu";
import { openSongDetails } from "@/lib/songOpen";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { Song } from "@/lib/types";

import { yearText } from "@/lib/year";

const ResolveSheet = dynamic(() => import("@/components/ResolveSheet").then((m) => m.ResolveSheet), {
  ssr: false,
});

/** (QA fix 2026-11: the shared floor rule, as Compose and the Booth print) */
const mmss = (s: number) => fmtLen(s);

/** the Library's results as a play item (the mini player's previous / next step through the results) */
export const libraryItem = (song: Song): PlayItem => ({ kind: "song", song, where: t("library.library") });

/**
 * One search result in the Library (2026-11): artwork, the title and orchestra / singer · year with the matched words
 * marked, the length, a ♥ (one of the DJ's dancer favourites) or a "popular" badge, play in the app's player, and
 * "+ Add to tonight" while a night is open. The whole row plays on a tap.
 */
export const LibraryRow = memo(function LibraryRow({
  hit,
  id,
  active,
  onHover,
  findSignal,
  sources,
  badge = true,
  info = true,
}: {
  hit: SongSearchHit;
  id: string;
  active: boolean;
  /** 2026-11: where it comes from (the catalogue, Spotify, a connected service) */
  sources?: SourceId[];
  /** the rhythm badge (inside a work whose head shows it, only a row of another rhythm repeats it) */
  badge?: boolean;
  onHover?: () => void;
  /** bumped by the page when Enter should open "Find on services" for this row */
  findSignal?: number;
  /** 2026-11: the ⓘ that opens the song details (length, voice, lyrics, versions, Song DNA) */
  info?: boolean;
}) {
  const s = hit.song;
  const playlist = useStore((st) => st.playlist);
  // 2026-11: the app-wide tap-to-play (lib/playback.ts): the results' list comes from the page's PlayListContext
  const item = useMemo(() => libraryItem(s), [s]);
  const tp = useTapPlay(item);
  const playing = tp.playing;
  const [find, setFind] = useState(false);
  const [lastSignal, setLastSignal] = useState(findSignal);
  if (findSignal !== lastSignal) {
    setLastSignal(findSignal);
    if (findSignal) setFind(true);
  }
  const [adding, setAdding] = useState(false);
  const play = () => {
    haptic(4);
    void tp.tap({ find: () => setFind(true) });
  };
  const orch = creditName(s.orchestra);
  const orchSpans = creditSpans(s.orchestra, orch, hit.highlights.orchestra);
  const len = s.durationSec ? `${s.durationEstimated ? "≈" : ""}${mmss(s.durationSec)}` : null;
  const popular = !hit.favourite && hit.popularity >= 0.6;
  // 2026-11: the song menu (right-click, long press, "i"): details, Song DNA, Add to tonight, Find, Measure, Copy
  const menu = useSongMenuProps({ song: s, find: () => setFind(true) });
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the list's keys live on the search field (↑ ↓ Enter), the row's play button is the control
    <div
      id={id}
      role="option"
      aria-selected={active}
      tabIndex={-1}
      className={`cell search-row ${tp.state ? "row-now" : ""}`}
      data-leading="art"
      data-now={tp.state ?? undefined}
      data-testid="library-row"
      data-song={s.id}
      onClick={play}
      onMouseEnter={onHover}
      {...menu}
    >
      <button
        type="button"
        className="icon-btn icon-btn-bare -my-2 -ml-2 h-11 w-11 shrink-0 text-[var(--tint)]"
        aria-label={
          playing
            ? t("library.pause", { title: s.title })
            : tp.audible
              ? t("library.play", { title: s.title })
              : t("library.find_on_services", { title: s.title })
        }
        aria-pressed={playing}
        data-testid="play-button"
        onClick={(e) => {
          e.stopPropagation();
          play();
        }}
      >
        {playing ? (
          <I name="pause" size={18} fill="currentColor" strokeWidth={0} />
        ) : tp.audible ? (
          <I name="play" size={18} fill="currentColor" strokeWidth={0} />
        ) : (
          <I name="search" size={16} strokeWidth={2.25} />
        )}
      </button>
      <span className="relative shrink-0" data-testid="row-art">
        <Artwork src={coverFor(s)} orchestra={s.orchestra} orchestraId={s.orchestraId} song={s} />
        {tp.state && (
          <span className="absolute inset-0 grid place-items-center rounded-[inherit] bg-black/45 text-white">
            <NowBars on={tp.playing} className="!text-white" />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate" data-testid="library-row-title">
          <Highlight text={s.title} spans={hit.highlights.title} />
        </span>
        {/* 2026-11: the rhythm badge leads the second line, so a narrow row (a sheet on a phone) keeps the length */}
        <span className="text-footnote flex min-w-0 items-center gap-1.5 text-[var(--label-2)]">
          {badge && <TandaTypeBadge rhythm={s.rhythm} compact className="shrink-0" />}
          <span className="min-w-0 truncate">
            {/* 2026-11: a raw accompanists' credit reads as names ("José Ricardo, Guillermo Barbieri, …
                (guitars)"), the search's marks carried over (lib/orchestraName.ts) */}
            <Highlight text={orch} spans={orchSpans} />
            {s.singer ? (
              <>
                {" / "}
                <Highlight text={s.singer} spans={hit.highlights.singer} />
              </>
            ) : (
              ` / ${t("search.instrumental")}`
            )}
            {s.year ? ` · ${yearText(s.year)}` : ""}
          </span>
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        {len && <span className="text-footnote tabular-nums text-[var(--label-2)]">{len}</span>}
        {sources && sources.length > 1 && <SourceIcons sources={sources} />}
        {hit.favourite ? (
          <span className="search-badge" title={t("search.favourite")}>
            <Heart
              size={11}
              strokeWidth={2.5}
              fill="currentColor"
              className="text-[var(--destructive)]"
              aria-hidden
            />
            <span className="sr-only">{t("search.favourite")}</span>
          </span>
        ) : popular ? (
          <span className="search-badge">{t("search.popular")}</span>
        ) : null}
      </span>
      {info && (
        <button
          type="button"
          className="icon-btn icon-btn-bare -my-2 h-11 w-11 shrink-0 text-[var(--label-2)]"
          aria-label={t("song.details_of", { title: s.title, orchestra: orch })}
          data-testid="song-info"
          onClick={(e) => {
            e.stopPropagation();
            openSongDetails(s);
          }}
        >
          <Info size={18} strokeWidth={2} aria-hidden />
        </button>
      )}
      {playlist && (
        <button
          type="button"
          className="icon-btn icon-btn-bare -my-2 -mr-2 h-11 w-11 shrink-0 text-[var(--tint)]"
          aria-label={t("search.add_to_night", { title: s.title })}
          data-testid="add-to-night"
          onClick={(e) => {
            e.stopPropagation();
            setAdding(true);
          }}
        >
          <Plus size={20} strokeWidth={2.25} />
        </button>
      )}
      {find && <ResolveSheet song={s} open={find} onClose={() => setFind(false)} />}
      {adding && playlist && (
        <AddToNight song={s} playlist={playlist} open={adding} onClose={() => setAdding(false)} />
      )}
    </div>
  );
});

/** "+ Add to tonight": the tandas of the side's rhythm; the side joins the one picked (core addSide, rule-checked) */
export function AddToNight({
  song,
  playlist,
  open,
  onClose,
}: {
  song: Song;
  playlist: Playlist;
  open: boolean;
  onClose: () => void;
}) {
  const targets = targetsFor(playlist, song.rhythm);
  const add = async (tanda: number) => {
    onClose();
    const r = await fetch("/api/add-side", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playlist, tandaIndex: tanda, songId: song.id }),
    });
    const j = (await r.json().catch(() => ({}))) as Playlist & { changed?: boolean; reason?: string };
    if (!j.changed) {
      toast(t("search.not_added", { title: song.title, reason: j.reason ?? "" }));
      return;
    }
    const { changed: _c, reason: _r, ...after } = j;
    const label = t("songSearchPanel.added_to_tanda", { title: song.title, p1: tanda + 1 });
    const res = await gateEdit({
      before: playlist,
      after: after as Playlist,
      label,
      apply: (p) => useStore.getState().setPlaylist(p),
    });
    if (res === "applied") toast(label);
  };
  return (
    <Sheet open={open} onClose={onClose} title={t("search.add_to_tonight")} detents={["medium", "large"]}>
      <Group
        footer={targets.length ? undefined : t("search.no_tanda_of_this_rhythm", { rhythm: song.rhythm })}
      >
        {targets.map((x) => (
          <Row
            key={x.tanda}
            label={x.label}
            sub={x.closed ?? x.sub}
            chevron
            disabled={!!x.closed}
            onClick={() => void add(x.tanda)}
          />
        ))}
      </Group>
    </Sheet>
  );
}
