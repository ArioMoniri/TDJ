"use client";
import { Download, RotateCcw, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ContextTab } from "@/components/db/ContextTab";
import { CortinasTab } from "@/components/db/CortinasTab";
import { OrchestrasTab } from "@/components/db/OrchestrasTab";
import { RulesTab } from "@/components/db/RulesTab";
import { SongsTab } from "@/components/db/SongsTab";
import { Segmented } from "@/components/ui";
import { downloadBlob } from "@/lib/download";
import { countChanges, parseImport } from "@/lib/overrides";
import { useStore } from "@/lib/store";
import type { Meta } from "@/lib/types";

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
  const [msg, setMsg] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
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

  const exportJson = () =>
    downloadBlob(
      "tdj-database.json",
      JSON.stringify({ ...overrides, updatedAt: new Date().toISOString() }, null, 2),
      "application/json",
    );
  const importJson = async (f: File) => {
    try {
      const o = parseImport(await f.text());
      updateOverrides(() => o);
      setMsg(`Imported ${countChanges(o)} changes from ${f.name}.`);
    } catch (e) {
      setMsg(`Could not import: ${(e as Error).message}`);
    }
  };
  const reset = async () => {
    if (!changes || !confirm(`Remove all ${changes} changes and go back to the repo index?`)) return;
    await resetOverrides();
    setMsg("Database reset to the repo index.");
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
                {overridesReady ? changes : "…"} {changes === 1 ? "change" : "changes"}
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
          <button type="button" className="btn btn-ghost text-sm" onClick={() => file.current?.click()}>
            <Upload size={15} /> Import JSON
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
            <Download size={15} /> Export JSON
          </button>
          <button type="button" className="btn btn-ghost text-sm" onClick={reset} disabled={!changes}>
            <RotateCcw size={15} /> Reset
          </button>
        </div>
        <p className="text-muted mt-2 min-h-5 text-xs" role="status" aria-live="polite">
          {msg ??
            "Every set you compose uses these edits. Export to keep a copy or move them to another device."}
        </p>
      </div>
      <div className="surface p-5 sm:p-6">
        <Segmented label="Database section" value={tab} onChange={setTab} items={TABS} />
        <div className="mt-5">
          {tab === "songs" && <SongsTab />}
          {tab === "orchestras" && <OrchestrasTab orchestras={meta?.orchestras ?? []} />}
          {tab === "cortinas" && <CortinasTab base={meta?.cortinaList ?? []} />}
          {tab === "rules" && <RulesTab orchestras={meta?.orchestras ?? []} />}
          {tab === "context" && <ContextTab model={meta?.contextModel ?? null} />}
        </div>
      </div>
    </div>
  );
}
