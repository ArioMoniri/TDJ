/**
 * The search engine's text half (2026-11, "search doesn't work nicely, and the regex isn't nice either"): a prebuilt
 * inverted index over any list of records, matched word by word. Nothing here builds a RegExp from what the user
 * typed: the query is cut into words by a fixed tokenizer and each word is looked up in the vocabulary, so `(`, `[`,
 * `*` or `?` are just characters that never make a word.
 *
 *  - Folding: NFD with the combining marks stripped (é → e, ñ → n), lower case, the Turkish dotless ı, and the
 *    apostrophes of a word removed, so "D'Arienzo", "D’Arienzo" and "darienzo" are one word; the word's parts are
 *    indexed too ("d", "arienzo"), and a short word joins the next one ("di sarli" → "disarli"), so "d arienzo" and
 *    "disarli" find it as well.
 *  - Matching: every query word must match some field (AND). A word matches a vocabulary word exactly, by its
 *    Spanish-spelling key (z/s, v/b, ll/y, silent h, doubled letters: "puglieze", "shuseta"), or within a bounded edit
 *    distance (1 for 4–7 letters, 2 for 8+: "pugliesse", "ventaron"); the last word, while the DJ is typing it, also
 *    matches as a prefix.
 *  - Scoring: per query word the best field weight × match quality (exact 1, prefix 0.72–0.8, spelling 0.7, one
 *    typo 0.55, two 0.4), summed, plus a bonus when the first field (the title) is the query or starts with it.
 */

export interface TextField<T> {
  name: string;
  weight: number;
  get: (doc: T) => string | ReadonlyArray<string | null | undefined> | null | undefined;
}

export interface TextIndex<T> {
  docs: T[];
  fields: Array<{ name: string; weight: number }>;
  /** sorted vocabulary of folded words */
  vocab: string[];
  ids: Map<string, number>;
  /** per word: doc × 16 + field, ascending */
  postings: Int32Array[];
  /** per doc: its words as word × 16 + field (offsets in docOff) */
  docTok: Int32Array;
  docOff: Int32Array;
  /** spelling key → word ids */
  phon: Map<string, number[]>;
  /** word length → word ids */
  byLen: number[][];
  /** per word: how many docs hold it */
  df: Int32Array;
  /** per word: the first original spelling seen ("Ventarrón") */
  display: string[];
  /** per doc: the first field, folded words joined by one space (the title phrase bonus) */
  head: string[];
  cache: Map<string, Map<number, number>>;
  /** reused per query (no garbage while the DJ types); a TextMatch is valid until the next match on this index */
  scratch?: {
    score: Float32Array;
    loose: Uint8Array;
    alive: Int32Array;
    best: Float32Array;
    strict: Uint8Array;
    epoch: number;
  };
}

