"use client";
import { type Song, workCredit } from "@tdj/core";
import { ClipboardPaste, ExternalLink, Info, MicVocal, Search } from "lucide-react";
import { type KeyboardEvent, memo, useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import {
  LRCLIB_SITE,
  type LyricLine,
  type Lyrics,
  loadLyrics,
  lyricsSearchUrl,
  onOwnLyrics,
} from "@/lib/lyrics";
import { type LineJump, playFromLine } from "@/lib/lyricsPlay";
import { activeLine, lineStartSec, nudgeOffset } from "@/lib/lyricsSync";
import { readPlaying } from "@/lib/playingPosition";
import { useMarks } from "@/lib/songMarks";
import { toast } from "@/lib/toast";
import { Group } from "../Form";
import { ExtLink } from "./ExtLink";
import { FindLyricsSheet } from "./FindLyricsSheet";
import type { PositionFn } from "./MarksGroup";
import { markText } from "./SongFacts";

/** the user scrolled the lyrics: the active line stops pulling them for this long */
const HOLD_MS = 4000;

type Follow = "idle" | "clip" | "follow:booth" | "follow:cue" | "follow:player" | "paused";

/**
 * 2026-11 — the lyrics of a side (LRCLIB, credited). Synced lyrics follow the side wherever it plays — the Booth's
 * room or a pre-listen, else the mini player (lib/playingPosition.ts: one answer for every tab) — read every animation
 * frame, React only hearing of a new line: the line lights, scrolls into view (not for 4 s after the DJ scrolled), and
 * a seek, a pause or the next song shows at once. The DJ's ±0.5 s shift is kept per side. A tap on a line (or Enter on
 * it; ↑ / ↓ move between lines) plays the side from there (lib/lyricsPlay.ts: the Booth's rules, the mini player
 * elsewhere). Plain lyrics have no times: they say so and are not tappable. An instrumental side offers its work's
 * lyrics on a tap; nothing found says so, with a web search. The work's lyricist (Letra) is credited when known.
 */
export function LyricsGroup({
  song,
  big = false,
  onLyrics,
}: {
  song: Song;
  /** (kept for callers: the lyrics read the one playing position themselves) */
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
  const [finding, setFinding] = useState<"find" | "paste" | null>(null);
  const [rev, setRev] = useState(0);
  const cb = useRef(onLyrics);
  cb.current = onLyrics;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new side starts over
  useEffect(() => {
    setWant(song.vocal);
    setL(null);
    setErr(false);
  }, [song.id, song.vocal]);
  // the DJ attached or forgot lyrics for this side (the Find lyrics sheet, another view): load again
  useEffect(() => onOwnLyrics((id) => id === song.id && setRev((r) => r + 1)), [song.id]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `rev` reloads after the DJ's own lyrics changed
  useEffect(() => {
    if (!want) return;
    let live = true;
    setErr(false);
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
  }, [song, want, rev]);
  const lines = l?.state === "synced" ? (l.lines ?? null) : null;
  const letra = workCredit(song.title)?.lyricists ?? [];
  const credit =
    l?.source === "paste"
      ? t("song.lyrics_yours")
      : l?.source === "musixmatch"
        ? `${t("song.lyrics_from", { source: "Musixmatch" })}${l.copyright ? ` ${l.copyright}` : ""}${l.partial ? ` ${t("song.lyrics_partial")}.` : ""}`
        : l?.match
          ? t(l.match.kind === "work" ? "song.lyrics_credit_work" : "song.lyrics_credit", {
              artist: l.match.artist,
              title: l.match.title,
            })
          : null;
  // 2026-11 (the owner: "the credit line is long") — the play view says the source in one line, the full credits
  // behind an ⓘ; the sheets keep the full footer
  const [credits, setCredits] = useState(false);
  const sourceName = l?.source === "musixmatch" ? "Musixmatch" : l?.source === "paste" ? null : "LRCLIB";
  const sourceLine = !l
    ? null
    : l.source === "paste"
      ? t("song.lyrics_source_yours")
      : l.match?.kind === "work"
        ? t("song.lyrics_source_other", { source: sourceName ?? "" })
        : sourceName
          ? t("song.lyrics_source", { source: sourceName })
          : null;
  const footer = (
    <>
      {credit && (
        <>
          {credit}
          {(!l?.source || l.source === "lrclib") && (
            <>
              {" "}
              <ExtLink href={LRCLIB_SITE} className="text-[var(--tint)]">
                LRCLIB
              </ExtLink>
              .
            </>
          )}{" "}
        </>
      )}
      {letra.length > 0 && `${t("song.letra", { names: letra.join(", ") })} `}
      {l && l.state !== "none" && l.state !== "instrumental" && (
        <button
          type="button"
          className="text-[var(--tint)]"
          onClick={() => setFinding("find")}
          data-testid="song-lyrics-other"
        >
          {t("song.lyrics_other")}
        </button>
      )}
      {l?.pixel && <img src={l.pixel} alt="" width={1} height={1} className="sr-only" />}
    </>
  );
  const bigFooter =
    l && l.state !== "none" && l.state !== "instrumental" ? (
      <span className="now-lyrics-source" data-testid="song-lyrics-source">
        <span className="min-w-0 truncate">{sourceLine}</span>
        <button
          type="button"
          className="now-lyrics-info"
          aria-label={t("song.lyrics_credits")}
          aria-expanded={credits}
          onClick={() => setCredits((c) => !c)}
          data-testid="song-lyrics-credits-btn"
        >
          <Info size={16} strokeWidth={2} aria-hidden />
        </button>
        {credits && (
          <span className="now-lyrics-credits" data-testid="song-lyrics-credits">
            {footer}
          </span>
        )}
        {l?.pixel && !credits && <img src={l.pixel} alt="" width={1} height={1} className="sr-only" />}
      </span>
    ) : null;
  return (
    <Group
      header={big ? undefined : t("song.lyrics")}
      footer={big ? bigFooter : footer}
      className={big ? "now-lyrics" : ""}
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
        <NoLyrics song={song} text={t("song.lyrics_unreachable")} onFind={(m) => setFinding(m)} />
      ) : !l ? (
        <div className="cell text-[var(--label-2)]">{t("song.lyrics_loading")}</div>
      ) : l.state === "none" || l.state === "instrumental" ? (
        <NoLyrics
          song={song}
          text={l.state === "instrumental" ? t("song.lyrics_instrumental") : t("song.lyrics_none")}
          onFind={(m) => setFinding(m)}
        />
      ) : lines ? (
        <SyncedLyrics
          song={song}
          lines={lines}
          offset={offset}
          big={big}
          onNudge={(d) => setMark(song.id, { lyricsOffsetSec: nudgeOffset(offset, d) })}
        />
      ) : (
        <>
          <div
            className={big ? "now-lyrics-plain" : "cell block max-h-72 overflow-y-auto"}
            data-testid="song-lyrics-text"
            lang="es"
          >
            <p className="whitespace-pre-line text-body">{l.plain}</p>
          </div>
          <div
            className={big ? "now-lyrics-note" : "cell text-footnote text-[var(--label-2)]"}
            data-testid="song-lyrics-unsynced"
          >
            {big ? t("song.lyrics_not_synced_short") : t("song.lyrics_not_synced")}
          </div>
        </>
      )}
      <FindLyricsSheet
        song={song}
        open={!!finding}
        start={finding ?? "find"}
        onClose={() => setFinding(null)}
      />
    </Group>
  );
}

const reduced = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function SyncedLyrics({
  song,
  lines,
  offset,
  big,
  onNudge,
}: {
  song: Song;
  lines: LyricLine[];
  offset: number;
  big: boolean;
  onNudge: (delta: number) => void;
}) {
  const [cur, setCur] = useState(-1);
  const [follow, setFollow] = useState<Follow>("idle");
  const [focus, setFocus] = useState(0);
  const [confirm, setConfirm] = useState<{ i: number; run: () => Promise<LineJump> } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const userAt = useRef(0);
  const off = useRef(offset);
  off.current = offset;
  const curRef = useRef(cur);
  curRef.current = cur;

  // every frame: where the side is (the Booth, the mini player); React hears only of a new line or play state
  useEffect(() => {
    let raf = 0;
    let lastCur = -2;
    let lastFollow: Follow | null = null;
    const tick = () => {
      const p = readPlaying(song.id);
      const f: Follow = !p ? "idle" : !p.synced ? "clip" : p.playing ? `follow:${p.source}` : "paused";
      const c = p?.synced ? activeLine(lines, p.positionSec, off.current) : -1;
      if (f !== lastFollow) {
        lastFollow = f;
        setFollow(f);
      }
      if (c !== lastCur) {
        lastCur = c;
        setCur(c);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [song.id, lines]);

  const center = useCallback((i: number) => {
    const b = box.current;
    const el = b?.querySelector<HTMLElement>(`[data-line="${i}"]`);
    if (!b || !el) return;
    b.scrollTo({
      top: el.offsetTop - b.clientHeight / 2 + el.clientHeight / 2,
      behavior: reduced() ? "auto" : "smooth",
    });
  }, []);
  // the active line comes into view, unless the DJ scrolled in the last 4 s
  useEffect(() => {
    if (cur < 0 || Date.now() - userAt.current < HOLD_MS) return;
    center(cur);
  }, [cur, center]);
  // after the DJ's scroll the lyrics follow again once 4 s passed
  const resume = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (resume.current && clearTimeout(resume.current)), []);
  const userScrolled = () => {
    userAt.current = Date.now();
    if (resume.current) clearTimeout(resume.current);
    resume.current = setTimeout(() => {
      resume.current = null;
      if (curRef.current >= 0) center(curRef.current);
    }, HOLD_MS);
  };

  const jump = async (i: number) => {
    const line = lines[i];
    if (!line) return;
    setConfirm(null);
    setFocus(i);
    // a jump follows at once: the DJ's scroll no longer holds the lyrics
    userAt.current = 0;
    const r = await playFromLine(song, lineStartSec(line, offset));
    if (r.kind === "said" && r.text) toast(r.text);
    if (r.kind === "confirm") setConfirm({ i, run: r.run });
  };
  const jumpRef = useRef(jump);
  jumpRef.current = jump;
  const onJump = useCallback((i: number) => void jumpRef.current(i), []);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    const to =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? lines.length - 1
          : step
            ? Math.max(0, Math.min(lines.length - 1, focus + step))
            : null;
    if (to === null) {
      if (e.key === "PageUp" || e.key === "PageDown") userScrolled();
      return;
    }
    e.preventDefault();
    setFocus(to);
    userScrolled();
    const el = box.current?.querySelector<HTMLElement>(`[data-line="${to}"]`);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: "nearest" });
  };
  // the roving tab stop sits on the sounding line until the DJ moves it
  useEffect(() => {
    if (cur >= 0 && !box.current?.contains(document.activeElement)) setFocus(cur);
  }, [cur]);

  const status =
    follow === "idle"
      ? t("song.lyrics_play_to_follow")
      : follow === "clip"
        ? t("song.clip_not_synced")
        : follow === "paused"
          ? t("song.lyrics_paused")
          : follow === "follow:booth"
            ? t("song.lyrics_following_room")
            : follow === "follow:cue"
              ? t("song.lyrics_following_cue")
              : t("song.lyrics_following_player");
  return (
    <>
      <div
        ref={box}
        className={big ? "now-lyrics-lines" : "cell block max-h-72 overflow-y-auto"}
        data-testid="song-lyrics-text"
        data-follow={follow}
        data-current-line={cur}
        lang="es"
        role="toolbar"
        aria-orientation="vertical"
        aria-label={t("song.lyrics_lines_label")}
        onWheel={userScrolled}
        onTouchMove={userScrolled}
        onKeyDown={onKey}
      >
        {lines.map((x, i) => (
          <Line
            key={i}
            i={i}
            text={x.text}
            at={lineStartSec(x, offset)}
            current={i === cur}
            tabStop={i === focus}
            big={big}
            onJump={onJump}
          />
        ))}
      </div>
      {confirm && (
        <div className="cell" data-testid="song-lyrics-confirm" role="alert">
          <span className="min-w-0 flex-1 text-footnote">{t("song.lyrics_confirm_room")}</span>
          <button
            type="button"
            className="btn-plain min-h-11 px-2"
            onClick={() => setConfirm(null)}
            data-testid="song-lyrics-confirm-cancel"
          >
            {t("song.lyrics_cancel")}
          </button>
          <button
            type="button"
            className="btn-plain min-h-11 px-2 font-semibold text-[var(--tint)]"
            data-testid="song-lyrics-confirm-room"
            onClick={async () => {
              const c = confirm;
              setConfirm(null);
              const r = await c.run();
              if (r.kind === "said" && r.text) toast(r.text);
            }}
          >
            {t("song.lyrics_play_in_room")}
          </button>
        </div>
      )}
      <div className={big ? "now-lyrics-tools" : "cell"} data-testid="song-lyrics-offset">
        <span className="min-w-0 flex-1 text-footnote text-[var(--label-2)]">
          <span className="block" data-testid="song-lyrics-follow" data-state={follow}>
            {status}
          </span>
          <span className="block">
            {t("song.lyrics_offset", { s: (offset >= 0 ? "+" : "") + offset.toFixed(1) })}
          </span>
        </span>
        <button
          type="button"
          className="btn-plain min-h-11 min-w-11 px-2"
          aria-label={t("song.lyrics_earlier")}
          data-testid="song-lyrics-earlier"
          onClick={() => onNudge(-0.5)}
        >
          −0.5
        </button>
        <button
          type="button"
          className="btn-plain min-h-11 min-w-11 px-2"
          aria-label={t("song.lyrics_later")}
          data-testid="song-lyrics-later"
          onClick={() => onNudge(0.5)}
        >
          +0.5
        </button>
      </div>
    </>
  );
}

