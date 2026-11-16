"use client";
import "./build.css";
import {
  type ComposeOptions,
  emptyMemory,
  learnedForRequest,
  type Playlist,
  patternString,
  rememberEdit,
  type Song,
  type SuggestWhy,
  singerDisplay,
  type Tanda,
} from "@tdj/core";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckSquare,
  ChevronDown,
  GripVertical,
  Heart,
  Info,
  ListPlus,
  Plus,
  Redo2,
  RotateCcw,
  Search,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  Wand2,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addSongsAt,
  addSongsTo,
  addTanda,
  type Draft,
  type DraftSong,
  draftFit,
  draftIds,
  draftMinutes,
  isDraft,
  moveAligned,
  moveSong,
  moveTanda,
  newTanda,
  openTanda,
  removeSong,
  removeTanda,
  slimSong,
} from "@/lib/build";
import { BIG_FOUR_NAME, type GuideFix, type GuideLine, guideLines } from "@/lib/buildGuide";
import { recordSnapshot, useEditHistory } from "@/lib/editHistory";
import { runHistory } from "@/lib/editToast";
import { suggestReasons } from "@/lib/engineText";
import { haptic } from "@/lib/haptics";
import { makeSnapshot } from "@/lib/history";
import { useMediaQuery } from "@/lib/hooks";
import { lazy, t as tx } from "@/lib/i18n";
import { bindingsOf, formatCombo } from "@/lib/keymap";
import { fmtLen, tandaTotal, totalText } from "@/lib/lengths";
import { DUR, EASE } from "@/lib/motion";
import { orchestraName } from "@/lib/orchestraName";
import { PlayListContext } from "@/lib/playback";
import type { PlayItem } from "@/lib/player";
import { requestFavourites } from "@/lib/popularity";
import { adoptDraftExceptions, DRAFT_NIGHT, gateEdit } from "@/lib/ruleCheck";
import type { Version } from "@/lib/smartSearch";
import { openSongDetails } from "@/lib/songOpen";
import { fullOptions, useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { Cortina } from "@/lib/types";
import { useSmartSearch } from "@/lib/useSmartSearch";
import { metaLine, yearText } from "@/lib/year";
import { BuildVersionRow, ReasonInfo, type VersionFit } from "./BuildRows";
import { Group, RhythmTile, Row, SegmentedRow, SwitchRow } from "./Form";
import { Menu } from "./Menu";
import { PageHeader } from "./PageHeader";
import { Sheet } from "./Sheet";
import { Artwork } from "./ui/Artwork";
import { CortinaPlayButton, PlayRow } from "./ui/PlayRow";
import { SmartSearchField, SmartSearchResults } from "./ui/SmartSearch";
import { SongArt } from "./ui/TandaArt";
import { isMixedTanda, rhythmWord, TandaTypeBadge } from "./ui/TandaTypeBadge";
import { Tip } from "./ui/Tip";
import { useDragReorder } from "./ui/useDragReorder";

/** the draft as a night for the rule check (its tandas are what it judges) */
function draftNight(d: Draft, options: ComposeOptions): Playlist {
  return {
    id: DRAFT_NIGHT,
    name: "",
    createdAt: "",
    options,
    closing: null,
    tandas: d.map(
      (ss, i) =>
        ({
          index: i + 1,
          songs: ss as unknown as Song[],
          rhythm: ss[0]?.rhythm ?? "tango",
          orchestraId: ss[0]?.orchestraId ?? "",
          orchestra: ss[0]?.orchestra ?? "",
          singer: ss.find((s) => s.vocal)?.singer ?? null,
          vocal: ss.some((s) => s.vocal),
          cortina: null,
        }) as unknown as Tanda,
    ),
  } as unknown as Playlist;
}
const draftOf = (p: Playlist): Draft => p.tandas.map((t) => t.songs.map(slimSong));
const asSong = (s: DraftSong) => s as unknown as Song;

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
  /** the reasons as data (core suggest.ts), said in the DJ's language */
  why?: SuggestWhy[];
}
interface Next {
  mode: "tanda" | "song";
  rhythm: string;
  slot: number;
  targetEnergy: number;
  suggestions: Suggestion[];
}
interface Plan {
  minutes: number;
  slots: Array<{ rhythm: string; targetEnergy: number }>;
  bigFour: string[];
}
interface Hit {
  song: DraftSong;
  fits: boolean;
  why: string | null;
}
interface Facet {
  id: string;
  name: string;
  n: number;
}
interface Filters {
  rhythm?: "tango" | "vals" | "milonga";
  voice?: "vocal" | "instrumental";
  decade?: number;
  orchestraId?: string;
  singer?: string;
  fav?: boolean;
}
/** what the builder keeps beside the draft: the cortina after each tanda and the Cumparsita slots */
interface Meta {
  cortinas: Array<Cortina | null>;
  opening: boolean;
  closing: boolean;
}

const KEY = "tdj-build-draft";
const META_KEY = "tdj-build-meta";
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
const EMPTY_META: Meta = { cortinas: [], opening: true, closing: true };
const loadMeta = (): Meta => {
  try {
    const v = JSON.parse(localStorage.getItem(META_KEY) ?? "null") as Partial<Meta> | null;
    return {
      cortinas: Array.isArray(v?.cortinas) ? v.cortinas : [],
      opening: v?.opening !== false,
      closing: v?.closing !== false,
    };
  } catch {
    return EMPTY_META;
  }
};
const saveMeta = (m: Meta) => {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {}
};
const yearsText = (y: [number, number] | null) => (y ? (y[0] === y[1] ? `${y[0]}` : `${y[0]}–${y[1]}`) : "");
/** "Di Sarli / Rufino", "Héctor Mauré with guitars" (a solo singer's side names no orchestra: lib/orchestraName.ts) */
const family = (s: { orchestra: string; orchestraId?: string; singer: string | null }) => {
  const o = orchestraName(s);
  if (o !== s.orchestra) return o;
  return `${s.orchestra}${s.singer ? ` / ${singerDisplay(s.singer)}` : tx("manualBuilder.instrumental")}`;
};
const FILL_ITEMS = ["tanda", "cycle", "target", "all"] as const;
type FillScope = (typeof FILL_ITEMS)[number];
/** what a fill would add, shown in the guide before it applies */
interface FillPreview {
  scope: FillScope;
  /** the night it was asked on */
  base: Draft;
  draft: Draft;
  added: number;
  sides: number;
  minutes: number;
  rhythms: string[];
}
/** the builder's page (the undo history keeps its edits under it) */
const SCOPE = "/build";
const RHYTHM_ITEMS: Array<["auto" | "tango" | "vals" | "milonga", string]> = lazy(() => [
  ["auto", tx("manualBuilder.next_in_cycle")],
  ["tango", tx("manualBuilder.tango")],
  ["vals", tx("manualBuilder.vals")],
  ["milonga", tx("manualBuilder.milonga")],
]);
const RHYTHMS3 = ["tango", "vals", "milonga"] as const;
const DECADES = [1920, 1930, 1940, 1950] as const;
/** the orchestras "New tanda" offers first (the big four, then the usual chairs) */
const NEW_TANDA_ORCHESTRAS: Array<[string, string]> = [
  ["carlos-di-sarli", "Carlos Di Sarli"],
  ["juan-d-arienzo", "Juan D'Arienzo"],
  ["anibal-troilo", "Aníbal Troilo"],
  ["osvaldo-pugliese", "Osvaldo Pugliese"],
  ["miguel-calo", "Miguel Caló"],
  ["angel-d-agostino", "Ángel D'Agostino"],
  ["ricardo-tanturi", "Ricardo Tanturi"],
  ["rodolfo-biagi", "Rodolfo Biagi"],
  ["francisco-canaro", "Francisco Canaro"],
  ["edgardo-donato", "Edgardo Donato"],
];
const RHYTHM_LETTER: Record<string, string> = { tango: "T", vals: "V", milonga: "M" };
const tandaEnergy = (t: DraftSong[]) => t.reduce((a, s) => a + (s.energy ?? 50), 0) / Math.max(1, t.length);

/** the night's energy, tanda by tanda, against the plan's targets: a 44 px tall sparkline */
function Sparkline({ values, targets }: { values: number[]; targets: number[] }) {
  const n = Math.max(values.length, targets.length, 2);
  const w = 220;
  const h = 44;
  const x = (i: number) => (i / (n - 1)) * (w - 4) + 2;
  const y = (v: number) => h - 2 - ((Math.max(20, Math.min(100, v)) - 20) / 80) * (h - 4);
  const line = (vs: number[]) =>
    vs.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-11 w-full max-w-[260px]"
      role="img"
      aria-label={tx("builder.energy_sparkline", { n: values.length })}
      data-testid="build-sparkline"
    >
      {targets.length > 1 && (
        <path d={line(targets)} fill="none" stroke="var(--label-3)" strokeWidth={1.5} strokeDasharray="3 3" />
      )}
      {values.length > 1 && <path d={line(values)} fill="none" stroke="var(--tint)" strokeWidth={2} />}
      {values.map((v, i) => (
        <circle key={`${i}-${v}`} cx={x(i)} cy={y(v)} r={2.5} fill="var(--tint)" />
      ))}
    </svg>
  );
}

