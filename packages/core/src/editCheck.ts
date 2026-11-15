import { lastFourKept, lastFourTangoBypass } from "./bypass";
import type { Catalog } from "./catalog";
import { bigFourProblems, tandaProblems, vocalStyleOf } from "./coherence";
import type { ComposeDeps } from "./compose";
import { isCumparsita, openingCumparsita } from "./cumparsita";
import { normTitle } from "./energy";
import { tandaTitleKeyOf, templateIdOf, templateMix } from "./learnedRules";
import { cortinaMissing } from "./score";
import { strictChecks } from "./strict";
import { renight, replaceSide, swapOptions, swapReason } from "./swap";
import { songRhythm, spreadCap } from "./tanda";
import type { LearnedPreferences, NightException, Playlist, Song, Tanda } from "./types";

/**
 * The rule check before an edit is applied (the DJ's swap, search-and-swap, a tanda replaced, pinned or moved, a side
 * added to a hand-built tanda, an AI edit, a booth version, a setting turned on over a pinned tanda). `checkEdit`
 * compares the night before and after the edit and returns what the edit itself breaks — never what the night
 * already broke — each with plain facts ("Garúa exists only with Alberto Podestá; the rest of this tanda is Juan Carlos
 * Casas"). It reuses the engine's own rules: the tanda coherence settings (coherence.ts tandaProblems), the singer and
 * year mix (learnedRules.ts templateMix), the rhythm (tanda.ts songRhythm), the big four (bigFourProblems), the
 * last-4-tango setting (bypass.ts), the cortina rule (score.ts), the energy step, the orchestra gap and the opening
 * Cumparsita (the strict panel, strict.ts). `suggestFixes` offers up to three concrete nights that keep the rule while
 * staying close to what the DJ asked; each one passes `checkEdit` for that rule.
 *
 * "hard": the edit breaks a tanda rule (the DJ is asked first); "soft": taste and flow (the edit applies, a toast
 * offers Undo and the suggestion). A DJ's "Do it as I said" is a one-night exception (`editExceptions`: the
 * NightException shape of the featured night's learning, scoped to the night's id): the strict panel accepts the tanda
 * in that night only, and it never becomes a template, a learned rule or a compose signal.
 */
export type EditRule =
  | "orchestra"
  | "rhythm"
  | "voice"
  | "singer"
  | "vocalStyle"
  | "years"
  | "repeat"
  | "lastFourTango"
  | "bigFour"
  | "backToBack"
  | "cortina"
  | "energyStep"
  | "cumparsitaOpener";
export type EditSeverity = "hard" | "soft";

export const EDIT_RULES: Record<EditRule, { severity: EditSeverity; label: string }> = {
  orchestra: { severity: "hard", label: "A tanda is one orchestra" },
  rhythm: { severity: "hard", label: "Every side is the tanda's rhythm" },
  voice: { severity: "hard", label: "A tanda is all instrumental or all sung" },
  singer: { severity: "hard", label: "A vocal tanda has one singer" },
  vocalStyle: { severity: "hard", label: "A vocal tanda keeps one vocal style" },
  years: { severity: "hard", label: "A tanda's sides are close in years" },
  repeat: { severity: "hard", label: "A song plays once a night" },
  lastFourTango: { severity: "hard", label: "Last 4 tandas tango only" },
  bigFour: { severity: "soft", label: "The big four spread over the night" },
  backToBack: { severity: "soft", label: "The same orchestra is never back to back" },
  cortina: { severity: "soft", label: "A cortina after every tanda" },
  energyStep: { severity: "soft", label: "Gentle energy steps between tandas" },
  cumparsitaOpener: { severity: "soft", label: "The opening La Cumparsita matches tanda 1" },
};

type Params = Record<string, string | number>;
/** a plain fact: an i18n key with its params, and the English sentence */
export interface EditFact {
  key: string;
  params: Params;
  text: string;
}
export interface RuleViolation {
  /** a stable rule code */
  rule: EditRule;
  severity: EditSeverity;
  /** 0-based tanda index (-1: the night, the opening) */
  tanda: number;
  /** the other tanda a pair rule involves (back to back, the energy step, the big-four gap) */
  with?: number;
  /** the sides involved, the edited one first */
  songIds: string[];
  /** the one-line message: an i18n key (en / tr) with its params */
  message: { key: string; params: Params };
  /** the message in English */
  text: string;
  facts: EditFact[];
}
export interface CheckEditOptions {
  /** the catalogue, for facts about other recordings ("Garúa exists only with …") */
  catalog?: Pick<Catalog, "byOrchestra">;
  /** the night's approved exceptions (only those of `after.id` count) */
  exceptions?: NightException[];
  /** "tandas": the tanda rules only (a hand-built draft) */
  scope?: "all" | "tandas";
}
export interface EditCheck {
  violations: RuleViolation[];
}
export interface EditSuggestion {
  /** stable within one answer */
  id: string;
  kind: "version" | "side" | "move" | "skip" | "position" | "cortina" | "opening";
  /** what changes, as an i18n key with params, and in English */
  message: { key: string; params: Params };
  text: string;
  /** the whole night with the suggestion applied */
  playlist: Playlist;
  /** the side it brings in, for a play / preview button */
  song?: Pick<Song, "id" | "title" | "orchestra" | "singer" | "year" | "spotify" | "resolved">;
}

