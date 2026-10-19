"use client";
import { Copy, Download, FileDown, GitCompare, Pencil, RotateCcw, Share, Trash2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { EnergyCurve } from "@/components/EnergyCurve";
import { ExportSheet } from "@/components/ExportSheet";
import { ActionRow, Group, Row } from "@/components/Form";
import { Menu } from "@/components/Menu";
import { PageHeader } from "@/components/PageHeader";
import { Sheet } from "@/components/Sheet";
import { SwipeRow } from "@/components/SwipeRow";
import { TandaCard } from "@/components/TandaCard";
import { downloadBlob } from "@/lib/download";
import { haptic } from "@/lib/haptics";
import { groupByDay } from "@/lib/history";
import { useMediaQuery } from "@/lib/hooks";
import { reduced as reducedV, rise } from "@/lib/motion";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { HistorySnapshot } from "@/lib/types";

const ERA: Record<string, string> = {
  golden: "Golden Age",
  "golden-extended": "Golden extended",
  "guardia-vieja": "Guardia Vieja",
  "post-golden": "Post-golden",
  nuevo: "Nuevo",
  contemporary: "Contemporary",
  all: "All eras",
};
const ARC: Record<string, string> = {
  "classic-two-peaks": "Two peaks",
  "single-peak": "Single peak",
  "marathon-plateau": "Marathon",
  gentle: "Gentle",
};
const noop = () => {};
const NO_PLAYLISTS: never[] = [];
const fmtH = (h: number) => `${h} h`.replace(".5 h", "½ h");
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/** Score ring (44 pt tile): the score as a conic ring in tint with the number inside. */
function ScoreRing({ score }: { score: number }) {
  return (
    <span
      className="tile-art text-footnote font-semibold"
      style={{
        background: `conic-gradient(var(--tint) ${score * 3.6}deg, var(--fill-3) 0)`,
      }}
      role="img"
      aria-label={`score ${score}`}
    >
      <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-[rgb(var(--bg-cell))] text-[var(--label)] tabular-nums">
        {score}
      </span>
    </span>
  );
}

/** Tiny sparkline of the last 20 scores (Health-style, right-side labels). */
function Sparkline({ scores }: { scores: number[] }) {
  const reduced = useReducedMotion();
  if (scores.length < 2) return null;
  const w = 120;
  const h = 28;
  const min = Math.max(0, Math.min(...scores) - 5);
  const max = Math.min(100, Math.max(...scores) + 5);
  const pts = scores.map(
    (s, i) => [(i / (scores.length - 1)) * w, h - ((s - min) / (max - min || 1)) * h] as const,
  );
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-label={`Score trend over the last ${scores.length} sets`}
      role="img"
      data-testid="score-trend"
    >
      <motion.path
        d={d}
        fill="none"
        stroke="var(--tint)"
        strokeWidth={1.5}
        strokeLinecap="round"
        initial={reduced ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      />
      <circle cx={pts.at(-1)![0]} cy={pts.at(-1)![1]} r={2.5} fill="var(--tint)" />
    </svg>
  );
}

export default function HistoryPage() {
  const {
    history,
    overridesReady,
    removeSnapshot,
    updateSnapshot,
    clearHistory,
    setPlaylist,
    replaceOptions,
    playlist,
  } = useStore();
  const router = useRouter();
  const reduced = useReducedMotion();
  const isPhone = useMediaQuery("(max-width: 639px)");
  const [openId, setOpenId] = useState<string | null>(null);
  const [compareWith, setCompareWith] = useState<HistorySnapshot | null>(null);
  const [picking, setPicking] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [exporting, setExporting] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const open = history.find((h) => h.id === openId) ?? null;
  const groups = useMemo(() => groupByDay(history), [history]);
  const trend = useMemo(() => [...history.slice(0, 20)].reverse().map((h) => h.score), [history]);
  const avg = trend.length ? Math.round(trend.reduce((a, b) => a + b, 0) / trend.length) : null;

  const remove = (s: HistorySnapshot) => {
    haptic(8);
    removeSnapshot(s.id);
    if (openId === s.id) setOpenId(null);
    toast(`Deleted "${s.title}"`, () => useStore.getState().addSnapshot(s));
  };
  const reopen = (s: HistorySnapshot) => {
    setPlaylist({ ...s.playlist, tandas: s.playlist.tandas.map((t) => ({ ...t, locked: false })) });
    replaceOptions({ ...s.options, seed: s.playlist.options.seed });
    toast(`Reopened "${s.title}" in Compose`);
    router.push("/#result");
  };
  const sub = (s: HistorySnapshot) =>
    `${fmtH(s.playlist.options.hours)} · ${ERA[s.playlist.options.eras?.[0] ?? "golden"] ?? ""} · ${ARC[s.playlist.options.arc] ?? s.playlist.options.arc} · ${s.playlist.tandas.length} tandas`;
  const rowV = reduced ? reducedV.rise : rise;
  const exportAll = () =>
    downloadBlob("tdj-history.json", JSON.stringify(history, null, 2), "application/json");

  return (
    <div className="mx-auto max-w-[720px] lg:max-w-[980px]">
      <PageHeader
        title="History"
        subtitle={
          history.length
            ? `${history.length} ${history.length === 1 ? "set" : "sets"} kept · last 50`
            : "Every set you compose lands here."
        }
        trailing={
          <>
            {trend.length >= 2 && (
              <span
                className="mr-1 inline-flex items-center gap-2"
                title={`Average ${avg} over the last ${trend.length}`}
              >
                <Sparkline scores={trend} />
                <span className="text-subhead tabular-nums text-[var(--label-2)]">{avg}</span>
              </span>
            )}
            <Menu
              label="More"
              items={[
                {
                  label: "Export history as JSON",
                  icon: Download,
                  onClick: exportAll,
                  disabled: !history.length,
                },
                {
                  label: "Clear history…",
                  icon: Trash2,
                  destructive: true,
                  onClick: () => setConfirmClear(true),
                  disabled: !history.length,
                },
              ]}
            />
          </>
        }
      />
      {!overridesReady && <p className="text-subhead py-8 text-center text-[var(--label-2)]">Loading…</p>}
      {overridesReady && history.length === 0 && (
        <EmptyState>
          Sets you compose land here, with their score, options and tandas. The trend starts after two.
        </EmptyState>
      )}
      {groups.map((g) => (
        <Group key={g.label} header={g.label}>
          <AnimatePresence initial={false}>
            {g.items.map((s, i) => (
              <motion.div
                key={s.id}
                layout={reduced ? false : "position"}
                variants={rowV}
                custom={i}
                initial="hidden"
                animate="show"
                exit="exit"
              >
                <SwipeRow
                  leading="art"
                  actions={[
                    {
                      kind: "lock",
                      label: "Compare",
                      icon: GitCompare,
                      onClick: () => {
                        setOpenId(s.id);
                        setPicking(true);
                      },
                    },
                    { kind: "destructive", label: "Delete", icon: Trash2, onClick: () => remove(s) },
                  ]}
                >
                  <Row
                    tile={<ScoreRing score={s.score} />}
                    label={s.title}
                    sub={`${time(s.createdAt)} · ${sub(s)}${s.source !== "compose" ? ` · ${s.source}` : ""}`}
                    value={playlist?.id === s.playlist.id ? "Current" : undefined}
                    chevron
                    onClick={() => setOpenId(s.id)}
                    id={`history-${s.id}`}
                  />
                </SwipeRow>
              </motion.div>
            ))}
          </AnimatePresence>
        </Group>
      ))}

      <Sheet
        open={!!open && !picking && !compareWith}
        onClose={() => setOpenId(null)}
        title={open?.title ?? ""}
        trailing={
          open ? (
            <Menu
              label="Set actions"
              items={[
                { label: "Reopen in Compose", icon: RotateCcw, onClick: () => reopen(open) },
                { label: "Re-export…", icon: Share, onClick: () => setExporting(true) },
                {
                  label: "Compare…",
                  icon: GitCompare,
                  onClick: () => setPicking(true),
                  disabled: history.length < 2,
                },
                {
                  label: "Rename…",
                  icon: Pencil,
                  onClick: () => {
                    setDraft(open.title);
                    setRenaming(true);
                  },
                },
                {
                  label: "Copy seed",
                  icon: Copy,
                  onClick: () =>
                    navigator.clipboard
                      ?.writeText(String(open.playlist.options.seed))
                      .then(() => toast("Seed copied")),
                },
                {
                  label: "Download JSON",
                  icon: FileDown,
                  onClick: () =>
                    downloadBlob(
                      `${open.title.replace(/[^a-z0-9]+/gi, "_")}.json`,
                      JSON.stringify(open.playlist, null, 2),
                      "application/json",
                    ),
                },
                { label: "Delete", icon: Trash2, destructive: true, onClick: () => remove(open) },
              ]}
            />
          ) : undefined
        }
        detents={["large"]}
        width={720}
        testId="history-detail"
      >
        {open && (
          <>
            <Group
              footer={`Seed ${open.playlist.options.seed} · ${open.playlist.score.verdict} · ${new Date(open.createdAt).toLocaleString()}`}
            >
              <div className="cell flex-col items-stretch gap-2 py-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-large-title tabular-nums text-[var(--tint)]">{open.score}</span>
                  <span className="text-title3 text-[var(--label-2)]">/100</span>
                  <span className="text-subhead ml-auto text-[var(--label-2)]">{sub(open)}</span>
                </div>
                {isPhone ? <EnergyCurve compact p={open.playlist} /> : <EnergyCurve p={open.playlist} />}
              </div>
              <ActionRow label="Reopen in Compose" onClick={() => reopen(open)} />
            </Group>
            <h2 className="section-head">Tandas</h2>
            <div className="grid min-w-0 grid-cols-1 gap-3">
              {open.playlist.tandas.map((t, i) => (
                <TandaCard
                  key={`${open.id}-${t.index}`}
                  t={t}
                  i={i}
                  onSwap={noop}
                  onSwapTrack={noop}
                  onLock={noop}
                  playlists={NO_PLAYLISTS}
                  readOnly
                />
              ))}
            </div>
          </>
        )}
      </Sheet>

      <Sheet
        open={picking}
        onClose={() => setPicking(false)}
        title="Compare with"
        trailing="Cancel"
        testId="history-pick"
      >
        <Group footer="Pick the second set: scores side by side, factor by factor, then the orchestras each one uses.">
          {history
            .filter((h) => h.id !== openId)
            .map((h) => (
              <Row
                key={h.id}
                tile={<ScoreRing score={h.score} />}
                label={h.title}
                sub={sub(h)}
                chevron
                onClick={() => {
                  setCompareWith(h);
                  setPicking(false);
                }}
              />
            ))}
        </Group>
      </Sheet>

      <Sheet
        open={!!compareWith && !!open}
        onClose={() => setCompareWith(null)}
        title="Compare"
        trailing="Done"
        detents={["large"]}
        width={720}
        testId="history-compare"
      >
        {open && compareWith && <Compare a={open} b={compareWith} />}
      </Sheet>

      <Sheet
        open={renaming}
        onClose={() => setRenaming(false)}
        title="Rename"
        trailing="Save"
        onTrailing={() => {
          if (open && draft.trim()) updateSnapshot(open.id, { title: draft.trim().slice(0, 80) });
          setRenaming(false);
        }}
        detents={["medium"]}
      >
        <Group>
          <label htmlFor="history-rename" className="cell">
            <span className="sr-only">Name</span>
            <input
              id="history-rename"
              className="field"
              data-autofocus
              value={draft}
              maxLength={80}
              onChange={(e) => setDraft(e.target.value)}
              autoComplete="off"
            />
          </label>
        </Group>
      </Sheet>

      <Sheet
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear history"
        detents={["medium"]}
      >
        <Group footer="Removes every kept set from this browser (and the server copy when enabled).">
          <ActionRow
            label={`Delete ${history.length} ${history.length === 1 ? "set" : "sets"}`}
            destructive
            onClick={async () => {
              setConfirmClear(false);
              await clearHistory();
              toast("History cleared");
            }}
          />
          <ActionRow label="Cancel" onClick={() => setConfirmClear(false)} />
        </Group>
      </Sheet>

      <ExportSheet open={exporting} onClose={() => setExporting(false)} playlist={open?.playlist ?? null} />
    </div>
  );
}

/** Side by side: score factors (both percentages, delta coloured when ≥ 5 points) and the orchestra lists. */
function Compare({ a, b }: { a: HistorySnapshot; b: HistorySnapshot }) {
  const factors = a.playlist.score.factors.map((f) => ({
    key: f.key,
    label: f.label.replace(/\s*\(.*\)\s*$/, ""),
    a: Math.round(f.score * 100),
    b: Math.round((b.playlist.score.factors.find((x) => x.key === f.key)?.score ?? 0) * 100),
  }));
  const orch = (s: HistorySnapshot) =>
    Object.entries(s.playlist.stats.orchestras)
      .sort((x, y) => y[1] - x[1])
      .map(([n, c]) => `${n}${c > 1 ? ` ×${c}` : ""}`);
  return (
    <>
      <Group>
        <div className="cell grid grid-cols-2 gap-3 py-3">
          {[a, b].map((s) => (
            <span key={s.id} className="min-w-0">
              <span className="text-footnote block truncate text-[var(--label-2)]">{s.title}</span>
              <span className="text-title1 tabular-nums text-[var(--tint)]">{s.score}</span>
              <span className="text-footnote block text-[var(--label-2)]">
                {fmtH(s.playlist.options.hours)} · {s.playlist.tandas.length} tandas
              </span>
            </span>
          ))}
        </div>
      </Group>
      <Group
        header="Score factors"
        footer="Percent per factor; the delta is coloured only when it moves 5 points or more."
      >
        {factors.map((f) => {
          const d = f.b - f.a;
          return (
            <div key={f.key} className="cell py-2">
              <span className="min-w-0 flex-1 truncate">{f.label}</span>
              <span className="cell-value tabular-nums">
                {f.a} % → {f.b} %{" "}
                <span
                  className={
                    Math.abs(d) >= 5
                      ? d > 0
                        ? "text-[var(--system-green)]"
                        : "text-[var(--destructive)]"
                      : "text-[var(--label-2)]"
                  }
                >
                  ({d > 0 ? "+" : ""}
                  {d})
                </span>
              </span>
            </div>
          );
        })}
      </Group>
      <Group header="Orchestras">
        <div className="cell grid grid-cols-2 items-start gap-3 py-3">
          {[a, b].map((s) => (
            <span key={s.id} className="text-footnote min-w-0 whitespace-pre-wrap text-[var(--label-2)]">
              {orch(s).join("\n")}
            </span>
          ))}
        </div>
      </Group>
    </>
  );
}
