"use client";
import { EVIDENCE_COLOR, EVIDENCE_LABEL } from "@/lib/context";
import { plural, t as tx } from "@/lib/i18n";
import type { ContextModel } from "@/lib/types";
import { Disclosure } from "../Disclosure";
import { Group } from "../Form";
import { Tip } from "../ui/Tip";
import { Empty, useDb, useDbEdit, ValueCell } from "./shared";

const FIELDS: Array<{
  key: "energyShift" | "tempoShift" | "valsShare" | "milongaShare" | "vocalRatioShift";
  label: string;
  min: number;
  max: number;
  step: number;
  pct?: boolean;
}> = [
  {
    key: "energyShift",
    get label() {
      return tx("db.contextTab.energy");
    },
    min: -18,
    max: 18,
    step: 1,
  },
  {
    key: "tempoShift",
    get label() {
      return tx("db.contextTab.tempo");
    },
    min: -8,
    max: 8,
    step: 1,
  },
  {
    key: "valsShare",
    get label() {
      return tx("db.contextTab.vals");
    },
    min: 0,
    max: 40,
    step: 1,
    pct: true,
  },
  {
    key: "milongaShare",
    get label() {
      return tx("db.contextTab.milonga");
    },
    min: 0,
    max: 40,
    step: 1,
    pct: true,
  },
  {
    key: "vocalRatioShift",
    get label() {
      return tx("db.contextTab.vocal");
    },
    min: -30,
    max: 30,
    step: 1,
    pct: true,
  },
];

export function ContextTab({ model }: { model: ContextModel | null }) {
  const { overrides, update } = useDb();
  const editing = useDbEdit();
  const cf = overrides.contextFactors ?? {};
  if (!model) return <Empty>{tx("db.contextTab.loading_the_context_model")}</Empty>;
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
    <div>
      <p className="section-foot mt-3">{tx("db.contextTab.each_factor_s_shifts_come_from")}</p>
      {model.factors.map((f) => {
        const edited = Object.keys(cf[f.id] ?? {}).length;
        return (
          <Group
            key={f.id}
            header={f.label}
            footer={edited ? plural("plural.options_edited", edited) : undefined}
          >
            {f.options.map((op) => {
              const e = cf[f.id]?.[op.id] ?? {};
              return (
                <Disclosure
                  key={op.id}
                  className="cell flex-col items-stretch gap-0 py-0"
                  tip={op.notes ?? tx("db.contextTab.how_moves_the_energy_the_vals", { label: op.label })}
                  summary={
                    <span className="flex min-w-0 flex-1 items-center gap-3">
                      <Tip text={EVIDENCE_LABEL[op.evidence ?? "speculative"]}>
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: EVIDENCE_COLOR[op.evidence ?? "speculative"] ?? "#9ca3af" }}
                          aria-hidden
                        />
                      </Tip>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{op.label}</span>
                        <span className="text-footnote block truncate text-[var(--label-2)]">
                          {EVIDENCE_LABEL[op.evidence ?? "speculative"]}
                          {Object.keys(e).length ? tx("db.contextTab.edited") : ""}
                        </span>
                      </span>
                    </span>
                  }
                >
                  <div className="-mx-4 border-t border-[var(--separator)]">
                    {FIELDS.map((x) => {
                      const orig = op[x.key] as number | undefined | null;
                      const cur = (e as Record<string, unknown>)[x.key] as number | undefined;
                      const show = (n: number | null | undefined) =>
                        n == null ? undefined : x.pct ? Math.round(n * 100) : n;
                      return (
                        <ValueCell
                          key={x.key}
                          label={x.label}
                          inputLabel={`${f.label} ${op.label} ${x.label}`}
                          editing={editing}
                          value={show(cur)}
                          placeholder={show(orig) ?? "–"}
                          type="number"
                          min={x.min}
                          max={x.max}
                          step={x.step}
                          onChange={(t) =>
                            set(
                              f.id,
                              op.id,
                              x.key,
                              t === "" ? undefined : x.pct ? Number(t) / 100 : Number(t),
                              orig ?? undefined,
                            )
                          }
                        />
                      );
                    })}
                  </div>
                </Disclosure>
              );
            })}
          </Group>
        );
      })}
    </div>
  );
}
