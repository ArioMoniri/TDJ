"use client";
import {
  approveEdit,
  checkEdit,
  type EditFact,
  type EditSuggestion,
  forgetException,
  type LearnedPreferences,
  type NightException,
  nightExceptionKeys,
  type Playlist,
  type RuleViolation,
  recordExceptions,
  rememberEdit,
  templateIdOf,
  withoutExceptionMarker,
} from "@tdj/core";
import { create } from "zustand";
import { t } from "./i18n";
import { en, type MsgKey } from "./i18n/en";
import { requestFavourites } from "./popularity";
import { useStore } from "./store";
import { toast } from "./toast";

/**
 * The rule check before an edit, on every screen that changes a night (the Swap sheet and search-and-swap, a tanda
 * replaced from Compose, the song search panel, a side added by hand, an AI edit, a booth version, a setting over a
 * pinned tanda). `gateEdit` runs core `checkEdit` on the device first: an edit that keeps every rule applies at once,
 * with no request and no question. A soft break (taste, flow) applies with a toast that offers Undo and the
 * suggestion. A hard break (a tanda rule) asks first in the RuleConfirmSheet, with the facts and up to three
 * suggestions from /api/check-edit: "Use suggestion" applies one and teaches like a normal swap; "Do it as I said"
 * applies the edit and records a one-night exception (this night's id only, never a template). Settings → Compose
 * rules → "Ask before breaking a rule" off: a hard break applies at once, with a toast and Undo.
 */

export type RuleChoice = { kind: "suggestion"; playlist: Playlist } | { kind: "asSaid" } | { kind: "cancel" };
export interface RuleAsk {
  id: number;
  mode: "hard" | "soft";
  violations: RuleViolation[];
  suggestions: EditSuggestion[];
  /** the suggestions are on their way */
  loading: boolean;
  resolve: (c: RuleChoice) => void;
}
export const useRuleAsk = create<{ ask: RuleAsk | null }>(() => ({ ask: null }));
let seq = 0;

/** the core's plain words inside a fact ("instrumental", "singer-led") in the DJ's language; names stay as recorded */
const WORDS: Record<string, MsgKey> = {
  instrumental: "ruleCheck.word.instrumental",
  sung: "ruleCheck.word.sung",
  "singer-led": "ruleCheck.word.singer_led",
  "rhythm-led": "ruleCheck.word.rhythm_led",
  unknown: "ruleCheck.word.unknown",
};
/** a fact or a message in the DJ's language (the core's English when a key is unknown) */
export function ruleText(
  m: { key: string; params: Record<string, string | number> },
  english: string,
): string {
  if (!(m.key in en)) return english;
  const params = Object.fromEntries(
    Object.entries(m.params).map(([k, v]) => [k, typeof v === "string" && WORDS[v] ? t(WORDS[v]!) : v]),
  );
  return t(m.key as MsgKey, params);
}
export const factText = (f: EditFact) => ruleText(f, f.text);
export const violationTitle = (v: RuleViolation) => ruleText(v.message, v.text);
export const suggestionText = (s: EditSuggestion) => ruleText(s.message, s.text);

/** the DJ's one-night exceptions of this night (their memory) */
export const nightExceptionsOf = (
  L: LearnedPreferences | undefined,
  nightId: string | undefined,
): NightException[] => (nightId ? (L?.night?.exceptions ?? []).filter((x) => x.nightId === nightId) : []);

/** the tandas the strict panel accepts tonight: the featured night's approvals and the DJ's own, this night's only */
export function approvedKeys(
  featured: LearnedPreferences | null | undefined,
  mine: LearnedPreferences | undefined,
  nightId: string | undefined,
): Set<string> {
  return new Set([...nightExceptionKeys(featured, nightId), ...nightExceptionKeys(mine, nightId)]);
}

