"use client";
import { favouriteTable, isFavouriteSide, type SongFilters } from "@tdj/core";
import { History } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { FeaturedCard } from "@/components/FeaturedCard";
import { Group, Row } from "@/components/Form";
import { LibraryRow, libraryItem } from "@/components/library/LibraryRow";
import { SEARCH_FOCUS_EVENT } from "@/components/Nav";
import { PageHeader } from "@/components/PageHeader";
import { Sheet } from "@/components/Sheet";
import { SmartSearchField, SmartSearchResults } from "@/components/ui/SmartSearch";

import { favouritesOf } from "@/lib/favourites";
import { useMediaQuery } from "@/lib/hooks";
import { fmtNumber, t as tx } from "@/lib/i18n";
import { PlayListContext, tapPlay } from "@/lib/playback";
import type { Version } from "@/lib/smartSearch";
import { useStore } from "@/lib/store";
import { shownOrder, useSmartSearch } from "@/lib/useSmartSearch";
import { forgetSearches, recentSearches, rememberSearch } from "@/lib/useSongSearch";

interface Meta {
  meta: { songs: number; orchestras: number; singers: number; builtAt: string };
  orchestras: Array<{ id: string; name: string; count: number; tier: number; style?: string }>;
}

/** what the empty Library offers to try (each shows a part of the syntax: words across fields, years, filters) */
const EXAMPLES = [
  "di sarli rufino 1941",
  "pugliese 40s",
  "d'arienzo instrumental",
  "otv vals",
  "laurenz milonga",
];

/**
 * The Library (2026-11, "search doesn't work nicely"): one field over the whole catalogue through the shared search
 * (POST /api/search → core `searchSongs`): words across title, orchestra, singer and year, typo-tolerant, with inline
 * filters ("40s", "vals", "instrumental"), chips with counts, matched words marked, "Did you mean", recent searches,
 * ↑ ↓ Enter Esc on the field, 50 results a page.
 */
