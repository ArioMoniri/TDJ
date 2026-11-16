"use client";
import {
  Blend,
  ChevronDown,
  Headphones,
  Keyboard,
  Mic,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Square,
  StepForward,
  TrendingDown,
  VolumeX,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { guard, useArmed } from "@/lib/booth/confirm";
import { TRANSPORT_RANGES } from "@/lib/booth/engine";
import { durationLabel } from "@/lib/booth/plan";
import { boothEngine, useBooth, useRoomCaps } from "@/lib/booth/store";
import { t } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { SeekBar } from "../ui/SeekBar";
import { ArmButton, ConfirmRing } from "./Confirm";
import { Fader } from "./Fader";
import { FloorReaction } from "./FloorReaction";
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
    const put = () => root.style.setProperty("--booth-ctl-space", `${Math.ceil(el.offsetHeight) + 6}px`);
    put();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(put) : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.style.removeProperty("--booth-ctl-space");
    };
  }, [open]);
  const ready = useBooth((s) => s.ready);
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
  const cueWhy =
    next === null
      ? null
      : started && (spotifyNow || spotifyNext)
        ? t("booth.controls.why_spotify_cue")
        : a.cueBlocked();
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

  const transport = (
    <div className="booth-ctl-row">
      <Btn
        label={t("booth.controlStrip.previous")}
        onClick={() => void a.previous()}
        disabled={!ready}
        armKey="prev"
        testId="ctl-prev"
      >
        <SkipBack size={20} strokeWidth={2} aria-hidden />
      </Btn>
      <Btn
        label={
          !started
            ? t("booth.controls.start")
            : live
              ? t("booth.controlStrip.pause")
              : t("booth.controlStrip.play")
        }
        onClick={() => a.togglePause()}
        disabled={!ready}
        testId="ctl-play"
        primary
      >
        {live ? (
          <Pause size={20} fill="currentColor" strokeWidth={0} aria-hidden />
        ) : (
          <Play size={20} fill="currentColor" strokeWidth={0} aria-hidden />
        )}
      </Btn>
      <Btn
        label={t("booth.controlStrip.next_now")}
        onClick={() => void a.nextNow()}
        disabled={!ready}
        armKey="next"
        testId="ctl-next"
      >
        <SkipForward size={20} strokeWidth={2} aria-hidden />
      </Btn>
    </div>
  );

  if (!open) return null;
  return (
    <section
      ref={box}
      className="booth-ctl glass"
      data-open={open || undefined}
      data-testid="booth-controls"
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
        {transport}
        <Btn label={t("booth.controls.shortcuts")} onClick={onKeys} testId="ctl-keys">
          <Keyboard size={20} strokeWidth={2} aria-hidden />
        </Btn>
      </div>
      <div className="booth-ctl-body" id="booth-ctl-body">
        <Group title={t("booth.controls.transport")}>
          <div className="booth-ctl-row">
            <Btn
              label={t("booth.connect.skip_next_song")}
              onClick={() => a.next()}
              disabled={!started}
              why={t("booth.connect.skip_next_hint")}
              armKey="skip-next"
              testId="ctl-next-gap"
            >
              <StepForward size={20} strokeWidth={2} aria-hidden />
            </Btn>
            <Btn
              label={t("booth.controlStrip.fade")}
              onClick={() => a.fadeOutNow()}
              disabled={!live || !caps.fade}
              why={caps.fade ? undefined : t("booth.connect.no_fade_why")}
              armKey="fade"
              testId="ctl-fade"
            >
              <TrendingDown size={20} strokeWidth={2} aria-hidden />
            </Btn>
            <Btn
              label={t("booth.controlStrip.crossfade")}
              onClick={() => void a.crossfadeNext()}
              disabled={!live || noOverlap || !caps.fade}
              why={
                !caps.fade
                  ? t("booth.connect.no_fade_why")
                  : noOverlap
                    ? t("booth.controls.why_spotify_overlap")
                    : undefined
              }
              armKey="crossfade"
              testId="ctl-crossfade"
            >
              <Blend size={20} strokeWidth={2} aria-hidden />
            </Btn>
            <Btn
              label={caps.fade ? t("booth.controls.stop_fade") : t("booth.controlStrip.stop")}
              onClick={onStop}
              disabled={!started || state === "stopped"}
              testId="ctl-stop"
            >
              <Square size={18} fill="currentColor" strokeWidth={0} aria-hidden />
            </Btn>
          </div>
          {noOverlap && <span className="booth-ctl-why">{t("booth.controls.why_spotify_overlap")}</span>}
        </Group>
        <Group title={t("booth.controls.song")}>
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
          <div className="booth-ctl-row">
            <span className="booth-ctl-label">
              {t("booth.controls.trim", { db: `${trim > 0 ? "+" : ""}${trim}` })}
            </span>
            <Btn
              label={t("booth.controls.trim_down")}
              onClick={() => setTrim(trim - 0.5)}
              disabled={!itemId || !caps.gain}
              why={caps.gain ? undefined : t("booth.connect.gain_none")}
              testId="ctl-trim-down"
            >
              <span aria-hidden>−</span>
            </Btn>
            <Btn
              label={t("booth.controls.trim_up")}
              onClick={() => setTrim(trim + 0.5)}
              disabled={!itemId || !caps.gain}
              why={caps.gain ? undefined : t("booth.connect.gain_none")}
              testId="ctl-trim-up"
            >
              <span aria-hidden>+</span>
            </Btn>
            <button
              type="button"
              className="btn-plain min-h-11 px-2"
              onClick={() => onSong(planIndex)}
              disabled={!item || item.kind === "break"}
              data-testid="ctl-start-point"
            >
              {t("booth.controls.start_point")}
            </button>
          </div>
        </Group>
        <Group title={t("booth.controls.cue")}>
          <div className="booth-ctl-row">
            {audition ? (
              <button
                type="button"
                className="btn-plain min-h-11 px-2"
                onClick={() => a.stopAudition()}
                data-testid="ctl-cue-stop"
              >
                <Square size={14} fill="currentColor" strokeWidth={0} aria-hidden />{" "}
                {t("booth.songSheet.stop_pre_listen")}
              </button>
            ) : (
              <button
                type="button"
                className="btn-plain min-h-11 px-2"
                disabled={next === null || (started && !!cueWhy)}
                onClick={async () => {
                  if (next === null) return;
                  const why = await a.prelisten({ i: next });
                  if (why) toast(t("booth.songSheet.can_t_pre_listen", { why }));
                }}
                data-testid="ctl-cue-next"
              >
                <Headphones size={16} strokeWidth={2} aria-hidden /> {t("booth.controls.cue_next")}
              </button>
            )}
            {started && cueWhy && <span className="booth-ctl-why">{cueWhy}</span>}
          </div>
        </Group>
        <Group title={t("booth.controls.mixer")}>
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
          </div>
        </Group>
        <Group title={t("booth.controls.timing")}>
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
        <Group title={t("fav.floor_group")}>
          {/* 2026-11, dancer favourites: the playing song and its tanda, one tap each */}
          <FloorReaction scope="song" testPrefix="ctl-song" />
          <FloorReaction scope="tanda" testPrefix="ctl-tanda" />
          {/* 2026-11: praise the playing tanda (feedback, a ♥ for its songs): lib/praise.ts */}
          <div className="booth-floor">
            <PraiseTanda testPrefix="ctl-tanda" />
          </div>
        </Group>
        <Group title={t("booth.controls.tanda")}>
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

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="booth-ctl-group">
      <legend className="booth-ctl-title">{title}</legend>
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
  children,
}: {
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
      className={`booth-ctl-btn confirm-host ${primary ? "booth-ctl-primary" : ""}`}
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
      <span className="booth-ctl-btn-l">{on ? t("booth.confirm.again") : label}</span>
      {on && <ConfirmRing />}
    </button>
  );
}
