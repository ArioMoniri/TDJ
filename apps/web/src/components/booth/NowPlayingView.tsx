"use client";
import type { Song } from "@tdj/core";
import { Info, MonitorUp, Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { durationLabel } from "@/lib/booth/plan";
import { useBooth } from "@/lib/booth/store";
import { beatPhase, beatSource, floorOf } from "@/lib/floor";
import { haptic } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import type { Lyrics } from "@/lib/lyrics";
import { readPlaying } from "@/lib/playingPosition";
import { useSheets } from "@/lib/sheets";
import { useMarks } from "@/lib/songMarks";
import { useSongOpen } from "@/lib/songOpen";
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

/** the full-screen play view's open flag (NowCard's "Now playing" opens it) */
export const useNowView = create<{ open: boolean; set: (o: boolean) => void }>()((set) => ({
  open: false,
  set: (open) => set({ open }),
}));

type Tab = "lyrics" | "video" | "rhythm" | "about";
const TABS: Tab[] = ["lyrics", "video", "rhythm", "about"];

/** Battery saver (lib/power.ts sets `data-power="saver"` on the root) or Reduce motion: bar ticks only */
const lowPower = () =>
  typeof document !== "undefined" &&
  (document.documentElement.dataset.power === "saver" ||
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/**
 * 2026-11 — "a better play page" (the owner): the playing side full screen, Apple Music-like — the artwork blurred and
 * darkened behind everything, the cover large with a pulse on the beat (measured, else estimated from the tempo),
 * title, orchestra and singer, year and rhythm; a progress bar on the Booth's reconciled clock (tap or drag to seek,
 * the Booth's confirm rules), Previous / Play-Pause / Next (hold to confirm mid-night), "Song 2 of 4 · Tanda 7 of 23 ·
 * next: cortina", Up next; and Lyrics · Video · Rhythm · About. Song info opens over this view (a sheet), which never
 * closes or remounts for it: closing it returns here as it was. Esc closes the top layer only. The music never stops
 * for this view; the Floor screen (the dancers' view) is a mode of it.
 */
export function NowPlayingView({ onInfo }: { onInfo?: (planIndex: number) => void }) {
  const open = useNowView((s) => s.open);
  const close = useCallback(() => useNowView.getState().set(false), []);
  const [floor, setFloor] = useState(false);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
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
          <button
            type="button"
            className="now-floor-exit icon-btn h-11 w-11"
            aria-label={t("song.close")}
            onClick={() => setFloor(false)}
            data-testid="now-floor-exit"
          >
            <X size={18} strokeWidth={2.25} aria-hidden />
          </button>
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
  // the place in the night (each change of item or play state; not every tick)
  const place = useBooth((s) => {
    const f = floorOf(s as never);
    return `${f.kind}|${f.k}|${f.n}|${f.tanda}|${f.tandas}|${f.next?.orchestra ?? ""}|${f.next?.rhythm ?? ""}`;
  });
  const nextIdx = useBooth((s) => {
    const items = s.plan?.items ?? [];
    for (let i = s.planIndex + 1; i < items.length; i++) if (items[i]?.kind !== "break") return i;
    return -1;
  });
  const nextItem = useBooth((s) => (nextIdx >= 0 ? (s.plan?.items[nextIdx] ?? null) : null));
  const nextEntity = useBooth((s) => (nextIdx >= 0 ? (s.entities[nextIdx] ?? null) : null));
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
  const art = useRef<HTMLDivElement>(null);
  // the cover's pulse on the beat: every frame from the Booth's clock (no React render), bars only on low power
  useEffect(() => {
    if (!song) return;
    let raf = 0;
    const bpb = song.rhythm === "vals" ? 3 : 4;
    const tick = () => {
      const el = art.current;
      const p = readPlaying(song.id);
      let v = 0;
      if (el && p?.playing && p.synced && !clip) {
        const ph = beatPhase(p.positionSec, beat.bpm, beat.downbeatSec, bpb);
        if (!ph.before && (!lowPower() || ph.beat === 1))
          v = (ph.beat === 1 ? 1 : 0.55) * Math.exp(-ph.since * 6);
      }
      if (el) el.style.setProperty("--pulse", v.toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [song, beat, clip]);

  const [kind, k, n, tanda, tandas, nextOrch, nextRhythm] = place.split("|");
  const placeText =
    kind === "song" && Number(n) > 0
      ? t("now.place", { k: Number(k) + 1, n: Number(n), tanda: Number(tanda), tandas: Number(tandas) })
      : kind === "cortina"
        ? t("floor.cortina")
        : kind === "closing"
          ? "La Cumparsita"
          : "";
  const thenText =
    nextItem?.kind === "cortina"
      ? t("now.next_cortina")
      : kind === "cortina" && nextOrch
        ? t("now.next_tanda", { orchestra: nextOrch, rhythm: rhythmWord(nextRhythm ?? "").toLowerCase() })
        : nextItem
          ? nextItem.title
          : "";
  const b = useBooth.getState();
  const playing = live && !paused;
  return (
    <div
      className="now-view now-view-v2"
      role="dialog"
      aria-modal="true"
      aria-label={t("song.now_playing")}
      data-testid="now-view"
      data-tab={tab}
    >
      <div className="now-bg" aria-hidden>
        {entity && <Artwork entity={entity} orchestra={song?.orchestra ?? item?.artist ?? ""} size={320} />}
      </div>
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
        <button
          type="button"
          className="btn-plain inline-flex min-h-11 items-center gap-1 px-2"
          onClick={onFloor}
          data-testid="now-floor"
        >
          <MonitorUp size={16} strokeWidth={2} aria-hidden />{" "}
          <span className="now-hide-narrow">{t("now.floor_mode")}</span>
        </button>
        {onInfo && item && item.kind !== "break" && (
          <button
            type="button"
            className="btn-plain inline-flex min-h-11 items-center gap-1 px-2"
            // 2026-11 (the owner): Song info opens over this view, which stays open and where it was
            onClick={() => onInfo(planIndex)}
            data-testid="now-song-info"
          >
            <Info size={16} strokeWidth={2} aria-hidden />{" "}
            <span className="now-hide-narrow">{t("now.song_info")}</span>
          </button>
        )}
      </div>
      <div className="now-view-body">
        {!item || !entity ? (
          <p className="text-body mt-8 text-center text-[var(--label-2)]">{t("song.nothing_playing")}</p>
        ) : (
          <div className="now-split">
            <section className="now-left" aria-label={t("song.now_playing")}>
              <div className="now-cover" ref={art} data-testid="now-cover">
                <Artwork entity={entity} orchestra={song?.orchestra ?? item.artist} size={480} />
              </div>
              <div className="now-meta">
                <h1 className="now-title" lang="es" data-testid="now-view-title">
                  {item.title}
                </h1>
                <p className="now-artist" lang="es">
                  {item.artist}
                  {item.year ? ` · ${item.year}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {song && <TandaTypeBadge rhythm={song.rhythm} vocal={song.vocal} singer={song.singer} />}
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
              {placeText && (
                <p className="now-place" data-testid="now-place">
                  {placeText}
                  {thenText ? ` · ${t("now.place_then", { what: thenText })}` : ""}
                </p>
              )}
              {nextItem && nextEntity && (
                <div className="now-upnext" data-testid="now-upnext">
                  <span className="now-upnext-art">
                    <Artwork entity={nextEntity} orchestra={nextItem.artist} size={44} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-caption1 block text-[var(--label-2)]">{t("now.up_next")}</span>
                    <span className="block truncate" lang="es">
                      {nextItem.title}
                    </span>
                    <span className="text-footnote block truncate text-[var(--label-2)]" lang="es">
                      {nextItem.artist}
                    </span>
                  </span>
                </div>
              )}
            </section>
            <section className="now-right">
              <div className="now-tabs" role="tablist" aria-label={t("song.now_playing")}>
                {TABS.map((x) => (
                  <button
                    key={x}
                    type="button"
                    role="tab"
                    id={`now-tab-${x}`}
                    aria-selected={tab === x}
                    aria-controls={`now-panel-${x}`}
                    className="now-tab"
                    onClick={() => setTab(x)}
                    data-testid={`now-tab-${x}`}
                  >
                    {t(`now.tab_${x}`)}
                  </button>
                ))}
              </div>
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
                  </>
                )}
              </Panel>
              <Panel id="about" tab={tab}>
                {song && <SongDetails song={song} header={false} />}
              </Panel>
            </section>
          </div>
        )}
      </div>
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
