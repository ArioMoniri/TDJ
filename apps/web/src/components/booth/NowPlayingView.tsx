"use client";
import type { Song } from "@tdj/core";
import { Info, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { durationLabel } from "@/lib/booth/plan";
import { useBooth } from "@/lib/booth/store";
import { t } from "@/lib/i18n";
import type { Lyrics } from "@/lib/lyrics";
import { loadMatches } from "@/lib/youtubeMatches";
import { LyricsGroup } from "../song/LyricsGroup";
import { RhythmLane } from "../song/RhythmLane";
import { SyncedVideo } from "../song/SyncedVideo";
import { usePosition } from "../song/usePosition";
import { Artwork } from "../ui/Artwork";
import { BpmKey } from "../ui/BpmKey";
import { TandaTypeBadge } from "../ui/TandaTypeBadge";
import "../song/song.css";

/** the full-screen play view's open flag (NowCard's "Now playing" opens it) */
export const useNowView = create<{ open: boolean; set: (o: boolean) => void }>()((set) => ({
  open: false,
  set: (open) => set({ open }),
}));

/**
 * 2026-11 — "a better play page" (the owner): the playing side full screen — artwork large, the synced lyrics, the
 * rhythm lane (beat grid, bars, 8-bar phrases, the singer's entry) and the matched video, muted and following, all on
 * the Booth's own clock (seek, pause, the next song: nothing keeps time of its own). The night's controls stay where
 * they are: Esc or Close returns to them; the music never stops for this view.
 */
export function NowPlayingView({ onInfo }: { onInfo?: (planIndex: number) => void }) {
  const open = useNowView((s) => s.open);
  const close = useCallback(() => useNowView.getState().set(false), []);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, close]);
  if (!open) return null;
  return <Body close={close} onInfo={onInfo} />;
}

function Body({ close, onInfo }: { close: () => void; onInfo?: (i: number) => void }) {
  const planIndex = useBooth((s) => s.planIndex);
  const item = useBooth((s) => s.plan?.items[s.planIndex] ?? null);
  const entity = useBooth((s) => s.entities[s.planIndex] ?? null);
  const src = useBooth((s) => s.sources[s.planIndex]);
  const song = entity && "rhythm" in entity && "orchestraId" in entity ? (entity as Song) : null;
  const id = song?.id ?? "";
  const position = useCallback(() => (id ? useBooth.getState().positionOf(id) : null), [id]);
  const p = usePosition(song ? position : undefined, { stepSec: 0.5 });
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const itemId = item?.id;
  const video = useMemo(() => {
    const m = loadMatches();
    return (id && m[id]) || (itemId && m[itemId]) || null;
  }, [id, itemId]);
  // a 30 s clip plays its own seconds, not the recording's: the lane and the lyrics would not line up
  const clip = src === "preview";
  const len = item?.lengthSec ?? song?.durationSec ?? 180;
  return (
    <div
      className="now-view"
      role="dialog"
      aria-modal="true"
      aria-label={t("song.now_playing")}
      data-testid="now-view"
    >
      <div className="now-view-bar">
        <button
          type="button"
          className="icon-btn h-11 w-11"
          aria-label={t("song.close")}
          onClick={close}
          data-testid="now-view-close"
        >
          <X size={18} strokeWidth={2.25} aria-hidden />
        </button>
        <span className="text-headline min-w-0 flex-1 truncate">{t("song.now_playing")}</span>
        {onInfo && item && item.kind !== "break" && (
          <button
            type="button"
            className="btn-plain inline-flex min-h-11 items-center gap-1 px-2"
            onClick={() => {
              close();
              onInfo(planIndex);
            }}
          >
            <Info size={16} strokeWidth={2} aria-hidden /> {t("booth.nowCard.song_info")}
          </button>
        )}
      </div>
      <div className="now-view-body">
        {!item || !entity ? (
          <p className="text-body mt-8 text-center text-[var(--label-2)]">{t("song.nothing_playing")}</p>
        ) : (
          <div className="now-view-grid">
            <div>
              <div className="now-view-art">
                <Artwork entity={entity} orchestra={song?.orchestra ?? item.artist} size={320} />
              </div>
              <h1 className="text-title1 text-center" lang="es" data-testid="now-view-title">
                {item.title}
              </h1>
              <p className="text-body text-center text-[var(--label-2)]" lang="es">
                {item.artist}
                {item.year ? ` · ${item.year}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                {song && <TandaTypeBadge rhythm={song.rhythm} vocal={song.vocal} singer={song.singer} />}
                {song && <BpmKey e={song} />}
              </div>
              <p className="text-title3 mt-3 text-center tabular-nums" data-testid="now-view-clock">
                {p ? durationLabel(p.sec) : "0:00"} / {durationLabel(len)}
              </p>
              {clip && <p className="section-foot text-center">{t("song.clip_not_synced")}</p>}
            </div>
            {song && (
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1">
                <RhythmLane
                  song={song}
                  durationSec={len}
                  position={clip ? undefined : position}
                  lines={lyrics?.lines}
                />
                {video && src !== "youtube" && (
                  <SyncedVideo songId={song.id} videoId={video} position={position} />
                )}
                {video && src === "youtube" && <p className="section-foot">{t("song.video_in_dock")}</p>}
                <LyricsGroup song={song} position={clip ? undefined : position} big onLyrics={setLyrics} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
