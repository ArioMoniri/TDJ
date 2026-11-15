import type { VerifyResult } from "./exportVerify";
import { plural, t } from "./i18n";
import type { PlanRow } from "./spotifyPlan";

/**
 * What the Export sheet shows after a target was written and read back (lib/exportVerify.ts): one summary line,
 * the problems in the DJ's words, and the playlist as the target holds it, row by row, against the night's slot.
 * The same view for every target; only the target's name changes.
 */
export type Mark = "ok" | "missing" | "unavailable" | "replaced" | "moved" | "extra";
export interface ViewRow {
  /** 1-based position in the target (missing rows: the position they should have) */
  pos: number;
  title: string;
  artist: string;
  /** the night's slot: "Tanda 3, song 2", "Cortina 3", "Opening" */
  slot: string;
  mark: Mark;
}
export interface CheckView {
  target: string;
  ok: boolean;
  summary: string;
  /** one line per problem, in the DJ's words */
  lines: string[];
  rows: ViewRow[];
  /** something can be put right by writing again */
  fixable: boolean;
}

/** a row of the night as the check names it */
export type NightRow = Pick<PlanRow, "kind" | "tanda" | "song" | "title" | "artist">;

export function slotOf(r: Pick<PlanRow, "kind" | "tanda" | "song">): string {
  if (r.kind === "opening") return t("exportCheck.slot_opening");
  if (r.kind === "closing") return t("exportCheck.slot_closing");
  if (r.kind === "cortina") return t("exportCheck.slot_cortina", { tanda: r.tanda });
  return t("exportCheck.slot_song", { tanda: r.tanda, song: r.song ?? 1 });
}
/** "Gallo ciego (Pugliese) (tanda 4)", "Yaz Gazeteci Yaz (Selda Bağcan) (cortina 3)" */
export function labelOf(r: NightRow): string {
  const label = `${r.title} (${r.artist})`;
  if (r.kind === "cortina") return t("exportCheck.cortina_after", { label, tanda: r.tanda });
  if (r.kind === "opening" || r.kind === "closing") return `${label} · ${slotOf(r)}`;
  return t("exportCheck.in_tanda", { label, tanda: r.tanda });
}
const list = (xs: string[], n = 4) => `${xs.slice(0, n).join("; ")}${xs.length > n ? "…" : ""}`;

export function checkView(
  target: string,
  r: VerifyResult & {
    replaced?: Array<{ at: number }>;
    snapshotChanged?: boolean | null;
    repairs?: number;
    error?: string;
    retryAfter?: number;
  },
  /** the rows the export meant to write, in order (aligned with the expected list) */
  night: NightRow[],
  /** the target's rows as read back (title and artist when the target names them) */
  held: Array<{ title?: string; artist?: string }>,
): CheckView {
  const at = (i: number): NightRow =>
    night[i] ?? { kind: "track", tanda: 0, title: "?", artist: "", song: undefined };
  const replacedAt = new Set((r.replaced ?? []).map((x) => x.at));
  const unavailableAt = new Set(r.unavailable.map((u) => u.at));
  const moved = new Set(r.outOfOrder);
  const extra = new Set(r.extra.map((x) => x.at));
  const rows: ViewRow[] = held.map((h, j) => {
    const own = j < night.length ? at(j) : null;
    const mark: Mark = extra.has(j)
      ? "extra"
      : moved.has(j)
        ? "moved"
        : unavailableAt.has(j)
          ? "unavailable"
          : replacedAt.has(j)
            ? "replaced"
            : "ok";
    return {
      pos: j + 1,
      title: h.title ?? own?.title ?? "?",
      artist: h.artist ?? own?.artist ?? "",
      slot: own && mark !== "extra" ? slotOf(own) : "",
      mark,
    };
  });
  for (const m of r.missing) {
    const n = at(m.at);
    rows.push({ pos: m.at + 1, title: n.title, artist: n.artist, slot: slotOf(n), mark: "missing" });
  }
  rows.sort((a, b) => a.pos - b.pos || (a.mark === "missing" ? 1 : -1));
  const lines: string[] = [];
  if (r.missing.length)
    lines.push(t("exportCheck.missing", { list: list(r.missing.map((m) => labelOf(at(m.at)))) }));
  if (r.outOfOrder.length) lines.push(t("exportCheck.moved", { n: r.outOfOrder.length }));
  if (r.extra.length) lines.push(t("exportCheck.extra", { n: r.extra.length }));
  if (replacedAt.size)
    lines.push(
      plural("exportCheck.replaced", replacedAt.size, {
        list: list([...replacedAt].sort((a, b) => a - b).map((i) => labelOf(at(i)))),
      }),
    );
  if (r.unavailable.length)
    lines.push(t("exportCheck.unavailable", { list: list(r.unavailable.map((u) => labelOf(at(u.at)))) }));
  if (r.ok && r.repairs) lines.push(t("exportCheck.repaired"));
  if (!r.ok && r.repairs) lines.push(t("exportCheck.repaired_rounds", { n: r.repairs }));
  if (r.snapshotChanged === false) lines.push(t("exportCheck.not_confirmed", { target }));
  if (r.retryAfter) lines.push(t("exportCheck.paused", { target, sec: r.retryAfter }));
  else if (r.error) lines.push(t("exportCheck.stopped", { error: r.error.slice(0, 160) }));
  return {
    target,
    ok: r.ok,
    summary: r.ok
      ? t("exportCheck.ok", { target, actual: r.actual, expected: r.expected })
      : t("exportCheck.partial", { target, inPlace: r.inPlace, expected: r.expected }),
    lines,
    rows,
    fixable: !r.ok,
  };
}
