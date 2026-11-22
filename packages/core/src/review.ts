import { lastFourKept, lastFourTangoBypass } from "./bypass";
import { bigFourProblems, isBigFour, tandaRulesOf } from "./coherence";
import type { ComposeDeps } from "./compose";
import { closingFormatOf, cortinaBeforeClosing, cumparsitaPlacement, isCumparsita } from "./cumparsita";
import { normTitle } from "./energy";
import {
  applyGuideFix,
  closingSuggestion,
  type EditResult,
  type GuideFix,
  maxTangoRun,
  openingSuggestion,
  removeSong,
  reorderTandas,
} from "./insert";
import { renight, retimeTanda } from "./swap";
import { isTandaEligible } from "./tanda";
import type { ComposeOptions, DanceRhythm, Playlist, Song, Tanda } from "./types";

/**
 * 2026-11 — "Import a night" review (the owner: "when added to Compose or the Booth, the AI should check it and make
 * suggestions for change: in Compose more detailed suggestions, in the Booth only the most important ones; if the
 * order doesn't match, suggest a reorder; suggestions follow the settings the user set in Compose").
 *
 * `reviewNight` reads a night (an imported one, the DJ's tandas pinned as theirs, or any other) against the night
 * rules — the night's own, or the DJ's Compose settings passed as `settings` (`withNightRules`) — and returns findings
 * in plain words, most important first, each with a one-tap fix where one exists:
 *
 *   tanda coherence (one finding per side, the first rule it breaks): another rhythm (blocker), another orchestra
 *     (high, unless the night allows mixed vals / milonga tandas), an instrumental side in a sung tanda or the reverse
 *     (high, when the tanda rules keep one voice), another singer (medium), a year far from the others (medium). The
 *     fix is another recording that fits — the same work by the tanda's orchestra first (its singer, its voice, inside
 *     the tanda's years: a "safe" fix), else another side of the tanda's family;
 *   the order: two vals / milonga tandas back to back (high), more tango tandas in a row than the rhythm cycle plays
 *     (medium), a vals / milonga among the last four when the DJ's "last four tandas tango" is on (high), the same
 *     orchestra twice in a row (medium), two big-four tandas back to back (low), an energy jump (low). A reorder
 *     (`suggestReorder`) fixes what it can without a new fault, moving the fewest tandas, and is shown as a diff;
 *   cortinas and La Cumparsita: a gap with no cortina (high), the closing format's cortina before La Cumparsita
 *     (medium) or one too many (low), no closing La Cumparsita when the night closes with one (high), no opening one
 *     when it opens with one (low), a tanda of an unusual size (low).
 *
 * `level: "booth"` keeps the blockers and high findings only (the Booth's banner is never noisy), and `fixedBefore`
 * drops what concerns the tandas that have played or play now (mid-night nothing that has started moves or changes).
 * Pure and deterministic: the same night, settings and level give the same review.
 */

export type ReviewSeverity = "blocker" | "high" | "medium" | "low";
export const REVIEW_SEVERITIES: readonly ReviewSeverity[] = ["blocker", "high", "medium", "low"];
const RANK: Record<ReviewSeverity, number> = { blocker: 0, high: 1, medium: 2, low: 3 };

export type ReviewKind =
  | "rhythm"
  | "orchestra"
  | "voice"
  | "singer"
  | "years"
  | "cycle"
  | "tangoRun"
  | "lastFour"
  | "repeat"
  | "bigFour"
  | "energy"
  | "cortina"
  | "closingCortina"
  | "closing"
  | "opening"
  | "size";

/** a review fix: another recording in a chair, a side out, the tandas in a new order, or an edit guide's fix */
export type ReviewFix =
  | { kind: "side"; tanda: number; side: number; songId: string }
  | { kind: "removeSide"; tanda: number; side: number }
  | { kind: "order"; order: number[] }
  | { kind: "guide"; fix: GuideFix };

