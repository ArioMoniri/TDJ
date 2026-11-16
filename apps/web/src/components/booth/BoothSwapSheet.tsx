"use client";
import type { Cortina, Playlist, Song } from "@tdj/core";
import { useEffect, useMemo, useState } from "react";
import { durationLabel } from "@/lib/booth/plan";
import { useBooth } from "@/lib/booth/store";
import {
  type Chair,
  chairOf,
  cortinaOptions,
  exchange,
  swapWhen,
  useBoothSwap,
  withCortina,
} from "@/lib/booth/swap";
import { findTonight } from "@/lib/booth/tonightSearch";
import { undoEdit } from "@/lib/editHistory";
import { useMediaQuery } from "@/lib/hooks";
import { t as tx } from "@/lib/i18n";
import { requestFavourites } from "@/lib/popularity";
import { gateEdit } from "@/lib/ruleCheck";
import type { SourceId, Version } from "@/lib/smartSearch";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useSmartSearch } from "@/lib/useSmartSearch";
import { yearText } from "@/lib/year";
import { Sheet } from "../Sheet";
import type { SwapSide } from "../SwapSheet";
import { Artwork } from "../ui/Artwork";
import { ConfirmBar, HitRow, PreviewButton, ScopeSwitch, SearchBar } from "../ui/BoothSearchBits";
import { SmartSearchField, SmartSearchResults } from "../ui/SmartSearch";

type Scope = "catalogue" | "tonight";

/** the cortina pool (/api/meta's list), fetched once per page */
let pool: Promise<Cortina[]> | null = null;
const cortinaPool = () => {
  pool ??= fetch("/api/meta")
    .then((r) => r.json())
    .then((j: { cortinaList?: Cortina[] }) => j.cortinaList ?? [])
    .catch(() => {
      pool = null;
      return [];
    });
  return pool;
};

/** a wire side as a song (Artwork, the pre-listen and the era read it) */
const asSong = (s: SwapSide["song"]): Song =>
  ({
    ...s,
    orchestraId: s.orchestraId ?? s.orchestra,
    vocal: s.vocal ?? !!s.singer,
    singerId: null,
    rhythm: s.rhythm ?? "tango",
  }) as unknown as Song;

/**
 * 2026-11 (the owner: "swapping music while others are playing should be fast and easy, like clicking swap, searching
 * the song and changing"): one tap on a row's Swap opens this sheet for that place. "Suggested" first (the same
 * orchestra and singer, the era, the energy, ♥ dancer favourites first, from /api/swap-options; for a cortina, the
 * cortinas not played tonight, the same kind first), a search over the whole catalogue or, with the switch, tonight's
 * night (picking one of tonight's trades the two places). Picking a result replaces the place at once: the rule
 * check runs (a hard break asks in the RuleConfirmSheet; none asks nothing), the plan re-times, the sources resolve
 * again (a file, the stored Spotify uri or the hosted match, a clip) and a toast offers Undo. A place ahead of the
 * playhead never touches what the room hears; the playing place swaps only after a confirm here (then the room fades
 * to the new song); a played place is closed. Every result pre-listens in the headphones only.
 */
