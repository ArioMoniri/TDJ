import { BIG_FOUR_SHORT, orchestraShortName } from "@tdj/core";
import { capFirst, fmtList, getLocale, type MsgKey, t } from "@/lib/i18n";

/**
 * Wave 2 — the engine's notes in the DJ's words. The core records each setting it could not keep (stats
 * .settingFallbacks: "bigFour: …", "opening: …", "closer: …") and each improve pass with its scores; the UI never prints
 * those as they are. Every known form maps to one short sentence; an unknown one keeps its words without the
 * "key:" prefix, catalogue ids, tanda codes ("T16") or score arithmetic. The rule logic stays in the core.
 * Wave 3: the sentences are in the DJ's language (lib/i18n); the core's own words inside them (names, years) are not.
 */

/**
 * "Juan D'Arienzo" → "D'Arienzo", "Carlos Di Sarli" → "Di Sarli", "Orquesta Típica Víctor" → "Típica Víctor"
 * (2026-11: one implementation, @tdj/core nightShape.ts)
 */
export const shortName = (full: string): string => orchestraShortName(full, "dj");

const BIG_FOUR_NAME = BIG_FOUR_SHORT;

/** "A, B and C" in the DJ's language */
const list = (xs: string[]) => fmtList(xs);
const uniq = <T>(xs: T[]) => [...new Set(xs)];
const cap = capFirst;
/** the core's style words ("rhythmic", "lyrical"…) in the DJ's language; an unknown one as it is */
function styleWord(w: string): string {
  const k = `djMessage.style.${w.toLowerCase()}` as MsgKey;
  const v = t(k);
  return v === k ? w : v;
}

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
      pairs.push(t("djMessage.pair", { a: shortName(adj[1]!), b: shortName(adj[2]!) }));
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
      quarters.push(
        [t("djMessage.q1"), t("djMessage.q2"), t("djMessage.q3"), t("djMessage.q4")][Number(q[1]) - 1] ??
          t("djMessage.q_one"),
      );
      continue;
    }
    const miss = p.match(/^no ([a-z-]+) tanda$/);
    if (miss) missing.push(BIG_FOUR_NAME[miss[1]!] ?? miss[1]!.replace(/-/g, " "));
  }
  const out: string[] = [];
  if (pairs.length) out.push(t("djMessage.big_four_apart", { pairs: uniq(pairs).join(", ") }));
  if (close.length)
    out.push(
      t(uniq(close).length === 1 ? "djMessage.big_four_spaced_one" : "djMessage.big_four_spaced_many", {
        gap: gap ?? 5,
        names: list(uniq(close)),
      }),
    );
  if (quarters.length) out.push(t("djMessage.big_four_quarter", { quarters: list(uniq(quarters)) }));
  if (missing.length) out.push(t("djMessage.big_four_missing", { names: list(uniq(missing)) }));
  return out.join(" ") || t("djMessage.big_four_rules");
}

/** "no Ángel D'Agostino La Cumparsita near 1941; its 1950 version (Ángel Vargas) opens" and its siblings */
function cumparsita(where: "opening" | "closer", body: string): string {
  const verb = where === "opening" ? t("djMessage.opens") : t("djMessage.closes");
  const near = body.match(
    /^no (.+?) La Cumparsita near ([\d–]+); its (\d{4})(?: version)?(?: \((.+?)\))? (?:opens|closes)/,
  );
  if (near)
    return t(near[4] ? "djMessage.cumparsita_near_with" : "djMessage.cumparsita_near", {
      orchestra: shortName(near[1]!),
      years: near[2],
      year: near[3],
      singer: near[4] ?? "",
      verb,
    });
  // (2026-11: "… has no La Cumparsita near its years (±12) — its nearest is 1964; …"; older notes said only "has no")
  const none = body.match(
    /^(.+?) has no La Cumparsita(?: near its years \(±(\d+)\))?(?: — its nearest is \d{4})?; (.+?) (\d{4}) \((?:the same (\w+) style|the nearest year)\) (?:opens|closes)/,
  );
  if (none)
    return t(none[5] ? "djMessage.cumparsita_never_style" : "djMessage.cumparsita_never", {
      orchestra: shortName(none[1]!),
      window: none[2] ?? "12",
      other: shortName(none[3]!),
      year: none[4],
      style: none[5] ? styleWord(none[5]) : "",
      verb,
    });
  if (/^no La Cumparsita to (?:open|close) with/.test(body))
    return where === "opening" ? t("djMessage.no_cumparsita_open") : t("djMessage.no_cumparsita_close");
  const felicia = body.match(/^no Felicia recording/);
  if (felicia) return t("djMessage.no_felicia");
  const range = body.match(/^no La Cumparsita in (\d{4})–(\d{4}); (.+?) (\d{4}) closes/);
  if (range)
    return t("djMessage.cumparsita_range", {
      from: range[1],
      to: range[2],
      orchestra: shortName(range[3]!),
      year: range[4],
    });
  return t(where === "opening" ? "djMessage.opening_changed" : "djMessage.closing_changed", {
    why: clean(body),
  });
}

