import { recordEdit } from "@/lib/editHistory";
import { t } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import type { BoothMarks } from "./engine";
import type { BoothStore } from "./store";

/**
 * 2026-11 (the owner: "all actions like Next at gap and others should have a Cmd+Z / Ctrl+Z"): every reversible
 * Booth action goes into the one edit history (lib/editHistory.ts), so ⌘Z / Ctrl+Z (or the DJ's own keys,
 * lib/keymap.ts), the Mac app's Edit → Undo and the toasts' Undo walk them with the night's swaps and reorders.
 *
 * - What comes next (Skip next, Cortina early, Birthday vals, a break, Hold, Rest then La Cumparsita): the
 *   engine's marks before and after (BoothEngine.marks / restoreMarks); an item already reached stays as it played.
 * - The night's plan (Skip tonight, Last 4 tandas tango only, start points, cortina edits, trims, the Booth's
 *   settings, the gaps, the cortina length): the value before and after; a slider dragged or a stepper tapped in a
 *   row merges into one entry (Edit.key).
 * - What the room already heard (Next now, Previous, Play now, Skip now, a fade, La Cumparsita now): while the night
 *   plays it cannot be un-heard — the entry says so when ⌘Z reaches it and leaves the history (Edit.blocked); before
 *   the night (nothing sounds yet) its undo puts the playhead back.
 *
 * The store's actions are wrapped once (installBoothUndo, called at the end of lib/booth/store.ts), so every button,
 * key, menu and sheet that runs them records. An undo or redo runs the same actions without recording again.
 */

type Get = () => BoothStore;
type Set = (p: Partial<BoothStore>) => void;
interface EngineMarks {
  marks(): BoothMarks;
  restoreMarks(m: BoothMarks): void;
  trims: Record<string, number>;
}

let quiet = 0;
/** runs `fn` without recording (an undo, a redo, an action inside another) */
async function silently<T>(fn: () => T | Promise<T>): Promise<T> {
  quiet++;
  try {
    return await fn();
  } finally {
    quiet--;
  }
}
const recording = () => quiet === 0;

