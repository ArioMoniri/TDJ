import type { CortinaHook, CortinaHookFile, HookKind } from "@tdj/core";
import { t } from "@/lib/i18n";
import HOOKS from "../../../../../data/cache/cortina_hooks.json";
import { durationLabel } from "./plan";

/**
 * 2026-11 (the owner: "cortinas play 40 s from the start, so dancers don't recognise them"): where a cortina starts
 * tonight and why — its chorus (data/cache/cortina_hooks.json, shipped with the app), the first verse, or the DJ's
 * own start (the cortina's sheet, saved per cortina id with the night) — as the Booth prints it.
 */
const BY_ID = (HOOKS as unknown as CortinaHookFile).hooks;

export function cortinaHookOf(id: string | undefined): CortinaHook | null {
  return (id && BY_ID[id]) || null;
}

export interface CortinaStartInfo {
  startSec: number;
  kind: HookKind | null;
  /** "Starts at 0:42 (chorus)" */
  label: string;
}

/** The start the plan plays (`trimInSec`) and why: the DJ's own start, else the hook's kind. */
export function cortinaStartOf(
  it: { id?: string; trimInSec?: number },
  edits?: Record<string, { startSec?: number }> | null,
): CortinaStartInfo {
  const startSec = it.trimInSec ?? 0;
  const own = it.id ? edits?.[it.id]?.startSec : undefined;
  const hook = cortinaHookOf(it.id);
  const kind: HookKind | null =
    own !== undefined
      ? "manual"
      : startSec > 0 && hook && hook.source !== "none"
        ? (hook.kind ?? (hook.source === "audio" ? "energy" : "chorus"))
        : null;
  const why =
    kind === "chorus"
      ? t("booth.cortinaStart.why_chorus")
      : kind === "first-vocal"
        ? t("booth.cortinaStart.why_first_vocal")
        : kind === "energy"
          ? t("booth.cortinaStart.why_energy")
          : kind === "manual"
            ? t("booth.cortinaStart.why_manual")
            : null;
  const p1 = durationLabel(startSec);
  return {
    startSec,
    kind,
    label:
      why && (startSec > 0 || kind === "manual")
        ? t("booth.cortinaStart.starts_at_why", { p1, why })
        : t("booth.cortinaStart.starts_at", { p1 }),
  };
}