const F = 16;
const APOS = /['’‘`´ʼ]/g;
const HAS_APOS = /['’‘`´ʼ]/;
/** a word: letters and digits, with apostrophes inside it ("D'Arienzo"); everything else separates */
const WORD = /[\p{L}\p{N}]+(?:['’‘`´ʼ][\p{L}\p{N}]+)*/gu;
const MARKS = /\p{M}+/gu;
const SPECIAL: Record<string, string> = {
  ı: "i",
  ß: "ss",
  ø: "o",
  æ: "ae",
  œ: "oe",
  ł: "l",
  đ: "d",
  þ: "th",
};
const SPECIAL_RE = /[ıßøæœłđþ]/g;

/** fold a string for matching: accents, case, ñ, ı and apostrophes (punctuation is left to the tokenizer) */
export function foldText(s: string): string {
  return s
    .normalize("NFD")
    .replace(MARKS, "")
    .toLowerCase()
    .replace(SPECIAL_RE, (c) => SPECIAL[c] ?? c)
    .replace(APOS, "");
}

export interface Word {
  /** the folded word, apostrophes removed */
  norm: string;
  /** its apostrophe-separated parts ("d", "arienzo"), when it has any */
  parts?: string[];
  start: number;
  end: number;
}

/** the words of a string with their spans in the original text */
export function words(s: string): Word[] {
  const out: Word[] = [];
  if (!s) return out;
  for (const m of s.matchAll(WORD)) {
    const raw = m[0];
    const norm = foldText(raw);
    if (!norm) continue;
    const w: Word = { norm, start: m.index!, end: m.index! + raw.length };
    if (HAS_APOS.test(raw)) w.parts = raw.split(HAS_APOS).map(foldText).filter(Boolean);
    out.push(w);
  }
  return out;
}

/** the Spanish-spelling key of a folded word: z→s, v→b, ll→y, qu→k, c(e|i)→s, c→k, silent h, doubled letters */
export function spellingKey(w: string): string {
  let s = w
    .replace(/qu/g, "k")
    .replace(/ll/g, "y")
    .replace(/c([ei])/g, "s$1")
    .replace(/c/g, "k")
    .replace(/z/g, "s")
    .replace(/v/g, "b")
    .replace(/w/g, "u")
    .replace(/h/g, "")
    .replace(/y$/, "i");
  s = s.replace(/(.)\1+/g, "$1");
  return s;
}

let ROW_A = new Int32Array(64);
let ROW_B = new Int32Array(64);
let ROW_C = new Int32Array(64);
/** optimal-string-alignment distance (a transposition counts once), or max + 1 once it is over max */
export function editDistance(a: string, b: string, max: number): number {
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  if (a === b) return 0;
  if (lb + 1 > ROW_A.length) {
    ROW_A = new Int32Array(lb + 1);
    ROW_B = new Int32Array(lb + 1);
    ROW_C = new Int32Array(lb + 1);
  }
  let prev2 = ROW_C;
  let prev = ROW_A;
  let cur = ROW_B;
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    cur[0] = i;
    let rowMin = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= lb; j++) {
      const cb = b.charCodeAt(j - 1);
      let v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (ca === cb ? 0 : 1));
      if (i > 1 && j > 1 && ca === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === cb)
        v = Math.min(v, prev2[j - 2]! + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    const t = prev2;
    prev2 = prev;
    prev = cur;
    cur = t;
  }
  return prev[lb]!;
}

/** the typo budget of a query word: none under 4 letters, 1 for 4–7, 2 for 8+ (numbers: none) */
export const typoBudget = (w: string) => (/^\d+$/.test(w) ? 0 : w.length >= 8 ? 2 : w.length >= 4 ? 1 : 0);

/** the words a field value indexes: each word, its apostrophe parts, a short word joined to the next */
function fieldTokens(value: string, out: Array<[string, string]>) {
  const ws = words(value);
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i]!;
    out.push([w.norm, value.slice(w.start, w.end)]);
    if (w.parts) for (const p of w.parts) out.push([p, p]);
    const next = ws[i + 1];
    if (next && w.norm.length <= 3 && !/^\d+$/.test(w.norm) && !/^\d+$/.test(next.norm))
      out.push([w.norm + next.norm, value.slice(w.start, next.end)]);
  }
}

const valuesOf = (v: ReturnType<TextField<unknown>["get"]>): string[] =>
  v == null ? [] : typeof v === "string" ? [v] : (v.filter((x) => typeof x === "string" && x) as string[]);

/** build the inverted index once (≈ 19k songs: well under a second) */
export function buildTextIndex<T>(docs: T[], fields: Array<TextField<T>>): TextIndex<T> {
  if (fields.length > F) throw new Error(`at most ${F} fields`);
  const perDoc: Array<Array<[string, number]>> = [];
  const display = new Map<string, string>();
  const head: string[] = [];
  const buf: Array<[string, string]> = [];
  for (const d of docs) {
    const mine: Array<[string, number]> = [];
    fields.forEach((f, fi) => {
      for (const v of valuesOf(f.get(d))) {
        buf.length = 0;
        fieldTokens(v, buf);
        for (const [tok, shown] of buf) {
          mine.push([tok, fi]);
          if (!display.has(tok)) display.set(tok, shown);
        }
      }
    });
    perDoc.push(mine);
    head.push(
      valuesOf(fields[0]!.get(d))
        .slice(0, 1)
        .flatMap((v) => words(v).map((w) => w.norm))
        .join(" "),
    );
  }
  const vocab = [...display.keys()].sort();
  const ids = new Map<string, number>();
  vocab.forEach((w, i) => ids.set(w, i));
  const lists: number[][] = vocab.map(() => []);
  const docOff = new Int32Array(docs.length + 1);
  const flat: number[] = [];
  perDoc.forEach((mine, di) => {
    docOff[di] = flat.length;
    const seen = new Set<number>();
    for (const [tok, fi] of mine) {
      const code = ids.get(tok)! * F + fi;
      if (seen.has(code)) continue;
      seen.add(code);
      flat.push(code);
      lists[ids.get(tok)!]!.push(di * F + fi);
    }
  });
  docOff[docs.length] = flat.length;
  const df = new Int32Array(vocab.length);
  const postings = lists.map((l, i) => {
    let n = 0;
    let last = -1;
    for (const c of l) {
      const d = (c / F) | 0;
      if (d !== last) n++;
      last = d;
    }
    df[i] = n;
    return Int32Array.from(l);
  });
  const phon = new Map<string, number[]>();
  const byLen: number[][] = [];
  vocab.forEach((w, i) => {
    if (w.length >= 3 && !/^\d+$/.test(w)) {
      const k = spellingKey(w);
      const l = phon.get(k);
      if (l) l.push(i);
      else phon.set(k, [i]);
    }
    const bucket = byLen[w.length];
    if (bucket) bucket.push(i);
    else byLen[w.length] = [i];
  });
  return {
    docs,
    fields: fields.map((f) => ({ name: f.name, weight: f.weight })),
    vocab,
    ids,
    postings,
    docTok: Int32Array.from(flat),
    docOff,
    phon,
    byLen,
    df,
    display: vocab.map((w) => display.get(w) ?? w),
    head,
    cache: new Map(),
  };
}

export interface QueryWord {
  /** folded */
  norm: string;
  /** as typed */
  raw: string;
  /** still being typed: also a prefix */
  prefix: boolean;
  /** field names this word is limited to (`orchestra:pugliese`) */
  fields?: string[];
}

export const QUALITY = { exact: 1, prefix: 0.8, spelling: 0.7, typo1: 0.55, typo2: 0.4 } as const;

const CACHE_MAX = 400;
/** the vocabulary words a query word matches, with the match quality */
export function expand<T>(ix: TextIndex<T>, w: string, prefix: boolean): Map<number, number> {
  const key = `${prefix ? "p" : "w"}${w}`;
  const hit = ix.cache.get(key);
  if (hit) return hit;
  const m = new Map<number, number>();
  const put = (id: number, q: number) => {
    if ((m.get(id) ?? 0) < q) m.set(id, q);
  };
  if (w.length > 64) {
    ix.cache.set(key, m);
    return m;
  }
  const exact = ix.ids.get(w);
  if (exact !== undefined) m.set(exact, QUALITY.exact);
  if (prefix) {
    let lo = 0;
    let hi = ix.vocab.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ix.vocab[mid]! < w) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < ix.vocab.length; i++) {
      const v = ix.vocab[i]!;
      if (!v.startsWith(w)) break;
      if (v !== w) put(i, 0.72 + 0.08 * (w.length / v.length));
    }
  }
  const numeric = /^\d+$/.test(w);
  if (w.length >= 3 && !numeric)
    for (const id of ix.phon.get(spellingKey(w)) ?? []) put(id, QUALITY.spelling);
  const k = typoBudget(w);
  if (k > 0)
    for (let L = w.length - k; L <= w.length + k; L++)
      for (const id of ix.byLen[L] ?? []) {
        if ((m.get(id) ?? 0) >= QUALITY.typo1) continue;
        const v = ix.vocab[id]!;
        if (v.charCodeAt(0) < 58) continue; // numbers are never typos of words
        const d = editDistance(w, v, k);
        if (d > k) continue;
        if (d === 1) put(id, QUALITY.typo1);
        else if (d === 2) put(id, QUALITY.typo2);
      }
  if (ix.cache.size >= CACHE_MAX) ix.cache.delete(ix.cache.keys().next().value!);
  ix.cache.set(key, m);
  return m;
}

