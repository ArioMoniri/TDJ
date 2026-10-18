import type { ComposeContext, ContextFactorOption, ContextModel } from "@tdj/core";

export type ContextKey = keyof Pick<
  ComposeContext,
  | "season"
  | "weather"
  | "roomTemp"
  | "timeOfDay"
  | "event"
  | "crowdLevel"
  | "crowdSize"
  | "region"
  | "holiday"
  | "mood"
  | "dayOfWeek"
>;

/** App-side keys → the research model's factor and option ids (mirrors packages/core/src/context.ts). */
export const KEY_MAP: Record<string, string> = { roomTemp: "roomTemperature", event: "eventType" };
export const VALUE_MAP: Record<string, Record<string, string>> = {
  weather: { clear: "mild", heat: "heatwave", snow: "cold" },
  timeOfDay: {
    afternoon: "afternoonPractica",
    evening: "earlyEvening",
    night: "primeNight",
    "late-night": "afterMidnight",
    sunrise: "sunriseMarathon",
  },
  eventType: { marathon: "marathonDay2", wedding: "weddingShow", show: "weddingShow" },
  crowdLevel: { milonguero: "advanced" },
  region: { "buenos-aires": "buenosAires" },
  holiday: { "new-year": "newYear" },
  dayOfWeek: { weekday: "monToWed" },
};

/** The "Tonight" strip: each factor with its app-level choices. */
export const CONTEXT_FIELDS: Array<{ key: ContextKey; label: string; options: Array<[string, string]> }> = [
  {
    key: "season",
    label: "Season",
    options: [
      ["winter", "Winter"],
      ["spring", "Spring"],
      ["summer", "Summer"],
      ["autumn", "Autumn"],
    ],
  },
  {
    key: "weather",
    label: "Weather",
    options: [
      ["clear", "Clear"],
      ["rain", "Rain"],
      ["heat", "Heatwave"],
      ["humid", "Humid"],
      ["cold", "Cold"],
      ["storm", "Storm"],
      ["snow", "Snow"],
    ],
  },
  {
    key: "roomTemp",
    label: "Room",
    options: [
      ["cold", "Cold room"],
      ["comfortable", "Comfortable"],
      ["warm", "Warm room"],
      ["hot", "Hot room"],
    ],
  },
  {
    key: "timeOfDay",
    label: "Time",
    options: [
      ["afternoon", "Afternoon"],
      ["evening", "Early evening"],
      ["night", "Prime night"],
      ["late-night", "After midnight"],
      ["sunrise", "Sunrise"],
    ],
  },
  {
    key: "event",
    label: "Event",
    options: [
      ["milonga", "Milonga"],
      ["marathon", "Marathon"],
      ["encuentro", "Encuentro"],
      ["festival", "Festival"],
      ["practica", "Práctica"],
      ["wedding", "Wedding"],
      ["show", "Show"],
    ],
  },
  {
    key: "crowdLevel",
    label: "Dancers",
    options: [
      ["beginner", "Beginners"],
      ["mixed", "Mixed level"],
      ["advanced", "Advanced"],
      ["milonguero", "Milongueros"],
    ],
  },
  {
    key: "crowdSize",
    label: "Crowd",
    options: [
      ["small", "Small crowd"],
      ["medium", "Medium crowd"],
      ["large", "Large crowd"],
    ],
  },
  {
    key: "region",
    label: "Region",
    options: [
      ["buenos-aires", "Buenos Aires"],
      ["europe", "Europe"],
      ["istanbul", "Istanbul"],
      ["asia", "Asia"],
      ["us", "US"],
    ],
  },
  {
    key: "holiday",
    label: "Holiday",
    options: [
      ["none", "No holiday"],
      ["christmas", "Christmas"],
      ["new-year", "New Year"],
      ["valentines", "Valentine's"],
      ["carnival", "Carnival"],
    ],
  },
  {
    key: "mood",
    label: "Mood",
    options: [
      ["romantic", "Romantic"],
      ["energetic", "Energetic"],
      ["nostalgic", "Nostalgic"],
      ["playful", "Playful"],
      ["dramatic", "Dramatic"],
      ["elegant", "Elegant"],
    ],
  },
  {
    key: "dayOfWeek",
    label: "Day",
    options: [
      ["weekday", "Mon–Wed"],
      ["thursday", "Thursday"],
      ["friday", "Friday"],
      ["saturday", "Saturday"],
      ["sunday", "Sunday"],
    ],
  },
];

/** Find the research option (label, shifts, evidence) behind an app-level choice. */
export function researchOption(
  model: ContextModel | null | undefined,
  key: string,
  value: string | undefined,
): { factorLabel: string; option: ContextFactorOption | null } | null {
  if (!model) return null;
  const fid = KEY_MAP[key] ?? key;
  const f = model.factors.find((x) => x.id === fid);
  if (!f) return null;
  if (!value) return { factorLabel: f.label, option: null };
  const vid = VALUE_MAP[fid]?.[value] ?? value;
  return { factorLabel: f.label, option: f.options.find((o) => o.id === vid) ?? null };
}

export const EVIDENCE_COLOR: Record<string, string> = {
  strong: "#2f9e5b",
  moderate: "#e8b85a",
  weak: "#c9426a",
  lore: "#8b7cf6",
  speculative: "#9ca3af",
};
export const EVIDENCE_LABEL: Record<string, string> = {
  strong: "strong evidence",
  moderate: "moderate evidence",
  weak: "weak evidence",
  lore: "DJ lore",
  speculative: "untested",
};

export const fmtShift = (n: number | undefined | null, unit = "") =>
  n === undefined || n === null || n === 0 ? "" : `${n > 0 ? "+" : "−"}${Math.abs(n)}${unit}`;
