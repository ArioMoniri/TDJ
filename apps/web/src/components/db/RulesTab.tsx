"use client";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { t } from "@/lib/i18n";
import type { MetaOrchestra, UserOverrides } from "@/lib/types";
import { ActionRow, FieldRow, Group, PickerRow, Row, StepperRow, SwitchRow } from "../Form";
import { Sheet } from "../Sheet";
import { SwipeRow } from "../SwipeRow";
import { useDb, useDbEdit } from "./shared";

type Rules = NonNullable<UserOverrides["rules"]>;
const NUMERIC: Array<{
  key: keyof Rules;
  label: string;
  hint: string;
  def: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
}> = [
  {
    key: "orchestraRepeatGap",
    get label() {
      return t("db.rulesTab.orchestra_repeat_gap");
    },
    get hint() {
      return t("db.rulesTab.tandas_between_two_of_the_same_2");
    },
    def: 6,
    min: 1,
    max: 12,
    step: 1,
  },
  {
    key: "singerRepeatGap",
    get label() {
      return t("db.rulesTab.singer_repeat_gap");
    },
    get hint() {
      return t("db.rulesTab.tandas_between_two_of_the_same");
    },
    def: 4,
    min: 1,
    max: 12,
    step: 1,
  },
  {
    key: "maxYearSpread",
    get label() {
      return t("db.rulesTab.year_spread_inside_a_tanda");
    },
    get hint() {
      return t("db.rulesTab.recordings_within_this_many_years");
    },
    def: 4,
    min: 1,
    max: 12,
    step: 1,
    unit: " y",
  },
  {
    key: "tangoTandaSize",
    get label() {
      return t("db.rulesTab.tango_tanda_size");
    },
    hint: "",
    def: 4,
    min: 3,
    max: 5,
    step: 1,
  },
  {
    key: "valsTandaSize",
    get label() {
      return t("db.rulesTab.vals_tanda_size");
    },
    hint: "",
    def: 3,
    min: 3,
    max: 4,
    step: 1,
  },
  {
    key: "milongaTandaSize",
    get label() {
      return t("db.rulesTab.milonga_tanda_size");
    },
    hint: "",
    def: 3,
    min: 3,
    max: 4,
    step: 1,
  },
  {
    key: "cortinaLengthSec",
    get label() {
      return t("db.rulesTab.cortina_length");
    },
    hint: "",
    def: 45,
    min: 20,
    max: 90,
    step: 5,
    unit: " s",
  },
];

