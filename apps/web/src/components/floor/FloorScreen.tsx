"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { type FloorStage, type FloorState, floorPosition, floorRemaining } from "@/lib/floor";
import { watchFloor } from "@/lib/floorBus";
import { t } from "@/lib/i18n";
import { type LyricLine, loadLyrics } from "@/lib/lyrics";
import { activeLine } from "@/lib/lyricsSync";
import { useMarks } from "@/lib/songMarks";
import { loadMatches } from "@/lib/youtubeMatches";
import { SyncedVideo } from "../song/SyncedVideo";
import { rhythmWord } from "../ui/TandaTypeBadge";
import "./floor.css";

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
type Key = Parameters<typeof t>[0];
const STAGE_WORDS: Record<FloorStage, Key> = {
  invite: "floor.stage_invite",
  start: "floor.stage_start",
  fine: "floor.stage_fine",
  last: "floor.stage_last",
};
const STAGE_SHORT: Record<FloorStage, Key> = {
  invite: "floor.short_invite",
  start: "floor.short_start",
  fine: "floor.short_fine",
  last: "floor.short_last",
};
/** a tanda's songs as stages, for the strip: three songs skip "still fine" */
const stagesOf = (n: number): FloorStage[] =>
  n >= 4
    ? ["invite", "start", ...Array.from({ length: n - 3 }, () => "fine" as const), "last"]
    : n === 3
      ? ["invite", "start", "last"]
      : n === 2
        ? ["invite", "last"]
        : ["invite"];

/**
 * 2026-11 — the dancers' Floor screen (a projector or TV at 3–5 m, a phone on a table): the orchestra and singer large,
 * the rhythm in its colour, "Song 2 of 4" with big dots and the join-the-floor strip (invite → a good time to start →
 * still fine → last song), the cortina's "change partners" with the next tanda and its countdown, La Cumparsita; the
 * synced lyrics or the matched video, muted. No controls, no buttons: it follows the Booth (lib/floorBus.ts) and never
 * controls it. The cursor hides after 2 s; the content drifts slowly (burn-in); Reduce motion keeps it still.
 */
export function FloorScreen({ room }: { room?: { server: string; code: string } | null }) {
  const [s, setS] = useState<FloorState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [idle, setIdle] = useState(false);
  useEffect(() => watchFloor(setS, { room }), [room]);
  useEffect(() => {
    const t0 = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t0);
  }, []);
  // the cursor hides after 2 s still
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const move = () => {
      setIdle(false);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), 2000);
    };
    move();
    window.addEventListener("pointermove", move);
    return () => {
      window.removeEventListener("pointermove", move);
      if (timer) clearTimeout(timer);
    };
  }, []);
  // a click anywhere (the DJ, once, on the projector) goes full screen; nothing else is clickable
  useEffect(() => {
    const fs = () => {
      if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {});
    };
    window.addEventListener("click", fs);
    return () => window.removeEventListener("click", fs);
  }, []);
  const tone = s?.kind === "cortina" ? "cortina" : (s?.rhythm ?? "tango");
  return (
    <div
      className="floor"
      data-testid="floor-screen"
      data-kind={s?.kind ?? "waiting"}
      data-rhythm={tone}
      data-idle={idle || undefined}
      lang={undefined}
    >
      <div className="floor-glow" aria-hidden />
      <main className="floor-drift">
        {!s || s.kind === "idle" ? (
          <Waiting room={room} connected={!!s} />
        ) : s.kind === "cortina" ? (
          <Cortina s={s} now={now} />
        ) : s.kind === "break" ? (
          <Center title={t("floor.break")} sub={s.next ? nextLine(s) : ""} />
        ) : s.kind === "closing" ? (
          <Center
            title="La Cumparsita"
            sub={t("floor.closing")}
            eyebrow={s.orchestra}
            testId="floor-closing"
          />
        ) : (
          <Song s={s} now={now} />
        )}
      </main>
    </div>
  );
}

const nextLine = (s: FloorState) =>
  s.next
    ? t("floor.next", {
        orchestra: s.next.orchestra,
        rhythm: rhythmWord(s.next.rhythm).toLowerCase(),
      })
    : "";

function Waiting({ room, connected }: { room?: { code: string } | null; connected: boolean }) {
  return (
    <div className="floor-center" data-testid="floor-waiting">
      <p className="floor-title">{t("floor.waiting_title")}</p>
      <p className="floor-sub">
        {connected
          ? t("floor.waiting_sub")
          : room
            ? t("floor.connecting_room", { code: room.code })
            : t("floor.connecting")}
      </p>
    </div>
  );
}

