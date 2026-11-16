"use client";
import {
  addNote,
  applyMemory,
  benchmarkNight,
  checkEdit,
  closingFormatOf,
  cortinaBeforeClosing,
  ERA_SETTINGS,
  hardViolations,
  learnedForRequest,
  likedShapeDefaults,
  OPENER_CHOICES,
  rememberFeedback,
  rememberSet,
  ULTIMA_CHOICES,
} from "@tdj/core";
import {
  ChevronRight,
  Copy,
  Disc3,
  Ellipsis,
  Eraser,
  Hand,
  ListPlus,
  LoaderCircle,
  Lock,
  MessageSquareText,
  Pin,
  PinOff,
  Play,
  Redo2,
  Repeat2,
  Search,
  Share,
  SlidersHorizontal,
  Star,
  ThumbsDown,
  ThumbsUp,
  Undo2,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  type AutoImproved,
  autoImproveLine,
  autoSetName,
  changedTandas,
  describeOptionChanges,
} from "@/lib/changes";
import { rememberComposeMs } from "@/lib/composeProgress";
import { djMessages } from "@/lib/djMessage";
import { recordSnapshot, redoEdit, undoEdit } from "@/lib/editHistory";
import { verdictText } from "@/lib/engineText";
import { FEATURED, type FeaturedId, featuredMeta, loadFeatured } from "@/lib/featured";
import { FEEDBACK_CHIPS } from "@/lib/feedback";
import { haptic } from "@/lib/haptics";
import { makeSnapshot } from "@/lib/history";
import { testSlowdownMs, useMediaQuery, whenIdle } from "@/lib/hooks";
import { fmtSec, lazy, lower, plural, t as tx } from "@/lib/i18n";
import { lengthOf, nightMusicSec } from "@/lib/lengths";
import { rateTap, ratingOf, undoRate } from "@/lib/likes";
import { describePreferences } from "@/lib/memory";
import { DUR, EASE, rise, STAGGER } from "@/lib/motion";
import { nightEraLabel, nightSub, nightTitle } from "@/lib/nightName";
import { nightItems, PlayListContext } from "@/lib/playback";
import { usePlayer } from "@/lib/player";
import { requestFavourites } from "@/lib/popularity";
import { moveSongInNight } from "@/lib/reorder";
import { approvedKeys, gateEdit } from "@/lib/ruleCheck";
import { useSheetOpen } from "@/lib/sheets";
import { openInsert, removeSongAt, removeTandaAt } from "@/lib/spot";
import {
  changedKeys,
  DEFAULT_OPTS,
  explicitKeys,
  fullOptions,
  optionsForRequest,
  overridesForRequest,
  useStore,
} from "@/lib/store";
import { toast } from "@/lib/toast";
import type {
  AppOptions,
  ComposeContext,
  ComposeOptions,
  Feedback,
  HistorySnapshot,
  Meta,
  NightRules,
  Playlist,
} from "@/lib/types";
import { metaLine, yearText } from "@/lib/year";
import { AiEditBar } from "./AiEditBar";
import { BenchmarkSheet, benchLabel, type ImproveResponse } from "./BenchmarkSheet";
import { ComposeLabel, ComposeProgress } from "./ComposeNarrative";
import { ContextStrip } from "./ContextStrip";
import { FeedbackBar } from "./FeedbackBar";
import {
  ActionRow,
  FieldRow,
  FoldGroup,
  Group,
  MultiPickerRow,
  PickerRow,
  RhythmTile,
  Row,
  SegmentedRow,
  SliderRow,
  StepperRow,
  SwitchRow,
} from "./Form";
import { Gramophone } from "./Gramophone";
import { LazyHydrate } from "./LazyHydrate";
import { Menu, type MenuItem, MenuList } from "./Menu";
import { NightCover } from "./NightCover";
import { NightExceptions } from "./NightExceptions";
import { PageHeader } from "./PageHeader";
import { PrimaryBar } from "./PrimaryBar";
import { ScoreCounter } from "./ScoreCounter";
import { Sheet } from "./Sheet";
import { SwapSheet } from "./SwapSheet";
import { TandaInspector } from "./TandaInspector";
import { TandaRulesGroup } from "./TandaRules";
import { TandaSwapSheet } from "./TandaSwapSheet";
import { Artwork } from "./ui/Artwork";
import { closingFormatLine, InsertGap } from "./ui/InsertGap";
import { NightProfile } from "./ui/NightProfile";
import { NightLength, PlayRow } from "./ui/PlayRow";
import { Tip } from "./ui/Tip";

/* Below-the-fold / on-demand pieces: their code arrives when first needed, not with the composer. */
const ExportSheet = dynamic(() => import("./ExportSheet").then((m) => m.ExportSheet), { ssr: false });
const MoodCheck = dynamic(() => import("./Listen").then((m) => m.MoodCheck), { ssr: false });
const SongSearchPanel = dynamic(() => import("./ui/SongSearchPanel").then((m) => m.SongSearchPanel), {
  ssr: false,
});
const NO_PLAYLISTS: never[] = [];
/* Result-only code (cards, rows, curve): not in the first-load graph; prefetched on idle, and the result section
   renders only once the modules are in hand (not through `dynamic()`, whose own loading state would commit
   `#result` once without its cards), so every card is in the DOM the moment `#result` is. */
type ResultMods = {
  TandaCard: typeof import("./TandaCard").TandaCard;
  EnergyCurve: typeof import("./EnergyCurve").EnergyCurve;
};
let resultMods: ResultMods | null = null;
const loadResult = (): Promise<ResultMods> =>
  resultMods
    ? Promise.resolve(resultMods)
    : Promise.all([import("./TandaCard"), import("./EnergyCurve")]).then(([a, b]) => {
        resultMods = { TandaCard: a.TandaCard, EnergyCurve: b.EnergyCurve };
        return resultMods;
      });

type Era = ComposeOptions["eras"][number];
const ERAS: Array<[Era, string]> = lazy(() => [
  ["golden", tx("composer.golden_age_1935_55")],
  ["golden-extended", tx("composer.golden_age_extended_1932_60")],
  ["guardia-vieja", tx("composer.guardia_vieja")],
  ["post-golden", tx("composer.post_golden_1956_69")],
  ["nuevo", tx("composer.nuevo")],
  ["contemporary", tx("composer.contemporary")],
  ["all", tx("composer.all_eras")],
]);
const CULTURES: Array<[string, string]> = lazy(() => [
  ["global", tx("composer.global")],
  ["latin", tx("composer.latin")],
  ["french", tx("composer.french")],
  ["italian", tx("composer.italian")],
  ["brazilian", tx("composer.brazilian")],
  ["turkish", tx("composer.turkish")],
  ["greek", tx("composer.greek")],
  ["persian", tx("composer.persian")],
  ["balkan", tx("composer.balkan")],
  ["arabic", tx("composer.arabic")],
  ["kpop", "K-pop"],
  ["afrobeats", "Afrobeats"],
]);
const ARCS: Array<[ComposeOptions["arc"], string]> = lazy(() => [
  ["classic-two-peaks", tx("composer.two_peaks")],
  ["single-peak", tx("composer.single_peak")],
  ["marathon-plateau", tx("composer.marathon")],
  ["gentle", tx("composer.gentle")],
]);
const SHAPES: Array<[ComposeOptions["tandaShape"], string]> = lazy(() => [
  ["rise-settle", tx("composer.slow_up_settle")],
  ["hammock", tx("composer.hammock_buenos_aires")],
  ["rise", tx("composer.rising")],
  ["peak-middle", tx("composer.peak_in_the_middle")],
  ["flat", tx("composer.flat")],
]);
const PATTERNS: Array<[ComposeOptions["pattern"], string]> = lazy(() => [
  ["classic", tx("composer.classic_ttvttm")],
  ["TTVTTM-strict", tx("composer.strict_ttvttm")],
  ["TVTM", "TVTM"],
  ["TMTV", "TMTV"],
  ["tango-only", tx("composer.tango_only")],
  ["custom", tx("composer.custom")],
]);
const CORTINA_STYLES: Array<[ComposeOptions["cortinaStyle"], string]> = lazy(() => [
  ["family", tx("composer.family")],
  ["matched", tx("composer.matched")],
  ["constant", tx("composer.same")],
  ["none", tx("composer.none")],
]);
const CORTINA_TRENDS: Array<[NonNullable<ComposeOptions["cortinaTrend"]>, string]> = lazy(() => [
  ["mixed", tx("composer.mix")],
  ["trend", tx("composer.current_hits")],
  ["classic", tx("composer.classics")],
]);
const ULTIMA: Array<[NonNullable<NightRules["ultimaRule"]>, string]> = lazy(() => [
  ["emotional-vocal", tx("composer.emotional_vocal")],
  ["d-arienzo-rhythmic", tx("composer.d_arienzo_rhythmic")],
  ["pugliese", "Pugliese"],
  ["any", tx("composer.any")],
]);
const OPENER: Array<[NonNullable<NightRules["openerRule"]>, string]> = lazy(() => [
  ["canon", tx("composer.canon_di_sarli_fresedo")],
  ["lyrical", tx("composer.lyrical")],
  ["rhythmic", tx("composer.rhythmic")],
  ["any", tx("composer.any")],
]);
/** round 15: the night's shape as settings — who opens, who plays the última, what closes ("auto" = the rules) */
// (2026-11: the orchestras offered are data — data/knowledge/night_shape.json, @tdj/core nightShape.ts)
const OPEN_WITH: Array<[string, string]> = lazy(() => [
  ["auto", tx("composer.auto_the_opener_rule")],
  ...OPENER_CHOICES.map((c): [string, string] => [c.id, c.label]),
]);
const ULTIMA_WITH: Array<[string, string]> = lazy(() => [
  ["auto", tx("composer.auto_the_ultima_rule")],
  ...ULTIMA_CHOICES.map((c): [string, string] => [
    c.key,
    c.labelKey ? tx(c.labelKey as Parameters<typeof tx>[0]) : (c.label ?? c.key),
  ]),
]);
const CLOSERS: Array<[NonNullable<NightRules["closer"]>, string]> = lazy(() => [
  ["auto", "La Cumparsita"],
  ["in-range", tx("composer.la_cumparsita_the_night_s_years")],
  ["felicia", "Felicia"],
  ["none", tx("composer.none")],
]);
const COOLDOWNS: Array<[NonNullable<NightRules["cooldown"]>, string]> = lazy(() => [
  ["lift", tx("composer.lift_into_the_ultima")],
  ["gentle", tx("composer.gentle")],
]);
const ultimaKey = (r: NightRules) =>
  r.ultimaOrchestra
    ? `${r.ultimaOrchestra}|${r.ultimaSinger === null ? "~" : r.ultimaSinger === undefined ? "*" : r.ultimaSinger}`
    : "auto";
/** round 21: where La Cumparsita plays (the default opens and closes the night) */
/** wave 2: one control for where La Cumparsita plays (it was a switch in Night and a picker in Night rules) */
const CUMPARSITA_AT: Array<[NonNullable<NightRules["cumparsita"]>, string]> = lazy(() => [
  ["open", tx("composer.open")],
  ["close", tx("composer.close")],
  ["both", tx("composer.both")],
  ["none", tx("composer.off")],
]);
const cumparsitaKey = (r: NightRules, close?: boolean): NonNullable<NightRules["cumparsita"]> =>
  r.cumparsita ??
  ((r.openWithCumparsita ?? true) ? (close === false ? "open" : "both") : close === false ? "none" : "close");
const CUMPARSITAS: Array<["1" | "2", string]> = lazy(() => [
  ["1", tx("composer.one_europe")],
  ["2", tx("composer.two_buenos_aires")],
]);
/** Era-preset keys the user can pin so an era change leaves them alone. */
const ERA_KEYS = [
  "pattern",
  "tangoTandaSize",
  "valsTandaSize",
  "milongaTandaSize",
  "tandaShape",
  "maxYearSpread",
  "cortinaStyle",
  "cortinaLengthSec",
  "orchestraRepeatGap",
  "mixVocalInstrumental",
] as const;

