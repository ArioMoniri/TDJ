import type { ComposeContext, ContextFactorOption, ContextModel } from "@tdj/core";
import { t } from "@/lib/i18n";

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
    get label() {
      return t("context.season");
    },
    options: [
      ["winter", "Winter"],
      ["spring", "Spring"],
      ["summer", "Summer"],
      ["autumn", "Autumn"],
    ],
  },
  {
    key: "weather",
    get label() {
      return t("context.weather");
    },
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
    get label() {
      return t("context.room");
    },
    options: [
      ["cold", t("context.cold_room")],
      ["comfortable", "Comfortable"],
      ["warm", t("context.warm_room")],
      ["hot", t("context.hot_room")],
    ],
  },
  {
    key: "timeOfDay",
    get label() {
      return t("context.time");
    },
    options: [
      ["afternoon", "Afternoon"],
      ["evening", t("context.early_evening")],
      ["night", t("context.prime_night")],
      ["late-night", t("context.after_midnight")],
      ["sunrise", "Sunrise"],
    ],
  },
  {
    key: "event",
    get label() {
      return t("context.event");
    },
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
    get label() {
      return t("context.dancers");
    },
    options: [
      ["beginner", "Beginners"],
      ["mixed", t("context.mixed_level")],
      ["advanced", "Advanced"],
      ["milonguero", "Milongueros"],
    ],
  },
  {
    key: "crowdSize",
    get label() {
      return t("context.crowd");
    },
    options: [
      ["small", t("context.small_crowd")],
      ["medium", t("context.medium_crowd")],
      ["large", t("context.large_crowd")],
    ],
  },
  {
    key: "region",
    get label() {
      return t("context.region");
    },
    options: [
      ["buenos-aires", t("context.buenos_aires")],
      ["europe", "Europe"],
      ["istanbul", "Istanbul"],
      ["asia", "Asia"],
      ["us", "US"],
    ],
  },
  {
    key: "holiday",
    get label() {
      return t("context.holiday");
    },
    options: [
      ["none", t("context.no_holiday")],
      ["christmas", "Christmas"],
      ["new-year", t("context.new_year")],
      ["valentines", "Valentine's"],
      ["carnival", "Carnival"],
    ],
  },
  {
    key: "mood",
    get label() {
      return t("context.mood");
    },
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
    get label() {
      return t("context.day");
    },
    options: [
      ["weekday", t("context.mon_wed")],
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
  get strong() {
    return t("context.strong_evidence");
  },
  get moderate() {
    return t("context.moderate_evidence");
  },
  get weak() {
    return t("context.weak_evidence");
  },
  get lore() {
    return t("context.dj_lore");
  },
  get speculative() {
    return t("context.untested");
  },
};

export const fmtShift = (n: number | undefined | null, unit = "") =>
  n === undefined || n === null || n === 0 ? "" : `${n > 0 ? "+" : "−"}${Math.abs(n)}${unit}`;
