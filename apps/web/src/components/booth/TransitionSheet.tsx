"use client";
import {
  type CurveShape,
  resolveTransition,
  TRANSITION_DEFAULTS,
  TRANSITION_RANGES,
  type TransitionEdit,
  type TransitionPreset,
  transitionKey,
} from "@tdj/core";
import { ChevronLeft, ChevronRight, Headphones, Play, Sparkles, Square, Volume2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useIndicators } from "@/lib/booth/indicatorPrefs";
import { type BoothRow, durationLabel } from "@/lib/booth/plan";
import { bpmOf, keyOf } from "@/lib/booth/songInfo";
import type { PlanEntity } from "@/lib/booth/sources/types";
import { useBooth, type Waveform as WaveData } from "@/lib/booth/store";
import {
  barsToSec,
  curveAt,
  dragHandle,
  lengthLabel,
  type TransitionWindow,
  transitionWindow,
} from "@/lib/booth/transition";
import { t } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { Group, SwitchRow } from "../Form";
import { Sheet } from "../Sheet";
import { Stepper } from "../ui";
import { Artwork } from "../ui/Artwork";

type PresetId = "auto" | TransitionPreset;
const SEC_CHOICES = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12];
const BAR_CHOICES = [0.5, 1, 2, 4, 8];

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

/** What the "length" control sets for each preset, and its range. */
function lengthOf(e: TransitionEdit): number {
  const d = TRANSITION_DEFAULTS[e.preset];
  switch (e.preset) {
    case "gap":
      return e.gapSec ?? d.gapSec;
    case "fade":
      return e.fadeOutSec ?? d.fadeOutSec;
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

/**
 * Wave 4 — the transition editor (the interaction of a playlist "Mix" editor, in T-DJ's own look): the outgoing side
 * on top and the incoming below, their waveforms on one time axis, the transition's box across both with a handle at
 * each end, each side's volume line, an audition button between them, the length, the presets (Auto, Gap, Fade,
 * Blend, Rise, Cortina cut) and the advanced rows (the volume curves, the bass swap). Tango first: inside a tanda the
 * default stays a gap. A full-height sheet on a phone, a panel on an iPad or a desktop; self-contained so the booth's
 * chrome can change around it.
 */
export function TransitionSheet({ at, onClose }: { at: number | null; onClose: () => void }) {
  const items = useBooth((s) => s.plan?.items);
  const [i, setI] = useState<number | null>(at);
  useEffect(() => setI(at), [at]);
  const open = i !== null && hasTransition(items, i);
  // the transitions of the night, for ‹ › (breaks have none)
  const all = useMemo(
    () => (items ? items.map((_, k) => k).filter((k) => hasTransition(items, k)) : []),
    [items],
  );
  const pos = i === null ? -1 : all.indexOf(i);
  // the sheet's Save button saves what the editor holds
  const saveRef = useRef<() => void>(() => {});
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("booth.transition.title")}
      detents={["large"]}
      width={760}
      testId="booth-transition-sheet"
      trailing={t("booth.transition.save")}
      onTrailing={() => saveRef.current()}
    >
      {open && i !== null && (
        <Editor
          key={i}
          i={i}
          prev={pos > 0 ? all[pos - 1]! : null}
          next={pos >= 0 && pos < all.length - 1 ? all[pos + 1]! : null}
          onStep={setI}
          onSaved={onClose}
          saveRef={saveRef}
        />
      )}
    </Sheet>
  );
}

