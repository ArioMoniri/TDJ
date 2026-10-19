"use client";
import { Trash2 } from "lucide-react";
import { useState } from "react";
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
    label: "Orchestra repeat gap",
    hint: "tandas between two of the same orchestra",
    def: 6,
    min: 1,
    max: 12,
    step: 1,
  },
  {
    key: "singerRepeatGap",
    label: "Singer repeat gap",
    hint: "tandas between two of the same singer",
    def: 4,
    min: 1,
    max: 12,
    step: 1,
  },
  {
    key: "maxYearSpread",
    label: "Year spread inside a tanda",
    hint: "recordings within this many years",
    def: 4,
    min: 1,
    max: 12,
    step: 1,
    unit: " y",
  },
  { key: "tangoTandaSize", label: "Tango tanda size", hint: "", def: 4, min: 3, max: 5, step: 1 },
  { key: "valsTandaSize", label: "Vals tanda size", hint: "", def: 3, min: 3, max: 4, step: 1 },
  { key: "milongaTandaSize", label: "Milonga tanda size", hint: "", def: 3, min: 3, max: 4, step: 1 },
  {
    key: "cortinaLengthSec",
    label: "Cortina length",
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
      <Group
        header="Rules"
        footer="Rules set here override the composer's defaults for every set. Untouched rules follow the index."
      >
        {NUMERIC.map((r) => {
          const v = rules[r.key] as number | undefined;
          return (
            <StepperRow
              key={r.key}
              label={r.label}
              sub={r.hint || undefined}
              value={v ?? r.def}
              unit={r.unit ?? ""}
              display={v === undefined ? `Index default ${r.def}${r.unit ?? ""}` : undefined}
              min={r.min}
              max={r.max}
              step={r.step}
              onChange={(n) => setRule(r.key, n)}
            >
              {editing && v !== undefined && (
                <button type="button" className="btn-plain" onClick={() => setRule(r.key, undefined)}>
                  Revert
                </button>
              )}
            </StepperRow>
          );
        })}
        <SwitchRow
          label="Mix vocal and instrumental inside a tanda"
          sub={
            rules.mixVocalInstrumental === undefined
              ? "Index default: strict (one singer or all instrumental)"
              : "Your rule"
          }
          checked={rules.mixVocalInstrumental ?? false}
          onChange={(v) => setRule("mixVocalInstrumental", v)}
        />
      </Group>

      <Group
        header="Track energy"
        footer="Key is “title|orchestra-id” in lower case, e.g. “el flete|juan-d-arienzo”."
      >
        {Object.entries(te).map(([k, v]) => (
          <SwipeRow
            key={k}
            actions={[
              {
                kind: "destructive",
                label: "Delete",
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
                  aria-label={`Remove ${k}`}
                  onClick={() => {
                    const n = { ...te };
                    delete n[k];
                    setRule("trackEnergy", Object.keys(n).length ? n : undefined);
                  }}
                >
                  Remove
                </button>
              )}
            </Row>
          </SwipeRow>
        ))}
        <ActionRow label="Add a track energy…" onClick={() => setTeOpen(true)} />
      </Group>

      <Group
        header="Not before"
        footer="Keep an orchestra out of the first part of the night (0.5 = second half)."
      >
        {Object.entries(nb).map(([id, v]) => (
          <SwipeRow
            key={id}
            actions={[
              {
                kind: "destructive",
                label: "Delete",
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
                  aria-label={`Remove ${id}`}
                  onClick={() => {
                    const n = { ...nb };
                    delete n[id];
                    setRule("notBefore", Object.keys(n).length ? n : undefined);
                  }}
                >
                  Remove
                </button>
              )}
            </Row>
          </SwipeRow>
        ))}
        <ActionRow label="Add an orchestra…" onClick={() => setNbOpen(true)} />
      </Group>

      <Sheet
        open={teOpen}
        onClose={() => setTeOpen(false)}
        title="Track energy"
        trailing="Add"
        onTrailing={addTe}
      >
        <Group footer="The energy replaces the computed one for that recording.">
          <FieldRow label="Track" id="te-key">
            <input
              id="te-key"
              className="field field-value min-w-0 flex-1 font-mono"
              placeholder="title|orchestra-id"
              value={teKey}
              onChange={(e) => setTeKey(e.target.value)}
              data-autofocus
              autoComplete="off"
            />
          </FieldRow>
          <FieldRow label="Energy" id="te-val">
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
        title="Not before"
        trailing="Add"
        onTrailing={addNb}
      >
        <Group>
          <PickerRow
            label="Orchestra"
            ariaLabel="Orchestra"
            value={nbId}
            items={orchestras.map((o) => [o.id, o.name])}
            onChange={(v) => v && setNbId(v)}
          />
          <FieldRow label="Fraction of the night" id="nb-val">
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
