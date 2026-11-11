/**
 * Round 13 — the standard quality pipeline (`pnpm quality`, docs/specs/round13-engine.md §7); round 14 adds the strict
 * panel (docs/specs/round14-engine.md).
 *
 * Composes the default 4 h golden set S1–S12 and the featured night (the shipped JSON, re-scored under today's
 * rules, and its options composed again), runs scorePlaylist + benchmarkNight + improveNight + strictChecks on each,
 * writes docs/quality/latest.md and exits non-zero when a golden night scores under 85, a scored benchmark check is
 * "off" on the golden set after improveNight, improveNight lowers a score or a benchmark total anywhere, or a
 * composed night (the golden set or the featured options) keeps a strict-panel blocker after improveNight.
 *
 * Node only (reads the committed index): `pnpm --filter @tdj/core exec tsx src/quality.ts [--out <file>]`.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type BenchResult, benchmarkNight, improveNight } from "./benchmark";
import { compose } from "./compose";
import { findRoot, loadCatalog } from "./load";
import { matchProblem } from "./matchRules";
import { scorePlaylist } from "./score";
import { auditSpotifyCache, auditStreams } from "./streams";
import { nightShapeLine, STRICT_RULES, type StrictResult, strictChecks, strictSummary } from "./strict";
import type { ComposeOptions, Playlist } from "./types";

const ROUND13 = ["yearSpread", "goldenCore", "transitions", "heatmapBest"] as const;
/**
 * Round 14: the checks the strict panel trades against (its own check, the DJ's instrumental rule, the transitions
 * check) are judged by the panel's ratchet in round14.test.ts and reported here, not gated. KNOWN lists the regressions
 * docs/specs/round14-engine.md §6 names; they are printed as known, never hidden.
 */
const PANEL_JUDGED = new Set(["strictPanel", "instrumental", "transitions"]);
// (round 15: S11's cycle regression is fixed — the classic cycle is a strict blocker now)
const KNOWN: Record<string, string[]> = {};
const MIN_SCORE = 85;

export interface QualityRow {
  name: string;
  /** the golden set gates the exit code; the featured rows are reported */
  gated: boolean;
  score: number;
  improvedScore: number;
  bench: BenchResult;
  improved: BenchResult;
  changes: number;
  failures: string[];
  /** round 14: the strict panel after improveNight */
  strict: StrictResult;
  /** round 14: known regressions, reported (docs/specs/round14-engine.md §6) */
  known?: string[];
  /** round 15: who opened, who closed, and the settings that asked for it */
  shape?: string;
}
/** round 15: the stream and export-match audits of the committed caches (gates the run) */
export interface CacheAudit {
  spotifyChecked: number;
  spotifyRejected: Array<{ row: string; uri: string; why: string }>;
  sharedStreams: number;
  datedMismatch: number;
}

function row(
  name: string,
  p: Playlist,
  deps: ReturnType<typeof loadCatalog>,
  gated: boolean,
  /** round 14: a composed night (never the shipped JSON) fails the run on a strict-panel blocker */
  strictGated = gated,
): QualityRow {
  const bench = benchmarkNight(p);
  const r = improveNight(p, deps);
  const improved = benchmarkNight(r.playlist);
  const failures: string[] = [];
  if (gated && p.score.total < MIN_SCORE) failures.push(`engine score ${p.score.total} < ${MIN_SCORE}`);
  if (gated && r.playlist.score.total < MIN_SCORE)
    failures.push(`improved engine score ${r.playlist.score.total} < ${MIN_SCORE}`);
  if (r.after.score < r.before.score)
    failures.push(`improveNight lowered the engine score ${r.before.score} → ${r.after.score}`);
  if (r.after.bench < r.before.bench)
    failures.push(`improveNight lowered the benchmark ${r.before.bench} → ${r.after.bench}`);
  const strict = strictChecks(r.playlist);
  const known: string[] = [];
  if (gated)
    for (const c of improved.checks)
      if (c.status === "off" && !c.info && !PANEL_JUDGED.has(c.key)) {
        const line = `benchmark "${c.key}" off after improveNight: ${c.value}`;
        if (KNOWN[name]?.includes(c.key)) known.push(line);
        else failures.push(line);
      }
  if (strictGated && strict.blockers)
    failures.push(
      `strict panel: ${strict.violations
        .filter((v) => v.severity === "blocker")
        .map((v) => `${v.rule} (${v.detail})`)
        .join("; ")}`,
    );
  return {
    name,
    gated,
    score: p.score.total,
    improvedScore: r.playlist.score.total,
    bench,
    improved,
    changes: r.changes.length,
    failures,
    strict,
    shape: nightShapeLine(r.playlist),
    known,
  };
}

