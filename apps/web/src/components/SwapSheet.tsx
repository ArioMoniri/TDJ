"use client";
import { rememberEdit } from "@tdj/core";
import { useEffect, useMemo, useState } from "react";
import { undoEdit } from "@/lib/editHistory";
import { t as tx } from "@/lib/i18n";
import { requestFavourites } from "@/lib/popularity";
import { gateEdit } from "@/lib/ruleCheck";
import type { Version } from "@/lib/smartSearch";
import { useStore } from "@/lib/store";
import { tempoLevel } from "@/lib/tempo";
import { toast } from "@/lib/toast";
import type { Playlist, Song } from "@/lib/types";
import { useSmartSearch } from "@/lib/useSmartSearch";
import { yearText } from "@/lib/year";
import { ActionRow, Group, Row, SwitchRow } from "./Form";
import { Sheet } from "./Sheet";
import { SmartSearchField, SmartSearchResults } from "./ui/SmartSearch";
import { SongRow } from "./ui/SongRow";
import { Tip } from "./ui/Tip";

/** a side as /api/swap-options sends it */
export interface SwapSide {
  ok: boolean;
  reason?: string;
  /** excluded only by a tanda rule: the DJ may still choose it, and the rule check asks first */
  asks?: boolean;
  fit: number;
  /** 2026-11: a dancer favourite in this tanda's role (♥, listed first) */
  favourite?: boolean;
  song: {
    id: string;
    title: string;
    orchestra: string;
    singer: string | null;
    year: number | null;
    energy?: number;
    fame?: number;
    vocalStyle?: "estribillo" | "cantor";
    tempo?: { bpm: number; source: string };
    level?: { gainDb: number; source: string };
    spotify?: { uri: string } | null;
    orchestraId?: string;
    vocal?: boolean;
    rhythm?: string;
    yearApprox?: boolean;
    resolved?: Song["resolved"];
    audio?: Partial<NonNullable<Song["audio"]>> | null;
  };
}

/** the wire side as a row's song (the row reads artwork, era, BPM and key from it) */
const asSong = (s: SwapSide["song"]): Song =>
  ({
    ...s,
    orchestraId: s.orchestraId ?? s.orchestra,
    vocal: s.vocal ?? !!s.singer,
    singerId: null,
    rhythm: s.rhythm ?? "tango",
    era: "unknown",
  }) as unknown as Song;
/** best fit first; the sides that cannot take the chair after them */
const ranked = (xs: SwapSide[]) => xs.slice().sort((a, b) => Number(b.ok) - Number(a.ok) || b.fit - a.fit);

const sub = (s: SwapSide["song"]) =>
  [
    yearText(s.year),
    s.singer ?? tx("common.instrumental"),
    s.vocalStyle === "cantor"
      ? tx("common.singer_led")
      : s.vocalStyle === "estribillo"
        ? tx("common.rhythm_led")
        : null,
    s.energy !== undefined ? tx("manualBuilder.energy", { energy: s.energy }) : null,
    tempoLevel(s) || null,
  ]
    .filter(Boolean)
    .join(" · ");

/**
 * Round 21 — one Swap sheet per song (the result page and the booth): the sides that keep the tanda valid (the same
 * orchestra and singer, the voice, the vocal style, the year band, the tempo / level / tone bands, not already in the
 * night, a checked Spotify id), a search over the catalogue with the reason anything is excluded, and an AI pick
 * (the DJ's key, else the engine's best fit, labelled). Picking a side re-times and re-scores the night; "Keep my
 * tanda as is" pins it as the DJ's. Every swap is remembered as a DJ preference when learning is on.
 */