export interface ReviewMessage {
  /** an i18n key (web: review.*) with its values */
  key: string;
  params: Record<string, string | number>;
}
export interface ReviewFinding {
  /** stable across reviews of the same night: what, where and which recording (an "Ignore" remembers it) */
  id: string;
  kind: ReviewKind;
  severity: ReviewSeverity;
  /** 0-based tanda (null: the night) */
  tanda: number | null;
  /** 0-based side of the tanda (null: the tanda or the night) */
  side: number | null;
  message: ReviewMessage;
  /** the English line */
  text: string;
  fix?: {
    message: ReviewMessage;
    text: string;
    fix: ReviewFix;
    /** keeps everything else as it is (the same work in another recording, a cortina, a La Cumparsita): "Apply all
     * safe fixes" applies it; a reorder or a side of another work is the DJ's call, one by one */
    safe: boolean;
  };
}
export interface ReorderMove {
  /** the tanda (its place in the night as given, 0-based) */
  tanda: number;
  from: number;
  to: number;
}
export interface ReorderSuggestion {
  /** order[k] = the tanda (index in the night as given) that plays at place k */
  order: number[];
  /** the tandas that change place, in their new order */
  moves: ReorderMove[];
  /** the order faults now and after (the weighted cost `orderCost`) */
  before: number;
  after: number;
  message: ReviewMessage;
  text: string;
}
export interface NightReview {
  findings: ReviewFinding[];
  reorder: ReorderSuggestion | null;
  counts: Record<ReviewSeverity, number>;
}
export interface ReviewOptions {
  /** "booth": the blockers and high findings only (default "compose": every finding) */
  level?: "compose" | "booth";
  /** the first tanda that has not started (the Booth mid-night): nothing before it is reported or moved */
  fixedBefore?: number;
  /** the DJ's night rules (the Compose settings) over the night's own */
  settings?: Partial<ComposeOptions>;
}

/** the settings a review follows (the Compose tab's night and tanda rules) */
export const REVIEW_SETTING_KEYS = [
  "pattern",
  "customPattern",
  "rules",
  "tandaRules",
  "mixVocalInstrumental",
  "maxYearSpread",
  "orchestraRepeatGap",
  "cortinaStyle",
  "closeWithCumparsita",
  "tangoTandaSize",
  "valsTandaSize",
  "milongaTandaSize",
] as const satisfies ReadonlyArray<keyof ComposeOptions>;

/** the night with the DJ's night rules over its own (the night rules and tanda rules merged key by key) */
export function withNightRules(p: Playlist, settings?: Partial<ComposeOptions>): Playlist {
  if (!settings) return p;
  const o: ComposeOptions = { ...p.options };
  for (const k of REVIEW_SETTING_KEYS) {
    const v = settings[k];
    if (v === undefined) continue;
    if (k === "rules" || k === "tandaRules")
      (o as unknown as Record<string, unknown>)[k] = { ...(p.options[k] ?? {}), ...(v as object) };
    else (o as unknown as Record<string, unknown>)[k] = v;
  }
  return { ...p, options: o };
}

/* ---------- helpers ---------- */

const fill = (s: string, params: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? ""));
const msg = (key: string, english: string, params: Record<string, string | number>) => ({
  message: { key: `review.${key}`, params },
  text: fill(english, params),
});
const yearOf = (s: Pick<Song, "year" | "yearApprox">) => (s.year && !s.yearApprox ? s.year : null);
/** the most frequent value (ties: the first one met), or undefined */
function mode<T>(xs: readonly T[]): T | undefined {
  const m = new Map<T, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  let best: T | undefined;
  let n = 0;
  for (const [k, v] of m) if (v > n) [best, n] = [k, v];
  return best;
}
/** the spread cap a tanda's years keep (coherence.ts: vocal tango 2, instrumental tango 3, vals / milonga 2) */
const capOf = (rhythm: string, vocal: boolean, maxYearSpread: number) =>
  Math.min(rhythm === "tango" ? (vocal ? 2 : 3) : 2, maxYearSpread);
const titleOf = (s: Pick<Song, "title">) => s.title;
const sizeFor = (o: ComposeOptions, r: DanceRhythm) =>
  r === "tango" ? (o.tangoTandaSize ?? 4) : r === "vals" ? (o.valsTandaSize ?? 3) : (o.milongaTandaSize ?? 3);

/** what a chair of a tanda wants: the tanda's majority rhythm, orchestra, voice, singer and years */
interface Want {
  rhythm: DanceRhythm;
  orchestraId: string;
  orchestra: string;
  vocal: boolean;
  singerId: string | null;
  singer: string | null;
  /** the years window most sides sit in (null: unknown) */
  years: [number, number] | null;
}

/**
 * The tanda's family as most of its sides have it, and the side that breaks it first (rhythm, orchestra, voice,
 * singer, years). A majority needs more than half the sides; with no majority the tanda's own header decides.
 */
