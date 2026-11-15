"use client";
import {
  Copy,
  Download,
  FileDown,
  FolderOpen,
  GitCompare,
  Pencil,
  Play,
  RotateCcw,
  Share,
  Trash2,
  Users,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { EnergyCurve } from "@/components/EnergyCurve";
import { ExportSheet } from "@/components/ExportSheet";
import { FeaturedCard } from "@/components/FeaturedCard";
import { ActionRow, Group, Row } from "@/components/Form";
import { Menu } from "@/components/Menu";
import { NightCover } from "@/components/NightCover";
import { PageHeader } from "@/components/PageHeader";
import { Sheet } from "@/components/Sheet";
import { SwipeRow } from "@/components/SwipeRow";
import { TandaCard } from "@/components/TandaCard";
import { Tip } from "@/components/ui/Tip";
import { APP } from "@/lib/app/target";
import { downloadBlob } from "@/lib/download";
import { haptic } from "@/lib/haptics";
import { changeLabel, eraLabel, groupByDay, nightLogSummary, versionsOf } from "@/lib/history";
import { useMediaQuery } from "@/lib/hooks";
import { fmtTime, lazy, t as tx } from "@/lib/i18n";
import { reduced as reducedV, rise } from "@/lib/motion";
import { lengthText } from "@/lib/nightName";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { HistorySnapshot } from "@/lib/types";

const ARC: Record<string, string> = {
  get "classic-two-peaks"() {
    return tx("history.two_peaks");
  },
  get "single-peak"() {
    return tx("history.single_peak");
  },
  get "marathon-plateau"() {
    return tx("history.marathon");
  },
  get gentle() {
    return tx("history.gentle");
  },
};
const noop = () => {};
const NO_PLAYLISTS: never[] = [];
const fmtH = (h: number) => `${h} h`.replace(".5 h", "½ h");
const time = (iso: string) => fmtTime(iso, { hour: "2-digit", minute: "2-digit" });
const MONTH = lazy(() => [
  tx("history.jan"),
  tx("history.feb"),
  tx("history.mar"),
  tx("history.apr"),
  tx("history.may"),
  tx("history.jun"),
  tx("history.jul"),
  tx("history.aug"),
  tx("history.sep"),
  tx("history.oct"),
  tx("history.nov"),
  tx("history.dec"),
]);
/** "20 Oct, 06:36" */
const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTH[d.getMonth()]}, ${time(iso)}`;
};

/** Score ring (44 pt tile): the score as a conic ring in tint with the number inside. */
function ScoreRing({ score }: { score: number }) {
  return (
    <span
      className="tile-art text-footnote font-semibold"
      style={{
        background: `conic-gradient(var(--tint) ${score * 3.6}deg, var(--fill-3) 0)`,
      }}
      role="img"
      aria-label={tx("history.score_2", { score })}
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
      aria-label={tx("history.score_trend_over_the_last_sets", { length: scores.length })}
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
    currentEntry,
    setCurrentEntry,
    restoreEntryVersion,
    storageMode,
  } = useStore();
  // the apps keep History in the device's own database; the web keeps it in this browser unless a server row syncs it
  const onDevice = APP || storageMode === "browser";
  const router = useRouter();
  const reduced = useReducedMotion();
  const isPhone = useMediaQuery("(max-width: 599.98px)");
  const [openId, setOpenId] = useState<string | null>(null);
  // the sidebar's Recent nights link here as #night=<id>: open that night
  useEffect(() => {
    const read = () => {
      const m = /^#night=(.+)$/.exec(location.hash);
      if (m) setOpenId(decodeURIComponent(m[1]!));
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
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
    toast(`Deleted "${s.title}"`, () => {
      // Undo puts the entry back where it was; it does not become tonight's night
      const st = useStore.getState();
      const cur = st.currentEntry;
      st.addSnapshot(s);
      st.setCurrentEntry(cur);
    });
  };
  /** wave 2: one entry is Current — the night on screen in Compose (older browsers: the one holding that night) */
  const currentId =
    currentEntry && history.some((h) => h.id === currentEntry)
      ? currentEntry
      : (history.find((h) => playlist && h.playlist.id === playlist.id)?.id ?? null);
  /** an earlier version comes back: kept as a version of its own; on screen when the entry is tonight's */
  const restore = (s: HistorySnapshot, versionId: string, label: string) => {
    const back = restoreEntryVersion(s.id, versionId);
    if (!back) return;
    haptic(6);
    if (currentId === s.id) {
      setPlaylist({ ...back.playlist, tandas: back.playlist.tandas.map((t) => ({ ...t, locked: false })) });
      toast(tx("history.back_to_in_compose", { label }));
    } else toast(tx("history.is_the_current_version_of_this", { label }));
  };
  const reopen = (s: HistorySnapshot) => {
    setCurrentEntry(s.id);
    setPlaylist({ ...s.playlist, tandas: s.playlist.tandas.map((t) => ({ ...t, locked: false })) });
    replaceOptions({ ...s.options, seed: s.playlist.options.seed });
    toast(tx("history.reopened_in_compose", { title: s.title }));
    router.push("/#result");
  };
  /** "4 h · 22 tandas · Golden age · Two peaks · rehearsed 06:36" (no ISO dates, no repeat of the title) */
  const sub = (s: HistorySnapshot) =>
    tx("history.tandas_2", {
      p1: s.playlist.stats?.durationSec
        ? lengthText(s.playlist.stats.durationSec)
        : fmtH(s.playlist.options.hours),
      length: s.playlist.tandas.length,
      p2: eraLabel(s.playlist),
      p3: ARC[s.playlist.options.arc] ?? s.playlist.options.arc,
      p4: s.nightLog
        ? ` · ${nightLogSummary(s.nightLog)}`
        : ` ${tx("history.composed", { p1: time(s.createdAt) })}`,
    });
  /** Booth: the set becomes the current one (locks cleared) and /booth opens on it. */
  const playNight = (s: HistorySnapshot) => {
    setCurrentEntry(s.id);
    setPlaylist({ ...s.playlist, tandas: s.playlist.tandas.map((t) => ({ ...t, locked: false })) });
    replaceOptions({ ...s.options, seed: s.playlist.options.seed });
    router.push("/booth");
  };
  const rowV = reduced ? reducedV.rise : rise;
  const exportAll = () =>
    downloadBlob("tdj-history.json", JSON.stringify(history, null, 2), "application/json");

  return (
    <div className="mx-auto max-w-[720px] lg:max-w-[1100px]">
      <PageHeader
        title={tx("history.history")}
        subtitle={
          history.length
            ? tx("history.kept_last_50", {
                length: history.length,
                p1: history.length === 1 ? tx("history.set") : tx("history.sets"),
              })
            : tx("history.every_set_you_compose_lands_here")
        }
        trailing={
          <>
            {trend.length >= 2 && (
              <Tip text={tx("history.average_over_the_last", { avg, length: trend.length })}>
                <span className="mr-1 inline-flex items-center gap-2">
                  <Sparkline scores={trend} />
                  <span className="text-subhead tabular-nums text-[var(--label-2)]">{avg}</span>
                </span>
              </Tip>
            )}
            <Menu
              label={tx("history.more")}
              items={[
                {
                  label: tx("history.open_a_shared_night"),
                  icon: FolderOpen,
                  onClick: () => router.push("/night"),
                },
                { label: tx("history.rooms"), icon: Users, onClick: () => router.push("/rooms") },
                {
                  label: tx("history.save_history_as_a_file"),
                  icon: Download,
                  onClick: exportAll,
                  disabled: !history.length,
                },
                {
                  label: tx("history.clear_history_2"),
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
      {overridesReady && onDevice && (
        <p className="text-footnote px-4 pb-2 text-[var(--label-2)]" data-testid="history-on-device">
          {tx("history.on_this_device")}
        </p>
      )}
      {!overridesReady && (
        <p className="text-subhead py-8 text-center text-[var(--label-2)]">{tx("history.loading")}</p>
      )}
      {overridesReady && history.length === 0 && (
        <EmptyState
          action={
            <span className="flex flex-col items-center gap-3">
              <Tip text={tx("history.compose_your_first_night_every_night")}>
                <Link href="/" className="btn btn-primary">
                  {tx("history.compose_a_night")}
                </Link>
              </Tip>
              <FeaturedCard />
            </span>
          }
        >
          {tx("history.sets_you_compose_land_here_with")}
        </EmptyState>
      )}
      <div className="history-covers">
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
                        label: tx("history.compare"),
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
                      tile={
                        // wave 4: the night's own cover (56 px, light or dark with the app), its score in the corner
                        <NightCover
                          night={s.playlist}
                          coverSeed={s.coverSeed}
                          size={56}
                          testId="history-cover"
                          badge={
                            <span
                              className="night-cover-score"
                              role="img"
                              aria-label={tx("history.score_2", { score: s.score })}
                            >
                              {s.score}
                            </span>
                          }
                        />
                      }
                      label={s.title}
                      sub={`${sub(s)}${s.change || s.source !== "compose" ? ` · ${changeLabel(s)}` : ""}${s.versions?.length ? ` ${tx("history.versions_2", { p1: s.versions.length + 1 })}` : ""}`}
                      value={currentId === s.id ? tx("history.current") : undefined}
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
      </div>

      <Sheet
        open={!!open && !picking && !compareWith}
        onClose={() => setOpenId(null)}
        title={open?.title ?? ""}
        trailing={
          open ? (
            <Menu
              label={tx("history.set_actions")}
              items={[
                { label: tx("history.reopen_in_compose"), icon: RotateCcw, onClick: () => reopen(open) },
                { label: tx("history.play_the_night"), icon: Play, onClick: () => playNight(open) },
                { label: tx("history.re_export"), icon: Share, onClick: () => setExporting(true) },
                {
                  label: tx("history.compare_2"),
                  icon: GitCompare,
                  onClick: () => setPicking(true),
                  disabled: history.length < 2,
                },
                {
                  label: tx("history.rename_2"),
                  icon: Pencil,
                  onClick: () => {
                    setDraft(open.title);
                    setRenaming(true);
                  },
                },
                {
                  label: tx("history.copy_seed"),
                  icon: Copy,
                  onClick: () =>
                    navigator.clipboard
                      ?.writeText(String(open.playlist.options.seed))
                      .then(() => toast(tx("history.seed_copied"))),
                },
                {
                  label: tx("history.save_as_a_file"),
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
              footer={tx("history.composed_seed_under", {
                p1: when(open.createdAt),
                verdict: open.playlist.score.verdict,
              })}
            >
              <div className="cell flex-col items-stretch gap-2 py-4">
                {/* the score on its own line, as the Compose header does; the metadata under it */}
                <div className="flex items-baseline gap-1">
                  <span className="score-stat tabular-nums text-[var(--tint)]">{open.score}</span>
                  <span className="text-title3 text-[var(--label-2)]">/100</span>
                </div>
                <p className="text-footnote text-[var(--label-2)]">{sub(open)}</p>
                {isPhone ? <EnergyCurve compact p={open.playlist} /> : <EnergyCurve p={open.playlist} />}
              </div>
              <ActionRow label={tx("history.reopen_in_compose")} onClick={() => reopen(open)} />
              <ActionRow label={tx("history.play_the_night")} onClick={() => playNight(open)} />
            </Group>
            {!!open.versions?.length && (
              <Group
                header={tx("history.versions")}
                footer={tx("history.every_change_to_this_night_is")}
                data-testid="history-versions"
              >
                {versionsOf(open).map((v) => (
                  <Row
                    key={v.id}
                    label={v.label}
                    sub={tx("history.score", { p1: when(v.at), score: v.score })}
                    value={v.current ? tx("history.current") : undefined}
                    data-testid="history-version"
                  >
                    {!v.current && (
                      <button
                        type="button"
                        className="btn-plain -my-2 -mr-2 min-h-11"
                        onClick={() => restore(open, v.id, v.label)}
                        aria-label={tx("history.restore_2", { label: v.label })}
                      >
                        {tx("history.restore")}
                      </button>
                    )}
                  </Row>
                ))}
              </Group>
            )}
            <h2 className="section-head">{tx("history.tandas")}</h2>
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
        title={tx("history.compare_with")}
        trailing={tx("history.cancel")}
        testId="history-pick"
      >
        <Group footer={tx("history.pick_the_second_set_scores_side")}>
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
        title={tx("history.compare")}
        trailing={tx("history.done")}
        detents={["large"]}
        width={720}
        testId="history-compare"
      >
        {open && compareWith && <Compare a={open} b={compareWith} />}
      </Sheet>

      <Sheet
        open={renaming}
        onClose={() => setRenaming(false)}
        title={tx("history.rename")}
        trailing={tx("history.save")}
        onTrailing={() => {
          if (open && draft.trim()) updateSnapshot(open.id, { title: draft.trim().slice(0, 80) });
          setRenaming(false);
        }}
        detents={["medium"]}
      >
        <Group>
          <label htmlFor="history-rename" className="cell">
            <span className="sr-only">{tx("history.name")}</span>
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
        title={tx("history.clear_history")}
        detents={["medium"]}
      >
        <Group footer={tx("history.removes_every_kept_set_from_this")}>
          <ActionRow
            label={`Delete ${history.length} ${history.length === 1 ? tx("history.set") : tx("history.sets")}`}
            destructive
            onClick={async () => {
              setConfirmClear(false);
              await clearHistory();
              toast(tx("history.history_cleared"));
            }}
          />
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
                {tx("history.tandas_4", {
                  hours: fmtH(s.playlist.options.hours),
                  length: s.playlist.tandas.length,
                })}
              </span>
            </span>
          ))}
        </div>
      </Group>
      <Group header={tx("history.score_factors")} footer={tx("history.percent_per_factor_the_delta_is")}>
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
      <Group header={tx("history.orchestras")}>
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