function Center({
  title,
  sub,
  eyebrow,
  testId,
}: {
  title: string;
  sub: string;
  eyebrow?: string;
  testId?: string;
}) {
  return (
    <div className="floor-center" data-testid={testId}>
      {eyebrow && <p className="floor-eyebrow">{eyebrow}</p>}
      <p className="floor-title">{title}</p>
      {sub && <p className="floor-sub">{sub}</p>}
    </div>
  );
}

function Cortina({ s, now }: { s: FloorState; now: number }) {
  const left = floorRemaining(s, now);
  return (
    <div className="floor-center" data-testid="floor-cortina">
      <p className="floor-eyebrow">{t("floor.cortina")}</p>
      <p className="floor-title">{t("floor.change_partners")}</p>
      {s.next && (
        <p className="floor-next" data-testid="floor-next">
          {nextLine(s)}
        </p>
      )}
      <p className="floor-count" data-testid="floor-countdown">
        {t("floor.next_in", { t: clock(left) })}
      </p>
    </div>
  );
}

function Song({ s, now }: { s: FloorState; now: number }) {
  const stages = stagesOf(s.n);
  const opening = s.kind === "opening";
  return (
    <div className="floor-song">
      <div className="floor-head">
        <span className="floor-rhythm" data-testid="floor-rhythm">
          {rhythmWord(s.rhythm)}
        </span>
        {s.year ? <span className="floor-year">{s.year}</span> : null}
        {s.tanda > 0 && s.tandas > 0 && (
          <span className="floor-tanda">{t("floor.tanda_of", { n: s.tanda, of: s.tandas })}</span>
        )}
      </div>
      <h1 className="floor-orchestra" data-testid="floor-orchestra">
        {s.orchestra}
      </h1>
      <p className="floor-singer">{s.singer || t("floor.instrumental")}</p>
      <p className="floor-songtitle" lang="es">
        {opening ? t("floor.opening") : `“${s.title}”`}
      </p>
      {s.n > 0 && s.k >= 0 && (
        <section className="floor-place" aria-label={t("floor.song_of", { k: s.k + 1, n: s.n })}>
          <div className="floor-count-line">
            <span data-testid="floor-song-of">{t("floor.song_of", { k: s.k + 1, n: s.n })}</span>
            <span className="floor-dots" aria-hidden>
              {Array.from({ length: s.n }, (_, i) => (
                <i key={i} data-on={i === s.k || undefined} data-done={i < s.k || undefined} />
              ))}
            </span>
          </div>
          <div className="floor-strip" data-testid="floor-strip" data-stage={s.stage ?? undefined}>
            {stages.map((st, i) => (
              <div
                key={i}
                className="floor-seg"
                data-stage={st}
                data-on={i === s.k || undefined}
                data-past={i < s.k || undefined}
              >
                <span>{t(STAGE_SHORT[st])}</span>
              </div>
            ))}
          </div>
          {s.stage && (
            <p className="floor-advice" data-testid="floor-advice">
              {t(STAGE_WORDS[s.stage])}
            </p>
          )}
        </section>
      )}
      <Extras s={s} now={now} />
    </div>
  );
}

/** the synced lyrics' sounding line and the next (or the matched video, muted), when this device has them */
function Extras({ s, now }: { s: FloorState; now: number }) {
  const [lines, setLines] = useState<LyricLine[] | null>(null);
  const video = useMemo(() => (s.songId ? (loadMatches()[s.songId] ?? null) : null), [s.songId]);
  const sRef = useRef(s);
  sRef.current = s;
  useEffect(() => {
    setLines(null);
    if (!s.songId || !s.singer) return;
    let live = true;
    loadLyrics({
      id: s.songId,
      title: s.title,
      orchestra: s.orchestra,
      singer: s.singer,
      durationSec: s.lengthSec,
    })
      .then((l) => live && setLines(l.state === "synced" ? (l.lines ?? null) : null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [s.songId, s.title, s.orchestra, s.singer, s.lengthSec]);
  const offset = useMarks((m) => (s.songId ? (m.marks[s.songId]?.lyricsOffsetSec ?? 0) : 0));
  const rec = floorPosition(s, now) + s.srcStartSec;
  const position = useMemo(
    () => () => {
      const x = sRef.current;
      return { sec: floorPosition(x) + x.srcStartSec, playing: x.playing };
    },
    [],
  );
  if (video && s.songId)
    return (
      <div className="floor-video" data-testid="floor-video">
        <SyncedVideo songId={s.songId} videoId={video} position={position} />
      </div>
    );
  if (!lines) return null;
  const i = activeLine(lines, rec, offset);
  const cur = lines[i]?.text;
  const next = lines.slice(i + 1).find((l) => l.text.trim())?.text;
  return (
    <div className="floor-lyrics" data-testid="floor-lyrics" lang="es" aria-live="off">
      <p className="floor-lyric-now">{cur || "♪"}</p>
      {next && <p className="floor-lyric-next">{next}</p>}
    </div>
  );
}