/** a query cut into words: `field:value` limits a word to that field; the last word is a prefix while typing */
export function queryWords(q: string, fieldNames: string[] = []): QueryWord[] {
  const out: QueryWord[] = [];
  const chunks = q.split(/\s+/).filter(Boolean);
  const trailing = /\s$/.test(q);
  chunks.forEach((c) => {
    const m = /^([a-z]+):(.*)$/i.exec(c);
    let fields: string[] | undefined;
    let text = c;
    if (m && fieldNames.includes(m[1]!.toLowerCase())) {
      fields = [m[1]!.toLowerCase()];
      text = m[2]!;
    }
    for (const w of words(text))
      out.push({ norm: w.norm, raw: text.slice(w.start, w.end), prefix: false, fields });
  });
  if (out.length && !trailing) out[out.length - 1]!.prefix = true;
  return out;
}

export interface TextMatch {
  /** the docs every word matched, or null when there were no words (every doc matches) */
  hits: Int32Array | null;
  /** per doc: the text score (valid for the docs in `hits`) */
  score: Float32Array | null;
  /** per doc: some word matched it only by spelling or a typo (it ranks after the docs every word matched as typed) */
  loose: Uint8Array | null;
  expansions: Array<Map<number, number>>;
  /** per word: it matched only by spelling or a typo (a "did you mean" hint) */
  fuzzyOnly: boolean[];
}

