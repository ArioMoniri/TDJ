"use client";
import type { Playlist } from "@tdj/core";
import { ArrowRight, ListEnd, Play, Repeat2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { durationLabel } from "@/lib/booth/plan";
import { useBooth } from "@/lib/booth/store";
import { swapWhen, useBoothSwap } from "@/lib/booth/swap";
import { byTanda, findTonight, tandaQuery } from "@/lib/booth/tonightSearch";
import { favouriteIds } from "@/lib/favourites";
import { t as tx } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { yearText } from "@/lib/year";
import { BoothSwapSheet } from "../booth/BoothSwapSheet";
import { BoothTandaSwap } from "../booth/BoothTandaSwap";
import { Sheet } from "../Sheet";
import { Artwork } from "./Artwork";
import { ConfirmBar, HitRow, roomPlaying, ScopeSwitch, SearchBar } from "./BoothSearchBits";
import { SongSearchPanel } from "./SongSearchPanel";
import { Tip } from "./Tip";

type Scope = "tonight" | "catalogue";

/**
 * Round 22 — the song search in the Booth, self-contained (its own "Find songs" button and state, so the Booth page
 * only mounts it). 2026-11: it opens on TONIGHT's night — every song and cortina of the plan by title, orchestra,
 * singer and year, in night order, with its tanda and place, and Play now / Play next / Swap / Go to; "T12" is tanda
 * 12; the empty field lists the whole night by tanda. "Whole catalogue" switches to every recording (the swap panel:
 * the tanda that is playing and everything before it are closed, sent locked, never changed; a swap or an add ahead
 * of the playhead lands in the running night's plan). Tonight is the scope every time it opens.
 *
 * 2026-11 (the owner's iPad: "the search won't work on the playlist songs"): the field had `autoFocus`, but the
 * Sheet moved the focus to its first control 30 ms later — the desktop bar's Cancel, first in document order — so
 * typing on the iPad's keyboard went nowhere, and an empty field listed nothing at all: the sheet looked dead. The
 * Sheet now leaves a focused field alone (and honours `data-autofocus`), and the empty field lists the night.
 * It also mounts the Booth's Swap sheet (BoothSwapSheet), which any row or card opens through `useBoothSwap`.
 */
export function BoothSongSearch({ onGoTo }: { onGoTo?: (planIndex: number) => void }) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>("tonight");
  const [q, setQ] = useState("");
  // Play now while the room plays asks first, inside the sheet
  const [ask, setAsk] = useState<number | null>(null);
  const playlist = useStore((s) => s.playlist);
  const started = useBooth((s) => s.started);
  const planIndex = useBooth((s) => s.planIndex);
  const plan = useBooth((s) => s.plan);
  const entities = useBooth((s) => s.entities);
  const sources = useBooth((s) => s.sources);
  const cur = useBooth((s) => s.plan?.items[s.planIndex]);
  const apply = useBooth((s) => s.applySwappedPlaylist);
  const openSwap = useBoothSwap((s) => s.open);
  const hits = useMemo(() => (plan ? findTonight(plan.items, entities, q) : []), [plan, entities, q]);
  const groups = useMemo(() => byTanda(hits), [hits]);
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
  if (!playlist) return <BoothSwapSheet />;
  // the plan counts tandas from 1; the panel from 0
  const running =
    !started || !cur ? undefined : cur.kind === "closing" && cur.tanda > 0 ? Infinity : cur.tanda - 1;
  const locked = (p: Playlist): Playlist =>
    running === undefined
      ? p
      : { ...p, tandas: p.tandas.map((t, i) => (i <= running ? { ...t, locked: true } : t)) };
  const show = (o: boolean) => {
    setOpen(o);
    setAsk(null);
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
  const playNow = (i: number) => {
    show(false);
    void useBooth.getState().playNow(i);
  };
  const groupTitle = (tanda: number) => {
    if (tanda === 0) return tx("boothSongSearch.opening");
    if (tanda < 0) return tx("boothSongSearch.closing");
    const t = playlist.tandas[tanda - 1];
    return t
      ? tx("boothSongSearch.tanda_head", {
          tanda,
          rhythm: t.rhythm,
          orchestra: t.singer ? `${t.orchestra} / ${t.singer}` : t.orchestra,
        })
      : tx("boothSongSearch.tanda_short", { tanda });
  };
  const asking = ask !== null ? plan?.items[ask] : undefined;
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
        width={680}
        testId="booth-tonight-search"
      >
        <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-2 bg-[var(--material-thick)] px-4 pt-2 pb-2">
          <SearchBar
            value={q}
            onChange={(v) => {
              setQ(v);
              setAsk(null);
            }}
            placeholder={tx("boothSongSearch.tonight_placeholder")}
            testId="booth-tonight-q"
            // "T12" + Enter: the set list goes to that tanda
            onEnter={jumpTanda !== null && hits[0] ? () => goTo(hits[0]!.i) : undefined}
          />
          <ScopeSwitch<Scope>
            value={scope}
            items={[
              ["tonight", tx("boothSongSearch.tonight")],
              ["catalogue", tx("boothSongSearch.whole_catalogue")],
            ]}
            onChange={setScope}
            label={tx("boothSongSearch.scope")}
            testId="booth-tonight-scope"
          />
          {asking && ask !== null && (
            <ConfirmBar
              text={tx("boothSongSearch.confirm_play_now", {
                playing: cur?.title ?? "",
                title: asking.title,
              })}
              yes={tx("boothSongSearch.confirm_yes")}
              onYes={() => playNow(ask)}
              onNo={() => setAsk(null)}
              testId="booth-tonight-confirm"
            />
          )}
        </div>
        <div className="min-h-[55dvh]">
          {q.trim() && hits.length === 0 ? (
            <p className="text-subhead px-2 py-6 text-[var(--label-2)]" data-testid="booth-tonight-empty">
              {tx("boothSongSearch.nothing_tonight")}
            </p>
          ) : (
            <div data-testid="booth-tonight-results" data-count={hits.length}>
              {groups.map((g) => (
                <section
                  key={`${g.tanda}-${g.hits[0]!.i}`}
                  data-testid="booth-tonight-group"
                  data-tanda={g.tanda}
                >
                  <h3 className="text-caption1 truncate px-2 pt-3 pb-1 font-semibold uppercase tracking-wide text-[var(--label-2)]">
                    {groupTitle(g.tanda)}
                  </h3>
                  <ol>
                    {g.hits.map((h) => {
                      const it = plan!.items[h.i]!;
                      const e = entities[h.i] ?? null;
                      const played = started && h.i < planIndex;
                      const playing = started && h.i === planIndex;
                      const playable = (sources[h.i] ?? "missing") !== "missing";
                      const when = swapWhen(h.i, planIndex, started);
                      const swappable = (it.kind === "track" || it.kind === "cortina") && when !== "played";
                      return (
                        <HitRow
                          key={h.i}
                          testId="booth-tonight-hit"
                          whereTestId="booth-tonight-where"
                          data={{ "plan-index": h.i, current: playing ? "true" : undefined }}
                          current={playing}
                          dim={played}
                          where={
                            h.kind === "closing"
                              ? h.i === 0
                                ? tx("boothSongSearch.opening")
                                : tx("boothSongSearch.closing")
                              : h.kind === "cortina"
                                ? tx("boothSongSearch.cortina_after", { tanda: h.tanda })
                                : tx("boothSongSearch.tanda_pos", { tanda: h.tanda, p1: h.k })
                          }
                          art={
                            <Artwork
                              entity={e}
                              orchestra={(e as { orchestra?: string } | null)?.orchestra ?? it.artist}
                              size={40}
                            />
                          }
                          title={
                            <>
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
                            </>
                          }
                          sub={
                            <>
                              {it.artist}
                              {it.year ? ` · ${yearText(it.year)}` : ""}
                              {playing ? ` · ${tx("boothSongSearch.playing")}` : ""}
                              {played ? ` · ${tx("boothSongSearch.played")}` : ""}
                            </>
                          }
                          length={durationLabel(it.lengthSec)}
                        >
                          <button
                            type="button"
                            className="btn-plain min-h-11 min-w-11 px-2"
                            disabled={!playable || playing}
                            aria-label={`${started ? tx("boothSongSearch.play_now") : tx("boothSongSearch.start_here")}: ${it.title}`}
                            onClick={() => (roomPlaying(useBooth.getState()) ? setAsk(h.i) : playNow(h.i))}
                            data-testid="booth-tonight-play"
                          >
                            <Play
                              size={14}
                              fill="currentColor"
                              strokeWidth={0}
                              className="sm:hidden"
                              aria-hidden
                            />
                            <span className="max-sm:sr-only">
                              {started ? tx("boothSongSearch.play_now") : tx("boothSongSearch.start_here")}
                            </span>
                          </button>
                          {started && (
                            <button
                              type="button"
                              className="btn-plain min-h-11 min-w-11 px-2"
                              disabled={!playable || playing}
                              aria-label={`${tx("boothSongSearch.play_next")}: ${it.title}`}
                              onClick={() => {
                                b.playNext(h.i);
                                toast(tx("booth.songSheet.plays_next", { title: it.title }));
                                show(false);
                              }}
                              data-testid="booth-tonight-next"
                            >
                              <ListEnd size={16} strokeWidth={2} className="sm:hidden" aria-hidden />
                              <span className="max-sm:sr-only">{tx("boothSongSearch.play_next")}</span>
                            </button>
                          )}
                          {swappable && (
                            <button
                              type="button"
                              className="icon-btn icon-btn-bare h-11 w-11 flex-none"
                              aria-label={tx("boothSwap.swap_label", { title: it.title })}
                              data-hint={tx("boothSwap.swap")}
                              onClick={() => {
                                show(false);
                                openSwap(h.i);
                              }}
                              data-testid="booth-tonight-swap"
                            >
                              <Repeat2 size={16} strokeWidth={2} aria-hidden />
                            </button>
                          )}
                          <button
                            type="button"
                            className="icon-btn icon-btn-bare h-11 w-11 flex-none"
                            aria-label={`${tx("boothSongSearch.go_to")}: ${it.title}`}
                            data-hint={tx("boothSongSearch.go_to")}
                            onClick={() => goTo(h.i)}
                            data-testid="booth-tonight-goto"
                          >
                            <ArrowRight size={16} strokeWidth={2} aria-hidden />
                          </button>
                        </HitRow>
                      );
                    })}
                  </ol>
                </section>
              ))}
            </div>
          )}
        </div>
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
      <BoothSwapSheet />
      <BoothTandaSwap />
    </>
  );
}
