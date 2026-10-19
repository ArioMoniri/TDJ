"use client";
import { Plus } from "lucide-react";
import { useState } from "react";
import type { Cortina, MetaCortina } from "@/lib/types";
import { Empty, useDb } from "./shared";

const TEMPLATE: Cortina = {
  id: "c-my-cortina",
  title: "Title",
  artist: "Artist",
  genre: "swing",
  culture: "global",
  energy: 60,
  year: 1960,
  startSec: 0,
  lengthSec: 45,
  spotify: null,
  tags: [],
};

export function CortinasTab({ base }: { base: MetaCortina[] }) {
  const { overrides, update } = useDb();
  const ov = overrides.cortinas ?? {};
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const merged: Array<{ c: Cortina; state: "index" | "edited" | "deleted" | "added" }> = [];
  for (const b of base) {
    const o = ov[b.id];
    if (o === null) merged.push({ c: b as Cortina, state: "deleted" });
    else if (o) merged.push({ c: o, state: "edited" });
    else merged.push({ c: b as Cortina, state: "index" });
  }
  for (const [id, c] of Object.entries(ov))
    if (c && !base.some((b) => b.id === id)) merged.push({ c, state: "added" });

  const open = (c: Cortina) => {
    setEditing(c.id);
    setText(JSON.stringify(c, null, 2));
    setErr(null);
  };
  const save = () => {
    try {
      const c = JSON.parse(text) as Cortina;
      for (const k of ["id", "title", "artist", "genre", "culture"] as const)
        if (typeof c[k] !== "string" || !c[k]) throw new Error(`"${k}" is required`);
      if (typeof c.energy !== "number" || c.energy < 0 || c.energy > 100)
        throw new Error("energy must be 0–100");
      update((o) => {
        const next = { ...(o.cortinas ?? {}) };
        if (editing && editing !== c.id && editing !== "new") delete next[editing];
        next[c.id] = c;
        return { ...o, cortinas: next };
      });
      setEditing(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const remove = (id: string, added: boolean) =>
    update((o) => {
      const next = { ...(o.cortinas ?? {}) };
      if (added) delete next[id];
      else next[id] = null;
      return { ...o, cortinas: next };
    });
  const restore = (id: string) =>
    update((o) => {
      const next = { ...(o.cortinas ?? {}) };
      delete next[id];
      return { ...o, cortinas: next };
    });
  if (!base.length) return <Empty>Loading cortinas…</Empty>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted text-sm">
          {merged.filter((m) => m.state !== "deleted").length} cortinas in your pool. Edit as JSON; a Spotify
          URI makes it previewable.
        </p>
        <button
          type="button"
          className="btn btn-ghost text-sm"
          onClick={() => {
            setEditing("new");
            setText(JSON.stringify({ ...TEMPLATE, id: `c-own-${Date.now().toString(36)}` }, null, 2));
            setErr(null);
          }}
        >
          <Plus size={15} /> Add cortina
        </button>
      </div>
      {editing && (
        <div className="rounded-xl bg-[rgb(var(--text)/.04)] p-3">
          <label htmlFor="cortina-json" className="text-sm font-medium">
            {editing === "new" ? "New cortina" : `Edit ${editing}`}
          </label>
          <textarea
            id="cortina-json"
            className="field mt-2 min-h-56 w-full py-2 font-mono text-xs"
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
          />
          {err && <p className="mt-1 text-sm text-[var(--accent)]">{err}</p>}
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn btn-primary" onClick={save}>
              Save
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {merged.length === 0 && (
        <Empty crate>No cortinas in your pool yet. Add one to hear it between tandas.</Empty>
      )}
      <table className="db-table">
        <thead>
          <tr>
            <th>Cortina</th>
            <th>Genre</th>
            <th>Energy</th>
            <th>Length</th>
            <th>State</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {merged.map(({ c, state }) => (
            <tr key={c.id} className={state === "deleted" ? "opacity-50" : ""}>
              <td className="db-title">
                <span className={`font-medium ${state === "deleted" ? "line-through" : ""}`}>{c.title}</span>
                <span className="text-muted block text-xs">
                  {c.artist}
                  {c.year ? ` · ${c.year}` : ""}
                </span>
              </td>
              <td data-label="Genre">
                <span className="db-cell text-sm">
                  {c.genre} · {c.culture}
                </span>
              </td>
              <td data-label="Energy">
                <span className="db-cell tabular-nums">{c.energy}</span>
              </td>
              <td data-label="Length">
                <span className="db-cell tabular-nums">{c.lengthSec ?? 45} s</span>
              </td>
              <td data-label="State">
                <span className="text-muted db-cell text-xs">{state}</span>
              </td>
              <td data-label="Actions">
                <div className="db-cell flex gap-1">
                  {state === "deleted" ? (
                    <button type="button" className="chip text-xs" onClick={() => restore(c.id)}>
                      Restore
                    </button>
                  ) : (
                    <>
                      <button type="button" className="chip text-xs" onClick={() => open(c)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="chip text-xs"
                        onClick={() => remove(c.id, state === "added")}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
