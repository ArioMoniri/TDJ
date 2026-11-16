"use client";
import "./transition.css";
import {
  type CurveShape,
  resolveTransition,
  silenceJoin,
  TRANSITION_DEFAULTS,
  TRANSITION_RANGES,
  type TransitionEdit,
  type TransitionEq,
  type TransitionPreset,
  transitionKey,
} from "@tdj/core";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Magnet,
  Maximize2,
  Play,
  Ruler,
  Sparkles,
  Speaker,
  Square,
  Timer,
  TriangleAlert,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useIndicators } from "@/lib/booth/indicatorPrefs";
import { type BoothRow, durationLabel } from "@/lib/booth/plan";
import { bpmOf, energyOf, keyOf } from "@/lib/booth/songInfo";
import type { PlanEntity } from "@/lib/booth/sources/types";
import { bandAt } from "@/lib/booth/spectral";
import { useBooth, useRoomCaps, type Waveform as WaveData } from "@/lib/booth/store";
import {
  BASS_CUT_DB,
  barsToSec,
  dragHandle,
  eqLanes,
  gainInAt,
  gainOutAt,
  laneBoxes,
  lengthLabel,
  type Span,
  snapToBeat,
  type TransitionWindow,
  transitionWindow,
} from "@/lib/booth/transition";
import {
  CURVE_ORDER,
  curveFromLevel,
  type EdgeId,
  editorEdges,
  estimatedLevel,
  firstBeatSec,
  rulerTicks,
  viewSpan,
  ZOOM_MAX,
  ZOOM_MIN,
} from "@/lib/booth/transitionView";
import { t } from "@/lib/i18n";
import { DUR, EASE } from "@/lib/motion";
import { lockScroll } from "@/lib/scrollLock";
import { useSheets } from "@/lib/sheets";
import { toast } from "@/lib/toast";
import { Artwork } from "../ui/Artwork";
import { useSpotifyRoomName } from "./SpotifyRoom";

type PresetId = "auto" | TransitionPreset;
const SEC_CHOICES = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12];
const BAR_CHOICES = [0.5, 1, 2, 4, 8];
const CURVES: ReadonlyArray<CurveShape> = ["equalPower", "linear", "sCurve"];

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
 * The transition editor (wave 4; finished 2026-11 after the owner's "still not like Spotify or other DJ apps"; see
 * docs/design/transition-editor.md): a full-screen page on a phone, a sheet at most 760 px wide on an iPad or a
 * desktop (X, the title, •••, Save). The outgoing side's row; the lanes — a time ruler relative to the transition,
 * the outgoing's ending over the incoming's start, each its real waveform (file or the clip it plays) or a labelled
 * estimated shape (Spotify), the overlap shaded, per-lane handles, the volume curves with a bend knob, the EQ bands'
 * curves, beat ticks and cue markers; a toolbar under them (audition, length, gap, zoom, snap to beat); what the
 * room's player will do of it; the incoming side's row; the presets and the Volume and EQ rows. Tango first: inside a
 * tanda the default stays a gap, La Cumparsita plays whole, a cortina can be cut.
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

type PickerId = "length" | "gap" | "volume" | "eq" | "more" | "room";
const GAP_CHOICES = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
const EQS: ReadonlyArray<TransitionEq> = ["none", "bassSwap", "threeBand"];
const eqLabel = (e: TransitionEq) =>
  e === "bassSwap"
    ? t("booth.transition.eq_bass_swap")
    : e === "threeBand"
      ? t("booth.transition.eq_three_band")
      : t("booth.transition.eq_none");
