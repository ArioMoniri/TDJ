import { describe, expect, it, vi } from "vitest";
import { downloadBlob } from "./download";
import {
  isExternalLink,
  linkService,
  openExternal,
  spotifyWebUrl,
  youtubeMusicFor,
  youtubePlaylistUrl,
  youtubeVideoUrl,
} from "./openLink";

describe("open in the service's app", () => {
  it("names the service of every link T-DJ writes", () => {
    expect(linkService("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC")).toBe("spotify");
    expect(linkService("spotify:")).toBe("spotify");
    expect(linkService(youtubePlaylistUrl("PL1"))).toBe("youtube");
    expect(linkService("https://music.youtube.com/playlist?list=PL1")).toBe("youtube-music");
    expect(linkService("https://music.apple.com/us/album/x/1")).toBe("apple-music");
    expect(linkService("https://www.deezer.com/track/1")).toBe("deezer");
    expect(linkService("https://www.tunemymusic.com/")).toBe("other");
  });

  it("uses universal links (https) that iOS hands to the installed app", () => {
    expect(spotifyWebUrl("spotify:playlist:37i9dQZF1DX0XUsuxWHRQd")).toBe(
      "https://open.spotify.com/playlist/37i9dQZF1DX0XUsuxWHRQd",
    );
    expect(spotifyWebUrl("spotify:track:x")).toBeNull();
    expect(youtubeVideoUrl("a_b-C")).toBe("https://www.youtube.com/watch?v=a_b-C");
    expect(youtubeMusicFor(youtubePlaylistUrl("PL1"))).toBe("https://music.youtube.com/playlist?list=PL1");
    expect(youtubeMusicFor("https://open.spotify.com/track/x")).toBeNull();
  });

  it("only https, mailto and music apps' schemes leave the app (never javascript: or file:)", () => {
    for (const u of ["https://x.y", "mailto:a@b", "spotify:", "music://music.apple.com/x"])
      expect(isExternalLink(u)).toBe(true);
    for (const u of ["javascript:alert(1)", "file:///etc/passwd", "http://x.y", "/booth"])
      expect(isExternalLink(u)).toBe(false);
  });

  it("in the apps: the native opener, with the web page as the fallback when the app is missing", async () => {
    const calls: string[] = [];
    const invoke = vi.fn(async (_c: string, a?: Record<string, unknown>) => {
      calls.push(a!.url as string);
      if (a!.url === "spotify:") throw new Error("no app");
    });
    const open = vi.fn();
    expect(await openExternal("spotify:", { fallback: "https://open.spotify.com", invoke, open })).toBe(true);
    expect(calls).toEqual(["spotify:", "https://open.spotify.com"]);
    expect(open).not.toHaveBeenCalled();
    expect(await openExternal("javascript:alert(1)", { invoke, open })).toBe(false);
  });

  it("in a browser: a new tab on the https link, never this page", async () => {
    const open = vi.fn();
    await openExternal("spotify:", { fallback: "https://open.spotify.com", open, invoke: undefined });
    expect(open).toHaveBeenCalledWith("https://open.spotify.com", "_blank", "noopener,noreferrer");
  });
});

describe("exported files", () => {
  it("in the apps go to the native save panel / Files picker as bytes", async () => {
    const invoke = vi.fn(async () => "/Users/dj/x.m3u8");
    await downloadBlob("Night.m3u8", "#EXTM3U\nä", "audio/x-mpegurl", invoke);
    expect(invoke).toHaveBeenCalledWith("save_file", {
      name: "Night.m3u8",
      bytes: Array.from(new TextEncoder().encode("#EXTM3U\nä")),
    });
  });
});
