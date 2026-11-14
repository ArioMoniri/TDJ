import type { Catalog } from "./catalog";
import { bigFourProblems, tandaProblems } from "./coherence";
import { type ComposeDeps, swapTanda } from "./compose";
import { isDanceableSong, normTitle } from "./energy";
import { renight, replaceSide, retimeTanda, swapOptions } from "./swap";
import { isTandaEligible } from "./tanda";
import type { DanceRhythm, Playlist, Song, Tanda } from "./types";

/**
 * Round 22 — editing a composed night from a prompt ("make tanda 7 calmer", "swap the 2nd song of tanda 3 for a
 * Fiorentino"). The model never writes the night: it answers with structured edits (swap, move, lock, retune, replace
 * a tanda), and the engine applies each one through the same checks as the manual controls (the Swap sheet's
 * `swapReason`, the tanda coherence rules, the composer's own tanda builder) and refuses any edit that would add a
 * night-level fault (an orchestra or singer back too soon, two non-tango tandas in a row, the big-four rule, a hard
 * score failure). Every id is looked up in the catalogue; an unknown one is refused, never guessed.
 */
export type EditDirection = "calmer" | "livelier";
export type NightEditOp =
  /** put `songId` (or, without one, the engine's best fit) in chair `position` of tanda `tanda` (1-based) */
  | { op: "swap"; tanda: number; position: number; songId?: string }
  /** move tanda `tanda` to position `to` (1-based) */
  | { op: "move"; tanda: number; to: number }
  | { op: "lock"; tanda: number; locked?: boolean }
  /** calmer / livelier: sides of the same family first, else another family at the new energy */
  | { op: "retune"; tanda: number; direction: EditDirection }
  /** a new tanda in the slot: from listed sides, or built by the engine for an orchestra / singer / direction */
  | {
      op: "replace_tanda";
      tanda: number;
      orchestraId?: string;
      singer?: string;
      songIds?: string[];
      direction?: EditDirection;
    };
export const EDIT_OPS = ["swap", "move", "lock", "retune", "replace_tanda"] as const;

export interface TandaBrief {
  /** 1-based, as the DJ reads it */
  number: number;
  rhythm: DanceRhythm;
  orchestra: string;
  singer: string | null;
  energy: number;
  years: [number, number] | null;
  locked?: boolean;
  songs: Array<{ id: string; title: string; year: number | null; energy: number }>;
}
export interface EditChange {
  op: NightEditOp["op"];
  /** the tanda's number in the night after the edit */
  tanda: number;
  /** one line in plain DJ language */
  line: string;
  before?: TandaBrief;
  after?: TandaBrief;
}
export interface EditOutcome {
  playlist: Playlist;
  applied: EditChange[];
  rejected: Array<{ op: NightEditOp; reason: string }>;
}

/* ---------- parsing ---------- */

const OP_ALIAS: Record<string, NightEditOp["op"]> = {
  swap: "swap",
  swap_side: "swap",
  swap_song: "swap",
  replace_side: "swap",
  replace_song: "swap",
  move: "move",
  reorder: "move",
  move_tanda: "move",
  lock: "lock",
  pin: "lock",
  unlock: "lock",
  retune: "retune",
  retune_energy: "retune",
  energy: "retune",
  replace_tanda: "replace_tanda",
  replacetanda: "replace_tanda",
  swap_tanda: "replace_tanda",
};
const asInt = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 99 ? n : null;
};
const asDirection = (o: Record<string, unknown>): EditDirection | null => {
  const d = String(o.direction ?? o.energy ?? "").toLowerCase();
  if (/calm|lower|down|soft|less|quiet/.test(d)) return "calmer";
  if (/liv|high|up|more|strong|energ/.test(d)) return "livelier";
  const delta = Number(o.delta ?? o.change);
  if (Number.isFinite(delta) && delta !== 0) return delta < 0 ? "calmer" : "livelier";
  return null;
};
const textOf = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : undefined;

/** pull a JSON value out of model text (code fences, prose around it) */
function jsonIn(text: string): unknown {
  const t = text.trim();
  const tries = [t, t.replace(/^[\s\S]*?```(?:json)?\s*/i, "").replace(/```[\s\S]*$/, "")];
  const a = t.indexOf("{"),
    b = t.lastIndexOf("}");
  if (a >= 0 && b > a) tries.push(t.slice(a, b + 1));
  const c = t.indexOf("["),
    d = t.lastIndexOf("]");
  if (c >= 0 && d > c) tries.push(t.slice(c, d + 1));
  for (const s of tries) {
    try {
      return JSON.parse(s);
    } catch {}
  }
  return undefined;
}

function oneOp(raw: unknown): NightEditOp | string {
  if (!raw || typeof raw !== "object") return "an edit that is not an object";
  const o = raw as Record<string, unknown>;
  const name = String(o.op ?? o.type ?? o.action ?? "")
    .toLowerCase()
    .replace(/[\s-]/g, "_");
  const kind = OP_ALIAS[name] ?? OP_ALIAS[name.replace(/_/g, "")];
  if (!kind) return `unknown edit "${name || "?"}"`;
  const tanda = asInt(o.tanda ?? o.tandaNumber ?? o.index);
  if (!tanda) return `${kind}: no tanda number`;
  if (kind === "swap") {
    const position = asInt(o.position ?? o.side ?? o.song ?? o.chair);
    if (!position) return `swap in tanda ${tanda}: no side number`;
    const songId = textOf(o.songId ?? o.song_id ?? o.id);
    return songId ? { op: "swap", tanda, position, songId } : { op: "swap", tanda, position };
  }
  if (kind === "move") {
    const to = asInt(o.to ?? o.position ?? o.target);
    if (!to) return `move tanda ${tanda}: no position`;
    return { op: "move", tanda, to };
  }
  if (kind === "lock") {
    const locked = name === "unlock" ? false : o.locked === undefined ? true : o.locked !== false;
    return { op: "lock", tanda, locked };
  }
  if (kind === "retune") {
    const direction = asDirection(o);
    if (!direction) return `retune tanda ${tanda}: say calmer or livelier`;
    return { op: "retune", tanda, direction };
  }
  const out: Extract<NightEditOp, { op: "replace_tanda" }> = { op: "replace_tanda", tanda };
  const orch = textOf(o.orchestraId ?? o.orchestra_id ?? o.orchestra);
  if (orch) out.orchestraId = orch;
  const singer = textOf(o.singer);
  if (singer) out.singer = singer;
  const ids = o.songIds ?? o.song_ids ?? o.sides;
  if (Array.isArray(ids)) out.songIds = ids.map(String).slice(0, 6);
  const direction = o.direction !== undefined || o.delta !== undefined ? asDirection(o) : null;
  if (direction) out.direction = direction;
  return out;
}