/** one line: a button (a tap plays from its start); only the lines whose props change re-render */
const Line = memo(function Line({
  i,
  text,
  at,
  current,
  tabStop,
  big,
  onJump,
}: {
  i: number;
  text: string;
  at: number;
  current: boolean;
  tabStop: boolean;
  big: boolean;
  onJump: (i: number) => void;
}) {
  return (
    <button
      type="button"
      data-line={i}
      data-at={at}
      data-current={current || undefined}
      aria-current={current ? "true" : undefined}
      aria-label={t("song.lyrics_line_play", { at: markText(at), text: text || "♪" })}
      aria-keyshortcuts="ArrowUp ArrowDown Enter"
      tabIndex={tabStop ? 0 : -1}
      className={
        big
          ? "lyric-line lyric-line-big"
          : `lyric-line text-body ${current ? "font-semibold text-[var(--label)]" : "text-[var(--label-2)]"}`
      }
      onClick={() => onJump(i)}
    >
      {text || "♪"}
    </button>
  );
});

/** the designed empty state: what happened, and the three ways on (find in every source, paste, the web) */
function NoLyrics({
  song,
  text,
  onFind,
}: {
  song: Song;
  text: string;
  onFind: (m: "find" | "paste") => void;
}) {
  return (
    <div className="lyrics-empty cell block" data-testid="song-lyrics-empty">
      <span className="lyrics-empty-icon" aria-hidden>
        <MicVocal size={22} strokeWidth={1.75} />
      </span>
      <p className="text-headline mt-2">{t("song.lyrics_none_title")}</p>
      <p className="text-footnote text-[var(--label-2)]" data-testid="song-lyrics-none">
        {text}
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          className="btn btn-ghost min-h-11 px-4"
          onClick={() => onFind("find")}
          data-testid="song-lyrics-find"
        >
          <Search size={15} strokeWidth={2} aria-hidden /> {t("song.find_lyrics")}
        </button>
        <button
          type="button"
          className="btn-plain min-h-11 rounded-full px-4 text-[var(--tint)]"
          onClick={() => onFind("paste")}
          data-testid="song-lyrics-add"
        >
          <ClipboardPaste size={15} strokeWidth={2} aria-hidden /> {t("song.add_lyrics")}
        </button>
        <ExtLink
          href={lyricsSearchUrl(song)}
          className="btn-plain inline-flex min-h-11 items-center gap-1 rounded-full px-4 text-[var(--tint)]"
          testId="song-lyrics-search"
        >
          {t("song.search_lyrics")} <ExternalLink size={14} aria-hidden />
        </ExtLink>
      </div>
    </div>
  );
}
