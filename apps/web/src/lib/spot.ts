"use client";
import type { GuideFix, GuideLine } from "@tdj/core";
import { create } from "zustand";
import { undoEdit } from "./editHistory";
import { t } from "./i18n";
import { gateEdit, reshaped, ruleText } from "./ruleCheck";
import { toast } from "./toast";
import type { Playlist } from "./types";

/**
 * 2026-11 (the owner: "songs and tandas insertable or removable in each tanda and before / after tandas, by AI and
 * manually; during and after these the AI should help and guide"). The browser side of POST /api/spot (lib/api/
 * spot.ts → core insert.ts): the spot the Insert sheet works on, the edits through the rule check (gateEdit: a broken
 * rule asks in the RuleConfirmSheet; every edit is one entry of the undo history), and the guide after each edit —
 * what it did to the night, with a one-tap fix — shown by components/EditGuide.tsx on every screen.
 */

/** where an insert goes: a side at place `at` of tanda `tanda`, or a whole tanda at place `at` (0 = before the first) */
export type Spot = { kind: "song"; tanda: number; at: number } | { kind: "tanda"; at: number };

/** the host's way to put a night in (Compose's store, the Booth's plan, a room) */
export type ApplyNight = (p: Playlist, label: string) => void | Promise<void>;

export async function spotCall<T = Playlist & { changed?: boolean; reason?: string }>(
  action: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<{ ok: boolean; status: number; json: T }> {
  try {
    const r = await fetch("/api/spot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...body }),
      signal,
    });
    return { ok: r.ok, status: r.status, json: (await r.json().catch(() => ({}))) as T };
  } catch {
    return { ok: false, status: 0, json: {} as T };
  }
}

/* ---------- the guide ---------- */

export interface GuideState {
  /** the edit's label ("Tanda added before tanda 5") */
  label: string;
  lines: GuideLine[];
  /** the night the lines are about (the one on screen after the edit) */
  night: Playlist | null;
  /** 2026-11: the night before the edit (a fix's guide reads the whole edit again, not the fix alone) */
  base: Playlist | null;
  apply: ApplyNight | null;
  /** the page the edit was made on: the card shows there only */
  scope: string;
  busy: boolean;
  /**
   * QA fix 2026-11: a page shows the guide docked in its own column (Compose's inspector, wide screens): the floating
   * card stays away, so it never covers the inspector or the tanda list
   */
  docked?: boolean;
}
export const useGuide = create<GuideState>(() => ({
  label: "",
  lines: [],
  night: null,
  base: null,
  apply: null,
  scope: "",
  busy: false,
}));
const here = () => (typeof location === "undefined" ? "/" : location.pathname || "/");
let gseq = 0;

export const guideText = (l: GuideLine) => ruleText(l.message, l.text);
export const fixText = (l: GuideLine) => (l.fix ? ruleText(l.fix.message, l.fix.text) : "");

export const structural = reshaped;

/** ask the engine what the edit did and show it (an empty answer hides the card) */
export async function showGuide(before: Playlist, after: Playlist, apply: ApplyNight, label: string) {
  const id = ++gseq;
  const r = await spotCall<{ lines?: GuideLine[] }>("guide", { before, playlist: after });
  if (id !== gseq) return;
  const lines = r.json.lines ?? [];
  useGuide.setState({ label, lines, night: after, base: before, apply, scope: here(), busy: false });
}
export const hideGuide = () => {
  gseq++;
  useGuide.setState({ lines: [], night: null, base: null, apply: null, label: "" });
};

/** a guide line's fix: the night with it, through the rule check and into the undo history; then the guide again */
export async function applyFix(line: GuideLine): Promise<boolean> {
  const st = useGuide.getState();
  if (!line.fix || !st.night || !st.apply) return false;
  // (the DJ may close the card while the fix is on its way: it still applies, the card stays closed)
  const shown = gseq;
  useGuide.setState({ busy: true });
  try {
    const r = await spotCall("fix", { playlist: st.night, fix: line.fix.fix as GuideFix });
    const { changed, reason, ...after } = r.json;
    if (!r.ok || !changed) {
      toast(reason ? t("spot.not_applied_why", { reason }) : t("spot.not_applied"));
      return false;
    }
    const label = fixText(line);
    const before = st.night;
    const apply = st.apply;
    const res = await gateEdit({
      before,
      after: after as Playlist,
      label,
      apply,
      learn: false,
      guide: false,
    });
    if (res === "cancelled") return false;
    if (res === "applied") toast(label, () => void undoEdit());
    // 2026-11: what the whole edit still does (the night before the edit → now): the lines the fix did not touch
    // stay and the card stays open with them (it closed after any fix, the edit's other consequences lost)
    if (gseq === shown) await showGuide(st.base ?? before, after as Playlist, apply, label);
    return true;
  } finally {
    useGuide.setState({ busy: false });
  }
}

/**
 * An edit the engine made (an insert, a removal, a fix): through the rule check, into the undo history, then the
 * guide. Resolves with the gate's answer ("cancelled" when the DJ said no).
 */
export async function commitEdit(o: {
  before: Playlist;
  after: Playlist;
  label: string;
  apply: ApplyNight;
}): Promise<"applied" | "soft" | "suggestion" | "exception" | "cancelled"> {
  const res = await gateEdit({
    before: o.before,
    after: o.after,
    label: o.label,
    apply: o.apply,
    learn: false,
    guide: false,
  });
  if (res === "cancelled") return res;
  if (res === "applied") toast(o.label, () => void undoEdit());
  void showGuide(o.before, o.after, o.apply, o.label);
  return res;
}

/** remove side `si` of tanda `ti` (the last side takes its tanda) */
export async function removeSongAt(p: Playlist, ti: number, si: number, apply: ApplyNight) {
  const title = p.tandas[ti]?.songs[si]?.title ?? "";
  const r = await spotCall("removeSong", { playlist: p, tandaIndex: ti, trackIndex: si });
  const { changed, reason, ...after } = r.json;
  if (!r.ok || !changed) {
    toast(reason ? t("spot.not_applied_why", { reason }) : t("spot.not_applied"));
    return "cancelled" as const;
  }
  return commitEdit({
    before: p,
    after: after as Playlist,
    label: t("spot.removed_song", { title, n: ti + 1 }),
    apply,
  });
}

/** remove tanda `ti` (its cortina handled by the engine) */
export async function removeTandaAt(p: Playlist, ti: number, apply: ApplyNight) {
  const r = await spotCall("removeTanda", { playlist: p, tandaIndex: ti });
  const { changed, reason, ...after } = r.json;
  if (!r.ok || !changed) {
    toast(reason ? t("spot.not_applied_why", { reason }) : t("spot.not_applied"));
    return "cancelled" as const;
  }
  return commitEdit({
    before: p,
    after: after as Playlist,
    label: t("spot.removed_tanda", { n: ti + 1, orchestra: p.tandas[ti]?.orchestra ?? "" }),
    apply,
  });
}

/* ---------- the Insert sheet's store (one sheet per screen) ---------- */

export interface InsertAsk {
  spot: Spot;
  playlist: Playlist;
  apply: ApplyNight;
  /** the Booth: why this spot cannot change now */
  lockedReason?: string | null;
  testId?: string;
}
export const useInsert = create<{ ask: InsertAsk | null; open: (a: InsertAsk) => void; close: () => void }>(
  (set) => ({
    ask: null,
    open: (ask) => set({ ask }),
    close: () => set({ ask: null }),
  }),
);
export const openInsert = (a: InsertAsk) => useInsert.getState().open(a);
