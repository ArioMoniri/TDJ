"use client";
import type { Cortina } from "@tdj/core";
import { renight } from "@tdj/core";
import { ArrowDown, ArrowUp, Disc3, GripVertical, Lock, LockOpen, Repeat2, SkipForward } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { withCortina } from "@/lib/booth/swap";
import { recordSnapshot, undoEdit } from "@/lib/editHistory";
import { haptic } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { isAction } from "@/lib/keymap";
import { lengthOf, tandaTotal, totalText } from "@/lib/lengths";
import { nightItems, PlayListContext } from "@/lib/playback";
import { moveItem, moveSongInNight } from "@/lib/reorder";
import { gateEdit } from "@/lib/ruleCheck";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { Playlist } from "@/lib/types";
import { metaLine, yearText } from "@/lib/year";
import { CortinaPickSheet } from "./CortinaPickSheet";
import { Group } from "./Form";
import { NightCover } from "./NightCover";
import { SwapSheet } from "./SwapSheet";
import { TandaCard } from "./TandaCard";
import { TandaSwapSheet } from "./TandaSwapSheet";
import { Artwork } from "./ui/Artwork";
import { NightLength, PlayRow } from "./ui/PlayRow";
import { TandaArt } from "./ui/TandaArt";
import { rhythmWord } from "./ui/TandaTypeBadge";
import { Tip } from "./ui/Tip";
import { useDragReorder } from "./ui/useDragReorder";

const NO_REFS: never[] = [];

/**
 * 2026-11 (the owner: "not all functions available in other editors are available in the rooms"): the whole night
 * with Compose's editing, for any page that edits the store's night (the room page; every change reaches the other
 * DJs through lib/rooms.ts). The opening La Cumparsita, every tanda as Compose's card (its songs, swap a song or the
 * tanda through the Swap sheets and the smart search, reorder its songs by drag or Alt+↑ / ↓, lock, Skip tonight,
 * pre-listen and tap-to-play, the type badge and the lengths), its cortina (change it), the closing; the tandas
 * reorder by drag or Alt+↑ / ↓ on their bar, whose head stays on screen as the list scrolls. Every edit goes through
 * the rule check (lib/ruleCheck.ts) and the one undo history.
 */
