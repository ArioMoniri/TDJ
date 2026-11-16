"use client";
import {
  type AdaptSuggestion,
  type FloorReaction,
  floorLearningOn,
  learnedForRequest,
  learnFromFloor,
} from "@tdj/core";
import { create } from "zustand";
import { favouritesForRequest, nightIdOf } from "@/lib/favourites";
import { useStore } from "@/lib/store";
import type { Playlist } from "@/lib/types";
import { useRoomHearts } from "./roomHearts";
import { useBooth } from "./store";

/**
 * 2026-11 — live adaptation in the Booth (core adapt.ts) and floor learning (core floor.ts). A floor reaction on a
 * tanda (FloorReaction's tap, on the Now card, the Controls panel or a set-list row):
 *
 *  1. teaches the learned store a little (the pair into that tanda, the energy step it took in its role), unless the
 *     DJ switched floor learning off in Settings → learning; a tap taken back takes its lesson back;
 *  2. asks the engine (/api/adapt) whether the next unplayed tandas should change after it. One suggestion at most
 *     comes back and shows as the Booth's suggestion card; nothing changes the room until the DJ taps Apply, which
 *     goes through the rule check and the undo history like any swap (components/booth/AdaptCard.tsx).
 */
export interface AdaptState {
  suggestion: AdaptSuggestion | null;
  /** the reaction the card answers (to drop an answer that arrives after a newer tap) */
  token: number;
  busy: boolean;
  dismiss: () => void;
}
export const useAdapt = create<AdaptState>((set) => ({
  suggestion: null,
  token: 0,
  busy: false,
  dismiss: () => set({ suggestion: null }),
}));

/** the tandas that cannot change now (0-based): the running one and those before it */
export function frozenTandas(): number[] {
  const b = useBooth.getState();
  if (!b.plan || !b.started) return [];
  const cur = b.plan.items[b.planIndex];
  const running = cur ? (cur.kind === "closing" ? (b.playlist?.tandas.length ?? 0) : cur.tanda) : 0;
  return Array.from({ length: Math.max(0, running) }, (_, k) => k);
}

/** the room's hearts on a tanda's songs (distinct dancers, summed) */
export function heartsOn(p: Playlist, index: number): number | undefined {
  const c = useRoomHearts.getState().counts;
  const t = p.tandas[index];
  if (!t) return undefined;
  const n = t.songs.reduce((a, s) => a + (c[s.id] ?? 0), 0);
  return n > 0 ? n : undefined;
}

/** step 1: the floor's lesson (or its taking back) in the DJ's learned store */
export function learnFloor(p: Playlist, index: number, reaction: FloorReaction | null) {
  const st = useStore.getState();
  if (!st.settings.learn || !floorLearningOn(st.memory.learned)) return;
  st.updateMemory((m) => ({
    ...m,
    learned: learnFromFloor(m.learned, p, nightIdOf(p), index, reaction),
  }));
}

/** step 2: ask for a suggestion after the reaction on tanda `index` (0-based); a reaction taken back clears the card */
export async function requestAdapt(
  p: Playlist,
  index: number,
  reaction: FloorReaction | null,
): Promise<void> {
  const token = useAdapt.getState().token + 1;
  useAdapt.setState({ token, suggestion: null, busy: !!reaction });
  if (!reaction) return;
  const st = useStore.getState();
  try {
    const r = await fetch("/api/adapt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        playlist: p,
        after: index,
        reaction,
        hearts: heartsOn(p, index),
        frozen: frozenTandas(),
        favourites: favouritesForRequest(st.memory) ?? null,
        learned: learnedForRequest(st.memory, st.settings.learn),
        seed: Date.now() % 1e6,
      }),
    });
    const j = (r.ok ? await r.json() : { suggestion: null }) as { suggestion: AdaptSuggestion | null };
    if (useAdapt.getState().token !== token) return;
    // the night must still be the one the answer was made for
    if (useBooth.getState().playlist !== p) return void useAdapt.setState({ busy: false });
    useAdapt.setState({ suggestion: j.suggestion, busy: false });
  } catch {
    if (useAdapt.getState().token === token) useAdapt.setState({ busy: false });
  }
}

/** a floor reaction tapped in the Booth: the lesson, then the suggestion */
export function onFloorReaction(p: Playlist, index: number, reaction: FloorReaction | null) {
  learnFloor(p, index, reaction);
  void requestAdapt(p, index, reaction);
}
