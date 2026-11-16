"use client";
import { type FavouriteRow, favouriteRows, favouritesCsv, type SlotRole, singerDisplay } from "@tdj/core";
import { Download, Heart } from "lucide-react";
import { useMemo, useState } from "react";
import { downloadBlob } from "@/lib/download";
import { favouritesOf, favouritesOn, resetFavouriteRow, setFavouritesUse } from "@/lib/favourites";
import { plural, t } from "@/lib/i18n";
import { popularityText } from "@/lib/popularity";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { Song } from "@/lib/types";
import { ActionRow, Group, Row, SwitchRow, Tile } from "../Form";
import { Segmented } from "../ui";
import { PlayButton } from "../ui/SongRow";
import { DatabaseFavourites, PopularitySwitch, usePopularity } from "./DatabaseFavourites";

type RoleFilter = "all" | SlotRole;
const ROLES: SlotRole[] = ["warmup", "build", "peak", "cooldown", "close"];
const roleLabel = (r: SlotRole) => t(`fav.role.${r}`);

/** "♥ 7 · full 5 · emptied 0 · 3 nights" */
export const evidenceText = (r: Pick<FavouriteRow, "hearts" | "full" | "emptied" | "nights">) =>
  t("fav.evidence", {
    hearts: r.hearts,
    full: r.full,
    emptied: r.emptied,
    nights: plural("plural.fav_nights", r.nights),
  });

function familyLabel(r: FavouriteRow): string {
  const [, singer, rhythm, band] = (r.family ?? "").split("|");
  const orch = r.song?.orchestra ?? (r.family ?? "").split("|")[0] ?? "";
  const who = singer
    ? `${orch} / ${singerDisplay(r.song?.singer ?? singer)}`
    : `${orch} ${t("fav.instrumental")}`;
  return [who, rhythm, band ? `${band}–${Number(band) + 4}` : null].filter(Boolean).join(" · ");
}

/**
 * 2026-11 (Database → Memory → Dancer favourites): what filled the floor, by part of the night — the top songs and
 * families per role with their evidence, a reset per row, the switch "Use dancer favourites when composing" (on by
 * default) and the list as CSV. Only counts: nothing about a dancer is kept.
 */