export function RulesTab({ orchestras }: { orchestras: MetaOrchestra[] }) {
  const { overrides, update } = useDb();
  const editing = useDbEdit();
  const rules = overrides.rules ?? {};
  const setRule = (key: keyof Rules, value: unknown) =>
    update((o) => {
      const next = { ...(o.rules ?? {}) } as Record<string, unknown>;
      if (value === undefined) delete next[key];
      else next[key] = value;
      return { ...o, rules: next as Rules };
    });
  const [teOpen, setTeOpen] = useState(false);
  const [nbOpen, setNbOpen] = useState(false);
  const [teKey, setTeKey] = useState("");
  const [teVal, setTeVal] = useState("");
  const [nbId, setNbId] = useState(orchestras[0]?.id ?? "");
  const [nbVal, setNbVal] = useState("0.3");
  const te = rules.trackEnergy ?? {};
  const nb = rules.notBefore ?? {};
  const addTe = () => {
    const k = teKey.trim().toLowerCase();
    const v = Number(teVal);
    if (!k.includes("|") || !Number.isFinite(v)) return;
    setRule("trackEnergy", { ...te, [k]: Math.max(0, Math.min(100, Math.round(v))) });
    setTeKey("");
    setTeVal("");
    setTeOpen(false);
  };
  const addNb = () => {
    const v = Number(nbVal);
    if (!nbId || !Number.isFinite(v)) return;
    setRule("notBefore", { ...nb, [nbId]: Math.max(0, Math.min(1, v)) });
    setNbOpen(false);
  };
  return (
    <div>
      <Group header={t("db.rulesTab.rules")} footer={t("db.rulesTab.rules_set_here_override_the_composer")}>
        {NUMERIC.map((r) => {
          const v = rules[r.key] as number | undefined;
          return (
            <StepperRow
              key={r.key}
              label={r.label}
              sub={r.hint || undefined}
              value={v ?? r.def}
              unit={r.unit ?? ""}
              display={
                v === undefined
                  ? t("db.rulesTab.index_default", { value: `${r.def}${r.unit ?? ""}` })
                  : undefined
              }
              min={r.min}
              max={r.max}
              step={r.step}
              onChange={(n) => setRule(r.key, n)}
            >
              {editing && v !== undefined && (
                <button type="button" className="btn-plain" onClick={() => setRule(r.key, undefined)}>
                  {t("db.rulesTab.revert")}
                </button>
              )}
            </StepperRow>
          );
        })}
        <SwitchRow
          label={t("db.rulesTab.mix_vocal_and_instrumental_inside_a")}
          sub={
            rules.mixVocalInstrumental === undefined
              ? t("db.rulesTab.index_default_strict_one_singer_or")
              : t("db.rulesTab.your_rule")
          }
          checked={rules.mixVocalInstrumental ?? false}
          onChange={(v) => setRule("mixVocalInstrumental", v)}
        />
      </Group>

      <Group header={t("db.rulesTab.track_energy")} footer={t("db.rulesTab.key_is_title_orchestra_id_in")}>
        {Object.entries(te).map(([k, v]) => (
          <SwipeRow
            key={k}
            actions={[
              {
                kind: "destructive",
                label: t("common.delete"),
                icon: Trash2,
                onClick: () => {
                  const n = { ...te };
                  delete n[k];
                  setRule("trackEnergy", Object.keys(n).length ? n : undefined);
                },
              },
            ]}
          >
            <Row label={<span className="font-mono text-footnote">{k}</span>} value={v}>
              {editing && (
                <button
                  type="button"
                  className="btn-plain text-[var(--destructive)]"
                  aria-label={t("db.rulesTab.remove_3", { k })}
                  onClick={() => {
                    const n = { ...te };
                    delete n[k];
                    setRule("trackEnergy", Object.keys(n).length ? n : undefined);
                  }}
                >
                  {t("db.rulesTab.remove")}
                </button>
              )}
            </Row>
          </SwipeRow>
        ))}
        <ActionRow
          label={t("db.rulesTab.add_a_track_energy")}
          tip={t("db.rulesTab.set_how_lively_one_recording_feels")}
          onClick={() => setTeOpen(true)}
        />
      </Group>

      <Group header={t("db.rulesTab.not_before")} footer={t("db.rulesTab.keep_an_orchestra_out_of_the")}>
        {Object.entries(nb).map(([id, v]) => (
          <SwipeRow
            key={id}
            actions={[
              {
                kind: "destructive",
                label: t("common.delete"),
                icon: Trash2,
                onClick: () => {
                  const n = { ...nb };
                  delete n[id];
                  setRule("notBefore", Object.keys(n).length ? n : undefined);
                },
              },
            ]}
          >
            <Row label={orchestras.find((o) => o.id === id)?.name ?? id} value={v}>
              {editing && (
                <button
                  type="button"
                  className="btn-plain text-[var(--destructive)]"
                  aria-label={t("db.rulesTab.remove_2", { id })}
                  onClick={() => {
                    const n = { ...nb };
                    delete n[id];
                    setRule("notBefore", Object.keys(n).length ? n : undefined);
                  }}
                >
                  {t("db.rulesTab.remove")}
                </button>
              )}
            </Row>
          </SwipeRow>
        ))}
        <ActionRow
          label={t("db.rulesTab.add_an_orchestra")}
          tip={t("db.rulesTab.describe_an_orchestra_the_composer_does")}
          onClick={() => setNbOpen(true)}
        />
      </Group>

      <Sheet
        open={teOpen}
        onClose={() => setTeOpen(false)}
        title={t("db.rulesTab.track_energy")}
        trailing={t("db.rulesTab.add")}
        onTrailing={addTe}
      >
        <Group footer={t("db.rulesTab.the_energy_replaces_the_computed_one")}>
          <FieldRow label={t("db.rulesTab.track")} id="te-key">
            <input
              id="te-key"
              className="field field-value min-w-0 flex-1 font-mono"
              placeholder={t("db.rulesTab.title_orchestra_id")}
              value={teKey}
              onChange={(e) => setTeKey(e.target.value)}
              data-autofocus
              autoComplete="off"
            />
          </FieldRow>
          <FieldRow label={t("db.rulesTab.energy")} id="te-val">
            <input
              id="te-val"
              className="field field-value min-w-0 flex-1"
              type="number"
              min={0}
              max={100}
              placeholder="0–100"
              value={teVal}
              onChange={(e) => setTeVal(e.target.value)}
            />
          </FieldRow>
        </Group>
      </Sheet>
      <Sheet
        open={nbOpen}
        onClose={() => setNbOpen(false)}
        title={t("db.rulesTab.not_before")}
        trailing={t("db.rulesTab.add")}
        onTrailing={addNb}
      >
        <Group>
          <PickerRow
            label={t("db.rulesTab.orchestra")}
            ariaLabel={t("db.rulesTab.orchestra")}
            value={nbId}
            items={orchestras.map((o) => [o.id, o.name])}
            onChange={(v) => v && setNbId(v)}
          />
          <FieldRow label={t("db.rulesTab.fraction_of_the_night")} id="nb-val">
            <input
              id="nb-val"
              className="field field-value min-w-0 flex-1"
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={nbVal}
              onChange={(e) => setNbVal(e.target.value)}
            />
          </FieldRow>
        </Group>
      </Sheet>
    </div>
  );
}
