"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type FloorStage, type FloorState, floorPosition, floorRemaining, floorTimes } from "@/lib/floor";
import { watchFloor } from "@/lib/floorBus";
import { t } from "@/lib/i18n";
import { type LyricLine, loadLyrics } from "@/lib/lyrics";
import { activeLine } from "@/lib/lyricsSync";
import { useNowPrefs, watchNowPrefs } from "@/lib/nowPrefs";
import { useMarks } from "@/lib/songMarks";
import { loadMatches } from "@/lib/youtubeMatches";
import { SyncedVideo } from "../song/SyncedVideo";
import { rhythmWord } from "../ui/TandaTypeBadge";
import { dancerWords, leftLabel, NightStrip, TandaDots, whoOf } from "./DancerInfo";
import "./floor.css";

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
 * 2026-11 — the dancers' Floor screen (a projector or TV at 3–5 m, a phone on a table). Redesigned (the owner: "almost
 * empty … no song title, no song number, no next"): a top line with the rhythm, the year and the tanda of the night;
 * the song's title, the orchestra large and the singer; "Song 2 of 4" with its dots and the join-the-floor strip;
 * and a foot with what comes next ("Next: cortina, then Vals · Canaro"), the time left in the tanda, La Cumparsita's
 * countdown and the night's strip of tandas. A cortina says "Cortina — clear the floor" with the next tanda and its
 * countdown. The synced lyrics or the matched video are optional (Now playing's Floor screen choice, or `?extras=0`).
 * No controls, no buttons: it follows the Booth (lib/floorBus.ts) and never controls it. The cursor hides after 2 s;
 * the content drifts slowly (burn-in); Reduce motion and Battery saver keep it still.
 */
export function FloorScreen({
  room,
  takeover = false,
  extras: extrasProp,
}: {
  room?: { server: string; code: string } | null;
  /** the page is the Floor screen (/screen): the app's own chrome leaves it */
  takeover?: boolean;
  /** show the lyrics or the video (default: this device's choice) */
  extras?: boolean;
}) {
  const [s, setS] = useState<FloorState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [idle, setIdle] = useState(false);
  const chosen = useNowPrefs((p) => p.floorExtras);
  const extras = extrasProp ?? chosen;
  useEffect(() => watchFloor(setS, { room }), [room]);
  useEffect(() => watchNowPrefs(), []);
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
  // the /screen page: the app's chrome leaves the page (no tab bar, no sidebar, no mini player — nothing to click)
  useEffect(() => {
    if (!takeover) return;
    const root = document.documentElement;
    root.dataset.floor = "1";
    return () => {
      delete root.dataset.floor;
    };
  }, [takeover]);
  const tone = s?.kind === "cortina" ? "cortina" : (s?.rhythm ?? "tango");
  const tree = (
    <div
      id={takeover ? "tdj-floor" : undefined}
      className="floor"
      data-testid="floor-screen"
      data-kind={s?.kind ?? "waiting"}
      data-rhythm={tone}
      data-idle={idle || undefined}
    >
      <div className="floor-glow" aria-hidden />
      <main className="floor-drift">
        {!s || s.kind === "idle" ? (
          <Waiting room={room} connected={!!s} />
        ) : s.kind === "cortina" ? (
          <Cortina s={s} now={now} />
        ) : s.kind === "break" ? (
          <Center s={s} now={now} title={t("floor.break")} />
        ) : (
          <Song s={s} now={now} extras={extras} />
        )}
      </main>
    </div>
  );
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);
  return takeover ? (host ? createPortal(tree, host) : null) : tree;
}

