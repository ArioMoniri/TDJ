"use client";
import type { PopularitySource, SlotRole } from "@tdj/core";
import { singerDisplay } from "@tdj/core";
import { Database } from "lucide-react";
import { useEffect, useState } from "react";
import type { PopularityApi, PopularityApiRow } from "@/lib/api/popularity";
import { t } from "@/lib/i18n";
import { popularityText, popularityUse, setPopularityUse } from "@/lib/popularity";
import { useStore } from "@/lib/store";
import type { Song } from "@/lib/types";
import { Group, Row, SwitchRow, Tile } from "../Form";
import { PlayButton } from "../ui/SongRow";

/**
 * 2026-11 (Database → Memory → Dancer favourites, "From databases"): the dancer-popularity prior from DJ sets,
 * canonical tandas, public set lists and listening ranks (GET /api/popularity), with the sources behind each entry,
 * and the switch "Use popularity from databases" (also in Settings). Read-only: the DJ's own floor taps outweigh it.
 */

/** the popularity rows of a query (the top in a role, or the entries of some ids); null while loading */
export function usePopularity(q: { role?: SlotRole; limit?: number; ids?: string[] }): PopularityApi | null {
  const [data, setData] = useState<PopularityApi | null>(null);
  const key = q.ids
    ? `ids=${encodeURIComponent(q.ids.join(","))}`
    : `limit=${q.limit ?? 20}${q.role ? `&role=${q.role}` : ""}`;
  // (the key holds every field of the query; no ids asked: nothing to fetch)
  const none = !!q.ids && !q.ids.length;
  useEffect(() => {
    if (none) {
      setData({ available: true, sources: {}, rows: [] });
      return;
    }
    let live = true;
    fetch(`/api/popularity?${key}`)
      .then((r) => (r.ok ? (r.json() as Promise<PopularityApi>) : null))
      .then((j) => live && setData(j ?? { available: false, sources: {}, rows: [] }))
      .catch(() => live && setData({ available: false, sources: {}, rows: [] }));
    return () => {
      live = false;
    };
  }, [key, none]);
  return data;
}

/** "Use popularity from databases" (default on) */
export function PopularitySwitch() {
  const memory = useStore((s) => s.memory);
  const updateMemory = useStore((s) => s.updateMemory);
  return (
    <SwitchRow
      label={t("pop.use_switch")}
      tip={t("pop.use_tip")}
      checked={popularityUse(memory)}
      disabled={!!memory?.favourites?.off}
      onChange={(v) => updateMemory((m) => setPopularityUse(m, v))}
      tile={
        <Tile color="#5856d6">
          <Database size={16} strokeWidth={2} />
        </Tile>
      }
    />
  );
}

const name = (r: PopularityApiRow) => r.song?.title ?? r.id;

/** the top recordings from databases (in a role: by its role score) */
export function DatabaseFavourites({ role }: { role?: SlotRole }) {
  const memory = useStore((s) => s.memory);
  const data = usePopularity({ role, limit: 20 });
  const on = popularityUse(memory);
  const blocked = Object.entries(data?.sources ?? {})
    .filter(([, s]) => s.status !== "ok")
    .map(([k]) => t(`pop.source.${k as PopularitySource}`));
  const used = Object.entries(data?.sources ?? {})
    .filter(([, s]) => s.status === "ok")
    .map(([k]) => t(`pop.source.${k as PopularitySource}`));
  return (
    <Group
      header={t("pop.top_songs")}
      footer={
        data?.available
          ? [
              t("pop.footer", { sources: used.join(", "), date: data.asOf ?? "" }),
              blocked.length ? t("pop.unavailable", { sources: blocked.join(", ") }) : "",
              on ? "" : t("pop.off_note"),
            ]
              .filter(Boolean)
              .join(" ")
          : undefined
      }
      data-testid="fav-db-songs"
    >
      {!data && <div className="cell text-[var(--label-2)]">{t("pop.loading")}</div>}
      {data && !data.rows.length && <div className="cell text-[var(--label-2)]">{t("pop.none")}</div>}
      {data?.rows.map((r) => (
        <div key={r.id} data-testid="fav-db-song" data-song-id={r.id}>
          <Row
            label={<span lang="es">{name(r)}</span>}
            sub={
              <>
                <span lang="es">
                  {[r.song?.orchestra, singerDisplay(r.song?.singer)].filter(Boolean).join(" / ")}
                  {r.song?.year ? ` · ${r.song.year}` : ""}
                </span>
                {" · "}
                <span data-testid="fav-db-evidence">{popularityText(r.parts)}</span>
              </>
            }
            value={t("pop.score", { score: Math.round(r.score * 100) })}
          >
            {r.song && (
              <PlayButton song={{ ...r.song, id: r.id } as unknown as Song} className="-my-2 -mr-2" />
            )}
          </Row>
        </div>
      ))}
    </Group>
  );
}
