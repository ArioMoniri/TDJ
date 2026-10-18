import type { ComposeContext, ComposeOptions, ContextFactorOption, ContextModel, Phase } from "./types";

/**
 * Built-in context model (fallback). `data/knowledge/context_factors.json` (research-sourced) replaces it when present.
 * Shifts are conservative; evidence levels: strong (peer-reviewed), moderate, weak, lore (DJ practice).
 */
export const BUILTIN_CONTEXT: ContextModel = {
  factors: [
    {
      id: "season",
      label: "Season",
      options: [
        {
          id: "winter",
          label: "Winter",
          energyShift: -2,
          vocalRatioShift: 0.05,
          notes: "longer nights, more nostalgic lyrical tandas accepted",
          evidence: "weak",
        },
        { id: "spring", label: "Spring", energyShift: 2, evidence: "weak" },
        {
          id: "summer",
          label: "Summer",
          energyShift: -3,
          tempoShift: -2,
          milongaShare: -0.03,
          notes: "heat lowers stamina; fewer milongas, slower peaks",
          evidence: "moderate",
        },
        { id: "autumn", label: "Autumn", energyShift: 0, evidence: "lore" },
      ],
    },
    {
      id: "weather",
      label: "Weather",
      options: [
        { id: "clear", label: "Clear", evidence: "lore" },
        {
          id: "rain",
          label: "Rain",
          energyShift: -2,
          vocalRatioShift: 0.05,
          cortinaGenres: ["jazz", "chanson", "bossa"],
          notes: "smaller, more intimate crowd",
          evidence: "weak",
        },
        {
          id: "heat",
          label: "Heat wave",
          energyShift: -6,
          tempoShift: -3,
          milongaShare: -0.05,
          notes: "dehydration and fatigue; stretch cool-down",
          evidence: "moderate",
        },
        { id: "humid", label: "Humid", energyShift: -4, milongaShare: -0.04, evidence: "weak" },
        {
          id: "cold",
          label: "Cold",
          energyShift: 3,
          notes: "people dance to warm up; start rhythmic earlier",
          evidence: "lore",
        },
        { id: "storm", label: "Storm", energyShift: -3, evidence: "lore" },
        { id: "snow", label: "Snow", energyShift: -1, evidence: "lore" },
      ],
    },
    {
      id: "roomTemp",
      label: "Room temperature",
      options: [
        { id: "cold", label: "Cold room", energyShift: 4, evidence: "lore" },
        { id: "comfortable", label: "Comfortable" },
        { id: "warm", label: "Warm", energyShift: -2, evidence: "weak" },
        {
          id: "hot",
          label: "Hot",
          energyShift: -6,
          tempoShift: -3,
          milongaShare: -0.05,
          evidence: "moderate",
        },
      ],
    },
    {
      id: "timeOfDay",
      label: "Time of day",
      options: [
        {
          id: "afternoon",
          label: "Afternoon",
          energyShift: -4,
          valsShare: 0.03,
          notes: "matinée: lighter, more vals",
          evidence: "lore",
        },
        { id: "evening", label: "Evening" },
        { id: "night", label: "Night", energyShift: 2 },
        {
          id: "late-night",
          label: "After midnight",
          energyShift: 2,
          vocalRatioShift: 0.05,
          arcShift: { cooldown: -4 },
          notes: "milonguero hours: deeper, more Pugliese/Troilo tolerated",
          evidence: "lore",
        },
        {
          id: "sunrise",
          label: "Sunrise (marathon)",
          energyShift: -5,
          vocalRatioShift: 0.08,
          evidence: "lore",
        },
      ],
    },
    {
      id: "event",
      label: "Event",
      options: [
        { id: "milonga", label: "Milonga" },
        {
          id: "marathon",
          label: "Marathon",
          energyShift: 3,
          notes: "experienced floor; plateau arcs",
          evidence: "lore",
        },
        {
          id: "encuentro",
          label: "Encuentro",
          energyShift: 0,
          vocalRatioShift: 0.03,
          preferStyles: ["lyrical", "rhythmic"],
          avoidStyles: ["nuevo", "contemporary"],
          evidence: "lore",
        },
        {
          id: "festival",
          label: "Festival",
          energyShift: 4,
          notes: "shows and mixed levels: crowd-pleasers, clearer rhythm",
          evidence: "lore",
        },
        {
          id: "practica",
          label: "Práctica",
          energyShift: -4,
          tandaSizeShift: -1,
          notes: "3-track tandas, slower, more instrumental",
          vocalRatioShift: -0.1,
          evidence: "lore",
        },
        {
          id: "wedding",
          label: "Wedding / party",
          energyShift: 2,
          cortinaGenres: ["pop", "swing", "latin"],
          evidence: "lore",
        },
        {
          id: "show",
          label: "With a show",
          arcShift: { peak: -3 },
          notes: "re-ramp after the show",
          evidence: "lore",
        },
      ],
    },
    {
      id: "crowdLevel",
      label: "Crowd level",
      options: [
        {
          id: "beginner",
          label: "Beginners",
          energyShift: -2,
          avoidStyles: ["dramatic", "nuevo"],
          preferStyles: ["rhythmic", "guardia"],
          notes: "clear beat, no rubato",
          evidence: "moderate",
        },
        { id: "mixed", label: "Mixed" },
        { id: "advanced", label: "Advanced", energyShift: 1 },
        {
          id: "milonguero",
          label: "Milongueros",
          vocalRatioShift: 0.05,
          preferStyles: ["rhythmic", "lyrical"],
          notes: "canonical tandas only",
          evidence: "lore",
        },
      ],
    },
    {
      id: "crowdSize",
      label: "Crowd size",
      options: [
        { id: "small", label: "Small", energyShift: -3, vocalRatioShift: 0.05 },
        { id: "medium", label: "Medium" },
        {
          id: "large",
          label: "Large",
          energyShift: 2,
          notes: "big floors need clearer rhythm",
          evidence: "weak",
        },
      ],
    },
    {
      id: "region",
      label: "Region",
      options: [
        {
          id: "buenos-aires",
          label: "Buenos Aires",
          preferStyles: ["rhythmic", "lyrical"],
          cortinaGenres: ["cumbia", "rock", "bolero", "swing"],
          notes: "canonical tandas, two Cumparsitas tolerated",
          evidence: "lore",
        },
        {
          id: "europe",
          label: "Europe",
          cortinaGenres: ["swing", "jazz", "chanson", "canzone", "pop"],
          evidence: "lore",
        },
        {
          id: "istanbul",
          label: "Istanbul",
          cortinaGenres: ["turkish-pop", "turkish-rock", "oriental-dance"],
          energyShift: 1,
          evidence: "lore",
        },
        { id: "asia", label: "Asia", cortinaGenres: ["kpop", "pop", "jazz"], evidence: "lore" },
        { id: "us", label: "US", cortinaGenres: ["swing", "soul", "funk", "rock"], evidence: "lore" },
      ],
    },
    {
      id: "holiday",
      label: "Holiday",
      options: [
        { id: "none", label: "None" },
        { id: "christmas", label: "Christmas", cortinaGenres: ["swing", "crooner"], energyShift: 1 },
        { id: "new-year", label: "New Year", energyShift: 4, cortinaGenres: ["pop", "swing", "funk"] },
        {
          id: "valentines",
          label: "Valentine's",
          vocalRatioShift: 0.1,
          energyShift: -2,
          cortinaGenres: ["bolero", "crooner", "chanson"],
        },
        {
          id: "carnival",
          label: "Carnival",
          milongaShare: 0.05,
          energyShift: 4,
          cortinaGenres: ["cumbia", "bossa", "balkan-brass"],
        },
      ],
    },
    {
      id: "mood",
      label: "Mood request",
      options: [
        {
          id: "romantic",
          label: "Romantic",
          energyShift: -6,
          vocalRatioShift: 0.12,
          preferStyles: ["lyrical"],
          cortinaGenres: ["bolero", "chanson", "crooner", "bossa"],
          evidence: "moderate",
        },
        {
          id: "energetic",
          label: "Energetic",
          energyShift: 8,
          milongaShare: 0.04,
          preferStyles: ["rhythmic"],
          cortinaGenres: ["swing", "funk", "rock", "balkan-brass"],
          evidence: "moderate",
        },
        {
          id: "nostalgic",
          label: "Nostalgic",
          energyShift: -3,
          vocalRatioShift: 0.1,
          preferStyles: ["lyrical", "guardia"],
          evidence: "weak",
        },
        {
          id: "playful",
          label: "Playful",
          energyShift: 3,
          valsShare: 0.03,
          milongaShare: 0.03,
          preferStyles: ["rhythmic"],
          evidence: "weak",
        },
        {
          id: "dramatic",
          label: "Dramatic",
          energyShift: 2,
          preferStyles: ["dramatic", "lyrical"],
          arcShift: { peak: 4 },
          evidence: "weak",
        },
      ],
    },
    {
      id: "dayOfWeek",
      label: "Day",
      options: [
        { id: "weekday", label: "Weekday", energyShift: -2 },
        { id: "friday", label: "Friday", energyShift: 2 },
        { id: "saturday", label: "Saturday", energyShift: 3 },
        { id: "sunday", label: "Sunday", energyShift: -3, vocalRatioShift: 0.05 },
      ],
    },
  ],
};

