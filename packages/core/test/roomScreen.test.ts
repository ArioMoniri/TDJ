/**
 * 2026-11 — the dancers' Floor screen through a room: the booth says the screen state with the playing song, the room
 * keeps a plain bounded object, and any device with the room's code reads it back with the hearts.
 */
import { describe, expect, it } from "vitest";
import { cleanRoomScreen, ROOM_SCREEN_MAX, roomHeartsView, setRoomPlaying } from "../src";

describe("the Floor screen state in a room", () => {
  const playing = {
    songId: "s1",
    nightId: "n1",
    title: "Malena",
    artist: "Troilo",
    at: "2026-11-16T20:00:00Z",
  };
  it("kept with the playing song and read back with the hearts", () => {
    const screen = { v: 1, kind: "song", k: 1, n: 4 };
    const room = setRoomPlaying({ hearts: {}, playing: null } as never, { ...playing, screen });
    expect(roomHeartsView(room).screen).toEqual(screen);
    // a booth that says none clears it
    expect(roomHeartsView(setRoomPlaying(room, playing)).screen).toBeUndefined();
  });
  it("only a plain object within the bound", () => {
    expect(cleanRoomScreen([1, 2])).toBeNull();
    expect(cleanRoomScreen("x")).toBeNull();
    expect(cleanRoomScreen({ big: "x".repeat(ROOM_SCREEN_MAX) })).toBeNull();
    expect(cleanRoomScreen({ a: 1 })).toEqual({ a: 1 });
  });
});
