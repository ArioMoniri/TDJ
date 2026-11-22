"use client";
import { type NightReview, REVIEW_SEVERITIES, type ReviewFinding, type ReviewSeverity } from "@tdj/core";
import { GripVertical, ListChecks, SlidersHorizontal, Undo2, WandSparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useBooth } from "@/lib/booth/store";
import { canUndo, undoEdit, useEditHistory } from "@/lib/editHistory";
import { fmtNumber, t } from "@/lib/i18n";
import {
  applyFinding,
  applyOrder,
  applySafeFixes,
  composeSettings,
  dragOrder,
  fetchReview,
  findingText,
  fixLabel,
  ignoreFinding,
  SEVERITY_KEY,
  stopReview,
  useNightReview,
} from "@/lib/nightReview";
import { useStore } from "@/lib/store";
import type { Playlist } from "@/lib/types";
import { Group, RhythmTile } from "../Form";
import { Sheet } from "../Sheet";
import { rhythmWord } from "../ui/TandaTypeBadge";
import { useDragReorder } from "../ui/useDragReorder";
import "./review.css";
import { NightRulesSheet } from "./NightRulesSheet";

/**
 * 2026-11 — the review of an imported night (core review.ts through lib/nightReview.ts), in two levels:
 *
 * - `ReviewPanel` (Compose): every finding, grouped by how much it matters, each with its fix and Ignore; "Apply all
 *   safe fixes" (one edit, one undo) and Undo; the reorder the engine suggests as a diff (each tanda's old and new
 *   place) with Apply; and the tandas as a list the DJ reorders by dragging (the shared drag reorder).
 * - `ReviewBanner` (the Booth): only the blockers and high findings on the tandas still to come, three at most, never
 *   a list to read through. Mid-night every fix asks first ("nothing playing now changes"), and the playing tanda and
 *   the ones before it are never touched.
 *
 * Both follow the DJ's Compose settings (composeSettings) and read the night again when they change ("Night rules").
 */

/** the review of `playlist` against the Compose settings, again after every edit or settings change */
function useReview(playlist: Playlist | null, level: "compose" | "booth", on: boolean, fixedBefore = 0) {
  const options = useStore((s) => s.options);
  const settings = useMemo(() => composeSettings(options), [options]);
  const [review, setReview] = useState<NightReview | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!on || !playlist) {
      setReview(null);
      return;
    }
    const ac = new AbortController();
    setBusy(true);
    const timer = setTimeout(() => {
      void fetchReview(playlist, { settings, level, fixedBefore }, ac.signal).then((r) => {
        if (ac.signal.aborted) return;
        setReview(r);
        setBusy(false);
      });
    }, 120);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [playlist, settings, level, on, fixedBefore]);
  return { review, busy, settings };
}

const SEV_TONE: Record<ReviewSeverity, string> = {
  blocker: "var(--destructive)",
  high: "#ff9500",
  medium: "var(--tint)",
  low: "var(--label-3)",
};

function FindingRow({
  f,
  onApply,
  onIgnore,
  busy,
}: {
  f: ReviewFinding;
  onApply: () => void;
  onIgnore?: () => void;
  busy: boolean;
}) {
  return (
    <div
      className="cell review-finding"
      data-testid="review-finding"
      data-severity={f.severity}
      data-kind={f.kind}
    >
      <span className="review-dot" style={{ background: SEV_TONE[f.severity] }} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block">{findingText(f)}</span>
        {f.fix && (
          <span className="text-footnote block text-[var(--label-2)]">
            {fixLabel(f)}
            {f.fix.safe ? ` · ${t("review.safe")}` : ""}
          </span>
        )}
      </span>
      <span className="review-actions">
        {f.fix && (
          <button
            type="button"
            className="btn btn-plain min-h-[44px]"
            onClick={onApply}
            disabled={busy}
            data-testid="review-apply"
          >
            {t("review.apply")}
          </button>
        )}
        {onIgnore && (
          <button
            type="button"
            className="btn btn-plain min-h-[44px] text-[var(--label-2)]"
            onClick={onIgnore}
            data-testid="review-ignore"
          >
            {t("review.ignore")}
          </button>
        )}
      </span>
    </div>
  );
}

