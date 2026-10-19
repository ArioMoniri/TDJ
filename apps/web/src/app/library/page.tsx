"use client";
import { LoaderCircle, Search } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { fade, reduced as reducedV, rise, t } from "@/lib/motion";
import type { Song } from "@/lib/types";

interface Meta {
  meta: { songs: number; orchestras: number; singers: number; builtAt: string };
  orchestras: Array<{ id: string; name: string; count: number; tier: number; style?: string }>;
}

const TONE: Record<string, string> = { tango: "tone-tango", vals: "tone-vals", milonga: "tone-milonga" };

export default function Library() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Song[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [searching, setSearching] = useState(false);
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
    const t = setTimeout(() => {
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
    return () => clearTimeout(t);
  }, [q]);
  const shownRef = useRef(shown.q);
  shownRef.current = shown.q;
  const rowV = reduced ? reducedV.rise : rise;
  return (
    <div className="space-y-4">
      <div className="surface p-5 sm:p-6">
        <h1 className="font-serif text-3xl font-semibold">Library</h1>
        {meta && (
          <p className="text-muted mt-1 text-sm">
            {meta.meta.songs.toLocaleString()} recordings · {meta.meta.orchestras} orchestras ·{" "}
            {meta.meta.singers} singers
          </p>
        )}
        <label
          htmlFor="library-search"
          className="mt-4 flex min-h-12 items-center gap-2 rounded-full border border-[rgb(var(--text)/.16)] bg-[rgb(var(--text)/.04)] px-4 focus-within:ring-2 focus-within:ring-[var(--accent)]"
        >
          <span className="relative inline-grid h-4 w-4 shrink-0 place-items-center opacity-70" aria-hidden>
            <AnimatePresence mode="wait" initial={false}>
              {searching ? (
                <motion.span
                  key="busy"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={t.press}
                  className="inline-flex"
                >
                  <LoaderCircle size={16} className="animate-spin" />
                </motion.span>
              ) : (
                <motion.span
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={t.press}
                  className="inline-flex"
                >
                  <Search size={16} />
                </motion.span>
              )}
            </AnimatePresence>
          </span>
          <span className="sr-only">Search the library</span>
          <input
            id="library-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, orchestra, singer, year… e.g. darienzo mauré vals"
            className="w-full bg-transparent py-2 outline-none placeholder:text-[rgb(var(--muted))]"
            autoComplete="off"
          />
        </label>
      </div>
      <div role="status" aria-live="polite">
        {q.length < 2 && <EmptyState>Type an orchestra, singer, title or year to search.</EmptyState>}
        {q.length >= 2 && !searching && rows.length === 0 && (
          <motion.p
            variants={fade}
            initial="hidden"
            animate="show"
            className="text-muted py-8 text-center text-sm"
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
              className="surface overflow-hidden"
            >
              <motion.p
                variants={rowV}
                initial={shown.fresh ? "hidden" : false}
                animate="show"
                custom={0}
                className="text-muted border-b border-[rgb(var(--text)/.08)] px-4 py-2 text-xs"
              >
                {rows.length} results
              </motion.p>
              <ul className="divide-y divide-[rgb(var(--text)/.08)]">
                <AnimatePresence initial={false}>
                  {rows.map((s, i) => (
                    <motion.li
                      key={s.id}
                      layout={reduced ? false : "position"}
                      variants={rowV}
                      custom={i}
                      initial={shown.fresh ? "hidden" : false}
                      animate="show"
                      exit="exit"
                      className="flex min-h-11 items-center gap-3 px-4 py-2 text-sm"
                    >
                      <span className={`w-14 shrink-0 text-xs font-bold uppercase ${TONE[s.rhythm] ?? ""}`}>
                        {s.rhythm}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {s.title}{" "}
                        <span className="text-muted">
                          · {s.orchestra}
                          {s.singer ? ` / ${s.singer}` : ""}
                        </span>
                      </span>
                      <span className="text-muted tabular-nums">{s.year ?? "?"}</span>
                      <span className="w-8 text-right tabular-nums">
                        <span className="sr-only">energy </span>
                        {s.energy}
                      </span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {meta && (
        <div className="surface p-5 sm:p-6">
          <h2 className="font-semibold">Orchestras in the index</h2>
          <p className="text-muted mt-1 text-xs">
            Tap one to search it. The number is how many recordings it has.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {meta.orchestras.slice(0, 80).map((o) => (
              <button
                type="button"
                key={o.id}
                onClick={() => setQ(o.name)}
                className={`chip ${o.tier === 1 ? "font-semibold" : ""}`}
              >
                {o.name} <span className="text-muted tabular-nums">{o.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
