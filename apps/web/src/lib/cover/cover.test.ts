import { readFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { exportNight } from "@tdj/core";
import { describe, expect, it } from "vitest";
import {
  coverData,
  coverFamily,
  coverMeta,
  coverSeedOf,
  nightCoverSvg,
  nightHash,
  nightIdentity,
} from "./index";
import { base64Length, fitJpeg, QUALITIES, SPOTIFY_COVER_MAX } from "./raster";
import { COVER_SCOPE, putPlaylistCover, uploadSpotifyCover } from "./spotify";
import { randomNight } from "./testNights";

const featured = JSON.parse(
  readFileSync(new URL("../../../public/featured/golden-double-peak.json", import.meta.url), "utf8"),
);

/** a well-formedness check without a DOM: resvg parses the XML and fails on anything malformed */
const parses = (svg: string) => {
  const r = new Resvg(svg).render();
  return r.width > 0 && r.height > 0;
};
/** the 56 px thumbnail's RGB pixels */
const pixels = (svg: string) => new Resvg(svg).render().pixels;
const distance = (a: Uint8Array | Buffer, b: Uint8Array | Buffer) => {
  let s = 0;
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    s += Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!);
    n += 3;
  }
  return s / n;
};

describe("nightCoverSvg", () => {
  it("is deterministic: the same night gives byte-identical SVG, every size and theme", () => {
    for (const o of [
      { size: 640 },
      { size: 56, theme: "dark" as const },
      { size: "og" as const, locale: "tr" as const },
    ]) {
      const a = nightCoverSvg(featured, o);
      const b = nightCoverSvg(structuredClone(featured), o);
      expect(a).toBe(b);
    }
  });

  it("is valid XML at 640, 56 and 1200 × 630, light and dark", () => {
    for (const size of [640, 56, "og"] as const)
      for (const theme of ["light", "dark"] as const) {
        const svg = nightCoverSvg(featured, { size, theme });
        expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
        expect(parses(svg)).toBe(true);
      }
    expect(nightCoverSvg(featured, { size: "og" })).toContain('width="1200" height="630"');
    expect(nightCoverSvg(featured, { size: 640 })).toContain('width="640" height="640"');
  });

  it("escapes the title and keeps Turkish letters (outlined, and in the accessible label)", () => {
    const night = { ...featured, name: `Çarşamba "İğneada" & <ağır> 'milonga' · 4 h` };
    const svg = nightCoverSvg(night, { locale: "tr" });
    expect(parses(svg)).toBe(true);
    expect(svg).toContain("Çarşamba &quot;İğneada&quot; &amp; &lt;ağır&gt; &apos;milonga&apos;");
    expect(svg).not.toMatch(/<ağır>/);
    // the Turkish words: the era and the length line
    expect(coverMeta(coverData(featured), "tr")).toBe("4 sa 35 · 25 tanda");
    expect(coverMeta(coverData(featured), "en")).toBe("4 h 35 · 25 tandas");
  });

  it("thumbnails carry no words", () => {
    const svg = nightCoverSvg(featured, { size: 56 });
    // a title path is the only element scaled by the glyph size; the thumbnail has the arc and the marks only
    expect(svg).not.toContain("scale(0.");
    expect(nightCoverSvg(featured, { size: 640 })).toContain("scale(0.");
  });

  it("never throws on empty or odd nights", () => {
    const odd: unknown[] = [
      null,
      undefined,
      42,
      "night",
      [],
      {},
      { tandas: [] },
      { tandas: null, name: 7 },
      { tandas: [null, 3, {}], options: null },
      { tandas: [{ rhythm: "cumbia", energy: Number.NaN }], name: "\u0000​🎻 ⁂", stats: { durationSec: -5 } },
      { tandas: [{ rhythm: "vals", energy: 1e9 }], options: { eras: [42], hours: "4" } },
      {
        name: "x".repeat(5000),
        tandas: Array.from({ length: 400 }, () => ({ rhythm: "tango", energy: 50 })),
      },
    ];
    for (const n of odd)
      for (const size of [640, 56, "og"] as const) {
        const svg = nightCoverSvg(n, { size });
        expect(parses(svg)).toBe(true);
      }
  }, 180_000);
});

describe("one cover per generation", () => {
  it("a Playlist and the .tdjnight made from it have the same identity and the same cover", () => {
    const night = exportNight(featured);
    expect(nightIdentity(night)).toBe(nightIdentity(featured));
    expect(coverFamily(coverSeedOf(night)).pairing.name).toBe(
      coverFamily(coverSeedOf(featured)).pairing.name,
    );
  });

  it("a kept coverSeed wins: an edited version keeps its entry's family", () => {
    const edited = { ...featured, tandas: featured.tandas.slice(0, 20), coverSeed: coverSeedOf(featured) };
    expect(nightIdentity(edited)).not.toBe(nightIdentity(featured));
    expect(coverData(edited).seed).toBe(coverSeedOf(featured));
    expect(nightHash(edited)).not.toBe(nightHash(featured));
  });

  it("50 random nights give 50 distinct covers, far apart at 56 px, each byte-identical on a second draw", () => {
    const nights = Array.from({ length: 50 }, (_, i) => randomNight(1000 + i * 7));
    const svgs = nights.map((n) => nightCoverSvg(n, { size: 56 }));
    expect(new Set(svgs).size).toBe(50);
    nights.forEach((n, i) => expect(nightCoverSvg(structuredClone(n), { size: 56 })).toBe(svgs[i]));
    const px = svgs.map(pixels);
    let min = Number.POSITIVE_INFINITY;
    for (let i = 0; i < px.length; i++)
      for (let j = i + 1; j < px.length; j++) min = Math.min(min, distance(px[i]!, px[j]!));
    // mean absolute difference per channel (0–255) between the closest two of the 50: the arc, the marks and the
    // motif's angle and density set two nights of the same colour pairing apart
    expect(min).toBeGreaterThan(MIN_DISTANCE);
  });
});
/** the floor for the closest pair (measured 7.8 on these 50 nights; the test is deterministic) */
const MIN_DISTANCE = 6;

