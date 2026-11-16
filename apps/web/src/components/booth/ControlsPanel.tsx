"use client";
import {
  Blend,
  ChevronDown,
  Headphones,
  Keyboard,
  Mic,
  Minus,
  Plus,
  SlidersVertical,
  Square,
  StepForward,
  TrendingDown,
  VolumeX,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { hideHints } from "@/components/ui/Tip";
import { guard, useArmed } from "@/lib/booth/confirm";
import { askForHeadphones, SINK_UNSUPPORTED } from "@/lib/booth/cue";
import { TRANSPORT_RANGES } from "@/lib/booth/engine";
import { durationLabel } from "@/lib/booth/plan";
import { isAppleMobile } from "@/lib/booth/sources/spotify";
import { boothEngine, useBooth, useRoomCaps } from "@/lib/booth/store";
import { t } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { SeekBar } from "../ui/SeekBar";
import { ArmButton, ConfirmRing } from "./Confirm";
import { openController } from "./ControllerView";
import { FadeButton } from "./FadeButton";
import { Fader } from "./Fader";
import { FloorReaction } from "./FloorReaction";
import { MixerMeter, MixerRoomButton } from "./LevelPanel";
import { PraiseTanda } from "./PraiseTanda";

const OPEN_KEY = "tdj-booth-controls";
/** the panel's open / closed state, per device (this browser) */
export function loadControlsOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
}
export function saveControlsOpen(open: boolean) {
  try {
    localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {}
}

/**
 * 2026-11 ("classic DJ controls on the play page, in a retractable panel"): every control the engine supports in one
 * drawer over the transport — transport, cue, mixer, timing, tanda, song — wired to the booth store (no logic of its
 * own). Collapsed it is one handle; open it docks above the transport (a bottom drawer on a phone). Its state is
 * remembered per device. What Spotify cannot do (an overlap, a second track in the headphones) stays visible,
 * disabled, with the reason.
 */
export function ControlsPanel({
  open,
  onClose,
  onStop,
  onKeys,
  onSong,
}: {
  /** open: it docks above the transport (its toggle is the transport's Controls button) */
  open: boolean;
  onClose: () => void;
  /** the Stop confirm (fade out and stop / stop now) */
  onStop: () => void;
  /** the keyboard shortcuts sheet */
  onKeys: () => void;
  /** the song sheet of the playing item (its start point, versions) */
  onSong: (planIndex: number) => void;
}) {
  // the page's foot clears the panel as it clears the transport (--booth-ctl-space joins --booth-strip-space)
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = box.current;
    const root = document.documentElement;
    if (!el || !open) {
      root.style.removeProperty("--booth-ctl-space");
      return;
    }
    // (2026-11: the panel sits one --booth-gap above the transport, booth.css; the columns end one gap above it)
    const put = () => {
      const gap = Number.parseFloat(getComputedStyle(root).getPropertyValue("--booth-gap")) || 12;
      root.style.setProperty("--booth-ctl-space", `${Math.ceil(el.offsetHeight) + gap}px`);
    };
    put();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(put) : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.style.removeProperty("--booth-ctl-space");
    };
  }, [open]);
  // 2026-11 (design review): no hint is left over the panel's controls when it opens (a mouse click on the toggle
  // left its tooltip over the Floor buttons), and Escape closes it (unless a sheet is up: Escape is the sheet's)
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    hideHints();
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector('[role="dialog"]')) return;
      closeRef.current();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);
  // the groups scroll inside the capped panel. 2026-11 (the overlap pass): the panel's fold falls between two rows of
  // groups, never through one (the body is as tall as the whole rows that fit), and "More" sits in the panel's head
  // (it covered the Mixer's Cortina fader as a floating pill), scrolling the next row up
  const body = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = body.current;
    const panel = box.current;
    if (!el || !panel || !open) return;
    const read = () => setMore(el.scrollHeight - el.clientHeight - el.scrollTop > 4);
    const fitRows = () => {
      el.style.maxHeight = "";
      const cs = getComputedStyle(panel);
      const cap = Number.parseFloat(cs.maxHeight);
      const head = panel.querySelector<HTMLElement>(".booth-ctl-head");
      if (!Number.isFinite(cap) || !head) return read();
      const avail =
        cap -
        head.offsetHeight -
        Number.parseFloat(cs.paddingTop) -
        Number.parseFloat(cs.paddingBottom) -
        Number.parseFloat(cs.borderTopWidth) -
        Number.parseFloat(cs.borderBottomWidth);
      const padB = Number.parseFloat(getComputedStyle(el).paddingBottom) || 0;
      if (el.scrollHeight <= avail + 1) return read();
      const groups = rowsOf(el);
      // the lowest row end that fits, where no group runs across it
      let best = 0;
      for (const g of groups) {
        const end = g.offsetTop + g.offsetHeight;
        if (end + padB > avail) continue;
        if (groups.some((o) => o.offsetTop < end - 1 && o.offsetTop + o.offsetHeight > end + 1)) continue;
        best = Math.max(best, end);
      }
      // (not when it would leave most of the panel's room unused: the fold then cuts, the body scrolls as before)
      if (best > 0 && best >= avail * 0.6) el.style.maxHeight = `${Math.ceil(best + padB)}px`;
      read();
    };
    fitRows();
    el.addEventListener("scroll", read, { passive: true });
    window.addEventListener("resize", fitRows);
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(fitRows) : null;
    for (const g of el.children) ro?.observe(g);
    return () => {
      el.removeEventListener("scroll", read);
      window.removeEventListener("resize", fitRows);
      ro?.disconnect();
      el.style.maxHeight = "";
    };
  }, [open]);
  /** "More": the first row of groups the fold cuts or hides comes up to the panel's top */
  const scrollMore = () => {
    const el = body.current;
    if (!el) return;
    const bottom = el.scrollTop + el.clientHeight;
    const next = rowsOf(el)
      .filter((g) => g.offsetTop + g.offsetHeight > bottom + 1)
      .sort((a, b) => a.offsetTop - b.offsetTop)[0];
    const pad = Number.parseFloat(getComputedStyle(el).paddingTop) || 0;
    el.scrollTo({ top: next ? next.offsetTop - pad : el.scrollHeight, behavior: "smooth" });
  };
  const started = useBooth((s) => s.started);
  const state = useBooth((s) => s.state);
  const plan = useBooth((s) => s.plan);
  const planIndex = useBooth((s) => s.planIndex);
  const sources = useBooth((s) => s.sources);
  const settings = useBooth((s) => s.settings);
  const master = useBooth((s) => s.master);
  const muted = useBooth((s) => s.muted);
  const ducked = useBooth((s) => s.ducked);
  const cortinaFader = useBooth((s) => s.cortinaFader);
  const position = useBooth((s) => s.position);
  const current = useBooth((s) => s.current);
  const audition = useBooth((s) => s.audition);
  const mutePaused = useBooth((s) => s.mutePaused);
  // 2026-11: what the room's device can do (Spotify Connect: no fades; the iOS Spotify app: no volume either)
  const caps = useRoomCaps();
  const a = useBooth.getState();
  const live = state === "playing" || state === "cortina";
  const item = plan?.items[planIndex];
  const length = current ? Math.max(0, current.endsAt - current.startedAt) : (item?.lengthSec ?? 0);
  const spotifyNow = sources[planIndex] === "spotify";
  const next = (() => {
    if (!plan) return null;
    for (let i = planIndex + 1; i < plan.items.length; i++)
      if (sources[i] !== "missing" && plan.items[i]!.kind !== "break") return i;
    return null;
  })();
  const spotifyNext = next !== null && sources[next] === "spotify";
  const noOverlap = started && (spotifyNow || spotifyNext);
  // 2026-11 (the owner: "Cue won't work"): Cue is never a dead button. With headphones chosen it plays the next song
  // there (its file, else its 30 s clip — also on a Spotify night: the clip is a second player); with none chosen a
  // tap opens the HEADPHONES picker and cues once one is picked; where the browser has one output (iPad, iPhone,
  // Safari) it says in one line that the headphones need a second device.
  const [cueNote, setCueNote] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: another next song clears the note
  useEffect(() => setCueNote(null), [next]);
  const cueTap = async () => {
    if (next === null) return;
    setCueNote(null);
    const blocked = a.cueBlocked();
    if (blocked && started) {
      const o = useBooth.getState().outputs;
      if (o.cueSupported && !isAppleMobile()) return askForHeadphones(next);
      setCueNote(isAppleMobile() ? t("booth.connect.headphones_ipad") : SINK_UNSUPPORTED());
      return;
    }
    const why = await a.prelisten({ i: next });
    if (why) {
      setCueNote(why);
      toast(t("booth.songSheet.can_t_pre_listen", { why }));
    }
  };
  const [trim, setTrimLocal] = useState(0);
  const itemId = item?.id ?? null;
  useEffect(() => {
    setTrimLocal(itemId ? (boothEngine()?.trims[itemId] ?? 0) : 0);
  }, [itemId]);
  const setTrim = (db: number) => {
    if (!itemId) return;
    const v = Math.max(-12, Math.min(12, Math.round(db * 2) / 2));
    setTrimLocal(v);
    a.setTrim(itemId, v);
  };
  const hasClosing = !!plan && plan.items.at(-1)?.kind === "closing" && (plan.items.at(-1)?.tanda ?? 0) > 0;

  if (!open) return null;
  return (
    <section
      ref={box}
      className="booth-ctl glass"
      data-open={open || undefined}
      data-testid="booth-controls"
      data-hint-shield
      aria-label={t("booth.controls.title")}
    >
      <div className="booth-ctl-head">
        <button
          type="button"
          className="booth-ctl-toggle"
          onClick={onClose}
          aria-label={t("booth.controls.close")}
          data-testid="booth-controls-close"
        >
          <ChevronDown size={18} aria-hidden />
          <span>{t("booth.controls.title")}</span>
        </button>
        {more && (
          <button
            type="button"
            className="booth-ctl-more"
            onClick={scrollMore}
            aria-controls="booth-ctl-body"
            data-testid="ctl-more"
          >
            {t("booth.controls.more_below")}
            <ChevronDown size={16} strokeWidth={2.25} aria-hidden />
          </button>
        )}
        {/* 2026-11: a DJ controller (MIDI) and the on-screen controller (docs/design/controller.md) */}
        <Btn
          label={t("controller.open")}
          why={t("controller.open_hint")}
          onClick={openController}
          testId="ctl-controller"
        >
          <SlidersVertical size={20} strokeWidth={2} aria-hidden />
        </Btn>
        <Btn label={t("booth.controls.shortcuts")} onClick={onKeys} testId="ctl-keys">
          <Keyboard size={20} strokeWidth={2} aria-hidden />
        </Btn>
      </div>
      <div className="booth-ctl-body" id="booth-ctl-body" ref={body} data-more={more || undefined}>
        <Group title={t("booth.controls.transport")} className="booth-ctl-g-transport">
          <div className="booth-ctl-row">
            <Btn
              label={t("booth.connect.skip_next_song")}
              onClick={() => a.next()}
              disabled={!started}
              why={t("booth.connect.skip_next_hint")}
              armKey="skip-next"
              testId="ctl-next-gap"
              short={t("booth.controls.short_next_gap")}
            >
              <StepForward size={20} strokeWidth={2} aria-hidden />
            </Btn>
            <FadeButton
              kind="fade"
              label={t("booth.controlStrip.fade")}
              short={t("booth.controls.short_fade")}
              why={caps.fade ? undefined : t("booth.connect.no_fade_why")}
              live={live}
              onRun={() => a.fadeOutNow()}
              testId="ctl-fade"
              className="booth-ctl-btn"
              wordClass="booth-ctl-btn-l"
            >
              <TrendingDown size={20} strokeWidth={2} aria-hidden />
            </FadeButton>
            <FadeButton
              kind="crossfade"
              label={t("booth.controlStrip.crossfade")}
              short={t("booth.controls.short_crossfade")}
              why={caps.fade ? undefined : t("booth.connect.no_fade_why")}
              hint={noOverlap ? t("booth.controls.why_spotify_overlap") : undefined}
              live={live}
              onRun={() => void a.crossfadeNext()}
              testId="ctl-crossfade"
              className="booth-ctl-btn"
              wordClass="booth-ctl-btn-l"
            >
              <Blend size={20} strokeWidth={2} aria-hidden />
            </FadeButton>
            <Btn
              label={caps.fade ? t("booth.controls.stop_fade") : t("booth.controlStrip.stop")}
              onClick={() => {
                // 2026-11: a row played in the room before the night stops at once (Stop is never dead)
                if (!started && audition?.where === "device") return a.stopAudition();
                onStop();
              }}
              disabled={!(started && state !== "stopped") && audition?.where !== "device"}
              testId="ctl-stop"
              short={t("booth.controls.short_stop")}
            >
              <Square size={20} fill="currentColor" strokeWidth={0} aria-hidden />
            </Btn>
          </div>
          {/* (Spotify's "one track at a time" is said once, under Timing; Fade and Crossfade carry it as their reason) */}
        </Group>
        <Group title={t("booth.controls.song")} className="booth-ctl-song-group booth-ctl-g-song">
          <div className="booth-ctl-song-line">
            <div className="booth-seek-row">
              <span className="tabular-nums">{durationLabel(Math.min(position, length))}</span>
              <SeekBar
                value={Math.min(position, length)}
                max={length}
                onSeek={(s) => void a.seek(s)}
                disabled={!started || !(live || state === "paused") || item?.kind === "break"}
                confirmTap={live}
                label={t("booth.nowCard.seek_label")}
                testId="ctl-seek"
              />
              <span className="tabular-nums">{durationLabel(length)}</span>
            </div>
            {/* one row of 44 px controls: − Trim 0 dB + and Start point… (the stepper's value between its buttons) */}
            <div className="booth-ctl-row booth-ctl-song">
              <fieldset
                className="booth-ctl-stepper"
                aria-label={t("booth.controls.trim", { db: `${trim > 0 ? "+" : ""}${trim}` })}
              >
                <Btn
                  label={t("booth.controls.trim_down")}
                  onClick={() => setTrim(trim - 0.5)}
                  disabled={!itemId || !caps.gain}
                  why={caps.gain ? undefined : t("booth.connect.gain_none")}
                  testId="ctl-trim-down"
                  icon
                >
                  <Minus size={18} strokeWidth={2.25} aria-hidden />
                </Btn>
                <span className="booth-ctl-trim-v tabular-nums" data-testid="ctl-trim-value">
                  {t("booth.controls.trim_value", { db: `${trim > 0 ? "+" : ""}${trim}` })}
                </span>
                <Btn
                  label={t("booth.controls.trim_up")}
                  onClick={() => setTrim(trim + 0.5)}
                  disabled={!itemId || !caps.gain}
                  why={caps.gain ? undefined : t("booth.connect.gain_none")}
                  testId="ctl-trim-up"
                  icon
                >
                  <Plus size={18} strokeWidth={2.25} aria-hidden />
                </Btn>
              </fieldset>
              <button
                type="button"
                className="booth-ctl-text booth-ctl-start"
                onClick={() => onSong(planIndex)}
                disabled={!item || item.kind === "break"}
                data-testid="ctl-start-point"
              >
                {t("booth.controls.start_point")}
              </button>
            </div>
          </div>
        </Group>
        <Group title={t("booth.controls.cue")} className="booth-ctl-g-cue">
          <div className="booth-ctl-row booth-ctl-cue">
            {audition ? (
              <button
                type="button"
                className="booth-ctl-text booth-ctl-wide"
                onClick={() => a.stopAudition()}
                data-testid="ctl-cue-stop"
              >
                <Square size={14} fill="currentColor" strokeWidth={0} aria-hidden />
                <span>{t("booth.songSheet.stop_pre_listen")}</span>
              </button>
            ) : (
              <button
                type="button"
                className="booth-ctl-text booth-ctl-wide"
                disabled={next === null}
                onClick={() => void cueTap()}
                data-testid="ctl-cue-next"
              >
                <Headphones size={16} strokeWidth={2} aria-hidden />
                <span>{t("booth.controls.cue_next")}</span>
              </button>
            )}
            {cueNote && (
              <span className="booth-ctl-why" role="status" data-testid="ctl-cue-why">
                {cueNote}
              </span>
            )}
          </div>
        </Group>
        {/* 2026-11: the output meter on the Mixer's title line; the room meter and Auto master (LevelPanel.tsx) */}
        <Group title={t("booth.controls.mixer")} className="booth-ctl-g-mixer" aside={<MixerMeter />}>
          <Fader
            label={t("booth.controlStrip.master_volume")}
            value={master}
            min={-30}
            max={6}
            step={1}
            onChange={a.setMaster}
            display={t("booth.controlStrip.db", { p1: master > 0 ? "+" : "", master })}
            testId="ctl-master"
            disabled={!caps.volume}
            hint={caps.volume ? undefined : t("booth.connect.no_volume_why")}
          />
          <Fader
            label={t("booth.controls.cortina_fader")}
            value={cortinaFader}
            min={0}
            max={1}
            step={0.05}
            onChange={a.setCortinaFader}
            display={`${Math.round(cortinaFader * 100)} %`}
            testId="ctl-cortina"
          />
          <div className="booth-ctl-row">
            <Btn
              label={
                caps.volume
                  ? muted
                    ? t("booth.controlStrip.unmute")
                    : t("booth.controlStrip.mute")
                  : muted && mutePaused
                    ? t("booth.connect.unmute_resumes")
                    : t("booth.connect.mute_pauses")
              }
              pressed={muted}
              onClick={() => a.toggleMute()}
              testId="ctl-mute"
            >
              <VolumeX size={20} strokeWidth={2} aria-hidden />
            </Btn>
            <Btn
              label={t("booth.controlStrip.talk")}
              pressed={caps.volume ? ducked : false}
              onClick={() => a.setDucked(!ducked)}
              disabled={!caps.volume}
              why={caps.volume ? undefined : t("booth.connect.talk_unavailable")}
              testId="ctl-talk"
            >
              <Mic size={20} strokeWidth={2} aria-hidden />
            </Btn>
            <MixerRoomButton />
          </div>
        </Group>
        <Group title={t("booth.controls.timing")} className="booth-ctl-g-timing">
          <Fader
            label={t("booth.controls.gap")}
            value={settings.gapSec}
            min={0}
            max={8}
            step={0.5}
            onChange={(v) => a.setSettings({ gapSec: v })}
            display={`${settings.gapSec} s`}
            testId="ctl-gap"
          />
          <Fader
            label={t("booth.controls.fade_len")}
            value={settings.fadeNowSec}
            {...TRANSPORT_RANGES.fadeNowSec}
            onChange={(v) => a.setSettings({ fadeNowSec: v })}
            display={`${settings.fadeNowSec} s`}
            testId="ctl-fade-len"
          />
          <Fader
            label={t("booth.controls.crossfade_len")}
            value={settings.crossfadeSec}
            {...TRANSPORT_RANGES.crossfadeSec}
            onChange={(v) => a.setSettings({ crossfadeSec: v })}
            display={`${settings.crossfadeSec} s`}
            testId="ctl-crossfade-len"
          />
          {noOverlap && <span className="booth-ctl-why">{t("booth.controls.why_spotify_overlap")}</span>}
        </Group>
        <Group title={t("fav.floor_group")} className="booth-ctl-g-floor">
          {/* 2026-11, dancer favourites: the playing song and its tanda, one tap each */}
          <FloorReaction scope="song" testPrefix="ctl-song" />
          <FloorReaction scope="tanda" testPrefix="ctl-tanda" />
          {/* 2026-11: praise the playing tanda (feedback, a ♥ for its songs): lib/praise.ts */}
          <div className="booth-floor">
            <PraiseTanda testPrefix="ctl-tanda" />
          </div>
        </Group>
        <Group title={t("booth.controls.tanda")} className="booth-ctl-g-tanda">
          <div className="booth-ctl-row flex-wrap">
            <ArmButton
              className="booth-ctl-text"
              disabled={!live || item?.kind !== "track"}
              armKey="skip-tanda"
              onConfirm={() => a.cueCortina()}
              data-testid="ctl-skip-tanda"
            >
              {t("booth.controls.skip_tanda")}
            </ArmButton>
            <button
              type="button"
              className="booth-ctl-text"
              disabled={!started || !hasClosing}
              onClick={() => void a.jumpToClosing(false)}
              data-testid="ctl-rest-cumparsita"
            >
              {t("booth.controls.rest_then_cumparsita")}
            </button>
            <ArmButton
              className="booth-ctl-text"
              data-tone="destructive"
              disabled={!started || !hasClosing}
              armKey="jump-cumparsita"
              onConfirm={() => void a.jumpToClosing(true)}
              data-testid="ctl-jump-cumparsita"
            >
              {caps.fade ? t("booth.controls.jump_cumparsita") : t("booth.connect.jump_cumparsita_now")}
            </ArmButton>
          </div>
        </Group>
        <p className="booth-ctl-keys text-footnote" data-testid="ctl-keys-line">
          {t("booth.controls.keys_line")}
        </p>
      </div>
    </section>
  );
}

