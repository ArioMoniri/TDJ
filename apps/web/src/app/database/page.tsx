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
import { Tip } from "@/components/ui/Tip";
import { downloadBlob } from "@/lib/download";
import { haptic } from "@/lib/haptics";
import { useMediaQuery } from "@/lib/hooks";
import { fmtNumber, lazy, t } from "@/lib/i18n";
import { fade } from "@/lib/motion";
import { countChanges, parseImport } from "@/lib/overrides";
import { useStore } from "@/lib/store";
import type { AppOverrides, Meta } from "@/lib/types";

type Tab = "songs" | "orchestras" | "cortinas" | "rules" | "context" | "memory";
const MONTH = lazy(() => [
  t("database.jan"),
  t("database.feb"),
  t("database.mar"),
  t("database.apr"),
  t("database.may"),
  t("database.jun"),
  t("database.jul"),
  t("database.aug"),
  t("database.sep"),
  t("database.oct"),
  t("database.nov"),
  t("database.dec"),
]);
const shortDate = (d: Date) => `${d.getDate()} ${MONTH[d.getMonth()]}`;
/** phones: three tabs and a More menu (six at 15 pt did not fit, round4-ux.md P1-4) */
const PHONE_TABS: Tab[] = ["songs", "orchestras", "cortinas"];
const MORE_TABS: Tab[] = ["rules", "context", "memory"];
const TABS: Array<[Tab, string]> = lazy(() => [
  ["songs", t("database.songs")],
  ["orchestras", t("database.orchestras")],
  ["cortinas", t("database.cortinas")],
  ["rules", t("database.rules")],
  ["context", t("database.context")],
  ["memory", t("database.memory")],
]);
const TAB_TIPS: Record<Tab, string> = {
  get songs() {
    return t("database.every_recording_search_edit_its_details");
  },
  get orchestras() {
    return t("database.each_orchestra_s_energy_and_your");
  },
  get cortinas() {
    return t("database.the_songs_played_between_tandas");
  },
  get rules() {
    return t("database.what_the_composer_follows_rule_by");
  },
  get context() {
    return t("database.how_the_room_the_crowd_and");
  },
  get memory() {
    return t("database.your_notes_past_nights_and_what");
  },
};

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
    setMsg({ text: t("database.exported_tdj_database_json") });
  };
  const importJson = async (f: File) => {
    setImporting(true);
    const prev = overrides;
    try {
      const o = parseImport(await f.text());
      updateOverrides(() => o);
      setMsg({ text: t("database.imported_changes_from", { o: countChanges(o), name: f.name }) });
      show(t("database.imported_changes", { o: countChanges(o) }), restore(prev));
    } catch (e) {
      setMsg({ text: t("database.could_not_import", { message: (e as Error).message }), error: true });
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
    setMsg({ text: t("database.database_reset_to_the_repo_index") });
    show(t("database.removed_changes", { prev: countChanges(prev) }), restore(prev));
  };
  // phones: Songs · Orchestras · Cortinas · More (the More segment names the open section when it is one of its three)
  const isPhone = useMediaQuery("(max-width: 639px)");
  const label = (k: Tab) => TABS.find(([t]) => t === k)?.[1] ?? k;
  const inMore = MORE_TABS.includes(tab);
  const phoneItems: Array<[Tab | "more", string]> = [
    ...PHONE_TABS.map((k) => [k, label(k)] as [Tab, string]),
    ["more", inMore ? `${label(tab)} ▾` : t("database.more_2")],
  ];
  const segmented = (cls = "") =>
    isPhone ? (
      <Segmented<Tab | "more">
        label={t("database.section")}
        value={inMore ? "more" : tab}
        onChange={(k) => (k === "more" ? setMoreOpen(true) : setTab(k))}
        items={phoneItems}
        tips={{ ...TAB_TIPS, more: t("database.rules_context_and_memory") }}
        className={cls}
      />
    ) : (
      <Segmented
        label={t("database.section")}
        value={tab}
        onChange={setTab}
        items={TABS}
        tips={TAB_TIPS}
        className={cls}
      />
    );

  return (
    <div className="mx-auto min-w-0 max-w-[720px] lg:max-w-[1100px]">
      <PageHeader
        title={t("database.database")}
        subtitle={
          <>
            <span className="whitespace-nowrap">
              {t("database.recordings", { p1: meta ? fmtNumber(meta.meta.songs) : "…" })}
            </span>{" "}
            <span className="whitespace-nowrap">{t("database.updated", { built })}</span>
            {/* the DJ's edits: said only once there are some ("0 changes" read as engineering, round8-ux.md §2);
                one unbreakable run, so "· 3 changes" never wraps onto a line of its own (wave 2) */}
            <span className={changes ? "whitespace-nowrap" : "sr-only"}>
              {" · "}
              <span data-testid="db-changes">
                {overridesReady ? <CountUp value={changes} /> : "…"}{" "}
                {changes === 1 ? t("database.change") : t("database.changes")}
              </span>
            </span>
          </>
        }
        trailing={
          <>
            <Tip
              text={
                editing ? t("database.stop_editing") : t("database.change_any_recording_orchestra_or_cortina")
              }
            >
              <button
                type="button"
                className={`btn-plain ${editing ? "font-semibold" : ""}`}
                aria-pressed={editing}
                onClick={() => setEditing((v) => !v)}
              >
                {editing ? t("database.done") : t("database.edit")}
              </button>
            </Tip>
            <Menu
              label={t("database.more")}
              items={[
                {
                  label: t("database.restore_a_backup"),
                  icon: Upload,
                  onClick: () => file.current?.click(),
                  disabled: importing,
                },
                { label: t("database.save_a_backup"), icon: Download, onClick: exportJson },
                {
                  label: t("database.reset_to_index"),
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
        aria-label={t("database.restore_a_database_backup")}
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
            {msg?.text ?? t("database.every_set_you_compose_uses_these")}
          </motion.span>
        </AnimatePresence>
      </p>
      <Sheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title={t("database.more")}
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
        title={t("database.reset_database")}
        detents={["medium"]}
        testId="reset-confirm"
      >
        <Group
          footer={t("database.remove_all_and_go_back_to", {
            changes,
            p1: changes === 1 ? t("database.change") : t("database.changes"),
          })}
        >
          <ActionRow
            label={t("database.reset", {
              changes,
              p1: changes === 1 ? t("database.change") : t("database.changes"),
            })}
            destructive
            onClick={reset}
          />
          <ActionRow label={t("database.cancel")} onClick={() => setConfirming(false)} />
        </Group>
      </Sheet>
      <Toast toast={toast} onDismiss={dismiss} />
    </div>
  );
}
