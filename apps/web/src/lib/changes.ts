import { lazy, plural, t as tx } from "@/lib/i18n";
import type { ComposeContext, ComposeOptions, Playlist } from "./types";

const LABEL: Record<string, string> = {
  get hours() {
    return tx("changes.length");
  },
  get eras() {
    return tx("changes.era");
  },
  get pattern() {
    return tx("changes.cycle");
  },
  get customPattern() {
    return tx("changes.custom_cycle");
  },
  get tangoTandaSize() {
    return tx("changes.tango_tanda");
  },
  get valsTandaSize() {
    return tx("changes.vals_tanda");
  },
  get milongaTandaSize() {
    return tx("changes.milonga_tanda");
  },
  get tandaShape() {
    return tx("changes.tanda_shape");
  },
  get arc() {
    return tx("changes.arc");
  },
  get arcShape() {
    return tx("changes.arc_peaks");
  },
  get yearRange() {
    return tx("changes.years");
  },
  get preferOrchestras() {
    return tx("changes.preferred_orchestras");
  },
  get cortinaStyle() {
    return tx("changes.cortina_style");
  },
  get cortinaCultures() {
    return tx("changes.cortina_cultures");
  },
  get cortinaGenres() {
    return tx("changes.cortina_genres");
  },
  get cortinaTrend() {
    return tx("changes.cortina_flavour");
  },
  get cortinaLengthSec() {
    return tx("changes.cortina_length");
  },
  get closeWithCumparsita() {
    return tx("changes.close_with_la_cumparsita");
  },
  get orchestraRepeatGap() {
    return tx("changes.repeat_gap");
  },
  get singerRepeatGap() {
    return tx("changes.singer_repeat_gap");
  },
  get maxYearSpread() {
    return tx("changes.year_spread");
  },
  get mixVocalInstrumental() {
    return tx("changes.mixed_vocal_instrumental");
  },
  get includeOrchestras() {
    return tx("changes.orchestras_to_include");
  },
  get excludeOrchestras() {
    return tx("changes.orchestras_to_leave_out");
  },
  get floorMood() {
    return tx("changes.floor_mood");
  },
  get rules() {
    return tx("changes.night_rules");
  },
};
const VALUE: Record<string, Record<string, string>> = {
  arc: {
    "classic-two-peaks": "two peaks",
    "single-peak": "single peak",
    "marathon-plateau": "marathon",
    gentle: "gentle",
  },
  pattern: {
    classic: "classic TTVTTM",
    "TTVTTM-strict": "strict TTVTTM",
    "tango-only": "tango only",
    custom: "custom",
  },
  cortinaStyle: { family: "family", matched: "matched", constant: "same", none: "none" },
  tandaShape: {
    get "rise-settle"() {
      return tx("changes.slow_up_settle");
    },
    get hammock() {
      return tx("changes.hammock");
    },
    get rise() {
      return tx("changes.rising");
    },
    get "peak-middle"() {
      return tx("changes.peak_in_the_middle");
    },
    get flat() {
      return tx("changes.flat");
    },
  },
};
const fmt = (k: string, v: unknown): string => {
  if (v === undefined || v === null) return "default";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "none";
  if (typeof v === "boolean") return v ? "on" : "off";
  if (typeof v === "object")
    return (
      Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => x !== undefined)
        .map(([a, b]) => `${a} ${String(b)}`)
        .join(", ") || "none"
    );
  const s = String(v);
  if (k === "cortinaLengthSec") return `${s} s`;
  if (k === "orchestraRepeatGap" || k === "singerRepeatGap") return tx("changes.tandas", { s });
  if (k === "maxYearSpread") return `${s} y`;
  return VALUE[k]?.[s] ?? s;
};

