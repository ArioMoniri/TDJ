import { describe, expect, it } from "vitest";
import {
  authorizeUrl,
  base64url,
  beginPkce,
  challengeS256,
  createVerifier,
  readCallback,
  refreshBody,
  SPOTIFY_APP_REDIRECT,
  tokenBody,
} from "./pkce";

/** The apps sign in to Spotify with Authorization Code + PKCE (RFC 7636): no client secret ships in the app. */
describe("PKCE helper", () => {
  it("S256 challenge matches RFC 7636 appendix B", async () => {
    expect(await challengeS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("base64url has no padding and the URL-safe alphabet", () => {
    expect(base64url(new Uint8Array([251, 255, 191]))).toBe("-_-_");
    expect(base64url(new Uint8Array([0]))).toBe("AA");
  });

  it("verifiers are 43–128 unreserved characters and differ every time", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const v = createVerifier();
      expect(v).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
      seen.add(v);
    }
    expect(seen.size).toBe(50);
  });

  it("the authorize URL carries the challenge, state and the app's deep-link redirect, never a secret", async () => {
    const p = await beginPkce({ clientId: "abc123", scopes: "streaming user-read-email" });
    const u = new URL(p.url);
    expect(u.origin + u.pathname).toBe("https://accounts.spotify.com/authorize");
    expect(u.searchParams.get("client_id")).toBe("abc123");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("redirect_uri")).toBe(SPOTIFY_APP_REDIRECT);
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("code_challenge")).toBe(await challengeS256(p.verifier));
    expect(u.searchParams.get("state")).toBe(p.state);
    expect(u.searchParams.get("scope")).toBe("streaming user-read-email");
    expect(p.url).not.toMatch(/secret/i);
    expect(SPOTIFY_APP_REDIRECT).toBe("tdj://spotify-callback");
  });

  it("authorizeUrl accepts another accounts host (tests, self-hosted mocks)", () => {
    const u = new URL(
      authorizeUrl({
        clientId: "x",
        challenge: "c",
        state: "s",
        scopes: "a",
        redirectUri: "tdj://spotify-callback",
        authorize: "http://127.0.0.1:9/authorize",
      }),
    );
    expect(u.host).toBe("127.0.0.1:9");
  });

  it("the callback is accepted only with the state this device sent", () => {
    expect(readCallback("code=AQB&state=s1", "s1")).toEqual({ code: "AQB" });
    expect(readCallback("?code=AQB&state=s1", "s1")).toEqual({ code: "AQB" });
    expect(readCallback("code=AQB&state=other", "s1")).toEqual({ error: "state" });
    expect(readCallback("code=AQB", "s1")).toEqual({ error: "state" });
    expect(readCallback("error=access_denied&state=s1", "s1")).toEqual({ error: "access_denied" });
    expect(readCallback("state=s1", "s1")).toEqual({ error: "no_code" });
    expect(readCallback("code=AQB&state=s1", "")).toEqual({ error: "state" });
  });

  it("token and refresh bodies are public-client PKCE forms (no client_secret)", () => {
    const t = tokenBody({ clientId: "abc", code: "AQB", verifier: "v".repeat(43) });
    expect(Object.fromEntries(t)).toEqual({
      grant_type: "authorization_code",
      client_id: "abc",
      code: "AQB",
      redirect_uri: SPOTIFY_APP_REDIRECT,
      code_verifier: "v".repeat(43),
    });
    const r = refreshBody({ clientId: "abc", refreshToken: "RT" });
    expect(Object.fromEntries(r)).toEqual({
      grant_type: "refresh_token",
      client_id: "abc",
      refresh_token: "RT",
    });
    expect(t.has("client_secret")).toBe(false);
    expect(r.has("client_secret")).toBe(false);
  });
});
