"use client";
import {
  Cake,
  Coffee,
  Ellipsis,
  Pause,
  Play,
  SkipForward,
  SlidersHorizontal,
  Square,
  VolumeX,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useBooth } from "@/lib/booth/store";
import { haptic } from "@/lib/haptics";
import { useMediaQuery } from "@/lib/hooks";
import { Fader } from "./Fader";

/** Press-and-hold time for the emergency stop (button and the esc key). */
export const STOP_HOLD_MS = 600;

/**
 * Control strip (round7-booth.md §1.1): the only glass surface of the page, 64 px tall, every control ≥ 44 px.
 * Start the night → Hold / Play, Next at gap, Stop (press-and-hold 600 ms), the cortina fader and the master fader
 * (horizontal, inside the 64 px row: round 18 — the vertical faders' knobs stuck out of the capsule), Birthday vals, Break, the overflow. Phones (round8-ux.md §1.5): one row of five, the
 * two faders behind a Levels button.
 */
export function ControlStrip({
  onMore,
  onBreak,
  onLevels,
}: {
  onMore: () => void;
  onBreak: () => void;
  onLevels: () => void;
}) {
  const state = useBooth((s) => s.state);
  const started = useBooth((s) => s.started);
  const holding = useBooth((s) => s.holding);
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
  const [holdPct, setHoldPct] = useState(0);
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);
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

  const beginStop = () => {
    const t0 = Date.now();
    holdTimer.current = setInterval(() => {
      const p = Math.min(1, (Date.now() - t0) / STOP_HOLD_MS);
      setHoldPct(p);
      if (p >= 1) {
        endStop();
        haptic(12);
        act.stop();
      }
    }, 30);
  };
  const endStop = () => {
    if (holdTimer.current) clearInterval(holdTimer.current);
    holdTimer.current = null;
    setHoldPct(0);
  };

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
  ) : live && !holding ? (
    <button
      type="button"
      className="btn btn-ghost min-h-11 px-4"
      onClick={() => act.hold()}
      data-testid="booth-hold"
      aria-label="Hold after this song"
    >
      <Pause size={18} fill="currentColor" strokeWidth={0} aria-hidden /> Hold
    </button>
  ) : (
    <button
      type="button"
      className="btn btn-primary min-h-11 px-4"
      onClick={() => void act.play()}
      data-testid="booth-play"
      aria-label={live && holding && breakUntil === null ? "Cancel hold" : "Play"}
    >
      <Play size={18} fill="currentColor" strokeWidth={0} aria-hidden />{" "}
      {/* while a hold is pending the DJ looks for the thing that cancels it (round8-ux.md §2 Booth) */}
      {breakUntil !== null ? "End break" : live && holding ? "Cancel hold" : "Play"}
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
        aria-label="Stop (press and hold)"
        title="Press and hold 600 ms: everything fades out in 1 s"
        disabled={!started || state === "stopped"}
        onPointerDown={beginStop}
        onPointerUp={endStop}
        onPointerLeave={endStop}
        onPointerCancel={endStop}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!holdTimer.current) beginStop();
          }
        }}
        onKeyUp={endStop}
        style={{ ["--hold" as string]: `${holdPct * 100}%` }}
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
      ) : (
        <button
          type="button"
          className="icon-btn"
          aria-label="Levels"
          title="Cortina and master faders"
          onClick={onLevels}
          data-testid="booth-levels"
        >
          <SlidersHorizontal size={20} strokeWidth={2} aria-hidden />
        </button>
      )}
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