function Editor({
  i,
  prev,
  next,
  onStep,
  onSaved,
  saveRef,
}: {
  i: number;
  prev: number | null;
  next: number | null;
  onStep: (i: number) => void;
  onSaved: () => void;
  saveRef: React.MutableRefObject<() => void>;
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
  const [waves, setWaves] = useState<[WaveData | null, WaveData | null]>([null, null]);
  const ind = useIndicators();
  const bpm = bpmOf(ea)?.value ?? bpmOf(eb)?.value ?? null;
  const [unit, setUnit] = useState<"bars" | "sec">(bpm ? "bars" : "sec");
  const dirty = JSON.stringify(draft) !== JSON.stringify(stored ?? null);

  useEffect(() => {
    let live = true;
    void Promise.all([b0.waveformOf(i), b0.waveformOf(i + 1)]).then((w) => live && setWaves(w));
    return () => {
      live = false;
    };
  }, [i, b0]);

  saveRef.current = () => {
    b0.setTransition(i, draft);
    toast(draft ? t("booth.transition.saved") : t("booth.transition.saved_auto"));
    onSaved();
  };

  const ctx = {
    from: { kind: a.kind, lengthSec: a.lengthSec, tanda: a.tanda },
    to: { kind: b.kind, lengthSec: b.lengthSec, tanda: b.tanda },
    cortinaFadeOutSec: a.kind === "cortina" ? (a.fadeOutSec ?? settings.cortinaFadeOutSec) : undefined,
  };
  const tr = draft ? resolveTransition(draft, ctx) : null;
  const w = transitionWindow(tr, {
    outLen: a.lengthSec,
    inLen: b.lengthSec,
    gapSec: nightGap,
    songFadeOutSec: settings.songFadeOutSec,
    outKind: a.kind,
    cortinaFadeOutSec: a.fadeOutSec ?? settings.cortinaFadeOutSec,
  });
  const preset: PresetId = tr?.preset ?? "auto";
  const cumparsita = a.kind === "closing" || b.kind === "closing";
  const insideTanda = a.kind === "track" && b.kind === "track" && a.tanda === b.tanda;
  const presets: PresetId[] = [
    "auto",
    "gap",
    "fade",
    "blend",
    "rise",
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

  const len = draft ? lengthOf(tr ? { ...draft, ...tr } : draft) : null;
  const range = draft ? lengthRange(draft.preset) : { min: 0, max: 0 };
  const choices = (() => {
    if (!draft) return [] as number[];
    const base = unit === "bars" && bpm ? BAR_CHOICES.map((x) => barsToSec(x, bpm)) : SEC_CHOICES;
    const list = base.filter((s) => s >= range.min && s <= range.max);
    if (len !== null && !list.includes(len)) list.push(len);
    return [...new Set(list)].sort((x, y) => x - y);
  })();

  return (
    <div className="booth-tr" data-preset={preset}>
      <div className="booth-tr-top">
        <span className="booth-tr-beta" data-hint={t("booth.transition.beta_hint")}>
          {t("booth.transition.beta")}
        </span>
        <span className="booth-tr-where text-footnote" data-testid="booth-tr-context">
          {sideName(a)} → {sideName(b)}
        </span>
        <button
          type="button"
          className="icon-btn icon-btn-bare h-11 w-11"
          aria-label={t("booth.transition.previous")}
          data-hint={dirty ? t("booth.transition.save_or_cancel_first") : t("booth.transition.previous")}
          disabled={prev === null || dirty}
          onClick={() => prev !== null && onStep(prev)}
          data-testid="booth-tr-prev"
        >
          <ChevronLeft size={18} strokeWidth={2} aria-hidden />
        </button>
        <button
          type="button"
          className="icon-btn icon-btn-bare h-11 w-11"
          aria-label={t("booth.transition.next")}
          data-hint={dirty ? t("booth.transition.save_or_cancel_first") : t("booth.transition.next")}
          disabled={next === null || dirty}
          onClick={() => next !== null && onStep(next)}
          data-testid="booth-tr-next"
        >
          <ChevronRight size={18} strokeWidth={2} aria-hidden />
        </button>
      </div>

      <Side row={a} entity={ea} which="out" bpmOn={ind.bpm} keyOn={ind.key} />
      <Stage
        a={a}
        b={b}
        w={w}
        waves={waves}
        editable={!cumparsita || preset !== "auto"}
        onDrag={(which, sec) => setDraft(dragHandle(asEdit(), which, sec))}
        center={
          <button
            type="button"
            className="booth-tr-play"
            onClick={() => void audit()}
            disabled={busy || (cannotHear && !hearing)}
            aria-label={hearing ? t("booth.transition.stop_audition") : t("booth.transition.audition")}
            aria-pressed={hearing}
            data-hint={cannotHear ? (blocked ?? "") : t("booth.transition.audition_hint", { where })}
            data-testid="booth-tr-audition"
            data-where={blocked ? "device" : "headphones"}
          >
            {hearing ? (
              <Square size={16} fill="currentColor" strokeWidth={0} aria-hidden />
            ) : (
              <Play size={18} fill="currentColor" strokeWidth={0} aria-hidden />
            )}
          </button>
        }
      />
      <p className="booth-tr-hear text-footnote" data-testid="booth-tr-hear">
        {blocked ? (
          <Volume2 size={14} aria-hidden />
        ) : (
          <Headphones size={14} className="text-[var(--cue)]" aria-hidden />
        )}
        {cannotHear
          ? blocked
          : hearing
            ? t("booth.transition.playing_where", { where })
            : t("booth.transition.audition_plays", { where })}
      </p>
      {hearing && audition?.note && (
        <p className="booth-tr-note text-footnote text-center" data-testid="booth-tr-hear-note">
          {audition.note}
        </p>
      )}
      <div className="booth-tr-length">
        <label className="booth-tr-select" data-hint={t("booth.transition.length_hint")}>
          <span className="sr-only">{t("booth.transition.length")}</span>
          <select
            value={len ?? ""}
            disabled={!draft}
            onChange={(e) => draft && setDraft(withLength(draft, Number(e.target.value)))}
            data-testid="booth-tr-length"
            aria-label={t("booth.transition.length")}
          >
            {!draft && <option value="">{t("booth.transition.follows_mix")}</option>}
            {choices.map((s) => (
              <option key={s} value={s}>
                {lengthLabel(s, bpm, unit)}
              </option>
            ))}
          </select>
        </label>
        {bpm && (
          <div className="booth-tr-unit" role="radiogroup" aria-label={t("booth.transition.unit")}>
            {(["bars", "sec"] as const).map((u) => (
              // biome-ignore lint/a11y/useSemanticElements: a two-way unit switch (WAI-ARIA radio group pattern)
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={unit === u}
                onClick={() => setUnit(u)}
                data-testid={`booth-tr-unit-${u}`}
                data-hint={
                  u === "bars" ? t("booth.transition.bars_hint", { bpm }) : t("booth.transition.seconds_hint")
                }
              >
                {u === "bars" ? t("booth.transition.bars") : t("booth.transition.seconds")}
              </button>
            ))}
          </div>
        )}
      </div>
      <Side row={b} entity={eb} which="in" bpmOn={ind.bpm} keyOn={ind.key} />

      <div className="booth-tr-presets-head">
        <span>{t("booth.transition.presets")}</span>
      </div>
      <div className="booth-tr-presets" role="radiogroup" aria-label={t("booth.transition.presets")}>
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
              {p === "auto" && <Sparkles size={15} strokeWidth={2} aria-hidden />}
              {presetLabel(p)}
            </button>
          );
        })}
      </div>
      <p className="booth-tr-note text-footnote" data-testid="booth-tr-note">
        {cumparsita
          ? t("booth.transition.cumparsita_whole")
          : insideTanda && (preset === "blend" || preset === "rise")
            ? t("booth.transition.inside_tanda_warning")
            : insideTanda
              ? t("booth.transition.inside_tanda_default")
              : presetHint(preset)}
      </p>

      {draft && draft.preset !== "gap" && !(tr && tr.overlapSec > 0) && (
        <Group footer={t("booth.transition.gap_footer")}>
          <div className="cell" data-testid="booth-tr-gap" data-hint={t("booth.transition.gap_row_hint")}>
            <span className="min-w-0 flex-1">
              <span className="block">{t("booth.transition.silence")}</span>
              <span className="text-footnote block text-[var(--label-2)]">
                {tr && tr.overlapSec > 0
                  ? t("booth.transition.no_silence_overlap")
                  : t("booth.transition.gap_row_hint")}
              </span>
            </span>
            <span className="cell-value tabular-nums">{`${tr?.gapSec ?? 0} s`}</span>
            <Stepper
              label={t("booth.transition.silence")}
              value={tr?.gapSec ?? 0}
              unit=" s"
              {...TRANSITION_RANGES.gapSec}
              disabled={!tr || tr.overlapSec > 0}
              onChange={(v) => setDraft({ ...draft, gapSec: v })}
            />
          </div>
        </Group>
      )}

      <Group header={t("booth.transition.advanced")} footer={t("booth.transition.advanced_footer")}>
        <CurveRow
          label={t("booth.transition.volume_out")}
          hint={t("booth.transition.volume_out_hint")}
          value={w.curveOut}
          disabled={!draft || w.outFade.len === 0}
          onChange={(c) => setDraft({ ...asEdit(), curveOut: c })}
          testId="booth-tr-curve-out"
        />
        <CurveRow
          label={t("booth.transition.volume_in")}
          hint={t("booth.transition.volume_in_hint")}
          value={w.curveIn}
          disabled={!draft || w.inFade.len === 0}
          onChange={(c) => setDraft({ ...asEdit(), curveIn: c })}
          testId="booth-tr-curve-in"
        />
        <SwitchRow
          label={t("booth.transition.bass_swap")}
          sub={t("booth.transition.bass_swap_sub")}
          tip={
            tr && tr.overlapSec > 0
              ? t("booth.transition.bass_swap_hint")
              : t("booth.transition.bass_swap_needs_overlap")
          }
          checked={!!tr?.bassSwap}
          disabled={!tr || tr.overlapSec <= 0}
          onChange={(v) => draft && setDraft({ ...draft, bassSwap: v })}
        />
      </Group>
      {dirty && (
        <p className="section-foot" data-testid="booth-tr-unsaved">
          {t("booth.transition.unsaved")}
        </p>
      )}
    </div>
  );
}