export function DancerFavourites() {
  const memory = useStore((s) => s.memory);
  const updateMemory = useStore((s) => s.updateMemory);
  const [role, setRole] = useState<RoleFilter>("all");
  const rows = useMemo(() => favouriteRows(favouritesOf(memory)), [memory]);
  const shown = rows.filter((r) => role === "all" || r.role === role);
  const songs = shown.filter((r) => r.kind === "song").slice(0, 12);
  const families = shown.filter((r) => r.kind === "family").slice(0, 8);
  // 2026-11: popularity from databases — the list of its own, and the source line of the DJ's own favourites
  const [from, setFrom] = useState<"nights" | "databases">("nights");
  const db = usePopularity({ ids: songs.map((r) => r.key.slice(5)) });
  const dbLine = (id: string) => {
    const parts = db?.rows.find((x) => x.id === id)?.parts;
    return parts?.length ? popularityText(parts) : "";
  };
  const on = favouritesOn(memory);
  const reset = (r: FavouriteRow) => {
    updateMemory((m) => resetFavouriteRow(m, r.key as `song:${string}`));
    toast(t("fav.reset_toast"));
  };
  const resetButton = (r: FavouriteRow, name: string) => (
    <button
      type="button"
      className="btn-plain min-h-11 shrink-0 px-2 text-[var(--destructive)]"
      aria-label={t("fav.reset_row", { name })}
      onClick={(e) => {
        e.stopPropagation();
        reset(r);
      }}
      data-testid="fav-reset"
    >
      {t("fav.reset")}
    </button>
  );
  const line = (r: FavouriteRow) => (
    <span data-testid="fav-evidence">
      {roleLabel(r.role)} · {evidenceText(r)}
    </span>
  );
  return (
    <section id="dancer-favourites" data-testid="dancer-favourites" className="scroll-mt-24">
      <Group header={t("fav.title")} footer={t("fav.use_footer")}>
        <SwitchRow
          label={t("fav.use_switch")}
          checked={on}
          onChange={(v) => updateMemory((m) => setFavouritesUse(m, v))}
          tile={
            <Tile color="#c9426a">
              <Heart size={16} strokeWidth={2} />
            </Tile>
          }
        />
        <PopularitySwitch />
      </Group>
      <div className="px-4 pb-2">
        <Segmented<"nights" | "databases">
          value={from}
          items={[
            ["nights", t("pop.from_nights")],
            ["databases", t("pop.from_databases")],
          ]}
          onChange={setFrom}
          label={t("pop.source_filter")}
        />
      </div>
      {(rows.length > 0 || from === "databases") && (
        <div className="px-4 pb-2">
          <Segmented<RoleFilter>
            value={role}
            items={[["all", t("fav.role_all")], ...ROLES.map((r): [RoleFilter, string] => [r, roleLabel(r)])]}
            onChange={setRole}
            label={t("fav.role_filter")}
          />
        </div>
      )}
      {from === "databases" && <DatabaseFavourites role={role === "all" ? undefined : role} />}
      {from === "nights" && (
        <Group header={t("fav.top_songs")} data-testid="fav-songs">
          {rows.length === 0 && (
            <div className="cell text-[var(--label-2)]" data-testid="fav-empty">
              {t("fav.none")} {t("fav.seed_note")}
            </div>
          )}
          {rows.length > 0 && songs.length === 0 && (
            <div className="cell text-[var(--label-2)]">{t("fav.none_in_role")}</div>
          )}
          {songs.map((r) => (
            <div key={`${r.key}#${r.role}`} data-testid="fav-song" data-song-id={r.key.slice(5)}>
              <Row
                label={
                  <span lang="es">
                    {r.rate >= 0.25 && (
                      <span className="mr-1 text-[var(--energy)]" aria-hidden>
                        ♥
                      </span>
                    )}
                    {r.song?.title ?? r.key.slice(5)}
                  </span>
                }
                sub={
                  <>
                    <span lang="es">
                      {[r.song?.orchestra, singerDisplay(r.song?.singer)].filter(Boolean).join(" / ")}
                      {r.song?.year ? ` · ${r.song.year}` : ""}
                    </span>
                    {" · "}
                    {line(r)}
                    {dbLine(r.key.slice(5)) && (
                      <span data-testid="fav-db-source"> · {dbLine(r.key.slice(5))}</span>
                    )}
                  </>
                }
              >
                {r.song && (
                  <PlayButton song={{ ...r.song, id: r.key.slice(5) } as unknown as Song} className="-my-2" />
                )}
                {resetButton(r, r.song?.title ?? "")}
              </Row>
            </div>
          ))}
        </Group>
      )}
      {from === "nights" && (
        <Group header={t("fav.top_families")} data-testid="fav-families">
          {families.length === 0 && <div className="cell text-[var(--label-2)]">{t("fav.none_in_role")}</div>}
          {families.map((r) => (
            <div key={`${r.key}#${r.role}`} data-testid="fav-family">
              <Row label={<span lang="es">{familyLabel(r)}</span>} sub={line(r)}>
                {resetButton(r, familyLabel(r))}
              </Row>
            </div>
          ))}
        </Group>
      )}
      {rows.length > 0 && from === "nights" && (
        <Group>
          <ActionRow
            label={
              <span className="inline-flex items-center gap-2">
                <Download size={16} aria-hidden /> {t("fav.export_csv")}
              </span>
            }
            onClick={() => {
              downloadBlob("tdj-dancer-favourites.csv", favouritesCsv(rows), "text/csv");
              toast(t("fav.exported"));
            }}
            id="fav-export"
          />
        </Group>
      )}
    </section>
  );
}