const maskOf = (ix: TextIndex<unknown>, names?: string[]) => {
  if (!names?.length) return -1;
  let m = 0;
  ix.fields.forEach((f, i) => {
    if (names.includes(f.name)) m |= 1 << i;
  });
  return m;
};

/** every word must match some field (AND); the most selective word goes first and the others narrow its docs */
export function matchWords<T>(
  ix: TextIndex<T>,
  qw: QueryWord[],
  allow?: (doc: number) => boolean,
): TextMatch {
  if (!qw.length) return { hits: null, score: null, loose: null, expansions: [], fuzzyOnly: [] };
  const n = ix.docs.length;
  const expansions = qw.map((w) => expand(ix, w.norm, w.prefix));
  const masks = qw.map((w) => maskOf(ix as TextIndex<unknown>, w.fields));
  const weights = ix.fields.map((f) => f.weight);
  const cost = expansions.map((e) => {
    let c = 0;
    for (const id of e.keys()) c += ix.postings[id]!.length;
    return c;
  });
  const order = qw.map((_, i) => i).sort((a, b) => cost[a]! - cost[b]!);
  if (!ix.scratch)
    ix.scratch = {
      score: new Float32Array(n),
      loose: new Uint8Array(n),
      alive: new Int32Array(n),
      best: new Float32Array(n),
      strict: new Uint8Array(n),
      epoch: 0,
    };
  const S = ix.scratch;
  if (S.epoch > 2e9) {
    S.alive.fill(0);
    S.epoch = 0;
  }
  const { score, loose, alive, best, strict } = S;
  score.fill(0);
  loose.fill(0);
  /** a doc is alive at step k when alive[d] === base + k */
  const base = S.epoch + 1;
  S.epoch = base + qw.length + 1;
  let cand: number[] = [];
  order.forEach((k, step) => {
    const e = expansions[k]!;
    const mk = masks[k]!;
    const touched: number[] = [];
    for (const [id, q] of e) {
      const p = ix.postings[id]!;
      for (let i = 0; i < p.length; i++) {
        const c = p[i]!;
        const fi = c & (F - 1);
        if (!((mk >> fi) & 1)) continue;
        const d = c >> 4;
        if (step === 0 ? alive[d]! >= base : alive[d] !== base + step) continue;
        const v = weights[fi]! * q;
        if (best[d] === 0) touched.push(d);
        if (v > best[d]!) best[d] = v;
        if (q > QUALITY.spelling) strict[d] = 1;
      }
    }
    cand = [];
    for (const d of touched) {
      if (step === 0 && allow && !allow(d)) {
        best[d] = 0;
        strict[d] = 0;
        continue;
      }
      score[d]! += best[d]!;
      if (!strict[d]) loose[d] = 1;
      alive[d] = base + step + 1;
      best[d] = 0;
      strict[d] = 0;
      cand.push(d);
    }
  });
  const fuzzyOnly = qw.map((_, k) => {
    for (const q of expansions[k]!.values()) if (q > QUALITY.spelling) return false;
    return true;
  });
  // the title phrase: the query is the title, or the title starts with it
  const phrase = qw.map((w) => w.norm).join(" ");
  if (phrase)
    for (const d of cand) {
      const h = ix.head[d]!;
      if (h === phrase) score[d]! += 6;
      else if (h.startsWith(phrase)) score[d]! += 2;
    }
  return { hits: Int32Array.from(cand), score, loose, expansions, fuzzyOnly };
}

