"use client";
import { Cake, Coffee, Ellipsis, Pause, Play, SkipForward, Square, VolumeX } from "lucide-react";
import { useRef, useState } from "react";
import { useBooth } from "@/lib/booth/store";
import { haptic } from "@/lib/haptics";
import { useMediaQuery } from "@/lib/hooks";
import { Fader } from "./Fader";

/** Press-and-hold time for the emergency stop (button and the esc key). */
export const STOP_HOLD_MS = 600;

/**
 * Control strip (round7-booth.md §1.1): the only glass surface of the page, 64 px tall, every control ≥ 44 px.
 * Start the night → Hold / Play, Next at gap, Stop (press-and-hold 600 ms), the cortina fader (vertical on
 * desktop), the master fader, Birthday vals, Break, the overflow.
 */
export function ControlStrip({ onMore, onBreak }: { onMore: () => void; onBreak: () => void }) {
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
  const wide = useMediaQuery("(min-width: 640px)");
  const [holdPct, setHoldPct] = useState(0);
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const live = state === "playing" || state === "cortina";
  const missing = plan
    ? sources.filter((s, i) => s === "missing" && plan.items[i]!.kind !== "break").length
    : 0;

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
      className="btn btn-primary min-h-11 px-4"
      onClick={() => {
        haptic(8);
        void act.start();
      }}
      disabled={!ready}
      data-testid="booth-start"
    >
      <Play size={18} fill="currentColor" strokeWidth={0} aria-hidden />
      {rehearsal
        ? "Start · rehearsal (30 s clips)"
        : missing
          ? `Start · ${missing} without source`
          : "Start the night"}
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
      aria-label="Play"
    >
      <Play size={18} fill="currentColor" strokeWidth={0} aria-hidden />{" "}
      {breakUntil !== null ? "End break" : live && holding ? "Keep going" : "Play"}
    </button>
  );

  return (
    <div className="booth-strip glass" data-testid="booth-strip" role="toolbar" aria-label="Transport">
      {primary}
      <button
        type="button"
        className="icon-btn"
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
        className="icon-btn booth-stop"
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
      <Fader
        label="Cortina"
        value={cortinaFader}
        min={0}
        max={1}
        step={0.05}
        onChange={act.setCortinaFader}
        vertical={wide}
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
        vertical={wide}
        display={`${master > 0 ? "+" : ""}${master} dB`}
        testId="booth-master"
      />
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