/** the server's facts (the catalogue's other recordings) and suggestions; the device's check when it cannot answer */
async function details(
  before: Playlist,
  after: Playlist,
  exceptions: NightException[],
  scope: GateOptions["scope"] = "all",
): Promise<{ violations: RuleViolation[]; suggestions: EditSuggestion[] } | null> {
  try {
    const r = await fetch("/api/check-edit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        before,
        after,
        exceptions,
        scope,
        // 2026-11: the DJ's dancer favourites rank first (♥)
        favourites: requestFavourites(useStore.getState().memory) ?? null,
      }),
    });
    if (!r.ok) return null;
    return (await r.json()) as { violations: RuleViolation[]; suggestions: EditSuggestion[] };
  } catch {
    return null;
  }
}

function ask(
  o: Omit<RuleAsk, "id" | "resolve">,
  more?: Promise<Partial<RuleAsk> | null>,
): Promise<RuleChoice> {
  return new Promise<RuleChoice>((resolve) => {
    const id = ++seq;
    useRuleAsk.setState({ ask: { ...o, id, resolve } });
    void more?.then((m) => {
      const cur = useRuleAsk.getState().ask;
      if (cur?.id === id) useRuleAsk.setState({ ask: { ...cur, ...(m ?? {}), loading: false } });
    });
  });
}
/** the sheet answered (or was dismissed: Cancel) */
export function answer(c: RuleChoice) {
  const cur = useRuleAsk.getState().ask;
  useRuleAsk.setState({ ask: null });
  cur?.resolve(c);
}

export type GateResult = "applied" | "soft" | "suggestion" | "exception" | "cancelled";
export interface GateOptions {
  before: Playlist;
  after: Playlist;
  /** what the edit did, in the DJ's words (History and the learned edits) */
  label: string;
  apply: (p: Playlist, label: string) => void | Promise<void>;
  /** the gate teaches from the night it applies (default); false when the caller teaches on its own */
  learn?: boolean;
  /** a hand-built draft: the tanda rules only */
  scope?: "all" | "tandas";
}

/**
 * Check an edit, then apply it, a suggestion or nothing. Resolves with what happened; "applied" means no rule was
 * touched (the caller's own toast stands), every other outcome has said so itself.
 */
export async function gateEdit(o: GateOptions): Promise<GateResult> {
  const st = useStore.getState();
  const exceptions = nightExceptionsOf(st.memory.learned, o.after.id);
  const local = checkEdit(o.before, o.after, { exceptions, scope: o.scope }).violations;
  const learnedBefore = st.memory.learned;
  const teach = (p: Playlist, note: string) => {
    if (o.learn === false || !useStore.getState().settings.learn) return;
    useStore.getState().updateMemory((m) => rememberEdit(m, o.before, p, note));
  };
  const undo = (what: string) => () => {
    void o.apply(o.before, what);
    useStore.getState().updateMemory((m) => ({ ...m, learned: learnedBefore }));
  };
  if (!local.length) {
    await o.apply(o.after, o.label);
    teach(o.after, o.label);
    return "applied";
  }
  const hard = local.filter((v) => v.severity === "hard");
  const askFirst = useStore.getState().settings.askBeforeRuleBreak !== false;
  const asSaid = async (withToast: boolean) => {
    const { playlist, exceptions: exs } = approveEdit(o.after, hard, t("ruleCheck.reason_as_said"));
    await o.apply(playlist, o.label);
    useStore.getState().updateMemory((m) => ({ ...m, learned: recordExceptions(m.learned, exs) }));
    teach(playlist, o.label);
    if (withToast)
      toast(t("ruleCheck.applied_as_said", { line: violationTitle(hard[0]!) }), undo(t("ruleCheck.undone")));
    else toast(t("ruleCheck.done_as_said"), undo(t("ruleCheck.undone")));
    return "exception" as const;
  };
  if (!hard.length) {
    // soft: the edit applies; the toast offers Undo and the suggestion
    await o.apply(o.after, o.label);
    teach(o.after, o.label);
    const applied = useStore.getState().playlist ?? o.after;
    toast(
      t("ruleCheck.soft_toast", { line: violationTitle(local[0]!) }),
      undo(t("ruleCheck.undone")),
      undefined,
      {
        label: t("ruleCheck.see_suggestion"),
        run: () => void seeSuggestion(o, local, applied),
      },
    );
    return "soft";
  }
  if (!askFirst) return asSaid(true);
  const choice = await ask(
    { mode: "hard", violations: hard, suggestions: [], loading: true },
    details(o.before, o.after, exceptions, o.scope).then((d) =>
      d
        ? { violations: d.violations.filter((v) => v.severity === "hard"), suggestions: d.suggestions }
        : null,
    ),
  );
  if (choice.kind === "cancel") return "cancelled";
  if (choice.kind === "asSaid") return asSaid(false);
  await o.apply(choice.playlist, o.label);
  teach(choice.playlist, o.label);
  toast(t("ruleCheck.suggestion_used"), undo(t("ruleCheck.undone")));
  return "suggestion";
}