const cell = (b: BenchResult, key: string) => {
  const c = b.checks.find((x) => x.key === key);
  return c ? `${c.status === "ok" ? "ok" : c.status === "near" ? "near" : "**off**"} (${c.value})` : "–";
};

export function renderQuality(rows: QualityRow[], audit?: CacheAudit): string {
  const lines: string[] = [];
  lines.push("# Quality — the standard pipeline (rounds 13–15)");
  lines.push("");
  lines.push(
    "Generated by `pnpm quality` (packages/core/src/quality.ts): the default 4 h golden set S1–S12 and the featured night, each through `scorePlaylist`, `benchmarkNight`, `improveNight` and the strict panel of rounds 14–15 (`strictChecks`). The run fails when a golden night scores under 85, a scored benchmark check is off on the golden set after improveNight, improveNight lowers a number, or a composed night keeps a strict-panel blocker. Specs: docs/specs/round12-benchmark.md, docs/specs/round13-engine.md, docs/specs/round14-engine.md, docs/specs/round15-engine.md.",
  );
  lines.push("");
  const failed = rows.flatMap((r) => r.failures.map((f) => `${r.name}: ${f}`));
  lines.push(failed.length ? `**Result: FAIL** (${failed.length})` : "**Result: pass**");
  if (failed.length) for (const f of failed) lines.push(`- ${f}`);
  const known = rows.flatMap((r) => (r.known ?? []).map((f) => `${r.name}: ${f}`));
  if (known.length) {
    lines.push("");
    lines.push("Known regressions (docs/specs/round14-engine.md §6), reported, not gated:");
    for (const f of known) lines.push(`- ${f}`);
  }
  lines.push("");
  if (audit) {
    lines.push("## Stream and export-match audit (round 15)");
    lines.push("");
    lines.push(
      `Spotify cache: ${audit.spotifyChecked} cached ids checked, ${audit.spotifyRejected.length} rejected (match rules: title, orchestra and singer credit, a dated title, the Deezer length, a later album; one id, one recording). Deezer/Spotify ids shared by different recordings (R4a): ${audit.sharedStreams}; dated stream titles off their row (R4b): ${audit.datedMismatch}. Any of them fails the run.`,
    );
    for (const r of audit.spotifyRejected.slice(0, 20)) lines.push(`- ${r.row} ${r.uri}: ${r.why}`);
    lines.push("");
  }
  lines.push("## Night shape");
  lines.push("");
  for (const r of rows) lines.push(`- ${r.name}: ${r.shape ?? "–"}`);
  lines.push("");
  lines.push("## Engine and benchmark");
  lines.push("");
  lines.push("| Night | Engine (composed → improved) | Benchmark total | In range | Changes | Gated |");
  lines.push("|---|---|---|---|---|---|");
  for (const r of rows)
    lines.push(
      `| ${r.name} | ${r.score} → ${r.improvedScore} | ${r.bench.total} → ${r.improved.total} | ${r.bench.inRange}/${r.bench.scored} → ${r.improved.inRange}/${r.improved.scored} | ${r.changes} | ${r.gated ? "yes" : "report"} |`,
    );
  lines.push("");
  lines.push("## Strict panel (rounds 14–15, after improveNight)");
  lines.push("");
  lines.push(
    "Every rule of the strict panel (docs/reviews/round14-dancer.md, round14-dj.md, round14-discography.md; round 15: round15-dancer.md, round15-dj.md, round15-discography.md) on every night: **pass**, the number of violations, or n/a when the rule does not apply (no year range, not a golden night, no cortinas). The shipped featured JSON is reported, never gated.",
  );
  lines.push("");
  lines.push(`| Rule | Severity | Source | ${rows.map((r) => r.name.replace(/\|/g, "/")).join(" | ")} |`);
  lines.push(`|---|---|---|${rows.map(() => "---").join("|")}|`);
  for (const def of STRICT_RULES)
    lines.push(
      `| ${def.key}: ${def.label} | ${def.severity} | ${def.source} | ${rows
        .map((r) => {
          const x = r.strict.rules.find((y) => y.key === def.key);
          return !x?.applies ? "n/a" : x.pass ? "pass" : `**${x.violations.length}**`;
        })
        .join(" | ")} |`,
    );
  lines.push("");
  lines.push("| Night | Strict panel | Violations |");
  lines.push("|---|---|---|");
  for (const r of rows)
    lines.push(
      `| ${r.name} | ${strictSummary(r.strict)} | ${
        r.strict.violations
          .slice(0, 8)
          .map((v) => `${v.rule}: ${v.detail}`)
          .join("; ")
          .replace(/\|/g, "/") || "none"
      } |`,
    );
  lines.push("");
  lines.push("## The round-13 checks (after improveNight)");
  lines.push("");
  lines.push("| Night | Tanda year spread | Golden core share | Transitions | Heatmap best years |");
  lines.push("|---|---|---|---|---|");
  for (const r of rows) lines.push(`| ${r.name} | ${ROUND13.map((k) => cell(r.improved, k)).join(" | ")} |`);
  lines.push("");
  lines.push("## Every other check (after improveNight)");
  lines.push("");
  const keys =
    rows[0]?.improved.checks.map((c) => c.key).filter((k) => !(ROUND13 as readonly string[]).includes(k)) ??
    [];
  lines.push(`| Night | ${keys.join(" | ")} |`);
  lines.push(`|---|${keys.map(() => "---").join("|")}|`);
  for (const r of rows)
    lines.push(
      `| ${r.name} | ${keys
        .map((k) => {
          const c = r.improved.checks.find((x) => x.key === k);
          return !c ? "–" : c.info ? "info" : c.status === "off" ? "**off**" : c.status;
        })
        .join(" | ")} |`,
    );
  lines.push("");
  return lines.join("\n");
}

