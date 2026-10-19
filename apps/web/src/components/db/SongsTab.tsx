"use client";
import { Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { Song } from "@/lib/types";
import { Switch } from "../ui";
import { Edited, Empty, Num, patchMap, Text, useDb } from "./shared";

const RHYTHMS = ["tango", "vals", "milonga", "cancion", "foxtrot", "other"] as const;
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

export function SongsTab() {
  const { overrides, update } = useDb();
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

  return (
    <div className="space-y-4">
      <label
        htmlFor="db-search"
        className="flex min-h-12 items-center gap-2 rounded-full border border-[rgb(var(--text)/.16)] bg-[rgb(var(--text)/.04)] px-4 focus-within:ring-2 focus-within:ring-[var(--accent)]"
      >
        <Search size={16} className="shrink-0 opacity-70" aria-hidden />
        <span className="sr-only">Search the index</span>
        <input
          id="db-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title, orchestra, singer, year to edit…"
          className="w-full bg-transparent py-2 outline-none placeholder:text-[rgb(var(--muted))]"
          autoComplete="off"
        />
      </label>
      {q.length >= 2 && !searching && rows.length === 0 && <Empty>Nothing matches “{q}”.</Empty>}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="db-table">
            <thead>
              <tr>
                <th>Recording</th>
                <th>Year</th>
                <th>Singer</th>
                <th>Rhythm</th>
                <th>Energy</th>
                <th>BPM</th>
                <th>Spotify URI</th>
                <th>Shown</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const p = (songs[s.id] ?? {}) as Partial<Song> & { hidden?: boolean };
                const v = { ...s, ...p };
                const edited = !!songs[s.id];
                return (
                  <tr key={s.id} data-song={s.id}>
                    <td className="db-title">
                      <span className="block max-w-56 truncate font-medium">{s.title}</span>
                      <span className="text-muted block max-w-56 truncate text-xs">
                        {s.orchestra}
                        {s.singer ? ` / ${s.singer}` : ""}
                      </span>
                    </td>
                    <td data-label="Year">
                      <Num
                        label={`Year of ${s.title}`}
                        value={p.year}
                        placeholder={s.year}
                        min={1900}
                        max={2030}
                        onChange={(n) => setField(s, "year", n)}
                      />
                    </td>
                    <td data-label="Singer">
                      <Text
                        label={`Singer of ${s.title}`}
                        value={p.singer}
                        placeholder={s.singer ?? "instrumental"}
                        onChange={(t) => setField(s, "singer", t)}
                      />
                    </td>
                    <td data-label="Rhythm">
                      <select
                        aria-label={`Rhythm of ${s.title}`}
                        className="field w-24"
                        value={v.rhythm}
                        onChange={(e) => setField(s, "rhythm", e.target.value)}
                      >
                        {[...new Set([...RHYTHMS, s.rhythm])].map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td data-label="Energy">
                      <Num
                        label={`Energy of ${s.title}`}
                        value={p.energy}
                        placeholder={s.energy}
                        min={0}
                        max={100}
                        onChange={(n) => setField(s, "energy", n)}
                      />
                    </td>
                    <td data-label="BPM">
                      <Num
                        label={`BPM of ${s.title}`}
                        value={p.bpm}
                        placeholder={s.bpm ?? "–"}
                        min={40}
                        max={240}
                        onChange={(n) => setField(s, "bpm", n)}
                      />
                    </td>
                    <td data-label="Spotify">
                      <Text
                        mono
                        label={`Spotify URI of ${s.title}`}
                        value={p.spotify?.uri}
                        placeholder={s.spotify?.uri ?? "spotify:track:…"}
                        onChange={(t) => setField(s, "spotify", t.trim() ? { uri: t.trim() } : null)}
                      />
                    </td>
                    <td data-label="Shown">
                      <div className="db-cell">
                        <Switch
                          label={`Show ${s.title} in sets`}
                          checked={!p.hidden}
                          onChange={(on) => setField(s, "hidden", on ? undefined : true)}
                        />
                      </div>
                    </td>
                    <td data-label="State">
                      <Edited on={edited} onRevert={() => revert(s.id)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="border-t border-[rgb(var(--text)/.08)] pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Your own recordings</h3>
          <button
            type="button"
            className="btn btn-ghost text-sm"
            onClick={() => setAdding((v) => !v)}
            aria-expanded={adding}
          >
            <Plus size={15} /> Add a recording
          </button>
        </div>
        {adding && (
          <form
            className="mt-3 grid gap-2 sm:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              addSong();
            }}
          >
            <input
              className="field"
              placeholder="Title"
              aria-label="Title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
            <input
              className="field"
              placeholder="Orchestra"
              aria-label="Orchestra"
              value={form.orchestra}
              onChange={(e) => setForm({ ...form, orchestra: e.target.value })}
              required
            />
            <input
              className="field"
              placeholder="Singer (blank = instrumental)"
              aria-label="Singer"
              value={form.singer}
              onChange={(e) => setForm({ ...form, singer: e.target.value })}
            />
            <select
              className="field"
              aria-label="Rhythm"
              value={form.rhythm}
              onChange={(e) => setForm({ ...form, rhythm: e.target.value })}
            >
              {RHYTHMS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <input
              className="field"
              type="number"
              placeholder="Year"
              aria-label="Year"
              min={1900}
              max={2030}
              value={form.year}
              onChange={(e) => setForm({ ...form, year: e.target.value })}
            />
            <input
              className="field"
              type="number"
              placeholder="Energy 0–100"
              aria-label="Energy"
              min={0}
              max={100}
              value={form.energy}
              onChange={(e) => setForm({ ...form, energy: e.target.value })}
            />
            <input
              className="field font-mono text-xs sm:col-span-2"
              placeholder="spotify:track:… (optional)"
              aria-label="Spotify URI"
              value={form.uri}
              onChange={(e) => setForm({ ...form, uri: e.target.value })}
            />
            <button type="submit" className="btn btn-primary">
              Save recording
            </button>
          </form>
        )}
        {(overrides.addedSongs ?? []).length === 0 ? (
          <p className="text-muted mt-2 text-xs">
            None yet. Added recordings join the index for your sets only.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[rgb(var(--text)/.08)]">
            {(overrides.addedSongs ?? []).map((s) => (
              <li key={s.id} className="flex min-h-11 items-center gap-3 py-1 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {s.title}{" "}
                  <span className="text-muted">
                    · {s.orchestra}
                    {s.singer ? ` / ${s.singer}` : ""} · {s.rhythm} · {s.year ?? "?"}
                  </span>
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove ${s.title}`}
                  onClick={() =>
                    update((o) => ({ ...o, addedSongs: (o.addedSongs ?? []).filter((x) => x.id !== s.id) }))
                  }
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