/** what is left of an unknown note: no "key:" prefix, no ids or tanda codes, no "fell back" */
function clean(s: string): string {
  return s
    .replace(/^[a-zA-Z]+:\s*/, "")
    .replace(/\bT(\d{1,2})\b/g, (_, n: string) => t("djMessage.tanda_n", { n }))
    .replace(/\b[a-z]+(?:-[a-z]+)+-\d+[a-z0-9]*\b/g, "")
    .replace(/\(?\s*≥\s*\d+\s*\)?/g, "")
    .replace(/fell back/gi, t("djMessage.changed"))
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
        ? t("djMessage.opener", { orchestra: shortName(o[1]!) })
        : t("djMessage.opener_changed", { why: clean(body) });
    }
    case "ultima": {
      const u = body.match(/^(.+?) has no tanda the night's years and gaps allow; (.+?) closes instead/);
      return u
        ? t("djMessage.ultima", { orchestra: shortName(u[1]!), other: shortName(u[2]!) })
        : t("djMessage.ultima_changed", { why: clean(body) });
    }
    case "vocalStyle": {
      const v = body.match(/^only (\d+) (\w+) families sing ([\w-]+)/);
      return v
        ? t("djMessage.vocal_style", { rhythm: v[2] })
        : t("djMessage.vocal_style_other", { why: clean(body) });
    }
    case "cortinas": {
      const c = body.match(/^(.+?) has no Spotify-ready cue; (.+?) instead/);
      return c
        ? t("djMessage.cortinas_spotify", {
            wanted: c[1],
            instead:
              c[2] === "the night's other families"
                ? t("djMessage.other_cortinas")
                : c[2]!.split(/ \/ /).join(t("djMessage.or")),
          })
        : t("djMessage.cortinas_other", { why: clean(body) });
    }
  }
  // the cortina plan's own note: "<request> cortinas: only 3 in the pool, fewer than the 21 … needs; era-matched …"
  const pool = raw.match(/cortinas: only (\d+) in the pool, fewer than the (\d+)/);
  if (pool) return t("djMessage.cortina_pool", { have: pool[1], need: pool[2] });
  // 2026-11 (DJ review: "the DJ's Di Sarli tanda (…)" in English on a Turkish screen): a note about the DJ's own
  // pinned tanda says so in the DJ's language; any other unknown note keeps its words in English only, elsewhere a
  // plain sentence in the DJ's language (the core's raw English never reaches a translated screen)
  if (/\bthe DJ's\b|\bDJ's choice\b|\bpinned\b/i.test(raw)) return t("djMessage.pinned_kept");
  if (getLocale() !== "en") return t("djMessage.other_note");
  return `${cap(clean(raw))}.`;
}

/** every note once, in order */
export function djMessages(raw: string[] | undefined | null): string[] {
  return uniq((raw ?? []).filter(Boolean).map(djMessage));
}

/** the composer's short tanda notes (core compose.ts, tanda.ts) */
const NOTE_PART: Record<string, MsgKey> = {
  "colour tanda": "djMessage.note.colour",
  "a known family inside the repeat gap (fame floor)": "djMessage.note.fame_floor",
  "ends with its own La Cumparsita": "djMessage.note.own_cumparsita",
  "pool-small": "djMessage.note.pool_small",
};

/**
 * A tanda's note as shown on its card: the engine writes some for itself ("now play in T16, so … take their chairs");
 * the card keeps the first clause in plain words and drops the bookkeeping.
 */
export function tandaNote(note: string): string {
  // 2026-11 (QA: "the DJ's Canaro valses, instrumental (…)" on a Turkish card): the note a DJ's own tanda carries
  // is English data; another language says what it is
  if (getLocale() !== "en" && /^the DJ's\b/i.test(note)) return t("djMessage.djs_tanda");
  // the composer's own short notes, joined by " · ": each known one in the DJ's language, a Spanish name as it is
  // (a birthday vals), any other English bookkeeping left out of a translated card
  if (getLocale() !== "en")
    return note
      .split(" · ")
      .map((p) =>
        NOTE_PART[p] ? t(NOTE_PART[p]!) : /\b(de|del|la|el)\b/.test(p) && !/\bthe\b/.test(p) ? p : "",
      )
      .filter(Boolean)
      .join(" · ");
  const moved = note.match(/^(.*?):\s+[^;]*\bnow play in T\d+[^;]*(?:;\s*it still ends on (.+))?$/);
  if (moved)
    return cap(moved[2] ? t("djMessage.ending_on", { note: moved[1], song: moved[2] }) : (moved[1] ?? ""));
  return note.replace(/\bT(\d{1,2})\b/g, (_, n: string) => t("djMessage.tanda_n", { n }));
}
