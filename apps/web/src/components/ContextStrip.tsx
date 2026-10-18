"use client";
import { resolveContext } from "@tdj/core";
import { ChevronDown, X } from "lucide-react";
import { useMemo } from "react";
import { CONTEXT_FIELDS, EVIDENCE_COLOR, EVIDENCE_LABEL, fmtShift, researchOption } from "@/lib/context";
import type { ComposeContext, ContextModel } from "@/lib/types";

/** "Tonight": situational factors that shift energy, vals/milonga share and cortina genres (data/knowledge/context_factors.json). */
export function ContextStrip({
  value,
  onChange,
  model,
}: {
  value: ComposeContext;
  onChange: (c: ComposeContext) => void;
  model: ContextModel | null;
}) {
  const set = (k: keyof ComposeContext, v: string) =>
    onChange({ ...value, [k]: v || undefined } as ComposeContext);
  const chosen = Object.entries(value).filter(([, v]) => !!v).length;
  const summary = useMemo(() => {
    if (!model || !chosen) return null;
    const rc = resolveContext(value, model);
    const baseV = model.baseline?.valsShare ?? 0.167;
    const baseM = model.baseline?.milongaShare ?? 0.167;
    const parts: string[] = [];
    if (rc.energyShift) parts.push(`energy ${fmtShift(rc.energyShift)}`);
    if (rc.tempoShift) parts.push(`tempo ${fmtShift(rc.tempoShift)}`);
    if (rc.valsShare) parts.push(`vals ${Math.round((baseV + rc.valsShare) * 100)}%`);
    if (rc.milongaShare) parts.push(`milonga ${Math.round((baseM + rc.milongaShare) * 100)}%`);
    if (rc.tandaSizeShift < 0) parts.push("tangos in threes");
    if (rc.vocalRatioShift) parts.push(`vocal ${fmtShift(Math.round(rc.vocalRatioShift * 100), "%")}`);
    const genres = [...new Set(rc.cortinaGenres)].slice(0, 4);
    if (genres.length) parts.push(`cortinas: ${genres.join(", ")}`);
    return parts.length ? parts.join(" · ") : "No shift from these choices.";
  }, [model, value, chosen]);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">Tonight</span>
        <span className="text-muted text-xs">Room, crowd and calendar shape the set</span>
      </div>
      <div className="chip-row scroll-x mt-2" role="group" aria-label="Tonight">
        {CONTEXT_FIELDS.map((f) => {
          const v = value[f.key] as string | undefined;
          const r = researchOption(model, f.key, v);
          const ev = r?.option?.evidence;
          const on = !!v;
          const label = on ? (f.options.find(([k]) => k === v)?.[1] ?? v) : f.label;
          const shift = r?.option ? [fmtShift(r.option.energyShift), r.option.evidence ? EVIDENCE_LABEL[r.option.evidence] : ""].filter(Boolean).join(", ") : "";
          return (
            <span key={f.key} className={`ctx-chip ${on ? "chip-on" : ""}`}>
              {on && ev && (
                <span
                  className="ctx-dot"
                  style={{ background: EVIDENCE_COLOR[ev] ?? "#9ca3af" }}
                  title={EVIDENCE_LABEL[ev] ?? ev}
                  aria-hidden
                />
              )}
              <select
                aria-label={r?.factorLabel ?? f.label}
                title={r?.factorLabel ? `${r.factorLabel}${shift ? ` · ${shift}` : ""}` : undefined}
                value={v ?? ""}
                onChange={(e) => set(f.key, e.target.value)}
                className={on ? "pl-4" : ""}
              >
                <option value="">{f.label}</option>
                {f.options.map(([k, l]) => {
                  const ro = researchOption(model, f.key, k)?.option;
                  const s = ro ? fmtShift(ro.energyShift) : "";
                  return (
                    <option key={k} value={k}>
                      {l}
                      {s ? ` (${s})` : ""}
                    </option>
                  );
                })}
              </select>
              <ChevronDown size={14} className="ctx-caret" aria-hidden />
              <span className="sr-only">{label}</span>
            </span>
          );
        })}
        {chosen > 0 && (
          <button type="button" className="chip" onClick={() => onChange({})} aria-label="Clear tonight's choices">
            <X size={14} /> Clear
          </button>
        )}
      </div>
      <p className="text-muted mt-2 min-h-5 text-xs" aria-live="polite">
        {summary ?? "Nothing set: the set follows your era, arc and cortina choices alone."}
      </p>
    </div>
  );
}