/** the panel's groups as laid out (its rows: the grid stretches the groups of one row to one height) */
function rowsOf(el: HTMLElement): HTMLElement[] {
  return [...el.children].filter((g): g is HTMLElement => g instanceof HTMLElement && g.offsetHeight > 0);
}

function Group({
  title,
  className = "",
  aside,
  children,
}: {
  title: string;
  className?: string;
  /** 2026-11: shown on the title line after the title (the Mixer's meter) */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <fieldset className={`booth-ctl-group ${className}`}>
      <legend className="booth-ctl-title">
        {aside ? <span>{title}</span> : title}
        {aside}
      </legend>
      {children}
    </fieldset>
  );
}

function Btn({
  label,
  onClick,
  disabled,
  pressed,
  primary,
  why,
  armKey,
  testId,
  short,
  icon,
  children,
}: {
  /** the visible word when the name is long (the full name stays the accessible name and the tooltip) */
  short?: string;
  /** an icon-only button (the trim stepper): no word under the glyph */
  icon?: boolean;
  /** mid-night the first tap arms, the second runs (lib/booth/confirm.ts) */
  armKey?: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  primary?: boolean;
  /** why it is disabled (shown, never hidden) */
  why?: string;
  testId: string;
  children: ReactNode;
}) {
  const armed = useArmed(armKey ?? "");
  const on = !!armKey && armed;
  return (
    <button
      type="button"
      className={`booth-ctl-btn confirm-host ${primary ? "booth-ctl-primary" : ""} ${icon ? "booth-ctl-icon" : ""}`}
      data-armed={on || undefined}
      aria-label={label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      aria-description={why}
      title={why ?? label}
      onClick={armKey ? () => guard(armKey, onClick) : onClick}
      disabled={disabled}
      data-testid={testId}
    >
      {children}
      {!icon && <span className="booth-ctl-btn-l">{on ? t("booth.confirm.again") : (short ?? label)}</span>}
      {on && <ConfirmRing />}
    </button>
  );
}