function tandaWant(
  t: Tanda,
  o: ComposeOptions,
): {
  want: Want;
  odd: Map<number, ReviewKind>;
  split: boolean;
  /** as many sung sides as instrumental ones: no side is the odd one, the tanda is */
  voiceSplit: { sung: number; instrumental: number } | null;
} {
  const idx = t.songs.map((_, k) => k).filter((k) => !isCumparsita(t.songs[k]));
  const ss = idx.map((k) => t.songs[k]!);
  const rules = tandaRulesOf(o);
  const major = <T>(get: (s: Song) => T, fallback: T, among = ss): T => {
    const m = mode(among.map(get));
    const n = among.filter((s) => get(s) === m).length;
    return m !== undefined && n * 2 > among.length ? m : fallback;
  };
  const rhythm = major((s) => s.rhythm as DanceRhythm, t.rhythm);
  const inRhythm = ss.filter((s) => s.rhythm === rhythm);
  const orchestraId = major((s) => s.orchestraId, t.orchestraId, inRhythm);
  const orchestra = ss.find((s) => s.orchestraId === orchestraId)?.orchestra ?? t.orchestra;
  const own = inRhythm.filter((s) => s.orchestraId === orchestraId);
  const vocal = major((s) => !!s.vocal, t.vocal, own);
  const sung = own.filter((s) => s.vocal && s.singerId);
  const singerId = vocal ? major((s) => s.singerId ?? null, null as string | null, sung) : null;
  const singer = singerId ? (sung.find((s) => s.singerId === singerId)?.singer ?? null) : null;
  const nSung = own.filter((s) => s.vocal).length;
  const voiceSplit =
    rules.voice && own.length >= 2 && nSung * 2 === own.length
      ? { sung: nSung, instrumental: own.length - nSung }
      : null;
  const odd = new Map<number, ReviewKind>();
  for (const k of idx) {
    const s = t.songs[k]!;
    if (s.rhythm !== rhythm) odd.set(k, "rhythm");
    else if (s.orchestraId !== orchestraId) {
      if (!(o.rules?.mixedMilongaVals && rhythm !== "tango")) odd.set(k, "orchestra");
    } else if (rules.voice && !voiceSplit && !!s.vocal !== vocal) odd.set(k, "voice");
    else if (vocal && singerId && s.vocal && s.singerId && s.singerId !== singerId) odd.set(k, "singer");
  }
  // the years: the window of the cap that holds the most sides (of those that fit the family)
  const fits = idx.filter((k) => !odd.has(k));
  const ys = fits
    .map((k) => ({ k, y: yearOf(t.songs[k]!) }))
    .filter((x): x is { k: number; y: number } => !!x.y);
  const cap = capOf(rhythm, vocal, o.maxYearSpread ?? 4);
  let years: [number, number] | null = null;
  let split = false;
  if (ys.length) {
    const sorted = [...new Set(ys.map((x) => x.y))].sort((a, b) => a - b);
    let best: { lo: number; n: number } | null = null;
    for (const lo of sorted) {
      const n = ys.filter((x) => x.y >= lo && x.y <= lo + cap).length;
      if (!best || n > best.n) best = { lo, n };
    }
    years = [best!.lo, best!.lo + cap];
    // the window's actual years
    const inW = ys.filter((x) => x.y >= years![0] && x.y <= years![1]).map((x) => x.y);
    years = [Math.min(...inW), Math.max(...inW)];
    if (best!.n * 2 > ys.length) {
      for (const x of ys) if (x.y < best!.lo || x.y > best!.lo + cap) odd.set(x.k, "years");
    } else if (ys.length > 1 && Math.max(...ys.map((x) => x.y)) - Math.min(...ys.map((x) => x.y)) > cap)
      split = true;
  }
  return {
    want: { rhythm, orchestraId, orchestra, vocal, singerId, singer, years },
    odd,
    split,
    voiceSplit,
  };
}

/**
 * Another recording for chair `si` of tanda `ti` that fits the tanda's family: the same work first (safe), else
 * another side of the family; inside the tanda's years, not in the night, a dated studio side. Null when none fits.
 */
function sideFix(
  p: Playlist,
  ti: number,
  si: number,
  want: Want,
  deps: ComposeDeps,
): { song: Song; safe: boolean } | null {
  const t = p.tandas[ti]!;
  const cur = t.songs[si]!;
  const used = new Set(p.tandas.flatMap((x) => x.songs.map((s) => s.id)));
  const titles = new Set(
    p.tandas.flatMap((x, i) =>
      x.songs.filter((_, k) => !(i === ti && k === si)).map((s) => normTitle(s.title)),
    ),
  );
  const work = normTitle(cur.title);
  const allowUndated = !!p.options.rules?.allowUndated;
  const dist = (y: number | null) =>
    !want.years || !y ? 0 : Math.max(0, want.years[0] - y, y - want.years[1]);
  const cap = capOf(want.rhythm, want.vocal, p.options.maxYearSpread ?? 4);
  const pool = deps.catalog.songs.filter(
    (s) =>
      s.orchestraId === want.orchestraId &&
      s.rhythm === want.rhythm &&
      !!s.vocal === want.vocal &&
      (!want.vocal || !want.singerId || s.singerId === want.singerId) &&
      !used.has(s.id) &&
      !isCumparsita(s) &&
      isTandaEligible(s, allowUndated) &&
      (normTitle(s.title) === work || !titles.has(normTitle(s.title))) &&
      // inside the window the tanda keeps (the cap counted from either end of the other sides' years)
      (!want.years ||
        !yearOf(s) ||
        Math.max(want.years[1], yearOf(s)!) - Math.min(want.years[0], yearOf(s)!) <= cap),
  );
  const ranked = pool
    .map((s) => ({ s, same: normTitle(s.title) === work, d: dist(yearOf(s)) }))
    .sort(
      (a, b) =>
        Number(b.same) - Number(a.same) ||
        a.d - b.d ||
        Number(!!b.s.spotify?.uri) - Number(!!a.s.spotify?.uri) ||
        (b.s.fame ?? 0) - (a.s.fame ?? 0) ||
        a.s.id.localeCompare(b.s.id),
    );
  const best = ranked[0];
  return best ? { song: best.s, safe: best.same } : null;
}

