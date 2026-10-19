"use client";
import { CircleMinus, Trash2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { SEARCH_FOCUS_EVENT } from "@/components/Nav";
import { rise, spring } from "@/lib/motion";
import type { Song } from "@/lib/types";
import { ActionRow, FieldRow, Group, PickerRow, RhythmTile, SwitchRow } from "../Form";
import { SearchField } from "../SearchField";
import { Sheet } from "../Sheet";
import { SwipeRow } from "../SwipeRow";
import { Empty, patchMap, useDb, useDbEdit, ValueCell } from "./shared";

const RHYTHMS = ["tango", "vals", "milonga", "cancion", "foxtrot", "other"] as const;
const RHYTHM_ITEMS: Array<[string, string]> = RHYTHMS.map((r) => [r, r[0]!.toUpperCase() + r.slice(1)]);
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

export function SongsTab() {
  const { overrides, update } = useDb();
  const editing = useDbEdit();
  const reduced = useReducedMotion();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Song[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
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
        .then((r: Song[]) => setRows(r))
        .catch(() => setRows([]))
        .finally(() => setSearching(false));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const songs = overrides.songs ?? {};
  const setField = (s: Song, field: string, value: unknown) =>
    update((o) => ({
      ...o,
      songs: patchMap(
        o.songs,
        s.id,
        field as keyof Song & string,
        value,
        (s as unknown as Record<string, unknown>)[field],
      ),
    }));
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
      spotify: form.uri.trim() ? { uri: form.uri.trim() } : null,
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
        <div className="lg:grid lg:grid-cols-2 lg:gap-x-4">
          {rows.map((s) => {
            const p = (songs[s.id] ?? {}) as Partial<Song> & { hidden?: boolean };
            const v = { ...s, ...p };
            const edited = !!songs[s.id];
            return (
              <Group key={s.id} data-song={s.id} footer={edited ? "Edited · Revert in Edit mode" : undefined}>
                <div className="cell" data-leading="art">
                  <RhythmTile rhythm={v.rhythm} />
                  <span className="min-w-0 flex-1">
                    <span className="text-headline block truncate">{s.title}</span>
                    <span className="text-subhead block truncate text-[var(--label-2)]">
                      {s.orchestra}
                      {s.singer ? ` · ${s.singer}` : ""}
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
                  label="BPM"
                  inputLabel={`BPM of ${s.title}`}
                  editing={editing}
                  value={p.bpm}
                  placeholder={s.bpm ?? "–"}
                  type="number"
                  min={40}
                  max={240}
                  onChange={(t) => setField(s, "bpm", num(t))}
                />
                <ValueCell
                  label="Spotify"
                  inputLabel={`Spotify URI of ${s.title}`}
                  editing={editing}
                  mono
                  value={p.spotify?.uri}
                  placeholder={s.spotify?.uri ?? "spotify:track:…"}
                  onChange={(t) => setField(s, "spotify", t.trim() ? { uri: t.trim() } : null)}
                />
                <SwitchRow
                  label="Shown in sets"
                  checked={!p.hidden}
                  onChange={(on) => setField(s, "hidden", on ? undefined : true)}
                />
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
                      {s.orchestra}
                      {s.singer ? ` · ${s.singer}` : ""} · {s.rhythm} · {s.year ?? "?"}
                    </span>
                  </span>
                </div>
              </SwipeRow>
            </motion.div>
          ))}
        </AnimatePresence>
        <ActionRow label="Add a recording" onClick={() => setAdding(true)} />
      </Group>

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
          {field("own-uri", "Spotify URI", "uri", {
            placeholder: "spotify:track:…",
            className: "field field-value min-w-0 flex-1 font-mono",
          })}
        </Group>
      </Sheet>
    </div>
  );
}