export default function Library() {
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<SongFilters>({});
  const [meta, setMeta] = useState<Meta | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [grouped, setGrouped] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [findAt, setFindAt] = useState<{ i: number; n: number }>({ i: -1, n: 0 });
  const memory = useStore((s) => s.memory);
  const desktop = useMediaQuery("(hover: hover) and (pointer: fine)");
  // the DJ's dancer favourites (this device's memory): sent with the query so the ♥ chip counts and filters them
  const favourites = useMemo(() => {
    const F = favouritesOf(memory);
    if (!F) return [];
    const T = favouriteTable(F, Date.now());
    return Object.keys(T.sides).filter((id) => isFavouriteSide(T, id));
  }, [memory]);
  const request = useMemo(
    () => ({ ...filters, ...(favourites.length ? { favourites } : {}) }),
    [filters, favourites],
  );
  // 2026-11: the one smart search (components/ui/SmartSearch.tsx): completions, "Did you mean", the versions by
  // work once a title is complete, the DJ's Spotify merged in; the rows stay the Library's own
  const s = useSmartSearch({
    value: q,
    onChange: setQ,
    filters: request,
    onFiltersChange: (f) => {
      const { favourites: _f, ...rest } = f;
      setFilters(rest);
    },
    limit: 50,
    group: grouped ? "orchestra" : undefined,
  });
  const data = s.page;
  const searching = s.asking;
  const order = useMemo(() => shownOrder(s), [s]);
  useEffect(() => {
    fetch("/api/meta")
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => {});
    setRecent(recentSearches());
  }, []);
  // desktop: straight into the field (a phone keeps its keyboard down until the DJ taps)
  useEffect(() => {
    if (desktop)
      (document.getElementById("library-search") as HTMLInputElement | null)?.focus({ preventScroll: true });
  }, [desktop]);
  useEffect(() => {
    if (s.active >= 0)
      document.getElementById(`library-search-opt-${s.active}`)?.scrollIntoView({ block: "nearest" });
  }, [s.active]);
  const byCount = useMemo(
    () => [...(meta?.orchestras ?? [])].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    [meta],
  );
  // 2026-11: a tap plays from the results (the mini player's Previous / Next step through them)
  const resultList = useMemo(
    () => ({ label: tx("library.library"), items: order.map((v) => libraryItem(v.song)) }),
    [order],
  );
  const remember = useCallback(() => {
    if (q.trim().length >= 2 && order.length) setRecent(rememberSearch(q));
  }, [q, order.length]);
  const enter = (v: Version) => {
    const i = order.indexOf(v);
    remember();
    // the app-wide tap-to-play: from the results, so Previous / Next step through them
    void tapPlay(libraryItem(v.song), resultList, { find: () => setFindAt((f) => ({ i, n: f.n + 1 })) });
  };
  const search = (cls = "", assist = false) => (
    <SmartSearchField
      s={s}
      id="library-search"
      prefix="library"
      placeholder={
        meta
          ? tx("library.search_recordings", { songs: fmtNumber(meta.meta.songs) })
          : tx("library.orchestra_singer_title_or_year")
      }
      label={tx("library.search_the_library")}
      className={cls}
      tip={tx("search.syntax_tip")}
      assist={assist}
      onEnter={enter}
      testIds={{ didYouMean: "did-you-mean" }}
      onFocusChange={(f) => {
        window.dispatchEvent(new CustomEvent(SEARCH_FOCUS_EVENT, { detail: f }));
        if (!f) remember();
      }}
    />
  );
  const total = data?.total ?? 0;
  // group heads: where the orchestra changes in the shown list
  const groupOf = (i: number) =>
    grouped && order[i] && (i === 0 || order[i - 1]!.song.orchestraId !== order[i]!.song.orchestraId)
      ? data?.groups?.find((g) => g.orchestraId === order[i]!.song.orchestraId)
      : undefined;
  return (
    <div className="mx-auto max-w-[720px]">
      <PageHeader
        title={tx("library.library")}
        subtitle={
          meta &&
          tx("library.recordings_orchestras_singers", {
            songs: fmtNumber(meta.meta.songs),
            orchestras: meta.meta.orchestras,
            singers: meta.meta.singers,
          })
        }
        inBar={search()}
      >
        {search("mt-3", true)}
      </PageHeader>
      <PlayListContext.Provider value={resultList}>
        <SmartSearchResults
          s={s}
          id="library-search"
          prefix="library"
          testIds={{ didYouMean: "did-you-mean" }}
          headerExtra={
            total > 0 && (
              <button
                type="button"
                className="btn-plain min-h-11 px-4 text-footnote normal-case"
                aria-pressed={grouped}
                onClick={() => setGrouped((g) => !g)}
                data-testid="library-group"
              >
                {grouped ? tx("search.ungroup") : tx("search.group_by_orchestra")}
              </button>
            )
          }
          renderVersion={(v, ctx) => {
            if (!v.hit) return null;
            const g = groupOf(ctx.index);
            return (
              <div role="presentation">
                {g && (
                  <div
                    role="presentation"
                    className="text-footnote px-4 pt-3 pb-1 font-semibold text-[var(--label-2)]"
                    data-testid="library-group-head"
                  >
                    {g.orchestra} · {fmtNumber(g.count)}
                  </div>
                )}
                <LibraryRow
                  hit={v.hit}
                  id={ctx.id}
                  active={ctx.active}
                  sources={v.sources}
                  onHover={desktop ? ctx.onHover : undefined}
                  findSignal={findAt.i === ctx.index ? findAt.n : undefined}
                />
              </div>
            );
          }}
        />
      </PlayListContext.Provider>
      {!searching && (
        <>
          <EmptyState action={<FeaturedCard />}>{tx("library.type_an_orchestra_singer_title_or")}</EmptyState>
          <Group header={tx("search.try")} footer={tx("search.syntax_tip")}>
            <div className="flex flex-wrap gap-1.5 px-4 py-3" data-testid="library-examples">
              {EXAMPLES.map((x) => (
                <button key={x} type="button" className="search-chip" onClick={() => setQ(x)}>
                  {x}
                </button>
              ))}
            </div>
          </Group>
          {recent.length > 0 && (
            <Group
              header={
                <span className="flex items-center justify-between">
                  {tx("search.recent")}
                  <button
                    type="button"
                    className="btn-plain min-h-11 normal-case"
                    onClick={() => {
                      forgetSearches();
                      setRecent([]);
                    }}
                  >
                    {tx("search.clear_recent")}
                  </button>
                </span>
              }
            >
              {recent.map((r) => (
                <Row
                  key={r}
                  tile={<History size={18} strokeWidth={2} className="text-[var(--label-2)]" aria-hidden />}
                  label={r}
                  chevron
                  onClick={() => setQ(r)}
                />
              ))}
            </Group>
          )}
        </>
      )}
      {!searching && meta && (
        <Group
          header={tx("library.orchestras_by_recordings")}
          footer={tx("library.the_number_beside_an_orchestra_is")}
        >
          {byCount.slice(0, 30).map((o) => (
            <Row key={o.id} label={o.name} value={fmtNumber(o.count)} chevron onClick={() => setQ(o.name)} />
          ))}
          <Row
            label={tx("library.all_orchestras")}
            value={tx("library.orchestras_2", { length: fmtNumber(meta.orchestras.length) })}
            data-testid="library-all-orchestras"
            chevron
            onClick={() => setShowAll(true)}
          />
        </Group>
      )}
      <Sheet
        open={showAll}
        onClose={() => setShowAll(false)}
        title={tx("library.orchestras")}
        trailing={tx("library.done")}
      >
        <Group footer={tx("library.sorted_by_how_many_recordings_the")}>
          {byCount.map((o) => (
            <Row
              key={o.id}
              label={o.name}
              value={fmtNumber(o.count)}
              chevron
              onClick={() => {
                setQ(o.name);
                setShowAll(false);
              }}
            />
          ))}
        </Group>
      </Sheet>
    </div>
  );
}