/* ---------- the order ---------- */

interface OrderCtx {
  o: ComposeOptions;
  maxRun: number;
  lastFour: boolean;
  closes: boolean;
}
const orderCtx = (o: ComposeOptions): OrderCtx => ({
  o,
  maxRun: maxTangoRun(o),
  lastFour: !!o.rules?.lastFourTango,
  closes: cumparsitaPlacement(o).close,
});

/** the order faults the reorder weighs: rhythm cycle, the last four tango, repeats, the big four, the última */
function orderFaults(
  tandas: ReadonlyArray<Pick<Tanda, "rhythm" | "orchestraId" | "orchestra">>,
  c: OrderCtx,
) {
  const n = tandas.length;
  const adjacent: number[] = [];
  const runs: Array<[number, number]> = [];
  const repeat: number[] = [];
  for (let i = 1; i < n; i++) {
    if (tandas[i - 1]!.rhythm !== "tango" && tandas[i]!.rhythm !== "tango") adjacent.push(i);
    if (tandas[i - 1]!.orchestraId === tandas[i]!.orchestraId) repeat.push(i);
  }
  const lastFour = c.lastFour
    ? [...lastFourTangoBypass(tandas as Array<Pick<Tanda, "rhythm">>)].sort((a, b) => a - b)
    : [];
  // (the last-four-tango rule ends the night on a run of tangos: that run is the rule, not a fault)
  const tail = c.lastFour ? n - 4 : n;
  let start = 0;
  for (let i = 0; i <= n; i++) {
    if (i < n && tandas[i]!.rhythm === "tango") continue;
    const end = i - 1;
    const len = i - start;
    const excused = c.lastFour && end === n - 1 && start <= tail ? 4 : 0;
    if (len - excused > c.maxRun + 1) runs.push([start, end]);
    start = i + 1;
  }
  const big4 = bigFourProblems(tandas as Array<Pick<Tanda, "orchestraId" | "orchestra">>, c.o)
    .filter((f) => f.kind === "adjacent")
    .map((f) => f.tanda);
  const ultima = c.closes && n > 0 && tandas[n - 1]!.rhythm !== "tango";
  // (a night opens on a tango tanda: a vals or a milonga first is a fault the reorder avoids)
  const opener = n > 1 && tandas[0]!.rhythm !== "tango";
  return { adjacent, runs, repeat, lastFour, big4, ultima, opener };
}

/** the weighted order faults of a night (0: nothing to reorder) */
export function nightOrderCost(
  tandas: ReadonlyArray<Pick<Tanda, "rhythm" | "orchestraId" | "orchestra">>,
  o: ComposeOptions,
): number {
  return costOf(orderFaults(tandas, orderCtx(o)));
}
const costOf = (f: ReturnType<typeof orderFaults>) =>
  f.adjacent.length * 100 +
  f.lastFour.length * 100 +
  f.runs.length * 40 +
  f.repeat.length * 30 +
  (f.ultima ? 20 : 0) +
  (f.opener ? 25 : 0) +
  f.big4.length * 8;

/**
 * The order that ends the night's order faults (two vals / milonga tandas back to back, a tango run longer than the
 * cycle, a vals / milonga among the last four when the rule is on, an orchestra twice in a row) without a new one,
 * moving as few tandas as it can: a deterministic descent over single moves and swaps of the tandas from
 * `fixedBefore` on. Null when the order has none of these faults or no order does better.
 */
