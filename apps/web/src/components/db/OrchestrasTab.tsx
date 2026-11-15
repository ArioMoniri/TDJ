"use client";
import "../ui/compose-db.css";
import { bestYears, type CoverageRow, HEAT_LABEL, type HeatGrade, rangesLabel } from "@tdj/core";
import { ChevronRight, Grid3x3 } from "lucide-react";
import { useMemo, useState } from "react";
import { coverageWith, DEFAULT_COVERAGE, editGrade, nextGrade } from "@/lib/era";
import type { MetaOrchestra, OrchestraProfile } from "@/lib/types";
import { ActionRow, CheckRow, Group, PickerRow, Row } from "../Form";
import { SearchField } from "../SearchField";
import { Sheet } from "../Sheet";
import { Segmented } from "../ui";
import { Artwork } from "../ui/Artwork";
import { EraLegend } from "../ui/EraBadge";
import { Tip } from "../ui/Tip";
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
const STYLE_LABEL = Object.fromEntries(STYLES) as Record<string, string>;
const TIERS: Array<[string, string]> = [
  ["1", "1 · core"],
  ["2", "2 · secondary"],
  ["3", "3 · rarely"],
];
const TIER_GROUP: Record<number, [string, string]> = {
  1: ["The core", "The orchestras a milonga is built on"],
  2: ["Secondary", "Good for variety, a tanda or two a night"],
  3: ["Rarely", "Special nights and single tandas"],
};
const PHASES = ["warmup", "build", "peak", "cooldown", "any"] as const;
const PHASE_LABEL: Record<string, string> = {
  warmup: "Warm-up",
  build: "Build",
  peak: "Peak",
  cooldown: "Cool-down",
  any: "Any",
};
type GroupBy = "tier" | "style" | "era";
const ERA_GROUP = (y?: number) =>
  !y
    ? "Undated"
    : y < 1935
      ? "Guardia (before 1935)"
      : y < 1950
        ? "Golden age (1935–49)"
        : y < 1970
          ? "After the golden age (1950–69)"
          : "Nuevo and contemporary";
const PAGE = 24;
const num = (v: string) => (v === "" ? undefined : Number(v));
const yr = (r?: [number, number]) =>
  r
    ? r[0] === r[1]
      ? String(r[0])
      : `${r[0]}–${String(r[1]).slice(Math.floor(r[0] / 100) === Math.floor(r[1] / 100) ? 2 : 0)}`
    : "";

