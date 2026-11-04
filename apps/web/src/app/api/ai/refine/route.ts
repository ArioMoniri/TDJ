import {
  type ComposeOptions,
  DJ_RULES,
  type Feedback,
  type Playlist,
  type Refinement,
  refineWithGuard,
  summarizeMemory,
  type Tanda,
  toSetList,
} from "@tdj/core";
import { NextResponse } from "next/server";
import { FEEDBACK_LABEL, FEEDBACK_VALUES, feedbackFromText } from "@/lib/feedback";
import { getCatalog, getCatalogFor } from "@/lib/server/catalog";
import { crossOriginResponse } from "@/lib/server/guard";
import { complete, extractJson, houseRulesBlock, resolveAi } from "@/lib/server/llm";
export const dynamic = "force-dynamic";

const OPTION_KEYS = [
  "hours",
  "eras",
  "pattern",
  "customPattern",
  "tangoTandaSize",
  "valsTandaSize",
  "milongaTandaSize",
  "tandaShape",
  "arc",
  "cortinaStyle",
  "cortinaCultures",
  "cortinaGenres",
  "cortinaTrend",
  "cortinaLengthSec",
  "closeWithCumparsita",
  "orchestraRepeatGap",
  "singerRepeatGap",
  "maxYearSpread",
  "mixVocalInstrumental",
  "includeOrchestras",
  "excludeOrchestras",
  "preferOrchestras",
  "floorMood",
  "context",
  "arcShape",
] as const;
const ENUMS: Record<string, string[]> = {
  pattern: ["classic", "TTVTTM", "TTVTTM-strict", "TVTM", "TMTV", "tango-only", "custom"],
  tandaShape: ["rise", "rise-settle", "hammock", "flat", "peak-middle"],
  arc: ["classic-two-peaks", "single-peak", "marathon-plateau", "gentle"],
  cortinaStyle: ["family", "matched", "constant", "none"],
  cortinaTrend: ["trend", "classic", "mixed"],
  floorMood: ["traditional", "balanced", "energetic", "romantic"],
  arcShape: ["single", "double"],
  eras: ["golden", "golden-extended", "guardia-vieja", "post-golden", "nuevo", "contemporary", "all"],
};
const CONTEXT_KEYS = [
  "season",
  "weather",
  "roomTemp",
  "timeOfDay",
  "event",
  "crowdLevel",
  "crowdSize",
  "region",
  "holiday",
  "mood",
  "dayOfWeek",
];

function sanitizeOptions(raw: unknown, orchestraIds: Set<string>): Partial<ComposeOptions> {
  const out: Record<string, unknown> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(OPTION_KEYS as readonly string[]).includes(k) || v === null || v === undefined) continue;
    if (k in ENUMS) {
      if (k === "eras") {
        const arr = (Array.isArray(v) ? v : [v]).filter((x) => ENUMS.eras!.includes(String(x)));
        if (arr.length) out.eras = arr;
      } else if (ENUMS[k]!.includes(String(v))) out[k] = v;
      continue;
    }
    if (k === "includeOrchestras" || k === "excludeOrchestras" || k === "preferOrchestras") {
      const arr = (Array.isArray(v) ? v : [v]).map(String).filter((id) => orchestraIds.has(id));
      if (arr.length) out[k] = arr;
      continue;
    }
    if (k === "cortinaCultures" || k === "cortinaGenres") {
      const arr = (Array.isArray(v) ? v : [v]).map((x) => String(x).toLowerCase()).slice(0, 12);
      if (arr.length) out[k] = arr;
      continue;
    }
    if (k === "context") {
      if (typeof v === "object") {
        const ctx: Record<string, string> = {};
        for (const [ck, cv] of Object.entries(v as Record<string, unknown>))
          if (CONTEXT_KEYS.includes(ck) && typeof cv === "string") ctx[ck] = cv;
        if (Object.keys(ctx).length) out.context = ctx;
      }
      continue;
    }
    if (k === "customPattern") {
      const s = String(v)
        .toUpperCase()
        .replace(/[^TVM]/g, "");
      if (s.length >= 3) out.customPattern = s;
      continue;
    }
    if (k === "closeWithCumparsita" || k === "mixVocalInstrumental") {
      out[k] = !!v;
      continue;
    }
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    if (k === "hours") out.hours = Math.min(12, Math.max(0.5, n));
    else if (k === "tangoTandaSize") {
      if ([3, 4, 5].includes(n)) out[k] = n;
    } else if (k === "valsTandaSize" || k === "milongaTandaSize") {
      if ([3, 4].includes(n)) out[k] = n;
    } else if (k === "cortinaLengthSec") out[k] = Math.min(90, Math.max(20, Math.round(n)));
    else if (k === "orchestraRepeatGap" || k === "singerRepeatGap")
      out[k] = Math.min(12, Math.max(1, Math.round(n)));
    else if (k === "maxYearSpread") out[k] = Math.min(12, Math.max(1, Math.round(n)));
  }
  return out;
}