/** "See suggestion" on a soft toast: the sheet with the suggestions; "Keep as is" closes it */
async function seeSuggestion(o: GateOptions, violations: RuleViolation[], applied: Playlist) {
  const choice = await ask(
    { mode: "soft", violations, suggestions: [], loading: true },
    details(o.before, o.after, nightExceptionsOf(useStore.getState().memory.learned, o.after.id)),
  );
  if (choice.kind !== "suggestion") return;
  // only when the night on screen is still the one the edit made
  if (useStore.getState().playlist && useStore.getState().playlist !== applied) return;
  await o.apply(choice.playlist, o.label);
  if (o.learn !== false && useStore.getState().settings.learn)
    useStore.getState().updateMemory((m) => rememberEdit(m, o.before, choice.playlist, o.label));
  toast(t("ruleCheck.suggestion_used"));
}

/** remove one exception (the night's panel, Database → Memory): its record, and its marker on the night on screen */
export function removeException(x: NightException) {
  const st = useStore.getState();
  st.updateMemory((m) => ({ ...m, learned: forgetException(m.learned, x.nightId, x.tandaId) }));
  const p = st.playlist;
  if (p?.id === x.nightId) st.setPlaylist(withoutExceptionMarker(p, x.tandaId));
}

/** the hand-built draft's exceptions wait under this id until "Use this night" gives the night its own */
export const DRAFT_NIGHT = "build-draft";

/**
 * "Use this night": the draft's one-night exceptions move to the built night (its id, its tandas' ids, the marker on
 * each tanda) and leave the draft; returns the night to put on Compose.
 */
export function adoptDraftExceptions(p: Playlist): Playlist {
  const st = useStore.getState();
  const drafts = nightExceptionsOf(st.memory.learned, DRAFT_NIGHT);
  if (!drafts.length) return p;
  const key = (ids: string[]) => ids.slice().sort().join(",");
  const exs: NightException[] = [];
  const tandas = p.tandas.map((t) => {
    const x = drafts.find(
      (d) => key((d.tandaId?.split(":")[1] ?? "").split(",")) === key(t.songs.map((s) => s.id)),
    );
    if (!x) return t;
    exs.push({ ...x, nightId: p.id, tandaId: templateIdOf(t) });
    return {
      ...t,
      locked: true,
      pinned: { ...(t.pinned ?? { by: "dj" as const }), exception: { nightId: p.id, rules: x.rules ?? [] } },
    };
  });
  st.updateMemory((m) => {
    const rest = (m.learned?.night?.exceptions ?? []).filter((x) => x.nightId !== DRAFT_NIGHT);
    const L = m.learned
      ? { ...m.learned, night: { ...(m.learned.night ?? {}), exceptions: rest } }
      : m.learned;
    return { ...m, learned: recordExceptions(L, exs) };
  });
  return { ...p, tandas };
}