export function suggestReorder(
  p: Pick<Playlist, "tandas" | "options">,
  opts: Pick<ReviewOptions, "fixedBefore" | "settings"> = {},
): ReorderSuggestion | null {
  const o = withNightRules(p as Playlist, opts.settings).options;
  const c = orderCtx(o);
  const n = p.tandas.length;
  const from = Math.max(0, Math.min(n, opts.fixedBefore ?? 0));
  const f0 = orderFaults(p.tandas, c);
  const trigger = f0.adjacent.length + f0.lastFour.length + f0.runs.length + f0.repeat.length;
  if (!trigger || n - from < 2) return null;
  const at = (order: number[]) => order.map((i) => p.tandas[i]!);
  const moved = (order: number[]) => order.reduce((a, i, k) => a + Math.abs(i - k), 0);
  let order = p.tandas.map((_, i) => i);
  let cost = costOf(f0);
  const before = cost;
  for (let step = 0; step < 4 * n; step++) {
    let best: { order: number[]; cost: number; moved: number } | null = null;
    const consider = (cand: number[]) => {
      const k = costOf(orderFaults(at(cand), c));
      if (k >= cost) return;
      const m = moved(cand);
      if (!best || k < best.cost || (k === best.cost && m < best.moved))
        best = { order: cand, cost: k, moved: m };
    };
    for (let a = from; a < n; a++)
      for (let b = from; b < n; b++) {
        if (a === b) continue;
        const mv = order.slice();
        const [x] = mv.splice(a, 1);
        mv.splice(b, 0, x!);
        consider(mv);
        if (b > a) {
          const sw = order.slice();
          [sw[a], sw[b]] = [sw[b]!, sw[a]!];
          consider(sw);
        }
      }
    if (!best) break;
    order = (best as { order: number[] }).order;
    cost = (best as { cost: number }).cost;
  }
  if (cost >= before) return null;
  // a reorder must end a fault the DJ would see, not only trade one weight for another
  const f1 = orderFaults(at(order), c);
  const seen = (f: ReturnType<typeof orderFaults>) =>
    f.adjacent.length + f.lastFour.length + f.runs.length + f.repeat.length;
  if (seen(f1) >= trigger) return null;
  const moves: ReorderMove[] = order.flatMap((i, k) => (i === k ? [] : [{ tanda: i, from: i, to: k }]));
  const fixed = trigger - seen(f1);
  return {
    order,
    moves,
    before,
    after: cost,
    ...msg(
      fixed === 1 ? "reorder_one" : "reorder",
      fixed === 1
        ? "A new order fixes 1 problem, moving {m} tandas"
        : "A new order fixes {k} problems, moving {m} tandas",
      { k: fixed, m: moves.length },
    ),
  };
}

/* ---------- the review ---------- */