/** the keys providers wrap the arguments in, outermost first (edits, tool calls, tool_use input, text blocks) */
const WRAPPERS = [
  "edits",
  "tool_calls",
  "toolCalls",
  "function",
  "functionCall",
  "arguments",
  "input",
  "args",
  "text",
  "content",
] as const;
/**
 * The model's answer → edits. Accepts an Anthropic `tool_use` block (or a list of content blocks), an OpenAI / Gemini
 * tool call (arguments as a JSON string or object), `{ edits: [...] }`, a bare list, or text with JSON in it (ACP
 * agents answer in text). Anything it cannot read is listed in `errors`, never applied.
 */
export function parseEditOps(raw: unknown): { ops: NightEditOp[]; errors: string[]; note?: string } {
  const ops: NightEditOp[] = [];
  const errors: string[] = [];
  let note: string | undefined;
  const visit = (v: unknown, depth = 0): void => {
    if (depth > 6 || v === null || v === undefined) return;
    if (typeof v === "string") {
      const j = jsonIn(v);
      if (j !== undefined) visit(j, depth + 1);
      return;
    }
    if (Array.isArray(v)) {
      // a list of edits, or a list of content blocks / tool calls
      const looksLikeEdits = v.some(
        (x) => x && typeof x === "object" && ("op" in x || "type" in x) && "tanda" in x,
      );
      if (looksLikeEdits) {
        for (const x of v) {
          const r = oneOp(x);
          if (typeof r === "string") errors.push(r);
          else ops.push(r);
        }
        return;
      }
      for (const x of v) visit(x, depth + 1);
      return;
    }
    if (typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if (typeof o.note === "string" && !note) note = o.note.slice(0, 300);
    // the wrappers providers put around the arguments: edits, tool_use input, text blocks, tool calls
    const wrap = WRAPPERS.find((k) => k in o);
    if (wrap) {
      const inner =
        wrap === "function"
          ? (o.function as { arguments?: unknown } | null)?.arguments
          : wrap === "functionCall"
            ? (o.functionCall as { args?: unknown } | null)?.args
            : o[wrap];
      visit(inner, depth + 1);
      return;
    }
    if ("tanda" in o) {
      const r = oneOp(o);
      if (typeof r === "string") errors.push(r);
      else ops.push(r);
    }
  };
  if (raw === null || raw === undefined) return { ops, errors: ["the model gave no answer"] };
  visit(raw);
  return { ops: ops.slice(0, 12), errors, ...(note ? { note } : {}) };
}

/* ---------- the night's faults ---------- */

const keyOf = (t: Pick<Tanda, "songs" | "orchestraId" | "rhythm">) =>
  t.songs[0]?.id ?? `${t.orchestraId}|${t.rhythm}`;
const sameSinger = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && normTitle(a) === normTitle(b);

/**
 * The night-level faults an edit must not add, as stable keys (a tanda is named by its first side, so a move does not
 * rename the faults it leaves alone): an orchestra or a singer back within the night's gap, two non-tango tandas in
 * a row, the big-four rule and the hard failures that cap the score. A tanda's own coherence is checked where its
 * sides are chosen: the Swap sheet's rules for a side, `tandaProblems` for listed sides, the composer's builder.
 */
export function nightFaults(tandas: Tanda[], o: Playlist["options"], hardReasons: string[] = []): string[] {
  const out = new Set<string>();
  const og = o.orchestraRepeatGap ?? 6;
  const sg = o.singerRepeatGap ?? 4;
  for (let i = 0; i < tandas.length; i++)
    for (let j = i + 1; j < tandas.length; j++) {
      const a = tandas[i]!,
        b = tandas[j]!;
      if (j - i < og && a.orchestraId === b.orchestraId) out.add(`gap|${keyOf(a)}|${keyOf(b)}`);
      if (j - i < sg && sameSinger(a.singer, b.singer)) out.add(`singer|${keyOf(a)}|${keyOf(b)}`);
    }
  for (let i = 1; i < tandas.length; i++)
    if (tandas[i - 1]!.rhythm !== "tango" && tandas[i]!.rhythm !== "tango")
      out.add(`rhythm|${keyOf(tandas[i - 1]!)}|${keyOf(tandas[i]!)}`);
  for (const f of bigFourProblems(tandas, o)) {
    if (f.kind === "quartile") out.add(`big4-quartile|${f.detail.slice(0, 10)}`);
    else if (f.kind === "missing") out.add(`big4-missing|${f.detail}`);
    else out.add(`big4-${f.kind}|${keyOf(tandas[f.with ?? 0]!)}|${keyOf(tandas[f.tanda]!)}`);
  }
  for (const r of hardReasons) out.add(`hard|${r.replace(/[\d.,:–-]+/g, "#")}`);
  return [...out];
}
const faultsOf = (p: Playlist) => nightFaults(p.tandas, p.options, p.score?.reasons ?? []);

/** a plain-words reason for the first new fault */
function explainFault(key: string, p: Playlist): string {
  const [kind, a, b] = key.split("|");
  const find = (k?: string) => p.tandas.findIndex((t) => keyOf(t) === k);
  const ta = p.tandas[find(a)],
    tb = p.tandas[find(b)];
  const n = (k?: string) => find(k) + 1;
  switch (kind) {
    case "gap":
      return `${tb?.orchestra ?? "the orchestra"} would play in tanda ${n(a)} and again in tanda ${n(b)}; an orchestra returns after ${p.options.orchestraRepeatGap ?? 6} tandas`;
    case "singer":
      return `${tb?.singer ?? "the singer"} would sing in tandas ${n(a)} and ${n(b)}, too close`;
    case "rhythm":
      return `tandas ${n(a)} and ${n(b)} would both be ${ta?.rhythm ?? "non-tango"}/${tb?.rhythm ?? ""}: a tango tanda goes between`;
    case "big4-adjacent":
      return `two big-four tandas back to back (${ta?.orchestra}, ${tb?.orchestra})`;
    case "big4-gap":
      return `${tb?.orchestra} would come back too soon (big-four rule)`;
    case "big4-quartile":
      return "a quarter of the night would lose its big-four tanda";
    case "big4-missing":
      return "one of the big four would be missing from the night";
    case "tanda":
      return `tanda ${n(a)} would break the tanda rules (${b})`;
    default:
      return "it would break one of the night's rules";
  }
}

/* ---------- briefs and lines ---------- */

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export function tandaBrief(t: Tanda, i: number): TandaBrief {
  return {
    number: i + 1,
    rhythm: t.rhythm,
    orchestra: t.orchestra,
    singer: t.singer,
    energy: Math.round(t.energy),
    years: t.yearRange,
    ...(t.locked ? { locked: true } : {}),
    songs: t.songs.map((s) => ({
      id: s.id,
      title: s.title,
      year: s.year,
      energy: Math.round(s.energy ?? 50),
    })),
  };
}
const family = (t: Pick<Tanda, "orchestra" | "singer">) =>
  `${t.orchestra}${t.singer ? ` / ${t.singer}` : ""}`;
const yrs = (t: Pick<Tanda, "yearRange">) =>
  t.yearRange
    ? t.yearRange[0] === t.yearRange[1]
      ? `${t.yearRange[0]}`
      : `${t.yearRange[0]}–${t.yearRange[1]}`
    : "";

/* ---------- catalogue lookups ---------- */

export function songById(cat: Catalog, id: string): Song | undefined {
  return cat.songs.find((s) => s.id === id) ?? cat.songs.find((s) => s.altIds?.includes(id));
}
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’`.]/g, "");

interface NameIndex {
  orchestras: Map<string, { orchestraId: string; name: string }>;
  singers: Map<string, { singer: string; n: number }>;
}
const NAME_CACHE = new WeakMap<Catalog, NameIndex>();
const GENERIC = new Set([
  "orquesta",
  "tipica",
  "sexteto",
  "cuarteto",
  "quinteto",
  "trio",
  "y",
  "su",
  "con",
  "del",
  "los",
  "las",
  "tango",
  "tanda",
  "milonga",
  "valse",
  "vals",
]);
function nameIndex(cat: Catalog): NameIndex {
  const hit = NAME_CACHE.get(cat);
  if (hit) return hit;
  const orchestras = new Map<string, { orchestraId: string; name: string }>();
  for (const [id, songs] of cat.byOrchestra) {
    if (songs.length < 12) continue;
    const name = songs[0]!.orchestra;
    const words = fold(name).split(/\s+/).filter(Boolean);
    orchestras.set(words.join(" "), { orchestraId: id, name });
    const last = words.at(-1);
    if (last && last.length >= 4 && !GENERIC.has(last) && !orchestras.has(last))
      orchestras.set(last, { orchestraId: id, name });
  }
  const counts = new Map<string, Map<string, number>>();
  for (const s of cat.songs) {
    if (!s.singer) continue;
    for (const one of s.singer.split(/\s*(?:,|&|\by\b|\band\b|\/)\s*/)) {
      const w = fold(one).split(/\s+/).filter(Boolean);
      const last = w.at(-1);
      if (!last || last.length < 5 || GENERIC.has(last)) continue;
      const m = counts.get(last) ?? new Map<string, number>();
      m.set(one.trim(), (m.get(one.trim()) ?? 0) + 1);
      counts.set(last, m);
    }
  }
  const singers = new Map<string, { singer: string; n: number }>();
  for (const [k, m] of counts) {
    const [singer, n] = [...m.entries()].sort((a, b) => b[1] - a[1])[0]!;
    if (n >= 6) singers.set(k, { singer, n });
  }
  const idx = { orchestras, singers };
  NAME_CACHE.set(cat, idx);
  return idx;
}
export interface NameHit {
  kind: "orchestra" | "singer";
  orchestraId?: string;
  /** the full name as the catalogue writes it */
  name: string;
  /** the word the DJ used (the singer's surname) */
  word: string;
  /** sides in the catalogue (a surname that names both an orchestra and a singer goes to the larger) */
  n: number;
}
/** orchestras and singers named in free text ("a Fiorentino", "more D'Arienzo") */
export function findNames(text: string, cat: Catalog): NameHit[] {
  const idx = nameIndex(cat);
  const t = ` ${fold(text).replace(/[^a-z0-9 ]+/g, " ")} `;
  const out: NameHit[] = [];
  const seen = new Set<string>();
  for (const [k, v] of idx.orchestras)
    if (t.includes(` ${k} `) && !seen.has(v.orchestraId)) {
      seen.add(v.orchestraId);
      out.push({
        kind: "orchestra",
        orchestraId: v.orchestraId,
        name: v.name,
        word: k,
        n: cat.byOrchestra.get(v.orchestraId)?.length ?? 0,
      });
    }
  for (const [k, v] of idx.singers)
    if (t.includes(` ${k} `) && !seen.has(`s:${k}`)) {
      seen.add(`s:${k}`);
      const word = v.singer.split(/\s+/).at(-1) ?? v.singer;
      out.push({ kind: "singer", name: v.singer, word, n: v.n });
    }
  // "a Fiorentino": the singer of Troilo's orchestra (hundreds of sides) before his own later orchestra
  return out.sort((a, b) => b.n - a.n).slice(0, 4);
}
const singerMatches = (singer: string | null | undefined, want: string) =>
  !!singer && fold(singer).includes(fold(want).trim());

/* ---------- applying ---------- */

const TONE_STEP = 3;
type Applied = { playlist: Playlist; change: EditChange } | { reason: string };

function retuneInFamily(p: Playlist, i: number, dir: EditDirection, deps: ComposeDeps): Playlist | null {
  const sign = dir === "calmer" ? -1 : 1;
  const e0 = p.tandas[i]!.energy;
  let cur = p;
  const chairs = p.tandas[i]!.songs.map((s, k) => ({ k, e: s.energy ?? 50 })).sort(
    (a, b) => sign * (a.e - b.e),
  );
  for (const { k } of chairs) {
    if (sign * (cur.tandas[i]!.energy - e0) >= 6) break;
    const side = cur.tandas[i]!.songs[k]!;
    const opts = swapOptions(cur, i, k, deps, { limit: 30 }).suggestions.filter(
      (x) => sign * ((x.song.energy ?? 50) - (side.energy ?? 50)) >= TONE_STEP,
    );
    if (!opts.length) continue;
    const best = opts
      .map((x) => ({ x, v: (sign * ((x.song.energy ?? 50) - (side.energy ?? 50))) / 10 + x.fit }))
      .sort((a, b) => b.v - a.v)[0]!.x;
    const r = replaceSide(cur, i, k, best.song.id, deps);
    if (!r.reason) cur = r.playlist;
  }
  return sign * (cur.tandas[i]!.energy - e0) >= TONE_STEP ? cur : null;
}

/** the composer's own builder for slot `i`, restricted to `only`; the best of a few seeds that adds no fault */
function rebuildSlot(
  p: Playlist,
  i: number,
  deps: ComposeDeps,
  seed: number,
  only: (songs: Song[], c: { orchestraId: string; singer: string | null }) => boolean,
  o: { target?: number; allowSameOrchestra?: boolean; prefer?: (t: Tanda) => number } = {},
): Playlist | null {
  const t = p.tandas[i]!;
  const shell: Playlist = {
    ...p,
    tandas: p.tandas.map((x, j) =>
      j === i
        ? {
            ...x,
            ...(o.target !== undefined ? { targetEnergy: o.target } : {}),
            ...(o.allowSameOrchestra ? { orchestraId: "__slot__" } : {}),
          }
        : x,
    ),
  };
  const before = faultsOf(p);
  let best: Playlist | null = null;
  let bestV = -Infinity;
  for (let k = 0; k < 4; k++) {
    const q = swapTanda(shell, i, deps, seed + k * 7919, (c) => only(c.songs, c));
    if (q === shell || keyOf(q.tandas[i]!) === keyOf(t)) continue;
    const nt = q.tandas[i]!;
    // the composer's own builder made the tanda (its standard); the night may gain no fault
    if (faultsOf(q).some((f) => !before.includes(f))) continue;
    const v = o.prefer ? o.prefer(nt) : 0;
    if (v > bestV) {
      best = q;
      bestV = v;
    }
  }
  return best;
}

function applyOne(p: Playlist, op: NightEditOp, i: number, deps: ComposeDeps, seed: number): Applied {
  const t = p.tandas[i];
  if (!t) return { reason: `there is no tanda ${op.tanda}` };
  const n = i + 1;
  if (op.op === "lock") {
    const locked = op.locked ?? !t.locked;
    if (!locked && t.pinned) return { reason: `you kept tanda ${n} as is; unpin it in its menu first` };
    const tandas = p.tandas.map((x, j) => (j === i ? { ...x, locked: locked || undefined } : x));
    const np = { ...p, tandas };
    return {
      playlist: np,
      change: {
        op: "lock",
        tanda: n,
        line: `Tanda ${n} (${family(t)}) ${locked ? "locked: Regenerate keeps it" : "unlocked"}`,
        before: tandaBrief(t, i),
        after: tandaBrief(tandas[i]!, i),
      },
    };
  }
  if (t.pinned && op.op !== "move") return { reason: `you kept tanda ${n} as is; unpin it first` };
  if (op.op === "swap") {
    const k = op.position - 1;
    const old = t.songs[k];
    if (!old) return { reason: `tanda ${n} has ${t.songs.length} sides, not ${op.position}` };
    let id = op.songId;
    if (id) {
      const s = songById(deps.catalog, id);
      if (!s) return { reason: `"${id}" is not in the catalogue` };
      id = s.id;
    } else {
      const best = swapOptions(p, i, k, deps, { limit: 1 }).suggestions[0];
      if (!best) return { reason: `no other side keeps tanda ${n} valid` };
      id = best.song.id;
    }
    const r = replaceSide(p, i, k, id, deps);
    if (r.reason) return { reason: `${songById(deps.catalog, id)?.title ?? id}: ${r.reason}` };
    const nt = r.playlist.tandas[i]!;
    const s = nt.songs[k]!;
    return {
      playlist: r.playlist,
      change: {
        op: "swap",
        tanda: n,
        line: `Tanda ${n}, side ${op.position}: “${old.title}” → “${s.title}” (${s.year ?? "?"}, energy ${Math.round(s.energy ?? 50)})`,
        before: tandaBrief(t, i),
        after: tandaBrief(nt, i),
      },
    };
  }
  if (op.op === "retune") {
    const sign = op.direction === "calmer" ? -1 : 1;
    const within = retuneInFamily(p, i, op.direction, deps);
    const before = faultsOf(p);
    let np = within && !faultsOf(within).some((f) => !before.includes(f)) ? within : null;
    if (!np)
      np = rebuildSlot(
        p,
        i,
        deps,
        seed,
        (songs) => sign * (mean(songs.map((s) => s.energy ?? 50)) - t.energy) >= 5,
        { target: t.energy + sign * 12, prefer: (x) => sign * (x.energy - t.energy) },
      );
    if (!np || sign * (np.tandas[i]!.energy - t.energy) < TONE_STEP)
      return {
        reason: `no ${op.direction} sides or family keep tanda ${n} valid here (the orchestra gaps, the years and the sides already played)`,
      };
    const nt = np.tandas[i]!;
    const changed = nt.songs.filter((s) => !t.songs.some((x) => x.id === s.id)).length;
    const how =
      nt.orchestraId === t.orchestraId && sameSingerOrBoth(nt.singer, t.singer)
        ? `${changed} ${changed === 1 ? "side" : "sides"} changed`
        : `now ${family(nt)}`;
    return {
      playlist: np,
      change: {
        op: "retune",
        tanda: n,
        line: `Tanda ${n} ${op.direction}: energy ${Math.round(t.energy)} → ${Math.round(nt.energy)} (${how})`,
        before: tandaBrief(t, i),
        after: tandaBrief(nt, i),
      },
    };
  }
  if (op.op === "replace_tanda") {
    if (op.songIds?.length) {
      const songs: Song[] = [];
      for (const id of op.songIds) {
        const s = songById(deps.catalog, id);
        if (!s) return { reason: `"${id}" is not in the catalogue` };
        songs.push(s);
      }
      if (songs.length < 2 || songs.length > 5) return { reason: "a tanda holds 3 to 5 sides" };
      if (new Set(songs.map((s) => s.orchestraId)).size > 1)
        return { reason: "a tanda is one orchestra; those sides come from several" };
      if (songs.some((s) => s.rhythm !== t.rhythm))
        return { reason: `tanda ${n} is a ${t.rhythm} chair; every side must be a ${t.rhythm}` };
      const rest = p.tandas.flatMap((x, j) => (j === i ? [] : x.songs));
      const used = new Set(rest.map((s) => s.id));
      const titles = new Set(rest.map((s) => normTitle(s.title)));
      for (const s of songs) {
        if (used.has(s.id) || titles.has(normTitle(s.title)))
          return { reason: `“${s.title}” already plays tonight` };
        if (!isTandaEligible(s, !!p.options.rules?.allowUndated))
          return { reason: `“${s.title}” is not a dated studio side` };
        if (!isDanceableSong(s, deps.catalog.blacklist)) return { reason: `“${s.title}” is not for dancing` };
      }
      const s0 = songs[0]!;
      const shell: Tanda = {
        ...t,
        orchestra: s0.orchestra,
        orchestraId: s0.orchestraId,
        singer: songs.find((s) => s.singer)?.singer ?? null,
        vocal: songs.some((s) => s.vocal),
        era: s0.era,
      };
      const nt = retimeTanda(shell, songs);
      const probs = tandaProblems(nt, p.options);
      if (probs.length) return { reason: `those sides break the tanda rules (${probs[0]!.detail})` };
      const np = renight(
        p,
        p.tandas.map((x, j) => (j === i ? nt : x)),
      );
      const before = faultsOf(p);
      const added = faultsOf(np).find((f) => !before.includes(f));
      if (added) return { reason: explainFault(added, np) };
      return {
        playlist: np,
        change: {
          op: "replace_tanda",
          tanda: n,
          line: `Tanda ${n}: ${family(t)} → ${family(nt)} (${yrs(nt)}, energy ${Math.round(nt.energy)})`,
          before: tandaBrief(t, i),
          after: tandaBrief(nt, i),
        },
      };
    }
    if (op.orchestraId && !deps.catalog.byOrchestra.has(op.orchestraId))
      return { reason: `"${op.orchestraId}" is not an orchestra in the catalogue` };
    const sign = op.direction === "calmer" ? -1 : op.direction === "livelier" ? 1 : 0;
    const sameOrch = !!op.orchestraId && op.orchestraId === t.orchestraId;
    const np = rebuildSlot(
      p,
      i,
      deps,
      seed,
      (songs, c) =>
        (!op.orchestraId || c.orchestraId === op.orchestraId) &&
        (!op.singer || singerMatches(c.singer, op.singer)) &&
        (!sign || sign * (mean(songs.map((s) => s.energy ?? 50)) - t.energy) >= 5) &&
        !(c.orchestraId === t.orchestraId && sameSingerOrBoth(c.singer, t.singer)),
      {
        allowSameOrchestra: sameOrch || (!op.orchestraId && !!op.singer),
        ...(sign ? { target: t.energy + sign * 12, prefer: (x: Tanda) => sign * (x.energy - t.energy) } : {}),
      },
    );
    if (!np) {
      const who = op.orchestraId
        ? `${deps.catalog.byOrchestra.get(op.orchestraId)?.[0]?.orchestra ?? op.orchestraId}${op.singer ? ` / ${op.singer}` : ""}`
        : (op.singer ?? "another");
      const near = p.tandas.findIndex(
        (x, j) =>
          j !== i &&
          Math.abs(j - i) < (p.options.orchestraRepeatGap ?? 6) &&
          ((op.orchestraId && x.orchestraId === op.orchestraId) ||
            (op.singer && singerMatches(x.singer, op.singer))),
      );
      return {
        reason:
          near >= 0
            ? `${who} already plays in tanda ${near + 1}; it returns after ${p.options.orchestraRepeatGap ?? 6} tandas`
            : `no ${who} ${t.rhythm} tanda keeps tanda ${n} valid tonight (the era, the year band, the sides already played)`,
      };
    }
    const nt = np.tandas[i]!;
    return {
      playlist: np,
      change: {
        op: "replace_tanda",
        tanda: n,
        line: `Tanda ${n}: ${family(t)} → ${family(nt)} (${yrs(nt)}, energy ${Math.round(nt.energy)})`,
        before: tandaBrief(t, i),
        after: tandaBrief(nt, i),
      },
    };
  }
  return { reason: "unknown edit" };
}
const sameSingerOrBoth = (a: string | null | undefined, b: string | null | undefined) =>
  (!a && !b) || sameSinger(a, b);

/** move or trade tandas so the rhythm cycle stays; slot plans (target energy, phase) stay with their positions */
function applyMove(p: Playlist, from: number, to: number): Applied {
  const n = p.tandas.length;
  if (from < 0 || from >= n) return { reason: `there is no tanda ${from + 1}` };
  if (to < 0 || to >= n) return { reason: `there is no position ${to + 1}` };
  if (from === to) return { reason: `tanda ${from + 1} is already there` };
  const rh = (ts: Tanda[]) => ts.map((t) => t.rhythm).join(",");
  const moved = p.tandas.slice();
  const [x] = moved.splice(from, 1);
  moved.splice(to, 0, x!);
  let tandas = moved;
  let traded = false;
  if (rh(moved) !== rh(p.tandas)) {
    const tr = p.tandas.slice();
    [tr[from], tr[to]] = [tr[to]!, tr[from]!];
    if (rh(tr) !== rh(p.tandas))
      return {
        reason: `a ${p.tandas[from]!.rhythm} in a ${p.tandas[to]!.rhythm} chair would break the night's rhythm cycle`,
      };
    tandas = tr;
    traded = true;
  }
  // the plan of each position stays (the arc's target, the phase, the peak)
  tandas = tandas.map((t, k) => ({
    ...t,
    index: k,
    targetEnergy: p.tandas[k]!.targetEnergy,
    phase: p.tandas[k]!.phase,
    peak: p.tandas[k]!.peak,
  }));
  const np = renight(p, tandas);
  const before = faultsOf(p);
  const added = faultsOf(np).find((f) => !before.includes(f));
  if (added) return { reason: explainFault(added, np) };
  const t = p.tandas[from]!;
  return {
    playlist: np,
    change: {
      op: "move",
      tanda: to + 1,
      line: traded
        ? `Tandas ${from + 1} and ${to + 1} traded places (a move would break the rhythm cycle)`
        : `Tanda ${from + 1} (${family(t)}) moved to ${to + 1}`,
      before: tandaBrief(t, from),
      after: tandaBrief(np.tandas[to]!, to),
    },
  };
}