export function NightEditor({
  onMovedTanda,
  testId = "night-editor",
  idPrefix = "editor",
}: {
  /** a tanda moved from `from` to `to` (the room names the DJ's move in its log) */
  onMovedTanda?: (from: number, to: number) => void;
  testId?: string;
  /** the rows' test ids: `<prefix>-tanda-N`, `<prefix>-up-N`, `<prefix>-skip-N`… (the room keeps its own) */
  idPrefix?: string;
}) {
  const playlist = useStore((s) => s.playlist);
  const setPlaylist = useStore((s) => s.setPlaylist);
  const recordNightEdit = useStore((s) => s.recordNightEdit);
  const [tandaAt, setTandaAt] = useState<number | null>(null);
  const [swapAt, setSwapAt] = useState<{ i: number; k: number } | null>(null);
  const [cortinaAt, setCortinaAt] = useState<number | null>(null);
  const list = useMemo(
    () => (playlist ? { label: playlist.name, items: nightItems(playlist) } : null),
    [playlist],
  );
  const apply = useCallback(
    (x: Playlist, label: string) => {
      setPlaylist(x);
      recordNightEdit(x, label, "swap");
    },
    [setPlaylist, recordNightEdit],
  );
  const lock = useCallback(
    (i: number) => {
      const p = useStore.getState().playlist;
      if (!p) return;
      const next = { ...p, tandas: p.tandas.map((x, k) => (k === i ? { ...x, locked: !x.locked } : x)) };
      setPlaylist(next);
      recordSnapshot(
        next.tandas[i]?.locked ? t("editKeys.locked", { p1: i + 1 }) : t("editKeys.unlocked", { p1: i + 1 }),
        p,
        next,
        setPlaylist,
      );
    },
    [setPlaylist],
  );
  const bypass = useCallback(
    (i: number) => {
      const p = useStore.getState().playlist;
      if (!p) return;
      const on = !p.tandas[i]?.bypass;
      const next = {
        ...p,
        tandas: p.tandas.map((x, k) => (k === i ? { ...x, bypass: on || undefined } : x)),
      };
      setPlaylist(next);
      recordSnapshot(t("editKeys.skip_toggled", { p1: i + 1 }), p, next, setPlaylist);
      toast(
        on
          ? t("composer.tanda_is_skipped_tonight_it_stays", { p1: i + 1 })
          : t("composer.tanda_plays_tonight", { p1: i + 1 }),
        () => void undoEdit(),
      );
    },
    [setPlaylist],
  );
  const moveTrack = useCallback(
    async (i: number, from: number, to: number) => {
      const prev = useStore.getState().playlist;
      if (!prev) return;
      const next = moveSongInNight(prev, i, from, to);
      if (next === prev) return;
      haptic(6);
      const label = t("play.moved_song", {
        title: prev.tandas[i]?.songs[from]?.title ?? "",
        p1: to + 1,
        p2: i + 1,
      });
      const res = await gateEdit({ before: prev, after: next, label, apply: (x, l) => apply(x, l) });
      if (res === "applied") toast(label, () => void undoEdit());
    },
    [apply],
  );
  /** tanda `from` to place `to` (splice), through the rule check (the order rules), into the undo history */
  const moveTanda = useCallback(
    async (from: number, to: number) => {
      const prev = useStore.getState().playlist;
      if (!prev || to < 0 || to >= prev.tandas.length || from === to) return;
      const tandas = moveItem(prev.tandas, from, to).map((x, k) => ({ ...x, index: k }));
      const next = renight(prev, tandas);
      haptic(6);
      const label = t("nightEditor.moved_tanda", { from: from + 1, to: to + 1 });
      const res = await gateEdit({ before: prev, after: next, label, apply: (x, l) => apply(x, l) });
      if (res === "applied") {
        onMovedTanda?.(from, to);
        toast(label, () => void undoEdit());
      }
    },
    [apply, onMovedTanda],
  );
  const pickCortina = useCallback(
    (i: number, c: Cortina) => {
      const prev = useStore.getState().playlist;
      if (!prev) return;
      const next = withCortina(prev, i, c);
      apply(next, t("nightEditor.cortina_changed", { title: c.title, n: i + 1 }));
      recordSnapshot(t("nightEditor.cortina_changed", { title: c.title, n: i + 1 }), prev, next, setPlaylist);
    },
    [apply, setPlaylist],
  );
  const drag = useDragReorder((from, to) => void moveTanda(from, to));
  if (!playlist) return null;
  const cues = playlist.booth?.songCues;
  const breakAfter = new Map((playlist.breaks ?? []).map((b) => [b.afterTanda, b]));
  return (
    <PlayListContext.Provider value={list}>
      <section className="night-editor" data-testid={testId}>
        <div className="night-editor-head">
          <NightCover night={playlist} size={56} className="rounded-[10px]" testId="night-editor-cover" />
          <span className="min-w-0 flex-1">
            <span className="text-headline block truncate">{playlist.name}</span>
            <span className="text-footnote block text-[var(--label-2)]" data-testid="night-editor-totals">
              {t("nightEditor.tandas", { n: playlist.tandas.length })} · <NightLength playlist={playlist} />
            </span>
          </span>
        </div>
        {playlist.opening && (
          <Group header={t("composer.opening")} data-testid="night-editor-opening">
            <PlayRow
              song={playlist.opening}
              where={t("play.opening")}
              testId="opening"
              leading={<Artwork entity={playlist.opening} orchestra={playlist.opening.orchestra} size={44} />}
              title={<span className="text-headline">{t("composer.la_cumparsita")}</span>}
              sub={metaLine(
                playlist.opening.orchestra,
                playlist.opening.singer,
                yearText(playlist.opening.year),
              )}
              lengthSec={lengthOf(playlist.opening, cues)}
            />
          </Group>
        )}
        <ol className="night-editor-tandas" data-reorder-list aria-label={t("composer.tandas")}>
          {playlist.tandas.map((x, i) => {
            const total = tandaTotal(x.songs, cues);
            const b = breakAfter.get(i);
            return (
              <li
                key={`${x.index}-${x.songs[0]?.id}`}
                className="night-editor-tanda"
                data-reorder-row
                data-testid={`${idPrefix}-tanda-${i + 1}`}
              >
                {/* the tanda's bar: its head while its songs scroll by; drag it, or Alt+↑ / ↓ on it, to move it */}
                {/* biome-ignore lint/a11y/useSemanticElements: a sticky bar of controls, not a form's fieldset */}
                <div
                  className="night-editor-bar"
                  // biome-ignore lint/a11y/noNoninteractiveTabindex: the bar takes Alt+↑ / ↓ like a song row does
                  tabIndex={0}
                  role="group"
                  aria-label={t("nightEditor.tanda_bar", { n: i + 1, orchestra: x.orchestra })}
                  data-testid="editor-tanda-bar"
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    const up = isAction("edit.moveUp", e);
                    if (!up && !isAction("edit.moveDown", e)) return;
                    e.preventDefault();
                    void moveTanda(i, up ? i - 1 : i + 1);
                  }}
                >
                  <button
                    type="button"
                    className="drag-handle icon-btn icon-btn-bare h-11 w-11 shrink-0 text-[var(--label-3)]"
                    aria-label={t("nightEditor.drag_tanda", { n: i + 1 })}
                    data-testid="editor-tanda-drag"
                    {...drag(i)}
                  >
                    <GripVertical size={16} aria-hidden />
                  </button>
                  <TandaArt tanda={x} size={28} />
                  <span className="min-w-0 flex-1 truncate">
                    <b className="font-semibold">{i + 1}.</b> {x.orchestra}
                    <span className="text-[var(--label-2)]">
                      {" · "}
                      {rhythmWord(x.rhythm)} · {totalText(total)}
                    </span>
                  </span>
                  <Tip text={t("nightEditor.move_up", { n: i + 1 })}>
                    <button
                      type="button"
                      className="night-editor-step icon-btn icon-btn-bare h-11 w-11"
                      aria-label={t("nightEditor.move_up", { n: i + 1 })}
                      disabled={i === 0}
                      onClick={() => void moveTanda(i, i - 1)}
                      data-testid={`${idPrefix}-up-${i + 1}`}
                    >
                      <ArrowUp size={18} aria-hidden />
                    </button>
                  </Tip>
                  <Tip text={t("nightEditor.move_down", { n: i + 1 })}>
                    <button
                      type="button"
                      className="night-editor-step icon-btn icon-btn-bare h-11 w-11"
                      aria-label={t("nightEditor.move_down", { n: i + 1 })}
                      disabled={i === playlist.tandas.length - 1}
                      onClick={() => void moveTanda(i, i + 1)}
                      data-testid={`${idPrefix}-down-${i + 1}`}
                    >
                      <ArrowDown size={18} aria-hidden />
                    </button>
                  </Tip>
                  <Tip
                    text={
                      x.locked
                        ? t("rooms.unlock_tanda", { p1: i + 1 })
                        : t("rooms.lock_tanda_keeps_it_when_the", { p1: i + 1 })
                    }
                  >
                    <button
                      type="button"
                      className={`icon-btn icon-btn-bare h-11 w-11 ${x.locked ? "text-[var(--tint)]" : ""}`}
                      aria-label={
                        x.locked
                          ? t("rooms.unlock_tanda", { p1: i + 1 })
                          : t("rooms.lock_tanda_keeps_it_when_the", { p1: i + 1 })
                      }
                      aria-pressed={!!x.locked}
                      onClick={() => lock(i)}
                      data-testid={`${idPrefix}-lock-${i + 1}`}
                    >
                      {x.locked ? <Lock size={18} aria-hidden /> : <LockOpen size={18} aria-hidden />}
                    </button>
                  </Tip>
                  <Tip
                    text={
                      x.bypass
                        ? t("rooms.play_tanda_tonight", { p1: i + 1 })
                        : t("rooms.skip_tanda_tonight_stays_in_exports", { p1: i + 1 })
                    }
                  >
                    <button
                      type="button"
                      className={`icon-btn icon-btn-bare h-11 w-11 ${x.bypass ? "text-[var(--tint)]" : ""}`}
                      aria-label={
                        x.bypass
                          ? t("rooms.play_tanda_tonight", { p1: i + 1 })
                          : t("rooms.skip_tanda_tonight_stays_in_exports", { p1: i + 1 })
                      }
                      aria-pressed={!!x.bypass}
                      onClick={() => bypass(i)}
                      data-testid={`${idPrefix}-skip-${i + 1}`}
                    >
                      <SkipForward size={18} aria-hidden />
                    </button>
                  </Tip>
                  {x.cortina && (
                    <Tip text={t("nightEditor.change_cortina", { n: i + 1 })}>
                      <button
                        type="button"
                        className="icon-btn icon-btn-bare h-11 w-11"
                        aria-label={t("nightEditor.change_cortina", { n: i + 1 })}
                        onClick={() => setCortinaAt(i)}
                        data-testid="editor-change-cortina"
                      >
                        <Repeat2 size={18} aria-hidden />
                      </button>
                    </Tip>
                  )}
                </div>
                <TandaCard
                  t={x}
                  i={i}
                  onSwap={setTandaAt}
                  onSwapTrack={(ti, k) => setSwapAt({ i: ti, k })}
                  onLock={lock}
                  onBypass={bypass}
                  playlists={NO_REFS}
                  onMoveTrack={moveTrack}
                  cues={cues}
                />
                {b && (
                  <p
                    className="text-footnote px-4 py-2 text-center text-[var(--label-2)]"
                    data-testid="break"
                  >
                    {t("composer.min_2", { label: b.label, minutes: b.minutes })}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
        {playlist.closing && (
          <Group header={t("composer.closing")} data-testid="night-editor-closing">
            <PlayRow
              song={playlist.closing}
              where={t("play.closing")}
              testId="closing"
              leading={<Artwork entity={playlist.closing} orchestra={playlist.closing.orchestra} size={44} />}
              title={<span className="text-headline">{t("composer.la_cumparsita")}</span>}
              sub={metaLine(playlist.closing.orchestra, yearText(playlist.closing.year))}
              lengthSec={lengthOf(playlist.closing, cues)}
            />
          </Group>
        )}
        {!playlist.opening && !playlist.closing && (
          <p className="section-foot">
            <Disc3 size={14} className="mr-1 inline" aria-hidden />
            {t("nightEditor.no_cumparsita")}
          </p>
        )}
      </section>
      <TandaSwapSheet
        playlist={tandaAt !== null ? playlist : null}
        index={tandaAt}
        onClose={() => setTandaAt(null)}
        apply={apply}
      />
      <SwapSheet
        playlist={swapAt ? playlist : null}
        tandaIndex={swapAt?.i ?? null}
        trackIndex={swapAt?.k ?? null}
        onClose={() => setSwapAt(null)}
        onApplied={(p, note) =>
          apply(p, /undone|kept|unpinned/i.test(note) ? note : t("composer.changed_a_song"))
        }
      />
      <CortinaPickSheet
        playlist={cortinaAt !== null ? playlist : null}
        index={cortinaAt}
        onClose={() => setCortinaAt(null)}
        onPick={(c) => {
          if (cortinaAt !== null) pickCortina(cortinaAt, c);
          setCortinaAt(null);
        }}
      />
    </PlayListContext.Provider>
  );
}
