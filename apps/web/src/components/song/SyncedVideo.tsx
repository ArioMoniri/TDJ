"use client";
import { useEffect, useRef, useState } from "react";
import { IFRAME_API } from "@/lib/booth/sources/youtube";
import { t } from "@/lib/i18n";
import { useMarks } from "@/lib/songMarks";
import { syncAction } from "@/lib/videoSync";
import type { PositionFn } from "./MarksGroup";

interface YtPlayer {
  mute(): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(s: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
}
type YtNs = {
  Player: new (
    el: HTMLElement,
    o: {
      videoId: string;
      width?: string;
      height?: string;
      playerVars?: Record<string, unknown>;
      events?: Record<string, (e: { target: YtPlayer; data?: number }) => void>;
    },
  ) => YtPlayer;
};

/** YouTube's IFrame API, loaded once (the Booth's YouTube source loads the same script) */
function loadYt(): Promise<YtNs> {
  const w = window as unknown as { YT?: YtNs & { loaded?: number }; onYouTubeIframeAPIReady?: () => void };
  if (w.YT?.Player) return Promise.resolve(w.YT);
  return new Promise((ok, fail) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (w.YT) ok(w.YT);
    };
    if (!document.querySelector(`script[src="${IFRAME_API}"]`)) {
      const s = document.createElement("script");
      s.src = IFRAME_API;
      s.async = true;
      s.onerror = () => fail(new Error("iframe_api"));
      document.head.appendChild(s);
    }
  });
}

/**
 * 2026-11 — the side's matched YouTube video (lib/youtubeMatches.ts), muted, on screen, following the Booth's second
 * in the recording (lib/videoSync.ts: a seek only past the drift threshold, play and pause with the Booth). YouTube's
 * own player, at least 200 px high (its terms); its sound is never used — the room hears the Booth's source.
 */
export function SyncedVideo({
  songId,
  videoId,
  position,
}: {
  songId: string;
  videoId: string;
  position?: PositionFn;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const offset = useMarks((s) => s.marks[songId]?.videoOffsetSec ?? 0);
  const setMark = useMarks((s) => s.set);
  const off = useRef(offset);
  off.current = offset;
  const pos = useRef(position);
  pos.current = position;
  useEffect(() => {
    let player: YtPlayer | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let lastSeek = 0;
    let dead = false;
    const slot = document.createElement("div");
    host.current?.appendChild(slot);
    loadYt()
      .then((YT) => {
        if (dead) return;
        player = new YT.Player(slot, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: { mute: 1, controls: 0, playsinline: 1, rel: 0, disablekb: 1, modestbranding: 1 },
          events: {
            onReady: (e) => {
              e.target.mute();
              timer = setInterval(() => {
                const p = player;
                if (!p) return;
                const now = pos.current?.() ?? null;
                const a = syncAction({
                  target: now?.sec ?? null,
                  playing: !!now?.playing,
                  videoTime: p.getCurrentTime?.() ?? 0,
                  videoPlaying: p.getPlayerState?.() === 1,
                  offsetSec: off.current,
                  videoDuration: p.getDuration?.(),
                  sinceSeekMs: Date.now() - lastSeek,
                });
                if (a.seek !== undefined) {
                  p.seekTo(a.seek, true);
                  lastSeek = Date.now();
                }
                if (a.play) p.playVideo();
                if (a.pause) p.pauseVideo();
              }, 250);
            },
            onError: () => setFailed(true),
          },
        });
      })
      .catch(() => setFailed(true));
    return () => {
      dead = true;
      if (timer) clearInterval(timer);
      try {
        player?.destroy();
      } catch {}
      slot.remove();
    };
  }, [videoId]);
  return (
    <section className="min-w-0" data-testid="synced-video" data-video={videoId}>
      <h2 className="section-head">{t("song.video")}</h2>
      {failed ? (
        <div className="group-inset">
          <div className="cell text-[var(--label-2)]">{t("song.video_failed")}</div>
        </div>
      ) : (
        <div
          ref={host}
          className="synced-video overflow-hidden rounded-xl bg-black"
          style={{ aspectRatio: "16 / 9", minHeight: 200, maxWidth: 640 }}
        />
      )}
      <div className="group-inset mt-2">
        <div className="cell">
          <span className="min-w-0 flex-1 text-footnote text-[var(--label-2)]">
            {t("song.video_offset", { s: (offset >= 0 ? "+" : "") + offset.toFixed(1) })}
          </span>
          <button
            type="button"
            className="btn-plain min-h-11 min-w-11 px-2"
            aria-label={t("song.video_earlier")}
            onClick={() => setMark(songId, { videoOffsetSec: Math.round((offset - 0.5) * 10) / 10 })}
          >
            −0.5
          </button>
          <button
            type="button"
            className="btn-plain min-h-11 min-w-11 px-2"
            aria-label={t("song.video_later")}
            onClick={() => setMark(songId, { videoOffsetSec: Math.round((offset + 0.5) * 10) / 10 })}
          >
            +0.5
          </button>
        </div>
      </div>
      <p className="section-foot">{t("song.video_footer")}</p>
    </section>
  );
}
