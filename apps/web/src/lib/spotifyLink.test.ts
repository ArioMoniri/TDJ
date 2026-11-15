import { describe, expect, it } from "vitest";
import { spotifyUri, spotifyUrl } from "./spotifyLink";

describe("Spotify links in the Database", () => {
  it("turns the index's URI into a link", () => {
    expect(spotifyUrl("spotify:track:4uLU6hMCjMI75M1A2tKUQC")).toBe(
      "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
    );
  });
  it("keeps a pasted share link, drops the tracking query", () => {
    expect(spotifyUrl("https://open.spotify.com/intl-es/track/4uLU6hMCjMI75M1A2tKUQC?si=abc")).toBe(
      "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
    );
  });
  it("has no link for nothing or junk", () => {
    expect(spotifyUrl(undefined)).toBeNull();
    expect(spotifyUrl("javascript:alert(1)")).toBeNull();
  });
  it("stores a pasted share link as the URI", () => {
    expect(spotifyUri(" https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=x ")).toBe(
      "spotify:track:4uLU6hMCjMI75M1A2tKUQC",
    );
    expect(spotifyUri("spotify:track:4uLU6hMCjMI75M1A2tKUQC")).toBe("spotify:track:4uLU6hMCjMI75M1A2tKUQC");
  });
});
