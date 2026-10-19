import { applyFeedback, type ComposeOptions, DJ_RULES, type Feedback, toSetList } from "@tdj/core";
import { NextResponse } from "next/server";
import { FEEDBACK_VALUES, feedbackFromText } from "@/lib/feedback";
import { getCatalog } from "@/lib/server/catalog";
import { aiFromHeaders, complete, extractJson } from "@/lib/server/llm";
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
  "floorMood",
  "context",
] as const;
const ENUMS: Record<string, string[]> = {
  pattern: ["classic", "TTVTTM", "TTVTTM-strict", "TVTM", "TMTV", "tango-only", "custom"],
  tandaShape: ["rise", "rise-settle", "hammock", "flat", "peak-middle"],
  arc: ["classic-two-peaks", "single-peak", "marathon-plateau", "gentle"],
  cortinaStyle: ["family", "matched", "constant", "none"],
  cortinaTrend: ["trend", "classic", "mixed"],
  floorMood: ["traditional", "balanced", "energetic", "romantic"],
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
    if (k === "includeOrchestras" || k === "excludeOrchestras") {
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
  const ai = aiFromHeaders(req);
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

  const keywordFallback = (note: string) => {
    const feedback = feedbackFromText(instruction);
    const excluded = orchestras.filter((o) =>
      new RegExp(`\\b(no|without|skip|drop|less)\\s+${o.name.split(" ").pop()}`, "i").test(instruction),
    );
    const options = applyFeedback(base, feedback);
    if (excluded.length)
      options.excludeOrchestras = [
        ...new Set([...(base.excludeOrchestras ?? []), ...excluded.map((o) => o.id)]),
      ];
    return NextResponse.json({
      options,
      feedback,
      note:
        feedback.length || excluded.length
          ? `${note} Applied: ${[...feedback, ...excluded.map((o) => `no ${o.name}`)].join(", ")}.`
          : `${note} Nothing in that matched a known adjustment; try "calmer", "more vals" or "no Canaro".`,
      source: "keywords",
    });
  };

  if (!ai.key)
    return keywordFallback("Matched by keywords (add a model key in Settings for the full version).");

  const system = `You turn a tango DJ's free-text request into playlist option changes. Reply with ONLY a JSON object: {"options": {...}, "feedback": [...], "note": "one short sentence in plain DJ language"}.
Allowed option keys: ${OPTION_KEYS.join(", ")}. Enums: ${Object.entries(ENUMS)
    .map(([k, v]) => `${k}=${v.join("|")}`)
    .join(
      "; ",
    )}. context keys: ${CONTEXT_KEYS.join(", ")} (mood: romantic|energetic|nostalgic|playful|dramatic|elegant). Numeric ranges: hours 0.5-12, cortinaLengthSec 20-90, orchestraRepeatGap 1-12, maxYearSpread 1-12.
Allowed feedback values: ${FEEDBACK_VALUES.join(", ")}.
Orchestra ids for includeOrchestras/excludeOrchestras: ${orchestras.map((o) => `${o.id} (${o.name})`).join(", ")}.
Only set what the request implies; leave everything else out. Prefer feedback values for mood/energy, options for structure and orchestras. No em-dashes.

${DJ_RULES}`;
  const user = `Current options: ${JSON.stringify(base)}\n\nRequest: ${instruction}${
    body.playlist?.tandas ? `\n\nCurrent set:\n${toSetList(body.playlist).slice(0, 4000)}` : ""
  }`;
  try {
    const text = await complete({ ...ai, system, user, json: true, maxTokens: 800 });
    const j = extractJson(text);
    if (!j) return keywordFallback("The model's answer did not parse; matched by keywords instead.");
    const feedback = (Array.isArray(j.feedback) ? j.feedback : []).filter((f: unknown) =>
      (FEEDBACK_VALUES as string[]).includes(String(f)),
    ) as Feedback[];
    const patch = sanitizeOptions(j.options, ids);
    const options = { ...applyFeedback(base, feedback), ...patch };
    if (patch.context)
      options.context = { ...(applyFeedback(base, feedback).context ?? {}), ...patch.context };
    return NextResponse.json({
      options,
      feedback,
      note: typeof j.note === "string" ? j.note.slice(0, 240) : "Applied.",
      source: "model",
    });
  } catch (e) {
    return keywordFallback(
      `${e instanceof Error ? e.message : "Model request failed"}; matched by keywords instead.`,
    );
  }
}
