"use client";
import { rangesLabel, versionsOf } from "@tdj/core";
import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { t as tx } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import type { Song } from "@/lib/types";
import { SongRow } from "../ui/SongRow";
import { useTip } from "../ui/Tip";

/**
 * Round 22 — every version of a title together (any orchestra, any year), each playable: a disclosure row under a
 * Database song; the list arrives when it opens. The side itself is marked.
 */
export function VersionsRow({ song }: { song: Song }) {
  const overrides = useStore((s) => s.overrides);
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Song[] | null>(null);
  const t = useTip<HTMLButtonElement>(tx("db.versions.every_recording_of_this_title_any"));
  useEffect(() => {
    if (!open || list) return;
    const ctl = new AbortController();
    fetch("/api/song-search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: { text: song.title, limit: 100 }, overrides }),
      signal: ctl.signal,
    })
      .then((r) => r.json())
      .then((j: { results?: Song[] }) => setList(versionsOf(j.results ?? [], song)))
      .catch(() => setList([]));
    return () => ctl.abort();
  }, [open, list, song, overrides]);
  const years = (list ?? []).map((s) => s.year).filter((y): y is number => !!y);
  const span = years.length ? rangesLabel([[Math.min(...years), Math.max(...years)]]) : "";
  const value = list ? [list.length, span].filter(Boolean).join(" · ") : tx("db.versions.show");
  return (
    <>
      <button
        type="button"
        className="cell cell-tap w-full text-left"
        aria-expanded={open}
        {...t.props}
        onClick={() => setOpen((v) => !v)}
        data-testid="db-versions"
      >
        {t.tag}
        <span className="min-w-0 flex-1">
          <span className="block truncate">{tx("db.versions.versions")}</span>
          <span className="text-footnote block truncate text-[var(--label-2)]">
            {tx("db.versions.every_recording_of_by_any_orchestra", { title: song.title })}
          </span>
        </span>
        <span className="cell-value text-body tabular-nums">{value}</span>
        <ChevronRight
          size={16}
          strokeWidth={2.5}
          className={`cell-chevron transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden
        />
      </button>
      {open && (
        <div className="bg-[var(--fill-4)]" data-testid="db-versions-list">
          {!list ? (
            <p className="text-footnote px-4 py-3 text-[var(--label-2)]">
              {tx("db.versions.finding_versions")}
            </p>
          ) : (
            list.map((v) => (
              <SongRow
                key={v.id}
                song={v}
                testId="db-version"
                pill={v.id === song.id ? tx("db.versions.this_side") : undefined}
              />
            ))
          )}
        </div>
      )}
    </>
  );
}