/** the spans of a field value that the query matched (for highlighting) */
export function highlight<T>(
  ix: TextIndex<T>,
  value: string | null | undefined,
  m: Pick<TextMatch, "expansions">,
): Array<[number, number]> {
  if (!value || !m.expansions.length) return [];
  const ws = words(value);
  const hit = (tok: string) => {
    const id = ix.ids.get(tok);
    return id !== undefined && m.expansions.some((e) => e.has(id));
  };
  const out: Array<[number, number]> = [];
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i]!;
    if (hit(w.norm) || w.parts?.some(hit)) out.push([w.start, w.end]);
    else if (ws[i + 1] && w.norm.length <= 3 && hit(w.norm + ws[i + 1]!.norm)) {
      out.push([w.start, ws[i + 1]!.end]);
      i++;
    }
  }
  return out;
}

/** the nearest well-known vocabulary word to a word that matched nothing (bounded distance 3) */
export function nearestWord<T>(ix: TextIndex<T>, w: string): number | undefined {
  if (w.length < 3 || /^\d+$/.test(w)) return undefined;
  const max = w.length >= 6 ? 3 : 2;
  let best: number | undefined;
  let bestD = max + 1;
  for (let L = w.length - max; L <= w.length + max; L++)
    for (const id of ix.byLen[L] ?? []) {
      const d = editDistance(w, ix.vocab[id]!, Math.min(max, bestD));
      if (d < bestD || (d === bestD && best !== undefined && ix.df[id]! > ix.df[best]!)) {
        if (d <= max) {
          best = id;
          bestD = d;
        }
      }
    }
  return best;
}

export interface TextHit<T> {
  doc: T;
  index: number;
  score: number;
  highlights: Record<string, Array<[number, number]>>;
}
export interface TextResult<T> {
  items: Array<TextHit<T>>;
  total: number;
  suggestion?: string;
}

/**
 * Search any list (cortinas, orchestras, singers): words AND across fields, ranked by score then `rank` (higher
 * first) then the original order. An empty query lists everything.
 */
export function searchText<T>(
  ix: TextIndex<T>,
  query: string,
  opts: {
    limit?: number;
    offset?: number;
    filter?: (doc: T) => boolean;
    rank?: (doc: T) => number;
    highlight?: Array<{ field: string; get: (doc: T) => string | null | undefined }>;
  } = {},
): TextResult<T> {
  const q = String(query ?? "").slice(0, 400);
  const qw = queryWords(
    q,
    ix.fields.map((f) => f.name),
  );
  if (!qw.length && q.trim()) return { items: [], total: 0 };
  const allow = opts.filter ? (d: number) => opts.filter!(ix.docs[d]!) : undefined;
  const m = matchWords(ix, qw, allow);
  let list: Array<[number, number]>;
  if (m.hits)
    list = Array.from(m.hits, (d) => [d, m.score![d]! - (m.loose![d] ? 1000 : 0)] as [number, number]);
  else list = ix.docs.map((_, i) => [i, 0] as [number, number]).filter(([i]) => !allow || allow(i));
  const rank = opts.rank;
  list.sort((a, b) => b[1] - a[1] || (rank ? rank(ix.docs[b[0]]!) - rank(ix.docs[a[0]]!) : 0) || a[0] - b[0]);
  const off = Math.max(0, opts.offset ?? 0);
  const lim = Math.max(0, opts.limit ?? 50);
  const items = list.slice(off, off + lim).map(([i, score]) => {
    const doc = ix.docs[i]!;
    const highlights: Record<string, Array<[number, number]>> = {};
    for (const h of opts.highlight ?? []) highlights[h.field] = highlight(ix, h.get(doc), m);
    return { doc, index: i, score: score < -500 ? score + 1000 : score, highlights };
  });
  const out: TextResult<T> = { items, total: list.length };
  if (!list.length && qw.length) {
    const s = suggest(ix, qw, m, allow);
    if (s) out.suggestion = s;
  }
  return out;
}

/** "did you mean": each word that matched nothing replaced by its nearest well-known word, kept if that finds some */
export function suggest<T>(
  ix: TextIndex<T>,
  qw: QueryWord[],
  m: TextMatch,
  allow?: (doc: number) => boolean,
): string | undefined {
  let changed = false;
  const fixed = qw.map((w, k) => {
    if (m.expansions[k]!.size) return w;
    const id = nearestWord(ix, w.norm);
    if (id === undefined) return w;
    changed = true;
    return { ...w, norm: ix.vocab[id]!, raw: ix.display[id]!.toLowerCase(), prefix: false };
  });
  if (!changed) return undefined;
  const again = matchWords(ix, fixed, allow);
  if (!again.hits?.length) return undefined;
  return fixed.map((w) => w.raw).join(" ");
}
