"use client";
import { type Playlist, rememberEdit } from "@tdj/core";
import { ArrowUp, Check, Plus, Trash2, Wand2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  addSong,
  addTanda,
  type Draft,
  type DraftSong,
  draftIds,
  draftMinutes,
  isDraft,
  moveTanda,
  openTanda,
  removeSong,
  removeTanda,
} from "@/lib/build";
import { haptic } from "@/lib/haptics";
import { makeSnapshot } from "@/lib/history";
import { DUR, EASE } from "@/lib/motion";
import { fullOptions, useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { Group, RhythmTile, Row, SegmentedRow, SwitchRow } from "./Form";
import { PageHeader } from "./PageHeader";
import { SearchField } from "./SearchField";

interface Suggestion {
  key: string;
  kind: "tanda" | "song";
  rhythm: string;
  orchestra: string;
  singer: string | null;
  songs: DraftSong[];
  energy: number;
  years: [number, number] | null;
  reasons: string[];
}
interface Next {
  mode: "tanda" | "song";
  rhythm: string;
  slot: number;
  targetEnergy: number;
  suggestions: Suggestion[];
}
interface Hit {
  song: DraftSong;
  fits: boolean;
  why: string | null;
}

const KEY = "tdj-build-draft";
const loadDraft = (): Draft => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return isDraft(v) ? v : [];
  } catch {
    return [];
  }
};
const saveDraft = (d: Draft) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {}
};
const yearsText = (y: [number, number] | null) => (y ? (y[0] === y[1] ? `${y[0]}` : `${y[0]}–${y[1]}`) : "");
const family = (s: { orchestra: string; singer: string | null }) =>
  `${s.orchestra}${s.singer ? ` / ${s.singer}` : " · instrumental"}`;
const RHYTHM_ITEMS: Array<["auto" | "tango" | "vals" | "milonga", string]> = [
  ["auto", "Next in cycle"],
  ["tango", "Tango"],
  ["vals", "Vals"],
  ["milonga", "Milonga"],
];

/**
 * Round 22 — build a night by hand: pick songs or whole tandas; after each one TDJ suggests what comes next (the
 * rhythm cycle, the energy, orchestra spacing, the big four, the years, what you chose before), each with its reason.
 * Suggestions can be switched off. "Use this night" makes it the night on Compose (cortinas, score, booth, exports).
 */