/**
 * Round 22, guided in 2026-11 (the owner: "in Build by hand there should be a better UI to search and add and
 * create, and help to create the night") — build a night by hand. Wide screens: the night on the left (tandas with
 * cortina slots, the opening and closing La Cumparsita, the length, an energy sparkline and the guidance lines, each
 * with a one-tap fix), an Add panel on the right (search with filter chips, ✓ / ⚠ against the selected tanda, one
 * "+" per result, multi-select, and the suggestions with their reasons). Phones: the night, with a sticky Add button
 * that opens the panel in a sheet. Every row plays on a tap; songs and tandas reorder by drag or Move up / down.
 * "Use this night" makes it the night on Compose (cortinas, score, booth, exports).
 */
export function ManualBuilder() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const wide = useMediaQuery("(min-width: 1024px)");
  const { settings, setSettings, memory, setPlaylist, addSnapshot, updateMemory } = useStore();
  const [draft, setDraftState] = useState<Draft>([]);
  const [meta, setMetaState] = useState<Meta>(EMPTY_META);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const [ready, setReady] = useState(false);
  const [next, setNext] = useState<Next | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [rhythm, setRhythm] = useState<"auto" | "tango" | "vals" | "milonga">("auto");
  const [query, setQuery] = useState("");
  // 2026-11: the one smart search for the field (completions, the correction) and the versions of a complete title
  const smart = useSmartSearch({ value: query, onChange: setQuery, services: false, limit: 20, works: true });
  const [filters, setFilters] = useState<Filters>({});
  const [hits, setHits] = useState<Hit[]>([]);
  const [facets, setFacets] = useState<{ orchestras: Facet[]; singers: Facet[] }>({
    orchestras: [],
    singers: [],
  });
  const [, setSearching] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [filling, setFilling] = useState(false);
  /** the tanda "+" adds to: an index, or "new" (the next add starts a tanda) */
  const [sel, setSel] = useState<number | "new">(0);
  /**
   * 2026-11 ("insert / remove everywhere"): where the next add goes when the DJ chose a place — a new tanda at place
   * `tanda` ("Insert tanda before / after"), or a side at place `at` of tanda `tanda` ("Add song before / after")
   */
  const [place, setPlace] = useState<
    { kind: "tanda"; tanda: number } | { kind: "song"; tanda: number; at: number } | null
  >(null);
  /** Shift held with Enter: the highlighted version starts a new tanda */
  const shiftRef = useRef(false);
  const [multi, setMulti] = useState(false);
  const [picked, setPicked] = useState<DraftSong[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newRhythm, setNewRhythm] = useState<"tango" | "vals" | "milonga">("tango");
  const [cortinaAt, setCortinaAt] = useState<number | null>(null);
  const [pool, setPool] = useState<Cortina[] | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const suggestRef = useRef<HTMLDivElement>(null);
  const suggestOn = settings.buildSuggestions !== false;
  const opts = useStore((s) => s.options);
  const options = useMemo(() => fullOptions(opts), [opts]);
  const sizes = {
    tango: options.tangoTandaSize ?? 4,
    vals: options.valsTandaSize ?? 3,
    milonga: options.milongaTandaSize ?? 3,
  };
  const favourites = useMemo(() => requestFavourites(memory), [memory]);

  useEffect(() => {
    const d = loadDraft();
    setDraftState(d);
    setMetaState(loadMeta());
    setSel(d.length ? d.length - 1 : "new");
    setReady(true);
  }, []);
  const setMeta = useCallback((fn: (m: Meta) => Meta) => {
    setMetaState((m) => {
      const n = fn(m);
      saveMeta(n);
      return n;
    });
  }, []);
  // 2026-11: every change to the draft is one entry of the undo history (⌘Z, the toast's Undo)
  const setDraft = (d: Draft, cortinas?: Array<Cortina | null>) => {
    const before = { d: draftRef.current, c: metaRef.current.cortinas };
    if (before.d !== d)
      recordSnapshot(tx("editKeys.build_edit"), before, { d, c: cortinas ?? before.c }, (x) =>
        putDraft(x.d, x.c),
      );
    putDraft(d, cortinas);
  };
  const putDraft = (d: Draft, cortinas?: Array<Cortina | null>) => {
    setDraftState(d);
    saveDraft(d);
    if (cortinas) setMeta((m) => ({ ...m, cortinas }));
  };
  // 2026-11 (the owner: "Undo / Redo in the header, Reset with a confirm"): the buttons walk the one history
  const canUndo = useEditHistory((s) => s.past.some((e) => e.scope === SCOPE));
  const canRedo = useEditHistory((s) => s.future.some((e) => e.scope === SCOPE));
  const [resetOpen, setResetOpen] = useState(false);
  // (the keys read after mount: ⌘ on a Mac, Ctrl elsewhere, the DJ's own bindings; ⌘Y / Ctrl+Y shown for redo)
  const [keys, setKeys] = useState({ undo: "", redo: "" });
  useEffect(
    () =>
      setKeys({
        undo: formatCombo(bindingsOf("edit.undo")[0] ?? "mod+z"),
        redo: formatCombo(
          bindingsOf("edit.redo").find((c) => c.endsWith("+y")) ?? bindingsOf("edit.redo")[0] ?? "mod+y",
        ),
      }),
    [],
  );
  const [preview, setPreview] = useState<FillPreview | null>(null);
  const tonight = useStore((s) => s.playlist);
  /** the whole builder (the night and its cortinas and Cumparsitas) to another state, as one undoable edit */
  const replaceAll = (d: Draft, m: Meta, label: string) => {
    const before = { d: draftRef.current, m: metaRef.current };
    const put = (x: { d: Draft; m: Meta }) => {
      putDraft(x.d);
      setMeta(() => x.m);
      setSel(x.d.length ? x.d.length - 1 : "new");
    };
    recordSnapshot(label, before, { d, m }, put, SCOPE);
    put({ d, m });
    setPlace(null);
    setPreview(null);
    toast(label, () => void runHistory("undo", { scope: SCOPE }));
  };
  const resetEmpty = () => {
    setResetOpen(false);
    haptic(8);
    replaceAll([], EMPTY_META, tx("build.reset_done_empty"));
  };
  const resetTonight = () => {
    setResetOpen(false);
    if (!tonight?.tandas.length) return;
    haptic(8);
    const d = draftOf(tonight);
    replaceAll(
      d,
      {
        cortinas: tonight.tandas.slice(0, -1).map((t) => t.cortina ?? null),
        opening: !!tonight.opening,
        closing: !!tonight.closing,
      },
      tx("build.reset_done_tonight", { name: tonight.name }),
    );
  };
  const selIndex = sel === "new" ? -1 : Math.min(sel, draft.length - 1);

  // the live suggestions, again after every change
  const seq = useRef(0);
  const [_reroll, setReroll] = useState(0);
  const { learned: myLearned, repoLearned } = memory;
  useEffect(() => {
    if (!ready) return;
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
            learned: learnedForRequest({ ...emptyMemory(), learned: myLearned, repoLearned }, settings.learn),
            rhythm: rhythm === "auto" ? undefined : rhythm,
            suggest: suggestOn,
            favourites,
          }),
        });
        const j = (await r.json()) as { next?: Next; plan?: Plan };
        if (n === seq.current) {
          setNext(j.next ?? null);
          if (j.plan) setPlan(j.plan);
        }
      } finally {
        if (n === seq.current) setLoading(false);
      }
    }, 120);
    return () => clearTimeout(t);
  }, [draft, ready, suggestOn, rhythm, options, settings.learn, myLearned, repoLearned, favourites]);

  const qseq = useRef(0);
  const anyFilter = !!(
    filters.rhythm ||
    filters.voice ||
    filters.decade ||
    filters.orchestraId ||
    filters.singer ||
    filters.fav
  );
  useEffect(() => {
    if (query.trim().length < 2 && !anyFilter) {
      setHits([]);
      setFacets({ orchestras: [], singers: [] });
      return;
    }
    const n = ++qseq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/build", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            draft: draftIds(draft),
            options,
            query,
            filters,
            favourites: filters.fav ? favourites : undefined,
            target: selIndex >= 0 ? selIndex : undefined,
            suggest: false,
          }),
        });
        const j = (await r.json()) as { results?: Hit[]; facets?: { orchestras: Facet[]; singers: Facet[] } };
        if (n === qseq.current) {
          setHits(j.results ?? []);
          setFacets(j.facets ?? { orchestras: [], singers: [] });
        }
      } finally {
        if (n === qseq.current) setSearching(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query, filters, anyFilter, draft, options, favourites, selIndex]);

  const open = openTanda(draft, sizes);
  /** an edit that adds sides goes through the rule check: one that breaks a tanda rule asks first */
  const addChecked = (after: Draft, label: string, cortinas?: Array<Cortina | null>) =>
    gateEdit({
      before: draftNight(draft, options as ComposeOptions),
      after: draftNight(after, options as ComposeOptions),
      label,
      apply: (p) => setDraft(draftOf(p), cortinas),
      learn: false,
      scope: "tandas",
      guide: false,
    });
  const pick = (s: Suggestion) => {
    haptic(6);
    if (s.kind === "tanda") {
      const d = addTanda(draft, s.songs, sizes);
      setDraft(d, d.length > draft.length ? [...meta.cortinas.slice(0, draft.length), null] : meta.cortinas);
      setSel(d.length - 1);
    } else void addChecked(addSongsTo(draft, draft.length - 1, [s.songs[0]!]), s.songs[0]!.title);
  };
  /** "+" on a result: into the selected tanda (the rule check says so when it does not fit), or a new tanda */
  const addTo = async (songs: DraftSong[], where: number | "new") => {
    if (!songs.length) return;
    haptic(6);
    const label = songs.length === 1 ? songs[0]!.title : tx("builder.n_sides", { n: songs.length });
    if (place && where !== "new") {
      const pl = place;
      setPlace(null);
      if (pl.kind === "tanda") {
        const c = padded(meta.cortinas, draft.length);
        c.splice(pl.tanda, 0, null);
        const res = await addChecked(newTanda(draft, songs, pl.tanda), label, c);
        if (res !== "cancelled") setSel(pl.tanda);
        return;
      }
      await addChecked(addSongsAt(draft, pl.tanda, pl.at, songs), label);
      return;
    }
    if (where === "new" || where < 0 || where >= draft.length) {
      const d = newTanda(draft, songs);
      const res = await addChecked(d, label, [...meta.cortinas.slice(0, draft.length), null]);
      if (res !== "cancelled") setSel(d.length - 1);
      return;
    }
    await addChecked(addSongsTo(draft, where, songs), label);
  };
  const addHit = (h: Hit) => void addTo([h.song], sel === "new" ? "new" : selIndex);
  /** a version from the smart search (the catalogue's: the builder's night is catalogue sides) */
  const addVersion = (v: Version, asNew = false) => {
    if (!v.hit) return;
    const shift = shiftRef.current;
    shiftRef.current = false;
    void addTo([slimSong(v.song)], asNew || shift || sel === "new" ? "new" : selIndex);
  };
  /** the tanda a version would join: the place chosen, the selected tanda, or none (a new one) */
  const target: DraftSong[] =
    place?.kind === "song"
      ? (draft[place.tanda] ?? [])
      : place?.kind === "tanda" || sel === "new"
        ? []
        : (draft[selIndex] ?? []);
  /**
   * what a version does to that tanda (information, not a gate): one line for the row — the first thing that matters,
   * ⚠ when it breaks the tanda — and every reason for its ⓘ (2026-11: never a cut warning)
   */
  const fitOf = (v: Version): VersionFit | null => {
    if (!v.hit) return null;
    const f = draftFit(target, slimSong(v.song));
    if (!target.length) {
      const line = tx("build.fit.new_tanda", { t: fmtLen(f.totalSec) });
      return { short: line, full: [line], warn: false };
    }
    const bits: string[] = [];
    const warns: string[] = [];
    if (f.inTanda) warns.push(tx("build.fit.in_tanda"));
    if (f.orchestra === "same") bits.push(tx("build.fit.same_orchestra"));
    else if (f.orchestra === "differs")
      warns.push(
        tx("build.fit.other_orchestra", {
          a: orchestraName(v.song),
          b: target[0] ? orchestraName(target[0]) : "",
        }),
      );
    if (f.singer === "differs" && f.singers)
      warns.push(tx("build.fit.singer_differs", { a: f.singers[0], b: f.singers[1] }));
    else if (f.singer === "voice") warns.push(tx("build.fit.voice_differs"));
    if (f.rhythm === "differs") warns.push(tx("build.fit.rhythm_differs", { r: rhythmWord(v.song.rhythm) }));
    if (f.years)
      bits.push(
        tx("build.fit.years", { y: f.years[0] === f.years[1] ? `${f.years[0]}` : f.years.join("–") }),
      );
    bits.push(tx("build.fit.total", { t: fmtLen(f.totalSec) }));
    const warn = warns.length > 0;
    const head = warn ? warns[0]! : tx("build.fit.fits");
    return {
      // (the first thing that matters, then the years and the tanda's length; the rest behind ⓘ)
      short: [head, ...bits].join(" · "),
      full: [...warns, ...bits],
      warn,
    };
  };
  /** the … menu of a version: a new tanda with it, into another tanda, its details */
  const versionMenu = (v: Version) => [
    {
      label: tx("builder.start_new_with"),
      icon: ListPlus,
      onClick: () => addVersion(v, true),
      testId: "build-version-new",
    },
    ...draft.slice(0, 12).map((t, i) => ({
      label: tx("builder.add_to_tanda", { n: i + 1, family: family(t[0]!) }),
      icon: Plus,
      onClick: () => void addTo([slimSong(v.song)], i),
    })),
    {
      label: tx("build.song_details"),
      icon: Info,
      onClick: () => openSongDetails(v.song),
    },
  ];
  const togglePick = (s: DraftSong) =>
    setPicked((p) => (p.some((x) => x.id === s.id) ? p.filter((x) => x.id !== s.id) : [...p, s]));
  const addPicked = async (where: number | "new") => {
    await addTo(picked, where);
    setPicked([]);
    setMulti(false);
  };

  // reorder: songs inside a tanda, tandas inside the night (the cortina after a tanda moves with it)
  const moveSide = (ti: number, from: number, to: number) => {
    haptic(6);
    setDraft(moveSong(draft, ti, from, to));
  };
  const moveT = (from: number, to: number) => {
    if (to < 0 || to >= draft.length) return;
    haptic(6);
    setDraft(moveTanda(draft, from, to), moveAligned(padded(meta.cortinas, draft.length), from, to));
    setSel(to);
  };
  const dragTanda = useDragReorder(moveT);
  /** "Insert tanda before / after", "Add song before / after": the next add goes there (the search opens) */
  const choosePlace = (pl: NonNullable<typeof place>) => {
    haptic(4);
    setPlace(pl);
    if (pl.kind === "song") {
      setSel(pl.tanda);
      const t = draft[pl.tanda];
      if (t?.[0]) setFilters({ rhythm: t[0].rhythm as Filters["rhythm"], orchestraId: t[0].orchestraId });
    } else setFilters({});
    showAdd("search");
  };
  const removeT = (ti: number) => {
    const c = padded(meta.cortinas, draft.length);
    c.splice(ti, 1);
    setDraft(removeTanda(draft, ti), c);
    setSel(draft.length - 2 >= 0 ? Math.min(ti, draft.length - 2) : "new");
  };

  /**
   * 2026-11 (the owner: "Fill the rest becomes a menu, each previewed in the guide before applying"): the engine fills
   * the open tanda, then as far as the scope says — the next tanda, one rhythm cycle, the target length, everything
   * (core suggest.ts fillDraft); the DJ's tandas stay as they are. The guide shows what it would add; Apply makes it
   * one undoable edit.
   */
  const fillSeq = useRef(0);
  const previewFill = async (scope: FillScope) => {
    const n = ++fillSeq.current;
    setFilling(true);
    try {
      const r = await fetch("/api/build", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          draft: draftIds(draft),
          options,
          fill: scope,
          favourites,
          learned: learnedForRequest({ ...emptyMemory(), learned: myLearned, repoLearned }, settings.learn),
        }),
      }).catch(() => null);
      const j = r?.ok
        ? ((await r.json()) as Partial<FillPreview> & { draft?: Draft })
        : ({} as Partial<FillPreview>);
      if (n !== fillSeq.current) return;
      if (!j.draft || !isDraft(j.draft)) {
        toast(tx("build.fill_nothing"));
        return;
      }
      setPreview({
        scope,
        base: draft,
        draft: j.draft,
        added: j.added ?? Math.max(0, j.draft.length - draft.length),
        sides: j.sides ?? 0,
        minutes: j.minutes ?? draftMinutes(j.draft),
        rhythms: j.rhythms ?? [],
      });
      requestAnimationFrame(() =>
        document
          .querySelector('[data-testid="build-fill-preview"]')
          ?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
      );
    } finally {
      if (n === fillSeq.current) setFilling(false);
    }
  };
  // a preview is of the night it was asked on: any other edit (an undo too) leaves it unshown
  const fillShown = preview && preview.base === draft ? preview : null;
  const applyFill = () => {
    const p = fillShown;
    if (!p) return;
    if (!p.added && !p.sides) {
      setPreview(null);
      return;
    }
    haptic(6);
    const label = tx("build.filled_scope", { scope: fillLabel(p.scope), n: p.added });
    setDraft(p.draft, padded(meta.cortinas, p.draft.length));
    setSel(p.draft.length - 1);
    setPreview(null);
    toast(label, () => void runHistory("undo", { scope: SCOPE }));
  };
  const fillRest = () => void previewFill("target");

  const finish = async () => {
    if (!draft.length) return;
    setFinishing(true);
    try {
      const cum =
        meta.opening && meta.closing ? "both" : meta.opening ? "open" : meta.closing ? "close" : "none";
      const o = {
        ...options,
        closeWithCumparsita: meta.closing,
        rules: { ...(options.rules ?? {}), cumparsita: cum, openWithCumparsita: undefined },
      };
      const r = await fetch("/api/build", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft: draftIds(draft), options: o, finish: true }),
      });
      const j = (await r.json()) as { playlist?: Playlist };
      if (!j.playlist) return;
      // the draft's one-night exceptions ("Do it as I said") become this night's
      let p = adoptDraftExceptions(j.playlist);
      // the cortinas the DJ picked take their gaps (Auto keeps the night's own)
      const chosen = meta.cortinas;
      if (chosen.some(Boolean))
        p = {
          ...p,
          tandas: p.tandas.map((t, i) =>
            chosen[i] && i < p.tandas.length - 1 ? { ...t, cortina: chosen[i]! } : t,
          ),
        };
      setPlaylist(p);
      addSnapshot(makeSnapshot(p, options, "compose"));
      // a hand-built night is the clearest statement of taste: its sides, families and tandas teach
      if (settings.learn)
        updateMemory((m) =>
          rememberEdit(m, { tandas: [], opening: null, closing: null }, p, tx("manualBuilder.built_by_hand")),
        );
      toast(tx("manualBuilder.your_night_is_on_compose"));
      router.push("/");
    } finally {
      setFinishing(false);
    }
  };

  // the cortina picker: the pool (Turkish first, the night's years), each playing from its chorus
  const openCortinas = async (at: number) => {
    setCortinaAt(at);
    if (pool) return;
    const r = await fetch("/api/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ options, cortinas: true }),
    }).catch(() => null);
    const j = r?.ok ? ((await r.json()) as { cortinas?: Cortina[] }) : null;
    setPool(j?.cortinas ?? []);
  };
  const setCortina = (at: number, c: Cortina | null) => {
    const list = padded(meta.cortinas, draft.length);
    list[at] = c;
    setMeta((m) => ({ ...m, cortinas: list }));
    setCortinaAt(null);
  };

  const minutes = draftMinutes(draft);
  /** the night's rhythm cycle, as the menu says it: "T T V T T M" */
  const cycleText = patternString(options as ComposeOptions)
    .split("")
    .join(" ");
  function fillLabel(s: FillScope): string {
    return s === "tanda"
      ? tx("build.fill_tanda")
      : s === "cycle"
        ? tx("build.fill_cycle", { cycle: cycleText })
        : s === "target"
          ? tx("build.fill_target")
          : tx("build.fill_all");
  }
  const lines = useMemo(
    () =>
      guideLines(
        draft.map((t) => ({ rhythm: t[0]!.rhythm, orchestraId: t[0]!.orchestraId, energy: tandaEnergy(t) })),
        plan,
        { minutes, cortinas: padded(meta.cortinas, draft.length) },
      ),
    [draft, plan, minutes, meta.cortinas],
  );
  const showAdd = (focus: "search" | "suggest") => {
    if (!wide) setAddOpen(true);
    requestAnimationFrame(() =>
      (focus === "search" ? searchRef : suggestRef).current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    );
  };
  const runFix = (f: GuideFix) => {
    haptic(4);
    if (f.kind === "fill") void fillRest();
    else if (f.kind === "remove-last") removeT(draft.length - 1);
    else if (f.kind === "orchestra") {
      setSel("new");
      setQuery("");
      setFilters({ orchestraId: f.id, rhythm: "tango" });
      showAdd("search");
    } else if (f.kind === "rhythm") {
      setRhythm(f.rhythm as "tango" | "vals" | "milonga");
      setReroll((x) => x + 1);
      showAdd("suggest");
    } else if (f.kind === "suggest") {
      setReroll((x) => x + 1);
      showAdd("suggest");
    } else if (f.kind === "cortina") void openCortinas(f.at);
  };
  const suggestNextTanda = () => {
    haptic(4);
    setRhythm("auto");
    setReroll((x) => x + 1);
    if (!suggestOn) setSettings({ buildSuggestions: true });
    showAdd("suggest");
  };
  const startNewTanda = (orchestraId: string | null) => {
    setNewOpen(false);
    setSel("new");
    setQuery("");
    if (orchestraId) {
      setFilters({ rhythm: newRhythm, orchestraId });
      showAdd("search");
    } else {
      setFilters({ rhythm: newRhythm });
      setRhythm(newRhythm);
      setReroll((x) => x + 1);
      showAdd("suggest");
    }
  };

  const nextTitle = !next
    ? ""
    : next.mode === "song"
      ? tx("manualBuilder.next_side_of_tanda", { length: draft.length })
      : tx("manualBuilder.tanda_a_around_energy_tonight", {
          p1: next.slot + 1,
          rhythm: next.rhythm,
          targetEnergy: next.targetEnergy,
        });
  const shown = (next?.suggestions ?? []).slice(0, next?.mode === "tanda" ? 3 : 6);
  const selLabel =
    sel === "new" || selIndex < 0 ? tx("builder.a_new_tanda") : tx("builder.tanda_n", { n: selIndex + 1 });
  // a tap plays from the night in order (the mini player steps through it)
  const nightList = useMemo(
    () => ({
      label: tx("manualBuilder.your_night"),
      items: draft.flatMap((t, i) =>
        t.map((s): PlayItem => ({ kind: "song", song: asSong(s), where: tx("play.tanda", { n: i + 1 }) })),
      ),
    }),
    [draft],
  );
  const hitList = useMemo(
    () => ({
      label: tx("manualBuilder.search"),
      items: hits.map(
        (h): PlayItem => ({ kind: "song", song: asSong(h.song), where: tx("manualBuilder.search") }),
      ),
    }),
    [hits],
  );

  const addPanel = (
    <div className="min-w-0" data-testid="build-add-panel">
      <div ref={searchRef} className="scroll-mt-24" data-testid="build-search-first">
        <h2 className="section-head">{tx("manualBuilder.search")}</h2>
        {place && (
          <p
            className="text-footnote mb-2 flex items-center gap-2 px-4 text-[var(--tint)]"
            data-testid="build-place"
          >
            <span className="min-w-0 flex-1">
              {place.kind === "tanda"
                ? tx("build.place_tanda", { n: place.tanda + 1 })
                : tx("build.place_song", { n: place.tanda + 1, at: place.at + 1 })}
            </span>
            <button type="button" className="btn-plain min-h-11" onClick={() => setPlace(null)}>
              {tx("build.place_cancel")}
            </button>
          </p>
        )}
        {/* 2026-11 (the owner: "just search songs and add them, with the orchestra, singer, timing and the versions as a
            guide"): the plain smart search leads — typing shows the versions by work; Add puts one in the tanda (Enter),
            "New tanda" starts one with it (Shift+Enter); the line under each says what it does to that tanda */}
        <div
          onKeyDownCapture={(e) => {
            if (e.key === "Enter") shiftRef.current = e.shiftKey;
          }}
        >
          <SmartSearchField
            s={smart}
            id="build-search"
            prefix="build"
            placeholder={tx("manualBuilder.title_orchestra_singer_or_year")}
            label={tx("manualBuilder.search_for_a_song_to_add")}
            onEnter={(v) => addVersion(v)}
          />
        </div>
        <p className="text-caption1 mt-1 px-4 text-[var(--label-2)]" data-testid="build-search-hint">
          {tx("build.search_hint", {
            where: place
              ? place.kind === "tanda"
                ? tx("build.place_short_tanda", { n: place.tanda + 1 })
                : tx("build.place_short_song", { n: place.tanda + 1 })
              : selLabel,
          })}
        </p>
        {smart.works && (
          <SmartSearchResults
            s={smart}
            id="build-search"
            prefix="build"
            chips={false}
            onPick={(v) => addVersion(v)}
            rowTestId="build-version"
            renderVersion={(v, ctx) =>
              v.hit ? (
                <BuildVersionRow
                  v={v}
                  ctx={ctx}
                  fit={fitOf(v)}
                  onAdd={() => addVersion(v)}
                  more={versionMenu(v)}
                />
              ) : null
            }
          />
        )}
      </div>
      <div ref={suggestRef} className="scroll-mt-24">
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
            footer={loading ? tx("manualBuilder.updating") : undefined}
          >
            {shown.map((s) => (
              <SuggestionCard key={s.key} s={s} onPick={() => pick(s)} />
            ))}
            {/* 2026-11: nothing fits — two ways on, not a dead end */}
            {!loading && next && !next.suggestions.length && (
              <div className="cell flex-wrap gap-2 py-3" data-testid="build-nothing-fits">
                <span className="text-subhead min-w-[12rem] flex-1">{tx("build.nothing_fits")}</span>
                <button
                  type="button"
                  className="btn btn-ghost min-h-11 px-3"
                  onClick={() => {
                    setFilters({});
                    showAdd("search");
                    requestAnimationFrame(() => document.getElementById("build-search")?.focus());
                  }}
                  data-testid="build-search-instead"
                >
                  <Search size={16} aria-hidden /> {tx("build.search_instead")}
                </button>
                <Menu
                  label={tx("build.change_rhythm")}
                  className="btn btn-ghost min-h-11 px-3"
                  items={RHYTHM_ITEMS.map(([r, l]) => ({
                    label: l,
                    checked: rhythm === r,
                    onClick: () => {
                      setRhythm(r);
                      setReroll((x) => x + 1);
                    },
                  }))}
                >
                  <span data-testid="build-change-rhythm">{tx("build.change_rhythm")}</span>
                  <ChevronDown size={14} aria-hidden />
                </Menu>
              </div>
            )}
          </Group>
        )}
      </div>

      <div className="scroll-mt-24">
        <h2 className="section-head">{tx("build.judged_search")}</h2>
        <fieldset className="mt-2 flex flex-wrap items-center gap-1.5 border-0 p-0" data-testid="build-chips">
          <legend className="sr-only">{tx("builder.filters")}</legend>
          {RHYTHMS3.map((r) => (
            <button
              key={r}
              type="button"
              className="chip-filter build-chip"
              aria-pressed={filters.rhythm === r}
              onClick={() => setFilters((f) => ({ ...f, rhythm: f.rhythm === r ? undefined : r }))}
            >
              {rhythmWord(r)}
            </button>
          ))}
          <button
            type="button"
            className="chip-filter build-chip"
            aria-pressed={filters.voice === "instrumental"}
            onClick={() =>
              setFilters((f) => ({ ...f, voice: f.voice === "instrumental" ? undefined : "instrumental" }))
            }
          >
            {tx("tandaType.instrumental")}
          </button>
          <button
            type="button"
            className="chip-filter build-chip"
            aria-pressed={filters.voice === "vocal"}
            onClick={() => setFilters((f) => ({ ...f, voice: f.voice === "vocal" ? undefined : "vocal" }))}
          >
            {tx("tandaType.vocal")}
          </button>
          <button
            type="button"
            className="chip-filter build-chip"
            aria-pressed={!!filters.fav}
            aria-label={tx("builder.favourites")}
            onClick={() => setFilters((f) => ({ ...f, fav: f.fav ? undefined : true }))}
            data-testid="build-chip-fav"
          >
            <Heart size={14} aria-hidden fill={filters.fav ? "currentColor" : "none"} />
            <span>{tx("builder.fav_short")}</span>
          </button>
          {DECADES.map((d) => (
            <button
              key={d}
              type="button"
              className="chip-filter build-chip"
              aria-pressed={filters.decade === d}
              onClick={() => setFilters((f) => ({ ...f, decade: f.decade === d ? undefined : d }))}
            >
              {tx("builder.decade", { d })}
            </button>
          ))}
          <label className="sr-only" htmlFor="build-orch">
            {tx("builder.orchestra")}
          </label>
          <select
            id="build-orch"
            className="chip-filter build-chip build-select max-w-[12rem]"
            value={filters.orchestraId ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, orchestraId: e.target.value || undefined }))}
          >
            <option value="">{tx("builder.any_orchestra")}</option>
            {filters.orchestraId && !facets.orchestras.some((o) => o.id === filters.orchestraId) && (
              <option value={filters.orchestraId}>
                {NEW_TANDA_ORCHESTRAS.find(([id]) => id === filters.orchestraId)?.[1] ?? filters.orchestraId}
              </option>
            )}
            {facets.orchestras.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.n})
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="build-singer">
            {tx("builder.singer")}
          </label>
          <select
            id="build-singer"
            className="chip-filter build-chip build-select max-w-[12rem]"
            value={filters.singer ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, singer: e.target.value || undefined }))}
          >
            <option value="">{tx("builder.any_singer")}</option>
            {filters.singer && !facets.singers.some((o) => o.id === filters.singer) && (
              <option value={filters.singer}>{filters.singer}</option>
            )}
            {facets.singers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.n})
              </option>
            ))}
          </select>
          {anyFilter && (
            <button type="button" className="btn-plain min-h-11" onClick={() => setFilters({})}>
              {tx("builder.clear_filters")}
            </button>
          )}
        </fieldset>
        {hits.length > 0 && (
          <PlayListContext.Provider value={hitList}>
            <Group
              header={
                <span className="flex items-center justify-between gap-2">
                  <span>{tx("builder.adds_to", { where: selLabel })}</span>
                  <button
                    type="button"
                    className="btn-plain -my-2 min-h-11 normal-case"
                    aria-pressed={multi}
                    onClick={() => {
                      setMulti((v) => !v);
                      setPicked([]);
                    }}
                    data-testid="build-multi"
                  >
                    {multi ? <CheckSquare size={16} aria-hidden /> : <Square size={16} aria-hidden />}{" "}
                    {multi ? tx("builder.done_selecting") : tx("builder.select")}
                  </button>
                </span>
              }
              footer={
                open
                  ? tx("manualBuilder.sides_that_fit_tanda_join_it", { length: draft.length })
                  : tx("manualBuilder.each_side_starts_a_new_tanda")
              }
            >
              {hits.map((h) => {
                const on = picked.some((x) => x.id === h.song.id);
                const checking = sel !== "new" && selIndex >= 0;
                return (
                  <div
                    key={h.song.id}
                    data-testid="build-hit"
                    data-fits={checking ? String(h.fits) : undefined}
                  >
                    <PlayRow
                      song={asSong(h.song)}
                      where={tx("manualBuilder.search")}
                      leadingKind="tile"
                      leading={<SongArt song={h.song} label={rhythmWord(h.song.rhythm)} />}
                      sub={metaLine(family(h.song), yearText(h.song.year))}
                      lengthSec={h.song.durationSec ?? null}
                      trailing={
                        <>
                          {checking && (
                            <span
                              className={`text-subhead w-5 shrink-0 text-center ${h.fits ? "text-[var(--system-green,#1f8a4c)]" : "text-[var(--label-2)]"}`}
                              aria-label={h.fits ? tx("builder.fits", { where: selLabel }) : (h.why ?? "")}
                              role="img"
                              data-testid="build-fit"
                            >
                              {h.fits ? "✓" : "⚠"}
                            </span>
                          )}
                          {multi ? (
                            <button
                              type="button"
                              className="icon-btn icon-btn-bare -my-2 h-11 w-11 shrink-0"
                              aria-pressed={on}
                              aria-label={tx("builder.select_title", { title: h.song.title })}
                              data-testid="build-pick"
                              onClick={() => togglePick(h.song)}
                            >
                              {on ? <CheckSquare size={20} aria-hidden /> : <Square size={20} aria-hidden />}
                            </button>
                          ) : (
                            <>
                              <Tip text={tx("builder.add_to", { where: selLabel })}>
                                <button
                                  type="button"
                                  className="icon-btn -my-2 h-11 w-11 shrink-0"
                                  onClick={() => addHit(h)}
                                  aria-label={tx("manualBuilder.add_2", { title: h.song.title })}
                                  data-testid="build-add"
                                >
                                  <Plus size={18} aria-hidden />
                                </button>
                              </Tip>
                              <Menu
                                label={tx("builder.more_for", { title: h.song.title })}
                                className="icon-btn-bare -my-2 -mr-3 h-11 w-10"
                                items={[
                                  {
                                    label: tx("builder.start_new_with"),
                                    icon: ListPlus,
                                    onClick: () => void addTo([h.song], "new"),
                                  },
                                  ...draft.slice(0, 12).map((t, i) => ({
                                    label: tx("builder.add_to_tanda", { n: i + 1, family: family(t[0]!) }),
                                    icon: Plus,
                                    onClick: () => void addTo([h.song], i),
                                  })),
                                ]}
                              />
                            </>
                          )}
                        </>
                      }
                    />
                    {/* 2026-11: the warning on its own line, wrapped, never cut; a long reason behind ⓘ */}
                    {checking && !h.fits && h.why ? <WarnLine why={h.why} /> : null}
                  </div>
                );
              })}
            </Group>
          </PlayListContext.Provider>
        )}
        {multi && picked.length > 0 && (
          <div
            className="glass sticky z-10 mt-2 flex flex-wrap items-center gap-2 rounded-[var(--radius-m)] p-2"
            style={{ bottom: wide ? "1rem" : "calc(var(--chrome-stack) + 8px)" }}
            data-testid="build-multi-bar"
          >
            <span className="text-subhead min-w-0 flex-1 px-2">
              {tx("builder.n_selected", { n: picked.length })}
            </span>
            {selIndex >= 0 && sel !== "new" && (
              <button
                type="button"
                className="btn btn-ghost min-h-11"
                onClick={() => void addPicked(selIndex)}
                data-testid="build-add-picked"
              >
                {tx("builder.add_n_to", { n: picked.length, where: selLabel })}
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary min-h-11"
              onClick={() => void addPicked("new")}
              data-testid="build-add-picked-new"
            >
              {tx("builder.add_n_new", { n: picked.length })}
            </button>
          </div>
        )}
        {!draft.length && suggestOn && (
          <p className="section-foot mt-3 flex items-center gap-1.5">
            <Wand2 size={14} aria-hidden /> {tx("manualBuilder.or_let_tdj_compose_the_whole")}
          </p>
        )}
      </div>
    </div>
  );

  const targetMin = plan?.minutes ?? Math.round((options.hours ?? 4) * 60);
  return (
    <div className="mx-auto max-w-[1180px]">
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
        trailing={
          <span className="inline-flex items-center" data-testid="build-history">
            <Tip text={tx("build.undo_tip", { key: keys.undo })}>
              <button
                type="button"
                className="icon-btn icon-btn-bare h-11 w-11"
                onClick={() => void runHistory("undo", { scope: SCOPE })}
                disabled={!canUndo}
                aria-label={tx("editKeys.undo")}
                data-testid="build-undo"
              >
                <Undo2 size={20} aria-hidden />
              </button>
            </Tip>
            <Tip text={tx("build.redo_tip", { key: keys.redo })}>
              <button
                type="button"
                className="icon-btn icon-btn-bare h-11 w-11"
                onClick={() => void runHistory("redo", { scope: SCOPE })}
                disabled={!canRedo}
                aria-label={tx("editKeys.redo")}
                data-testid="build-redo"
              >
                <Redo2 size={20} aria-hidden />
              </button>
            </Tip>
            <Tip text={tx("build.reset_tip")}>
              <button
                type="button"
                className="icon-btn icon-btn-bare h-11 w-11"
                onClick={() => setResetOpen(true)}
                aria-label={tx("build.reset")}
                data-testid="build-reset"
              >
                <RotateCcw size={19} aria-hidden />
              </button>
            </Tip>
          </span>
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

      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
        <section aria-label={tx("manualBuilder.your_night")} className="build-stack min-w-0">
          <h2 className="section-head">{tx("manualBuilder.your_night")}</h2>
          {/* the night at a glance: its length against the target, the energy, and the guidance lines */}
          <Group data-testid="build-summary">
            <div className="cell flex-col items-stretch gap-1 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-headline tabular-nums" data-testid="build-length">
                  {tx("builder.length_of", { minutes, target: targetMin })}
                </span>
                <span className="text-footnote tabular-nums text-[var(--label-2)]">
                  {tx("builder.tandas_of", { n: draft.length, of: plan?.slots.length ?? "–" })}
                </span>
              </div>
              <span
                className="block h-1.5 overflow-hidden rounded-full bg-[var(--fill-3)]"
                role="progressbar"
                aria-label={tx("builder.night_length")}
                aria-valuemin={0}
                aria-valuemax={targetMin}
                aria-valuenow={Math.min(minutes, targetMin)}
              >
                <span
                  className="block h-full rounded-full bg-[var(--tint)]"
                  style={{ width: `${Math.min(100, (minutes / Math.max(1, targetMin)) * 100)}%` }}
                />
              </span>
              <Sparkline
                values={draft.map(tandaEnergy)}
                targets={(plan?.slots ?? [])
                  .slice(0, Math.max(draft.length + 1, 2))
                  .map((s) => s.targetEnergy)}
              />
            </div>
          </Group>
          <Group header={tx("builder.guidance")} data-testid="build-guide">
            {fillShown && (
              <FillPreviewCard
                p={fillShown}
                title={fillLabel(fillShown.scope)}
                before={draft.length}
                onApply={applyFill}
                onCancel={() => setPreview(null)}
              />
            )}
            {lines.map((l) => (
              <GuideRow key={l.key} line={l} onFix={runFix} busy={filling && l.fix?.kind === "fill"} />
            ))}
          </Group>

          <PlayListContext.Provider value={nightList}>
            <Group>
              <SwitchRow
                label={tx("builder.opening_cumparsita")}
                sub={tx("builder.opening_sub")}
                checked={meta.opening}
                onChange={(v) => setMeta((m) => ({ ...m, opening: v }))}
              />
            </Group>
            {!draft.length && (
              <Group footer={tx("manualBuilder.start_with_a_suggestion_or_search")}>
                <Row
                  label={tx("manualBuilder.nothing_yet")}
                  sub={tx("manualBuilder.your_first_tanda_goes_here")}
                />
              </Group>
            )}
            <div data-reorder-list className="build-stack">
              <AnimatePresence initial={false}>
                {draft.map((t, ti) => (
                  <motion.div
                    key={`${t[0]!.id}-${ti}`}
                    initial={{ opacity: 0, y: reduced ? 0 : 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: DUR.base, ease: EASE.out }}
                    className="relative"
                    data-reorder-row
                  >
                    <TandaBlock
                      t={t}
                      ti={ti}
                      count={draft.length}
                      selected={sel !== "new" && selIndex === ti}
                      isOpen={open === t}
                      size={sizes[t[0]!.rhythm as keyof typeof sizes] ?? 4}
                      onSelect={() => setSel(ti)}
                      onAddHere={() => {
                        setSel(ti);
                        setFilters({
                          rhythm: t[0]!.rhythm as Filters["rhythm"],
                          orchestraId: t[0]!.orchestraId,
                        });
                        showAdd("search");
                      }}
                      onMoveTanda={moveT}
                      dragTanda={dragTanda(ti)}
                      onMoveSide={(a, b) => moveSide(ti, a, b)}
                      onRemove={() => removeT(ti)}
                      onRemoveSide={(si) => setDraft(removeSong(draft, ti, si))}
                      onPlace={choosePlace}
                    />
                    {ti < draft.length - 1 && (
                      <CortinaSlot
                        c={meta.cortinas[ti] ?? null}
                        n={ti + 1}
                        onPick={() => void openCortinas(ti)}
                        onAuto={() => setCortina(ti, null)}
                      />
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            <Group>
              <SwitchRow
                label={tx("builder.closing_cumparsita")}
                sub={tx("builder.closing_sub")}
                checked={meta.closing}
                onChange={(v) => setMeta((m) => ({ ...m, closing: v }))}
              />
            </Group>
          </PlayListContext.Provider>

          <div className="flex flex-wrap gap-2" data-testid="build-actions">
            <button
              type="button"
              className="btn btn-ghost min-h-11"
              onClick={() => setNewOpen(true)}
              data-testid="build-new-tanda"
            >
              <ListPlus size={16} aria-hidden /> {tx("builder.new_tanda")}
            </button>
            <button
              type="button"
              className="btn btn-ghost min-h-11"
              onClick={suggestNextTanda}
              data-testid="build-suggest-next"
            >
              <Sparkles size={16} aria-hidden /> {tx("builder.suggest_next")}
            </button>
            {/* 2026-11: Fill is a menu (the next tanda, one cycle, the target length, everything), previewed first */}
            <span data-testid="build-fill">
              <Menu
                label={tx("build.fill_menu")}
                tip={tx("builder.fill_tip")}
                className="btn btn-ghost min-h-11"
                align="left"
                items={FILL_ITEMS.map((s) => ({
                  label: fillLabel(s),
                  icon: Wand2,
                  disabled: filling,
                  testId: `build-fill-${s}`,
                  onClick: () => void previewFill(s),
                }))}
              >
                <Wand2 size={16} aria-hidden /> {filling ? tx("builder.filling") : tx("build.fill")}
                <ChevronDown size={14} aria-hidden />
              </Menu>
            </span>
          </div>
          {/* phones: the header keeps no primary button, so the night is used from here */}
          {draft.length > 0 && (
            <button
              type="button"
              className="btn btn-primary min-h-[50px] w-full sm:hidden"
              onClick={finish}
              disabled={finishing}
              data-testid="build-finish-phone"
            >
              <Check size={18} aria-hidden /> {tx("manualBuilder.use_this_night")}
            </button>
          )}
          {/* phones: room under the last row for the floating Add button */}
          {!wide && <div className="h-16" aria-hidden />}
        </section>

        {wide ? (
          <aside
            aria-label={tx("builder.add")}
            className="min-w-0 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto lg:pb-6"
          >
            {addPanel}
          </aside>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-primary fixed right-4 z-20 min-h-[50px] px-5 shadow-lg"
              style={{ bottom: "calc(var(--chrome-stack) + 10px)" }}
              onClick={() => setAddOpen(true)}
              data-testid="build-add-open"
            >
              <Plus size={18} aria-hidden /> {tx("builder.add")}
            </button>
            <Sheet
              open={addOpen}
              onClose={() => setAddOpen(false)}
              title={tx("builder.add_to_title", { where: selLabel })}
              trailing={tx("builder.done")}
              detents={["large"]}
              testId="build-add-sheet"
            >
              {addPanel}
            </Sheet>
          </>
        )}
      </div>

      {/* 2026-11: Reset, confirmed once: an empty night or tonight's night (either one undoable) */}
      <Sheet
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title={tx("build.reset_title")}
        testId="build-reset-sheet"
        detents={["medium"]}
      >
        <Group footer={tx("build.reset_footer")}>
          <Row
            label={tx("build.reset_empty")}
            sub={tx("build.reset_empty_sub")}
            tile={
              <span className="tile bg-[var(--destructive)]" aria-hidden>
                <Trash2 size={16} className="text-white" />
              </span>
            }
            onClick={resetEmpty}
            data-testid="build-reset-empty"
          />
          <Row
            label={tx("build.reset_tonight")}
            sub={
              tonight?.tandas.length
                ? tx("build.reset_tonight_sub", { name: tonight.name, n: tonight.tandas.length })
                : tx("build.reset_tonight_none")
            }
            tile={
              <span className="tile bg-[var(--tint)]" aria-hidden>
                <RotateCcw size={16} className="text-white" />
              </span>
            }
            onClick={tonight?.tandas.length ? resetTonight : undefined}
            disabled={!tonight?.tandas.length}
            data-testid="build-reset-tonight"
          />
        </Group>
      </Sheet>

      {/* New tanda: its rhythm and orchestra (or "Suggest"), then Add opens filtered */}
      <Sheet
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title={tx("builder.new_tanda")}
        testId="build-new-sheet"
        detents={["medium", "large"]}
      >
        <Group header={tx("builder.rhythm")}>
          <SegmentedRow
            label={tx("builder.rhythm")}
            value={newRhythm}
            items={RHYTHMS3.map((r) => [r, rhythmWord(r)] as [typeof r, string])}
            onChange={setNewRhythm}
          />
        </Group>
        <Group header={tx("builder.orchestra")} footer={tx("builder.new_tanda_footer")}>
          <Row
            label={tx("builder.suggest_one")}
            sub={tx("builder.suggest_one_sub")}
            tile={
              <span className="tile bg-[var(--tint)]" aria-hidden>
                <Sparkles size={16} className="text-white" />
              </span>
            }
            chevron
            onClick={() => startNewTanda(null)}
            data-testid="build-new-suggest"
          />
          {NEW_TANDA_ORCHESTRAS.map(([id, name]) => (
            <Row
              key={id}
              label={name}
              chevron
              onClick={() => startNewTanda(id)}
              data-testid="build-new-orch"
            />
          ))}
        </Group>
      </Sheet>

      {/* Pick a cortina: the pool, each playing from its chorus; Auto lets the night pick */}
      <Sheet
        open={cortinaAt !== null}
        onClose={() => setCortinaAt(null)}
        title={tx("builder.pick_cortina_after", { n: (cortinaAt ?? 0) + 1 })}
        testId="build-cortina-sheet"
        detents={["large"]}
      >
        <Group footer={tx("builder.cortina_footer")}>
          <Row
            label={tx("builder.cortina_auto")}
            sub={tx("builder.cortina_auto_sub")}
            onClick={() => cortinaAt !== null && setCortina(cortinaAt, null)}
            data-testid="build-cortina-auto"
          />
          {!pool && <div className="cell text-[var(--label-2)]">{tx("manualBuilder.updating")}</div>}
          {(pool ?? []).map((c) => (
            <div key={c.id} className="relative flex items-center pr-2" data-testid="build-cortina-option">
              <div className="min-w-0 flex-1">
                <Row
                  label={`${c.artist} – ${c.title}`}
                  sub={metaLine(c.culture, c.genre, c.year ? String(c.year) : null)}
                  value={c.startSec ? tx("builder.from_chorus", { at: fmtLen(c.startSec) }) : undefined}
                  onClick={() => cortinaAt !== null && setCortina(cortinaAt, c)}
                />
              </div>
              <CortinaPlayButton cortina={c} where={tx("builder.cortinas")} />
            </div>
          ))}
        </Group>
      </Sheet>
    </div>
  );
}

const padded = <T,>(list: Array<T | null>, n: number): Array<T | null> =>
  Array.from({ length: Math.max(0, n) }, (_, i) => list[i] ?? null);

/** the engine's reason as a line: its first clause, capitalised ("Another orchestra: starts a new tanda") */
function warnShort(why: string): { short: string; long: boolean } {
  const w = why.trim();
  const cap = w.charAt(0).toUpperCase() + w.slice(1);
  if (cap.length <= 56) return { short: cap, long: false };
  const cut = cap.search(/[;(]| — /);
  return { short: cut > 12 ? cap.slice(0, cut).trim() : cap, long: true };
}
/** a search result's ⚠: one wrapped line (never cut), the whole reason behind ⓘ when it is long */
function WarnLine({ why }: { why: string }) {
  const { short, long } = warnShort(why);
  const full = why.charAt(0).toUpperCase() + why.slice(1);
  return (
    <div
      className="build-warn text-footnote -mt-1 px-[var(--cell-px,16px)] pb-2 pl-[calc(var(--cell-px,16px)+56px)] text-[var(--label-2)]"
      data-testid="build-why"
    >
      <span aria-hidden>⚠</span>
      <span className="min-w-0 flex-1">{short}</span>
      {long && short !== full && (
        <ReasonInfo label={tx("build.why_full")} lines={[full]} testId="build-why-info" />
      )}
    </div>
  );
}

/** the guide's preview of a fill: what it adds, the night after it, Apply / Cancel (Apply is one undoable edit) */
function FillPreviewCard({
  p,
  title,
  before,
  onApply,
  onCancel,
}: {
  p: FillPreview;
  title: string;
  before: number;
  onApply: () => void;
  onCancel: () => void;
}) {
  const newOnes = p.draft.slice(before);
  const finished = p.added === 0 && p.sides > 0;
  return (
    <div
      className="cell flex-col items-stretch gap-2 py-3"
      data-testid="build-fill-preview"
      data-scope={p.scope}
    >
      <span className="flex items-center gap-2">
        <Wand2 size={16} className="shrink-0 text-[var(--tint)]" aria-hidden />
        <span className="text-headline min-w-0 flex-1">{title}</span>
      </span>
      <span className="text-subhead" data-testid="build-fill-summary">
        {p.added || p.sides
          ? finished
            ? tx("build.fill_preview_finish", { sides: p.sides, minutes: p.minutes })
            : tx("build.fill_preview", {
                n: p.added,
                rhythms: p.rhythms.join(" "),
                total: p.draft.length,
                minutes: p.minutes,
              })
          : tx("build.fill_nothing")}
      </span>
      {newOnes.length > 0 && (
        <ol className="text-footnote list-decimal pl-5 text-[var(--label-2)]" start={before + 1}>
          {newOnes.slice(0, 8).map((t) => (
            <li key={t[0]!.id} className="truncate">
              {family(t[0]!)} · {rhythmWord(t[0]!.rhythm)} · {t.length}
            </li>
          ))}
          {newOnes.length > 8 && <li className="list-none">…</li>}
        </ol>
      )}
      <span className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary min-h-11"
          onClick={onApply}
          disabled={!p.added && !p.sides}
          data-testid="build-fill-apply"
        >
          <Check size={16} aria-hidden /> {tx("build.fill_apply")}
        </button>
        <button
          type="button"
          className="btn btn-ghost min-h-11"
          onClick={onCancel}
          data-testid="build-fill-cancel"
        >
          {tx("build.fill_cancel")}
        </button>
      </span>
    </div>
  );
}

/** one guidance line: how it stands, and its one-tap fix */
function GuideRow({ line, onFix, busy }: { line: GuideLine; onFix: (f: GuideFix) => void; busy: boolean }) {
  const v = line.vals;
  const text =
    line.key === "length"
      ? tx(line.ok ? "builder.g_length_ok" : "builder.g_length", {
          minutes: v.minutes ?? 0,
          target: v.target ?? 0,
        })
      : line.key === "bigfour"
        ? line.ok
          ? tx("builder.g_bigfour_ok")
          : tx("builder.g_bigfour", { have: v.have ?? 0, of: v.of ?? 4, missing: v.missing ?? "" })
        : line.key === "energy"
          ? line.ok
            ? tx("builder.g_energy_ok")
            : tx(v.dir === "hot" ? "builder.g_energy_hot" : "builder.g_energy_calm", {
                n: v.n ?? 0,
                energy: v.energy ?? 0,
                target: v.target ?? 0,
              })
          : line.key === "cycle"
            ? line.ok
              ? tx("builder.g_cycle_ok", { have: v.have ?? "", want: v.want ?? "" })
              : tx("builder.g_cycle", {
                  n: v.n ?? 0,
                  rhythm: rhythmWord(String(v.rhythm ?? "")),
                  want: v.want ?? "",
                })
            : tx("builder.g_cortinas", { picked: v.picked ?? 0, auto: v.auto ?? 0 });
  const f = line.fix;
  const fixLabel = !f
    ? null
    : f.kind === "fill"
      ? tx("builder.fill_rest")
      : f.kind === "remove-last"
        ? tx("builder.fix_remove_last")
        : f.kind === "orchestra"
          ? tx("builder.fix_orchestra", { name: BIG_FOUR_NAME[f.id] ?? f.id })
          : f.kind === "rhythm"
            ? tx("builder.fix_rhythm", { rhythm: rhythmWord(f.rhythm) })
            : f.kind === "suggest"
              ? tx("builder.fix_suggest")
              : tx("builder.fix_cortina");
  return (
    <div
      className="cell flex-wrap gap-x-3 gap-y-0"
      data-testid="build-guide-line"
      data-key={line.key}
      data-ok={line.ok || undefined}
    >
      <span
        className={`text-subhead w-5 shrink-0 text-center ${line.ok ? "text-[var(--tint-text,var(--tint))]" : "text-[var(--label-2)]"}`}
        aria-hidden
      >
        {line.ok ? "✓" : "!"}
      </span>
      <span className="text-subhead min-w-[12rem] flex-1">{text}</span>
      {f && fixLabel && (
        <button
          type="button"
          className="btn btn-ghost min-h-11 shrink-0 px-3 max-sm:ml-8"
          onClick={() => onFix(f)}
          disabled={busy}
          data-testid="build-fix"
        >
          {fixLabel}
        </button>
      )}
    </div>
  );
}

/** a suggestion: a whole tanda (its sides play on a tap) or one side, its reasons, one-tap add */
function SuggestionCard({ s, onPick }: { s: Suggestion; onPick: () => void }) {
  const reasons = suggestReasons(s);
  const list = useMemo(
    () => ({
      label: family(s),
      items: s.songs.map((x): PlayItem => ({ kind: "song", song: asSong(x), where: family(s) })),
    }),
    [s],
  );
  return (
    <div
      className="cell flex-col items-stretch gap-1 py-3"
      data-testid="build-suggestion"
      aria-description={reasons.join(" · ")}
    >
      <div className="flex items-start gap-3">
        {s.songs[0] ? (
          <SongArt song={{ ...s.songs[0], rhythm: s.rhythm }} label={rhythmWord(s.rhythm)} />
        ) : (
          <RhythmTile rhythm={s.rhythm} label={rhythmWord(s.rhythm)} />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate">{s.kind === "song" ? s.songs[0]!.title : family(s)}</span>
          <span className="text-footnote block truncate text-[var(--label-2)]">
            {s.kind === "song"
              ? metaLine(yearText(s.songs[0]!.year), tx("manualBuilder.energy", { energy: s.energy }))
              : metaLine(
                  yearsText(s.years),
                  tx("manualBuilder.energy", { energy: s.energy }),
                  totalText(tandaTotal(s.songs)),
                )}
          </span>
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            {reasons.slice(0, 3).map((r) => (
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
            onClick={onPick}
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
      {s.kind === "tanda" && (
        <PlayListContext.Provider value={list}>
          <div className="-mx-[var(--cell-px)]">
            {s.songs.map((x, k) => (
              <PlayRow
                key={x.id}
                song={asSong(x)}
                where={family(s)}
                leadingKind="num"
                leading={
                  <span className="text-footnote inline-block w-5 tabular-nums text-[var(--label-2)]">
                    {k + 1}
                  </span>
                }
                title={<span className="text-subhead">{x.title}</span>}
                lengthSec={x.durationSec ?? null}
                testId="build-suggestion-song"
              />
            ))}
          </div>
        </PlayListContext.Provider>
      )}
    </div>
  );
}

/** the cortina slot between two tandas: Auto, or the DJ's pick (it plays from its chorus) */
function CortinaSlot({
  c,
  n,
  onPick,
  onAuto,
}: {
  c: Cortina | null;
  n: number;
  onPick: () => void;
  onAuto: () => void;
}) {
  return (
    <div
      className="mt-2 flex items-center gap-2 px-4 text-[var(--label-2)]"
      data-testid="build-cortina"
      data-picked={c ? c.id : undefined}
    >
      <span className="wave" aria-hidden>
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="text-footnote min-w-0 flex-1 truncate">
        {c
          ? tx("builder.cortina_picked", { title: `${c.artist} – ${c.title}` })
          : tx("builder.cortina_auto_line", { n })}
      </span>
      {c && <CortinaPlayButton cortina={c} where={tx("play.cortina_after", { n })} />}
      <button type="button" className="btn-plain min-h-11" onClick={onPick} data-testid="build-cortina-pick">
        {tx("builder.pick_cortina")}
      </button>
      {c && (
        <button type="button" className="btn-plain min-h-11" onClick={onAuto}>
          {tx("builder.cortina_auto")}
        </button>
      )}
    </div>
  );
}

/** one tanda of the draft: its header (type, total, move, add, remove) and its sides (play, drag, move, remove) */
function TandaBlock({
  t,
  ti,
  count,
  selected,
  isOpen,
  size,
  onSelect,
  onAddHere,
  onMoveTanda,
  dragTanda,
  onMoveSide,
  onRemove,
  onRemoveSide,
  onPlace,
}: {
  t: DraftSong[];
  ti: number;
  count: number;
  selected: boolean;
  isOpen: boolean;
  size: number;
  onSelect: () => void;
  onAddHere: () => void;
  onMoveTanda: (from: number, to: number) => void;
  dragTanda: ReturnType<ReturnType<typeof useDragReorder>>;
  onMoveSide: (from: number, to: number) => void;
  onRemove: () => void;
  onRemoveSide: (si: number) => void;
  /** 2026-11: the next add goes to a place (a new tanda before / after, a side before / after) */
  onPlace: (p: { kind: "tanda"; tanda: number } | { kind: "song"; tanda: number; at: number }) => void;
}) {
  const s0 = t[0]!;
  const ys = t.map((s) => s.year ?? 0).filter(Boolean);
  const dragSide = useDragReorder(onMoveSide);
  const total = tandaTotal(t);
  const where = tx("play.tanda", { n: ti + 1 });
  return (
    <Group
      header={tx("manualBuilder.tanda_2", {
        p1: ti + 1,
        p2: isOpen ? ` ${tx("manualBuilder.of", { length: t.length, p1: size })}` : "",
      })}
      data-testid="build-tanda"
      data-selected={selected || undefined}
      className={selected ? "[&>div]:ring-2 [&>div]:ring-inset [&>div]:ring-[var(--tint)]" : ""}
    >
      <div className="cell" data-leading="tile">
        <button
          type="button"
          className="drag-handle icon-btn icon-btn-bare -my-2 -ml-3 h-11 w-8 shrink-0 text-[var(--label-3)]"
          aria-label={tx("builder.drag_tanda", { n: ti + 1 })}
          data-testid="build-tanda-drag"
          {...dragTanda}
        >
          <GripVertical size={16} aria-hidden />
        </button>
        <button
          type="button"
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
          onClick={onSelect}
          aria-pressed={selected}
          aria-label={tx("builder.select_tanda", { n: ti + 1, family: family(s0) })}
          data-testid="build-tanda-select"
        >
          <span data-testid="build-tanda-art">
            <SongArt song={s0} label={rhythmWord(s0.rhythm)} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate">{family(s0)}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <TandaTypeBadge
                rhythm={s0.rhythm}
                singer={t.find((s) => s.vocal)?.singer ?? null}
                vocal={t.some((s) => s.vocal)}
                mixed={isMixedTanda({ songs: t })}
                songs={t}
              />
              <span className="text-caption1 tabular-nums text-[var(--label-2)]" data-testid="tanda-total">
                {tx("play.songs_total", { n: t.length, total: totalText(total) })}
                {ys.length
                  ? ` · ${Math.min(...ys)}${Math.max(...ys) !== Math.min(...ys) ? `–${Math.max(...ys)}` : ""}`
                  : ""}
              </span>
            </span>
          </span>
        </button>
        <Tip text={tx("builder.add_here")}>
          <button
            type="button"
            className="icon-btn icon-btn-bare -my-2 h-11 w-11"
            onClick={onAddHere}
            aria-label={tx("builder.add_to_tanda_n", { n: ti + 1 })}
            data-testid="build-add-here"
          >
            <Plus size={18} aria-hidden />
          </button>
        </Tip>
        {ti > 0 && (
          <Tip text={tx("manualBuilder.move_up")}>
            <button
              type="button"
              className="icon-btn icon-btn-bare -my-2 h-11 w-11"
              onClick={() => onMoveTanda(ti, ti - 1)}
              aria-label={tx("manualBuilder.move_tanda_up", { p1: ti + 1 })}
            >
              <ArrowUp size={16} aria-hidden />
            </button>
          </Tip>
        )}
        <Menu
          label={tx("builder.tanda_actions", { n: ti + 1 })}
          className="icon-btn-bare -my-2 h-11 w-10"
          items={[
            {
              label: tx("builder.move_tanda_up"),
              icon: ArrowUp,
              onClick: () => onMoveTanda(ti, ti - 1),
              disabled: ti === 0,
            },
            {
              label: tx("builder.move_tanda_down"),
              icon: ArrowDown,
              onClick: () => onMoveTanda(ti, ti + 1),
              disabled: ti >= count - 1,
            },
            {
              label: tx("spot.insert_tanda_before"),
              icon: ListPlus,
              onClick: () => onPlace({ kind: "tanda", tanda: ti }),
            },
            {
              label: tx("spot.insert_tanda_after"),
              icon: ListPlus,
              onClick: () => onPlace({ kind: "tanda", tanda: ti + 1 }),
            },
            {
              label: tx("manualBuilder.remove_this_tanda"),
              icon: Trash2,
              onClick: onRemove,
              destructive: true,
            },
          ]}
        />
        <Tip text={tx("manualBuilder.remove_this_tanda")}>
          <button
            type="button"
            className="icon-btn icon-btn-bare -mr-2 -my-2 h-11 w-11 text-[var(--destructive)]"
            onClick={onRemove}
            aria-label={tx("manualBuilder.remove_tanda", { p1: ti + 1 })}
          >
            <Trash2 size={16} aria-hidden />
          </button>
        </Tip>
      </div>
      <ol data-reorder-list>
        {t.map((s, si) => (
          <li key={s.id} className="relative" data-reorder-row data-testid="build-side">
            <PlayRow
              song={asSong(s)}
              where={where}
              leadingKind="art"
              leading={
                <Artwork orchestra={s.orchestra} orchestraId={s.orchestraId} song={asSong(s)} size="s" />
              }
              sub={metaLine(
                `${si + 1}.`,
                yearText(s.year),
                s.energy !== undefined && tx("manualBuilder.energy", { energy: s.energy }),
              )}
              lengthSec={s.durationSec ?? null}
              trailing={
                <>
                  <button
                    type="button"
                    className="drag-handle icon-btn icon-btn-bare -my-2 h-11 w-11 shrink-0 text-[var(--label-3)]"
                    aria-label={tx("play.drag_to_reorder", { title: s.title })}
                    data-testid="drag-handle"
                    {...dragSide(si)}
                  >
                    <GripVertical size={16} aria-hidden />
                  </button>
                  <Menu
                    label={tx("play.song_actions", { title: s.title })}
                    className="icon-btn-bare -my-2 h-11 w-10"
                    items={[
                      {
                        label: tx("play.move_up"),
                        icon: ArrowUp,
                        onClick: () => onMoveSide(si, si - 1),
                        disabled: si === 0,
                      },
                      {
                        label: tx("play.move_down"),
                        icon: ArrowDown,
                        onClick: () => onMoveSide(si, si + 1),
                        disabled: si >= t.length - 1,
                      },
                      {
                        label: tx("spot.add_song_before"),
                        icon: ListPlus,
                        onClick: () => onPlace({ kind: "song", tanda: ti, at: si }),
                      },
                      {
                        label: tx("spot.add_song_after"),
                        icon: ListPlus,
                        onClick: () => onPlace({ kind: "song", tanda: ti, at: si + 1 }),
                      },
                      {
                        label: tx("manualBuilder.remove_this_side"),
                        icon: Trash2,
                        onClick: () => onRemoveSide(si),
                        destructive: true,
                      },
                    ]}
                  />
                  <Tip text={tx("manualBuilder.remove_this_side")}>
                    <button
                      type="button"
                      className="icon-btn icon-btn-bare -mr-2 -my-2 h-11 w-11 text-[var(--label-3)]"
                      onClick={() => onRemoveSide(si)}
                      aria-label={tx("manualBuilder.remove", { title: s.title })}
                    >
                      <Trash2 size={15} aria-hidden />
                    </button>
                  </Tip>
                </>
              }
            />
          </li>
        ))}
      </ol>
    </Group>
  );
}
