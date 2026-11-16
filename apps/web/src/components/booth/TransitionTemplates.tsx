"use client";
import {
  CURVE_SHAPES,
  type CurveShape,
  SILENCE_MODES,
  type SilenceMode,
  TRANSITION_DEFAULTS,
  TRANSITION_EQS,
  type TransitionEdit,
  type TransitionEq,
  type TransitionPreset,
} from "@tdj/core";
import { ArrowDown, ArrowUp, Layers, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  BOUNDARIES,
  type Boundary,
  cleanEdit,
  TEMPLATE_RHYTHMS,
  type TemplateRhythm,
  type TransitionTemplate,
  useTemplates,
} from "@/lib/booth/transitionTemplates";
import { type MsgKey, t } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { Group, PickerRow, Row, Tile } from "../Form";
import { Sheet } from "../Sheet";

/**
 * 2026-11 — Settings → Booth → Transitions: the DJ's own transition templates (saved from the Booth's transition
 * editor with "Save as template…"): rename, edit, reorder and delete them, and set a default per kind of join and,
 * inside a tanda, per rhythm. Kept on this device (lib/booth/transitionTemplates.ts).
 */
const PRESETS: TransitionPreset[] = ["gap", "fade", "rise", "blend", "cortinaCut"];
const presetName = (p: TransitionPreset) =>
  t(
    (
      {
        gap: "booth.transition.gap",
        fade: "booth.transition.fade",
        rise: "booth.transition.rise",
        blend: "booth.transition.blend",
        cortinaCut: "booth.transition.cortina_cut",
      } as const
    )[p],
  );
const curveName = (c: CurveShape) =>
  c === "linear"
    ? t("booth.transition.curve_linear")
    : c === "equalPower"
      ? t("booth.transition.curve_equal_power")
      : t("booth.transition.curve_s_curve");
const eqName = (e: TransitionEq) =>
  e === "bassSwap"
    ? t("booth.transition.eq_bass_swap")
    : e === "threeBand"
      ? t("booth.transition.eq_three_band")
      : t("booth.transition.eq_none");
const silenceName = (m: SilenceMode) =>
  m === "gap" ? t("booth.silence.gap") : m === "after" ? t("booth.silence.after") : t("booth.silence.off");
const BOUNDARY_KEY: Record<Boundary, MsgKey> = {
  inTanda: "settings.transitions.in_tanda",
  toCortina: "settings.transitions.to_cortina",
  fromCortina: "settings.transitions.from_cortina",
  cumparsita: "settings.transitions.cumparsita",
};
const RHYTHM_KEY: Record<TemplateRhythm, MsgKey> = {
  tango: "settings.transitions.rhythm_tango",
  vals: "settings.transitions.rhythm_vals",
  milonga: "settings.transitions.rhythm_milonga",
};

/** "Fade · out 3 s · in 2 s · gap 1 s · S-curve" */
export function templateSummary(e: TransitionEdit): string {
  const d = TRANSITION_DEFAULTS[e.preset];
  const parts = [presetName(e.preset)];
  const s = (v: number | undefined, dv: number) => v ?? dv;
  if (e.preset === "blend" || e.preset === "rise")
    parts.push(t("settings.transitions.sum_overlap", { sec: s(e.overlapSec, d.overlapSec) }));
  if (e.preset === "fade" || e.preset === "cortinaCut" || e.preset === "blend")
    parts.push(t("settings.transitions.sum_out", { sec: s(e.fadeOutSec, d.fadeOutSec) }));
  if (e.preset === "fade" || e.preset === "rise" || e.preset === "blend")
    parts.push(t("settings.transitions.sum_in", { sec: s(e.fadeInSec, d.fadeInSec) }));
  if (e.preset === "gap" || e.preset === "fade" || e.preset === "cortinaCut")
    parts.push(t("settings.transitions.sum_gap", { sec: s(e.gapSec, d.gapSec) }));
  if (e.preset !== "gap") parts.push(curveName(e.curveOut ?? d.curveOut));
  if (e.eq && e.eq !== "none") parts.push(eqName(e.eq));
  if (e.silence) parts.push(silenceName(e.silence));
  return parts.join(" · ");
}