export function BoothSwapSheet() {
  const i = useBoothSwap((s) => s.i);
  const close = useBoothSwap((s) => s.close);
  const it = useBooth((s) => (i === null ? undefined : s.plan?.items[i]));
  const entity = useBooth((s) => (i === null ? null : (s.entities[i] ?? null)));
  const playlist = useBooth((s) => s.playlist);
  const plan = useBooth((s) => s.plan);
  const entities = useBooth((s) => s.entities);
  const started = useBooth((s) => s.started);
  const planIndex = useBooth((s) => s.planIndex);
  const hearing = useBooth((s) => s.audition?.songId ?? null);
  const learn = useStore((s) => s.settings.learn);
  const isPhone = useMediaQuery("(max-width: 599.98px)");
  const chair = playlist && it ? chairOf(playlist, it) : null;
  const open = i !== null && !!chair;
  const when = i === null ? "ahead" : swapWhen(i, planIndex, started);
  const [scope, setScope] = useState<Scope>("catalogue");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sides, setSides] = useState<{ suggestions: SwapSide[]; results: SwapSide[] }>({
    suggestions: [],
    results: [],
  });
  const [cortinas, setCortinas] = useState<Cortina[] | null>(null);
  // the playing place: the pick waits for "Swap and play"
  const [ask, setAsk] = useState<{ title: string; run: () => Promise<void> } | null>(null);

  // a fresh sheet each time it opens
  // biome-ignore lint/correctness/useExhaustiveDependencies: a fresh sheet whenever it opens for another place
  useEffect(() => {
    setQ("");
    setScope("catalogue");
    setNote(null);
    setAsk(null);
    setBusy(null);
    setSides({ suggestions: [], results: [] });
  }, [i]);

  const ti = chair?.ti ?? -1;
  const si = chair?.kind === "track" ? chair.si : -1;
  const kind = chair?.kind;
  // a cortina searches the cortina pool here; a song asks the smart search (catalogue + connected services)
  const query = scope === "catalogue" && kind !== "track" ? q.trim() : "";
  const rhythm = ti >= 0 ? playlist?.tandas[ti]?.rhythm : undefined;
  /** 2026-11: tonight's sides with a linked file show it as a source */
  const files = useMemo(() => {
    const out = new Set<string>();
    plan?.items.forEach((x, k) => {
      if (x.kind === "track" && x.id && useBooth.getState().sources[k] === "file") out.add(x.id);
    });
    return out;
  }, [plan]);
  const extraSources = useMemo(
    () =>
      (s: Song): SourceId[] =>
        files.has(s.id) ? ["local"] : [],
    [files],
  );
  const ss = useSmartSearch({
    value: kind === "track" && scope === "catalogue" ? q : "",
    onChange: setQ,
    defaultFilters: rhythm ? { rhythms: [rhythm] } : {},
    limit: 30,
    extraSources,
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: the chair's rhythm chip on, each time the sheet opens
  useEffect(() => {
    ss.setFilters(rhythm ? { rhythms: [rhythm] } : {});
  }, [i, rhythm]);
  /** the smart search's catalogue sides judged for this chair (ok, why not, or the rule check asks) */
  const [judged, setJudged] = useState<Map<string, SwapSide>>(new Map());
  const ids = useMemo(
    () =>
      ss.versions
        .filter((v) => v.hit)
        .slice(0, 60)
        .map((v) => v.song.id),
    [ss.versions],
  );
  const idKey = ids.join("|");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `idKey` stands for the ids
  useEffect(() => {
    if (!open || kind !== "track" || !ids.length) return;
    const ctl = new AbortController();
    fetch("/api/swap-options", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playlist: useBooth.getState().playlist, tandaIndex: ti, trackIndex: si, ids }),
      signal: ctl.signal,
    })
      .then((r) => r.json())
      .then((j: { judged?: SwapSide[] }) =>
        setJudged((m) => {
          const next = new Map(m);
          for (const x of j.judged ?? []) next.set(x.song.id, x);
          return next;
        }),
      )
      .catch(() => {});
    return () => ctl.abort();
  }, [open, kind, idKey, ti, si]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new place judges afresh
  useEffect(() => setJudged(new Map()), [i]);
  // the song's lists: Suggested at once, the catalogue search after a short pause
  useEffect(() => {
    if (!open || kind !== "track") return;
    const ctl = new AbortController();
    setLoading(true);
    const h = setTimeout(
      () => {
        fetch("/api/swap-options", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            playlist: useBooth.getState().playlist,
            tandaIndex: ti,
            trackIndex: si,
            query,
            favourites: requestFavourites(useStore.getState().memory) ?? null,
          }),
          signal: ctl.signal,
        })
          .then((r) => r.json())
          .then((j) => setSides({ suggestions: j.suggestions ?? [], results: j.results ?? [] }))
          .catch(() => {})
          .finally(() => !ctl.signal.aborted && setLoading(false));
      },
      query ? 200 : 0,
    );
    return () => {
      clearTimeout(h);
      ctl.abort();
    };
  }, [open, kind, ti, si, query]);
  useEffect(() => {
    if (!open || kind !== "cortina") return;
    let live = true;
    void cortinaPool().then((p) => live && setCortinas(p));
    return () => {
      live = false;
    };
  }, [open, kind]);

  const tonightIds = useMemo(
    () => new Set((playlist?.tandas ?? []).flatMap((t) => (t.cortina ? [t.cortina.id] : []))),
    [playlist],
  );
  const current = chair?.kind === "cortina" ? (playlist?.tandas[chair.ti]?.cortina ?? null) : null;
  const cortinaSuggested = useMemo(
    () => (current && cortinas ? cortinaOptions(cortinas, current, tonightIds, "") : []),
    [cortinas, current, tonightIds],
  );
  const cortinaResults = useMemo(
    () =>
      current && cortinas && q.trim().length >= 2 ? cortinaOptions(cortinas, current, tonightIds, q, 30) : [],
    [cortinas, current, tonightIds, q],
  );
  // tonight's places of the same kind that are still ahead (a played or playing place never moves)
  const tonight = useMemo(() => {
    if (!open || scope !== "tonight" || !plan) return [];
    return findTonight(plan.items, entities, q).filter(
      (h) =>
        h.i !== i &&
        h.kind === it?.kind &&
        swapWhen(h.i, planIndex, started) === "ahead" &&
        !!playlist &&
        !!chairOf(playlist, plan.items[h.i]),
    );
  }, [open, scope, plan, entities, q, i, it?.kind, planIndex, started, playlist]);

  if (!open || i === null || !it || !chair || !playlist) {
    return (
      <Sheet open={false} onClose={close} title={tx("boothSwap.swap")} testId="booth-swap-sheet">
        {null}
      </Sheet>
    );
  }

  /** put `after` in the night through the rule check; the playing place first asks, then the room fades to it */
  const commit = async (after: Playlist, title: string, label: string) => {
    const before = useBooth.getState().playlist ?? playlist;
    const b = useBooth.getState();
    const res = await gateEdit({
      before,
      after,
      label,
      apply: async (p) => {
        useBooth.getState().stopAudition();
        await useBooth.getState().applySwappedPlaylist(p);
      },
      learn,
    });
    if (res === "cancelled") return;
    close();
    if (when === "playing") void b.playNow(i);
    // (a rule outcome said so itself, with its own Undo)
    if (res === "applied")
      // the toast's Undo is the one undo history (⌘Z walks the same)
      toast(tx("boothSwap.swapped", { title }), () => {
        void undoEdit().then((e) => e && toast(tx("boothSwap.undone")));
      });
  };
  /** the playing place asks first (inside this sheet); a place ahead swaps at once */
  const choose = (title: string, run: () => Promise<void>) => {
    if (when === "played") return;
    if (when === "playing") {
      setAsk({ title, run });
      return;
    }
    void run();
  };
  const pickSide = (x: SwapSide) =>
    choose(x.song.title, async () => {
      setBusy(x.song.id);
      setNote(null);
      try {
        const before = useBooth.getState().playlist ?? playlist;
        const r = await fetch("/api/swap-track", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            playlist: before,
            tandaIndex: ti,
            trackIndex: si,
            songId: x.song.id,
            force: !x.ok,
          }),
        });
        const j = (await r.json()) as Playlist & { changed?: boolean; reason?: string };
        if (!r.ok || !j.changed) {
          setNote(j.reason ? tx("boothSwap.failed", { reason: j.reason }) : tx("boothSwap.failed_plain"));
          return;
        }
        const { changed: _c, reason: _r, ...after } = j;
        await commit(after as Playlist, x.song.title, tx("swapSheet.swapped_in", { title: x.song.title }));
      } finally {
        setBusy(null);
      }
    });
  /** a connected service's recording takes the chair: the tanda with it in that place (POST /api/tanda-set) */
  const pickExternal = (v: Version) =>
    choose(v.song.title, async () => {
      if (chair.kind !== "track") return;
      setBusy(v.song.id);
      setNote(null);
      try {
        const before = useBooth.getState().playlist ?? playlist;
        const t = before.tandas[ti];
        if (!t) return;
        const r = await fetch("/api/tanda-set", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            playlist: before,
            tandaIndex: ti,
            sides: t.songs.map((x, k) => (k === si ? v.song : x.id)),
          }),
        });
        const j = (await r.json().catch(() => ({}))) as Playlist & { changed?: boolean; reason?: string };
        if (!r.ok || !j.changed) {
          setNote(j.reason ? tx("boothSwap.failed", { reason: j.reason }) : tx("boothSwap.failed_plain"));
          return;
        }
        const { changed: _c, reason: _r, ...after } = j;
        await commit(after as Playlist, v.song.title, tx("swapSheet.swapped_in", { title: v.song.title }));
      } finally {
        setBusy(null);
      }
    });
  /** a version of the smart search: a catalogue side as judged for this chair, or a service's recording */
  const pickVersion = (v: Version) => {
    if (!v.hit) return pickExternal(v);
    const x: SwapSide = judged.get(v.song.id) ?? {
      ok: false,
      asks: true,
      fit: 0,
      song: v.song as unknown as SwapSide["song"],
    };
    if (!x.ok && !x.asks) {
      setNote(tx("boothSwap.failed", { reason: x.reason ?? "" }));
      return;
    }
    pickSide(x);
  };
  const pickCortina = (c: Cortina) =>
    choose(c.title, async () => {
      if (chair.kind !== "cortina") return;
      const before = useBooth.getState().playlist ?? playlist;
      await commit(withCortina(before, chair.ti, c), c.title, tx("boothSwap.swapped", { title: c.title }));
    });
  const pickTonight = (j: number) => {
    const other = plan?.items[j];
    const b = other ? chairOf(playlist, other) : null;
    if (!other || !b) return;
    choose(other.title, async () => {
      const before = useBooth.getState().playlist ?? playlist;
      const after = exchange(before, chair as Chair, b);
      if (!after) {
        setNote(tx("boothSwap.failed_plain"));
        return;
      }
      await commit(after, other.title, tx("boothSwap.traded", { a: it.title, b: other.title }));
    });
  };
  const listen = async (o: { song?: Song; i?: number }) => {
    const why = await useBooth.getState().prelisten(o);
    if (why) toast(tx("booth.songSheet.can_t_pre_listen", { why }));
  };
  const stop = () => useBooth.getState().stopAudition();

  const sideRow = (x: SwapSide, list: string) => {
    const s = asSong(x.song);
    const pickable = (x.ok || !!x.asks) && when !== "played";
    const len = (x.song as { durationSec?: number }).durationSec;
    return (
      <HitRow
        key={`${list}-${x.song.id}`}
        testId={list === "s" ? "booth-swap-suggestion" : "booth-swap-result"}
        data={{ id: x.song.id, ok: x.ok ? "1" : x.asks ? "asks" : "0" }}
        dim={!x.ok}
        art={<Artwork entity={s} orchestra={x.song.orchestra} size={40} />}
        onArt={() => (hearing === x.song.id ? stop() : void listen({ song: s }))}
        artLabel={tx("boothSwap.preview", { title: x.song.title })}
        title={
          <>
            {x.favourite && (
              <span
                className="booth-fav mr-1"
                role="img"
                aria-label={tx("fav.crowd_favourite")}
                data-testid="booth-swap-fav"
              >
                ♥
              </span>
            )}
            {x.song.title}
          </>
        }
        sub={[
          x.song.orchestra,
          x.song.singer ?? tx("booth.songSheet.instrumental"),
          yearText(x.song.year),
          x.ok ? null : x.asks ? tx("boothSwap.asks", { reason: x.reason ?? "" }) : x.reason,
        ]
          .filter(Boolean)
          .join(" · ")}
        length={len ? durationLabel(len) : undefined}
      >
        <PreviewButton
          hearing={hearing === x.song.id}
          label={tx("boothSwap.preview", { title: x.song.title })}
          onPlay={() => void listen({ song: s })}
          onStop={stop}
        />
        <button
          type="button"
          className="btn-plain min-h-11 min-w-11 px-2 font-semibold"
          disabled={!pickable || !!busy}
          aria-label={tx("boothSwap.use_label", { title: x.song.title })}
          onClick={() => pickSide(x)}
          data-testid="booth-swap-pick"
        >
          {busy === x.song.id ? "…" : tx("boothSwap.use")}
        </button>
      </HitRow>
    );
  };
  const cortinaRow = (c: Cortina, list: string) => (
    <HitRow
      key={`${list}-${c.id}`}
      testId={list === "s" ? "booth-swap-suggestion" : "booth-swap-result"}
      data={{ id: c.id, ok: "1" }}
      art={<Artwork entity={c} orchestra={c.artist} size={40} />}
      onArt={() => (hearing === c.id ? stop() : void listen({ song: c as unknown as Song }))}
      artLabel={tx("boothSwap.preview", { title: c.title })}
      title={c.title}
      sub={[c.artist, c.genre, c.year ? String(c.year) : null].filter(Boolean).join(" · ")}
    >
      <PreviewButton
        hearing={hearing === c.id}
        label={tx("boothSwap.preview", { title: c.title })}
        onPlay={() => void listen({ song: c as unknown as Song })}
        onStop={stop}
      />
      <button
        type="button"
        className="btn-plain min-h-11 min-w-11 px-2 font-semibold"
        disabled={when === "played" || !!busy}
        aria-label={tx("boothSwap.use_label", { title: c.title })}
        onClick={() => pickCortina(c)}
        data-testid="booth-swap-pick"
      >
        {tx("boothSwap.use")}
      </button>
    </HitRow>
  );
  const where =
    it.kind === "cortina"
      ? tx("boothSongSearch.cortina_after", { tanda: it.tanda })
      : tx("boothSongSearch.tanda_pos", { tanda: it.tanda, p1: chair.kind === "track" ? chair.si + 1 : 0 });
  const suggestions = kind === "track" ? sides.suggestions : cortinaSuggested;
  const searching = scope === "catalogue" && q.trim().length >= 2;
  const results = kind === "track" ? sides.results : cortinaResults;
  return (
    <Sheet
      open
      onClose={close}
      title={tx("boothSwap.title", { title: it.title })}
      trailing={tx("booth.sheets.done")}
      detents={["large"]}
      width={680}
      testId="booth-swap-sheet"
    >
      <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-2 bg-[var(--material-thick)] px-4 pt-2 pb-2">
        <div className="flex items-center gap-3" data-testid="booth-swap-current" data-plan-index={i}>
          <Artwork
            entity={entity}
            orchestra={(entity as { orchestra?: string } | null)?.orchestra ?? it.artist}
            size={40}
          />
          <div className="min-w-0 flex-1">
            <p className="text-subhead truncate font-semibold">{it.title}</p>
            <p className="text-footnote truncate text-[var(--label-2)]">
              {where} · {it.artist} · {durationLabel(it.lengthSec)}
            </p>
          </div>
        </div>
        <p className="text-footnote text-[var(--label-2)]" data-testid="booth-swap-when" data-when={when}>
          {when === "ahead"
            ? started
              ? tx("boothSwap.ahead_note")
              : tx("boothSwap.before_note")
            : when === "playing"
              ? tx("boothSwap.playing_note")
              : tx("boothSwap.played_note")}
        </p>
        {kind === "track" && scope === "catalogue" ? (
          <SmartSearchField
            s={ss}
            id="booth-swap-search"
            prefix="booth-swap"
            placeholder={tx("boothSwap.search_placeholder")}
            label={tx("boothSwap.search_placeholder")}
            autoFocus={!isPhone}
            onEnter={pickVersion}
            inputTestId="booth-swap-q"
          />
        ) : (
          <SearchBar
            value={q}
            onChange={setQ}
            placeholder={
              kind === "cortina" ? tx("boothSwap.cortina_placeholder") : tx("boothSwap.search_placeholder")
            }
            testId="booth-swap-q"
            busy={loading && !!query}
            autoFocus={!isPhone}
          />
        )}
        <ScopeSwitch<Scope>
          value={scope}
          items={[
            ["catalogue", tx("boothSongSearch.whole_catalogue")],
            ["tonight", tx("boothSongSearch.tonight")],
          ]}
          onChange={setScope}
          label={tx("boothSongSearch.scope")}
          testId="booth-swap-scope"
        />
        {ask && (
          <ConfirmBar
            text={tx("boothSwap.confirm_playing", { title: it.title, next: ask.title })}
            yes={tx("boothSwap.confirm_yes")}
            onYes={() => {
              const run = ask.run;
              setAsk(null);
              void run();
            }}
            onNo={() => setAsk(null)}
            testId="booth-swap-confirm"
          />
        )}
        {note && (
          <p className="text-footnote text-[var(--destructive)]" role="status" data-testid="booth-swap-note">
            {note}
          </p>
        )}
      </div>
      <div className="min-h-[55dvh]">
        {scope === "tonight" ? (
          <section data-testid="booth-swap-tonight">
            <h3 className="text-caption1 px-2 pt-3 pb-1 font-semibold uppercase tracking-wide text-[var(--label-2)]">
              {tx("boothSongSearch.tonight")}
            </h3>
            <p className="text-footnote px-2 pb-1 text-[var(--label-2)]">{tx("boothSwap.tonight_note")}</p>
            <ol>
              {tonight.map((h) => {
                const o = plan!.items[h.i]!;
                const e = entities[h.i] ?? null;
                return (
                  <HitRow
                    key={h.i}
                    testId="booth-swap-tonight-hit"
                    data={{ "plan-index": h.i }}
                    where={
                      h.kind === "cortina"
                        ? tx("boothSongSearch.cortina_after", { tanda: h.tanda })
                        : tx("boothSongSearch.tanda_pos", { tanda: h.tanda, p1: h.k })
                    }
                    art={
                      <Artwork
                        entity={e}
                        orchestra={(e as { orchestra?: string } | null)?.orchestra ?? o.artist}
                        size={40}
                      />
                    }
                    onArt={() => (hearing !== null && hearing === o.id ? stop() : void listen({ i: h.i }))}
                    artLabel={tx("boothSwap.preview", { title: o.title })}
                    title={o.title}
                    sub={[o.artist, yearText(o.year)].filter(Boolean).join(" · ")}
                    length={durationLabel(o.lengthSec)}
                  >
                    <PreviewButton
                      hearing={hearing !== null && hearing === o.id}
                      label={tx("boothSwap.preview", { title: o.title })}
                      onPlay={() => void listen({ i: h.i })}
                      onStop={stop}
                    />
                    <button
                      type="button"
                      className="btn-plain min-h-11 min-w-11 px-2 font-semibold"
                      disabled={when === "played"}
                      aria-label={tx("boothSwap.use_label", { title: o.title })}
                      onClick={() => pickTonight(h.i)}
                      data-testid="booth-swap-pick"
                    >
                      {tx("boothSwap.use")}
                    </button>
                  </HitRow>
                );
              })}
            </ol>
            {!tonight.length && (
              <p className="text-subhead px-2 py-4 text-[var(--label-2)]">
                {tx("boothSongSearch.nothing_tonight")}
              </p>
            )}
          </section>
        ) : (
          <>
            {kind === "track" && (
              <section data-testid="booth-swap-results">
                <SmartSearchResults
                  s={ss}
                  id="booth-swap-search"
                  prefix="booth-swap"
                  onPick={pickVersion}
                  onPlay={(v) => (hearing === v.song.id ? stop() : void listen({ song: v.song }))}
                  playing={(v) => hearing === v.song.id}
                  rowTestId="booth-swap-result"
                  dim={(v) => {
                    const x = judged.get(v.song.id);
                    return !!x && !x.ok;
                  }}
                  rowData={(v) => {
                    const x = judged.get(v.song.id);
                    return {
                      id: v.song.id,
                      ok: x ? (x.ok ? "1" : x.asks ? "asks" : "0") : v.hit ? "pending" : "service",
                    };
                  }}
                  note={(v) => {
                    const x = judged.get(v.song.id);
                    if (!x || x.ok) return null;
                    return (
                      <span className="text-caption1 block truncate text-[var(--destructive)]">
                        {x.asks ? tx("boothSwap.asks", { reason: x.reason ?? "" }) : x.reason}
                      </span>
                    );
                  }}
                  actions={(v) => {
                    const x = judged.get(v.song.id);
                    const can = when !== "played" && (!x || x.ok || !!x.asks);
                    return (
                      <button
                        type="button"
                        className="btn-plain min-h-11 min-w-11 px-2 font-semibold"
                        disabled={!can || !!busy}
                        aria-label={tx("boothSwap.use_label", { title: v.song.title })}
                        onClick={() => pickVersion(v)}
                        data-testid="booth-swap-pick"
                      >
                        {busy === v.song.id ? "…" : tx("boothSwap.use")}
                      </button>
                    );
                  }}
                />
              </section>
            )}
            {searching && kind !== "track" && (
              <section data-testid="booth-swap-results">
                <h3 className="text-caption1 px-2 pt-3 pb-1 font-semibold uppercase tracking-wide text-[var(--label-2)]">
                  {tx("boothSwap.results")}
                </h3>
                <ol>{(results as Cortina[]).map((c) => cortinaRow(c, "r"))}</ol>
                {!results.length && !loading && (
                  <p className="text-subhead px-2 py-4 text-[var(--label-2)]">
                    {tx("boothSwap.nothing", { q: q.trim() })}
                  </p>
                )}
              </section>
            )}
            <section data-testid="booth-swap-suggested">
              <h3 className="text-caption1 px-2 pt-3 pb-1 font-semibold uppercase tracking-wide text-[var(--label-2)]">
                {tx("boothSwap.suggested")}
              </h3>
              <p className="text-footnote px-2 pb-1 text-[var(--label-2)]">
                {kind === "cortina"
                  ? tx("boothSwap.cortina_suggested_footer")
                  : tx("boothSwap.suggested_footer")}
              </p>
              <ol>
                {kind === "track"
                  ? (suggestions as SwapSide[]).map((x) => sideRow(x, "s"))
                  : (suggestions as Cortina[]).map((c) => cortinaRow(c, "s"))}
              </ol>
              {!suggestions.length && (
                <p className="text-subhead px-2 py-4 text-[var(--label-2)]">
                  {(kind === "track" ? loading && !query : cortinas === null)
                    ? tx("boothSwap.loading")
                    : tx("boothSwap.none")}
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </Sheet>
  );
}
