"use client";
import { favouriteTable, isFavouriteSide, type SongFilters } from "@tdj/core";
import { History } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { FeaturedCard } from "@/components/FeaturedCard";
import { Group, Row } from "@/components/Form";
import { LibraryRow, playSong } from "@/components/library/LibraryRow";
import { SEARCH_FOCUS_EVENT } from "@/components/Nav";
import { PageHeader } from "@/components/PageHeader";
import { SearchField } from "@/components/SearchField";
import { Sheet } from "@/components/Sheet";
import { filtersActive, SearchChips } from "@/components/search/SearchChips";
import { favouritesOf } from "@/lib/favourites";
import { useMediaQuery } from "@/lib/hooks";
import { fmtNumber, t as tx } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { forgetSearches, recentSearches, rememberSearch, useSongSearch } from "@/lib/useSongSearch";

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

const rowId = (i: number) => `library-row-${i}`;

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
  const [active, setActive] = useState(-1);
  const [grouped, setGrouped] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [findAt, setFindAt] = useState<{ i: number; n: number }>({ i: -1, n: 0 });
  const memory = useStore((s) => s.memory);
  const connected = useStore((s) => !!s.spotifyToken && s.spotifyToken.expires > Date.now());
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
  const { data, loading, hasMore, loadMore } = useSongSearch(q, {
    filters: request,
    limit: 50,
    group: grouped ? "orchestra" : undefined,
  });
  const searching = q.trim().length >= 2 || filtersActive(filters) > 0;
  const items = searching ? (data?.items ?? []) : [];
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
  // a new answer starts the keyboard selection over
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on each new answer
  useEffect(() => setActive(-1), [data]);
  useEffect(() => {
    if (active >= 0) document.getElementById(rowId(active))?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const byCount = useMemo(
    () => [...(meta?.orchestras ?? [])].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    [meta],
  );
  const remember = useCallback(() => {
    if (q.trim().length >= 2 && items.length) setRecent(rememberSearch(q));
  }, [q, items.length]);
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && items.length) {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === "ArrowUp" && items.length) {
      e.preventDefault();
      setActive((a) => Math.max(-1, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const i = active >= 0 ? active : 0;
      const hit = items[i];
      if (!hit) return;
      setActive(i);
      remember();
      const patch = useStore.getState().overrides.songs?.[hit.song.id];
      if (!playSong(hit.song, connected, patch)) setFindAt((f) => ({ i, n: f.n + 1 }));
    } else if (e.key === "Escape") {
      if (q || filtersActive(filters)) {
        e.preventDefault();
        setQ("");
        setActive(-1);
      }
    }
  };
  const search = (cls = "") => (
    <SearchField
      id="library-search"
      value={q}
      onChange={setQ}
      placeholder={
        meta
          ? tx("library.search_recordings", { songs: fmtNumber(meta.meta.songs) })
          : tx("library.orchestra_singer_title_or_year")
      }
      label={tx("library.search_the_library")}
      busy={loading}
      className={cls}
      tip={tx("search.syntax_tip")}
      onFocusChange={(f) => {
        window.dispatchEvent(new CustomEvent(SEARCH_FOCUS_EVENT, { detail: f }));
        if (!f) remember();
      }}
      inputProps={{
        onKeyDown,
        role: "combobox",
        "aria-expanded": items.length > 0,
        "aria-controls": "library-results",
        "aria-autocomplete": "list",
        "aria-activedescendant": active >= 0 ? rowId(active) : undefined,
      }}
    />
  );
  const total = data?.total ?? 0;
  const empty = searching && !!data && !loading && total === 0;
  // group heads: where the orchestra changes in the shown page
  const groupOf = (i: number) =>
    grouped && items[i] && (i === 0 || items[i - 1]!.song.orchestraId !== items[i]!.song.orchestraId)
      ? data?.groups?.find((g) => g.orchestraId === items[i]!.song.orchestraId)
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
        {search("mt-3")}
      </PageHeader>
      <SearchChips
        facets={searching ? data?.facets : null}
        filters={filters}
        onChange={(f) => setFilters(f)}
        favourites={favourites.length > 0}
        more={searching}
        idPrefix="library-chip"
      />
      <div role="status" aria-live="polite" className="min-h-0">
        {searching && data && (data.corrected?.length ?? 0) > 0 && total > 0 && (
          <p className="text-footnote px-4 pt-3 text-[var(--label-2)]" data-testid="library-corrected">
            {tx("search.showing_close_spellings", {
              words: data.corrected!.map((c) => `“${c.found}”`).join(", "),
            })}
          </p>
        )}
        {empty && (
          <div className="py-8 text-center">
            <p className="text-subhead text-[var(--label-2)]">
              {tx("library.nothing_matches_try_a_shorter_spelling", { q })}
            </p>
            {data?.suggestion && (
              <p className="mt-2">
                {tx("search.did_you_mean")}{" "}
                <button
                  type="button"
                  className="btn-plain min-h-11 font-semibold"
                  data-testid="did-you-mean"
                  onClick={() => setQ(data.suggestion!)}
                >
                  {data.suggestion}
                </button>
                ?
              </p>
            )}
          </div>
        )}
      </div>
      {items.length > 0 && (
        <section className="min-w-0" aria-busy={loading}>
          <div className="flex items-center gap-2">
            <h2 className="section-head flex-1" data-testid="library-total">
              {tx("library.results", { length: fmtNumber(total) })}
            </h2>
            <button
              type="button"
              className="btn-plain min-h-11 px-4 text-footnote"
              aria-pressed={grouped}
              onClick={() => setGrouped((g) => !g)}
              data-testid="library-group"
            >
              {grouped ? tx("search.ungroup") : tx("search.group_by_orchestra")}
            </button>
          </div>
          <div
            className={`group-inset transition-opacity ${loading ? "opacity-70" : ""}`}
            role="listbox"
            id="library-results"
            aria-label={tx("library.results", { length: fmtNumber(total) })}
            data-testid="library-results"
          >
            {items.map((h, i) => {
              const g = groupOf(i);
              return (
                <div key={h.song.id} role="presentation">
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
                    hit={h}
                    id={rowId(i)}
                    active={i === active}
                    onHover={desktop ? () => setActive(i) : undefined}
                    findSignal={findAt.i === i ? findAt.n : undefined}
                  />
                </div>
              );
            })}
          </div>
          {hasMore && (
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                className="btn-plain min-h-11 px-4"
                onClick={loadMore}
                disabled={loading}
                data-testid="library-more"
              >
                {tx("search.show_more", { shown: fmtNumber(items.length), total: fmtNumber(total) })}
              </button>
            </div>
          )}
        </section>
      )}
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
