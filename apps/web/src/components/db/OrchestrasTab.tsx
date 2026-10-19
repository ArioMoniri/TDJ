"use client";
import { useState } from "react";
import type { MetaOrchestra, OrchestraProfile } from "@/lib/types";
import { ActionRow, CheckRow, Group, PickerRow, Row } from "../Form";
import { SearchField } from "../SearchField";
import { Sheet } from "../Sheet";
import { Empty, patchMap, useDb, useDbEdit, ValueCell } from "./shared";

const STYLES: Array<[OrchestraProfile["style"], string]> = [
  ["rhythmic", "Rhythmic"],
  ["lyrical", "Lyrical"],
  ["dramatic", "Dramatic"],
  ["guardia", "Guardia"],
  ["nuevo", "Nuevo"],
  ["contemporary", "Contemporary"],
  ["balanced", "Balanced"],
];
const TIERS: Array<[string, string]> = [
  ["1", "1 · core"],
  ["2", "2 · secondary"],
  ["3", "3 · rarely"],
];
const PHASES = ["warmup", "build", "peak", "cooldown", "any"] as const;
const PHASE_LABEL: Record<string, string> = {
  warmup: "Warm-up",
  build: "Build",
  peak: "Peak",
  cooldown: "Cool-down",
  any: "Any",
};
const PAGE = 24;
const num = (v: string) => (v === "" ? undefined : Number(v));

export function OrchestrasTab({ orchestras }: { orchestras: MetaOrchestra[] }) {
  const { overrides, update } = useDb();
  const editing = useDbEdit();
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [phasesFor, setPhasesFor] = useState<MetaOrchestra | null>(null);
  const [singersFor, setSingersFor] = useState<MetaOrchestra | null>(null);
  const profiles = overrides.profiles ?? {};
  const all = orchestras.filter((o) => !q || o.name.toLowerCase().includes(q.toLowerCase()));
  const list = all.slice(0, limit);
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
  const phasesOf = (o: MetaOrchestra) => (profiles[o.id]?.phase ?? o.phase ?? []) as string[];
  const singersOf = (o: MetaOrchestra) => ({ ...(o.singers ?? {}), ...(profiles[o.id]?.singers ?? {}) });
  if (!orchestras.length) return <Empty>Loading orchestras…</Empty>;
  return (
    <div>
      <SearchField
        id="orchestra-filter"
        value={q}
        onChange={(v) => {
          setQ(v);
          setLimit(PAGE);
        }}
        placeholder="Filter orchestras"
        label="Filter orchestras"
        className="mt-3"
      />
      {list.map((o) => {
        const p = profiles[o.id] ?? {};
        const edited = !!profiles[o.id];
        const phases = phasesOf(o);
        const singers = singersOf(o);
        return (
          <Group
            key={o.id}
            data-orchestra={o.id}
            footer={edited ? "Edited · Revert in Edit mode" : undefined}
          >
            <div className="cell">
              <span className="min-w-0 flex-1">
                <span className="text-headline block truncate">{o.name}</span>
                <span className="text-subhead block truncate text-[var(--label-2)]">
                  {o.count} recordings
                </span>
              </span>
              {editing && edited && (
                <button type="button" className="btn-plain -mr-2" onClick={() => revert(o.id)}>
                  Revert
                </button>
              )}
            </div>
            <ValueCell
              label="Energy"
              inputLabel={`${o.name} energy`}
              editing={editing}
              value={p.energy}
              placeholder={o.energy ?? 50}
              type="number"
              min={0}
              max={100}
              onChange={(t) => setField(o, "energy", num(t))}
            />
            <PickerRow
              label="Style"
              ariaLabel={`${o.name} style`}
              value={p.style ?? o.style ?? "balanced"}
              items={STYLES}
              onChange={(s) => s && setField(o, "style", s)}
              disabled={!editing}
            />
            <PickerRow
              label="Tier"
              ariaLabel={`${o.name} tier`}
              value={String(p.tier ?? o.tier)}
              items={TIERS}
              onChange={(t) => t && setField(o, "tier", Number(t))}
              disabled={!editing}
            />
            <ValueCell
              label="Not before"
              inputLabel={`${o.name} not before (fraction of the night)`}
              editing={editing}
              value={p.notBefore}
              placeholder={o.notBefore ?? 0}
              type="number"
              min={0}
              max={1}
              step={0.05}
              onChange={(t) => setField(o, "notBefore", num(t))}
            />
            <Row
              label="Phases"
              value={phases.length ? phases.map((ph) => PHASE_LABEL[ph] ?? ph).join(", ") : "Any"}
              chevron
              onClick={() => setPhasesFor(o)}
            />
            {Object.keys(singers).length > 0 && (
              <Row
                label="Singer years"
                value={`${Object.keys(singers).length}`}
                chevron
                onClick={() => setSingersFor(o)}
              />
            )}
          </Group>
        );
      })}
      {all.length > limit && (
        <Group>
          <ActionRow
            label={`Show more (${all.length - limit} left)`}
            onClick={() => setLimit((l) => l + PAGE)}
          />
        </Group>
      )}
      <Sheet
        open={!!phasesFor}
        onClose={() => setPhasesFor(null)}
        title={phasesFor?.name ?? ""}
        trailing="Done"
      >
        {phasesFor && (
          <Group header="Phases of the night" footer="Where this orchestra belongs. Empty means anywhere.">
            {PHASES.map((ph) => {
              const phases = phasesOf(phasesFor);
              const on = phases.includes(ph);
              return (
                <CheckRow
                  key={ph}
                  label={PHASE_LABEL[ph] ?? ph}
                  checked={on}
                  onChange={(v) =>
                    setField(phasesFor, "phase", v ? [...phases, ph] : phases.filter((x) => x !== ph))
                  }
                />
              );
            })}
          </Group>
        )}
      </Sheet>
      <Sheet
        open={!!singersFor}
        onClose={() => setSingersFor(null)}
        title={singersFor?.name ?? ""}
        trailing="Done"
      >
        {singersFor && (
          <Group header="Singer years" footer="First and last year each singer recorded with the orchestra.">
            {Object.entries(singersOf(singersFor)).map(([name, yrs]) => {
              const singers = singersOf(singersFor);
              return (
                <div key={name} className="cell flex-col items-stretch gap-0 py-2">
                  <span className="text-headline">{name}</span>
                  <div className="-mx-4 flex">
                    <ValueCell
                      label="From"
                      inputLabel={`${name} from`}
                      editing
                      value={yrs[0]}
                      type="number"
                      min={1900}
                      max={2030}
                      onChange={(t) =>
                        setField(singersFor, "singers", { ...singers, [name]: [num(t) ?? yrs[0], yrs[1]] })
                      }
                    />
                    <ValueCell
                      label="To"
                      inputLabel={`${name} to`}
                      editing
                      value={yrs[1]}
                      type="number"
                      min={1900}
                      max={2030}
                      onChange={(t) =>
                        setField(singersFor, "singers", { ...singers, [name]: [yrs[0], num(t) ?? yrs[1]] })
                      }
                    />
                  </div>
                </div>
              );
            })}
          </Group>
        )}
      </Sheet>
    </div>
  );
}