export interface ResolvedContext {
  energyShift: number;
  tempoShift: number;
  vocalRatioShift: number;
  valsShare: number;
  milongaShare: number;
  tandaSizeShift: number;
  cortinaGenres: string[];
  preferStyles: string[];
  avoidStyles: string[];
  arcShift: Partial<Record<Phase, number>>;
  applied: ContextFactorOption[];
}

/** Map the app's ComposeContext keys/values onto the research model's factor and option ids (data/knowledge/context_factors.json). */
const KEY_MAP: Record<string, string> = { roomTemp: "roomTemperature", event: "eventType" };
const VALUE_MAP: Record<string, Record<string, string>> = {
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

export function resolveContext(
  ctx: ComposeContext | undefined,
  model: ContextModel = BUILTIN_CONTEXT,
): ResolvedContext {
  const r: ResolvedContext = {
    energyShift: 0,
    tempoShift: 0,
    vocalRatioShift: 0,
    valsShare: 0,
    milongaShare: 0,
    tandaSizeShift: 0,
    cortinaGenres: [],
    preferStyles: [],
    avoidStyles: [],
    arcShift: {},
    applied: [],
  };
  if (!ctx) return r;
  const absolute = !!model.baseline; // research model expresses shares as absolute fractions of the night
  const baseV = model.baseline?.valsShare ?? 0.167,
    baseM = model.baseline?.milongaShare ?? 0.167;
  const byId = new Map(model.factors.map((f) => [f.id, f]));
  let shareV: number | null = null,
    shareM: number | null = null;
  for (const [rawKey, rawVal] of Object.entries(ctx)) {
    if (!rawVal) continue;
    const fid = byId.has(rawKey) ? rawKey : (KEY_MAP[rawKey] ?? rawKey);
    const f = byId.get(fid);
    if (!f) continue;
    const vid = VALUE_MAP[fid]?.[rawVal as string] ?? (rawVal as string);
    const o = f.options.find((x) => x.id === vid);
    if (!o) continue;
    r.applied.push(o);
    r.energyShift += o.energyShift ?? 0;
    r.tempoShift += o.tempoShift ?? 0;
    r.vocalRatioShift += o.vocalRatioShift ?? 0;
    if (absolute) {
      if (o.valsShare !== undefined && shareV === null) shareV = o.valsShare;
      if (o.milongaShare !== undefined && shareM === null) shareM = o.milongaShare;
    } else {
      r.valsShare += o.valsShare ?? 0;
      r.milongaShare += o.milongaShare ?? 0;
    }
    r.tandaSizeShift += o.tandaSizeShift ?? 0;
    r.cortinaGenres.push(...(o.cortinaGenres ?? []));
    r.preferStyles.push(...(o.preferStyles ?? []));
    r.avoidStyles.push(...(o.avoidStyles ?? []));
    for (const [k, v] of Object.entries(o.arcShift ?? {}))
      r.arcShift[k as Phase] = (r.arcShift[k as Phase] ?? 0) + (v ?? 0);
  }
  if (absolute) {
    if (shareV !== null) r.valsShare = shareV - baseV;
    if (shareM !== null) r.milongaShare = shareM - baseM;
  }
  r.energyShift = Math.max(-15, Math.min(15, r.energyShift));
  r.tandaSizeShift = Math.max(-1, Math.min(1, r.tandaSizeShift));
  return r;
}

/** Fold the resolved context into compose options (pattern, sizes, cortina genres). */
export function applyContextToOptions(o: ComposeOptions, rc: ResolvedContext): ComposeOptions {
  const out = { ...o };
  if (rc.tandaSizeShift < 0 && out.tangoTandaSize === 4) out.tangoTandaSize = 3;
  if (rc.cortinaGenres.length && !out.cortinaGenres?.length)
    out.cortinaGenres = [...new Set(rc.cortinaGenres)];
  if (out.pattern === "classic" || out.pattern === "TTVTTM") {
    if (rc.valsShare >= 0.03 && rc.milongaShare >= 0.03) {
      out.pattern = "custom";
      out.customPattern = "TVTMTTVTTM";
    } else if (rc.valsShare >= 0.03) {
      out.pattern = "custom";
      out.customPattern = "TTVTTMTTV";
    } else if (rc.milongaShare <= -0.04) {
      out.pattern = "custom";
      out.customPattern = "TTVTTVTTM";
    }
  }
  return out;
}
