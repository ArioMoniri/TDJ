"use client";
import { lazy, lower, t as tx } from "@/lib/i18n";
import "../ui/compose-db.css";
import { bestYears, type CoverageRow, rangesLabel } from "@tdj/core";
import { ChevronRight, Grid3x3 } from "lucide-react";
import { useMemo, useState } from "react";
import { coverageWith, DEFAULT_COVERAGE, editGrade, nextGrade } from "@/lib/era";
import { eraWords, gradeWords as gradeWord } from "@/lib/eraWords";
import { creditName, creditSpans, orchestraQuery } from "@/lib/orchestraName";
import { useSongOpen } from "@/lib/songOpen";
import type { MetaOrchestra, OrchestraProfile } from "@/lib/types";
import { useSharedQuery } from "@/lib/usePageQuery";
import { useTextSearch } from "@/lib/useSongSearch";
import { ActionRow, CheckRow, Group, PickerRow, Row } from "../Form";
import { SearchField } from "../SearchField";
import { Sheet } from "../Sheet";
import { Highlight } from "../search/Highlight";
import { DnaLink } from "../song/DnaLink";
import { Segmented } from "../ui";
import { Artwork } from "../ui/Artwork";
import { EraLegend } from "../ui/EraBadge";
import { Tip, useTip } from "../ui/Tip";
import { Empty, patchMap, useDb, useDbEdit, ValueCell } from "./shared";

const ORCHESTRA_FIELDS = [
  { name: "name", weight: 10, get: (o: MetaOrchestra) => o.name },
  // a raw credit ("J.ricardo-G.barbieri") is found by its people's names too
  { name: "credit", weight: 10, get: (o: MetaOrchestra) => orchestraQuery(o.name) },
  { name: "alias", weight: 8, get: (o: MetaOrchestra) => o.aliases },
  { name: "singer", weight: 3, get: (o: MetaOrchestra) => (o.topSingers ?? []).map(([n]) => n) },
  { name: "style", weight: 2, get: (o: MetaOrchestra) => o.style },
];
const STYLES: Array<[OrchestraProfile["style"], string]> = lazy(() => [
  ["rhythmic", tx("db.orchestrasTab.rhythmic")],
  ["lyrical", tx("db.orchestrasTab.lyrical")],
  ["dramatic", tx("db.orchestrasTab.dramatic")],
  ["guardia", tx("db.orchestrasTab.guardia")],
  ["nuevo", tx("db.orchestrasTab.nuevo")],
  ["contemporary", tx("db.orchestrasTab.contemporary")],
  ["balanced", tx("db.orchestrasTab.balanced")],
]);
// per locale (a module-level Object.fromEntries froze the first language: English in the Turkish UI)
const STYLE_LABEL = lazy(() => Object.fromEntries(STYLES) as Record<string, string>);
const TIERS: Array<[string, string]> = lazy(() => [
  ["1", tx("db.orchestrasTab.core_every_night")],
  ["2", tx("db.orchestrasTab.secondary_a_tanda_or_two")],
  ["3", tx("db.orchestrasTab.rarely_special_nights")],
]);
/** the grades a cell cycles through, in the app's one era vocabulary (ERA_WORDS / gradeWord) */
const GRADE_LEGEND: Array<number | null> = [4, 3, 2, 1, 0, null];
const TIER_GROUP: Record<number, [string, string]> = lazy(() => ({
  1: [tx("db.orchestrasTab.the_core"), tx("db.orchestrasTab.the_orchestras_a_milonga_is_built")],
  2: [tx("db.orchestrasTab.secondary"), tx("db.orchestrasTab.good_for_variety_a_tanda_or")],
  3: [tx("db.orchestrasTab.rarely"), tx("db.orchestrasTab.special_nights_and_single_tandas")],
}));
const PHASES = ["warmup", "build", "peak", "cooldown", "any"] as const;
const PHASE_LABEL: Record<string, string> = lazy(() => ({
  warmup: tx("phase.warmup"),
  build: tx("phase.build"),
  peak: tx("phase.peak"),
  cooldown: tx("phase.cooldown"),
  any: tx("phase.any"),
}));
type GroupBy = "tier" | "style" | "era";
const ERA_GROUP = (y?: number) =>
  !y
    ? tx("db.orchestrasTab.undated")
    : y < 1935
      ? tx("db.orchestrasTab.guardia_before_1935")
      : y < 1950
        ? tx("db.orchestrasTab.golden_age_1935_49")
        : y < 1970
          ? tx("db.orchestrasTab.after_the_golden_age_1950_69")
          : tx("db.orchestrasTab.nuevo_and_contemporary");
