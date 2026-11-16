"use client";
import "./controller.css";
import { ChevronLeft, ChevronRight, Download, Headphones, Plug, RotateCcw, Upload, Usb } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { useArm } from "@/lib/booth/confirm";
import { useBooth, useRoomCaps } from "@/lib/booth/store";
import {
  ASSIGN,
  type ControlId,
  type Deck,
  FN_KIND,
  FNS,
  type FnId,
  fnOf,
  keysFor,
} from "@/lib/controller/mappings";
import { describeKey } from "@/lib/controller/midi";
import { dbEq, dbFader, dbKnob, XF_LEFT, XF_RIGHT } from "@/lib/controller/runtime";
import {
  acceptOffer,
  applyMapping,
  autoConnect,
  connectController,
  disconnectController,
  dismissOffer,
  eqAvailable,
  exportActive,
  fnLabel,
  forgetLearned,
  importForActive,
  nextPlayable,
  runIntent,
  setActive,
  startLearn,
  useController,
  virtualControl,
} from "@/lib/controller/store";
import { t } from "@/lib/i18n";
import { toast } from "@/lib/toast";

/**
 * 2026-11 (docs/design/controller.md): the controller in the Booth — one sheet (Controls → Controller) with
 * - the controllers T-DJ sees (name, maker, in / out, via Web MIDI or the app's CoreMIDI) and their mapping;
 * - the on-screen controller: deck A = NOW, deck B = NEXT, jog wheels, PLAY / CUE / headphone CUE / LOAD, pads,
 *   channel faders, EQ, crossfader, master, BROWSE — it drives the Booth exactly as the hardware does and mirrors the
 *   hardware's faders and knobs live when one is connected;
 * - MIDI Learn, export / import.
 * Mounted once by the Booth page (`ControllerHost`): it also reconnects a controller turned on before.
 */
export function ControllerHost() {
  useEffect(() => {
    autoConnect();
    (window as unknown as { __tdjController?: unknown }).__tdjController = useController;
  }, []);
  const open = useController((s) => s.open);
  return <ControllerSheet open={open} onClose={() => useController.setState({ open: false, learn: null })} />;
}

export function ControllerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={() => {
        startLearn(null);
        onClose();
      }}
      title={t("controller.title")}
      trailing={t("booth.sheets.done")}
      detents={["large"]}
      width={980}
      testId="controller-sheet"
    >
      <div className="vc-sheet">
        <ControllerStatus compact />
        <OfferBanner />
        {/* what waits for a confirmation sits above the surface: always in sight */}
        <ActionLine />
        <VirtualController />
        <LearnList />
      </div>
    </Sheet>
  );
}

/* ---- connection, ports, mapping ---- */