type NightLike = Pick<Playlist, "tandas" | "options"> &
  Partial<Pick<Playlist, "id" | "closing" | "opening" | "stats">>;

const dance = (t: Pick<Tanda, "songs">) => t.songs.filter((s) => !isCumparsita(s));
const sig = (t: Pick<Tanda, "songs">) =>
  t.songs
    .map((s) => s.id)
    .sort()
    .join(",");
const fact = (key: string, params: Params, text: string): EditFact => ({ key, params, text });
const most = <T>(xs: T[]): T | undefined => {
  const m = new Map<T, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};
const singerKey = (s: Pick<Song, "singer">) => normTitle(s.singer ?? "");
const yearOf = (s: Pick<Song, "year" | "yearApprox">) => (s.year && !s.yearApprox ? s.year : null);
const styleWord = (st: string | null) =>
  st === "cantor" ? "singer-led" : st === "estribillo" ? "rhythm-led" : "unknown";

/** the sides of tanda i the edit brought in (all of them when the slot holds another tanda now) */
function editedSides(before: NightLike, after: NightLike, i: number): Song[] {
  const prev = new Set((before.tandas[i]?.songs ?? []).map((s) => s.id));
  return dance(after.tandas[i]!).filter((s) => !prev.has(s.id));
}

/** the odd side out of a tanda for a mix (the edited side when there is one, else the minority) */
function oddSide(
  sides: Song[],
  edited: Song[],
  keyOf: (s: Song) => string,
): { odd: Song; rest: Song[] } | null {
  if (sides.length < 2) return null;
  const major = most(sides.map(keyOf));
  const byEdit = edited.find((s) => keyOf(s) !== major) ?? edited[0];
  const odd = byEdit && keyOf(byEdit) !== major ? byEdit : sides.find((s) => keyOf(s) !== major);
  if (!odd) return null;
  return { odd, rest: sides.filter((s) => s.id !== odd.id && keyOf(s) === major) };
}

/** what one tanda breaks, keyed by what it is (its sides) — a key in both nights is not the edit's */
interface Problem {
  key: string;
  v: RuleViolation;
}

function violation(
  rule: EditRule,
  tanda: number,
  songIds: string[],
  params: Params,
  text: string,
  facts: EditFact[],
  w?: number,
): RuleViolation {
  return {
    rule,
    severity: EDIT_RULES[rule].severity,
    tanda,
    ...(w !== undefined ? { with: w } : {}),
    songIds,
    message: { key: `ruleCheck.rule.${rule}`, params: { tanda: tanda + 1, ...params } },
    text,
    facts,
  };
}

/** the facts about other recordings of a title by an orchestra (the catalogue's) */
function versionFact(
  odd: Song,
  restSinger: string | null,
  cat: CheckEditOptions["catalog"],
  restText: string,
): EditFact {
  const vs = (cat?.byOrchestra.get(odd.orchestraId) ?? []).filter(
    (s) => normTitle(s.title) === normTitle(odd.title) && !isCumparsita(s),
  );
  const singers = [...new Set(vs.map((s) => (s.vocal ? (s.singer ?? "") : "")))];
  const oddVoice = odd.vocal ? (odd.singer ?? "a singer") : "instrumental";
  if (vs.length && restSinger !== null) {
    const match = vs.find((s) =>
      restSinger === "" ? !s.vocal : s.vocal && normTitle(s.singer ?? "") === normTitle(restSinger),
    );
    if (match)
      return fact(
        "ruleCheck.fact.also_with",
        { title: odd.title, voice: restSinger || "instrumental", year: match.year ?? "", rest: restText },
        `${odd.title} also exists ${restSinger ? `with ${restSinger}` : "instrumental"}${match.year ? ` (${match.year})` : ""}; the rest of this tanda is ${restText}`,
      );
    if (singers.length === 1)
      return fact(
        "ruleCheck.fact.only_with",
        { title: odd.title, voice: oddVoice, rest: restText },
        `${odd.title} exists only ${odd.vocal ? `with ${oddVoice}` : "instrumental"}; the rest of this tanda is ${restText}`,
      );
  }
  return fact(
    "ruleCheck.fact.is_with",
    { title: odd.title, voice: oddVoice, rest: restText },
    `${odd.title} is ${odd.vocal ? `sung by ${oddVoice}` : "instrumental"}; the rest of this tanda is ${restText}`,
  );
}

