"use client";
import { create } from "zustand";
import { heartsIn, nightIdOf } from "@/lib/favourites";
import { roomClient, useRooms } from "@/lib/rooms";
import { useStore } from "@/lib/store";
import { useBooth } from "./store";

/**
 * 2026-11, dancer hearts in a room. While the DJ is in a room (Rooms) and a night plays in the Booth, the booth tells
 * the room's server which song is playing, and every 15 s reads tonight's heart counts: the Now card shows them and
 * they go into the DJ's dancer favourites (lib/favourites.ts heartsIn keeps the larger tally, so a poll counts
 * nothing twice). Without a room, or on a site that keeps no rooms, nothing happens: everything else works offline.
 */
export const useRoomHearts = create<{ counts: Record<string, number> }>(() => ({ counts: {} }));

const POLL_MS = 15_000;
let lastPlaying = "";

function playingNow() {
  const b = useBooth.getState();
  if (!b.playlist || !b.plan || !b.started) return null;
  const item = b.plan.items[b.planIndex];
  const e = b.entities[b.planIndex];
  if (item?.kind !== "track" || !e || !("rhythm" in e)) return undefined; // a cortina: the last song stays
  return { songId: e.id, nightId: nightIdOf(b.playlist), title: e.title, artist: item.artist };
}

async function push() {
  const c = roomClient();
  if (!c || !useRooms.getState().active) return;
  const p = playingNow();
  if (p === undefined) return;
  const key = JSON.stringify(p);
  if (key === lastPlaying) return;
  lastPlaying = key;
  try {
    await c.playing(p);
  } catch {
    lastPlaying = "";
  }
}

async function poll() {
  const c = roomClient();
  const b = useBooth.getState();
  if (!c || !useRooms.getState().active || !b.playlist || !b.started) return;
  const p = b.playlist;
  try {
    const v = await c.hearts(nightIdOf(p));
    useRoomHearts.setState({ counts: v.hearts ?? {} });
    const st = useStore.getState();
    const next = heartsIn(st.memory, p, v.hearts ?? {});
    if (next !== st.memory) st.updateMemory(() => next);
  } catch {}
}

/** starts the sync for the Booth page; returns its stop */
export function startRoomHearts(): () => void {
  const unsub = useBooth.subscribe((s, prev) => {
    if (s.planIndex !== prev.planIndex || s.started !== prev.started) void push();
  });
  const timer = setInterval(() => {
    void push();
    void poll();
  }, POLL_MS);
  void push();
  return () => {
    unsub();
    clearInterval(timer);
  };
}
