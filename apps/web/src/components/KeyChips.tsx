"use client";
import { Plus, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { useMediaQuery } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import type { MsgKey } from "@/lib/i18n/en";
import {
  ACTIONS,
  type ActionDef,
  type ActionId,
  applyBinding,
  bindingsOf,
  formatCombo,
  isDefaultBinding,
  proposeBinding,
  recordStep,
  removeBinding,
  resetBinding,
  setRecording,
  shownBindings,
  useKeymap,
} from "@/lib/keymap";
import { toast } from "@/lib/toast";
import { useTip } from "./ui/Tip";

/**
 * 2026-11 (the owner: "change keys everywhere should work as clicking on the key that is shown … and then pressing
 * the keys that replace it"): every list of shortcuts (Settings → Keyboard, the Booth's Keyboard sheet, the Mix
 * sheet's key hints) shows each key as a chip that is a button. Tap it and it records:
 * - the next key or combination (with ⌘ / Ctrl / ⇧ / ⌥) replaces that key; "+" adds another;
 * - Esc cancels, Tab moves on, ⌫ / Delete removes the chip's key (on "+" it cancels);
 * - a key the browser or the system keeps (⌘Q, ⌘W, ⌘T, ⌘R…) is refused with the reason, and the chip keeps recording;
 * - a key another action holds asks first: "Already used by X — Replace / Cancel".
 * One recorder at a time in the whole app (this module's session); while it records no shortcut runs
 * (lib/keymap.ts `recording`). Every list reads the one keymap store, so a change shows everywhere at once.
 */
interface Session {
  id: ActionId;
  /** the chip's key being replaced; null: the "+" adds one */
  target: string | null;
  phase: "recording" | "conflict";
  combo?: string;
  with?: ActionId[];
  refused?: { combo: string; reason: MsgKey };
}
const useSession = create<{ s: Session | null }>(() => ({ s: null }));
function setSession(s: Session | null) {
  useSession.setState({ s });
  setRecording(!!s);
}

const nameOf = (id: ActionId) => t(ACTIONS.find((a) => a.id === id)!.label);
const chipKey = (id: ActionId, combo: string | null) => `${id}|${combo ?? "+"}`;

/** the focus back on a chip once the row has re-rendered (the new key's, else the row's first) */
function focusChip(id: ActionId, combo: string | null) {
  requestAnimationFrame(() => {
    const esc = (v: string) => (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(v) : v);
    (
      document.querySelector<HTMLElement>(`[data-key-chip="${esc(chipKey(id, combo))}"]`) ??
      document.querySelector<HTMLElement>(`[data-key-chip^="${esc(`${id}|`)}"]`)
    )?.focus({ preventScroll: true });
  });
}

function end(id: ActionId, focusOn: string | null) {
  setSession(null);
  focusChip(id, focusOn);
}

/** the press while recording: refused, a conflict to answer, or saved */
function take(s: Session, combo: string) {
  const p = proposeBinding(s.id, combo, useKeymap.getState().custom);
  if (p.status === "reserved") return setSession({ ...s, refused: { combo, reason: p.reason } });
  if (p.status === "conflict")
    return setSession({ ...s, phase: "conflict", combo, with: p.with, refused: undefined });
  if (p.status === "ok") {
    applyBinding(s.id, combo, s.target);
    toast(t("keys.saved", { action: nameOf(s.id), key: formatCombo(combo) }));
  }
  end(s.id, combo);
}

function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

/**
 * The keys of one action as chips (each a button that records a new key), "+" to add one, and Reset to default when
 * they differ from the defaults. `compact`: the chips only (the Mix sheet's key hints).
 */
export function KeyChips({ action, compact = false }: { action: ActionDef; compact?: boolean }) {
  const custom = useKeymap((s) => s.custom);
  const s = useSession((x) => x.s);
  const mine = s?.id === action.id ? s : null;
  const mounted = useMounted();
  const name = t(action.label);
  // 2026-11 (plain words: every control says what it does, never a title attribute): one help tag for the row's
  // chips — tap a key to change it, + to add another, the arrow puts the defaults back
  const tip = useTip<HTMLSpanElement>(t("keys.chips_tip"));
  const keys = mounted ? shownBindings(bindingsOf(action.id, custom)) : shownBindings(action.defaults);
  const changed = mounted && !isDefaultBinding(action.id, custom);

  // while this row records (or asks about a conflict), the keyboard is the recorder's and a tap elsewhere cancels
  const active = mine ? `${mine.target ?? ""}|${mine.phase}` : null;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const st = useSession.getState().s;
      if (!st || st.id !== action.id) return;
      if (st.phase === "conflict") {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopImmediatePropagation();
          end(st.id, st.target);
        }
        return;
      }
      const step = recordStep(e);
      if (step.kind === "leave") {
        setSession(null);
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat || step.kind === "wait") return;
      if (step.kind === "cancel") return end(st.id, st.target);
      if (step.kind === "clear") {
        if (st.target !== null) {
          removeBinding(st.id, st.target);
          toast(t("keys.removed", { action: nameOf(st.id), key: formatCombo(st.target) }));
        }
        return end(st.id, null);
      }
      take(st, step.combo);
    };
    const onDown = (e: PointerEvent) => {
      const el = e.target as Element | null;
      if (!el?.closest?.(`[data-key-session="${action.id}"]`)) setSession(null);
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [active, action.id]);
  // (a list that unmounts mid-recording lets the shortcuts run again)
  useEffect(
    () => () => {
      if (useSession.getState().s?.id === action.id) setSession(null);
    },
    [action.id],
  );

  const start = (target: string | null) => setSession({ id: action.id, target, phase: "recording" });
  const recording = (target: string | null) => mine?.phase === "recording" && mine.target === target;
  const chip = (c: string) =>
    recording(c) ? (
      <Recorder key={c} action={action} />
    ) : (
      <button
        key={c}
        type="button"
        className="key-chip"
        data-key-chip={chipKey(action.id, c)}
        data-testid="key-chip"
        aria-label={t("keys.chip_aria", { action: name, key: formatCombo(c) })}
        onClick={() => start(c)}
      >
        <kbd>{formatCombo(c)}</kbd>
      </button>
    );
  return (
    <span
      className={`key-chips ${compact ? "booth-kbd" : ""}`}
      data-testid="key-binding"
      data-key-session={action.id}
      {...(tip.props as object)}
    >
      {tip.tag}
      {keys.map(chip)}
      {recording(null) ? (
        <Recorder action={action} />
      ) : !keys.length ? (
        <button
          type="button"
          className="key-chip"
          data-key-chip={chipKey(action.id, null)}
          aria-label={t("keys.none_aria", { action: name })}
          onClick={() => start(null)}
        >
          <kbd className="key-none">{t("keys.none")}</kbd>
        </button>
      ) : (
        !compact && (
          <button
            type="button"
            className="key-chip key-add"
            data-key-chip={chipKey(action.id, null)}
            data-testid="key-add"
            aria-label={t("keys.add_aria", { action: name })}
            onClick={() => start(null)}
          >
            <Plus size={14} strokeWidth={2.5} aria-hidden />
          </button>
        )
      )}
      {!compact && changed && (
        <button
          type="button"
          className="key-chip key-reset"
          data-testid="key-reset"
          aria-label={t("keys.reset_row_aria", {
            action: name,
            keys: shownBindings(action.defaults)
              .map((c) => formatCombo(c))
              .join(", "),
          })}
          onClick={() => {
            setSession(null);
            resetBinding(action.id);
            toast(t("keys.reset_done", { action: name }));
            focusChip(action.id, action.defaults[0] ?? null);
          }}
        >
          <RotateCcw size={14} strokeWidth={2.25} aria-hidden />
        </button>
      )}
    </span>
  );
}

