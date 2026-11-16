import { CONTRIB_LIMITS, emptyMemory, validateContributionBatch } from "@tdj/core";
import { describe, expect, it } from "vitest";
import {
  chunkItems,
  collectItems,
  contributionFile,
  countByGroup,
  type DeviceState,
  diffItems,
  hashesOf,
  NO_PERSONAL,
} from "./collect";

const AT = "2026-11-16T10:00:00.000Z";
const state = (p: Partial<DeviceState> = {}): DeviceState => ({
  overrides: {
    songs: { s1: { year: 1938, audio: null }, s2: { hidden: true } },
    addedSongs: [
      {
        id: "dj-1",
        title: "Me Voy a Baraja",
        rhythm: "tango",
        orchestra: "Edgardo Donato",
        orchestraId: "edgardo-donato",
        singer: "Horacio Lagos",
        singerId: "horacio-lagos",
        vocal: true,
        year: 1938,
        era: "golden-early",
      },
    ],
    cortinas: {
      "c-own": { id: "c-own", title: "Own", artist: "Me", genre: "jazz", culture: "global", energy: 40 },
    },
    guide: { houseRules: "no Pugliese before midnight" },
    connectors: { webhookUrl: "https://hooks.example/secret-path" },
    heatmap: { "carlos-di-sarli": { instrumental: { 1940: 4 } } } as never,
    scraped: { s1: { bpm: 118, fields: { bpm: "deezer" }, sources: { deezer: { fetchedAt: AT } } } },
  },
  memory: { ...emptyMemory(), favourites: { sides: {} } as never, learned: { w: 1 } as never },
  history: [],
  youtube: { s1: "dQw4w9WgXcQ" },
  artwork: { s1: "https://i.scdn.co/image/abc" },
  spotify: {},
  ...p,
});

describe("collectItems", () => {
  it("collects the catalogue facts and nothing personal by default", () => {
    const items = collectItems(state(), NO_PERSONAL, AT);
    expect(countByGroup(items)).toEqual({
      songs: 2,
      added: 1,
      cortinas: 1,
      filled: 1,
      matches: 1,
      artwork: 1,
    });
    const text = JSON.stringify(items);
    // never the guide, house rules, webhook URL, grades, learning or favourites
    for (const word of ["houseRules", "no Pugliese", "hooks.example", "instrumental", '"w":1', "sides"])
      expect(text, word).not.toContain(word);
    expect(validateContributionBatch({ v: 1, source: "web", items }).ok).toBe(true);
  });

  it("each personal category travels only when opted in", () => {
    const items = collectItems(state(), { ...NO_PERSONAL, grades: true, learning: true }, AT);
    const g = countByGroup(items);
    expect(g.grades).toBe(1);
    expect(g.learning).toBe(1);
    expect(g.favourites).toBeUndefined();
    expect(g.history).toBeUndefined();
    expect(validateContributionBatch({ v: 1, source: "web", items }).ok).toBe(true);
  });

  it("2026-11: the Booth's transition templates travel in the owner's export when opted in", () => {
    const transitions = {
      templates: [{ id: "tpl-1", name: "Soft fade", edit: { preset: "fade", fadeOutSec: 3, gapSec: 1 } }],
      defaults: { boundary: { inTanda: "tpl-1" }, rhythm: {} },
    };
    expect(countByGroup(collectItems(state({ transitions }), NO_PERSONAL, AT)).transitions).toBeUndefined();
    const items = collectItems(state({ transitions }), { ...NO_PERSONAL, transitions: true }, AT);
    const it = items.find((x) => x.kind === "transitions");
    expect(it?.value).toEqual(transitions);
    expect(validateContributionBatch({ v: 1, source: "web", items }).ok).toBe(true);
    // none saved: nothing to send
    const none = collectItems(
      state({ transitions: { templates: [], defaults: {} } }),
      { ...NO_PERSONAL, transitions: true },
      AT,
    );
    expect(none.some((x) => x.kind === "transitions")).toBe(false);
  });
});

describe("diffItems", () => {
  it("only what changed since the last acknowledged send; a removed edit is withdrawn", () => {
    const first = collectItems(state(), NO_PERSONAL, AT);
    const sent = hashesOf(first);
    expect(diffItems(first, sent, { at: AT })).toEqual([]);
    const s2 = state();
    s2.overrides.songs = { s1: { year: 1941 } };
    const next = diffItems(collectItems(s2, NO_PERSONAL, AT), sent, { at: AT });
    expect(next).toEqual([
      { kind: "song", id: "s1", value: { year: 1941 }, at: AT },
      { kind: "song", id: "s2", value: null, at: AT },
    ]);
  });

  it("the baseline (what the device held when it became the owner's) waits for Send my existing changes", () => {
    const items = collectItems(state(), NO_PERSONAL, AT);
    const baseline = hashesOf(items);
    expect(diffItems(items, {}, { baseline, at: AT })).toEqual([]);
    expect(diffItems(items, {}, { baseline, includeBaseline: true, at: AT })).toHaveLength(items.length);
  });

  it("an evicted cover or match is not a withdrawal", () => {
    const sent = hashesOf(collectItems(state(), NO_PERSONAL, AT));
    const s = state({ artwork: {}, youtube: {} });
    expect(diffItems(collectItems(s, NO_PERSONAL, AT), sent, { at: AT })).toEqual([]);
  });
});

describe("batches and the offline file", () => {
  it("chunks stay under the server's limits and every chunk validates", () => {
    const artwork = Object.fromEntries(
      Array.from({ length: 1500 }, (_, i) => [`s${i}`, `https://i.scdn.co/image/${"a".repeat(200)}${i}`]),
    );
    const items = collectItems(state({ artwork }), NO_PERSONAL, AT);
    const chunks = chunkItems(items);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(CONTRIB_LIMITS.items);
      expect(JSON.stringify({ v: 1, source: "web", items: c }).length).toBeLessThan(CONTRIB_LIMITS.bodyBytes);
      expect(validateContributionBatch({ v: 1, source: "web", items: c }).ok).toBe(true);
    }
    expect(chunks.flat()).toHaveLength(items.length);
    const file = contributionFile(items, AT, "web");
    expect(file.format).toBe("tdj-owner-contribution");
    expect(file.contributions.map((c) => c.items.length)).toEqual(chunks.map((c) => c.length));
  });
});