export function ManualBuilder() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const { settings, setSettings, memory, setPlaylist, addSnapshot, updateMemory } = useStore();
  const [draft, setDraftState] = useState<Draft>([]);
  const [ready, setReady] = useState(false);
  const [next, setNext] = useState<Next | null>(null);
  const [loading, setLoading] = useState(false);
  const [rhythm, setRhythm] = useState<"auto" | "tango" | "vals" | "milonga">("auto");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const suggestOn = settings.buildSuggestions !== false;
  const opts = useStore((s) => s.options);
  const options = useMemo(() => fullOptions(opts), [opts]);
  const sizes = {
    tango: options.tangoTandaSize ?? 4,
    vals: options.valsTandaSize ?? 3,
    milonga: options.milongaTandaSize ?? 3,
  };

  useEffect(() => {
    setDraftState(loadDraft());
    setReady(true);
  }, []);
  const setDraft = (d: Draft) => {
    setDraftState(d);
    saveDraft(d);
  };

  // the live suggestions, again after every change
  const seq = useRef(0);
  useEffect(() => {
    if (!ready || !suggestOn) return;
    const n = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/build", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            draft: draftIds(draft),
            options,
            learned: settings.learn ? memory.learned : undefined,
            rhythm: rhythm === "auto" ? undefined : rhythm,
          }),
        });
        const j = (await r.json()) as { next?: Next };
        if (n === seq.current) setNext(j.next ?? null);
      } finally {
        if (n === seq.current) setLoading(false);
      }
    }, 120);
    return () => clearTimeout(t);
  }, [draft, ready, suggestOn, rhythm, options, settings.learn, memory.learned]);

  const qseq = useRef(0);
  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    const n = ++qseq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/build", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ draft: draftIds(draft), options, query, suggest: false }),
        });
        const j = (await r.json()) as { results?: Hit[] };
        if (n === qseq.current) setHits(j.results ?? []);
      } finally {
        if (n === qseq.current) setSearching(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query, draft, options]);

  const open = openTanda(draft, sizes);
  const pick = (s: Suggestion) => {
    haptic(6);
    setDraft(s.kind === "tanda" ? addTanda(draft, s.songs, sizes) : addSong(draft, s.songs[0]!, sizes));
  };
  const addHit = (h: Hit) => {
    haptic(6);
    setDraft(addSong(draft, h.song, sizes));
  };
  const finish = async () => {
    if (!draft.length) return;
    setFinishing(true);
    try {
      const r = await fetch("/api/build", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft: draftIds(draft), options, finish: true }),
      });
      const j = (await r.json()) as { playlist?: Playlist };
      if (!j.playlist) return;
      setPlaylist(j.playlist);
      addSnapshot(makeSnapshot(j.playlist, options, "compose"));
      // a hand-built night is the clearest statement of taste: its sides, families and tandas teach
      if (settings.learn)
        updateMemory((m) =>
          rememberEdit(m, { tandas: [], opening: null, closing: null }, j.playlist!, "built by hand"),
        );
      toast("Your night is on Compose");
      router.push("/");
    } finally {
      setFinishing(false);
    }
  };

  const minutes = draftMinutes(draft);
  const nextTitle = !next
    ? ""
    : next.mode === "song"
      ? `Next side of tanda ${draft.length}`
      : `Tanda ${next.slot + 1}: a ${next.rhythm} (the plan's energy here: ${next.targetEnergy})`;

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        title="Build by hand"
        subtitle={
          draft.length
            ? `${draft.length} ${draft.length === 1 ? "tanda" : "tandas"} · about ${minutes} min`
            : "Pick songs or whole tandas; TDJ suggests what comes next"
        }
        primary={
          <button
            type="button"
            className="btn btn-primary min-h-[44px]"
            onClick={finish}
            disabled={!draft.length || finishing}
            data-testid="build-finish"
            title="Make this the night on Compose: cortinas, score, the booth and the exports"
          >
            <Check size={18} aria-hidden /> Use this night
          </button>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-label="Your night" className="min-w-0">
          <h2 className="section-head">Your night</h2>
          {!draft.length && (
            <Group footer="Start with a suggestion or search for a song: TDJ keeps the tanda's orchestra and years together and tells you what fits next.">
              <Row label="Nothing yet" sub="Your first tanda goes here" />
            </Group>
          )}
          <AnimatePresence initial={false}>
            {draft.map((t, ti) => {
              const s0 = t[0]!;
              const isOpen = open === t;
              const ys = t.map((s) => s.year ?? 0).filter(Boolean);
              return (
                <motion.div
                  key={`${s0.id}-${ti}`}
                  layout={!reduced}
                  initial={{ opacity: 0, y: reduced ? 0 : 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: DUR.base, ease: EASE.out }}
                >
                  <Group
                    header={`Tanda ${ti + 1}${isOpen ? ` · ${t.length} of ${sizes[s0.rhythm as keyof typeof sizes] ?? 4}` : ""}`}
                    data-testid="build-tanda"
                  >
                    <div className="cell" data-leading="tile">
                      <RhythmTile rhythm={s0.rhythm} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{family(s0)}</span>
                        <span className="text-footnote block truncate text-[var(--label-2)]">
                          {s0.rhythm}
                          {ys.length
                            ? ` · ${Math.min(...ys)}${Math.max(...ys) !== Math.min(...ys) ? `–${Math.max(...ys)}` : ""}`
                            : ""}
                        </span>
                      </span>
                      {ti > 0 && (
                        <button
                          type="button"
                          className="icon-btn icon-btn-bare h-11 w-11"
                          onClick={() => setDraft(moveTanda(draft, ti, ti - 1))}
                          aria-label={`Move tanda ${ti + 1} up`}
                          title="Move up"
                        >
                          <ArrowUp size={16} aria-hidden />
                        </button>
                      )}
                      <button
                        type="button"
                        className="icon-btn icon-btn-bare -mr-2 h-11 w-11 text-[var(--destructive)]"
                        onClick={() => setDraft(removeTanda(draft, ti))}
                        aria-label={`Remove tanda ${ti + 1}`}
                        title="Remove this tanda"
                      >
                        <Trash2 size={16} aria-hidden />
                      </button>
                    </div>
                    {t.map((s, si) => (
                      <div key={s.id} className="cell" data-leading="num">
                        <span className="w-6 shrink-0 text-center tabular-nums text-[var(--label-2)]">
                          {si + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{s.title}</span>
                          <span className="text-footnote block truncate text-[var(--label-2)]">
                            {s.year ?? "?"}
                            {s.energy !== undefined ? ` · energy ${s.energy}` : ""}
                          </span>
                        </span>
                        <button
                          type="button"
                          className="icon-btn icon-btn-bare -mr-2 h-11 w-11 text-[var(--label-3)]"
                          onClick={() => setDraft(removeSong(draft, ti, si))}
                          aria-label={`Remove ${s.title}`}
                          title="Remove this side"
                        >
                          <Trash2 size={15} aria-hidden />
                        </button>
                      </div>
                    ))}
                  </Group>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </section>

        <section aria-label="What comes next" className="min-w-0">
          <h2 className="section-head">What comes next</h2>
          <Group
            footer={
              suggestOn
                ? "Ranked by the night's rules: the rhythm cycle, the energy against the arc and the last tandas, orchestra and singer spacing, the big four, the years of the last tanda, and what you chose before."
                : "Suggestions are off: pick freely; the night is still scored when you use it."
            }
          >
            <SwitchRow
              label="Suggestions"
              sub="Update after every song you add"
              checked={suggestOn}
              onChange={(v) => setSettings({ buildSuggestions: v })}
            />
            {suggestOn && (!next || next.mode === "tanda") && (
              <SegmentedRow label="Next tanda" value={rhythm} items={RHYTHM_ITEMS} onChange={setRhythm} />
            )}
          </Group>
          {suggestOn && (
            <Group
              header={nextTitle || "Suggestions"}
              data-testid="build-suggestions"
              footer={
                loading
                  ? "Updating…"
                  : next && !next.suggestions.length
                    ? "Nothing fits the rules here; search instead, or change the rhythm."
                    : undefined
              }
            >
              {(next?.suggestions ?? []).map((s) => (
                <div
                  key={s.key}
                  className="cell items-start gap-3 py-3"
                  data-leading="tile"
                  data-testid="build-suggestion"
                  title={s.reasons.join(" · ")}
                >
                  <RhythmTile rhythm={s.rhythm} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {s.kind === "song" ? s.songs[0]!.title : family(s)}
                    </span>
                    <span className="text-footnote block truncate text-[var(--label-2)]">
                      {s.kind === "song"
                        ? `${s.songs[0]!.year ?? "?"} · energy ${s.energy}`
                        : `${yearsText(s.years)} · energy ${s.energy} · ${s.songs.map((x) => x.title).join(", ")}`}
                    </span>
                    <span className="mt-1.5 flex flex-wrap gap-1.5">
                      {s.reasons.slice(0, 3).map((r) => (
                        <span
                          key={r}
                          className="text-caption1 rounded-full bg-[var(--fill-3)] px-2 py-0.5 text-[var(--label-2)]"
                          data-testid="build-reason"
                        >
                          {r}
                        </span>
                      ))}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost -mr-1 min-h-[44px] shrink-0 px-3"
                    onClick={() => pick(s)}
                    aria-label={s.kind === "song" ? `Add ${s.songs[0]!.title}` : `Add the ${family(s)} tanda`}
                    title={s.kind === "song" ? "Add this side to the tanda" : "Add this tanda to the night"}
                  >
                    <Plus size={16} aria-hidden /> Add
                  </button>
                </div>
              ))}
            </Group>
          )}

          <h2 className="section-head">Search</h2>
          <SearchField
            id="build-search"
            value={query}
            onChange={setQuery}
            placeholder="Title, orchestra, singer or year"
            label="Search for a song to add"
            busy={searching}
          />
          {hits.length > 0 && (
            <Group
              footer={
                open
                  ? `Sides that fit tanda ${draft.length} join it; the others start a new tanda.`
                  : "Each side starts a new tanda; the next sides of the same orchestra join it."
              }
            >
              {hits.map((h) => (
                <div key={h.song.id} className="cell" data-leading="tile" data-testid="build-hit">
                  <RhythmTile rhythm={h.song.rhythm} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{h.song.title}</span>
                    <span className="text-footnote block truncate text-[var(--label-2)]">
                      {family(h.song)} · {h.song.year ?? "?"}
                      {open && !h.fits && h.why ? ` · ${h.why}` : ""}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost -mr-1 min-h-[44px] shrink-0 px-3"
                    onClick={() => addHit(h)}
                    aria-label={`Add ${h.song.title}`}
                    title={open && h.fits ? `Add to tanda ${draft.length}` : "Start a new tanda with it"}
                  >
                    <Plus size={16} aria-hidden /> Add
                  </button>
                </div>
              ))}
            </Group>
          )}
          {!draft.length && suggestOn && (
            <p className="section-foot mt-3 flex items-center gap-1.5">
              <Wand2 size={14} aria-hidden /> Or let TDJ compose the whole night on Compose.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
