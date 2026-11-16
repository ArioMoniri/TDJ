/**
 * Owner contributions (packages/core/src/owner.ts) on the repo side.
 *
 *   pnpm data:apply-contributions <file> [<file> …] [--summary out.json]
 *       Merge contribution files into data/sources/owner-overrides.json, then project data/index/owner.json.
 *       A file is what Settings → Owner → "Export my changes as a contribution file" saves
 *       (`{ format: "tdj-owner-contribution", contributions: [...] }`), a bare batch (`{ v: 1, items }`) or the list the
 *       "Merge owner contributions" workflow reads from DynamoDB (`[{ id, at, items }]`). Every item is validated
 *       again; a contribution already merged is skipped, so running twice changes nothing.
 *   owner_contributions.ts project [--strict]
 *       data/sources/owner-overrides.json → data/index/owner.json (the last step of `pnpm index:build`). Reports
 *       entries that name a side the index does not hold; --strict fails on them.
 *
 * Relative paths are read from the directory the command was started in (pnpm's INIT_CWD).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import {
  applyContributions,
  normalizeOwnerFile,
  type OwnerOverridesFile,
  projectOwnerLayer,
  type StoredContribution,
} from "../packages/core/src/owner";

const ROOT = new URL("..", import.meta.url).pathname;
export const SOURCES = "data/sources/owner-overrides.json";
export const LAYER = "data/index/owner.json";
const CALLER = process.env.INIT_CWD || process.cwd();
const at = (p: string) => (isAbsolute(p) ? p : join(CALLER, p));

const readJson = (p: string): unknown => JSON.parse(readFileSync(p, "utf8"));
function readSources(): OwnerOverridesFile {
  return normalizeOwnerFile(existsSync(ROOT + SOURCES) ? readJson(ROOT + SOURCES) : null);
}
const write = (rel: string, v: unknown) => writeFileSync(ROOT + rel, `${JSON.stringify(v, null, 1)}\n`);

/** any of the three file shapes → stored contributions */
export function contributionsOf(x: unknown, name: string): StoredContribution[] {
  if (Array.isArray(x)) return x as StoredContribution[];
  if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    if (o.format === "tdj-owner-contribution" && Array.isArray(o.contributions))
      return o.contributions as StoredContribution[];
    if (o.v === 1 && Array.isArray(o.items)) {
      const items = o.items as Array<{ at?: string }>;
      const when =
        items
          .map((i) => String(i?.at ?? ""))
          .sort()
          .pop() || new Date().toISOString();
      const id = `file-${createHash("sha256").update(JSON.stringify(o.items)).digest("hex").slice(0, 16)}`;
      return [{ id, at: when, source: "file", items: o.items as StoredContribution["items"] }];
    }
  }
  throw new Error(`${name}: not a contribution file`);
}

function project(strict: boolean): { unknown: string[] } {
  const file = readSources();
  const layer = projectOwnerLayer(file);
  write(LAYER, layer);
  const songs = readJson(`${ROOT}data/index/songs.json`) as Array<{ id: string; altIds?: string[] }>;
  const added = (
    existsSync(`${ROOT}data/knowledge/added_songs.json`)
      ? ((readJson(`${ROOT}data/knowledge/added_songs.json`) as { songs?: Array<{ id: string }> }).songs ??
        [])
      : []
  ).map((s) => s.id);
  const known = new Set([
    ...songs.flatMap((s) => [s.id, ...(s.altIds ?? [])]),
    ...added,
    ...layer.addedSongs.map((s) => s.id),
  ]);
  const unknown = [
    ...Object.keys(layer.songs),
    ...Object.keys(layer.youtube),
    ...Object.keys(layer.deezer),
  ].filter((id) => !known.has(id));
  const counts = Object.fromEntries(
    Object.entries(file.entries).map(([k, m]) => [k, Object.keys(m ?? {}).length]),
  );
  console.log(
    JSON.stringify(
      { projected: LAYER, entries: counts, personal: Object.keys(file.personal), unknown },
      null,
      1,
    ),
  );
  if (unknown.length) console.warn(`owner layer names ${unknown.length} side(s) the index does not hold`);
  if (strict && unknown.length) process.exit(1);
  return { unknown };
}

function apply(files: string[], summaryPath?: string) {
  if (!files.length) {
    console.error("usage: pnpm data:apply-contributions <file> [<file> …] [--summary out.json]");
    process.exit(2);
  }
  const all: StoredContribution[] = [];
  for (const f of files) all.push(...contributionsOf(readJson(at(f)), f));
  const r = applyContributions(readSources(), all);
  if (r.applied.length) write(SOURCES, r.file);
  const { unknown } = project(false);
  const summary = { applied: r.applied, skipped: r.skipped, unknown };
  if (summaryPath) writeFileSync(at(summaryPath), `${JSON.stringify(summary, null, 1)}\n`);
  console.log(JSON.stringify({ applied: r.applied.length, skipped: r.skipped }, null, 1));
}

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const i = rest.indexOf(name);
  if (i < 0) return undefined;
  const v = rest[i + 1];
  rest.splice(i, 2);
  return v;
};
if (cmd === "project") project(rest.includes("--strict"));
else if (cmd === "apply") {
  const summary = flag("--summary");
  apply(
    rest.filter((a) => !a.startsWith("--")),
    summary,
  );
} else {
  console.error("usage: owner_contributions.ts project [--strict] | apply <file…> [--summary out.json]");
  process.exit(2);
}
