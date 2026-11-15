/**
 * Wave 2 — the engine's notes in the DJ's words. The core records each setting it could not keep (stats
 * .settingFallbacks: "bigFour: …", "opening: …", "closer: …") and each improve pass with its scores; the UI never prints
 * those as they are. Every known form maps to one short sentence; an unknown one keeps its words without the
 * "key:" prefix, catalogue ids, tanda codes ("T16") or score arithmetic. The rule logic stays in the core.
 */

/** "Juan D'Arienzo" → "D'Arienzo", "Carlos Di Sarli" → "Di Sarli", "Orquesta Típica Víctor" → "Típica Víctor" */
export function shortName(full: string): string {
  const w = full
    .replace(/\(.*?\)/g, "")
    .replace(/^Orquesta\s+/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (w.length < 2) return w[0] ?? full;
  const prev = w[w.length - 2]!.toLowerCase();
  if (["di", "de", "del", "da", "la", "típica", "tipica"].includes(prev))
    return `${w[w.length - 2]} ${w[w.length - 1]}`;
  return w[w.length - 1]!;
}

const BIG_FOUR_NAME: Record<string, string> = {
  "juan-d-arienzo": "D'Arienzo",
  "carlos-di-sarli": "Di Sarli",
  "anibal-troilo": "Troilo",
  "osvaldo-pugliese": "Pugliese",
};

const list = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
const uniq = <T>(xs: T[]) => [...new Set(xs)];
const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** one big-four problem ("A then B", "X again 3 tandas after tanda 4 (≥ 5)", "quartile 2 … has no big-four tanda") */
function bigFour(body: string): string {
  const parts = body
    .replace(/\s*\(no swap keeps the other rules\)\s*$/, "")
    .split(/;\s*/)
    .filter(Boolean);
  const pairs: string[] = [];
  const close: string[] = [];
  let gap: number | null = null;
  const quarters: string[] = [];
  const missing: string[] = [];
  for (const p of parts) {
    const adj = p.match(/^(.+?) then (.+)$/);
    if (adj) {
      pairs.push(`${shortName(adj[1]!)} and ${shortName(adj[2]!)}`);
      continue;
    }
    const again = p.match(/^(.+?) again (\d+) tandas? after tanda \d+ \(≥ (\d+)\)$/);
    if (again) {
      close.push(shortName(again[1]!));
      gap = Number(again[3]);
      continue;
    }
    const q = p.match(/^quartile (\d)/);
    if (q) {
      quarters.push(["first", "second", "third", "last"][Number(q[1]) - 1] ?? "one");
      continue;
    }
    const miss = p.match(/^no ([a-z-]+) tanda$/);
    if (miss) missing.push(BIG_FOUR_NAME[miss[1]!] ?? miss[1]!.replace(/-/g, " "));
  }
  const out: string[] = [];
  if (pairs.length)
    out.push(
      `The big four could not all be kept apart tonight: ${uniq(pairs).join(", ")} play back to back.`,
    );
  if (close.length)
    out.push(
      `The big four could not all be spaced ${gap ?? 5} tandas apart tonight; ${list(uniq(close))} come${uniq(close).length === 1 ? "s" : ""} back sooner.`,
    );
  if (quarters.length) out.push(`The ${list(uniq(quarters))} quarter of the night has no big-four tanda.`);
  if (missing.length) out.push(`${list(uniq(missing))} could not fit in tonight.`);
  return out.join(" ") || "The big four could not all be placed as the rules ask tonight.";
}

/** "no Ángel D'Agostino La Cumparsita near 1941; its 1950 version (Ángel Vargas) opens" and its siblings */
function cumparsita(where: "opening" | "closer", body: string): string {
  const verb = where === "opening" ? "opens" : "closes";
  const near = body.match(
    /^no (.+?) La Cumparsita near ([\d–]+); its (\d{4})(?: version)?(?: \((.+?)\))? (?:opens|closes)/,
  );
  if (near)
    return `${shortName(near[1]!)} has no La Cumparsita from around ${near[2]}; the ${near[3]} recording${near[4] ? ` with ${near[4]}` : ""} ${verb} instead.`;
  const none = body.match(
    /^(.+?) has no La Cumparsita; (.+?) (\d{4}) \((?:the same (\w+) style|the nearest year)\) (?:opens|closes)/,
  );
  if (none)
    return `${shortName(none[1]!)} never recorded La Cumparsita; ${shortName(none[2]!)}'s ${none[3]} version ${verb} instead${none[4] ? `, in the same ${none[4]} style` : ""}.`;
  if (/^no La Cumparsita to (?:open|close) with/.test(body))
    return `No La Cumparsita fits tonight, so the night ${where === "opening" ? "starts with the first tanda" : "ends on the última"}.`;
  const felicia = body.match(/^no Felicia recording/);
  if (felicia) return "No Felicia recording is available, so La Cumparsita closes instead.";
  const range = body.match(/^no La Cumparsita in (\d{4})–(\d{4}); (.+?) (\d{4}) closes/);
  if (range)
    return `No La Cumparsita was recorded in ${range[1]}–${range[2]}; ${shortName(range[3]!)}'s ${range[4]} version closes.`;
  return `${cap(where === "opening" ? "the opening La Cumparsita" : "the closing La Cumparsita")} had to change: ${clean(body)}.`;
}

/** what is left of an unknown note: no "key:" prefix, no ids or tanda codes, no "fell back" */
function clean(s: string): string {
  return s
    .replace(/^[a-zA-Z]+:\s*/, "")
    .replace(/\bT(\d{1,2})\b/g, "tanda $1")
    .replace(/\b[a-z]+(?:-[a-z]+)+-\d+[a-z0-9]*\b/g, "")
    .replace(/\(?\s*≥\s*\d+\s*\)?/g, "")
    .replace(/fell back/gi, "changed")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([;,.])/g, "$1")
    .trim()
    .replace(/[.;,]$/, "");
}

