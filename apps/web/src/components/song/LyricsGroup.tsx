"use client";
import { type Song, workCredit } from "@tdj/core";
import { ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { LRCLIB_SITE, type Lyrics, lineAt, loadLyrics, lyricsSearchUrl } from "@/lib/lyrics";
import { useMarks } from "@/lib/songMarks";
import { Group } from "../Form";
import { ExtLink } from "./ExtLink";
import type { PositionFn } from "./MarksGroup";
import { usePosition } from "./usePosition";

/**
 * 2026-11 — the lyrics of a side (LRCLIB, credited), the sounding line highlighted while it plays when LRCLIB has
 * them time-synced; an instrumental side offers its work's lyrics on a tap; nothing found says so, with a web search.
 * The work's lyricist (Letra) is credited from T-DJ's credits when known.
 */
export function LyricsGroup({
  song,
  position,
  big = false,
  onLyrics,
}: {
  song: Song;
  position?: PositionFn;
  /** the play view's large type */
  big?: boolean;
  onLyrics?: (l: Lyrics | null) => void;
}) {
  const [want, setWant] = useState(song.vocal);
  const [l, setL] = useState<Lyrics | null>(null);
  const [err, setErr] = useState(false);
  const offset = useMarks((s) => s.marks[song.id]?.lyricsOffsetSec ?? 0);
  const setMark = useMarks((s) => s.set);
  const cb = useRef(onLyrics);
  cb.current = onLyrics;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new side starts over
  useEffect(() => {
    setWant(song.vocal);
    setL(null);
    setErr(false);
  }, [song.id, song.vocal]);
  useEffect(() => {
    if (!want) return;
    let live = true;
    loadLyrics(song)
      .then((x) => {
        if (!live) return;
        setL(x);
        cb.current?.(x);
      })
      .catch(() => live && setErr(true));
    return () => {
      live = false;
    };
  }, [song, want]);
  const p = usePosition(l?.state === "synced" ? position : undefined, { stepSec: 0.1 });
  const cur = l?.lines && p ? lineAt(l.lines, p.sec - offset) : -1;
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (cur < 0) return;
    const el = box.current?.querySelector<HTMLElement>(`[data-line="${cur}"]`);
    const b = box.current;
    if (el && b)
      b.scrollTo({ top: el.offsetTop - b.clientHeight / 2 + el.clientHeight / 2, behavior: "smooth" });
  }, [cur]);
  const letra = workCredit(song.title)?.lyricists ?? [];
  const credit = l?.match ? t("song.lyrics_credit", { artist: l.match.artist, title: l.match.title }) : null;
  const footer = (
    <>
      {credit && (
        <>
          {credit}{" "}
          <ExtLink href={LRCLIB_SITE} className="text-[var(--tint)]">
            LRCLIB
          </ExtLink>
          .{" "}
        </>
      )}
      {letra.length > 0 && t("song.letra", { names: letra.join(", ") })}
      {l?.state === "synced" && !position && ` ${t("song.lyrics_sync_hint")}`}
    </>
  );
  return (
    <Group
      header={t("song.lyrics")}
      footer={footer}
      data-testid="song-lyrics"
      data-state={l?.state ?? (err ? "error" : want ? "loading" : "instrumental-side")}
    >
      {!want ? (
        <div className="cell">
          <span className="min-w-0 flex-1 text-[var(--label-2)]">{t("song.instrumental_side")}</span>
          <button
            type="button"
            className="btn-plain min-h-11 px-2 text-[var(--tint)]"
            onClick={() => setWant(true)}
            data-testid="song-lyrics-anyway"
          >
            {t("song.show_work_lyrics")}
          </button>
        </div>
      ) : err ? (
        <NoLyrics song={song} text={t("song.lyrics_unreachable")} />
      ) : !l ? (
        <div className="cell text-[var(--label-2)]">{t("song.lyrics_loading")}</div>
      ) : l.state === "none" || l.state === "instrumental" ? (
        <NoLyrics
          song={song}
          text={l.state === "instrumental" ? t("song.lyrics_instrumental") : t("song.lyrics_none")}
        />
      ) : (
        <>
          <div
            ref={box}
            className={`cell block overflow-y-auto ${big ? "max-h-[46vh]" : "max-h-72"}`}
            data-testid="song-lyrics-text"
            lang="es"
          >
            {l.state === "synced" && l.lines ? (
              l.lines.map((x, i) => (
                <p
                  key={`${x.at}-${i}`}
                  data-line={i}
                  data-current={i === cur || undefined}
                  className={`lyric-line ${big ? "text-title3" : "text-body"} ${i === cur ? "font-semibold text-[var(--label)]" : "text-[var(--label-2)]"}`}
                >
                  {x.text || "♪"}
                </p>
              ))
            ) : (
              <p className={`whitespace-pre-line ${big ? "text-title3" : "text-body"}`}>{l.plain}</p>
            )}
          </div>
          {l.state === "synced" && position && (
            <div className="cell" data-testid="song-lyrics-offset">
              <span className="min-w-0 flex-1 text-footnote text-[var(--label-2)]">
                {t("song.lyrics_offset", { s: (offset >= 0 ? "+" : "") + offset.toFixed(1) })}
              </span>
              <button
                type="button"
                className="btn-plain min-h-11 min-w-11 px-2"
                aria-label={t("song.lyrics_earlier")}
                onClick={() => setMark(song.id, { lyricsOffsetSec: Math.round((offset - 0.5) * 10) / 10 })}
              >
                −0.5
              </button>
              <button
                type="button"
                className="btn-plain min-h-11 min-w-11 px-2"
                aria-label={t("song.lyrics_later")}
                onClick={() => setMark(song.id, { lyricsOffsetSec: Math.round((offset + 0.5) * 10) / 10 })}
              >
                +0.5
              </button>
            </div>
          )}
        </>
      )}
    </Group>
  );
}

function NoLyrics({ song, text }: { song: Song; text: string }) {
  return (
    <div className="cell">
      <span className="min-w-0 flex-1 text-[var(--label-2)]" data-testid="song-lyrics-none">
        {text}
      </span>
      <ExtLink
        href={lyricsSearchUrl(song)}
        className="btn-plain inline-flex min-h-11 items-center gap-1 px-2 text-[var(--tint)]"
        testId="song-lyrics-search"
      >
        {t("song.search_lyrics")} <ExternalLink size={14} aria-hidden />
      </ExtLink>
    </div>
  );
}