export function SwapSheet({
  playlist,
  tandaIndex,
  trackIndex,
  onClose,
  onApplied,
  lockedReason,
}: {
  playlist: Playlist | null;
  tandaIndex: number | null;
  trackIndex: number | null;
  onClose: () => void;
  onApplied: (p: Playlist, note: string) => void | Promise<void>;
  /** the booth: a tanda that is playing or played is read-only */
  lockedReason?: string;
}) {
  const open = !!playlist && tandaIndex !== null && trackIndex !== null;
  const settings = useStore((s) => s.settings);
  const updateMemory = useStore((s) => s.updateMemory);
  const [lists, setLists] = useState<{ suggestions: SwapSide[]; results: SwapSide[] }>({
    suggestions: [],
    results: [],
  });
  /** 2026-11: the AI's (or the engine's) pick, shown as an option at the top, never applied until chosen */
  const [pick, setPick] = useState<{
    id: string;
    title: string;
    why: string;
    source: "ai" | "engine";
  } | null>(null);
  /** the smart search's catalogue results judged for this chair (ok / why not / the rule check asks) */
  const [judged, setJudged] = useState<Map<string, SwapSide>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pin, setPin] = useState(false);
  const t = open ? playlist!.tandas[tandaIndex!] : undefined;
  const cur = t?.songs[trackIndex ?? 0];
  // 2026-11: one smart search (catalogue + connected services, completions, versions by work), the tanda's rhythm on
  const s = useSmartSearch({ defaultFilters: t ? { rhythms: [t.rhythm] } : {}, limit: 30 });
  useEffect(() => {
    if (!open) return;
    setNote(null);
    setPin(!!t?.pinned);
    const ctl = new AbortController();
    fetch("/api/swap-options", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        playlist,
        tandaIndex,
        trackIndex,
        favourites: requestFavourites(useStore.getState().memory) ?? null,
      }),
      signal: ctl.signal,
    })
      .then((r) => r.json())
      .then((j) => setLists({ suggestions: j.suggestions ?? [], results: j.results ?? [] }))
      .catch(() => {});
    return () => ctl.abort();
  }, [open, playlist, tandaIndex, trackIndex, t?.pinned]);
  // a fresh search and suggestion each time the sheet opens on a chair
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset per chair
  useEffect(() => {
    s.setQ("");
    s.setFilters(t ? { rhythms: [t.rhythm] } : {});
    setPick(null);
    setJudged(new Map());
  }, [open, tandaIndex, trackIndex]);
  // the catalogue's results judged for this chair: why one cannot take it, or that the rule check will ask
  const ids = useMemo(
    () =>
      s.versions
        .filter((v) => v.hit)
        .slice(0, 60)
        .map((v) => v.song.id),
    [s.versions],
  );
  const idKey = ids.join("|");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `idKey` stands for the ids
  useEffect(() => {
    if (!open || !ids.length) return;
    const ctl = new AbortController();
    fetch("/api/swap-options", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playlist, tandaIndex, trackIndex, ids }),
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
  }, [open, idKey, playlist, tandaIndex, trackIndex]);

  /**
   * The DJ's pick takes the chair through the rule check (lib/ruleCheck.ts): a side that keeps every rule applies at
   * once; one that breaks a tanda rule (a search result the sheet marks) asks first — a suggestion, "Do it as I said"
   * (this night only) or Cancel. The gate teaches from what it applies, as a swap always did.
   */
  const apply = async (songId: string, how: string, force = false, title?: string) => {
    if (!playlist || tandaIndex === null || trackIndex === null) return;
    setBusy(songId);
    try {
      const r = await fetch("/api/swap-track", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playlist, tandaIndex, trackIndex, songId, pin, force }),
      });
      const j = (await r.json()) as Playlist & { changed?: boolean; reason?: string };
      if (!r.ok || !j.changed) {
        setNote(j.reason ? tx("swapSheet.not_swapped_2", { reason: j.reason }) : tx("swapSheet.not_swapped"));
        return;
      }
      const { changed: _c, reason: _r, ...after } = j;
      const res = await gateEdit({
        before: playlist,
        after: after as Playlist,
        label: how,
        apply: (p, l) => onApplied(p, l),
        learn: settings.learn,
      });
      if (res === "cancelled") return;
      onClose();
      if (res !== "applied") return;
      // wave 2: every pick can be taken back from the toast; 2026-11: the toast's Undo is the one undo history (⌘Z)
      const name = title ?? j.tandas[tandaIndex]?.songs[trackIndex]?.title;
      toast(
        name ? tx("swapSheet.swapped_in_2", { name }) : tx("swapSheet.song_swapped"),
        () => void undoEdit(),
      );
    } finally {
      setBusy(null);
    }
  };
  /** a connected service's recording takes the chair: the tanda with it in that place (POST /api/tanda-set) */
  const applyExternal = async (v: Version) => {
    if (!playlist || tandaIndex === null || trackIndex === null || !t) return;
    setBusy(v.song.id);
    try {
      const sides = t.songs.map((x, k) => (k === trackIndex ? v.song : x.id));
      const r = await fetch("/api/tanda-set", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playlist, tandaIndex, sides }),
      });
      const j = (await r.json().catch(() => ({}))) as Playlist & { changed?: boolean; reason?: string };
      if (!r.ok || !j.changed) {
        setNote(j.reason ? tx("swapSheet.not_swapped_2", { reason: j.reason }) : tx("swapSheet.not_swapped"));
        return;
      }
      const { changed: _c, reason: _r, ...after } = j;
      const label = tx("swapSheet.swapped_in", { title: v.song.title });
      const res = await gateEdit({
        before: playlist,
        after: after as Playlist,
        label,
        apply: (p, l) => onApplied(p, l),
        learn: settings.learn,
      });
      if (res === "cancelled") return;
      onClose();
      if (res === "applied")
        toast(tx("swapSheet.swapped_in_2", { name: v.song.title }), () => void undoEdit());
    } finally {
      setBusy(null);
    }
  };
  /** a version from the smart search: a catalogue side through /api/swap-track (the rule check asks when it breaks a rule) */
  const takeVersion = (v: Version) => {
    if (lockedReason) return;
    if (!v.hit) return void applyExternal(v);
    const x = judged.get(v.song.id);
    if (x && !x.ok && !x.asks) {
      setNote(tx("swapSheet.not_swapped_2", { reason: x.reason ?? "" }));
      return;
    }
    void apply(v.song.id, tx("swapSheet.swapped_in", { title: v.song.title }), !!x && !x.ok, v.song.title);
  };
  /** the AI's pick (the DJ's key), else the engine's best fit: shown at the top, applied only when chosen */
  const aiPick = async () => {
    if (!playlist) return;
    setBusy("ai");
    try {
      const r = await fetch("/api/ai/swap", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-ai-provider": settings.ai.provider,
          "x-ai-key": settings.ai.key,
          "x-ai-model": settings.ai.model,
          "x-ai-workspace": settings.ai.workspace ?? "",
        },
        body: JSON.stringify({ playlist, tandaIndex, trackIndex }),
      });
      const j = (await r.json()) as {
        songId?: string;
        source?: "ai" | "engine";
        why?: string;
        error?: string;
      };
      if (!j.songId) {
        setNote(j.error ?? tx("swapSheet.no_pick"));
        return;
      }
      const side = [...lists.suggestions, ...lists.results].find((x) => x.song.id === j.songId);
      setPick({
        id: j.songId,
        title: side?.song.title ?? j.songId,
        why: j.why || tx("swapSheet.suggested_engine_why"),
        source: j.source === "ai" ? "ai" : "engine",
      });
    } finally {
      setBusy(null);
    }
  };
  // without a key the engine's best fit is the suggestion at once; with one, the DJ asks the AI
  // biome-ignore lint/correctness/useExhaustiveDependencies: once the suggestions are in
  useEffect(() => {
    if (open && !settings.ai.key && !pick && lists.suggestions.length && !lockedReason) {
      const best = ranked(lists.suggestions)[0]!;
      setPick({
        id: best.song.id,
        title: best.song.title,
        why: tx("swapSheet.fit", { fit: Math.round(best.fit * 100) }),
        source: "engine",
      });
    }
  }, [open, lists.suggestions, settings.ai.key]);
  const togglePin = async (on: boolean) => {
    setPin(on);
    if (!playlist || tandaIndex === null) return;
    const tandas = playlist.tandas.map((x, i) => {
      if (i !== tandaIndex) return x;
      if (!on) {
        const { pinned: _p, ...rest } = x;
        return { ...rest, locked: false };
      }
      return {
        ...x,
        locked: true,
        pinned: {
          by: "dj" as const,
          reason: tx("swapSheet.keep_my_tanda_as_is"),
          at: new Date().toISOString(),
        },
      };
    });
    const np = { ...playlist, tandas };
    if (on && settings.learn) updateMemory((m) => rememberEdit(m, playlist, np, tx("swapSheet.kept_as_is")));
    await onApplied(np, on ? tx("swapSheet.tanda_kept_as_is_pinned") : tx("swapSheet.tanda_unpinned"));
  };

  const row = (x: SwapSide, list: string) => {
    const fit = Math.round(x.fit * 100);
    // a side that only breaks a tanda rule can still be chosen: the rule check asks first
    const asks = !x.ok && !!x.asks;
    return (
      <SongRow
        key={`${list}-${x.song.id}`}
        song={asSong(x.song)}
        testId={x.ok ? "swap-option" : "swap-excluded"}
        dim={!x.ok}
        busy={busy === x.song.id}
        sub={
          x.ok
            ? `${x.favourite ? `${tx("fav.crowd_favourite_badge")} · ` : ""}${sub(x.song)}`
            : `${sub(x.song)} — ${x.reason}`
        }
        pill={x.ok ? tx("swapSheet.fit", { fit }) : undefined}
        pillTip={x.ok ? tx("swapSheet.how_well_it_fits_this_place") : undefined}
        ariaLabel={x.ok ? tx("swapSheet.swap_in", { title: x.song.title }) : `${x.song.title}: ${x.reason}`}
        onClick={
          (x.ok || asks) && !lockedReason
            ? () => apply(x.song.id, tx("swapSheet.swapped_in", { title: x.song.title }), asks, x.song.title)
            : undefined
        }
      />
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={cur ? tx("swapSheet.swap_2", { title: cur.title }) : tx("swapSheet.swap")}
      detents={["large"]}
      testId="swap-sheet"
    >
      {t && cur && (
        <>
          <p className="text-footnote px-4 pt-2 text-[var(--label-2)]">
            {tx("swapSheet.tanda", { p1: tandaIndex! + 1, rhythm: t.rhythm, orchestra: t.orchestra })}
            {t.singer ? ` / ${t.singer}` : t.vocal ? "" : tx("swapSheet.instrumental")} ·{" "}
            {t.yearRange?.join("–")}
            {tempoLevel(cur) ? ` ${tx("swapSheet.this_side", { p1: tempoLevel(cur) })}` : ""}
          </p>
          {lockedReason && <p className="text-footnote px-4 pt-2 text-[var(--label-2)]">{lockedReason}</p>}
          {note && (
            <p
              className="text-footnote px-4 pt-2 text-[var(--destructive)]"
              role="status"
              data-testid="swap-note"
            >
              {note}
            </p>
          )}
          <Group header={tx("swapSheet.now_in_this_chair")}>
            <SongRow song={cur} testId="swap-current" />
          </Group>
          <Group footer={tx("swapSheet.suggestion_footer")} data-testid="swap-suggested">
            {pick && (
              <Row
                label={tx("swapSheet.suggested_pick", { title: pick.title })}
                sub={`${pick.source === "ai" ? tx("swapSheet.your_ai_s_pick") : tx("swapSheet.best_fit")} · ${pick.why}`}
                chevron
                busy={busy === pick.id}
                disabled={!!lockedReason}
                onClick={() =>
                  void apply(
                    pick.id,
                    `${pick.source === "ai" ? tx("swapSheet.your_ai_s_pick") : tx("swapSheet.best_fit")}: ${pick.why}`,
                    false,
                    pick.title,
                  )
                }
                data-testid="swap-ai-pick"
              />
            )}
            {settings.ai.key && (
              <Tip text={tx("swapSheet.your_model_reads_the_tanda_and")} className="w-full">
                <ActionRow
                  label={busy === "ai" ? tx("swapSheet.asking_ai") : tx("swapSheet.ask_ai")}
                  onClick={aiPick}
                  busy={busy === "ai"}
                  disabled={!!lockedReason || !lists.suggestions.length}
                />
              </Tip>
            )}
            <SwitchRow
              label={tx("swapSheet.keep_my_tanda_as_is")}
              sub={tx("swapSheet.regenerate_and_the_automatic_fixes_leave")}
              checked={pin}
              onChange={(v) => void togglePin(v)}
              disabled={!!lockedReason}
            />
          </Group>
          <div className="mt-2 px-4" data-testid="swap-results">
            <SmartSearchField
              s={s}
              id="swap-search"
              prefix="swap"
              placeholder={tx("swapSheet.title_orchestra_or_singer")}
              label={tx("swapSheet.search_the_catalogue")}
              tip={tx("swapSheet.search_everywhere")}
              onEnter={takeVersion}
            />
            <SmartSearchResults
              s={s}
              id="swap-search"
              prefix="swap"
              onPick={takeVersion}
              dim={(v) => {
                const x = judged.get(v.song.id);
                return !!x && !x.ok;
              }}
              note={(v) => {
                const x = judged.get(v.song.id);
                if (!x) return null;
                return (
                  <span
                    className={`text-caption1 block truncate ${x.ok ? "text-[var(--label-2)]" : "text-[var(--destructive)]"}`}
                  >
                    {x.ok ? tx("swapSheet.fit", { fit: Math.round(x.fit * 100) }) : x.reason}
                  </span>
                );
              }}
              rowData={(v) => {
                const x = judged.get(v.song.id);
                return { judge: x ? (x.ok ? "ok" : x.asks ? "asks" : "no") : v.hit ? "pending" : "service" };
              }}
              rowTestIdOf={(v) => {
                const x = judged.get(v.song.id);
                return x ? (x.ok ? "swap-option" : "swap-excluded") : "swap-result";
              }}
              actions={(v) => {
                const x = judged.get(v.song.id);
                const can = !lockedReason && (!x || x.ok || !!x.asks);
                return (
                  <button
                    type="button"
                    className="btn-plain min-h-11 min-w-11 px-2 font-semibold"
                    disabled={!can || !!busy}
                    aria-label={tx("swapSheet.use_label", { title: v.song.title })}
                    onClick={() => takeVersion(v)}
                    data-testid="swap-use"
                  >
                    {busy === v.song.id ? "…" : tx("swapSheet.use")}
                  </button>
                );
              }}
            />
          </div>
          <Group
            header={tx("swapSheet.fits_this_tanda")}
            footer={tx("swapSheet.same_orchestra_and_singer_the_same")}
            data-testid="swap-suggestions"
          >
            {lists.suggestions.length ? (
              ranked(lists.suggestions).map((x) => row(x, "s"))
            ) : (
              <Row
                label={tx("swapSheet.no_other_side_keeps_this_tanda")}
                sub={tx("swapSheet.search_below_to_see_why")}
              />
            )}
          </Group>
        </>
      )}
    </Sheet>
  );
}
