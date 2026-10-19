"use client";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { MetaOrchestra, UserOverrides } from "@/lib/types";
import { Stepper, Switch } from "../ui";
import { useDb } from "./shared";

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
  const rules = overrides.rules ?? {};
  const setRule = (key: keyof Rules, value: unknown) =>
    update((o) => {
      const next = { ...(o.rules ?? {}) } as Record<string, unknown>;
      if (value === undefined) delete next[key];
      else next[key] = value;
      return { ...o, rules: next as Rules };
    });
  const [teKey, setTeKey] = useState("");
  const [teVal, setTeVal] = useState("");
  const [nbId, setNbId] = useState(orchestras[0]?.id ?? "");
  const [nbVal, setNbVal] = useState("0.3");
  const te = rules.trackEnergy ?? {};
  const nb = rules.notBefore ?? {};
  return (
    <div className="space-y-5">
      <p className="text-muted text-sm">
        Rules set here override the composer's defaults for every set. Untouched rules follow the index.
      </p>
      <ul className="divide-y divide-[rgb(var(--text)/.08)]">
        {NUMERIC.map((r) => {
          const v = rules[r.key] as number | undefined;
          return (
            <li key={r.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">{r.label}</div>
                <div className="text-muted text-xs">
                  {v === undefined ? `Index default ${r.def}${r.unit ?? ""}` : "Your rule"}
                  {r.hint ? ` · ${r.hint}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Stepper
                  label={r.label}
                  value={v ?? r.def}
                  min={r.min}
                  max={r.max}
                  step={r.step}
                  unit={r.unit}
                  onChange={(n) => setRule(r.key, n)}
                />
                {v !== undefined && (
                  <button type="button" className="chip text-xs" onClick={() => setRule(r.key, undefined)}>
                    reset
                  </button>
                )}
              </div>
            </li>
          );
        })}
        <li className="py-1">
          <Switch
            label="Mix vocal and instrumental inside a tanda"
            hint={
              rules.mixVocalInstrumental === undefined
                ? "Index default: strict (one singer or all instrumental)"
                : "Your rule"
            }
            checked={rules.mixVocalInstrumental ?? false}
            onChange={(v) => setRule("mixVocalInstrumental", v)}
          />
        </li>
      </ul>

      <div className="border-t border-[rgb(var(--text)/.08)] pt-4">
        <h3 className="font-semibold">Track energy overrides</h3>
        <p className="text-muted mt-1 text-xs">
          Key is “title|orchestra-id” in lower case, e.g. “el flete|juan-d-arienzo”.
        </p>
        <ul className="mt-2 divide-y divide-[rgb(var(--text)/.08)]">
          {Object.entries(te).map(([k, v]) => (
            <li key={k} className="flex min-h-11 items-center gap-3 text-sm">
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{k}</span>
              <span className="tabular-nums">{v}</span>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove ${k}`}
                onClick={() => {
                  const n = { ...te };
                  delete n[k];
                  setRule("trackEnergy", Object.keys(n).length ? n : undefined);
                }}
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-2 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const k = teKey.trim().toLowerCase();
            const v = Number(teVal);
            if (!k.includes("|") || !Number.isFinite(v)) return;
            setRule("trackEnergy", { ...te, [k]: Math.max(0, Math.min(100, Math.round(v))) });
            setTeKey("");
            setTeVal("");
          }}
        >
          <input
            className="field min-w-0 flex-1 font-mono text-xs"
            placeholder="title|orchestra-id"
            aria-label="Track key"
            value={teKey}
            onChange={(e) => setTeKey(e.target.value)}
          />
          <input
            className="field w-24"
            type="number"
            min={0}
            max={100}
            placeholder="0–100"
            aria-label="Energy"
            value={teVal}
            onChange={(e) => setTeVal(e.target.value)}
          />
          <button type="submit" className="btn btn-ghost">
            <Plus size={15} /> Add
          </button>
        </form>
      </div>

      <div className="border-t border-[rgb(var(--text)/.08)] pt-4">
        <h3 className="font-semibold">Not before</h3>
        <p className="text-muted mt-1 text-xs">
          Keep an orchestra out of the first part of the night (fraction 0–1; 0.5 = second half).
        </p>
        <ul className="mt-2 divide-y divide-[rgb(var(--text)/.08)]">
          {Object.entries(nb).map(([id, v]) => (
            <li key={id} className="flex min-h-11 items-center gap-3 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {orchestras.find((o) => o.id === id)?.name ?? id}
              </span>
              <span className="tabular-nums">{v}</span>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove ${id}`}
                onClick={() => {
                  const n = { ...nb };
                  delete n[id];
                  setRule("notBefore", Object.keys(n).length ? n : undefined);
                }}
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-2 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = Number(nbVal);
            if (!nbId || !Number.isFinite(v)) return;
            setRule("notBefore", { ...nb, [nbId]: Math.max(0, Math.min(1, v)) });
          }}
        >
          <select
            className="field min-w-0 flex-1"
            aria-label="Orchestra"
            value={nbId}
            onChange={(e) => setNbId(e.target.value)}
          >
            {orchestras.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <input
            className="field w-24"
            type="number"
            min={0}
            max={1}
            step={0.05}
            aria-label="Fraction of the night"
            value={nbVal}
            onChange={(e) => setNbVal(e.target.value)}
          />
          <button type="submit" className="btn btn-ghost">
            <Plus size={15} /> Add
          </button>
        </form>
      </div>
    </div>
  );
}
