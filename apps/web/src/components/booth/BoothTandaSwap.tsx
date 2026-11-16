"use client";
import { useCallback, useMemo } from "react";
import { confirmNeeded } from "@/lib/booth/confirm";
import { useBooth } from "@/lib/booth/store";
import { t as tx } from "@/lib/i18n";
import type { SourceId, Version } from "@/lib/smartSearch";
import { toast } from "@/lib/toast";
import type { Playlist, Song } from "@/lib/types";
import { TandaSwapSheet, useTandaSwap } from "../TandaSwapSheet";

/**
 * 2026-11 — the Booth's tanda Swap (the set list's tanda Swap opens it through `useTandaSwap`): the same sheet as
 * Compose's (components/TandaSwapSheet.tsx) on the Booth's night. The running tanda and everything before it cannot
 * change (the sheet says so); the tanda that plays next asks once before Apply (while the night runs and the Booth's
 * confirmations are on); the engine is asked with what has played locked; results pre-listen in the headphones and a
 * side tonight's linked folder holds shows the file source.
 */
export function BoothTandaSwap() {
  const i = useTandaSwap((s) => s.i);
  const close = useTandaSwap((s) => s.close);
  const playlist = useBooth((s) => s.playlist);
  const plan = useBooth((s) => s.plan);
  const planIndex = useBooth((s) => s.planIndex);
  const started = useBooth((s) => s.started);
  const sources = useBooth((s) => s.sources);
  const hearing = useBooth((s) => s.audition?.songId ?? null);
  const cur = plan?.items[planIndex];
  const running = cur ? (cur.kind === "closing" && cur.tanda > 0 ? Number.POSITIVE_INFINITY : cur.tanda) : 0;
  const lockedReason =
    i !== null && started && i + 1 <= running ? tx("booth.setColumn.playing_locked") : null;
  const confirmText =
    i !== null && started && i + 1 === running + 1 && confirmNeeded()
      ? tx("tandaSwap.plays_next", { p1: i + 1 })
      : null;
  const requestPlaylist = useCallback(
    (p: Playlist): Playlist => ({
      ...p,
      tandas: p.tandas.map((t, k) => (started && k + 1 <= running ? { ...t, locked: true } : t)),
    }),
    [started, running],
  );
  /** tonight's sides with a linked file */
  const files = useMemo(() => {
    const out = new Set<string>();
    plan?.items.forEach((it, k) => {
      if (it.kind === "track" && it.id && sources[k] === "file") out.add(it.id);
    });
    return out;
  }, [plan, sources]);
  const extraSources = useCallback((s: Song): SourceId[] => (files.has(s.id) ? ["local"] : []), [files]);
  const onPlay = useCallback(async (v: Version) => {
    const b = useBooth.getState();
    if (b.audition?.songId === v.song.id) return b.stopAudition();
    const why = await b.prelisten({ song: v.song });
    if (why) toast(tx("booth.songSheet.can_t_pre_listen", { why }));
  }, []);
  const playing = useCallback((v: Version) => hearing === v.song.id, [hearing]);
  return (
    <TandaSwapSheet
      playlist={i !== null ? playlist : null}
      index={i}
      onClose={close}
      apply={async (p) => {
        useBooth.getState().stopAudition();
        await useBooth.getState().applySwappedPlaylist(p);
      }}
      lockedReason={lockedReason}
      confirmText={confirmText}
      requestPlaylist={requestPlaylist}
      extraSources={extraSources}
      onPlay={onPlay}
      playing={playing}
      testId="booth-tanda-swap-sheet"
    />
  );
}