/** the years a heatmap shows: the graded ones, else the orchestra's recording years inside 1920–1965 */
function heatYears(row: CoverageRow | undefined, years?: [number, number]): number[] {
  const graded = row
    ? [...Object.keys(row.instrumental ?? {}), ...Object.keys(row.vocal ?? {})].map(Number)
    : [];
  let a: number;
  let b: number;
  if (graded.length) {
    a = Math.min(...graded);
    b = Math.max(...graded);
  } else if (years) {
    a = Math.max(1920, years[0]);
    b = Math.min(1965, years[1]);
  } else return [];
  if (b < a) return [];
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

/** the era heatmap of one orchestra: two rows (instrumental, with a singer), one cell per year */
function Heatmap({
  name,
  row,
  years,
  edited,
}: {
  name: string;
  row: CoverageRow | undefined;
  years: number[];
  edited: (mode: "instrumental" | "vocal", y: number) => boolean;
}) {
  if (!years.length) return null;
  const cell = (mode: "instrumental" | "vocal", y: number) => {
    const g = row?.[mode]?.[String(y)];
    const has = typeof g === "number";
    return (
      <span
        key={`${mode}-${y}`}
        className="heat-cell"
        data-g={has ? g : ""}
        data-edited={edited(mode, y) || undefined}
        title={`${y} · ${mode === "vocal" ? "with a singer" : "instrumental"}: ${has ? HEAT_LABEL[g as HeatGrade] : "not graded"}`}
      />
    );
  };
  return (
    <Tip text={`${name}'s years, graded from your heatmap: green best, blue good, orange uneven, grey avoid`}>
      <div
        className="w-full"
        role="img"
        aria-label={`Era heatmap of ${name}, ${years[0]} to ${years[years.length - 1]}`}
        data-testid="heatmap"
      >
        <div className="flex items-center gap-2">
          <span className="text-caption2 w-9 shrink-0 text-[var(--label-2)]">Instr.</span>
          <div className="heat-grid min-w-0 flex-1">{years.map((y) => cell("instrumental", y))}</div>
        </div>
        <div className="mt-[3px] flex items-center gap-2">
          <span className="text-caption2 w-9 shrink-0 text-[var(--label-2)]">Vocal</span>
          <div className="heat-grid min-w-0 flex-1">{years.map((y) => cell("vocal", y))}</div>
        </div>
        <div className="text-caption2 mt-0.5 flex justify-between pl-11 tabular-nums text-[var(--label-3)]">
          <span>{years[0]}</span>
          <span>{years[years.length - 1]}</span>
        </div>
      </div>
    </Tip>
  );
}

export function OrchestrasTab({ orchestras }: { orchestras: MetaOrchestra[] }) {
  const { overrides, update } = useDb();
  const editing = useDbEdit();
  const [q, setQ] = useState("");
  const [by, setBy] = useState<GroupBy>("tier");
  const [limit, setLimit] = useState(PAGE);
  const [detail, setDetail] = useState<MetaOrchestra | null>(null);
  const [phasesFor, setPhasesFor] = useState<MetaOrchestra | null>(null);
  const [singersFor, setSingersFor] = useState<MetaOrchestra | null>(null);
  const [gradesFor, setGradesFor] = useState<MetaOrchestra | null>(null);
  const profiles = overrides.profiles ?? {};
  const heatEdits = overrides.heatmap;
  const coverage = useMemo(() => {
    const m = new Map<string, CoverageRow>();
    for (const r of coverageWith(heatEdits).rows) m.set(r.orchestraId, r);
    return m;
  }, [heatEdits]);
  const shipped = useMemo(() => new Map(DEFAULT_COVERAGE.map((r) => [r.orchestraId, r])), []);
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
      const heat = { ...(ov.heatmap ?? {}) };
      delete heat[id];
      return { ...ov, profiles: next, heatmap: heat };
    });
  const setGrade = (o: MetaOrchestra, mode: "instrumental" | "vocal", y: number) =>
    update((ov) => {
      const cur = coverageWith(ov.heatmap).rows.find((r) => r.orchestraId === o.id)?.[mode]?.[String(y)];
      return { ...ov, heatmap: editGrade(ov.heatmap, o.id, mode, y, nextGrade(cur ?? undefined)) };
    });
  const phasesOf = (o: MetaOrchestra) => (profiles[o.id]?.phase ?? o.phase ?? []) as string[];
  const singersOf = (o: MetaOrchestra) => ({ ...(o.singers ?? {}), ...(profiles[o.id]?.singers ?? {}) });
  const tierOf = (o: MetaOrchestra) => Number(profiles[o.id]?.tier ?? o.tier);
  const styleOf = (o: MetaOrchestra) => (profiles[o.id]?.style ?? o.style ?? "balanced") as string;

  const filtered = orchestras.filter((o) => !q || o.name.toLowerCase().includes(q.toLowerCase()));
  const groups = (() => {
    const key = (o: MetaOrchestra) =>
      by === "tier" ? String(tierOf(o)) : by === "style" ? styleOf(o) : ERA_GROUP(o.years?.[0]);
    const m = new Map<string, MetaOrchestra[]>();
    for (const o of filtered.slice(0, limit)) {
      const k = key(o);
      m.set(k, [...(m.get(k) ?? []), o]);
    }
    const order = (k: string) =>
      by === "tier"
        ? Number(k)
        : by === "style"
          ? STYLES.findIndex(([s]) => s === k)
          : [
              "Guardia (before 1935)",
              "Golden age (1935–49)",
              "After the golden age (1950–69)",
              "Nuevo and contemporary",
              "Undated",
            ].indexOf(k);
    return [...m.entries()].sort((a, b) => order(a[0]) - order(b[0]));
  })();

  if (!orchestras.length) return <Empty>Loading orchestras…</Empty>;

  const card = (o: MetaOrchestra) => {
    const row = coverage.get(o.id);
    const edited = !!profiles[o.id] || !!heatEdits?.[o.id];
    const years = heatYears(row, o.years);
    const instBest = row ? bestYears(row, "instrumental") : [];
    const vocBest = row ? bestYears(row, "vocal") : [];
    const singers = Object.entries(singersOf(o)).sort((a, b) => a[1][0] - b[1][0]);
    const top = (o.topSingers ?? []).filter(([n]) => !singers.some(([s]) => s === n));
    const active = (shipped.get(o.id) as { activePeriod?: string } | undefined)?.activePeriod?.replace(
      " - ",
      "–",
    );
    return (
      <article key={o.id} className="group-inset min-w-0" data-orchestra={o.id} data-testid="orchestra-card">
        <button
          type="button"
          className="cell cell-tap w-full text-left"
          data-leading="art"
          onClick={() => setDetail(o)}
          aria-label={`${o.name}: details`}
        >
          <Artwork src={o.artwork} orchestra={o.name} orchestraId={o.id} size="l" />
          <span className="min-w-0 flex-1">
            <span className="text-headline block truncate">{o.name}</span>
            <span className="text-subhead block truncate text-[var(--label-2)]">
              {[STYLE_LABEL[styleOf(o)] ?? styleOf(o), active ?? yr(o.years), `${o.count} recordings`]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {edited && (
              <span className="text-caption1 mt-0.5 inline-flex rounded-full bg-[color-mix(in_srgb,var(--tint)_14%,transparent)] px-2 py-0.5 font-medium text-[var(--tint)]">
                Edited
              </span>
            )}
          </span>
          <ChevronRight size={16} strokeWidth={2.5} className="cell-chevron" aria-hidden />
        </button>
        <div className="cell flex-col items-stretch gap-2 py-3">
          <div className="text-footnote grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <span className="text-[var(--label-2)]">Best instrumental</span>
            <span className="truncate tabular-nums" data-testid="best-instrumental">
              {instBest.length ? rangesLabel(instBest) : row ? "–" : "Not graded yet"}
            </span>
            <span className="text-[var(--label-2)]">Best with a singer</span>
            <span className="truncate tabular-nums" data-testid="best-vocal">
              {vocBest.length ? rangesLabel(vocBest) : row ? "–" : "Not graded yet"}
            </span>
          </div>
          <Heatmap
            name={o.name}
            row={row}
            years={years}
            edited={(mode, y) => heatEdits?.[o.id]?.[mode]?.[String(y)] !== undefined}
          />
          {(singers.length > 0 || top.length > 0) && (
            <div className="flex flex-wrap gap-1.5" data-testid="orchestra-singers">
              {singers.slice(0, 6).map(([n, r]) => (
                <span key={n} className="data-chip">
                  {n} <span className="text-[var(--label-3)]">{yr(r)}</span>
                </span>
              ))}
              {singers.length === 0 &&
                top.slice(0, 5).map(([n, c]) => (
                  <span key={n} className="data-chip">
                    {n} <span className="text-[var(--label-3)]">{c}</span>
                  </span>
                ))}
              {singers.length > 6 && <span className="data-chip">+{singers.length - 6}</span>}
            </div>
          )}
        </div>
        {editing && (
          <div className="flex">
            <button
              type="button"
              className="cell cell-tap min-w-0 flex-1 text-left"
              onClick={() => setGradesFor(o)}
              data-testid="edit-grades"
            >
              <Grid3x3 size={16} strokeWidth={2} className="text-[var(--tint)]" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[var(--tint)]">Edit era grades</span>
            </button>
          </div>
        )}
      </article>
    );
  };

  const gradeRow = gradesFor ? coverage.get(gradesFor.id) : undefined;
  const gradeYears = gradesFor
    ? (() => {
        const ys = heatYears(gradeRow, gradesFor.years);
        return ys.length ? ys : Array.from({ length: 31 }, (_, i) => 1930 + i);
      })()
    : [];

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
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <Segmented<GroupBy>
          label="Group by"
          value={by}
          onChange={setBy}
          items={[
            ["tier", "Importance"],
            ["style", "Style"],
            ["era", "Era"],
          ]}
        />
        <EraLegend />
      </div>
      <p className="section-foot mt-2">
        The heatmap is your grading of each orchestra's years; it drives the era badges and the years a night
        picks.
        {editing ? " Tap Edit era grades on a card to change a year." : " Tap Edit to change a grade."}
      </p>
      {groups.map(([k, list]) => (
        <section key={k} className="min-w-0" data-testid="orchestra-group">
          <h2 className="section-head">
            {by === "tier"
              ? (TIER_GROUP[Number(k)]?.[0] ?? `Tier ${k}`)
              : by === "style"
                ? (STYLE_LABEL[k] ?? k)
                : k}
          </h2>
          {by === "tier" && TIER_GROUP[Number(k)] && (
            <p className="text-footnote -mt-1 mb-2 px-4 text-[var(--label-2)]">{TIER_GROUP[Number(k)]![1]}</p>
          )}
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">{list.map(card)}</div>
        </section>
      ))}
      {filtered.length > limit && (
        <Group className="mt-4">
          <ActionRow
            label={`Show more (${filtered.length - limit} left)`}
            onClick={() => setLimit((l) => l + PAGE)}
          />
        </Group>
      )}

      <Sheet
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.name ?? ""}
        trailing="Done"
        testId="orchestra-detail"
      >
        {detail &&
          (() => {
            const o = detail;
            const p = profiles[o.id] ?? {};
            const phases = phasesOf(o);
            const singers = singersOf(o);
            return (
              <>
                <Group
                  header="How nights use it"
                  footer={
                    editing
                      ? "Your changes apply to every night you compose."
                      : "Tap Edit in the Database bar to change these."
                  }
                >
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
                  <Row
                    label="Era grades"
                    value={coverage.has(o.id) ? "Graded" : "Not graded"}
                    chevron
                    onClick={() => setGradesFor(o)}
                  />
                </Group>
                {(o.topSingers?.length ?? 0) > 0 && (
                  <Group header="Most recorded with">
                    {o.topSingers!.map(([n, c]) => (
                      <Row key={n} label={n} value={`${c} sides`} />
                    ))}
                    {o.instrumentals ? <Row label="Instrumental" value={`${o.instrumentals} sides`} /> : null}
                  </Group>
                )}
                {editing && (profiles[o.id] || heatEdits?.[o.id]) && (
                  <Group>
                    <ActionRow
                      label="Revert to the shipped values"
                      destructive
                      onClick={() => revert(o.id)}
                    />
                  </Group>
                )}
              </>
            );
          })()}
      </Sheet>
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
      <Sheet
        open={!!gradesFor}
        onClose={() => setGradesFor(null)}
        title={gradesFor ? `Era grades · ${gradesFor.name}` : ""}
        trailing="Done"
        detents={["large"]}
        testId="grades-sheet"
      >
        {gradesFor && (
          <Group
            header="Tap a grade to change it"
            footer="4 fantastic · 3 good · 2 uneven · 1 single tracks only · 0 avoid · – not graded. Your grades win over the shipped ones; set one back to remove your change."
          >
            <div className="cell text-footnote py-2 text-[var(--label-2)]">
              <span className="w-14 shrink-0">Year</span>
              <span className="flex-1 text-center">Instrumental</span>
              <span className="flex-1 text-center">With a singer</span>
            </div>
            {gradeYears.map((y) => (
              <div key={y} className="cell py-1" data-year={y}>
                <span className="w-14 shrink-0 tabular-nums">{y}</span>
                {(["instrumental", "vocal"] as const).map((mode) => {
                  const g = gradeRow?.[mode]?.[String(y)];
                  const has = typeof g === "number";
                  const mine = heatEdits?.[gradesFor.id]?.[mode]?.[String(y)] !== undefined;
                  return (
                    <span key={mode} className="flex flex-1 justify-center">
                      <button
                        type="button"
                        className="heat-cell text-footnote h-11 w-16 font-semibold text-white"
                        data-g={has ? g : ""}
                        data-edited={mine || undefined}
                        style={has ? undefined : { color: "var(--label-2)" }}
                        aria-label={`${y} ${mode === "vocal" ? "with a singer" : "instrumental"}: ${has ? HEAT_LABEL[g as HeatGrade] : "not graded"}. Change`}
                        onClick={() => setGrade(gradesFor, mode, y)}
                        disabled={!editing}
                        data-testid="grade-cell"
                      >
                        {has ? g : "–"}
                      </button>
                    </span>
                  );
                })}
              </div>
            ))}
          </Group>
        )}
        {gradesFor && !editing && (
          <p className="section-foot">Tap Edit in the Database bar to change grades.</p>
        )}
      </Sheet>
    </div>
  );
}