/** the tanda rules: one orchestra, its rhythm, one voice, one singer, one vocal style, close years */
function tandaRuleProblems(before: NightLike, after: NightLike, i: number, cat: CheckEditOptions["catalog"]) {
  const t = after.tandas[i]!;
  const o = after.options;
  const sides = dance(t);
  const edited = editedSides(before, after, i);
  const out: Problem[] = [];
  const s0 = sig(t);
  const add = (rule: EditRule, v: RuleViolation, extra = "") =>
    out.push({ key: `${rule}|${s0}${extra}|${JSON.stringify(o.tandaRules ?? {})}`, v });
  // one orchestra
  const orch = oddSide(sides, edited, (s) => s.orchestraId);
  if (orch) {
    const rest = orch.rest[0]?.orchestra ?? t.orchestra;
    add(
      "orchestra",
      violation(
        "orchestra",
        i,
        [orch.odd.id, ...orch.rest.map((s) => s.id)],
        { title: orch.odd.title },
        `Tanda ${i + 1} mixes orchestras`,
        [
          fact(
            "ruleCheck.fact.orchestra",
            { title: orch.odd.title, orchestra: orch.odd.orchestra, rest },
            `${orch.odd.title} is by ${orch.odd.orchestra}; the rest of this tanda is ${rest}`,
          ),
        ],
      ),
    );
  }
  // the rhythm (as the strict panel: songRhythm)
  for (const s of sides)
    if (songRhythm(s) !== t.rhythm)
      add(
        "rhythm",
        violation(
          "rhythm",
          i,
          [s.id],
          { title: s.title },
          `Tanda ${i + 1} has a ${songRhythm(s)} in a ${t.rhythm} tanda`,
          [
            fact(
              "ruleCheck.fact.rhythm",
              { title: s.title, rhythm: songRhythm(s), tandaRhythm: t.rhythm },
              `${s.title} is a ${songRhythm(s)}; this is a ${t.rhythm} tanda`,
            ),
          ],
        ),
        `|${s.id}`,
      );
  const probs = tandaProblems(t, o);
  // one voice (the tanda rule "voice")
  if (probs.some((p) => p.key === "voice")) {
    const v = oddSide(sides, edited, (s) => (s.vocal ? "v" : "i"));
    if (v) {
      const restSinger = v.odd.vocal ? "" : (most(v.rest.map((s) => s.singer ?? "")) ?? "");
      const restText = v.odd.vocal ? "instrumental" : restSinger || "sung";
      add(
        "voice",
        violation(
          "voice",
          i,
          [v.odd.id, ...v.rest.map((s) => s.id)],
          { title: v.odd.title },
          `Tanda ${i + 1} mixes instrumental and sung sides`,
          [versionFact(v.odd, restSinger, cat, restText)],
        ),
      );
    }
  }
  // one singer (as the DJ's approvals read it: templateMix)
  if (templateMix(sides, t.rhythm).includes("singer")) {
    const vocal = sides.filter((s) => s.vocal && s.singer);
    const v = oddSide(vocal, edited, singerKey);
    if (v) {
      const restSinger = v.rest[0]?.singer ?? "";
      add(
        "singer",
        violation(
          "singer",
          i,
          [v.odd.id, ...v.rest.map((s) => s.id)],
          { title: v.odd.title, singer: v.odd.singer ?? "" },
          `Tanda ${i + 1} mixes singers`,
          [versionFact(v.odd, restSinger, cat, restSinger)],
        ),
      );
    }
  }
  // one vocal style
  if (probs.some((p) => p.key === "vocalStyle")) {
    const vocal = sides.filter((s) => s.vocal);
    const v = oddSide(vocal, edited, (s) => vocalStyleOf(s) ?? "?");
    if (v)
      add(
        "vocalStyle",
        violation(
          "vocalStyle",
          i,
          [v.odd.id, ...v.rest.map((s) => s.id)],
          { title: v.odd.title },
          `Tanda ${i + 1} mixes vocal styles`,
          [
            fact(
              "ruleCheck.fact.vocal_style",
              {
                title: v.odd.title,
                style: styleWord(vocalStyleOf(v.odd)),
                rest: styleWord(v.rest[0] ? vocalStyleOf(v.rest[0]) : null),
              },
              `${v.odd.title} is ${styleWord(vocalStyleOf(v.odd))}; the rest of this tanda is ${styleWord(v.rest[0] ? vocalStyleOf(v.rest[0]) : null)}`,
            ),
          ],
        ),
      );
  }
  // close years (tanda.ts spreadCap, as the tanda rule "years")
  if (probs.some((p) => p.key === "years")) {
    const dated = sides.filter((s) => yearOf(s));
    const ys = dated.map((s) => yearOf(s)!);
    const mid = ys.slice().sort((a, b) => a - b)[Math.floor(ys.length / 2)] ?? 0;
    const odd =
      edited.find((s) => yearOf(s)) ??
      dated.slice().sort((a, b) => Math.abs(yearOf(b)! - mid) - Math.abs(yearOf(a)! - mid))[0]!;
    const rest = dated.filter((s) => s.id !== odd.id).map((s) => yearOf(s)!);
    const cap = Math.min(
      spreadCap(
        t.rhythm,
        sides.some((s) => s.vocal),
      ),
      o.maxYearSpread ?? 4,
    );
    const lo = Math.min(...rest),
      hi = Math.max(...rest);
    const span = lo === hi ? `${lo}` : `${lo}–${hi}`;
    add(
      "years",
      violation(
        "years",
        i,
        [odd.id, ...dated.filter((s) => s.id !== odd.id).map((s) => s.id)],
        { title: odd.title },
        `Tanda ${i + 1} spreads over too many years`,
        [
          fact(
            "ruleCheck.fact.years",
            { title: odd.title, year: yearOf(odd)!, span, cap },
            `${odd.title} is from ${yearOf(odd)}; the rest of this tanda is ${span} (at most ${cap} years apart)`,
          ),
        ],
      ),
    );
  }
  return out;
}

