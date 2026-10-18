"use client";
import { Clock3, Dices, Loader2, MessageSquareText, Share2, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import type { ComposeOptions, Playlist } from "@/lib/types";
import { EnergyCurve } from "./EnergyCurve";
import { ExportSheet } from "./ExportSheet";
import { TandaCard } from "./TandaCard";
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
const ARCS: Array<[ComposeOptions["arc"], string]> = [
  ["classic-two-peaks", "Classic · two peaks"],
  ["single-peak", "Single peak"],
  ["marathon-plateau", "Marathon plateau"],
  ["gentle", "Gentle"],
];
const SHAPES: Array<[ComposeOptions["tandaShape"], string]> = [
  ["rise-settle", "Slow → up → settle"],
  ["hammock", "Hammock (BsAs)"],
  ["rise", "Rising"],
  ["peak-middle", "Peak in middle"],
  ["flat", "Flat"],
];

export function Composer() {
  const { options, setOptions, playlist, setPlaylist, busy, setBusy, settings } = useStore();
  const [exportOpen, setExportOpen] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [swapping, setSwapping] = useState<number | null>(null);
  const [ai, setAi] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
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
  const hours = options.hours ?? 4;
  const tandasEst = useMemo(() => Math.round(hours * 5.2), [hours]);
  const toggleCulture = (c: string) => {
    const cur = options.cortinaCultures ?? ["global"];
    setOptions({
      cortinaCultures: cur.includes(c) ? (cur.length > 1 ? cur.filter((x) => x !== c) : cur) : [...cur, c],
    });
  };

  return (
    <div className="space-y-5">
      {/* Hero */}
      <section className="glass rise relative overflow-hidden p-5 sm:p-8">
        <div className="flex flex-col-reverse items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <h1 className="font-serif text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Compose a milonga, tanda by tanda.
            </h1>
            <p className="text-muted mt-3 text-sm sm:text-base">
              Pick an era and the length of the night. TDJ builds coherent tandas (one orchestra, one singer,
              tight years), shapes the energy from warm-up to peaks to La Cumparsita, and matches each cortina
              to what comes next.
            </p>
          </div>
          <div className="shrink-0 self-center sm:self-auto">
            <Vinyl size={140} playing={busy} />
          </div>
        </div>
      </section>

      {/* Controls */}
      <section className="glass rise p-4 sm:p-6" aria-label="Composer controls">
        <div className="grid gap-5 md:grid-cols-2 [&>*]:min-w-0">
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
            <div className="text-muted mt-1 flex justify-between text-[11px]">
              <span>1 h práctica</span>
              <span>4 h milonga</span>
              <span>8 h marathon</span>
            </div>
          </div>
          <div>
            <div className="text-sm font-medium">Era</div>
            <div className="scroll-x mt-2 flex gap-2 pb-1">
              {ERAS.map(([k, label]) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => setOptions({ eras: [k] })}
                  className={`chip ${(options.eras ?? ["golden"])[0] === k ? "chip-on" : ""}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-sm font-medium">Night arc</div>
            <div className="scroll-x mt-2 flex gap-2 pb-1">
              {ARCS.map(([k, l]) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => setOptions({ arc: k })}
                  className={`chip ${options.arc === k ? "chip-on" : ""}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="mt-3 text-sm font-medium">Shape inside each tanda</div>
            <div className="scroll-x mt-2 flex gap-2 pb-1">
              {SHAPES.map(([k, l]) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => setOptions({ tandaShape: k })}
                  className={`chip ${options.tandaShape === k ? "chip-on" : ""}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-sm font-medium">Cortinas</div>
            <div className="scroll-x mt-2 flex gap-2 pb-1">
              {(["matched", "constant", "none"] as const).map((k) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => setOptions({ cortinaStyle: k })}
                  className={`chip ${options.cortinaStyle === k ? "chip-on" : ""}`}
                >
                  {k === "matched"
                    ? "Matched to next tanda"
                    : k === "constant"
                      ? "Same all night"
                      : "No cortinas"}
                </button>
              ))}
              {(["mixed", "trend", "classic"] as const).map((k) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => setOptions({ cortinaTrend: k })}
                  className={`chip ${options.cortinaTrend === k ? "chip-on" : ""}`}
                >
                  {k === "trend" ? "Trend songs" : k === "classic" ? "Classics" : "Mix"}
                </button>
              ))}
            </div>
            <div className="scroll-x mt-2 flex gap-2 pb-1">
              {CULTURES.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => toggleCulture(c)}
                  className={`chip capitalize ${(options.cortinaCultures ?? ["global"]).includes(c) ? "chip-on" : ""}`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={options.closeWithCumparsita ?? true}
                  onChange={(e) => setOptions({ closeWithCumparsita: e.target.checked })}
                />{" "}
                Close with La Cumparsita
              </label>
              <label className="flex items-center gap-2">
                Cortina{" "}
                <input
                  type="number"
                  min={20}
                  max={90}
                  value={options.cortinaLengthSec ?? 45}
                  onChange={(e) => setOptions({ cortinaLengthSec: Number(e.target.value) })}
                  className="w-16 rounded-lg border border-white/30 bg-white/20 px-2 py-1 text-sm"
                />{" "}
                s
              </label>
            </div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => run()}
            disabled={busy}
            className="btn btn-primary flex-1 sm:flex-none"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />} Compose the night
          </button>
          {playlist && (
            <button
              type="button"
              onClick={() => run(playlist.options.seed)}
              className="btn btn-ghost"
              title="Recompose with the same seed"
            >
              <Dices size={16} /> Same seed
            </button>
          )}
          {playlist && (
            <button type="button" onClick={() => setExportOpen(true)} className="btn btn-ghost">
              <Share2 size={16} /> Export
            </button>
          )}
        </div>
      </section>

      {hydrated && playlist && (
        <section id="result" className="space-y-4 scroll-mt-24">
          <div className="glass rise p-4 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{playlist.name}</h2>
                <p className="text-muted text-sm">
                  {(playlist.stats.durationSec / 3600).toFixed(2)} h · {playlist.tandas.length} tandas ·{" "}
                  {playlist.stats.tracks} tracks · {Object.keys(playlist.stats.orchestras).length} orchestras
                  · seed {playlist.options.seed}
                </p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-semibold tabular-nums">
                  {playlist.score.total}
                  <span className="text-muted text-base">/100</span>
                </div>
                <div className="text-muted text-xs">{playlist.score.verdict}</div>
              </div>
            </div>
            <div className="mt-3">
              <EnergyCurve
                p={playlist}
                onPick={(i) => {
                  setActive(i);
                  document
                    .getElementById(`tanda-${i + 1}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                active={active}
              />
            </div>
            <details className="mt-2 text-sm">
              <summary className="text-muted cursor-pointer">Benchmark breakdown</summary>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {playlist.score.factors.map((f) => (
                  <li
                    key={f.key}
                    className="flex justify-between gap-2 rounded-lg bg-white/10 px-2 py-1 text-xs dark:bg-white/5"
                  >
                    <span className="truncate">{f.label}</span>
                    <span className="tabular-nums">
                      {Math.round(f.score * 100)}% <span className="text-muted">w{f.weight}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </details>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={explain} disabled={aiBusy} className="btn btn-ghost text-sm">
                {aiBusy ? <Loader2 size={15} className="animate-spin" /> : <MessageSquareText size={15} />}{" "}
                Ask the AI DJ to review
              </button>
            </div>
            {ai && (
              <div className="mt-3 whitespace-pre-wrap rounded-2xl bg-white/15 p-4 text-sm leading-relaxed dark:bg-white/5">
                {ai}
              </div>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
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
            <div className="glass flex items-center gap-3 p-4">
              <Wand2 size={18} className="text-rose-400" />
              <div>
                <div className="text-xs uppercase tracking-wider text-muted">Closing</div>
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