describe("JPEG size cap", () => {
  it("counts the base64 body", () => {
    expect(base64Length(3)).toBe(4);
    expect(base64Length(196_608)).toBe(SPOTIFY_COVER_MAX);
  });
  it("lowers the quality until the base64 fits, else gives up", async () => {
    const tried: number[] = [];
    // a fake encoder: size falls with quality
    const enc = async (q: number) => {
      tried.push(q);
      return { size: Math.round(400_000 * q) };
    };
    const r = await fitJpeg(enc);
    expect(r).not.toBeNull();
    expect(base64Length(r!.blob.size)).toBeLessThanOrEqual(SPOTIFY_COVER_MAX);
    expect(tried[0]).toBe(QUALITIES[0]);
    expect(r!.quality).toBe(tried.at(-1));
    expect(await fitJpeg(async () => ({ size: 10_000_000 }))).toBeNull();
  });
});

describe("Spotify cover upload (fake Spotify)", () => {
  const fake = (status: number) => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const f = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).startsWith("/api/spotify/access"))
        return new Response(JSON.stringify({ access: "fresh" }), { status: 200 });
      return new Response(null, { status });
    }) as unknown as typeof fetch;
    return { f, calls };
  };
  const base = { playlist: featured, playlistId: "pl1", makeJpeg: async () => "AAAA" };

  it("PUTs the base64 JPEG to /playlists/{id}/images", async () => {
    const { f, calls } = fake(202);
    const r = await uploadSpotifyCover({
      ...base,
      enabled: true,
      hosted: false,
      access: "t",
      scopes: `a ${COVER_SCOPE}`,
      fetchImpl: f,
    });
    expect(r).toBe("added");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.spotify.com/v1/playlists/pl1/images");
    expect(calls[0]!.init?.method).toBe("PUT");
    const headers = (calls[0]!.init?.headers ?? {}) as Record<string, string>;
    expect(headers["content-type"]).toBe("image/jpeg");
    expect(calls[0]!.init?.body).toBe("AAAA");
  });
  it("without the scope: nothing is sent, the hint path", async () => {
    const { f, calls } = fake(202);
    const r = await uploadSpotifyCover({
      ...base,
      enabled: true,
      hosted: true,
      scopes: ["playlist-modify-private"],
      fetchImpl: f,
    });
    expect(r).toBe("no-scope");
    expect(calls).toHaveLength(0);
  });
  it("an unknown scope list tries, and a 401 / 403 reads as the missing scope", async () => {
    for (const s of [401, 403]) {
      const { f } = fake(s);
      expect(
        await uploadSpotifyCover({ ...base, enabled: true, hosted: false, access: "t", fetchImpl: f }),
      ).toBe("no-scope");
    }
    const { f } = fake(500);
    expect(
      await uploadSpotifyCover({ ...base, enabled: true, hosted: false, access: "t", fetchImpl: f }),
    ).toBe("failed");
  });
  it("hosted: the JPEG goes through /api/spotify/cover, whose answer decides", async () => {
    for (const [answer, want] of [
      [{ added: true }, "added"],
      [{ added: false, reason: "scope" }, "no-scope"],
      [{ added: false, reason: "spotify" }, "failed"],
    ] as const) {
      const calls: Array<{ url: string; body: string }> = [];
      const f = (async (url: string, init?: RequestInit) => {
        calls.push({ url: String(url), body: String(init?.body) });
        return new Response(JSON.stringify(answer), { status: 200 });
      }) as unknown as typeof fetch;
      expect(await uploadSpotifyCover({ ...base, enabled: true, hosted: true, fetchImpl: f })).toBe(want);
      expect(calls.map((c) => c.url)).toEqual(["/api/spotify/cover"]);
      expect(JSON.parse(calls[0]!.body)).toEqual({ playlistId: "pl1", jpeg: "AAAA" });
    }
  });
  it("the setting off: skipped; errors never escape", async () => {
    const { f, calls } = fake(202);
    expect(
      await uploadSpotifyCover({ ...base, enabled: false, hosted: false, access: "t", fetchImpl: f }),
    ).toBe("skipped");
    expect(calls).toHaveLength(0);
    const boom = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await putPlaylistCover("t", "pl1", "AAAA", boom)).toBe("failed");
    expect(
      await uploadSpotifyCover({
        ...base,
        enabled: true,
        hosted: false,
        access: "t",
        makeJpeg: async () => {
          throw new Error("no canvas");
        },
      }),
    ).toBe("failed");
    expect(await putPlaylistCover("t", "../me", "AAAA", boom)).toBe("failed");
  });
});