/** a song (by its title) once a night: the titles the edit made repeat */
function repeatProblems(before: NightLike, after: NightLike): RuleViolation[] {
  const count = (n: NightLike) => {
    const m = new Map<string, number[]>();
    n.tandas.forEach((t, i) => {
      for (const s of dance(t)) m.set(normTitle(s.title), [...(m.get(normTitle(s.title)) ?? []), i]);
    });
    return m;
  };
  const a = count(before),
    b = count(after);
  const out: RuleViolation[] = [];
  for (const [title, idx] of b) {
    if (idx.length < 2 || idx.length <= (a.get(title)?.length ?? 0)) continue;
    // the tanda the edit touched (the side that is new in its slot), else the later one
    const at =
      idx.find((i) => editedSides(before, after, i).some((s) => normTitle(s.title) === title)) ?? idx.at(-1)!;
    const other = idx.find((i) => i !== at) ?? at;
    const s = dance(after.tandas[at]!).find((x) => normTitle(x.title) === title)!;
    const ids = idx.flatMap((i) =>
      dance(after.tandas[i]!)
        .filter((x) => normTitle(x.title) === title)
        .map((x) => x.id),
    );
    out.push(
      violation(
        "repeat",
        at,
        [s.id, ...ids.filter((x) => x !== s.id)],
        { title: s.title },
        `${s.title} plays twice tonight`,
        [
          fact(
            "ruleCheck.fact.repeat",
            { title: s.title, other: other + 1 },
            `${s.title} already plays in tanda ${other + 1}`,
          ),
        ],
        other,
      ),
    );
  }
  return out;
}

/** the tandas the DJ pinned that the last-4-tango setting would pass over (the DJ's own "skip tonight" is theirs) */
function lastFourProblems(after: NightLike): Problem[] {
  if (!after.options.rules?.lastFourTango) return [];
  const mine = new Set(after.tandas.map((t, i) => (t.bypass ? i : -1)).filter((i) => i >= 0));
  const out: Problem[] = [];
  for (const i of lastFourTangoBypass(after.tandas, mine, lastFourKept(after))) {
    const t = after.tandas[i]!;
    if (!t.pinned) continue;
    out.push({
      key: `lastFourTango|${sig(t)}`,
      v: violation(
        "lastFourTango",
        i,
        dance(t).map((s) => s.id),
        { rhythm: t.rhythm },
        `Last 4 tandas tango only would skip tanda ${i + 1}, which you pinned`,
        [
          fact(
            "ruleCheck.fact.last_four",
            { tanda: i + 1, rhythm: t.rhythm, orchestra: t.orchestra },
            `Tanda ${i + 1} (${t.orchestra}, ${t.rhythm}) is one of the last four tandas; the setting plays tango only there`,
          ),
        ],
      ),
    });
  }
  return out;
}

const unpinned = <N extends NightLike>(n: N): N => ({
  ...n,
  tandas: n.tandas.map((t) => (t.pinned ? { ...t, pinned: undefined } : t)),
  closingPinned: undefined,
});