/**
 * Apply the edits one by one. Tanda numbers are the night as the DJ saw it when asking (a move earlier in the batch
 * does not renumber the later edits); each edit is checked on its own and refused with a reason, never forced.
 */
export function applyNightEdits(
  p: Playlist,
  ops: NightEditOp[],
  deps: ComposeDeps,
  opts: { seed?: number } = {},
): EditOutcome {
  const seed = opts.seed ?? (p.options.seed ?? 1) + 22;
  let cur = p;
  /** origin[k] = the original index of the tanda now at k (a replaced tanda keeps its slot's origin) */
  let origin = p.tandas.map((_, k) => k);
  const applied: EditChange[] = [];
  const rejected: EditOutcome["rejected"] = [];
  for (const op of ops) {
    const i = origin.indexOf(op.tanda - 1);
    if (i < 0) {
      rejected.push({ op, reason: `there is no tanda ${op.tanda}` });
      continue;
    }
    const r =
      op.op === "move" ? applyMove(cur, i, op.to - 1) : applyOne(cur, op, i, deps, seed + applied.length);
    if ("reason" in r) {
      rejected.push({ op, reason: r.reason });
      continue;
    }
    if (op.op === "move") {
      // keep the origin map in step with the permutation the move made
      const keys = cur.tandas.map(keyOf);
      origin = r.playlist.tandas.map((t) => origin[keys.indexOf(keyOf(t))]!);
    }
    cur = r.playlist;
    applied.push(r.change);
  }
  return { playlist: cur, applied, rejected };
}

