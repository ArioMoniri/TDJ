"use client";
import "./search.css";
import type { SongFacets, SongFilters } from "@tdj/core";
import { Heart } from "lucide-react";
import { fmtNumber, t } from "@/lib/i18n";

/**
 * The search's filter chips (2026-11, Library and Database): rhythm, vocal / instrumental, ♥ favourites and Spotify
 * on one line, then decades, orchestras and singers each on a line that scrolls inside itself. Every chip shows how
 * many results it leaves (core `searchSongs` facets: each kind counted with the other chips on), and a chip of the
 * same kind as one that is on adds to it (Tango + Vals = either).
 */

const RHYTHMS = ["tango", "vals", "milonga"] as const;
const toggle = <T,>(list: readonly T[] | undefined, v: T): T[] | undefined => {
  const l = list ?? [];
  const next = l.includes(v) ? l.filter((x) => x !== v) : [...l, v];
  return next.length ? next : undefined;
};

export function filtersActive(f: SongFilters): number {
  return (
    (f.rhythms?.length ?? 0) +
    (f.decades?.length ?? 0) +
    (f.orchestraIds?.length ?? 0) +
    (f.singers?.length ?? 0) +
    (f.vocal !== undefined ? 1 : 0) +
    (f.favouritesOnly ? 1 : 0) +
    (f.hasSpotify ? 1 : 0)
  );
}

function Chip({
  on,
  label,
  count,
  onClick,
  testId,
  icon,
}: {
  on: boolean;
  label: string;
  count?: number;
  onClick: () => void;
  testId?: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="search-chip"
      aria-pressed={on}
      onClick={onClick}
      data-testid={testId}
      disabled={!on && count === 0}
    >
      {icon}
      <span>{label}</span>
      {count !== undefined && (
        <span className="search-chip-count" data-testid={testId ? `${testId}-count` : undefined}>
          <span className="sr-only">, </span>
          {fmtNumber(count)}
          <span className="sr-only"> {t("search.results_word")}</span>
        </span>
      )}
    </button>
  );
}

