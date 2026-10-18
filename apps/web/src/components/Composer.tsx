"use client";
import {
  Check,
  ChevronDown,
  Clock3,
  Copy,
  Dices,
  Disc3,
  LoaderCircle,
  MessageSquareText,
  Share2,
} from "lucide-react";
import { MotionConfig } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import type { ComposeOptions, Playlist } from "@/lib/types";
import { EnergyCurve } from "./EnergyCurve";
import { ExportSheet } from "./ExportSheet";
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
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return `${h} h ${String(m).padStart(2, "0")} min`;
}

export function Composer() {
  const { options, setOptions, playlist, setPlaylist, busy, setBusy, settings } = useStore();
  const [exportOpen, setExportOpen] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [swapping, setSwapping] = useState<number | null>(null);
  const [ai, setAi] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const run = async (seed?: number) => {
    setBusy(true);
    setAi(null);
    try {
      const r = await fetch("/api/compose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...options, seed: seed ?? Math.floor(Math.random() * 1e9) }),
      });
      const p = (await r.json()) as Playlist;
      setPlaylist(p);
      setActive(null);
      requestAnimationFrame(() =>
        document.getElementById("result")?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    } finally {
      setBusy(false);
    }
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
      setPlaylist(await r.json());
    } finally {
      setSwapping(null);
    }
  };
  const lock = (i: number) => {
    if (!playlist) return;
    setPlaylist({
      ...playlist,
      tandas: playlist.tandas.map((t, k) => (k === i ? { ...t, locked: !t.locked } : t)),
    });
  };
  const explain = async () => {
    if (!playlist) return;
    setAiBusy(true);
    try {
      const r = await fetch("/api/ai/explain", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-anthropic-key": settings.anthropicApiKey,
          "x-anthropic-model": settings.anthropicModel,
        },
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

  return (
    <MotionConfig reducedMotion="user">
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
            <Vinyl playing={busy} className="w-[72px] shrink-0 sm:w-[140px]" />
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
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => run()}
              disabled={busy}
              className="btn btn-primary hidden sm:inline-flex"
            >
              {busy ? <LoaderCircle size={18} className="animate-spin" /> : <Disc3 size={18} />} Compose the
              night
            </button>
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
          </div>
          <div role="status" aria-live="polite" className="sr-only">
            {busy
              ? "Composing the night…"
              : hasPlaylist && playlist
                ? `Set ready: ${playlist.tandas.length} tandas.`
                : ""}
          </div>
        </section>

        {/* Sticky compose bar (phones only): the primary action within thumb reach */}
        <div className="glass fixed inset-x-3 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+66px)] z-30 flex items-center gap-2 p-2 sm:hidden">
          <button type="button" onClick={() => run()} disabled={busy} className="btn btn-primary flex-1">
            {busy ? <LoaderCircle size={18} className="animate-spin" /> : <Disc3 size={18} />} Compose the
            night
          </button>
          {hasPlaylist && (
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              className="icon-btn"
              aria-label="Export"
            >
              <Share2 size={18} />
            </button>
          )}
        </div>

        {hasPlaylist && playlist && (
          <section id="result" className="space-y-4 scroll-mt-24" aria-busy={busy}>
            <div className="surface rise p-5 sm:p-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
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
                    {playlist.score.total}
                    <span className="text-muted text-base">/100</span>
                  </div>
                  <div className="text-muted text-xs">{playlist.score.verdict}</div>
                </div>
              </div>
              <div className="mt-4">
                <div className="sm:hidden">
                  <EnergyCurve
                    compact
                    p={playlist}
                    active={active}
                    onPick={(i) => {
                      setActive(i);
                      document
                        .getElementById(`tanda-${i + 1}`)
                        ?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }}
                  />
                </div>
                <div className="hidden sm:block">
                  <EnergyCurve
                    p={playlist}
                    active={active}
                    onPick={(i) => {
                      setActive(i);
                      document
                        .getElementById(`tanda-${i + 1}`)
                        ?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }}
                  />
                </div>
              </div>
              <details className="group mt-3 text-sm">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
                  How this set scored
                </summary>
                <ul className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {playlist.score.factors.map((f) => (
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
                        <div
                          className="h-full rounded-full bg-[rgb(var(--text)/.6)]"
                          style={{ width: `${Math.round(f.score * 100)}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
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
                {ai && !aiBusy && (
                  <div className="mt-3 rounded-xl bg-[rgb(var(--text)/.05)] p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Review</h3>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{ai}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {playlist.tandas.map((t, i) => (
                <TandaCard
                  key={`${t.index}-${t.songs[0]?.id}`}
                  t={t}
                  i={i}
                  onSwap={() => swap(i)}
                  onLock={() => lock(i)}
                  busy={swapping === i}
                  active={active === i}
                />
              ))}
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
    </MotionConfig>
  );
}
