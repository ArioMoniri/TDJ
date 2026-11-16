"use client";
import { CircleAlert, Info, LoaderCircle, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { haptic } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { applyFix, fixText, guideText, hideGuide, useGuide } from "@/lib/spot";

/**
 * 2026-11 (the owner: "during and after these the AI should help and guide; near the Cumparsitas it should check and
 * suggest changes to the Cumparsita"): the guide after an insert, a removal or any edit that changed the night's shape
 * — one line per consequence (the night's length, an energy bump, a broken rhythm cycle, a cortina added or removed,
 * a big-four or orchestra repeat, the opening / closing La Cumparsita that no longer matches) with a one-tap fix
 * each ("Switch to Di Sarli 1951", "Move tanda 7 to place 9") and Keep (close). Mounted once in the layout; shows on
 * the page the edit was made on. Content on `surface` (not glass); every control ≥ 44 px.
 */
/**
 * QA fix 2026-11 (the owner: the card was transparent, its lines printed over the inspector's tracks): an opaque
 * surface card (`--surface` is an RGB triplet: `bg-[var(--surface)]` painted nothing) with a border, a shadow, a
 * 16 px radius and 20 px padding, in its own stacking context above the content and below sheets and toasts (z-40).
 * Desktop: the bottom-left of the content column (right of the sidebar), clear of the inspector on the right and above
 * the mini players (`--mini-stack`); phones: a bottom sheet above the tab bar. Its lines scroll past 60 % of the
 * screen; each fix is a 44 px secondary button.
 */
export function EditGuide() {
  const { lines, label, scope, busy } = useGuide();
  const reduced = useReducedMotion();
  const [path, setPath] = useState("");
  useEffect(() => {
    const read = () => setPath(location.pathname || "/");
    read();
    const id = setInterval(read, 500);
    return () => clearInterval(id);
  }, []);
  const open = lines.length > 0 && path === scope;
  const card = (
    <>
      <div className="flex items-start gap-2">
        <Sparkles size={16} className="mt-0.5 shrink-0 text-[var(--tint)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-footnote font-semibold">{t("guide.title")}</p>
          <p className="text-caption1 truncate text-[var(--label-2)]">{label}</p>
        </div>
        <button
          type="button"
          className="icon-btn icon-btn-bare -mt-1 -mr-1 h-11 w-11 shrink-0"
          aria-label={t("guide.keep")}
          onClick={hideGuide}
          data-testid="edit-guide-close"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      <ul className="mt-2 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain">
        {lines.map((l, k) => (
          <li
            key={k}
            className="flex flex-col gap-1"
            data-testid="edit-guide-line"
            data-key={l.key}
            data-tone={l.tone}
          >
            <span className="text-subhead flex items-start gap-2">
              {l.tone === "warn" ? (
                <CircleAlert size={15} className="mt-0.5 shrink-0 text-[var(--orange,#ff9500)]" aria-hidden />
              ) : (
                <Info size={15} className="mt-0.5 shrink-0 text-[var(--label-2)]" aria-hidden />
              )}
              <span>{guideText(l)}</span>
            </span>
            {l.fix && (
              <span className="flex gap-2 pl-6">
                <button
                  type="button"
                  className="btn btn-ghost min-h-11 px-4 text-footnote"
                  disabled={busy}
                  onClick={() => {
                    haptic(6);
                    void applyFix(l);
                  }}
                  data-testid="edit-guide-fix"
                >
                  {busy ? <LoaderCircle size={14} className="animate-spin" aria-hidden /> : null}
                  {fixText(l)}
                </button>
                {(l.key === "opening" || l.key === "closing") && (
                  <button
                    type="button"
                    className="btn-plain min-h-11 px-2 text-footnote"
                    onClick={() => useGuide.setState((s) => ({ lines: s.lines.filter((x) => x !== l) }))}
                    data-testid="edit-guide-keep"
                  >
                    {t("guide.keep_cumparsita")}
                  </button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </>
  );
  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          // (one card: a fix updates it in place — keyed by the label, the old card was still leaving as the new one came)
          key="edit-guide"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
          transition={{ duration: 0.2 }}
          className="edit-guide fixed inset-x-3 bottom-[calc(var(--bottom-chrome,0px)+0.75rem)] z-40 mx-auto flex max-h-[min(60vh,32rem)] max-w-md flex-col rounded-2xl border border-[var(--separator)] bg-[rgb(var(--surface))] p-5 shadow-[0_12px_40px_rgb(0_0_0/0.28)] [isolation:isolate] sm:inset-x-auto sm:right-6 sm:bottom-[calc(1.5rem+var(--mini-stack,0px))] sm:w-[26rem] lg:right-auto lg:left-[calc(var(--sidebar-w,240px)+1.5rem)] lg:mx-0"
          aria-label={t("guide.title")}
          data-testid="edit-guide"
        >
          {card}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
