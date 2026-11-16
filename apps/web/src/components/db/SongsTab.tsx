"use client";
import { missingFields, type SongFilters, type SongSearchHit, songData } from "@tdj/core";
import { AudioWaveform, CircleMinus, DatabaseZap, Link2, Trash2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { SEARCH_FOCUS_EVENT } from "@/components/Nav";
import { Highlight } from "@/components/search/Highlight";
import { filtersActive, SearchChips } from "@/components/search/SearchChips";
import { analyseSong, keyLabel } from "@/lib/analyze";
import { djDataOf } from "@/lib/artwork";
import { effectiveSong } from "@/lib/audio";
import { fillMissing } from "@/lib/fill/client";
import { lazy, lower, t as tx } from "@/lib/i18n";
import { rise, spring } from "@/lib/motion";
import { youtubeVideoUrl } from "@/lib/openLink";
import { tapPlay } from "@/lib/playback";
import { bpmChoice } from "@/lib/songData";
import { SOURCE_LABEL } from "@/lib/songView";
import { spotifyUri, spotifyUrl } from "@/lib/spotifyLink";
import { toast } from "@/lib/toast";
import type { Song, SongPatch } from "@/lib/types";
import { useSongSearch } from "@/lib/useSongSearch";
import { metaLine, yearText } from "@/lib/year";
import { loadMatches } from "@/lib/youtubeMatches";
import { ActionRow, FieldRow, Group, PickerRow, RhythmTile, Row, SwitchRow } from "../Form";
import { ResolveSheet } from "../ResolveSheet";
import { SearchField } from "../SearchField";
import { Sheet } from "../Sheet";
import { SwipeRow } from "../SwipeRow";
import { Artwork } from "../ui/Artwork";
import { EraBadge } from "../ui/EraBadge";
import { PlayRow } from "../ui/PlayRow";
import { rhythmWord } from "../ui/TandaTypeBadge";
import { Tip } from "../ui/Tip";
import { Empty, patchMap, useDb, useDbEdit, ValueCell } from "./shared";
import { VersionsRow } from "./Versions";

const RHYTHMS = ["tango", "vals", "milonga", "cancion", "foxtrot", "other"] as const;
const RHYTHM_LABEL: Record<string, string> = {
  tango: "Tango",
  vals: "Vals",
  milonga: "Milonga",
  cancion: "Canción",
  foxtrot: "Foxtrot",
  other: "Other",
};
const labelOf = (r: string) => RHYTHM_LABEL[r] ?? r[0]!.toUpperCase() + r.slice(1);
const RHYTHM_ITEMS: Array<[string, string]> = RHYTHMS.map((r) => [r, labelOf(r)]);
const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
const eraOf = (y?: number): Song["era"] =>
  !y
    ? "unknown"
    : y < 1926
      ? "guardia-vieja"
      : y < 1935
        ? "guardia-nueva"
        : y < 1940
          ? "golden-early"
          : y < 1948
            ? "golden-peak"
            : y < 1956
              ? "golden-late"
              : y < 1970
                ? "post-golden"
                : y < 1995
                  ? "nuevo"
                  : "contemporary";
const num = (v: string) => (v === "" ? undefined : Number(v));
/** a value's source in one case: a service keeps its name (Deezer, Spotify), a description is lower case ("yours") */
const srcWord = (l: string) => (/^(Deezer|Spotify|MusicBrainz|Apple|T-DJ)/.test(l) ? l : lower(l));
const FILL_LABEL: Record<string, string> = {
  bpm: "BPM",
  key: "key",
  gainDb: "level",
  artwork: "artwork",
  release: "date",
};
/** round 21: where an enriched value came from */
const SOURCE: Record<string, string> = {
  get dj() {
    return tx("db.songsTab.yours");
  },
  deezer: "Deezer",
  get audio() {
    return tx("db.songsTab.analysed_preview");
  },
  get index() {
    return tx("db.songsTab.t_dj_catalogue");
  },
  get knowledge() {
    return tx("db.songsTab.tango_reference");
  },
  get heuristic() {
    return tx("db.songsTab.guessed_from_the_era");
  },
};
const VOCAL_STYLE_ITEMS: Array<[string, string]> = lazy(() => [
  ["cantor", tx("db.songsTab.singer_led_cantor")],
  ["estribillo", tx("db.songsTab.rhythm_led_estribillista")],
  ["unknown", tx("db.songsTab.unknown")],
]);

export function SongsTab() {
  const { overrides, update } = useDb();
  const editing = useDbEdit();
  const reduced = useReducedMotion();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<SongFilters>({});
  const [active, setActive] = useState(-1);
  const [adding, setAdding] = useState(false);
  const [finding, setFinding] = useState<Song | null>(null);
  const [analysing, setAnalysing] = useState<string | null>(null);
  const [filling, setFilling] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    orchestra: "",
    singer: "",
    rhythm: "tango",
    year: "",
    energy: "",
    uri: "",
  });
  // 2026-11: the shared search (POST /api/search → core searchSongs): words across fields, typos, inline filters,
  // chips with counts; the cards below stay editable, keyed by song id, so a new answer never loses an edit
  const search = useSongSearch(q, { filters, limit: 30 });
  const active2 = filtersActive(filters) > 0;
  const shown = q.trim().length >= 2 || active2;
  const hits: SongSearchHit[] = shown ? (search.data?.items ?? []) : [];
  const rows: Song[] = hits.map((h) => h.song);
  const searching = search.loading;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new answer starts the keyboard selection over
  useEffect(() => setActive(-1), [search.data]);
  useEffect(() => {
    if (active >= 0) document.getElementById(`db-song-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && rows.length) {
      e.preventDefault();
      setActive((a) => Math.min(rows.length - 1, a + 1));
    } else if (e.key === "ArrowUp" && rows.length) {
      e.preventDefault();
      setActive((a) => Math.max(-1, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const s = rows[active >= 0 ? active : 0];
      if (s) {
        setActive(active >= 0 ? active : 0);
        // the app-wide tap-to-play (lib/playback.ts), as a tap on the row's header
        void tapPlay({ kind: "song", song: effectiveSong(s, overrides), where: tx("play.database") }, null, {
          find: () => setFinding(s),
        });
      }
    } else if (e.key === "Escape" && q) {
      e.preventDefault();
      setQ("");
    }
  };

  const songs = overrides.songs ?? {};
  /**
   * A field edit also keeps the derived fields the engine builds tandas from in step (mirrors the index build):
   * singer → singerId + vocal, year → era. Reverting a field reverts the derived ones too.
   */
  const setField = (s: Song, field: string, value: unknown) =>
    update((o) => {
      let next = patchMap(
        o.songs,
        s.id,
        field as keyof Song & string,
        value,
        (s as unknown as Record<string, unknown>)[field],
      );
      const cur = next[s.id] ?? {};
      if (field === "singer") {
        const singer = typeof cur.singer === "string" ? cur.singer.trim() : undefined;
        next = patchMap(
          next,
          s.id,
          "singerId",
          singer === undefined ? undefined : singer ? slug(singer) : null,
          s.singerId,
        );
        next = patchMap(next, s.id, "vocal", singer === undefined ? undefined : !!singer, s.vocal);
      }
      if (field === "year") {
        const year = typeof cur.year === "number" && Number.isFinite(cur.year) ? cur.year : undefined;
        next = patchMap(next, s.id, "era", year === undefined ? undefined : eraOf(year), s.era);
      }
      return { ...o, songs: next };
    });
  const analyse = async (s: Song) => {
    setAnalysing(s.id);
    try {
      await analyseSong(s);
    } finally {
      setAnalysing(null);
    }
  };
  /** round 22: ask every connected source for this side's missing BPM, key, level, artwork and date */
  const fill = async (s: Song, force = false) => {
    setFilling(s.id);
    try {
      const r = await fillMissing(s, { force });
      const label = (f: string) => FILL_LABEL[f] ?? f;
      toast(
        r.filled.length
          ? tx("db.songsTab.filled_for", { p1: r.filled.map(label).join(", "), title: s.title })
          : r.asked.length
            ? r.stillMissing.length
              ? tx("db.songsTab.no_new_data_missing", {
                  title: s.title,
                  missing: r.stillMissing.map(label).join(", "),
                })
              : tx("db.songsTab.no_new_data", { title: s.title })
            : tx("db.songsTab.is_up_to_date_with_your", { title: s.title }),
      );
    } finally {
      setFilling(null);
    }
  };
  const revert = (id: string) =>
    update((o) => {
      const next = { ...(o.songs ?? {}) };
      delete next[id];
      return { ...o, songs: next };
    });
  const removeOwn = (id: string) =>
    update((o) => ({ ...o, addedSongs: (o.addedSongs ?? []).filter((x) => x.id !== id) }));
  const addSong = () => {
    if (!form.title.trim() || !form.orchestra.trim()) return;
    const year = form.year ? Number(form.year) : null;
    const song: Song = {
      id: `own-${slug(form.orchestra)}-${slug(form.title)}-${Date.now().toString(36)}`,
      title: form.title.trim(),
      rhythm: form.rhythm as Song["rhythm"],
      orchestra: form.orchestra.trim(),
      orchestraId: slug(form.orchestra),
      singer: form.singer.trim() || null,
      singerId: form.singer.trim() ? slug(form.singer) : null,
      vocal: !!form.singer.trim(),
      year,
      era: eraOf(year ?? undefined),
      energy: form.energy ? Number(form.energy) : undefined,
      spotify: form.uri.trim() ? { uri: spotifyUri(form.uri) } : null,
      source: "own",
    };
    update((o) => ({ ...o, addedSongs: [...(o.addedSongs ?? []), song] }));
    setForm({ title: "", orchestra: "", singer: "", rhythm: "tango", year: "", energy: "", uri: "" });
    setAdding(false);
  };
  const field = (id: string, label: string, key: keyof typeof form, extra: Record<string, unknown> = {}) => (
    <FieldRow label={label} id={id}>
      <input
        id={id}
        className="field field-value min-w-0 flex-1"
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        autoComplete="off"
        {...extra}
      />
    </FieldRow>
  );

  return (
    <div>
      <SearchField
        id="db-search"
        value={q}
        onChange={setQ}
        placeholder={tx("db.songsTab.title_orchestra_singer_or_year")}
        label={tx("db.songsTab.search_the_index")}
        busy={searching}
        className="mt-3"
        tip={tx("search.syntax_tip")}
        onFocusChange={(f) => window.dispatchEvent(new CustomEvent(SEARCH_FOCUS_EVENT, { detail: f }))}
        inputProps={{
          onKeyDown,
          "aria-controls": "db-results",
          "aria-activedescendant": active >= 0 ? `db-song-${active}` : undefined,
        }}
      />
      <SearchChips
        facets={shown ? search.data?.facets : null}
        filters={filters}
        onChange={setFilters}
        favourites={false}
        more={shown}
        idPrefix="db-chip"
      />
      {!shown && <Empty crate>{tx("db.songsTab.search_the_index_to_edit_a")}</Empty>}
      {shown && search.data && !searching && rows.length === 0 && (
        <Empty>
          {tx("db.songsTab.nothing_matches", { q })}
          {search.data.suggestion && (
            <>
              {" "}
              {tx("search.did_you_mean")}{" "}
              <button
                type="button"
                className="btn-plain min-h-11 font-semibold"
                data-testid="db-did-you-mean"
                onClick={() => setQ(search.data!.suggestion!)}
              >
                {search.data.suggestion}
              </button>
              ?
            </>
          )}
        </Empty>
      )}
      {rows.length > 0 && (
        <p className="section-head" data-testid="db-total">
          {tx("library.results", { length: search.data?.total ?? rows.length })}
        </p>
      )}
      {rows.length > 0 && (
        <div className="min-w-0 lg:grid lg:grid-cols-2 lg:gap-x-4" id="db-results">
          {rows.map((s, i) => {
            const hl = hits[i]!.highlights;
            const p = (songs[s.id] ?? {}) as SongPatch & {
              hidden?: boolean;
              hiddenScope?: "title" | "copy";
            };
            const v = { ...s, ...p };
            const edited = !!songs[s.id];
            const eff = effectiveSong(s, overrides);
            const res = eff.resolved;
            const scraped = overrides.scraped?.[s.id];
            const data = songData(eff, scraped, djDataOf(p));
            // wave 2: one BPM per side; every value with its source below it, the used one marked
            const bpm = bpmChoice(eff, scraped, djDataOf(p));
            const missing = missingFields(data);
            const from = (f: keyof typeof data) =>
              data[f] ? ` · ${SOURCE_LABEL[data[f]!.source] ?? data[f]!.source}` : "";
            return (
              <Group
                key={s.id}
                id={`db-song-${i}`}
                data-song={s.id}
                data-active={i === active ? "" : undefined}
                aria-current={i === active ? "true" : undefined}
                footer={edited ? tx("db.songsTab.edited_revert_in_edit_mode") : undefined}
                className={`min-w-0 ${i === active ? "rounded-xl outline-2 outline-offset-2 outline-[var(--tint)]" : ""}`}
              >
                {/* 2026-11: the side's header plays it (a tap on the cover or the title) */}
                <PlayRow
                  song={eff}
                  where={tx("play.database")}
                  testId="db-song-row"
                  leading={
                    <Artwork
                      src={data.artwork?.value as string | undefined}
                      orchestra={s.orchestra}
                      orchestraId={s.orchestraId}
                      song={s}
                    />
                  }
                  title={
                    <span className="text-headline">
                      <Highlight text={s.title} spans={hl.title} />
                    </span>
                  }
                  sub={
                    <>
                      <Highlight text={s.orchestra} spans={hl.orchestra} />
                      {s.singer ? (
                        <>
                          {" · "}
                          <Highlight text={s.singer} spans={hl.singer} />
                        </>
                      ) : (
                        ""
                      )}
                      {s.year ? ` · ${s.year}` : ""} · {labelOf(v.rhythm)} <EraBadge song={eff} />
                    </>
                  }
                  lengthSec={eff.durationSec ?? null}
                  onFind={() => setFinding(s)}
                  trailing={
                    editing && edited ? (
                      <button type="button" className="btn-plain -mr-2" onClick={() => revert(s.id)}>
                        {tx("db.songsTab.revert")}
                      </button>
                    ) : undefined
                  }
                />
                <ValueCell
                  label={tx("db.songsTab.year")}
                  inputLabel={tx("db.songsTab.year_of", { title: s.title })}
                  editing={editing}
                  value={p.year}
                  placeholder={s.year}
                  type="number"
                  min={1900}
                  max={2030}
                  onChange={(t) => setField(s, "year", num(t))}
                />
                <ValueCell
                  label={tx("db.songsTab.singer")}
                  inputLabel={tx("db.songsTab.singer_of", { title: s.title })}
                  editing={editing}
                  value={p.singer}
                  placeholder={s.singer ?? tx("db.songsTab.instrumental")}
                  onChange={(t) => setField(s, "singer", t)}
                />
                <PickerRow
                  label={tx("db.songsTab.rhythm")}
                  tip={tx("db.songsTab.tango_vals_or_milonga_decides_which")}
                  ariaLabel={tx("db.songsTab.rhythm_of", { title: s.title })}
                  value={v.rhythm}
                  items={
                    [...new Map([...RHYTHM_ITEMS, [s.rhythm, s.rhythm]]).entries()] as Array<[string, string]>
                  }
                  onChange={(r) => r && setField(s, "rhythm", r)}
                  disabled={!editing}
                />
                <ValueCell
                  label={tx("db.songsTab.energy")}
                  inputLabel={tx("db.songsTab.energy_of", { title: s.title })}
                  editing={editing}
                  value={p.energy}
                  placeholder={s.energy}
                  type="number"
                  min={0}
                  max={100}
                  onChange={(t) => setField(s, "energy", num(t))}
                />
                <ValueCell
                  label={`BPM${bpm ? ` · ${p.bpm !== undefined ? tx("db.songsTab.yours") : srcWord(bpm.used.label)}` : ""}`}
                  inputLabel={tx("db.songsTab.bpm_of", { title: s.title })}
                  editing={editing}
                  value={p.bpm}
                  placeholder={bpm ? bpm.value : "–"}
                  type="number"
                  min={40}
                  max={240}
                  onChange={(t) => setField(s, "bpm", num(t))}
                />
                {bpm && bpm.all.length > 1 && (
                  <Tip text={bpm.note} className="w-full">
                    <Row
                      label={tx("db.songsTab.every_bpm_value")}
                      sub={bpm.all
                        .map(
                          (x) =>
                            `${x.label} ${Math.round(x.raw)}${x.used ? " (used)" : x.agrees ? (x.halfDouble ? tx("db.songsTab.same_tempo_other_beat_level") : " (agrees)") : " (disagrees)"}`,
                        )
                        .join(" · ")}
                      data-testid="db-bpm-values"
                    />
                  </Tip>
                )}
                {/* round 21: the loudness and the vocal style the tanda rules read; a correction here wins over
                    the enrichment (Deezer, the knowledge table) and is kept when the enrich scripts run again */}
                <ValueCell
                  label={tx("db.songsTab.level_db", {
                    p1: s.level
                      ? ` · ${p.gainDb !== undefined ? tx("db.songsTab.yours") : (SOURCE[s.level.source] ?? s.level.source)}`
                      : "",
                  })}
                  inputLabel={tx("db.songsTab.level_of", { title: s.title })}
                  editing={editing}
                  value={p.gainDb}
                  placeholder={s.level ? s.level.gainDb.toFixed(1) : "–"}
                  type="number"
                  min={-40}
                  max={10}
                  onChange={(t) => setField(s, "gainDb", num(t))}
                />
                {v.vocal && (
                  <PickerRow
                    label={tx("db.songsTab.vocal_style", {
                      p1: s.vocalStyleSource
                        ? ` · ${p.vocalStyle ? tx("db.songsTab.yours") : (SOURCE[s.vocalStyleSource] ?? s.vocalStyleSource)}`
                        : "",
                    })}
                    ariaLabel={tx("db.songsTab.vocal_style_of", { title: s.title })}
                    tip={tx("db.songsTab.how_the_singer_sings_one_voice")}
                    value={(p.vocalStyle ?? s.vocalStyle ?? "unknown") as string}
                    items={VOCAL_STYLE_ITEMS}
                    onChange={(k) => k && setField(s, "vocalStyle", k === "unknown" ? undefined : k)}
                    disabled={!editing}
                  />
                )}
                <ValueCell
                  label={`Key${from("key")}`}
                  inputLabel={tx("db.songsTab.key_of", { title: s.title })}
                  editing={editing}
                  value={p.key}
                  placeholder={(data.key?.value as string | undefined) ?? "–"}
                  onChange={(t) => setField(s, "key", t.trim() || undefined)}
                />
                <ValueCell
                  label={`Date${from("release")}`}
                  inputLabel={tx("db.songsTab.release_date_of", { title: s.title })}
                  editing={editing}
                  value={p.release}
                  placeholder={(data.release?.value as string | undefined) ?? "–"}
                  onChange={(t) => setField(s, "release", t.trim() || undefined)}
                />
                <ValueCell
                  label={
                    data.deezerId?.source === "dj" ? tx("db.songsTab.deezer_yours") : tx("db.songsTab.deezer")
                  }
                  inputLabel={tx("db.songsTab.deezer_track_of", { title: s.title })}
                  editing={editing}
                  mono
                  value={p.deezerId}
                  placeholder={(data.deezerId?.value as string | undefined) ?? "–"}
                  onChange={(t) => setField(s, "deezerId", t.replace(/\D/g, "") || undefined)}
                />
                <ValueCell
                  label={`Artwork${from("artwork")}`}
                  inputLabel={tx("db.songsTab.artwork_link_of", { title: s.title })}
                  editing={editing}
                  mono
                  value={p.artwork}
                  placeholder={data.artwork ? tx("db.songsTab.found") : "–"}
                  onChange={(t) =>
                    setField(s, "artwork", /^https:\/\//.test(t.trim()) ? t.trim() : undefined)
                  }
                />
                <Tip text={tx("db.songsTab.asks_deezer_musicbrainz_the_cover_art")} className="w-full">
                  <Row
                    tile={
                      <span
                        className="tile"
                        style={{ background: missing.length ? "#5856d6" : "var(--fill-2)" }}
                        aria-hidden
                      >
                        <DatabaseZap size={14} strokeWidth={2} />
                      </span>
                    }
                    label={
                      missing.length
                        ? tx("db.songsTab.fill_missing_data")
                        : tx("db.songsTab.refresh_from_sources")
                    }
                    sub={
                      missing.length
                        ? `Missing: ${missing.map((f) => FILL_LABEL[f] ?? f).join(", ")}`
                        : scraped
                          ? tx("db.songsTab.fetched", {
                              p1: Object.entries(scraped.sources)
                                .map(([k, v]) => `${SOURCE_LABEL[k] ?? k} ${v.fetchedAt.slice(0, 10)}`)
                                .join(" · "),
                            })
                          : tx("db.songsTab.everything_is_known")
                    }
                    chevron
                    busy={filling === s.id}
                    onClick={() => void fill(s, !missing.length)}
                    data-testid="db-fill"
                  />
                </Tip>
                <VersionsRow song={s} />
                <Row
                  label={tx("db.songsTab.streams")}
                  sub={[
                    s.spotify?.uri
                      ? `Spotify ${s.spotify.album ?? ""}${s.spotify.release ? ` (${s.spotify.release.slice(0, 4)})` : ""}${s.spotify.checkedAt ? ` · checked ${s.spotify.checkedAt.slice(0, 10)}` : ""}`
                      : tx("db.songsTab.no_checked_spotify_recording"),
                    s.deezer?.id
                      ? `Deezer ${s.deezer.id}${s.deezer.fetchedAt ? ` · fetched ${s.deezer.fetchedAt.slice(0, 10)}` : ""}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  data-testid="db-streams"
                />
                <Row
                  tile={
                    res?.artwork ? (
                      // biome-ignore lint/performance/noImgElement: provider artwork, unoptimised by design
                      <img
                        src={res.artwork}
                        alt=""
                        width={29}
                        height={29}
                        className="tile object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span
                        className="tile"
                        style={{ background: res ? "#a238ff" : "var(--fill-2)" }}
                        aria-hidden
                      >
                        <Link2 size={14} strokeWidth={2} />
                      </span>
                    )
                  }
                  label={tx("db.songsTab.resolved")}
                  sub={
                    res
                      ? `${res.artist} – ${res.title}${res.previewUrl ? tx("db.songsTab.30_s_preview") : ""}${p.resolved ? tx("db.songsTab.your_choice") : ""}`
                      : tx("db.songsTab.no_preview_track_yet")
                  }
                  value={
                    res
                      ? res.provider === "deezer"
                        ? tx("db.songsTab.deezer")
                        : res.provider
                      : tx("db.songsTab.find")
                  }
                  chevron
                  onClick={() => setFinding(s)}
                  aria-label={tx("db.songsTab.find_on_services", { title: s.title })}
                  tip={tx("db.songsTab.look_for_this_side_on_deezer")}
                  data-resolved={res ? "true" : "false"}
                />
                <Row
                  tile={
                    <span
                      className="tile"
                      style={{ background: eff.audio ? "var(--tint-fill)" : "var(--fill-2)" }}
                      aria-hidden
                    >
                      <AudioWaveform size={14} strokeWidth={2} />
                    </span>
                  }
                  label={tx("db.songsTab.analysed_audio")}
                  sub={
                    eff.audio
                      ? tx("db.songsTab.bpm_dbfs", {
                          p1: keyLabel(eff.audio),
                          p2: Math.round(eff.audio.bpm),
                          loudnessDb: eff.audio.loudnessDb.toFixed(1),
                          p3: p.audio ? tx("db.songsTab.analysed_here") : "",
                        })
                      : res?.previewUrl
                        ? tx("db.songsTab.analyse_the_30_s_preview_in")
                        : tx("db.songsTab.needs_a_preview_first")
                  }
                  value={eff.audio ? tx("db.songsTab.analyse_again") : tx("db.songsTab.analyse")}
                  chevron
                  onClick={() => analyse(s)}
                  busy={analysing === s.id}
                  disabled={!res?.previewUrl}
                />
                {editing ? (
                  <ValueCell
                    label={tx("db.songsTab.spotify_link")}
                    inputLabel={tx("db.songsTab.spotify_link_of", { title: s.title })}
                    editing
                    mono
                    value={p.spotify?.uri}
                    placeholder={s.spotify?.uri ?? tx("db.songsTab.paste_a_spotify_link")}
                    onChange={(t) => setField(s, "spotify", t.trim() ? { uri: spotifyUri(t) } : null)}
                  />
                ) : (
                  (() => {
                    const url = spotifyUrl(p.spotify?.uri ?? s.spotify?.uri);
                    return url ? (
                      <Row
                        label={tx("db.songsTab.spotify")}
                        value={tx("db.songsTab.open_in_spotify_2")}
                        href={url}
                        chevron
                        aria-label={tx("db.songsTab.open_in_spotify", { title: s.title })}
                        data-testid="db-spotify-link"
                      />
                    ) : (
                      <Row label={tx("db.songsTab.spotify")} value={tx("db.songsTab.not_matched_yet")} />
                    );
                  })()
                )}
                {/* 2026-11: the video the YouTube export matched (the Booth plays it); opens the YouTube app on iOS */}
                {(() => {
                  const v = loadMatches()[s.id];
                  return v ? (
                    <Row
                      label={tx("deviceSources.youtube")}
                      value={tx("exportSheet.open_in_youtube")}
                      href={youtubeVideoUrl(v)}
                      chevron
                      data-testid="db-youtube-link"
                    />
                  ) : null;
                })()}
                <SwitchRow
                  label={tx("db.songsTab.shown_in_sets")}
                  sub={
                    p.hidden
                      ? p.hiddenScope === "copy"
                        ? tx("db.songsTab.hidden_this_copy_only")
                        : tx("db.songsTab.hidden_every_copy_of_this_title")
                      : tx("db.songsTab.off_hides_every_copy_of_this")
                  }
                  checked={!p.hidden}
                  onChange={(on) => {
                    setField(s, "hidden", on ? undefined : true);
                    if (on) setField(s, "hiddenScope", undefined);
                  }}
                />
                {!p.hidden && (
                  <ActionRow
                    label={tx("db.songsTab.hide_only_this_copy")}
                    tip={tx("db.songsTab.this_copy_stops_appearing_in_your")}
                    onClick={() => {
                      setField(s, "hidden", true);
                      setField(s, "hiddenScope", "copy");
                    }}
                    id={`hide-copy-${s.id}`}
                  />
                )}
              </Group>
            );
          })}
        </div>
      )}
      {search.hasMore && rows.length > 0 && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            className="btn-plain min-h-11 px-4"
            onClick={search.loadMore}
            disabled={searching}
            data-testid="db-more"
          >
            {tx("search.show_more", { shown: rows.length, total: search.data?.total ?? rows.length })}
          </button>
        </div>
      )}

      <Group
        header={tx("db.songsTab.your_recordings")}
        footer={
          (overrides.addedSongs ?? []).length === 0
            ? tx("db.songsTab.none_yet_added_recordings_join_the")
            : tx("db.songsTab.added_recordings_join_the_index_for")
        }
      >
        <AnimatePresence initial={false}>
          {(overrides.addedSongs ?? []).map((s) => (
            <motion.div
              key={s.id}
              layout={reduced ? false : "position"}
              variants={rise}
              initial="hidden"
              animate="show"
              exit="exit"
              transition={spring.thumb}
            >
              <SwipeRow
                leading="art"
                actions={[
                  { kind: "destructive", label: "Delete", icon: Trash2, onClick: () => removeOwn(s.id) },
                ]}
              >
                {editing ? (
                  <div className="cell" data-leading="art">
                    <button
                      type="button"
                      className="icon-btn icon-btn-bare -ml-3 text-[var(--destructive)]"
                      aria-label={tx("db.songsTab.remove", { title: s.title })}
                      onClick={() => removeOwn(s.id)}
                    >
                      <CircleMinus size={22} strokeWidth={2} fill="currentColor" stroke="#fff" />
                    </button>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{s.title}</span>
                      <span className="text-footnote block truncate text-[var(--label-2)]">
                        {metaLine(s.orchestra, s.singer, s.rhythm, yearText(s.year))}
                      </span>
                    </span>
                  </div>
                ) : (
                  <PlayRow
                    song={s as Song}
                    where={tx("play.database")}
                    leadingKind="tile"
                    leading={<RhythmTile rhythm={s.rhythm} label={rhythmWord(s.rhythm)} />}
                    sub={metaLine(s.orchestra, s.singer, s.rhythm, yearText(s.year))}
                    lengthSec={(s as Song).durationSec ?? null}
                  />
                )}
              </SwipeRow>
            </motion.div>
          ))}
        </AnimatePresence>
        <ActionRow
          label={tx("db.songsTab.add_a_recording")}
          tip={tx("db.songsTab.add_a_side_the_catalogue_does")}
          onClick={() => setAdding(true)}
        />
      </Group>

      <ResolveSheet song={finding} open={!!finding} onClose={() => setFinding(null)} />
      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title={tx("db.songsTab.add_a_recording")}
        trailing={tx("db.songsTab.save")}
        onTrailing={addSong}
      >
        <Group footer={tx("db.songsTab.title_and_orchestra_are_required_leave")}>
          {field("own-title", "Title", "title", { required: true, "data-autofocus": true })}
          {field("own-orchestra", "Orchestra", "orchestra", { required: true })}
          {field("own-singer", "Singer", "singer", { placeholder: tx("db.songsTab.instrumental") })}
          <PickerRow
            label={tx("db.songsTab.rhythm")}
            ariaLabel={tx("db.songsTab.rhythm")}
            value={form.rhythm}
            items={RHYTHM_ITEMS}
            onChange={(r) => r && setForm({ ...form, rhythm: r })}
          />
          {field("own-year", "Year", "year", { type: "number", min: 1900, max: 2030, placeholder: "1941" })}
          {field("own-energy", "Energy", "energy", {
            type: "number",
            min: 0,
            max: 100,
            placeholder: "0–100",
          })}
          {field("own-uri", tx("db.songsTab.spotify_link"), "uri", {
            placeholder: tx("db.songsTab.paste_a_spotify_link"),
            className: "field field-value min-w-0 flex-1 font-mono",
          })}
        </Group>
      </Sheet>
    </div>
  );
}
