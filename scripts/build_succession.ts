/**
 * 2026-11 — the succession model's data (packages/core/src/succession.ts): what real DJs play after what, mined from
 * the public DJ sets already in the repository, plus the hand-curated parts, into the committed
 * data/knowledge/succession.json.
 *
 *   referenceSets  data/knowledge/reference_sets.json `sets` (31 public sets, several DJs and regions): weight 1
 *   setlists       data/cache/popularity/setlists.json (Chris Jordan's set blog, cached by `pnpm popularity:build`),
 *                  the sets not already in the corpus (same date): weight 0.5 — one DJ's habits must not outvote the
 *                  panel of DJs
 *
 * Counted per adjacent pair of dance tandas in a set (the closing Cumparsita and unknown orchestras left out):
 * orchestra → orchestra, family (orchestra + first singer, "" = instrumental) → family (kept when seen twice), and the
 * style class pair of two tango tandas (transitions.ts styleClass). Each count is [raw, weighted]. The engine smooths
 * them (succession.ts corpusPart); nothing here judges. Deterministic: the same inputs write the same file.
 *
 *   pnpm knowledge:succession
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { normTitle } from "../packages/core/src/energy";
import { findRoot } from "../packages/core/src/load";
import { styleClass } from "../packages/core/src/transitions";

const ROOT = findRoot();
const readJson = <T>(p: string, fallback: T): T =>
  existsSync(join(ROOT, p)) ? (JSON.parse(readFileSync(join(ROOT, p), "utf8")) as T) : fallback;

interface RefTanda {
  position: number;
  rhythm: string;
  orchestraId: string;
  singer: string | null;
  titles: string[];
}
interface RefSet {
  id: string;
  dj?: string;
  year?: number;
  source?: string;
  tandas: RefTanda[];
}
interface SetList {
  url: string;
  date: string;
  tandas: Array<{ rhythm: string; tracks: Array<{ artist: string; title: string; year: number | null }> }>;
}

const REF = readJson<{ sets: RefSet[] }>("data/knowledge/reference_sets.json", { sets: [] });
const SL = readJson<{ sets: Record<string, SetList | { error: string }> }>(
  "data/cache/popularity/setlists.json",
  { sets: {} },
);
const CURATED = readJson<Record<string, unknown>>("data/knowledge/succession_curated.json", {});
const ORCHS = readJson<Array<{ id: string; name: string; count: number }>>("data/index/orchestras.json", []);
const PROFILES = new Set(
  readJson<Array<{ id: string }>>("data/knowledge/orchestra_profiles.json", []).map((p) => p.id),
);
const KNOWN = new Set([...ORCHS.map((o) => o.id), ...PROFILES]);

/** orchestra names as the set lists spell them → id (the popularity build's reading, the larger orchestra first) */
const ORCH = (() => {
  const m = new Map<string, string>();
  const last = new Map<string, string[]>();
  // the larger orchestra keeps a shared spelling ("Carlos Di Sarli" is the orchestra, not the 1928 sextet)
  for (const o of [...ORCHS].sort((a, b) => b.count - a.count)) {
    if (!m.has(normTitle(o.name))) m.set(normTitle(o.name), o.id);
    if (o.count >= 30) {
      const l = normTitle(o.name).split(/\s+/).pop()!;
      last.set(l, [...(last.get(l) ?? []), o.id]);
    }
  }
  for (const [l, ids] of last) if (ids.length === 1 && !m.has(l)) m.set(l, ids[0]!);
  return m;
})();
const orchestraIdOf = (name: string): string | undefined => {
  const n = normTitle(name);
  return ORCH.get(n) ?? ORCH.get(n.split(/\s+/).pop() ?? "");
};

/** one tanda of a set as the model reads it */
interface Step {
  orchestraId: string;
  singer: string;
  rhythm: string;
}
const singerKey = (s: string | null | undefined) =>
  normTitle((s ?? "").split(/\s*(?:-|·|&|\/| y )\s*/)[0] ?? "");
const isCumparsita = (titles: string[]) => titles.some((t) => normTitle(t) === "la cumparsita");
const DANCE = new Set(["tango", "vals", "milonga"]);

