"use client";
import { t } from "./i18n";
import { lyricTapRoute, roomSeekSec } from "./lyricsSync";
import { externalSeek, tapPlay } from "./playback";
import { externalAudio, usePlayer } from "./player";
import { boothEngine, boothStore, planRowOf, readPlaying } from "./playingPosition";
import { inBooth } from "./songOpen";
import type { Song } from "./types";

/**
 * 2026-11 — a tap on a synced lyric line plays the side from that line, from any tab (lib/lyricsSync.ts →
 * `lyricTapRoute` decides): the side that plays seeks there (the room, a pre-listen, the mini player); else it starts
 * at the line — the mini player (which pre-listens in the headphones itself while a night runs), or in the Booth by
 * its rules: before the night a pre-listen (the headphones, else this device: the room), mid-night the headphones,
 * and with no headphones chosen tonight's row plays in the room only once the DJ confirms (it cuts the room's song).
 */
export type LineJump =
  | { kind: "ok" }
  /** the DJ must confirm: `run` plays it in the room from the line */
  | { kind: "confirm"; run: () => Promise<LineJump> }
  /** nothing played: why (a toast) */
  | { kind: "said"; text: string };

const OK: LineJump = { kind: "ok" };

/** wait (a few seconds at most) for the room's new item to have a clock */
async function roomReady(songId: string, ms = 6000): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const b = boothStore()?.getState();
    if (b && b.positionOf(songId)?.where === "room") return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

/** the room seeks to the recording's second `sec` (its item clock starts at the cue in / cut head) */
async function seekRoom(sec: number): Promise<LineJump> {
  const b = boothStore();
  const e = boothEngine();
  if (!b || !e) return { kind: "said", text: t("song.lyrics_cant_jump") };
  const src = e.sourcePosition();
  const start = src === null ? 0 : src - e.position();
  await b.getState().seek(roomSeekSec(sec, start, e.currentLength()));
  return OK;
}

export async function playFromLine(song: Song, sec: number): Promise<LineJump> {
  const store = boothStore();
  const st = store?.getState() ?? null;
  const playing = readPlaying(song.id);
  const here = inBooth();
  const route = lyricTapRoute(
    playing,
    st && (here || st.started)
      ? { here, started: st.started, row: planRowOf(st, song.id), cueBlocked: st.cueBlocked() }
      : null,
  );
  const prelisten = async (row: number | null): Promise<LineJump> => {
    const b = boothStore()?.getState();
    if (!b) return { kind: "said", text: t("song.lyrics_cant_jump") };
    const why = await b.prelisten(row !== null ? { i: row } : { song }, { startSec: sec });
    return why ? { kind: "said", text: t("booth.songSheet.can_t_pre_listen", { why }) } : OK;
  };
  switch (route.kind) {
    case "seek-room":
      return seekRoom(sec);
    case "seek-cue": {
      const p = usePlayer.getState();
      // the mini player's headphones pre-listen (another tab): its own seek starts the cue again there
      if (p.track?.id === song.id && p.track.source.kind === "cue") {
        await externalSeek(sec);
        return OK;
      }
      const a = st?.audition;
      return prelisten(a && a.songId === song.id && a.i !== null ? a.i : null);
    }
    case "seek-player": {
      const p = usePlayer.getState();
      if (externalAudio(p.track?.source)) await externalSeek(sec);
      else {
        p.seek(sec);
        if (!p.playing) usePlayer.setState({ playing: true });
      }
      return OK;
    }
    case "clip":
      return { kind: "said", text: t("song.lyrics_clip_no_jump") };
    case "prelisten":
      return prelisten(route.row);
    case "blocked":
      return { kind: "said", text: t("play.booth_running", { why: route.why }) };
    case "confirm-room":
      return {
        kind: "confirm",
        run: async () => {
          const b = boothStore()?.getState();
          if (!b) return { kind: "said", text: t("song.lyrics_cant_jump") };
          await b.playNow(route.row);
          if (!(await roomReady(song.id))) return { kind: "said", text: t("song.lyrics_cant_jump") };
          return seekRoom(sec);
        },
      };
    case "player": {
      const ok = await tapPlay({ kind: "song", song }, null, { scope: "one", startSec: sec });
      return ok ? OK : { kind: "said", text: "" };
    }
  }
}
