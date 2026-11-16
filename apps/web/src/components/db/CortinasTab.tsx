"use client";
import { AudioLines } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fmtSec, t } from "@/lib/i18n";
import type { Cortina, MetaCortina } from "@/lib/types";
import { useSharedQuery } from "@/lib/usePageQuery";
import { useTextSearch } from "@/lib/useSongSearch";
import { ActionRow, Group, Row } from "../Form";
import { SearchField } from "../SearchField";
import { Sheet } from "../Sheet";
import { Highlight } from "../search/Highlight";
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

type Merged = { c: Cortina; state: "index" | "edited" | "deleted" | "added" };
/** 2026-11: cortinas are searched by title, artist, culture / language, genre, tags and year (the shared engine) */
const CORTINA_FIELDS = [
  { name: "title", weight: 10, get: (m: Merged) => m.c.title },
  { name: "artist", weight: 8, get: (m: Merged) => m.c.artist },
  { name: "culture", weight: 4, get: (m: Merged) => m.c.culture },
  { name: "genre", weight: 4, get: (m: Merged) => m.c.genre },
  { name: "tags", weight: 2, get: (m: Merged) => m.c.tags ?? [] },
  { name: "year", weight: 2, get: (m: Merged) => (m.c.year ? String(m.c.year) : null) },
];
const HL = [
  { field: "title", get: (m: Merged) => m.c.title },
  { field: "artist", get: (m: Merged) => m.c.artist },
];

export function CortinasTab({ base }: { base: MetaCortina[] }) {
  const { overrides, update } = useDb();
  const ov = overrides.cortinas ?? {};
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const merged = useMemo(() => {
    const out: Merged[] = [];
    for (const b of base) {
      const o = ov[b.id];
      if (o === null) out.push({ c: b as Cortina, state: "deleted" });
      else if (o) out.push({ c: o, state: "edited" });
      else out.push({ c: b as Cortina, state: "index" });
    }
    for (const [id, c] of Object.entries(ov))
      if (c && !base.some((b) => b.id === id)) out.push({ c, state: "added" });
    return out;
  }, [base, ov]);
  // 2026-11: the page's one search text (lib/usePageQuery.ts): it stays when the tab changes
  const [q, setQ] = useSharedQuery();
  const [active, setActive] = useState(-1);
  const found = useTextSearch(merged, CORTINA_FIELDS, q, { highlight: HL });
  const searching = !!q.trim();
  const shown = searching
    ? found.items
    : merged.map((doc, index) => ({
        doc,
        index,
        score: 0,
        highlights: {} as Record<string, Array<[number, number]>>,
      }));
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new query starts the keyboard selection over
  useEffect(() => setActive(-1), [q]);
  useEffect(() => {
    if (active >= 0) document.getElementById(`cortina-row-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

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
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && shown.length) {
      e.preventDefault();
      setActive((a) => Math.min(shown.length - 1, a + 1));
    } else if (e.key === "ArrowUp" && shown.length) {
      e.preventDefault();
      setActive((a) => Math.max(-1, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const m = shown[active >= 0 ? active : 0];
      if (m) open(m.doc.c);
    } else if (e.key === "Escape" && q) {
      e.preventDefault();
      setQ("");
    }
  };
  return (
    <div>
      <SearchField
        id="cortina-search"
        value={q}
        onChange={setQ}
        placeholder={t("search.cortinas_placeholder")}
        label={t("search.search_cortinas")}
        className="mt-3"
        inputProps={{
          onKeyDown,
          "aria-activedescendant": active >= 0 ? `cortina-row-${active}` : undefined,
        }}
      />
      {searching && !shown.length && (
        <Empty>
          {t("search.nothing_matches", { q })}
          {found.suggestion && (
            <>
              {" "}
              {t("search.did_you_mean")}{" "}
              <button
                type="button"
                className="btn-plain min-h-11 font-semibold"
                onClick={() => setQ(found.suggestion!)}
              >
                {found.suggestion}
              </button>
              ?
            </>
          )}
        </Empty>
      )}
      <Group
        header={
          searching
            ? t("search.cortinas_shown", { shown: shown.length, total: merged.length })
            : t("db.cortinasTab.cortinas")
        }
        footer={t("db.cortinasTab.cortinas_in_your_pool_a_spotify", {
          length: merged.filter((m) => m.state !== "deleted").length,
        })}
        data-testid="cortina-list"
      >
        {shown.map(({ doc: { c, state }, highlights: hl }, i) => (
          // 2026-11: the play button beside the row plays the cortina from its chorus (the row opens the editor)
          <div key={c.id} className="relative flex items-center pr-2" data-testid="db-cortina-row">
            <div className="min-w-0 flex-1">
              <Row
                id={`cortina-row-${i}`}
                data-testid="cortina-row"
                aria-current={i === active ? "true" : undefined}
                className={i === active ? "search-row-active" : ""}
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
                    <Highlight text={c.artist} spans={hl.artist} /> –{" "}
                    <Highlight text={c.title} spans={hl.title} />
                  </span>
                }
                sub={t("db.cortinasTab.energy", {
                  genre: c.genre,
                  culture: c.culture,
                  energy: c.energy,
                  p1: state !== "index" ? ` · ${state}` : "",
                })}
                value={fmtSec(c.lengthSec ?? 45)}
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