function fmtDuration(sec: number) {
  const total = Math.round(sec / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return tx("composer.h_min", { h, p1: String(m).padStart(2, "0") });
}

/** Pin glyph: keeps a control through era changes. */
function PinButton({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <Tip
      text={
        on ? tx("composer.pinned_era_presets_leave_this_alone") : tx("composer.pin_so_era_presets_leave_this")
      }
    >
      <button
        type="button"
        className={`icon-btn icon-btn-bare -my-2 h-11 w-11 ${on ? "text-[var(--tint)]" : "pin-idle text-[var(--label-3)]"}`}
        aria-pressed={on}
        aria-label={`${on ? tx("composer.unpin") : tx("composer.pin")} ${lower(label)}`}
        onClick={(e) => {
          e.preventDefault();
          haptic(4);
          onToggle();
        }}
      >
        {on ? <Pin size={15} strokeWidth={2} fill="currentColor" /> : <PinOff size={15} strokeWidth={2} />}
      </button>
    </Tip>
  );
}

/**
 * The set-up controls. Memoised: while a result mounts (22 cards, curve, score) the form's 40 rows must not
 * re-render, and after a set exists the form stays mounted but folded, so only an option change re-renders it.
 * Hydrated lazily (`LazyHydrate`): the server HTML is on screen from the first paint and the form's hooks attach in
 * idle time, in a task of their own, instead of inside the page's one 500 ms (phone) hydration task.
 */
const SetupForm = memo(function SetupForm({
  options,
  eraNote,
  meta,
  applied,
  hidden,
  setOptions,
  setRules,
  applyEra,
  togglePin,
  onCompose,
  busy,
  dock,
}: {
  options: AppOptions;
  eraNote: string | null;
  meta: Meta | null;
  applied: ComposeOptions | null;
  hidden: boolean;
  setOptions: (o: Partial<AppOptions>) => void;
  setRules: (patch: Partial<NightRules>) => void;
  applyEra: (next: Era, force?: boolean) => void;
  togglePin: (k: string) => void;
  /** the inline secondary Compose at the end of the form (the primary lives in the toolbar / phone bar) */
  onCompose: () => void;
  busy: boolean;
  /** the dock's Compose is the one on screen (off while the empty page's hero button is in view) */
  dock: boolean;
}) {
  const era: Era = (options.eras ?? ["golden"])[0] ?? "golden";
  const eraDefaults = ERA_SETTINGS[era] ?? ERA_SETTINGS.golden!;
  const pinned = options.pinned ?? [];
  const isPinned = (k: string) => pinned.includes(k);
  /** Night rules as the engine will see them: era defaults under the user's choices. */
  const rules: NightRules = { ...eraDefaults.rules, ...(options.rules ?? {}) };
  const explicit = explicitKeys(options);
  const hours = options.hours ?? 4;
  const tandasEst = Math.round(hours * 5.2);
  const cultures = options.cortinaCultures ?? ["global"];
  const cortinaStyle = options.cortinaStyle ?? "family";
  const contextCount = Object.entries(options.context ?? {}).filter(
    ([k, v]) => k !== "region" && v != null && v !== "",
  ).length;
  return (
    // Round 23: essentials first (one group: length, era, arc, cortinas, closing), everything else in folded sections
    // with their current values as a summary, two columns on wide screens, and Compose in a dock that stays in
    // reach at every scroll position (the phone has its primary bar). The defaults compose a good night untouched.
    <div className={hidden ? "hidden" : "setup-form"} id="setup">
      <Group
        header={tx("composer.night")}
        footer={eraNote ?? tx("composer.guide_2_h_practica_4_h")}
        id="night"
        className="setup-essentials"
      >
        <SliderRow
          id="hours"
          label={tx("composer.length")}
          tip={tx("composer.how_long_the_night_runs_the")}
          display={tx("composer.h_tandas_2", { hours, tandasEst })}
          min={1}
          max={8}
          step={0.5}
          value={hours}
          onChange={(v) => setOptions({ hours: v })}
        />
        <PickerRow
          label={tx("composer.era")}
          ariaLabel={tx("composer.era")}
          tip={tx("composer.which_recordings_the_night_draws_on")}
          value={era}
          items={ERAS}
          onChange={(k) => k && applyEra(k)}
        />
        <SegmentedRow
          label={tx("composer.arc")}
          sub={
            hours < 3
              ? tx("composer.two_peaks_need_a_night_of")
              : tx("composer.two_peaks_a_real_breather_between")
          }
          value={options.arc ?? "classic-two-peaks"}
          items={ARCS}
          onChange={(k) =>
            // one control: the chosen arc also fixes the engine's peak shape so context never reshapes it
            setOptions({
              arc: k,
              arcShape: k === "classic-two-peaks" ? "double" : k === "single-peak" ? "single" : undefined,
            })
          }
        />
        <SegmentedRow
          label={tx("composer.cortinas")}
          tips={{
            family: tx("composer.one_artist_or_genre_family_all"),
            matched: tx("composer.each_cortina_picked_for_the_tanda"),
            constant: tx("composer.one_cortina_repeated_all_night_the"),
            none: tx("composer.no_cortinas_tandas_follow_each_other"),
          }}
          value={cortinaStyle}
          items={CORTINA_STYLES}
          onChange={(k) => setOptions({ cortinaStyle: k })}
        >
          <PinButton
            on={isPinned("cortinaStyle")}
            label={tx("composer.cortina_style")}
            onToggle={() => togglePin("cortinaStyle")}
          />
        </SegmentedRow>
        <PickerRow
          label={tx("composer.la_cumparsita")}
          tip={tx("composer.where_la_cumparsita_the_traditional_last")}
          sub={tx("composer.open_before_the_first_tanda_by")}
          ariaLabel={tx("composer.la_cumparsita")}
          value={cumparsitaKey(rules, options.closeWithCumparsita)}
          items={CUMPARSITA_AT}
          onChange={(k) => {
            if (!k) return;
            const closes = k === "close" || k === "both";
            // 2026-11: a closing format the DJ chose (Settings → Night) follows: no closing → "none"
            const f = rules.closingFormat;
            const closingFormat = f ? (closes ? (f === "none" ? undefined : f) : "none") : undefined;
            setRules({ cumparsita: k, openWithCumparsita: undefined, ...(f ? { closingFormat } : {}) });
            setOptions({ closeWithCumparsita: closes });
          }}
        />
      </Group>

      <FoldGroup
        header={tx("composer.structure")}
        tip={tx("composer.the_cycle_of_tango_vals_and")}
        summary={tx("composer.tracks_2", {
          p1: PATTERNS.find(([k]) => k === (options.pattern ?? "classic"))?.[1] ?? tx("composer.custom"),
          p2: options.tangoTandaSize ?? 4,
          p3: options.valsTandaSize ?? 3,
          p4: options.milongaTandaSize ?? 3,
        })}
        footer={tx("composer.sizes_are_in_tracks_gap_in")}
        id="structure"
      >
        <PickerRow
          label={tx("composer.tanda_shape")}
          sub={tx("composer.how_energy_moves_inside_each_tanda")}
          ariaLabel={tx("composer.tanda_shape")}
          value={options.tandaShape ?? eraDefaults.tandaShape}
          items={SHAPES}
          onChange={(k) => k && setOptions({ tandaShape: k })}
        >
          <PinButton
            on={isPinned("tandaShape")}
            label={tx("composer.shape")}
            onToggle={() => togglePin("tandaShape")}
          />
        </PickerRow>
        <PickerRow
          label={tx("composer.cycle")}
          sub={tx("composer.the_rhythm_order_the_night_repeats")}
          ariaLabel={tx("composer.cycle")}
          value={options.pattern ?? "classic"}
          items={PATTERNS}
          onChange={(k) => k && setOptions({ pattern: k })}
        >
          <PinButton
            on={isPinned("pattern")}
            label={tx("composer.cycle")}
            onToggle={() => togglePin("pattern")}
          />
        </PickerRow>
        {options.pattern === "custom" && (
          <FieldRow
            label={tx("composer.custom_cycle")}
            id="custom-pattern"
            tip={tx("composer.your_own_order_of_rhythms_t")}
          >
            <input
              id="custom-pattern"
              className="field field-value min-w-0 flex-1 font-mono uppercase"
              value={options.customPattern ?? ""}
              placeholder={tx("composer.ttvttm")}
              onChange={(e) =>
                setOptions({ customPattern: e.target.value.toUpperCase().replace(/[^TVM]/g, "") })
              }
              autoComplete="off"
              spellCheck={false}
            />
          </FieldRow>
        )}
        <StepperRow
          label={tx("composer.tango_tanda")}
          tip={tx("composer.how_many_songs_in_each_tango")}
          value={options.tangoTandaSize ?? 4}
          unit={tx("composer.tracks")}
          min={3}
          max={5}
          step={1}
          onChange={(v) => setOptions({ tangoTandaSize: v as 3 | 4 | 5 })}
        >
          <PinButton
            on={isPinned("tangoTandaSize")}
            label={tx("composer.tango_tanda_size")}
            onToggle={() => togglePin("tangoTandaSize")}
          />
        </StepperRow>
        <StepperRow
          label={tx("composer.vals_tanda")}
          tip={tx("composer.how_many_songs_in_each_vals")}
          value={options.valsTandaSize ?? 3}
          unit={tx("composer.tracks")}
          min={3}
          max={4}
          step={1}
          onChange={(v) => setOptions({ valsTandaSize: v as 3 | 4 })}
        >
          <PinButton
            on={isPinned("valsTandaSize")}
            label={tx("composer.vals_tanda_size")}
            onToggle={() => togglePin("valsTandaSize")}
          />
        </StepperRow>
        <StepperRow
          label={tx("composer.milonga_tanda")}
          tip={tx("composer.how_many_songs_in_each_milonga")}
          value={options.milongaTandaSize ?? 3}
          unit={tx("composer.tracks")}
          min={3}
          max={4}
          step={1}
          onChange={(v) => setOptions({ milongaTandaSize: v as 3 | 4 })}
        >
          <PinButton
            on={isPinned("milongaTandaSize")}
            label={tx("composer.milonga_tanda_size")}
            onToggle={() => togglePin("milongaTandaSize")}
          />
        </StepperRow>
        <StepperRow
          label={tx("composer.orchestra_repeat_gap")}
          tip={tx("composer.how_many_tandas_pass_before_the")}
          value={options.orchestraRepeatGap ?? 6}
          unit={tx("composer.tandas_2")}
          min={1}
          max={12}
          step={1}
          onChange={(v) => setOptions({ orchestraRepeatGap: v })}
        >
          <PinButton
            on={isPinned("orchestraRepeatGap")}
            label={tx("composer.repeat_gap")}
            onToggle={() => togglePin("orchestraRepeatGap")}
          />
        </StepperRow>
        <StepperRow
          label={tx("composer.year_spread")}
          tip={tx("composer.how_many_years_apart_the_songs")}
          value={options.maxYearSpread ?? 4}
          unit=" y"
          min={1}
          max={15}
          step={1}
          onChange={(v) => setOptions({ maxYearSpread: v })}
        >
          <PinButton
            on={isPinned("maxYearSpread")}
            label={tx("composer.year_spread")}
            onToggle={() => togglePin("maxYearSpread")}
          />
        </StepperRow>
        <ActionRow
          label={tx("composer.reset_to_era_defaults")}
          tip={tx("composer.put_the_tanda_sizes_gap_and")}
          onClick={() => applyEra(era, true)}
        />
      </FoldGroup>

      {cortinaStyle !== "none" && (
        <FoldGroup
          header={tx("composer.cortinas")}
          tip={tx("composer.what_the_cortinas_sound_like_and")}
          summary={`${CORTINA_TRENDS.find(([k]) => k === (options.cortinaTrend ?? "mixed"))?.[1] ?? ""} · ${fmtSec(options.cortinaLengthSec ?? 45)}`}
          footer={
            cortinaStyle === "family"
              ? tx("composer.family_one_artist_or_genre_family")
              : cortinaStyle === "constant"
                ? tx("composer.same_one_cortina_track_repeated_all")
                : tx("composer.matched_each_cortina_is_picked_for")
          }
          id="cortinas"
        >
          <SegmentedRow
            label={tx("composer.flavour")}
            tips={{
              mixed: tx("composer.a_mix_of_today_s_hits"),
              trend: tx("composer.songs_people_know_from_the_radio"),
              classic: tx("composer.older_songs_everyone_recognises"),
            }}
            value={options.cortinaTrend ?? "mixed"}
            items={CORTINA_TRENDS}
            onChange={(k) => setOptions({ cortinaTrend: k })}
          />
          <MultiPickerRow
            label={tx("composer.cultures")}
            tip={tx("composer.where_the_cortina_songs_come_from")}
            values={cultures}
            items={CULTURES}
            min={1}
            onChange={(v) => setOptions({ cortinaCultures: v.length ? v : ["global"] })}
            footer={tx("composer.at_least_one_culture_stays_chosen")}
          />
          <StepperRow
            label={tx("composer.length")}
            tip={tx("composer.how_many_seconds_each_cortina_plays")}
            value={options.cortinaLengthSec ?? 45}
            unit=" s"
            min={20}
            max={90}
            step={5}
            onChange={(v) => setOptions({ cortinaLengthSec: v })}
          >
            <PinButton
              on={isPinned("cortinaLengthSec")}
              label={tx("composer.cortina_length")}
              onToggle={() => togglePin("cortinaLengthSec")}
            />
          </StepperRow>
        </FoldGroup>
      )}

      <FoldGroup
        header={tx("composer.night_rules")}
        tip={tx("composer.rules_for_the_whole_night_the")}
        summary={`Última: ${(ULTIMA.find(([k]) => k === (rules.ultimaRule ?? "emotional-vocal"))?.[1] ?? "").toLowerCase()}`}
        footer={tx("composer.defaults_follow_the_era_these_travel")}
        id="night-rules"
      >
        <SegmentedRow
          label={tx("composer.closing_cumparsitas")}
          tips={{
            "1": tx("composer.one_la_cumparsita_as_in_most"),
            "2": tx("composer.two_as_in_buenos_aires_the"),
          }}
          value={String(rules.cumparsitaCount ?? 1) as "1" | "2"}
          items={CUMPARSITAS}
          onChange={(k) => setRules({ cumparsitaCount: Number(k) as 1 | 2 })}
        />
        <SwitchRow
          label={tx("composer.closing_matches_the_ultima")}
          sub={tx("composer.la_cumparsita_by_the_last_tanda")}
          checked={!!rules.cumparsitaHarmony}
          onChange={(v) => setRules({ cumparsitaHarmony: v || undefined })}
        />
        <SwitchRow
          label={tx("composer.last_4_tandas_tango_only")}
          sub={tx("composer.the_player_skips_a_vals_or")}
          checked={!!rules.lastFourTango}
          onChange={(v) => setRules({ lastFourTango: v || undefined })}
        />
        <SwitchRow
          label={tx("composer.birthday_vals")}
          sub={tx("composer.a_vals_tanda_reserved_for_the")}
          checked={rules.birthdayValsAt != null}
          onChange={(v) => setRules({ birthdayValsAt: v ? 0.6 : null })}
        />
        {rules.birthdayValsAt != null && (
          <SliderRow
            label={tx("composer.birthday_vals_position")}
            display={tx("composer.pct_of_night", { pct: Math.round(rules.birthdayValsAt * 100) })}
            min={10}
            max={90}
            step={5}
            value={Math.round(rules.birthdayValsAt * 100)}
            onChange={(v) => setRules({ birthdayValsAt: v / 100 })}
          />
        )}
        <SwitchRow
          label={tx("composer.show_or_break")}
          sub={tx("composer.a_gap_without_cortina_energy_re")}
          checked={rules.showBreakAt != null}
          onChange={(v) =>
            setRules({ showBreakAt: v ? 0.5 : null, showBreakMinutes: rules.showBreakMinutes ?? 20 })
          }
        />
        {rules.showBreakAt != null && (
          <>
            <SliderRow
              label={tx("composer.break_position")}
              display={tx("composer.pct_of_night", { pct: Math.round(rules.showBreakAt * 100) })}
              min={10}
              max={90}
              step={5}
              value={Math.round(rules.showBreakAt * 100)}
              onChange={(v) => setRules({ showBreakAt: v / 100 })}
            />
            <StepperRow
              label={tx("composer.break_length")}
              value={rules.showBreakMinutes ?? 20}
              unit={tx("composer.min")}
              min={5}
              max={60}
              step={5}
              onChange={(v) => setRules({ showBreakMinutes: v })}
            />
          </>
        )}
        <PickerRow
          label={tx("composer.ultima_tanda")}
          sub={tx("composer.the_last_tanda_before_la_cumparsita")}
          ariaLabel={tx("composer.ultima_tanda")}
          value={rules.ultimaRule ?? "emotional-vocal"}
          items={ULTIMA}
          onChange={(k) => k && setRules({ ultimaRule: k })}
        />
        <PickerRow
          label={tx("composer.opener")}
          tip={tx("composer.what_the_first_tanda_of_the")}
          ariaLabel={tx("composer.opener")}
          value={rules.openerRule ?? "canon"}
          items={OPENER}
          onChange={(k) => k && setRules({ openerRule: k })}
        />
        <PickerRow
          label={tx("composer.open_with")}
          sub={tx("composer.the_orchestra_of_the_first_tanda")}
          ariaLabel={tx("composer.open_with")}
          value={rules.openerOrchestra ?? "auto"}
          items={OPEN_WITH}
          onChange={(k) => k && setRules({ openerOrchestra: k === "auto" ? undefined : k })}
        />
        <PickerRow
          label={tx("composer.ultima_with")}
          sub={tx("composer.the_family_of_the_last_tanda")}
          ariaLabel={tx("composer.ultima_with")}
          value={ultimaKey(rules)}
          items={ULTIMA_WITH}
          onChange={(k) => {
            if (!k) return;
            if (k === "auto") return setRules({ ultimaOrchestra: undefined, ultimaSinger: undefined });
            const [orch, singer] = k.split("|");
            setRules({
              ultimaOrchestra: orch,
              ultimaSinger: singer === "~" ? null : singer === "*" ? undefined : singer,
            });
          }}
        />
        <PickerRow
          label={tx("composer.closer")}
          sub={tx("composer.what_plays_after_the_ultima")}
          ariaLabel={tx("composer.closer")}
          value={rules.closer ?? "auto"}
          items={CLOSERS}
          onChange={(k) => k && setRules({ closer: k })}
        />
        <StepperRow
          label={tx("composer.warm_up")}
          sub={tx("composer.tandas_planned_gentle_at_the_start")}
          value={rules.warmupTandas ?? 0}
          unit={tx("composer.tandas_2")}
          min={0}
          max={6}
          step={1}
          onChange={(v) => setRules({ warmupTandas: v || undefined })}
        />
        <PickerRow
          label={tx("composer.cool_down")}
          tip={tx("composer.how_the_night_calms_down_before")}
          ariaLabel={tx("composer.cool_down")}
          value={rules.cooldown ?? "lift"}
          items={COOLDOWNS}
          onChange={(k) => k && setRules({ cooldown: k })}
        />
        <SwitchRow
          label={tx("composer.pugliese_once")}
          sub={tx("composer.at_most_one_pugliese_tanda_late")}
          checked={rules.puglieseOnce ?? true}
          onChange={(v) => setRules({ puglieseOnce: v })}
        />
        <SwitchRow
          label={tx("composer.colour_tanda")}
          sub={tx("composer.one_foxtrot_pirincho_milonga_or_hugo")}
          checked={!!rules.colourTanda}
          onChange={(v) => setRules({ colourTanda: v })}
        />
        <SwitchRow
          label={tx("composer.mixed_milonga_and_vals_tandas")}
          sub={tx("composer.allow_more_than_one_orchestra_inside")}
          checked={!!rules.mixedMilongaVals}
          onChange={(v) => setRules({ mixedMilongaVals: v })}
        />
        <SwitchRow
          label={tx("composer.cortina_before_la_cumparsita")}
          tip={tx("composer.a_cortina_clears_the_floor_before")}
          checked={cortinaBeforeClosing(
            closingFormatOf({ rules, closeWithCumparsita: options.closeWithCumparsita }),
          )}
          onChange={(v) =>
            // 2026-11: the switch is the closing format's cortina (Settings → Night → "The last La Cumparsita")
            setRules({
              cortinaBeforeCumparsita: v,
              ...(rules.closingFormat
                ? {
                    closingFormat: v
                      ? rules.closingFormat === "own-tanda"
                        ? "own-tanda"
                        : "after-cortina"
                      : rules.closingFormat === "in-tanda"
                        ? "in-tanda"
                        : "straight",
                  }
                : {}),
            })
          }
        />
        {/* the engine reads this on the night rules (round-8 engine): undated, placeholder-year and transcription
            rows never build a tanda unless the DJ opts in */}
        <SwitchRow
          label={tx("composer.include_undated_recordings")}
          sub={tx("composer.undated_placeholder_year_and_transcription_rows")}
          checked={!!rules.allowUndated}
          onChange={(v) => setRules({ allowUndated: v })}
        />
      </FoldGroup>

      <FoldGroup
        header={tx("composer.tanda_rules")}
        tip={tx("composer.rules_inside_each_tanda_one_voice")}
        bare
        id="tanda-rules-fold"
      >
        <TandaRulesGroup value={options.tandaRules} onChange={(tandaRules) => setOptions({ tandaRules })} />
      </FoldGroup>

      <FoldGroup
        header={tx("composer.tonight_2")}
        tip={tx("composer.the_room_the_crowd_and_the")}
        summary={contextCount ? tx("composer.set", { contextCount }) : tx("composer.room_crowd_floor")}
        bare
        id="tonight-fold"
      >
        <ContextStrip
          value={(options.context ?? {}) as ComposeContext}
          onChange={(context) => setOptions({ context })}
          model={meta?.contextModel ?? null}
          applied={applied}
          regionFromSettings={
            !explicit.includes("context") ||
            Object.keys(options.context ?? {}).filter((k) => k !== "region").length === 0
          }
        />
      </FoldGroup>

      {/* Compose stays in reach (round 23): a dock that sticks to the bottom of the window while the form is on
          screen (sm+; the phone's primary bar does this job there). The toolbar keeps its own primary too. */}
      <div
        className={`compose-dock glass ${dock ? "" : "compose-dock-off"}`}
        data-testid="compose-dock"
        aria-hidden={!dock || undefined}
        inert={!dock || undefined}
      >
        <span className="text-footnote min-w-0 flex-1 truncate text-[var(--label-2)]">
          {tx("composer.h_tandas", { p1: nightEraLabel({ options }), hours, tandasEst })}
        </span>
        <Tip text={tx("composer.compose_the_night_with_these_settings")}>
          <button
            type="button"
            className="btn btn-primary min-h-[44px]"
            onClick={onCompose}
            disabled={busy}
            aria-label={tx("composer.compose_with_these_settings")}
            data-testid="form-compose"
          >
            <Disc3 size={18} aria-hidden /> {tx("composer.compose")}
          </button>
        </Tip>
      </div>
    </div>
  );
});

/** "make tanda 7 a little calmer please" → at most `n` characters, on a word */
const clipWords = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n).replace(/\s+\S*$/, "")}…`);

/** wave 2: the reveal key of a fresh set, carried by the playlist object (see `setKey` in Composer) */
const REVEAL = new WeakMap<Playlist, string>();

export function Composer() {
  const router = useRouter();
  const {
    options,
    setOptions,
    presetOptions,
    replaceOptions,
    playlist: livePlaylist,
    setPlaylist,
    busy,
    setBusy,
    settings,
    overrides,
    overridesReady,
    memory,
    updateMemory,
    addSnapshot,
    recordNightEdit,
  } = useStore();
  const [exportOpen, setExportOpen] = useState(false);
  /** the export sheet (and its export code) mounts on the first open only */
  const [exportMounted, setExportMounted] = useState(false);
  const openExport = useCallback(() => {
    setExportMounted(true);
    setExportOpen(true);
  }, []);
  const [scoreOpen, setScoreOpen] = useState(false);
  /** phone: feedback chips and Tell the DJ live in a bottom sheet (round5-design.md §1) */
  const [adjustOpen, setAdjustOpen] = useState(false);
  /** phone: the primary bar's ••• sheet (outside the bar, which leaves the screen while any sheet is up) */
  const [actionsOpen, setActionsOpen] = useState(false);
  const sheetOpen = useSheetOpen();
  const [moodOpen, setMoodOpen] = useState(false);
  /** the benchmark against published DJ sets (round 12): checks, Improve automatically, Keep / Undo */
  const [benchOpen, setBenchOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  /** the tanda the wide-screen inspector shows */
  const [inspected, setInspected] = useState(0);
  const [swapping] = useState<number | null>(null);
  const [swappingTrack] = useState<[number, number] | null>(null);
  /** the card whose lock just flipped: the only one (with the swapping one) that gets layout animations */
  const [lockedCard, setLockedCard] = useState<number | null>(null);
  const [ai, setAi] = useState<string | null>(null);
  const [aiError, setAiError] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  /** the organiser's shared review key exists (null until checked): the Written review row says Ready / Off */
  const [aiShared, setAiShared] = useState<boolean | null>(null);
  /** "what changed" after a chip / refine: replaced tandas and the score move */
  const [changeSummary, setChangeSummary] = useState<string | null>(null);
  /** the form stays folded under a summary row while a set exists; Edit opens it */
  const [setupOpen, setSetupOpen] = useState(false);
  const [changedSet, setChangedSet] = useState<Set<number>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eraNote, setEraNote] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [pendingChip, setPendingChip] = useState<Feedback | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  const [nudge] = useState<{ i: number; k: number; n: number } | null>(null);
  /** the score before the last recompose, so the counter runs old → new instead of 0 → new */
  const prevScore = useRef<number | null>(null);
  /** the compose request in flight (Cancel aborts it) */
  const abortRef = useRef<AbortController | null>(null);
  const [composing, setComposing] = useState(false);
  /** energy per tanda before the last swap/recompose (keyed by index) */
  const prevEnergy = useRef<Record<number, number>>({});
  /**
   * The result renders from deferred values: a new set is a time-sliced, interruptible render (React yields to
   * input and paint every few ms) that commits once, instead of one long synchronous task of 22 cards. The store's
   * live playlist drives the requests; the deferred one drives what is on screen.
   */
  // (wave 2: the set mounts in a second, interruptible pass — `null` first — so returning to Compose paints the page
  // before the 22 cards render)
  const playlist = useDeferredValue(livePlaylist, null);
  /** the night against the published DJ sets: pure and fast, recomputed with the set */
  // the tandas the DJ approved as they are for this night only (the featured night's exceptions) are accepted
  const approved = useMemo(
    () => approvedKeys(meta?.featuredLearned, memory.learned, playlist?.id),
    [meta?.featuredLearned, memory.learned, playlist?.id],
  );
  const bench = useMemo(
    () => (playlist ? benchmarkNight(playlist, { approved }) : null),
    [playlist, approved],
  );
  /**
   * The reveal key changes on a fresh set (Compose pressed, or a recompose that changed the tanda count) and drives
   * the full reveal (score 0 → n, curve draw-on, card stagger); feedback / "Tell the DJ" with the same tanda count keep
   * it: the curve morphs and the score counts on. Wave 2: the key travels with the playlist object itself (REVEAL),
   * so the deferred playlist and its key always commit together: a separate deferred key could land one commit after
   * the set and play the chart twice (a morph from the old curve, then the draw-on).
   */
  const committedKey = useRef("");
  const ownKey = playlist ? REVEAL.get(playlist) : undefined;
  // a restored playlist (localStorage) has no reveal key yet: adopt it without animating
  const setKey = ownKey ?? (committedKey.current || (playlist ? String(playlist.options.seed) : ""));
  /** true for the renders before the new key commits (the mount of a fresh set) */
  const fresh = !!ownKey && ownKey !== committedKey.current;
  useEffect(() => {
    committedKey.current = setKey;
  }, [setKey]);
  const reduced = useReducedMotion();
  const wide = useMediaQuery("(min-width: 600px)", true);
  const lg = useMediaQuery("(min-width: 1024px)", true);
  const playerOpen = usePlayer((s) => !!s.track);
  useEffect(() => setHydrated(true), []);
  /**
   * Wave 2 — one Compose button at a time: on the empty page the hero's; once it scrolls away, the form's dock
   * (phones: the primary bar only). The dock sits out while the hero is on screen.
   */
  const heroRef = useRef<HTMLButtonElement | null>(null);
  const [heroInView, setHeroInView] = useState(true);
  const hasSet = !!livePlaylist;
  useEffect(() => {
    const el = heroRef.current;
    if (!hydrated || hasSet || !el || typeof IntersectionObserver === "undefined") {
      setHeroInView(false);
      return;
    }
    setHeroInView(true);
    const io = new IntersectionObserver(([e]) =>
      setHeroInView(!!e?.isIntersecting && e.intersectionRatio > 0),
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hydrated, hasSet]);
  // the phone primary bar needs room under the form (round8-ux.md §2): `main` pads for it while this page is up
  // wave 4: only the empty page floats a Compose button; with a set the actions live in the navigation bar
  const floatingCompose = !hasSet;
  useEffect(() => {
    if (!floatingCompose) return;
    document.documentElement.dataset.primaryBar = "1";
    return () => {
      delete document.documentElement.dataset.primaryBar;
    };
  }, [floatingCompose]);
  useEffect(() => {
    let alive = true;
    const cancel = whenIdle(() => {
      fetch("/api/ai/review", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => alive && setAiShared(!!j?.shared))
        .catch(() => alive && setAiShared(false));
    }, 4000);
    return () => {
      alive = false;
      cancel();
    };
  }, []);
  const [mods, setMods] = useState<ResultMods | null>(resultMods);
  useEffect(() => {
    let alive = true;
    const cancel = whenIdle(() => {
      loadResult().then((m) => alive && setMods(m));
    }, 2000);
    return () => {
      alive = false;
      cancel();
    };
  }, []);
  // a compose must never wait on the idle prefetch: load now if it has not happened yet
  useEffect(() => {
    if (busy && !mods) loadResult().then(setMods);
  }, [busy, mods]);
  useEffect(() => {
    fetch("/api/meta")
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => {});
  }, []);
  /** Keep the previous score/energies so counters run from the old value. */
  const remember = useCallback((prev: Playlist | null) => {
    prevScore.current = prev?.score.total ?? null;
    prevEnergy.current = Object.fromEntries((prev?.tandas ?? []).map((t, i) => [i, t.energy]));
  }, []);
  /** Improve automatically → Keep: the improved night replaces the set (Export and the booth read the store). */
  const keepImproved = useCallback(
    (r: ImproveResponse) => {
      const prev = useStore.getState().playlist;
      remember(prev);
      setPlaylist(r.playlist);
      recordNightEdit(r.playlist, tx("composer.polished_against_published_dj_sets"), "refine");
      setChangedSet(new Set(changedTandas(prev, r.playlist)));
      setChangeSummary(
        tx("composer.polished_score", {
          changes: plural("plural.changes", r.changes.length),
          before: r.before.score,
          after: r.after.score,
        }),
      );
      setBenchOpen(false);
      toast(tx("composer.improved_set_kept"), () => prev && setPlaylist(prev));
    },
    [remember, setPlaylist, recordNightEdit],
  );
  /** A built-in night: `/?featured=<id>` or the hero / empty-state cards load it into the result view. */
  const openFeatured = useCallback(
    async (id: FeaturedId) => {
      setBusy(true);
      setError(null);
      try {
        // wave 2: the featured night carries the one title its card shows (its music is the DJ's, unchanged)
        const raw = await loadFeatured(id);
        const p = { ...raw, name: featuredMeta(id)?.title ?? raw.name };
        remember(useStore.getState().playlist);
        REVEAL.set(p, `featured-${id}-${Date.now()}`);
        setPlaylist(p);
        replaceOptions({ ...p.options, seed: p.options.seed });
        setActive(null);
        setSetupOpen(false);
        setChangeSummary(null);
        setChangedSet(new Set());
        toast(tx("composer.loaded", { p1: featuredMeta(id)?.title ?? tx("composer.featured_night") }));
        requestAnimationFrame(() =>
          document.getElementById("result")?.scrollIntoView({ behavior: "smooth", block: "start" }),
        );
      } catch {
        setError(tx("composer.the_featured_night_could_not_be"));
        setErrorKey((k) => k + 1);
      } finally {
        setBusy(false);
      }
    },
    [setBusy, setPlaylist, replaceOptions, remember],
  );
  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get("featured");
    const f = wanted && FEATURED.find((x) => x.id === wanted);
    if (!f) return;
    // `&export=1` opens the Export sheet once the night is in: one tap from a shared link to Spotify
    const thenExport = params.get("export") !== null;
    void openFeatured(f.id).then(() => {
      if (thenExport) setTimeout(openExport, 400);
    });
    // the deep link is consumed once: a reload or a later compose must not re-load it
    window.history.replaceState(null, "", window.location.pathname);
  }, [hydrated, openFeatured, openExport]);
  // Tonight's region defaults to the one in Settings
  const region = settings.region;
  useEffect(() => {
    if (!hydrated) return;
    const ctx = useStore.getState().options.context;
    if (!ctx?.region) setOptions({ context: { ...(ctx ?? {}), region } });
  }, [hydrated, region, setOptions]);

  const aiHeaders = () => ({
    "content-type": "application/json",
    "x-ai-provider": settings.ai.provider,
    "x-ai-key": settings.ai.key,
    "x-ai-model": settings.ai.model,
    "x-ai-workspace": settings.ai.workspace ?? "",
  });
  const era: Era = (options.eras ?? ["golden"])[0] ?? "golden";
  const eraDefaults = ERA_SETTINGS[era] ?? ERA_SETTINGS.golden!;
  const togglePin = useCallback(
    (k: string) => {
      const pinned = useStore.getState().options.pinned ?? [];
      setOptions({ pinned: pinned.includes(k) ? pinned.filter((x) => x !== k) : [...pinned, k] });
    },
    [setOptions],
  );
  const setRules = useCallback(
    (patch: Partial<NightRules>) => {
      const write = () => {
        const o = useStore.getState().options;
        const d = ERA_SETTINGS[(o.eras ?? ["golden"])[0] ?? "golden"] ?? ERA_SETTINGS.golden!;
        setOptions({ rules: { ...d.rules, ...(o.rules ?? {}), ...patch } });
      };
      // a setting that conflicts with a tanda the DJ pinned in the night on screen (the last-4-tango setting would
      // skip it): the rule check asks first — keep the setting and move or skip the tanda, or do it as asked (the
      // tanda plays this night); the night on screen takes the setting with the choice
      const p = useStore.getState().playlist;
      if (p && patch.lastFourTango) {
        const after = { ...p, options: { ...p.options, rules: { ...(p.options.rules ?? {}), ...patch } } };
        if (hardViolations(checkEdit(p, after)).length) {
          void gateEdit({
            before: p,
            after,
            label: tx("composer.last_4_tandas_tango_only"),
            apply: (x, label) => {
              remember(p);
              setPlaylist(x);
              recordNightEdit(x, label, "swap");
            },
            learn: false,
          }).then((r) => {
            if (r !== "cancelled") write();
          });
          return;
        }
      }
      write();
    },
    [setOptions, setPlaylist, recordNightEdit, remember],
  );

  /** Era change: apply the era's defaults to every unpinned control, keep the rest, and say so. */
  const applyEra = useCallback(
    (next: Era, force = false) => {
      const o = useStore.getState().options;
      const pinned = o.pinned ?? [];
      const d = ERA_SETTINGS[next] ?? ERA_SETTINGS.golden!;
      const { notes, rules: eraRules, ...defaults } = d;
      const patch: Partial<AppOptions> = { eras: [next] };
      for (const k of ERA_KEYS) {
        if (!force && pinned.includes(k)) continue;
        (patch as Record<string, unknown>)[k] = (defaults as Record<string, unknown>)[k];
        if (k === "pattern") patch.customPattern = defaults.customPattern;
      }
      patch.rules = { ...(o.rules ?? {}), ...eraRules };
      // the era itself is the DJ's choice; the preset values are not explicit
      setOptions({ eras: [next] });
      const { eras: _e, ...preset } = patch;
      presetOptions(preset);
      setEraNote(tx("composer.era_defaults_applied", { notes }));
    },
    [setOptions, presetOptions],
  );

  /** What the DJ set tonight: touched or pinned controls (era presets and defaults are not explicit). */
  const explicit = explicitKeys(options);
  const learnedPrefs = settings.learn ? describePreferences(memory) : [];
  const prefKeys = [
    ...Object.keys(memory.preferences ?? {}),
    ...Object.keys(likedShapeDefaults(memory.learned)),
  ].filter((k) => !explicit.includes(k));
  const usingMemory = settings.learn && learnedPrefs.length > 0 && prefKeys.length > 0;
  /**
   * The request from the state at call time: only explicit keys travel, learned preferences fill the keys that are
   * neither explicit nor just changed by a chip / refine (`extraExplicit`), and `recent` always rides along.
   */
  const requestOptions = (o: AppOptions, extraExplicit: string[] = []) => {
    const cur = useStore.getState();
    const merged: AppOptions = {
      ...o,
      pinned: cur.options.pinned,
      touched: [...new Set([...(cur.options.touched ?? []), ...extraExplicit])],
    };
    const base = optionsForRequest(merged);
    const { recent } = applyMemory({}, cur.memory);
    const withMemory = cur.settings.learn
      ? applyMemory(base, cur.memory)
      : { ...base, recent, learned: base.learned ?? learnedForRequest(cur.memory, false) };
    const name = base.name ?? autoSetName({ ...DEFAULT_OPTS, ...eraDefaults, ...fullOptions(merged) });
    // 2026-11: the dancer favourites (Database → Memory), decayed to now; switched off they travel as `off`
    const favourites = requestFavourites(cur.memory);
    return { ...withMemory, name, explicit: base.explicit, ...(favourites ? { favourites } : {}) };
  };

  /** Compose with the current (or given) options; locked tandas are sent so they survive every recompose. */
  const run = async (
    seed?: number,
    opts?: Partial<ComposeOptions>,
    extraExplicit: string[] = [],
    source: HistorySnapshot["source"] = "compose",
    /** an edit's label in History ("Calmer", the DJ's words); a compose is a new entry */
    editLabel?: string,
  ) => {
    setBusy(true);
    setAi(null);
    setError(null);
    const o = requestOptions(opts ?? useStore.getState().options, extraExplicit);
    const live = useStore.getState().playlist;
    const first = !live;
    // wave 2: a compose can be cancelled (the progress panel's Cancel); its time teaches the next estimate
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setComposing(true);
    const t0 = Date.now();
    try {
      const slow = testSlowdownMs();
      if (slow) await new Promise((res) => setTimeout(res, slow));
      if (ctl.signal.aborted) throw new DOMException("cancelled", "AbortError");
      const r = await fetch("/api/compose", {
        method: "POST",
        signal: ctl.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...o,
          seed: seed ?? Math.floor(Math.random() * 1e9),
          locked: live?.tandas.filter((t) => t.locked) ?? [],
          overrides: overridesForRequest(overrides),
          autoImprove: useStore.getState().settings.autoImprove !== false,
          // 2026-11: Settings → Cortinas → "Start cortinas at the chorus"
          cortinaHookStart: useStore.getState().settings.cortinaHookStart !== false,
        }),
      });
      const { autoImproved, ...p } = (await r.json()) as Playlist & {
        error?: string;
        autoImproved?: AutoImproved;
      };
      if (r.ok) rememberComposeMs(Date.now() - t0 - slow);
      if (!r.ok || p.error) {
        setError(p.error ?? tx("composer.could_not_compose_this_set"));
        setErrorKey((k) => k + 1);
        haptic([20, 30, 20]);
        return;
      }
      remember(live);
      const morph = !!opts && !!live && p.tandas.length === live.tandas.length;
      if (!morph) REVEAL.set(p, `${p.options.seed}-${p.id}`);
      setPlaylist(p);
      setActive(null);
      setSetupOpen(false);
      updateMemory((m) => rememberSet(m, p));
      // wave 2: Compose is a new night in History; a chip or "Tell the DJ" is a version of the current one
      if (source === "compose")
        addSnapshot(makeSnapshot(p, fullOptions(useStore.getState().options), source));
      else recordNightEdit(p, editLabel ?? "Adjusted", source);
      const improvedLine = autoImproveLine(autoImproved);
      if (morph && live) {
        const changed = changedTandas(live, p);
        setChangeSummary(
          `${changed.length ? `${changed.length} ${changed.length === 1 ? "tanda" : "tandas"} replaced (${changed.slice(0, 8).join(", ")}${changed.length > 8 ? "…" : ""})` : tx("composer.no_tanda_changed")} · score ${live.score.total} → ${p.score.total}${improvedLine ? ` · ${improvedLine}` : ""}`,
        );
        setChangedSet(new Set(changed));
      } else {
        // a recompose that changed the night's length (another cycle, other hours) still says how the score moved
        setChangeSummary(
          live
            ? tx("composer.new_set_of_tandas_score", {
                length: p.tandas.length,
                total: live.score.total,
                total1: p.score.total,
                p1: improvedLine ? ` · ${improvedLine}` : "",
              })
            : improvedLine,
        );
        setChangedSet(new Set());
      }
      haptic([8, 40, 8]);
      // the result scrolls into view on the first set only; on a recompose the user is already looking at it
      if (first)
        requestAnimationFrame(() =>
          document.getElementById("result")?.scrollIntoView({ behavior: "smooth", block: "start" }),
        );
    } catch {
      if (ctl.signal.aborted) {
        toast(tx("composer.compose_cancelled_the_night_on_screen"));
        return;
      }
      setError(tx("composer.could_not_reach_the_composer_try"));
      setErrorKey((k) => k + 1);
      haptic([20, 30, 20]);
    } finally {
      if (abortRef.current === ctl) {
        abortRef.current = null;
        setComposing(false);
      }
      setBusy(false);
    }
  };
  const cancelCompose = useCallback(() => abortRef.current?.abort(), []);
  /** A stable "compose now" for the memoised form (its button must not hand the click event to `run` as a seed). */
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });
  const composeNow = useCallback(() => {
    runRef.current();
  }, []);
  /**
   * 2026-11 (the owner: "the swap button on a tanda directly swaps"): Swap tanda opens the tanda Swap sheet
   * (components/TandaSwapSheet.tsx) — the engine's whole tandas, or the DJ's own built from the smart search and
   * reordered — and nothing changes until Apply, through the rule check and the undo history.
   */
  const [tandaAt, setTandaAt] = useState<number | null>(null);
  const swap = useCallback((i: number) => {
    if (!useStore.getState().playlist) return;
    setTandaAt(i);
  }, []);
  const applyTanda = useCallback(
    (x: Playlist, label: string) => {
      remember(useStore.getState().playlist);
      setPlaylist(x);
      recordNightEdit(x, label, "swap");
    },
    [setPlaylist, recordNightEdit, remember],
  );
  /**
   * 2026-11 (the owner: "songs and tandas insertable or removable in each tanda and before / after tandas"): a side
   * at a place, a tanda before / after another (the Insert sheet: suggestions for the spot, the smart search, Ask my
   * AI), a side or a tanda out — each through the rule check and the undo history, then the guide.
   */
  const insertSongAt = useCallback(
    (i: number, at: number) => {
      const p = useStore.getState().playlist;
      if (p) openInsert({ spot: { kind: "song", tanda: i, at }, playlist: p, apply: applyTanda });
    },
    [applyTanda],
  );
  const insertTandaAt = useCallback(
    (at: number) => {
      const p = useStore.getState().playlist;
      if (p) openInsert({ spot: { kind: "tanda", at }, playlist: p, apply: applyTanda });
    },
    [applyTanda],
  );
  const removeSongFrom = useCallback(
    (i: number, k: number) => {
      const p = useStore.getState().playlist;
      if (p) void removeSongAt(p, i, k, applyTanda);
    },
    [applyTanda],
  );
  const removeTandaFrom = useCallback(
    (i: number) => {
      const p = useStore.getState().playlist;
      if (p) void removeTandaAt(p, i, applyTanda);
    },
    [applyTanda],
  );
  // round 21: a side's swap opens its Swap sheet (suggestions that keep the tanda valid, search, AI pick)
  const [swapAt, setSwapAt] = useState<{ i: number; k: number } | null>(null);
  // round 22: the song search side panel (a column on wide screens, a sheet on phones)
  const [findOpen, setFindOpen] = useState(false);
  const swapTrack = useCallback((i: number, k: number) => {
    setNote(null);
    setSwapAt({ i, k });
  }, []);
  const swapApplied = useCallback(
    (p: Playlist, label?: string) => {
      const prev = useStore.getState().playlist;
      if (prev) remember(prev);
      setPlaylist(p);
      recordNightEdit(p, label ?? tx("composer.changed_a_song"), "swap");
    },
    [setPlaylist, recordNightEdit, remember],
  );
  /**
   * 2026-11 ("order in each tanda should be changeable in all tabs"): song `from` of tanda `i` moves to `to` — the
   * tanda re-timed, the night re-scored, through the rule check (the order rules are soft: it applies with Undo and
   * "See suggestion"), learned from as a swap is, and saved to History.
   */
  const moveTrack = useCallback(
    async (i: number, from: number, to: number) => {
      const prev = useStore.getState().playlist;
      if (!prev) return;
      const next = moveSongInNight(prev, i, from, to);
      if (next === prev) return;
      haptic(6);
      const label = tx("play.moved_song", {
        title: prev.tandas[i]?.songs[from]?.title ?? "",
        p1: to + 1,
        p2: i + 1,
      });
      const res = await gateEdit({
        before: prev,
        after: next,
        label,
        apply: (x, l) => {
          remember(useStore.getState().playlist);
          setPlaylist(x);
          recordNightEdit(x, l, "swap");
        },
      });
      if (res !== "applied") return;
      // the toast's Undo is the one undo history (⌘Z walks the same)
      toast(label, () => void undoEdit());
    },
    [setPlaylist, recordNightEdit, remember],
  );
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lock = useCallback(
    (i: number) => {
      const playlist = useStore.getState().playlist;
      if (!playlist) return;
      setLockedCard(i);
      if (lockTimer.current) clearTimeout(lockTimer.current);
      lockTimer.current = setTimeout(() => setLockedCard(null), 700);
      const next = {
        ...playlist,
        tandas: playlist.tandas.map((t, k) => (k === i ? { ...t, locked: !t.locked } : t)),
      };
      setPlaylist(next);
      recordSnapshot(
        next.tandas[i]?.locked
          ? tx("editKeys.locked", { p1: i + 1 })
          : tx("editKeys.unlocked", { p1: i + 1 }),
        playlist,
        next,
        setPlaylist,
      );
    },
    [setPlaylist],
  );
  // round 21: "Skip tonight" — the player passes over the tanda; it stays in the night and its exports
  const bypass = useCallback(
    (i: number) => {
      const playlist = useStore.getState().playlist;
      if (!playlist) return;
      const on = !playlist.tandas[i]?.bypass;
      const next = {
        ...playlist,
        tandas: playlist.tandas.map((t, k) => (k === i ? { ...t, bypass: on || undefined } : t)),
      };
      setPlaylist(next);
      recordSnapshot(tx("editKeys.skip_toggled", { p1: i + 1 }), playlist, next, setPlaylist);
      toast(
        on
          ? tx("composer.tanda_is_skipped_tonight_it_stays", { p1: i + 1 })
          : tx("composer.tanda_plays_tonight", { p1: i + 1 }),
      );
    },
    [setPlaylist],
  );
  const lockAll = useCallback(() => {
    const playlist = useStore.getState().playlist;
    if (!playlist) return;
    const all = playlist.tandas.every((t) => t.locked);
    const next = { ...playlist, tandas: playlist.tandas.map((t) => ({ ...t, locked: !all })) };
    setPlaylist(next);
    recordSnapshot(tx("editKeys.lock_all"), playlist, next, setPlaylist);
    toast(all ? tx("composer.all_tandas_unlocked") : tx("composer.all_tandas_locked_regenerate_keeps_every"));
  }, [setPlaylist]);
  /** Clear the set (undo for a few seconds via the toast); the form unfolds again. */
  const clearSet = useCallback(() => {
    const prev = useStore.getState().playlist;
    if (!prev) return;
    setPlaylist(null);
    setChangeSummary(null);
    setChangedSet(new Set());
    recordSnapshot(tx("composer.set_cleared"), prev as Playlist | null, null, setPlaylist);
    toast(tx("composer.set_cleared"), () => void undoEdit());
  }, [setPlaylist]);
  /** A chip never leaves a custom cycle empty, and every structural change it makes is said out loud. */
  const settleOptions = (prev: Partial<ComposeOptions>, next: Partial<ComposeOptions>) => {
    const out = { ...next };
    if (out.pattern === "custom" && !out.customPattern) out.customPattern = prev.customPattern || "TTVTTM";
    return out;
  };
  const feedback = async (f: Feedback) => {
    setNote(null);
    setPendingChip(f);
    setBusy(true);
    try {
      const prev = fullOptions({ ...DEFAULT_OPTS, ...eraDefaults, ...useStore.getState().options });
      const r = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ options: prev, feedback: [f] }),
      });
      const j = (await r.json()) as { options: Partial<ComposeOptions> };
      if (!r.ok) return;
      if (settings.learn && playlist) updateMemory((m) => rememberFeedback(m, playlist.id, [f]));
      const next = settleOptions(prev, j.options);
      const changes = describeOptionChanges(prev, next);
      const chipLabel = FEEDBACK_CHIPS.find(([k]) => k === f)?.[1] ?? f;
      const line = changes.length
        ? `${chipLabel}: ${changes.join(" · ")}`
        : tx("composer.nothing_to_change_in_the_settings", { chipLabel });
      setNote(line);
      toast(line);
      const changed = changedKeys(prev, next);
      replaceOptions(next, changed);
      await run(undefined, next, changed, "refine", chipLabel);
    } finally {
      setPendingChip(null);
      setBusy(false);
    }
  };
  const refine = async (instruction: string) => {
    setNote(null);
    setBusy(true);
    try {
      const prev = fullOptions({ ...DEFAULT_OPTS, ...eraDefaults, ...useStore.getState().options });
      const r = await fetch("/api/ai/refine", {
        method: "POST",
        headers: aiHeaders(),
        body: JSON.stringify({
          options: prev,
          playlist,
          instruction,
          memory,
          houseRules: overrides.guide?.houseRules ?? "",
        }),
      });
      const j = (await r.json()) as {
        options?: Partial<ComposeOptions>;
        feedback?: Feedback[];
        note?: string;
        error?: string;
        source?: string;
        applied?: string[];
        notApplied?: string[];
      };
      if (!r.ok || !j.options) {
        setNote(j.error ?? tx("composer.could_not_read_that_request"));
        return;
      }
      const next = settleOptions(prev, j.options);
      const changes = describeOptionChanges(prev, next);
      // what the refine understood (applied) and what it did not, from the route's guard; the lists are shown
      // only when the note does not already carry them
      const noteSaysIt = /Applied:|Not applied:|Nothing to apply/.test(j.note ?? "");
      setNote(
        [
          j.source === "model" ? null : tx("composer.parsed_by_rules"),
          j.note,
          !noteSaysIt && j.applied?.length ? tx("composer.applied", { list: j.applied.join(", ") }) : null,
          !noteSaysIt && j.notApplied?.length
            ? tx("composer.not_applied", { list: j.notApplied.join("; ") })
            : null,
          changes.length ? tx("composer.changed_list", { list: changes.join(" · ") }) : null,
        ]
          .filter(Boolean)
          .join(" "),
      );
      if (settings.learn && playlist)
        updateMemory((m) => {
          let nm = rememberFeedback(m, playlist.id, j.feedback ?? [], instruction);
          if (j.source === "model" && j.note) nm = addNote(nm, j.note, "assistant");
          return nm;
        });
      const changed = changedKeys(prev, next);
      replaceOptions(next, changed);
      await run(undefined, next, changed, "refine", `“${clipWords(instruction, 48)}”`);
    } finally {
      setBusy(false);
    }
  };
  const explain = async () => {
    if (!playlist) return;
    setReviewOpen(true);
    if (ai || aiBusy) return;
    setAiBusy(true);
    try {
      const r = await fetch("/api/ai/review", {
        method: "POST",
        headers: aiHeaders(),
        body: JSON.stringify({ playlist, memory, houseRules: overrides.guide?.houseRules ?? "" }),
      });
      const j = await r.json();
      setAi(j.text ?? j.error);
      setAiError(!r.ok);
    } finally {
      setAiBusy(false);
    }
  };
  const copySeed = async () => {
    if (!playlist) return;
    try {
      await navigator.clipboard.writeText(String(playlist.options.seed));
      setNote(tx("composer.seed_copied", { seed: playlist.options.seed }));
    } catch {
      setNote(tx("composer.seed", { seed: playlist.options.seed }));
    }
  };
  /**
   * Thumbs up / down: tapping the pressed thumb again takes the rating back. With learning on, the night's tandas
   * and shape feed the learned preferences (Database → Memory, "from nights you liked"); with it off the rating is
   * only recorded. The toast says which, and its Undo restores exactly the rating before the tap.
   */
  const rate = (tapped: boolean) => {
    if (!playlist) return;
    haptic(6);
    const learn = useStore.getState().settings.learn;
    const r = rateTap(useStore.getState().memory, playlist, tapped, learn);
    updateMemory(() => r.memory);
    toast(tx(r.message), () => updateMemory((m) => undoRate(m, playlist, r.previous, learn)));
  };
  const liked = ratingOf(memory, playlist?.id);

  // ⌘↩ composes, ⌘E exports, ⌘K focuses Tell the DJ (opens the Adjust sheet on phones)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "Enter" && !busy) {
        e.preventDefault();
        run();
      }
      if ((e.key === "e" || e.key === "E") && playlist) {
        e.preventDefault();
        openExport();
      }
      if ((e.key === "k" || e.key === "K") && playlist) {
        e.preventDefault();
        if (wide) {
          const el = document.getElementById("tell-dj");
          el?.scrollIntoView({ behavior: "smooth", block: "center" });
          el?.focus({ preventScroll: true });
        } else setAdjustOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const hours = options.hours ?? 4;
  // (the chrome follows the live set: the deferred one only gates the result section, so the hero and the form never
  // flash while the set mounts in its second pass)
  const hasPlaylist = hydrated && !!mods && !!livePlaylist;
  const chosenContext = Object.entries(options.context ?? {}).filter(
    ([k, v]) => !!v && k !== "region",
  ).length;
  const cortinaStyle = options.cortinaStyle ?? "family";
  const lockedCount = playlist?.tandas.filter((t) => t.locked).length ?? 0;
  const playlists = meta?.referencePlaylists ?? NO_PLAYLISTS;
  const dbChanges = overridesReady && Object.keys(overrides).some((k) => k !== "updatedAt");
  const scoreFrom = fresh ? 0 : (prevScore.current ?? playlist?.score.total ?? 0);
  const errorNudge = useMemo(
    () => (errorKey && !reduced ? { x: [0, -4, 4, -2, 0] } : { x: 0 }),
    [errorKey, reduced],
  );
  const onPick = useCallback((i: number) => {
    setActive(i);
    document.getElementById(`tanda-${i + 1}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);
  const breakAfter = new Map((playlist?.breaks ?? []).map((b) => [b.afterTanda, b]));
  // 2026-11: a tap on any row plays from the night in order (the mini player steps through it)
  const nightList = useMemo(
    () => (playlist ? { label: nightTitle(playlist), items: nightItems(playlist) } : null),
    [playlist],
  );
  const resultFooter = playlist
    ? [
        fmtDuration(nightMusicSec(playlist, useStore.getState().settings) ?? playlist.stats.durationSec),
        tx("composer.footer_tandas", { n: playlist.tandas.length }),
        tx("composer.footer_orchestras", { n: Object.keys(playlist.stats.orchestras).length }),
        tx("composer.footer_cortinas", {
          style: lower(
            CORTINA_STYLES.find(([k]) => k === (playlist.options.cortinaStyle ?? "family"))?.[1] ??
              tx("composer.family"),
          ),
        }),
        lockedCount ? plural("plural.locked_stay", lockedCount) : null,
        dbChanges ? tx("composer.footer_db_edits") : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  // round 15: a setting the night could not keep says so, and what played instead (wave 2: in the DJ's words)
  const nightNotes = playlist
    ? djMessages([
        ...(playlist.stats.cortinaFallback ? [playlist.stats.cortinaFallback] : []),
        ...(playlist.stats.settingFallbacks ?? []),
      ])
    : [];

  /**
   * The toolbar's one tinted capsule is Compose until a set exists, then Export: a second Compose would silently
   * replace the set the DJ is reading, so Regenerate becomes the ghost capsule next to it, as the phone bar does
   * (round8-ux.md §1.2). ⌘↩ stays on Regenerate (the same action), ⌘E on Export.
   */
  const composeButton = (
    <Tip
      text={
        hasPlaylist ? tx("composer.compose_again_with_the_same_settings") : tx("composer.compose_the_night_2")
      }
    >
      <motion.button
        type="button"
        onClick={() => run()}
        disabled={busy}
        className={`btn ${hasPlaylist ? "btn-ghost" : "btn-primary"} min-h-[44px] lg:min-h-[40px] lg:px-4 lg:text-subhead`}
        animate={errorNudge}
        transition={{ duration: 0.28, ease: EASE.inOut }}
        data-testid={hasPlaylist ? "toolbar-regenerate" : "toolbar-compose"}
      >
        <ComposeLabel
          busy={busy}
          steps={!!playlist}
          idle={hasPlaylist ? tx("composer.regenerate") : tx("primaryBar.compose_the_night")}
          spin={false}
        />
      </motion.button>
    </Tip>
  );
  // icon-only twin of the capsule for the tablet pill when the full label would overflow it
  const composeCompact = (
    <Tip text={hasPlaylist ? tx("composer.regenerate_2") : tx("composer.compose_the_night_2")}>
      <button
        type="button"
        onClick={() => run()}
        disabled={busy}
        className={`btn ${hasPlaylist ? "btn-ghost" : "btn-primary"} h-11 min-h-[44px] w-11 px-0`}
        aria-label={hasPlaylist ? tx("composer.regenerate") : tx("composer.compose_the_night")}
      >
        {busy ? (
          <LoaderCircle size={18} className="animate-spin" aria-hidden />
        ) : hasPlaylist ? (
          <Repeat2 size={18} aria-hidden />
        ) : (
          <Disc3 size={18} aria-hidden />
        )}
      </button>
    </Tip>
  );
  const exportButton = (
    <Tip text={tx("composer.export_the_night_to_your_dj")}>
      <button
        type="button"
        onClick={openExport}
        className="btn btn-primary min-h-[44px] lg:min-h-[40px] lg:px-4 lg:text-subhead"
        data-testid="toolbar-export"
      >
        <Share size={18} strokeWidth={2} aria-hidden /> {tx("composer.export")}
      </button>
    </Tip>
  );
  const exportCompact = (
    <Tip text={tx("composer.export_e")}>
      <button
        type="button"
        onClick={openExport}
        className="btn btn-primary h-11 min-h-[44px] w-11 px-0"
        aria-label={tx("composer.export")}
      >
        <Share size={18} strokeWidth={2} aria-hidden />
      </button>
    </Tip>
  );
  const feedbackBar = (
    <FeedbackBar
      onFeedback={feedback}
      onRefine={refine}
      busy={busy}
      note={note}
      pending={pendingChip}
      lockedCount={lockedCount}
      changeSummary={changeSummary}
      bare={!wide}
    />
  );

  return (
    <div>
      <PageHeader
        title={tx("composer.compose")}
        trailing={
          <>
            {/* (the open set-up form has its own Compose in the dock: Regenerate steps aside, one at a time) */}
            {hasPlaylist && wide && !setupOpen && (lg ? composeButton : composeCompact)}
            {/* wave 4, phones: the page's actions are navigation-bar icon buttons, iOS 26 style (Regenerate, the
                share glyph for Export, •••); nothing floats over the set */}
            {hasPlaylist && !wide && playlist && (
              <span className="-mr-1 flex items-center" data-testid="nav-actions">
                <motion.button
                  type="button"
                  onClick={() => run()}
                  disabled={busy}
                  className="icon-btn nav-btn text-[var(--tint)]"
                  aria-label={tx("composer.regenerate")}
                  animate={errorNudge}
                  transition={{ duration: 0.28, ease: EASE.inOut }}
                  data-testid="bar-regenerate"
                >
                  {busy ? (
                    <LoaderCircle size={20} strokeWidth={2} className="animate-spin" aria-hidden />
                  ) : (
                    <Repeat2 size={20} strokeWidth={2} aria-hidden />
                  )}
                </motion.button>
                <button
                  type="button"
                  onClick={openExport}
                  className="icon-btn nav-btn text-[var(--tint)]"
                  aria-label={tx("composer.export")}
                  data-testid="bar-export"
                >
                  <Share size={20} strokeWidth={2} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setActionsOpen(true)}
                  className="icon-btn nav-btn text-[var(--tint)]"
                  aria-label={tx("primaryBar.set_actions")}
                  aria-haspopup="dialog"
                  data-testid="bar-more"
                >
                  <Ellipsis size={20} strokeWidth={2} aria-hidden />
                </button>
              </span>
            )}
            {hasPlaylist && wide && playlist && (
              <Menu
                label={tx("composer.more")}
                items={[
                  {
                    label: tx("composer.recompose_with_same_seed"),
                    icon: Repeat2,
                    onClick: () => run(playlist.options.seed),
                    disabled: busy,
                  },
                  { label: tx("composer.copy_seed"), icon: Copy, onClick: copySeed },
                  { label: tx("composer.written_review"), icon: MessageSquareText, onClick: explain },
                  { label: tx("composer.play_the_night"), icon: Play, onClick: () => router.push("/booth") },
                  // 2026-11: Import a playlist (app/import)
                  { label: tx("import.entry"), icon: ListPlus, onClick: () => router.push("/import") },
                  {
                    label: tx("composer.tell_the_dj"),
                    icon: SlidersHorizontal,
                    shortcut: "⌘K",
                    onClick: () => {
                      const el = document.getElementById("tell-dj");
                      el?.scrollIntoView({ behavior: "smooth", block: "center" });
                      el?.focus({ preventScroll: true });
                    },
                  },
                  // 2026-11: the one undo history (⌘Z / ⇧⌘Z anywhere outside a text field)
                  { label: tx("editKeys.undo"), icon: Undo2, shortcut: "⌘Z", onClick: () => void undoEdit() },
                  {
                    label: tx("editKeys.redo"),
                    icon: Redo2,
                    shortcut: "⇧⌘Z",
                    onClick: () => void redoEdit(),
                  },
                  { label: tx("composer.clear_set"), icon: Eraser, onClick: clearSet, destructive: true },
                ]}
              />
            )}
          </>
        }
        // wave 2: no Compose in the bar on the empty page (the hero has it, then the form's dock): one at a time
        primary={hasPlaylist ? exportButton : undefined}
        primaryCompact={hasPlaylist ? exportCompact : undefined}
      />

      {/* first run: what one tap produces, before the 38 controls (round8-ux.md §3); the same action as the bar */}
      {hydrated && !livePlaylist && (
        <section
          className="group-inset mt-2 mb-2 p-5"
          aria-labelledby="first-run-title"
          data-testid="first-run"
        >
          <h2 id="first-run-title" className="text-title2 font-serif">
            {tx("composer.a_night_composed")}
          </h2>
          <p className="text-subhead mt-1 text-[var(--label-2)]">
            {tx("composer.hours_of_tandas_with_cortinas_scored", { hours, p1: nightEraLabel({ options }) })}
          </p>
          <ol className="mt-4 grid gap-2 sm:grid-cols-3">
            {(
              [
                [tx("composer.step_compose"), tx("composer.step_compose_sub")],
                [tx("composer.step_read"), tx("composer.step_read_sub")],
                [tx("composer.play_or_send"), tx("composer.step_play_sub")],
              ] as const
            ).map(([h, d], i) => (
              <li key={h} className="flex items-start gap-3">
                <span className="tile-art shrink-0" data-rhythm="tango" aria-hidden>
                  <span className="text-headline tabular-nums">{i + 1}</span>
                </span>
                <span className="min-w-0">
                  <span className="text-headline block">{h}</span>
                  <span className="text-footnote block text-[var(--label-2)]">{d}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-5 hidden flex-wrap items-center gap-3 sm:flex">
            <Tip text={tx("composer.compose_a_whole_night_now_with")}>
              <button
                type="button"
                ref={heroRef}
                className="btn btn-primary min-h-[50px]"
                onClick={() => run()}
                disabled={busy}
                data-testid="hero-compose"
              >
                <ComposeLabel busy={busy} spin={false} />
              </button>
            </Tip>
            <span className="text-footnote text-[var(--label-2)]">
              A {hours} h {options.context?.event ?? tx("composer.milonga")}
              {tx("composer.or_set_up_the_night_below")}
            </span>
          </div>
          {/* a built-in night to read before composing one */}
          <Tip text={tx("composer.open_a_night_a_dj_built")} className="mt-4 w-full">
            <button
              type="button"
              className="cell cell-tap group-inset w-full text-left"
              data-leading="tile"
              onClick={() => openFeatured(FEATURED[0].id)}
              disabled={busy}
              data-testid="featured-card"
            >
              <span className="tile" style={{ background: "var(--system-gold)" }} aria-hidden>
                <Star size={16} strokeWidth={2} fill="currentColor" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{FEATURED[0].title}</span>
                <span className="text-footnote block truncate text-[var(--label-2)]">{FEATURED[0].sub}</span>
              </span>
              <span className="cell-value text-body">{tx("featuredCard.open")}</span>
            </button>
          </Tip>
          {/* round 22 AI / round 23: picking every tanda yourself, with suggestions, is one tap from the first run */}
          <Tip text={tx("composer.start_from_an_empty_night_and")} className="mt-2 w-full">
            <Link
              href="/build"
              className="cell cell-tap group-inset w-full text-left"
              data-leading="tile"
              data-testid="first-run-build"
            >
              <span className="tile" style={{ background: "var(--tint)" }} aria-hidden>
                <Hand size={16} strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{tx("composer.build_by_hand")}</span>
                <span className="text-footnote block truncate text-[var(--label-2)]">
                  {tx("composer.pick_every_tanda_yourself_with_suggestions")}
                </span>
              </span>
              <ChevronRight size={16} strokeWidth={2.5} className="cell-chevron" aria-hidden />
            </Link>
          </Tip>
          {/* 2026-11: a Spotify / YouTube playlist, a DJ app's file or a list, played or edited as a night */}
          <Tip text={tx("import.subtitle")} className="mt-2 w-full">
            <Link
              href="/import"
              className="cell cell-tap group-inset w-full text-left"
              data-leading="tile"
              data-testid="first-run-import"
            >
              <span className="tile" style={{ background: "#ff9500" }} aria-hidden>
                <ListPlus size={16} strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{tx("import.entry")}</span>
                <span className="text-footnote block truncate text-[var(--label-2)]">
                  {tx("import.entry_sub")}
                </span>
              </span>
              <ChevronRight size={16} strokeWidth={2.5} className="cell-chevron" aria-hidden />
            </Link>
          </Tip>
        </section>
      )}

      {hasPlaylist && playlist && mods && (
        <PlayListContext.Provider value={nightList}>
          <section id="result" className="result-layout scroll-mt-24" aria-busy={busy}>
            <div
              className="result-main min-w-0"
              onClickCapture={(e) => {
                // the inspector follows the tanda the DJ touches (wide screens)
                const card = (e.target as HTMLElement).closest<HTMLElement>('[id^="tanda-"]');
                const n = card ? Number(card.id.slice(6)) : Number.NaN;
                if (n >= 1) setInspected(n - 1);
              }}
            >
              <Group
                header={tx("composer.tonight_s_set")}
                footer={
                  nightNotes.length ? (
                    <>
                      {resultFooter}
                      <span className="mt-1 block" data-testid="night-notes">
                        {nightNotes.join(" ")}
                      </span>
                    </>
                  ) : (
                    resultFooter
                  )
                }
              >
                <motion.div
                  key={`head-${setKey}`}
                  initial={fresh ? { opacity: 0, y: reduced ? 0 : 6 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: DUR.base, ease: EASE.out, delay: 0.04 }}
                  className="cell flex-col items-stretch gap-2 py-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    {/* 2026-11 (the owner: "the image art should be dynamically changed too"): the night's cover,
                        drawn from the night as it is now — every edit redraws it, and the exported playlists get it */}
                    <NightCover
                      night={playlist}
                      size={56}
                      className="rounded-[10px]"
                      testId="compose-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <h2 className="text-subhead min-w-0 line-clamp-2 font-serif text-[var(--label-2)]">
                        {nightTitle(playlist)} · {nightSub(playlist)}
                      </h2>
                      {/* 2026-11: the night as it plays (cues, cortinas from their start), ≈ when a length is unknown */}
                      <NightLength playlist={playlist} className="block truncate" />
                    </span>
                    <span className="flex items-center gap-1">
                      {/* phones: icon-only, 44 pt (the label wrapped to three lines, round8-ux.md §1.4) */}
                      <Tip text={tx("composer.open_the_booth_and_play_this")}>
                        <button
                          type="button"
                          className="btn btn-ghost -my-2 min-h-11 shrink-0 whitespace-nowrap px-3 max-sm:h-11 max-sm:w-11 max-sm:px-0"
                          data-testid="play-the-night"
                          aria-label={tx("composer.booth_play_the_night")}
                          onClick={() => router.push("/booth")}
                        >
                          <Play size={16} fill="currentColor" strokeWidth={0} aria-hidden />
                          <span className="max-sm:sr-only">{tx("composer.play_the_night")}</span>
                        </button>
                      </Tip>
                      <Tip
                        text={tx(
                          settings.learn ? "composer.i_like_this_night_t_dj" : "composer.like_help_off",
                        )}
                      >
                        <button
                          type="button"
                          className={`icon-btn icon-btn-bare -my-2 h-11 w-11 ${liked === true ? "text-[var(--tint)]" : "text-[var(--label-3)]"}`}
                          aria-pressed={liked === true}
                          aria-label={tx("composer.mark_as_liked")}
                          onClick={() => rate(true)}
                        >
                          <ThumbsUp
                            size={18}
                            strokeWidth={2}
                            fill={liked === true ? "currentColor" : "none"}
                          />
                        </button>
                      </Tip>
                      <Tip
                        text={tx(
                          settings.learn ? "composer.not_for_me_t_dj_learns" : "composer.like_help_off",
                        )}
                      >
                        <button
                          type="button"
                          className={`icon-btn icon-btn-bare -my-2 -mr-3 h-11 w-11 ${liked === false ? "text-[var(--tint)]" : "text-[var(--label-3)]"}`}
                          aria-pressed={liked === false}
                          aria-label={tx("composer.mark_as_disliked")}
                          onClick={() => rate(false)}
                        >
                          <ThumbsDown
                            size={18}
                            strokeWidth={2}
                            fill={liked === false ? "currentColor" : "none"}
                          />
                        </button>
                      </Tip>
                    </span>
                  </div>
                  {wide ? (
                    <div className="flex items-baseline gap-1">
                      <span className="score-stat tabular-nums text-[var(--tint)]" data-testid="score-value">
                        <ScoreCounter key={setKey} value={playlist.score.total} from={scoreFrom} />
                      </span>
                      <span className="text-subhead text-[var(--label-2)]">/100</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="-mx-2 flex items-baseline gap-1 rounded-[var(--radius-xs)] px-2 text-left"
                      onClick={() => setAdjustOpen(true)}
                      aria-label={tx("composer.score_of_100_adjust_the_set", { total: playlist.score.total })}
                      data-testid="score-button"
                    >
                      <span className="score-stat tabular-nums text-[var(--tint)]" data-testid="score-value">
                        <ScoreCounter key={setKey} value={playlist.score.total} from={scoreFrom} />
                      </span>
                      <span className="text-subhead text-[var(--label-2)]">/100</span>
                      <SlidersHorizontal
                        size={16}
                        strokeWidth={2}
                        className="ml-1 self-center text-[var(--label-3)]"
                        aria-hidden
                      />
                    </button>
                  )}
                  <motion.p
                    key={`verdict-text-${setKey}`}
                    initial={fresh ? { opacity: 0 } : false}
                    animate={{ opacity: 1 }}
                    transition={{ delay: reduced ? 0 : 0.7, duration: DUR.base }}
                    className="text-footnote text-[var(--label-2)]"
                  >
                    {verdictText(playlist.score.verdict)}
                    {playlist.options.arcShape && (
                      <span data-testid="arc-shape">
                        {" "}
                        ·{" "}
                        {playlist.options.arcShape === "double"
                          ? tx("composer.double")
                          : tx("composer.single")}{" "}
                        {tx("composer.peak_arc")}
                      </span>
                    )}
                  </motion.p>
                  {/* hard failures that capped the total (round-8 engine): said under the number, not hidden in a sheet */}
                  {playlist.score.reasons && playlist.score.reasons.length > 0 && (
                    <ul
                      className="text-footnote mt-1 list-disc pl-4 text-[var(--system-gold)]"
                      data-testid="score-reasons"
                    >
                      {playlist.score.reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-1">
                    {/* one chart per breakpoint (not both hidden/shown via CSS) so only one draw-on runs */}
                    {wide ? (
                      <mods.EnergyCurve
                        p={playlist}
                        active={active}
                        onPick={onPick}
                        playKey={setKey}
                        dimmed={busy}
                      />
                    ) : (
                      <mods.EnergyCurve
                        compact
                        p={playlist}
                        active={active}
                        onPick={onPick}
                        playKey={setKey}
                        dimmed={busy}
                      />
                    )}
                  </div>
                </motion.div>
                <Row
                  label={tx("composer.how_this_set_scored")}
                  tip={tx("composer.each_part_of_the_score_tandas")}
                  value={tx("composer.factors", { length: playlist.score.factors.length })}
                  chevron
                  onClick={() => setScoreOpen(true)}
                />
                {bench && (
                  <Row
                    label={tx("composer.compared_with_published_dj_sets_2")}
                    value={tx("composer.of_close", { inRange: bench.inRange, scored: bench.scored })}
                    aria-label={tx("composer.compared_with_published_dj_sets", { p1: benchLabel(bench) })}
                    tip={tx("composer.how_this_night_compares_with_sets")}
                    chevron
                    onClick={() => setBenchOpen(true)}
                    data-testid="benchmark-row"
                  />
                )}
                {playlists.some((p) => p.kind === "tandas") && (
                  <Row
                    label={tx("composer.mood_check")}
                    tip={tx("composer.compares_the_mood_of_each_tanda")}
                    sub={tx("composer.against_reference_tandas_aren_leon")}
                    chevron
                    onClick={() => setMoodOpen(true)}
                  />
                )}
                <Row
                  label={tx("composer.written_review")}
                  tip={tx("composer.a_few_paragraphs_on_the_night")}
                  value={
                    aiBusy
                      ? tx("composer.reading_the_set")
                      : ai || settings.ai.key || aiShared
                        ? tx("composer.ready")
                        : aiShared === false
                          ? tx("composer.off_needs_an_ai_key")
                          : undefined
                  }
                  chevron
                  busy={aiBusy}
                  onClick={explain}
                />
              </Group>

              {wide && feedbackBar}

              {playlist.opening && (
                <Group
                  header={tx("composer.opening")}
                  footer={tx("composer.la_cumparsita_before_the_first_tanda")}
                >
                  <PlayRow
                    song={playlist.opening}
                    where={tx("play.opening")}
                    testId="opening"
                    leading={
                      <Artwork entity={playlist.opening} orchestra={playlist.opening.orchestra} size={44} />
                    }
                    title={<span className="text-headline">{tx("composer.la_cumparsita")}</span>}
                    sub={metaLine(
                      playlist.opening.orchestra,
                      playlist.opening.singer,
                      yearText(playlist.opening.year),
                    )}
                    lengthSec={lengthOf(playlist.opening, playlist.booth?.songCues)}
                  />
                </Group>
              )}

              <h2 className="section-head">{tx("composer.tandas")}</h2>
              {/* round 22: the song search side panel */}
              <div className="-mt-10 mb-1 flex justify-end">
                <Tip text={tx("composer.search_every_recording_by_title_orchestra")}>
                  <button
                    type="button"
                    className="btn-plain mb-1 min-h-11"
                    onClick={() => setFindOpen(true)}
                    aria-expanded={findOpen}
                    data-testid="find-songs"
                  >
                    <Search size={16} strokeWidth={2} aria-hidden /> {tx("composer.find_songs")}
                  </button>
                </Tip>
              </div>
              {/* round 22: the night's energy song by song and a tone per tanda */}
              <NightProfile playlist={playlist} onPick={onPick} />
              {/* no AnimatePresence here: exiting cards stayed mounted across recomposes (round8-qa.md B1); a new set
              mounts fresh cards with new keys and the old ones leave at once */}
              <InsertGap
                label={tx("spot.insert_before_first")}
                onClick={() => insertTandaAt(0)}
                testId="insert-tanda-first"
              />
              <div className="tanda-grid">
                {playlist.tandas.flatMap((t, i) => {
                  const b = breakAfter.get(i);
                  const card = (
                    <mods.TandaCard
                      key={`${t.index}-${t.songs[0]?.id}`}
                      t={t}
                      i={i}
                      onSwap={swap}
                      onSwapTrack={swapTrack}
                      onLock={lock}
                      onBypass={bypass}
                      busy={swapping === i}
                      swappingTrack={swappingTrack?.[0] === i ? swappingTrack[1] : null}
                      active={active === i}
                      playlists={playlists}
                      settling={busy}
                      fresh={fresh}
                      nudge={nudge?.i === i ? nudge : null}
                      prevEnergy={prevEnergy.current[i]}
                      changed={changedSet.has(i + 1)}
                      animateLayout={swapping === i || lockedCard === i}
                      onMoveTrack={moveTrack}
                      cues={playlist.booth?.songCues}
                      onInsertSong={insertSongAt}
                      onRemoveSong={removeSongFrom}
                      onInsertTanda={insertTandaAt}
                      onRemoveTanda={removeTandaFrom}
                    />
                  );
                  if (!b) return [card];
                  return [
                    card,
                    <div
                      key={`break-${i}`}
                      className="text-footnote flex items-center gap-3 px-4 text-[var(--label-2)] md:col-span-2"
                      data-testid="break"
                    >
                      <span className="h-px flex-1 bg-[var(--separator)]" aria-hidden />

                      {tx("composer.min_2", { label: b.label, minutes: b.minutes })}
                      <span className="h-px flex-1 bg-[var(--separator)]" aria-hidden />
                    </div>,
                  ];
                })}
              </div>
              <InsertGap
                label={tx("spot.insert_after_last")}
                onClick={() => insertTandaAt(playlist.tandas.length)}
                testId="insert-tanda-last"
              />
              <AiEditBar playlist={playlist} onChip={feedback} />
              {/* the tandas the DJ kept as they are against a rule: accepted for this night only */}
              <NightExceptions nightId={playlist.id} />
              {playlist.closing && (
                <Group header={tx("composer.closing")} footer={closingFormatLine(playlist)}>
                  <PlayRow
                    song={playlist.closing}
                    where={tx("play.closing")}
                    testId="closing"
                    leading={
                      <Artwork entity={playlist.closing} orchestra={playlist.closing.orchestra} size={44} />
                    }
                    title={<span className="text-headline">{tx("composer.la_cumparsita")}</span>}
                    sub={metaLine(playlist.closing.orchestra, yearText(playlist.closing.year))}
                    lengthSec={lengthOf(playlist.closing, playlist.booth?.songCues)}
                  />
                </Group>
              )}
            </div>
            <TandaInspector
              playlist={playlist}
              selected={inspected}
              onSelect={setInspected}
              onMoveTrack={moveTrack}
              onInsertSong={insertSongAt}
              onRemoveSong={removeSongFrom}
              onInsertTanda={insertTandaAt}
              onRemoveTanda={removeTandaFrom}
            />
          </section>
        </PlayListContext.Provider>
      )}
      {/* once a set exists the result leads and the form folds into one summary row (UX review P1-1) */}
      {hasPlaylist && !setupOpen && (
        <Group header={tx("composer.set_up")} id="setup-summary">
          <Row
            tile={<RhythmTile rhythm="tango" />}
            label={`${nightEraLabel({ options })} · ${hours} h · ${ARCS.find(([k]) => k === (options.arc ?? "classic-two-peaks"))?.[1] ?? ""}`}
            sub={tx("composer.cortinas_2", {
              p1: PATTERNS.find(([k]) => k === (options.pattern ?? "classic"))?.[1] ?? "",
              p2: (CORTINA_STYLES.find(([k]) => k === cortinaStyle)?.[1] ?? "").toLowerCase(),
              p3: chosenContext ? ` ${tx("composer.tonight", { chosenContext })}` : "",
            })}
            value={wide ? undefined : tx("composer.edit")}
            chevron={!wide}
            onClick={wide ? undefined : () => setSetupOpen(true)}
          >
            {/* desktop: the trailing control is Regenerate, Edit stays a plain button (round5-design.md §1) */}
            {wide && (
              <span className="-my-2 -mr-2 inline-flex items-center gap-1">
                <Tip text={tx("composer.change_the_night_s_settings")}>
                  <button type="button" className="btn-plain" onClick={() => setSetupOpen(true)}>
                    {tx("composer.edit")}
                  </button>
                </Tip>
                <Tip text={tx("composer.compose_again_with_the_same_settings")}>
                  <button
                    type="button"
                    className="btn-plain font-semibold"
                    onClick={() => run()}
                    disabled={busy}
                    data-testid="summary-regenerate"
                  >
                    <Repeat2 size={16} strokeWidth={2} aria-hidden /> {tx("composer.regenerate")}
                  </button>
                </Tip>
              </span>
            )}
          </Row>
        </Group>
      )}
      <LazyHydrate>
        <SetupForm
          options={options}
          eraNote={eraNote}
          meta={meta}
          applied={playlist?.options ?? null}
          hidden={hasPlaylist && !setupOpen}
          setOptions={setOptions}
          setRules={setRules}
          applyEra={applyEra}
          togglePin={togglePin}
          onCompose={composeNow}
          busy={busy}
          dock={!(hydrated && !livePlaylist && wide && heroInView)}
        />
      </LazyHydrate>

      {(usingMemory || dbChanges) && (
        <p className="section-foot mt-3" data-testid="using-memory">
          {usingMemory && tx("composer.using_what_you_taught_me", { learnedPrefs: learnedPrefs.join(", ") })}
          {usingMemory && dbChanges ? " " : ""}
          {dbChanges && tx("composer.using_your_database_edits")}
        </p>
      )}

      <div
        role="status"
        aria-live="polite"
        className={error ? "section-foot mt-3 text-[var(--destructive)]" : "sr-only"}
        data-testid="compose-status"
      >
        <AnimatePresence mode="wait" initial={false}>
          {error && (
            <motion.span
              key={`${error}-${errorKey}`}
              variants={rise}
              initial="hidden"
              animate="show"
              className="block"
            >
              {error}
            </motion.span>
          )}
        </AnimatePresence>
        {!error &&
          (busy
            ? tx("composer.composing_the_night")
            : hasPlaylist && playlist
              ? tx("composer.set_ready_tandas", { length: playlist.tandas.length })
              : "")}
      </div>

      {/* wave 2: every compose says what it is doing, and can be cancelled */}
      <ComposeProgress busy={busy && composing} onCancel={cancelCompose} />
      {/* round 23: the gramophone is an easter egg under the page's foot (pull past the end) */}
      {hydrated && <Gramophone />}

      {/* Phone primary bar: Compose, then Regenerate + Export + ••• once a set exists; hides under sheets,
          minimises with the tab bar (round5-design.md §1) */}
      <PrimaryBar
        hasPlaylist={hasPlaylist}
        busy={busy}
        hidden={sheetOpen || playerOpen}
        onCompose={() => run()}
        errorNudge={errorNudge}
      />
      {!wide && playlist && (
        <Sheet
          open={actionsOpen}
          onClose={() => setActionsOpen(false)}
          title={tx("composer.set_actions")}
          detents={["medium", "large"]}
          testId="actions-sheet"
        >
          <MenuList
            items={[
              { label: tx("composer.play_the_night"), icon: Play, onClick: () => router.push("/booth") },
              { label: tx("import.entry"), icon: ListPlus, onClick: () => router.push("/import") },
              {
                label: tx("composer.tell_the_dj"),
                icon: MessageSquareText,
                onClick: () => setAdjustOpen(true),
              },
              {
                label: playlist.tandas.every((t) => t.locked)
                  ? tx("composer.unlock_all")
                  : tx("composer.lock_all"),
                icon: Lock,
                onClick: lockAll,
              },
              {
                label: tx("composer.recompose_with_same_seed"),
                icon: Repeat2,
                onClick: () => run(playlist.options.seed),
                disabled: busy,
              },
              { label: tx("composer.copy_seed"), icon: Copy, onClick: copySeed },
              { label: tx("composer.clear_set"), icon: Eraser, onClick: clearSet, destructive: true },
            ]}
            onPick={(it: MenuItem) => {
              haptic(4);
              setActionsOpen(false);
              it.onClick?.();
            }}
          />
        </Sheet>
      )}
      {!wide && playlist && (
        <Sheet
          open={adjustOpen}
          onClose={() => setAdjustOpen(false)}
          title={tx("composer.adjust")}
          trailing={tx("composer.done")}
          testId="adjust-sheet"
        >
          {feedbackBar}
        </Sheet>
      )}

      {exportMounted && <ExportSheet open={exportOpen} onClose={() => setExportOpen(false)} />}
      <SongSearchPanel
        open={findOpen && !!playlist}
        onClose={() => setFindOpen(false)}
        playlist={playlist}
        onChange={(p) => swapApplied(p)}
      />
      <TandaSwapSheet
        playlist={tandaAt !== null ? playlist : null}
        index={tandaAt}
        onClose={() => setTandaAt(null)}
        apply={applyTanda}
      />

      <SwapSheet
        playlist={swapAt ? playlist : null}
        tandaIndex={swapAt?.i ?? null}
        trackIndex={swapAt?.k ?? null}
        onClose={() => setSwapAt(null)}
        onApplied={(p, note) =>
          swapApplied(p, /undone|kept|unpinned/i.test(note) ? note : tx("composer.changed_a_song"))
        }
      />

      {playlist && (
        <Sheet
          open={scoreOpen}
          onClose={() => setScoreOpen(false)}
          title={tx("composer.how_this_set_scored")}
          trailing={tx("composer.done")}
        >
          <Group footer={tx("composer.each_bar_is_as_long_as")}>
            {playlist.score.reasons && playlist.score.reasons.length > 0 && (
              <div className="cell flex-col items-start gap-1 py-3">
                <span className="text-footnote font-semibold text-[var(--system-gold)]">
                  {tx("composer.capped_at_60")}
                </span>
                {playlist.score.reasons.map((r) => (
                  <span key={r} className="text-footnote text-[var(--label-2)]">
                    {r}
                  </span>
                ))}
              </div>
            )}
            {playlist.score.factors.map((f, idx) => (
              <div key={f.key} className="cell flex-col items-stretch gap-1.5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{f.label.replace(/\s*\(.*\)\s*$/, "")}</span>
                    {/\(.*\)/.test(f.label) && (
                      <span className="text-footnote block truncate text-[var(--label-2)]">
                        {f.label.match(/\((.*)\)/)?.[1]}
                      </span>
                    )}
                  </span>
                  <span className="cell-value tabular-nums">{Math.round(f.score * 100)} %</span>
                </div>
                <div
                  className="h-1 overflow-hidden rounded-full bg-[var(--fill-3)]"
                  style={{
                    width: `${Math.max(12, (f.weight / Math.max(1, ...playlist.score.factors.map((x) => x.weight))) * 100)}%`,
                  }}
                  role="img"
                  aria-label={tx("composer.percent_weight", {
                    label: f.label,
                    p1: Math.round(f.score * 100),
                    weight: f.weight,
                  })}
                >
                  <motion.div
                    className="h-full w-full origin-left rounded-full bg-[var(--tint)]"
                    initial={{ scaleX: reduced ? f.score : 0 }}
                    animate={{ scaleX: f.score }}
                    transition={{
                      duration: DUR.slow,
                      ease: EASE.out,
                      delay: reduced ? 0 : 0.08 + idx * STAGGER.bars,
                    }}
                  />
                </div>
                {f.detail && <span className="text-footnote text-[var(--label-2)]">{f.detail}</span>}
              </div>
            ))}
          </Group>
        </Sheet>
      )}
      {playlist && bench && (
        <BenchmarkSheet
          open={benchOpen}
          onClose={() => setBenchOpen(false)}
          playlist={playlist}
          bench={bench}
          onKeep={keepImproved}
        />
      )}
      <Sheet
        open={moodOpen}
        onClose={() => setMoodOpen(false)}
        title={tx("composer.mood_check")}
        trailing={tx("composer.done")}
      >
        <MoodCheck playlists={playlists} playlist={playlist} />
      </Sheet>
      <Sheet
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title={tx("composer.written_review")}
        trailing={aiError ? tx("composer.ok") : tx("composer.done")}
        hideCancel={aiError}
      >
        <div role="status" aria-live="polite" className="mt-2">
          {aiBusy && (
            <p className="text-subhead flex items-center gap-2 px-4 text-[var(--label-2)]">
              <LoaderCircle size={16} className="animate-spin" /> {tx("composer.reading_the_set")}
            </p>
          )}
          {ai && !aiBusy && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: DUR.base }}
              className="text-body whitespace-pre-wrap px-4"
            >
              {ai}
              {aiError && /key/i.test(ai) && (
                <>
                  {" "}
                  <Link href="/settings" className="text-[var(--tint)]">
                    {tx("composer.open_settings")}
                  </Link>
                </>
              )}
            </motion.p>
          )}
        </div>
      </Sheet>
    </div>
  );
}