/** One engine note (a settingFallback, a cortina fallback) as one short sentence in the DJ's terms. */
export function djMessage(raw: string): string {
  const m = raw.match(/^([a-zA-Z]+):\s*(.*)$/s);
  const key = m?.[1] ?? "";
  const body = (m?.[2] ?? raw).trim();
  switch (key) {
    case "bigFour":
      return bigFour(body);
    case "opening":
      return cumparsita("opening", body);
    case "closer":
      return cumparsita("closer", body);
    case "opener": {
      const o = body.match(/^(.+?) has no tango tanda in the night's years/);
      return o
        ? `${shortName(o[1]!)} has no tango tanda in tonight's years, so another orchestra opens.`
        : `The opening tanda had to change: ${clean(body)}.`;
    }
    case "ultima": {
      const u = body.match(/^(.+?) has no tanda the night's years and gaps allow; (.+?) closes instead/);
      return u
        ? `${shortName(u[1]!)} could not take the última tonight; ${shortName(u[2]!)} closes instead.`
        : `The última had to change: ${clean(body)}.`;
    }
    case "vocalStyle": {
      const v = body.match(/^only (\d+) (\w+) families sing ([\w-]+)/);
      return v
        ? `Too few ${v[2]} singers in that style tonight, so both vocal styles play (never mixed in one tanda).`
        : `Vocal styles: ${clean(body)}.`;
    }
    case "cortinas": {
      const c = body.match(/^(.+?) has no Spotify-ready cue; (.+?) instead/);
      return c
        ? `No ${c[1]} cortina plays on Spotify, so ${c[2] === "the night's other families" ? "other cortinas" : c[2]!.replace(/ \/ /g, " or ")} play instead.`
        : `Cortinas: ${clean(body)}.`;
    }
  }
  // the cortina plan's own note: "<request> cortinas: only 3 in the pool, fewer than the 21 … needs; era-matched …"
  const pool = raw.match(/cortinas: only (\d+) in the pool, fewer than the (\d+)/);
  if (pool)
    return `Only ${pool[1]} cortinas match your choice and the night needs ${pool[2]}, so cortinas from the night's era fill in.`;
  return `${cap(clean(raw))}.`;
}

/** every note once, in order */
export function djMessages(raw: string[] | undefined | null): string[] {
  return uniq((raw ?? []).filter(Boolean).map(djMessage));
}

/**
 * A tanda's note as shown on its card: the engine writes some for itself ("now play in T16, so … take their chairs");
 * the card keeps the first clause in plain words and drops the bookkeeping.
 */
export function tandaNote(note: string): string {
  const moved = note.match(/^(.*?):\s+[^;]*\bnow play in T\d+[^;]*(?:;\s*it still ends on (.+))?$/);
  if (moved) return cap(`${moved[1]}${moved[2] ? `, ending on ${moved[2]}` : ""}`);
  return note.replace(/\bT(\d{1,2})\b/g, "tanda $1");
}