/* ---------- the model's context ---------- */

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
/** one line per tanda: the night as the model needs it to understand "tanda 7" or "the second vals" */
export function nightSummary(p: Playlist): string {
  const L = [
    `Night: ${p.options.hours} h · ${p.tandas.length} tandas · score ${p.score?.total ?? "?"} · orchestra gap ${p.options.orchestraRepeatGap ?? 6}`,
  ];
  p.tandas.forEach((t, i) => {
    L.push(
      `T${i + 1} ${t.rhythm} · ${family(t)} · ${yrs(t) || "?"} · energy ${Math.round(t.energy)} (plan ${Math.round(t.targetEnergy)})${t.locked ? " · locked" : ""}${t.pinned ? " · kept by the DJ" : ""}: ${t.songs
        .map((s, k) => `${k + 1} ${clip(s.title, 26)} (${s.year ?? "?"}, e${Math.round(s.energy ?? 50)})`)
        .join(" | ")}`,
    );
  });
  return L.join("\n");
}

const ORDINAL: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  opening: 1,
};
const ORD_RE = `(?:\\d{1,2}(?:st|nd|rd|th)?|${Object.keys(ORDINAL).join("|")}|last)`;
const ordinal = (w: string | undefined, last: number): number | null => {
  if (!w) return null;
  const x = w.toLowerCase();
  if (x === "last") return last;
  if (ORDINAL[x]) return ORDINAL[x]!;
  const n = Number.parseInt(x, 10);
  return Number.isFinite(n) ? n : null;
};
/** the tanda numbers a request names ("tanda 7", "the 7th tanda", "T7", "the last tanda") */
export function mentionedTandas(text: string, total: number): number[] {
  const out: number[] = [];
  const add = (n: number | null) => {
    if (n && n >= 1 && n <= total && !out.includes(n)) out.push(n);
  };
  for (const m of text.matchAll(new RegExp(`\\btandas?\\s*(?:#|no\\.?|number)?\\s*(${ORD_RE})\\b`, "gi")))
    add(ordinal(m[1], total));
  for (const m of text.matchAll(new RegExp(`\\b(${ORD_RE})\\s+tanda\\b`, "gi"))) add(ordinal(m[1], total));
  for (const m of text.matchAll(/\bT(\d{1,2})\b/g)) add(Number(m[1]));
  for (const m of text.matchAll(/\btandas?\s+\d{1,2}\s*(?:,|and|&)\s*(\d{1,2})\b/gi)) add(Number(m[1]));
  return out.slice(0, 4);
}

