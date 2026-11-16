"use client";
import { singerDisplay } from "@tdj/core";
import "../search/search.css";
import "./smart-search.css";
import { AudioLines, CircleAlert, HardDrive, Info, Library, MonitorPlay } from "lucide-react";
import {
  Fragment,
  type ReactNode,
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { haptic } from "@/lib/haptics";
import { fmtNumber, plural, t } from "@/lib/i18n";
import { fmtLen } from "@/lib/lengths";
import { useTapPlay } from "@/lib/playback";
import type { PlayItem } from "@/lib/player";
import { ERAS, type EraChip, eraOfFilters, type SourceId, type Version, withEra } from "@/lib/smartSearch";
import { openSongDetails } from "@/lib/songOpen";
import { bpmText, useSongData } from "@/lib/songView";
import type { Song } from "@/lib/types";
import {
  type SmartSearchOptions,
  type SmartSearchState,
  shownOrder,
  useSmartSearch,
} from "@/lib/useSmartSearch";
import { yearText } from "@/lib/year";
import { SearchField } from "../SearchField";
import { Highlight } from "../search/Highlight";
import { Chip, SearchChips } from "../search/SearchChips";
import { Artwork } from "./Artwork";
import { NowBars } from "./NowPlaying";
import { rhythmWord, TandaTypeBadge } from "./TandaTypeBadge";

/**
 * 2026-11 — the one smart search (the owner: "a helper/corrector for finding song names from the connected service,
 * the versions after the name is completed, the song's properties and type, in all search boxes"). Used by the Swap
 * sheets (a song, a tanda), the Library, the Database, Build by hand, the Booth's Find songs and Compose's search
 * panel. The pure parts are lib/smartSearch.ts, the state lib/useSmartSearch.ts.
 *
 * - the field: typo- and accent-tolerant (core `searchSongs`), completions while typing (a title, an orchestra, a
 *   singer), "Did you mean …" / "Showing … for …"; Tab takes the first, ↑ ↓ walk the results, Enter picks (or plays),
 *   Esc clears;
 * - chips: rhythm, vocal / instrumental, era, decades, orchestras, singers (each with its count);
 * - once a title is complete, the results by work: every recording a version with orchestra, singer or Instrumental,
 *   year, the rhythm badge, length, BPM and energy when known, where it comes from (the catalogue, Spotify, a linked
 *   file) and a play button; the same recording from the catalogue and a service is one row with both sources.
 */

export interface SmartSearchProps extends SmartSearchOptions {
  id: string;
  /** testids of the chips and notes (`${prefix}-chip-…`); default `id` */
  prefix?: string;
  placeholder: string;
  label: string;
  autoFocus?: boolean;
  /** the field's help tag */
  tip?: string;
  /** Enter or a tap on a row's body: the host's pick (the Swap sheets: use it); without it the row plays */
  onPick?: (v: Version) => void;
  /** the play button (the Booth: the headphones); default the app-wide tap-to-play */
  onPlay?: (v: Version) => void;
  /** is this version playing in the headphones (with `onPlay`) */
  playing?: (v: Version) => boolean;
  /** buttons at the end of a row */
  actions?: (v: Version) => ReactNode;
  /** a line under the row's facts (the Swap sheet: why a side cannot take the chair) */
  note?: (v: Version) => ReactNode;
  dim?: (v: Version) => boolean;
  /** a row of the host's own (the Library, the Database) */
  renderVersion?: (v: Version, ctx: RowContext) => ReactNode;
  rowTestId?: string;
  /** a row's testid per version (the Swap sheet: a side that fits, one excluded, one not judged yet) */
  rowTestIdOf?: (v: Version) => string;
  rowData?: (v: Version) => Record<string, string>;
  /** above the results (the Swap sheet's Suggested) */
  top?: ReactNode;
  /** with nothing asked */
  empty?: ReactNode;
  /** the chips (default true) */
  chips?: boolean;
  /** the decade / orchestra / singer chip lines (default: once something is asked) */
  moreChips?: boolean;
  testIds?: Partial<Record<"didYouMean" | "corrected" | "total" | "results", string>>;
  className?: string;
  onFocusChange?: (f: boolean) => void;
  /** the field and the results are placed by the host (the Library's two fields): pass the state instead */
  state?: SmartSearchState;
}

export interface RowContext {
  index: number;
  /** inside a work: its rhythm (the head shows it; a row repeats it only when it differs) */
  workRhythm?: string;
  active: boolean;
  id: string;
  onHover: () => void;
}

const SOURCE_ICON: Record<SourceId, typeof Library> = {
  catalogue: Library,
  spotify: AudioLines,
  youtube: MonitorPlay,
  local: HardDrive,
};
const sourceLabel = (s: SourceId) =>
  s === "catalogue"
    ? t("smartSearch.source_catalogue")
    : s === "spotify"
      ? "Spotify"
      : s === "youtube"
        ? "YouTube"
        : t("smartSearch.source_local");

export function SourceIcons({ sources }: { sources: SourceId[] }) {
  return (
    <span className="smart-sources" data-testid="smart-sources" data-sources={sources.join(" ")}>
      {sources.map((s) => {
        const I = SOURCE_ICON[s];
        return (
          <span key={s} className="smart-source" data-source={s} title={sourceLabel(s)}>
            <I size={14} strokeWidth={2} aria-hidden />
            <span className="sr-only">{sourceLabel(s)}</span>
          </span>
        );
      })}
    </span>
  );
}

const rowId = (id: string, i: number) => `${id}-opt-${i}`;
/** the rows a new answer paints in its first frame (a phone's screen and more); the rest follow when idle */
export const FIRST_ROWS = 16;

/** the field's keys: ↑ ↓ walk the shown versions, Enter picks, Tab takes the correction or the first completion */
export function useSmartKeys(
  s: SmartSearchState,
  o: { onEnter: (v: Version) => void; onEscape?: () => void },
) {
  const order = shownOrder(s);
  // 2026-11: Enter pressed before the results answer the words typed would pick the previous query's song: hold it
  // until the answer for these words is painted, then pick its first (or highlighted) version
  const pending = useRef(false);
  const stale = !!s.q.trim() && s.answered !== null && s.answered.trim() !== s.q.trim();
  const onEnterRef = useRef(o.onEnter);
  onEnterRef.current = o.onEnter;
  useEffect(() => {
    if (!pending.current || stale || s.answered === null) return;
    pending.current = false;
    const v = order[s.active >= 0 ? s.active : 0];
    if (v) onEnterRef.current(v);
  });
  return (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && order.length) {
      e.preventDefault();
      s.setActive((a) => Math.min(order.length - 1, a + 1));
    } else if (e.key === "ArrowUp" && order.length) {
      e.preventDefault();
      s.setActive((a) => Math.max(-1, a - 1));
    } else if (e.key === "Enter") {
      if (stale || (s.loading && !order.length)) {
        e.preventDefault();
        pending.current = true;
        return;
      }
      pending.current = false;
      const v = order[s.active >= 0 ? s.active : 0];
      if (!v) return;
      e.preventDefault();
      s.setActive(s.active >= 0 ? s.active : 0);
      o.onEnter(v);
    } else if (e.key === "Tab" && !e.shiftKey) {
      const take = s.correction?.query ?? s.completions[0]?.query;
      const input = e.currentTarget;
      if (take && input.selectionStart === input.value.length) {
        e.preventDefault();
        s.accept(take);
      }
    } else if (e.key === "Escape" && s.q) {
      e.preventDefault();
      e.stopPropagation();
      s.setQ("");
      s.setActive(-1);
      o.onEscape?.();
    }
  };
}

