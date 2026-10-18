"use client";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
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
        .then((r: Song[]) => setRows(r))
        .catch(() => setRows([]))
        .finally(() => setSearching(false));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);
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
          <Search size={16} className="shrink-0 opacity-70" aria-hidden />
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
        {q.length < 2 && (
          <p className="text-muted py-8 text-center text-sm">
            Type an orchestra, singer, title or year to search.
          </p>
        )}
        {q.length >= 2 && !searching && rows.length === 0 && (
          <p className="text-muted py-8 text-center text-sm">
            Nothing matches “{q}”. Try a shorter spelling.
          </p>
        )}
        {rows.length > 0 && (
          <div className="surface overflow-hidden">
            <p className="text-muted border-b border-[rgb(var(--text)/.08)] px-4 py-2 text-xs">
              {rows.length} results
            </p>
            <ul className="divide-y divide-[rgb(var(--text)/.08)]">
              {rows.map((s) => (
                <li key={s.id} className="flex min-h-11 items-center gap-3 px-4 py-2 text-sm">
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
                </li>
              ))}
            </ul>
          </div>
        )}
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