const sideLine = (s: Song) =>
  `${s.id} “${clip(s.title, 30)}” ${s.year ?? "?"} e${Math.round(s.energy ?? 50)}${s.singer ? ` ${s.singer}` : ""}`;
const usable = (s: Song, deps: ComposeDeps) =>
  !!s.spotify?.uri &&
  isTandaEligible(s, false) &&
  isDanceableSong(s, deps.catalog.blacklist) &&
  normTitle(s.title) !== "la cumparsita";

/**
 * The candidate sides the model may name, with their catalogue ids: for each tanda the request mentions, the valid
 * replacements of each chair (the Swap sheet's own list); for each orchestra or singer it names, that family's best
 * sides. Small on purpose: a few kilobytes, and every id in `ids` is a catalogue id.
 */
export function editCandidates(
  p: Playlist,
  deps: ComposeDeps,
  instruction: string,
): { text: string; ids: Set<string>; tandas: number[]; names: NameHit[] } {
  const ids = new Set<string>();
  const L: string[] = [];
  const tandas = mentionedTandas(instruction, p.tandas.length);
  for (const n of tandas.slice(0, 3)) {
    const t = p.tandas[n - 1]!;
    L.push(`Valid replacements in T${n} (${t.rhythm}, ${family(t)}):`);
    t.songs.forEach((cur, k) => {
      const sug = swapOptions(p, n - 1, k, deps, { limit: 4 }).suggestions;
      for (const x of sug) ids.add(x.song.id);
      L.push(
        `  T${n}.${k + 1} now “${clip(cur.title, 26)}” e${Math.round(cur.energy ?? 50)} → ${sug.length ? sug.map((x) => sideLine(x.song)).join("; ") : "none"}`,
      );
    });
  }
  const names = findNames(instruction, deps.catalog);
  const rhythms = new Set<DanceRhythm>(tandas.map((n) => p.tandas[n - 1]!.rhythm));
  if (!rhythms.size) rhythms.add("tango");
  const used = new Set(p.tandas.flatMap((t) => t.songs.map((s) => s.id)));
  for (const h of names.slice(0, 3)) {
    const pool = (
      h.orchestraId
        ? (deps.catalog.byOrchestra.get(h.orchestraId) ?? [])
        : deps.catalog.songs.filter((s) => singerMatches(s.singer, h.word))
    ).filter((s) => rhythms.has(s.rhythm as DanceRhythm) && !used.has(s.id) && usable(s, deps));
    const fams = new Map<string, Song[]>();
    for (const s of pool) {
      const k = `${s.orchestraId}|${s.singer ?? ""}|${s.rhythm}`;
      fams.set(k, [...(fams.get(k) ?? []), s]);
    }
    const top = [...fams.values()].sort((a, b) => b.length - a.length).slice(0, 3);
    if (!top.length) {
      L.push(`${h.name}: no free ${[...rhythms].join("/")} sides tonight`);
      continue;
    }
    for (const f of top) {
      const s0 = f[0]!;
      const best = f.sort((a, b) => (b.fame ?? 0) - (a.fame ?? 0)).slice(0, 4);
      for (const s of best) ids.add(s.id);
      const ys = f.map((s) => s.year ?? 0).filter(Boolean);
      L.push(
        `${s0.orchestra} (orchestraId ${s0.orchestraId})${s0.singer ? ` / ${s0.singer}` : " instrumental"} · ${s0.rhythm} · ${f.length} sides ${ys.length ? `${Math.min(...ys)}–${Math.max(...ys)}` : ""}: ${best.map(sideLine).join("; ")}`,
      );
    }
  }
  return { text: L.join("\n"), ids, tandas, names };
}

