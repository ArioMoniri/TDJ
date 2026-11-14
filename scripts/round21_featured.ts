/**
 * Round 21 — the featured night (apps/web/public/featured/golden-double-peak.json) with exactly the DJ's edits
 * (docs/specs/round21-best-night.md). The night is already in the DJ's Spotify: it is NOT recomposed and no fixer runs
 * over it. From the shipped file, only:
 *   - the opening La Cumparsita by the first tanda's orchestra (cumparsita.ts: D'Agostino, the version nearest 1941);
 *   - a side whose shipped Spotify id the round-21 stream-date rule rejects takes its judged id (Tres Esquinas …);
 *   - the DJ's tandas, exactly, pinned: T2, T4, T5, T7, T8, T9, T15;
 *   - the forced follow-ups: T10 and T11 (a repeated side, the same family/orchestra too close) — one tanda each of
 *     another family that fits the slot;
 *   - the cortinas around the changed tandas re-checked (the cue rules, Spotify-ready), changed only where needed;
 *   - the big-four rule checked, fixed with at most 2 tanda swaps (else reported);
 *   - re-timed (booth plan with the night's own settings) and re-scored.
 * Writes the night, docs/specs/round21-best-night.json, and prints the diff (old → new per changed slot) as JSON for
 * the spec. Run: pnpm --filter @tdj/core exec tsx ../../scripts/round21_featured.ts [--write]
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  bigFourProblems,
  type Cortina,
  candidatesFor,
  cortinaMatchProblem,
  isBigFour,
  isColour,
  judgeStreams,
  knownSingers,
  learnFromEdit,
  nightFamilies,
  normTitle,
  openingCumparsita,
  type Playlist,
  renight,
  retimeTanda,
  type Song,
  sideProblem,
  spotifyCandidate,
  strictChecks,
  strictOrder,
  type Tanda,
  takesIndex,
} from "../packages/core/src/index";
import { loadCatalog } from "../packages/core/src/load";

const ROOT = new URL("..", import.meta.url).pathname;
const F = `${ROOT}apps/web/public/featured/golden-double-peak.json`;
const write = process.argv.includes("--write");
const deps = loadCatalog(ROOT);
const cat = deps.catalog;
// the shipped night (round 19, with the round-18 clip fixes): the file as it is in git before this round
const base = JSON.parse(
  readFileSync(process.argv.find((a) => a.startsWith("--from="))?.slice(7) ?? F, "utf8"),
) as Playlist;
const AT = "2026-11-14T12:00:00.000Z";
const song = (id: string): Song => {
  const s = cat.songs.find((x) => x.id === id || x.altIds?.includes(id));
  if (!s) throw new Error(`no side ${id}`);
  return s;
};
const diff: Array<{ slot: string; old: string; new: string; why: string }> = [];
const nm = (t: Tanda) =>
  `${t.rhythm} · ${t.orchestra}${t.singer ? ` / ${t.singer}` : t.vocal ? "" : " instr."} · ${t.songs.map((s) => `${s.title} ${s.year ?? "?"}`).join(", ")}`;

// --- 1. stream ids the round-21 rule rejects ---------------------------------------------------------------------
const takes = takesIndex(cat.songs);
const singers = knownSingers(cat.songs);
const fixed: string[] = [];
// the release dates Spotify gives each id (the committed cache, round 21 --dates): the shipped entries carry none
const releaseOf = new Map<string, string>();
for (const v of Object.values(
  JSON.parse(readFileSync(`${ROOT}data/cache/spotify/tracks.json`, "utf8")) as Record<
    string,
    { uri?: string; release?: string } | null
  >,
))
  if (v?.uri && v.release) releaseOf.set(v.uri, v.release);
releaseOf.set("spotify:track:5iAzpDLPcnczkrY0F0md5z", "1939-01-09"); // "Laura" (checked 2026-11-14, see the spec)
const headArg = process.argv.find((a) => a.startsWith("--headCache="))?.slice(12);
const HEAD_CACHE = headArg
  ? (JSON.parse(readFileSync(headArg, "utf8")) as Record<string, { uri?: string } | null>)
  : null;
const fixSide = (s: Song): Song => {
  const sp = s.spotify?.uri
    ? { ...s.spotify, release: s.spotify.release ?? releaseOf.get(s.spotify.uri) }
    : null;
  const why = sp
    ? judgeStreams({ ...s, ...(takes.get(s.id) ?? {}) }, sp, null, { singers }).spotify
    : "no Spotify id";
  // (an id the round-21 re-judge replaced in the committed cache — the shipped one was the cache's — is replaced too)
  const was = HEAD_CACHE?.[s.id]?.uri;
  const now = (song(s.id).spotify?.uri ?? null) as string | null;
  if (!why && !(was && was === s.spotify?.uri && now && now !== was)) return s;
  const c = song(s.id);
  if (!c.spotify?.uri || c.spotify.uri === s.spotify?.uri) return s;
  fixed.push(
    `${s.title} (${s.orchestra} ${s.year}): ${s.spotify?.uri ?? "none"} (${s.spotify?.album ?? "?"}) → ${c.spotify.uri} (${c.spotify.album}) — ${why ?? "re-judged: the shipped id's album is dated before the side or decades after it (round-21 audit)"}`,
  );
  return { ...s, spotify: c.spotify };
};
let tandas: Tanda[] = base.tandas.map((t) => ({ ...t, songs: t.songs.map(fixSide) }));

// --- 2. the DJ's tandas, exactly, pinned ------------------------------------------------------------------------
const PINS: Array<{ slot: number; ids: string[]; why: string }> = [
  {
    slot: 2,
    ids: ["54e1304409", "8509c04168", "67d75c4496", "e5cccb8a87"],
    why: "the DJ's Di Sarli tanda (Shusheta, Catamarca instr. 1940; Lo Pasado Pasó, Corazón with Rufino)",
  },
  {
    slot: 4,
    ids: ["eb345072d6", "b313688f75", "3e9af572cf", "f9150b4c8a"],
    why: "the DJ's Típica Víctor tanda (Vargas, Charlo, Gómez 1932–38)",
  },
  {
    slot: 5,
    ids: ["e9d31466ec", "131567e74b", "7b191bb215", "bb6ae09db6"],
    why: "the DJ's Láurenz tanda (Casas 1940, A. Podestá 1943, M. Podestá 1942)",
  },
  {
    slot: 7,
    ids: ["8e3307b8a1", "07a6e0c944", "78239049b7", "74fbbdee53"],
    why: "the DJ's Donato / Lagos tanda (Carnaval de mi Barrio is a vals with Lita Morales)",
  },
  {
    slot: 8,
    ids: ["b895e7cf5c", "26b1ef8a48", "e72cc6516f", "c1b0ecf332"],
    why: "the DJ's D'Arienzo / Echagüe tanda (Farabute is the 1949 side)",
  },
  {
    slot: 9,
    ids: ["aa6b36ab7b", "71540229e1", "ea9b927fa5"],
    why: "the DJ's De Angelis / Dante–Martel valses (1944–47)",
  },
  {
    slot: 15,
    ids: ["68f9f78507", "cfbb4947c7", "8106c5a228"],
    why: "the DJ's valses (D'Arienzo 1935, Canaro 1938)",
  },
];
/** a rebuilt tanda drops the fields the composer derived from its old sides (heat label, band, golden class …) */
const fresh = (t: Tanda): Tanda => {
  const {
    heat: _h,
    band: _b,
    golden: _g,
    crossesBreak: _c,
    spreadFloor: _s,
    poolSmall: _p,
    cohesion: _co,
    ...rest
  } = t;
  return rest as Tanda;
};
const label = (xs: Array<string | null>) => [...new Set(xs.filter((x): x is string => !!x))].join(" · ");
for (const pin of PINS) {
  const i = pin.slot - 1;
  const old = tandas[i]!;
  const songs = pin.ids.map(song);
  const byOrch = new Map<string, number>();
  for (const s of songs) byOrch.set(s.orchestraId, (byOrch.get(s.orchestraId) ?? 0) + 1);
  const main = [...byOrch.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  const lead = songs.find((s) => s.orchestraId === main)!;
  const vocal = songs.some((s) => s.vocal);
  const t = retimeTanda(
    {
      ...fresh(old),
      rhythm: songs.every((s) => s.rhythm === "vals") ? "vals" : old.rhythm,
      orchestraId: main,
      orchestra: label(songs.map((s) => s.orchestra)),
      singer: vocal ? label(songs.map((s) => s.singer)) || null : null,
      vocal,
      era: lead.era,
      style: cat.profile(main)?.style,
      note: pin.why,
      reason: "The DJ's tanda, kept as is",
      locked: true,
      pinned: { by: "dj", reason: pin.why, at: AT },
    },
    songs,
  );
  diff.push({ slot: `T${pin.slot}`, old: nm(old), new: nm(t), why: `DJ edit: ${pin.why} — pinned` });
  tandas[i] = t;
}

const afterPins = tandas.slice();

// --- 3. the forced follow-ups: T10, T11 -----------------------------------------------------------------------
const night = (ts: Tanda[]): Playlist => ({ ...base, tandas: ts });
const pen = (p: Playlist) => {
  const r = strictChecks(p);
  return (
    r.blockers * 10 +
    r.shouldFix +
    bigFourProblems(p.tandas, p.options).filter(
      (x) => !(p.tandas[x.tanda]?.pinned || (x.with !== undefined && p.tandas[x.with]?.pinned)),
    ).length *
      2
  );
};
for (const slot of [10, 11]) {
  const i = slot - 1;
  const old = tandas[i]!;
  const o = base.options;
  const gap = o.orchestraRepeatGap;
  const near = new Set(tandas.filter((_, j) => Math.abs(j - i) < gap && j !== i).map((t) => t.orchestraId));
  // (the other forced chair is replaced too: its old titles are free)
  const pending = new Set([9, 10].filter((j) => j > i));
  const titles = new Set(
    tandas.flatMap((t, j) => (j === i || pending.has(j) ? [] : t.songs.map((s) => normTitle(s.title)))),
  );
  const singersNear = new Set(
    tandas.filter((t, j) => Math.abs(j - i) < o.singerRepeatGap && j !== i && t.singer).map((t) => t.singer),
  );
  // another family: not the orchestra the chair had, none already in the night, no big four, the orchestra gap
  // (a family already in the night only when it plays ≥ 8 tandas away and in other years)
  const inNight = new Set(
    tandas.filter((t, j) => j !== i && Math.abs(j - i) < 8).map((t) => `${t.orchestraId}|${t.singer ?? ""}`),
  );
  const usedYears = new Map<string, Array<[number, number]>>();
  tandas.forEach((t, j) => {
    if (j === i || !t.yearRange) return;
    const k = `${t.orchestraId}|${t.singer ?? ""}`;
    usedYears.set(k, [...(usedYears.get(k) ?? []), t.yearRange]);
  });
  const fams = nightFamilies(cat, o, old.rhythm).filter(
    (c) =>
      c.orchestraId !== old.orchestraId &&
      !inNight.has(`${c.orchestraId}|${c.singer ?? ""}`) &&
      !near.has(c.orchestraId) &&
      !isBigFour(c) &&
      c.vocal === old.vocal &&
      !singersNear.has(c.singer) &&
      // (a planned peak never takes a colour family)
      !(old.peak && isColour(cat.profile(c.orchestraId))),
  );
  let best: { t: Tanda; v: number } | null = null;
  for (const f of fams) {
    const sides = f.songs
      .filter(
        (s) => s.spotify?.uri && !titles.has(normTitle(s.title)) && (s.fame ?? 0) >= 2 && !s.streamSuspect,
      )
      .sort(
        (a, b) =>
          (b.fame ?? 0) - (a.fame ?? 0) ||
          Math.abs((a.energy ?? 50) - old.targetEnergy) - Math.abs((b.energy ?? 50) - old.targetEnergy),
      );
    // every side may anchor the tanda (one tone around it); the set with the best fame near the slot's energy wins
    let pick: Song[] = [];
    let pickV = Number.NEGATIVE_INFINITY;
    for (const anchor of sides) {
      const cur: Song[] = [anchor];
      for (const s of sides) {
        if (cur.length >= old.songs.length) break;
        if (cur.some((x) => normTitle(x.title) === normTitle(s.title))) continue;
        // (the night keeps its round-20 rules — the new bands and tone are for future nights: voice, style, years here)
        if (
          sideProblem(cur, s, {
            rhythm: old.rhythm,
            o: { ...o, tandaRules: { bpmBand: false, levelBand: false, tone: "inside" } },
          })
        )
          continue;
        cur.push(s);
      }
      if (cur.length < old.songs.length) continue;
      const mf = cur.reduce((a, x) => a + (x.fame ?? 0), 0) / cur.length;
      const me = cur.reduce((a, x) => a + (x.energy ?? 50), 0) / cur.length;
      const v = mf - Math.abs(me - old.targetEnergy) / 20;
      if (v > pickV) {
        pickV = v;
        pick = cur;
      }
    }
    const fy = pick.map((x) => x.year ?? 0);
    const clash = (usedYears.get(`${f.orchestraId}|${f.singer ?? ""}`) ?? []).some(
      ([a, b]) => Math.min(...fy) <= b && Math.max(...fy) >= a,
    );
    if (clash) continue;
    if (pick.length < old.songs.length) {
      if (process.env.DEBUG)
        console.error(`T${slot} ${f.orchestraId}|${f.singer}: ${sides.length} sides, ${pick.length} picked`);
      continue;
    }
    const t = retimeTanda(
      {
        ...fresh(old),
        orchestraId: f.orchestraId,
        orchestra: f.orchestra,
        singer: f.singer,
        vocal: f.vocal,
        style: cat.profile(f.orchestraId)?.style,
        era: pick[0]!.era,
        note: undefined,
        reason: `Replaces ${old.orchestra}${old.singer ? ` / ${old.singer}` : ""} (a side now in a DJ tanda)`,
      },
      strictOrder(pick, !!old.peak),
    );
    const ts = tandas.slice();
    ts[i] = t;
    const v =
      pen(night(ts)) +
      Math.abs(t.energy - old.targetEnergy) / 4 -
      t.songs.reduce((a, s) => a + (s.fame ?? 0), 0) / t.songs.length / 2;
    if (!best || v < best.v) best = { t, v };
  }
  if (!best)
    throw new Error(
      `no family fits T${slot}: ${nightFamilies(cat, o, old.rhythm)
        .filter((c) => c.vocal === old.vocal && !isBigFour(c))
        .map(
          (c) =>
            `${c.orchestraId}|${c.singer}|${c.songs.length}|${near.has(c.orchestraId) ? "near" : ""}${inNight.has(`${c.orchestraId}|${c.singer ?? ""}`) ? "in" : ""}${singersNear.has(c.singer) ? "sing" : ""}`,
        )
        .join(" ")} :: ${fams.length}`,
    );
  const nt = best.t;
  diff.push({
    slot: `T${slot}`,
    old: nm(old),
    new: nm(nt),
    why:
      slot === 10
        ? "forced: La Bruja and No Mientas now play in T8, and D'Arienzo / Echagüe would return 2 tandas after T8"
        : "forced: Garúa now plays in T5, and Láurenz would return 6 tandas after T5 with the same singer",
  });
  tandas[i] = nt;
}

// --- 4. the big four ----------------------------------------------------------------------------------------------
const realBig = (ts: Tanda[]) =>
  bigFourProblems(ts, base.options).filter(
    (x) => !(ts[x.tanda]?.pinned || (x.with !== undefined && ts[x.with]?.pinned)),
  );
const before4 = realBig(tandas);
const swaps: string[] = [];
for (let k = 0; k < 2 && realBig(tandas).length; k++) {
  let best: { ts: Tanda[]; v: number; a: number; b: number } | null = null;
  const v0 = realBig(tandas).length * 10 + strictChecks(night(tandas)).penalty;
  for (let a = 1; a < tandas.length - 1; a++)
    for (let b = a + 1; b < tandas.length - 1; b++) {
      const A = tandas[a]!,
        B = tandas[b]!;
      if (A.pinned || B.pinned || A.rhythm !== B.rhythm || A.peak || B.peak) continue;
      const ts = tandas.slice();
      ts[a] = { ...B, index: A.index, targetEnergy: A.targetEnergy, phase: A.phase, cortina: A.cortina };
      ts[b] = { ...A, index: B.index, targetEnergy: B.targetEnergy, phase: B.phase, cortina: B.cortina };
      const r = strictChecks(night(ts));
      const v = realBig(ts).length * 10 + r.penalty;
      // (a swap may not make the rest of the night worse: the panel without the big-four items stays as it was)
      const rest = (x: ReturnType<typeof strictChecks>) =>
        x.penalty - x.violations.filter((q) => q.rule === "bigFour").length;
      if (rest(r) > rest(strictChecks(night(tandas))) + 1e-9) continue;
      if (r.blockers <= strictChecks(night(tandas)).blockers && v < v0 && (!best || v < best.v))
        best = { ts, v, a, b };
    }
  if (!best) break;
  swaps.push(`T${best.a + 1} ↔ T${best.b + 1} (${tandas[best.a]!.orchestra} ↔ ${tandas[best.b]!.orchestra})`);
  diff.push({
    slot: `T${best.a + 1} ↔ T${best.b + 1}`,
    old: `${nm(tandas[best.a]!)} | ${nm(tandas[best.b]!)}`,
    new: "the two tandas swap places (songs unchanged)",
    why: "big four: never two back to back",
  });
  tandas = best.ts;
}
const after4 = realBig(tandas);

// --- 5. cortinas ---------------------------------------------------------------------------------------------------
const pool = candidatesFor(deps.cortinas, base.options).filter((c) => !!c.spotify?.uri);
const cueBad = (p: Playlist, i: number) =>
  strictChecks(p).violations.filter((v) => v.rule.startsWith("cue") && v.tanda === i).length;
const cueOk = (c: Cortina) =>
  !!c.spotify?.uri && !cortinaMatchProblem(c, spotifyCandidate(c.spotify, c.title));
const cueChanges: string[] = [];
const changedSlots = new Set([1, 3, 4, 6, 7, 8, 9, 10, 14]);
for (const i of [...changedSlots]
  .flatMap((s) => [s - 1, s])
  .filter((x, k, xs) => xs.indexOf(x) === k)
  .sort((a, b) => a - b)) {
  const t = tandas[i];
  if (!t?.cortina || !tandas[i + 1]) continue;
  const next = tandas[i + 1]!;
  const used = new Set(
    tandas
      .filter((_, j) => j !== i)
      .map((x) => x.cortina?.id)
      .filter(Boolean),
  );
  const fit = (c: Cortina) => Math.abs(c.energy - next.energy);
  const curBad = cueBad(night(tandas), i) + (cueOk(t.cortina) ? 0 : 1) + (fit(t.cortina) > 18 ? 1 : 0);
  if (!curBad) continue;
  let best: { c: Cortina; v: number } | null = null;
  for (const c of pool) {
    if (used.has(c.id) || !cueOk(c)) continue;
    const ts = tandas.slice();
    ts[i] = { ...t, cortina: { ...c, lengthSec: t.cortina.lengthSec } };
    const v = cueBad(night(ts), i) * 10 + strictChecks(night(ts)).penalty + fit(c) / 10;
    if (!best || v < best.v) best = { c, v };
  }
  if (!best) continue;
  cueChanges.push(
    `after T${i + 1}: ${t.cortina.title} — ${t.cortina.artist} → ${best.c.title} — ${best.c.artist}`,
  );
  tandas[i] = { ...t, cortina: { ...best.c, lengthSec: t.cortina.lengthSec } };
}

// --- 6. the opening La Cumparsita ------------------------------------------------------------------------------
const op = openingCumparsita(cat, base.options, tandas[0]!, base.closing);
const fallbacks = [
  ...(base.stats.settingFallbacks ?? []).filter((f) => !f.startsWith("opening:")),
  ...(op.fallback ? [op.fallback] : []),
];
diff.unshift({
  slot: "Opening",
  old: "none",
  new: op.song
    ? `La Cumparsita · ${op.song.orchestra}${op.song.singer ? ` / ${op.song.singer}` : ""} ${op.song.year}`
    : "none",
  why: `the DJ: open with La Cumparsita matching the first tanda${op.fallback ? ` (${op.fallback})` : ""}`,
});

// --- 7. re-time and re-score ------------------------------------------------------------------------------------
const out0: Playlist = {
  ...base,
  options: { ...base.options, rules: { ...(base.options.rules ?? {}), cumparsita: "both" } },
  opening: op.song,
  tandas: tandas.map((t, i) => ({ ...t, index: i })),
  stats: { ...base.stats, ...(fallbacks.length ? { settingFallbacks: fallbacks } : {}) },
};
const out = renight(out0, out0.tandas);
const sc = strictChecks(out);
const report = {
  score: { before: base.score.total, after: out.score.total },
  hours: (out.stats.durationSec / 3600).toFixed(2),
  strict: {
    blockers: sc.blockers,
    shouldFix: sc.shouldFix,
    rules: [...new Set(sc.violations.map((v) => v.rule))],
    exceptions: sc.exceptions?.length ?? 0,
  },
  bigFour: { before: before4.map((x) => x.detail), after: after4.map((x) => x.detail), swaps },
  spotifyFixed: fixed,
  cortinas: cueChanges,
  spotifySides: `${out.tandas.flatMap((t) => t.songs).filter((s) => s.spotify?.uri).length}/${out.tandas.flatMap((t) => t.songs).length}`,
  cues: `${out.tandas.filter((t) => t.cortina?.spotify?.uri).length}/${out.tandas.filter((t) => t.cortina).length}`,
  diff,
  shape: out.tandas.map(
    (t, i) =>
      `${i + 1}. ${t.rhythm} · ${t.orchestra}${t.singer ? ` / ${t.singer}` : t.vocal ? "" : " instr."} · ${t.yearRange?.join("–")}${t.pinned ? " · pinned" : ""}`,
  ),
};
console.log(
  JSON.stringify(
    {
      ...report,
      violations: sc.violations.map((v) => `${v.rule}@T${v.tanda + 1}: ${v.detail}`),
      exceptions: sc.exceptions?.map((v) => `${v.rule}@T${v.tanda + 1}: ${v.detail}`),
    },
    null,
    1,
  ),
);
// what TDJ learns from the DJ's edits of this night (learn.ts): the repo-level preferences every later night reads
// (only the DJ's own edits teach: the pinned tandas and the opening, never the forced follow-ups the engine chose)
const learned = learnFromEdit(
  undefined,
  base,
  { ...base, opening: op.song, tandas: afterPins },
  AT,
  "the DJ's edits of the featured night (round 21)",
);
console.error(
  `learned: ${Object.keys(learned.sides ?? {}).length} sides, ${Object.keys(learned.families ?? {}).length} families, ${learned.templates?.length} templates`,
);
if (write) {
  writeFileSync(
    `${ROOT}data/knowledge/dj_preferences.json`,
    `${JSON.stringify({ about: "Round 21: what TDJ learned from the DJ's hand edits (packages/core/src/learn.ts) — the repo-level store every composed night reads under the DJ's own memory. Regenerate with scripts/round21_featured.ts.", ...learned }, null, 1)}\n`,
  );
  writeFileSync(F, JSON.stringify(out));
  writeFileSync(`${ROOT}docs/specs/round21-best-night.json`, `${JSON.stringify(out, null, 1)}\n`);
}
