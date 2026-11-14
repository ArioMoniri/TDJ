import {
  applyNightEdits,
  type ComposeDeps,
  type EditOutcome,
  editCandidates,
  type NightEditOp,
  nightSummary,
  type Playlist,
  parseEditCommand,
  parseEditOps,
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

export interface EditResult extends EditOutcome {
  /** who understood the request: the model, or the plain-words reader when there was no model or no edit */
  source: "model" | "words";
  ops: NightEditOp[];
  note?: string;
  /** what could not be read (the model's malformed edits, the words not understood) */
  notUnderstood: string[];
}

/** without a model: the plain-words reader, applied by the same engine */
export function editByWords(p: Playlist, deps: ComposeDeps, instruction: string): EditResult {
  const w = parseEditCommand(instruction, p, deps);
  return { ...applyNightEdits(p, w.ops, deps), source: "words", ops: w.ops, notUnderstood: w.unparsed };
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
    if (w.ops.length) return { ...w, notUnderstood: [...parsed.errors, ...w.notUnderstood] };
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
  return {
    ...applyNightEdits(o.playlist, parsed.ops, o.deps),
    source: "model",
    ops: parsed.ops,
    note: parsed.note,
    notUnderstood: parsed.errors,
  };
}