/* ---------- the plain-words fallback ---------- */

const CALM_RE =
  /\b(calm|calmer|softer|quieter|gentler|slower|mellower|relaxed|less (?:energ|intense|strong|rhythm)|lower(?: the)? energy|romantic|lyrical|smoother)/i;
const LIVE_RE =
  /\b(livelier|lively|more energ|energetic|stronger|faster|punchier|upbeat|more rhythm|rhythmic|higher(?: the)? energy|lift|brighter|more drive|peppier)/i;

/**
 * Without a model: "make tanda 7 calmer", "lock tanda 3", "move tanda 4 to 1", "swap tanda 2 and 4", "swap the 2nd
 * song of tanda 5 for a Fiorentino", "replace tanda 6 with a Pugliese". What it does not understand is returned in
 * `unparsed` and said to the DJ.
 */
export function parseEditCommand(
  text: string,
  p: Playlist,
  deps: ComposeDeps,
): { ops: NightEditOp[]; unparsed: string[] } {
  const ops: NightEditOp[] = [];
  const unparsed: string[] = [];
  const total = p.tandas.length;
  const frags = text
    .split(/\s*(?:;|\.\s|,\s*(?:and\s+)?then\b|\bthen\b|\balso\b|,)\s*/i)
    .map((f) => f.trim())
    .filter(Boolean);
  const tandaRef = `(?:tanda\\s*(${ORD_RE})|(?:the\\s+)?(${ORD_RE})\\s+tanda)`;
  for (const f of frags) {
    const before = ops.length;
    const trade = f.match(
      /\b(?:swap|switch|trade|exchange)\s+(?:the\s+)?tandas?\s*(\d{1,2})\s*(?:and|&|with)\s*(?:tanda\s*)?(\d{1,2})\b/i,
    );
    if (trade) {
      const a = Number(trade[1]),
        b = Number(trade[2]);
      if (a >= 1 && b >= 1 && a <= total && b <= total && a !== b)
        ops.push({ op: "move", tanda: a, to: b }, { op: "move", tanda: b, to: a });
      if (ops.length > before) continue;
    }
    const mv = f.match(
      new RegExp(
        `\\bmove\\s+(?:the\\s+)?${tandaRef}\\s+(to|after|before)\\s+(?:position\\s+|tanda\\s+)?(${ORD_RE})`,
        "i",
      ),
    );
    if (mv) {
      const from = ordinal(mv[1] ?? mv[2], total)!;
      const at = ordinal(mv[4], total)!;
      let to = at;
      if (mv[3]!.toLowerCase() === "after") to = from < at ? at : at + 1;
      if (mv[3]!.toLowerCase() === "before") to = from < at ? at - 1 : at;
      if (from && to >= 1 && to <= total) ops.push({ op: "move", tanda: from, to });
      if (ops.length > before) continue;
    }
    const nums = mentionedTandas(f, total);
    const lk = f.match(/\b(un)?(?:lock|pin|freeze)\b/i);
    if (lk && nums.length && !/\b(swap|replace|move)\b/i.test(f)) {
      for (const n of nums) ops.push({ op: "lock", tanda: n, locked: !lk[1] });
      continue;
    }
    const side = f.match(
      new RegExp(
        `\\b(?:swap|replace|change)\\s+(?:the\\s+)?(${ORD_RE})\\s+(?:song|side|track|one)\\s+(?:of|in|from|on)\\s+(?:the\\s+)?${tandaRef}(?:\\s+(?:for|with|to|by)\\s+(?:an?\\s+|some\\s+|the\\s+)?(.+))?`,
        "i",
      ),
    );
    if (side) {
      const n = ordinal(side[2] ?? side[3], total);
      const t = n ? p.tandas[n - 1] : undefined;
      const pos = t ? ordinal(side[1], t.songs.length) : null;
      if (t && n && pos && pos <= t.songs.length) {
        const want = side[4]?.trim();
        if (!want) {
          ops.push({ op: "swap", tanda: n, position: pos });
          continue;
        }
        const hit = findNames(want, deps.catalog)[0];
        const fits =
          hit &&
          ((hit.kind === "orchestra" && hit.orchestraId === t.orchestraId) ||
            (hit.kind === "singer" && singerMatches(t.singer, hit.word)));
        if (hit && !fits) {
          ops.push({
            op: "replace_tanda",
            tanda: n,
            ...(hit.kind === "orchestra" ? { orchestraId: hit.orchestraId } : { singer: hit.word }),
          });
          continue;
        }
        const opts = swapOptions(p, n - 1, pos - 1, deps, { limit: 12, query: hit ? undefined : want });
        const pick = hit ? opts.suggestions[0] : (opts.results.find((x) => x.ok) ?? opts.suggestions[0]);
        if (pick) ops.push({ op: "swap", tanda: n, position: pos, songId: pick.song.id });
        else ops.push({ op: "swap", tanda: n, position: pos });
        continue;
      }
    }
    const rep = f.match(
      new RegExp(
        `\\b(?:replace|change|swap|make)\\s+(?:the\\s+)?${tandaRef}\\s+(?:for|with|to|by|into|a|an)\\s+(?:an?\\s+)?(.+)`,
        "i",
      ),
    );
    if (rep && !CALM_RE.test(rep[3]!) && !LIVE_RE.test(rep[3]!)) {
      const n = ordinal(rep[1] ?? rep[2], total);
      const hit = findNames(rep[3]!, deps.catalog)[0];
      if (n && hit) {
        ops.push({
          op: "replace_tanda",
          tanda: n,
          ...(hit.kind === "orchestra" ? { orchestraId: hit.orchestraId } : { singer: hit.word }),
        });
        continue;
      }
    }
    if (nums.length && (CALM_RE.test(f) || LIVE_RE.test(f))) {
      const direction: EditDirection = CALM_RE.test(f) ? "calmer" : "livelier";
      for (const n of nums) ops.push({ op: "retune", tanda: n, direction });
      continue;
    }
    unparsed.push(f);
  }
  return { ops, unparsed };
}