export function SearchChips({
  facets,
  filters,
  onChange,
  favourites = true,
  more = true,
  idPrefix = "chip",
}: {
  facets: SongFacets | null | undefined;
  filters: SongFilters;
  onChange: (f: SongFilters) => void;
  /** offer the ♥ chip (the DJ has favourites) */
  favourites?: boolean;
  /** the decade / orchestra / singer lines */
  more?: boolean;
  idPrefix?: string;
}) {
  const set = (patch: Partial<SongFilters>) => {
    const next: SongFilters = { ...filters, ...patch };
    for (const k of Object.keys(next) as Array<keyof SongFilters>) if (next[k] === undefined) delete next[k];
    onChange(next);
  };
  const rc = (r: string) => facets?.rhythm.find((x) => x.key === r)?.count ?? (facets ? 0 : undefined);
  const decades = (facets?.decade ?? []).filter((d) => d.count > 0 || filters.decades?.includes(d.key));
  const orchestras = [...(facets?.orchestra ?? [])];
  for (const id of filters.orchestraIds ?? [])
    if (!orchestras.some((o) => o.key === id)) orchestras.unshift({ key: id, label: id, count: 0 });
  const singers = [...(facets?.singer ?? [])].slice(0, 10);
  for (const s of filters.singers ?? [])
    if (!singers.some((o) => o.key === s)) singers.unshift({ key: s, count: 0 });
  const n = filtersActive(filters);
  return (
    <div data-testid={`${idPrefix}s`}>
      <fieldset className="search-chips m-0 border-0 p-0">
        <legend className="sr-only">{t("search.filters")}</legend>
        {RHYTHMS.map((r) => (
          <Chip
            key={r}
            on={!!filters.rhythms?.includes(r)}
            label={t(`search.rhythm_${r}` as "search.rhythm_tango")}
            count={rc(r)}
            onClick={() => set({ rhythms: toggle(filters.rhythms, r) })}
            testId={`${idPrefix}-rhythm-${r}`}
          />
        ))}
        <Chip
          on={filters.vocal === true}
          label={t("search.vocal")}
          count={facets?.vocal.vocal}
          onClick={() => set({ vocal: filters.vocal === true ? undefined : true })}
          testId={`${idPrefix}-vocal`}
        />
        <Chip
          on={filters.vocal === false}
          label={t("search.instrumental")}
          count={facets?.vocal.instrumental}
          onClick={() => set({ vocal: filters.vocal === false ? undefined : false })}
          testId={`${idPrefix}-instrumental`}
        />
        {favourites && (
          <Chip
            on={!!filters.favouritesOnly}
            label={t("search.favourites")}
            icon={<Heart size={14} strokeWidth={2.25} aria-hidden className="text-[var(--destructive)]" />}
            count={facets?.favourites}
            onClick={() => set({ favouritesOnly: filters.favouritesOnly ? undefined : true })}
            testId={`${idPrefix}-favourites`}
          />
        )}
        <Chip
          on={!!filters.hasSpotify}
          label={t("search.on_spotify")}
          count={facets?.spotify}
          onClick={() => set({ hasSpotify: filters.hasSpotify ? undefined : true })}
          testId={`${idPrefix}-spotify`}
        />
        {n > 0 && (
          <button
            type="button"
            className="btn-plain min-h-11 px-2"
            onClick={() => onChange(filters.favourites ? { favourites: filters.favourites } : {})}
            data-testid={`${idPrefix}-clear`}
          >
            {t("search.clear_filters", { n })}
          </button>
        )}
      </fieldset>
      {more && decades.length > 1 && (
        <fieldset className="m-0 min-w-0 border-0 p-0" aria-label={t("search.decade")}>
          <div className="search-chips search-chips-scroll">
            {decades.map((d) => (
              <Chip
                key={d.key}
                on={!!filters.decades?.includes(d.key)}
                label={t("search.decade_label", { decade: d.key })}
                count={d.count}
                onClick={() => set({ decades: toggle(filters.decades, d.key) })}
                testId={`${idPrefix}-decade-${d.key}`}
              />
            ))}
          </div>
        </fieldset>
      )}
      {more && orchestras.length > 1 && (
        <fieldset className="m-0 min-w-0 border-0 p-0" aria-label={t("search.orchestra")}>
          <div className="search-chips search-chips-scroll">
            {orchestras.slice(0, 12).map((o) => (
              <Chip
                key={o.key}
                on={!!filters.orchestraIds?.includes(o.key)}
                label={o.label ?? o.key}
                count={o.count}
                onClick={() => set({ orchestraIds: toggle(filters.orchestraIds, o.key) })}
                testId={`${idPrefix}-orchestra-${o.key}`}
              />
            ))}
          </div>
        </fieldset>
      )}
      {more && singers.length > 1 && (
        <fieldset className="m-0 min-w-0 border-0 p-0" aria-label={t("search.singer")}>
          <div className="search-chips search-chips-scroll">
            {singers.map((o) => (
              <Chip
                key={o.key}
                on={!!filters.singers?.includes(o.key)}
                label={singerLabel(o.key)}
                count={o.count}
                onClick={() => set({ singers: toggle(filters.singers, o.key) })}
                testId={`${idPrefix}-singer`}
              />
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}

/**
 * A singer facet's chip: a duo credit ("T. García - R. Cané") reads as one credit, "Duo · T. García & R. Cané", never
 * as an odd third singer beside each of its two (2026-11, DJ review of the Database).
 */
export function singerLabel(key: string): string {
  const parts = key
    .split(/\s+[-–—&]\s+|\s+y\s+|\s*\/\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
  return parts.length > 1 ? `${t("search.duo")} · ${parts.join(" & ")}` : key;
}
