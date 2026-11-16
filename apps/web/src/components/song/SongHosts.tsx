"use client";
import type { Song } from "@tdj/core";
import { ChevronRight, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { type SidesQuery, useSongOpen } from "@/lib/songOpen";
import { Group } from "../Form";
import { Sheet } from "../Sheet";
import { DnaLink } from "./DnaLink";
import { DnaView } from "./DnaViews";
import { SidesList } from "./SidesList";
import { SongDetails } from "./SongDetails";
import "./song.css";

/** The app-wide song sheets (lib/songOpen.ts), mounted once in the root layout. */
export function SongHosts() {
  const song = useSongOpen((s) => s.song);
  const sides = useSongOpen((s) => s.sides);
  const dna = useSongOpen((s) => s.dna);
  const close = useSongOpen((s) => s.close);
  // a link to a page (a DNA link outside the Booth) closes the sheets it was in
  const path = usePathname();
  const query = useSearchParams()?.toString();
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on a navigation
  useEffect(() => {
    useSongOpen.setState({ song: null, sides: null });
  }, [path, query]);
  return (
    <>
      <Sheet
        open={!!song}
        onClose={() => close("song")}
        title={song?.title ?? ""}
        trailing={t("song.done")}
        detents={["large"]}
        testId="song-details-sheet"
      >
        {song && <SongDetails song={song} />}
      </Sheet>
      <Sheet
        open={!!sides}
        onClose={() => close("sides")}
        title={sides ? sidesTitle(sides) : ""}
        trailing={t("song.done")}
        detents={["large"]}
        testId="sides-sheet"
      >
        {sides && <SidesBody q={sides} />}
      </Sheet>
      {dna && <DnaOverlay />}
    </>
  );
}

const sidesTitle = (q: SidesQuery) =>
  q.instrumental
    ? t("song.sides_instrumental_title", { orchestra: q.orchestra })
    : q.singer
      ? t("song.sides_with_title", { orchestra: q.orchestra, singer: q.singer })
      : q.orchestra;

function SidesBody({ q }: { q: SidesQuery }) {
  const [songs, setSongs] = useState<Song[] | null>(null);
  useEffect(() => {
    let live = true;
    setSongs(null);
    const p = new URLSearchParams({ kind: "sides", id: q.orchestraId });
    if (q.singer) p.set("singer", q.singer);
    if (q.instrumental) p.set("instrumental", "1");
    fetch(`/api/dna?${p}`)
      .then((r) => (r.ok ? r.json() : { songs: [] }))
      .then((j: { songs?: Song[] }) => live && setSongs(j.songs ?? []))
      .catch(() => live && setSongs([]));
    return () => {
      live = false;
    };
  }, [q]);
  const singerId = songs?.find((s) => s.singerId)?.singerId;
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1">
      <Group>
        <DnaLink
          to={{ kind: "orchestra", id: q.orchestraId }}
          className="cell cell-tap w-full text-left"
          testId="sides-open-orchestra"
        >
          <span className="min-w-0 flex-1">{t("song.open_orchestra_page", { orchestra: q.orchestra })}</span>
          <ChevronRight size={16} strokeWidth={2.5} className="cell-chevron" aria-hidden />
        </DnaLink>
        {q.singer && singerId && (
          <DnaLink
            to={{ kind: "singer", id: singerId }}
            className="cell cell-tap w-full text-left"
            testId="sides-open-singer"
          >
            <span className="min-w-0 flex-1">{t("song.open_singer_page", { singer: q.singer })}</span>
            <ChevronRight size={16} strokeWidth={2.5} className="cell-chevron" aria-hidden />
          </DnaLink>
        )}
      </Group>
      <h2 className="section-head">
        {songs ? t("song.sides_count", { n: songs.length }) : t("song.loading")}
      </h2>
      {songs && <SidesList songs={songs} label={sidesTitle(q)} testId="sides" />}
    </div>
  );
}

/** the DNA pages over the Booth (its page leaving would end the night), with the control layer's glass bar */
function DnaOverlay() {
  const dna = useSongOpen((s) => s.dna)!;
  const close = () => useSongOpen.getState().close("dna");
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && useSongOpen.getState().close("dna");
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  return (
    <div
      className="dna-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("song.song_dna")}
      data-testid="dna-overlay"
    >
      <div className="dna-overlay-bar">
        <button
          type="button"
          className="icon-btn h-11 w-11"
          aria-label={t("song.close")}
          onClick={close}
          data-testid="dna-overlay-close"
        >
          <X size={18} strokeWidth={2.25} aria-hidden />
        </button>
      </div>
      <div className="dna-overlay-body">
        <DnaView target={dna} />
      </div>
    </div>
  );
}
