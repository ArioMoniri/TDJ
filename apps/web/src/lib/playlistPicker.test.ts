import { describe, expect, it } from "vitest";
import { filterPlaylists, PICKER_PAGE, pagePlaylists, playlistLine } from "./playlistPicker";
import { type ApiCall, spotifyMyPlaylists, youtubeMyPlaylists } from "./playlistSources";

const lists = Array.from({ length: 57 }, (_, i) => ({
  id: `p${i}`,
  name: i === 3 ? "Sábado Milonga — Di Sarli" : i === 40 ? "Práctica late" : `List ${i}`,
  total: i,
  owner: i === 40 ? "Ana Peña" : "DJ",
  url: `https://open.spotify.com/playlist/p${i}`,
}));

describe("the playlist picker", () => {
  it("pages the DJ's playlists, PICKER_PAGE at a time, and says how many more there are", () => {
    expect(PICKER_PAGE).toBe(20);
    const one = pagePlaylists(lists, 1);
    expect(one.visible.map((p) => p.id)).toEqual(lists.slice(0, 20).map((p) => p.id));
    expect(one.more).toBe(37);
    expect(pagePlaylists(lists, 2).more).toBe(17);
    const all = pagePlaylists(lists, 3);
    expect(all.visible).toHaveLength(57);
    expect(all.more).toBe(0);
    // (a nonsense page count still shows the first page)
    expect(pagePlaylists(lists, 0).visible).toHaveLength(20);
  });

  it("searches the name and the owner, accents and case aside, every word in any order", () => {
    expect(filterPlaylists(lists, "sabado").map((p) => p.id)).toEqual(["p3"]);
    expect(filterPlaylists(lists, "di SARLI milonga").map((p) => p.id)).toEqual(["p3"]);
    expect(filterPlaylists(lists, "pena").map((p) => p.id)).toEqual(["p40"]);
    expect(filterPlaylists(lists, "  ")).toHaveLength(57);
    expect(filterPlaylists(lists, "nothing like this")).toEqual([]);
    // the service's order is kept
    expect(
      filterPlaylists(lists, "list 1")
        .map((p) => p.id)
        .slice(0, 3),
    ).toEqual(["p1", "p10", "p11"]);
  });

  it("a row says the song count and the owner", () => {
    const songs = (n: number) => `${n} songs`;
    expect(playlistLine({ total: 12, owner: "DJ Ana" }, songs)).toBe("12 songs · DJ Ana");
    expect(playlistLine({ total: 3 }, songs)).toBe("3 songs");
  });
});

describe("the DJ's playlists as the picker lists them (import mapping)", () => {
  it("Spotify: every page of /me/playlists, with the cover, the count (the 2026 `items` or `tracks`) and the owner", async () => {
    const asked: string[] = [];
    const call: ApiCall = async <T>(path: string) => {
      asked.push(path);
      const off = Number(new URL(`https://x${path}`).searchParams.get("offset"));
      const all = Array.from({ length: 120 }, (_, i) => ({
        id: `sp${i}`,
        name: `Mine ${i}`,
        owner: { display_name: i % 2 ? "Ana" : undefined },
        images: i === 0 ? [{ url: "https://i.scdn.co/image/a" }] : null,
        ...(i % 3 ? { items: { total: i } } : { tracks: { total: i + 1 } }),
      }));
      return {
        items: [...all.slice(off, off + 50), null],
        next: off + 50 < all.length ? "more" : null,
      } as T;
    };
    const got = await spotifyMyPlaylists(call);
    expect(asked).toEqual([
      "/me/playlists?limit=50&offset=0",
      "/me/playlists?limit=50&offset=50",
      "/me/playlists?limit=50&offset=100",
    ]);
    expect(got).toHaveLength(120);
    expect(got[0]).toEqual({
      id: "sp0",
      name: "Mine 0",
      total: 1,
      image: "https://i.scdn.co/image/a",
      url: "https://open.spotify.com/playlist/sp0",
    });
    expect(got[1]).toMatchObject({ total: 1, owner: "Ana" });
    expect(got[1]!.image).toBeUndefined();
  });

  it("YouTube: every page by its token, with the thumbnail, the count and the channel", async () => {
    const asked: string[] = [];
    const call: ApiCall = async <T>(path: string) => {
      asked.push(path);
      const second = path.includes("pageToken=T2");
      return {
        items: [
          {
            id: second ? "PL2" : "PL1",
            snippet: {
              title: second ? "Milonga mix" : "Tandas",
              channelTitle: "Ana",
              thumbnails: { default: { url: "https://i.ytimg.com/x.jpg" } },
            },
            contentDetails: { itemCount: second ? 9 : 24 },
          },
        ],
        ...(second ? {} : { nextPageToken: "T2" }),
      } as T;
    };
    const got = await youtubeMyPlaylists(call);
    expect(asked).toHaveLength(2);
    expect(got).toEqual([
      {
        id: "PL1",
        name: "Tandas",
        total: 24,
        owner: "Ana",
        image: "https://i.ytimg.com/x.jpg",
        url: "https://www.youtube.com/playlist?list=PL1",
      },
      {
        id: "PL2",
        name: "Milonga mix",
        total: 9,
        owner: "Ana",
        image: "https://i.ytimg.com/x.jpg",
        url: "https://www.youtube.com/playlist?list=PL2",
      },
    ]);
  });
});
