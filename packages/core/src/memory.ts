import type { AgentMemory, ComposeOptions, Playlist } from "./types";

export const emptyMemory = (): AgentMemory => ({ notes: [], feedbackHistory: [], sets: [], preferences: {} });

/** Learned preferences sit under explicit options: memory never overrides what the DJ set tonight. */
export function applyMemory(
  partial: Partial<ComposeOptions>,
  memory?: AgentMemory | null,
): Partial<ComposeOptions> {
  if (!memory?.preferences) return partial;
  const { rules, context, ...prefs } = memory.preferences;
  return {
    ...prefs,
    ...partial,
    rules: { ...(rules ?? {}), ...(partial.rules ?? {}) },
    context: { ...(context ?? {}), ...(partial.context ?? {}) },
  };
}

/** Record a composed set (keeps the last 50). */
export function rememberSet(memory: AgentMemory, p: Playlist, liked?: boolean): AgentMemory {
  const entry = {
    at: new Date().toISOString(),
    id: p.id,
    name: p.name,
    hours: p.options.hours,
    eras: p.options.eras,
    score: p.score.total,
    context: p.options.context,
    liked,
  };
  return {
    ...memory,
    sets: [entry, ...memory.sets.filter((s) => s.id !== p.id)].slice(0, 50),
    updatedAt: entry.at,
  };
}

export function rememberFeedback(
  memory: AgentMemory,
  playlistId: string,
  feedback: string[],
  instruction?: string,
): AgentMemory {
  const at = new Date().toISOString();
  // repeated feedback becomes a learned preference
  const counts = new Map<string, number>();
  for (const f of [...memory.feedbackHistory.flatMap((h) => h.feedback), ...feedback])
    counts.set(f, (counts.get(f) ?? 0) + 1);
  const prefs = { ...memory.preferences };
  if ((counts.get("more-energetic") ?? 0) >= 3) prefs.floorMood = "energetic";
  if ((counts.get("calmer") ?? 0) >= 3) prefs.floorMood = "romantic";
  if ((counts.get("more-vals") ?? 0) >= 2) {
    prefs.pattern = "custom";
    prefs.customPattern = "TTVTTMTTV";
  }
  if ((counts.get("shorter-cortinas") ?? 0) >= 2) prefs.cortinaLengthSec = 30;
  if ((counts.get("fewer-repeats") ?? 0) >= 2) prefs.excludeOrchestras = prefs.excludeOrchestras ?? [];
  return {
    ...memory,
    feedbackHistory: [{ at, playlistId, feedback, instruction }, ...memory.feedbackHistory].slice(0, 100),
    preferences: prefs,
    updatedAt: at,
  };
}

export function addNote(memory: AgentMemory, text: string, source: "dj" | "assistant" = "dj"): AgentMemory {
  const at = new Date().toISOString();
  return { ...memory, notes: [{ at, text, source }, ...memory.notes].slice(0, 200), updatedAt: at };
}

/** Compact text for AI prompts: what this DJ has done and asked for before. */
export function summarizeMemory(memory?: AgentMemory | null, max = 1200): string {
  if (!memory) return "No memory yet.";
  const L: string[] = [];
  if (memory.notes.length)
    L.push(
      `Notes: ${memory.notes
        .slice(0, 8)
        .map((n) => `${n.source === "dj" ? "DJ" : "assistant"}: ${n.text}`)
        .join(" | ")}`,
    );
  if (memory.sets.length)
    L.push(
      `Recent sets: ${memory.sets
        .slice(0, 6)
        .map(
          (s) =>
            `${s.name} (${s.hours} h, score ${s.score}${s.liked === true ? ", liked" : s.liked === false ? ", disliked" : ""}${s.context?.event ? `, ${s.context.event}` : ""})`,
        )
        .join("; ")}`,
    );
  if (memory.feedbackHistory.length)
    L.push(
      `Past feedback: ${memory.feedbackHistory
        .slice(0, 8)
        .map((f) => [...f.feedback, f.instruction].filter(Boolean).join(", "))
        .join(" / ")}`,
    );
  const p = memory.preferences;
  const keys = Object.keys(p).filter((k) => k !== "rules" && k !== "context");
  if (keys.length)
    L.push(
      `Learned preferences: ${keys.map((k) => `${k}=${JSON.stringify((p as Record<string, unknown>)[k])}`).join(", ")}`,
    );
  const out = L.join("\n");
  return out.length > max ? `${out.slice(0, max)}…` : out || "No memory yet.";
}
