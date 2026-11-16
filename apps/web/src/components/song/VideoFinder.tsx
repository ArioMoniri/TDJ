"use client";
import type { Song } from "@tdj/core";
import { ExternalLink, Search, Video } from "lucide-react";
import { useState } from "react";
import { t } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { loadMatches, saveMatches, videoIdOf } from "@/lib/youtubeMatches";
import { Group } from "../Form";
import { ExtLink } from "./ExtLink";
import type { PositionFn } from "./MarksGroup";
import { SyncedVideo } from "./SyncedVideo";

type Found = { videoId: string; title: string; channel: string; thumb: string | null };

/** what YouTube is searched for a side */
export const videoQuery = (s: Pick<Song, "title" | "orchestra" | "singer">) =>
  `${s.title} ${s.orchestra}${s.singer ? ` ${s.singer}` : ""} tango`;

/**
 * 2026-11 — the Now playing view's Video tab: the side's matched YouTube video, muted and following the Booth's
 * second (SyncedVideo); without one, "Find a video" searches YouTube with the DJ's Google connection (five candidates
 * to pick from) or — not connected — opens YouTube's own search, and a pasted link is taken too. The pick is saved
 * as the side's match on this device (lib/youtubeMatches.ts), as the YouTube export's are.
 */
export function NowVideo({
  song,
  position,
  roomVideo,
}: {
  song: Song;
  position?: PositionFn;
  /** the room itself plays YouTube: its player is the dock (on screen already) */
  roomVideo?: boolean;
}) {
  const [video, setVideo] = useState<string | null>(() => loadMatches()[song.id] ?? null);
  const [finding, setFinding] = useState(false);
  const [found, setFound] = useState<Found[] | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "connect" | "none" | "error">("idle");
  const [paste, setPaste] = useState("");
  const pick = (id: string) => {
    saveMatches({ ...loadMatches(), [song.id]: id });
    setVideo(id);
    setFinding(false);
    setFound(null);
    toast(t("now.video_saved"));
  };
  const search = async () => {
    setFinding(true);
    setState("busy");
    try {
      const r = await fetch("/api/google/youtube", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ search: videoQuery(song) }),
      });
      if (r.status === 401 || r.status === 403 || r.status === 404) return setState("connect");
      if (!r.ok) return setState("error");
      const j = (await r.json()) as { videos?: Found[] };
      setFound(j.videos ?? []);
      setState(j.videos?.length ? "idle" : "none");
    } catch {
      setState("error");
    }
  };
  if (roomVideo) return <p className="section-foot">{t("song.video_in_dock")}</p>;
  return (
    <div className="grid min-w-0 gap-1" data-testid="now-video">
      {video && !finding ? (
        <>
          <SyncedVideo songId={song.id} videoId={video} position={position} />
          <button
            type="button"
            className="btn-plain min-h-11 self-start px-2"
            onClick={() => setFinding(true)}
            data-testid="now-video-change"
          >
            {t("now.video_change")}
          </button>
        </>
      ) : (
        <Group>
          {!finding ? (
            <div className="lyrics-empty cell block" data-testid="now-video-empty">
              <span className="lyrics-empty-icon" aria-hidden>
                <Video size={22} strokeWidth={1.75} />
              </span>
              <p className="text-headline mt-2">{t("now.video_none")}</p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  className="btn btn-ghost min-h-11 px-4"
                  onClick={() => void search()}
                  data-testid="now-video-find"
                >
                  <Search size={15} strokeWidth={2} aria-hidden /> {t("now.video_find")}
                </button>
              </div>
            </div>
          ) : (
            <>
              {state === "busy" && (
                <div className="cell text-[var(--label-2)]">{t("now.video_searching")}</div>
              )}
              {state === "connect" && (
                <div className="cell text-footnote text-[var(--label-2)]" data-testid="now-video-connect">
                  {t("now.video_connect")}
                </div>
              )}
              {state === "none" && (
                <div className="cell text-[var(--label-2)]">{t("now.video_none_found")}</div>
              )}
              {state === "error" && (
                <div className="cell text-[var(--label-2)]">{t("song.lyrics_src_error")}</div>
              )}
              {found?.map((v) => (
                <div key={v.videoId} className="cell" data-testid="now-video-candidate">
                  {v.thumb && (
                    // biome-ignore lint/performance/noImgElement: YouTube's own thumbnail, as its terms show it
                    <img src={v.thumb} alt="" width={96} height={54} className="rounded-md" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{v.title}</span>
                    <span className="text-footnote block truncate text-[var(--label-2)]">{v.channel}</span>
                  </span>
                  <button
                    type="button"
                    className="btn-plain min-h-11 px-2 font-semibold"
                    onClick={() => pick(v.videoId)}
                    data-testid="now-video-pick"
                  >
                    {t("now.video_pick")}
                  </button>
                </div>
              ))}
              <ExtLink
                href={`https://www.youtube.com/results?${new URLSearchParams({ search_query: videoQuery(song) })}`}
                className="cell cell-tap w-full text-left text-[var(--tint)]"
                testId="now-video-youtube"
              >
                <ExternalLink size={16} strokeWidth={2} aria-hidden />
                <span className="min-w-0 flex-1">{t("now.video_open_youtube")}</span>
              </ExtLink>
              <label className="cell" htmlFor="now-video-paste">
                <span className="sr-only">{t("now.video_paste")}</span>
                <input
                  id="now-video-paste"
                  className="min-h-11 min-w-0 flex-1 bg-transparent outline-none"
                  placeholder={t("now.video_paste")}
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  data-testid="now-video-paste"
                />
                <button
                  type="button"
                  className="btn-plain min-h-11 px-2"
                  disabled={!paste.trim()}
                  onClick={() => {
                    const id = videoIdOf(paste);
                    if (!id) return toast(t("now.video_bad_link"));
                    setPaste("");
                    pick(id);
                  }}
                  data-testid="now-video-paste-use"
                >
                  {t("now.video_paste_use")}
                </button>
              </label>
            </>
          )}
        </Group>
      )}
    </div>
  );
}