/** the tandas of the night as a list the DJ reorders by dragging (and the engine's reorder as a diff) */
function TandaOrder({
  playlist,
  onMove,
  disabledBefore = 0,
}: {
  playlist: Playlist;
  onMove: (from: number, to: number) => void;
  disabledBefore?: number;
}) {
  const move = useCallback(
    (from: number, to: number) => {
      if (from < disabledBefore || to < disabledBefore) return;
      onMove(from, to);
    },
    [onMove, disabledBefore],
  );
  const drag = useDragReorder(move);
  return (
    <ol
      className="group-inset"
      data-reorder-list
      data-testid="review-order"
      aria-label={t("review.order_label")}
    >
      {playlist.tandas.map((x, i) => (
        <li
          key={`${i}-${x.songs[0]?.id ?? ""}`}
          className="relative"
          data-reorder-row
          data-testid="review-order-row"
        >
          <div className="cell">
            <RhythmTile rhythm={x.rhythm} label={rhythmWord(x.rhythm)} />
            <span className="min-w-0 flex-1">
              <span className="block truncate">
                {t("import.tanda_n", { n: i + 1 })} · {x.orchestra}
              </span>
              <span className="text-footnote block truncate text-[var(--label-2)]">
                {[x.singer ?? t("review.instrumental"), x.yearRange?.join("–")].filter(Boolean).join(" · ")}
              </span>
            </span>
            {i >= disabledBefore && (
              <button
                type="button"
                className="icon-btn review-grip"
                aria-label={t("review.drag_tanda", { n: i + 1 })}
                data-testid="review-order-grip"
                {...drag(i)}
              >
                <GripVertical size={18} aria-hidden />
              </button>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Compose: the detailed review of the night imported into it */
export function ReviewPanel() {
  const playlist = useStore((s) => s.playlist);
  const active = useNightReview((s) => s.active);
  const ignored = useNightReview((s) => (playlist ? s.ignored[playlist.id] : undefined));
  const on = !!playlist && active?.mode === "compose" && active.nightId === playlist.id;
  const { review, busy, settings } = useReview(playlist, "compose", on);
  const [working, setWorking] = useState(false);
  const [rules, setRules] = useState(false);
  useEditHistory((s) => s.past.length);
  if (!on || !playlist) return null;
  const apply = (p: Playlist) => useStore.getState().setPlaylist(p);
  const run = async (f: () => Promise<unknown>) => {
    setWorking(true);
    try {
      await f();
    } finally {
      setWorking(false);
    }
  };
  const skip = new Set(ignored ?? []);
  const findings = (review?.findings ?? []).filter((f) => !skip.has(f.id));
  const safe = findings.filter((f) => f.fix?.safe).length;
  const reorder = review?.reorder ?? null;
  return (
    <section className="review-panel mb-6" aria-label={t("review.title")} data-testid="review-panel">
      <Group
        header={
          <span className="inline-flex items-center gap-2">
            <ListChecks size={14} aria-hidden /> {t("review.title")}
          </span>
        }
        footer={t("review.follows_settings")}
      >
        <div className="cell flex-wrap gap-2">
          <span className="min-w-0 basis-full font-semibold" role="status" data-testid="review-summary">
            {!review
              ? t("review.checking")
              : findings.length
                ? t("review.summary", {
                    count: fmtNumber(findings.length),
                    important: fmtNumber(
                      findings.filter((f) => f.severity === "blocker" || f.severity === "high").length,
                    ),
                  })
                : t("review.all_good")}
          </span>
          <button
            type="button"
            className="btn btn-primary min-h-[44px]"
            disabled={!safe || working || busy}
            onClick={() => void run(() => applySafeFixes(playlist, settings, apply))}
            data-testid="review-apply-safe"
          >
            <WandSparkles size={16} aria-hidden /> {t("review.apply_safe", { count: fmtNumber(safe) })}
          </button>
          <button
            type="button"
            className="btn btn-ghost min-h-[44px]"
            disabled={!canUndo() || working}
            onClick={() => void undoEdit()}
            data-testid="review-undo"
          >
            <Undo2 size={16} aria-hidden /> {t("editKeys.undo")}
          </button>
          <button
            type="button"
            className="btn btn-ghost min-h-[44px]"
            onClick={() => setRules(true)}
            data-testid="review-night-rules"
          >
            <SlidersHorizontal size={16} aria-hidden /> {t("composer.night_rules")}
          </button>
          <button
            type="button"
            className="icon-btn min-h-[44px] min-w-[44px]"
            onClick={stopReview}
            aria-label={t("review.close")}
            data-testid="review-close"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
      </Group>

      {REVIEW_SEVERITIES.map((sev) => {
        const xs = findings.filter((f) => f.severity === sev);
        if (!xs.length) return null;
        return (
          <Group key={sev} header={t(SEVERITY_KEY[sev])} data-testid={`review-group-${sev}`}>
            {xs.map((f) => (
              <FindingRow
                key={f.id}
                f={f}
                busy={working || busy}
                onApply={() => void run(() => applyFinding(playlist, f, settings, apply))}
                onIgnore={() => ignoreFinding(playlist.id, f.id)}
              />
            ))}
          </Group>
        );
      })}

      {reorder && (
        <Group header={t("review.reorder_header")} footer={findingText(reorder)} data-testid="review-reorder">
          {reorder.moves.map((m) => {
            const x = playlist.tandas[m.tanda];
            return (
              <div key={m.tanda} className="cell" data-testid="review-reorder-move">
                {x && <RhythmTile rhythm={x.rhythm} label={rhythmWord(x.rhythm)} />}
                <span className="min-w-0 flex-1 truncate">{x?.orchestra}</span>
                <span className="tabular-nums text-[var(--label-2)]">
                  {t("review.move_place", { from: m.from + 1, to: m.to + 1 })}
                </span>
              </div>
            );
          })}
          <div className="cell justify-end">
            <button
              type="button"
              className="btn btn-primary min-h-[44px]"
              disabled={working || busy}
              onClick={() => void run(() => applyOrder(playlist, reorder.order, apply))}
              data-testid="review-reorder-apply"
            >
              {t("review.apply_order")}
            </button>
          </div>
        </Group>
      )}

      <h2 className="section-head">{t("review.order_header")}</h2>
      <TandaOrder
        playlist={playlist}
        onMove={(from, to) =>
          void run(() =>
            applyOrder(
              playlist,
              dragOrder(playlist.tandas.length, from, to),
              apply,
              t("review.moved_tanda", { from: from + 1, to: to + 1 }),
            ),
          )
        }
      />
      <p className="section-foot">{t("review.order_foot")}</p>
      <NightRulesSheet open={rules} onClose={() => setRules(false)} />
    </section>
  );
}

/** the Booth's "Night rules" button: the Compose settings as a sheet */
export function BoothNightRulesButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost booth-rules-btn min-h-[44px]"
        aria-label={t("composer.night_rules")}
        onClick={() => setOpen(true)}
        data-testid="booth-night-rules"
      >
        <SlidersHorizontal size={16} aria-hidden />
        <span className="booth-rules-label">{t("composer.night_rules")}</span>
      </button>
      <NightRulesSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

const BOOTH_MAX = 3;

/** the Booth: the few things that matter most in the night imported into it */
export function ReviewBanner() {
  const playlist = useBooth((s) => s.playlist);
  const started = useBooth((s) => s.started);
  const current = useBooth((s) => (s.started ? (s.plan?.items[s.planIndex]?.tanda ?? 0) : 0));
  const active = useNightReview((s) => s.active);
  const folded = useNightReview((s) => (playlist ? !!s.folded[playlist.id] : false));
  const on = !!playlist && active?.mode === "booth" && active.nightId === playlist.id && !folded;
  const { review, busy, settings } = useReview(playlist, "booth", on, Math.max(0, current));
  const [ask, setAsk] = useState<ReviewFinding | null>(null);
  const [working, setWorking] = useState(false);
  if (!on || !playlist || !review) return null;
  const apply = (p: Playlist) => useBooth.getState().applySwappedPlaylist(p);
  const fix = async (f: ReviewFinding) => {
    setWorking(true);
    try {
      await applyFinding(playlist, f, settings, apply);
    } finally {
      setWorking(false);
    }
  };
  const fold = () => useNightReview.setState((s) => ({ folded: { ...s.folded, [playlist.id]: true } }));
  const xs = review.findings.slice(0, BOOTH_MAX);
  const more = review.findings.length - xs.length;
  return (
    <section
      className="review-banner group-inset"
      aria-label={t("review.booth_title")}
      data-testid="review-banner"
    >
      <div className="cell gap-2">
        <ListChecks size={18} aria-hidden className="shrink-0 text-[var(--tint)]" />
        <span className="min-w-0 flex-1 font-semibold" role="status" data-testid="review-banner-title">
          {xs.length ? t("review.booth_title") : t("review.booth_all_good")}
        </span>
        <button
          type="button"
          className="icon-btn min-h-[44px] min-w-[44px]"
          onClick={fold}
          aria-label={t("review.close")}
          data-testid="review-banner-close"
        >
          <X size={18} aria-hidden />
        </button>
      </div>
      {xs.map((f) => (
        <FindingRow
          key={f.id}
          f={f}
          busy={working || busy}
          onApply={() => (started ? setAsk(f) : void fix(f))}
        />
      ))}
      {more > 0 && (
        <p className="cell text-footnote text-[var(--label-2)]" data-testid="review-banner-more">
          {t("review.booth_more", { count: fmtNumber(more) })}
        </p>
      )}
      <Sheet
        open={!!ask}
        onClose={() => setAsk(null)}
        title={t("review.booth_confirm_title")}
        testId="review-booth-confirm"
      >
        <Group footer={t("review.booth_confirm_foot")}>
          <p className="cell">{ask ? findingText(ask) : ""}</p>
          <button
            type="button"
            className="cell cell-tap w-full justify-center font-semibold text-[var(--tint)]"
            onClick={() => {
              const f = ask;
              setAsk(null);
              if (f) void fix(f);
            }}
            data-testid="review-booth-confirm-apply"
          >
            {ask ? fixLabel(ask) : ""}
          </button>
        </Group>
      </Sheet>
    </section>
  );
}