export function TransitionTemplatesGroup() {
  const st = useTemplates();
  useEffect(() => useTemplates.getState().hydrate(), []);
  const [editing, setEditing] = useState<TransitionTemplate | null>(null);
  const items: Array<[string, string]> = st.templates.map((x) => [x.id, x.name]);
  const last = st.templates.length - 1;
  return (
    <>
      <Group
        header={t("settings.transitions.header")}
        footer={t("settings.transitions.footer")}
        data-testid="settings-transitions"
      >
        {st.templates.length === 0 && (
          <Row
            tile={
              <Tile color="#AF52DE">
                <Layers size={16} strokeWidth={2} />
              </Tile>
            }
            label={t("settings.transitions.none")}
            sub={t("settings.transitions.none_sub")}
          />
        )}
        {st.templates.map((x, k) => (
          <div
            key={x.id}
            className="cell"
            data-leading="tile"
            data-testid={`settings-template-${x.id}`}
            data-name={x.name}
          >
            <Tile color="#AF52DE">
              <Layers size={16} strokeWidth={2} />
            </Tile>
            <span className="min-w-0 flex-1">
              <span className="cell-label">{x.name}</span>
              <span className="text-footnote cell-sub text-[var(--label-2)]">{templateSummary(x.edit)}</span>
            </span>
            <span className="flex shrink-0 items-center">
              <button
                type="button"
                className="grid h-11 w-11 place-items-center rounded-full text-[var(--tint)] disabled:text-[var(--label-3)]"
                onClick={() => st.move(x.id, -1)}
                disabled={k === 0}
                aria-label={t("settings.transitions.move_up", { name: x.name })}
                data-testid={`settings-template-up-${x.id}`}
              >
                <ArrowUp size={18} strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                className="grid h-11 w-11 place-items-center rounded-full text-[var(--tint)] disabled:text-[var(--label-3)]"
                onClick={() => st.move(x.id, 1)}
                disabled={k === last}
                aria-label={t("settings.transitions.move_down", { name: x.name })}
                data-testid={`settings-template-down-${x.id}`}
              >
                <ArrowDown size={18} strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                className="grid h-11 w-11 place-items-center rounded-full text-[var(--tint)] disabled:text-[var(--label-3)]"
                onClick={() => setEditing(x)}
                aria-label={t("settings.transitions.edit", { name: x.name })}
                data-testid={`settings-template-edit-${x.id}`}
              >
                <Pencil size={18} strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                className="grid h-11 w-11 place-items-center rounded-full text-[var(--destructive)] disabled:text-[var(--label-3)]"
                onClick={() => {
                  const before = useTemplates.getState();
                  const snapshot = { v: 1 as const, templates: before.templates, defaults: before.defaults };
                  st.remove(x.id);
                  toast(
                    t("settings.transitions.deleted", { name: x.name }),
                    () => useTemplates.getState().replace(snapshot),
                    t("editKeys.undo"),
                  );
                }}
                aria-label={t("settings.transitions.delete", { name: x.name })}
                data-testid={`settings-template-delete-${x.id}`}
              >
                <Trash2 size={18} strokeWidth={2} aria-hidden />
              </button>
            </span>
          </div>
        ))}
      </Group>
      <Group
        header={t("settings.transitions.defaults_header")}
        footer={t("settings.transitions.defaults_footer")}
        data-testid="settings-transition-defaults"
      >
        {BOUNDARIES.map((bd) => (
          <PickerRow
            key={bd}
            label={t(BOUNDARY_KEY[bd])}
            value={st.defaults.boundary[bd]}
            items={items}
            placeholder={t("booth.transition.auto")}
            onChange={(id) => st.setDefault({ boundary: bd }, id ?? null)}
            ariaLabel={t(BOUNDARY_KEY[bd])}
          />
        ))}
        {TEMPLATE_RHYTHMS.map((r) => (
          <PickerRow
            key={r}
            label={t(RHYTHM_KEY[r])}
            sub={t("settings.transitions.rhythm_sub")}
            value={st.defaults.rhythm[r]}
            items={items}
            placeholder={t("settings.transitions.as_above")}
            onChange={(id) => st.setDefault({ rhythm: r }, id ?? null)}
            ariaLabel={t(RHYTHM_KEY[r])}
          />
        ))}
      </Group>
      <TemplateSheet template={editing} onClose={() => setEditing(null)} />
    </>
  );
}

const SEC = (lo: number, hi: number, step = 0.5) => {
  const out: Array<[string, string]> = [];
  for (let v = lo; v <= hi + 1e-9; v += step)
    out.push([String(Math.round(v * 10) / 10), `${Math.round(v * 10) / 10} s`]);
  return out;
};

