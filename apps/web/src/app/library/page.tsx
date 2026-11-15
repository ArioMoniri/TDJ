"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { FeaturedCard } from "@/components/FeaturedCard";
import { Group, RhythmTile, Row } from "@/components/Form";
import { SEARCH_FOCUS_EVENT } from "@/components/Nav";
import { PageHeader } from "@/components/PageHeader";
import { SearchField } from "@/components/SearchField";
import { Sheet } from "@/components/Sheet";
import { PlayRow } from "@/components/ui/PlayRow";
import { rhythmWord } from "@/components/ui/TandaTypeBadge";
import { fmtNumber, t as tx } from "@/lib/i18n";
import { fade, reduced as reducedV, rise, t } from "@/lib/motion";
import { PlayListContext } from "@/lib/playback";
import type { Song } from "@/lib/types";
import { yearText } from "@/lib/year";

const ResolveSheet = dynamic(() => import("@/components/ResolveSheet").then((m) => m.ResolveSheet), {
  ssr: false,
});

/**
 * 2026-11: a result row whose body plays the side (one tap; a second tap pauses), the 30 s preview or the full
 * track with Spotify Premium; nothing to play → a toast that says why, with "Find…" (the Find on services sheet).
 */
const LibraryRow = memo(function LibraryRow({ song, where }: { song: Song; where: string }) {
  const [find, setFind] = useState(false);
  const [findMounted, setFindMounted] = useState(false);
  return (
    <>
      <PlayRow
        song={song}
        where={where}
        leadingKind="tile"
        leading={<RhythmTile rhythm={song.rhythm} label={rhythmWord(song.rhythm)} />}
        sub={`${song.orchestra}${song.singer ? ` · ${song.singer}` : ""}`}
        lengthSec={song.durationSec ?? null}
        playTestId="play-button"
        onFind={() => {
          setFindMounted(true);
          setFind(true);
        }}
        trailing={
          <span className="cell-value text-body">
            <span className="tabular-nums">{yearText(song.year)}</span>
            <span className="text-footnote ml-2 tabular-nums text-[var(--label-2)]">
              <span className="sr-only">{tx("library.energy")} </span>
              {song.energy}
            </span>
          </span>
        }
      />
      {findMounted && <ResolveSheet song={find ? song : null} open={find} onClose={() => setFind(false)} />}
    </>
  );
});

interface Meta {
  meta: { songs: number; orchestras: number; singers: number; builtAt: string };
  orchestras: Array<{ id: string; name: string; count: number; tier: number; style?: string }>;
}

export default function Library() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Song[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [searching, setSearching] = useState(false);
  const [showAll, setShowAll] = useState(false);
  /** the query the current rows answer; a narrowing query (new ⊂ old) skips the stagger */
  const [shown, setShown] = useState<{ q: string; fresh: boolean }>({ q: "", fresh: true });
  const prevIds = useRef<Set<string>>(new Set());
  const reduced = useReducedMotion();
  useEffect(() => {
    fetch("/api/meta")
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (q.length < 2) {
      setRows([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((r: Song[]) => {
          const narrowed = r.length > 0 && r.every((s) => prevIds.current.has(s.id));
          prevIds.current = new Set(r.map((s) => s.id));
          setShown({ q: narrowed ? shownRef.current : q, fresh: !narrowed });
          setRows(r);
        })
        .catch(() => setRows([]))
        .finally(() => setSearching(false));
    }, 200);
    return () => clearTimeout(timer);
  }, [q]);
  // most recorded first (wave 2: the shipped order read 801 … 72, then 228)
  const byCount = useMemo(
    () => [...(meta?.orchestras ?? [])].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    [meta],
  );
  const shownRef = useRef(shown.q);
  shownRef.current = shown.q;
  const rowV = reduced ? reducedV.rise : rise;
  // 2026-11: a tap plays from the results (the mini player steps through them)
  const resultList = useMemo(
    () => ({
      label: tx("library.library"),
      items: rows.map((song) => ({ kind: "song" as const, song, where: tx("library.library") })),
    }),
    [rows],
  );
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
      busy={searching}
      className={cls}
      onFocusChange={(f) => window.dispatchEvent(new CustomEvent(SEARCH_FOCUS_EVENT, { detail: f }))}
    />
  );
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
      <div role="status" aria-live="polite">
        {q.length < 2 && (
          <EmptyState action={<FeaturedCard />}>{tx("library.type_an_orchestra_singer_title_or")}</EmptyState>
        )}
        {q.length >= 2 && !searching && rows.length === 0 && (
          <motion.p
            variants={fade}
            initial="hidden"
            animate="show"
            className="text-subhead py-8 text-center text-[var(--label-2)]"
          >
            {tx("library.nothing_matches_try_a_shorter_spelling", { q })}
          </motion.p>
        )}
        <AnimatePresence mode="wait" initial={false}>
          {rows.length > 0 && (
            <motion.div
              key={shown.q}
              variants={fade}
              initial="hidden"
              animate={{ opacity: searching ? 0.6 : 1, transition: searching ? t.press : t.fade }}
              exit="exit"
            >
              <PlayListContext.Provider value={resultList}>
                <Group header={tx("library.results", { length: rows.length })}>
                  <AnimatePresence initial={false}>
                    {rows.map((s, i) => (
                      <motion.div
                        key={s.id}
                        variants={rowV}
                        custom={i}
                        initial={shown.fresh ? "hidden" : false}
                        animate="show"
                        exit="exit"
                        data-testid="library-row"
                      >
                        <LibraryRow song={s} where={tx("library.library")} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </Group>
              </PlayListContext.Provider>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {q.length < 2 && meta && (
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
