"use client";
import { AudioLines } from "lucide-react";
import { useState } from "react";
import type { Cortina, MetaCortina } from "@/lib/types";
import { ActionRow, Group, Row } from "../Form";
import { Sheet } from "../Sheet";
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
  const current = merged.find((m) => m.c.id === editing);
  return (
    <div>
      <Group
        header="Cortinas"
        footer={`${merged.filter((m) => m.state !== "deleted").length} cortinas in your pool. A Spotify URI makes one previewable.`}
      >
        {merged.map(({ c, state }) => (
          <Row
            key={c.id}
            tile={
              <span
                className="tile"
                style={{ background: state === "deleted" ? "#8e8e93" : "#ff9500" }}
                aria-hidden
              >
                <AudioLines size={16} strokeWidth={2} />
              </span>
            }
            label={
              <span className={state === "deleted" ? "line-through text-[var(--label-2)]" : ""}>
                {c.artist} – {c.title}
              </span>
            }
            sub={`${c.genre} · ${c.culture} · energy ${c.energy}${state !== "index" ? ` · ${state}` : ""}`}
            value={`${c.lengthSec ?? 45} s`}
            chevron
            onClick={() => open(c)}
          />
        ))}
        <ActionRow
          label="Add a cortina…"
          onClick={() => {
            setEditing("new");
            setText(JSON.stringify({ ...TEMPLATE, id: `c-own-${Date.now().toString(36)}` }, null, 2));
            setErr(null);
          }}
        />
      </Group>
      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New cortina" : "Edit cortina"}
        trailing="Save"
        onTrailing={save}
        detents={["large"]}
      >
        <Group
          header="JSON"
          footer={
            err ? (
              <span className="text-[var(--destructive)]">{err}</span>
            ) : (
              "id, title, artist, genre and culture are required; energy is 0–100."
            )
          }
        >
          <label htmlFor="cortina-json" className="cell">
            <span className="sr-only">Cortina JSON</span>
            <textarea
              id="cortina-json"
              className="field min-h-56 py-2 font-mono text-footnote"
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              data-autofocus
            />
          </label>
        </Group>
        {current && editing !== "new" && (
          <Group>
            {current.state === "deleted" ? (
              <ActionRow
                label="Restore from the index"
                onClick={() => {
                  restore(current.c.id);
                  setEditing(null);
                }}
              />
            ) : (
              <ActionRow
                label={current.state === "added" ? "Delete cortina" : "Leave out of my pool"}
                destructive
                onClick={() => {
                  remove(current.c.id, current.state === "added");
                  setEditing(null);
                }}
              />
            )}
          </Group>
        )}
      </Sheet>
    </div>
  );
}