/** Review a night: see the module comment. */
export function reviewNight(p0: Playlist, deps: ComposeDeps, opts: ReviewOptions = {}): NightReview {
  const p = withNightRules(p0, opts.settings);
  const o = p.options;
  const n = p.tandas.length;
  const fixedBefore = Math.max(0, opts.fixedBefore ?? 0);
  const out: ReviewFinding[] = [];
  const add = (f: Omit<ReviewFinding, "id"> & { key?: string }) => {
    const { key, ...rest } = f;
    out.push({ id: `${f.kind}|${f.tanda ?? "-"}|${f.side ?? "-"}|${key ?? ""}`, ...rest });
  };

  // --- tanda coherence ---
  p.tandas.forEach((t, ti) => {
    if (ti < fixedBefore) return;
    const { want, odd, split, voiceSplit } = tandaWant(t, o);
    const N = ti + 1;
    for (const [si, kind] of [...odd.entries()].sort((a, b) => a[0] - b[0])) {
      const s = t.songs[si]!;
      const title = titleOf(s);
      let m: ReturnType<typeof msg>;
      let severity: ReviewSeverity;
      switch (kind) {
        case "rhythm":
          severity = "blocker";
          m = msg("rhythm", "Tanda {n}: “{title}” is a {r} in a {want} tanda", {
            n: N,
            title,
            r: s.rhythm,
            want: want.rhythm,
          });
          break;
        case "orchestra":
          severity = "high";
          m = msg("orchestra", "Tanda {n}: “{title}” is by {o}; the tanda is {want}", {
            n: N,
            title,
            o: s.orchestra,
            want: want.orchestra,
          });
          break;
        case "voice":
          severity = "high";
          m = want.vocal
            ? msg("voice_instrumental", "Tanda {n}: “{title}” is instrumental in a sung tanda", {
                n: N,
                title,
              })
            : msg("voice_sung", "Tanda {n}: “{title}” is sung ({singer}) in an instrumental tanda", {
                n: N,
                title,
                singer: s.singer ?? "",
              });
          break;
        case "singer":
          severity = "medium";
          m = msg("singer", "Tanda {n}: “{title}” is sung by {singer}; the others by {want}", {
            n: N,
            title,
            singer: s.singer ?? "",
            want: want.singer ?? "",
          });
          break;
        default:
          severity = "medium";
          m = msg("years", "Tanda {n}: “{title}” ({year}) is far from the others ({lo}–{hi})", {
            n: N,
            title,
            year: s.year ?? "",
            lo: want.years?.[0] ?? "",
            hi: want.years?.[1] ?? "",
          });
      }
      const fx = sideFix(p, ti, si, want, deps);
      let fix: ReviewFinding["fix"];
      if (fx) {
        const v = fx.song;
        const f = fx.safe
          ? v.vocal && v.singer
            ? msg("fix.version_sung", "Use the {year} recording sung by {singer}", {
                year: v.year ?? "",
                singer: v.singer,
              })
            : msg("fix.version_instrumental", "Use the {year} instrumental recording", { year: v.year ?? "" })
          : msg("fix.other_side", "Swap for “{title}” ({o}, {year})", {
              title: v.title,
              o: v.orchestra,
              year: v.year ?? "",
            });
        fix = { ...f, fix: { kind: "side", tanda: ti, side: si, songId: v.id }, safe: fx.safe };
      } else if (kind === "rhythm" && t.songs.length > 1) {
        fix = {
          ...msg("fix.remove_side", "Take “{title}” out", { title }),
          fix: { kind: "removeSide", tanda: ti, side: si },
          safe: false,
        };
      }
      add({ kind, severity, tanda: ti, side: si, ...m, ...(fix ? { fix } : {}), key: s.id });
    }
    if (voiceSplit)
      add({
        kind: "voice",
        severity: "high",
        tanda: ti,
        side: null,
        ...msg("voice_split", "Tanda {n} mixes {k} sung and {i} instrumental sides", {
          n: N,
          k: voiceSplit.sung,
          i: voiceSplit.instrumental,
        }),
      });
    if (split && want.years) {
      const ys = t.songs.map(yearOf).filter((y): y is number => !!y);
      add({
        kind: "years",
        severity: "medium",
        tanda: ti,
        side: null,
        ...msg("years_split", "Tanda {n} spreads over {lo}–{hi}", {
          n: N,
          lo: Math.min(...ys),
          hi: Math.max(...ys),
        }),
      });
    }
    const size = t.songs.filter((s) => !isCumparsita(s)).length;
    const wantSize = sizeFor(o, want.rhythm);
    if (size !== wantSize && !(ti === n - 1 && closingFormatOf(o) === "in-tanda" && size === wantSize + 1))
      add({
        kind: "size",
        severity: "low",
        tanda: ti,
        side: null,
        ...msg("size", "Tanda {n} has {k} songs; your {r} tandas have {s}", {
          n: N,
          k: size,
          r: want.rhythm,
          s: wantSize,
        }),
      });
  });

  // --- the order ---
  const reorder = suggestReorder(p, { fixedBefore });
  const orderFix: ReviewFinding["fix"] = reorder
    ? {
        ...msg("fix.reorder", "Reorder the night ({m} tandas move)", { m: reorder.moves.length }),
        fix: { kind: "order", order: reorder.order },
        safe: false,
      }
    : undefined;
  const c = orderCtx(o);
  const f = orderFaults(p.tandas, c);
  const live = (...ks: number[]) => ks.some((k) => k >= fixedBefore);
  for (const i of f.adjacent)
    if (live(i - 1, i))
      add({
        kind: "cycle",
        severity: "high",
        tanda: i,
        side: null,
        ...msg("cycle_adjacent", "Two non-tango tandas back to back: tandas {a}–{b} ({r1}, {r2})", {
          a: i,
          b: i + 1,
          r1: p.tandas[i - 1]!.rhythm,
          r2: p.tandas[i]!.rhythm,
        }),
        ...(orderFix ? { fix: orderFix } : {}),
      });
  for (const [a, b] of f.runs)
    if (live(b))
      add({
        kind: "tangoRun",
        severity: "medium",
        tanda: a,
        side: null,
        ...msg("cycle_run", "{k} tango tandas in a row (tandas {a}–{b}); your cycle plays {max}", {
          k: b - a + 1,
          a: a + 1,
          b: b + 1,
          max: c.maxRun,
        }),
        ...(orderFix ? { fix: orderFix } : {}),
      });
  const kept = lastFourKept(p);
  for (const i of f.lastFour)
    if (live(i) && !kept.has(i))
      add({
        kind: "lastFour",
        severity: "high",
        tanda: i,
        side: null,
        ...msg("last_four", "Tanda {n} is a {r} among the last four; your night ends on four tango tandas", {
          n: i + 1,
          r: p.tandas[i]!.rhythm,
        }),
        ...(orderFix ? { fix: orderFix } : {}),
      });
  for (const i of f.repeat)
    if (live(i))
      add({
        kind: "repeat",
        severity: "medium",
        tanda: i,
        side: null,
        ...msg("repeat", "{o} plays two tandas in a row (tandas {a}–{b})", {
          o: p.tandas[i]!.orchestra,
          a: i,
          b: i + 1,
        }),
        ...(orderFix ? { fix: orderFix } : {}),
      });
  for (const i of f.big4)
    if (live(i) && !f.repeat.includes(i))
      add({
        kind: "bigFour",
        severity: "low",
        tanda: i,
        side: null,
        ...msg("big4_adjacent", "Two big-four tandas back to back: {a} then {b} (tandas {x}–{y})", {
          a: p.tandas[i - 1]!.orchestra,
          b: p.tandas[i]!.orchestra,
          x: i,
          y: i + 1,
        }),
      });
  for (let i = 1; i < n; i++) {
    if (!live(i)) continue;
    const step = Math.round(p.tandas[i]!.energy - p.tandas[i - 1]!.energy);
    if (Math.abs(step) >= 25 && !(isBigFour(p.tandas[i]!) && step > 0 && i === n - 1))
      add({
        kind: "energy",
        severity: "low",
        tanda: i,
        side: null,
        ...msg(
          step > 0 ? "energy_up" : "energy_down",
          step > 0 ? "Tanda {n} jumps the energy: {a} → {b}" : "Tanda {n} drops the energy: {a} → {b}",
          {
            n: i + 1,
            a: Math.round(p.tandas[i - 1]!.energy),
            b: Math.round(p.tandas[i]!.energy),
          },
        ),
      });
  }

  // --- cortinas and La Cumparsita ---
  const breaks = new Set((p.breaks ?? []).map((b) => b.afterTanda));
  if (o.cortinaStyle !== "none")
    for (let i = 0; i < n - 1; i++) {
      if (!live(i + 1) || p.tandas[i]!.cortina || breaks.has(i)) continue;
      add({
        kind: "cortina",
        severity: "high",
        tanda: i,
        side: null,
        ...msg("cortina_missing", "No cortina between tandas {a} and {b}", { a: i + 1, b: i + 2 }),
        fix: {
          ...msg("fix.add_cortina", "Add a cortina after tanda {n}", { n: i + 1 }),
          fix: { kind: "guide", fix: { kind: "cortina", tanda: i } },
          safe: true,
        },
      });
    }
  const place = cumparsitaPlacement(o);
  const fmt = closingFormatOf(o);
  const last = p.tandas[n - 1];
  if (last && place.close && !p.closing) {
    const s = closingSuggestion(p, deps);
    add({
      kind: "closing",
      severity: "high",
      tanda: null,
      side: null,
      ...msg("closing_missing", "The night does not close with La Cumparsita", {}),
      ...(s
        ? {
            fix: {
              ...msg("fix.closing", "Close with La Cumparsita ({o}, {y})", {
                o: s.orchestra,
                y: s.year ?? "",
              }),
              fix: { kind: "guide", fix: { kind: "closing", songId: s.id } },
              safe: true,
            },
          }
        : {}),
      key: "close",
    });
  }
  if (last && p.closing && o.cortinaStyle !== "none") {
    if (cortinaBeforeClosing(fmt) && !last.cortina)
      add({
        kind: "closingCortina",
        severity: "medium",
        tanda: n - 1,
        side: null,
        ...msg("closing_cortina_missing", "A cortina before La Cumparsita is missing (after tanda {n})", {
          n,
        }),
        fix: {
          ...msg("fix.add_cortina", "Add a cortina after tanda {n}", { n }),
          fix: { kind: "guide", fix: { kind: "cortina", tanda: n - 1 } },
          safe: true,
        },
      });
    else if (!cortinaBeforeClosing(fmt) && last.cortina)
      add({
        kind: "closingCortina",
        severity: "low",
        tanda: n - 1,
        side: null,
        ...msg(
          "closing_cortina_extra",
          "Tanda {n} has a cortina, but your La Cumparsita follows the última straight",
          {
            n,
          },
        ),
        fix: {
          ...msg("fix.no_cortina", "No cortina after tanda {n}", { n }),
          fix: { kind: "guide", fix: { kind: "noCortina", tanda: n - 1 } },
          safe: true,
        },
      });
  }
  if (p.tandas[0] && place.open && !p.opening && fixedBefore === 0) {
    const s = openingSuggestion(p, deps);
    add({
      kind: "opening",
      severity: "low",
      tanda: null,
      side: null,
      ...msg("opening_missing", "Your night opens with La Cumparsita; this one does not", {}),
      ...(s
        ? {
            fix: {
              ...msg("fix.opening", "Open with La Cumparsita ({o}, {y})", {
                o: s.orchestra,
                y: s.year ?? "",
              }),
              fix: { kind: "guide", fix: { kind: "opening", songId: s.id } },
              safe: true,
            },
          }
        : {}),
      key: "open",
    });
  }

  const booth = opts.level === "booth";
  const findings = out
    .filter((x) => !booth || x.severity === "blocker" || x.severity === "high")
    .sort(
      (a, b) =>
        RANK[a.severity] - RANK[b.severity] ||
        (a.tanda ?? -1) - (b.tanda ?? -1) ||
        (a.side ?? -1) - (b.side ?? -1) ||
        a.kind.localeCompare(b.kind),
    );
  const counts = { blocker: 0, high: 0, medium: 0, low: 0 } as Record<ReviewSeverity, number>;
  for (const x of findings) counts[x.severity]++;
  return { findings, reorder, counts };
}

