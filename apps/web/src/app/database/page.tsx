"use client";
import { Download, RotateCcw, Upload } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { CountUp } from "@/components/CountUp";
import { ContextTab } from "@/components/db/ContextTab";
import { CortinasTab } from "@/components/db/CortinasTab";
import { MemoryTab } from "@/components/db/MemoryTab";
import { OrchestrasTab } from "@/components/db/OrchestrasTab";
import { RulesTab } from "@/components/db/RulesTab";
import { SongsTab } from "@/components/db/SongsTab";
import { DbEditContext } from "@/components/db/shared";
import { ActionRow, Group } from "@/components/Form";
import { Menu, MenuList } from "@/components/Menu";
import { PageHeader } from "@/components/PageHeader";
import { Sheet } from "@/components/Sheet";
import { Toast, useToast } from "@/components/Toast";
import { Segmented } from "@/components/ui";
import { downloadBlob } from "@/lib/download";
import { haptic } from "@/lib/haptics";
import { useMediaQuery } from "@/lib/hooks";
import { fade } from "@/lib/motion";
import { countChanges, parseImport } from "@/lib/overrides";
import { useStore } from "@/lib/store";
import type { AppOverrides, Meta } from "@/lib/types";

type Tab = "songs" | "orchestras" | "cortinas" | "rules" | "context" | "memory";
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (d: Date) => `${d.getDate()} ${MONTH[d.getMonth()]}`;
/** phones: three tabs and a More menu (six at 15 pt did not fit, round4-ux.md P1-4) */
const PHONE_TABS: Tab[] = ["songs", "orchestras", "cortinas"];
const MORE_TABS: Tab[] = ["rules", "context", "memory"];
const TABS: Array<[Tab, string]> = [
  ["songs", "Songs"],
  ["orchestras", "Orchestras"],
  ["cortinas", "Cortinas"],
  ["rules", "Rules"],
  ["context", "Context"],
  ["memory", "Memory"],
];

export default function DatabasePage() {
  const { overrides, overridesReady, updateOverrides, resetOverrides } = useStore();
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
  const built = meta?.meta.builtAt ? shortDate(new Date(meta.meta.builtAt)) : "…";
  const [moreOpen, setMoreOpen] = useState(false);

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
  // phones: Songs · Orchestras · Cortinas · More (the More segment names the open section when it is one of its three)
  const isPhone = useMediaQuery("(max-width: 639px)");
  const label = (k: Tab) => TABS.find(([t]) => t === k)?.[1] ?? k;
  const inMore = MORE_TABS.includes(tab);
  const phoneItems: Array<[Tab | "more", string]> = [
    ...PHONE_TABS.map((k) => [k, label(k)] as [Tab, string]),
    ["more", inMore ? `${label(tab)} ▾` : "More ▾"],
  ];
  const segmented = (cls = "") =>
    isPhone ? (
      <Segmented<Tab | "more">
        label="Section"
        value={inMore ? "more" : tab}
        onChange={(k) => (k === "more" ? setMoreOpen(true) : setTab(k))}
        items={phoneItems}
        className={cls}
      />
    ) : (
      <Segmented label="Section" value={tab} onChange={setTab} items={TABS} className={cls} />
    );

  return (
    <div className="mx-auto min-w-0 max-w-[720px] lg:max-w-[980px]">
      <PageHeader
        title="Database"
        subtitle={
          <>
            {meta ? meta.meta.songs.toLocaleString() : "…"} recordings · updated {built}
            {/* the DJ's edits: said only once there are some ("0 changes" read as engineering, round8-ux.md §2) */}
            <span className={changes ? "" : "sr-only"}>
              {" · "}
              <span data-testid="db-changes">
                {overridesReady ? <CountUp value={changes} /> : "…"} {changes === 1 ? "change" : "changes"}
              </span>
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
        {/* the collapsed bar carries its own copy: the in-page one goes invisible meanwhile (round4-ux.md P2-8) */}
        <div className="bar-dup mt-3">{segmented("w-full sm:w-auto")}</div>
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
          <motion.div
            key={tab}
            variants={fade}
            initial="hidden"
            animate="show"
            exit="exit"
            className="min-w-0"
          >
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
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="More"
        detents={["medium"]}
        testId="db-more"
      >
        <MenuList
          items={MORE_TABS.map((k) => ({ label: label(k), onClick: () => setTab(k) }))}
          onPick={(it) => {
            setMoreOpen(false);
            it.onClick?.();
          }}
        />
      </Sheet>
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
