"use client";
import { addNote, applyMemory, ERA_SETTINGS, rememberFeedback, rememberSet } from "@tdj/core";
import {
  Copy,
  Disc3,
  LoaderCircle,
  MessageSquareText,
  Pin,
  PinOff,
  Repeat2,
  Share,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { autoSetName, changedTandas, describeOptionChanges } from "@/lib/changes";
import { FEEDBACK_CHIPS } from "@/lib/feedback";
import { haptic } from "@/lib/haptics";
import { makeSnapshot } from "@/lib/history";
import { testSlowdownMs, useMediaQuery, useScrollDirection } from "@/lib/hooks";
import { describePreferences } from "@/lib/memory";
import { DUR, EASE, rise, STAGGER } from "@/lib/motion";
import {
  changedKeys,
  DEFAULT_OPTS,
  explicitKeys,
  fullOptions,
  optionsForRequest,
  overridesForRequest,
  useStore,
} from "@/lib/store";
import { toast } from "@/lib/toast";
import type {
  AppOptions,
  ComposeContext,
  ComposeOptions,
  Feedback,
  HistorySnapshot,
  Meta,
  NightRules,
  Playlist,
} from "@/lib/types";
import { ComposeLabel, ComposeNarrative } from "./ComposeNarrative";
import { ContextStrip } from "./ContextStrip";
import { EnergyCurve } from "./EnergyCurve";
import { ExportSheet } from "./ExportSheet";
import { FeedbackBar } from "./FeedbackBar";
import {
  ActionRow,
  FieldRow,
  Group,
  MultiPickerRow,
  PickerRow,
  RhythmTile,
  Row,
  SegmentedRow,
  SliderRow,
  StepperRow,
  SwitchRow,
} from "./Form";
import { MoodCheck } from "./Listen";
import { Menu } from "./Menu";
import { PageHeader } from "./PageHeader";
import { ScoreCounter } from "./ScoreCounter";
import { Sheet } from "./Sheet";
import { TandaCard } from "./TandaCard";
import { Vinyl } from "./Vinyl";

type Era = ComposeOptions["eras"][number];
const ERAS: Array<[Era, string]> = [
  ["golden", "Golden Age 35–55"],
  ["golden-extended", "Golden Age, extended (1932–60)"],
  ["guardia-vieja", "Guardia Vieja"],
  ["post-golden", "Post-golden 56–69"],
  ["nuevo", "Nuevo"],
  ["contemporary", "Contemporary"],
  ["all", "All eras"],
];
const CULTURES: Array<[string, string]> = [
  ["global", "Global"],
  ["latin", "Latin"],
  ["french", "French"],
  ["italian", "Italian"],
  ["brazilian", "Brazilian"],
  ["turkish", "Turkish"],
  ["greek", "Greek"],
  ["persian", "Persian"],
  ["balkan", "Balkan"],
  ["arabic", "Arabic"],
  ["kpop", "K-pop"],
  ["afrobeats", "Afrobeats"],
];
const ARCS: Array<[ComposeOptions["arc"], string]> = [
  ["classic-two-peaks", "Two peaks"],
  ["single-peak", "Single peak"],
  ["marathon-plateau", "Marathon"],
  ["gentle", "Gentle"],
];
const SHAPES: Array<[ComposeOptions["tandaShape"], string]> = [
  ["rise-settle", "Slow, up, settle"],
  ["hammock", "Hammock (Buenos Aires)"],
  ["rise", "Rising"],
  ["peak-middle", "Peak in the middle"],
  ["flat", "Flat"],
];
const PATTERNS: Array<[ComposeOptions["pattern"], string]> = [
  ["classic", "Classic TTVTTM"],
  ["TTVTTM-strict", "Strict TTVTTM"],
  ["TVTM", "TVTM"],
  ["TMTV", "TMTV"],
  ["tango-only", "Tango only"],
  ["custom", "Custom"],
];
const CORTINA_STYLES: Array<[ComposeOptions["cortinaStyle"], string]> = [
  ["family", "Family"],
  ["matched", "Matched"],
  ["constant", "Same"],
  ["none", "None"],
];
const CORTINA_TRENDS: Array<[NonNullable<ComposeOptions["cortinaTrend"]>, string]> = [
  ["mixed", "Mix"],
  ["trend", "Current hits"],
  ["classic", "Classics"],
];
const ULTIMA: Array<[NonNullable<NightRules["ultimaRule"]>, string]> = [
  ["emotional-vocal", "Emotional vocal"],
  ["d-arienzo-rhythmic", "D'Arienzo rhythmic"],
  ["pugliese", "Pugliese"],
  ["any", "Any"],
];
const OPENER: Array<[NonNullable<NightRules["openerRule"]>, string]> = [
  ["canon", "Canon (Di Sarli, Fresedo…)"],
  ["lyrical", "Lyrical"],
  ["rhythmic", "Rhythmic"],
  ["any", "Any"],
];
const CUMPARSITAS: Array<["1" | "2", string]> = [
  ["1", "One (Europe)"],
  ["2", "Two (Buenos Aires)"],
];
/** Era-preset keys the user can pin so an era change leaves them alone. */
const ERA_KEYS = [
  "pattern",
  "tangoTandaSize",
  "valsTandaSize",
  "milongaTandaSize",
  "tandaShape",
  "maxYearSpread",
  "cortinaStyle",
  "cortinaLengthSec",
  "orchestraRepeatGap",
  "mixVocalInstrumental",
] as const;

function fmtDuration(sec: number) {
  const total = Math.round(sec / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h} h ${String(m).padStart(2, "0")} min`;
}

/** Pin glyph: keeps a control through era changes. */
function PinButton({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`icon-btn icon-btn-bare -my-2 h-11 w-9 ${on ? "text-[var(--tint)]" : "text-[var(--label-3)]"}`}
      aria-pressed={on}
      aria-label={`${on ? "Unpin" : "Pin"} ${label.toLowerCase()}`}
      title={on ? "Pinned: era presets leave this alone" : "Pin so era presets leave this alone"}
      onClick={(e) => {
        e.preventDefault();
        haptic(4);
        onToggle();
      }}
    >
      {on ? <Pin size={15} strokeWidth={2} fill="currentColor" /> : <PinOff size={15} strokeWidth={2} />}
    </button>
  );
}

export function Composer() {
  const {
    options,
    setOptions,
    presetOptions,
    replaceOptions,
    playlist,
    setPlaylist,
    busy,
    setBusy,
    settings,
    overrides,
    overridesReady,
    memory,
    updateMemory,
    addSnapshot,
  } = useStore();
  const [exportOpen, setExportOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [moodOpen, setMoodOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [swapping, setSwapping] = useState<number | null>(null);
  const [swappingTrack, setSwappingTrack] = useState<[number, number] | null>(null);
  const [ai, setAi] = useState<string | null>(null);
  const [aiError, setAiError] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  /** "what changed" after a chip / refine: replaced tandas and the score move */
  const [changeSummary, setChangeSummary] = useState<string | null>(null);
  /** the form stays folded under a summary row while a set exists; Edit opens it */
  const [setupOpen, setSetupOpen] = useState(false);
  const [changedSet, setChangedSet] = useState<Set<number>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eraNote, setEraNote] = useState<string | null>(null);
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
  const minimised = useScrollDirection();
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
  const era: Era = (options.eras ?? ["golden"])[0] ?? "golden";
  const eraDefaults = ERA_SETTINGS[era] ?? ERA_SETTINGS.golden!;
  const pinned = options.pinned ?? [];
  const isPinned = (k: string) => pinned.includes(k);
  const togglePin = (k: string) =>
    setOptions({ pinned: isPinned(k) ? pinned.filter((x) => x !== k) : [...pinned, k] });
  /** Night rules as the engine will see them: era defaults under the user's choices. */
  const rules: NightRules = useMemo(
    () => ({ ...eraDefaults.rules, ...(options.rules ?? {}) }),
    [eraDefaults, options.rules],
  );
  const setRules = (patch: Partial<NightRules>) => setOptions({ rules: { ...rules, ...patch } });

  /** Era change: apply the era's defaults to every unpinned control, keep the rest, and say so. */
  const applyEra = (next: Era, force = false) => {
    const d = ERA_SETTINGS[next] ?? ERA_SETTINGS.golden!;
    const { notes, rules: eraRules, ...defaults } = d;
    const patch: Partial<AppOptions> = { eras: [next] };
    for (const k of ERA_KEYS) {
      if (!force && isPinned(k)) continue;
      (patch as Record<string, unknown>)[k] = (defaults as Record<string, unknown>)[k];
      if (k === "pattern") patch.customPattern = defaults.customPattern;
    }
    patch.rules = { ...(options.rules ?? {}), ...eraRules };
    // the era itself is the DJ's choice; the preset values are not explicit
    setOptions({ eras: [next] });
    const { eras: _e, ...preset } = patch;
    presetOptions(preset);
    setEraNote(`Era defaults applied: ${notes}`);
  };

  /** What the DJ set tonight: touched or pinned controls (era presets and defaults are not explicit). */
  const explicit = explicitKeys(options);
  const learnedPrefs = settings.learn ? describePreferences(memory) : [];
  const prefKeys = Object.keys(memory.preferences ?? {}).filter((k) => !explicit.includes(k));
  const usingMemory = settings.learn && learnedPrefs.length > 0 && prefKeys.length > 0;
  /**
   * The request from the state at call time: only explicit keys travel, learned preferences fill the keys that are
   * neither explicit nor just changed by a chip / refine (`extraExplicit`), and `recent` always rides along.
   */
  const requestOptions = (o: AppOptions, extraExplicit: string[] = []) => {
    const cur = useStore.getState();
    const merged: AppOptions = {
      ...o,
      pinned: cur.options.pinned,
      touched: [...new Set([...(cur.options.touched ?? []), ...extraExplicit])],
    };
    const base = optionsForRequest(merged);
    const { recent } = applyMemory({}, cur.memory);
    const withMemory = cur.settings.learn ? applyMemory(base, cur.memory) : { ...base, recent };
    const name = base.name ?? autoSetName({ ...DEFAULT_OPTS, ...eraDefaults, ...fullOptions(merged) });
    return { ...withMemory, name, explicit: base.explicit };
  };

  /** Compose with the current (or given) options; locked tandas are sent so they survive every recompose. */
  const run = async (
    seed?: number,
    opts?: Partial<ComposeOptions>,
    extraExplicit: string[] = [],
    source: HistorySnapshot["source"] = "compose",
  ) => {
    setBusy(true);
    setAi(null);
    setError(null);
    const o = requestOptions(opts ?? useStore.getState().options, extraExplicit);
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
      setSetupOpen(false);
      updateMemory((m) => rememberSet(m, p));
      addSnapshot(makeSnapshot(p, fullOptions(useStore.getState().options), source));
      if (morph && playlist) {
        const changed = changedTandas(playlist, p);
        setChangeSummary(
          `${changed.length ? `${changed.length} ${changed.length === 1 ? "tanda" : "tandas"} replaced (${changed.slice(0, 8).join(", ")}${changed.length > 8 ? "…" : ""})` : "No tanda changed"} · score ${playlist.score.total} → ${p.score.total}`,
        );
        setChangedSet(new Set(changed));
      } else {
        setChangeSummary(null);
        setChangedSet(new Set());
      }
      haptic([8, 40, 8]);
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
        const p = (await r.json()) as Playlist;
        setPlaylist(p);
        addSnapshot(makeSnapshot(p, fullOptions(useStore.getState().options), "swap"));
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
        addSnapshot(makeSnapshot(j, fullOptions(useStore.getState().options), "swap"));
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
  /** A chip never leaves a custom cycle empty, and every structural change it makes is said out loud. */
  const settleOptions = (prev: Partial<ComposeOptions>, next: Partial<ComposeOptions>) => {
    const out = { ...next };
    if (out.pattern === "custom" && !out.customPattern) out.customPattern = prev.customPattern || "TTVTTM";
    return out;
  };
  const feedback = async (f: Feedback) => {
    setNote(null);
    setPendingChip(f);
    setBusy(true);
    try {
      const prev = fullOptions({ ...DEFAULT_OPTS, ...eraDefaults, ...useStore.getState().options });
      const r = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ options: prev, feedback: [f] }),
      });
      const j = (await r.json()) as { options: Partial<ComposeOptions> };
      if (!r.ok) return;
      if (settings.learn && playlist) updateMemory((m) => rememberFeedback(m, playlist.id, [f]));
      const next = settleOptions(prev, j.options);
      const changes = describeOptionChanges(prev, next);
      const chipLabel = FEEDBACK_CHIPS.find(([k]) => k === f)?.[1] ?? f;
      const line = changes.length
        ? `${chipLabel}: ${changes.join(" · ")}`
        : `${chipLabel}: nothing to change in the settings; recomposing with a new seed`;
      setNote(line);
      toast(line);
      const changed = changedKeys(prev, next);
      replaceOptions(next, changed);
      await run(undefined, next, changed, "refine");
    } finally {
      setPendingChip(null);
      setBusy(false);
    }
  };
  const refine = async (instruction: string) => {
    setNote(null);
    setBusy(true);
    try {
      const prev = fullOptions({ ...DEFAULT_OPTS, ...eraDefaults, ...useStore.getState().options });
      const r = await fetch("/api/ai/refine", {
        method: "POST",
        headers: aiHeaders(),
        body: JSON.stringify({
          options: prev,
          playlist,
          instruction,
          memory,
          houseRules: overrides.guide?.houseRules ?? "",
        }),
      });
      const j = (await r.json()) as {
        options?: Partial<ComposeOptions>;
        feedback?: Feedback[];
        note?: string;
        error?: string;
        source?: string;
      };
      if (!r.ok || !j.options) {
        setNote(j.error ?? "Could not read that request.");
        return;
      }
      const next = settleOptions(prev, j.options);
      const changes = describeOptionChanges(prev, next);
      setNote([j.note, changes.length ? `Changed: ${changes.join(" · ")}.` : null].filter(Boolean).join(" "));
      if (settings.learn && playlist)
        updateMemory((m) => {
          let nm = rememberFeedback(m, playlist.id, j.feedback ?? [], instruction);
          if (j.source === "model" && j.note) nm = addNote(nm, j.note, "assistant");
          return nm;
        });
      const changed = changedKeys(prev, next);
      replaceOptions(next, changed);
      await run(undefined, next, changed, "refine");
    } finally {
      setBusy(false);
    }
  };
  const explain = async () => {
    if (!playlist) return;
    setReviewOpen(true);
    if (ai || aiBusy) return;
    setAiBusy(true);
    try {
      const r = await fetch("/api/ai/review", {
        method: "POST",
        headers: aiHeaders(),
        body: JSON.stringify({ playlist, memory, houseRules: overrides.guide?.houseRules ?? "" }),
      });
      const j = await r.json();
      setAi(j.text ?? j.error);
      setAiError(!r.ok);
    } finally {
      setAiBusy(false);
    }
  };
  const copySeed = async () => {
    if (!playlist) return;
    try {
      await navigator.clipboard.writeText(String(playlist.options.seed));
      setNote(`Seed ${playlist.options.seed} copied.`);
    } catch {
      setNote(`Seed ${playlist.options.seed}.`);
    }
  };
  const rate = (liked: boolean) => {
    if (!playlist) return;
    haptic(6);
    updateMemory((m) => rememberSet(m, playlist, liked));
  };
  const liked = memory.sets.find((s) => s.id === playlist?.id)?.liked;

  // ⌘↩ composes, ⌘E exports
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "Enter" && !busy) {
        e.preventDefault();
        run();
      }
      if ((e.key === "e" || e.key === "E") && playlist) {
        e.preventDefault();
        setExportOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const hours = options.hours ?? 4;
  const tandasEst = useMemo(() => Math.round(hours * 5.2), [hours]);
  const cultures = options.cortinaCultures ?? ["global"];
  const hasPlaylist = hydrated && !!playlist;
  const chosenContext = Object.entries(options.context ?? {}).filter(
    ([k, v]) => !!v && k !== "region",
  ).length;
  const cortinaStyle = options.cortinaStyle ?? "family";
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
  const breakAfter = new Map((playlist?.breaks ?? []).map((b) => [b.afterTanda, b]));
  const resultFooter = playlist
    ? [
        fmtDuration(playlist.stats.durationSec),
        `${playlist.tandas.length} tandas`,
        `${Object.keys(playlist.stats.orchestras).length} orchestras`,
        lockedCount
          ? `${lockedCount} locked ${lockedCount === 1 ? "tanda stays" : "tandas stay"} on recompose`
          : null,
        dbChanges ? "using your database edits" : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  const composeButton = (
    <motion.button
      type="button"
      onClick={() => run()}
      disabled={busy}
      className="btn btn-primary min-h-[44px] lg:min-h-[40px] lg:px-4 lg:text-subhead"
      animate={errorNudge}
      transition={{ duration: 0.28, ease: EASE.inOut }}
    >
      <ComposeLabel busy={busy} />
    </motion.button>
  );

  return (
    <div>
      <PageHeader
        title="Compose"
        subtitle={!hasPlaylist ? "Era, length and room; TDJ builds the tandas and the arc." : undefined}
        trailing={
          <>
            {hasPlaylist && (
              <button
                type="button"
                className="icon-btn"
                aria-label="Export"
                onClick={() => setExportOpen(true)}
              >
                <Share size={20} strokeWidth={1.75} />
              </button>
            )}
            {hasPlaylist && playlist && (
              <Menu
                label="More"
                items={[
                  {
                    label: "Recompose with same seed",
                    icon: Repeat2,
                    onClick: () => run(playlist.options.seed),
                    disabled: busy,
                  },
                  { label: "Copy seed", icon: Copy, onClick: copySeed },
                  { label: "Written review", icon: MessageSquareText, onClick: explain },
                ]}
              />
            )}
          </>
        }
        primary={composeButton}
      />

      {hasPlaylist && playlist && (
        <section id="result" className="scroll-mt-24" aria-busy={busy}>
          <Group header="Tonight's set" footer={resultFooter}>
            <motion.div
              key={`head-${setKey}`}
              initial={fresh ? { opacity: 0, y: reduced ? 0 : 6 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DUR.base, ease: EASE.out, delay: 0.04 }}
              className="cell flex-col items-stretch gap-2 py-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-subhead min-w-0 truncate font-serif text-[var(--label-2)]">
                  {playlist.name}
                </h2>
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    className={`icon-btn icon-btn-bare -my-2 h-11 w-10 ${liked === true ? "text-[var(--tint)]" : "text-[var(--label-3)]"}`}
                    aria-pressed={liked === true}
                    aria-label="Mark as liked"
                    onClick={() => rate(true)}
                  >
                    <ThumbsUp size={18} strokeWidth={2} fill={liked === true ? "currentColor" : "none"} />
                  </button>
                  <button
                    type="button"
                    className={`icon-btn icon-btn-bare -my-2 -mr-3 h-11 w-10 ${liked === false ? "text-[var(--tint)]" : "text-[var(--label-3)]"}`}
                    aria-pressed={liked === false}
                    aria-label="Mark as disliked"
                    onClick={() => rate(false)}
                  >
                    <ThumbsDown size={18} strokeWidth={2} fill={liked === false ? "currentColor" : "none"} />
                  </button>
                </span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-large-title tabular-nums text-[var(--tint)]">
                  <ScoreCounter key={setKey} value={playlist.score.total} from={scoreFrom} />
                </span>
                <span className="text-title3 text-[var(--label-2)]">/100</span>
              </div>
              <motion.p
                key={`verdict-text-${setKey}`}
                initial={fresh ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={{ delay: reduced ? 0 : 0.7, duration: DUR.base }}
                className="text-footnote text-[var(--label-2)]"
              >
                {playlist.score.verdict}
              </motion.p>
              <div className="mt-1">
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
            </motion.div>
            <Row
              label="How this set scored"
              value={`${playlist.score.factors.length} factors`}
              chevron
              onClick={() => setScoreOpen(true)}
            />
            {playlists.some((p) => p.kind === "tandas") && (
              <Row
                label="Mood check"
                sub="Your set next to Aren León's reference tandas"
                chevron
                onClick={() => setMoodOpen(true)}
              />
            )}
            <Row
              label="Written review"
              value={aiBusy ? "Reading the set…" : ai ? "Ready" : undefined}
              chevron
              busy={aiBusy}
              onClick={explain}
            />
          </Group>

          <FeedbackBar
            onFeedback={feedback}
            onRefine={refine}
            busy={busy}
            note={note}
            pending={pendingChip}
            lockedCount={lockedCount}
            changeSummary={changeSummary}
          />

          {playlist.opening && (
            <Group
              header="Opening"
              footer="La Cumparsita before the first tanda, as some Buenos Aires and festival nights open."
            >
              <div className="cell" data-leading="art" data-testid="opening">
                <span className="tile-art" data-rhythm="tango" aria-hidden>
                  <Disc3 size={20} strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-headline block truncate">La Cumparsita</span>
                  <span className="text-subhead block truncate text-[var(--label-2)]">
                    {playlist.opening.orchestra}
                    {playlist.opening.singer ? ` · ${playlist.opening.singer}` : ""} ·{" "}
                    {playlist.opening.year ?? "?"}
                  </span>
                </span>
              </div>
            </Group>
          )}

          <h2 className="section-head">Tandas</h2>
          <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 md:items-start md:gap-4">
            <AnimatePresence mode="popLayout" initial={false}>
              {playlist.tandas.flatMap((t, i) => {
                const b = breakAfter.get(i);
                const card = (
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
                    changed={changedSet.has(i + 1)}
                  />
                );
                if (!b) return [card];
                return [
                  card,
                  <motion.div
                    key={`break-${i}`}
                    layout={reduced ? false : "position"}
                    className="text-footnote flex items-center gap-3 px-4 text-[var(--label-2)] md:col-span-2"
                    data-testid="break"
                  >
                    <span className="h-px flex-1 bg-[var(--separator)]" aria-hidden />
                    {b.label} · {b.minutes} min
                    <span className="h-px flex-1 bg-[var(--separator)]" aria-hidden />
                  </motion.div>,
                ];
              })}
            </AnimatePresence>
          </div>
          {playlist.closing && (
            <Group header="Closing">
              <div className="cell" data-leading="art">
                <span className="tile-art" data-rhythm="tango" aria-hidden>
                  <Disc3 size={20} strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-headline block truncate">La Cumparsita</span>
                  <span className="text-subhead block truncate text-[var(--label-2)]">
                    {playlist.closing.orchestra} · {playlist.closing.year ?? "?"}
                  </span>
                </span>
              </div>
            </Group>
          )}
        </section>
      )}
      {/* once a set exists the result leads and the form folds into one summary row (UX review P1-1) */}
      {hasPlaylist && !setupOpen && (
        <Group header="Set-up" id="setup-summary">
          <Row
            tile={<RhythmTile rhythm="tango" />}
            label={`${ERAS.find(([k]) => k === era)?.[1] ?? era} · ${hours} h · ${ARCS.find(([k]) => k === (options.arc ?? "classic-two-peaks"))?.[1] ?? ""}`}
            sub={`${PATTERNS.find(([k]) => k === (options.pattern ?? "classic"))?.[1] ?? ""} · cortinas ${(CORTINA_STYLES.find(([k]) => k === cortinaStyle)?.[1] ?? "").toLowerCase()}${chosenContext ? ` · ${chosenContext} tonight` : ""}`}
            value="Edit"
            chevron
            onClick={() => setSetupOpen(true)}
          />
        </Group>
      )}
      <div className={hasPlaylist && !setupOpen ? "hidden" : "lg:grid lg:grid-cols-2 lg:gap-x-6"} id="setup">
        <Group
          header="Night"
          footer={eraNote ?? "Guide: 2 h práctica · 4 h milonga · 6 h marathon block."}
          id="night"
        >
          <SliderRow
            id="hours"
            label="Length"
            display={`${hours} h · ≈${tandasEst} tandas`}
            min={1}
            max={8}
            step={0.5}
            value={hours}
            onChange={(v) => setOptions({ hours: v })}
          />
          <PickerRow
            label="Era"
            ariaLabel="Era"
            value={era}
            items={ERAS}
            onChange={(k) => k && applyEra(k)}
          />
          <SegmentedRow
            label="Arc"
            value={options.arc ?? "classic-two-peaks"}
            items={ARCS}
            onChange={(k) => setOptions({ arc: k })}
          />
          <PickerRow
            label="Tanda shape"
            ariaLabel="Tanda shape"
            value={options.tandaShape ?? eraDefaults.tandaShape}
            items={SHAPES}
            onChange={(k) => k && setOptions({ tandaShape: k })}
          >
            <PinButton on={isPinned("tandaShape")} label="Shape" onToggle={() => togglePin("tandaShape")} />
          </PickerRow>
          <SwitchRow
            label="Close with La Cumparsita"
            checked={options.closeWithCumparsita ?? true}
            onChange={(v) => setOptions({ closeWithCumparsita: v })}
          />
        </Group>

        <Group
          header="Structure"
          footer="Sizes are in tracks; gap in tandas; spread in years. The era preset sets these; pin a control to keep your own value when the era changes."
          id="structure"
        >
          <PickerRow
            label="Cycle"
            ariaLabel="Cycle"
            value={options.pattern ?? "classic"}
            items={PATTERNS}
            onChange={(k) => k && setOptions({ pattern: k })}
          >
            <PinButton on={isPinned("pattern")} label="Cycle" onToggle={() => togglePin("pattern")} />
          </PickerRow>
          {options.pattern === "custom" && (
            <FieldRow label="Custom cycle" id="custom-pattern">
              <input
                id="custom-pattern"
                className="field field-value min-w-0 flex-1 font-mono uppercase"
                value={options.customPattern ?? ""}
                placeholder="TTVTTM"
                onChange={(e) =>
                  setOptions({ customPattern: e.target.value.toUpperCase().replace(/[^TVM]/g, "") })
                }
                autoComplete="off"
                spellCheck={false}
              />
            </FieldRow>
          )}
          <StepperRow
            label="Tango tanda"
            value={options.tangoTandaSize ?? 4}
            unit=" tracks"
            min={3}
            max={5}
            step={1}
            onChange={(v) => setOptions({ tangoTandaSize: v as 3 | 4 | 5 })}
          >
            <PinButton
              on={isPinned("tangoTandaSize")}
              label="Tango tanda size"
              onToggle={() => togglePin("tangoTandaSize")}
            />
          </StepperRow>
          <StepperRow
            label="Vals tanda"
            value={options.valsTandaSize ?? 3}
            unit=" tracks"
            min={3}
            max={4}
            step={1}
            onChange={(v) => setOptions({ valsTandaSize: v as 3 | 4 })}
          >
            <PinButton
              on={isPinned("valsTandaSize")}
              label="Vals tanda size"
              onToggle={() => togglePin("valsTandaSize")}
            />
          </StepperRow>
          <StepperRow
            label="Milonga tanda"
            value={options.milongaTandaSize ?? 3}
            unit=" tracks"
            min={3}
            max={4}
            step={1}
            onChange={(v) => setOptions({ milongaTandaSize: v as 3 | 4 })}
          >
            <PinButton
              on={isPinned("milongaTandaSize")}
              label="Milonga tanda size"
              onToggle={() => togglePin("milongaTandaSize")}
            />
          </StepperRow>
          <StepperRow
            label="Orchestra repeat gap"
            value={options.orchestraRepeatGap ?? 6}
            unit=" tandas"
            min={1}
            max={12}
            step={1}
            onChange={(v) => setOptions({ orchestraRepeatGap: v })}
          >
            <PinButton
              on={isPinned("orchestraRepeatGap")}
              label="Repeat gap"
              onToggle={() => togglePin("orchestraRepeatGap")}
            />
          </StepperRow>
          <StepperRow
            label="Year spread"
            value={options.maxYearSpread ?? 4}
            unit=" y"
            min={1}
            max={15}
            step={1}
            onChange={(v) => setOptions({ maxYearSpread: v })}
          >
            <PinButton
              on={isPinned("maxYearSpread")}
              label="Year spread"
              onToggle={() => togglePin("maxYearSpread")}
            />
          </StepperRow>
          <ActionRow label="Reset to era defaults" onClick={() => applyEra(era, true)} />
        </Group>

        <Group
          header="Cortinas"
          footer={
            cortinaStyle === "none"
              ? "Tandas follow each other without a break."
              : cortinaStyle === "family"
                ? "Family: one artist or genre family all night, each cortina about 8 energy points under the tanda that follows."
                : cortinaStyle === "constant"
                  ? "Same: one cortina track repeated all night, the traditional salón way."
                  : "Matched: each cortina is picked for the tanda that follows, about 8 energy points under it."
          }
          id="cortinas"
        >
          <SegmentedRow
            label="Style"
            value={cortinaStyle}
            items={CORTINA_STYLES}
            onChange={(k) => setOptions({ cortinaStyle: k })}
          >
            <PinButton
              on={isPinned("cortinaStyle")}
              label="Cortina style"
              onToggle={() => togglePin("cortinaStyle")}
            />
          </SegmentedRow>
          {cortinaStyle !== "none" && (
            <>
              <SegmentedRow
                label="Flavour"
                value={options.cortinaTrend ?? "mixed"}
                items={CORTINA_TRENDS}
                onChange={(k) => setOptions({ cortinaTrend: k })}
              />
              <MultiPickerRow
                label="Cultures"
                values={cultures}
                items={CULTURES}
                min={1}
                onChange={(v) => setOptions({ cortinaCultures: v.length ? v : ["global"] })}
                footer="At least one culture stays chosen."
              />
              <StepperRow
                label="Length"
                value={options.cortinaLengthSec ?? 45}
                unit=" s"
                min={20}
                max={90}
                step={5}
                onChange={(v) => setOptions({ cortinaLengthSec: v })}
              >
                <PinButton
                  on={isPinned("cortinaLengthSec")}
                  label="Cortina length"
                  onToggle={() => togglePin("cortinaLengthSec")}
                />
              </StepperRow>
            </>
          )}
        </Group>

        <Group
          header="Night rules"
          footer="Defaults follow the era. These travel with every compose, feedback and refine."
          id="night-rules"
        >
          <SwitchRow
            label="Open with La Cumparsita"
            sub="Some Buenos Aires and festival openings"
            checked={!!rules.openWithCumparsita}
            onChange={(v) => setRules({ openWithCumparsita: v })}
          />
          <SegmentedRow
            label="Closing Cumparsitas"
            value={String(rules.cumparsitaCount ?? 1) as "1" | "2"}
            items={CUMPARSITAS}
            onChange={(k) => setRules({ cumparsitaCount: Number(k) as 1 | 2 })}
          />
          <SwitchRow
            label="Birthday vals"
            sub="A vals tanda reserved for the birthday dance"
            checked={rules.birthdayValsAt != null}
            onChange={(v) => setRules({ birthdayValsAt: v ? 0.6 : null })}
          />
          {rules.birthdayValsAt != null && (
            <SliderRow
              label="Birthday vals position"
              display={`${Math.round(rules.birthdayValsAt * 100)} % of the night`}
              min={10}
              max={90}
              step={5}
              value={Math.round(rules.birthdayValsAt * 100)}
              onChange={(v) => setRules({ birthdayValsAt: v / 100 })}
            />
          )}
          <SwitchRow
            label="Show or break"
            sub="A gap without cortina; energy re-ramps after it"
            checked={rules.showBreakAt != null}
            onChange={(v) =>
              setRules({ showBreakAt: v ? 0.5 : null, showBreakMinutes: rules.showBreakMinutes ?? 20 })
            }
          />
          {rules.showBreakAt != null && (
            <>
              <SliderRow
                label="Break position"
                display={`${Math.round(rules.showBreakAt * 100)} % of the night`}
                min={10}
                max={90}
                step={5}
                value={Math.round(rules.showBreakAt * 100)}
                onChange={(v) => setRules({ showBreakAt: v / 100 })}
              />
              <StepperRow
                label="Break length"
                value={rules.showBreakMinutes ?? 20}
                unit=" min"
                min={5}
                max={60}
                step={5}
                onChange={(v) => setRules({ showBreakMinutes: v })}
              />
            </>
          )}
          <PickerRow
            label="Última tanda"
            sub="The last tanda before La Cumparsita"
            ariaLabel="Última tanda"
            value={rules.ultimaRule ?? "emotional-vocal"}
            items={ULTIMA}
            onChange={(k) => k && setRules({ ultimaRule: k })}
          />
          <PickerRow
            label="Opener"
            ariaLabel="Opener"
            value={rules.openerRule ?? "canon"}
            items={OPENER}
            onChange={(k) => k && setRules({ openerRule: k })}
          />
          <SwitchRow
            label="Pugliese once"
            sub="At most one Pugliese tanda, late"
            checked={rules.puglieseOnce ?? true}
            onChange={(v) => setRules({ puglieseOnce: v })}
          />
          <SwitchRow
            label="Colour tanda"
            sub="One foxtrot, Pirincho milonga or Hugo Díaz tanda"
            checked={!!rules.colourTanda}
            onChange={(v) => setRules({ colourTanda: v })}
          />
          <SwitchRow
            label="Mixed milonga and vals tandas"
            sub="Allow more than one orchestra inside them"
            checked={!!rules.mixedMilongaVals}
            onChange={(v) => setRules({ mixedMilongaVals: v })}
          />
          <SwitchRow
            label="Cortina before La Cumparsita"
            checked={!!rules.cortinaBeforeCumparsita}
            onChange={(v) => setRules({ cortinaBeforeCumparsita: v })}
          />
        </Group>

        <div className="md:col-span-2">
          <ContextStrip
            value={(options.context ?? {}) as ComposeContext}
            onChange={(context) => setOptions({ context })}
            model={meta?.contextModel ?? null}
            applied={playlist?.options ?? null}
            regionFromSettings={
              !explicit.includes("context") ||
              Object.keys(options.context ?? {}).filter((k) => k !== "region").length === 0
            }
          />
        </div>
      </div>

      {(usingMemory || dbChanges) && (
        <p className="section-foot mt-3" data-testid="using-memory">
          {usingMemory && `Using what you taught me: ${learnedPrefs.join(", ")}.`}
          {usingMemory && dbChanges ? " " : ""}
          {dbChanges && "Using your database edits."}
        </p>
      )}

      <div
        role="status"
        aria-live="polite"
        className={error ? "section-foot mt-3 text-[var(--destructive)]" : "sr-only"}
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

      <ComposeNarrative busy={busy} className="mx-auto mt-6 hidden sm:flex" />

      {hydrated && !playlist && !busy && (
        <div className="hidden flex-col items-center gap-3 py-12 text-center sm:flex">
          <Vinyl playing={false} className="w-[120px]" />
          <p className="text-title3 font-serif">Compose a milonga, tanda by tanda.</p>
          <p className="text-subhead max-w-md text-[var(--label-2)]">
            Pick an era and a length. TDJ builds coherent tandas, shapes the night from warm-up to La
            Cumparsita, and picks each cortina to fit what follows.
          </p>
        </div>
      )}

      {/* Phone accessory bar: the primary action within thumb reach; it carries the narrative; hides with the tab bar */}
      <div
        className="glass fixed inset-x-3 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+68px)] z-30 flex items-center gap-2 rounded-full p-1.5 sm:hidden"
        data-min={minimised || undefined}
        style={{
          transition: "transform var(--dur-s) var(--ease-settle), opacity var(--dur-s) var(--ease-settle)",
          transform: minimised ? "translateY(calc(100% + 80px))" : "none",
          opacity: minimised ? 0 : 1,
        }}
      >
        <motion.button
          type="button"
          onClick={() => run()}
          disabled={busy}
          className="btn btn-primary min-h-[50px] flex-1"
          animate={errorNudge}
          transition={{ duration: 0.28, ease: EASE.inOut }}
        >
          <ComposeLabel busy={busy} steps />
        </motion.button>
        {hasPlaylist && (
          <button type="button" onClick={() => setExportOpen(true)} className="icon-btn" aria-label="Export">
            <Share size={20} strokeWidth={1.75} />
          </button>
        )}
      </div>

      <ExportSheet open={exportOpen} onClose={() => setExportOpen(false)} />

      {playlist && (
        <Sheet
          open={scoreOpen}
          onClose={() => setScoreOpen(false)}
          title="How this set scored"
          trailing="Done"
        >
          <Group footer="Weights add up to the total; 85 or more is headline marathon DJ territory.">
            {playlist.score.factors.map((f, idx) => (
              <div key={f.key} className="cell flex-col items-stretch gap-1.5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{f.label.replace(/\s*\(.*\)\s*$/, "")}</span>
                    {/\(.*\)/.test(f.label) && (
                      <span className="text-footnote block truncate text-[var(--label-2)]">
                        {f.label.match(/\((.*)\)/)?.[1]}
                      </span>
                    )}
                  </span>
                  <span className="cell-value tabular-nums">
                    {Math.round(f.score * 100)} %{" "}
                    <span className="text-[var(--label-2)]">· weight {f.weight}</span>
                  </span>
                </div>
                <div
                  className="h-1 overflow-hidden rounded-full bg-[var(--fill-3)]"
                  role="img"
                  aria-label={`${f.label}: ${Math.round(f.score * 100)} percent`}
                >
                  <motion.div
                    className="h-full w-full origin-left rounded-full bg-[var(--tint)]"
                    initial={{ scaleX: reduced ? f.score : 0 }}
                    animate={{ scaleX: f.score }}
                    transition={{
                      duration: DUR.slow,
                      ease: EASE.out,
                      delay: reduced ? 0 : 0.08 + idx * STAGGER.bars,
                    }}
                  />
                </div>
                {f.detail && <span className="text-footnote text-[var(--label-2)]">{f.detail}</span>}
              </div>
            ))}
          </Group>
        </Sheet>
      )}
      <Sheet open={moodOpen} onClose={() => setMoodOpen(false)} title="Mood check" trailing="Done">
        <MoodCheck playlists={playlists} playlist={playlist} />
      </Sheet>
      <Sheet
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title="Written review"
        trailing={aiError ? "OK" : "Done"}
        hideCancel={aiError}
      >
        <div role="status" aria-live="polite" className="mt-2">
          {aiBusy && (
            <p className="text-subhead flex items-center gap-2 px-4 text-[var(--label-2)]">
              <LoaderCircle size={16} className="animate-spin" /> Reading the set…
            </p>
          )}
          {ai && !aiBusy && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: DUR.base }}
              className="text-body whitespace-pre-wrap px-4"
            >
              {ai}
              {aiError && /key/i.test(ai) && (
                <>
                  {" "}
                  <Link href="/settings" className="text-[var(--tint)]">
                    Open Settings
                  </Link>
                </>
              )}
            </motion.p>
          )}
        </div>
      </Sheet>
    </div>
  );
}
