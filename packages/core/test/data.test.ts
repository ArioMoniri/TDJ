/**
 * The apps compose on the device: the same index, read as parsed JSON instead of from the file system
 * (src/data.ts). Invariant: `buildLoaded(files)` over the committed data is the catalogue `loadCatalog()` builds,
 * so a night composed in the app is the night the server composes for the same options and seed.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildLoaded, DATA_FILES, type DataFiles, indexSongs } from "../src/data";
import { compose } from "../src/index";
import { findRoot, loadCatalog, readIndexSongs } from "../src/load";

const root = findRoot();
function readAll(): DataFiles {
  const out: DataFiles = {};
  for (const [k, rel] of Object.entries(DATA_FILES)) {
    const p = join(root, rel);
    if (existsSync(p)) (out as Record<string, unknown>)[k] = JSON.parse(readFileSync(p, "utf8"));
  }
  return out;
}

let files: DataFiles;
beforeAll(() => {
  files = readAll();
});

describe("data files for the apps", () => {
  it("every listed file exists in the repository (the app bundle copies them)", () => {
    for (const rel of Object.values(DATA_FILES)) expect(existsSync(join(root, rel)), rel).toBe(true);
  });

  it("indexSongs over parsed files equals readIndexSongs from disk", () => {
    const a = indexSongs(files.songs as never, files.songPatches as never, files.addedSongs as never);
    expect(a).toEqual(readIndexSongs(root));
  });

  it("buildLoaded equals loadCatalog: songs, cortinas, meta, model, heatmap", () => {
    const a = buildLoaded(files);
    const b = loadCatalog(root);
    expect(a.catalog.songs.length).toBe(b.catalog.songs.length);
    expect(a.catalog.songs).toEqual(b.catalog.songs);
    expect(a.cortinas).toEqual(b.cortinas);
    expect(a.meta).toEqual(b.meta);
    expect(a.contextModel).toEqual(b.contextModel);
    expect(a.trackEnergy).toEqual(b.trackEnergy);
    expect(a.raw.deezer).toEqual(b.raw.deezer);
    expect(a.catalog.profiles.size).toBe(b.catalog.profiles.size);
  });

  it("the same seed composes the same night from either loader", () => {
    const a = buildLoaded(files);
    const b = loadCatalog(root);
    const opts = { hours: 1.5, seed: 4242 };
    const pa = compose(opts, a);
    const pb = compose(opts, b);
    const strip = (p: typeof pa) => ({ ...p, createdAt: "" });
    expect(strip(pa)).toEqual(strip(pb));
  });

  it("missing optional files fall back to empty values (meta alone is required)", () => {
    const l = buildLoaded({ songs: [], meta: { songs: 0 } });
    expect(l.catalog.songs).toEqual([]);
    expect(l.cortinas.length).toBe(0);
    expect(l.contextModel).toBeUndefined();
    expect(() => buildLoaded({ songs: [] })).toThrow(/meta/);
  });
});