export function cacheAudit(deps: ReturnType<typeof loadCatalog>): CacheAudit {
  const sp = auditSpotifyCache(deps.raw.songs, deps.raw.cache, deps.raw.resolved, matchProblem);
  const st = auditStreams(deps.raw.songs, deps.raw.resolved, deps.raw.cache);
  return {
    spotifyChecked: sp.checked,
    spotifyRejected: sp.rejected,
    sharedStreams: st.shared.length,
    datedMismatch: st.dateMismatch.length,
  };
}
export function runQuality(root = findRoot()): { rows: QualityRow[]; markdown: string; audit: CacheAudit } {
  const deps = loadCatalog(root);
  const audit = cacheAudit(deps);
  const rows: QualityRow[] = [];
  for (let seed = 1; seed <= 12; seed++)
    rows.push(row(`S${seed}`, compose({ hours: 4, seed }, deps), deps, true));
  const featured = JSON.parse(
    readFileSync(join(root, "apps/web/public/featured/golden-double-peak.json"), "utf8"),
  ) as Playlist;
  featured.score = scorePlaylist(featured);
  rows.push(row("Featured (shipped JSON, re-scored)", featured, deps, false, false));
  const fo = { ...featured.options } as Partial<ComposeOptions>;
  for (const k of ["contextApplied", "trackSecByRhythm", "cortinaGenres", "vocalBias", "tempoShift"] as const)
    delete fo[k];
  const explicit = Object.keys(fo).filter((k) => k !== "context");
  rows.push(
    row(
      `Featured options, seed ${fo.seed ?? "?"} (composed)`,
      compose({ ...fo, explicit }, deps),
      deps,
      false,
      true,
    ),
  );
  // round 15: the three nights the round-15 panel reviewed (featured options), composed again and gated on blockers
  for (const seed of [255, 97, 156])
    rows.push(
      row(
        `Featured options, seed ${seed} (round-15 panel)`,
        compose({ ...fo, seed, explicit }, deps),
        deps,
        false,
        true,
      ),
    );
  return { rows, markdown: renderQuality(rows, audit), audit };
}

const isMain = (process.argv[1] ?? "").replace(/\\/g, "/").endsWith("src/quality.ts");
if (isMain) {
  const root = findRoot();
  const outArg = process.argv.indexOf("--out");
  const out = outArg > 0 ? process.argv[outArg + 1]! : join(root, "docs/quality/latest.md");
  const { rows, markdown, audit } = runQuality(root);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, markdown);
  for (const r of rows)
    console.log(
      `${r.name.padEnd(40)} engine ${r.score} → ${r.improvedScore}  benchmark ${r.bench.total} → ${r.improved.total} (${r.improved.inRange}/${r.improved.scored})  strict ${strictSummary(r.strict)}${r.failures.length ? `  FAIL: ${r.failures.join("; ")}` : ""}`,
    );
  console.log(
    `stream audit: Spotify ${audit.spotifyChecked} checked, ${audit.spotifyRejected.length} rejected · shared ids ${audit.sharedStreams} · dated titles off ${audit.datedMismatch}`,
  );
  const failed =
    rows.some((r) => r.failures.length) ||
    audit.spotifyRejected.length > 0 ||
    audit.sharedStreams > 0 ||
    audit.datedMismatch > 0;
  console.log(`${failed ? "FAIL" : "pass"} — wrote ${out}`);
  process.exit(failed ? 1 : 0);
}
