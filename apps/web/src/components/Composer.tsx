"use client";
import { Check, Clock3, Copy, Dices, Disc3, LoaderCircle, MessageSquareText, Share2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";
import { testSlowdownMs, useMediaQuery } from "@/lib/hooks";
import { DUR, EASE, fade, rise, STAGGER } from "@/lib/motion";
import { overridesForRequest, useStore } from "@/lib/store";
import type { ComposeContext, ComposeOptions, Feedback, Meta, Playlist } from "@/lib/types";
import { ComposeLabel, ComposeNarrative } from "./ComposeNarrative";
import { ContextStrip } from "./ContextStrip";
import { Disclosure } from "./Disclosure";
import { EnergyCurve } from "./EnergyCurve";
import { ExportSheet } from "./ExportSheet";
import { FeedbackBar } from "./FeedbackBar";
import { MoodCheck } from "./Listen";
import { ScoreCounter } from "./ScoreCounter";
import { TandaCard } from "./TandaCard";
import { Field, Segmented, Stepper, Switch } from "./ui";
import { Vinyl } from "./Vinyl";

const ERAS: Array<[ComposeOptions["eras"][number], string]> = [
  ["golden", "Golden Age 35–55"],
  ["golden-extended", "Golden ext. 32–60"],
  ["guardia-vieja", "Guardia Vieja"],
  ["post-golden", "Post-golden 56–69"],
  ["nuevo", "Nuevo"],
  ["contemporary", "Contemporary"],
  ["all", "All eras"],
];
const CULTURES = [
  "global",
  "latin",
  "french",
  "italian",
  "brazilian",
  "turkish",
  "greek",
  "persian",
  "balkan",
  "arabic",
  "kpop",
  "afrobeats",
];
const CULTURE_LABEL: Record<string, string> = {
  global: "Global",
  latin: "Latin",
  french: "French",
  italian: "Italian",
  brazilian: "Brazilian",
  turkish: "Turkish",
  greek: "Greek",
  persian: "Persian",
  balkan: "Balkan",
  arabic: "Arabic",
  kpop: "K-pop",
  afrobeats: "Afrobeats",
};
const ARCS: Array<[ComposeOptions["arc"], string]> = [
  ["classic-two-peaks", "Two peaks"],
  ["single-peak", "Single peak"],
  ["marathon-plateau", "Marathon"],
  ["gentle", "Gentle"],
];
const SHAPES: Array<[ComposeOptions["tandaShape"], string]> = [
  ["rise-settle", "Slow → up → settle"],
  ["hammock", "Hammock (BsAs)"],
  ["rise", "Rising"],
  ["peak-middle", "Peak in middle"],
  ["flat", "Flat"],
];
const CORTINA_STYLES: Array<[ComposeOptions["cortinaStyle"], string]> = [
  ["matched", "Matched to next tanda"],
  ["constant", "Same all night"],
  ["none", "None"],
];
const CORTINA_TRENDS: Array<[NonNullable<ComposeOptions["cortinaTrend"]>, string]> = [
  ["mixed", "Mix"],
  ["trend", "Current hits"],
  ["classic", "Classics"],
];

function fmtDuration(sec: number) {
  const total = Math.round(sec / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h} h ${String(m).padStart(2, "0")} min`;
}

export function Composer() {
  const {
    options,
    setOptions,
    replaceOptions,
    playlist,
    setPlaylist,
    busy,
    setBusy,
    settings,
    overrides,
    overridesReady,
  } = useStore();
  const [exportOpen, setExportOpen] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [swapping, setSwapping] = useState<number | null>(null);
  const [swappingTrack, setSwappingTrack] = useState<[number, number] | null>(null);
  const [ai, setAi] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [pendingChip, setPendingChip] = useState<Feedback | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  const [nudge, setNudge] = useState<{ i: number; k: number; n: number } | null>(null);
  /** the score before the last recompose, so the counter runs old → new instead of 0 → new */
  const prevScore = useRef<number | null>(null);
  /** energy per tanda before the last swap/recompose (keyed by index) */
  const prevEnergy = useRef<Record<number, number>>({});
  /**
   * `key` changes on a fresh set (Compose pressed, or a recompose that changed the tanda count) and drives the
   * full reveal (score 0 → n, curve draw-on, card stagger). `fresh` is true for the commit that mounts it only.
   * Feedback / "Tell the DJ" with the same tanda count keep the key: the curve morphs and the score counts on.
   */
  const [reveal, setReveal] = useState<{ key: string; fresh: boolean }>({ key: "", fresh: false });
  useEffect(() => {
    if (reveal.fresh) setReveal((r) => ({ ...r, fresh: false }));
  }, [reveal]);
  const reduced = useReducedMotion();
  const wide = useMediaQuery("(min-width: 640px)", true);
  useEffect(() => setHydrated(true), []);
  useEffect(() => {
    fetch("/api/meta")
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => {});
  }, []);
  // Tonight's region defaults to the one in Settings
  const region = settings.region;
  useEffect(() => {
    if (!hydrated) return;
    const ctx = useStore.getState().options.context;
    if (!ctx?.region) setOptions({ context: { ...(ctx ?? {}), region } });
  }, [hydrated, region, setOptions]);

  const aiHeaders = () => ({
    "content-type": "application/json",
    "x-ai-provider": settings.ai.provider,
    "x-ai-key": settings.ai.key,
    "x-ai-model": settings.ai.model,
  });

  /** Compose with the current (or given) options; locked tandas are sent so they survive every recompose. */
  const run = async (seed?: number, opts?: Partial<ComposeOptions>) => {
    setBusy(true);
    setAi(null);
    setError(null);
    const o = opts ?? options;
    const first = !playlist;
    try {
      const slow = testSlowdownMs();
      if (slow) await new Promise((res) => setTimeout(res, slow));
      const r = await fetch("/api/compose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...o,
          seed: seed ?? Math.floor(Math.random() * 1e9),
          locked: playlist?.tandas.filter((t) => t.locked) ?? [],
          overrides: overridesForRequest(overrides),
        }),
      });
      const p = (await r.json()) as Playlist & { error?: string };
      if (!r.ok || p.error) {
        setError(p.error ?? "Could not compose this set.");
        setErrorKey((k) => k + 1);
        haptic([20, 30, 20]);
        return;
      }
      remember(playlist);
      const morph = !!opts && !!playlist && p.tandas.length === playlist.tandas.length;
      if (!morph) setReveal({ key: String(p.options.seed), fresh: true });
      setPlaylist(p);
      setActive(null);
      haptic([10, 40, 10]);
      // the result scrolls into view on the first set only; on a recompose the user is already looking at it
      if (first)
        requestAnimationFrame(() =>
          document.getElementById("result")?.scrollIntoView({ behavior: "smooth", block: "start" }),
        );
    } catch {
      setError("Could not reach the composer. Try again.");
      setErrorKey((k) => k + 1);
      haptic([20, 30, 20]);
    } finally {
      setBusy(false);
    }
  };
  /** Keep the previous score/energies so counters run from the old value. */
  const remember = (prev: Playlist | null) => {
    prevScore.current = prev?.score.total ?? null;
    prevEnergy.current = Object.fromEntries((prev?.tandas ?? []).map((t, i) => [i, t.energy]));
  };
  const swap = async (i: number) => {
    if (!playlist) return;
    setSwapping(i);
    try {
      const r = await fetch("/api/swap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playlist, index: i }),
      });
      if (r.ok) {
        remember(playlist);
        setPlaylist(await r.json());
      }
    } finally {
      setSwapping(null);
    }
  };
  const swapTrack = async (i: number, k: number) => {
    if (!playlist) return;
    setSwappingTrack([i, k]);
    setNote(null);
    try {
      const r = await fetch("/api/swap-track", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playlist, tandaIndex: i, trackIndex: k }),
      });
      const j = (await r.json()) as Playlist & { changed?: boolean };
      if (r.ok && j.changed) {
        remember(playlist);
        setPlaylist(j);
      } else {
        setNote(`No other ${playlist.tandas[i]?.orchestra} recording fits that slot.`);
        setNudge((n) => ({ i, k, n: (n?.n ?? 0) + 1 }));
      }
    } finally {
      setSwappingTrack(null);
    }
  };
  const lock = (i: number) => {
    if (!playlist) return;
    setPlaylist({
      ...playlist,
      tandas: playlist.tandas.map((t, k) => (k === i ? { ...t, locked: !t.locked } : t)),
    });
  };
  const feedback = async (f: Feedback) => {
    setNote(null);
    setPendingChip(f);
    setBusy(true);
    try {
      const r = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ options, feedback: [f] }),
      });
      const j = (await r.json()) as { options: Partial<ComposeOptions> };
      if (!r.ok) return;
      replaceOptions(j.options);
      await run(undefined, j.options);
    } finally {
      setPendingChip(null);
      setBusy(false);
    }
  };
  const refine = async (instruction: string) => {
    setNote(null);
    setBusy(true);
    try {
      const r = await fetch("/api/ai/refine", {
        method: "POST",
        headers: aiHeaders(),
        body: JSON.stringify({ options, playlist, instruction }),
      });
      const j = (await r.json()) as { options?: Partial<ComposeOptions>; note?: string; error?: string };
      if (!r.ok || !j.options) {
        setNote(j.error ?? "Could not read that request.");
        return;
      }
      setNote(j.note ?? null);
      replaceOptions(j.options);
      await run(undefined, j.options);
    } finally {
      setBusy(false);
    }
  };
  const explain = async () => {
    if (!playlist) return;
    setAiBusy(true);
    try {
      const r = await fetch("/api/ai/review", {
        method: "POST",
        headers: aiHeaders(),
        body: JSON.stringify({ playlist }),
      });
      const j = await r.json();
      setAi(j.text ?? j.error);
    } finally {
      setAiBusy(false);
    }
  };
  const copySeed = async () => {
    if (!playlist) return;
    try {
      await navigator.clipboard.writeText(String(playlist.options.seed));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable: the seed is still visible on the chip */
    }
  };
  const hours = options.hours ?? 4;
  const tandasEst = useMemo(() => Math.round(hours * 5.2), [hours]);
  const cultures = options.cortinaCultures ?? ["global"];
  const toggleCulture = (c: string) => {
    setOptions({
      cortinaCultures: cultures.includes(c)
        ? cultures.length > 1
          ? cultures.filter((x) => x !== c)
          : cultures
        : [...cultures, c],
    });
  };
  const hasPlaylist = hydrated && !!playlist;
  const cortinaStyle = options.cortinaStyle ?? "matched";
  const lockedCount = playlist?.tandas.filter((t) => t.locked).length ?? 0;
  const playlists = meta?.referencePlaylists ?? [];
  const dbChanges = overridesReady && Object.keys(overrides).some((k) => k !== "updatedAt");
  // a restored playlist (localStorage) has no reveal key yet: adopt it without animating
  const setKey = reveal.key || (playlist ? String(playlist.options.seed) : "");
  const fresh = reveal.fresh;
  const scoreFrom = fresh ? 0 : (prevScore.current ?? playlist?.score.total ?? 0);
  const errorNudge = useMemo(
    () => (errorKey && !reduced ? { x: [0, -4, 4, -2, 0] } : { x: 0 }),
    [errorKey, reduced],
  );
  const onPick = (i: number) => {
    setActive(i);
    document.getElementById(`tanda-${i + 1}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="space-y-4">
      {/* Hero: compact on phones, hidden there once a set exists */}
      <section
        className={`surface relative overflow-hidden p-5 sm:p-6 ${hasPlaylist ? "hidden sm:block" : ""}`}
      >
        <div className="flex items-center gap-4 sm:justify-between sm:gap-6">
          <div className="min-w-0 max-w-xl">
            <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-balance sm:text-5xl">
              Compose a milonga, tanda by tanda.
            </h1>
            <p className="text-muted mt-2 text-sm text-pretty sm:mt-3 sm:text-base">
              Pick an era and a length. TDJ builds coherent tandas, shapes the night from warm-up to La
              Cumparsita, and picks each cortina to fit what follows.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <ComposeNarrative busy={busy} className="hidden sm:flex" />
            <Vinyl playing={busy} className="w-[72px] shrink-0 sm:w-[140px]" />
          </div>
        </div>
      </section>

      {/* Controls */}
      <section className="surface p-5 sm:p-6" aria-label="Composer controls">
        <div className="grid gap-6 md:grid-cols-[1.1fr_1fr] [&>*]:min-w-0">
          <div className="space-y-5">
            <div>
              <label className="flex items-center justify-between text-sm font-medium" htmlFor="hours">
                <span className="flex items-center gap-2">
                  <Clock3 size={16} /> Length of the night
                </span>
                <span className="tabular-nums">
                  {hours} h · ≈{tandasEst} tandas
                </span>
              </label>
              <input
                id="hours"
                type="range"
                min={1}
                max={8}
                step={0.5}
                value={hours}
                onChange={(e) => setOptions({ hours: Number(e.target.value) })}
                className="mt-2 w-full"
              />
              <div className="text-muted mt-1 flex justify-between text-xs">
                <span>1 h práctica</span>
                <span>4 h milonga</span>
                <span>8 h marathon</span>
              </div>
            </div>
            <Field label="Era">
              <div className="chip-row scroll-x">
                {ERAS.map(([k, label]) => {
                  const on = (options.eras ?? ["golden"])[0] === k;
                  return (
                    <button
                      type="button"
                      key={k}
                      aria-pressed={on}
                      onClick={() => setOptions({ eras: [k] })}
                      className={`chip ${on ? "chip-on" : ""}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Night arc">
              <Segmented
                label="Night arc"
                value={options.arc ?? "classic-two-peaks"}
                onChange={(k) => setOptions({ arc: k })}
                items={ARCS}
              />
            </Field>
            <Field label="Shape inside each tanda">
              <Segmented
                label="Shape inside each tanda"
                chips
                value={options.tandaShape ?? "rise-settle"}
                onChange={(k) => setOptions({ tandaShape: k })}
                items={SHAPES}
              />
            </Field>
          </div>
          <div className="space-y-5">
            <Field label="Cortinas">
              <Segmented
                label="Cortinas"
                chips
                value={cortinaStyle}
                onChange={(k) => setOptions({ cortinaStyle: k })}
                items={CORTINA_STYLES}
              />
            </Field>
            {cortinaStyle !== "none" && (
              <>
                <Field label="Cortina flavour">
                  <Segmented
                    label="Cortina flavour"
                    value={options.cortinaTrend ?? "mixed"}
                    onChange={(k) => setOptions({ cortinaTrend: k })}
                    items={CORTINA_TRENDS}
                  />
                </Field>
                <Field label="Cultures" hint="Choose as many as you like">
                  <div className="chip-row scroll-x">
                    {CULTURES.map((c) => {
                      const on = cultures.includes(c);
                      return (
                        <button
                          type="button"
                          key={c}
                          aria-pressed={on}
                          onClick={() => toggleCulture(c)}
                          className={`chip ${on ? "chip-on" : ""}`}
                        >
                          {CULTURE_LABEL[c] ?? c}
                        </button>
                      );
                    })}
                  </div>
                </Field>
                <Field label="Cortina length">
                  <Stepper
                    label="Cortina length"
                    value={options.cortinaLengthSec ?? 45}
                    min={20}
                    max={90}
                    step={5}
                    unit=" s"
                    onChange={(v) => setOptions({ cortinaLengthSec: v })}
                  />
                </Field>
              </>
            )}
            <Switch
              checked={options.closeWithCumparsita ?? true}
              onChange={(v) => setOptions({ closeWithCumparsita: v })}
              label="Close with La Cumparsita"
            />
          </div>
        </div>
        <div className="mt-6 border-t border-[rgb(var(--text)/.08)] pt-5">
          <ContextStrip
            value={(options.context ?? {}) as ComposeContext}
            onChange={(context) => setOptions({ context })}
            model={meta?.contextModel ?? null}
          />
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <motion.button
            type="button"
            onClick={() => run()}
            disabled={busy}
            className="btn btn-primary hidden sm:inline-flex"
            animate={errorNudge}
            transition={{ duration: 0.28, ease: EASE.inOut }}
          >
            <ComposeLabel busy={busy} />
          </motion.button>
          {hasPlaylist && playlist && (
            <button
              type="button"
              onClick={() => run(playlist.options.seed)}
              disabled={busy}
              className="btn btn-ghost"
              title="Rebuild this exact set"
            >
              <Dices size={16} /> Recompose (same seed)
            </button>
          )}
          {hasPlaylist && (
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              className="btn btn-ghost hidden sm:inline-flex"
            >
              <Share2 size={16} /> Export
            </button>
          )}
          {lockedCount > 0 && (
            <span className="text-muted text-xs">
              {lockedCount} locked {lockedCount === 1 ? "tanda stays" : "tandas stay"} on recompose
            </span>
          )}
          {dbChanges && <span className="text-muted text-xs">Using your database edits</span>}
        </div>
        <div
          role="status"
          aria-live="polite"
          className={error ? "mt-2 text-sm text-[var(--accent)]" : "sr-only"}
          data-testid="compose-status"
        >
          <AnimatePresence mode="wait" initial={false}>
            {error && (
              <motion.span
                key={`${error}-${errorKey}`}
                variants={rise}
                initial="hidden"
                animate="show"
                className="block"
              >
                {error}
              </motion.span>
            )}
          </AnimatePresence>
          {!error &&
            (busy
              ? "Composing the night…"
              : hasPlaylist && playlist
                ? `Set ready: ${playlist.tandas.length} tandas.`
                : "")}
        </div>
      </section>

      {/* Sticky compose bar (phones only): the primary action within thumb reach; it carries the narrative */}
      <div className="glass fixed inset-x-3 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+66px)] z-30 flex items-center gap-2 p-2 sm:hidden">
        <motion.button
          type="button"
          onClick={() => run()}
          disabled={busy}
          className="btn btn-primary flex-1"
          animate={errorNudge}
          transition={{ duration: 0.28, ease: EASE.inOut }}
        >
          <ComposeLabel busy={busy} steps />
        </motion.button>
        {hasPlaylist && (
          <button type="button" onClick={() => setExportOpen(true)} className="icon-btn" aria-label="Export">
            <Share2 size={18} />
          </button>
        )}
      </div>

      {hasPlaylist && playlist && (
        <section id="result" className="space-y-4 scroll-mt-24" aria-busy={busy}>
          <div className="surface rise p-5 sm:p-6">
            <motion.div
              key={`head-${setKey}`}
              initial={fresh ? { opacity: 0, y: reduced ? 0 : 6 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DUR.base, ease: EASE.out, delay: 0.04 }}
              className="flex flex-wrap items-end justify-between gap-3"
            >
              <div className="min-w-0">
                <h2 className="font-serif text-2xl font-semibold leading-tight">{playlist.name}</h2>
                <dl className="text-muted mt-1 flex flex-wrap items-center gap-x-2 text-sm">
                  <div>
                    <dt className="sr-only">Length</dt>
                    <dd>{fmtDuration(playlist.stats.durationSec)}</dd>
                  </div>
                  <span aria-hidden>·</span>
                  <div>
                    <dt className="sr-only">Tandas</dt>
                    <dd>{playlist.tandas.length} tandas</dd>
                  </div>
                  <span aria-hidden>·</span>
                  <div>
                    <dt className="sr-only">Orchestras</dt>
                    <dd>{Object.keys(playlist.stats.orchestras).length} orchestras</dd>
                  </div>
                </dl>
              </div>
              <div className="text-right">
                <div className="text-3xl font-semibold tabular-nums">
                  <ScoreCounter key={setKey} value={playlist.score.total} playKey={setKey} from={scoreFrom} />
                  <motion.span
                    key={`verdict-${setKey}`}
                    initial={fresh ? { opacity: 0 } : false}
                    animate={{ opacity: 1 }}
                    transition={{ delay: reduced ? 0 : 0.7, duration: DUR.base }}
                    className="text-muted text-base"
                  >
                    /100
                  </motion.span>
                </div>
                <motion.div
                  key={`verdict-text-${setKey}`}
                  initial={fresh ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  transition={{ delay: reduced ? 0 : 0.7, duration: DUR.base }}
                  className="text-muted text-xs"
                >
                  {playlist.score.verdict}
                </motion.div>
              </div>
            </motion.div>
            <div className="mt-4">
              {/* one chart per breakpoint (not both hidden/shown via CSS) so only one draw-on runs */}
              {wide ? (
                <EnergyCurve p={playlist} active={active} onPick={onPick} playKey={setKey} dimmed={busy} />
              ) : (
                <EnergyCurve
                  compact
                  p={playlist}
                  active={active}
                  onPick={onPick}
                  playKey={setKey}
                  dimmed={busy}
                />
              )}
            </div>
            <Disclosure summary="How this set scored">
              <ul className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {playlist.score.factors.map((f, idx) => (
                  <li key={f.key} className="text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="truncate">{f.label}</span>
                      <span className="tabular-nums">
                        {Math.round(f.score * 100)}% <span className="text-muted">· weight {f.weight}</span>
                      </span>
                    </div>
                    <div
                      className="mt-1 h-1 overflow-hidden rounded-full bg-[rgb(var(--text)/.1)]"
                      role="img"
                      aria-label={`${f.label}: ${Math.round(f.score * 100)} percent`}
                    >
                      <motion.div
                        className="h-full w-full origin-left rounded-full bg-[rgb(var(--text)/.6)]"
                        initial={{ scaleX: reduced ? f.score : 0 }}
                        animate={{ scaleX: f.score }}
                        transition={{
                          duration: DUR.slow,
                          ease: EASE.out,
                          delay: reduced ? 0 : 0.08 + idx * STAGGER.bars,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Disclosure>
            {playlists.some((p) => p.kind === "tandas") && (
              <Disclosure
                className="mt-1"
                summary={
                  <>
                    Mood check
                    <span className="text-muted text-xs font-normal">
                      compare with Aren León's reference tandas
                    </span>
                  </>
                }
              >
                <div className="mt-3">
                  <MoodCheck playlists={playlists} />
                </div>
              </Disclosure>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={explain} disabled={aiBusy} className="btn btn-ghost text-sm">
                {aiBusy ? (
                  <LoaderCircle size={15} className="animate-spin" />
                ) : (
                  <MessageSquareText size={15} />
                )}{" "}
                Get a written review
              </button>
              <button
                type="button"
                onClick={copySeed}
                className="chip"
                title="Copy the seed to rebuild this set later"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />} Seed {playlist.options.seed}
              </button>
            </div>
            <div role="status" aria-live="polite">
              {aiBusy && <p className="text-muted mt-3 text-sm">Reading the set…</p>}
              {/* the DJ note appears as a single fade: no typewriter, no thinking dots */}
              {ai && !aiBusy && (
                <motion.div
                  variants={fade}
                  initial="hidden"
                  animate="show"
                  className="mt-3 rounded-xl bg-[rgb(var(--text)/.05)] p-4"
                >
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Review</h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{ai}</p>
                </motion.div>
              )}
            </div>
          </div>
          <FeedbackBar
            onFeedback={feedback}
            onRefine={refine}
            busy={busy}
            note={note}
            pending={pendingChip}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <AnimatePresence mode="popLayout" initial={false}>
              {playlist.tandas.map((t, i) => (
                <TandaCard
                  key={`${t.index}-${t.songs[0]?.id}`}
                  t={t}
                  i={i}
                  onSwap={() => swap(i)}
                  onSwapTrack={(k) => swapTrack(i, k)}
                  onLock={() => lock(i)}
                  busy={swapping === i}
                  swappingTrack={swappingTrack?.[0] === i ? swappingTrack[1] : null}
                  active={active === i}
                  playlists={playlists}
                  settling={busy}
                  fresh={fresh}
                  nudge={nudge?.i === i ? nudge : null}
                  prevEnergy={prevEnergy.current[i]}
                />
              ))}
            </AnimatePresence>
          </div>
          {playlist.closing && (
            <div className="surface flex items-center gap-3 p-4">
              <Disc3 size={18} className="tone-tango shrink-0" />
              <div>
                <div className="text-muted text-xs uppercase tracking-wider">Closing</div>
                <div className="font-semibold">
                  La Cumparsita — {playlist.closing.orchestra} ({playlist.closing.year ?? "?"})
                </div>
              </div>
            </div>
          )}
        </section>
      )}
      <ExportSheet open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
}