/** the night's flow: the big four, back to back, the cortinas, the energy steps, the opening Cumparsita */
function flowProblems(after: NightLike): Problem[] {
  const t = after.tandas;
  const out: Problem[] = [];
  const at = (i: number) => (i >= 0 && t[i] ? sig(t[i]!) : "-");
  for (const p of bigFourProblems(t, after.options)) {
    const key =
      p.kind === "missing"
        ? `bigFour|missing|${p.detail}`
        : `bigFour|${p.kind}|${at(p.tanda)}|${at(p.with ?? -1)}`;
    const params: Params = { detail: p.detail };
    out.push({
      key: p.kind === "quartile" ? `bigFour|quartile|${p.detail}` : key,
      v: violation(
        "bigFour",
        p.tanda,
        p.tanda >= 0 ? dance(t[p.tanda]!).map((s) => s.id) : [],
        params,
        "The big four lose their spread",
        [
          fact(
            `ruleCheck.fact.big_four_${p.kind}`,
            { tanda: p.tanda + 1, other: (p.with ?? p.tanda) + 1, orchestra: t[p.tanda]?.orchestra ?? "" },
            p.kind === "adjacent"
              ? `${t[p.with!]!.orchestra} then ${t[p.tanda]!.orchestra}: two big-four tandas back to back`
              : p.kind === "gap"
                ? `${t[p.tanda]!.orchestra} plays again in tanda ${p.tanda + 1}, ${p.tanda - p.with!} tandas after tanda ${p.with! + 1}`
                : p.kind === "quartile"
                  ? `A quarter of the night (from tanda ${p.tanda + 1}) has no Di Sarli, D'Arienzo, Troilo or Pugliese`
                  : `The night has no ${p.detail.replace(/^no | tanda$/g, "")} tanda`,
          ),
        ],
        p.with,
      ),
    });
  }
  for (let i = 1; i < t.length; i++)
    if (t[i]!.orchestraId === t[i - 1]!.orchestraId)
      out.push({
        key: `backToBack|${at(i - 1)}|${at(i)}`,
        v: violation(
          "backToBack",
          i,
          dance(t[i]!).map((s) => s.id),
          { orchestra: t[i]!.orchestra },
          `${t[i]!.orchestra} plays back to back`,
          [
            fact(
              "ruleCheck.fact.back_to_back",
              { orchestra: t[i]!.orchestra, a: i, b: i + 1 },
              `${t[i]!.orchestra} plays tanda ${i} and tanda ${i + 1} back to back`,
            ),
          ],
          i - 1,
        ),
      });
  t.forEach((x, i) => {
    if (!cortinaMissing(after, i)) return;
    out.push({
      key: `cortina|${at(i)}|${at(i + 1)}`,
      v: violation("cortina", i, [], {}, `No cortina after tanda ${i + 1}`, [
        fact(
          "ruleCheck.fact.cortina",
          { tanda: i + 1, orchestra: x.orchestra },
          `Tanda ${i + 1} (${x.orchestra}) runs straight into tanda ${i + 2} with no cortina`,
        ),
      ]),
    });
  });
  // the energy step and the opening Cumparsita: the strict panel's own rules (the DJ's pins do not hide them here)
  if (after.closing !== undefined) {
    const sr = strictChecks(unpinned(after as Playlist));
    for (const v of sr.violations) {
      if (v.rule === "energyStep") {
        const a = t[v.tanda - 1]!,
          b = t[v.tanda]!;
        out.push({
          key: `energyStep|${at(v.tanda - 1)}|${at(v.tanda)}`,
          v: violation(
            "energyStep",
            v.tanda,
            dance(b).map((s) => s.id),
            { from: a.energy, to: b.energy },
            `A steep energy step into tanda ${v.tanda + 1}`,
            [
              fact(
                "ruleCheck.fact.energy_step",
                { a: v.tanda, b: v.tanda + 1, from: a.energy, to: b.energy },
                `Tanda ${v.tanda} has energy ${a.energy}, tanda ${v.tanda + 1} ${b.energy}: a step of ${Math.abs(b.energy - a.energy)}`,
              ),
            ],
            v.tanda - 1,
          ),
        });
      }
      if (v.rule === "cumparsitaOpener") {
        const op = after.opening;
        out.push({
          key: `cumparsitaOpener|${op?.id ?? "none"}|${at(0)}`,
          v: violation(
            "cumparsitaOpener",
            -1,
            op ? [op.id] : [],
            {},
            "The opening La Cumparsita no longer matches tanda 1",
            [
              fact(
                "ruleCheck.fact.opener",
                { opening: op?.orchestra ?? "", first: t[0]?.orchestra ?? "" },
                op
                  ? `The night opens with ${op.orchestra}'s La Cumparsita${op.year ? ` (${op.year})` : ""}; tanda 1 is ${t[0]?.orchestra}`
                  : `The night has no opening La Cumparsita before ${t[0]?.orchestra}`,
              ),
            ],
          ),
        });
      }
    }
  }
  return out;
}

/** what the night before the edit already broke (kept per night object: the suggestions re-check against it) */
interface BeforeKeys {
  tanda: Set<string>;
  slot: Set<string>;
  flow: Set<string>;
}
const BEFORE = { tandas: new WeakMap<object, BeforeKeys>(), all: new WeakMap<object, BeforeKeys>() };
function beforeKeys(before: NightLike, flow: boolean): BeforeKeys {
  const cache = flow ? BEFORE.all : BEFORE.tandas;
  const hit = cache.get(before);
  if (hit) return hit;
  const out: BeforeKeys = { tanda: new Set(), slot: new Set(), flow: new Set() };
  before.tandas.forEach((_t, i) => {
    for (const p of tandaRuleProblems(before, before, i, undefined)) {
      out.tanda.add(p.key);
      out.slot.add(`${p.v.rule}@${i}`);
    }
  });
  if (flow) for (const p of [...lastFourProblems(before), ...flowProblems(before)]) out.flow.add(p.key);
  cache.set(before, out);
  return out;
}

/** the exceptions of this night that cover tanda i for `rule` */
export function exceptionCovers(
  exceptions: readonly NightException[] | undefined,
  night: Pick<Playlist, "id" | "tandas">,
  i: number,
  rule: string,
): boolean {
  const t = night.tandas[i];
  if (!t || !exceptions?.length) return false;
  const ids = templateIdOf(t);
  const titles = tandaTitleKeyOf(t);
  return exceptions.some(
    (x) =>
      x.nightId === night.id &&
      (!x.rules || x.rules.includes(rule)) &&
      (x.tandaId === ids ||
        `${x.rhythm}|${[...x.orchestraIds].sort().join("+")}|${x.titles.join(",")}` === titles),
  );
}

/**
 * What the edit `before` → `after` breaks that the night did not break before it, each with plain facts. An empty
 * list: the edit applies with no question.
 */
