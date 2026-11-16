"use client";
import { useRooms } from "./rooms";
import { spotCall } from "./spot";
import { useStore } from "./store";
import type { Playlist } from "./types";

/**
 * 2026-11 (the owner: "in a room, cortinas are generated automatically whenever tandas are added, inserted, removed,
 * reordered or built, exactly like Compose"). Whatever changed the room's night — Add a tanda, the Insert sheet,
 * a drag, Build by hand's "Use this night", an import, another DJ's edit — once its tandas or cortinas change, the
 * night goes through the engine's mending (POST /api/spot `mend` → core insert.ts mendNightCortinas: every gap one
 * cortina of the night's cultures, never twice in a row, the última's by the closing format, the DJ's picks kept, and
 * a night that grew from empty its opening and closing La Cumparsita). The mend is deterministic, so two DJs mending
 * the same night send the same edit (the room ignores the echo). It is not an undo step of its own: undoing the edit
 * brings back the night before it, which was mended already.
 */

/** what the mending looks at: each tanda's sides and cortina, the Cumparsitas and the settings that decide them */
export function cortinaSignature(p: Playlist | null): string {
  if (!p) return "";
  const o = p.options ?? ({} as Playlist["options"]);
  return [
    p.tandas.map((t) => `${t.songs.map((s) => s.id).join(",")}>${t.cortina?.id ?? ""}`).join(";"),
    p.opening?.id ?? "",
    p.closing?.id ?? "",
    o.cortinaStyle ?? "",
    o.rules?.closingFormat ?? "",
    o.rules?.cumparsita ?? "",
    (o.cortinaCultures ?? []).join(","),
  ].join("|");
}

/**
 * a night the engine should look at: one with tandas (an empty gap and a twin are plain to see, the última's cortina
 * and the Cumparsitas follow the closing format, which the engine reads: it is asked once per change)
 */
export const needsMend = (p: Playlist): boolean => p.tandas.length > 0;

let last = "";
let timer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;

async function mend() {
  const st = useStore.getState();
  const p = st.playlist;
  const room = useRooms.getState();
  if (!p || !room.active || !room.info || room.waitingForNight || !needsMend(p)) return;
  const n = ++seq;
  const r = await spotCall("mend", { playlist: p, cumparsitas: true });
  if (n !== seq) return;
  const { changed, reason: _r, ...after } = r.json as Playlist & { changed?: boolean; reason?: string };
  // the DJ edited meanwhile: the next change mends that night instead
  if (!r.ok || !changed || useStore.getState().playlist !== p) return;
  last = cortinaSignature(after as Playlist);
  st.setPlaylist(after as Playlist);
}

/** starts watching (RoomSync, once per page load); returns the stop */
export function watchRoomCortinas(): () => void {
  last = cortinaSignature(useStore.getState().playlist);
  const off = useStore.subscribe((s, prev) => {
    if (s.playlist === prev.playlist) return;
    const sig = cortinaSignature(s.playlist);
    if (sig === last) return;
    last = sig;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void mend(), 350);
  });
  return () => {
    off();
    if (timer) clearTimeout(timer);
  };
}