const eqSub = (e: TransitionEq) =>
  e === "bassSwap"
    ? t("booth.transition.bass_swap_hint")
    : e === "threeBand"
      ? t("booth.transition.eq_three_band_sub")
      : t("booth.transition.eq_none_sub");

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
  const srcA = useBooth((s) => s.sources[i] ?? "missing");
  const srcB = useBooth((s) => s.sources[i + 1] ?? "missing");
  const stored = useBooth((s) =>
    a.id && b.id ? s.playlist?.booth?.transitions?.[transitionKey(a.id, b.id)] : undefined,
  );
  const nightGap = useBooth((s) => s.plan?.gapOverrides?.[a.tanda] ?? s.settings.gapSec);
  const settings = useBooth((s) => s.settings);
  const started = useBooth((s) => s.started);
  const audition = useBooth((s) => s.audition);
  const outputs = useBooth((s) => s.outputs);
  const caps = useRoomCaps();
  const spotifyDevice = useSpotifyRoomName();
  const b0 = useBooth.getState();
  const [draft, setDraft] = useState<TransitionEdit | null>(stored ? { ...stored } : null);
  const [busy, setBusy] = useState(false);
  const [waves, setWaves] = useState<[WaveData | null, WaveData | null] | null>(null);
  const [picker, setPicker] = useState<PickerId | null>(null);
  const [zoom, setZoom] = useState(0);
  const ind = useIndicators();
  const bpm = bpmOf(ea)?.value ?? bpmOf(eb)?.value ?? null;
  const [snap, setSnap] = useState(true);
  const [unit, setUnit] = useState<"bars" | "sec">(bpm ? "bars" : "sec");
  const dirty = JSON.stringify(draft) !== JSON.stringify(stored ?? null);
  const root = useRef<HTMLDivElement>(null);
  // the list's foot fades while more of it is below (`data-more`)
  const scrollBox = useRef<HTMLDivElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);
  useEffect(() => {
    const el = scrollBox.current;
    if (!el) return;
    const read = () => setMoreBelow(el.scrollHeight - el.clientHeight - el.scrollTop > 4);
    read();
    el.addEventListener("scroll", read, { passive: true });
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(read) : null;
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", read);
      ro?.disconnect();
    };
  }, []);

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
  // the sides' own silence (Settings → Booth → Gaps) on the lanes and in the time the room hears
  const silenceMode = useBooth((s) => s.plan?.settings.silenceMode ?? "gap");
  const sil = stageSilence(silenceMode, w, a, b);
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

  // the audition: the headphones when chosen; before the night this device; mid-night the room only once confirmed
  const hearing = audition?.via === "transition" && audition.i === i;
  const blocked = b0.cueBlocked();
  const askRoom = started && !!blocked;
  const where = blocked
    ? started
      ? t("booth.transition.in_the_room")
      : t("booth.transition.on_this_device")
    : t("booth.transition.in_your_headphones", {
        name: outputs.devices.find((d) => d.id === outputs.cue)?.label ?? t("booth.songSheet.headphones"),
      });
  const audit = async (room = false) => {
    if (hearing) return b0.stopAudition();
    if (askRoom && !room) return setPicker("room");
    setBusy(true);
    const why = await b0.auditionTransition(i, draft, room ? { room: true } : undefined);
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
  // the gap pill: the silence of a fade or a cortina cut (a gap's own length is the length pill)
  const hasGapPill = effTr.preset === "fade" || effTr.preset === "cortinaCut";

  const sameCurve = w.curveOut === w.curveIn;
  const hasFade = w.outFade.len > 0 || w.inFade.len > 0;
  const volumeValue = !hasFade
    ? t("booth.transition.volume_none")
    : sameCurve
      ? curveLabel(w.curveOut)
      : t("booth.transition.curve_mixed");
  /** a curve chosen where nothing fades yet: the plain Fade it needs, with that curve */
  const withCurve = (c: CurveShape): TransitionEdit => {
    const e = asEdit();
    if (hasFade) return { ...e, curveOut: c, curveIn: c };
    const d = TRANSITION_DEFAULTS.fade;
    return { preset: "fade", gapSec: effTr.gapSec || d.gapSec, curveOut: c, curveIn: c };
  };
  /** an EQ hand-over needs an overlap: off a blend or rise it becomes the plain Blend with that EQ */
  const withEq = (e: TransitionEq): TransitionEdit => {
    const cur = asEdit();
    if (e === "none") return { ...cur, eq: "none", bassSwap: false };
    if (effTr.overlapSec > 0) return { ...cur, eq: e, bassSwap: true };
    return { preset: "blend", eq: e, bassSwap: true };
  };
  const eqNow: TransitionEq = tr?.eq ?? "none";
  const noAudio = waves !== null && (!waves[0] || !waves[1]);
  const warning = cumparsita
    ? t("booth.transition.cumparsita_whole")
    : insideTanda && (preset === "blend" || preset === "rise")
      ? t("booth.transition.inside_tanda_warning")
      : null;
  // what of this transition the room's player can do (2026-11): files and clips everything; Spotify in this browser
  // the fades and the gap; a Connect device that cannot fade only the gap
  const spotifySide = srcA === "spotify" || srcB === "spotify" || srcA === "youtube" || srcB === "youtube";
  const plays = !spotifySide
    ? t("booth.transition.where_files")
    : caps.fade
      ? t("booth.transition.where_sdk")
      : t("booth.transition.where_connect", { device: spotifyDevice ?? "Spotify Connect" });

  const [laneOut, laneIn] = [
    laneSource(waves?.[0] ?? null, srcA, waves === null),
    laneSource(waves?.[1] ?? null, srcB, waves === null),
  ];

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
        {/* the editor's visible title, centred between Close and the actions (the dialog's name is the h2 above) */}
        <span className="trx-head" aria-hidden data-testid="booth-tr-heading">
          <span className="trx-head-title" data-testid="booth-tr-title">
            {t("booth.transition.title")}
          </span>
          <span className="trx-head-sub">{`${sideName(a)} → ${sideName(b)}`}</span>
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

      <div className="trx-scroll hide-scrollbar" ref={scrollBox} data-more={moreBelow || undefined}>
        <Side row={a} entity={ea} which="out" bpmOn={ind.bpm} keyOn={ind.key} />
        <Stage
          a={a}
          b={b}
          w={w}
          sil={sil}
          waves={waves}
          lanes={[laneOut, laneIn]}
          energy={[energyOf(ea), energyOf(eb)]}
          bpm={bpm}
          snap={snap && !!bpm}
          zoom={zoom}
          editable={lengthEditable}
          edges={editorEdges(effTr.preset)}
          onDrag={(which, sec) => setDraft(dragHandle(asEdit(), which, sec))}
          onCurve={(side, c) =>
            setDraft({ ...asEdit(), ...(side === "out" ? { curveOut: c } : { curveIn: c }) })
          }
          onZoom={(d) => setZoom((z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z + d)))}
        />
        {/* the toolbar under the lanes (never over the waveforms): audition · length · gap · zoom · snap */}
        <div className="trx-toolbar" role="toolbar" aria-label={t("booth.transition.toolbar")}>
          <button
            type="button"
            className="trx-play"
            onClick={() => void audit()}
            disabled={busy}
            aria-label={hearing ? t("booth.transition.stop_audition") : t("booth.transition.audition")}
            aria-pressed={hearing}
            data-hint={t("booth.transition.audition_hint", { where })}
            data-testid="booth-tr-audition"
            data-where={blocked ? (askRoom ? "room" : "device") : "headphones"}
          >
            {hearing ? (
              <Square size={16} fill="currentColor" strokeWidth={0} aria-hidden />
            ) : (
              <Play size={18} fill="currentColor" strokeWidth={0} aria-hidden />
            )}
            <span>{hearing ? t("booth.transition.stop_short") : t("booth.transition.audition_short")}</span>
          </button>
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
            <Timer size={16} strokeWidth={2} aria-hidden />
            <span className="tabular-nums">{lengthLabel(len, bpm, unit)}</span>
            <ChevronDown size={16} strokeWidth={2.25} aria-hidden />
          </button>
          {hasGapPill && (
            <button
              type="button"
              className="trx-pill"
              onClick={() => setPicker("gap")}
              disabled={!lengthEditable}
              aria-haspopup="menu"
              aria-expanded={picker === "gap"}
              aria-label={`${t("booth.transition.gap_pill_label")}: ${effTr.gapSec} s`}
              data-hint={t("booth.transition.gap_footer")}
              data-testid="booth-tr-gap"
              data-value={effTr.gapSec}
            >
              <span className="tabular-nums">{t("booth.transition.gap_pill", { sec: effTr.gapSec })}</span>
              <ChevronDown size={16} strokeWidth={2.25} aria-hidden />
            </button>
          )}
          <span className="trx-toolbar-gap" aria-hidden />
          {/* biome-ignore lint/a11y/useSemanticElements: a segmented control, not a form fieldset */}
          <div className="trx-seg" role="group" aria-label={t("booth.transition.zoom")}>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - 1))}
              disabled={zoom <= ZOOM_MIN}
              aria-label={t("booth.transition.zoom_out")}
              data-hint={t("booth.transition.zoom_out")}
              data-testid="booth-tr-zoom-out"
            >
              <ZoomOut size={18} strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setZoom(0)}
              disabled={zoom === 0}
              aria-label={t("booth.transition.zoom_fit")}
              data-hint={t("booth.transition.zoom_fit")}
              data-testid="booth-tr-zoom-fit"
            >
              <Maximize2 size={16} strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + 1))}
              disabled={zoom >= ZOOM_MAX}
              aria-label={t("booth.transition.zoom_in")}
              data-hint={t("booth.transition.zoom_in")}
              data-testid="booth-tr-zoom-in"
            >
              <ZoomIn size={18} strokeWidth={2} aria-hidden />
            </button>
          </div>
          <button
            type="button"
            className="trx-toggle"
            aria-pressed={snap && !!bpm}
            disabled={!bpm}
            onClick={() => setSnap((v) => !v)}
            data-hint={bpm ? t("booth.transition.snap_hint", { bpm }) : t("booth.transition.snap_needs_bpm")}
            data-testid="booth-tr-snap"
          >
            <Magnet size={16} strokeWidth={2} aria-hidden />
            <span>{t("booth.transition.snap")}</span>
          </button>
        </div>
        {(laneOut === "estimated" || laneIn === "estimated") && (
          <p className="trx-est-note text-footnote" data-testid="booth-tr-estimated">
            <span className="trx-est-swatch" aria-hidden />
            {t("booth.transition.lane_estimated")}
          </p>
        )}
        <p className="trx-where text-footnote" data-testid="booth-tr-plays">
          {plays}
        </p>
        {sil.heard !== null && sil.keptTail + sil.tailCut + sil.keptHead + sil.headCut > 0 && (
          <p
            className="trx-silence-note text-footnote"
            data-testid="booth-tr-silence"
            data-value={sil.heard}
            data-hint={t("booth.transition.silence_hint")}
          >
            {t("booth.transition.silence_heard", { sec: sil.heard })}
          </p>
        )}
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
            disabled={!lengthEditable}
            hint={hasFade ? t("booth.transition.advanced_footer") : t("booth.transition.volume_needs_fade")}
            open={picker === "volume"}
            onOpen={() => setPicker("volume")}
            testId="booth-tr-volume"
          />
          <SettingRow
            tick="var(--trx-eq)"
            label={t("booth.transition.eq")}
            value={eqLabel(eqNow)}
            disabled={cumparsita}
            hint={cumparsita ? t("booth.transition.cumparsita_whole") : t("booth.transition.bass_swap_hint")}
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
        open={picker === "gap"}
        title={t("booth.transition.gap_pill_label")}
        onClose={() => setPicker(null)}
        testId="booth-tr-picker-gap"
        options={GAP_CHOICES.map((s) => ({
          id: String(s),
          label: `${s} s`,
          checked: s === effTr.gapSec,
          onPick: () => setDraft({ ...asEdit(), gapSec: s }),
        }))}
        info={<p>{t("booth.transition.gap_footer")}</p>}
      />
      <Picker
        open={picker === "volume"}
        title={t("booth.transition.volume")}
        onClose={() => setPicker(null)}
        testId="booth-tr-picker-volume"
        options={[
          ...(effTr.overlapSec > 0
            ? []
            : [
                {
                  id: "none",
                  label: t("booth.transition.volume_none"),
                  sub: t("booth.transition.volume_none_sub"),
                  checked: !hasFade,
                  onPick: () => setDraft({ preset: "gap", gapSec: effTr.gapSec || nightGap }),
                },
              ]),
          ...CURVES.map((c) => ({
            id: c,
            label: curveLabel(c),
            sub: hasFade ? curveSub(c) : `${curveSub(c)} ${t("booth.transition.volume_adds_fade")}`,
            checked: hasFade && sameCurve && w.curveOut === c,
            onPick: () => setDraft(withCurve(c)),
          })),
        ]}
        info={<p>{t("booth.transition.curve_bend_hint")}</p>}
      />
      <Picker
        open={picker === "eq"}
        title={t("booth.transition.eq")}
        onClose={() => setPicker(null)}
        testId="booth-tr-picker-eq"
        options={EQS.map((e) => ({
          id: e,
          label: eqLabel(e),
          sub:
            e !== "none" && effTr.overlapSec <= 0
              ? `${eqSub(e)} ${t("booth.transition.eq_makes_blend")}`
              : eqSub(e),
          checked: eqNow === e,
          onPick: () => setDraft(withEq(e)),
        }))}
        info={spotifySide ? <p>{t("booth.transition.eq_not_on_spotify")}</p> : undefined}
      />
      <Picker
        open={picker === "room"}
        title={t("booth.transition.room_confirm_title")}
        onClose={() => setPicker(null)}
        testId="booth-tr-picker-room"
        options={[
          {
            id: "go",
            label: t("booth.transition.room_confirm_go"),
            sub: t("booth.transition.room_confirm_body"),
            icon: <Speaker size={18} aria-hidden />,
            onPick: () => void audit(true),
          },
        ]}
        info={<p>{blocked}</p>}
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
              {hearing
                ? t("booth.transition.playing_where", { where })
                : askRoom
                  ? `${blocked} ${t("booth.transition.room_asks")}`
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

/** What a lane draws: the side's own audio (its file, the 30 s clip it plays) or an honest estimate (Spotify). */
type LaneSource = "file" | "clip" | "estimated" | "loading";
function laneSource(d: WaveData | null, src: string, loading: boolean): LaneSource {
  if (loading) return "loading";
  if (!d) return "estimated";
  // a 30 s clip drawn for a side that plays the full track elsewhere (Spotify) would not be what plays: estimated
  if (d.from === "clip" && src !== "preview") return "estimated";
  return d.from;
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
        <PickerLayer key="picker">
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
        </PickerLayer>
      )}
    </AnimatePresence>
  );
}

