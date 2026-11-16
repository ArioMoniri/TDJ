/**
 * QA fix (2026-11): a room carries the night exactly. Ana shared the featured night (plays 4:37:07); once Ben joined
 * both read 4:35:53, because the room resolves each side against the catalogue and the catalogue's own Spotify
 * recording (another take of the same side, another length) replaced the one the night was built with. The night
 * that comes back from a room is the night that went in: the same recordings, the same lengths, the same tempo.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { exportNight, importNight, type Playlist, type Song } from "../src/index";
import { findRoot, loadCatalog } from "../src/load";

let deps: ReturnType<typeof loadCatalog>;
let featured: Playlist;
beforeAll(() => {
  deps = loadCatalog();
  featured = JSON.parse(
    readFileSync(join(findRoot(), "apps/web/public/featured/golden-double-peak.json"), "utf8"),
  ) as Playlist;
}, 600000);

const sides = (p: Playlist): Song[] => [
  ...(p.opening ? [p.opening] : []),
  ...p.tandas.flatMap((t) => t.songs),
  ...(p.closing ? [p.closing] : []),
];
/** the length the app prints for a side: its checked Spotify recording, else the index length */
const len = (s: Song) => (s.spotify?.durationMs ? s.spotify.durationMs / 1000 : (s.durationSec ?? 0));
const nightSec = (p: Playlist) =>
  sides(p).reduce((a, s) => a + len(s), 0) +
  p.tandas.reduce((a, t) => a + (t.cortina ? (t.cortina.lengthSec ?? 0) : 0), 0);

describe("a room carries the night exactly (create → join → resolve)", () => {
  it("the joined night has the same recordings, lengths and JSON as the shared one", () => {
    const shared = exportNight(featured, { exact: true });
    // the room stores the file as JSON and the joiner resolves it against the server's catalogue
    const wire = JSON.parse(JSON.stringify(shared));
    const joined = importNight(wire, { catalog: deps.catalog, cortinas: deps.cortinas }).playlist;
    const back = exportNight(joined, { exact: true });
    // the night's sides, cortinas and Cumparsitas come back as they went in (the booth's inputs are normalised
    // to the current defaults by attachBooth, so they are compared once normalised)
    expect(back.tandas).toEqual(shared.tandas);
    expect(back.opening).toEqual(shared.opening);
    expect(back.closing).toEqual(shared.closing);
    expect({ ...back, booth: undefined }).toEqual({ ...shared, booth: undefined });
    expect(exportNight(importNight(back, deps).playlist, { exact: true })).toEqual(back);
    const a = sides(featured);
    const b = sides(joined);
    expect(b.map((s) => s.id)).toEqual(a.map((s) => s.id));
    expect(b.map((s) => s.spotify?.uri ?? null)).toEqual(a.map((s) => s.spotify?.uri ?? null));
    expect(b.map(len)).toEqual(a.map(len));
    expect(Math.round(nightSec(joined))).toBe(Math.round(nightSec(featured)));
    // and a second round trip (the creator adopts the room's view) changes nothing
    const again = importNight(JSON.parse(JSON.stringify(exportNight(joined, { exact: true }))), {
      catalog: deps.catalog,
      cortinas: deps.cortinas,
    }).playlist;
    expect(sides(again).map(len)).toEqual(a.map(len));
  });

  it("a side's tempo travels with the night (one BPM on both DJs' screens)", () => {
    const shared = exportNight(featured, { exact: true });
    const joined = importNight(JSON.parse(JSON.stringify(shared)), {
      catalog: deps.catalog,
      cortinas: deps.cortinas,
    }).playlist;
    // the night that went in decides: a side without a tempo stays without one, a side with one keeps it
    for (const [x, y] of sides(featured).map((s, i) => [s, sides(joined)[i]!] as const))
      expect(y.tempo?.bpm ?? null).toBe(x.tempo?.bpm ?? null);
  });
  it("the exact night stays well inside a room's request size", () => {
    expect(JSON.stringify(exportNight(featured, { exact: true })).length).toBeLessThan(400_000);
  });
});