const sets: Array<{ id: string; weight: number; steps: Step[] }> = [];
const corpusDates = new Set<string>();
for (const s of REF.sets) {
  const date = s.id.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (date) corpusDates.add(date);
  const steps = [...s.tandas]
    .sort((a, b) => a.position - b.position)
    .filter((t) => DANCE.has(t.rhythm) && !isCumparsita(t.titles ?? []))
    .map((t) => ({ orchestraId: t.orchestraId, singer: singerKey(t.singer), rhythm: t.rhythm }));
  sets.push({ id: s.id, weight: 1, steps });
}
let setlistSets = 0;
for (const [url, raw] of Object.entries(SL.sets).sort(([a], [b]) => a.localeCompare(b))) {
  if (!raw || "error" in raw || !Array.isArray(raw.tandas)) continue;
  if (corpusDates.has(raw.date)) continue; // already in the corpus
  const steps: Step[] = [];
  for (const t of raw.tandas) {
    if (!DANCE.has(t.rhythm) || !t.tracks?.length) continue;
    if (isCumparsita(t.tracks.map((x) => x.title))) continue;
    const vote = new Map<string, number>();
    const voices = new Map<string, number>();
    for (const tr of t.tracks) {
      const orch = /^singers?\s/i.test(tr.artist) ? "" : (tr.artist.split(/,\s*/)[0] ?? "");
      const id = orchestraIdOf(orch);
      if (id) vote.set(id, (vote.get(id) ?? 0) + 1);
      const sg = singerKey(tr.artist.match(/\bsingers?\s+([^,]+)/i)?.[1] ?? "");
      voices.set(sg, (voices.get(sg) ?? 0) + 1);
    }
    const best = [...vote.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    // an unknown orchestra breaks the chain: the tandas around it are not adjacent in what we know
    if (!best) {
      steps.push({ orchestraId: "", singer: "", rhythm: t.rhythm });
      continue;
    }
    const sg = [...voices.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "";
    steps.push({ orchestraId: best[0], singer: sg, rhythm: t.rhythm });
  }
  sets.push({ id: url, weight: 0.5, steps });
  setlistSets++;
}

type Count = [number, number];
const bump = (m: Map<string, Count>, k: string, w: number) => {
  const c = m.get(k) ?? [0, 0];
  c[0] += 1;
  c[1] += w;
  m.set(k, c);
};
const pairs = new Map<string, Count>();
const families = new Map<string, Count>();
const styles = new Map<string, Count>();
const outOf = new Map<string, Count>();
const inOf = new Map<string, Count>();
const styleOut = new Map<string, Count>();
const styleIn = new Map<string, Count>();
const src = { referenceSets: { sets: 0, transitions: 0 }, setlists: { sets: setlistSets, transitions: 0 } };
let total: Count = [0, 0];
let tangoTotal: Count = [0, 0];
for (const s of sets) {
  if (s.weight === 1) src.referenceSets.sets++;
  for (let i = 0; i + 1 < s.steps.length; i++) {
    const a = s.steps[i]!;
    const b = s.steps[i + 1]!;
    if (!a.orchestraId || !b.orchestraId || !KNOWN.has(a.orchestraId) || !KNOWN.has(b.orchestraId)) continue;
    const w = s.weight;
    if (w === 1) src.referenceSets.transitions++;
    else src.setlists.transitions++;
    total = [total[0] + 1, total[1] + w];
    bump(pairs, `${a.orchestraId}>${b.orchestraId}`, w);
    bump(outOf, a.orchestraId, w);
    bump(inOf, b.orchestraId, w);
    bump(families, `${a.orchestraId}|${a.singer}>${b.orchestraId}|${b.singer}`, w);
    if (
      a.rhythm === "tango" &&
      b.rhythm === "tango" &&
      PROFILES.has(a.orchestraId) &&
      PROFILES.has(b.orchestraId)
    ) {
      const ka = styleClass({ orchestraId: a.orchestraId });
      const kb = styleClass({ orchestraId: b.orchestraId });
      tangoTotal = [tangoTotal[0] + 1, tangoTotal[1] + w];
      bump(styles, `${ka}>${kb}`, w);
      bump(styleOut, ka, w);
      bump(styleIn, kb, w);
    }
  }
}
const r2 = (x: number) => Math.round(x * 100) / 100;
const obj = (m: Map<string, Count>, min = 1) =>
  Object.fromEntries(
    [...m.entries()]
      .filter(([, c]) => c[0] >= min)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, c]) => [k, [c[0], r2(c[1])]]),
  );
const orchestras = Object.fromEntries(
  [...new Set([...outOf.keys(), ...inOf.keys()])].sort().map((id) => [
    id,
    {
      out: [outOf.get(id)?.[0] ?? 0, r2(outOf.get(id)?.[1] ?? 0)],
      in: [inOf.get(id)?.[0] ?? 0, r2(inOf.get(id)?.[1] ?? 0)],
    },
  ]),
);
const styleTotals = Object.fromEntries(
  [...new Set([...styleOut.keys(), ...styleIn.keys()])].sort().map((k) => [
    k,
    {
      out: [styleOut.get(k)?.[0] ?? 0, r2(styleOut.get(k)?.[1] ?? 0)],
      in: [styleIn.get(k)?.[0] ?? 0, r2(styleIn.get(k)?.[1] ?? 0)],
    },
  ]),
);
const out = {
  version: 1,
  about:
    "Succession model data (packages/core/src/succession.ts), written by `pnpm knowledge:succession` (scripts/build_succession.ts): transition counts between adjacent dance tandas of public DJ sets, each [raw count, weighted count] (reference sets weigh 1, the cached set-blog sets 0.5), plus the hand-curated parts from succession_curated.json. Do not edit by hand.",
  sources: src,
  totals: { transitions: [total[0], r2(total[1])], tango: [tangoTotal[0], r2(tangoTotal[1])] },
  orchestras,
  pairs: obj(pairs),
  families: obj(families, 2),
  styles: obj(styles),
  styleTotals,
  curated: CURATED,
};
const file = join(ROOT, "data/knowledge/succession.json");
writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`);
console.log(
  `succession: ${src.referenceSets.sets} reference sets (${src.referenceSets.transitions} transitions) + ${src.setlists.sets} set-blog sets (${src.setlists.transitions}); ${pairs.size} orchestra pairs, ${Object.keys(out.families).length} family pairs (≥ 2), ${styles.size} style pairs → ${file}`,
);
