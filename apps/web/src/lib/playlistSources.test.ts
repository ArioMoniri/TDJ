import { describe, expect, it } from "vitest";
import { cleanItem } from "./api/importMatch";
import {
  type ApiCall,
  spotifyMyPlaylists,
  spotifyPlaylistId,
  spotifyReadPlaylist,
  youtubeItem,
  youtubeMyPlaylists,
  youtubePlaylistId,
  youtubeReadPlaylist,
} from "./playlistSources";

/** a fake Web API: path prefix → answer (a function of the full path), every call logged */
function fake(routes: Array<[RegExp, (path: string) => unknown]>) {
  const log: string[] = [];
  const call: ApiCall = async <T>(path: string) => {
    log.push(path);
    const r = routes.find(([re]) => re.test(path));
    if (!r) throw Object.assign(new Error(`no route ${path}`), { status: 404 });
    const out = r[1](path);
    if (out instanceof Error) throw out;
    return out as T;
  };
  return { call, log };
}

const track = (n: number, extra: Record<string, unknown> = {}) => ({
  type: "track",
  uri: `spotify:track:${String(n).padStart(22, "a")}`,
  name: `Song ${n}`,
  artists: [{ name: "Carlos Di Sarli" }, { name: "Roberto Rufino" }],
  album: { name: "Album", release_date: "2008-05-01" },
  duration_ms: 170_000 + n,
  external_ids: { isrc: "ARF000000001" },
  ...extra,
});

describe("Spotify playlists", () => {
  it("reads links, URIs and bare ids", () => {
    expect(spotifyPlaylistId("https://open.spotify.com/playlist/37i9dQZF1DX0BxHamIEkKV?si=x")).toBe(
      "37i9dQZF1DX0BxHamIEkKV",
    );
    expect(spotifyPlaylistId("https://open.spotify.com/intl-tr/playlist/37i9dQZF1DX0BxHamIEkKV")).toBe(
      "37i9dQZF1DX0BxHamIEkKV",
    );
    expect(spotifyPlaylistId("spotify:playlist:37i9dQZF1DX0BxHamIEkKV")).toBe("37i9dQZF1DX0BxHamIEkKV");
    expect(spotifyPlaylistId("https://open.spotify.com/track/37i9dQZF1DX0BxHamIEkKV")).toBeNull();
  });

  it("every page of the playlist, in order, in the listener's market; local files and episodes skipped", async () => {
    const rows = Array.from({ length: 230 }, (_, i) =>
      i === 5
        ? { is_local: true, item: track(i, { uri: "spotify:local:x" }) }
        : i === 6
          ? { item: { type: "episode", uri: "spotify:episode:x", name: "Pod" } }
          : { item: track(i) },
    );
    const f = fake([
      [
        /^\/playlists\/P1\?/,
        () => ({ name: "Saturday", external_urls: { spotify: "https://open.spotify.com/playlist/P1" } }),
      ],
      [
        /^\/playlists\/P1\/items/,
        (p) => {
          const off = Number(/offset=(\d+)/.exec(p)![1]);
          return { items: rows.slice(off, off + 100), next: off + 100 < rows.length ? "more" : null };
        },
      ],
    ]);
    const r = await spotifyReadPlaylist(f.call, "P1");
    expect(r.name).toBe("Saturday");
    expect(r.items).toHaveLength(228);
    expect(r.skipped).toBe(2);
    expect(r.items[0]).toMatchObject({
      title: "Song 0",
      artists: ["Carlos Di Sarli", "Roberto Rufino"],
      year: 2008,
      yearIsRelease: true,
      durationSec: 170,
      isrc: "ARF000000001",
    });
    expect(r.items.map((x) => x.title).slice(5, 7)).toEqual(["Song 7", "Song 8"]);
    expect(f.log.filter((p) => p.includes("/items")).every((p) => p.includes("market=from_token"))).toBe(
      true,
    );
    expect(f.log.filter((p) => p.includes("/items"))).toHaveLength(3);
  });

  it("falls back to /tracks where /items does not exist", async () => {
    const f = fake([
      [/^\/playlists\/P2\?/, () => ({ name: "Old" })],
      [/^\/playlists\/P2\/items/, () => Object.assign(new Error("404"), { status: 404 })],
      [/^\/playlists\/P2\/tracks/, () => ({ items: [{ track: track(1) }], next: null })],
    ]);
    const r = await spotifyReadPlaylist(f.call, "P2");
    expect(r.items.map((x) => x.title)).toEqual(["Song 1"]);
  });

  it("the DJ's own playlists, every page", async () => {
    const all = Array.from({ length: 120 }, (_, i) => ({
      id: `p${i}`,
      name: `List ${i}`,
      tracks: { total: i },
    }));
    const f = fake([
      [
        /^\/me\/playlists/,
        (p) => {
          const off = Number(/offset=(\d+)/.exec(p)![1]);
          return { items: all.slice(off, off + 50), next: off + 50 < all.length ? "more" : null };
        },
      ],
    ]);
    const ls = await spotifyMyPlaylists(f.call);
    expect(ls).toHaveLength(120);
    expect(ls[119]).toMatchObject({ id: "p119", total: 119, url: "https://open.spotify.com/playlist/p119" });
  });
});

