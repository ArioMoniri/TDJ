"use client";
import { missingFields, normTitle, songData } from "@tdj/core";
import { AudioWaveform, CircleMinus, DatabaseZap, Link2, Trash2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { SEARCH_FOCUS_EVENT } from "@/components/Nav";
import { analyseSong, keyLabel } from "@/lib/analyze";
import { djDataOf } from "@/lib/artwork";
import { effectiveSong } from "@/lib/audio";
import { fillMissing } from "@/lib/fill/client";
import { rise, spring } from "@/lib/motion";
import { SOURCE_LABEL } from "@/lib/songView";
import { spotifyUri, spotifyUrl } from "@/lib/spotifyLink";
import { toast } from "@/lib/toast";
import type { Song, SongPatch } from "@/lib/types";
import { metaLine, yearText } from "@/lib/year";
import { ActionRow, FieldRow, Group, PickerRow, RhythmTile, Row, SwitchRow } from "../Form";
import { ResolveSheet } from "../ResolveSheet";
import { SearchField } from "../SearchField";
import { Sheet } from "../Sheet";
import { SwipeRow } from "../SwipeRow";
import { Artwork } from "../ui/Artwork";
import { EraBadge } from "../ui/EraBadge";
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
const FILL_LABEL: Record<string, string> = {
  bpm: "BPM",
  key: "key",
  gainDb: "level",
  artwork: "artwork",
  release: "date",
};
/** round 21: where an enriched value came from */
const SOURCE: Record<string, string> = {
  dj: "yours",
  deezer: "Deezer",
  audio: "analysed preview",
  index: "T-DJ catalogue",
  knowledge: "tango reference",
  heuristic: "guessed from the era",
};
const VOCAL_STYLE_ITEMS: Array<[string, string]> = [
  ["cantor", "Singer-led (cantor)"],
  ["estribillo", "Rhythm-led (estribillista)"],
  ["unknown", "Unknown"],
];

export function SongsTab() {
  const { overrides, update } = useDb();
  const editing = useDbEdit();
  const reduced = useReducedMotion();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Song[]>([]);
  const [searching, setSearching] = useState(false);
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
  useEffect(() => {
    if (q.length < 2) {
      setRows([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        // the versions of one title sit together, oldest first (round 22)
        .then((r: Song[]) =>
          setRows(
            r
              .slice()
              .sort(
                (a, b) =>
                  normTitle(a.title).localeCompare(normTitle(b.title)) || (a.year ?? 9999) - (b.year ?? 9999),
              ),
          ),
        )
        .catch(() => setRows([]))
        .finally(() => setSearching(false));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

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
          ? `Filled ${r.filled.map(label).join(", ")} for ${s.title}`
          : r.asked.length
            ? `No new data for ${s.title}${r.stillMissing.length ? ` (still missing: ${r.stillMissing.map(label).join(", ")})` : ""}`
            : `${s.title} is up to date with your sources`,
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
        placeholder="Title, orchestra, singer or year"
        label="Search the index"
        busy={searching}
        className="mt-3"
        onFocusChange={(f) => window.dispatchEvent(new CustomEvent(SEARCH_FOCUS_EVENT, { detail: f }))}
      />
      {q.length < 2 && <Empty crate>Search the index to edit a recording, or add your own below.</Empty>}
      {q.length >= 2 && !searching && rows.length === 0 && <Empty>Nothing matches “{q}”.</Empty>}
      {rows.length > 0 && (
        <div className="min-w-0 lg:grid lg:grid-cols-2 lg:gap-x-4">
          {rows.map((s) => {
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
            const missing = missingFields(data);
            const from = (f: keyof typeof data) =>
              data[f] ? ` · ${SOURCE_LABEL[data[f]!.source] ?? data[f]!.source}` : "";
            return (
              <Group
                key={s.id}
                data-song={s.id}
                footer={edited ? "Edited · Revert in Edit mode" : undefined}
                className="min-w-0"
              >
                <div className="cell" data-leading="art">
                  <Artwork
                    src={data.artwork?.value as string | undefined}
                    orchestra={s.orchestra}
                    orchestraId={s.orchestraId}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="text-headline block truncate">{s.title}</span>
                    <span className="text-subhead block truncate text-[var(--label-2)]">
                      {s.orchestra}
                      {s.singer ? ` · ${s.singer}` : ""} · {labelOf(v.rhythm)}
                    </span>
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      <EraBadge song={eff} />
                    </span>
                  </span>
                  {editing && edited && (
                    <button type="button" className="btn-plain -mr-2" onClick={() => revert(s.id)}>
                      Revert
                    </button>
                  )}
                </div>
                <ValueCell
                  label="Year"
                  inputLabel={`Year of ${s.title}`}
                  editing={editing}
                  value={p.year}
                  placeholder={s.year}
                  type="number"
                  min={1900}
                  max={2030}
                  onChange={(t) => setField(s, "year", num(t))}
                />
                <ValueCell
                  label="Singer"
                  inputLabel={`Singer of ${s.title}`}
                  editing={editing}
                  value={p.singer}
                  placeholder={s.singer ?? "Instrumental"}
                  onChange={(t) => setField(s, "singer", t)}
                />
                <PickerRow
                  label="Rhythm"
                  tip="Tango, vals or milonga: decides which tandas this side can join"
                  ariaLabel={`Rhythm of ${s.title}`}
                  value={v.rhythm}
                  items={
                    [...new Map([...RHYTHM_ITEMS, [s.rhythm, s.rhythm]]).entries()] as Array<[string, string]>
                  }
                  onChange={(r) => r && setField(s, "rhythm", r)}
                  disabled={!editing}
                />
                <ValueCell
                  label="Energy"
                  inputLabel={`Energy of ${s.title}`}
                  editing={editing}
                  value={p.energy}
                  placeholder={s.energy}
                  type="number"
                  min={0}
                  max={100}
                  onChange={(t) => setField(s, "energy", num(t))}
                />
                <ValueCell
                  label={`BPM${s.tempo ? ` · ${p.bpm !== undefined ? "yours" : (SOURCE[s.tempo.source] ?? s.tempo.source)}` : ""}`}
                  inputLabel={`BPM of ${s.title}`}
                  editing={editing}
                  value={p.bpm}
                  placeholder={s.tempo ? Math.round(s.tempo.bpm) : (s.bpm ?? "–")}
                  type="number"
                  min={40}
                  max={240}
                  onChange={(t) => setField(s, "bpm", num(t))}
                />
                {/* round 21: the loudness and the vocal style the tanda rules read; a correction here wins over
                    the enrichment (Deezer, the knowledge table) and is kept when the enrich scripts run again */}
                <ValueCell
                  label={`Level dB${s.level ? ` · ${p.gainDb !== undefined ? "yours" : (SOURCE[s.level.source] ?? s.level.source)}` : ""}`}
                  inputLabel={`Level of ${s.title}`}
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
                    label={`Vocal style${s.vocalStyleSource ? ` · ${p.vocalStyle ? "yours" : (SOURCE[s.vocalStyleSource] ?? s.vocalStyleSource)}` : ""}`}
                    ariaLabel={`Vocal style of ${s.title}`}
                    tip="How the singer sings: one voice per tanda keeps the same style together"
                    value={(p.vocalStyle ?? s.vocalStyle ?? "unknown") as string}
                    items={VOCAL_STYLE_ITEMS}
                    onChange={(k) => k && setField(s, "vocalStyle", k === "unknown" ? undefined : k)}
                    disabled={!editing}
                  />
                )}
                <ValueCell
                  label={`Key${from("key")}`}
                  inputLabel={`Key of ${s.title}`}
                  editing={editing}
                  value={p.key}
                  placeholder={(data.key?.value as string | undefined) ?? "–"}
                  onChange={(t) => setField(s, "key", t.trim() || undefined)}
                />
                <ValueCell
                  label={`Date${from("release")}`}
                  inputLabel={`Release date of ${s.title}`}
                  editing={editing}
                  value={p.release}
                  placeholder={(data.release?.value as string | undefined) ?? "–"}
                  onChange={(t) => setField(s, "release", t.trim() || undefined)}
                />
                <ValueCell
                  label={data.deezerId?.source === "dj" ? "Deezer · yours" : "Deezer"}
                  inputLabel={`Deezer track of ${s.title}`}
                  editing={editing}
                  mono
                  value={p.deezerId}
                  placeholder={(data.deezerId?.value as string | undefined) ?? "–"}
                  onChange={(t) => setField(s, "deezerId", t.replace(/\D/g, "") || undefined)}
                />
                <ValueCell
                  label={`Artwork${from("artwork")}`}
                  inputLabel={`Artwork link of ${s.title}`}
                  editing={editing}
                  mono
                  value={p.artwork}
                  placeholder={data.artwork ? "Found" : "–"}
                  onChange={(t) =>
                    setField(s, "artwork", /^https:\/\//.test(t.trim()) ? t.trim() : undefined)
                  }
                />
                <Tip
                  text="Asks Deezer, MusicBrainz, the Cover Art Archive and the sources you added in Settings for what is missing. Your own values always win."
                  className="w-full"
                >
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
                    label={missing.length ? "Fill missing data" : "Refresh from sources"}
                    sub={
                      missing.length
                        ? `Missing: ${missing.map((f) => FILL_LABEL[f] ?? f).join(", ")}`
                        : scraped
                          ? `Fetched ${Object.entries(scraped.sources)
                              .map(([k, v]) => `${SOURCE_LABEL[k] ?? k} ${v.fetchedAt.slice(0, 10)}`)
                              .join(" · ")}`
                          : "Everything is known"
                    }
                    chevron
                    busy={filling === s.id}
                    onClick={() => void fill(s, !missing.length)}
                    data-testid="db-fill"
                  />
                </Tip>
                <VersionsRow song={s} />
                <Row
                  label="Streams"
                  sub={[
                    s.spotify?.uri
                      ? `Spotify ${s.spotify.album ?? ""}${s.spotify.release ? ` (${s.spotify.release.slice(0, 4)})` : ""}${s.spotify.checkedAt ? ` · checked ${s.spotify.checkedAt.slice(0, 10)}` : ""}`
                      : "No checked Spotify recording",
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
                  label="Resolved"
                  sub={
                    res
                      ? `${res.artist} – ${res.title}${res.previewUrl ? " · 30 s preview" : ""}${p.resolved ? " · your choice" : ""}`
                      : "No preview track yet"
                  }
                  value={res ? (res.provider === "deezer" ? "Deezer" : res.provider) : "Find…"}
                  chevron
                  onClick={() => setFinding(s)}
                  aria-label={`Find ${s.title} on services`}
                  tip="Look for this side on Deezer, Spotify or YouTube and choose the right recording"
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
                  label="Analysed audio"
                  sub={
                    eff.audio
                      ? `${keyLabel(eff.audio)} · ${Math.round(eff.audio.bpm)} BPM · ${eff.audio.loudnessDb.toFixed(1)} dBFS${p.audio ? " · analysed here" : ""}`
                      : res?.previewUrl
                        ? "Analyse the 30 s preview in this browser"
                        : "Needs a preview first"
                  }
                  value={eff.audio ? "Analyse again" : "Analyse"}
                  chevron
                  onClick={() => analyse(s)}
                  busy={analysing === s.id}
                  disabled={!res?.previewUrl}
                />
                {editing ? (
                  <ValueCell
                    label="Spotify link"
                    inputLabel={`Spotify link of ${s.title}`}
                    editing
                    mono
                    value={p.spotify?.uri}
                    placeholder={s.spotify?.uri ?? "Paste a Spotify link"}
                    onChange={(t) => setField(s, "spotify", t.trim() ? { uri: spotifyUri(t) } : null)}
                  />
                ) : (
                  (() => {
                    const url = spotifyUrl(p.spotify?.uri ?? s.spotify?.uri);
                    return url ? (
                      <Row
                        label="Spotify"
                        value="Open in Spotify"
                        href={url}
                        chevron
                        aria-label={`Open ${s.title} in Spotify`}
                        data-testid="db-spotify-link"
                      />
                    ) : (
                      <Row label="Spotify" value="Not matched yet" />
                    );
                  })()
                )}
                <SwitchRow
                  label="Shown in sets"
                  sub={
                    p.hidden
                      ? p.hiddenScope === "copy"
                        ? "Hidden: this copy only"
                        : "Hidden: every copy of this title"
                      : "Off hides every copy of this orchestra + title"
                  }
                  checked={!p.hidden}
                  onChange={(on) => {
                    setField(s, "hidden", on ? undefined : true);
                    if (on) setField(s, "hiddenScope", undefined);
                  }}
                />
                {!p.hidden && (
                  <ActionRow
                    label="Hide only this copy"
                    tip="This copy stops appearing in your nights; other recordings of the song stay"
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

      <Group
        header="Your recordings"
        footer={
          (overrides.addedSongs ?? []).length === 0
            ? "None yet. Added recordings join the index for your sets only."
            : "Added recordings join the index for your sets only."
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
                <div className="cell" data-leading="art">
                  {editing ? (
                    <button
                      type="button"
                      className="icon-btn icon-btn-bare -ml-3 text-[var(--destructive)]"
                      aria-label={`Remove ${s.title}`}
                      onClick={() => removeOwn(s.id)}
                    >
                      <CircleMinus size={22} strokeWidth={2} fill="currentColor" stroke="#fff" />
                    </button>
                  ) : (
                    <RhythmTile rhythm={s.rhythm} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{s.title}</span>
                    <span className="text-footnote block truncate text-[var(--label-2)]">
                      {metaLine(s.orchestra, s.singer, s.rhythm, yearText(s.year))}
                    </span>
                  </span>
                </div>
              </SwipeRow>
            </motion.div>
          ))}
        </AnimatePresence>
        <ActionRow
          label="Add a recording"
          tip="Add a side the catalogue does not have, so the composer can use it"
          onClick={() => setAdding(true)}
        />
      </Group>

      <ResolveSheet song={finding} open={!!finding} onClose={() => setFinding(null)} />
      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a recording"
        trailing="Save"
        onTrailing={addSong}
      >
        <Group footer="Title and orchestra are required. Leave the singer blank for an instrumental.">
          {field("own-title", "Title", "title", { required: true, "data-autofocus": true })}
          {field("own-orchestra", "Orchestra", "orchestra", { required: true })}
          {field("own-singer", "Singer", "singer", { placeholder: "Instrumental" })}
          <PickerRow
            label="Rhythm"
            ariaLabel="Rhythm"
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
          {field("own-uri", "Spotify link", "uri", {
            placeholder: "Paste a Spotify link",
            className: "field field-value min-w-0 flex-1 font-mono",
          })}
        </Group>
      </Sheet>
    </div>
  );
}
