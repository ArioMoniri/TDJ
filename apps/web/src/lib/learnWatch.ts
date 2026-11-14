"use client";
import { learnFromLock, type Playlist, rememberEdit } from "@tdj/core";
import { useStore } from "./store";

/**
 * Round 22 — learning like an autocorrect, from the edits Compose makes without telling anyone: a tanda the DJ
 * locks (a half vote for its family and sides) and a tanda the DJ sends away whole (its family and sides weigh a
 * little less). Side swaps (the Swap sheet), AI edits and hand-built nights teach where they happen. Observed on the
 * store, so the composer itself needs no change. Off with Settings → Learn from my edits.
 */
let installed = false;
let quiet = 0;
/** an edit that teaches on its own (an AI edit, its undo): the watcher skips the next playlist change */
export const skipNextLearn = () => {
  quiet++;
};

export function learnFromChange(prev: Playlist, next: Playlist) {
  const st = useStore.getState();
  if (!st.settings.learn) return;
  if (prev.id !== next.id || prev.tandas.length !== next.tandas.length) return;
  const ids = (p: Playlist, i: number) => p.tandas[i]!.songs.map((s) => s.id);
  const replaced: number[] = [];
  let other = false;
  prev.tandas.forEach((t, i) => {
    const a = ids(prev, i),
      b = ids(next, i);
    const same = a.join() === b.join();
    if (same && !t.locked && next.tandas[i]!.locked)
      st.updateMemory((m) => ({ ...m, learned: learnFromLock(m.learned, t, true, undefined, next.id) }));
    else if (!same && a.every((x) => !b.includes(x))) replaced.push(i);
    else if (!same) other = true;
  });
  // one tanda sent away whole (the engine chose the new one): only the removal teaches
  if (replaced.length === 1 && !other) {
    const i = replaced[0]!;
    st.updateMemory((m) =>
      rememberEdit(
        m,
        prev,
        { ...prev, tandas: prev.tandas.map((t, k) => (k === i ? { ...t, songs: [] } : t)) },
        "replaced a tanda",
      ),
    );
  }
}

export function installLearnWatch() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  useStore.subscribe((s, p) => {
    if (s.playlist === p.playlist || !s.playlist || !p.playlist) return;
    if (quiet > 0) {
      quiet--;
      return;
    }
    learnFromChange(p.playlist, s.playlist);
  });
}