const nextTanda = (s: FloorState) =>
  s.next
    ? t("floor.next", {
        rhythm: rhythmWord(s.next.rhythm),
        orchestra: whoOf(s.next.orchestra, null).orchestra,
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

/** the night's foot: La Cumparsita's countdown and the strip of tandas */
function NightFoot({ s, now }: { s: FloorState; now: number }) {
  const w = dancerWords(s, now);
  if (!w.cumparsita && s.arc.length < 2) return null;
  return (
    <div className="floor-night">
      {w.cumparsita && (
        <span className="floor-cumparsita" data-testid="floor-cumparsita">
          {w.cumparsita}
        </span>
      )}
      <NightStrip arc={s.arc} tanda={s.tanda} testId="floor-night" />
    </div>
  );
}

function Center({ s, now, title }: { s: FloorState; now: number; title: string }) {
  return (
    <div className="floor-center">
      <p className="floor-title">{title}</p>
      {s.next && <p className="floor-next">{nextTanda(s)}</p>}
      <NightFoot s={s} now={now} />
    </div>
  );
}

function Cortina({ s, now }: { s: FloorState; now: number }) {
  const left = floorRemaining(s, now);
  return (
    <div className="floor-center" data-testid="floor-cortina">
      <p className="floor-title" data-testid="floor-cortina-title">
        {t("dancer.cortina_clear")}
      </p>
      <p className="floor-sub">{t("floor.change_partners")}</p>
      {s.next && (
        <p className="floor-next" data-testid="floor-next">
          {nextTanda(s)}
        </p>
      )}
      <p className="floor-count" data-testid="floor-countdown">
        {t("floor.next_in", { t: leftLabel(left) })}
      </p>
      <NightFoot s={s} now={now} />
    </div>
  );
}

function Song({ s, now, extras }: { s: FloorState; now: number; extras: boolean }) {
  const stages = stagesOf(s.n);
  const w = dancerWords(s, now);
  const who = whoOf(s.orchestra, s.singer);
  const times = floorTimes(s, now);
  const special =
    s.kind === "opening" ? t("floor.opening") : s.kind === "closing" ? t("floor.closing") : null;
  // the next tanda beside "Next: song 3 of 4" (a cortina's line already names it)
  const thenTanda =
    s.kind === "song" && s.follows !== "cortina" && s.next
      ? t("dancer.next_tanda", {
          rhythm: rhythmWord(s.next.rhythm),
          orchestra: whoOf(s.next.orchestra, null).orchestra,
        })
      : null;
  return (
    <div className="floor-song" data-extras={extras || undefined}>
      <header className="floor-head">
        <span className="floor-rhythm" data-testid="floor-rhythm">
          {rhythmWord(s.rhythm)}
        </span>
        {s.year ? (
          <span className="floor-year" data-testid="floor-year">
            {s.year}
          </span>
        ) : null}
        {s.tanda > 0 && s.tandas > 0 && (
          <span className="floor-tanda">{t("floor.tanda_of", { n: s.tanda, of: s.tandas })}</span>
        )}
      </header>
      <div className="floor-body">
        <div className="floor-who">
          {special && (
            <p
              className="floor-eyebrow"
              data-testid={s.kind === "closing" ? "floor-closing" : "floor-opening"}
            >
              {special}
            </p>
          )}
          <p className="floor-songtitle" lang="es" data-testid="floor-title">
            {s.title}
          </p>
          <h1 className="floor-orchestra" lang="es" data-testid="floor-orchestra">
            {who.orchestra}
          </h1>
          <p className="floor-singer" lang="es" data-testid="floor-singer">
            {who.singer || t("floor.instrumental")}
          </p>
          {s.n > 0 && s.k >= 0 && (
            <section className="floor-place" aria-label={t("floor.song_of", { k: s.k + 1, n: s.n })}>
              <div className="floor-count-line">
                <TandaDots k={s.k} n={s.n} />
                <span data-testid="floor-song-of">{t("floor.song_of", { k: s.k + 1, n: s.n })}</span>
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
        </div>
        {extras && <Extras s={s} now={now} />}
      </div>
      <footer className="floor-foot" data-testid="floor-foot">
        <div className="floor-foot-next">
          {w.next && (
            <span className="floor-then" data-testid="floor-then">
              {w.next}
            </span>
          )}
          {thenTanda && (
            <span className="floor-then-tanda" data-testid="floor-next-tanda">
              {thenTanda}
            </span>
          )}
        </div>
        {s.kind === "song" && times.tandaLeftSec !== null && (
          <span className="floor-left" data-testid="floor-tanda-left">
            {w.tandaLeft}
          </span>
        )}
      </footer>
      <NightFoot s={s} now={now} />
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