/** a tanda's header from its sides: the majority orchestra, singer, voice and rhythm (an import's own rule) */
function reheader(t: Tanda, o: ComposeOptions): Tanda {
  const { want } = tandaWant(t, o);
  return {
    ...t,
    rhythm: want.rhythm,
    orchestraId: want.orchestraId,
    orchestra: want.orchestra,
    vocal: want.vocal,
    singer: want.vocal ? (want.singer ?? t.singer) : null,
  };
}
const renightSafe = (p: Playlist, tandas: Tanda[]): Playlist => {
  try {
    return renight(p, tandas);
  } catch {
    return { ...p, tandas };
  }
};

/** a finding's fix on the night (the web's rule check judges it before it applies, as any edit) */
export function applyReviewFix(p: Playlist, fix: ReviewFix, deps: ComposeDeps): EditResult {
  switch (fix.kind) {
    case "side": {
      const t = p.tandas[fix.tanda];
      const cur = t?.songs[fix.side];
      const s = deps.catalog.songs.find((x) => x.id === fix.songId || x.altIds?.includes(fix.songId));
      if (!t || !cur) return { playlist: p, reason: "no such side" };
      if (!s) return { playlist: p, reason: "no such recording" };
      if (p.tandas.some((x) => x.songs.some((y) => y.id === s.id)))
        return { playlist: p, reason: "already in the night" };
      const songs = t.songs.map((x, k) => (k === fix.side ? s : x));
      const nt = reheader(retimeTanda(t, songs), p.options);
      return {
        playlist: renightSafe(
          p,
          p.tandas.map((x, i) => (i === fix.tanda ? nt : x)),
        ),
      };
    }
    case "removeSide":
      return removeSong(p, fix.tanda, fix.side, deps);
    case "order":
      return reorderTandas(p, fix.order, deps);
    case "guide":
      return applyGuideFix(p, fix.fix, deps, 1);
  }
}

