"use client";
import { ArrowDown, ArrowUp, Check, GripVertical, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { undoEdit } from "@/lib/editHistory";
import { haptic } from "@/lib/haptics";
import { t as tx } from "@/lib/i18n";
import type { MsgKey } from "@/lib/i18n/en";
import { fmtLen } from "@/lib/lengths";
import { gateEdit } from "@/lib/ruleCheck";
import type { SourceId, Version } from "@/lib/smartSearch";
import { addSide, checkDraft, type DraftSide, draftOk, moveSide, removeSide } from "@/lib/tandaDraft";
import { toast } from "@/lib/toast";
import type { Playlist, Song } from "@/lib/types";
import { useSmartSearch } from "@/lib/useSmartSearch";
import { yearText } from "@/lib/year";
import { Group, RhythmTile, Row } from "./Form";
import { Sheet } from "./Sheet";
import { ConfirmBar } from "./ui/BoothSearchBits";
import { SmartSearchField, SmartSearchResults } from "./ui/SmartSearch";
import { TandaTypeBadge } from "./ui/TandaTypeBadge";
import { useDragReorder } from "./ui/useDragReorder";

/**
 * 2026-11 (the owner: "the swap button on a tanda directly swaps as an AI swap; I can't swap a tanda by searching,
 * selecting and reordering songs from connected platforms"): Swap tanda as a choice, on Compose and in the Booth. The
 * sheet holds a replacement tanda the DJ builds: start from the tanda as it is, or from one of the engine's whole
 * tandas ("Suggested"); search the catalogue and the connected services (the smart search) and add sides one by one;
 * reorder them (drag, the arrows, Alt+↑ / Alt+↓ on a focused side), remove them; the tanda rules show live (one
 * orchestra, one rhythm, one voice, close years, no title twice, its length). Apply puts it in the night through the
 * rule check (a broken rule asks in the RuleConfirmSheet) and into the undo history (⌘Z, the toast's Undo). The Booth
 * passes its own apply, the tandas that cannot change (playing or played) and the confirm for the tanda that plays
 * next.
 */
export interface TandaSwapProps {
  playlist: Playlist | null;
  index: number | null;
  onClose: () => void;
  /** the host puts the night in (Compose's store, the Booth's plan) */
  apply: (p: Playlist, label: string) => void | Promise<void>;
  /** the Booth: why this tanda cannot change now (playing or played) */
  lockedReason?: string | null;
  /** the Booth: the tanda plays next: Apply asks once ("Swap it now?") */
  confirmText?: string | null;
  /** the playlist the engine is asked with (the Booth sends what has played locked) */
  requestPlaylist?: (p: Playlist) => Playlist;
  extraSources?: (s: Song) => SourceId[];
  /** the Booth: pre-listen in the headphones */
  onPlay?: (v: Version) => void;
  playing?: (v: Version) => boolean;
  testId?: string;
}

/** the Booth's sheet opens through this store (its set list's tanda Swap) */
export const useTandaSwap = create<{ i: number | null; open: (i: number) => void; close: () => void }>(
  (set) => ({
    i: null,
    open: (i) => set({ i }),
    close: () => set({ i: null }),
  }),
);

const asDraft = (s: Song): DraftSide => s as DraftSide;
const sideFacts = (s: DraftSide) =>
  [s.orchestra, s.singer ?? tx("tandaType.instrumental"), yearText(s.year ?? null)]
    .filter(Boolean)
    .join(" · ");

export function TandaSwapSheet(p: TandaSwapProps) {
  const { playlist, index, onClose } = p;
  const t = playlist && index !== null ? playlist.tandas[index] : undefined;
  const open = !!t;
  const [draft, setDraft] = useState<DraftSide[]>([]);
  const [options, setOptions] = useState<Playlist[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [ask, setAsk] = useState(false);
  const size = t?.songs.length ?? 4;
  const rhythm = t?.rhythm ?? "tango";
  // a fresh sheet for each tanda
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the sheet opens for another tanda
  useEffect(() => {
    setDraft(t ? t.songs.map(asDraft) : []);
    setOptions(null);
    setNote(null);
    setAsk(false);
  }, [index, open]);
  // the engine's whole tandas for this place, nearest the planned energy first
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per opening
  useEffect(() => {
    if (!open || !playlist || index === null || p.lockedReason) return;
    const ctl = new AbortController();
    fetch("/api/swap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playlist: p.requestPlaylist?.(playlist) ?? playlist, index, options: true }),
      signal: ctl.signal,
    })
      .then((r) => (r.ok ? r.json() : { options: [] }))
      .then((j: { options?: Playlist[] }) => setOptions(j.options ?? []))
      .catch(() => !ctl.signal.aborted && setOptions([]));
    return () => ctl.abort();
  }, [open, index]);

  const s = useSmartSearch({
    defaultFilters: { rhythms: [rhythm] },
    limit: 30,
    extraSources: p.extraSources,
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new tanda starts the search over
  useEffect(() => {
    s.setQ("");
    s.setFilters({ rhythms: [rhythm] });
  }, [index, rhythm]);

  const check = useMemo(() => checkDraft(draft, { rhythm, size }), [draft, rhythm, size]);
  const changed = !!t && draft.map((x) => x.id).join("|") !== t.songs.map((x) => x.id).join("|");
  const move = useCallback((from: number, to: number) => {
    haptic(6);
    setDraft((d) => moveSide(d, from, to));
  }, []);
  const drag = useDragReorder(move, !!p.lockedReason);
  const add = (v: Version) => {
    haptic(6);
    setDraft((d) => {
      const next = addSide(d, asDraft(v.song));
      if (next === d)
        setNote(d.some((x) => x.id === v.song.id) ? tx("tandaSwap.already_in") : tx("tandaSwap.full"));
      else setNote(null);
      return next;
    });
  };
  const inDraft = (v: Version) => draft.some((x) => x.id === v.song.id);

  const run = async () => {
    if (!playlist || index === null || !t) return;
    setBusy(true);
    setNote(null);
    try {
      const before = playlist;
      const r = await fetch("/api/tanda-set", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          playlist: before,
          tandaIndex: index,
          // a catalogue side by its id; a service's recording whole
          sides: draft.map((x) => (x.id.startsWith("ext:") ? x : x.id)),
        }),
      });
      const j = (await r.json().catch(() => ({}))) as Playlist & { changed?: boolean; reason?: string };
      if (!r.ok || !j.changed) {
        setNote(
          j.reason ? tx("tandaSwap.not_applied_why", { reason: j.reason }) : tx("tandaSwap.not_applied"),
        );
        return;
      }
      const { changed: _c, reason: _r, ...after } = j;
      const label = tx("tandaSwap.applied", { p1: index + 1, orchestra: draft[0]?.orchestra ?? "" });
      const res = await gateEdit({ before, after: after as Playlist, label, apply: p.apply, learn: false });
      if (res === "cancelled") return;
      onClose();
      if (res === "applied") toast(label, () => void undoEdit());
    } finally {
      setBusy(false);
    }
  };
  const applyNow = () => {
    if (p.confirmText && !ask) {
      setAsk(true);
      return;
    }
    setAsk(false);
    void run();
  };

  const footer = t ? (
    <div className="flex items-center gap-2">
      <p className="text-footnote min-w-0 flex-1 text-[var(--label-2)]" data-testid="tanda-swap-summary">
        {draftOk(check)
          ? tx("tandaSwap.all_rules_kept")
          : tx("tandaSwap.rules_broken", { n: check.filter((c) => !c.ok).length })}
      </p>
      <button
        type="button"
        className="btn btn-primary min-h-11 px-5"
        disabled={!changed || !draft.length || busy || !!p.lockedReason}
        onClick={applyNow}
        data-testid="tanda-swap-apply"
      >
        {busy ? tx("tandaSwap.applying") : tx("tandaSwap.apply")}
      </button>
    </div>
  ) : undefined;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t ? tx("tandaSwap.title", { p1: (index ?? 0) + 1 }) : tx("tandaSwap.title_plain")}
      detents={["large"]}
      width={720}
      testId={p.testId ?? "tanda-swap-sheet"}
      footer={footer}
    >
      {t && (
        <div className="flex flex-col gap-1 pb-4">
          <p className="text-footnote px-4 pt-2 text-[var(--label-2)]">
            {tx("tandaSwap.now", {
              orchestra: t.orchestra,
              p1: t.singer ? ` / ${t.singer}` : t.vocal ? "" : ` · ${tx("tandaType.instrumental")}`,
              p2: t.yearRange?.join("–") ?? "",
            })}
          </p>
          {p.lockedReason && (
            <p className="text-footnote px-4 text-[var(--destructive)]" data-testid="tanda-swap-locked">
              {p.lockedReason}
            </p>
          )}
          {ask && p.confirmText && (
            <ConfirmBar
              text={p.confirmText}
              yes={tx("tandaSwap.apply")}
              onYes={() => {
                setAsk(false);
                void run();
              }}
              onNo={() => setAsk(false)}
              testId="tanda-swap-confirm"
            />
          )}
          {note && (
            <p
              className="text-footnote px-4 text-[var(--destructive)]"
              role="status"
              data-testid="tanda-swap-note"
            >
              {note}
            </p>
          )}

          <section data-testid="tanda-swap-draft">
            <h2 className="section-head flex items-center gap-2">
              <span className="flex-1">{tx("tandaSwap.your_tanda", { n: draft.length, size })}</span>
              {changed && (
                <button
                  type="button"
                  className="btn-plain min-h-11 px-2 text-footnote normal-case"
                  onClick={() => setDraft(t.songs.map(asDraft))}
                  data-testid="tanda-swap-reset"
                >
                  {tx("tandaSwap.start_over")}
                </button>
              )}
            </h2>
            <ol className="group-inset" data-reorder-list aria-label={tx("tandaSwap.your_tanda_label")}>
              {draft.map((x, k) => (
                <li
                  key={x.id}
                  data-reorder-row
                  // biome-ignore lint/a11y/noNoninteractiveTabindex: a side the keyboard moves (Alt+arrows) and removes (Delete)
                  tabIndex={0}
                  className="cell gap-2 focus-visible:outline-2 focus-visible:outline-[var(--tint)]"
                  data-testid="tanda-swap-side"
                  data-song-id={x.id}
                  aria-label={tx("tandaSwap.side_label", { n: k + 1, title: x.title })}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget || p.lockedReason) return;
                    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
                      e.preventDefault();
                      const to = e.key === "ArrowUp" ? k - 1 : k + 1;
                      move(k, to);
                      // the side keeps the focus where it went
                      requestAnimationFrame(() =>
                        document
                          .querySelector<HTMLElement>(
                            `[data-testid="tanda-swap-side"][data-song-id="${CSS.escape(x.id)}"]`,
                          )
                          ?.focus(),
                      );
                    } else if (e.key === "Delete" || e.key === "Backspace") {
                      e.preventDefault();
                      setDraft((d) => removeSide(d, k));
                    }
                  }}
                >
                  <span className="w-5 shrink-0 text-center text-footnote tabular-nums text-[var(--label-2)]">
                    {k + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate">{x.title}</span>
                      <TandaTypeBadge rhythm={x.rhythm} compact />
                    </span>
                    <span className="text-footnote block truncate text-[var(--label-2)]">
                      {sideFacts(x)}
                      {x.durationSec ? ` · ${fmtLen(x.durationSec)}` : ""}
                      {x.id.startsWith("ext:")
                        ? ` · ${x.source === "spotify" ? "Spotify" : tx("tandaSwap.service")}`
                        : ""}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="icon-btn icon-btn-bare h-11 w-11 shrink-0"
                    aria-label={tx("play.move_up")}
                    disabled={k === 0 || !!p.lockedReason}
                    onClick={() => move(k, k - 1)}
                    data-testid="tanda-swap-up"
                  >
                    <ArrowUp size={16} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn-bare h-11 w-11 shrink-0"
                    aria-label={tx("play.move_down")}
                    disabled={k >= draft.length - 1 || !!p.lockedReason}
                    onClick={() => move(k, k + 1)}
                    data-testid="tanda-swap-down"
                  >
                    <ArrowDown size={16} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn-bare h-11 w-11 shrink-0 text-[var(--destructive)]"
                    aria-label={tx("tandaSwap.remove", { title: x.title })}
                    disabled={!!p.lockedReason}
                    onClick={() => setDraft((d) => removeSide(d, k))}
                    data-testid="tanda-swap-remove"
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="drag-handle icon-btn icon-btn-bare -mr-2 h-11 w-9 shrink-0 text-[var(--label-3)]"
                    aria-label={tx("play.drag_to_reorder", { title: x.title })}
                    {...drag(k)}
                  >
                    <GripVertical size={16} aria-hidden />
                  </button>
                </li>
              ))}
              {!draft.length && <Row label={tx("tandaSwap.empty")} />}
            </ol>
            <ul
              className="mt-2 flex flex-col gap-1 px-4"
              data-testid="tanda-swap-rules"
              aria-label={tx("tandaSwap.rules")}
            >
              {check.map((c) => (
                <li
                  key={c.key}
                  className={`text-footnote flex items-center gap-2 ${c.ok ? "text-[var(--label-2)]" : "text-[var(--destructive)]"}`}
                  data-ok={c.ok ? "1" : "0"}
                  data-rule={c.key}
                >
                  {c.ok ? <Check size={14} aria-hidden /> : <X size={14} aria-hidden />}
                  <span>
                    <span className="sr-only">{c.ok ? tx("tandaSwap.kept") : tx("tandaSwap.broken")} </span>
                    {tx(c.msg as MsgKey, c.values as Record<string, string>)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {!p.lockedReason && (
            <>
              <Group
                header={tx("tandaSwap.suggested")}
                footer={
                  options === null
                    ? tx("tandaChoices.finding_tandas_that_keep_the_night")
                    : options.length
                      ? tx("tandaSwap.suggested_footer")
                      : tx("tandaChoices.no_other_family_keeps_the_night")
                }
                data-testid="tanda-swap-suggested"
              >
                {(options ?? []).map((o) => {
                  const x = o.tandas[index!]!;
                  return (
                    <Row
                      key={x.songs.map((y) => y.id).join(",")}
                      tile={<RhythmTile rhythm={x.rhythm} />}
                      label={`${x.orchestra}${x.singer ? ` / ${x.singer}` : ` · ${tx("tandaType.instrumental")}`}`}
                      sub={`${x.yearRange?.join("–") ?? ""} · ${x.songs.map((y) => y.title).join(", ")}`}
                      chevron
                      onClick={() => {
                        haptic(6);
                        setDraft(x.songs.map(asDraft));
                      }}
                      data-testid="tanda-swap-option"
                    />
                  );
                })}
              </Group>
              <section className="px-4" data-testid="tanda-swap-search">
                <h2 className="section-head -mx-4">{tx("tandaSwap.add_sides")}</h2>
                <SmartSearchField
                  s={s}
                  id="tanda-swap-q"
                  prefix="tanda-swap"
                  placeholder={tx("smartSearch.placeholder")}
                  label={tx("tandaSwap.search_label")}
                  onEnter={add}
                />
                <SmartSearchResults
                  s={s}
                  id="tanda-swap-q"
                  prefix="tanda-swap"
                  onPick={add}
                  onPlay={p.onPlay}
                  playing={p.playing}
                  rowTestId="tanda-swap-result"
                  dim={inDraft}
                  actions={(v) => (
                    <button
                      type="button"
                      className="icon-btn icon-btn-bare h-11 w-11 shrink-0 text-[var(--tint)]"
                      aria-label={tx("tandaSwap.add", { title: v.song.title })}
                      disabled={inDraft(v)}
                      onClick={() => add(v)}
                      data-testid="tanda-swap-add"
                    >
                      <Plus size={18} aria-hidden />
                    </button>
                  )}
                />
              </section>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
