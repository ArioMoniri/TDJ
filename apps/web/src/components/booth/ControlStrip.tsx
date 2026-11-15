"use client";
import {
  Blend,
  Ellipsis,
  Hand,
  Headphones,
  ListMusic,
  Mic,
  Pause,
  Play,
  SkipForward,
  SlidersHorizontal,
  Square,
  TrendingDown,
  VolumeX,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { durationLabel } from "@/lib/booth/plan";
import { useBooth } from "@/lib/booth/store";
import { haptic } from "@/lib/haptics";
import { useMediaQuery } from "@/lib/hooks";
import { t as tx } from "@/lib/i18n";
import { Artwork } from "../ui/Artwork";
import { useTip } from "../ui/Tip";
import { Fader } from "./Fader";

/**
 * Transport (round 22, the DJ-app bottom bar): the only glass surface of the page, one fixed place for now playing
 * and every control on the playing song, in labelled zones — the song (artwork, title), the mix actions (Fade,
 * Crossfade), the transport (Play / Pause, Next at gap, Stop), the room (volume, mute), the modes (Hold, Talk),
 * then the pre-listen line in the headphones colour while one plays, and Mix / ••• for settings. Labels under the
 * glyphs from 1180 px; below that the same words are the tooltip and the accessible name. Phones: one 64 pt row
 * (Play, Next, Stop, Set list, Mix, •••).
 */
export function ControlStrip({
  onMore,
  onLevels,
  onStop,
  onSet,
}: {
  onMore: () => void;
  /** the Mix sheet (transitions, fades, cortinas, levels) */
  onLevels: () => void;
  /** the Stop confirm */
  onStop: () => void;
  /** phones: the set list sheet */
  onSet?: () => void;
}) {
  const state = useBooth((s) => s.state);
  const started = useBooth((s) => s.started);
  const holding = useBooth((s) => s.holding);
  const paused = useBooth((s) => s.paused);
  const ready = useBooth((s) => s.ready);
  const master = useBooth((s) => s.master);
  const muted = useBooth((s) => s.muted);
  const ducked = useBooth((s) => s.ducked);
  const breakUntil = useBooth((s) => s.breakUntil);
  const sources = useBooth((s) => s.sources);
  const plan = useBooth((s) => s.plan);
  const rehearsal = useBooth((s) => s.rehearsal);
  const settings = useBooth((s) => s.settings);
  const audition = useBooth((s) => s.audition);
  const cuePos = useBooth((s) => s.cuePos);
  const nowItem = useBooth((s) => s.plan?.items[s.planIndex]);
  const nowEntity = useBooth((s) => s.entities[s.planIndex] ?? null);
  const act = useBooth.getState();
  const wide = useMediaQuery("(min-width: 600px)", true);
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
      data-hint={tx("booth.controlStrip.start_the_night_in_the_room")}
    >
      <Play size={18} fill="currentColor" strokeWidth={0} aria-hidden />
      {/* the label names the source (round8-ux.md §3) and fits a 390 px phone (round 18) */}
      <span className="booth-start-label">
        {rehearsal
          ? tx("booth.controlStrip.start_30_s_clips")
          : allSpotify
            ? tx("booth.controlStrip.start_spotify")
            : tx("booth.controlStrip.start_your_files")}
        {!rehearsal && !allSpotify && missing > 0 && (
          <span className="booth-start-extra"> {tx("booth.controlStrip.without_source", { missing })}</span>
        )}
      </span>
    </button>
  ) : breakUntil !== null ? (
    <button
      type="button"
      className="btn btn-primary min-h-11 px-4"
      onClick={() => void act.endBreak()}
      data-testid="booth-play"
      aria-label={tx("booth.controlStrip.end_break")}
      data-hint={tx("booth.controlStrip.end_the_break_now_space")}
    >
      <Play size={18} fill="currentColor" strokeWidth={0} aria-hidden /> {tx("booth.controlStrip.end_break")}
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
      aria-label={tx("booth.controlStrip.pause")}
      data-hint={tx("booth.controlStrip.pause_now_with_a_s_fade", { pauseFadeSec: settings.pauseFadeSec })}
    >
      <Pause size={18} fill="currentColor" strokeWidth={0} aria-hidden /> {tx("booth.controlStrip.pause")}
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
      aria-label={paused ? tx("booth.controlStrip.resume") : tx("booth.controlStrip.play")}
      data-hint={
        paused ? tx("booth.controlStrip.resume_where_it_paused_space") : tx("booth.controlStrip.play_space")
      }
    >
      <Play size={18} fill="currentColor" strokeWidth={0} aria-hidden />{" "}
      {paused ? tx("booth.controlStrip.resume") : tx("booth.controlStrip.play")}
    </button>
  );

  return (
    <div
      ref={stripRef}
      className="booth-strip glass"
      data-testid="booth-strip"
      role="toolbar"
      aria-label={tx("booth.controlStrip.transport")}
      data-started={started}
    >
      {/* the song: always the same place (Spotify / Apple Music bottom bar) */}
      {nowItem && (
        <div className="booth-strip-now" data-testid="booth-strip-now">
          <Artwork
            entity={nowEntity}
            orchestra={(nowEntity as { orchestra?: string } | null)?.orchestra ?? nowItem.artist}
            size={40}
          />
          <span className="booth-strip-now-t">
            <b>{nowItem.title}</b>
            <span>{nowItem.artist}</span>
          </span>
        </div>
      )}
      {wide && (
        <>
          <TBtn
            label={tx("booth.controlStrip.fade")}
            hint={tx("booth.controlStrip.fade_out_now_over_s_the", { fadeNowSec: settings.fadeNowSec })}
            disabled={!live}
            onClick={() => act.fadeOutNow()}
            testId="booth-strip-fade"
            className="booth-wide-only"
          >
            <TrendingDown size={20} strokeWidth={2} aria-hidden />
          </TBtn>
          <TBtn
            label={tx("booth.controlStrip.crossfade")}
            hint={tx("booth.controlStrip.the_next_item_starts_now_while", {
              crossfadeSec: settings.crossfadeSec,
            })}
            disabled={!live}
            onClick={() => void act.crossfadeNext()}
            testId="booth-strip-crossfade"
            className="booth-wide-only"
          >
            <Blend size={20} strokeWidth={2} aria-hidden />
          </TBtn>
          <span className="booth-strip-sep" aria-hidden />
        </>
      )}
      {primary}
      <TBtn
        label={tx("booth.controlStrip.next_at_gap")}
        hint={tx("booth.controlStrip.the_queued_item_is_skipped_at")}
        onClick={() => act.next()}
        disabled={!started}
        testId="booth-next-btn"
        className="booth-prestart-hide"
      >
        <SkipForward size={20} strokeWidth={2} aria-hidden />
      </TBtn>
      <button
        type="button"
        className={`icon-btn booth-stop booth-prestart-hide ${started && state !== "stopped" ? "booth-stop-armed" : ""}`}
        aria-label={tx("booth.controlStrip.stop_2")}
        aria-haspopup="dialog"
        data-hint={tx("booth.controlStrip.stop_fade_out_and_stop_or")}
        disabled={!started || state === "stopped"}
        onClick={() => {
          haptic(10);
          onStop();
        }}
        data-testid="booth-stop"
      >
        <Square size={18} fill="currentColor" strokeWidth={0} aria-hidden />
        <span className="booth-stop-label">{tx("booth.controlStrip.stop")}</span>
      </button>
      {wide && (
        <>
          <span className="booth-strip-sep" aria-hidden />
          <Fader
            label={tx("booth.controlStrip.master_volume")}
            hint={tx("booth.controlStrip.the_whole_output_to_the_room")}
            value={master}
            min={-30}
            max={6}
            step={1}
            onChange={act.setMaster}
            display={tx("booth.controlStrip.db", { p1: master > 0 ? "+" : "", master })}
            testId="booth-master"
          />
          <TBtn
            label={muted ? tx("booth.controlStrip.unmute") : tx("booth.controlStrip.mute")}
            hint={tx("booth.controlStrip.silence_the_room_at_once_tap")}
            pressed={muted}
            onClick={() => act.toggleMute()}
            testId="booth-mute"
          >
            <VolumeX
              size={20}
              strokeWidth={2}
              aria-hidden
              className={muted ? "text-[var(--destructive)]" : ""}
            />
          </TBtn>
          <span className="booth-strip-sep" aria-hidden />
          <TBtn
            label={tx("booth.controlStrip.hold")}
            ariaLabel={
              holding ? tx("booth.controlStrip.cancel_hold") : tx("booth.controlStrip.hold_after_this_song")
            }
            hint={tx("booth.controlStrip.hold_after_this_song_it_finishes")}
            pressed={holding}
            onClick={() => act.toggleHold()}
            disabled={!started || !live}
            testId="booth-hold"
          >
            <Hand size={20} strokeWidth={2} aria-hidden />
          </TBtn>
          <TBtn
            label={tx("booth.controlStrip.talk")}
            ariaLabel={tx("booth.controlStrip.talk_over")}
            hint={tx("booth.controlStrip.talk_over_the_music_dips_12")}
            pressed={ducked}
            onClick={() => act.setDucked(!ducked)}
            testId="booth-talk"
          >
            <Mic size={20} strokeWidth={2} aria-hidden />
          </TBtn>
        </>
      )}
      {audition && (
        <div className="booth-cueline" data-testid="booth-cueline" data-where={audition.where} role="status">
          <Headphones size={16} strokeWidth={2} aria-hidden />
          <span>
            {audition.where === "headphones"
              ? tx("booth.controlStrip.headphones")
              : tx("booth.controlStrip.this_device")}{" "}
            · {audition.title}
            {cuePos.of ? ` · ${durationLabel(cuePos.at)} / ${durationLabel(cuePos.of)}` : ""}
          </span>
          <button
            type="button"
            className="icon-btn icon-btn-bare h-11 w-11"
            aria-label={tx("booth.controlStrip.stop_the_pre_listen")}
            data-hint={tx("booth.controlStrip.stop_the_pre_listen_the_room")}
            onClick={() => act.stopAudition()}
            data-testid="booth-cueline-stop"
          >
            <Square size={14} fill="currentColor" strokeWidth={0} aria-hidden />
          </button>
        </div>
      )}
      {onSet && (
        <TBtn
          label={tx("booth.controlStrip.set_list")}
          hint={tx("booth.controlStrip.the_night_s_set_list")}
          onClick={onSet}
          testId="booth-set-open"
          className="booth-phone-only"
        >
          <ListMusic size={20} strokeWidth={2} aria-hidden />
        </TBtn>
      )}
      {/* the Mix sheet: transitions, fades, cortinas, levels — every value with its explanation */}
      <TBtn
        label={tx("booth.controlStrip.mix")}
        ariaLabel={tx("booth.controlStrip.mix_levels_and_fades")}
        hint={tx("booth.controlStrip.transitions_fades_cortina_length_and_levels")}
        onClick={onLevels}
        testId={wide ? "booth-mix" : "booth-levels"}
      >
        <SlidersHorizontal size={20} strokeWidth={2} aria-hidden />
      </TBtn>
      <TBtn
        label={tx("booth.controlStrip.more")}
        ariaLabel={tx("booth.controlStrip.more")}
        hint={tx("booth.controlStrip.set_up_rehearsal_keyboard_theme_leave")}
        onClick={onMore}
        testId="booth-more"
      >
        <Ellipsis size={20} strokeWidth={2} aria-hidden />
      </TBtn>
    </div>
  );
}

/** A transport button: the glyph, the word under it where there is room, the explanation on hover / long-press. */
function TBtn({
  label,
  ariaLabel,
  hint,
  onClick,
  disabled,
  pressed,
  testId,
  className = "",
  children,
}: {
  label: string;
  ariaLabel?: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  testId: string;
  className?: string;
  children: React.ReactNode;
}) {
  // wave 2: the shared help tag (hover with a mouse or an iPad trackpad, long-press, keyboard focus) says what the
  // control does; the word under the glyph shows from 820 px, and the accessible name never depends on either
  const tip = useTip<HTMLButtonElement>(hint);
  return (
    <>
      <button
        type="button"
        className={`booth-tbtn ${className}`}
        aria-label={ariaLabel ?? label}
        aria-pressed={pressed === undefined ? undefined : pressed}
        onClick={onClick}
        disabled={disabled}
        data-testid={testId}
        {...tip.props}
      >
        {children}
        <span className="booth-tbtn-l" aria-hidden>
          {label}
        </span>
      </button>
      {tip.tag}
    </>
  );
}
