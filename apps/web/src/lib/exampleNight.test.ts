import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { asExampleNight, EXAMPLE_PIN, isExamplePin, needsExample, speaksOfOwner } from "./exampleNight";
import type { Playlist } from "./types";

/**
 * 2026-11 (the owner: "have the night we created as the example night in the app, but it should not have texts like
 * 'your tanda kept as it is'"): the shipped featured night is the owner's; shown to everyone it reads as a neutral
 * example, and its one-night exceptions stay confined to it (pinned, never rules), with the music unchanged.
 */
const shipped = JSON.parse(
  readFileSync(join(__dirname, "../../public/featured/golden-double-peak.json"), "utf8"),
) as Playlist;
const ex = asExampleNight(shipped);

/** every string a card, a tooltip or a sheet could show from the night itself */
function words(p: Playlist): string[] {
  const out: string[] = [];
  for (const t of p.tandas) {
    out.push(t.note ?? "", t.reason ?? "", t.pinned?.reason ?? "");
    for (const s of t.songs) out.push(s.notes ?? "");
  }
  out.push(p.closing?.notes ?? "", p.opening?.notes ?? "", p.closingPinned?.reason ?? "");
  return out.filter(Boolean);
}

describe("the example night (the owner's night, as everyone sees it)", () => {
  it("the shipped file is the owner's night: it does speak of its maker (so this guard means something)", () => {
    expect(words(shipped).some(speaksOfOwner)).toBe(true);
    expect(needsExample(shipped)).toBe(true);
  });

  it("no tanda note, reason, pin reason or side note speaks of the owner", () => {
    const left = words(ex).filter(speaksOfOwner);
    expect(left).toEqual([]);
    expect(needsExample(ex)).toBe(false);
    for (const w of words(ex)) expect(w).not.toMatch(/your tanda|kept as (it )?is|your choice|the DJ's/i);
  });

  it("the music is the same: sides, order, cortinas, the Cumparsitas, the booth plan", () => {
    expect(ex.tandas.map((t) => t.songs.map((s) => s.id))).toEqual(
      shipped.tandas.map((t) => t.songs.map((s) => s.id)),
    );
    expect(ex.tandas.map((t) => t.cortina?.id ?? null)).toEqual(
      shipped.tandas.map((t) => t.cortina?.id ?? null),
    );
    expect(ex.opening?.id).toBe(shipped.opening?.id);
    expect(ex.closing?.id).toBe(shipped.closing?.id);
    expect(ex.booth).toBe(shipped.booth);
    expect(ex.id).toBe(shipped.id);
  });

  it("the one-night exceptions stay with this night: every pinned (locked) tanda stays pinned, marked as the example's", () => {
    const pinned = (p: Playlist) =>
      p.tandas.map((t) => [!!t.pinned, !!t.locked, t.pinned?.exception ?? null]);
    expect(pinned(ex)).toEqual(pinned(shipped));
    for (const t of ex.tandas) if (t.pinned) expect(isExamplePin(t)).toBe(true);
    expect(ex.closingPinned?.reason).toBe(EXAMPLE_PIN);
    // nothing new is pinned and the owner's night itself is untouched (a copy, not an edit)
    expect(words(shipped).some(speaksOfOwner)).toBe(true);
  });

  it("is idempotent", () => {
    expect(asExampleNight(ex)).toEqual(ex);
  });

  it("a DJ's own pinned tanda in another night keeps its own words", () => {
    const own = {
      ...shipped,
      id: "mine",
      tandas: [{ ...shipped.tandas[1]!, pinned: { by: "dj" as const, reason: "my favourite" } }],
    };
    expect(isExamplePin(own.tandas[0]!)).toBe(false);
  });
});
