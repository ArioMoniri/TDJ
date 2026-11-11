import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Playlist, planBooth, type Song } from "@tdj/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decorate, planEntities } from "../plan";
import { type SdkPlayer, type SdkPlayerCtor, SpotifyAdapter } from "./spotify";

const featured = JSON.parse(
  readFileSync(join(__dirname, "../../../../public/featured/golden-double-peak.json"), "utf8"),
) as Playlist;

/** a fake Web Playback SDK player: connects at once and reports a device id */
function fakeSdk(): SdkPlayerCtor {
  return class implements SdkPlayer {
    private ls: Record<string, (e: unknown) => void> = {};
    async connect() {
      setTimeout(() => this.ls.ready?.({ device_id: "dev-1" }), 0);
      return true;
    }
    disconnect() {}
    addListener(ev: string, cb: (e: unknown) => void) {
      this.ls[ev] = cb;
    }
    async getCurrentState() {
      return null;
    }
    async setVolume() {}
    async pause() {}
    async resume() {}
  } as unknown as SdkPlayerCtor;
}

afterEach(() => vi.useRealTimers());

describe("round 18: logged into Spotify, the booth plays exactly the checked recording", () => {
  it("prepare hands the engine the side's stored spotify.uri for every item of the featured night", async () => {
    const plan = decorate(featured, planBooth(featured));
    const ents = planEntities(featured, plan);
    const a = new SpotifyAdapter({ fetchImpl: vi.fn() as unknown as typeof fetch, noFades: false });
    let n = 0;
    for (let i = 0; i < plan.items.length; i++) {
      const e = ents[i] as Song | null;
      if (!e?.spotify?.uri) {
        if (e) expect(await a.resolve(plan.items[i]!, e)).toBe("missing");
        continue;
      }
      expect(await a.resolve(plan.items[i]!, e)).toBe("ready");
      const p = await a.prepare(plan.items[i]!, e);
      expect(p.spotifyUri).toBe(e.spotify.uri);
      n++;
    }
    // every item with a checked Spotify id (round 19: all 108, İşte Öyle Bir Şey included)
    expect(n).toBe(ents.filter((e) => !!(e as Song | null)?.spotify?.uri).length);
    expect(n).toBeGreaterThanOrEqual(107);
  });

  it("startItem PUTs /me/player/play with that uri and nothing else: no search, no re-match", async () => {
    vi.useFakeTimers();
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method, body: init?.body as string | undefined });
      if (url === "/api/spotify/access")
        return new Response(JSON.stringify({ access: "tok" }), { status: 200 });
      return new Response(null, { status: 204 });
    });
    const a = new SpotifyAdapter({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      loadSdk: async () => fakeSdk(),
      noFades: false,
    });
    const connecting = a.connect();
    await vi.advanceTimersByTimeAsync(10);
    await connecting;
    const uri = featured.tandas[22]!.songs[0]!.spotify!.uri; // Recuerdo Malevo, the checked 153 s transfer
    a.startItem({
      uri,
      delaySec: 0,
      positionSec: 0,
      gainDb: 0,
      onEnded: () => {},
      onError: (m) => {
        throw new Error(m);
      },
    });
    await vi.advanceTimersByTimeAsync(50);
    const play = calls.filter((c) => c.url.includes("/me/player/play"));
    expect(play).toHaveLength(1);
    expect(play[0]!.url).toBe("https://api.spotify.com/v1/me/player/play?device_id=dev-1");
    expect(play[0]!.method).toBe("PUT");
    expect(JSON.parse(play[0]!.body!)).toEqual({ uris: [uri], position_ms: 0 });
    // the only endpoints: the token, the transfer to this device, the play call
    for (const c of calls)
      expect(c.url).toMatch(
        /^(\/api\/spotify\/access|https:\/\/api\.spotify\.com\/v1\/me\/player(\/play\?device_id=dev-1)?)$/,
      );
  });
});