export function ControllerStatus({ compact = false }: { compact?: boolean }) {
  const status = useController((s) => s.status);
  const support = useController((s) => s.support);
  const ports = useController((s) => s.ports);
  const active = useController((s) => s.active);
  const mapping = useController((s) => s.mapping);
  useEffect(() => {
    if (useController.getState().support === "none") useController.setState({ support: supportNow() });
  }, []);
  const inputs = ports.filter((p) => p.dir === "in");
  const line =
    status === "on"
      ? inputs.length
        ? null
        : t("controller.status.on_none")
      : status === "asking"
        ? t("controller.status.asking")
        : status === "denied"
          ? t("controller.status.denied")
          : status === "error"
            ? t("controller.status.error")
            : status === "unsupported" || support === "none"
              ? t("controller.status.unsupported")
              : t("controller.status.off");
  return (
    <div className="vc-status" data-testid="controller-status" data-status={status}>
      <div className="vc-status-row">
        <Usb size={18} strokeWidth={2} aria-hidden className="shrink-0 text-[var(--label-2)]" />
        <div className="min-w-0 flex-1">
          {line && <p className="text-subhead text-[var(--label)]">{line}</p>}
          {status === "on" && (
            <p className="text-footnote text-[var(--label-2)]">
              {useController.getState().ports[0]?.via === "native" || support === "native"
                ? t("controller.via.native")
                : t("controller.via.web")}
            </p>
          )}
        </div>
        {status === "on" ? (
          <button
            type="button"
            className="vc-text-btn"
            onClick={disconnectController}
            data-testid="controller-disconnect"
          >
            {t("controller.disconnect")}
          </button>
        ) : (
          support !== "none" &&
          status !== "unsupported" && (
            <button
              type="button"
              className="vc-text-btn vc-primary"
              onClick={() => void connectController()}
              disabled={status === "asking"}
              data-testid="controller-connect"
            >
              <Plug size={16} strokeWidth={2} aria-hidden />
              {t("controller.connect")}
            </button>
          )
        )}
      </div>
      {inputs.length > 0 && (
        <ul className="vc-ports" data-testid="controller-ports" aria-label={t("controller.ports")}>
          {inputs.map((p) => {
            const out = ports.some((o) => o.dir === "out" && o.name === p.name);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className="vc-port"
                  aria-pressed={p.name === active}
                  onClick={() => setActive(p.name)}
                  data-testid="controller-port"
                  data-name={p.name}
                >
                  <span className="vc-port-name">{p.name}</span>
                  <span className="vc-port-sub">
                    {[
                      p.manufacturer,
                      out
                        ? `${t("controller.port_in")} + ${t("controller.port_out")}`
                        : t("controller.port_in"),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {active && (
        <p
          className="text-footnote text-[var(--label-2)]"
          data-testid="controller-mapping"
          data-id={mapping.id}
        >
          {t("controller.mapping")}:{" "}
          {mapping.id.endsWith("-custom")
            ? t("controller.mapping_custom", { name: mapping.name })
            : mapping.name}
          {mapping.source && !compact
            ? ` · ${t("controller.mapping_source", { source: mapping.source })}`
            : ""}
        </p>
      )}
    </div>
  );
}

const supportNow = () => {
  if (typeof window === "undefined") return "none" as const;
  if ((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) return "native" as const;
  return typeof (navigator as Navigator & { requestMIDIAccess?: unknown }).requestMIDIAccess === "function"
    ? ("web" as const)
    : ("none" as const);
};

function OfferBanner() {
  const offer = useController((s) => s.offer);
  const armed = useArm((s) => s.armed?.key === "ctl-audio");
  if (!offer) return null;
  return (
    <div className="vc-offer" data-testid="controller-audio-offer" role="status">
      <p className="text-subhead min-w-0 flex-1">
        {offer.pairs >= 2
          ? t("controller.audio.offer", { name: offer.label })
          : t("controller.audio.offer_one", { name: offer.label })}
      </p>
      <button
        type="button"
        className="vc-text-btn"
        onClick={dismissOffer}
        data-testid="controller-audio-later"
      >
        {t("controller.audio.later")}
      </button>
      <button
        type="button"
        className="vc-text-btn vc-primary"
        onClick={() => acceptOffer()}
        data-armed={armed || undefined}
        data-testid="controller-audio-use"
      >
        {armed ? t("booth.confirm.again") : t("controller.audio.use")}
      </button>
    </div>
  );
}

/* ---- the on-screen controller ---- */

function VirtualController() {
  const mirror = useController((s) => s.mirror);
  const mapping = useController((s) => s.mapping);
  const xf = useController((s) => s.xf);
  const eq = useController((s) => s.eq);
  const takeover = useController((s) => s.takeover);
  const master = useBooth((s) => s.master);
  const cortinaFader = useBooth((s) => s.cortinaFader);
  const state = useBooth((s) => s.state);
  const audition = useBooth((s) => s.audition);
  const ducked = useBooth((s) => s.ducked);
  const muted = useBooth((s) => s.muted);
  const holding = useBooth((s) => s.holding);
  const started = useBooth((s) => s.started);
  useBooth((s) => s.planIndex);
  useBooth((s) => s.sources);
  const caps = useRoomCaps();
  const live = state === "playing" || state === "cortina";
  const eqOk = eqAvailable();
  const fnAt = (c: ControlId): FnId | null => {
    const b = mapping.bindings.find((x) => x.control === c && !x.shift);
    return b ? fnOf(b) : (ASSIGN[c] ?? null);
  };
  const lit = (c: ControlId): boolean => {
    if (mirror.pressed[c]) return true;
    const fn = fnAt(c);
    return (
      (fn === "playPause" && live) ||
      (fn === "cueNext" && !!audition) ||
      (fn === "talk" && ducked) ||
      (fn === "mute" && muted) ||
      (fn === "hold" && holding)
    );
  };
  const whyOf = (fn: FnId | null): string | undefined => {
    if (!fn) return undefined;
    if (fn === "crossfade" && !caps.fade) return t("booth.connect.no_fade_why");
    if ((fn === "eqHi" || fn === "eqMid" || fn === "eqLow") && !eqOk) return t("controller.why.eq_spotify");
    if (fn === "master" && !caps.volume) return t("booth.connect.no_volume_why");
    if (fn === "talk" && !caps.volume) return t("booth.connect.talk_unavailable");
    return undefined;
  };
  const press = (c: ControlId) => {
    virtualControl(c, { on: true });
    virtualControl(c, { on: false });
  };
  const deck = (d: Deck) => {
    const now = d === "A";
    return (
      <section
        className="vc-deck"
        data-deck={d}
        data-testid={`vc-deck-${d}`}
        aria-label={now ? t("controller.deck_now") : t("controller.deck_next")}
      >
        <header className="vc-deck-head">
          <span className="vc-deck-tag" data-role={now ? "room" : "cue"}>
            {now ? t("controller.deck_now") : t("controller.deck_next")}
          </span>
          <DeckTitle now={now} />
        </header>
        <Jog
          control={`${d}.jog` as ControlId}
          label={now ? t("controller.ctl.jog_now") : t("controller.ctl.jog_next")}
          turns={
            (mirror.turns[`${d}.jog` as ControlId] ?? 0) + (mirror.turns[`${d}.jogSide` as ControlId] ?? 0)
          }
          touched={!!mirror.pressed[`${d}.jogTouch` as ControlId]}
          disabled={now && !started}
        />
        <div className="vc-deck-buttons">
          <Pad
            label={t("controller.ctl.cue")}
            fn={fnAt(`${d}.cue` as ControlId)}
            lit={lit(`${d}.cue` as ControlId)}
            onPress={() => press(`${d}.cue` as ControlId)}
            testId={`vc-${d}-cue`}
            round
          />
          <Pad
            label={t("controller.ctl.play")}
            fn={fnAt(`${d}.play` as ControlId)}
            lit={lit(`${d}.play` as ControlId)}
            onPress={() => press(`${d}.play` as ControlId)}
            testId={`vc-${d}-play`}
            round
            armKey={now ? "ctl-pause" : "next"}
          />
          <Pad
            icon={<Headphones size={18} strokeWidth={2} aria-hidden />}
            label={t("controller.ctl.pfl")}
            fn={fnAt(`${d}.pfl` as ControlId)}
            lit={lit(`${d}.pfl` as ControlId)}
            onPress={() => press(`${d}.pfl` as ControlId)}
            testId={`vc-${d}-pfl`}
          />
          <Pad
            label={t("controller.ctl.load")}
            fn={fnAt(`${d}.load` as ControlId)}
            lit={!!mirror.pressed[`${d}.load` as ControlId]}
            onPress={() => press(`${d}.load` as ControlId)}
            testId={`vc-${d}-load`}
          />
        </div>
        <div className="vc-pads">
          {Array.from({ length: 8 }, (_, k) => {
            const c = `${d}.pad${k + 1}` as ControlId;
            const fn = fnAt(c);
            return (
              <Pad
                key={c}
                label={fn ? fnLabel(fn) : t("controller.pad", { n: k + 1 })}
                fn={fn}
                lit={lit(c)}
                why={whyOf(fn)}
                onPress={() => press(c)}
                testId={`vc-${d}-pad${k + 1}`}
                armKey={
                  fn === "stop"
                    ? "ctl-stop"
                    : fn === "previous"
                      ? "prev"
                      : fn === "skipNext"
                        ? "skip-next"
                        : fn === "crossfade"
                          ? "crossfade"
                          : undefined
                }
                small
              />
            );
          })}
        </div>
        <Slider
          label={t("controller.ctl.tempo")}
          value={mirror.values[`${d}.tempo` as ControlId] ?? 0.5}
          disabled
          why={t("controller.tempo_why")}
          testId={`vc-${d}-tempo`}
          vertical={false}
        />
      </section>
    );
  };
  const eqKnob = (d: Deck, band: "Hi" | "Mid" | "Low") => {
    const c = `${d}.eq${band}` as ControlId;
    const fn = fnAt(c);
    const key = band === "Hi" ? "high" : band === "Mid" ? "mid" : "low";
    const room = d === "A" && !!fn;
    const v = room ? (takeover[fn!] ?? dbEq(eq[key])) : (mirror.values[c] ?? 0.5);
    return (
      <Knob
        key={c}
        label={t(`controller.ctl.eq_${key}` as Parameters<typeof t>[0])}
        value={v}
        disabled={!room || !eqOk}
        why={room ? (eqOk ? undefined : t("controller.why.eq_spotify")) : t("controller.mirror_only")}
        display={room ? `${eq[key] > 0 ? "+" : ""}${eq[key]} dB` : undefined}
        onChange={(x) => virtualControl(c, { value: x })}
        testId={`vc-${d}-eq-${key}`}
        ghost={room && takeover[fn!] !== undefined ? (mirror.values[c] ?? undefined) : undefined}
      />
    );
  };
  const xfv = mirror.values.xfader ?? 0;
  const xfWhy = !caps.fade
    ? t("booth.connect.no_fade_why")
    : !live
      ? t("controller.why.not_playing")
      : undefined;
  return (
    <div className="vc" data-testid="virtual-controller" data-live={live || undefined}>
      {deck("A")}
      <section className="vc-mixer" aria-label={t("controller.mixer")} data-testid="vc-mixer">
        <div className="vc-mixer-top">
          <Knob
            label={t("controller.ctl.master")}
            value={dbKnob(master)}
            onChange={(x) => virtualControl("master", { value: x })}
            display={`${master > 0 ? "+" : ""}${master} dB`}
            disabled={!caps.volume}
            why={caps.volume ? undefined : t("booth.connect.no_volume_why")}
            testId="vc-master"
          />
          <Knob
            label={t("controller.ctl.hp_mix")}
            value={mirror.values.hpMix ?? 0.5}
            disabled
            why={t("controller.hardware")}
            testId="vc-hpmix"
          />
          <Knob
            label={t("controller.ctl.hp_level")}
            value={mirror.values.hpLevel ?? 0.5}
            disabled
            why={t("controller.hardware")}
            testId="vc-hplevel"
          />
        </div>
        <div className="vc-browse">
          <button
            type="button"
            className="vc-round-sm"
            aria-label={t("controller.ctl.browse_up")}
            onClick={() => virtualControl("browse", { delta: -1 })}
            data-testid="vc-browse-up"
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <button
            type="button"
            className="vc-browse-press"
            onClick={() => press("browsePress")}
            data-pressed={mirror.pressed.browsePress || undefined}
            data-testid="vc-browse-press"
          >
            {t("controller.ctl.browse_press")}
          </button>
          <button
            type="button"
            className="vc-round-sm"
            aria-label={t("controller.ctl.browse_down")}
            onClick={() => virtualControl("browse", { delta: 1 })}
            data-testid="vc-browse-down"
          >
            <ChevronRight size={18} aria-hidden />
          </button>
        </div>
        <div className="vc-strips">
          {(["A", "B"] as const).map((d) => (
            <div className="vc-strip" key={d} data-deck={d}>
              {eqKnob(d, "Hi")}
              {eqKnob(d, "Mid")}
              {eqKnob(d, "Low")}
              <Slider
                label={d === "A" ? t("controller.room_level") : t("controller.ctl.level_b")}
                value={d === "A" ? (takeover.master ?? dbFader(master)) : (mirror.values["B.level"] ?? 0)}
                ghost={d === "A" && takeover.master !== undefined ? dbFader(master) : undefined}
                onChange={(x) => virtualControl(`${d}.level` as ControlId, { value: x })}
                disabled={d === "B" || !caps.volume}
                why={
                  d === "B"
                    ? t("controller.mirror_only")
                    : caps.volume
                      ? undefined
                      : t("booth.connect.no_volume_why")
                }
                testId={`vc-${d}-level`}
                vertical
                display={d === "A" ? `${master > 0 ? "+" : ""}${master} dB` : undefined}
              />
            </div>
          ))}
          <div className="vc-strip vc-strip-cortina">
            <Slider
              label={t("booth.controls.cortina_fader")}
              value={cortinaFader}
              onChange={(x) => runIntent({ fn: "cortina", type: "level", value: x, soft: false }, mapping)}
              testId="vc-cortina"
              vertical
              display={`${Math.round(cortinaFader * 100)} %`}
            />
          </div>
        </div>
        <div className="vc-xf" data-state={xf}>
          <Slider
            label={t("controller.ctl.xfader")}
            value={xfv}
            onChange={(x) => virtualControl("xfader", { value: x })}
            testId="vc-xfader"
            vertical={false}
            disabled={!!xfWhy && xf !== "across"}
            why={xfWhy}
            marks={[XF_LEFT, XF_RIGHT]}
          />
          <p className="text-caption1 text-[var(--label-2)]" data-testid="vc-xf-state">
            {xf === "across"
              ? t("controller.xf.across")
              : xf === "ready"
                ? t("controller.xf.ready")
                : t("controller.xf.unknown")}
          </p>
        </div>
      </section>
      {deck("B")}
    </div>
  );
}

function DeckTitle({ now }: { now: boolean }) {
  const plan = useBooth((s) => s.plan);
  const planIndex = useBooth((s) => s.planIndex);
  useBooth((s) => s.sources);
  const browse = useController((s) => s.browse);
  const i = now ? planIndex : (browse ?? nextPlayable());
  const it = i === null ? null : (plan?.items[i] as { title?: string } | undefined);
  return (
    <span className="vc-deck-title" data-testid={now ? "vc-now-title" : "vc-next-title"}>
      {it?.title ?? "—"}
      {!now && browse !== null && <span className="vc-browse-tag">{t("controller.browsing")}</span>}
    </span>
  );
}

/** a jog wheel: drag around it (or the arrow keys) turns it — NOW seeks, NEXT browses */
function Jog({
  control,
  label,
  turns,
  touched,
  disabled,
}: {
  control: ControlId;
  label: string;
  turns: number;
  touched: boolean;
  disabled?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const last = useRef<number | null>(null);
  const acc = useRef(0);
  const angle = (e: { clientX: number; clientY: number }) => {
    const r = el.current!.getBoundingClientRect();
    return (
      (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI
    );
  };
  const turn = (delta: number) => {
    if (!disabled && delta) virtualControl(control, { delta });
  };
  return (
    <div
      ref={el}
      className="vc-jog"
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-disabled={disabled || undefined}
      aria-valuenow={turns}
      aria-valuetext={label}
      data-touched={touched || undefined}
      data-testid={`vc-${control.replace(".", "-")}`}
      style={{ ["--rot" as string]: `${(turns * 3) % 360}deg` }}
      onPointerDown={(e) => {
        if (disabled) return;
        el.current?.setPointerCapture(e.pointerId);
        last.current = angle(e);
        acc.current = 0;
      }}
      onPointerMove={(e) => {
        if (last.current === null) return;
        const a = angle(e);
        let d = a - last.current;
        if (d > 180) d -= 360;
        if (d < -180) d += 360;
        last.current = a;
        acc.current += d / 3;
        const whole = Math.trunc(acc.current);
        if (whole) {
          acc.current -= whole;
          turn(whole);
        }
      }}
      onPointerUp={() => {
        last.current = null;
      }}
      onPointerCancel={() => {
        last.current = null;
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowUp") {
          e.preventDefault();
          e.stopPropagation();
          turn(e.shiftKey ? 10 : 1);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
          e.preventDefault();
          e.stopPropagation();
          turn(e.shiftKey ? -10 : -1);
        }
      }}
    >
      <span className="vc-jog-mark" aria-hidden />
      <span className="vc-jog-label" aria-hidden>
        {label}
      </span>
    </div>
  );
}

function Pad({
  label,
  fn,
  lit,
  onPress,
  testId,
  why,
  round,
  small,
  armKey,
  icon,
}: {
  /** a glyph instead of the word (the word stays the accessible name) */
  icon?: ReactNode;
  label: string;
  fn: FnId | null;
  lit: boolean;
  onPress: () => void;
  testId: string;
  why?: string;
  round?: boolean;
  small?: boolean;
  armKey?: string;
}) {
  const armed = useArm((s) => !!armKey && s.armed?.key === armKey);
  return (
    <button
      type="button"
      className={`vc-pad ${round ? "vc-round" : ""} ${small ? "vc-pad-sm" : ""}`}
      data-lit={lit || undefined}
      data-armed={armed || undefined}
      data-fn={fn ?? undefined}
      disabled={!fn || !!why}
      aria-description={why ?? (fn ? fnLabel(fn) : t("controller.mirror_only"))}
      title={why ?? (fn ? fnLabel(fn) : t("controller.mirror_only"))}
      onClick={onPress}
      data-testid={testId}
    >
      {icon && !armed ? (
        <>
          {icon}
          <span className="sr-only">{label}</span>
        </>
      ) : (
        <span className="vc-pad-l">{armed ? t("booth.confirm.again") : label}</span>
      )}
    </button>
  );
}

function Knob({
  label,
  value,
  onChange,
  disabled,
  why,
  display,
  testId,
  ghost,
}: {
  label: string;
  value: number;
  onChange?: (v: number) => void;
  disabled?: boolean;
  why?: string;
  display?: string;
  testId: string;
  ghost?: number;
}) {
  const rot = -135 + Math.max(0, Math.min(1, value)) * 270;
  return (
    <label
      className="vc-knob"
      data-disabled={disabled || undefined}
      data-testid={testId}
      title={why ?? label}
    >
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        disabled={disabled || !onChange}
        aria-label={label}
        aria-description={why}
        aria-valuetext={display}
        onChange={(e) => onChange?.(Number(e.target.value))}
      />
      <span className="vc-knob-dial" style={{ ["--rot" as string]: `${rot}deg` }} aria-hidden>
        {ghost !== undefined && (
          <span className="vc-knob-ghost" style={{ ["--rot" as string]: `${-135 + ghost * 270}deg` }} />
        )}
      </span>
      <span className="vc-knob-l">{label}</span>
      {display && <span className="vc-knob-v tabular-nums">{display}</span>}
    </label>
  );
}

function Slider({
  label,
  value,
  onChange,
  disabled,
  why,
  testId,
  vertical,
  display,
  ghost,
  marks,
}: {
  label: string;
  value: number;
  onChange?: (v: number) => void;
  disabled?: boolean;
  why?: string;
  testId: string;
  vertical: boolean;
  display?: string;
  ghost?: number;
  marks?: number[];
}) {
  return (
    <label
      className={`vc-slider ${vertical ? "vc-slider-v" : "vc-slider-h"}`}
      data-disabled={disabled || undefined}
      data-testid={testId}
      title={why ?? label}
    >
      <span className="vc-slider-l">{label}</span>
      <span className="vc-slider-track">
        <input
          type="range"
          min={0}
          max={1}
          step={0.005}
          value={value}
          disabled={disabled || !onChange}
          aria-label={label}
          aria-description={why}
          aria-valuetext={display}
          onChange={(e) => onChange?.(Number(e.target.value))}
        />
        {ghost !== undefined && (
          <span className="vc-slider-ghost" style={{ ["--at" as string]: ghost }} aria-hidden />
        )}
        {marks?.map((m) => (
          <span key={m} className="vc-slider-mark" style={{ ["--at" as string]: m }} aria-hidden />
        ))}
      </span>
      {(display || why) && <span className="vc-slider-v tabular-nums">{display ?? why}</span>}
    </label>
  );
}

/* ---- what the controller did, what waits for a confirmation ---- */

function ActionLine() {
  const did = useController((s) => s.did);
  const seekTo = useController((s) => s.seekTo);
  const browse = useController((s) => s.browse);
  const takeover = useController((s) => s.takeover);
  const last = useController((s) => s.mirror.last);
  const armedKey = useArm((s) => s.armed?.key ?? null);
  const plan = useBooth((s) => s.plan);
  const started = useBooth((s) => s.started);
  const master = useBooth((s) => s.master);
  const title = browse === null ? "" : ((plan?.items[browse] as { title?: string } | undefined)?.title ?? "");
  const seekArmed = armedKey === "ctl-seek" && seekTo !== null;
  return (
    <div className="vc-lines" aria-live="polite" data-testid="controller-lines">
      {seekArmed && (
        <div className="vc-line" data-testid="vc-seek-pending">
          <span className="min-w-0 flex-1">{t("controller.seek_pending", { at: clock(seekTo!) })}</span>
          <button
            type="button"
            className="vc-text-btn vc-primary"
            onClick={() => {
              virtualControl("browsePress", { on: true });
              virtualControl("browsePress", { on: false });
            }}
            data-testid="vc-seek-confirm"
          >
            {t("controller.confirm")}
          </button>
        </div>
      )}
      {browse !== null && (
        <div className="vc-line" data-testid="vc-browse-line">
          <span className="min-w-0 flex-1">{t("controller.browse_line", { n: browse + 1, title })}</span>
          <button
            type="button"
            className="vc-text-btn vc-primary"
            onClick={() => runIntent({ fn: "load", type: "press" }, useController.getState().mapping)}
            data-testid="vc-load"
          >
            {started ? t("controller.load") : t("controller.select")}
          </button>
        </div>
      )}
      {takeover.master !== undefined && (
        <div className="vc-line" data-testid="vc-takeover">
          {t("controller.takeover", {
            at: `${Math.round(takeover.master * 100)} %`,
            to: `${Math.round(dbFader(master) * 100)} %`,
          })}
        </div>
      )}
      {did && (
        <p className="text-footnote text-[var(--label-2)]" data-testid="vc-did" data-fn={did.fn}>
          {did.text}
        </p>
      )}
      {last && (
        <p className="text-caption1 text-[var(--label-3)] tabular-nums" data-testid="vc-monitor">
          {t("controller.monitor", { msg: `${describeKey(last.key)} = ${last.value}` })}
        </p>
      )}
    </div>
  );
}

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

/* ---- MIDI Learn, export / import ---- */

export function LearnList({ open: openProp = false }: { open?: boolean }) {
  const mapping = useController((s) => s.mapping);
  const learn = useController((s) => s.learn);
  const active = useController((s) => s.active);
  const file = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(openProp);
  return (
    <details
      className="vc-learn"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      data-testid="controller-learn"
    >
      <summary className="vc-learn-sum">{t("controller.learn.title")}</summary>
      <p className="text-footnote text-[var(--label-2)]">
        {active ? t("controller.learn.footer") : t("controller.learn.need_controller")}
      </p>
      {learn && (
        <div className="vc-line" data-testid="controller-learn-waiting" role="status">
          <span className="min-w-0 flex-1">
            {t("controller.learn.waiting", { fn: fnLabel(learn), name: active ?? "" })}
          </span>
          <button type="button" className="vc-text-btn" onClick={() => startLearn(null)}>
            {t("controller.learn.cancel")}
          </button>
        </div>
      )}
      <ul className="vc-learn-list">
        {FNS.map((fn) => {
          const keys = keysFor(mapping, fn);
          const learned = mapping.bindings.some((b) => b.fn === fn);
          return (
            <li key={fn} className="vc-learn-row" data-fn={fn} data-testid="controller-learn-row">
              <span className="min-w-0 flex-1">
                <span className="block text-[var(--label)]">{fnLabel(fn)}</span>
                <span
                  className="text-caption1 block text-[var(--label-2)]"
                  data-testid="controller-learn-keys"
                >
                  {keys.length ? keys.map(describeKey).join(" · ") : t("controller.learn.none")}
                  {FN_KIND[fn] === "abs" ? ` · ${t("controller.learn.level")}` : ""}
                </span>
              </span>
              {learned && (
                <button type="button" className="vc-text-btn" onClick={() => forgetLearned(fn)}>
                  {t("controller.learn.forget")}
                </button>
              )}
              <button
                type="button"
                className="vc-text-btn"
                aria-pressed={learn === fn}
                disabled={!active}
                onClick={() => startLearn(learn === fn ? null : fn)}
                data-testid="controller-learn-btn"
              >
                {t("controller.learn.button")}
              </button>
            </li>
          );
        })}
      </ul>
      <MappingFileRow file={file} />
    </details>
  );
}

export function MappingFileRow({ file }: { file?: React.RefObject<HTMLInputElement | null> }) {
  const own = useRef<HTMLInputElement>(null);
  const input = file ?? own;
  const active = useController((s) => s.active);
  const mapping = useController((s) => s.mapping);
  return (
    <div className="vc-file-row">
      <button
        type="button"
        className="vc-text-btn"
        disabled={!active}
        onClick={() => {
          const blob = new Blob([exportActive()], { type: "application/json" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `${(active ?? "controller").replace(/[^\w-]+/g, "-")}.tdj-mapping.json`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        }}
        data-testid="controller-export"
      >
        <Download size={16} aria-hidden />
        {t("controller.export")}
      </button>
      <button
        type="button"
        className="vc-text-btn"
        disabled={!active}
        onClick={() => input.current?.click()}
        data-testid="controller-import"
      >
        <Upload size={16} aria-hidden />
        {t("controller.import")}
      </button>
      <button
        type="button"
        className="vc-text-btn"
        disabled={!active || !mapping.id.endsWith("-custom")}
        onClick={() => active && applyMapping(active, null)}
        data-testid="controller-reset"
      >
        <RotateCcw size={16} aria-hidden />
        {t("controller.reset")}
      </button>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid="controller-import-file"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          const r = importForActive(await f.text());
          toast(r.ok ? t("controller.import_ok") : t("controller.import_bad"));
        }}
      />
    </div>
  );
}

export function ControllerSettingsBody(): ReactNode {
  return (
    <div className="vc-settings">
      <ControllerStatus />
      <OfferBanner />
      <LearnList />
      <p className="text-footnote text-[var(--label-2)]">{t("controller.settings.open_booth")}</p>
    </div>
  );
}

/** the Controls panel's entry: opens the controller sheet */
export const openController = () => useController.setState({ open: true });
