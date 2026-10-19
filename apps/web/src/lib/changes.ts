import type { ComposeContext, ComposeOptions, Playlist } from "./types";

const LABEL: Record<string, string> = {
  hours: "Length",
  eras: "Era",
  pattern: "Cycle",
  customPattern: "Custom cycle",
  tangoTandaSize: "Tango tanda",
  valsTandaSize: "Vals tanda",
  milongaTandaSize: "Milonga tanda",
  tandaShape: "Tanda shape",
  arc: "Arc",
  cortinaStyle: "Cortina style",
  cortinaCultures: "Cortina cultures",
  cortinaGenres: "Cortina genres",
  cortinaTrend: "Cortina flavour",
  cortinaLengthSec: "Cortina length",
  closeWithCumparsita: "Close with La Cumparsita",
  orchestraRepeatGap: "Repeat gap",
  singerRepeatGap: "Singer repeat gap",
  maxYearSpread: "Year spread",
  mixVocalInstrumental: "Mixed vocal/instrumental",
  includeOrchestras: "Orchestras to include",
  excludeOrchestras: "Orchestras to leave out",
  floorMood: "Floor mood",
  rules: "Night rules",
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
    "rise-settle": "slow, up, settle",
    hammock: "hammock",
    rise: "rising",
    "peak-middle": "peak in the middle",
    flat: "flat",
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
  if (k === "orchestraRepeatGap" || k === "singerRepeatGap") return `${s} tandas`;
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
      out.push(`Cycle → custom ${after.customPattern}`);
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
    out.push(cb[k] === undefined ? `${label} cleared` : `${label} → ${String(cb[k])}`);
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
const ERA: Record<string, string> = {
  golden: "Golden Age",
  "golden-extended": "Golden Age, extended",
  "guardia-vieja": "Guardia Vieja",
  "post-golden": "Post-golden",
  nuevo: "Nuevo",
  contemporary: "Contemporary",
  all: "All eras",
};
const DAY: Record<string, string> = {
  weekday: "Weekday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};
const fmtH = (h: number) => (Number.isInteger(h) ? `${h} h` : `${`${h}`.replace(".5", "½")} h`);

/** "Tuesday práctica · 2 h · Golden Age": the set name from the event, the length and the era. */
export function autoSetName(o: Partial<ComposeOptions>): string {
  const ctx = (o.context ?? {}) as ComposeContext;
  const ev = EVENT[ctx.event ?? "milonga"] ?? "milonga";
  const day = ctx.dayOfWeek ? DAY[ctx.dayOfWeek] : undefined;
  const time = ctx.timeOfDay === "afternoon" ? "afternoon " : "";
  const head = day
    ? `${day} ${time}${ev}`
    : `${time ? time[0]!.toUpperCase() + time.slice(1) : ""}${time ? ev : ev[0]!.toUpperCase() + ev.slice(1)}`;
  return `${head} · ${fmtH(o.hours ?? 4)} · ${ERA[o.eras?.[0] ?? "golden"] ?? "Golden Age"}`;
}
