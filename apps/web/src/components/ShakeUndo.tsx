"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isTextTarget, nextRedo, nextUndo, onEdit } from "@/lib/editHistory";
import { runHistory } from "@/lib/editToast";
import { haptic } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import {
  adoptMotionGrant,
  nativeShake,
  needsMotionPermission,
  requestMotion,
  type ShakeAlertModel,
  type ShakeChoice,
  ShakeDetector,
  shakeAlert,
  shakeOn,
  shakeWanted,
  useShakePref,
} from "@/lib/shake";

/** after a scroll or a drag, shakes are the hand moving the page, not a question (ms) */
const SCROLL_QUIET_MS = 600;

/**
 * 2026-11 — Shake to Undo (lib/shake.ts), mounted once by components/EditKeys.tsx: a shake on a phone or a tablet asks
 * first, as iOS does — "Undo <label>?" Cancel / Undo (after an undo: "Redo <label>?", with the undo before it too).
 * The choice runs the same undo / redo as ⌘Z (lib/editToast.ts runHistory), so the Booth's rules hold: what the room
 * already heard says why it can't be undone (lib/booth/undo.ts). Never while typing, scrolling or with the page
 * hidden; Reduce Motion: the alert fades without its zoom.
 */
export function ShakeUndo() {
  const pref = useShakePref();
  const [model, setModel] = useState<ShakeAlertModel | null>(null);
  const open = useRef(false);
  open.current = model !== null;

  // what was last done on each page (an undo makes the next shake offer its redo)
  const lastKind = useRef(new Map<string, "record" | "undo" | "redo">());
  useEffect(() => onEdit((e, kind) => lastKind.current.set(e.scope, kind)), []);

  // a browser that has requestPermission but grants motion already (Chrome): taken as the grant, no tap needed
  useEffect(() => {
    if (shakeWanted(pref) && needsMotionPermission() && !pref.granted) void adoptMotionGrant();
  }, [pref]);

  // iOS: a grant given before is asked again once, on the first tap (silent while WebKit still remembers it)
  useEffect(() => {
    if (!shakeWanted(pref) || !needsMotionPermission() || !pref.granted) return;
    const once = () => void requestMotion();
    window.addEventListener("pointerup", once, { once: true });
    return () => window.removeEventListener("pointerup", once);
  }, [pref]);

  // a shake: ask what it offers (never while the alert is up, the page is hidden or a field is being typed in)
  const offer = useCallback(() => {
    if (open.current || document.hidden) return;
    if (isTextTarget(document.activeElement)) return;
    const scope = location.pathname || "/";
    const m = shakeAlert({
      undo: nextUndo(scope)?.label ?? null,
      redo: nextRedo(scope)?.label ?? null,
      lastWasUndo: lastKind.current.get(scope) === "undo",
    });
    if (!m) return;
    haptic(12);
    setModel(m);
  }, []);

  // the iPhone / iPad app: UIKit already decided it was a shake (src-tauri apple.rs → `tdj:shake`)
  useEffect(() => {
    if (!nativeShake() || !shakeOn(pref)) return;
    window.addEventListener("tdj:shake", offer);
    return () => window.removeEventListener("tdj:shake", offer);
  }, [pref, offer]);

  useEffect(() => {
    if (nativeShake() || !shakeOn(pref)) return;
    const detector = new ShakeDetector();
    let scrolled = Number.NEGATIVE_INFINITY;
    const onScroll = () => {
      scrolled = performance.now();
      detector.reset();
    };
    const onMotion = (e: DeviceMotionEvent) => {
      const now = performance.now();
      if (!detector.pushMotion(e, e.timeStamp || now)) return;
      if (now - scrolled < SCROLL_QUIET_MS) return;
      offer();
    };
    window.addEventListener("devicemotion", onMotion);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("touchmove", onScroll, { passive: true });
    return () => {
      window.removeEventListener("devicemotion", onMotion);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("touchmove", onScroll);
    };
  }, [pref, offer]);

  const choose = useCallback((c: ShakeChoice | null) => {
    setModel(null);
    if (c) void runHistory(c.kind);
  }, []);
  return <ShakeAlert model={model} onChoose={choose} />;
}

/** the iOS alert: a title, then Cancel / the action side by side (three buttons stack, as iOS does) */
export function ShakeAlert({
  model,
  onChoose,
}: {
  model: ShakeAlertModel | null;
  onChoose: (c: ShakeChoice | null) => void;
}) {
  const reduced = useReducedMotion();
  const titleId = useId();
  const main = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!model) return;
    main.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onChoose(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [model, onChoose]);
  if (!mounted) return null;
  const verb = (c: ShakeChoice) => (c.kind === "undo" ? t("editKeys.undo") : t("editKeys.redo"));
  const title = model
    ? t(model.main.kind === "undo" ? "shake.undo_title" : "shake.redo_title", { label: model.main.label })
    : "";
  const btn =
    "min-h-11 flex-1 px-3 py-2.5 text-[17px] text-[var(--tint)] active:bg-[var(--fill-3)] focus-visible:outline-none focus-visible:bg-[var(--fill-3)]";
  const stacked = !!model?.other;
  return createPortal(
    <AnimatePresence>
      {model && (
        <div
          key="shake-alert"
          className="fixed inset-0 z-[70] flex items-center justify-center p-6"
          data-testid="shake-alert"
        >
          <motion.div
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => onChoose(null)}
            aria-hidden
          />
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="sheet-material relative w-[270px] max-w-full overflow-hidden rounded-[14px] text-center shadow-[0_24px_80px_rgb(0_0_0/.3)]"
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 1.12 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            transition={reduced ? { duration: 0.15 } : { type: "spring", stiffness: 520, damping: 38 }}
          >
            <div className="px-4 pt-5 pb-4">
              <h2 id={titleId} className="text-[17px] font-semibold" data-testid="shake-alert-title">
                {title}
              </h2>
            </div>
            <div
              className={`flex border-t border-[var(--separator)] ${stacked ? "flex-col divide-y" : "divide-x"} divide-[var(--separator)]`}
            >
              {stacked ? (
                <>
                  <button
                    ref={main}
                    type="button"
                    className={`${btn} font-semibold`}
                    onClick={() => onChoose(model.main)}
                    data-testid={`shake-${model.main.kind}`}
                  >
                    {verb(model.main)}
                  </button>
                  <button
                    type="button"
                    className={btn}
                    onClick={() => onChoose(model.other!)}
                    data-testid={`shake-${model.other!.kind}`}
                  >
                    {t(model.other!.kind === "undo" ? "shake.undo_named" : "shake.redo_named", {
                      label: model.other!.label,
                    })}
                  </button>
                  <button
                    type="button"
                    className={btn}
                    onClick={() => onChoose(null)}
                    data-testid="shake-cancel"
                  >
                    {t("sheet.cancel")}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={btn}
                    onClick={() => onChoose(null)}
                    data-testid="shake-cancel"
                  >
                    {t("sheet.cancel")}
                  </button>
                  <button
                    ref={main}
                    type="button"
                    className={`${btn} font-semibold`}
                    onClick={() => onChoose(model.main)}
                    data-testid={`shake-${model.main.kind}`}
                  >
                    {verb(model.main)}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