export function checkEdit(before: NightLike, after: NightLike, options: CheckEditOptions = {}): EditCheck {
  const cat = options.catalog;
  const was = beforeKeys(before, options.scope !== "tandas");
  const fresh: RuleViolation[] = [];
  after.tandas.forEach((_t, i) => {
    const edited = new Set(editedSides(before, after, i).map((s) => s.id));
    for (const p of tandaRuleProblems(before, after, i, cat)) {
      if (was.tanda.has(p.key)) continue;
      // a slot that already broke the rule: only a side the edit brought in makes it the edit's
      if (was.slot.has(`${p.v.rule}@${i}`) && !edited.has(p.v.songIds[0]!)) continue;
      fresh.push(p.v);
    }
  });
  fresh.push(...repeatProblems(before, after));
  if (options.scope !== "tandas") {
    for (const p of lastFourProblems(after)) if (!was.flow.has(p.key)) fresh.push(p.v);
    for (const p of flowProblems(after)) if (!was.flow.has(p.key)) fresh.push(p.v);
  }
  const night = { id: after.id ?? "", tandas: after.tandas };
  const seen = new Set<string>();
  const violations = fresh
    .filter((v) => !(v.tanda >= 0 && exceptionCovers(options.exceptions, night, v.tanda, v.rule)))
    .filter((v) => {
      const k = `${v.rule}|${v.tanda}|${v.text}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => Number(a.severity === "soft") - Number(b.severity === "soft") || a.tanda - b.tanda);
  return { violations };
}

export const hardViolations = (c: EditCheck) => c.violations.filter((v) => v.severity === "hard");

/** the rules a side breaks inside its tanda (the suggestions work on its sides) */
const TANDA_RULES = new Set<EditRule>([
  "orchestra",
  "rhythm",
  "voice",
  "singer",
  "vocalStyle",
  "years",
  "repeat",
]);

/* ---------- suggestions ---------- */

const pick = (s: Song): EditSuggestion["song"] => ({
  id: s.id,
  title: s.title,
  orchestra: s.orchestra,
  singer: s.singer,
  year: s.year,
  spotify: s.spotify,
  resolved: s.resolved,
});

/** the tanda back as it was before the edit (its pin and lock), the sides as they are */
function restoreFlags(before: Playlist, p: Playlist, i: number): Playlist {
  const b = before.tandas.find((t) => sig(t) === sig(p.tandas[i]!)) ?? before.tandas[i];
  const t = p.tandas[i]!;
  const { pinned: _p, ...rest } = t;
  const nt: Tanda = { ...rest, locked: b?.locked ?? false, ...(b?.pinned ? { pinned: b.pinned } : {}) };
  return { ...p, tandas: p.tandas.map((x, k) => (k === i ? nt : x)) };
}

const tryRenight = (p: Playlist, tandas: Tanda[]): Playlist => {
  try {
    return renight(p, tandas);
  } catch {
    return { ...p, tandas };
  }
};

function move(p: Playlist, from: number, to: number): Playlist {
  const tandas = p.tandas.slice();
  const [t] = tandas.splice(from, 1);
  tandas.splice(to, 0, t!);
  // the cortinas stay with their place in the night (none after the última)
  const cues = p.tandas.map((x) => x.cortina);
  return tryRenight(
    p,
    tandas.map((x, i) => ({ ...x, index: i + 1, cortina: cues[i] ?? null })),
  );
}

/**
 * Up to three concrete nights that keep `violation`'s rule while staying as close to the DJ's edit as they can: the
 * same title by another recording of the tanda's orchestra and singer, a side of the same orchestra / singer / years,
 * the edited side in a tanda it fits, the tanda in another place, the setting kept with the tanda skipped tonight.
 * Every suggestion passes `checkEdit` for that rule.
 */
export function suggestFixes(
  before: Playlist,
  after: Playlist,
  v: RuleViolation,
  deps: ComposeDeps,
  max = 3,
): EditSuggestion[] {
  const out: EditSuggestion[] = [];
  // a suggestion keeps this rule and adds no hard violation the DJ's edit did not already bring (another pinned
  // tanda under the same setting stays the DJ's question)
  // (by the sides a violation names, so a suggestion that moves a tanda is judged on the same tandas)
  const idOf = (x: RuleViolation) =>
    `${x.rule}|${x.songIds.slice().sort().join(",")}|${x.songIds.length ? "" : x.tanda}`;
  const known = new Set(hardViolations(checkEdit(before, after)).map(idOf));
  const inTanda = TANDA_RULES.has(v.rule);
  const same = (x: RuleViolation) =>
    x.rule === v.rule &&
    (v.tanda < 0 ||
      x.rule === "repeat" ||
      x.songIds.some((id) => v.songIds.includes(id)) ||
      ((inTanda || !v.songIds.length) && x.tanda === v.tanda));
  const ok = (p: Playlist) => {
    const c = checkEdit(before, p);
    return !c.violations.some(same) && hardViolations(c).every((x) => known.has(idOf(x)));
  };
  const push = (s: Omit<EditSuggestion, "id">) => {
    if (out.length >= max || out.some((x) => x.text === s.text)) return;
    if (!ok(s.playlist)) return;
    out.push({ id: `${v.rule}-${out.length + 1}`, ...s });
  };
  const i = v.tanda;
  const tandaRule = TANDA_RULES.has(v.rule);
  if (tandaRule && i >= 0 && after.tandas[i]) {
    const t = after.tandas[i]!;
    const odd = t.songs.find((s) => s.id === v.songIds[0]);
    const k = odd ? t.songs.indexOf(odd) : -1;
    if (odd && k >= 0) {
      // the tanda as it was before the edit, so a suggestion is the DJ's edit, done within the rule
      const base = restoreFlags(before, after, i);
      const others = t.songs.filter((_, j) => j !== k);
      const orch = most(others.map((s) => s.orchestraId)) ?? t.orchestraId;
      const voc = others.filter((s) => s.vocal);
      const singer = most(voc.map((s) => s.singerId ?? null));
      // 1) the same title by another recording of the tanda's orchestra and singer
      const versions = (deps.catalog.byOrchestra.get(orch) ?? [])
        .filter((s) => normTitle(s.title) === normTitle(odd.title) && s.id !== odd.id)
        .filter((s) => !swapReason(base, i, k, s, deps))
        .sort((a, b) => (b.fame ?? 0) - (a.fame ?? 0));
      for (const s of versions.slice(0, 2)) {
        const r = replaceSide(base, i, k, s.id, deps);
        if (r.reason) continue;
        const voice = s.vocal ? (s.singer ?? "") : "instrumental";
        push({
          kind: "version",
          message: {
            key: "ruleCheck.suggest.version",
            params: { title: s.title, voice, year: s.year ?? "" },
          },
          text: `${s.title} with ${voice}${s.year ? ` (${s.year})` : ""}, the version that fits this tanda`,
          playlist: r.playlist,
          song: pick(s),
        });
      }
      // 2) a side of the same orchestra, singer and years
      // (not the side the DJ took out: that is Cancel)
      const was = before.tandas[i]?.songs[k]?.id;
      const fits = swapOptions(base, i, k, deps, { limit: 6 }).suggestions.filter(
        (x) =>
          x.ok &&
          x.song.id !== was &&
          (singer === undefined || !x.song.vocal || (x.song.singerId ?? null) === singer),
      );
      for (const x of fits.slice(0, 2)) {
        const r = replaceSide(base, i, k, x.song.id, deps);
        if (r.reason) continue;
        push({
          kind: "side",
          message: {
            key: "ruleCheck.suggest.side",
            params: { title: x.song.title, year: x.song.year ?? "", orchestra: x.song.orchestra },
          },
          text: `${x.song.title}${x.song.year ? ` (${x.song.year})` : ""} instead: the same orchestra, singer and years`,
          playlist: r.playlist,
          song: pick(x.song),
        });
      }
      // 3) the DJ's side in a tanda it fits (the edited tanda back as it was)
      const restored = before.tandas[i] && sig(before.tandas[i]!) !== sig(t) ? before : null;
      if (restored) {
        const order = restored.tandas
          .map((_, j) => j)
          .filter((j) => j !== i)
          .sort((a, b) => Math.abs(a - i) - Math.abs(b - i));
        let done = false;
        for (const j of order) {
          if (done) break;
          const tj = restored.tandas[j]!;
          if (tj.rhythm !== odd.rhythm || tj.orchestraId !== odd.orchestraId) continue;
          for (let m = 0; m < tj.songs.length && !done; m++) {
            const r = replaceSide(restored, j, m, odd.id, deps);
            if (r.reason) continue;
            done = true;
            push({
              kind: "move",
              message: {
                key: "ruleCheck.suggest.move",
                params: { title: odd.title, tanda: j + 1, replaced: tj.songs[m]!.title },
              },
              text: `${odd.title} in tanda ${j + 1} instead (for ${tj.songs[m]!.title}); tanda ${i + 1} stays as it was`,
              playlist: r.playlist,
              song: pick(odd),
            });
          }
        }
      }
    }
  }
  if (v.rule === "lastFourTango" && i >= 0) {
    const t = after.tandas[i]!;
    // keep the setting, move the pinned tanda out of the last four (nearest tango slot first)
    const n = after.tandas.length;
    for (let to = n - 5; to >= 0 && out.length < max - 1; to--) {
      const p = move(after, i, to);
      if (!lastFourProblems(p).some((x) => x.v.tanda === to)) {
        push({
          kind: "position",
          message: { key: "ruleCheck.suggest.position", params: { tanda: i + 1, to: to + 1 } },
          text: `Keep the setting and move tanda ${i + 1} to place ${to + 1}, where it plays`,
          playlist: p,
        });
        break;
      }
    }
    // keep the setting, skip the tanda tonight (it stays in the night and its exports)
    push({
      kind: "skip",
      message: { key: "ruleCheck.suggest.skip", params: { tanda: i + 1 } },
      text: `Keep the setting and skip tanda ${i + 1} tonight (${t.orchestra}, ${t.rhythm})`,
      playlist: { ...after, tandas: after.tandas.map((x, k) => (k === i ? { ...x, bypass: true } : x)) },
    });
  }
  if ((v.rule === "backToBack" || v.rule === "energyStep" || v.rule === "bigFour") && i >= 0) {
    // the nearest place where the tanda keeps the rule (one suggestion; the night keeps its cortinas in place)
    const n = after.tandas.length;
    const had = out.length;
    for (let d = 1; d < Math.min(n, 8) && out.length === had; d++)
      for (const to of [i - d, i + d]) {
        if (to < 0 || to >= n || out.length > had) continue;
        push({
          kind: "position",
          message: { key: "ruleCheck.suggest.position", params: { tanda: i + 1, to: to + 1 } },
          text: `Move tanda ${i + 1} to place ${to + 1}`,
          playlist: move(after, i, to),
        });
      }
  }
  if (v.rule === "cortina" && i >= 0 && before.tandas.length === after.tandas.length) {
    // the cortinas keep their places in the night
    const tandas = after.tandas.map((x, k) => ({ ...x, cortina: before.tandas[k]!.cortina }));
    push({
      kind: "cortina",
      message: { key: "ruleCheck.suggest.cortina", params: { tanda: i + 1 } },
      text: `Keep a cortina after every tanda (each place keeps its cortina)`,
      playlist: tryRenight(after, tandas),
    });
  }
  if (v.rule === "cumparsitaOpener" && after.tandas[0]) {
    const r = openingCumparsita(deps.catalog, after.options, after.tandas[0], after.closing);
    if (r.song && r.song.id !== after.opening?.id)
      push({
        kind: "opening",
        message: {
          key: "ruleCheck.suggest.opening",
          params: { orchestra: r.song.orchestra, year: r.song.year ?? "" },
        },
        text: `Open with ${r.song.orchestra}'s La Cumparsita${r.song.year ? ` (${r.song.year})` : ""}, which matches tanda 1`,
        playlist: tryRenight({ ...after, opening: r.song }, after.tandas),
        song: pick(r.song),
      });
  }
  return out;
}

