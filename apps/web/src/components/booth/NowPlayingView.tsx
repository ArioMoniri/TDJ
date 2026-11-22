"use client";
import { type Song, singerDisplay } from "@tdj/core";
import {
  Captions,
  CaptionsOff,
  ChevronDown,
  Info,
  MonitorUp,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { durationLabel } from "@/lib/booth/plan";
import { useBooth } from "@/lib/booth/store";
import { beatPhase, beatSource, type FloorState, floorOf } from "@/lib/floor";
import { haptic } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import type { Lyrics } from "@/lib/lyrics";
import { motionOff, useNowPrefs, watchNowPrefs } from "@/lib/nowPrefs";
import { orchestraName } from "@/lib/orchestraName";
import { readPlaying } from "@/lib/playingPosition";
import { useSheets } from "@/lib/sheets";
import { useMarks } from "@/lib/songMarks";
import { useSongOpen } from "@/lib/songOpen";
import { SwitchRow } from "../Form";
import { dancerWords, NightStrip, TandaDots, whoOf } from "../floor/DancerInfo";
import { FloorScreen } from "../floor/FloorScreen";
import { BeatTools } from "../song/BeatTools";
import { LyricsGroup } from "../song/LyricsGroup";
import { RhythmLane } from "../song/RhythmLane";
import { SongDetails } from "../song/SongDetails";
import { NowVideo } from "../song/VideoFinder";
import { Artwork } from "../ui/Artwork";
import { BpmKey } from "../ui/BpmKey";
import { SeekBar } from "../ui/SeekBar";
import { rhythmWord, TandaTypeBadge } from "../ui/TandaTypeBadge";
import { ConfirmHint, ConfirmRing, useHoldConfirm } from "./Confirm";
import "../song/song.css";
import "../floor/floor.css";

/** the full-screen play view's open flag (NowCard's "Now playing" opens it) */
export const useNowView = create<{ open: boolean; set: (o: boolean) => void }>()((set) => ({
  open: false,
  set: (open) => set({ open }),
}));

type Tab = "lyrics" | "video" | "rhythm" | "about";
const TABS: Tab[] = ["lyrics", "video", "rhythm", "about"];
type Key = Parameters<typeof t>[0];
const STAGE_WORDS: Record<string, Key> = {
  invite: "floor.stage_invite",
  start: "floor.stage_start",
  fine: "floor.stage_fine",
  last: "floor.stage_last",
};

/** Reduce motion or Battery saver, followed live (the media query and the root's saver flag) */
function useMotionOff(): boolean {
  const [off, setOff] = useState(true);
  useEffect(() => {
    const read = () => setOff(motionOff());
    read();
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    mq?.addEventListener?.("change", read);
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-power"] });
    return () => {
      mq?.removeEventListener?.("change", read);
      mo.disconnect();
    };
  }, []);
  return off;
}

/**
 * 2026-11 — "a better play page" (the owner), redesigned after "not aesthetic … the rhythm booming around the image is
 * not fine": Apple Music's calm hierarchy. The artwork large and still, over its own blurred colour; a slow, low glow
 * behind it on the beat (measured, else estimated from the tempo; off with Reduce motion, Battery saver or the Beat
 * glow switch, and it never moves the art); title, orchestra and singer, the rhythm, BPM and key; the progress on the
 * Booth's reconciled clock and Previous / Play-Pause / Next (hold to confirm mid-night). Beside it the dancers' card —
 * Song 2 of 4 with its dots, the tanda's rhythm, orchestra and singer, the time left in the tanda, what comes next,
 * La Cumparsita's countdown and the night's strip — and a segmented control for Lyrics · Video · Rhythm · About.
 * Song info opens over this view (a sheet), which never closes or remounts for it. Esc closes the top layer only.
 * The music never stops for this view; the Floor screen (the dancers' view) is a mode of it.
 */
export function NowPlayingView({ onInfo }: { onInfo?: (planIndex: number) => void }) {
  const open = useNowView((s) => s.open);
  const close = useCallback(() => useNowView.getState().set(false), []);
  const [floor, setFloor] = useState(false);
  const extras = useNowPrefs((p) => p.floorExtras);
  useEffect(() => watchNowPrefs(), []);
  useEffect(() => {
    if (!open) return;
    const k = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // a sheet or the DNA overlay above this view takes its own Escape (the top layer only)
      if (useSheets.getState().open > 0 || useSongOpen.getState().dna || useSongOpen.getState().song) return;
      if (floor) return setFloor(false);
      close();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, close, floor]);
  useEffect(() => {
    if (!open) setFloor(false);
  }, [open]);
  if (!open) return null;
  return (
    <>
      <Body close={close} onInfo={onInfo} onFloor={() => setFloor(true)} />
      {floor && (
        <div data-testid="now-floor-mode">
          <FloorScreen />
          <div className="now-floor-tools">
            <button
              type="button"
              className="now-floor-btn"
              aria-label={t("now.floor_extras")}
              aria-pressed={extras}
              title={extras ? t("now.floor_extras_on") : t("now.floor_extras_off")}
              onClick={(e) => {
                e.stopPropagation();
                useNowPrefs.getState().set({ floorExtras: !extras });
              }}
              data-testid="now-floor-extras"
            >
              {extras ? (
                <Captions size={18} strokeWidth={2} aria-hidden />
              ) : (
                <CaptionsOff size={18} strokeWidth={2} aria-hidden />
              )}
            </button>
            <button
              type="button"
              className="now-floor-btn"
              aria-label={t("song.close")}
              onClick={(e) => {
                e.stopPropagation();
                setFloor(false);
              }}
              data-testid="now-floor-exit"
            >
              <X size={18} strokeWidth={2.25} aria-hidden />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Body({
  close,
  onInfo,
  onFloor,
}: {
  close: () => void;
  onInfo?: (i: number) => void;
  onFloor: () => void;
}) {
  const planIndex = useBooth((s) => s.planIndex);
  const item = useBooth((s) => s.plan?.items[s.planIndex] ?? null);
  const entity = useBooth((s) => s.entities[s.planIndex] ?? null);
  const src = useBooth((s) => s.sources[s.planIndex]);
  const started = useBooth((s) => s.started);
  const state = useBooth((s) => s.state);
  const paused = useBooth((s) => s.paused);
  const position = useBooth((s) => s.position);
  const current = useBooth((s) => s.current);
  const ready = useBooth((s) => s.ready);
  const song = entity && "rhythm" in entity && "orchestraId" in entity ? (entity as Song) : null;
  const id = song?.id ?? "";
  const boothPos = useCallback(() => (id ? useBooth.getState().positionOf(id) : null), [id]);
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [tab, setTab] = useState<Tab>("lyrics");
  // a 30 s clip plays its own seconds, not the recording's: the lane and the lyrics would not line up
  const clip = src === "preview";
  const len = current
    ? Math.max(0, current.endsAt - current.startedAt)
    : (item?.lengthSec ?? song?.durationSec ?? 180);
  const live = state === "playing" || state === "cortina";
  const marks = useMarks((s) => (id ? s.marks[id] : undefined));
  const beat = useMemo(
    () =>
      beatSource({
        marks,
        bpm: song ? (song.tempo?.bpm ?? song.audio?.bpm ?? song.deezer?.bpm ?? song.bpm ?? null) : null,
        rhythm: song?.rhythm ?? item?.rhythm ?? "tango",
        headSec: item?.headSilenceSec ?? 0,
      }),
    [marks, song, item?.rhythm, item?.headSilenceSec],
  );
  const glowOn = useNowPrefs((p) => p.beatGlow);
  const still = useMotionOff();
  const beatOn = glowOn && !still && !clip && !!song;
  const wrap = useRef<HTMLDivElement>(null);
  // the beat: a soft glow behind the cover, every frame from the Booth's clock (no React render); the art never moves
  useEffect(() => {
    const el = wrap.current;
    if (!song || !beatOn || !el) {
      el?.style.setProperty("--beat", "0");
      return;
    }
    let raf = 0;
    let lastBeat = 0;
    const bpb = song.rhythm === "vals" ? 3 : 4;
    const tick = () => {
      const p = readPlaying(song.id);
      let v = 0;
      let n = 0;
      if (p?.playing && p.synced) {
        const ph = beatPhase(p.positionSec, beat.bpm, beat.downbeatSec, bpb);
        if (!ph.before) {
          v = (ph.beat === 1 ? 1 : 0.45) * Math.exp(-ph.since * 3.5);
          n = ph.beat;
        }
      }
      el.style.setProperty("--beat", v.toFixed(3));
      if (n !== lastBeat) {
        lastBeat = n;
        el.dataset.beatN = String(n);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      el.style.setProperty("--beat", "0");
      delete el.dataset.beatN;
    };
  }, [song, beat, beatOn]);

  const b = useBooth.getState();
  const playing = live && !paused;
  const who = song ? whoOf(orchestraName(song), song.singer) : { orchestra: item?.artist ?? "", singer: "" };
  return (
    <div
      className="now-view now-view-v2 now-view-v3"
      role="dialog"
      aria-modal="true"
      aria-label={t("song.now_playing")}
      data-testid="now-view"
      data-tab={tab}
    >
      <div className="now-bg" aria-hidden>
        {entity && <Artwork entity={entity} orchestra={song?.orchestra ?? item?.artist ?? ""} size={320} />}
      </div>
      <div className="now-view-bar" data-tauri-drag-region>
        <button
          type="button"
          className="icon-btn h-11 w-11"
          aria-label={t("song.close")}
          onClick={close}
          data-testid="now-view-close"
        >
          <ChevronDown size={22} strokeWidth={2.25} aria-hidden />
        </button>
        <span className="now-bar-title text-headline min-w-0 flex-1 truncate">{t("song.now_playing")}</span>
        <button
          type="button"
          className="btn-plain now-bar-btn"
          onClick={onFloor}
          aria-label={t("now.floor_mode")}
          data-testid="now-floor"
        >
          <MonitorUp size={17} strokeWidth={2} aria-hidden />
          <span className="now-hide-narrow">{t("now.floor_mode")}</span>
        </button>
        {onInfo && item && item.kind !== "break" && (
          <button
            type="button"
            className="btn-plain now-bar-btn"
            // 2026-11 (the owner): Song info opens over this view, which stays open and where it was
            onClick={() => onInfo(planIndex)}
            aria-label={t("now.song_info")}
            data-testid="now-song-info"
          >
            <Info size={17} strokeWidth={2} aria-hidden />
            <span className="now-hide-narrow">{t("now.song_info")}</span>
          </button>
        )}
      </div>
      <div className="now-view-body">
        {!item || !entity ? (
          <p className="text-body mt-8 text-center text-[var(--label-2)]">{t("song.nothing_playing")}</p>
        ) : (
          <div className="now-grid">
            <section className="now-player" aria-label={t("song.now_playing")}>
              <div
                className="now-cover-wrap"
                ref={wrap}
                data-beat={beatOn ? "on" : "off"}
                data-testid="now-cover-wrap"
              >
                {beatOn && <div className="now-cover-glow" aria-hidden data-testid="now-beat-glow" />}
                <div className="now-cover" data-testid="now-cover">
                  <Artwork entity={entity} orchestra={song?.orchestra ?? item.artist} size={480} />
                </div>
              </div>
              <div className="now-meta">
                <h1 className="now-title" lang="es" data-testid="now-view-title">
                  {item.title}
                </h1>
                <p className="now-artist" lang="es" data-testid="now-view-artist">
                  {who.orchestra}
                  {who.singer ? <span className="now-artist-singer"> · {who.singer}</span> : null}
                </p>
                <div className="now-chips">
                  {song && <TandaTypeBadge rhythm={song.rhythm} vocal={song.vocal} compact />}
                  {item.year ? <span className="now-year">{item.year}</span> : null}
                  {song && <BpmKey e={song} />}
                </div>
              </div>
              <div className="now-progress">
                <SeekBar
                  value={Math.min(position, len)}
                  max={len}
                  onSeek={(sec) => void useBooth.getState().seek(sec)}
                  disabled={!started || item.kind === "break" || !(live || state === "paused")}
                  confirmTap={live}
                  label={t("booth.nowCard.seek_label")}
                  testId="now-seek"
                />
                <div className="now-times">
                  <span data-testid="now-view-clock">{durationLabel(Math.min(position, len))}</span>
                  <span>-{durationLabel(Math.max(0, len - position))}</span>
                </div>
              </div>
              <div className="now-transport">
                <HoldBtn
                  label={t("booth.controlStrip.previous")}
                  confirmKey="now-prev"
                  disabled={!ready}
                  onRun={() => void useBooth.getState().previous()}
                  testId="now-prev"
                >
                  <SkipBack size={26} fill="currentColor" strokeWidth={1.5} aria-hidden />
                </HoldBtn>
                <button
                  type="button"
                  className="now-play"
                  aria-label={playing ? t("booth.controlStrip.pause") : t("booth.controlStrip.play")}
                  data-testid="now-play"
                  data-playing={playing || undefined}
                  disabled={!ready}
                  onClick={() => {
                    haptic(8);
                    if (!started) void b.start();
                    else if (playing) b.pause();
                    else void b.play();
                  }}
                >
                  {playing ? (
                    <Pause size={30} fill="currentColor" strokeWidth={0} aria-hidden />
                  ) : (
                    <Play size={30} fill="currentColor" strokeWidth={0} aria-hidden />
                  )}
                </button>
                <HoldBtn
                  label={t("booth.controlStrip.next_now")}
                  confirmKey="now-next"
                  disabled={!ready}
                  onRun={() => void useBooth.getState().nextNow()}
                  testId="now-next"
                >
                  <SkipForward size={26} fill="currentColor" strokeWidth={1.5} aria-hidden />
                </HoldBtn>
              </div>
            </section>
            <DancerCard />
            <section className="now-right">
              <Segmented tab={tab} onTab={setTab} />
              {/* every panel stays mounted (hidden when not chosen): the lyrics keep their scroll, the video its player */}
              <Panel id="lyrics" tab={tab}>
                {song ? (
                  <LyricsGroup song={song} big onLyrics={setLyrics} />
                ) : (
                  <p className="section-foot">{t("floor.cortina")}</p>
                )}
                {clip && <p className="section-foot">{t("song.clip_not_synced")}</p>}
              </Panel>
              <Panel id="video" tab={tab}>
                {song && <NowVideo song={song} position={boothPos} roomVideo={src === "youtube"} />}
              </Panel>
              <Panel id="rhythm" tab={tab}>
                {song && (
                  <>
                    <RhythmLane
                      song={song}
                      durationSec={len}
                      position={clip ? undefined : boothPos}
                      lines={lyrics?.lines}
                      headSec={item.headSilenceSec ?? 0}
                    />
                    <BeatTools song={song} position={clip ? undefined : boothPos} beat={beat} />
                    <div className="group-inset mt-4" data-testid="now-beat-glow-row">
                      <SwitchRow
                        label={t("now.beat_glow")}
                        sub={still ? t("now.beat_glow_off_motion") : t("now.beat_glow_sub")}
                        checked={glowOn}
                        onChange={(v) => useNowPrefs.getState().set({ beatGlow: v })}
                      />
                    </div>
                  </>
                )}
              </Panel>
              <Panel id="about" tab={tab}>
                {/* the Lyrics and Rhythm tabs already show the lyrics and the lane: About never draws them twice */}
                {song && <SongDetails song={song} header={false} shownLyrics={lyrics} />}
              </Panel>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The dancers' card: the tanda's rhythm, orchestra and singer, Song 2 of 4 with its dots and the join-the-floor words,
 * the time left in the tanda, what comes next, La Cumparsita's countdown, the night's strip and the next song. The
 * Floor state the Floor screen draws (lib/floor.ts floorOf), so both screens say the same thing.
 */
function DancerCard() {
  // the place in the night (each change of item or play state; not every tick) and a clock each second
  const place = useBooth((s) => {
    const f = floorOf(s as never);
    return `${f.kind}|${f.k}|${f.n}|${f.tanda}|${f.follows}|${f.playing}|${f.next?.orchestra ?? ""}|${s.position > 0}`;
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `place` and the clock re-read the Booth
  const f: FloorState = useMemo(() => floorOf(useBooth.getState() as never, now), [place, now]);
  const nextIdx = useBooth((s) => {
    const items = s.plan?.items ?? [];
    for (let i = s.planIndex + 1; i < items.length; i++) if (items[i]?.kind !== "break") return i;
    return -1;
  });
  const nextItem = useBooth((s) => (nextIdx >= 0 ? (s.plan?.items[nextIdx] ?? null) : null));
  const nextEntity = useBooth((s) => (nextIdx >= 0 ? (s.entities[nextIdx] ?? null) : null));
  if (f.kind === "idle" && !nextItem) return null;
  const w = dancerWords(f, now);
  const tanda = useBooth.getState().playlist?.tandas[f.tanda - 1];
  const who =
    f.kind === "cortina"
      ? null
      : whoOf(tanda?.orchestra ?? f.orchestra, f.kind === "song" ? (tanda?.singer ?? f.singer) : f.singer);
  const rhythm = f.kind === "cortina" ? "cortina" : f.rhythm;
  const nextSinger = nextItem && nextEntity && "singer" in nextEntity ? nextEntity.singer : null;
  return (
    <section
      className="now-dancer"
      aria-label={t("dancer.title")}
      data-testid="now-dancer"
      data-kind={f.kind}
      data-rhythm={rhythm}
    >
      <div className="now-dancer-top">
        <span className="now-dancer-rhythm" data-testid="now-dancer-rhythm">
          {f.kind === "cortina" ? t("floor.cortina") : rhythmWord(f.rhythm)}
        </span>
        {f.tanda > 0 && f.tandas > 0 && (
          <span className="now-dancer-tanda">{t("floor.tanda_of", { n: f.tanda, of: f.tandas })}</span>
        )}
      </div>
      {f.kind === "cortina" ? (
        <p className="now-dancer-who" data-testid="now-cortina">
          {t("dancer.cortina_clear")}
        </p>
      ) : who?.orchestra ? (
        <p className="now-dancer-who" lang="es" data-testid="now-dancer-who">
          {who.orchestra}
          {who.singer ? <span className="now-dancer-singer"> · {who.singer}</span> : null}
        </p>
      ) : null}
      {w.songOf ? (
        <div className="now-dancer-place" data-testid="now-place">
          <TandaDots k={f.k} n={f.n} testId="now-dots" />
          <span className="now-dancer-songof" data-testid="now-song-of">
            {w.songOf}
          </span>
          {f.stage && <span className="now-dancer-advice">{t(STAGE_WORDS[f.stage]!)}</span>}
        </div>
      ) : f.kind === "opening" || f.kind === "closing" ? (
        <div className="now-dancer-place" data-testid="now-place">
          <span className="now-dancer-songof">
            {f.kind === "opening" ? t("floor.opening") : t("floor.closing")}
          </span>
        </div>
      ) : null}
      <ul className="now-dancer-facts">
        {w.tandaLeft && <li data-testid="now-tanda-left">{w.tandaLeft}</li>}
        {w.next && (
          <li className="now-dancer-next" data-testid="now-then">
            {w.next}
          </li>
        )}
        {f.kind === "song" && f.follows !== "cortina" && f.next && (
          <li data-testid="now-next-tanda">
            {t("dancer.next_tanda", {
              rhythm: rhythmWord(f.next.rhythm),
              orchestra: whoOf(f.next.orchestra, null).orchestra,
            })}
          </li>
        )}
        {w.cumparsita && <li data-testid="now-cumparsita">{w.cumparsita}</li>}
      </ul>
      <NightStrip arc={f.arc} tanda={f.tanda} testId="now-night" />
      {nextItem && nextEntity && (
        <div className="now-upnext" data-testid="now-upnext">
          <span className="now-upnext-art">
            <Artwork entity={nextEntity} orchestra={nextItem.artist} size={44} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-caption1 block text-[var(--label-2)]">{t("now.up_next")}</span>
            <span className="block truncate font-semibold" lang="es">
              {nextItem.title}
            </span>
            <span className="text-footnote block truncate text-[var(--label-2)]" lang="es">
              {nextItem.kind === "cortina"
                ? t("floor.cortina")
                : [
                    "orchestra" in nextEntity && nextEntity.orchestra
                      ? orchestraName({ orchestra: nextEntity.orchestra, singer: nextSinger })
                      : nextItem.artist,
                    nextSinger ? (singerDisplay(nextSinger) as string) : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
            </span>
          </span>
        </div>
      )}
    </section>
  );
}

/**
 * The tabs as a segmented control: the chosen one a filled pill; arrows move between them; the focus ring only for
 * the keyboard (a click never draws it)
 */
function Segmented({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const [pointer, setPointer] = useState(false);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    setPointer(false);
    const i = TABS.indexOf(tab);
    const to =
      e.key === "ArrowRight"
        ? (i + 1) % TABS.length
        : e.key === "ArrowLeft"
          ? (i + TABS.length - 1) % TABS.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? TABS.length - 1
              : -1;
    if (to < 0) return;
    e.preventDefault();
    onTab(TABS[to]!);
    refs.current[to]?.focus();
  };
  return (
    <div
      className="now-seg"
      role="tablist"
      aria-label={t("now.tabs_label")}
      data-pointer={pointer || undefined}
      onPointerDown={() => setPointer(true)}
      onKeyDown={onKey}
      data-testid="now-tabs"
    >
      {TABS.map((x, i) => (
        <button
          key={x}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={`now-tab-${x}`}
          aria-selected={tab === x}
          aria-controls={`now-panel-${x}`}
          tabIndex={tab === x ? 0 : -1}
          className="now-seg-btn"
          onClick={() => onTab(x)}
          data-testid={`now-tab-${x}`}
        >
          {t(`now.tab_${x}`)}
        </button>
      ))}
    </div>
  );
}

function Panel({ id, tab, children }: { id: Tab; tab: Tab; children: ReactNode }) {
  return (
    <div
      role="tabpanel"
      id={`now-panel-${id}`}
      aria-labelledby={`now-tab-${id}`}
      hidden={tab !== id}
      className="now-panel"
      data-testid={`now-panel-${id}`}
    >
      {children}
    </div>
  );
}

/** a transport button that asks for a hold mid-night (Confirm.tsx: a ring fills in 0.6 s; the keyboard arms) */
function HoldBtn({
  label,
  confirmKey,
  onRun,
  disabled,
  testId,
  children,
}: {
  label: string;
  confirmKey: string;
  onRun: () => void;
  disabled?: boolean;
  testId: string;
  children: ReactNode;
}) {
  const hold = useHoldConfirm(confirmKey, () => {
    haptic(8);
    onRun();
  });
  return (
    <button
      type="button"
      className="now-tbtn confirm-host"
      aria-label={label}
      aria-description={t("booth.confirm.hold_hint")}
      disabled={disabled}
      data-testid={testId}
      data-holding={hold.holding || undefined}
      data-armed={hold.armed || undefined}
      onContextMenu={(e) => e.preventDefault()}
      {...hold.handlers}
    >
      {children}
      {(hold.holding || hold.armed) && <ConfirmRing />}
      {hold.armed && !hold.holding && <ConfirmHint testId={`${testId}-nudge`} />}
    </button>
  );
}
