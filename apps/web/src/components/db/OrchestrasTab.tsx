"use client";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { MetaOrchestra, OrchestraProfile } from "@/lib/types";
import { Edited, Empty, Num, patchMap, useDb } from "./shared";

const STYLES: OrchestraProfile["style"][] = [
  "rhythmic",
  "lyrical",
  "dramatic",
  "guardia",
  "nuevo",
  "contemporary",
  "balanced",
];
const PHASES = ["warmup", "build", "peak", "cooldown", "any"] as const;

export function OrchestrasTab({ orchestras }: { orchestras: MetaOrchestra[] }) {
  const { overrides, update } = useDb();
  const [q, setQ] = useState("");
  const profiles = overrides.profiles ?? {};
  const list = orchestras.filter((o) => !q || o.name.toLowerCase().includes(q.toLowerCase())).slice(0, 60);
  const setField = (o: MetaOrchestra, field: keyof OrchestraProfile & string, value: unknown) =>
    update((ov) => ({
      ...ov,
      profiles: patchMap<OrchestraProfile>(
        ov.profiles,
        o.id,
        field,
        value,
        (o as unknown as Record<string, unknown>)[field],
      ),
    }));
  const revert = (id: string) =>
    update((ov) => {
      const next = { ...(ov.profiles ?? {}) };
      delete next[id];
      return { ...ov, profiles: next };
    });
  if (!orchestras.length) return <Empty>Loading orchestras…</Empty>;
  return (
    <div className="space-y-3">
      <input
        type="search"
        className="field"
        placeholder="Filter orchestras…"
        aria-label="Filter orchestras"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <table className="db-table">
        <thead>
          <tr>
            <th>Orchestra</th>
            <th>Energy</th>
            <th>Style</th>
            <th>Tier</th>
            <th>Not before</th>
            <th>Phases</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {list.map((o) => {
            const p = profiles[o.id] ?? {};
            const phases = (p.phase ?? o.phase ?? []) as string[];
            const singers = { ...(o.singers ?? {}), ...(p.singers ?? {}) };
            return (
              <tr key={o.id} data-orchestra={o.id}>
                <td className="db-title">
                  <span className="font-medium">{o.name}</span>
                  <span className="text-muted block text-xs">{o.count} recordings</span>
                  {Object.keys(singers).length > 0 && (
                    <details className="mt-1 text-xs">
                      <summary className="text-muted flex min-h-8 cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden">
                        <ChevronDown size={12} /> singer years
                      </summary>
                      <ul className="mt-1 space-y-1">
                        {Object.entries(singers).map(([name, yrs]) => (
                          <li key={name} className="flex flex-wrap items-center gap-2">
                            <span className="min-w-32 truncate">{name}</span>
                            <Num
                              label={`${name} from`}
                              value={yrs[0]}
                              min={1900}
                              max={2030}
                              onChange={(n) =>
                                setField(o, "singers", { ...singers, [name]: [n ?? yrs[0], yrs[1]] })
                              }
                            />
                            <Num
                              label={`${name} to`}
                              value={yrs[1]}
                              min={1900}
                              max={2030}
                              onChange={(n) =>
                                setField(o, "singers", { ...singers, [name]: [yrs[0], n ?? yrs[1]] })
                              }
                            />
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </td>
                <td data-label="Energy">
                  <Num
                    label={`${o.name} energy`}
                    value={p.energy}
                    placeholder={o.energy ?? 50}
                    min={0}
                    max={100}
                    onChange={(n) => setField(o, "energy", n)}
                  />
                </td>
                <td data-label="Style">
                  <select
                    aria-label={`${o.name} style`}
                    className="field w-32"
                    value={p.style ?? o.style ?? "balanced"}
                    onChange={(e) => setField(o, "style", e.target.value)}
                  >
                    {STYLES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td data-label="Tier">
                  <select
                    aria-label={`${o.name} tier`}
                    className="field w-20"
                    value={p.tier ?? o.tier}
                    onChange={(e) => setField(o, "tier", Number(e.target.value))}
                  >
                    {[1, 2, 3].map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </td>
                <td data-label="Not before">
                  <Num
                    label={`${o.name} not before (fraction of the night)`}
                    value={p.notBefore}
                    placeholder={o.notBefore ?? 0}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(n) => setField(o, "notBefore", n)}
                  />
                </td>
                <td data-label="Phases">
                  <div className="db-cell flex flex-wrap gap-1">
                    {PHASES.map((ph) => {
                      const on = phases.includes(ph);
                      return (
                        <button
                          type="button"
                          key={ph}
                          aria-pressed={on}
                          className={`chip min-h-9 px-2.5 text-xs ${on ? "chip-on" : ""}`}
                          onClick={() =>
                            setField(o, "phase", on ? phases.filter((x) => x !== ph) : [...phases, ph])
                          }
                        >
                          {ph}
                        </button>
                      );
                    })}
                  </div>
                </td>
                <td data-label="State">
                  <Edited on={!!profiles[o.id]} onRevert={() => revert(o.id)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
