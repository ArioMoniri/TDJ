"use client";
import { Download, HardDrive, RotateCcw, Upload } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ContextTab } from "@/components/db/ContextTab";
import { CortinasTab } from "@/components/db/CortinasTab";
import { MemoryTab } from "@/components/db/MemoryTab";
import { OrchestrasTab } from "@/components/db/OrchestrasTab";
import { RulesTab } from "@/components/db/RulesTab";
import { SongsTab } from "@/components/db/SongsTab";
import { DbEditContext } from "@/components/db/shared";
import { ActionRow, Group } from "@/components/Form";
import { Menu } from "@/components/Menu";
import { PageHeader } from "@/components/PageHeader";
import { Sheet } from "@/components/Sheet";
import { Toast, useToast } from "@/components/Toast";
import { Segmented } from "@/components/ui";
import { downloadBlob } from "@/lib/download";
import { haptic } from "@/lib/haptics";
import { fade } from "@/lib/motion";
import { countChanges, parseImport } from "@/lib/overrides";
import { useStore } from "@/lib/store";
import type { AppOverrides, Meta } from "@/lib/types";

type Tab = "songs" | "orchestras" | "cortinas" | "rules" | "context" | "memory";
const TABS: Array<[Tab, string]> = [
  ["songs", "Songs"],
  ["orchestras", "Orchestras"],
  ["cortinas", "Cortinas"],
  ["rules", "Rules"],
  ["context", "Context"],
  ["memory", "Memory"],
];

export default function DatabasePage() {
  const { overrides, overridesReady, storageMode, updateOverrides, resetOverrides } = useStore();
  const [tab, setTab] = useState<Tab>("songs");
  const [editing, setEditing] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [importing, setImporting] = useState(false);
  const { toast, show, dismiss } = useToast();
  const file = useRef<HTMLInputElement>(null);
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
    setMsg({ text: "Exported tdj-database.json." });
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
    haptic([12, 30, 12]);
    await resetOverrides();
    setMsg({ text: "Database reset to the repo index." });
    show(`Removed ${countChanges(prev)} changes`, restore(prev));
  };
  const segmented = (cls = "") => (
    <Segmented label="Section" value={tab} onChange={setTab} items={TABS} className={cls} />
  );

  return (
    <div className="mx-auto max-w-[720px] lg:max-w-[980px]">
      <PageHeader
        title="Database"
        subtitle={
          <>
            Index built {built} · {meta ? meta.meta.songs.toLocaleString() : "…"} songs ·{" "}
            <span data-testid="db-changes">
              {overridesReady ? changes : "…"} {changes === 1 ? "change" : "changes"}
            </span>
          </>
        }
        trailing={
          <>
            <button
              type="button"
              className={`btn-plain ${editing ? "font-semibold" : ""}`}
              aria-pressed={editing}
              onClick={() => setEditing((v) => !v)}
            >
              {editing ? "Done" : "Edit"}
            </button>
            <Menu
              label="More"
              items={[
                {
                  label: "Import JSON…",
                  icon: Upload,
                  onClick: () => file.current?.click(),
                  disabled: importing,
                },
                { label: "Export JSON", icon: Download, onClick: exportJson },
                {
                  label: storageMode === "server" ? "Stored on the server" : "Stored in this browser",
                  icon: HardDrive,
                  disabled: true,
                },
                {
                  label: "Reset to index…",
                  icon: RotateCcw,
                  onClick: () => setConfirming(true),
                  destructive: true,
                  disabled: !changes,
                },
              ]}
            />
          </>
        }
        inBar={segmented("w-full")}
      >
        <div className="mt-3">{segmented("w-full sm:w-auto")}</div>
      </PageHeader>
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
      <DbEditContext.Provider value={editing}>
        {/* tab content cross-fades; height snaps (lists are large) */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={tab} variants={fade} initial="hidden" animate="show" exit="exit">
            {tab === "songs" && <SongsTab />}
            {tab === "orchestras" && <OrchestrasTab orchestras={meta?.orchestras ?? []} />}
            {tab === "cortinas" && <CortinasTab base={meta?.cortinaList ?? []} />}
            {tab === "rules" && <RulesTab orchestras={meta?.orchestras ?? []} />}
            {tab === "context" && <ContextTab model={meta?.contextModel ?? null} />}
            {tab === "memory" && <MemoryTab />}
          </motion.div>
        </AnimatePresence>
      </DbEditContext.Provider>
      <p
        className={`section-foot mt-4 ${msg?.error ? "text-[var(--destructive)]" : ""}`}
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
            className="block"
          >
            {msg?.text ??
              "Every set you compose uses these edits. Export to keep a copy or move them to another device."}
          </motion.span>
        </AnimatePresence>
      </p>
      <Sheet
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Reset database"
        detents={["medium"]}
        testId="reset-confirm"
      >
        <Group
          footer={`Remove all ${changes} ${changes === 1 ? "change" : "changes"} and go back to the repo index. Undo stays available for a few seconds.`}
        >
          <ActionRow
            label={`Reset ${changes} ${changes === 1 ? "change" : "changes"}`}
            destructive
            onClick={reset}
          />
          <ActionRow label="Cancel" onClick={() => setConfirming(false)} />
        </Group>
      </Sheet>
      <Toast toast={toast} onDismiss={dismiss} />
    </div>
  );
}
