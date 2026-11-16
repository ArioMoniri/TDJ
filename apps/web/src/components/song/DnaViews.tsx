"use client";
import type { DnaRecording, PeopleDna, Song, SongDna } from "@tdj/core";
import { singerDisplay } from "@tdj/core";
import { ChevronRight, Heart, Info } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fmtDate, plural, t } from "@/lib/i18n";
import { songHistory } from "@/lib/songHistory";
import { type DnaTarget, openSongDetails, useSongOpen } from "@/lib/songOpen";
import { useStore } from "@/lib/store";
import { Group } from "../Form";
import { Artwork } from "../ui/Artwork";
import { TandaTypeBadge } from "../ui/TandaTypeBadge";
import { DnaLink } from "./DnaLink";
import { SidesList } from "./SidesList";
import { lengthText } from "./SongFacts";
import "./song.css";

type WithSides<T> = T & { sides: Record<string, Song> };

function useDna<T>(t0: DnaTarget): { data: T | null; error: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    setData(null);
    setError(false);
    fetch(`/api/dna?kind=${t0.kind}&id=${encodeURIComponent(t0.id)}`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((j: T) => live && setData(j))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [t0.kind, t0.id]);
  return { data, error };
}

/** a Song DNA page by target: the work, an orchestra or a singer */
export function DnaView({ target }: { target: DnaTarget }) {
  if (target.kind === "song") return <SongDnaView id={target.id} />;
  return <PeopleView target={target} />;
}

const sidesFor = (rows: readonly DnaRecording[], sides: Record<string, Song>) =>
  rows.map((r) => sides[r.id]).filter((s): s is Song => !!s);

const yearsText = (y: [number, number] | null | undefined) =>
  y ? (y[0] === y[1] ? `${y[0]}` : `${y[0]}–${y[1]}`) : "";

function Loading({ error }: { error: boolean }) {
  return (
    <p className="text-body mt-8 text-center text-[var(--label-2)]" data-testid="dna-loading">
      {error ? t("song.dna_not_found") : t("song.loading")}
    </p>
  );
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="dna-stat">
      <div className="text-title2 tabular-nums">{value}</div>
      <div className="text-footnote text-[var(--label-2)]">{label}</div>
    </div>
  );
}

/* ---------- the work ---------- */

