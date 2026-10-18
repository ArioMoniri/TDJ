"use client";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import type { Song } from "@/lib/types";

interface Meta { meta: { songs: number; orchestras: number; singers: number; builtAt: string }; orchestras: Array<{ id: string; name: string; count: number; tier: number; style?: string }> }

export default function Library() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Song[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  useEffect(() => { fetch("/api/meta").then((r) => r.json()).then(setMeta); }, []);
  useEffect(() => { const t = setTimeout(() => { if (q.length >= 2) fetch(`/api/search?q=${encodeURIComponent(q)}`).then((r) => r.json()).then(setRows); else setRows([]); }, 200); return () => clearTimeout(t); }, [q]);
  return (
    <div className="space-y-4">
      <div className="glass p-5">
        <h1 className="font-serif text-3xl font-semibold">Library index</h1>
        {meta && <p className="text-muted mt-1 text-sm">{meta.meta.songs.toLocaleString()} recordings · {meta.meta.orchestras} orchestras · {meta.meta.singers} singers · built {new Date(meta.meta.builtAt).toLocaleDateString()} · hosted in this repo under data/index</p>}
        <label className="mt-4 flex items-center gap-2 rounded-full border border-white/30 bg-white/30 px-4 py-2 dark:bg-white/10"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, orchestra, singer, year… e.g. darienzo mauré vals" className="w-full bg-transparent outline-none" /></label>
      </div>
      {rows.length > 0 && (
        <div className="glass overflow-hidden">
          <ul className="divide-y divide-white/15">{rows.map((s) => <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm"><span className={`w-14 shrink-0 text-[10px] font-bold uppercase ${s.rhythm === "tango" ? "text-rose-400" : s.rhythm === "vals" ? "text-teal-400" : "text-violet-400"}`}>{s.rhythm}</span><span className="min-w-0 flex-1 truncate">{s.title} <span className="text-muted">· {s.orchestra}{s.singer ? ` / ${s.singer}` : ""}</span></span><span className="text-muted tabular-nums">{s.year ?? "?"}</span><span className="w-8 text-right tabular-nums">{s.energy}</span></li>)}</ul>
        </div>
      )}
      {meta && (
        <div className="glass p-5">
          <h2 className="font-semibold">Orchestras in the index</h2>
          <div className="mt-3 flex flex-wrap gap-2">{meta.orchestras.slice(0, 80).map((o) => <span key={o.id} className={`chip ${o.tier === 1 ? "chip-on" : ""}`}>{o.name} <span className="opacity-60">{o.count}</span></span>)}</div>
        </div>
      )}
    </div>
  );
}