/** "warmer start, more vals, no Canaro" → { options, feedback, note }. Falls back to keyword matching without a key or when the model's JSON does not parse. */
export async function POST(req: Request) {
  const cross = await crossOriginResponse(req);
  if (cross) return cross;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const instruction = String(body.instruction ?? "")
    .trim()
    .slice(0, 600);
  if (!instruction) return NextResponse.json({ error: "Tell the DJ what to change." }, { status: 400 });
  const base: Partial<ComposeOptions> = body.options && typeof body.options === "object" ? body.options : {};
  const { catalog } = getCatalog();
  const orchestras = [...catalog.byOrchestra.entries()]
    .filter(([id, s]) => s.length >= 12 && (catalog.profile(id)?.tier ?? 3) <= 2)
    .map(([id, s]) => ({ id, name: s[0]!.orchestra }));
  const ids = new Set(orchestras.map((o) => o.id));

  const nameOf = (id: string) => orchestras.find((o) => o.id === id)?.name ?? id;
  const playlist = body.playlist && typeof body.playlist === "object" ? (body.playlist as Playlist) : null;
  const locked: Tanda[] = (playlist?.tandas ?? []).filter((t) => t?.locked);
  const overrides = body.overrides && typeof body.overrides === "object" ? body.overrides : undefined;
  const live = getCatalogFor(overrides);
  const deps = { catalog: live.catalog, cortinas: live.cortinas, contextModel: live.contextModel };
  /** apply + compose once with the length guard: a refine never turns 4 h into 53 min and calls it "Applied" */
  const guarded = (r: Refinement) => {
    const g = refineWithGuard(
      { ...base, overrides: overrides ? { ...overrides, contextFactors: undefined } : base.overrides },
      r,
      deps,
      { locked },
      nameOf,
    );
    const { overrides: _o, ...options } = g.options;
    return { ...g, options };
  };

  /**
   * Without a model: the request is split into fragments ("no Canaro", "more Pugliese", "a D'Arienzo vals tanda");
   * each fragment is either applied (feedback keyword, orchestra in/out) or reported as not understood. The note
   * says exactly which is which; nothing is reported as applied that was not.
   */
  const keywordFallback = (why: string) => {
    const surnameOf = (o: { name: string }) =>
      o.name
        .split(" ")
        .pop()!
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const fragments = instruction
      .split(/\s*(?:,|;|\band\b|\bthen\b|\bplus\b)\s*/i)
      .map((f) => f.trim())
      .filter(Boolean);
    const feedback: Feedback[] = [];
    const excluded: typeof orchestras = [];
    const included: typeof orchestras = [];
    const applied: string[] = [];
    const notApplied: string[] = [];
    for (const frag of fragments) {
      let done = false;
      const fb = feedbackFromText(frag);
      for (const f of fb)
        if (!feedback.includes(f)) {
          feedback.push(f);
          applied.push(FEEDBACK_LABEL[f] ?? f);
          done = true;
        }
      for (const o of orchestras) {
        const sur = surnameOf(o);
        if (new RegExp(`\\b(no|without|skip|drop|less|fewer)\\s+(the\\s+)?${sur}\\b`, "i").test(frag)) {
          if (!excluded.includes(o)) excluded.push(o);
          applied.push(`no ${o.name}`);
          done = true;
        } else if (
          new RegExp(`\\b(more|extra|another|add|with)\\s+(the\\s+)?${sur}\\b`, "i").test(frag) &&
          !/\b(vals|milonga|tanda at|at \d|after \d|before \d|am\b|pm\b)/i.test(frag)
        ) {
          if (!included.includes(o)) included.push(o);
          applied.push(`more ${o.name}`);
          done = true;
        }
      }
      if (!done) notApplied.push(frag);
    }
    // "more X" prefers (never the only pool), "no X" excludes; the guard refuses a night that would shrink > 10 %
    const g = guarded({
      feedback,
      more: included.map((o) => o.id),
      no: excluded.map((o) => o.id),
    });
    const parts: string[] = [];
    if (g.applied.length) parts.push(`Applied: ${g.applied.join(", ")}.`);
    const missed = [...notApplied.map((f) => `"${f}" (${why})`), ...g.notApplied];
    if (missed.length) parts.push(`Not applied: ${missed.join("; ")}.`);
    if (!g.applied.length && !missed.length) parts.push("Nothing to apply.");
    return NextResponse.json({
      options: g.options,
      feedback,
      note: parts.join(" "),
      applied: g.applied,
      notApplied: missed,
      source: "keywords",
    });
  };

  // the DJ's own key, else the organiser's shared key (counted per day); neither → keywords only
  const resolved = await resolveAi(req);
  if (!resolved.ok)
    return keywordFallback(
      resolved.status === 429
        ? "today's allowance on the organiser's key is used up; add your own key in Settings"
        : "add a model key in Settings for sentences like these",
    );
  const ai = resolved.ai;

  const system = `You turn a tango DJ's free-text request into playlist option changes. Reply with ONLY a JSON object: {"options": {...}, "feedback": [...], "note": "one short sentence in plain DJ language"}.
Allowed option keys: ${OPTION_KEYS.join(", ")}. Enums: ${Object.entries(ENUMS)
    .map(([k, v]) => `${k}=${v.join("|")}`)
    .join(
      "; ",
    )}. context keys: ${CONTEXT_KEYS.join(", ")} (mood: romantic|energetic|nostalgic|playful|dramatic|elegant). Numeric ranges: hours 0.5-12, cortinaLengthSec 20-90, orchestraRepeatGap 1-12, maxYearSpread 1-12.
Allowed feedback values: ${FEEDBACK_VALUES.join(", ")}.
Orchestra ids: ${orchestras.map((o) => `${o.id} (${o.name})`).join(", ")}. "more X" or "open with X" → preferOrchestras (X is favoured, the rest of the pool stays); "no X" → excludeOrchestras; includeOrchestras only when the DJ says "only X". arcShape "double" = two peaks.
Only set what the request implies; leave everything else out. Prefer feedback values for mood/energy, options for structure and orchestras. No em-dashes.
The "note" may also record something worth remembering about this DJ or room, in one short sentence.

${DJ_RULES}${houseRulesBlock(body.houseRules ?? body.overrides?.guide?.houseRules)}

WHAT YOU REMEMBER ABOUT THIS DJ:
${body.memory && typeof body.memory === "object" ? summarizeMemory(body.memory) : "No memory yet."}`;
  const user = `Current options: ${JSON.stringify(base)}\n\nRequest: ${instruction}${
    body.playlist?.tandas ? `\n\nCurrent set:\n${toSetList(body.playlist).slice(0, 4000)}` : ""
  }`;
  try {
    const text = await complete({ ...ai, system, user, json: true, maxTokens: 800 });
    const j = extractJson(text);
    if (!j) return keywordFallback("the model's answer did not parse, matched by keywords instead");
    const feedback = (Array.isArray(j.feedback) ? j.feedback : []).filter((f: unknown) =>
      (FEEDBACK_VALUES as string[]).includes(String(f)),
    ) as Feedback[];
    const patch = sanitizeOptions(j.options, ids);
    // the model's includeOrchestras is "more X" unless the DJ said "only"; excludeOrchestras is "no X"
    const only = /\b(only|just|nothing but|exclusively)\b/i.test(instruction);
    const newIn = (patch.includeOrchestras ?? []).filter(
      (id) => !(base.includeOrchestras ?? []).includes(id),
    );
    const newEx = (patch.excludeOrchestras ?? []).filter(
      (id) => !(base.excludeOrchestras ?? []).includes(id),
    );
    const { includeOrchestras: _i, excludeOrchestras: _e, preferOrchestras: pref, ...rest } = patch;
    const g = guarded({
      feedback,
      more: [...(pref ?? []), ...(only ? [] : newIn)],
      only: only ? newIn : [],
      no: newEx,
      patch: rest,
    });
    const modelNote = typeof j.note === "string" ? j.note.slice(0, 240) : "";
    const parts = [modelNote, g.applied.length ? `Applied: ${g.applied.join(", ")}.` : ""];
    if (g.notApplied.length) parts.push(`Not applied: ${g.notApplied.join("; ")}.`);
    return NextResponse.json({
      options: g.options,
      feedback,
      note: parts.filter(Boolean).join(" ") || "Applied.",
      applied: g.applied,
      notApplied: g.notApplied,
      source: "model",
    });
  } catch (e) {
    return keywordFallback(
      `${e instanceof Error ? e.message : "model request failed"}; matched by keywords instead`,
    );
  }
}
