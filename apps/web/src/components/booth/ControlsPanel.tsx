"use client";
import {
  Blend,
  ChevronDown,
  ChevronUp,
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
import { TRANSPORT_RANGES } from "@/lib/booth/engine";
import { durationLabel } from "@/lib/booth/plan";
import { boothEngine, useBooth } from "@/lib/booth/store";
import { t } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { SeekBar } from "../ui/SeekBar";
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
function saveControlsOpen(open: boolean) {
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
  onStop,
  onKeys,
  onSong,
}: {
  /** the Stop confirm (fade out and stop / stop now) */
  onStop: () => void;
  /** the keyboard shortcuts sheet */
  onKeys: () => void;
  /** the song sheet of the playing item (its start point, versions) */
  onSong: (planIndex: number) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(loadControlsOpen()), []);
  // the page's foot clears the panel as it clears the transport (--booth-ctl-space joins --booth-strip-space)
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const root = document.documentElement;
    const put = () => root.style.setProperty("--booth-ctl-space", `${Math.ceil(el.offsetHeight) + 6}px`);
    put();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(put) : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.style.removeProperty("--booth-ctl-space");
    };
  }, []);
  const toggle = () => {
    setOpen((o) => {
      saveControlsOpen(!o);
      return !o;
    });
  };
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
        testId="ctl-next"
      >
        <SkipForward size={20} strokeWidth={2} aria-hidden />
      </Btn>
    </div>
  );

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
          onClick={toggle}
          aria-expanded={open}
          aria-controls="booth-ctl-body"
          data-testid="booth-controls-toggle"
        >
          {open ? <ChevronDown size={18} aria-hidden /> : <ChevronUp size={18} aria-hidden />}
          <span>{t("booth.controls.title")}</span>
        </button>
        {transport}
        {open && (
          <Btn label={t("booth.controls.shortcuts")} onClick={onKeys} testId="ctl-keys">
            <Keyboard size={20} strokeWidth={2} aria-hidden />
          </Btn>
        )}
      </div>
      {open && (
        <div className="booth-ctl-body" id="booth-ctl-body">
          <Group title={t("booth.controls.transport")}>
            <div className="booth-ctl-row">
              <Btn
                label={t("booth.controlStrip.next_at_gap")}
                onClick={() => a.next()}
                disabled={!started}
                testId="ctl-next-gap"
              >
                <StepForward size={20} strokeWidth={2} aria-hidden />
              </Btn>
              <Btn
                label={t("booth.controlStrip.fade")}
                onClick={() => a.fadeOutNow()}
                disabled={!live}
                testId="ctl-fade"
              >
                <TrendingDown size={20} strokeWidth={2} aria-hidden />
              </Btn>
              <Btn
                label={t("booth.controlStrip.crossfade")}
                onClick={() => void a.crossfadeNext()}
                disabled={!live || noOverlap}
                why={noOverlap ? t("booth.controls.why_spotify_overlap") : undefined}
                testId="ctl-crossfade"
              >
                <Blend size={20} strokeWidth={2} aria-hidden />
              </Btn>
              <Btn
                label={t("booth.controls.stop_fade")}
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
                disabled={!itemId}
                testId="ctl-trim-down"
              >
                <span aria-hidden>−</span>
              </Btn>
              <Btn
                label={t("booth.controls.trim_up")}
                onClick={() => setTrim(trim + 0.5)}
                disabled={!itemId}
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
                label={muted ? t("booth.controlStrip.unmute") : t("booth.controlStrip.mute")}
                pressed={muted}
                onClick={() => a.toggleMute()}
                testId="ctl-mute"
              >
                <VolumeX size={20} strokeWidth={2} aria-hidden />
              </Btn>
              <Btn
                label={t("booth.controlStrip.talk")}
                pressed={ducked}
                onClick={() => a.setDucked(!ducked)}
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
              <button
                type="button"
                className="btn-plain min-h-11 px-2"
                disabled={!live || item?.kind !== "track"}
                onClick={() => a.cueCortina()}
                data-testid="ctl-skip-tanda"
              >
                {t("booth.controls.skip_tanda")}
              </button>
              <button
                type="button"
                className="btn-plain min-h-11 px-2"
                disabled={!started || !hasClosing}
                onClick={() => void a.jumpToClosing(false)}
                data-testid="ctl-rest-cumparsita"
              >
                {t("booth.controls.rest_then_cumparsita")}
              </button>
              <button
                type="button"
                className="btn-plain min-h-11 px-2"
                disabled={!started || !hasClosing}
                onClick={() => void a.jumpToClosing(true)}
                data-testid="ctl-jump-cumparsita"
              >
                {t("booth.controls.jump_cumparsita")}
              </button>
            </div>
          </Group>
          <p className="booth-ctl-keys text-footnote" data-testid="ctl-keys-line">
            {t("booth.controls.keys_line")}
          </p>
        </div>
      )}
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
  testId,
  children,
}: {
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
  return (
    <button
      type="button"
      className={`booth-ctl-btn ${primary ? "booth-ctl-primary" : ""}`}
      aria-label={label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      aria-description={why}
      title={why ?? label}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
    >
      {children}
      <span className="booth-ctl-btn-l">{label}</span>
    </button>
  );
}