/**
 * The menu's layer over the whole editor. While it fades out it lets every pointer through: a finger that lands on a
 * box edge right after picking a length drags that edge, not the leaving menu's scrim or rows (owner's iPhone).
 */
function PickerLayer({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  return (
    <motion.div
      className="trx-picker-root"
      data-leaving={present ? undefined : true}
      style={present ? undefined : { pointerEvents: "none" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: DUR.fast } }}
      exit={{ opacity: 0, transition: { duration: DUR.fast } }}
    >
      {children}
    </motion.div>
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
      {/* BPM over the Camelot chip and the length, as in the reference; an unknown BPM or key is left out */}
      <div className="trx-facts">
        {bpm && (
          <span data-hint={`${bpm.value} BPM · ${bpm.source}`} data-testid="booth-tr-bpm">
            {t("booth.transition.bpm", { bpm: bpm.value })}
          </span>
        )}
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

/** 2026-11: the two sides' silence around a transition, on the editor's axis (0 = where the outgoing stops). */
export interface StageSilence {
  /** the outgoing's silent tail it still plays before it stops (grey, before 0) and the part the booth cuts */
  keptTail: number;
  tailCut: number;
  /** the incoming's silent head it plays (grey, from its start) and the part skipped */
  keptHead: number;
  headCut: number;
  /** where the incoming starts playing (after the inserted gap, or before 0 for an overlap) */
  inStart: number;
  /** the silence the room hears between the last note and the next first note (no overlap) */
  heard: number | null;
}
export function stageSilence(
  mode: "gap" | "after" | "off",
  w: TransitionWindow,
  a: Pick<BoothRow, "kind" | "tailSilenceSec">,
  b: Pick<BoothRow, "headSilenceSec">,
): StageSilence {
  const tail = a.kind === "cortina" ? 0 : (a.tailSilenceSec ?? 0);
  const head = b.headSilenceSec ?? 0;
  const overlap = w.overlapSec > 0;
  const j = silenceJoin(mode, {
    gapSec: overlap ? 0 : w.gapSec,
    tailSec: tail,
    headSec: head,
    faded: overlap || w.outFade.len > 0 || w.inFade.len > 0,
  });
  return {
    keptTail: tail - j.tailCutSec,
    tailCut: j.tailCutSec,
    keptHead: head - j.headCutSec,
    headCut: j.headCutSec,
    inStart: overlap ? w.inStart : j.gapSec,
    heard: overlap ? null : j.heardSec,
  };
}

/**
 * The lanes (2026-11, modelled on Spotify's Mix editor, djay, Rekordbox and DJ.Studio): a time ruler in seconds
 * relative to the outgoing side's end (beat ticks when the BPM is known), then two stacked lanes on that axis — the
 * outgoing's ending on top, the incoming's start below — each its real waveform (low / mid / high, from its file or
 * the 30 s clip it plays) or, for a side the browser cannot hear (Spotify), a hatched estimated shape labelled as
 * such. On them: where each side is heard (the rest dimmed), its own silence greyed, the overlap shaded across both,
 * its volume curve (yellow) with a bend knob, the EQ bands' curves (low pink, mid amber, high cyan), cue markers (the
 * incoming's music in / first beat), and per-lane handles to drag (pointer or ← →, snapping to the beat).
 */
const RULER_H = 28;
const BAND_COLOURS = {
  low: "var(--trx-eq-low)",
  mid: "var(--trx-eq-mid)",
  high: "var(--trx-eq-high)",
} as const;

function Stage({
  a,
  b,
  w,
  sil,
  waves,
  lanes,
  energy,
  bpm,
  snap,
  zoom,
  editable,
  edges,
  onDrag,
  onCurve,
  onZoom,
}: {
  a: BoothRow;
  b: BoothRow;
  w: TransitionWindow;
  sil: StageSilence;
  waves: [WaveData | null, WaveData | null] | null;
  lanes: [LaneSource, LaneSource];
  energy: [number | null, number | null];
  bpm: number | null;
  snap: boolean;
  zoom: number;
  editable: boolean;
  edges: Array<{ which: EdgeId; lane: "out" | "in" | "both" }>;
  onDrag: (which: EdgeId, sec: number) => void;
  onCurve: (side: "out" | "in", c: CurveShape) => void;
  onZoom: (d: number) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ W: 390, P: 300 });
  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    const put = () => setSize({ W: node.clientWidth || 390, P: node.clientHeight || 300 });
    put();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(put) : null;
    ro?.observe(node);
    return () => ro?.disconnect();
  }, []);
  const { W, P } = size;
  const boxes = laneBoxes(w);
  // while an edge is dragged the view holds still (it re-centres when the finger lifts)
  const [frozen, setFrozen] = useState<Span | null>(null);
  const view = frozen ?? viewSpan(boxes.panel, zoom);
  const secPerPx = (view.end - view.start) / W;
  const X = (tm: number) => (tm - view.start) / secPerPx;
  const T = (x: number) => view.start + x * secPerPx;
  const snapTo = (sec: number) => (snap ? snapToBeat(sec, bpm) : Math.round(sec * 10) / 10);

  // the lanes' geometry below the ruler
  const gap = 10;
  const laneH = (P - RULER_H - gap - 8) / 2;
  const lane = {
    out: { top: RULER_H + 4, bottom: RULER_H + 4 + laneH },
    in: { top: RULER_H + 4 + laneH + gap, bottom: RULER_H + 4 + 2 * laneH + gap },
  };
  const cy = (L: { top: number; bottom: number }) => (L.top + L.bottom) / 2;
  const amp = laneH * 0.44;
  const [wa, wb] = waves ?? [null, null];
  // where each side's audio is at the axis' 0 / at the incoming's start (past a head cut, before a tail cut)
  const outEnd = (d: WaveData) =>
    d.from === "file"
      ? Math.min(d.durationSec, (a.trimInSec ?? 0) + (a.headCutSec ?? 0) + a.lengthSec)
      : d.durationSec;
  const inStart0 = (d: WaveData) => (d.from === "file" ? (b.trimInSec ?? 0) + sil.headCut : 0);
  const inAt = sil.inStart;
  const levels = (d: WaveData, sec: number) => {
    if (d.bands) return bandAt(d.bands, sec);
    if (sec < 0 || sec > d.durationSec) return null;
    const v = d.peaks[Math.min(d.peaks.length - 1, Math.floor((sec / d.durationSec) * d.peaks.length))] ?? 0;
    return { low: v, mid: v * 0.7, high: v * 0.35 };
  };
  const mirrored = (xs: number[], h: number[], c: number) => {
    let s = `M${xs[0]!.toFixed(1)},${(c - h[0]!).toFixed(1)}`;
    for (let k = 1; k < xs.length; k++) s += `L${xs[k]!.toFixed(1)},${(c - h[k]!).toFixed(1)}`;
    for (let k = xs.length - 1; k >= 0; k--) s += `L${xs[k]!.toFixed(1)},${(c + h[k]!).toFixed(1)}`;
    return `${s}Z`;
  };
  /** three nested mirrored areas (lows outermost) across the whole width: the real audio */
  const wavePaths = (which: "out" | "in"): [string, string, string] | null => {
    const d = which === "out" ? wa : wb;
    const src = which === "out" ? lanes[0] : lanes[1];
    if (!d || src === "estimated" || src === "loading") return null;
    const c = cy(lane[which]);
    const step = 2;
    const n = Math.ceil(W / step) + 1;
    const tops: [number[], number[], number[]] = [[], [], []];
    const xs: number[] = [];
    for (let k = 0; k < n; k++) {
      const x = Math.min(W, k * step);
      const tm = T(x);
      const sec = which === "out" ? outEnd(d) + tm : inStart0(d) + (tm - inAt);
      const v = levels(d, sec);
      const hi = (v?.high ?? 0) * 0.42;
      const md = Math.max((v?.mid ?? 0) * 0.74, hi);
      const lo = Math.max(v?.low ?? 0, md);
      xs.push(x);
      tops[0].push(lo * amp);
      tops[1].push(md * amp);
      tops[2].push(Math.max(hi * amp, v ? 0.6 : 0));
    }
    return [mirrored(xs, tops[0], c), mirrored(xs, tops[1], c), mirrored(xs, tops[2], c)];
  };
  /** the estimated shape of a side the browser cannot hear: smooth, hatched, never beat-shaped */
  const estimatePath = (which: "out" | "in"): string | null => {
    const src = which === "out" ? lanes[0] : lanes[1];
    if (src !== "estimated") return null;
    const r = which === "out" ? a : b;
    const e = which === "out" ? energy[0] : energy[1];
    const c = cy(lane[which]);
    const step = 4;
    const xs: number[] = [];
    const h: number[] = [];
    for (let x = 0; x <= W + step; x += step) {
      const tm = T(Math.min(W, x));
      const sec = which === "out" ? r.lengthSec + tm : tm - inAt;
      const v = estimatedLevel(
        {
          lengthSec: r.lengthSec,
          headSilenceSec: which === "in" ? sil.keptHead + sil.headCut : 0,
          tailSilenceSec: which === "out" ? sil.keptTail + sil.tailCut : 0,
          energy: e,
        },
        sec,
      );
      xs.push(Math.min(W, x));
      h.push((v ?? 0) * amp);
    }
    return mirrored(xs, h, c);
  };
  const px0 = X(boxes.panel.start);
  const px1 = X(boxes.panel.end);
  // where each side is heard (the rest of its lane is dimmed)
  const outHeardTo = X(Math.min(0, w.outStop));
  const inHeardFrom = X(inAt);
  // the sides' own silence, greyed: the outgoing's tail (what it plays and what is cut), the incoming's head
  const silence: Array<{ which: "out" | "in"; from: number; to: number }> = [];
  if (sil.keptTail + sil.tailCut > 0) silence.push({ which: "out", from: -sil.keptTail, to: sil.tailCut });
  if (sil.keptHead + sil.headCut > 0)
    silence.push({ which: "in", from: inAt - sil.headCut, to: inAt + sil.keptHead });

  /** a lane's volume curve: gain 1 at its top, 0 at its foot */
  const volLine = (which: "out" | "in") => {
    const L = lane[which];
    const g = which === "out" ? gainOutAt : gainInAt;
    const n = 160;
    const pts: string[] = [];
    for (let k = 0; k <= n; k++) {
      const tm = view.start + ((view.end - view.start) * k) / n;
      const y = L.top + 6 + (1 - g(w, tm)) * (L.bottom - L.top - 12);
      pts.push(`${X(tm).toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(" ");
  };
  const eq = eqLanes(w);
  /** an EQ band's curve on its lane: 0 dB near the top, the deepest cut near the foot */
  const eqLine = (which: "out" | "in", band: "low" | "mid" | "high") => {
    if (!eq) return null;
    const pts = eq[which][band];
    if (!pts.length) return null;
    const L = lane[which];
    const y = (db: number) => L.top + 10 + (db / BASS_CUT_DB) * (L.bottom - L.top - 20);
    const all: Array<[number, number]> = [
      [view.start, pts[0]![1]],
      ...pts,
      [view.end, pts[pts.length - 1]![1]],
    ];
    return all.map(([tm, db]) => `${X(tm).toFixed(1)},${y(db).toFixed(1)}`).join(" ");
  };
  const ticks = rulerTicks(view.start, view.end, W);
  const grid = (() => {
    if (!bpm) return [] as Array<{ x: number; bar: boolean }>;
    const beat = 60 / bpm;
    const out: Array<{ x: number; bar: boolean }> = [];
    for (let k = Math.ceil(view.start / beat); k * beat <= view.end + 1e-6; k++)
      out.push({ x: X(k * beat), bar: k % 4 === 0 });
    return out.length > 240 ? out.filter((g) => g.bar) : out;
  })();
  // cue markers: the incoming's music in (its silent head) and its first beat (a decoded side)
  const markers: Array<{ id: string; t: number; label: string }> = [];
  if (sil.keptHead > 0.05)
    markers.push({ id: "music-in", t: inAt + sil.keptHead, label: t("booth.transition.marker_music_in") });
  if (wb?.bands && lanes[1] !== "estimated") {
    const fb = firstBeatSec(wb.bands, inStart0(wb) + sil.keptHead);
    if (fb !== null)
      markers.push({
        id: "first-beat",
        t: inAt + (fb - inStart0(wb)),
        label: t("booth.transition.marker_first_beat"),
      });
  }

  const drag = (which: EdgeId) => (ev: React.PointerEvent<HTMLDivElement>) => {
    if (!editable) return;
    ev.preventDefault();
    const target = ev.currentTarget;
    target.setPointerCapture(ev.pointerId);
    const held: Span = view;
    setFrozen(held);
    const sp = (held.end - held.start) / W;
    const move = (e: PointerEvent) => {
      const r = el.current?.getBoundingClientRect();
      if (r && r.width > 0) onDrag(which, snapTo(held.start + (e.clientX - r.left) * sp));
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
  const edgeAt = (which: EdgeId) => {
    switch (which) {
      case "start":
        return boxes.out.start;
      case "outEnd":
        return w.outFade.start + w.outFade.len;
      case "inEnd":
      case "end":
        return boxes.in.end;
      default:
        return boxes.in.start;
    }
  };
  const key = (which: EdgeId) => (e: React.KeyboardEvent) => {
    if (!editable) return;
    const v = edgeAt(which);
    const beat = bpm ? 60 / bpm : 0.5;
    const step = e.shiftKey ? (bpm ? beat * 4 : 2) : snap ? beat : 0.5;
    const to = (d: number) => onDrag(which, snap ? snapToBeat(v + d, bpm) : Math.round((v + d) * 10) / 10);
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") to(-step);
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") to(step);
    else return;
    e.preventDefault();
  };
  // a fade's bend knob: on its volume curve at the fade's middle; up = fuller (equal power), down = S-curve
  // (a fade too short on screen to hold a knob clear of its handles keeps its curve in the Volume row)
  const knobs: Array<{ side: "out" | "in"; t: number; c: CurveShape }> = [];
  const roomy = (len: number) => len / secPerPx >= 64;
  if (w.outFade.len > 0 && roomy(w.outFade.len))
    knobs.push({ side: "out", t: w.outFade.start + w.outFade.len / 2, c: w.curveOut });
  if (w.inFade.len > 0 && roomy(w.inFade.len))
    knobs.push({ side: "in", t: w.inFade.start + w.inFade.len / 2, c: w.curveIn });
  const bend = (side: "out" | "in") => (ev: React.PointerEvent<HTMLDivElement>) => {
    if (!editable) return;
    ev.preventDefault();
    const target = ev.currentTarget;
    target.setPointerCapture(ev.pointerId);
    const L = lane[side];
    const move = (e: PointerEvent) => {
      const r = el.current?.getBoundingClientRect();
      if (!r) return;
      const y = e.clientY - r.top;
      onCurve(side, curveFromLevel(1 - (y - L.top) / (L.bottom - L.top)));
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };
  const bendKey = (side: "out" | "in", c: CurveShape) => (e: React.KeyboardEvent) => {
    if (!editable) return;
    const k = CURVE_ORDER.indexOf(c);
    if (e.key === "ArrowUp" || e.key === "ArrowRight") onCurve(side, CURVE_ORDER[Math.min(2, k + 1)]!);
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") onCurve(side, CURVE_ORDER[Math.max(0, k - 1)]!);
    else return;
    e.preventDefault();
  };
  const waveOut = wavePaths("out");
  const waveIn = wavePaths("in");
  const lanesSvg = (which: "out" | "in", paths: [string, string, string] | null) => {
    const L = lane[which];
    const est = estimatePath(which);
    const heard = which === "out" ? { x: 0, w: Math.max(0, outHeardTo) } : { x: inHeardFrom, w: W };
    const id = `trx-clip-${which}`;
    const body = paths ? (
      <>
        <path d={paths[0]} className="trx-band-low" />
        <path d={paths[1]} className="trx-band-mid" />
        <path d={paths[2]} className="trx-band-high" />
      </>
    ) : est ? (
      <path d={est} className="trx-est" />
    ) : (
      <line x1={0} x2={W} y1={cy(L)} y2={cy(L)} className="trx-flat" data-testid={`booth-tr-flat-${which}`} />
    );
    return (
      <g data-testid={paths ? `booth-tr-wave-${which}` : est ? `booth-tr-est-${which}` : undefined}>
        <rect x={0} y={L.top} width={W} height={L.bottom - L.top} rx={10} className="trx-lane" />
        <clipPath id={id}>
          <rect x={heard.x} y={0} width={Math.max(0, heard.w)} height={P} />
        </clipPath>
        <g className="trx-wave-dim">{body}</g>
        <g clipPath={`url(#${id})`}>{body}</g>
      </g>
    );
  };
  // the overlap: from where the incoming comes in to where the outgoing stops
  const overlap = w.overlapSec > 0 ? { from: X(w.inStart), to: X(w.outStop < 0 ? w.outStop : 0) } : null;
  const laneLabel = (which: "out" | "in") => {
    const src = which === "out" ? lanes[0] : lanes[1];
    const word =
      src === "file"
        ? t("booth.transition.lane_file")
        : src === "clip"
          ? t("booth.transition.lane_clip")
          : src === "loading"
            ? t("booth.transition.lane_loading")
            : t("booth.transition.lane_estimated_short");
    return (
      <span
        className="trx-lane-label"
        data-source={src}
        data-testid={`booth-tr-lane-${which}`}
        style={{ top: lane[which].top + 6 }}
      >
        <span className="trx-lane-side">
          {which === "out" ? t("booth.transition.side_out") : t("booth.transition.side_in")}
        </span>
        <span>{word}</span>
      </span>
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
        data-estimated={lanes.includes("estimated") || undefined}
        data-view={`${Math.round(view.start * 10) / 10}…${Math.round(view.end * 10) / 10}`}
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          onZoom(e.deltaY < 0 ? 1 : -1);
        }}
      >
        <svg width={W} height={P} viewBox={`0 0 ${W} ${P}`} aria-hidden>
          <defs>
            <pattern
              id="trx-hatch"
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="6" height="6" className="trx-hatch-bg" />
              <line x1="0" y1="0" x2="0" y2="6" className="trx-hatch-line" />
            </pattern>
          </defs>
          {/* the ruler: seconds relative to the outgoing's end, beat ticks when the BPM is known */}
          <rect x={0} y={0} width={W} height={RULER_H} className="trx-ruler" />
          {grid.map((g) => (
            <line
              key={`b${g.x}`}
              x1={g.x}
              x2={g.x}
              y1={g.bar ? RULER_H - 9 : RULER_H - 5}
              y2={RULER_H}
              className={g.bar ? "trx-beat trx-beat-bar" : "trx-beat"}
            />
          ))}
          {ticks.map((k) => (
            <g key={`t${k.t}`}>
              <line
                x1={X(k.t)}
                x2={X(k.t)}
                y1={k.label ? 4 : 10}
                y2={k.label ? 12 : 14}
                className={k.label ? "trx-tick trx-tick-major" : "trx-tick"}
              />
              {k.label && (
                <text
                  x={X(k.t) + 3}
                  y={22}
                  className={k.t === 0 ? "trx-tick-label trx-zero" : "trx-tick-label"}
                >
                  {k.label === "0" ? "0" : `${k.label} s`}
                </text>
              )}
            </g>
          ))}
          {lanesSvg("out", waveOut)}
          {lanesSvg("in", waveIn)}
          {grid.map((g) => (
            <line
              key={`g${g.x}`}
              x1={g.x}
              x2={g.x}
              y1={RULER_H + 4}
              y2={P - 4}
              className={g.bar ? "trx-grid trx-grid-bar" : "trx-grid"}
            />
          ))}
          {/* the transition's span (both lanes) and the overlap shaded across them */}
          <rect
            x={px0}
            y={RULER_H + 1}
            width={Math.max(0, px1 - px0)}
            height={P - RULER_H - 2}
            className="trx-panel"
          />
          {overlap && overlap.to > overlap.from && (
            <rect
              x={overlap.from}
              y={lane.out.top}
              width={overlap.to - overlap.from}
              height={lane.in.bottom - lane.out.top}
              className="trx-overlap"
              data-testid="booth-tr-overlap"
            />
          )}
          {/* 0: where the outgoing would end */}
          <line x1={X(0)} x2={X(0)} y1={RULER_H} y2={P - 4} className="trx-zero-line" />
          {silence.map((s) => {
            const L = lane[s.which];
            return (
              <rect
                key={s.which}
                x={X(s.from)}
                y={L.top}
                width={Math.max(0, X(s.to) - X(s.from))}
                height={L.bottom - L.top}
                className="trx-silence"
                data-testid={`booth-tr-silence-${s.which}`}
                data-from={Math.round(s.from * 100) / 100}
                data-to={Math.round(s.to * 100) / 100}
              />
            );
          })}
          {(["out", "in"] as const).map((which) => {
            const s = which === "out" ? boxes.out : boxes.in;
            const L = lane[which];
            return (
              <rect
                key={which}
                x={X(s.start)}
                y={L.top + 1}
                width={Math.max(0, X(s.end) - X(s.start))}
                height={L.bottom - L.top - 2}
                rx={8}
                className="trx-box"
                data-testid={`booth-tr-box-${which}`}
              />
            );
          })}
          {(["out", "in"] as const).flatMap((which) =>
            (["low", "mid", "high"] as const).map((band) => {
              const pts = eqLine(which, band);
              return pts ? (
                <polyline
                  key={`${which}-${band}`}
                  points={pts}
                  className="trx-eq"
                  style={{ stroke: BAND_COLOURS[band] }}
                  data-testid={band === "low" ? `booth-tr-eq-${which}` : `booth-tr-eq-${which}-${band}`}
                />
              ) : null;
            }),
          )}
          <polyline
            points={volLine("out")}
            className="trx-vol booth-tr-line-out"
            data-testid="booth-tr-vol-out"
          />
          <polyline
            points={volLine("in")}
            className="trx-vol booth-tr-line-in"
            data-testid="booth-tr-vol-in"
          />
          {markers.map((m) => (
            <g key={m.id} data-testid={`booth-tr-marker-${m.id}`}>
              <line x1={X(m.t)} x2={X(m.t)} y1={lane.in.top} y2={lane.in.bottom} className="trx-marker" />
              <path d={`M${X(m.t)},${lane.in.bottom - 1} l-5,0 l5,-7 l5,7 z`} className="trx-marker-flag" />
            </g>
          ))}
        </svg>
        {laneLabel("out")}
        {laneLabel("in")}
        {markers.map((m) => (
          <span
            key={m.id}
            className="trx-marker-label"
            style={{ left: X(m.t), top: lane.in.bottom - 24 }}
            aria-hidden
          >
            {m.label}
          </span>
        ))}
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
          const top = ln === "in" ? lane.in.top : lane.out.top;
          const bottom = ln === "out" ? lane.out.bottom : lane.in.bottom;
          const name =
            which === "start"
              ? t("booth.transition.handle_start")
              : which === "outEnd"
                ? t("booth.transition.handle_out_end")
                : which === "inEnd" || which === "end"
                  ? t("booth.transition.handle_end")
                  : t("booth.transition.handle_gap");
          return (
            <div
              key={which}
              className="trx-edge"
              data-lane={ln}
              style={{ left: X(v), top, height: bottom - top }}
              role="slider"
              tabIndex={editable ? 0 : -1}
              aria-label={name}
              aria-valuemin={Math.round(view.start - 12)}
              aria-valuemax={Math.round(view.end + 12)}
              aria-valuenow={Math.round(v * 10) / 10}
              aria-valuetext={t("booth.transition.handle_value", {
                sec: Math.round(Math.abs(v) * 10) / 10,
                p1: v < 0 ? "−" : "+",
              })}
              aria-disabled={!editable || undefined}
              data-hint={
                which === "start"
                  ? t("booth.transition.handle_start_hint")
                  : which === "outEnd"
                    ? t("booth.transition.handle_out_end_hint")
                    : which === "gap"
                      ? t("booth.transition.handle_gap_hint")
                      : t("booth.transition.handle_end_hint")
              }
              data-testid={
                which === "gap"
                  ? "booth-tr-gap-edge"
                  : which === "inEnd"
                    ? "booth-tr-end"
                    : which === "outEnd"
                      ? "booth-tr-out-end"
                      : `booth-tr-${which}`
              }
              onPointerDown={drag(which)}
              onKeyDown={key(which)}
            />
          );
        })}
        {knobs.map((k) => {
          const L = lane[k.side];
          const g = k.side === "out" ? gainOutAt(w, k.t) : gainInAt(w, k.t);
          const y = L.top + 6 + (1 - g) * (L.bottom - L.top - 12);
          return (
            <div
              key={k.side}
              className="trx-knob"
              style={{ left: X(k.t), top: y }}
              role="slider"
              tabIndex={editable ? 0 : -1}
              aria-label={t("booth.transition.curve_bend", {
                side: k.side === "out" ? t("booth.transition.side_out") : t("booth.transition.side_in"),
              })}
              aria-valuemin={0}
              aria-valuemax={2}
              aria-valuenow={CURVE_ORDER.indexOf(k.c)}
              aria-valuetext={curveLabel(k.c)}
              aria-disabled={!editable || undefined}
              data-hint={t("booth.transition.curve_bend_hint")}
              data-testid={`booth-tr-bend-${k.side}`}
              data-curve={k.c}
              onPointerDown={bend(k.side)}
              onKeyDown={bendKey(k.side, k.c)}
            />
          );
        })}
      </div>
    </div>
  );
}
