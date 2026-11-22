"use client";
import {
  type ComposeOptions,
  ERA_SETTINGS,
  type NightReview,
  REVIEW_SETTING_KEYS,
  type ReviewFinding,
  type ReviewSeverity,
} from "@tdj/core";
import { create } from "zustand";
import { undoEdit } from "./editHistory";
import { t } from "./i18n";
import { gateEdit, ruleText } from "./ruleCheck";
import { spotCall } from "./spot";
import { fullOptions } from "./store";
import { toast } from "./toast";
import type { AppOptions, Playlist } from "./types";

/**
 * 2026-11 — "Import a night" review, the browser side of POST /api/spot `review` / `reviewFix` / `safeFixes` /
 * `reorder` (core review.ts). A night imported into Compose or the Booth is read against the DJ's Compose settings
 * (`composeSettings`: the era's defaults under the DJ's own night and tanda rules — what the Compose tab shows); the
 * findings come back in plain words, each fix goes through the rule check and is one entry of the undo history.
 *
 * Compose shows every finding (components/importNight/ReviewPanel.tsx); the Booth only the blockers and high ones on
 * the tandas still to come, and asks before it changes anything mid-night (ReviewBanner).
 */

export type ReviewMode = "compose" | "booth";

interface ReviewState {
  /** the night under review and where (null: none) */
  active: { nightId: string; mode: ReviewMode } | null;
  /** findings the DJ ignored (by finding id), per night */
  ignored: Record<string, string[]>;
  /** the Booth's banner folded for this night */
  folded: Record<string, boolean>;
}
export const useNightReview = create<ReviewState>(() => ({ active: null, ignored: {}, folded: {} }));

/** start reviewing a night where it was imported (Compose or the Booth) */
export function startReview(nightId: string, mode: ReviewMode): void {
  useNightReview.setState((s) => ({ active: { nightId, mode }, folded: { ...s.folded, [nightId]: false } }));
}
export function stopReview(): void {
  useNightReview.setState({ active: null });
}
export function ignoreFinding(nightId: string, id: string): void {
  useNightReview.setState((s) => ({
    ignored: { ...s.ignored, [nightId]: [...new Set([...(s.ignored[nightId] ?? []), id])] },
  }));
}
export function unignoreAll(nightId: string): void {
  useNightReview.setState((s) => ({ ignored: { ...s.ignored, [nightId]: [] } }));
}

/**
 * The night rules the review follows: the Compose tab's settings as the composer reads them (the era's defaults under
 * the DJ's choices), only the keys a review reads (core REVIEW_SETTING_KEYS).
 */
export function composeSettings(options: AppOptions): Partial<ComposeOptions> {
  const era = (options.eras ?? ["golden"])[0] ?? "golden";
  const eraDefaults = ERA_SETTINGS[era] ?? ERA_SETTINGS.golden!;
  const full = { ...eraDefaults, ...fullOptions(options) } as Partial<ComposeOptions>;
  const out: Record<string, unknown> = {};
  for (const k of REVIEW_SETTING_KEYS) if (full[k] !== undefined) out[k] = full[k];
  out.rules = { ...eraDefaults.rules, ...(options.rules ?? {}) };
  return out as Partial<ComposeOptions>;
}

export const SEVERITY_KEY: Record<
  ReviewSeverity,
  "review.sev.blocker" | "review.sev.high" | "review.sev.medium" | "review.sev.low"
> = {
  blocker: "review.sev.blocker",
  high: "review.sev.high",
  medium: "review.sev.medium",
  low: "review.sev.low",
};

export const findingText = (f: Pick<ReviewFinding, "message" | "text">) => ruleText(f.message, f.text);
export const fixLabel = (f: ReviewFinding) => (f.fix ? ruleText(f.fix.message, f.fix.text) : "");

/** the review of a night (null when the engine could not be reached) */
export async function fetchReview(
  playlist: Playlist,
  o: { settings: Partial<ComposeOptions>; level: ReviewMode; fixedBefore?: number },
  signal?: AbortSignal,
): Promise<NightReview | null> {
  const r = await spotCall<NightReview>(
    "review",
    { playlist, settings: o.settings, level: o.level, fixedBefore: o.fixedBefore ?? 0 },
    signal,
  );
  return r.ok && Array.isArray(r.json.findings) ? r.json : null;
}

type Apply = (p: Playlist, label: string) => void | Promise<void>;
type Edited = Playlist & { changed?: boolean; reason?: string; applied?: number };

/** an engine edit through the rule check into the undo history, with the toast's Undo */
async function commit(before: Playlist, r: { ok: boolean; json: Edited }, label: string, apply: Apply) {
  const { changed, reason, applied: _a, ...after } = r.json;
  if (!r.ok || !changed) {
    toast(reason ? t("spot.not_applied_why", { reason }) : t("spot.not_applied"));
    return false;
  }
  const res = await gateEdit({ before, after: after as Playlist, label, apply, learn: false, guide: false });
  if (res === "cancelled") return false;
  if (res === "applied") toast(label, () => void undoEdit());
  return true;
}

/** a finding's fix on the night */
export async function applyFinding(
  playlist: Playlist,
  f: ReviewFinding,
  settings: Partial<ComposeOptions>,
  apply: Apply,
): Promise<boolean> {
  if (!f.fix) return false;
  const r = await spotCall<Edited>("reviewFix", { playlist, fix: f.fix.fix, settings });
  return commit(playlist, r, fixLabel(f), apply);
}

/** every safe fix at once: one edit, one undo */
export async function applySafeFixes(
  playlist: Playlist,
  settings: Partial<ComposeOptions>,
  apply: Apply,
  fixedBefore = 0,
): Promise<number> {
  const r = await spotCall<Edited>("safeFixes", { playlist, settings, fixedBefore });
  const n = r.json.applied ?? 0;
  if (!n) {
    toast(t("review.nothing_safe"));
    return 0;
  }
  return (await commit(playlist, r, t("review.applied_safe", { count: n }), apply)) ? n : 0;
}

/** the tandas in a new order (the review's suggestion, or a drag of the tanda list) */
export async function applyOrder(
  playlist: Playlist,
  order: number[],
  apply: Apply,
  label = t("review.reordered"),
): Promise<boolean> {
  const r = await spotCall<Edited>("reorder", { playlist, order });
  return commit(playlist, r, label, apply);
}

/** the order with tanda `from` moved to place `to` (splice semantics, as a drag) */
export function dragOrder(n: number, from: number, to: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return order;
  const [x] = order.splice(from, 1);
  order.splice(to, 0, x!);
  return order;
}
