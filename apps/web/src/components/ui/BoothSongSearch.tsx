"use client";
import type { Playlist } from "@tdj/core";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Segmented } from "@/components/ui";
import { useBooth } from "@/lib/booth/store";
import { searchTonight, tandaQuery } from "@/lib/booth/tonightSearch";
import { favouriteIds } from "@/lib/favourites";
import { t as tx } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { yearText } from "@/lib/year";
import { Sheet } from "../Sheet";
import { SongSearchPanel } from "./SongSearchPanel";
import { Tip } from "./Tip";

type Scope = "tonight" | "catalogue";

/**
 * Round 22 — the song search in the Booth, self-contained (its own "Find songs" button and state, so the Booth page
 * only mounts it). 2026-11: it opens on TONIGHT's night — every song and cortina of the plan by title, orchestra,
 * singer and year, in night order, with its tanda and place, and Play now / Play next / Go to; "T12" is tanda 12.
 * "Whole catalogue" switches to every recording (the swap panel: the tanda that is playing and everything before it
 * are closed, sent locked, never changed; a swap or an add ahead of the playhead lands in the running night's plan).
 * Tonight is the scope every time it opens.
 */
export function BoothSongSearch({ onGoTo }: { onGoTo?: (planIndex: number) => void }) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>("tonight");
  const [q, setQ] = useState("");
  const playlist = useStore((s) => s.playlist);
  const started = useBooth((s) => s.started);
  const planIndex = useBooth((s) => s.planIndex);
  const plan = useBooth((s) => s.plan);
  const entities = useBooth((s) => s.entities);
  const sources = useBooth((s) => s.sources);
  const cur = useBooth((s) => s.plan?.items[s.planIndex]);
  const apply = useBooth((s) => s.applySwappedPlaylist);
  const hits = useMemo(
    () => (plan && q.trim() ? searchTonight(plan.items, entities, q) : []),
    [plan, entities, q],
  );
  // 2026-11: tonight's crowd favourites (dancer favourites, any role) carry a ♥
  const memory = useStore((s) => s.memory);
  const hearts = useMemo(
    () =>
      favouriteIds(
        memory,
        entities.flatMap((e) => (e && "rhythm" in e ? [e.id] : [])),
      ),
    [memory, entities],
  );
  if (!playlist) return null;
  // the plan counts tandas from 1; the panel from 0
  const running =
    !started || !cur ? undefined : cur.kind === "closing" && cur.tanda > 0 ? Infinity : cur.tanda - 1;
  const locked = (p: Playlist): Playlist =>
    running === undefined
      ? p
      : { ...p, tandas: p.tandas.map((t, i) => (i <= running ? { ...t, locked: true } : t)) };
  const show = (o: boolean) => {
    setOpen(o);
    // tonight is the scope every time the search opens
    if (o) {
      setScope("tonight");
      setQ("");
    }
  };
  const tandas = playlist.tandas.length;
  const jumpTanda = tandaQuery(q, tandas);
  const goTo = (i: number) => {
    show(false);
    onGoTo?.(i);
  };
  const b = useBooth.getState();
  return (
    <>
      <div className="mt-3 flex justify-end">
        <Tip text={tx("boothSongSearch.search_every_recording_swap_one_in")}>
          <button
            type="button"
            className="btn-plain min-h-11"
            onClick={() => show(true)}
            aria-expanded={open}
            data-testid="booth-find-songs"
          >
            <Search size={16} strokeWidth={2} aria-hidden /> {tx("boothSongSearch.find_songs")}
          </button>
        </Tip>
      </div>
      <Sheet
        open={open && scope === "tonight"}
        onClose={() => show(false)}
        title={tx("boothSongSearch.find_in_tonight")}
        trailing={tx("booth.sheets.done")}
        detents={["large"]}
        testId="booth-tonight-search"
      >
        <div className="flex flex-col gap-3 px-4 pt-2">
          <Segmented<Scope>
            value={scope}
            items={[
              ["tonight", tx("boothSongSearch.tonight")],
              ["catalogue", tx("boothSongSearch.whole_catalogue")],
            ]}
            onChange={setScope}
            label={tx("boothSongSearch.scope")}
            size="large"
          />
          <input
            type="search"
            className="field min-h-11 w-full"
            placeholder={tx("boothSongSearch.tonight_placeholder")}
            aria-label={tx("boothSongSearch.tonight_placeholder")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              // "T12" + Enter: the set list goes to that tanda
              if (e.key === "Enter" && jumpTanda !== null && hits[0]) {
                e.preventDefault();
                goTo(hits[0].i);
              }
            }}
            data-testid="booth-tonight-q"
            // biome-ignore lint/a11y/noAutofocus: the sheet opens to type a search
            autoFocus
          />
        </div>
        {q.trim() && hits.length === 0 ? (
          <p className="text-subhead px-4 py-6 text-[var(--label-2)]" data-testid="booth-tonight-empty">
            {tx("boothSongSearch.nothing_tonight")}
          </p>
        ) : (
          <ol className="mt-2 px-2" data-testid="booth-tonight-results">
            {hits.map((h) => {
              const it = plan!.items[h.i]!;
              const played = started && h.i < planIndex;
              const playable = (sources[h.i] ?? "missing") !== "missing";
              return (
                <li
                  key={h.i}
                  className="flex items-center gap-2 rounded-[10px] px-2 py-1"
                  data-testid="booth-tonight-hit"
                  data-plan-index={h.i}
                  data-current={h.i === planIndex || undefined}
                >
                  <span
                    className="text-caption1 w-14 flex-none font-semibold tabular-nums text-[var(--tint)]"
                    data-testid="booth-tonight-where"
                  >
                    {h.kind === "cortina"
                      ? tx("boothSongSearch.cortina_after", { tanda: h.tanda })
                      : h.tanda > 0
                        ? tx("boothSongSearch.tanda_pos", { tanda: h.tanda, p1: h.k })
                        : "—"}
                  </span>
                  <span className={`min-w-0 flex-1 ${played ? "opacity-60" : ""}`}>
                    <span className="text-subhead block truncate font-semibold">
                      {!!it.id && hearts.has(it.id) && (
                        <span
                          className="booth-fav mr-1"
                          title={tx("fav.badge_hint")}
                          role="img"
                          aria-label={tx("fav.crowd_favourite")}
                          data-testid="booth-tonight-fav"
                        >
                          ♥
                        </span>
                      )}
                      {it.title}
                    </span>
                    <span className="text-footnote block truncate text-[var(--label-2)]">
                      {it.artist}
                      {it.year ? ` · ${yearText(it.year)}` : ""}
                      {played ? ` · ${tx("boothSongSearch.played")}` : ""}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="btn-plain min-h-11 px-2"
                    disabled={!playable || (started && h.i === planIndex)}
                    onClick={() => {
                      show(false);
                      void b.playNow(h.i);
                    }}
                    data-testid="booth-tonight-play"
                  >
                    {tx("boothSongSearch.play_now")}
                  </button>
                  {started && (
                    <button
                      type="button"
                      className="btn-plain min-h-11 px-2"
                      disabled={!playable || h.i === planIndex}
                      onClick={() => {
                        b.playNext(h.i);
                        toast(tx("booth.songSheet.plays_next", { title: it.title }));
                        show(false);
                      }}
                      data-testid="booth-tonight-next"
                    >
                      {tx("boothSongSearch.play_next")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-plain min-h-11 px-2"
                    onClick={() => goTo(h.i)}
                    data-testid="booth-tonight-goto"
                  >
                    {tx("boothSongSearch.go_to")}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </Sheet>
      <SongSearchPanel
        open={open && scope === "catalogue"}
        onClose={() => show(false)}
        playlist={locked(playlist)}
        closedBefore={running}
        onChange={async (np) => {
          await apply({
            ...np,
            tandas: np.tandas.map((x, i) => ({ ...x, locked: x.pinned ? true : playlist.tandas[i]?.locked })),
          });
        }}
      />
    </>
  );
}
