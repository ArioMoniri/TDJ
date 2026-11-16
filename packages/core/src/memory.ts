import { normTitle } from "./energy";
import { sideSetKey } from "./learn";
import { forgetLike, learnFromLike, likedShapeDefaults } from "./likes";
import type { AgentMemory, ComposeOptions, LearnedPreferences, Playlist } from "./types";

export const emptyMemory = (): AgentMemory => ({ notes: [], feedbackHistory: [], sets: [], preferences: {} });

/**
 * The `learned` a request carries: the DJ's own (when learning is on) and, always, the DJ's overrides of the
 * repo-level store (the featured night's edits: switched off, reweighted, deleted rules), which mergeLearned applies.
 */
export function learnedForRequest(
  memory: AgentMemory | null | undefined,
  learn: boolean,
): LearnedPreferences | undefined {
  const mine = learn ? memory?.learned : undefined;
  const repo = memory?.repoLearned;
  if (!repo) return mine;
  return { ...(mine ?? {}), repo };
}

/** Learned preferences sit under explicit options: memory never overrides what the DJ set tonight. */
export function applyMemory(
  partial: Partial<ComposeOptions>,
  memory?: AgentMemory | null,
): Partial<ComposeOptions> {
  const recent = recentFromMemory(memory);
  const withRecent = (o: Partial<ComposeOptions>): Partial<ComposeOptions> =>
    o.recent || !recent ? o : { ...o, recent };
  // round 21: what the DJ's edits taught (learn.ts) rides with every compose; tonight's own `learned` wins
  const learned = learnedForRequest(memory, true);
  const withLearned = (o: Partial<ComposeOptions>): Partial<ComposeOptions> =>
    learned && !o.learned ? { ...o, learned } : o;
  // thumbs up on nights of the same shape (likes.ts): the lowest layer, under preferences and tonight's settings
  const shape = likedShapeDefaults(memory?.learned);
  if (!memory?.preferences) return withLearned(withRecent({ ...shape, ...partial }));
  const { rules, context, ...prefs } = memory.preferences;
  return withLearned(
    withRecent({
      ...shape,
      ...prefs,
      ...partial,
      rules: { ...(rules ?? {}), ...(partial.rules ?? {}) },
      context: { ...(context ?? {}), ...(partial.context ?? {}) },
    }),
  );
}

/** Record a composed set (keeps the last 50). */
export function rememberSet(memory: AgentMemory, p: Playlist, liked?: boolean): AgentMemory {
  // the same night recorded again keeps its rating (rateNight is the one that changes or clears it)
  liked ??= memory.sets.find((s) => s.id === p.id)?.liked;
  const entry = {
    at: new Date().toISOString(),
    id: p.id,
    name: p.name,
    hours: p.options.hours,
    eras: p.options.eras,
    score: p.score.total,
    context: p.options.context,
    liked,
    tandas: p.tandas.map((t) => `${t.orchestraId}|${t.singer ?? ""}|${t.rhythm}`),
    titles: p.tandas.flatMap((t) => t.songs.map((s) => normTitle(s.title))),
    sideSets: p.tandas.map((t) => sideSetKey(t.songs.map((s) => s.id))),
  };
  return {
    ...memory,
    sets: [entry, ...memory.sets.filter((s) => s.id !== p.id)].slice(0, 50),
    updatedAt: entry.at,
  };
}

/**
 * Thumbs up (true), down (false) or neither (undefined) on a night: the set's entry keeps its place and time (so the
 * variety memory of the next nights does not move), and with learning on the rating feeds the learned preferences
 * (likes.ts); with learning off the rating is recorded only, and any earlier contribution of the night is taken back.
 */
export function rateNight(
  memory: AgentMemory,
  p: Playlist,
  liked: boolean | undefined,
  opts: { learn?: boolean; at?: string } = {},
): AgentMemory {
  const at = opts.at ?? new Date().toISOString();
  const has = memory.sets.some((s) => s.id === p.id);
  const base = has ? memory : rememberSet(memory, p);
  const sets = base.sets.map((s) => {
    if (s.id !== p.id) return s;
    const { liked: _l, ...rest } = s;
    return liked === undefined ? rest : { ...rest, liked };
  });
  const learned =
    opts.learn !== false && liked !== undefined
      ? learnFromLike(memory.learned, p, liked, at)
      : forgetLike(memory.learned, p.id);
  const out: AgentMemory = { ...memory, sets, updatedAt: at };
  if (learned) out.learned = learned;
  return out;
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
  if ((counts.get("fewer-repeats") ?? 0) >= 2)
    prefs.orchestraRepeatGap = Math.max(prefs.orchestraRepeatGap ?? 6, 9);
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

/** Families and titles from the last `n` sets, so the next night is not the same night. */
export function recentFromMemory(
  memory?: AgentMemory | null,
  n = 3,
): { tandaKeys: string[]; titles: string[]; sideSets?: string[] } | undefined {
  const sets = (memory?.sets ?? []).slice(0, n);
  const tandaKeys = [...new Set(sets.flatMap((s) => s.tandas ?? []))];
  const titles = [...new Set(sets.flatMap((s) => s.titles ?? []))];
  const sideSets = [...new Set(sets.flatMap((s) => s.sideSets ?? []))];
  return tandaKeys.length || titles.length
    ? { tandaKeys, titles, ...(sideSets.length ? { sideSets } : {}) }
    : undefined;
}