const PAGE = 24;
const num = (v: string) => (v === "" ? undefined : Number(v));
/** "Not before" in a DJ's words: 0 → "From the start", 25 → "After 25 % of the night" */
const notBeforeText = (pct: string | number) =>
  Math.round(Number(pct)) <= 0
    ? tx("db.orchestrasTab.from_the_start")
    : tx("db.orchestrasTab.after_of_the_night", { p1: Math.round(Number(pct)) });
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

/** an orchestra card's main button: opens its details */
function OrchestraButton({
  name,
  onClick,
  children,
}: {
  name: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const t = useTip<HTMLButtonElement>(tx("db.orchestrasTab.open_energy_style_singers_and_best", { name }));
  return (
    <button
      type="button"
      className="cell cell-tap w-full text-left"
      data-leading="art"
      onClick={onClick}
      aria-label={tx("db.orchestrasTab.details", { name })}
      {...t.props}
    >
      {t.tag}
      {children}
    </button>
  );
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
  // one help tag for the whole map; it names the year under the pointer
  const [cellTip, setCellTip] = useState<string | null>(null);
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
        data-tip={`${y} · ${mode === "vocal" ? tx("db.orchestrasTab.with_a_singer") : tx("db.orchestrasTab.instrumental")}: ${gradeWord(has ? g : null).word}`}
      />
    );
  };
  return (
    <Tip
      text={
        cellTip ??
        tx("db.orchestrasTab.s_years_from_your_heatmap_green", {
          name,
          word: lower(eraWords("best").word),
          word1: lower(eraWords("good").word),
          word2: lower(eraWords("weak").word),
          word3: lower(eraWords("outside").word),
        })
      }
      className="w-full"
    >
      <div
        className="w-full"
        onPointerOver={(e) => setCellTip((e.target as HTMLElement).dataset.tip ?? null)}
        onPointerLeave={() => setCellTip(null)}
        role="img"
        aria-label={tx("db.orchestrasTab.era_heatmap_of_to", {
          name,
          p1: years[0],
          p2: years[years.length - 1],
        })}
        data-testid="heatmap"
      >
        <div className="flex items-center gap-2">
          <span className="text-caption2 w-9 shrink-0 text-[var(--label-2)]">
            {tx("db.orchestrasTab.instr")}
          </span>
          <div className="heat-grid min-w-0 flex-1">{years.map((y) => cell("instrumental", y))}</div>
        </div>
        <div className="mt-[3px] flex items-center gap-2">
          <span className="text-caption2 w-9 shrink-0 text-[var(--label-2)]">
            {tx("db.orchestrasTab.vocal")}
          </span>
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
  // 2026-11: the page's one search text (lib/usePageQuery.ts): it stays when the tab changes
  const [q, setQ] = useSharedQuery();
  const [by, setBy] = useState<GroupBy>("tier");
  const [limit, setLimit] = useState(PAGE);
  const [detail, setDetail] = useState<MetaOrchestra | null>(null);
  const [phasesFor, setPhasesFor] = useState<MetaOrchestra | null>(null);
  const [singersFor, setSingersFor] = useState<MetaOrchestra | null>(null);
  const [gradesFor, setGradesFor] = useState<MetaOrchestra | null>(null);
  // 2026-11 (the owner: "I can't click on these to see and play the list"): a singer's or the instrumental sides
  const openSides = useSongOpen((s) => s.openSides);
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

  // 2026-11: the shared engine over the list (accent- and apostrophe-blind, typos, the profiles' aliases such as
  // "OTV", and the orchestra's singers: "fiorentino" finds Troilo); the best match first
  const found = useTextSearch(orchestras, ORCHESTRA_FIELDS, q, {
    highlight: [{ field: "name", get: (o) => o.name }],
  });
  const marks = new Map(found.items.map((h) => [h.doc.id, h.highlights.name]));
  const filtered = q.trim() ? found.items.map((h) => h.doc) : orchestras;
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
              tx("db.orchestrasTab.guardia_before_1935"),
              tx("db.orchestrasTab.golden_age_1935_49"),
              tx("db.orchestrasTab.after_the_golden_age_1950_69"),
              tx("db.orchestrasTab.nuevo_and_contemporary"),
              tx("db.orchestrasTab.undated"),
            ].indexOf(k);
    return [...m.entries()].sort((a, b) => order(a[0]) - order(b[0]));
  })();

  if (!orchestras.length) return <Empty>{tx("db.orchestrasTab.loading_orchestras")}</Empty>;

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
        <OrchestraButton name={creditName(o.name)} onClick={() => setDetail(o)}>
          <Artwork src={o.artwork} orchestra={o.name} orchestraId={o.id} size="l" />
          <span className="min-w-0 flex-1">
            <span className="text-headline block truncate">
              <Highlight
                text={creditName(o.name)}
                spans={q.trim() ? creditSpans(o.name, creditName(o.name), marks.get(o.id)) : undefined}
              />
            </span>
            <span className="text-subhead block truncate text-[var(--label-2)]">
              {[
                STYLE_LABEL[styleOf(o)] ?? styleOf(o),
                active ?? yr(o.years),
                tx("database.recordings", { p1: o.count }),
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {edited && (
              <span className="text-caption1 mt-0.5 inline-flex rounded-full bg-[color-mix(in_srgb,var(--tint)_14%,transparent)] px-2 py-0.5 font-medium text-[var(--tint)]">
                {tx("db.orchestrasTab.edited")}
              </span>
            )}
          </span>
          <ChevronRight size={16} strokeWidth={2.5} className="cell-chevron" aria-hidden />
        </OrchestraButton>
        <div className="cell flex-col items-stretch gap-2 py-3">
          <div className="text-footnote grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <span className="text-[var(--label-2)]">{tx("db.orchestrasTab.best_instrumental")}</span>
            <span className="truncate tabular-nums" data-testid="best-instrumental">
              {instBest.length ? rangesLabel(instBest) : row ? "–" : tx("db.orchestrasTab.not_graded_yet")}
            </span>
            <span className="text-[var(--label-2)]">{tx("db.orchestrasTab.best_with_a_singer")}</span>
            <span className="truncate tabular-nums" data-testid="best-vocal">
              {vocBest.length ? rangesLabel(vocBest) : row ? "–" : tx("db.orchestrasTab.not_graded_yet")}
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
              <span className="min-w-0 flex-1 truncate text-[var(--tint)]">
                {tx("db.orchestrasTab.edit_era_grades")}
              </span>
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
        placeholder={tx("db.orchestrasTab.filter_orchestras")}
        label={tx("db.orchestrasTab.filter_orchestras")}
        className="mt-3"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <Segmented<GroupBy>
          label={tx("db.orchestrasTab.group_by")}
          tips={{
            tier: tx("db.orchestrasTab.the_big_orchestras_first_then_the"),
            style: tx("db.orchestrasTab.grouped_by_how_they_play_rhythmic"),
            era: tx("db.orchestrasTab.grouped_by_their_best_decade"),
          }}
          value={by}
          onChange={setBy}
          items={[
            ["tier", tx("db.orchestrasTab.importance")],
            ["style", tx("booth.sheets.style")],
            ["era", tx("changes.era")],
          ]}
        />
        <EraLegend />
      </div>
      <p className="section-foot mt-2">
        {tx("db.orchestrasTab.the_heatmap_is_your_grading_of")}
        {editing
          ? tx("db.orchestrasTab.tap_edit_era_grades_on_a")
          : tx("db.orchestrasTab.tap_edit_to_change_a_grade")}
      </p>
      {groups.map(([k, list]) => (
        <section key={k} className="min-w-0" data-testid="orchestra-group">
          <h2 className="section-head">
            {by === "tier"
              ? (TIER_GROUP[Number(k)]?.[0] ?? tx("db.orchestrasTab.other"))
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
            label={tx("db.orchestrasTab.show_more_left", { p1: filtered.length - limit })}
            tip={tx("db.orchestrasTab.show_the_next_orchestras")}
            onClick={() => setLimit((l) => l + PAGE)}
          />
        </Group>
      )}

      <Sheet
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? creditName(detail.name) : ""}
        trailing={tx("db.orchestrasTab.done")}
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
                <Group>
                  <DnaLink
                    to={{ kind: "orchestra", id: o.id }}
                    className="cell cell-tap w-full text-left"
                    testId="orchestra-open-page"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="cell-label">
                        {tx("song.open_orchestra_page", { orchestra: creditName(o.name) })}
                      </span>
                      <span className="text-footnote cell-sub text-[var(--label-2)]">
                        {tx("song.orchestra_page_sub")}
                      </span>
                    </span>
                    <ChevronRight size={16} strokeWidth={2.5} className="cell-chevron" aria-hidden />
                  </DnaLink>
                  <Row
                    label={tx("song.all_sides")}
                    chevron
                    onClick={() => openSides({ orchestraId: o.id, orchestra: o.name, singer: null })}
                    data-testid="orchestra-all-sides"
                  />
                </Group>
                <Group
                  header={tx("db.orchestrasTab.how_nights_use_it")}
                  footer={
                    editing
                      ? tx("db.orchestrasTab.your_changes_apply_to_every_night")
                      : tx("db.orchestrasTab.tap_edit_in_the_database_bar_2")
                  }
                >
                  <ValueCell
                    label={tx("db.orchestrasTab.energy_2")}
                    inputLabel={tx("db.orchestrasTab.energy", { name: creditName(o.name) })}
                    editing={editing}
                    value={p.energy}
                    placeholder={o.energy ?? 50}
                    type="number"
                    min={0}
                    max={100}
                    onChange={(t) => setField(o, "energy", num(t))}
                  />
                  <PickerRow
                    label={tx("db.orchestrasTab.style_2")}
                    ariaLabel={tx("db.orchestrasTab.style", { name: creditName(o.name) })}
                    value={p.style ?? o.style ?? "balanced"}
                    items={STYLES}
                    onChange={(s) => s && setField(o, "style", s)}
                    disabled={!editing}
                  />
                  <PickerRow
                    label={tx("db.orchestrasTab.importance")}
                    ariaLabel={tx("db.orchestrasTab.tier", { name: creditName(o.name) })}
                    value={String(p.tier ?? o.tier)}
                    items={TIERS}
                    onChange={(t) => t && setField(o, "tier", Number(t))}
                    disabled={!editing}
                  />
                  <ValueCell
                    label={
                      editing
                        ? tx("db.orchestrasTab.earliest_in_the_night_2")
                        : tx("db.orchestrasTab.earliest_in_the_night")
                    }
                    inputLabel={tx("db.orchestrasTab.earliest_point_in_the_night_in", {
                      name: creditName(o.name),
                    })}
                    editing={editing}
                    value={p.notBefore === undefined ? undefined : Math.round(p.notBefore * 100)}
                    placeholder={
                      editing ? Math.round((o.notBefore ?? 0) * 100) : notBeforeText((o.notBefore ?? 0) * 100)
                    }
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    display={notBeforeText}
                    onChange={(t) => setField(o, "notBefore", t === "" ? undefined : Number(t) / 100)}
                  />
                  <Row
                    label={tx("db.orchestrasTab.parts_of_the_night")}
                    value={
                      phases.length
                        ? phases.map((ph) => PHASE_LABEL[ph] ?? ph).join(", ")
                        : tx("db.orchestrasTab.any")
                    }
                    chevron
                    onClick={() => setPhasesFor(o)}
                  />
                  {Object.keys(singers).length > 0 && (
                    <Row
                      label={tx("db.orchestrasTab.singers_and_their_years")}
                      value={`${Object.keys(singers).length} ${Object.keys(singers).length === 1 ? tx("db.orchestrasTab.singer") : tx("db.orchestrasTab.singers")}`}
                      chevron
                      onClick={() => setSingersFor(o)}
                    />
                  )}
                  <Row
                    label={tx("db.orchestrasTab.era_grades_2")}
                    value={
                      coverage.has(o.id) ? tx("db.orchestrasTab.graded") : tx("db.orchestrasTab.not_graded")
                    }
                    chevron
                    onClick={() => setGradesFor(o)}
                  />
                </Group>
                {(o.topSingers?.length ?? 0) > 0 && (
                  <Group header={tx("db.orchestrasTab.most_recorded_with")}>
                    {o.topSingers!.map(([n, c]) => (
                      <Row
                        key={n}
                        label={n}
                        value={tx("db.orchestrasTab.sides_2", { c })}
                        chevron
                        onClick={() => openSides({ orchestraId: o.id, orchestra: o.name, singer: n })}
                        data-testid="orchestra-singer-row"
                      />
                    ))}
                    {o.instrumentals ? (
                      <Row
                        label={tx("db.orchestrasTab.instrumental_2")}
                        value={tx("db.orchestrasTab.sides", { instrumentals: o.instrumentals })}
                        chevron
                        onClick={() =>
                          openSides({
                            orchestraId: o.id,
                            orchestra: o.name,
                            singer: null,
                            instrumental: true,
                          })
                        }
                        data-testid="orchestra-instrumental-row"
                      />
                    ) : null}
                  </Group>
                )}
                {editing && (profiles[o.id] || heatEdits?.[o.id]) && (
                  <Group>
                    <ActionRow
                      label={tx("db.orchestrasTab.revert_to_the_shipped_values")}
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
        trailing={tx("db.orchestrasTab.done")}
      >
        {phasesFor && (
          <Group
            header={tx("db.orchestrasTab.parts_of_the_night")}
            footer={tx("db.orchestrasTab.where_this_orchestra_belongs_none_ticked")}
          >
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
        trailing={tx("db.orchestrasTab.done")}
      >
        {singersFor && (
          <Group
            header={tx("db.orchestrasTab.singers_and_their_years")}
            footer={tx("db.orchestrasTab.first_and_last_year_each_singer")}
          >
            {Object.entries(singersOf(singersFor)).map(([name, yrs]) => {
              const singers = singersOf(singersFor);
              return (
                <div key={name} className="cell flex-col items-stretch gap-0 py-2">
                  <button
                    type="button"
                    className="-mx-4 flex min-h-11 items-center gap-2 px-4 text-left"
                    onClick={() =>
                      openSides({ orchestraId: singersFor.id, orchestra: singersFor.name, singer: name })
                    }
                    data-testid="orchestra-singer-years-row"
                  >
                    <span className="text-headline min-w-0 flex-1">{name}</span>
                    <span className="text-footnote text-[var(--label-2)]">{tx("song.see_sides")}</span>
                    <ChevronRight size={16} strokeWidth={2.5} className="cell-chevron" aria-hidden />
                  </button>
                  <div className="-mx-4 flex">
                    <ValueCell
                      label={tx("db.orchestrasTab.from_2")}
                      inputLabel={tx("db.orchestrasTab.from", { name })}
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
                      label={tx("db.orchestrasTab.to_2")}
                      inputLabel={tx("db.orchestrasTab.to", { name })}
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
        title={gradesFor ? tx("db.orchestrasTab.era_grades", { name: gradesFor.name }) : ""}
        trailing={tx("db.orchestrasTab.done")}
        detents={["large"]}
        testId="grades-sheet"
      >
        {gradesFor && (
          <Group
            header={
              editing
                ? tx("db.orchestrasTab.tap_a_grade_to_change_it")
                : tx("db.orchestrasTab.grades_by_year")
            }
            footer={tx("db.orchestrasTab.your_grades_win_over_the_shipped")}
          >
            <div className="cell flex-wrap gap-x-3 gap-y-1 py-2" data-testid="grade-legend">
              {GRADE_LEGEND.map((g) => (
                <span key={String(g)} className="text-footnote inline-flex items-center gap-1.5">
                  <span className="grade-swatch" data-g={g ?? ""} aria-hidden />
                  <span>
                    <b className="font-semibold">{gradeWord(g).word}</b>
                    <span className="text-[var(--label-2)]">
                      {" "}
                      {gradeWord(g).meaning.replace(/^[^:]*: /, "")}
                    </span>
                  </span>
                </span>
              ))}
            </div>
            <div className="cell text-footnote py-2 text-[var(--label-2)]">
              <span className="w-14 shrink-0">{tx("db.orchestrasTab.year")}</span>
              <span className="flex-1 text-center">{tx("db.orchestrasTab.instrumental_2")}</span>
              <span className="flex-1 text-center">{tx("db.orchestrasTab.with_a_singer_2")}</span>
            </div>
            {gradeYears.map((y) => (
              <div key={y} className="cell py-1" data-year={y}>
                <span className="w-14 shrink-0 tabular-nums">{y}</span>
                {(["instrumental", "vocal"] as const).map((mode) => {
                  const g = gradeRow?.[mode]?.[String(y)];
                  const has = typeof g === "number";
                  const mine = heatEdits?.[gradesFor.id]?.[mode]?.[String(y)] !== undefined;
                  const word = gradeWord(has ? g : null).word;
                  return (
                    <span key={mode} className="flex min-w-0 flex-1 justify-center">
                      <button
                        type="button"
                        className="grade-btn"
                        data-g={has ? g : ""}
                        data-edited={mine || undefined}
                        aria-label={`${y} ${mode === "vocal" ? tx("db.orchestrasTab.with_a_singer") : tx("db.orchestrasTab.instrumental")}: ${word}${editing ? tx("db.orchestrasTab.change") : ""}`}
                        onClick={() => setGrade(gradesFor, mode, y)}
                        disabled={!editing}
                        data-testid="grade-cell"
                      >
                        <span className="grade-swatch" data-g={has ? g : ""} aria-hidden />
                        <span className="truncate">{word}</span>
                      </button>
                    </span>
                  );
                })}
              </div>
            ))}
          </Group>
        )}
        {gradesFor && !editing && (
          <p className="section-foot">{tx("db.orchestrasTab.tap_edit_in_the_database_bar")}</p>
        )}
      </Sheet>
    </div>
  );
}
