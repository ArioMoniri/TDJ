import {
  applyNightEdits,
  type ComposeDeps,
  type EditOutcome,
  editCandidates,
  type Feedback,
  mentionedTandas,
  moveTanda,
  type NightEditOp,
  nightSummary,
  type Playlist,
  parseEditCommand,
  parseEditOps,
  replaceSide,
  songById,
} from "@tdj/core";
import type { ModelReply, ModelRequest, ToolSpec } from "./provider";

/**
 * Round 22 — "Edit with AI" in Compose: the DJ asks in words ("make tanda 7 calmer", "swap the 2nd song of tanda 3
 * for a Fiorentino"); one model call with a small context (the night summary, the candidate sides with their
 * catalogue ids, the orchestra ids) answers with the `edit_night` tool; the engine applies each edit through its own
 * rules (packages/core/src/nightEdit.ts). Plain module: the route, the tests (a mock model) and the apps call it.
 */
export const EDIT_TOOL: ToolSpec = {
  name: "edit_night",
  description:
    "Apply edits to the composed night. The engine checks every edit against the night's rules and refuses what would break it.",
  parameters: {
    type: "object",
    properties: {
      edits: {
        type: "array",
        description: "The smallest list of edits that does what the DJ asked, in order.",
        items: {
          type: "object",
          properties: {
            op: {
              type: "string",
              enum: ["swap", "move", "lock", "retune", "replace_tanda"],
              description:
                "swap: one side of a tanda; move: a tanda to another position; lock: keep a tanda when regenerating; retune: make a tanda calmer or livelier (the engine picks the sides); replace_tanda: a new tanda in the slot",
            },
            tanda: { type: "integer", description: "the tanda's number in the night summary (1-based)" },
            position: { type: "integer", description: "swap: the side's number in the tanda (1-based)" },
            songId: {
              type: "string",
              description: "swap: a catalogue id from the candidates; leave out for the engine's best fit",
            },
            to: { type: "integer", description: "move: the new position (1-based)" },
            locked: { type: "boolean", description: "lock: true to lock, false to unlock" },
            direction: { type: "string", enum: ["calmer", "livelier"], description: "retune, replace_tanda" },
            orchestraId: { type: "string", description: "replace_tanda: an orchestra id from this prompt" },
            singer: { type: "string", description: "replace_tanda: the singer's surname, e.g. Fiorentino" },
            songIds: {
              type: "array",
              items: { type: "string" },
              description: "replace_tanda: 3 to 4 catalogue ids of ONE orchestra from the candidates",
            },
          },
          required: ["op", "tanda"],
        },
      },
      note: { type: "string", description: "one short sentence for the DJ about what you did" },
    },
    required: ["edits"],
  },
};

const SYSTEM = `You edit a tango DJ's composed night. Answer by calling the tool edit_night once, with the smallest list of edits that does what the DJ asked.
Numbers are 1-based, as in the night summary: "tanda 7" is T7, "the 2nd song" is side 2.
Use only ids written in this prompt (song ids from the candidates, orchestra ids from the list); never invent or alter one.
A tanda is one orchestra (and one singer, or instrumental) in one rhythm. A side from another orchestra or singer cannot join it: replace the tanda instead (replace_tanda with orchestraId and singer).
For "calmer" / "livelier" use retune; the engine picks the sides. For "a <orchestra or singer>" use replace_tanda by orchestraId / singer unless a candidate side of that family fits the tanda.
The engine refuses any edit that breaks the night; do not try to work around it. No em-dashes.`;

export interface EditPromptExtras {
  /** what TDJ learned from the DJ's edits (describeLearned lines) */
  learned?: string[];
  houseRules?: string;
}
/** orchestra ids the model may name: the catalogue's dance orchestras (≥ 12 sides, tier 1–2) */
export function orchestraList(deps: ComposeDeps): string {
  return [...deps.catalog.byOrchestra.entries()]
    .filter(([id, s]) => s.length >= 12 && (deps.catalog.profile(id)?.tier ?? 3) <= 2)
    .map(([id, s]) => `${id} (${s[0]!.orchestra})`)
    .join(", ");
}