/** the findings a fix list "Apply all safe fixes" applies, one per tanda chair (the first of each) */
export function safeFixes(findings: readonly ReviewFinding[]): ReviewFinding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    if (!f.fix?.safe) return false;
    const k =
      f.fix.fix.kind === "side"
        ? `side|${f.fix.fix.tanda}|${f.fix.fix.side}`
        : f.fix.fix.kind === "guide"
          ? `guide|${JSON.stringify(f.fix.fix.fix)}`
          : f.id;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Apply every safe fix of a review in one edit (one undo): each one re-checked against the night as it stands, so a
 * fix an earlier one made moot is skipped. Returns the night and how many applied.
 */
export function applySafeFixes(
  p: Playlist,
  deps: ComposeDeps,
  opts: Pick<ReviewOptions, "settings" | "fixedBefore"> = {},
): { playlist: Playlist; applied: number } {
  let cur = p;
  let applied = 0;
  for (let round = 0; round < 3; round++) {
    const fs = safeFixes(reviewNight(cur, deps, opts).findings);
    if (!fs.length) break;
    let any = false;
    for (const f of fs) {
      // (the review read the night with the DJ's rules: the fix is applied to the night as it is)
      const again = reviewNight(cur, deps, opts).findings.find((x) => x.id === f.id);
      if (!again?.fix?.safe) continue;
      const r = applyReviewFix(cur, again.fix.fix, deps);
      if (r.reason || r.playlist === cur) continue;
      cur = { ...r.playlist, options: p.options };
      applied++;
      any = true;
    }
    if (!any) break;
  }
  return { playlist: cur, applied };
}