/** Human lines for what changed between two option sets: "Arc → gentle", "Repeat gap 6 → 9 tandas", "Mood → playful". */
export function describeOptionChanges(
  before: Partial<ComposeOptions>,
  after: Partial<ComposeOptions>,
): string[] {
  const out: string[] = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    if (
      k === "pinned" ||
      k === "touched" ||
      k === "seed" ||
      k === "context" ||
      k === "recent" ||
      k === "name"
    )
      continue;
    const a = (before as Record<string, unknown>)[k];
    const b = (after as Record<string, unknown>)[k];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (k === "pattern" && b === "custom" && after.customPattern) {
      out.push(tx("changes.cycle_custom", { customPattern: after.customPattern }));
      continue;
    }
    if (k === "customPattern" && after.pattern === "custom" && before.pattern !== "custom") continue;
    const label = LABEL[k] ?? k;
    out.push(a === undefined ? `${label} → ${fmt(k, b)}` : `${label} ${fmt(k, a)} → ${fmt(k, b)}`);
  }
  const ca = (before.context ?? {}) as Record<string, unknown>;
  const cb = (after.context ?? {}) as Record<string, unknown>;
  for (const k of new Set([...Object.keys(ca), ...Object.keys(cb)])) {
    if (ca[k] === cb[k]) continue;
    const label = k[0]!.toUpperCase() + k.slice(1);
    out.push(cb[k] === undefined ? tx("changes.cleared", { label }) : `${label} → ${String(cb[k])}`);
  }
  return out;
}

/** Which tandas changed between two sets (1-based indices), by their first song. */
export function changedTandas(prev: Playlist | null, next: Playlist): number[] {
  if (!prev) return [];
  const out: number[] = [];
  next.tandas.forEach((t, i) => {
    const p = prev.tandas[i];
    if (!p || p.songs.map((s) => s.id).join() !== t.songs.map((s) => s.id).join()) out.push(i + 1);
  });
  return out;
}

const EVENT: Record<string, string> = {
  milonga: "milonga",
  marathon: "marathon block",
  encuentro: "encuentro",
  festival: "festival night",
  practica: "práctica",
  wedding: "wedding",
  show: "show night",
};
const DAY: Record<string, string> = lazy(() => ({
  weekday: tx("changes.weekday"),
  thursday: tx("changes.thursday"),
  friday: tx("changes.friday"),
  saturday: tx("changes.saturday"),
  sunday: tx("changes.sunday"),
}));
const WEEKDAY = lazy(() => [
  tx("changes.sunday"),
  tx("changes.monday"),
  tx("changes.tuesday"),
  tx("changes.wednesday"),
  tx("changes.thursday"),
  tx("changes.friday"),
  tx("changes.saturday"),
]);

/**
 * "Tuesday práctica": the night's title, from the day (tonight's, or the one set under Tonight) and the event.
 * Wave 2: the title alone — the length and the era are the sub-line (lib/nightName.ts `nightSub`), so History, Share
 * and the result header read one name.
 */
export function autoSetName(o: Partial<ComposeOptions>, at = new Date()): string {
  const ctx = (o.context ?? {}) as ComposeContext;
  const ev = EVENT[ctx.event ?? "milonga"] ?? "milonga";
  const day =
    (ctx.dayOfWeek && DAY[ctx.dayOfWeek] !== "Weekday" ? DAY[ctx.dayOfWeek] : undefined) ??
    WEEKDAY[at.getDay()];
  const time = ctx.timeOfDay === "afternoon" ? "afternoon " : "";
  return `${day} ${time}${ev}`;
}

/** what /api/compose's auto-improve pass did (round 13), as the change summary line says it */
export interface AutoImproved {
  changes: Array<{ kind: string; tanda: number; text: string }>;
  before: { score: number; inRange: number; scored: number };
  after: { score: number; inRange: number; scored: number };
}
export function autoImproveLine(r: AutoImproved | null | undefined): string | null {
  if (!r?.changes.length) return null;
  const n = r.changes.length;
  const kinds = [...new Set(r.changes.map((c) => KIND_LABEL[c.kind] ?? c.kind))].join(", ");
  // (wave 2: the engine score and the benchmark count stay in the Benchmark sheet; the line says what changed)
  return tx("changes.polished_line", { changes: plural("plural.changes", n), kinds });
}
const KIND_LABEL: Record<string, string> = {
  get instrumental() {
    return tx("changes.instrumental_hour");
  },
  "stream-suspect": "re-recording",
  get "cue-fit"() {
    return tx("changes.cue_fit");
  },
  get roles() {
    return tx("changes.running_order");
  },
  get tighten() {
    return tx("changes.one_recording_period");
  },
  get heatmap() {
    return tx("changes.heatmap_years");
  },
  get bridge() {
    return tx("changes.bridge_cue");
  },
  get core() {
    return tx("changes.golden_core");
  },
  get energy() {
    return tx("changes.energy_step");
  },
  get strict() {
    return tx("changes.dj_review_rules");
  },
};