export function editPrompt(
  p: Playlist,
  deps: ComposeDeps,
  instruction: string,
  x: EditPromptExtras = {},
): { system: string; user: string; candidateIds: Set<string> } {
  const c = editCandidates(p, deps, instruction);
  const house = x.houseRules?.trim()
    ? `\n\nHOUSE RULES (this DJ's own):\n${x.houseRules.trim().slice(0, 1200)}`
    : "";
  const learned = x.learned?.length
    ? `\n\nWHAT THIS DJ PREFERS (learned from their edits): ${x.learned.slice(0, 8).join("; ")}`
    : "";
  const user = [
    `Request: ${instruction}`,
    "",
    nightSummary(p),
    c.text ? `\nCANDIDATES (catalogue ids):\n${c.text}` : "",
    `\nORCHESTRA IDS: ${orchestraList(deps)}`,
  ].join("\n");
  return { system: `${SYSTEM}${house}${learned}`, user, candidateIds: c.ids };
}

export { EDIT_EXAMPLES } from "./examples";

/** wave 2: the Adjust chip a whole-night request asks for (no tanda named): "more vals please" → more-vals */
const CHIP_WORDS: Array<[Feedback, RegExp]> = [
  ["more-vals", /\bmore\s+(?:vals|valses|valse|waltz(?:es)?)\b/i],
  ["more-milongas", /\bmore\s+milongas?\b/i],
  ["fewer-milongas", /\b(?:fewer|less)\s+milongas?\b/i],
  ["more-vocal", /\bmore\s+(?:vocals?|singers?|sung)\b/i],
  ["more-instrumental", /\bmore\s+instrumentals?\b/i],
  ["warmer-start", /\bwarmer\s+(?:start|beginning|opening)\b/i],
  ["stronger-finish", /\bstronger\s+(?:finish|end(?:ing)?)\b/i],
  ["fewer-repeats", /\b(?:fewer|less)\s+repeats?\b/i],
  ["more-variety", /\bmore\s+variety\b/i],
  ["shorter-cortinas", /\bshorter\s+cortinas?\b/i],
  ["longer-cortinas", /\blonger\s+cortinas?\b/i],
  ["earlier-peak", /\bearlier\s+peak\b/i],
  ["later-peak", /\blater\s+peak\b/i],
  ["more-romantic", /\bmore\s+romantic\b/i],
  ["more-playful", /\bmore\s+playful\b/i],
  ["more-dramatic", /\bmore\s+dramatic\b/i],
  ["more-energetic", /\b(?:more\s+energ(?:y|etic)|livelier|more\s+lively)\b/i],
  [
    "calmer",
    /^(?:(?:make\s+)?(?:it|the\s+night|everything)\s+)?(?:a\s+(?:bit|little)\s+)?(?:calmer|softer|gentler|quieter)\b/i,
  ],
];
export function chipOf(instruction: string, total = 30): Feedback | null {
  if (mentionedTandas(instruction, total).length) return null;
  for (const [f, re] of CHIP_WORDS) if (re.test(instruction)) return f;
  return null;
}

/**
 * A refused move says where the tanda could go instead: the nearest position that keeps every rule (the big four
 * apart, the gaps, the rhythm cycle), so "move tanda 2 after tanda 5" answers "position 4 works".
 */
export function withMoveSuggestions(p: Playlist, r: EditResult, deps: ComposeDeps): EditResult {
  if (!r.rejected.some((x) => x.op.op === "move")) return r;
  const n = p.tandas.length;
  const rejected = r.rejected.map((x) => {
    if (x.op.op !== "move") return x;
    const { tanda, to: want } = x.op;
    for (let d = 1; d < n; d++)
      for (const to of [want - d, want + d]) {
        if (to < 1 || to > n || to === tanda) continue;
        if (applyNightEdits(p, [{ op: "move", tanda, to }], deps).applied.length)
          return {
            ...x,
            reason: `${x.reason}; the nearest place that works is position ${to}`,
            suggest: `Move tanda ${tanda} to ${to}`,
          };
      }
    return x;
  });
  return { ...r, rejected };
}