/* ---------- the DJ's one-night approval ---------- */

/**
 * "Do it as I said": the edited night with each tanda the hard violations sit on pinned as the DJ's and marked as a
 * one-night exception (Tanda.pinned.exception, this night's id only), and the NightException records for the DJ's
 * memory — the same shape the featured night's learning keeps (learnedRules.ts nightExceptionKeys reads both).
 */
export function approveEdit(
  after: Playlist,
  violations: RuleViolation[],
  reason: string,
  at = new Date().toISOString(),
): { playlist: Playlist; exceptions: NightException[] } {
  const by = new Map<number, Set<string>>();
  for (const v of violations)
    if (v.severity === "hard" && v.tanda >= 0 && after.tandas[v.tanda])
      by.set(v.tanda, new Set([...(by.get(v.tanda) ?? []), v.rule]));
  const exceptions: NightException[] = [];
  const tandas = after.tandas.map((t, i) => {
    const rules = by.get(i);
    if (!rules) return t;
    const had = t.pinned?.exception?.nightId === after.id ? t.pinned.exception.rules : [];
    const all = [...new Set([...had, ...rules])];
    const nt: Tanda = {
      ...t,
      locked: true,
      pinned: {
        by: "dj",
        reason: t.pinned?.reason ?? reason,
        at: t.pinned?.at ?? at,
        exception: { nightId: after.id, rules: all },
      },
    };
    exceptions.push({
      nightId: after.id,
      tandaId: templateIdOf(nt),
      rhythm: nt.rhythm,
      orchestraIds: [...new Set(nt.songs.map((s) => s.orchestraId))],
      titles: nt.songs.map((s) => normTitle(s.title)),
      reason,
      mixed: templateMix(dance(nt), nt.rhythm),
      name: `${[...new Set(nt.songs.map((s) => s.orchestra))].join(" + ")} · ${nt.songs.map((s) => s.title).join(", ")}`,
      at,
      rules: all,
      source: "dj",
    });
    return nt;
  });
  return { playlist: { ...after, tandas }, exceptions };
}