export function installBoothUndo(get: Get, set: Set, engine: () => EngineMarks | null) {
  const s0 = get();
  const orig = {
    next: s0.next,
    cueCortina: s0.cueCortina,
    birthdayVals: s0.birthdayVals,
    startBreak: s0.startBreak,
    hold: s0.hold,
    toggleHold: s0.toggleHold,
    jumpToClosing: s0.jumpToClosing,
    toggleBypass: s0.toggleBypass,
    setLastFourTango: s0.setLastFourTango,
    setSongCue: s0.setSongCue,
    setCortinaEdit: s0.setCortinaEdit,
    setTrim: s0.setTrim,
    setSettings: s0.setSettings,
    setSilence: s0.setSilence,
    setCortinaLength: s0.setCortinaLength,
    nextNow: s0.nextNow,
    previous: s0.previous,
    playNow: s0.playNow,
    skipNow: s0.skipNow,
    fadeOutNow: s0.fadeOutNow,
    crossfadeNext: s0.crossfadeNext,
  };
  const titleAt = (i: number | null | undefined) =>
    i === null || i === undefined ? "" : (get().plan?.items[i]?.title ?? "");
  const nowTitle = () => titleAt(get().planIndex);
  const live = () => {
    const s = get();
    return s.started && (s.state === "playing" || s.state === "cortina");
  };
  const marks = () => engine()?.marks() ?? null;
  const restore = (m: BoothMarks | null) => {
    const e = engine();
    if (!m || !e) return;
    e.restoreMarks(m);
    set({ skipped: m.skipped.length ? [...m.skipped] : [] });
  };

  /** an action that changes what comes next: the marks before and after */
  const marked =
    <A extends unknown[], R>(
      label: (r: R, added: number[], a: NoInfer<A>) => string | null,
      fn: (...a: A) => R,
    ) =>
    (...a: A): R => {
      if (!recording()) return fn(...a);
      const before = marks();
      const indexBefore = get().planIndex;
      const finish = (r: R) => {
        const after = marks();
        const added = after ? after.skipped.filter((i) => !before?.skipped.includes(i)) : [];
        const l = label(r, added, a);
        if (!l) return r;
        if (before && after && JSON.stringify(before) !== JSON.stringify(after))
          recordEdit({
            label: l,
            undo: () => silently(() => restore(before)),
            redo: () => silently(() => restore(after)),
          });
        else if (!live() && get().planIndex !== indexBefore) {
          // before the night: the action moved the playhead (Next on a stopped night)
          const to = get().planIndex;
          recordEdit({
            label: l,
            undo: () => silently(() => void get().select(indexBefore)),
            redo: () => silently(() => void get().select(to)),
          });
        }
        return r;
      };
      quiet++;
      let r: R;
      try {
        r = fn(...a);
      } finally {
        quiet--;
      }
      if (r instanceof Promise) return r.then((x) => finish(x as R)) as R;
      return finish(r);
    };

  /** a change of the night's plan or settings: the value before, the value after, put back the same way */
  const valued =
    <A extends unknown[], V>(o: {
      label: (a: NoInfer<A>) => string;
      key: (a: NoInfer<A>) => string;
      read: (a: NoInfer<A>) => V;
      apply: (v: V, a: NoInfer<A>) => unknown;
      fn: (...a: A) => unknown;
    }) =>
    (...a: A) => {
      if (!recording()) return o.fn(...a);
      const before = o.read(a);
      const r = o.fn(...a);
      const done = () => {
        const after = o.read(a);
        if (JSON.stringify(before) === JSON.stringify(after)) return;
        recordEdit({
          label: o.label(a),
          key: o.key(a),
          undo: async () => void (await silently(() => o.apply(before, a))),
          redo: async () => void (await silently(() => o.apply(after, a))),
        });
      };
      if (r instanceof Promise)
        return r.then((x) => {
          done();
          return x;
        });
      done();
      return r;
    };

  /** what the room hears at once: while the night plays it cannot be undone (the toast says why) */
  const audible =
    <A extends unknown[], R>(name: (a: NoInfer<A>) => string, fn: (...a: A) => R) =>
    (...a: A): R => {
      if (!recording()) return fn(...a);
      const wasLive = live();
      const indexBefore = get().planIndex;
      const title = nowTitle();
      const r = fn(...a);
      const done = () => {
        const label = name(a);
        if (wasLive) {
          recordEdit({
            label: title ? `${label} (${title})` : label,
            undo: () => {},
            redo: () => {},
            blocked: () => t("boothUndo.already_heard", { action: label, title: title || label }),
          });
          return;
        }
        const to = get().planIndex;
        if (to === indexBefore) return;
        recordEdit({
          label: `${label} (${titleAt(to)})`,
          undo: () => silently(() => void get().select(indexBefore)),
          redo: () => silently(() => void get().select(to)),
        });
      };
      if (r instanceof Promise)
        return r.then((x) => {
          done();
          return x;
        }) as R;
      done();
      return r;
    };

  const settingsOf = (keys: string[]) =>
    Object.fromEntries(keys.map((k) => [k, (get().settings as unknown as Record<string, unknown>)[k]]));
  const appSetting = <K extends keyof ReturnType<typeof useStore.getState>["settings"]>(k: K) =>
    useStore.getState().settings[k];

  set({
    next: marked(
      (_r, added) => t("boothUndo.skip_next", { title: titleAt(added[0] ?? get().planIndex) }),
      orig.next,
    ),
    cueCortina: marked(() => t("boothUndo.cortina_early"), orig.cueCortina),
    birthdayVals: marked(() => t("boothUndo.birthday"), orig.birthdayVals),
    startBreak: marked((_r, _added, [m]) => t("boothUndo.break", { m }), orig.startBreak),
    hold: marked(() => t("boothUndo.hold"), orig.hold),
    toggleHold: marked(
      () => (get().holding ? t("boothUndo.hold") : t("boothUndo.hold_off")),
      orig.toggleHold,
    ),
    jumpToClosing: (now: boolean) =>
      now
        ? audible(() => t("boothUndo.cumparsita_now"), orig.jumpToClosing)(now)
        : marked(() => t("boothUndo.rest_then_cumparsita"), orig.jumpToClosing)(now),
    toggleBypass: valued({
      label: ([tanda]) =>
        get().playlist?.tandas[tanda - 1]?.bypass
          ? t("boothUndo.skip_tonight", { n: tanda })
          : t("boothUndo.play_tonight", { n: tanda }),
      key: ([tanda]) => `bypass:${tanda}:${Date.now()}`,
      read: ([tanda]) => !!get().playlist?.tandas[tanda - 1]?.bypass,
      apply: async (v, [tanda]) => {
        if (!!get().playlist?.tandas[tanda - 1]?.bypass !== v) await orig.toggleBypass(tanda);
      },
      fn: orig.toggleBypass,
    }) as BoothStore["toggleBypass"],
    setLastFourTango: valued({
      label: ([on]) => (on ? t("boothUndo.last_four_on") : t("boothUndo.last_four_off")),
      key: () => `lastfour:${Date.now()}`,
      read: () => !!get().playlist?.options.rules?.lastFourTango,
      apply: (v) => orig.setLastFourTango(v),
      fn: orig.setLastFourTango,
    }) as BoothStore["setLastFourTango"],
    setSongCue: valued({
      label: ([id]) => t("boothUndo.start_point", { title: titleOf(get, id) }),
      key: ([id]) => `cue:${id}`,
      read: ([id]) => get().playlist?.booth?.songCues?.[id] ?? null,
      apply: (v, [id]) => orig.setSongCue(id, v ? { ...v } : null),
      fn: orig.setSongCue,
    }) as BoothStore["setSongCue"],
    setCortinaEdit: valued({
      label: ([id]) => t("boothUndo.cortina_edit", { title: titleOf(get, id) }),
      key: ([id]) => `cortina:${id}`,
      read: ([id]) => get().playlist?.booth?.cortinaEdits?.[id] ?? null,
      apply: (v, [id]) => {
        orig.setCortinaEdit(id, null);
        if (v) orig.setCortinaEdit(id, { ...v });
      },
      fn: orig.setCortinaEdit,
    }) as BoothStore["setCortinaEdit"],
    setTrim: valued({
      label: ([id]) => t("boothUndo.trim", { title: titleOf(get, id) }),
      key: ([id]) => `trim:${id}`,
      read: ([id]) => engine()?.trims[id] ?? 0,
      apply: (v, [id]) => orig.setTrim(id, v),
      fn: orig.setTrim,
    }) as BoothStore["setTrim"],
    setSettings: valued({
      label: ([s]) => ("gapSec" in s ? t("boothUndo.gap", { sec: s.gapSec ?? 0 }) : t("boothUndo.settings")),
      key: ([s]) => `settings:${Object.keys(s).sort().join(",")}`,
      read: ([s]) => settingsOf(Object.keys(s)),
      apply: (v) => orig.setSettings(v as Parameters<BoothStore["setSettings"]>[0]),
      fn: orig.setSettings,
    }) as BoothStore["setSettings"],
    setSilence: valued({
      label: () => t("boothUndo.silence"),
      key: () => "silence",
      read: () => ({ mode: appSetting("boothSilence"), estimate: appSetting("boothSilenceEstimate") }),
      apply: (v) =>
        orig.setSilence({
          ...(v.mode !== undefined ? { mode: v.mode as never } : {}),
          ...(v.estimate !== undefined ? { estimate: v.estimate as boolean } : {}),
        }),
      fn: orig.setSilence,
    }) as BoothStore["setSilence"],
    setCortinaLength: valued({
      label: () => t("boothUndo.cortina_length"),
      key: () => "cortina-length",
      read: () => appSetting("cortinaStopSec") ?? null,
      apply: (v) => orig.setCortinaLength(v),
      fn: orig.setCortinaLength,
    }) as BoothStore["setCortinaLength"],
    nextNow: audible(() => t("boothUndo.next_now"), orig.nextNow),
    previous: audible(() => t("boothUndo.previous"), orig.previous),
    playNow: audible(() => t("boothUndo.play_now"), orig.playNow),
    skipNow: audible(() => t("boothUndo.skip_now"), orig.skipNow),
    fadeOutNow: audible(() => t("boothUndo.fade_out"), orig.fadeOutNow),
    crossfadeNext: audible(() => t("boothUndo.crossfade"), orig.crossfadeNext),
  });
}

/**
 * A floor reaction or a praise: the DJ's memory before and after (what T-DJ learns from them), put back on undo and
 * on again on redo. (The memory is the whole learned store: an undo puts back the state of that moment.)
 */
export function recordMemoryEdit(label: string, change: () => void) {
  const before = useStore.getState().memory;
  change();
  const after = useStore.getState().memory;
  if (before === after) return;
  recordEdit({
    label,
    undo: () => useStore.getState().updateMemory(() => before),
    redo: () => useStore.getState().updateMemory(() => after),
  });
}

/** a side's or cortina's title by id (the label of a start point or a trim) */
function titleOf(get: Get, id: string): string {
  const it = get().plan?.items.find((x) => x.id === id);
  return it?.title ?? "";
}

/** for tests: whether an action is running unrecorded */
export const _boothUndoQuiet = () => quiet;
