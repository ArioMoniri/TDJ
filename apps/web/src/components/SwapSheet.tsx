"use client";
import { rememberEdit } from "@tdj/core";
import { useEffect, useState } from "react";
import { t as tx } from "@/lib/i18n";
import { gateEdit } from "@/lib/ruleCheck";
import { useStore } from "@/lib/store";
import { tempoLevel } from "@/lib/tempo";
import { toast } from "@/lib/toast";
import type { Playlist, Song } from "@/lib/types";
import { yearText } from "@/lib/year";
import { ActionRow, Group, Row, SwitchRow } from "./Form";
import { SearchField } from "./SearchField";
import { Sheet } from "./Sheet";
import { SongRow } from "./ui/SongRow";
import { Tip } from "./ui/Tip";

/** a side as /api/swap-options sends it */
export interface SwapSide {
  ok: boolean;
  reason?: string;
  /** excluded only by a tanda rule: the DJ may still choose it, and the rule check asks first */
  asks?: boolean;
  fit: number;
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
    s.singer ?? "instrumental",
    s.vocalStyle === "cantor" ? "singer-led" : s.vocalStyle === "estribillo" ? "rhythm-led" : null,
    s.energy !== undefined ? `energy ${s.energy}` : null,
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
  const [q, setQ] = useState("");
  const [lists, setLists] = useState<{ suggestions: SwapSide[]; results: SwapSide[] }>({
    suggestions: [],
    results: [],
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pin, setPin] = useState(false);
  const t = open ? playlist!.tandas[tandaIndex!] : undefined;
  const cur = t?.songs[trackIndex ?? 0];
  useEffect(() => {
    if (!open) return;
    setNote(null);
    setPin(!!t?.pinned);
    const ctl = new AbortController();
    const h = setTimeout(
      () => {
        fetch("/api/swap-options", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ playlist, tandaIndex, trackIndex, query: q }),
          signal: ctl.signal,
        })
          .then((r) => r.json())
          .then((j) => setLists({ suggestions: j.suggestions ?? [], results: j.results ?? [] }))
          .catch(() => {});
      },
      q ? 220 : 0,
    );
    return () => {
      clearTimeout(h);
      ctl.abort();
    };
  }, [open, playlist, tandaIndex, trackIndex, q, t?.pinned]);
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

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
      const was = playlist;
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
      // wave 2: every pick can be taken back from the toast
      const name = title ?? j.tandas[tandaIndex]?.songs[trackIndex]?.title;
      toast(
        name ? tx("swapSheet.swapped_in_2", { name }) : tx("swapSheet.song_swapped"),
        () => void onApplied(was, tx("swapSheet.swap_undone")),
      );
    } finally {
      setBusy(null);
    }
  };
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
      setBusy(null);
      await apply(
        j.songId,
        `${j.source === "ai" ? tx("swapSheet.your_ai_s_pick") : tx("swapSheet.best_fit")}${j.why ? `: ${j.why}` : ""}`,
      );
    } finally {
      setBusy(null);
    }
  };
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
        sub={x.ok ? sub(x.song) : `${sub(x.song)} — ${x.reason}`}
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
          <Group>
            <Tip
              text={
                settings.ai.key
                  ? tx("swapSheet.your_model_reads_the_tanda_and")
                  : tx("swapSheet.without_a_model_key_the_best")
              }
              className="w-full"
            >
              <ActionRow
                label={
                  settings.ai.key ? tx("swapSheet.let_my_ai_pick") : tx("swapSheet.pick_the_best_fit_for_me")
                }
                onClick={aiPick}
                busy={busy === "ai"}
                disabled={!!lockedReason || !lists.suggestions.length}
              />
            </Tip>
            <SwitchRow
              label={tx("swapSheet.keep_my_tanda_as_is")}
              sub={tx("swapSheet.regenerate_and_the_automatic_fixes_leave")}
              checked={pin}
              onChange={(v) => void togglePin(v)}
              disabled={!!lockedReason}
            />
          </Group>
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
          <SearchField
            id="swap-search"
            value={q}
            onChange={setQ}
            placeholder={tx("swapSheet.title_orchestra_or_singer")}
            label={tx("swapSheet.search_the_catalogue")}
            className="mt-2"
          />
          {q.length >= 2 && (
            <Group header={tx("swapSheet.search")} data-testid="swap-results">
              {lists.results.length ? (
                ranked(lists.results).map((x) => row(x, "r"))
              ) : (
                <Row label={tx("swapSheet.nothing_matches", { q })} />
              )}
            </Group>
          )}
        </>
      )}
    </Sheet>
  );
}
