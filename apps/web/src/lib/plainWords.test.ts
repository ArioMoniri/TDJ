import { describe, expect, it } from "vitest";
import { engineerWord } from "./plainWords";

describe("plain words on the DJ's screen", () => {
  it("catches setting names and plumbing words", () => {
    expect(engineerWord("Set TDJ_DB_TABLE on the server")).toBe("TDJ_DB_TABLE");
    expect(engineerWord("set by NEXT_PUBLIC_APP_URL")).toBe("NEXT_PUBLIC_APP_URL");
    expect(engineerWord("needs SPOTIFY_CLIENT_ID")).toBe("SPOTIFY_CLIENT_ID");
    expect(engineerWord("paste its Workspace ID")).toBe("Workspace");
    expect(engineerWord("the Lambda timed out")).toBe("Lambda");
    expect(engineerWord("kept in DynamoDB")).toBe("DynamoDB");
    expect(engineerWord("the API route failed")).toBe("API route");
    expect(engineerWord("check the server config")).toBe("server config");
    expect(engineerWord("an env var is missing")).toBe("env var");
    expect(engineerWord("Energy NaN")).toBe("NaN");
  });
  it("lets a DJ's sentence through", () => {
    for (const ok of [
      "Two tango tandas, a vals, two tangos, a milonga.",
      "Pre-listen in your headphones: the room does not hear it.",
      "La Cumparsita now: the song playing fades out.",
      "Last 4 tandas tango only",
      "D'Arienzo 1938 · 4 BPM 122 · 1A",
      "Paste your own key: it stays on this device.",
      "TTVTTM",
    ])
      expect(engineerWord(ok)).toBeNull();
  });
});
