"use client";
import {
  Blend,
  ChevronDown,
  ChevronUp,
  Ellipsis,
  Hand,
  Headphones,
  ListMusic,
  Mic,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Square,
  StepForward,
  TrendingDown,
  VolumeX,
} from "lucide-react";
import {
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { disarm, useArmed } from "@/lib/booth/confirm";
import { sayOpeningSkipped } from "@/lib/booth/nightView";
import { durationLabel } from "@/lib/booth/plan";
import { useBooth, useRoomCaps } from "@/lib/booth/store";
import { haptic } from "@/lib/haptics";
import { useMediaQuery } from "@/lib/hooks";
import { fmtNumber, t as tx } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { Artwork } from "../ui/Artwork";
import { FitText } from "../ui/FitText";
import { Marquee } from "../ui/Marquee";
import { useTip } from "../ui/Tip";
import { ConfirmHint, ConfirmRing, useHoldConfirm } from "./Confirm";
import { FadeButton } from "./FadeButton";
import { Fader } from "./Fader";
import { useNowView } from "./NowPlayingView";

/**
 * Transport (round 22, the DJ-app bottom bar; 2026-11 one uniform row): the only control bar at the foot of the page,
 * aligned with the content column. Every secondary control is the same cell (glyph over its word, ≥ 44 px), the
 * primary Start / Pause / Play keeps one fixed width in every state. Zones: the mix actions (Fade, Crossfade), the
 * transport (Previous, Play / Pause, Next, Next at gap, Stop), the room (volume from 1400 px, Mute), the modes (Hold,
 * Talk), then Controls (the panel's toggle: the panel opens above this row), Mix and •••. Mid-night, Previous, Next,
 * Fade and Crossfade are press-and-hold (Confirm.tsx). Phones: one row (Previous, Play, Next, Stop, Set list,
 * Controls, •••; Mix is in •••).
 */
export function ControlStrip({
  onMore,
  onLevels,
  onStop,
  onSet,
  controlsOpen,
  onControls,
}: {
  onMore: () => void;
  /** the Mix sheet (transitions, fades, cortinas, levels) */
  onLevels: () => void;
  /** the Stop confirm */
  onStop: () => void;
  /** phones: the set list sheet */
  onSet?: () => void;
  /** the Controls panel (it docks above this row) */
  controlsOpen: boolean;
  onControls: () => void;
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
  const mutePaused = useBooth((s) => s.mutePaused);
  // 2026-11: what the room's device can do (Spotify Connect: no fades; the iOS Spotify app: no volume either)
  const caps = useRoomCaps();
  const act = useBooth.getState();
  const wide = useMediaQuery("(min-width: 600px)", true);
  // QA 2026-11: Space armed mid-night (lib/booth/confirm.ts roomCut): the Pause button shows it, as Next does
  const pauseArmed = useArmed("pause");
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

  // 2026-11 (design review): the primary keeps one width in every state, wide enough for its longest word in this
  // language — Start · 30 s clips / Başlat · 30 sn'lik klipler, Pause, Resume, End break — measured, never cut. The
  // "· n without source" tail joins it only when the whole label still fits in 40 % of the row.
  const startLabel = rehearsal
    ? tx("booth.controlStrip.start_30_s_clips")
    : allSpotify
      ? tx("booth.controlStrip.start_spotify")
      : tx("booth.controlStrip.start_your_files");
  const extra =
    !rehearsal && !allSpotify && missing > 0
      ? ` ${tx("booth.controlStrip.without_source", { missing })}`
      : "";
  const words = [
    startLabel,
    tx("booth.controlStrip.end_break"),
    tx("booth.controlStrip.pause"),
    tx("booth.controlStrip.play"),
    tx("booth.controlStrip.resume"),
  ];
  const measure = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState<{ w: number; extra: boolean } | null>(null);
  const wordsKey = `${words.join("|")}|${extra}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measured when any of the words changes (wordsKey)
  useLayoutEffect(() => {
    const m = measure.current;
    const strip = stripRef.current;
    if (!m || !strip) return;
    const read = () => {
      const spans = [...m.children] as HTMLElement[];
      if (!spans.length) return;
      const ws = spans.map((x) => x.getBoundingClientRect().width);
      const withExtra = ws[ws.length - 1]!;
      const longest = Math.max(...ws.slice(0, -1));
      // the glyph (18), its gap (6), the padding (2 × 12) and a pixel of rounding
      const chrome = 18 + 6 + 24 + 2;
      const cap = strip.getBoundingClientRect().width * 0.4;
      const useExtra = !!extra && withExtra + chrome <= cap;
      const w = Math.ceil(Math.max(longest, useExtra ? withExtra : 0) + chrome);
      setFit((f) => (f && f.w === w && f.extra === useExtra ? f : { w, extra: useExtra }));
    };
    read();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(read) : null;
    ro?.observe(m);
    ro?.observe(strip);
    void document.fonts?.ready.then(read);
    return () => ro?.disconnect();
  }, [wordsKey]);
  const primaryStyle = wide && fit ? ({ "--primary-w": `${fit.w}px` } as CSSProperties) : undefined;
  const primary = !started ? (
    <button
      type="button"
      className="btn btn-primary booth-primary"
      onClick={() => {
        haptic(8);
        // QA 2026-11: Rehearsal passes over an opening La Cumparsita with no clip — said once, never silently
        const b = useBooth.getState();
        if (b.plan && sayOpeningSkipped(b.plan.items, b.sources, b.rehearsal, b.planIndex))
          toast(tx("booth.qa.opening_rehearsal"));
        void act.start();
      }}
      disabled={!ready}
      style={primaryStyle}
      data-testid="booth-start"
      data-hint={tx("booth.controlStrip.start_the_night_in_the_room")}
    >
      <Play size={18} fill="currentColor" strokeWidth={0} aria-hidden />
      {/* the label names the source (round8-ux.md §3) and fits a 390 px phone (round 18) */}
      <span className="booth-start-label">
        <FitText text={`${startLabel}${extra && (!wide || fit?.extra) ? extra : ""}`}>
          {startLabel}
          {extra && (!wide || fit?.extra) && <span className="booth-start-extra">{extra}</span>}
        </FitText>
      </span>
    </button>
  ) : breakUntil !== null ? (
    <button
      type="button"
      className="btn btn-primary booth-primary"
      onClick={() => void act.endBreak()}
      data-testid="booth-play"
      style={primaryStyle}
      aria-label={tx("booth.controlStrip.end_break")}
      data-hint={tx("booth.controlStrip.end_the_break_now_space")}
    >
      <Play size={18} fill="currentColor" strokeWidth={0} aria-hidden />
      <span className="booth-start-label">{tx("booth.controlStrip.end_break")}</span>
    </button>
  ) : live ? (
    <button
      type="button"
      className="btn btn-ghost booth-primary confirm-host"
      data-tone="pause"
      data-armed={pauseArmed || undefined}
      style={primaryStyle}
      onClick={() => {
        haptic(8);
        disarm();
        act.pause();
      }}
      data-testid="booth-pause"
      aria-label={tx("booth.controlStrip.pause")}
      data-hint={
        caps.fade
          ? tx("booth.controlStrip.pause_now_with_a_s_fade", {
              pauseFadeSec: fmtNumber(settings.pauseFadeSec, { maximumFractionDigits: 1 }),
            })
          : tx("booth.connect.pause_hint")
      }
    >
      <Pause size={18} fill="currentColor" strokeWidth={0} aria-hidden />
      <span className="booth-start-label">{tx("booth.controlStrip.pause")}</span>
      {pauseArmed && (
        <>
          <ConfirmRing />
          <ConfirmHint testId="booth-pause-nudge" />
        </>
      )}
    </button>
  ) : (
    <button
      type="button"
      className="btn btn-primary booth-primary"
      onClick={() => {
        haptic(8);
        void act.play();
      }}
      data-testid="booth-play"
      style={primaryStyle}
      aria-label={paused ? tx("booth.controlStrip.resume") : tx("booth.controlStrip.play")}
      data-hint={
        paused ? tx("booth.controlStrip.resume_where_it_paused_space") : tx("booth.controlStrip.play_space")
      }
    >
      <Play size={18} fill="currentColor" strokeWidth={0} aria-hidden />
      <span className="booth-start-label">
        {paused ? tx("booth.controlStrip.resume") : tx("booth.controlStrip.play")}
      </span>
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
      {/* the song: always the same place (Spotify / Apple Music bottom bar), on wide screens */}
      {nowItem &&
        (wide ? (
          <div className="booth-strip-now" data-testid="booth-strip-now">
            <Artwork
              entity={nowEntity}
              orchestra={(nowEntity as { orchestra?: string } | null)?.orchestra ?? nowItem.artist}
              size={40}
            />
            <span className="booth-strip-now-t">
              {/* 2026-11: a long title slides to show all of it (components/ui/Marquee.tsx) */}
              <Marquee text={nowItem.title} testId="booth-strip-title">
                <b>{nowItem.title}</b>
              </Marquee>
              <span>{nowItem.artist}</span>
            </span>
          </div>
        ) : (
          // 2026-11 (the owner: "better design for the lower bar on the phone"): the mini control bar of a music app —
          // the cover and the title (sliding when long) lead; a tap opens Now playing full screen
          <button
            type="button"
            className="booth-strip-now booth-strip-now-phone booth-prestart-hide"
            data-testid="booth-strip-now"
            onClick={() => useNowView.getState().set(true)}
            aria-label={`${tx("song.now_playing")}: ${nowItem.title}`}
          >
            <Artwork
              entity={nowEntity}
              orchestra={(nowEntity as { orchestra?: string } | null)?.orchestra ?? nowItem.artist}
              size={40}
            />
            <span className="booth-strip-now-t" aria-hidden>
              <Marquee text={nowItem.title} testId="booth-strip-title">
                <b>{nowItem.title}</b>
              </Marquee>
              <span>{nowItem.artist}</span>
            </span>
          </button>
        ))}
      {wide && (
        <>
          {/* 2026-11: hold (or tap twice) to run, a countdown and Cancel while it runs, ⌘Z after (FadeButton.tsx) */}
          <FadeButton
            kind="fade"
            label={tx("booth.controlStrip.fade")}
            short={tx("booth.controlStrip.fade")}
            hint={tx("booth.controlStrip.fade_out_now_over_s_the", {
              fadeNowSec: fmtNumber(settings.fadeNowSec, { maximumFractionDigits: 1 }),
            })}
            why={caps.fade ? undefined : tx("booth.connect.no_fade_why")}
            live={live}
            onRun={() => act.fadeOutNow()}
            testId="booth-strip-fade"
            className="booth-tbtn booth-wide-only booth-roomy-only"
            wordClass="booth-tbtn-l"
          >
            <TrendingDown size={20} strokeWidth={2} aria-hidden />
          </FadeButton>
          <FadeButton
            kind="crossfade"
            label={tx("booth.controlStrip.crossfade")}
            short={tx("booth.controls.short_crossfade")}
            hint={tx("booth.controlStrip.the_next_item_starts_now_while", {
              crossfadeSec: settings.crossfadeSec,
            })}
            why={caps.fade ? undefined : tx("booth.connect.no_fade_why")}
            live={live}
            onRun={() => void act.crossfadeNext()}
            testId="booth-strip-crossfade"
            className="booth-tbtn booth-wide-only booth-roomy-only"
            wordClass="booth-tbtn-l"
          >
            <Blend size={20} strokeWidth={2} aria-hidden />
          </FadeButton>
          <span className="booth-strip-sep booth-roomy-only" aria-hidden />
        </>
      )}
      {/* 2026-11: one back and one ahead, before and during the night (← / →) */}
      <TBtn
        label={tx("booth.controlStrip.previous")}
        short={tx("booth.controls.short_previous")}
        hint={tx("booth.controlStrip.previous_hint")}
        onClick={() => {
          haptic(8);
          void act.previous();
        }}
        disabled={!ready}
        confirmKey="prev"
        testId="booth-prev"
        className="booth-prestart-hide"
      >
        <SkipBack size={20} strokeWidth={2} aria-hidden />
      </TBtn>
      {primary}
      {/* the primary's words, measured off-screen in its own font (its width: the longest of them) */}
      <span ref={measure} className="booth-primary-measure" aria-hidden>
        {words.map((w) => (
          <span key={w}>{w}</span>
        ))}
        <span>{`${startLabel}${extra}`}</span>
      </span>
      <TBtn
        label={tx("booth.controlStrip.next_now")}
        hint={
          !started
            ? tx("booth.controlStrip.next_now_hint_before")
            : caps.fade
              ? tx("booth.controlStrip.next_now_hint")
              : tx("booth.connect.next_now_hint")
        }
        onClick={() => {
          haptic(8);
          void act.nextNow();
        }}
        disabled={!ready}
        confirmKey="next"
        testId="booth-next-now"
        className="booth-prestart-hide"
      >
        <SkipForward size={20} strokeWidth={2} aria-hidden />
      </TBtn>
      {/* 2026-11: what it does, said plainly ("Next at gap" left out the queued song with one tap): the room's
          song plays to its end and the next one is skipped — it changes what the room hears, so it asks too */}
      <TBtn
        label={tx("booth.controls.short_next_gap")}
        ariaLabel={tx("booth.connect.skip_next_song")}
        hint={tx("booth.connect.skip_next_hint")}
        onClick={() => act.next()}
        disabled={!started}
        confirmKey="skip-next"
        testId="booth-next-btn"
        className="booth-prestart-hide booth-wide-only booth-gap-btn-only"
      >
        <StepForward size={20} strokeWidth={2} aria-hidden />
      </TBtn>
      {/* Stop opens its own confirm (Fade out and stop / Stop now): one tap */}
      <TBtn
        label={tx("booth.controlStrip.stop")}
        ariaLabel={tx("booth.controlStrip.stop_2")}
        hint={tx("booth.controlStrip.stop_fade_out_and_stop_or")}
        // 2026-11 (the owner: "Stop won't work"): before the night a row played in the room (a tap on a row, Spotify
        // on this device) is stopped at once too — Stop is never dead while the room sounds
        disabled={!(started && state !== "stopped") && audition?.where !== "device"}
        onClick={() => {
          haptic(10);
          if (!started && audition?.where === "device") return useBooth.getState().stopAudition();
          onStop();
        }}
        testId="booth-stop"
        className={`booth-stop booth-prestart-hide ${started && state !== "stopped" ? "booth-stop-armed" : ""}`}
        haspopup
      >
        <Square size={18} fill="currentColor" strokeWidth={0} aria-hidden />
      </TBtn>
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
            disabled={!caps.volume}
          />
          <TBtn
            label={
              caps.volume
                ? muted
                  ? tx("booth.controlStrip.unmute")
                  : tx("booth.controlStrip.mute")
                : muted && mutePaused
                  ? tx("booth.connect.unmute_resumes")
                  : tx("booth.connect.mute_pauses_short")
            }
            ariaLabel={
              caps.volume
                ? undefined
                : muted && mutePaused
                  ? tx("booth.connect.unmute_resumes")
                  : tx("booth.connect.mute_pauses")
            }
            hint={
              caps.volume
                ? tx("booth.controlStrip.silence_the_room_at_once_tap")
                : tx("booth.connect.mute_pauses")
            }
            pressed={muted}
            onClick={() => act.toggleMute()}
            armedBy="mute"
            testId="booth-mute"
            className="booth-prio-low"
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
            hint={
              caps.volume
                ? tx("booth.controlStrip.talk_over_the_music_dips_12")
                : tx("booth.connect.talk_unavailable")
            }
            why={caps.volume ? undefined : tx("booth.connect.talk_unavailable")}
            pressed={caps.volume ? ducked : false}
            onClick={() => act.setDucked(!ducked)}
            disabled={!caps.volume}
            testId="booth-talk"
            className="booth-prio-low"
          >
            <Mic size={20} strokeWidth={2} aria-hidden />
          </TBtn>
          <span className="booth-strip-sep" aria-hidden />
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
      {/* (a phone: Set list, Controls and Mix are in •••, the bar keeps the transport) */}
      {onSet && wide && (
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
      {/* 2026-11: the Controls panel's toggle lives in this row (the collapsed panel was a second bar over it) */}
      {wide && (
        <TBtn
          label={tx("booth.controls.title")}
          hint={tx("booth.controls.toggle_hint")}
          short={tx("booth.controls.short_controls")}
          onClick={onControls}
          testId="booth-controls-toggle"
          expanded={controlsOpen}
          controls="booth-ctl-body"
        >
          {controlsOpen ? (
            <ChevronDown size={20} strokeWidth={2} aria-hidden />
          ) : (
            <ChevronUp size={20} strokeWidth={2} aria-hidden />
          )}
        </TBtn>
      )}
      {/* the Mix sheet: transitions, fades, cortinas, levels — every value with its explanation (a phone: in •••) */}
      {wide && (
        <TBtn
          label={tx("booth.controlStrip.mix")}
          ariaLabel={tx("booth.controlStrip.mix_levels_and_fades")}
          hint={tx("booth.controlStrip.transitions_fades_cortina_length_and_levels")}
          onClick={onLevels}
          testId="booth-mix"
        >
          <SlidersHorizontal size={20} strokeWidth={2} aria-hidden />
        </TBtn>
      )}
      <TBtn
        label={tx("booth.controls.short_more")}
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

type Handler = ((e: PointerEvent<HTMLElement>) => void) | undefined;
/** both handlers, in order (the help tag's and the hold's) */
const both =
  (a: Handler, b: Handler) =>
  (e: PointerEvent<HTMLElement>): void => {
    a?.(e);
    b?.(e);
  };

/**
 * A transport button: the glyph, the word under it (from 820 px), the explanation on hover / long-press. Every one is
 * the same cell (booth.css). With `confirmKey`, mid-night it is press-and-hold (Confirm.tsx): a ring fills in 0.6 s.
 */
function TBtn({
  label,
  ariaLabel,
  hint,
  onClick,
  disabled,
  pressed,
  expanded,
  controls,
  haspopup,
  confirmKey,
  armedBy,
  testId,
  className = "",
  why,
  short,
  children,
}: {
  /** QA 2026-11: a key that arms this control from the keyboard (m → Mute): shown armed; a tap runs at once */
  armedBy?: string;
  label: string;
  ariaLabel?: string;
  hint: string;
  /** 2026-11: why it is disabled (read out and shown on hover / long-press) */
  why?: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  expanded?: boolean;
  controls?: string;
  haspopup?: boolean;
  confirmKey?: string;
  testId: string;
  className?: string;
  /** a shorter word for the label, drawn when the whole one does not fit and nothing may move */
  short?: string;
  children: ReactNode;
}) {
  const tip = useTip<HTMLButtonElement>(hint);
  const hold = useHoldConfirm(confirmKey ?? `plain:${testId}`, onClick);
  const keyArmed = useArmed(armedBy ?? "");
  const armedShown = (!!confirmKey && hold.armed) || (!!armedBy && keyArmed);
  const tp = tip.props as Partial<Record<string, Handler>> & typeof tip.props;
  const h = confirmKey ? hold.handlers : null;
  // 2026-11: the label never changes (a relabelled "Hold" sat beside the real Hold): armed by a tap or the keyboard,
  // the countdown ring runs and one bubble says "Tap again or hold to confirm"; held, the ring fills
  return (
    <>
      <button
        type="button"
        className={`booth-tbtn confirm-host ${className}`}
        aria-label={ariaLabel ?? label}
        aria-pressed={pressed === undefined ? undefined : pressed}
        aria-expanded={expanded}
        aria-controls={controls}
        aria-haspopup={haspopup ? "dialog" : undefined}
        aria-description={why ?? (confirmKey ? tx("booth.confirm.hold_hint") : undefined)}
        disabled={disabled}
        data-why={why}
        data-testid={testId}
        data-holding={(h && hold.holding) || undefined}
        data-armed={armedShown || undefined}
        {...tip.props}
        onPointerDown={h ? both(tp.onPointerDown, h.onPointerDown) : tp.onPointerDown}
        onPointerUp={h ? both(tp.onPointerUp, h.onPointerUp) : tp.onPointerUp}
        onPointerLeave={h ? both(tp.onPointerLeave, h.onPointerLeave) : tp.onPointerLeave}
        onPointerCancel={h ? h.onPointerCancel : undefined}
        onContextMenu={(e) => {
          // a long press is the hold here, never the system menu
          if (h) e.preventDefault();
          else tp.onContextMenu?.(e as unknown as PointerEvent<HTMLElement>);
        }}
        onClick={
          h
            ? h.onClick
            : () => {
                if (keyArmed) disarm();
                onClick();
              }
        }
      >
        {children}
        {/* 2026-11: a label that does not fit slides to show the rest on hover / focus (ui/FitText.tsx) */}
        <span className="booth-tbtn-l" aria-hidden>
          <FitText text={label} short={short} />
        </span>
        {((h && hold.holding) || armedShown) && <ConfirmRing />}
        {armedShown && !hold.holding && <ConfirmHint testId={`${testId}-nudge`} />}
      </button>
      {tip.tag}
    </>
  );
}
