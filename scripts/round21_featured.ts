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
    slot: 10,
    ids: ["6233830410", "2171c0196b", "deac5ee8db", "cebfbd8996"],
    why: "the DJ's Biagi instrumentals (Pura Clase, El Yaguarón, Bélgica, El Trece; 1938–42)",
  },
  {
    slot: 11,
    ids: ["24801db04a", "e851d595be", "c02b739977", "6e9afb7087"],
    why: "the DJ's Federico tanda (Vidal 1944–45, Cualquier Cosa with Valentino 1951, Leyenda Gaucha instr. 1952)",
  },
  {
    slot: 13,
    ids: ["16814cca76", "86e53db337", "ddfdb2c29b", "89bc9d7eef"],
    why: "the DJ's Demare / Berón tanda (1943)",
  },
  {
    slot: 14,
    ids: ["13fe376eb1", "0265a65075", "00a061a315", "166b2a4f3e"],
    why: "the DJ's Troilo / Rufino 1963 tanda (Danzarín instr. 1963, the session nearest the Rufino sides)",
  },
  {
    slot: 15,
    ids: ["68f9f78507", "cfbb4947c7", "8106c5a228"],
    why: "the DJ's valses (D'Arienzo 1935, Canaro 1938)",
  },
  {
    slot: 16,
    ids: ["28c8dff26b", "ac9c62f5b5", "d642ae0730", "c668717864"],
    why: "the DJ's Tanturi / Castillo tanda (Noches de Colón, Pocas Palabras, La Vida Es Corta, La Última Copa)",
  },
  {
    slot: 17,
    ids: ["e02b2e4f92", "be7917b0c8", "f29c7184ba", "6ac37b2ef8"],
    why: "the DJ's Caló / Iriarte tanda (1943–45)",
  },
  {
    slot: 18,
    ids: ["32fdbfc82d", "67f9a28a62", "38f03bac6d", "a2e1839ef1"],
    why: "the DJ's Pugliese instrumentals (Don Agustín Bardi, Chiqué, Emancipación, Nochero Soy; 1950s)",
  },
  {
    slot: 19,
    ids: ["655a908b21", "94056c42f4", "a2a56b32a2", "ae692df479"],
    why: "the DJ's Tango Bardo tanda (a contemporary orchestra in D'Arienzo's repertoire: No Mientas, Humillación, Maipo, El Cencerro)",
  },
  {
    slot: 23,
    ids: ["130fe70e7e", "a81d03fa26", "979e83ad3f", "5486994f6f"],
    why: "the última, Tanturi / Castillo: Pocas Palabras and La Vida Es Corta now play in T16, so Muñeca Brava and Como Se Pianta la Vida (1942) take their chairs; it still ends on Así Se Baila el Tango",
  },
];
/** the Spotify ids the DJ's sides play where the match rules cannot prove the take (a later take the index knows,
 * another transfer's length): kept on the night as the DJ's choice, never written to the judged cache */
const DJ_IDS: Record<
  string,
  { uri: string; album: string; durationMs: number; matched: string; why: string }