/** the DJ's learned store with these one-night exceptions recorded (a tanda's earlier record for the night replaced) */
export function recordExceptions(
  L: LearnedPreferences | undefined,
  exs: NightException[],
): LearnedPreferences {
  const base: LearnedPreferences = L ? { ...L } : {};
  const keep = (base.night?.exceptions ?? []).filter(
    (x) => !exs.some((y) => y.nightId === x.nightId && y.tandaId === x.tandaId),
  );
  return { ...base, night: { ...(base.night ?? {}), exceptions: [...exs, ...keep] } };
}

/** one exception removed (Database → Memory, the night's panel): the tanda is judged by the rules again */
export function forgetException(
  L: LearnedPreferences | undefined,
  nightId: string,
  tandaId: string | undefined,
): LearnedPreferences | undefined {
  if (!L?.night?.exceptions) return L;
  return {
    ...L,
    night: {
      ...L.night,
      exceptions: L.night.exceptions.filter((x) => !(x.nightId === nightId && x.tandaId === tandaId)),
    },
  };
}

/** the night with an exception's marker taken off its tanda (the pin stays: the DJ chose the sides) */
export function withoutExceptionMarker(p: Playlist, tandaId: string | undefined): Playlist {
  return {
    ...p,
    tandas: p.tandas.map((t) => {
      if (!t.pinned?.exception || templateIdOf(t) !== tandaId) return t;
      const { exception: _e, ...pin } = t.pinned;
      return { ...t, pinned: pin };
    }),
  };
}

/** the DJ's one-night exceptions of this night (their memory), for the night's panel and Database → Memory */
export const djNightExceptions = (L: LearnedPreferences | undefined, nightId?: string): NightException[] =>
  (L?.night?.exceptions ?? []).filter((x) => x.source === "dj" && (!nightId || x.nightId === nightId));
