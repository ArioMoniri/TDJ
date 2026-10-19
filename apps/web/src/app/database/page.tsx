"use client";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { Check, Download, LoaderCircle, RotateCcw, Upload } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { CountUp } from "@/components/CountUp";
import { ContextTab } from "@/components/db/ContextTab";
import { CortinasTab } from "@/components/db/CortinasTab";
import { OrchestrasTab } from "@/components/db/OrchestrasTab";
import { RulesTab } from "@/components/db/RulesTab";
import { SongsTab } from "@/components/db/SongsTab";
import { Toast, useToast } from "@/components/Toast";
import { Segmented } from "@/components/ui";
import { downloadBlob } from "@/lib/download";
import { fade, rise, t } from "@/lib/motion";
import { countChanges, parseImport } from "@/lib/overrides";
import { useStore } from "@/lib/store";
import type { AppOverrides, Meta } from "@/lib/types";

type Tab = "songs" | "orchestras" | "cortinas" | "rules" | "context";
const TABS: Array<[Tab, string]> = [
  ["songs", "Songs"],
  ["orchestras", "Orchestras"],
  ["cortinas", "Cortinas"],
  ["rules", "Rules"],
  ["context", "Context"],
];

export default function DatabasePage() {
  const { overrides, overridesReady, storageMode, updateOverrides, resetOverrides } = useStore();
  const [tab, setTab] = useState<Tab>("songs");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [exported, setExported] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importSlow, setImportSlow] = useState(false);
  const { toast, show, dismiss } = useToast();
  const reduced = useReducedMotion();
  const file = useRef<HTMLInputElement>(null);
  // the spinner only shows if an import takes more than 300 ms
  useEffect(() => {
    if (!importing) {
      setImportSlow(false);
      return;
    }
    const id = setTimeout(() => setImportSlow(true), 300);
    return () => clearTimeout(id);
  }, [importing]);
  const restore = (prev: AppOverrides) => () => updateOverrides(() => prev);
  useEffect(() => {
    fetch("/api/meta")
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => {});
  }, []);
  const changes = countChanges(overrides);
  const built = meta?.meta.builtAt
    ? new Date(meta.meta.builtAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "…";

  const exportJson = () => {
    downloadBlob(
      "tdj-database.json",
      JSON.stringify({ ...overrides, updatedAt: new Date().toISOString() }, null, 2),
      "application/json",
    );
    setExported(true);
    setTimeout(() => setExported(false), 1200);
  };
  const importJson = async (f: File) => {
    setImporting(true);
    const prev = overrides;
    try {
      const o = parseImport(await f.text());
      updateOverrides(() => o);
      setMsg({ text: `Imported ${countChanges(o)} changes from ${f.name}.` });
      show(`Imported ${countChanges(o)} changes`, restore(prev));
    } catch (e) {
      setMsg({ text: `Could not import: ${(e as Error).message}`, error: true });
    } finally {
      setImporting(false);
    }
  };
  const reset = async () => {
    if (!changes) return;
    const prev = overrides;
    setConfirming(false);
    await resetOverrides();
    setMsg({ text: "Database reset to the repo index." });
    show(`Removed ${countChanges(prev)} changes`, restore(prev));
  };

  return (
    <div className="space-y-4">
      <div className="surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl font-semibold">Database</h1>
            <p className="text-muted mt-1 text-sm">
              Repo index built {built}, {meta ? meta.meta.songs.toLocaleString() : "…"} songs; your overrides:{" "}
              <span className="font-medium text-[rgb(var(--text))]" data-testid="db-changes">
                {overridesReady ? <CountUp value={changes} /> : "…"} {changes === 1 ? "change" : "changes"}
              </span>
              .
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(var(--text)/.08)] px-2.5 py-1 text-xs font-medium">
            <span
              className={`h-1.5 w-1.5 rounded-full ${storageMode === "server" ? "bg-[#2f9e5b]" : "bg-[rgb(var(--muted))]"}`}
              aria-hidden
            />
            {storageMode === "server" ? "Server storage" : "Stored in this browser"}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-ghost text-sm"
            onClick={() => file.current?.click()}
            disabled={importing}
          >
            {importSlow ? <LoaderCircle size={15} className="animate-spin" /> : <Upload size={15} />} Import
            JSON
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Import database JSON"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importJson(f);
              e.target.value = "";
            }}
          />
          <button type="button" className="btn btn-ghost text-sm" onClick={exportJson}>
            <span className="relative inline-grid h-4 w-4 place-items-center" aria-hidden>
              <AnimatePresence mode="wait" initial={false}>
                {exported ? (
                  <motion.span
                    key="check"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={t.press}
                    className="inline-flex"
                  >
                    <Check size={15} />
                  </motion.span>
                ) : (
                  <motion.span
                    key="dl"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={t.press}
                    className="inline-flex"
                  >
                    <Download size={15} />
                  </motion.span>
                )}
              </AnimatePresence>
            </span>{" "}
            {exported ? "Exported" : "Export JSON"}
          </button>
          <button
            type="button"
            className={`btn text-sm ${confirming ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setConfirming((v) => !v)}
            disabled={!changes}
            aria-expanded={confirming}
          >
            <RotateCcw size={15} /> Reset
          </button>
        </div>
        <AnimatePresence initial={false}>
          {confirming && changes > 0 && (
            <motion.div
              key="confirm"
              variants={rise}
              initial="hidden"
              animate="show"
              exit="exit"
              className="mt-2 flex flex-wrap items-center gap-2 text-sm"
              data-testid="reset-confirm"
            >
              <span>Remove all {changes} changes?</span>
              <button type="button" className="btn btn-primary min-h-9 px-3 text-sm" onClick={reset}>
                Confirm reset
              </button>
              <span className="text-muted" aria-hidden>
                ·
              </span>
              <button
                type="button"
                className="btn btn-ghost min-h-9 px-3 text-sm"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <p
          className={`mt-2 flex min-h-5 items-center gap-1.5 text-xs ${msg?.error ? "text-[var(--accent)]" : "text-muted"}`}
          role="status"
          aria-live="polite"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={msg?.text ?? "default"}
              variants={fade}
              initial="hidden"
              animate="show"
              exit="exit"
              className="inline-flex items-center gap-1.5"
            >
              {msg?.error && (
                <span className="inline-block h-4 w-4" aria-hidden>
                  <DotLottieReact
                    src="/anim/error-mark.json"
                    autoplay={!reduced}
                    loop={false}
                    dotLottieRefCallback={(d) => {
                      if (reduced) d?.setFrame(23);
                    }}
                    style={{ width: "100%", height: "100%" }}
                  />
                </span>
              )}
              {msg?.text ??
                "Every set you compose uses these edits. Export to keep a copy or move them to another device."}
            </motion.span>
          </AnimatePresence>
        </p>
      </div>
      <div className="surface p-5 sm:p-6">
        <Segmented label="Database section" value={tab} onChange={setTab} items={TABS} />
        <div className="mt-5">
          {/* tab content cross-fades; height snaps (tables are large) */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={tab} variants={fade} initial="hidden" animate="show" exit="exit">
              {tab === "songs" && <SongsTab />}
              {tab === "orchestras" && <OrchestrasTab orchestras={meta?.orchestras ?? []} />}
              {tab === "cortinas" && <CortinasTab base={meta?.cortinaList ?? []} />}
              {tab === "rules" && <RulesTab orchestras={meta?.orchestras ?? []} />}
              {tab === "context" && <ContextTab model={meta?.contextModel ?? null} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <Toast toast={toast} onDismiss={dismiss} />
    </div>
  );
}
