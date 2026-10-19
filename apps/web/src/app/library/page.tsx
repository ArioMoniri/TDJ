"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { Group, RhythmTile, Row } from "@/components/Form";
import { SEARCH_FOCUS_EVENT } from "@/components/Nav";
import { PageHeader } from "@/components/PageHeader";
import { SearchField } from "@/components/SearchField";
import { Sheet } from "@/components/Sheet";
import { fade, reduced as reducedV, rise, t } from "@/lib/motion";
import type { Song } from "@/lib/types";

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
  const shownRef = useRef(shown.q);
  shownRef.current = shown.q;
  const rowV = reduced ? reducedV.rise : rise;
  const search = (cls = "") => (
    <SearchField
      id="library-search"
      value={q}
      onChange={setQ}
      placeholder={
        meta ? `Search ${meta.meta.songs.toLocaleString()} recordings` : "Orchestra, singer, title or year"
      }
      label="Search the library"
      busy={searching}
      className={cls}
      onFocusChange={(f) => window.dispatchEvent(new CustomEvent(SEARCH_FOCUS_EVENT, { detail: f }))}
    />
  );
  return (
    <div className="mx-auto max-w-[720px]">
      <PageHeader
        title="Library"
        subtitle={
          meta &&
          `${meta.meta.songs.toLocaleString()} recordings · ${meta.meta.orchestras} orchestras · ${meta.meta.singers} singers`
        }
        inBar={search()}
      >
        {search("mt-3")}
      </PageHeader>
      <div role="status" aria-live="polite">
        {q.length < 2 && <EmptyState>Type an orchestra, singer, title or year to search.</EmptyState>}
        {q.length >= 2 && !searching && rows.length === 0 && (
          <motion.p
            variants={fade}
            initial="hidden"
            animate="show"
            className="text-subhead py-8 text-center text-[var(--label-2)]"
          >
            Nothing matches “{q}”. Try a shorter spelling.
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
              <Group header={`${rows.length} results`}>
                <AnimatePresence initial={false}>
                  {rows.map((s, i) => (
                    <motion.div
                      key={s.id}
                      layout={reduced ? false : "position"}
                      variants={rowV}
                      custom={i}
                      initial={shown.fresh ? "hidden" : false}
                      animate="show"
                      exit="exit"
                      className="cell"
                      data-leading="art"
                    >
                      <RhythmTile rhythm={s.rhythm} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{s.title}</span>
                        <span className="text-footnote block truncate text-[var(--label-2)]">
                          {s.orchestra}
                          {s.singer ? ` · ${s.singer}` : ""}
                        </span>
                      </span>
                      <span className="cell-value text-body">
                        <span className="tabular-nums">{s.year ?? "?"}</span>
                        <span className="text-footnote ml-2 tabular-nums text-[var(--label-2)]">
                          <span className="sr-only">energy </span>
                          {s.energy}
                        </span>
                      </span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </Group>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {q.length < 2 && meta && (
        <Group header="Orchestras" footer="Count is how many recordings the index holds.">
          {meta.orchestras.slice(0, 30).map((o) => (
            <Row
              key={o.id}
              label={o.name}
              value={o.count.toLocaleString()}
              chevron
              onClick={() => setQ(o.name)}
            />
          ))}
          <Row
            label="All orchestras"
            value={`${meta.orchestras.length}`}
            chevron
            onClick={() => setShowAll(true)}
          />
        </Group>
      )}
      <Sheet open={showAll} onClose={() => setShowAll(false)} title="Orchestras" trailing="Done">
        <Group>
          {(meta?.orchestras ?? []).map((o) => (
            <Row
              key={o.id}
              label={o.name}
              value={o.count.toLocaleString()}
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