/** the play of a version: the host's (the Booth's headphones), else the app-wide tap-to-play */
function usePlay(v: Version, onPlay?: (v: Version) => void, playing?: (v: Version) => boolean) {
  const item = useMemo<PlayItem>(() => ({ kind: "song", song: v.song }), [v.song]);
  const tap = useTapPlay(onPlay ? null : item);
  if (onPlay)
    return {
      tap: () => onPlay(v),
      playing: !!playing?.(v),
      state: playing?.(v) ? ("playing" as const) : null,
    };
  return { tap: () => void tap.tap(), playing: tap.playing, state: tap.state };
}

/** one recording: cover (plays), title and rhythm, its facts, its sources, the host's actions */
export function VersionRow({
  v,
  ctx,
  onPick,
  onPlay,
  playing,
  actions,
  note,
  dim,
  testId = "smart-version",
  data,
  workRhythm,
}: {
  v: Version;
  ctx: RowContext;
  onPick?: (v: Version) => void;
  onPlay?: (v: Version) => void;
  playing?: (v: Version) => boolean;
  actions?: (v: Version) => ReactNode;
  note?: (v: Version) => ReactNode;
  dim?: boolean;
  testId?: string;
  data?: Record<string, string>;
  /** shown inside a work whose head already says its rhythm: the badge only when this version differs */
  workRhythm?: string;
}) {
  const s = v.song;
  const { song: eff, data: sd } = useSongData(s);
  const play = usePlay(v, onPlay, playing);
  const bpm = bpmText(sd);
  const hl = v.hit?.highlights ?? {};
  const facts = [
    s.orchestra,
    s.singer ?? t("tandaType.instrumental"),
    s.year ? `${yearText(eff.year)}${v.external && !v.hit ? "*" : ""}` : null,
  ];
  const extra = [
    bpm,
    typeof eff.energy === "number" ? t("smartSearch.energy", { n: Math.round(eff.energy) }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate" data-testid="smart-version-title">
            <Highlight text={s.title} spans={hl.title} />
          </span>
          {s.rhythm !== workRhythm && (
            <TandaTypeBadge rhythm={s.rhythm} compact className={v.rhythmKnown ? "" : "smart-guess"} />
          )}
        </span>
        <span
          className="text-footnote block truncate text-[var(--label-2)]"
          data-testid="smart-version-facts"
        >
          {facts.filter(Boolean).map((f, i) => (
            <Fragment key={i}>
              {i > 0 && " · "}
              {i === 0 ? (
                <Highlight text={f} spans={hl.orchestra} />
              ) : i === 1 && s.singer ? (
                <Highlight text={f} spans={hl.singer} />
              ) : (
                f
              )}
            </Fragment>
          ))}
          {extra && ` · ${extra}`}
        </span>
        {note?.(v)}
      </span>
    </>
  );
  return (
    <div
      role="option"
      tabIndex={-1}
      id={ctx.id}
      aria-selected={ctx.active}
      // (QA fix 2026-11: a row that breaks the rules was dimmed to 2.95:1; its text keeps full contrast and a mark
      // with a label says so instead)
      className={`cell smart-version gap-2 ${play.state ? "row-now" : ""}`}
      data-breaks={dim ? "" : undefined}
      data-leading="art"
      data-active={ctx.active ? "" : undefined}
      data-testid={testId}
      data-song-id={s.id}
      onPointerEnter={ctx.onHover}
      {...Object.fromEntries(Object.entries(data ?? {}).map(([k, x]) => [`data-${k}`, x]))}
    >
      {/* the pick comes first in the DOM (the row's first button is its action), the cover first on screen */}
      {onPick ? (
        <button
          type="button"
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
          onClick={() => onPick(v)}
          data-testid="smart-pick"
        >
          {body}
        </button>
      ) : (
        <div className="flex min-h-11 min-w-0 flex-1 items-center gap-3">{body}</div>
      )}
      {dim && (
        <span className="shrink-0 text-[var(--orange-text,var(--label-2))]" data-testid="smart-breaks">
          <CircleAlert size={16} aria-hidden />
          <span className="sr-only">{t("smartSearch.breaks_rules")}</span>
        </span>
      )}
      <button
        type="button"
        className="relative order-first -my-1 shrink-0"
        onClick={() => {
          haptic(4);
          play.tap();
        }}
        aria-label={
          play.playing ? t("songRow.pause", { title: s.title }) : t("songRow.play", { title: s.title })
        }
        aria-pressed={play.playing}
        data-testid="smart-play"
      >
        <Artwork
          src={sd.artwork?.value as string | undefined}
          orchestra={s.orchestra}
          orchestraId={s.orchestraId}
          song={s}
        />
        {play.state && (
          <span className="absolute inset-0 grid place-items-center rounded-[inherit] bg-black/45">
            <NowBars on={play.playing} className="!text-white" />
          </span>
        )}
      </button>
      <span className="len text-caption1" data-testid="smart-len">
        <span className="sr-only">{t("play.length")} </span>
        {fmtLen(s.durationSec)}
      </span>
      <SourceIcons sources={v.sources} />
      {v.sources.includes("catalogue") && (
        <button
          type="button"
          className="icon-btn icon-btn-bare -my-1 h-11 w-11 shrink-0 text-[var(--label-2)]"
          aria-label={t("song.details_of", { title: s.title, orchestra: s.orchestra })}
          data-testid="smart-info"
          onClick={() => openSongDetails(s)}
        >
          <Info size={16} strokeWidth={2} aria-hidden />
        </button>
      )}
      {actions?.(v)}
    </div>
  );
}

/** the field with its completions and correction */
export function SmartSearchField({
  s,
  id,
  prefix = id,
  placeholder,
  label,
  autoFocus,
  tip,
  onEnter,
  className = "",
  testIds = {},
  onFocusChange,
  listId = `${id}-results`,
  assist = true,
  inputTestId,
}: {
  s: SmartSearchState;
  id: string;
  prefix?: string;
  placeholder: string;
  label: string;
  autoFocus?: boolean;
  tip?: string;
  onEnter: (v: Version) => void;
  className?: string;
  testIds?: SmartSearchProps["testIds"];
  onFocusChange?: (f: boolean) => void;
  listId?: string;
  /** the completions and the correction under the field (a second copy of the field shows none) */
  assist?: boolean;
  inputTestId?: string;
}) {
  const onKeyDown = useSmartKeys(s, { onEnter });
  const order = shownOrder(s);
  const closeNote = s.correction?.kind === "close";
  return (
    <div className={className}>
      <SearchField
        id={id}
        value={s.q}
        onChange={(v) => s.setQ(v)}
        placeholder={placeholder}
        label={label}
        busy={s.loading || s.servicesLoading}
        tip={tip}
        onFocusChange={onFocusChange}
        inputProps={{
          onKeyDown,
          autoFocus,
          ...(inputTestId ? { "data-testid": inputTestId } : {}),
          role: "combobox",

          "aria-expanded": order.length > 0,
          "aria-controls": listId,
          "aria-autocomplete": "list",
          "aria-activedescendant": s.active >= 0 && order[s.active] ? rowId(id, s.active) : undefined,
          "aria-describedby": `${id}-assist`,
        }}
      />
      {assist && (s.correction || s.completions.length > 0) && (
        <div className="smart-assist" id={`${id}-assist`} data-testid={`${prefix}-assist`}>
          {s.correction && (
            <button
              type="button"
              className="smart-assist-item"
              data-kind="correction"
              data-testid={testIds.didYouMean ?? `${prefix}-did-you-mean`}
              onClick={() => s.accept(s.correction!.query)}
            >
              {closeNote ? t("smartSearch.showing_for") : t("search.did_you_mean")}{" "}
              <strong>{s.correction.query}</strong>
              {!closeNote && "?"}
              <kbd className="smart-kbd" aria-hidden>
                Tab
              </kbd>
            </button>
          )}
          {s.completions.map((c, i) => (
            <button
              key={`${c.kind}-${c.label}`}
              type="button"
              className="smart-assist-item"
              data-kind={c.kind}
              data-testid={`${prefix}-completion`}
              onClick={() => s.accept(c.query)}
            >
              <span className="smart-assist-kind">
                {t(`smartSearch.kind_${c.kind}` as "smartSearch.kind_title")}
              </span>
              <span className="truncate">{c.kind === "singer" ? singerDisplay(c.label) : c.label}</span>
              {i === 0 && !s.correction && (
                <kbd className="smart-kbd" aria-hidden>
                  Tab
                </kbd>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** the chips, the notes and the list */
export function SmartSearchResults({
  s,
  id,
  prefix = id,
  onPick,
  onPlay,
  playing,
  actions,
  note,
  dim,
  renderVersion,
  rowTestId,
  rowTestIdOf,
  rowData,
  top,
  empty,
  chips = true,
  moreChips,
  testIds = {},
  listLabel,
  plain = false,
  listClassName = "",
  headerExtra,
}: Omit<SmartSearchProps, "placeholder" | "label"> & {
  s: SmartSearchState;
  listLabel?: string;
  /** beside the results' count (the Library's Group by orchestra) */
  headerExtra?: ReactNode;

  /** the host's rows bring their own grouping (the Database's cards): no inset around them */
  plain?: boolean;
  listClassName?: string;
}) {
  const order = shownOrder(s);
  const nothing = s.asking && !!s.page && !s.loading && !order.length;
  const era = eraOfFilters(s.filters);
  const spotify = s.services.find((a) => a.id === "spotify");
  const fromServices = order.filter((v) => v.external).length;
  // one hover callback per row index for the page's life, so a memoised row (the Library's) keeps its props
  const hovers = useRef(new Map<number, () => void>());
  const setActive = useRef(s.setActive);
  setActive.current = s.setActive;
  const hoverFor = (i: number) => {
    let f = hovers.current.get(i);
    if (!f) {
      f = () => setActive.current(i);
      hovers.current.set(i, f);
    }
    return f;
  };
  // A new answer paints its first rows at once and the rest a moment later (after the frame, interruptibly), so the
  // first screen of results never waits for fifty rows; ↓ past them, or a host asking for them, shows them all.
  const [fullFor, setFullFor] = useState<unknown>(null);
  const full = fullFor === s.versions || s.active >= FIRST_ROWS - 1 || order.length <= FIRST_ROWS;
  useEffect(() => {
    if (full) return;
    const go = () => startTransition(() => setFullFor(s.versions));
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (h: number) => void;
    };
    if (w.requestIdleCallback) {
      const h = w.requestIdleCallback(go, { timeout: 250 });
      return () => w.cancelIdleCallback?.(h);
    }
    const h = setTimeout(go, 60);
    return () => clearTimeout(h);
  }, [full, s.versions]);
  // The rows render from a deferred copy of what they show: a keystroke's own render reuses the rows as they are
  // (the field answers at once), and the new rows render after it, interruptibly: typing never waits for a list.
  const listInput = {
    cap: full ? Number.POSITIVE_INFINITY : FIRST_ROWS,
    order,
    works: s.works,
    active: s.active,
    id,
    plain,
    listClassName,
    renderVersion,
    onPick,
    onPlay,
    playing,
    actions,
    note,
    dim,
    rowTestId,
    rowTestIdOf,
    rowData,
  };
  const deferred = useDeferredValue(listInput);
  // only while the DJ types in this search's field: anything else (Edit, a value typed into a row's own field, a
  // tap) renders the rows at once, so a row's controlled input never shows a stale value
  const typing = typeof document !== "undefined" && document.activeElement?.id === id;
  const d = typing ? deferred : listInput;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `d` is the whole input (a new object per render)
  const rows = useMemo(() => {
    let k = -1;
    const row = (v: Version, workRhythm?: string) => {
      k++;
      const index = k;
      if (index >= d.cap) return null;
      const ctx: RowContext = {
        index,
        active: index === d.active,
        id: rowId(d.id, index),
        onHover: hoverFor(index),
        workRhythm,
      };
      // the host's own row, or (a service's recording, which the host has no row for) the version row
      const own = d.renderVersion?.(v, ctx);
      if (own !== undefined && own !== null) return <Fragment key={v.key}>{own}</Fragment>;
      return (
        <VersionRow
          key={v.key}
          v={v}
          ctx={ctx}
          onPick={d.onPick}
          onPlay={d.onPlay}
          playing={d.playing}
          actions={d.actions}
          note={d.note}
          dim={d.dim?.(v)}
          testId={d.rowTestIdOf?.(v) ?? d.rowTestId}
          data={d.rowData?.(v)}
          workRhythm={workRhythm}
        />
      );
    };
    return d.works ? (
      d.works.map((w, wi) => {
        const items = w.versions.map((v) => row(v, w.rhythm));
        if (wi > 0 && !items.some(Boolean)) return null;
        return (
          // biome-ignore lint/a11y/useSemanticElements: a group of options inside the listbox (WAI-ARIA)
          <div
            key={w.key}
            role="group"
            aria-label={w.title}
            className={d.plain ? "mb-3" : "group-inset mb-3"}
            data-testid="smart-work"
          >
            <div className="smart-work-head" role="presentation">
              <span className="text-headline min-w-0 flex-1 truncate">{w.title}</span>
              <TandaTypeBadge rhythm={w.rhythm} compact />
              <span className="text-caption1 text-[var(--label-2)]" data-testid="smart-work-count">
                {plural("smartSearch.versions_n", w.versions.length)}
              </span>
            </div>
            <div className={d.listClassName}>{items}</div>
          </div>
        );
      })
    ) : (
      <div className={d.plain ? d.listClassName : `group-inset ${d.listClassName}`}>
        {d.order.map((v) => row(v))}
      </div>
    );
  }, [d]);
  return (
    <div className="min-w-0" data-testid={`${prefix}-smart`} data-answered={s.answered ?? ""}>
      {chips && (
        <>
          <fieldset
            className="search-chips search-chips-scroll m-0 border-0 p-0"
            data-testid={`${prefix}-era`}
          >
            <legend className="sr-only">{t("smartSearch.era")}</legend>
            {(Object.keys(ERAS) as EraChip[]).map((e) => (
              <Chip
                key={e}
                on={era === e}
                label={t(`smartSearch.era_${e}` as "smartSearch.era_golden")}
                onClick={() => s.setFilters(withEra(s.filters, era === e ? null : e))}
                testId={`${prefix}-chip-era-${e}`}
              />
            ))}
          </fieldset>
          <SearchChips
            facets={s.asking ? s.page?.facets : null}
            filters={s.filters}
            onChange={s.setFilters}
            favourites={!!s.filters.favourites && (s.filters.favourites as unknown[]).length > 0}
            more={moreChips ?? s.asking}
            idPrefix={`${prefix}-chip`}
          />
        </>
      )}
      <div role="status" aria-live="polite" className="min-h-0">
        {s.correction?.kind === "close" && s.total > 0 && (
          <p
            className="text-footnote px-1 pt-2 text-[var(--label-2)]"
            data-testid={testIds.corrected ?? `${prefix}-corrected`}
          >
            {t("search.showing_close_spellings", {
              words: (s.page?.corrected ?? []).map((c) => `“${c.found}”`).join(", "),
            })}
          </p>
        )}
        {s.asking && spotify && spotify.state !== "ok" && spotify.state !== "off" && (
          <p className="text-footnote px-1 pt-2 text-[var(--label-2)]" data-testid={`${prefix}-service-note`}>
            {spotify.state === "signed-out"
              ? t("smartSearch.spotify_signed_out")
              : spotify.state === "busy"
                ? t("smartSearch.spotify_busy")
                : t("smartSearch.spotify_error")}
          </p>
        )}
      </div>
      {top}
      {!s.asking && empty}
      {nothing && (
        <p className="text-subhead py-6 text-center text-[var(--label-2)]" data-testid={`${prefix}-nothing`}>
          {t("smartSearch.nothing", { q: s.q.trim() })}
        </p>
      )}
      {order.length > 0 && (
        <section aria-busy={s.loading}>
          <h3 className="section-head flex flex-wrap items-center gap-x-2">
            <span data-testid={testIds.total ?? `${prefix}-total`}>
              {t("library.results", { length: fmtNumber(s.total) })}
            </span>
            {s.works && (
              <span className="text-caption1 font-normal normal-case" data-testid={`${prefix}-works`}>
                {plural("smartSearch.titles", s.works.length)} ·{" "}
                {plural("smartSearch.versions_n", order.length)}
              </span>
            )}
            <span className="flex-1" />
            {fromServices > 0 && (
              <span className="text-caption1 font-normal normal-case" data-testid={`${prefix}-from-services`}>
                {t("smartSearch.from_spotify", { n: fromServices })}
              </span>
            )}
            {headerExtra}
          </h3>
          <div
            role="listbox"
            id={`${id}-results`}
            aria-label={listLabel ?? t("smartSearch.results")}
            className={`transition-opacity ${s.loading ? "opacity-70" : ""}`}
            data-testid={testIds.results ?? `${prefix}-results`}
          >
            {rows}
          </div>
          {s.hasMore && (
            <button
              type="button"
              className="btn-plain mx-auto mt-2 flex min-h-11 items-center px-4"
              onClick={s.loadMore}
              data-testid={`${prefix}-more`}
            >
              {t("smartSearch.show_more")}
            </button>
          )}
        </section>
      )}
    </div>
  );
}

/** the whole box: the field, the chips, the results */
export function SmartSearch(p: SmartSearchProps) {
  const own = useSmartSearch(p);
  const s = p.state ?? own;
  const enter = (v: Version) => {
    if (p.onPick) p.onPick(v);
    else if (p.onPlay) p.onPlay(v);
    else void playVersion(v);
  };
  return (
    <div className={`min-w-0 ${p.className ?? ""}`}>
      <SmartSearchField
        s={s}
        id={p.id}
        prefix={p.prefix}
        placeholder={p.placeholder}
        label={p.label}
        autoFocus={p.autoFocus}
        tip={p.tip}
        onEnter={enter}
        testIds={p.testIds}
        onFocusChange={p.onFocusChange}
      />
      <SmartSearchResults {...p} s={s} />
    </div>
  );
}

/** Enter on a row without a pick: the app-wide tap-to-play */
export async function playVersion(v: Version, list?: { label: string; items: PlayItem[] } | null) {
  const { tapPlay } = await import("@/lib/playback");
  return tapPlay({ kind: "song", song: v.song as Song }, list ?? null);
}

/** "Tango", "Vals", "Milonga" for a version's rhythm (the hosts' labels) */
export const versionRhythm = (v: Version) => rhythmWord(v.song.rhythm);