/** Edit a template: its name, preset, lengths, curves, EQ and silence. */
function TemplateSheet({ template, onClose }: { template: TransitionTemplate | null; onClose: () => void }) {
  const [name, setName] = useState("");
  const [edit, setEdit] = useState<TransitionEdit>({ preset: "gap" });
  useEffect(() => {
    if (!template) return;
    setName(template.name);
    setEdit({ ...template.edit });
  }, [template]);
  const save = () => {
    if (!template) return;
    const st = useTemplates.getState();
    if (name.trim() && name.trim() !== template.name) st.rename(template.id, name);
    st.update(template.id, cleanEdit(edit));
    onClose();
  };
  const p = edit.preset;
  const d = TRANSITION_DEFAULTS[p];
  const num = (k: keyof TransitionEdit, v: string | undefined) =>
    setEdit((e) => ({ ...e, [k]: v === undefined ? undefined : Number(v) }));
  const val = (v: number | undefined, dv: number) => String(v ?? dv);
  const overlap = p === "blend" || p === "rise";
  return (
    <Sheet
      open={!!template}
      onClose={onClose}
      title={t("settings.transitions.edit_title")}
      trailing={t("settings.done")}
      onTrailing={save}
      testId="settings-template-sheet"
    >
      <Group>
        <label className="cell" htmlFor="tpl-name">
          <span className="cell-label min-w-0 flex-[0_1_45%]">{t("booth.transition.template_name")}</span>
          <input
            id="tpl-name"
            className="field"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            data-testid="settings-template-name"
          />
        </label>
        <PickerRow
          label={t("settings.transitions.preset")}
          value={p}
          items={PRESETS.map((x) => [x, presetName(x)] as [TransitionPreset, string])}
          onChange={(x) => x && setEdit((e) => ({ ...e, preset: x }))}
          ariaLabel={t("settings.transitions.preset")}
        />
        {overlap && (
          <PickerRow
            label={t("settings.transitions.overlap")}
            value={val(edit.overlapSec, d.overlapSec)}
            items={SEC(1, 12)}
            onChange={(v) => num("overlapSec", v)}
          />
        )}
        {(p === "fade" || p === "blend" || p === "cortinaCut") && (
          <PickerRow
            label={t("settings.transitions.fade_out")}
            value={val(edit.fadeOutSec, d.fadeOutSec)}
            items={SEC(0, 10)}
            onChange={(v) => num("fadeOutSec", v)}
          />
        )}
        {(p === "fade" || p === "blend" || p === "rise") && (
          <PickerRow
            label={t("settings.transitions.fade_in")}
            value={val(edit.fadeInSec, d.fadeInSec)}
            items={SEC(0, 10)}
            onChange={(v) => num("fadeInSec", v)}
          />
        )}
        {!overlap && (
          <PickerRow
            label={t("settings.transitions.gap")}
            value={val(edit.gapSec, d.gapSec)}
            items={SEC(0.5, 5)}
            onChange={(v) => num("gapSec", v)}
          />
        )}
        {p !== "gap" && (
          <>
            <PickerRow
              label={t("settings.transitions.curve_out")}
              value={edit.curveOut ?? d.curveOut}
              items={CURVE_SHAPES.map((c) => [c, curveName(c)] as [CurveShape, string])}
              onChange={(c) => c && setEdit((e) => ({ ...e, curveOut: c }))}
            />
            <PickerRow
              label={t("settings.transitions.curve_in")}
              value={edit.curveIn ?? d.curveIn}
              items={CURVE_SHAPES.map((c) => [c, curveName(c)] as [CurveShape, string])}
              onChange={(c) => c && setEdit((e) => ({ ...e, curveIn: c }))}
            />
          </>
        )}
        {overlap && (
          <PickerRow
            label={t("booth.transition.eq")}
            value={edit.eq ?? "none"}
            items={TRANSITION_EQS.map((x) => [x, eqName(x)] as [TransitionEq, string])}
            onChange={(x) => setEdit((e) => ({ ...e, eq: x ?? "none", bassSwap: !!x && x !== "none" }))}
          />
        )}
        <PickerRow
          label={t("booth.transition.silence")}
          value={edit.silence}
          items={SILENCE_MODES.map((m) => [m, silenceName(m)] as [SilenceMode, string])}
          placeholder={t("settings.transitions.silence_night")}
          onChange={(m) => setEdit((e) => ({ ...e, silence: m }))}
        />
      </Group>
      <p className="section-foot">{templateSummary(cleanEdit(edit))}</p>
    </Sheet>
  );
}