function sideName(r: BoothRow): string {
  if (r.kind === "cortina") return t("booth.transition.cortina");
  if (r.kind === "closing") return "La Cumparsita";
  return r.title;
}

function CurveRow({
  label,
  hint,
  value,
  disabled,
  onChange,
  testId,
}: {
  label: string;
  hint: string;
  value: CurveShape;
  disabled: boolean;
  onChange: (c: CurveShape) => void;
  testId: string;
}) {
  return (
    <label className="cell" data-hint={hint}>
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        <span className="text-footnote block text-[var(--label-2)]">{hint}</span>
      </span>
      <select
        className="booth-tr-curve"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as CurveShape)}
        data-testid={testId}
        aria-label={label}
      >
        {(["linear", "equalPower", "sCurve"] as const).map((c) => (
          <option key={c} value={c}>
            {curveLabel(c)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A side: artwork, title, artist; BPM, the Camelot key chip and its length on the right. */
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
    <div className="booth-tr-side" data-side={which} data-testid={`booth-tr-${which}`}>
      <Artwork entity={entity} orchestra={row.artist} size={52} />
      <div className="min-w-0 flex-1">
        <p className="booth-tr-title truncate">{row.title}</p>
        <p className="text-footnote truncate text-[var(--label-2)]">
          {row.kind === "cortina" ? t("booth.transition.cortina_by", { artist: row.artist }) : row.artist}
        </p>
      </div>
      <div className="booth-tr-facts">
        <span
          className="tabular-nums"
          data-hint={bpm ? `${bpm.value} BPM · ${bpm.source}` : t("bpmKey.bpm_unknown")}
        >
          {bpm ? t("booth.transition.bpm", { bpm: bpm.value }) : "–"}
        </span>
        <span className="flex items-center gap-1.5">
          {key && (
            <span
              className="booth-tr-key"
              data-hint={t("bpmKey.key_line", { camelot: key.camelot, name: key.name, source: key.source })}
              data-testid="booth-tr-key"
            >
              {key.camelot}
            </span>
          )}
          <span className="tabular-nums">{durationLabel(row.lengthSec)}</span>
        </span>
      </div>
    </div>
  );
}

/**
 * The two waveforms on one time axis (seconds relative to the outgoing side's end), the transition's box across both
 * with a draggable handle at each end, and each side's volume line. Without decodable audio (Spotify only) each side
 * is a neutral bar and the lines still show.
 */
function Stage({
  a,
  b,
  w,
  waves,
  editable,
  onDrag,
  center,
}: {
  a: BoothRow;
  b: BoothRow;
  w: TransitionWindow;
  waves: [WaveData | null, WaveData | null];
  editable: boolean;
  onDrag: (which: "start" | "end", sec: number) => void;
  center: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const lo0 = Math.min(w.box.start, w.inStart, w.outFade.start, 0);
  const hi0 = Math.max(w.box.end, w.inStart + w.inFade.len, 0);
  const pad = Math.max(4, (hi0 - lo0) * 0.6);
  const T0 = lo0 - pad;
  const T1 = hi0 + pad;
  const span = T1 - T0;
  const X = (t: number) => ((t - T0) / span) * 1000;
  const pct = (t: number) => `${((t - T0) / span) * 100}%`;
  const N = 150;
  const [wa, wb] = waves;
  // where each side's audio sits on the axis
  const outEnd = (d: WaveData) =>
    d.from === "file" ? Math.min(d.durationSec, (a.trimInSec ?? 0) + a.lengthSec) : d.durationSec;
  const inStart0 = (d: WaveData) => (d.from === "file" ? (b.trimInSec ?? 0) : 0);
  const peakAt = (d: WaveData, sec: number) => {
    if (sec < 0 || sec > d.durationSec) return -1;
    return d.peaks[Math.min(d.peaks.length - 1, Math.floor((sec / d.durationSec) * d.peaks.length))] ?? 0;
  };
  const outStopT = Math.min(0, w.outStop);
  const bars = (lane: "out" | "in") => {
    const d = lane === "out" ? wa : wb;
    const cy = lane === "out" ? 50 : 200;
    const out: React.ReactNode[] = [];
    for (let c = 0; c < N; c++) {
      const tm = T0 + ((c + 0.5) / N) * span;
      const live = lane === "out" ? tm <= outStopT : tm >= w.inStart;
      if (!live) continue;
      let v: number;
      if (d) {
        const sec = lane === "out" ? outEnd(d) + tm : inStart0(d) + (tm - w.inStart);
        v = peakAt(d, sec);
        if (v < 0) continue;
      } else v = 0.06;
      const h = Math.max(2, v * 84);
      out.push(
        <rect
          key={c}
          x={(c / N) * 1000 + 1}
          y={cy - h / 2}
          width={1000 / N - 2}
          height={h}
          rx={1}
          className={d ? "booth-tr-bar" : "booth-tr-bar-flat"}
        />,
      );
    }
    return out;
  };
  const gainOut = (tm: number) => {
    if (tm > outStopT) return 0;
    if (w.outFade.len <= 0) return tm >= 0 ? 0 : 1;
    if (tm < w.outFade.start) return 1;
    return curveAt(w.curveOut, "out", (tm - w.outFade.start) / w.outFade.len);
  };
  const gainIn = (tm: number) => {
    if (tm < w.inStart) return 0;
    if (w.inFade.len <= 0) return 1;
    return curveAt(w.curveIn, "in", (tm - w.inStart) / w.inFade.len);
  };
  const line = (g: (t: number) => number, base: number) =>
    Array.from({ length: 241 }, (_, k) => {
      const tm = T0 + (k / 240) * span;
      return `${X(tm).toFixed(1)},${(base - g(tm) * 80).toFixed(1)}`;
    }).join(" ");

  const drag = (which: "start" | "end") => (ev: React.PointerEvent<HTMLDivElement>) => {
    if (!editable) return;
    ev.preventDefault();
    const el = ev.currentTarget;
    el.setPointerCapture(ev.pointerId);
    const move = (e: PointerEvent) => {
      const r = box.current?.getBoundingClientRect();
      if (r && r.width > 0) onDrag(which, T0 + ((e.clientX - r.left) / r.width) * span);
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };
  const key = (which: "start" | "end") => (e: React.KeyboardEvent) => {
    if (!editable) return;
    const v = which === "start" ? w.box.start : w.box.end;
    const step = e.shiftKey ? 2 : 0.5;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") onDrag(which, v - step);
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") onDrag(which, v + step);
    else return;
    e.preventDefault();
  };
  const noAudio = !wa || !wb;
  return (
    <>
      <div
        className="booth-tr-stage"
        ref={box}
        data-testid="booth-tr-stage"
        data-has-peaks={!noAudio || undefined}
      >
        <svg viewBox="0 0 1000 250" preserveAspectRatio="none" aria-hidden>
          <line x1={X(0)} x2={X(0)} y1={0} y2={250} className="booth-tr-zero" />
          {bars("out")}
          {bars("in")}
          <polyline points={line(gainOut, 92)} className="booth-tr-line-out" />
          <polyline points={line(gainIn, 242)} className="booth-tr-line-in" />
        </svg>
        <div
          className="booth-tr-box"
          style={{ left: pct(w.box.start), width: `calc(${pct(w.box.end)} - ${pct(w.box.start)})` }}
          data-testid="booth-tr-box"
          data-start={w.box.start}
          data-end={w.box.end}
        />
        {(["start", "end"] as const).map((which) => {
          const v = which === "start" ? w.box.start : w.box.end;
          return (
            <div
              key={which}
              className="booth-tr-handle"
              style={{ left: pct(v) }}
              role="slider"
              tabIndex={editable ? 0 : -1}
              aria-label={
                which === "start" ? t("booth.transition.handle_start") : t("booth.transition.handle_end")
              }
              aria-valuemin={Math.round(T0)}
              aria-valuemax={Math.round(T1)}
              aria-valuenow={Math.round(v * 10) / 10}
              aria-valuetext={t("booth.transition.handle_value", {
                sec: Math.round(Math.abs(v) * 10) / 10,
                p1: v < 0 ? "−" : "+",
              })}
              aria-disabled={!editable || undefined}
              data-hint={
                which === "start"
                  ? t("booth.transition.handle_start_hint")
                  : t("booth.transition.handle_end_hint")
              }
              data-testid={`booth-tr-${which}`}
              onPointerDown={drag(which)}
              onKeyDown={key(which)}
            />
          );
        })}
        <div className="booth-tr-center" style={{ left: pct((w.box.start + w.box.end) / 2) }}>
          {center}
        </div>
      </div>
      {noAudio && (
        <p className="booth-tr-noaudio text-footnote" data-testid="booth-tr-noaudio">
          {t("booth.transition.no_waveform")}
        </p>
      )}
    </>
  );
}
