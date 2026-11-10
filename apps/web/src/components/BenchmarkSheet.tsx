"use client";
import type { BenchCheck, BenchResult, Change, ImproveSnapshot } from "@tdj/core";
import { LoaderCircle, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { haptic } from "@/lib/haptics";
import { DUR, EASE } from "@/lib/motion";
import { overridesForRequest, useStore } from "@/lib/store";
import type { Playlist } from "@/lib/types";
import { Group } from "./Form";
import { Sheet } from "./Sheet";

export interface ImproveResponse {
  playlist: Playlist;
  changes: Change[];
  before: ImproveSnapshot;
  after: ImproveSnapshot;
}

const DOT: Record<BenchCheck["status"], { color: string; word: string }> = {
  ok: { color: "var(--system-green)", word: "In range" },
  near: { color: "var(--system-gold)", word: "Near the range" },
  off: { color: "var(--destructive)", word: "Out of range" },
};

/** "11/13 in range" for the result card row */
export const benchLabel = (b: Pick<BenchResult, "inRange" | "scored">) => `${b.inRange}/${b.scored} in range`;

/**
 * The benchmark against the published DJ sets (docs/specs/round12-benchmark.md): every check with our value, the
 * reference range, a status dot and its source; "Improve automatically" runs the engine's fixers on the server and
 * shows what changed before anything replaces the set (Keep) or is thrown away (Undo).
 */
export function BenchmarkSheet({
  open,
  onClose,
  playlist,
  bench,
  onKeep,
}: {
  open: boolean;
  onClose: () => void;
  playlist: Playlist;
  bench: BenchResult;
  onKeep: (r: ImproveResponse) => void;
}) {
  const reduced = useReducedMotion();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImproveResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // a new night (or a kept one) starts from its own checks
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the set changes
  useEffect(() => {
    setResult(null);
    setError(null);
  }, [playlist]);

  const improve = async () => {
    setBusy(true);
    setError(null);
    haptic(6);
    try {
      const r = await fetch("/api/improve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playlist, overrides: overridesForRequest(useStore.getState().overrides) }),
      });
      const j = (await r.json()) as ImproveResponse & { error?: string };
      if (!r.ok || j.error) setError(j.error ?? "Could not improve this set.");
      else setResult(j);
    } catch {
      setError("Could not reach the engine. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const shown = result ? null : bench;
  const footer = result ? (
    <div className="flex gap-3">
      <button
        type="button"
        className="btn btn-ghost min-h-[50px] flex-1"
        onClick={() => {
          haptic(4);
          setResult(null);
        }}
        data-testid="improve-undo"
      >
        Undo
      </button>
      <button
        type="button"
        className="btn btn-primary min-h-[50px] flex-1"
        disabled={!result.changes.length}
        onClick={() => {
          haptic(8);
          onKeep(result);
        }}
        data-testid="improve-keep"
      >
        Keep
      </button>
    </div>
  ) : (
    <button
      type="button"
      className="btn btn-primary min-h-[50px] w-full"
      onClick={() => void improve()}
      disabled={busy}
      data-testid="improve-run"
    >
      {busy ? (
        <>
          <LoaderCircle size={18} className="animate-spin" aria-hidden /> Improving…
        </>
      ) : (
        <>
          <Sparkles size={18} aria-hidden /> Improve automatically
        </>
      )}
    </button>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Benchmark"
      trailing="Done"
      testId="benchmark-sheet"
      detents={["large"]}
      footer={footer}
    >
      <div role="status" aria-live="polite" className="sr-only">
        {busy ? "Improving the set" : result ? "Improvement ready" : ""}
      </div>
      {error && (
        <p className="text-footnote px-4 pt-2 text-[var(--destructive)]" role="alert">
          {error}
        </p>
      )}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: reduced ? 0 : 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DUR.base, ease: EASE.out }}
        >
          <Group
            header="Improved"
            footer="A change is kept only when neither the engine score nor the benchmark falls. Keep replaces tonight's set (Export and the booth use it); Undo leaves it as it was."
          >
            <div className="cell flex-col items-start gap-1 py-3">
              <span className="text-headline tabular-nums" data-testid="improve-summary">
                Engine {result.before.score} → {result.after.score} · Benchmark{" "}
                {benchLabel(result.before).replace(" in range", "")} →{" "}
                {benchLabel(result.after).replace(" in range", "")}
              </span>
              <span className="text-footnote text-[var(--label-2)]">
                {result.changes.length
                  ? `${result.changes.length} ${result.changes.length === 1 ? "change" : "changes"}`
                  : "Nothing to change: every fix would lower the engine score or the benchmark."}
              </span>
            </div>
            {result.changes.map((c) => (
              <div
                key={`${c.kind}-${c.tanda}-${c.text}`}
                className="cell text-subhead py-3"
                data-testid="improve-change"
              >
                {c.text}
              </div>
            ))}
          </Group>
        </motion.div>
      )}
      {shown && (
        <Group
          header={`Against published DJ sets · ${benchLabel(shown)}`}
          footer="Eleven published nights (Charlotte, Missoula, London, Hamburg, Istanbul and more) and DJ guidance from Victor Tran, Michael Lavocah and Demirbaş. Ranges, not targets."
        >
          {shown.checks.map((c) => (
            <div
              key={c.key}
              className="cell flex-col items-stretch gap-1 py-3"
              data-testid="bench-check"
              data-key={c.key}
              data-status={c.status}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: c.info ? "var(--label-3)" : DOT[c.status].color }}
                  role="img"
                  aria-label={c.info ? "Note" : DOT[c.status].word}
                />
                <span className="min-w-0 flex-1">{c.label}</span>
                <span className="cell-value text-subhead max-w-[55%] text-right tabular-nums">{c.value}</span>
              </div>
              <span className="text-footnote pl-5 text-[var(--label-2)]">Reference: {c.range}</span>
              <span className="text-caption1 pl-5 text-[var(--label-3)]">{c.source}</span>
            </div>
          ))}
        </Group>
      )}
      {shown?.strict && (
        <Group
          header={`Strict panel · ${shown.strict.blockers} blockers · ${shown.strict.shouldFix} should-fix`}
          footer="The round-14 strict panel: a milonguera, a purist encuentro DJ and a discographer. Every rule runs on every night the engine composes or improves; a blocker means the night is not played as it is."
        >
          {shown.strict.rules
            .filter((r) => r.applies)
            .map((r) => (
              <div
                key={r.key}
                className="cell flex-col items-stretch gap-1 py-3"
                data-testid="strict-rule"
                data-key={r.key}
                data-status={r.pass ? "ok" : r.severity === "blocker" ? "off" : "near"}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                      background: r.pass
                        ? "var(--system-green)"
                        : r.severity === "blocker"
                          ? "var(--destructive)"
                          : "var(--system-gold)",
                    }}
                    role="img"
                    aria-label={r.pass ? "Pass" : r.severity === "blocker" ? "Blocker" : "Should fix"}
                  />
                  <span className="min-w-0 flex-1">{r.label}</span>
                  <span className="cell-value text-subhead text-right tabular-nums">
                    {r.pass ? "pass" : `${r.violations.length} × ${r.severity}`}
                  </span>
                </div>
                {!r.pass && (
                  <span className="text-footnote pl-5 text-[var(--label-2)]">
                    {r.violations
                      .slice(0, 2)
                      .map((v) => v.detail)
                      .join(" · ")}
                  </span>
                )}
                <span className="text-caption1 pl-5 text-[var(--label-3)]">{r.source}</span>
              </div>
            ))}
        </Group>
      )}
    </Sheet>
  );
}
