import { applyFeedback, type ComposeDeps, type ComposeExtras, compose, type Feedback } from "./compose";
import type { ComposeOptions, Playlist, Tanda } from "./types";

/**
 * What "Tell the DJ" asks for, already parsed (by keywords or a model). The semantics are the round-8 ones:
 * "more X" prefers X (weight ×3) and never replaces the pool; "no X" excludes X but a locked tanda that contradicts
 * it is called out; "only X" restricts the pool and is subject to the length guard like everything else.
 */
export interface Refinement {
  feedback?: Feedback[];
  /** "more X" → preferOrchestras */
  more?: string[];
  /** "no X" → excludeOrchestras */
  no?: string[];
  /** "only X" → includeOrchestras (guarded) */
  only?: string[];
  /** explicit option changes (hours, pattern, rules …) */
  patch?: Partial<ComposeOptions>;
}
export interface RefineResult {
  options: Partial<ComposeOptions>;
  /** what was applied, in the DJ's words ("more Juan D'Arienzo", "no Francisco Canaro", "more vals") */
  applied: string[];
  /** what was not, with the reason */
  notApplied: string[];
}
export interface GuardedRefine extends RefineResult {
  /** the night composed with the returned options (same seed, so the client reproduces it) */
  playlist: Playlist;
}

const uniq = (xs: Iterable<string>) => [...new Set(xs)];
const without = (xs: string[] | undefined, drop: string[]) => {
  const out = (xs ?? []).filter((x) => !drop.includes(x));
  return out.length ? out : undefined;
};

/** Map a refinement onto compose options (pure; no composition). `locked` are the tandas the DJ pinned. */
export function refineOptions(
  base: Partial<ComposeOptions>,
  r: Refinement,
  locked: Tanda[] = [],
  nameOf: (id: string) => string = (id) => id,
): RefineResult {
  const applied: string[] = [];
  const notApplied: string[] = [];
  const out: Partial<ComposeOptions> = { ...applyFeedback(base, r.feedback ?? []), ...(r.patch ?? {}) };
  if (r.patch?.context)
    out.context = { ...(applyFeedback(base, r.feedback ?? []).context ?? {}), ...r.patch.context };
  if (r.patch?.rules) out.rules = { ...(base.rules ?? {}), ...r.patch.rules };
  for (const f of r.feedback ?? []) applied.push(f.replace(/-/g, " "));
  for (const k of Object.keys(r.patch ?? {})) if (k !== "context" && k !== "rules") applied.push(k);
  for (const k of Object.keys(r.patch?.rules ?? {})) applied.push(`rules.${k}`);
  const more = uniq(r.more ?? []);
  const no = uniq(r.no ?? []).filter((id) => !more.includes(id));
  const only = uniq(r.only ?? []).filter((id) => !no.includes(id));
  if (more.length) {
    out.preferOrchestras = uniq([...(base.preferOrchestras ?? []), ...more]);
    out.excludeOrchestras = without(base.excludeOrchestras, more);
    for (const id of more) applied.push(`more ${nameOf(id)}`);
  }
  if (no.length) {
    out.excludeOrchestras = uniq([...(out.excludeOrchestras ?? base.excludeOrchestras ?? []), ...no]);
    out.preferOrchestras = without(out.preferOrchestras ?? base.preferOrchestras, no);
    out.includeOrchestras = without(base.includeOrchestras, no);
    for (const id of no) {
      const held = locked.filter((t) => t.locked && t.orchestraId === id);
      if (held.length)
        notApplied.push(
          `no ${nameOf(id)}: tanda ${held.map((t) => t.index + 1).join(", ")} is ${nameOf(id)} and locked; unlock it or keep it`,
        );
      else applied.push(`no ${nameOf(id)}`);
    }
  }
  if (only.length) {
    out.includeOrchestras = only;
    for (const id of only) applied.push(`only ${nameOf(id)}`);
  }
  return { options: out, applied: uniq(applied), notApplied };
}

/**
 * Apply a refinement and compose the result; a night shorter than 90 % of the request is never returned as
 * "Applied". The guard relaxes in order (an "only" pool becomes a preference, then the new exclusions are dropped)
 * and, when nothing fills the hours, keeps the previous options and says why.
 */
export function refineWithGuard(
  base: Partial<ComposeOptions>,
  r: Refinement,
  deps: ComposeDeps,
  extras: ComposeExtras = {},
  nameOf: (id: string) => string = (id) => id,
): GuardedRefine {
  const seed = base.seed ?? Math.floor(Math.random() * 1e9);
  const locked = extras.locked ?? [];
  const hours = r.patch?.hours ?? base.hours ?? 4;
  const longEnough = (p: Playlist) => p.stats.durationSec >= 0.9 * hours * 3600;
  const attempt = (ref: Refinement, dropped: string[]) => {
    const res = refineOptions(base, ref, locked, nameOf);
    const options = { ...res.options, seed };
    const playlist = compose(options, deps, extras);
    return { ...res, options, playlist, notApplied: [...res.notApplied, ...dropped] };
  };
  const steps: Array<[Refinement, string[]]> = [[r, []]];
  if (r.only?.length)
    steps.push([
      { ...r, only: undefined, more: uniq([...(r.more ?? []), ...r.only]) },
      [
        `only ${r.only.map(nameOf).join(", ")}: could not fill ${hours} h with that pool, kept as a preference instead`,
      ],
    ]);
  if (r.no?.length)
    steps.push([
      { ...r, only: undefined, no: undefined, more: uniq([...(r.more ?? []), ...(r.only ?? [])]) },
      [`no ${r.no.map(nameOf).join(", ")}: could not fill ${hours} h without them`],
    ]);
  for (const [ref, dropped] of steps) {
    const a = attempt(ref, dropped);
    if (longEnough(a.playlist)) return a;
  }
  const asked = [
    ...(r.only ?? []).map((id) => `only ${nameOf(id)}`),
    ...(r.no ?? []).map((id) => `no ${nameOf(id)}`),
    ...(r.more ?? []).map((id) => `more ${nameOf(id)}`),
    ...(r.feedback ?? []).map((f) => f.replace(/-/g, " ")),
  ];
  const options = { ...base, seed };
  return {
    options,
    playlist: compose(options, deps, extras),
    applied: [],
    notApplied: [
      `Could not fill ${hours} h with: ${asked.join(", ") || "these constraints"}; the set was left as it was`,
    ],
  };
}