describe("YouTube playlists", () => {
  it("reads YouTube and YouTube Music links", () => {
    expect(youtubePlaylistId("https://music.youtube.com/playlist?list=PLabcdefgh12345")).toBe(
      "PLabcdefgh12345",
    );
    expect(youtubePlaylistId("https://www.youtube.com/watch?v=x&list=PLabcdefgh12345")).toBe(
      "PLabcdefgh12345",
    );
    expect(youtubePlaylistId("https://example.com/?list=PLabcdefgh12345")).toBeNull();
  });

  it("a YouTube Music upload credits the artist; another upload is read both ways round", () => {
    expect(
      youtubeItem({ videoId: "v1", title: "Bahía Blanca", channel: "Carlos Di Sarli - Topic" }),
    ).toMatchObject({
      title: "Bahía Blanca",
      artists: ["Carlos Di Sarli"],
      youtubeId: "v1",
    });
    const u = youtubeItem({
      videoId: "v2",
      title: "Carlos Di Sarli - Bahía Blanca (1957) [HD]",
      channel: "TangoTube",
    })!;
    expect(u).toMatchObject({ title: "Bahía Blanca", artists: ["Carlos Di Sarli"], year: 1957 });
    expect(u.variants?.[0]).toMatchObject({ title: "Carlos Di Sarli", artists: ["Bahía Blanca"] });
    expect(youtubeItem({ videoId: "v3", title: "Deleted video" })).toBeNull();
  });

  it("every page, with each video's length", async () => {
    const vids = Array.from({ length: 70 }, (_, i) => ({
      snippet: { title: `Orquesta ${i} - Tema ${i}`, videoOwnerChannelTitle: "Ch" },
      contentDetails: { videoId: `vid${i}` },
    }));
    const f = fake([
      [
        /^\/youtube\/v3\/playlists\?part=snippet&id=/,
        () => ({ items: [{ snippet: { title: "Milonga mix" } }] }),
      ],
      [
        /^\/youtube\/v3\/playlistItems/,
        (p) =>
          /pageToken=t2/.test(p)
            ? { items: vids.slice(50) }
            : { items: vids.slice(0, 50), nextPageToken: "t2" },
      ],
      [
        /^\/youtube\/v3\/videos/,
        (p) => ({
          items: /id=([^&]+)/
            .exec(p)![1]!
            .split(",")
            .map((id) => ({ id, contentDetails: { duration: "PT2M55S" } })),
        }),
      ],
    ]);
    const r = await youtubeReadPlaylist(f.call, "PLx");
    expect(r.name).toBe("Milonga mix");
    expect(r.items).toHaveLength(70);
    expect(r.items[69]).toMatchObject({ title: "Tema 69", durationSec: 175, youtubeId: "vid69" });
    expect(f.log.filter((p) => p.includes("/videos"))).toHaveLength(2);
  });

  it("the DJ's own playlists, every page", async () => {
    const f = fake([
      [
        /^\/youtube\/v3\/playlists\?part=snippet,contentDetails&mine=true/,
        (p) =>
          /pageToken/.test(p)
            ? { items: [{ id: "PL2", snippet: { title: "B" }, contentDetails: { itemCount: 3 } }] }
            : {
                items: [{ id: "PL1", snippet: { title: "A" }, contentDetails: { itemCount: 9 } }],
                nextPageToken: "n",
              },
      ],
    ]);
    expect((await youtubeMyPlaylists(f.call)).map((p) => [p.id, p.total])).toEqual([
      ["PL1", 9],
      ["PL2", 3],
    ]);
  });
});

describe("/api/import/match rows", () => {
  it("keeps only an item's fields, checked", () => {
    expect(
      cleanItem({ title: "  Poema ", artists: ["Canaro", 3, ""], spotifyUri: "spotify:track:bad", evil: 1 }),
    ).toEqual({
      title: "Poema",
      artists: ["Canaro"],
    });
    expect(cleanItem({ artists: ["x"] })).toBeNull();
    expect(
      cleanItem({
        title: "A",
        artists: [],
        tanda: 3,
        cortina: true,
        durationSec: 99999,
        closing: "opening",
        year: 1941,
      }),
    ).toEqual({
      title: "A",
      artists: [],
      tanda: 3,
      cortina: true,
      durationSec: 3600,
      closing: "opening",
      year: 1941,
    });
  });
});
