/**
 * 2026-11 (the owner: "… help to create the night") — the guided builder's live guidance: the night's length
 * against the target, the big-four spread, the energy arc, the rhythm cycle (TTV TTM) and the cortinas. Each line
 * says how it stands and carries one fix the page runs in a tap. Pure, for the vitest; the page words it.
 */

export interface GuideTanda {
  rhythm: string;
  orchestraId: string;
  energy: number;
}
export interface GuidePlan {
  minutes: number;
  slots: Array<{ rhythm: string; targetEnergy: number }>;
  bigFour: readonly string[];
}
export type GuideFix =
  | { kind: "fill" }
  | { kind: "remove-last" }
  | { kind: "orchestra"; id: string }
  | { kind: "rhythm"; rhythm: string }
  | { kind: "suggest" }
  | { kind: "cortina"; at: number };
export interface GuideLine {
  key: "length" | "bigfour" | "energy" | "cycle" | "cortinas";
  ok: boolean;
  /** what the page prints, by key (numbers and names) */
  vals: Record<string, string | number>;
  fix?: GuideFix;
}

export const BIG_FOUR_NAME: Record<string, string> = {
  "carlos-di-sarli": "Di Sarli",
  "juan-d-arienzo": "D'Arienzo",
  "anibal-troilo": "Troilo",
  "osvaldo-pugliese": "Pugliese",
};

const letter = (r: string) => (r === "vals" ? "V" : r === "milonga" ? "M" : "T");
/** "TTV TTM" — the cycle in groups of three */
export const cycleText = (rhythms: string[]) =>
  rhythms
    .map(letter)
    .join("")
    .replace(/(.{3})(?=.)/g, "$1 ");

export function guideLines(
  tandas: GuideTanda[],
  plan: GuidePlan | null,
  o: { minutes: number; cortinas: Array<unknown | null> },
): GuideLine[] {
  const out: GuideLine[] = [];
  if (!plan) return out;
  // 1. length against the target (±8 % is on target)
  const target = plan.minutes;
  const ok = Math.abs(o.minutes - target) <= target * 0.08;
  out.push({
    key: "length",
    ok,
    vals: { minutes: o.minutes, target, tandas: tandas.length, slots: plan.slots.length },
    fix: ok ? undefined : o.minutes < target ? { kind: "fill" } : { kind: "remove-last" },
  });
  // 2. the big four: each at least once once the night has room for them (≥ 4 tandas planned)
  const have = new Set(tandas.map((t) => t.orchestraId));
  const missing = plan.bigFour.filter((id) => !have.has(id));
  out.push({
    key: "bigfour",
    ok: missing.length === 0,
    vals: {
      have: plan.bigFour.length - missing.length,
      of: plan.bigFour.length,
      missing: missing.map((id) => BIG_FOUR_NAME[id] ?? id).join(", "),
    },
    fix: missing[0] ? { kind: "orchestra", id: missing[0] } : undefined,
  });
  // 3. the energy arc: the tanda furthest from its slot's target (more than 15 off is a line to look at)
  let worst = -1;
  let gap = 0;
  tandas.forEach((t, i) => {
    const want = plan.slots[i]?.targetEnergy;
    if (want === undefined) return;
    const d = t.energy - want;
    if (Math.abs(d) > Math.abs(gap)) {
      gap = d;
      worst = i;
    }
  });
  const offArc = worst >= 0 && Math.abs(gap) > 15;
  out.push({
    key: "energy",
    ok: !offArc,
    vals: offArc
      ? {
          n: worst + 1,
          energy: Math.round(tandas[worst]!.energy),
          target: Math.round(plan.slots[worst]!.targetEnergy),
          dir: gap > 0 ? "hot" : "calm",
        }
      : { n: tandas.length },
    fix: offArc ? { kind: "suggest" } : undefined,
  });
  // 4. the rhythm cycle: the first tanda off the planned cycle (and what the next slot asks for)
  const plannedR = plan.slots.map((s) => s.rhythm);
  const off = tandas.findIndex((t, i) => plannedR[i] !== undefined && t.rhythm !== plannedR[i]);
  const nextR = plannedR[tandas.length];
  out.push({
    key: "cycle",
    ok: off < 0,
    vals: {
      // (the last six tandas and the plan over the same places: a whole night of letters says nothing)
      have: cycleText(tandas.slice(-6).map((t) => t.rhythm)) || "–",
      want: cycleText(plannedR.slice(Math.max(0, tandas.length - 6), Math.max(6, tandas.length))),
      n: off + 1,
      rhythm: off >= 0 ? (plannedR[off] ?? "") : (nextR ?? ""),
    },
    fix:
      off >= 0
        ? { kind: "rhythm", rhythm: plannedR[off]! }
        : nextR
          ? { kind: "rhythm", rhythm: nextR }
          : undefined,
  });
  // 5. the cortinas between tandas: picked or Auto (Auto is fine: the night picks one)
  const gaps = Math.max(0, tandas.length - 1);
  const picked = o.cortinas.slice(0, gaps).filter(Boolean).length;
  const firstAuto = o.cortinas.slice(0, gaps).findIndex((c) => !c);
  // (a night of one tanda has no gap yet: no line)
  if (gaps)
    out.push({
      key: "cortinas",
      ok: true,
      vals: { picked, auto: gaps - picked, gaps },
      fix: firstAuto >= 0 ? { kind: "cortina", at: firstAuto } : undefined,
    });
  return out;
}
