"use client";
import { AudioLines } from "lucide-react";
import { useState } from "react";
import { t } from "@/lib/i18n";
import type { Cortina, MetaCortina } from "@/lib/types";
import { ActionRow, Group, Row } from "../Form";
import { Sheet } from "../Sheet";
import { CortinaPlayButton } from "../ui/PlayRow";
import { Empty, useDb } from "./shared";

const TEMPLATE: Cortina = {
  id: "c-my-cortina",
  get title() {
    return t("db.cortinasTab.title");
  },
  get artist() {
    return t("db.cortinasTab.artist");
  },
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
        if (typeof c[k] !== "string" || !c[k]) throw new Error(t("db.cortinasTab.is_required", { k }));
      if (typeof c.energy !== "number" || c.energy < 0 || c.energy > 100)
        throw new Error(t("db.cortinasTab.energy_must_be_0_100"));
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
  if (!base.length) return <Empty>{t("db.cortinasTab.loading_cortinas")}</Empty>;
  const current = merged.find((m) => m.c.id === editing);
  return (
    <div>
      <Group
        header={t("db.cortinasTab.cortinas")}
        footer={t("db.cortinasTab.cortinas_in_your_pool_a_spotify", {
          length: merged.filter((m) => m.state !== "deleted").length,
        })}
      >
        {merged.map(({ c, state }) => (
          // 2026-11: the play button beside the row plays the cortina from its chorus (the row opens the editor)
          <div key={c.id} className="relative flex items-center pr-2" data-testid="db-cortina-row">
            <div className="min-w-0 flex-1">
              <Row
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
                sub={t("db.cortinasTab.energy", {
                  genre: c.genre,
                  culture: c.culture,
                  energy: c.energy,
                  p1: state !== "index" ? ` · ${state}` : "",
                })}
                value={`${c.lengthSec ?? 45} s`}
                chevron
                onClick={() => open(c)}
              />
            </div>
            {state !== "deleted" && <CortinaPlayButton cortina={c} where={t("db.cortinasTab.cortinas")} />}
          </div>
        ))}
        <ActionRow
          label={t("db.cortinasTab.add_a_cortina")}
          tip={t("db.cortinasTab.add_a_song_of_your_own")}
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
        title={editing === "new" ? t("db.cortinasTab.new_cortina") : t("db.cortinasTab.edit_cortina")}
        trailing={t("db.cortinasTab.save")}
        onTrailing={save}
        detents={["large"]}
      >
        <Group
          header={t("db.cortinasTab.details")}
          footer={
            err ? (
              <span className="text-[var(--destructive)]">{err}</span>
            ) : (
              t("db.cortinasTab.id_title_artist_genre_and_culture")
            )
          }
        >
          <label htmlFor="cortina-json" className="cell">
            <span className="sr-only">{t("db.cortinasTab.cortina_details")}</span>
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
                label={t("db.cortinasTab.restore_from_the_index")}
                onClick={() => {
                  restore(current.c.id);
                  setEditing(null);
                }}
              />
            ) : (
              <ActionRow
                label={
                  current.state === "added"
                    ? t("db.cortinasTab.delete_cortina")
                    : t("db.cortinasTab.leave_out_of_my_pool")
                }
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
