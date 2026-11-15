"use client";
import "./transition.css";
import {
  type CurveShape,
  resolveTransition,
  TRANSITION_DEFAULTS,
  TRANSITION_RANGES,
  type TransitionEdit,
  type TransitionPreset,
  transitionKey,
} from "@tdj/core";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Play,
  Ruler,
  Sparkles,
  Square,
  TriangleAlert,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useIndicators } from "@/lib/booth/indicatorPrefs";
import { type BoothRow, durationLabel } from "@/lib/booth/plan";
import { bpmOf, keyOf } from "@/lib/booth/songInfo";
import type { PlanEntity } from "@/lib/booth/sources/types";
import { bandAt } from "@/lib/booth/spectral";
import { useBooth, type Waveform as WaveData } from "@/lib/booth/store";
import {
  BASS_CUT_DB,
  barsToSec,
  bassSwapPoints,
  dragHandle,
  gainInAt,
  gainOutAt,
  laneBoxes,
  lengthLabel,
  snapToBeat,
  type TransitionWindow,
  transitionWindow,
} from "@/lib/booth/transition";
import { t } from "@/lib/i18n";
import { DUR, EASE } from "@/lib/motion";
import { lockScroll } from "@/lib/scrollLock";
import { useSheets } from "@/lib/sheets";
import { toast } from "@/lib/toast";
import { Artwork } from "../ui/Artwork";

type PresetId = "auto" | TransitionPreset;
type Edge = "start" | "end" | "gap";
const SEC_CHOICES = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12];
const BAR_CHOICES = [0.5, 1, 2, 4, 8];
const CURVES: ReadonlyArray<CurveShape> = ["equalPower", "linear", "sCurve"];
/** the panel spans the middle of the lanes, as in the reference (15 % … 85 % of the width) */
const PANEL_L = 0.15;
const PANEL_W = 0.7;

/** The transition after plan item `i` exists when both sides are songs or cortinas (never a break). */
export function hasTransition(items: ReadonlyArray<BoothRow> | undefined, i: number): boolean {
  const a = items?.[i];
  const b = items?.[i + 1];
  return !!a && !!b && a.kind !== "break" && b.kind !== "break" && !!a.id && !!b.id;
}

/** "Fade 3 s" / "2.5 s" / "Blend 6 s": what the set list's gap marker prints. */
export function transitionSummary(it: BoothRow): string {
  const tr = it.transitionAfter;
  if (!tr) return `${it.gapAfterSec} s`;
  const name = presetLabel(tr.preset);
  if (tr.overlapSec > 0) return `${name} ${tr.overlapSec} s`;
  if (tr.preset === "gap") return `${it.gapAfterSec} s`;
  return `${name} ${tr.preset === "cortinaCut" ? tr.fadeOutSec : tr.fadeOutSec || tr.fadeInSec} s`;
}

function presetLabel(p: PresetId): string {
  switch (p) {
    case "auto":
      return t("booth.transition.auto");
    case "gap":
      return t("booth.transition.gap");
    case "fade":
      return t("booth.transition.fade");
    case "blend":
      return t("booth.transition.blend");
    case "rise":
      return t("booth.transition.rise");
    default:
      return t("booth.transition.cortina_cut");
  }
}
function presetHint(p: PresetId): string {
  switch (p) {
    case "auto":
      return t("booth.transition.auto_hint");
    case "gap":
      return t("booth.transition.gap_hint");
    case "fade":
      return t("booth.transition.fade_hint");
    case "blend":
      return t("booth.transition.blend_hint");
    case "rise":
      return t("booth.transition.rise_hint");
    default:
      return t("booth.transition.cortina_cut_hint");
  }
}
const curveLabel = (c: CurveShape) =>
  c === "linear"
    ? t("booth.transition.curve_linear")
    : c === "equalPower"
      ? t("booth.transition.curve_equal_power")
      : t("booth.transition.curve_s_curve");
const curveSub = (c: CurveShape) =>
  c === "linear"
    ? t("booth.transition.curve_linear_sub")
    : c === "equalPower"
      ? t("booth.transition.curve_equal_power_sub")
      : t("booth.transition.curve_s_curve_sub");

/** What the length pill sets for each preset. */
function lengthOf(e: TransitionEdit): number {
  const d = TRANSITION_DEFAULTS[e.preset];
  switch (e.preset) {
    case "gap":
      return e.gapSec ?? d.gapSec;
    case "fade":
    case "cortinaCut":
      return e.fadeOutSec ?? d.fadeOutSec;
    default:
      return e.overlapSec ?? d.overlapSec;
  }
}
function withLength(e: TransitionEdit, sec: number): TransitionEdit {
  switch (e.preset) {
    case "gap":
      return { ...e, gapSec: sec };
    case "fade":
      return { ...e, fadeOutSec: sec, fadeInSec: sec };
    case "cortinaCut":
      return { ...e, fadeOutSec: sec };
    case "blend":
      return { ...e, overlapSec: sec, fadeOutSec: sec, fadeInSec: sec };
    default:
      return { ...e, overlapSec: sec, fadeInSec: sec };
  }
}
function lengthRange(p: TransitionPreset): { min: number; max: number } {
  if (p === "gap") return TRANSITION_RANGES.gapSec;
  if (p === "blend" || p === "rise") return TRANSITION_RANGES.overlapSec;
  return { min: 0.5, max: TRANSITION_RANGES.fadeSec.max };
}