> = {
  "166b2a4f3e": {
    uri: "spotify:track:1TcXgz8vA1gN25RgShGeQl",
    album: "Los 25 Mejores Tangos",
    durationMs: 239800,
    matched: "Aníbal Troilo, Orquesta Anibal Troilo – Danzarín",
    why: "the index knows a 1973 take; the transfer on the album of the 1963 Rufino sides",
  },
  "67f9a28a62": {
    uri: "spotify:track:3npc4k1OPe3MU3F1hf8y3o",
    album: "Desde el alma",
    durationMs: 192653,
    matched: "Osvaldo Pugliese – Chiqué",
    why: "the index knows 1979–92 takes; no dated transfer",
  },
  a2e1839ef1: {
    uri: "spotify:track:07H6MGl2J73fhNeMW9Imha",
    album: "Tango Classics 114: La guitarrita",
    durationMs: 213291,
    matched: "Osvaldo Pugliese – Nochero soy",
    why: "every Spotify transfer runs 212–214 s against the index's 231 s",
  },
};
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
const djIds: string[] = [];
const label = (xs: Array<string | null>) => [...new Set(xs.filter((x): x is string => !!x))].join(" · ");
for (const pin of PINS) {
  const i = pin.slot - 1;
  const old = tandas[i]!;
  const songs = pin.ids.map((id) => {
    const x = song(id);
    const dj = DJ_IDS[x.id];
    if (x.spotify?.uri || !dj) return x;
    djIds.push(`${x.title} (${x.orchestra} ${x.year ?? "?"}): ${dj.uri} — ${dj.why}`);
    return {
      ...x,
      spotify: {
        uri: dj.uri,
        url: `https://open.spotify.com/track/${dj.uri.split(":").pop()}`,
        durationMs: dj.durationMs,
        album: dj.album,
        matched: dj.matched,
      },
    };
  });
  const byOrch = new Map<string, number>();
  for (const s of songs) byOrch.set(s.orchestraId, (byOrch.get(s.orchestraId) ?? 0) + 1);
  const main = [...byOrch.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  const lead = songs.find((s) => s.orchestraId === main)!;
  const vocal = songs.some((s) => s.vocal);
  const t = retimeTanda(
    {
      ...fresh(old),
      // (the years are the DJ's sides' — none for a contemporary orchestra's undated sides)
      yearRange: null,
      // (the tanda's rhythm is its sides' — T18 and T19 take former milonga slots with tangos)
      rhythm: (["tango", "vals", "milonga"] as const).reduce((a, r) =>
        songs.filter((x) => x.rhythm === r).length > songs.filter((x) => x.rhythm === a).length ? r : a,
      ),
      peak: pin.slot === 23 ? old.peak : undefined,
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

// --- 3. the inserts the DJ asked for: T16–T19 are four tango tandas in a row ---------------------------------
// "make those tandas of tango with the correct vals or milonga in between": a vals after T17 and a milonga after T19
// keep the night's TTV / TTM cycle (V T T V T T M T V T T); the families are Spotify-ready, never big four (the
// neighbours T18 Pugliese and T20 Troilo are), not already in the night, not one the DJ replaced tonight
const night = (ts: Tanda[]): Playlist => ({ ...base, tandas: ts });
// (the families the DJ replaced; the shipped T16–T19 were not rejected, the DJ's new tango tandas took their slots)
const removedFam = new Set(
  base.tandas
    .filter((_t, i) => i < 15 || i > 18)
    .flatMap((t) => t.songs)
    .filter((s) => !afterPins.some((t) => t.songs.some((x) => x.id === s.id)))
    .map((s) => `${s.orchestraId}|${s.singer ?? ""}|${s.rhythm}`),
);
const inserted: Array<{ after: number; t: Tanda }> = [];
for (const [after, rhythm] of [
  [17, "vals"],
  [19, "milonga"],
] as const) {
  const o = base.options;
  const inNight = new Set(tandas.map((t) => `${t.orchestraId}|${t.singer ?? ""}`));
  const titles = new Set(tandas.flatMap((t) => t.songs.map((s) => normTitle(s.title))));
  const prev = tandas[after - 1]!,
    next = tandas[after]!;
  const target = Math.round((prev.energy + next.energy) / 2);
  const tpl =
    tandas.find((t) => t.rhythm === rhythm && !t.pinned) ?? tandas.find((t) => t.rhythm === rhythm)!;
  let best: { t: Tanda; v: number } | null = null;
  // (tier 0: a family not yet in the night, famous sides; tier 1 — the milonga catalogue on Spotify is thin — a
  // family that plays tonight in another rhythm, not within three tandas, sides of fame ≥ 1)
  for (const tier of [0, 1, 2]) {
    if (best) break;
    for (const f of nightFamilies(cat, o, rhythm)) {
      const fk = `${f.orchestraId}|${f.singer ?? ""}`;
      if (isBigFour(f)) continue;
      if (tier === 0 && (inNight.has(fk) || removedFam.has(`${fk}|${rhythm}`))) continue;
      // (an orchestra already playing this rhythm tonight, or one of the neighbours' orchestras, never)
      // (tier 2 — the vals catalogue on Spotify is thinner still: another singer of an orchestra that plays this rhythm
      // tonight, not a neighbour)
      if (
        tandas.some(
          (t, k) =>
            t.orchestraId === f.orchestraId &&
            (Math.abs(k - after) <= 2 || (t.rhythm === rhythm && (tier < 2 || t.singer === f.singer))),
        )
      )
        continue;
      if (removedFam.has(`${fk}|${rhythm}`)) continue;
      if (
        tier === 1 &&
        tandas.some(
          (t, k) =>
            `${t.orchestraId}|${t.singer ?? ""}` === fk && (t.rhythm === rhythm || Math.abs(k - after) <= 3),
        )
      )
        continue;
      const sides = f.songs
        .filter(
          (x) =>
            x.spotify?.uri &&
            !titles.has(normTitle(x.title)) &&
            (x.fame ?? 0) >= (tier === 0 ? 2 : 1) &&
            !x.streamSuspect,
        )
        .sort((a, b) => (b.fame ?? 0) - (a.fame ?? 0));
      const pick: Song[] = [];
      for (const x of sides) {
        if (pick.length >= (rhythm === "vals" ? o.valsTandaSize : o.milongaTandaSize)) break;
        if (pick.some((y) => normTitle(y.title) === normTitle(x.title))) continue;
        if (
          pick.length &&
          sideProblem(pick, x, {
            rhythm,
            o: { ...o, tandaRules: { bpmBand: false, levelBand: false, tone: "inside" } },
          })
        )
          continue;
        pick.push(x);
      }
      if (pick.length < (rhythm === "vals" ? o.valsTandaSize : o.milongaTandaSize)) continue;
      const t = retimeTanda(
        {
          ...fresh(tpl),
          index: after,
          rhythm,
          orchestraId: f.orchestraId,
          orchestra: f.orchestra,
          singer: f.singer,
          vocal: f.vocal,
          era: pick[0]!.era,
          style: cat.profile(f.orchestraId)?.style,
          targetEnergy: target,
          phase: next.phase,
          peak: undefined,
          // (placed where the DJ asked: the panel reads its slot as the DJ's order, the learner never as a DJ template)
          locked: true,
          pinned: {
            by: "dj",
            reason: `the ${rhythm} the DJ asked for between the new tango tandas (TDJ's pick)`,
            at: AT,
          },
          note: `Inserted between the DJ's tango tandas (the ${rhythm} the cycle asks for; bypass it to play the tangos straight)`,
          reason: `The ${rhythm} between T${after} and T${after + 1}`,
          cortina: null,
        },
        strictOrder(pick, false),
      );
      const ts = [...tandas.slice(0, after), t, ...tandas.slice(after)];
      const r = strictChecks(night(ts));
      const mf = pick.reduce((a, x) => a + (x.fame ?? 0), 0) / pick.length;
      const v = r.blockers * 10 + r.penalty + Math.abs(t.energy - target) / 5 - mf;
      if (!best || v < best.v) best = { t, v };
    }
  }
  if (!best) throw new Error(`no ${rhythm} fits after T${after}`);
  diff.push({
    slot: `new after T${after}`,
    old: "—",
    new: nm(best.t),
    why: `the DJ: a ${rhythm} between the new tango tandas (the TTV / TTM cycle)`,
  });
  inserted.push({ after, t: best.t });
}
// (the later insert first, so the earlier index stays right)
for (const x of inserted.slice().sort((a, b) => b.after - a.after)) tandas.splice(x.after, 0, x.t);
const pen = (p: Playlist) => strictChecks(p).penalty;
void pen;

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
const shippedIds = new Set(base.tandas.map((t) => t.songs.map((x) => x.id).join()));
const changedAt = tandas
  .map((t, i) =>
    shippedIds.has(t.songs.map((x) => x.id).join()) && (t.cortina || i === tandas.length - 1) ? -1 : i,
  )
  .filter((i) => i >= 0);
for (const i of [...new Set(changedAt.flatMap((k) => [k - 1, k]))]
  .filter((k) => k >= 0)
  .sort((a, b) => a - b)) {
  const t = tandas[i];
  if (!t || !tandas[i + 1]) continue;
  if (!t.cortina) {
    // (an inserted tanda: its gap takes a cue — a placeholder the picker replaces)
    const src = tandas[i - 1]?.cortina ?? tandas.find((x) => x.cortina)!.cortina!;
    tandas[i] = { ...t, cortina: { ...src, id: `${src.id}-placeholder`, spotify: null } };
  }
  const cue = tandas[i]!.cortina!;
  const next = tandas[i + 1]!;
  const used = new Set(
    tandas
      .filter((_, j) => j !== i)
      .map((x) => x.cortina?.id)
      .filter(Boolean),
  );
  const fit = (c: Cortina) => Math.abs(c.energy - next.energy);
  const curBad = cueBad(night(tandas), i) + (cueOk(cue) ? 0 : 1) + (fit(cue) > 18 ? 1 : 0);
  if (!curBad) continue;
  let best: { c: Cortina; v: number } | null = null;
  for (const c of pool) {
    if (used.has(c.id) || !cueOk(c)) continue;
    const ts = tandas.slice();
    ts[i] = { ...tandas[i]!, cortina: { ...c, lengthSec: cue.lengthSec } };
    const v = cueBad(night(ts), i) * 10 + strictChecks(night(ts)).penalty + fit(c) / 10;
    if (!best || v < best.v) best = { c, v };
  }
  if (!best) continue;
  cueChanges.push(
    `after T${i + 1} (${tandas[i]!.orchestra}): ${cue.id.endsWith("-placeholder") ? "new gap" : `${cue.title} — ${cue.artist}`} → ${best.c.title} — ${best.c.artist}`,
  );
  tandas[i] = { ...tandas[i]!, cortina: { ...best.c, lengthSec: cue.lengthSec } };
}

// --- 6. the opening La Cumparsita ------------------------------------------------------------------------------
const op = openingCumparsita(cat, base.options, tandas[0]!, null);
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
// the DJ's closing version: Bandonegro's La Cumparsita (a contemporary orchestra; the opening stays D'Agostino's)
const closing = song("499d9ecc71");
diff.push({
  slot: "Closing",
  old: base.closing ? `La Cumparsita · ${base.closing.orchestra} ${base.closing.year}` : "none",
  new: `La Cumparsita · ${closing.orchestra}`,
  why: "the DJ's closing version",
});
const out0: Playlist = {
  ...base,
  closing,
  closingPinned: { by: "dj", reason: "the DJ's closing version (Bandonegro)", at: AT },
  // (the DJ's inserts make the night longer than its 4 h request: the request stays 4 h — the featured options are
  // the seed-199 recipe the tests compose — and the score reads the extra length as the DJ's)
  options: {
    ...base.options,
    rules: { ...(base.options.rules ?? {}), cumparsita: "both" },
  },
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
  djSpotifyIds: djIds,
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
// (the shipped T16–T19 were not rejected — the DJ's new tango tandas took their slots — so they teach nothing taken out;
// the inserted vals and milonga are TDJ's picks and teach nothing either)
const learned = learnFromEdit(
  undefined,
  { ...base, tandas: base.tandas.map((t, i) => (i >= 15 && i <= 18 ? { ...t, songs: [] } : t)) },
  { ...base, opening: op.song, closing, tandas: afterPins },
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