export function SongDnaView({ id }: { id: string }) {
  const { data: d, error } = useDna<WithSides<SongDna>>({ kind: "song", id });
  const history = useStore((s) => s.history);
  const favourites = useStore((s) => s.memory.favourites);
  const mine = useMemo(
    () => (d ? songHistory({ id: d.song.id, title: d.song.title }, history, favourites) : null),
    [d, history, favourites],
  );
  if (!d) return <Loading error={error} />;
  const me = d.sides[d.song.id];
  const c = d.work.credit;
  const byDecade = new Map<string, DnaRecording[]>();
  for (const r of d.recordings) {
    const k = r.year ? `${Math.floor(r.year / 10) * 10}s` : t("song.undated");
    byDecade.set(k, [...(byDecade.get(k) ?? []), r]);
  }
  const lo = d.work.firstYear ?? 1900;
  const hi = Math.max(lo + 1, d.work.lastYear ?? lo + 1);
  const stack = new Map<number, number>();
  return (
    <article
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 pb-6"
      data-testid="song-dna"
      data-song={d.song.id}
    >
      <header className="mt-2 flex items-start gap-4">
        {me && (
          <Artwork src={null} song={me} orchestra={me.orchestra} orchestraId={me.orchestraId} size="l" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-footnote uppercase tracking-wide text-[var(--label-2)]">{t("song.song_dna")}</p>
          <h1 className="text-title1" lang="es" data-testid="dna-title">
            {d.work.title}
          </h1>
          <p className="text-subhead text-[var(--label-2)]" lang="es" data-testid="dna-credit">
            {c
              ? [
                  t("song.music_by", { names: c.composers.join(", ") }),
                  c.lyricists.length
                    ? t("song.lyrics_by", { names: c.lyricists.join(", ") })
                    : t("song.instrumental_work"),
                  c.year ? t("song.written", { year: c.year }) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : t("song.credits_unknown")}
          </p>
          <div className="mt-1">
            <TandaTypeBadge rhythm={d.song.rhythm} compact />
          </div>
        </div>
      </header>
      <div className="dna-stats">
        <Stat value={d.work.count} label={t("song.dna_recordings")} />
        <Stat value={d.work.orchestras} label={t("song.dna_orchestras")} />
        <Stat
          value={yearsText(d.work.firstYear ? [d.work.firstYear, d.work.lastYear!] : null) || "–"}
          label={t("song.dna_years")}
        />
      </div>

      <Group header={t("song.dna_this_recording")}>
        {me && (
          <button
            type="button"
            className="cell cell-tap w-full text-left"
            onClick={() => openSongDetails(me)}
            data-testid="dna-open-details"
          >
            <Info size={18} strokeWidth={2} className="text-[var(--tint)]" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block" lang="es">
                {me.orchestra} · {singerDisplay(me.singer) ?? t("song.instrumental")}
              </span>
              <span className="text-footnote block text-[var(--label-2)]">
                {me.year ?? t("song.undated")} · {lengthText(me)} · {t("song.dna_details_sub")}
              </span>
            </span>
            <ChevronRight size={16} strokeWidth={2.5} className="cell-chevron" aria-hidden />
          </button>
        )}
      </Group>

      <section>
        <h2 className="section-head">{t("song.dna_timeline")}</h2>
        <div className="group-inset">
          <div className="dna-timeline" data-testid="dna-timeline" aria-hidden>
            {d.recordings.map((r) => {
              if (!r.year) return null;
              const n = stack.get(r.year) ?? 0;
              stack.set(r.year, n + 1);
              return (
                <span
                  key={r.id}
                  className="dna-timeline-dot"
                  data-vocal={r.vocal || undefined}
                  data-current={r.current || undefined}
                  style={{ left: `${((r.year - lo) / (hi - lo)) * 100}%`, bottom: Math.min(48, n * 9) }}
                  title={`${r.year} · ${r.orchestra}`}
                />
              );
            })}
          </div>
          <div className="text-caption1 flex justify-between px-4 pb-2 tabular-nums text-[var(--label-2)]">
            <span>{lo}</span>
            <span className="flex flex-wrap items-center justify-center gap-x-2">
              <span className="inline-flex items-center gap-1">
                <i className="dna-key" data-vocal="" aria-hidden /> {t("song.dna_key_vocal")}
              </span>
              <span className="inline-flex items-center gap-1">
                <i className="dna-key" aria-hidden /> {t("song.dna_key_instrumental")}
              </span>
              <span className="inline-flex items-center gap-1">
                <i className="dna-key" data-current="" aria-hidden /> {t("song.dna_key_this")}
              </span>
            </span>
            <span>{hi}</span>
          </div>
        </div>
      </section>

      <section data-testid="dna-recordings">
        <h2 className="section-head">{t("song.dna_every_recording", { n: d.work.count })}</h2>
        <div className="grid gap-3">
          {[...byDecade.entries()].map(([dec, rows]) => (
            <div key={dec}>
              <p className="text-footnote mb-1 px-4 text-[var(--label-2)]">{dec}</p>
              <SidesList
                songs={sidesFor(rows, d.sides)}
                label={`${d.work.title} · ${dec}`}
                testId={`dna-decade-${dec}`}
              />
            </div>
          ))}
        </div>
      </section>

      <div className="dna-two">
        {d.orchestraAround.length > 0 && (
          <section>
            <h2 className="section-head">
              {t("song.dna_orchestra_around", { orchestra: d.song.orchestra, year: d.song.year ?? "" })}
            </h2>
            <SidesList
              songs={sidesFor(d.orchestraAround, d.sides)}
              label={d.song.orchestra}
              testId="dna-orch-around"
              max={12}
            />
            <PeopleLink to={{ kind: "orchestra", id: d.song.orchestraId }} name={d.song.orchestra} />
          </section>
        )}
        {d.singerAround.length > 0 && d.song.singerId && (
          <section>
            <h2 className="section-head">
              {t("song.dna_singer_around", {
                singer: singerDisplay(d.song.singer) ?? "",
                year: d.song.year ?? "",
              })}
            </h2>
            <SidesList
              songs={sidesFor(d.singerAround, d.sides)}
              label={d.song.singer ?? ""}
              testId="dna-singer-around"
              max={12}
            />
            <PeopleLink to={{ kind: "singer", id: d.song.singerId }} name={d.song.singer ?? ""} />
          </section>
        )}
      </div>

      <section data-testid="dna-family">
        <h2 className="section-head">{t("song.dna_family")}</h2>
        <p className="section-foot -mt-1 mb-1">
          {d.family.sides.length
            ? t("song.dna_family_sub", {
                n: d.family.sides.length,
                years: yearsText(d.family.years),
                voice: singerDisplay(d.song.singer) ?? t("song.instrumental"),
              })
            : t("song.dna_family_none")}
        </p>
        <SidesList
          songs={sidesFor(d.family.sides, d.sides)}
          label={t("song.dna_family")}
          testId="dna-family-list"
          max={12}
        />
        {d.canonical.length > 0 && (
          <Group header={t("song.dna_canonical")} footer={t("song.dna_canonical_foot")}>
            {d.canonical.map((c0) => (
              <div key={c0.id} className="cell">
                <span className="min-w-0 flex-1">
                  <span className="block" lang="es">
                    {c0.titles.join(" · ")}
                  </span>
                  <span className="text-footnote block text-[var(--label-2)]">
                    {[yearsText(c0.years), singerDisplay(c0.singer) ?? t("song.instrumental")]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </div>
            ))}
          </Group>
        )}
      </section>

      {d.related.length > 0 && (
        <Group header={t("song.dna_related")} footer={t("song.dna_related_foot")} data-testid="dna-related">
          {d.related.map((r) =>
            r.songId ? (
              <DnaLink
                key={r.credit.title}
                to={{ kind: "song", id: r.songId }}
                className="cell cell-tap w-full text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block" lang="es">
                    {r.credit.title}
                  </span>
                  <span className="text-footnote block text-[var(--label-2)]" lang="es">
                    {[...r.credit.composers, ...r.credit.lyricists].join(", ")}
                    {r.credit.year ? ` · ${r.credit.year}` : ""} ·{" "}
                    {plural("plural.song_recordings", r.recordings)}
                  </span>
                </span>
                <ChevronRight size={16} strokeWidth={2.5} className="cell-chevron" aria-hidden />
              </DnaLink>
            ) : null,
          )}
        </Group>
      )}

      {mine && (
        <Group header={t("song.dna_you")} footer={t("song.dna_you_foot")} data-testid="dna-you">
          <div className="cell">
            <span className="min-w-0 flex-1">{t("song.dna_floor")}</span>
            <span className="cell-value text-body tabular-nums">
              {t("song.dna_floor_counts", { full: mine.full, ok: mine.ok, emptied: mine.emptied })}
            </span>
          </div>
          <div className="cell">
            <span className="min-w-0 flex-1">{t("song.dna_hearts")}</span>
            <span className="cell-value text-body tabular-nums">
              {mine.favourite && (
                <Heart
                  size={14}
                  fill="currentColor"
                  className="mr-1 inline text-[var(--destructive)]"
                  aria-hidden
                />
              )}
              {mine.hearts}
            </span>
          </div>
          {mine.nights.length === 0 && (
            <div className="cell text-[var(--label-2)]">{t("song.dna_no_nights")}</div>
          )}
          {mine.nights.slice(0, 12).map((n) => (
            <div key={n.id} className="cell">
              <span className="min-w-0 flex-1">
                <span className="block">{n.title}</span>
                <span className="text-footnote block text-[var(--label-2)]">
                  {fmtDate(new Date(n.at), { dateStyle: "medium" })} ·{" "}
                  {n.played ? t("song.dna_played") : t("song.dna_planned")}
                  {n.version === "other" ? ` · ${t("song.dna_other_version")}` : ""}
                </span>
              </span>
            </div>
          ))}
        </Group>
      )}
    </article>
  );
}

function PeopleLink({ to, name }: { to: DnaTarget; name: string }) {
  return (
    <div className="group-inset mt-2">
      <DnaLink to={to} className="cell cell-tap w-full text-left" testId={`dna-open-${to.kind}`}>
        <span className="min-w-0 flex-1" lang="es">
          {to.kind === "orchestra"
            ? t("song.open_orchestra_page", { orchestra: name })
            : t("song.open_singer_page", { singer: name })}
        </span>
        <ChevronRight size={16} strokeWidth={2.5} className="cell-chevron" aria-hidden />
      </DnaLink>
    </div>
  );
}

/* ---------- an orchestra or a singer ---------- */

function PeopleView({ target }: { target: DnaTarget }) {
  const { data: d, error } = useDna<WithSides<PeopleDna>>(target);
  if (!d) return <Loading error={error} />;
  const orch = target.kind === "orchestra";
  const years = Object.keys(d.byYear)
    .map(Number)
    .sort((a, b) => a - b);
  const max = Math.max(1, ...Object.values(d.byYear));
  const span0 = years[0] ?? 0;
  const all = years.length ? Array.from({ length: years.at(-1)! - span0 + 1 }, (_, i) => span0 + i) : [];
  const openSides = useSongOpen.getState().openSides;
  const highlights = sidesFor(d.highlights, d.sides);
  return (
    <article
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 pb-6"
      data-testid={orch ? "orchestra-dna" : "singer-dna"}
    >
      <header className="mt-2 flex items-center gap-4">
        {orch && <Artwork src={null} orchestra={d.name} orchestraId={d.id} size="l" />}
        <div className="min-w-0 flex-1">
          <p className="text-footnote uppercase tracking-wide text-[var(--label-2)]">
            {orch ? t("song.orchestra") : t("song.singer")}
          </p>
          <h1 className="text-title1" lang="es" data-testid="dna-title">
            {d.name}
          </h1>
          <p className="text-subhead text-[var(--label-2)]">{yearsText(d.years)}</p>
        </div>
      </header>
      <div className="dna-stats">
        <Stat value={d.count} label={t("song.dna_sides")} />
        {orch ? (
          <>
            <Stat value={d.instrumental} label={t("song.instrumental")} />
            <Stat value={d.singers.length} label={t("song.dna_singers")} />
          </>
        ) : (
          <Stat value={d.orchestras.length} label={t("song.dna_orchestras")} />
        )}
        <Stat value={d.rhythms.vals ?? 0} label={t("tandaType.vals")} />
        <Stat value={d.rhythms.milonga ?? 0} label={t("tandaType.milonga")} />
      </div>
      {all.length > 1 && (
        <section>
          <h2 className="section-head">{t("song.dna_by_year")}</h2>
          <div className="group-inset">
            <div className="dna-bars" aria-hidden>
              {all.map((y) => (
                <span
                  key={y}
                  style={{ height: `${((d.byYear[y] ?? 0) / max) * 100}%` }}
                  title={`${y}: ${d.byYear[y] ?? 0}`}
                />
              ))}
            </div>
            <div className="text-caption1 flex justify-between px-4 pb-2 tabular-nums text-[var(--label-2)]">
              <span>{all[0]}</span>
              <span>{all.at(-1)}</span>
            </div>
          </div>
        </section>
      )}
      <Group header={orch ? t("song.dna_recorded_with") : t("song.dna_sang_with")} data-testid="dna-people">
        {(orch ? d.singers : d.orchestras).slice(0, 30).map((p) => (
          <button
            key={p.id ?? p.name}
            type="button"
            className="cell cell-tap w-full text-left"
            data-testid="dna-person"
            onClick={() =>
              orch
                ? openSides({ orchestraId: d.id, orchestra: d.name, singer: p.name })
                : openSides({ orchestraId: p.id ?? "", orchestra: p.name, singer: d.name })
            }
          >
            <span className="min-w-0 flex-1">
              <span className="block" lang="es">
                {p.name}
              </span>
              <span className="text-footnote block text-[var(--label-2)]">{yearsText(p.years)}</span>
            </span>
            <span className="cell-value text-body tabular-nums">{t("song.n_sides", { n: p.count })}</span>
            <ChevronRight size={16} strokeWidth={2.5} className="cell-chevron" aria-hidden />
          </button>
        ))}
        {orch && d.instrumental > 0 && (
          <button
            type="button"
            className="cell cell-tap w-full text-left"
            data-testid="dna-instrumental"
            onClick={() =>
              openSides({ orchestraId: d.id, orchestra: d.name, singer: null, instrumental: true })
            }
          >
            <span className="min-w-0 flex-1">{t("song.instrumental")}</span>
            <span className="cell-value text-body tabular-nums">
              {t("song.n_sides", { n: d.instrumental })}
            </span>
            <ChevronRight size={16} strokeWidth={2.5} className="cell-chevron" aria-hidden />
          </button>
        )}
      </Group>
      {highlights.length > 0 && (
        <section>
          <h2 className="section-head">{t("song.dna_highlights")}</h2>
          <SidesList songs={highlights} label={d.name} testId="dna-highlights" />
        </section>
      )}
      <Group header={t("song.dna_works")} data-testid="dna-works">
        {d.works.slice(0, 30).map((w) => (
          <DnaLink
            key={w.songId}
            to={{ kind: "song", id: w.songId }}
            className="cell cell-tap w-full text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block" lang="es">
                {w.title}
              </span>
              <span className="text-footnote block text-[var(--label-2)]">{yearsText(w.years)}</span>
            </span>
            <span className="cell-value text-body tabular-nums">{t("song.n_sides", { n: w.count })}</span>
            <ChevronRight size={16} strokeWidth={2.5} className="cell-chevron" aria-hidden />
          </DnaLink>
        ))}
      </Group>
    </article>
  );
}