/** the chip while it records: focused, "Press keys…", announced as recording */
function Recorder({ action }: { action: ActionDef }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);
  return (
    <button
      ref={ref}
      type="button"
      className="key-chip"
      data-recording=""
      data-key-recorder
      data-testid="key-recorder"
      aria-label={t("keys.recording_aria", { action: t(action.label) })}
    >
      <kbd>{t("keys.press_keys")}</kbd>
    </button>
  );
}

/**
 * The line under a row's label while it records: what to press (and, on a touch screen, that it needs a keyboard),
 * a refused key's reason, or a conflict to answer — with Cancel (a touch screen has no Esc).
 */
export function KeyStatus({ action, className = "" }: { action: ActionDef; className?: string }) {
  const s = useSession((x) => x.s);
  const coarse = useMediaQuery("(pointer: coarse)");
  const replace = useRef<HTMLButtonElement>(null);
  const mine = s?.id === action.id ? s : null;
  const conflict = mine?.phase === "conflict";
  useEffect(() => {
    if (conflict) replace.current?.focus({ preventScroll: true });
  }, [conflict]);
  if (!mine) return null;
  const cancel = (
    <button
      type="button"
      className="btn-plain key-line-btn"
      data-testid="key-cancel"
      onClick={() => end(mine.id, mine.target)}
    >
      {t("keys.cancel")}
    </button>
  );
  if (mine.phase === "conflict" && mine.combo)
    return (
      <span
        className={`key-line ${className}`}
        data-key-session={action.id}
        data-testid="key-conflict"
        role="alert"
      >
        <span className="text-[var(--destructive)]">
          {t("keys.conflict_line", {
            key: formatCombo(mine.combo),
            actions: (mine.with ?? []).map(nameOf).join(", "),
          })}
        </span>
        <button
          ref={replace}
          type="button"
          className="btn-plain key-line-btn font-semibold"
          data-testid="key-replace"
          onClick={() => {
            applyBinding(mine.id, mine.combo!, mine.target, { takeFrom: true });
            toast(t("keys.saved", { action: nameOf(mine.id), key: formatCombo(mine.combo!) }));
            end(mine.id, mine.combo!);
          }}
        >
          {t("keys.replace")}
        </button>
        {cancel}
      </span>
    );
  return (
    <span className={`key-line ${className}`} data-key-session={action.id}>
      <span role="status" aria-live="polite" data-testid="key-status">
        {mine.refused ? (
          <span className="text-[var(--destructive)]" data-testid="key-refused">
            {t(mine.refused.reason, { key: formatCombo(mine.refused.combo) })}
          </span>
        ) : (
          t(mine.target === null ? "keys.recording_hint_add" : "keys.recording_hint")
        )}
        {coarse && (
          <span className="block" data-testid="key-touch-hint">
            {t("keys.touch_hint")}
          </span>
        )}
      </span>
      {cancel}
    </span>
  );
}

/** one action's row: its name (and the recorder's line under it) and its key chips */
export function KeyRow({ action, testId }: { action: ActionDef; testId: string }) {
  return (
    <div className="cell key-row" data-testid={testId}>
      <span className="min-w-0 flex-1">
        <span className="cell-label">{t(action.label)}</span>
        <KeyStatus action={action} />
      </span>
      <KeyChips action={action} />
    </div>
  );
}
