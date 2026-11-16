import type { Playlist } from "@/lib/types";

/**
 * 2026-11 (the owner, live at a milonga: "when coming from other tabs to booth while booth is playing, booth becomes
 * paused music"). The Booth page boots its store on every mount; for the night already running on this set a mount is
 * only the DJ coming back, and the room must not hear it. Whether the set changed while the DJ was away (a swap in
 * Compose, a tanda bypassed elsewhere) is decided on what the DJ edits — the sides, the options and the Booth's own
 * edits — never on what the Booth derives from them (the plan's times and measurements, the stats), which differ
 * between the Booth's copy and the app's without any edit.
 */
function editsOf(p: Playlist): unknown {
  const { booth, stats: _stats, ...rest } = p;
  // (a set the Booth never planned has no edits either: the same as one with none)
  const b = {
    gapOverrides: booth?.gapOverrides,
    trims: booth?.trims,
    cortinaStopSec: booth?.cortinaStopSec,
    cortinaEdits: booth?.cortinaEdits,
    cortinaHookStart: booth?.cortinaHookStart,
    songCues: booth?.songCues,
    transitions: booth?.transitions,
  };
  return [rest, b];
}

/** the same set with the same edits: the Booth's running night has nothing to take in */
export function sameSetEdits(a: Playlist | null | undefined, b: Playlist | null | undefined): boolean {
  if (!a || !b) return a === b;
  if (a === b) return true;
  if (a.id !== b.id) return false;
  return JSON.stringify(editsOf(a)) === JSON.stringify(editsOf(b));
}