/** A Camelot key's colour on the wheel (1 … 12 around the hue circle; B a shade deeper than A). */
function camelotColour(k: string): string {
  const m = /^(\d{1,2})([AB])$/i.exec(k.trim());
  if (!m) return "hsl(0 0% 80%)";
  const hue = ((Number(m[1]) - 1) * 30 + 300) % 360;
  return m[2]!.toUpperCase() === "A" ? `hsl(${hue} 72% 78%)` : `hsl(${hue} 62% 66%)`;
}

/**
 * Wave 4 — the transition editor, laid out like a playlist "Mix" editor in T-DJ's own dark look: a full-screen page
 * (X, Beta, •••, Save), the outgoing side's row, two full-bleed coloured waveform lanes on one time axis with a dark
 * panel over the transition (each lane's box, its volume line and its bass line, the beat grid, the audition button
 * between the lanes and the length pill under them), the incoming side's row, the presets and the Volume and EQ
 * rows. Tango first: inside a tanda the default stays a gap, La Cumparsita plays whole, a cortina can be cut.
 * On an iPad or a desktop the same page is a full-height panel at most 760 px wide.
 */
export function TransitionSheet({ at, onClose }: { at: number | null; onClose: () => void }) {
  const items = useBooth((s) => s.plan?.items);
  const [i, setI] = useState<number | null>(at);
  useEffect(() => setI(at), [at]);
  const open = i !== null && hasTransition(items, i);
  // the transitions of the night, for previous / next (breaks have none)
  const all = useMemo(
    () => (items ? items.map((_, k) => k).filter((k) => hasTransition(items, k)) : []),
    [items],
  );
  const pos = i === null ? -1 : all.indexOf(i);
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const close = useRef(onClose);
  close.current = onClose;

  // a page over everything: it counts as an open sheet (the phone's floating action leaves, a toast lands inside),
  // locks the page's scroll and gives focus back where it was
  useEffect(() => {
    if (!open) return;
    const { _inc, _dec } = useSheets.getState();
    _inc();
    const prev = document.activeElement as HTMLElement | null;
    const unlock = lockScroll();
    return () => {
      _dec();
      unlock();
      prev?.focus?.({ preventScroll: true });
    };
  }, [open]);

  const tree = (
    <AnimatePresence>
      {open && i !== null && (
        <motion.div
          key="trx"
          className="trx-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: DUR.base } }}
          exit={{ opacity: 0, transition: { duration: DUR.fast } }}
        >
          <motion.div
            className="trx"
            role="dialog"
            aria-modal="true"
            aria-labelledby="trx-title"
            data-testid="booth-transition-sheet"
            initial={reduced ? false : { y: 24 }}
            animate={{ y: 0, transition: { duration: DUR.base, ease: EASE.out } }}
          >
            <Editor
              key={i}
              i={i}
              prev={pos > 0 ? all[pos - 1]! : null}
              next={pos >= 0 && pos < all.length - 1 ? all[pos + 1]! : null}
              onStep={setI}
              onClose={() => close.current()}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
  return mounted ? createPortal(tree, document.body) : null;
}

type PickerId = "length" | "volume" | "eq" | "more";

function Editor({
  i,
  prev,
  next,
  onStep,
  onClose,
}: {
  i: number;
  prev: number | null;
  next: number | null;
  onStep: (i: number) => void;
  onClose: () => void;
}) {
  const a = useBooth((s) => s.plan?.items[i])!;
  const b = useBooth((s) => s.plan?.items[i + 1])!;
  const ea = useBooth((s) => s.entities[i] ?? null);
  const eb = useBooth((s) => s.entities[i + 1] ?? null);
  const stored = useBooth((s) =>
    a.id && b.id ? s.playlist?.booth?.transitions?.[transitionKey(a.id, b.id)] : undefined,
  );
  const nightGap = useBooth((s) => s.plan?.gapOverrides?.[a.tanda] ?? s.settings.gapSec);
  const settings = useBooth((s) => s.settings);
  const started = useBooth((s) => s.started);
  const audition = useBooth((s) => s.audition);
  const outputs = useBooth((s) => s.outputs);
  const b0 = useBooth.getState();
  const [draft, setDraft] = useState<TransitionEdit | null>(stored ? { ...stored } : null);
  const [busy, setBusy] = useState(false);
  const [waves, setWaves] = useState<[WaveData | null, WaveData | null] | null>(null);
  const [picker, setPicker] = useState<PickerId | null>(null);
  const ind = useIndicators();
  const bpm = bpmOf(ea)?.value ?? bpmOf(eb)?.value ?? null;
  const [unit, setUnit] = useState<"bars" | "sec">(bpm ? "bars" : "sec");
  const dirty = JSON.stringify(draft) !== JSON.stringify(stored ?? null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    void Promise.all([b0.waveformOf(i), b0.waveformOf(i + 1)]).then((w) => live && setWaves(w));
    return () => {
      live = false;
    };
  }, [i, b0]);

  // Escape closes the open menu, then the editor; Tab stays inside; the close button takes focus first
  const pickerRef = useRef(picker);
  pickerRef.current = picker;
  useEffect(() => {
    const t0 = setTimeout(() => root.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (pickerRef.current) setPicker(null);
        else onClose();
      }
      if (e.key === "Tab" && root.current) {
        const f = [
          ...root.current.querySelectorAll<HTMLElement>(
            "button:not([disabled]), [tabindex='0'], a[href], select:not([disabled])",
          ),
        ].filter((el) => el.getClientRects().length > 0);
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      clearTimeout(t0);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  const save = () => {
    if (!dirty) return;
    b0.setTransition(i, draft);
    toast(draft ? t("booth.transition.saved") : t("booth.transition.saved_auto"));
    onClose();
  };

  const ctx = {
    from: { kind: a.kind, lengthSec: a.lengthSec, tanda: a.tanda },
    to: { kind: b.kind, lengthSec: b.lengthSec, tanda: b.tanda },
    cortinaFadeOutSec: a.kind === "cortina" ? (a.fadeOutSec ?? settings.cortinaFadeOutSec) : undefined,
  };
  const winOpts = {
    outLen: a.lengthSec,
    inLen: b.lengthSec,
    gapSec: nightGap,
    songFadeOutSec: settings.songFadeOutSec,
    outKind: a.kind,
    cortinaFadeOutSec: a.fadeOutSec ?? settings.cortinaFadeOutSec,
  };
  const tr = draft ? resolveTransition(draft, ctx) : null;
  const w = transitionWindow(tr, winOpts);
  const preset: PresetId = tr?.preset ?? "auto";
  const cumparsita = a.kind === "closing" || b.kind === "closing";
  const insideTanda = a.kind === "track" && b.kind === "track" && a.tanda === b.tanda;
  const presets: PresetId[] = [
    "auto",
    "fade",
    "rise",
    "blend",
    "gap",
    ...(a.kind === "cortina" ? (["cortinaCut"] as const) : []),
  ];
  const pick = (p: PresetId) => {
    if (p === "auto") return setDraft(null);
    const d = TRANSITION_DEFAULTS[p];
    setDraft({
      preset: p,
      ...(p === "gap" || p === "fade" || p === "cortinaCut"
        ? { gapSec: p === "gap" ? nightGap : d.gapSec }
        : {}),
      ...(p === "cortinaCut" ? { fadeOutSec: ctx.cortinaFadeOutSec ?? d.fadeOutSec } : {}),
    });
  };
  // Auto, dragged or lengthened: the plain preset it stands for
  const asEdit = (): TransitionEdit =>
    draft ??
    (a.kind === "cortina"
      ? { preset: "cortinaCut", gapSec: nightGap, fadeOutSec: ctx.cortinaFadeOutSec }
      : settings.songFadeOutSec > 0
        ? { preset: "fade", gapSec: nightGap, fadeOutSec: settings.songFadeOutSec, fadeInSec: 0 }
        : { preset: "gap", gapSec: nightGap });
  const effective = asEdit();
  const effTr = resolveTransition(effective, ctx);

  const hearing = audition?.via === "transition" && audition.i === i;
  const blocked = b0.cueBlocked();
  const cannotHear = started && !!blocked;
  const where = blocked
    ? t("booth.transition.on_this_device")
    : t("booth.transition.in_your_headphones", {
        name: outputs.devices.find((d) => d.id === outputs.cue)?.label ?? t("booth.songSheet.headphones"),
      });
  const audit = async () => {
    if (hearing) return b0.stopAudition();
    setBusy(true);
    const why = await b0.auditionTransition(i, draft);
    setBusy(false);
    if (why) toast(t("booth.transition.can_t_audition", { why }));
  };

  // the length pill: the overlap of a blend or rise, the fades of a fade, the silence of a gap
  const len = lengthOf({ ...effective, ...effTr });
  const range = lengthRange(effTr.preset);
  const choices = (() => {
    const base = unit === "bars" && bpm ? BAR_CHOICES.map((x) => barsToSec(x, bpm)) : SEC_CHOICES;
    const list = base.filter((s) => s >= range.min && s <= range.max);
    if (!list.includes(len)) list.push(len);
    return [...new Set(list)].sort((x, y) => x - y);
  })();
  const lengthEditable = !(cumparsita && preset === "auto");

  const sameCurve = w.curveOut === w.curveIn;
  const hasFade = w.outFade.len > 0 || w.inFade.len > 0;
  const volumeValue = !hasFade
    ? t("booth.transition.eq_none")
    : sameCurve
      ? curveLabel(w.curveOut)
      : t("booth.transition.curve_mixed");
  const canSwap = !!tr && tr.overlapSec > 0;
  const noAudio = waves !== null && (!waves[0] || !waves[1]);
  const warning = cumparsita
    ? t("booth.transition.cumparsita_whole")
    : insideTanda && (preset === "blend" || preset === "rise")
      ? t("booth.transition.inside_tanda_warning")
      : null;

  return (
    <div className="trx-inner" ref={root} data-preset={preset} data-dirty={dirty || undefined}>
      <h2 id="trx-title" className="sr-only">
        {t("booth.transition.title")}: {sideName(a)} → {sideName(b)}
      </h2>
      <div className="trx-top">
        <button
          type="button"
          className="trx-round"
          onClick={onClose}
          aria-label={t("booth.transition.close")}
          data-hint={dirty ? t("booth.transition.close_discards") : t("booth.transition.close")}
          data-testid="booth-tr-close"
          data-autofocus
        >
          <X size={22} strokeWidth={2.25} aria-hidden />
        </button>
        <span className="flex-1" />
        <span className="trx-beta" data-hint={t("booth.transition.beta_hint")}>
          {t("booth.transition.beta")}
        </span>
        <button
          type="button"
          className="trx-round"
          aria-label={t("booth.transition.more")}
          aria-haspopup="menu"
          aria-expanded={picker === "more"}
          onClick={() => setPicker("more")}
          data-hint={t("booth.transition.more_hint")}
          data-testid="booth-tr-more"
        >
          <Ellipsis size={22} strokeWidth={2.25} aria-hidden />
        </button>
        <button
          type="button"
          className="trx-save"
          disabled={!dirty}
          onClick={save}
          data-hint={dirty ? t("booth.transition.unsaved") : t("booth.transition.save_hint")}
          data-testid="booth-tr-save"
        >
          {t("booth.transition.save")}
        </button>
      </div>
      {/* a toast raised while the editor is open lands here (Toast.tsx portals into the topmost slot) */}
      <div className="sheet-status-slot trx-status" data-sheet-status />

      <div className="trx-scroll hide-scrollbar">
        <Side row={a} entity={ea} which="out" bpmOn={ind.bpm} keyOn={ind.key} />
        <Stage
          a={a}
          b={b}
          w={w}
          waves={waves}
          bpm={bpm}
          editable={lengthEditable}
          onDrag={(which, sec) => setDraft(dragHandle(asEdit(), which, sec))}
          showGap={effTr.preset === "fade"}
          play={
            <button
              type="button"
              className="trx-play"
              onClick={() => void audit()}
              disabled={busy || (cannotHear && !hearing)}
              aria-label={hearing ? t("booth.transition.stop_audition") : t("booth.transition.audition")}
              aria-pressed={hearing}
              data-hint={cannotHear ? (blocked ?? "") : t("booth.transition.audition_hint", { where })}
              data-testid="booth-tr-audition"
              data-where={blocked ? "device" : "headphones"}
            >
              {hearing ? (
                <Square size={18} fill="currentColor" strokeWidth={0} aria-hidden />
              ) : (
                <Play size={20} fill="currentColor" strokeWidth={0} aria-hidden />
              )}
            </button>
          }
          pill={
            <button
              type="button"
              className="trx-pill"
              onClick={() => setPicker("length")}
              disabled={!lengthEditable}
              aria-haspopup="menu"
              aria-expanded={picker === "length"}
              aria-label={`${t("booth.transition.length")}: ${lengthLabel(len, bpm, unit)}`}
              data-hint={t("booth.transition.length_hint")}
              data-testid="booth-tr-length"
              data-value={len}
            >
              <span className="tabular-nums">{lengthLabel(len, bpm, unit)}</span>
              <ChevronDown size={16} strokeWidth={2.25} aria-hidden />
            </button>
          }
        />
        <Side row={b} entity={eb} which="in" bpmOn={ind.bpm} keyOn={ind.key} />

        <div className="trx-presets-head">
          <span>{t("booth.transition.presets")}</span>
        </div>
        <div
          className="trx-presets hide-scrollbar"
          role="radiogroup"
          aria-label={t("booth.transition.presets")}
        >
          {presets.map((p) => {
            const off = (p === "blend" || p === "rise") && cumparsita;
            return (
              // biome-ignore lint/a11y/useSemanticElements: the presets read as one choice (WAI-ARIA radio group pattern)
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={preset === p}
                disabled={off}
                onClick={() => pick(p)}
                data-testid={`booth-tr-preset-${p}`}
                data-hint={off ? t("booth.transition.cumparsita_whole") : presetHint(p)}
              >
                {p === "auto" && <Sparkles size={17} strokeWidth={2} aria-hidden />}
                {presetLabel(p)}
              </button>
            );
          })}
        </div>
        {warning && (
          <p className="trx-warn" data-testid="booth-tr-note">
            <TriangleAlert size={14} strokeWidth={2} aria-hidden />
            <span>{warning}</span>
          </p>
        )}

        <div className="trx-rows">
          <SettingRow
            tick="var(--trx-volume)"
            label={t("booth.transition.volume")}
            value={volumeValue}
            disabled={!hasFade}
            hint={hasFade ? t("booth.transition.advanced_footer") : t("booth.transition.volume_needs_fade")}
            open={picker === "volume"}
            onOpen={() => setPicker("volume")}
            testId="booth-tr-volume"
          />
          <SettingRow
            tick="var(--trx-eq)"
            label={t("booth.transition.eq")}
            value={tr?.bassSwap ? t("booth.transition.eq_bass_swap") : t("booth.transition.eq_none")}
            disabled={!canSwap}
            hint={
              canSwap ? t("booth.transition.bass_swap_hint") : t("booth.transition.bass_swap_needs_overlap")
            }
            open={picker === "eq"}
            onOpen={() => setPicker("eq")}
            testId="booth-tr-eq"
          />
        </div>
      </div>

      <Picker
        open={picker === "length"}
        title={t("booth.transition.length")}
        onClose={() => setPicker(null)}
        testId="booth-tr-picker-length"
        options={choices.map((s) => ({
          id: String(s),
          label: lengthLabel(s, bpm, unit),
          sub: unit === "bars" && bpm ? `${s} s` : undefined,
          checked: s === len,
          onPick: () => setDraft(withLength(asEdit(), s)),
        }))}
      />
      <Picker
        open={picker === "volume"}
        title={t("booth.transition.volume")}
        onClose={() => setPicker(null)}
        testId="booth-tr-picker-volume"
        options={CURVES.map((c) => ({
          id: c,
          label: curveLabel(c),
          sub: curveSub(c),
          checked: sameCurve && w.curveOut === c,
          onPick: () => setDraft({ ...asEdit(), curveOut: c, curveIn: c }),
        }))}
      />
      <Picker
        open={picker === "eq"}
        title={t("booth.transition.eq")}
        onClose={() => setPicker(null)}
        testId="booth-tr-picker-eq"
        options={[
          {
            id: "none",
            label: t("booth.transition.eq_none"),
            sub: t("booth.transition.eq_none_sub"),
            checked: !tr?.bassSwap,
            onPick: () => draft && setDraft({ ...draft, bassSwap: false }),
          },
          {
            id: "bassSwap",
            label: t("booth.transition.eq_bass_swap"),
            sub: t("booth.transition.bass_swap_hint"),
            checked: !!tr?.bassSwap,
            onPick: () => draft && setDraft({ ...draft, bassSwap: true }),
          },
        ]}
      />
      <Picker
        open={picker === "more"}
        title={`${sideName(a)} → ${sideName(b)}`}
        onClose={() => setPicker(null)}
        testId="booth-tr-picker-more"
        options={[
          {
            id: "prev",
            label: t("booth.transition.previous"),
            icon: <ChevronLeft size={18} aria-hidden />,
            disabled: prev === null || dirty,
            sub: dirty ? t("booth.transition.save_or_cancel_first") : undefined,
            onPick: () => prev !== null && onStep(prev),
          },
          {
            id: "next",
            label: t("booth.transition.next"),
            icon: <ChevronRight size={18} aria-hidden />,
            disabled: next === null || dirty,
            sub: dirty ? t("booth.transition.save_or_cancel_first") : undefined,
            onPick: () => next !== null && onStep(next),
          },
          ...(bpm
            ? [
                {
                  id: "unit",
                  label:
                    unit === "bars" ? t("booth.transition.show_seconds") : t("booth.transition.show_bars"),
                  sub:
                    unit === "bars"
                      ? t("booth.transition.seconds_hint")
                      : t("booth.transition.bars_hint", { bpm }),
                  icon: <Ruler size={18} aria-hidden />,
                  onPick: () => setUnit(unit === "bars" ? "sec" : "bars"),
                },
              ]
            : []),
        ]}
        info={
          <>
            <p data-testid="booth-tr-hear">
              {cannotHear
                ? blocked
                : hearing
                  ? t("booth.transition.playing_where", { where })
                  : t("booth.transition.audition_plays", { where })}
            </p>
            {hearing && audition?.note && <p data-testid="booth-tr-hear-note">{audition.note}</p>}
            {noAudio && <p data-testid="booth-tr-noaudio">{t("booth.transition.no_waveform")}</p>}
            {insideTanda && !warning && <p>{t("booth.transition.inside_tanda_default")}</p>}
            <p>{presetHint(preset)}</p>
          </>
        }
      />
    </div>
  );
}

function sideName(r: BoothRow): string {
  if (r.kind === "cortina") return t("booth.transition.cortina");
  if (r.kind === "closing") return "La Cumparsita";
  return r.title;
}

function SettingRow({
  tick,
  label,
  value,
  disabled,
  hint,
  open,
  onOpen,
  testId,
}: {
  tick: string;
  label: string;
  value: string;
  disabled: boolean;
  hint: string;
  open: boolean;
  onOpen: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      className="trx-row"
      onClick={onOpen}
      disabled={disabled}
      aria-haspopup="menu"
      aria-expanded={open}
      data-hint={hint}
      data-testid={testId}
    >
      <span className="trx-tick" style={{ background: tick }} aria-hidden />
      <span className="trx-row-label">{label}</span>
      <span className="trx-row-value">{value}</span>
      <ChevronDown size={18} strokeWidth={2.25} aria-hidden />
    </button>
  );
}

interface PickerOption {
  id: string;
  label: string;
  sub?: string;
  checked?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  onPick: () => void;
}
/** An option menu inside the editor (a card rising from its foot, as the reference's menus do). */
function Picker({
  open,
  title,
  options,
  info,
  onClose,
  testId,
}: {
  open: boolean;
  title: string;
  options: PickerOption[];
  info?: ReactNode;
  onClose: () => void;
  testId: string;
}) {
  const reduced = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const t0 = setTimeout(
      () =>
        box.current
          ?.querySelector<HTMLElement>('[aria-checked="true"]:not([disabled]), button:not([disabled])')
          ?.focus(),
      30,
    );
    return () => clearTimeout(t0);
  }, [open]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="picker"
          className="trx-picker-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: DUR.fast } }}
          exit={{ opacity: 0, transition: { duration: DUR.fast } }}
        >
          <button
            type="button"
            className="trx-picker-scrim"
            aria-label={t("booth.transition.close")}
            tabIndex={-1}
            onClick={onClose}
          />
          <motion.div
            ref={box}
            className="trx-picker"
            role="menu"
            aria-label={title}
            data-testid={testId}
            initial={reduced ? false : { y: 40 }}
            animate={{ y: 0, transition: { duration: DUR.base, ease: EASE.out } }}
          >
            <div className="trx-picker-head">
              <p className="trx-picker-title">{title}</p>
              <button
                type="button"
                className="trx-round trx-round-s"
                onClick={onClose}
                aria-label={t("booth.transition.close")}
              >
                <X size={18} strokeWidth={2.25} aria-hidden />
              </button>
            </div>
            <div className="trx-picker-list">
              {options.map((o) => {
                const body = (
                  <>
                    {o.icon}
                    <span className="min-w-0 flex-1">
                      <span className="trx-opt-label">{o.label}</span>
                      {o.sub && <span className="trx-opt-sub">{o.sub}</span>}
                    </span>
                    {o.checked && <Check size={18} strokeWidth={2.5} aria-hidden />}
                  </>
                );
                const props = {
                  type: "button" as const,
                  disabled: o.disabled,
                  "data-testid": `${testId}-${o.id}`,
                  onClick: () => {
                    o.onPick();
                    onClose();
                  },
                };
                return o.checked === undefined ? (
                  <button key={o.id} role="menuitem" {...props}>
                    {body}
                  </button>
                ) : (
                  <button key={o.id} role="menuitemradio" aria-checked={o.checked} {...props}>
                    {body}
                  </button>
                );
              })}
            </div>
            {info && <div className="trx-picker-info">{info}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** A side: artwork, title, artist; BPM and below it the Camelot key chip and the length. */
function Side({
  row,
  entity,
  which,
  bpmOn,
  keyOn,
}: {
  row: BoothRow;
  entity: PlanEntity;
  which: "out" | "in";
  bpmOn: boolean;
  keyOn: boolean;
}) {
  const bpm = bpmOn ? bpmOf(entity) : null;
  const key = keyOn ? keyOf(entity) : null;
  return (
    <div className="trx-side" data-side={which} data-testid={`booth-tr-${which}`}>
      <Artwork entity={entity} orchestra={row.artist} size={52} />
      <div className="min-w-0 flex-1">
        <p className="trx-side-title">{row.kind === "closing" ? "La Cumparsita" : row.title}</p>
        <p className="trx-side-sub">
          {row.kind === "cortina" ? t("booth.transition.cortina_by", { artist: row.artist }) : row.artist}
        </p>
      </div>
      <div className="trx-facts">
        <span data-hint={bpm ? `${bpm.value} BPM · ${bpm.source}` : t("bpmKey.bpm_unknown")}>
          {bpm ? t("booth.transition.bpm", { bpm: bpm.value }) : "–"}
        </span>
        <span className="trx-facts-line">
          {key && (
            <span
              className="trx-key"
              style={{ background: camelotColour(key.camelot) }}
              data-hint={t("bpmKey.key_line", { camelot: key.camelot, name: key.name, source: key.source })}
              data-testid="booth-tr-key"
            >
              {key.camelot}
            </span>
          )}
          <span>{durationLabel(row.lengthSec)}</span>
        </span>
      </div>
    </div>
  );
}

interface Axis {
  /** the panel's time span (seconds relative to the outgoing's end) */
  start: number;
  end: number;
}

/**
 * The two lanes, full bleed, on one time axis (seconds relative to the outgoing side's end): the outgoing on top
 * (its ending), the incoming below (its start), each a low / mid / high waveform mirrored around its centre line,
 * dimmed where it is not heard. Over the transition a dark panel: each lane's blue box with its edges to drag (they
 * snap to the beat when the BPM is known), its yellow volume line, the pink bass line of a bass swap and the beat
 * grid; the audition button on the panel's middle edge and the length pill on its foot.
 */
function Stage({
  a,
  b,
  w,
  waves,
  bpm,
  editable,
  showGap,
  onDrag,
  play,
  pill,
}: {
  a: BoothRow;
  b: BoothRow;
  w: TransitionWindow;
  waves: [WaveData | null, WaveData | null] | null;
  bpm: number | null;
  editable: boolean;
  showGap: boolean;
  onDrag: (which: Edge, sec: number) => void;
  play: ReactNode;
  pill: ReactNode;
}) {
  const el = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ W: 390, P: 340 });
  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    const put = () => setSize({ W: node.clientWidth || 390, P: node.clientHeight || 340 });
    put();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(put) : null;
    ro?.observe(node);
    return () => ro?.disconnect();
  }, []);
  const { W, P } = size;
  const boxes = laneBoxes(w);
  // while an edge is dragged the axis holds still (it re-centres when the finger lifts)
  const [frozen, setFrozen] = useState<Axis | null>(null);
  const live: Axis = (() => {
    const s = boxes.panel.start;
    const e = boxes.panel.end;
    const minSpan = 4;
    if (e - s >= minSpan) return { start: s, end: e };
    const mid = (s + e) / 2;
    return { start: mid - minSpan / 2, end: mid + minSpan / 2 };
  })();
  const axis = frozen ?? live;
  const secPerPx = (axis.end - axis.start) / (PANEL_W * W);
  const T0 = axis.start - PANEL_L * W * secPerPx;
  const X = (t: number) => (t - T0) / secPerPx;

  // the lanes' geometry (fractions of the panel's height, as in the reference)
  const lane = {
    out: { cy: 0.27 * P, top: 0.055 * P, bottom: 0.465 * P },
    in: { cy: 0.73 * P, top: 0.535 * P, bottom: 0.945 * P },
  };
  const amp = 0.19 * P;
  const [wa, wb] = waves ?? [null, null];
  const outEnd = (d: WaveData) =>
    d.from === "file" ? Math.min(d.durationSec, (a.trimInSec ?? 0) + a.lengthSec) : d.durationSec;
  const inStart0 = (d: WaveData) => (d.from === "file" ? (b.trimInSec ?? 0) : 0);
  const levels = (d: WaveData, sec: number) => {
    if (d.bands) return bandAt(d.bands, sec);
    if (sec < 0 || sec > d.durationSec) return null;
    const v = d.peaks[Math.min(d.peaks.length - 1, Math.floor((sec / d.durationSec) * d.peaks.length))] ?? 0;
    return { low: v, mid: v * 0.7, high: v * 0.35 };
  };
  /** three nested mirrored areas (lows outermost) across the whole width */
  const wavePaths = (which: "out" | "in"): [string, string, string] | null => {
    const d = which === "out" ? wa : wb;
    if (!d) return null;
    const cy = lane[which].cy;
    const step = 2;
    const n = Math.ceil(W / step) + 1;
    const tops: [number[], number[], number[]] = [[], [], []];
    const xs: number[] = [];
    for (let c = 0; c < n; c++) {
      const x = Math.min(W, c * step);
      const tm = T0 + x * secPerPx;
      const sec = which === "out" ? outEnd(d) + tm : inStart0(d) + (tm - w.inStart);
      const v = levels(d, sec);
      const hi = (v?.high ?? 0) * 0.42;
      const md = Math.max((v?.mid ?? 0) * 0.74, hi);
      const lo = Math.max(v?.low ?? 0, md);
      xs.push(x);
      tops[0].push(lo * amp);
      tops[1].push(md * amp);
      tops[2].push(Math.max(hi * amp, v ? 0.6 : 0));
    }
    const path = (h: number[]) => {
      let s = `M${xs[0]!.toFixed(1)},${(cy - h[0]!).toFixed(1)}`;
      for (let k = 1; k < xs.length; k++) s += `L${xs[k]!.toFixed(1)},${(cy - h[k]!).toFixed(1)}`;
      for (let k = xs.length - 1; k >= 0; k--) s += `L${xs[k]!.toFixed(1)},${(cy + h[k]!).toFixed(1)}`;
      return `${s}Z`;
    };
    return [path(tops[0]), path(tops[1]), path(tops[2])];
  };
  const px0 = X(axis.start);
  const px1 = X(axis.end);
  // where each side is heard (the rest of its lane is dimmed)
  const outHeardTo = X(Math.min(0, w.outStop));
  const inHeardFrom = X(w.inStart);

  const volLine = (which: "out" | "in") => {
    const L = lane[which];
    const g = which === "out" ? gainOutAt : gainInAt;
    const n = 120;
    const pts: string[] = [];
    for (let k = 0; k <= n; k++) {
      const tm = axis.start + ((axis.end - axis.start) * k) / n;
      const y = L.cy + (1 - g(w, tm)) * (L.bottom - L.cy);
      pts.push(`${X(tm).toFixed(1)},${y.toFixed(1)}`);
    }
    // a hard step (a gap's end, a rise's start) is drawn as the vertical it is
    return pts.join(" ");
  };
  const swap = bassSwapPoints(w);
  const eqLine = (which: "out" | "in") => {
    if (!swap) return null;
    const L = lane[which];
    const y = (db: number) => L.cy + (db / BASS_CUT_DB) * (L.bottom - L.cy);
    const pts = which === "out" ? swap.outLow : swap.inLow;
    const all: Array<[number, number]> = [
      [axis.start, pts[0]![1]],
      ...pts,
      [axis.end, pts[pts.length - 1]![1]],
    ];
    return all.map(([tm, db]) => `${X(tm).toFixed(1)},${y(db).toFixed(1)}`).join(" ");
  };
  const grid = (() => {
    if (!bpm) return [] as Array<{ x: number; bar: boolean }>;
    const beat = 60 / bpm;
    const out: Array<{ x: number; bar: boolean }> = [];
    for (let k = Math.ceil(axis.start / beat); k * beat <= axis.end + 1e-6; k++)
      out.push({ x: X(k * beat), bar: k % 4 === 0 });
    return out.length > 200 ? [] : out;
  })();

  const drag = (which: Edge) => (ev: React.PointerEvent<HTMLDivElement>) => {
    if (!editable) return;
    ev.preventDefault();
    const target = ev.currentTarget;
    target.setPointerCapture(ev.pointerId);
    const held: Axis = axis;
    setFrozen(held);
    const sp = (held.end - held.start) / (PANEL_W * W);
    const t0 = held.start - PANEL_L * W * sp;
    const move = (e: PointerEvent) => {
      const r = el.current?.getBoundingClientRect();
      if (r && r.width > 0) onDrag(which, snapToBeat(t0 + (e.clientX - r.left) * sp, bpm));
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      setFrozen(null);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };
  const edgeAt = (which: Edge) =>
    which === "start" ? boxes.out.start : which === "end" ? boxes.in.end : boxes.in.start;
  const key = (which: Edge) => (e: React.KeyboardEvent) => {
    if (!editable) return;
    const v = edgeAt(which);
    const beat = bpm ? 60 / bpm : 0.5;
    const step = e.shiftKey ? (bpm ? beat * 4 : 2) : beat;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") onDrag(which, snapToBeat(v - step, bpm));
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") onDrag(which, snapToBeat(v + step, bpm));
    else return;
    e.preventDefault();
  };
  const edges: Array<{ which: Edge; lane: "out" | "in" }> = [
    { which: "start", lane: "out" },
    ...(showGap ? [{ which: "gap" as const, lane: "in" as const }] : []),
    { which: "end", lane: "in" },
  ];
  const waveOut = wavePaths("out");
  const waveIn = wavePaths("in");
  const lanesSvg = (which: "out" | "in", paths: [string, string, string] | null) => {
    const L = lane[which];
    if (!paths)
      return (
        <line x1={0} x2={W} y1={L.cy} y2={L.cy} className="trx-flat" data-testid={`booth-tr-flat-${which}`} />
      );
    const heard = which === "out" ? { x: 0, w: Math.max(0, outHeardTo) } : { x: inHeardFrom, w: W };
    const id = `trx-clip-${which}`;
    const body = (
      <>
        <path d={paths[0]} className="trx-band-low" />
        <path d={paths[1]} className="trx-band-mid" />
        <path d={paths[2]} className="trx-band-high" />
      </>
    );
    return (
      <g data-testid={`booth-tr-wave-${which}`}>
        <clipPath id={id}>
          <rect x={heard.x} y={0} width={Math.max(0, heard.w)} height={P} />
        </clipPath>
        <g className="trx-wave-dim">{body}</g>
        <g clipPath={`url(#${id})`}>{body}</g>
      </g>
    );
  };
  const boxRect = (which: "out" | "in") => {
    const L = lane[which];
    const s = which === "out" ? boxes.out : boxes.in;
    const x0 = X(s.start);
    const x1 = X(s.end);
    return (
      <rect
        x={x0}
        y={L.top}
        width={Math.max(0, x1 - x0)}
        height={L.bottom - L.top}
        className="trx-box"
        data-testid={`booth-tr-box-${which}`}
      />
    );
  };
  return (
    <div className="trx-stage-wrap">
      <div
        className="trx-stage"
        ref={el}
        data-testid="booth-tr-stage"
        data-has-peaks={(wa && wb && true) || undefined}
        data-has-bands={(wa?.bands && wb?.bands && true) || undefined}
      >
        <svg width={W} height={P} viewBox={`0 0 ${W} ${P}`} aria-hidden>
          <rect x={px0} y={0} width={Math.max(0, px1 - px0)} height={P} rx={16} className="trx-panel" />
          {grid.map((g) => (
            <line
              key={g.x}
              x1={g.x}
              x2={g.x}
              y1={6}
              y2={P - 6}
              className={g.bar ? "trx-grid trx-grid-bar" : "trx-grid"}
            />
          ))}
          {lanesSvg("out", waveOut)}
          {lanesSvg("in", waveIn)}
          {boxRect("out")}
          {boxRect("in")}
          <polyline points={volLine("out")} className="trx-vol booth-tr-line-out" />
          <polyline points={volLine("in")} className="trx-vol booth-tr-line-in" />
          {swap && <polyline points={eqLine("out") ?? ""} className="trx-eq" data-testid="booth-tr-eq-out" />}
          {swap && <polyline points={eqLine("in") ?? ""} className="trx-eq" data-testid="booth-tr-eq-in" />}
        </svg>
        <div
          className="trx-panel-hit"
          style={{ left: px0, width: Math.max(0, px1 - px0) }}
          data-testid="booth-tr-box"
          data-start={w.box.start}
          data-end={w.box.end}
          data-out-start={boxes.out.start}
          data-in-start={boxes.in.start}
          data-in-end={boxes.in.end}
        />
        {edges.map(({ which, lane: ln }) => {
          const v = edgeAt(which);
          const L = lane[ln];
          return (
            <div
              key={which}
              className="trx-edge"
              style={{ left: X(v), top: L.top, height: L.bottom - L.top }}
              role="slider"
              tabIndex={editable ? 0 : -1}
              aria-label={
                which === "start"
                  ? t("booth.transition.handle_start")
                  : which === "end"
                    ? t("booth.transition.handle_end")
                    : t("booth.transition.handle_gap")
              }
              aria-valuemin={Math.round(axis.start - 12)}
              aria-valuemax={Math.round(axis.end + 12)}
              aria-valuenow={Math.round(v * 10) / 10}
              aria-valuetext={t("booth.transition.handle_value", {
                sec: Math.round(Math.abs(v) * 10) / 10,
                p1: v < 0 ? "−" : "+",
              })}
              aria-disabled={!editable || undefined}
              data-hint={
                which === "start"
                  ? t("booth.transition.handle_start_hint")
                  : which === "end"
                    ? t("booth.transition.handle_end_hint")
                    : t("booth.transition.handle_gap_hint")
              }
              data-testid={which === "gap" ? "booth-tr-gap-edge" : `booth-tr-${which}`}
              onPointerDown={drag(which)}
              onKeyDown={key(which)}
            />
          );
        })}
        <div className="trx-play-at" style={{ left: (px0 + px1) / 2, top: 0.5 * P }}>
          {play}
        </div>
        <div className="trx-pill-at" style={{ left: (px0 + px1) / 2, top: P }}>
          {pill}
        </div>
      </div>
    </div>
  );
}
