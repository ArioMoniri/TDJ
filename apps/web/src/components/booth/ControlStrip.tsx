"use client";
import {
  Cake,
  Coffee,
  Ellipsis,
  Hand,
  Pause,
  Play,
  SkipForward,
  SlidersHorizontal,
  Square,
  VolumeX,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { useBooth } from "@/lib/booth/store";
import { haptic } from "@/lib/haptics";
import { useMediaQuery } from "@/lib/hooks";
import { Fader } from "./Fader";

/**
 * Control strip (round7-booth.md §1.1, round20-booth.md): the only glass surface of the page, 64 px tall, every
 * control ≥ 44 px. Start the night → **Pause / Resume** (one tap, a 0.8 s fade, space), Next at gap, **Stop** (one
 * tap opens the confirm: "Fade out and stop" / "Stop now"; esc), the cortina and master faders, **Mix** (fades,
 * hold after this song, talk-over, the night's fade settings), Hold after this song, Birthday vals, Break, the
 * overflow. Phones (round8-ux.md §1.5): one row of five (Pause, Next, Stop, Mix, •••).
 */
export function ControlStrip({
  onMore,
  onBreak,
  onLevels,
  onStop,
}: {
  onMore: () => void;
  onBreak: () => void;
  /** the Mix sheet (levels, fades, hold, talk-over) */
  onLevels: () => void;
  /** the Stop confirm */
  onStop: () => void;
}) {
  const state = useBooth((s) => s.state);
  const started = useBooth((s) => s.started);
  const holding = useBooth((s) => s.holding);
  const paused = useBooth((s) => s.paused);
  const ready = useBooth((s) => s.ready);
  const cortinaFader = useBooth((s) => s.cortinaFader);
  const master = useBooth((s) => s.master);
  const muted = useBooth((s) => s.muted);
  const breakUntil = useBooth((s) => s.breakUntil);
  const sources = useBooth((s) => s.sources);
  const plan = useBooth((s) => s.plan);
  const rehearsal = useBooth((s) => s.rehearsal);
  const act = useBooth.getState();
  const wide = useMediaQuery("(min-width: 640px)", true);
  const sourceMode = useBooth((s) => s.sourceMode);
  const stripRef = useRef<HTMLDivElement>(null);
  // the page's bottom padding follows the strip (round 18): the space it takes from the viewport's foot (its height,
  // its offset over the tab bar, the safe area), so the last row of the set always scrolls clear of it
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measured when a night starts (the strip moves down)
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const root = document.documentElement;
    const measure = () => {
      const top = el.getBoundingClientRect().top;
      root.style.setProperty("--booth-strip-space", `${Math.max(0, Math.ceil(window.innerHeight - top))}px`);
    };
    measure();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    // the strip moves down when the tab bar leaves (a night runs): measure after its transition too
    el.addEventListener("transitionend", measure);
    const t = setTimeout(measure, 400);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
      el.removeEventListener("transitionend", measure);
      clearTimeout(t);
      root.style.removeProperty("--booth-strip-space");
    };
  }, [started]);
  const live = state === "playing" || state === "cortina";
  const missing = plan
    ? sources.filter((s, i) => s === "missing" && !!plan.items[i] && plan.items[i].kind !== "break").length
    : 0;
  // Spotify mode, or no file plays tonight and Premium plays the songs: the label says Spotify
  const allSpotify =
    sourceMode === "spotify" ||
    (sources.includes("spotify") &&
      !sources.some((s, i) => s === "file" && plan?.items[i]?.kind !== "break"));

  const primary = !started ? (
    <button
      type="button"
      className="btn btn-primary booth-primary min-h-11 px-4"
      onClick={() => {
        haptic(8);
        void act.start();
      }}
      disabled={!ready}
      data-testid="booth-start"
    >
      <Play size={18} fill="currentColor" strokeWidth={0} aria-hidden />
      {/* the label names the source (round8-ux.md §3) and fits a 390 px phone (round 18): the count of items
          without a source is the Now card's / the set's business, and only joins the label where there is room */}
      <span className="booth-start-label">
        {rehearsal ? "Start · 30 s clips" : allSpotify ? "Start · Spotify" : "Start · your files"}
        {!rehearsal && !allSpotify && missing > 0 && (
          <span className="booth-start-extra"> · {missing} without source</span>
        )}
      </span>
    </button>
  ) : breakUntil !== null ? (
    <button
      type="button"
      className="btn btn-primary min-h-11 px-4"
      onClick={() => void act.endBreak()}
      data-testid="booth-play"
      aria-label="End break"
      title="End the break now (space)"
    >
      <Play size={18} fill="currentColor" strokeWidth={0} aria-hidden /> End break
    </button>
  ) : live ? (
    <button
      type="button"
      className="btn btn-ghost booth-primary min-h-11 px-4"
      onClick={() => {
        haptic(8);
        act.pause();
      }}
      data-testid="booth-pause"
      aria-label="Pause"
      title="Pause now, with a short fade (space)"
    >
      <Pause size={18} fill="currentColor" strokeWidth={0} aria-hidden /> Pause
    </button>
  ) : (
    <button
      type="button"
      className="btn btn-primary booth-primary min-h-11 px-4"
      onClick={() => {
        haptic(8);
        void act.play();
      }}
      data-testid="booth-play"
      aria-label={paused ? "Resume" : "Play"}
      title={paused ? "Resume where it paused (space)" : "Play (space)"}
    >
      <Play size={18} fill="currentColor" strokeWidth={0} aria-hidden /> {paused ? "Resume" : "Play"}
    </button>
  );

  return (
    <div
      ref={stripRef}
      className="booth-strip glass"
      data-testid="booth-strip"
      role="toolbar"
      aria-label="Transport"
      data-started={started}
    >
      {primary}
      <button
        type="button"
        className="icon-btn booth-prestart-hide"
        aria-label="Next at gap"
        title="The queued item is skipped at the next gap (→)"
        onClick={() => act.next()}
        disabled={!started}
        data-testid="booth-next-btn"
      >
        <SkipForward size={20} strokeWidth={2} aria-hidden />
      </button>
      <button
        type="button"
        className={`icon-btn booth-stop booth-prestart-hide ${started && state !== "stopped" ? "booth-stop-armed" : ""}`}
        aria-label="Stop…"
        aria-haspopup="dialog"
        title="Stop: fade out and stop, or stop now (esc)"
        disabled={!started || state === "stopped"}
        onClick={() => {
          haptic(10);
          onStop();
        }}
        data-testid="booth-stop"
      >
        <Square size={18} fill="currentColor" strokeWidth={0} aria-hidden />
      </button>
      {wide ? (
        <>
          <Fader
            label="Cortina"
            value={cortinaFader}
            min={0}
            max={1}
            step={0.05}
            onChange={act.setCortinaFader}
            display={`${Math.round(cortinaFader * 100)} %`}
            testId="booth-cortina-fader"
          />
          <Fader
            label="Master"
            value={master}
            min={-30}
            max={6}
            step={1}
            onChange={act.setMaster}
            display={`${master > 0 ? "+" : ""}${master} dB`}
            testId="booth-master"
          />
        </>
      ) : null}
      {/* the Mix sheet: levels on a phone, and everywhere the fades, hold after this song and talk-over */}
      <button
        type="button"
        className="icon-btn"
        aria-label="Mix: levels and fades"
        title="Fade out now (f), next with crossfade (x), hold (h), talk-over (t), levels, fade lengths"
        onClick={onLevels}
        data-testid={wide ? "booth-mix" : "booth-levels"}
      >
        <SlidersHorizontal size={20} strokeWidth={2} aria-hidden />
      </button>
      <button
        type="button"
        className={`icon-btn booth-secondary ${holding ? "text-[var(--tint)]" : ""}`}
        aria-label={holding ? "Cancel hold" : "Hold after this song"}
        aria-pressed={holding}
        title="Hold after this song: the song finishes, the next does not start (h)"
        onClick={() => act.toggleHold()}
        disabled={!started || !live}
        data-testid="booth-hold"
      >
        <Hand size={20} strokeWidth={2} aria-hidden />
      </button>
      <button
        type="button"
        className={`icon-btn booth-secondary ${muted ? "text-[var(--destructive)]" : ""}`}
        aria-label={muted ? "Unmute" : "Mute"}
        aria-pressed={muted}
        onClick={() => act.toggleMute()}
        data-testid="booth-mute"
      >
        <VolumeX size={20} strokeWidth={2} aria-hidden />
      </button>
      <button
        type="button"
        className="icon-btn booth-secondary"
        aria-label="Birthday vals"
        title="Birthday vals (b)"
        onClick={() => act.birthdayVals()}
        disabled={!started}
        data-testid="booth-birthday"
      >
        <Cake size={20} strokeWidth={2} aria-hidden />
      </button>
      <button
        type="button"
        className="icon-btn booth-secondary"
        aria-label="Break"
        title="Break after this song"
        onClick={onBreak}
        disabled={!started}
        data-testid="booth-break-btn"
      >
        <Coffee size={20} strokeWidth={2} aria-hidden />
      </button>
      <button type="button" className="icon-btn" aria-label="More" onClick={onMore} data-testid="booth-more">
        <Ellipsis size={20} strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}
