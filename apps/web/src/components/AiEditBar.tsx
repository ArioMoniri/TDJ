"use client";
import {
  type EditChange,
  type Feedback,
  learnFromLock,
  type NightEditOp,
  rememberEdit,
  type TandaBrief,
} from "@tdj/core";
import { ArrowRight, ArrowUp, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { aiFetch, hasOwnModel } from "@/lib/ai/client";
import { EDIT_EXAMPLES } from "@/lib/ai/examples";
import { installAiRelay } from "@/lib/ai/relayFetch";
import { FEEDBACK_LABEL } from "@/lib/feedback";
import { installLearnWatch, skipNextLearn } from "@/lib/learnWatch";
import { DUR, EASE } from "@/lib/motion";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { Playlist } from "@/lib/types";
import { yearText } from "@/lib/year";
import { Group } from "./Form";
import { Tip } from "./ui/Tip";

export interface AiEditResponse {
  playlist?: Playlist;
  applied?: EditChange[];
  rejected?: Array<{ op: NightEditOp; reason: string; suggest?: string }>;
  /** wave 2: a whole-night request is one of the Adjust chips ("more vals please") */
  chip?: Feedback;
  notUnderstood?: string[];
  note?: string | null;
  source?: "model" | "words";
  why?: string;
  error?: string;
}

/* wave 2: examples that work on a freshly composed night (lib/ai/words.test.ts) */
const EXAMPLES = EDIT_EXAMPLES;

/** the sides that changed in one tanda: the old title struck through, the new one after it */
function SidesDiff({ before, after }: { before?: TandaBrief; after?: TandaBrief }) {
  if (!before || !after) return null;
  const was = new Set(before.songs.map((s) => s.id));
  const now = new Set(after.songs.map((s) => s.id));
  const out = before.songs.filter((s) => !now.has(s.id));
  const inn = after.songs.filter((s) => !was.has(s.id));
  if (!out.length && !inn.length) return null;
  return (
    <span className="text-footnote mt-1 grid gap-0.5 text-[var(--label-2)]">
      {Array.from({ length: Math.max(out.length, inn.length) }, (_, k) => (
        <span key={`${out[k]?.id ?? ""}-${inn[k]?.id ?? ""}`} className="flex min-w-0 items-center gap-1.5">
          {out[k] && (
            <Tip
              text={`${out[k]!.title}${yearText(out[k]!.year) ? ` (${yearText(out[k]!.year)})` : ""}, energy ${out[k]!.energy}`}
              className="min-w-0"
            >
              <del className="truncate">{out[k]!.title}</del>
            </Tip>
          )}
          {out[k] && inn[k] && <ArrowRight size={12} className="shrink-0" aria-hidden />}
          {inn[k] && (
            <Tip
              text={`${inn[k]!.title}${yearText(inn[k]!.year) ? ` (${yearText(inn[k]!.year)})` : ""}, energy ${inn[k]!.energy}`}
              className="min-w-0"
            >
              <ins className="truncate text-[var(--label)] no-underline">
                {inn[k]!.title}{" "}
                {yearText(inn[k]!.year) && (
                  <span className="text-[var(--label-2)]">({yearText(inn[k]!.year)})</span>
                )}
              </ins>
            </Tip>
          )}
        </span>
      ))}
    </span>
  );
}

/**
 * Round 22 — Edit with AI (Compose): the DJ asks in words, the model answers with edits, the engine checks each
 * one; the changes show as a diff with Undo. Without a model, simple requests are read by keyword.
 */
export function AiEditBar({
  playlist,
  onChip,
}: {
  playlist: Playlist;
  /** wave 2: run an Adjust chip the request named ("more vals please" → More vals) */
  onChip?: (f: Feedback) => void | Promise<void>;
}) {
  const { settings, memory, overrides } = useStore();
  // the relay lets every AI request on the page use the DJ's own agent; the watcher learns from locks and swaps
  useEffect(() => {
    installAiRelay(() => useStore.getState().settings);
    installLearnWatch();
  }, []);
  const [learnedBefore, setLearnedBefore] = useState<{ v: typeof memory.learned } | null>(null);
  /** the engine-checked night replaces the set; the DJ's request teaches like a hand edit */
  const onApplied = (next: Playlist, prev: Playlist, instruction: string, applied: EditChange[]) => {
    const st = useStore.getState();
    skipNextLearn();
    st.setPlaylist(next);
    // wave 2: an AI edit is a version of tonight's History entry, labelled with the DJ's own words
    st.recordNightEdit(
      next,
      `“${instruction.length > 48 ? `${instruction.slice(0, 47)}…` : instruction}”`,
      "swap",
    );
    setLearnedBefore({ v: st.memory.learned });
    if (st.settings.learn)
      st.updateMemory((m) => {
        let nm = rememberEdit(m, prev, next, `asked: ${instruction.slice(0, 80)}`);
        // a lock changes no side: it teaches as a half vote for the tanda's family
        for (const c of applied)
          if (c.op === "lock" && c.after?.locked && next.tandas[c.tanda - 1])
            nm = {
              ...nm,
              learned: learnFromLock(nm.learned, next.tandas[c.tanda - 1]!, true, undefined, next.id),
            };
        return nm;
      });
  };
  const onUndo = (prev: Playlist) => {
    const st = useStore.getState();
    skipNextLearn();
    st.setPlaylist(prev);
    st.recordNightEdit(prev, "Edit undone", "swap");
    if (learnedBefore) st.updateMemory((m) => ({ ...m, learned: learnedBefore.v }));
    setLearnedBefore(null);
    toast("Edit undone");
  };
  const reduced = useReducedMotion();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ r: AiEditResponse; prev: Playlist; instruction: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const own = hasOwnModel(settings);

  const submit = async (e?: React.FormEvent, asked?: string) => {
    e?.preventDefault();
    const instruction = (asked ?? text).trim();
    if (!instruction || busy) return;
    setBusy(true);
    setError(null);
    const prev = playlist;
    try {
      const res = await aiFetch(
        "/api/ai/edit",
        {
          playlist: prev,
          instruction,
          memory: settings.learn ? { learned: memory.learned } : undefined,
          houseRules: overrides.guide?.houseRules ?? "",
        },
        settings,
      );
      const r = (await res.json().catch(() => ({}))) as AiEditResponse;
      if (!res.ok || !r.playlist) {
        setError(r.error ?? "That did not work; try again.");
        return;
      }
      setResult({ r, prev, instruction });
      if (r.chip && !r.applied?.length && onChip) {
        setText("");
        await onChip(r.chip);
        return;
      }
      if (r.applied?.length) {
        onApplied(r.playlist, prev, instruction, r.applied);
        setText("");
      }
    } catch {
      setError("Could not reach T-DJ. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };
  const undo = () => {
    if (!result) return;
    onUndo(result.prev);
    setResult(null);
  };

  const r = result?.r;
  const nothing = r && !r.applied?.length;
  return (
    <Group
      header="Edit with AI"
      footer={
        <span aria-live="polite" className="block">
          {error ? (
            <span className="text-[var(--destructive)]">{error}</span>
          ) : busy ? (
            "Reading the night…"
          ) : own ? (
            "Ask in your own words. Every change is checked against the night's rules; anything that would break it is refused and said why."
          ) : (
            "Without a model in Settings → Models, simple requests (calmer, livelier, lock, move, swap a song) still work."
          )}{" "}
          {!busy && !error && (
            <Tip text="Start from an empty night and choose every tanda yourself">
              <Link href="/build" className="text-[var(--tint)]" data-testid="build-by-hand">
                Or build a night by hand.
              </Link>
            </Tip>
          )}
        </span>
      }
      aria-label="Edit the night with AI"
      data-testid="ai-edit"
    >
      <form onSubmit={submit} className="cell">
        <Sparkles size={18} className="shrink-0 text-[var(--tint)]" aria-hidden />
        <label htmlFor="ai-edit-input" className="sr-only">
          Edit the night
        </label>
        <Tip
          text="Say what to change: a tanda calmer or livelier, a song swapped, a tanda moved, locked or replaced"
          className="min-w-0 flex-1"
        >
          <input
            id="ai-edit-input"
            className="field w-full min-w-0"
            placeholder={`${EXAMPLES[0]} · ${EXAMPLES[1]}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={400}
            autoComplete="off"
            enterKeyHint="send"
          />
        </Tip>
        <Tip text={"Make the change"}>
          <button
            type="submit"
            className="icon-btn icon-btn-send -mr-2"
            disabled={busy || !text.trim()}
            aria-label="Make the change"
          >
            {busy ? (
              <LoaderCircle size={18} className="animate-spin" />
            ) : (
              <ArrowUp size={18} strokeWidth={2.5} />
            )}
          </button>
        </Tip>
      </form>
      {!result && !busy && (
        <div className="cell flex-wrap gap-2 py-2.5">
          {EXAMPLES.map((x) => (
            <Tip key={x} text={"Use this example"}>
              <button type="button" className="chip" onClick={() => setText(x)}>
                {x}
              </button>
            </Tip>
          ))}
        </div>
      )}
      <AnimatePresence initial={false}>
        {r && (
          <motion.div
            key={result!.instruction}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DUR.base, ease: EASE.out }}
            className="cell flex-col items-stretch gap-2 py-3"
            data-testid="ai-edit-diff"
          >
            <div className="flex items-center justify-between gap-3">
              <Tip text={result!.instruction}>
                <span className="text-subhead min-w-0 truncate text-[var(--label-2)]">
                  “{result!.instruction}”{r.source === "words" ? " · read by keyword" : ""}
                </span>
              </Tip>
              <span className="flex shrink-0 items-center gap-1">
                {!!r.applied?.length && (
                  <Tip text={"Put the night back as it was"}>
                    <button
                      type="button"
                      className="btn btn-ghost min-h-[44px] px-3"
                      onClick={undo}
                      data-testid="ai-edit-undo"
                    >
                      <RotateCcw size={16} aria-hidden /> Undo
                    </button>
                  </Tip>
                )}
                <button
                  type="button"
                  className="btn-plain min-h-[44px] px-2"
                  onClick={() => setResult(null)}
                  data-testid="ai-edit-done"
                >
                  {r.applied?.length ? "Keep" : "Close"}
                </button>
              </span>
            </div>
            {r.note && <p className="text-footnote text-[var(--label-2)]">{r.note}</p>}
            <ul className="grid gap-2">
              {(r.applied ?? []).map((c) => (
                <li key={`${c.op}-${c.tanda}-${c.line}`} className="min-w-0">
                  <span className="text-subhead flex items-start gap-2">
                    <Tip text={`Tanda ${c.tanda}`}>
                      <span className="mt-0.5 inline-grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[var(--tint)] px-1 text-[11px] font-semibold text-white tabular-nums">
                        {c.tanda}
                      </span>
                    </Tip>
                    <span className="min-w-0">{c.line}</span>
                  </span>
                  <span className="block pl-7">
                    <SidesDiff before={c.before} after={c.after} />
                  </span>
                </li>
              ))}
              {(r.rejected ?? []).map((x) => (
                <li
                  key={`no-${JSON.stringify(x.op)}`}
                  className="text-footnote text-[var(--label-2)]"
                  data-testid="ai-edit-refused"
                >
                  Not done (tanda {x.op.tanda}): {x.reason}.
                  {x.suggest && (
                    <>
                      {" "}
                      <button
                        type="button"
                        className="btn-plain min-h-11 px-1 font-semibold"
                        onClick={() => {
                          setText(x.suggest!);
                          void submit(undefined, x.suggest);
                        }}
                        data-testid="ai-edit-suggest"
                      >
                        {x.suggest}
                      </button>
                    </>
                  )}
                </li>
              ))}
              {r.chip && (
                <li className="text-footnote text-[var(--label-2)]" data-testid="ai-edit-chip">
                  That is a change to the whole night: recomposing with “{FEEDBACK_LABEL[r.chip]}”, as the
                  Adjust chip does.
                </li>
              )}
              {nothing && !r.rejected?.length && !r.chip && (
                <li className="text-footnote text-[var(--label-2)]">
                  Nothing to change:{" "}
                  {r.notUnderstood?.length
                    ? `“${r.notUnderstood.join("”, “")}” was not understood`
                    : "no edit came back"}
                  {r.why ? ` (${r.why})` : ""}. Try naming the tanda: “make tanda 7 calmer”.
                </li>
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </Group>
  );
}