export interface EditResult extends EditOutcome {
  /** who understood the request: the model, or the plain-words reader when there was no model or no edit */
  source: "model" | "words";
  ops: NightEditOp[];
  note?: string;
  /** what could not be read (the model's malformed edits, the words not understood) */
  notUnderstood: string[];
  /** wave 2: a whole-night request is an Adjust chip; the bar runs it */
  chip?: Feedback;
  rejected: Array<EditOutcome["rejected"][number] & { suggest?: string }>;
  /**
   * the first refused swap done as the DJ asked (the side in the chair, the tanda pinned as the DJ's): the client runs
   * the rule check on it and offers a suggestion or "Do it as I said" before anything is applied
   */
  asSaid?: { playlist: Playlist; tanda: number; reason: string };
}

/**
 * A refused swap of a named side, or a refused move (QA fix 2026-11: "move tanda 6 after tanda 8" only said "Not
 * done…"), done as asked: for the rule check's question — the same sheet as Build by hand, "Do it as I said / Only
 * tonight / Decline" — never applied here. A locked tanda is never moved.
 */
export function withAsSaid(r: EditResult, deps: ComposeDeps): EditResult {
  const mv = r.rejected.find((y) => y.op.op === "move");
  const x = r.rejected.find((y) => y.op.op === "swap" && !!y.op.songId);
  if (mv?.op.op === "move" && x?.op.op !== "swap") {
    const from = mv.op.tanda - 1;
    const t = r.playlist.tandas[from];
    if (!t || t.locked) return r;
    const f = moveTanda(r.playlist, from, mv.op.to - 1, deps);
    if (f.reason || f.playlist === r.playlist) return r;
    return { ...r, asSaid: { playlist: f.playlist, tanda: mv.op.to, reason: mv.reason } };
  }
  if (x?.op.op !== "swap" || !x.op.songId) return r;
  const s = songById(deps.catalog, x.op.songId);
  if (!s) return r;
  const f = replaceSide(r.playlist, x.op.tanda - 1, x.op.position - 1, s.id, deps, { force: true });
  if (f.playlist === r.playlist) return r;
  return { ...r, asSaid: { playlist: f.playlist, tanda: x.op.tanda, reason: x.reason } };
}

/** without a model: the plain-words reader, applied by the same engine */
export function editByWords(p: Playlist, deps: ComposeDeps, instruction: string): EditResult {
  const w = parseEditCommand(instruction, p, deps);
  const chip = w.ops.length ? null : chipOf(instruction, p.tandas.length);
  if (chip)
    return { playlist: p, applied: [], rejected: [], source: "words", ops: [], notUnderstood: [], chip };
  return withAsSaid(
    withMoveSuggestions(
      p,
      { ...applyNightEdits(p, w.ops, deps), source: "words", ops: w.ops, notUnderstood: w.unparsed },
      deps,
    ),
    deps,
  );
}

/** one model call, then the engine; a model answer with no usable edit falls back to the plain-words reader */
export async function editNight(o: {
  playlist: Playlist;
  instruction: string;
  deps: ComposeDeps;
  ask: (req: ModelRequest) => Promise<ModelReply>;
  extras?: EditPromptExtras;
}): Promise<EditResult> {
  const { system, user } = editPrompt(o.playlist, o.deps, o.instruction, o.extras);
  const reply = await o.ask({ system, user, tools: [EDIT_TOOL], maxTokens: 1500 });
  const parsed = parseEditOps(reply.toolCalls.length ? reply.toolCalls : reply.text);
  if (!parsed.ops.length) {
    const w = editByWords(o.playlist, o.deps, o.instruction);
    if (w.ops.length || w.chip) return { ...w, notUnderstood: [...parsed.errors, ...w.notUnderstood] };
    return {
      playlist: o.playlist,
      applied: [],
      rejected: [],
      source: "model",
      ops: [],
      note: parsed.note,
      notUnderstood: parsed.errors.length ? parsed.errors : [o.instruction],
    };
  }
  return withAsSaid(
    withMoveSuggestions(
      o.playlist,
      {
        ...applyNightEdits(o.playlist, parsed.ops, o.deps),
        source: "model",
        ops: parsed.ops,
        note: parsed.note,
        notUnderstood: parsed.errors,
      },
      o.deps,
    ),
    o.deps,
  );
}
