"use client";
import { ChevronDown } from "lucide-react";
import { EVIDENCE_COLOR, EVIDENCE_LABEL } from "@/lib/context";
import type { ContextModel } from "@/lib/types";
import { Empty, Num, useDb } from "./shared";

const FIELDS: Array<{
  key: "energyShift" | "tempoShift" | "valsShare" | "milongaShare" | "vocalRatioShift";
  label: string;
  min: number;
  max: number;
  step: number;
  pct?: boolean;
}> = [
  { key: "energyShift", label: "Energy", min: -18, max: 18, step: 1 },
  { key: "tempoShift", label: "Tempo", min: -8, max: 8, step: 1 },
  { key: "valsShare", label: "Vals %", min: 0, max: 40, step: 1, pct: true },
  { key: "milongaShare", label: "Milonga %", min: 0, max: 40, step: 1, pct: true },
  { key: "vocalRatioShift", label: "Vocal %", min: -30, max: 30, step: 1, pct: true },
];

export function ContextTab({ model }: { model: ContextModel | null }) {
  const { overrides, update } = useDb();
  const cf = overrides.contextFactors ?? {};
  if (!model) return <Empty>Loading the context model…</Empty>;
  const set = (fid: string, oid: string, key: string, value: number | undefined, original: unknown) =>
    update((o) => {
      const next = { ...(o.contextFactors ?? {}) };
      const f = { ...(next[fid] ?? {}) };
      const op = { ...(f[oid] ?? {}) } as Record<string, unknown>;
      if (value === undefined || value === original) delete op[key];
      else op[key] = value;
      if (Object.keys(op).length) f[oid] = op;
      else delete f[oid];
      if (Object.keys(f).length) next[fid] = f;
      else delete next[fid];
      return { ...o, contextFactors: next };
    });
  return (
    <div className="space-y-2">
      <p className="text-muted text-sm">
        Each factor's shifts come from the research model (data/knowledge/context_factors.json). Edit a value
        to override it for your sets; blanks follow the model.
      </p>
      {model.factors.map((f) => {
        const edited = Object.keys(cf[f.id] ?? {}).length;
        return (
          <details key={f.id} className="group rounded-xl border border-[rgb(var(--text)/.08)] px-3">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
              <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
              <span className="min-w-0 flex-1 truncate">{f.label}</span>
              {edited > 0 && <span className="chip min-h-7 px-2 text-xs">{edited} edited</span>}
            </summary>
            <div className="overflow-x-auto pb-3">
              <table className="db-table">
                <thead>
                  <tr>
                    <th>Option</th>
                    {FIELDS.map((x) => (
                      <th key={x.key}>{x.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {f.options.map((op) => {
                    const e = cf[f.id]?.[op.id] ?? {};
                    return (
                      <tr key={op.id}>
                        <td className="db-title">
                          <span className="flex items-center gap-1.5 font-medium">
                            {op.evidence && (
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ background: EVIDENCE_COLOR[op.evidence] ?? "#9ca3af" }}
                                title={EVIDENCE_LABEL[op.evidence] ?? op.evidence}
                                aria-hidden
                              />
                            )}
                            {op.label}
                          </span>
                          {op.evidence && (
                            <span className="text-muted block text-xs">
                              {EVIDENCE_LABEL[op.evidence] ?? op.evidence}
                            </span>
                          )}
                        </td>
                        {FIELDS.map((x) => {
                          const orig = op[x.key] as number | undefined | null;
                          const cur = (e as Record<string, unknown>)[x.key] as number | undefined;
                          const show = (n: number | null | undefined) =>
                            n == null ? undefined : x.pct ? Math.round(n * 100) : n;
                          return (
                            <td key={x.key} data-label={x.label}>
                              <Num
                                label={`${f.label} ${op.label} ${x.label}`}
                                value={show(cur)}
                                placeholder={show(orig) ?? "–"}
                                min={x.min}
                                max={x.max}
                                step={x.step}
                                onChange={(n) =>
                                  set(
                                    f.id,
                                    op.id,
                                    x.key,
                                    n === undefined ? undefined : x.pct ? n / 100 : n,
                                    orig ?? undefined,
                                  )
                                }
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        );
      })}
    </div>
  );
}
