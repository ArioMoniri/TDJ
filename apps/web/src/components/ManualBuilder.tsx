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
import { lazy, t as tx } from "@/lib/i18n";
import { DUR, EASE } from "@/lib/motion";
import { fullOptions, useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { metaLine, yearText } from "@/lib/year";
import { Group, RhythmTile, Row, SegmentedRow, SwitchRow } from "./Form";
import { PageHeader } from "./PageHeader";
import { SearchField } from "./SearchField";
import { Tip } from "./ui/Tip";

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
  `${s.orchestra}${s.singer ? ` / ${s.singer}` : tx("manualBuilder.instrumental")}`;
const RHYTHM_ITEMS: Array<["auto" | "tango" | "vals" | "milonga", string]> = lazy(() => [
  ["auto", tx("manualBuilder.next_in_cycle")],
  ["tango", tx("manualBuilder.tango")],
  ["vals", tx("manualBuilder.vals")],
  ["milonga", tx("manualBuilder.milonga")],
]);

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
          rememberEdit(
            m,
            { tandas: [], opening: null, closing: null },
            j.playlist!,
            tx("manualBuilder.built_by_hand"),
          ),
        );
      toast(tx("manualBuilder.your_night_is_on_compose"));
      router.push("/");
    } finally {
      setFinishing(false);
    }
  };

  const minutes = draftMinutes(draft);
  const nextTitle = !next
    ? ""
    : next.mode === "song"
      ? tx("manualBuilder.next_side_of_tanda", { length: draft.length })
      : tx("manualBuilder.tanda_a_around_energy_tonight", {
          p1: next.slot + 1,
          rhythm: next.rhythm,
          targetEnergy: next.targetEnergy,
        });

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        title={tx("manualBuilder.build_by_hand")}
        subtitle={
          draft.length
            ? tx("manualBuilder.about_min", {
                length: draft.length,
                p1: draft.length === 1 ? tx("manualBuilder.tanda") : tx("manualBuilder.tandas"),
                minutes,
              })
            : tx("manualBuilder.pick_songs_or_whole_tandas_tdj")
        }
        primary={
          <Tip text={tx("manualBuilder.make_this_the_night_on_compose")}>
            <button
              type="button"
              className="btn btn-primary min-h-[44px]"
              onClick={finish}
              disabled={!draft.length || finishing}
              data-testid="build-finish"
            >
              <Check size={18} aria-hidden /> {tx("manualBuilder.use_this_night")}
            </button>
          </Tip>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-label={tx("manualBuilder.your_night")} className="min-w-0">
          <h2 className="section-head">{tx("manualBuilder.your_night")}</h2>
          {!draft.length && (
            <Group footer={tx("manualBuilder.start_with_a_suggestion_or_search")}>
              <Row
                label={tx("manualBuilder.nothing_yet")}
                sub={tx("manualBuilder.your_first_tanda_goes_here")}
              />
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
                    header={tx("manualBuilder.tanda_2", {
                      p1: ti + 1,
                      p2: isOpen
                        ? ` ${tx("manualBuilder.of", { length: t.length, p1: sizes[s0.rhythm as keyof typeof sizes] ?? 4 })}`
                        : "",
                    })}
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
                        <Tip text={tx("manualBuilder.move_up")}>
                          <button
                            type="button"
                            className="icon-btn icon-btn-bare h-11 w-11"
                            onClick={() => setDraft(moveTanda(draft, ti, ti - 1))}
                            aria-label={tx("manualBuilder.move_tanda_up", { p1: ti + 1 })}
                          >
                            <ArrowUp size={16} aria-hidden />
                          </button>
                        </Tip>
                      )}
                      <Tip text={tx("manualBuilder.remove_this_tanda")}>
                        <button
                          type="button"
                          className="icon-btn icon-btn-bare -mr-2 h-11 w-11 text-[var(--destructive)]"
                          onClick={() => setDraft(removeTanda(draft, ti))}
                          aria-label={tx("manualBuilder.remove_tanda", { p1: ti + 1 })}
                        >
                          <Trash2 size={16} aria-hidden />
                        </button>
                      </Tip>
                    </div>
                    {t.map((s, si) => (
                      <div key={s.id} className="cell" data-leading="num">
                        <span className="w-6 shrink-0 text-center tabular-nums text-[var(--label-2)]">
                          {si + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{s.title}</span>
                          <span className="text-footnote block truncate text-[var(--label-2)]">
                            {metaLine(
                              yearText(s.year),
                              s.energy !== undefined && tx("manualBuilder.energy", { energy: s.energy }),
                            )}
                          </span>
                        </span>
                        <Tip text={tx("manualBuilder.remove_this_side")}>
                          <button
                            type="button"
                            className="icon-btn icon-btn-bare -mr-2 h-11 w-11 text-[var(--label-3)]"
                            onClick={() => setDraft(removeSong(draft, ti, si))}
                            aria-label={tx("manualBuilder.remove", { title: s.title })}
                          >
                            <Trash2 size={15} aria-hidden />
                          </button>
                        </Tip>
                      </div>
                    ))}
                  </Group>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {/* phones: the header keeps no primary button, so the night is used from here */}
          {draft.length > 0 && (
            <button
              type="button"
              className="btn btn-primary mt-2 mb-4 min-h-[50px] w-full sm:hidden"
              onClick={finish}
              disabled={finishing}
              data-testid="build-finish-phone"
            >
              <Check size={18} aria-hidden /> {tx("manualBuilder.use_this_night")}
            </button>
          )}
        </section>

        <section aria-label={tx("manualBuilder.what_comes_next")} className="min-w-0">
          <h2 className="section-head">{tx("manualBuilder.what_comes_next")}</h2>
          <Group
            footer={
              suggestOn
                ? tx("manualBuilder.ranked_by_the_night_s_rules")
                : tx("manualBuilder.suggestions_are_off_pick_freely_the")
            }
          >
            <SwitchRow
              label={tx("manualBuilder.suggestions")}
              sub={tx("manualBuilder.update_after_every_song_you_add")}
              checked={suggestOn}
              onChange={(v) => setSettings({ buildSuggestions: v })}
            />
            {suggestOn && (!next || next.mode === "tanda") && (
              <SegmentedRow
                label={tx("manualBuilder.next_tanda")}
                value={rhythm}
                items={RHYTHM_ITEMS}
                onChange={setRhythm}
              />
            )}
          </Group>
          {suggestOn && (
            <Group
              header={nextTitle || tx("manualBuilder.suggestions")}
              data-testid="build-suggestions"
              footer={
                loading
                  ? tx("manualBuilder.updating")
                  : next && !next.suggestions.length
                    ? tx("manualBuilder.nothing_fits_the_rules_here_search")
                    : undefined
              }
            >
              {(next?.suggestions ?? []).map((s) => (
                <div
                  key={s.key}
                  className="cell items-start gap-3 py-3"
                  data-leading="tile"
                  data-testid="build-suggestion"
                  aria-description={s.reasons.join(" · ")}
                >
                  <RhythmTile rhythm={s.rhythm} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {s.kind === "song" ? s.songs[0]!.title : family(s)}
                    </span>
                    <span className="text-footnote block truncate text-[var(--label-2)]">
                      {s.kind === "song"
                        ? metaLine(
                            yearText(s.songs[0]!.year),
                            tx("manualBuilder.energy", { energy: s.energy }),
                          )
                        : metaLine(
                            yearsText(s.years),
                            tx("manualBuilder.energy", { energy: s.energy }),
                            s.songs.map((x) => x.title).join(", "),
                          )}
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
                  <Tip
                    text={
                      s.kind === "song"
                        ? tx("manualBuilder.add_this_side_to_the_tanda")
                        : tx("manualBuilder.add_this_tanda_to_the_night")
                    }
                  >
                    <button
                      type="button"
                      className="btn btn-ghost -mr-1 min-h-[44px] shrink-0 px-3"
                      onClick={() => pick(s)}
                      aria-label={
                        s.kind === "song"
                          ? tx("manualBuilder.add_2", { title: s.songs[0]!.title })
                          : tx("manualBuilder.add_the_tanda", { p1: family(s) })
                      }
                    >
                      <Plus size={16} aria-hidden /> {tx("manualBuilder.add")}
                    </button>
                  </Tip>
                </div>
              ))}
            </Group>
          )}

          <h2 className="section-head">{tx("manualBuilder.search")}</h2>
          <SearchField
            id="build-search"
            value={query}
            onChange={setQuery}
            placeholder={tx("manualBuilder.title_orchestra_singer_or_year")}
            label={tx("manualBuilder.search_for_a_song_to_add")}
            busy={searching}
          />
          {hits.length > 0 && (
            <Group
              footer={
                open
                  ? tx("manualBuilder.sides_that_fit_tanda_join_it", { length: draft.length })
                  : tx("manualBuilder.each_side_starts_a_new_tanda")
              }
            >
              {hits.map((h) => (
                <div key={h.song.id} className="cell" data-leading="tile" data-testid="build-hit">
                  <RhythmTile rhythm={h.song.rhythm} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{h.song.title}</span>
                    <span className="text-footnote block truncate text-[var(--label-2)]">
                      {metaLine(family(h.song), yearText(h.song.year))}
                      {open && !h.fits && h.why ? ` · ${h.why}` : ""}
                    </span>
                  </span>
                  <Tip
                    text={
                      open && h.fits
                        ? tx("manualBuilder.add_to_tanda", { length: draft.length })
                        : tx("manualBuilder.start_a_new_tanda_with_it")
                    }
                  >
                    <button
                      type="button"
                      className="btn btn-ghost -mr-1 min-h-[44px] shrink-0 px-3"
                      onClick={() => addHit(h)}
                      aria-label={tx("manualBuilder.add_2", { title: h.song.title })}
                    >
                      <Plus size={16} aria-hidden /> {tx("manualBuilder.add")}
                    </button>
                  </Tip>
                </div>
              ))}
            </Group>
          )}
          {!draft.length && suggestOn && (
            <p className="section-foot mt-3 flex items-center gap-1.5">
              <Wand2 size={14} aria-hidden /> {tx("manualBuilder.or_let_tdj_compose_the_whole")}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
