import {
  type LearnedPreferences,
  type Succession,
  type SuccessionPart,
  successionHighlights,
  tandaSuccession,
} from "@tdj/core";
import { t as tx } from "@/lib/i18n";
import type { MsgKey } from "@/lib/i18n/en";
import type { Playlist } from "@/lib/types";

/**
 * 2026-11 — the succession model's one line (packages/core/src/succession.ts), for Compose's tanda inspector and the
 * swap sheet's suggested tandas: "Follows Di Sarli well: energy +6, rhythmic after lyrical, common in DJ sets (42×)",
 * or a warning, "Two rhythmic tandas in a row: …". Computed on the device from the committed data; one line, never
 * a list.
 */
export interface SuccessionView {
  text: string;
  tone: "good" | "ok" | "warn";
}

const sg = (x: number) => `${x > 0 ? "+" : ""}${x}`;
const CLASS: Record<string, MsgKey> = {
  "R+": "succession.class.driving",
  R: "succession.class.rhythmic",
  L: "succession.class.lyrical",
  B: "succession.class.balanced",
  D: "succession.class.dramatic",
};
const VOICE: Record<string, MsgKey> = {
  "high-tenor": "succession.voice.high_tenor",
  tenor: "succession.voice.tenor",
  baritone: "succession.voice.baritone",
  female: "succession.voice.female",
};
const word = (m: Record<string, MsgKey>, k: unknown) => (m[String(k)] ? tx(m[String(k)]!) : String(k));

/** one part in the app's language */
export function partText(p: SuccessionPart): string {
  const d = p.detail;
  switch (p.kind) {
    case "energy":
      return Number(d.plan)
        ? tx("succession.part.energy_plan", { step: sg(Number(d.step)), plan: sg(Number(d.plan)) })
        : tx("succession.part.energy", { step: sg(Number(d.step)) });
    case "style":
      return tx("succession.part.after", { a: word(CLASS, d.to), b: word(CLASS, d.from) });
    case "era":
      return tx("succession.part.era", { from: d.from, to: d.to });
    case "voice":
      return d.voice === "same"
        ? tx("succession.part.same_singer")
        : tx("succession.part.after", { a: word(VOICE, d.to), b: word(VOICE, d.from) });
    case "tempo":
      return tx("succession.part.tempo", { from: d.from, to: d.to });
    case "key":
      return d.keys
        ? tx("succession.part.key", { keys: String(d.keys).replace(">", " → ") })
        : tx("succession.part.brightness");
    case "lineage":
      return tx("succession.part.lineage");
    case "corpus":
      return Number(d.count)
        ? tx("succession.part.corpus", { n: d.count })
        : tx("succession.part.corpus_rare");
    case "learned":
      if (d.floor !== undefined && Math.abs(Number(d.floor)) >= Math.abs(Number(d.weight) - Number(d.floor)))
        return Number(d.floor) > 0 ? tx("succession.part.floor_up") : tx("succession.part.floor_down");
      if (!Number(d.weight) && d.step !== undefined)
        return Number(d.step) > 0
          ? tx("succession.part.floor_step_up")
          : tx("succession.part.floor_step_down");
      return Number(d.weight) > 0 ? tx("succession.part.learned_up") : tx("succession.part.learned_down");
  }
}

const WARN: Record<NonNullable<Succession["warning"]>, MsgKey> = {
  two_rhythmic: "succession.warn.two_rhythmic",
  two_dramatic: "succession.warn.two_dramatic",
  two_lyrical: "succession.warn.two_lyrical",
  energy_jump: "succession.warn.energy_jump",
  era_jump: "succession.warn.era_jump",
  same_voice: "succession.warn.same_voice",
  same_singer: "succession.warn.same_singer",
  same_lineage: "succession.warn.same_lineage",
  rare_in_sets: "succession.warn.rare_in_sets",
};

/** a succession as one line: "Follows X well: …", "Follows X: …" or the warning */
export function successionText(
  s: Succession,
  name: string,
  lead: "follows" | "leads" = "follows",
): SuccessionView {
  const hl = successionHighlights(s).map(partText).join(tx("succession.sep"));
  const warn = s.verdict === "warn" || (!!s.warning && s.verdict !== "good");
  const head = warn
    ? s.warning
      ? tx(WARN[s.warning])
      : tx(lead === "follows" ? "succession.follows_poorly" : "succession.leads_poorly", { name })
    : s.verdict === "good"
      ? tx(lead === "follows" ? "succession.follows_well" : "succession.leads_well", { name })
      : tx(lead === "follows" ? "succession.follows" : "succession.leads", { name });
  return { text: hl ? `${head}: ${hl}` : head, tone: warn ? "warn" : s.verdict };
}

/** the line for tanda i of a night: how it follows the one before (the first tanda: how it leads into the next) */
export function tandaSuccessionView(
  p: Pick<Playlist, "tandas">,
  i: number,
  learned?: LearnedPreferences | null,
): SuccessionView | null {
  const s = tandaSuccession(p, i, { learned });
  if (s.fromPrev) return successionText(s.fromPrev, p.tandas[i - 1]!.orchestra);
  if (s.intoNext) return successionText(s.intoNext, p.tandas[i + 1]!.orchestra, "leads");
  return null;
}
