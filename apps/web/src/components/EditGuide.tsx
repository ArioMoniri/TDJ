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
          className="edit-guide fixed inset-x-3 bottom-[calc(var(--bottom-chrome,0px)+0.75rem)] z-40 mx-auto max-w-md rounded-2xl border border-[var(--separator)] bg-[var(--surface)] p-3 shadow-xl sm:inset-x-auto sm:right-6 sm:bottom-[calc(1.5rem+var(--mini-stack,0px))] sm:w-[26rem]"
          aria-label={t("guide.title")}
          data-testid="edit-guide"
        >
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
          <ul className="mt-1 flex max-h-[40vh] flex-col gap-2 overflow-y-auto">
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
                    <CircleAlert
                      size={15}
                      className="mt-0.5 shrink-0 text-[var(--orange,#ff9500)]"
                      aria-hidden
                    />
                  ) : (
                    <Info size={15} className="mt-0.5 shrink-0 text-[var(--label-2)]" aria-hidden />
                  )}
                  <span>{guideText(l)}</span>
                </span>
                {l.fix && (
                  <span className="flex gap-2 pl-6">
                    <button
                      type="button"
                      className="btn btn-ghost min-h-11 px-3 text-footnote"
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
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
