"use client";
import type { Song } from "@tdj/core";
import { singerDisplay } from "@tdj/core";
import { Headphones, Info, Play, Square } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { I } from "@/components/Icons";
import { surnameOf } from "@/lib/booth/songInfo";
import { t } from "@/lib/i18n";
import { useTapPlay } from "@/lib/playback";
import type { PlayItem } from "@/lib/player";
import type { ServiceAnswer, SourceId } from "@/lib/smartSearch";
import { openSongDetails } from "@/lib/songOpen";
import { otherVersions, type OtherVersions as Result, serviceQuery } from "@/lib/songVersions";
import { loadMatches } from "@/lib/youtubeMatches";
import { Group } from "../Form";
import { SourceIcons } from "../ui/SmartSearch";
import { TandaTypeBadge } from "../ui/TandaTypeBadge";
import { lengthText } from "./SongFacts";

/** the catalogue's orchestras, once per page (a service's artist line is read as one of them) */
let orchestras: Promise<Array<{ id: string; name: string }>> | null = null;
const orchestraList = () => {
  orchestras ??= fetch("/api/meta")
    .then((r) => r.json())
    .then((j: { orchestras?: Array<{ id: string; name: string }> }) =>
      (j.orchestras ?? []).map((o) => ({ id: o.id, name: o.name })),
    )
    .catch(() => {
      orchestras = null;
      return [];
    });
  return orchestras;
};

async function searchServices(q: string): Promise<ServiceAnswer[]> {
  const r = await fetch("/api/services/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ q, limit: 10 }),
  });
  if (!r.ok) return [{ id: "spotify", state: "error", tracks: [] }];
  return ((await r.json()) as { services?: ServiceAnswer[] }).services ?? [];
}
/** both searches' answers as one per service (the worse state wins only when neither answered) */
function joinAnswers(a: ServiceAnswer[][]): ServiceAnswer[] {
  const m = new Map<string, ServiceAnswer>();
  for (const list of a)
    for (const x of list) {
      const prev = m.get(x.id);
      if (!prev) m.set(x.id, { ...x, tracks: [...x.tracks] });
      else if (x.state === "ok")
        m.set(x.id, { ...x, tracks: [...(prev.state === "ok" ? prev.tracks : []), ...x.tracks] });
    }
  return [...m.values()];
}

const SHOW = 12;

export interface BoothVersionActions {
  readOnly: boolean;
  hearingId?: string | null;
  onListen: (s: Song) => void;
  onStop: () => void;
  onUse: (s: Song) => void;
}

/**
 * 2026-11 (the owner: "other orchestra and singer versions should be shown in song details"; "'Only this version'
 * for most songs … not complete") — every recording of the side's work: the catalogue's (every orchestra and voice)
 * and the DJ's connected services' (their Spotify), one row per recording with its sources, voice, year (an album's
 * year marked ≈), length and rhythm; each plays (in the Booth: pre-listen in the headphones) and, in the Booth,
 * can be used tonight instead (the rule check asks first).
 */
export function OtherVersions({ song, booth }: { song: Song; booth?: BoothVersionActions }) {
  const [cat, setCat] = useState<Song[] | null>(null);
  const [catErr, setCatErr] = useState(false);
  const [svc, setSvc] = useState<ServiceAnswer[] | null>(null);
  const [ctx, setCtx] = useState<Array<{ id: string; name: string }>>([]);
  const [all, setAll] = useState(false);
  useEffect(() => {
    let live = true;
    setCat(null);
    setSvc(null);
    setCatErr(false);
    setAll(false);
    fetch(`/api/dna?kind=work&id=${encodeURIComponent(song.id)}`)
      .then((r) => (r.ok ? r.json() : { songs: [] }))
      .then((j: { songs?: Song[] }) => live && setCat(j.songs ?? []))
      .catch(() => {
        if (!live) return;
        setCat([]);
        setCatErr(true);
      });
    void orchestraList().then((o) => live && setCtx(o));
    const title = serviceQuery(song);
    Promise.all([searchServices(`${title} ${surnameOf(song.orchestra)}`), searchServices(`${title} tango`)])
      .then((a) => live && setSvc(joinAnswers(a)))
      .catch(() => live && setSvc([{ id: "spotify", state: "error", tracks: [] }]));
    return () => {
      live = false;
    };
  }, [song]);
  const res: Result | null = useMemo(() => {
    if (!cat) return null;
    const yt = loadMatches();
    const extra = (s: Song): SourceId[] => (yt[s.id] ? ["youtube"] : []);
    return otherVersions(
      song,
      cat,
      svc ?? [],
      { orchestras: ctx },
      { extraSources: extra, servicesSearched: !!svc },
    );
  }, [song, cat, svc, ctx]);
  const spotify = res?.services.find((x) => x.id === "spotify");
  const counts = res
    ? [
        t("song.versions_catalogue", { n: res.catalogue }),
        spotify?.state === "ok"
          ? t("song.versions_spotify", { n: res.serviceOnly + res.serviceMatched })
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;
  const footer = !res
    ? null
    : res.onlyThis
      ? t("song.versions_only_this")
      : catErr
        ? t("song.versions_catalogue_error")
        : spotify?.state === "signed-out"
          ? t("song.versions_connect_spotify")
          : spotify?.state === "busy" || spotify?.state === "error"
            ? t("song.versions_spotify_failed")
            : booth?.readOnly && res.versions.length > 1
              ? t("song.versions_read_only")
              : null;
  const rows = res ? (all ? res.versions : res.versions.slice(0, SHOW)) : [];
  return (
    <Group
      header={
        <span className="flex items-baseline justify-between gap-2">
          <span>{t("song.other_versions")}</span>
          {counts && (
            <span className="normal-case text-[var(--label-2)]" data-testid="song-versions-counts">
              {counts}
            </span>
          )}
        </span>
      }
      footer={footer}
      data-testid="song-versions"
      data-catalogue={res?.catalogue}
      data-services={res ? res.serviceOnly + res.serviceMatched : undefined}
    >
      {!res && <div className="cell text-[var(--label-2)]">{t("song.versions_looking")}</div>}
      {rows.map((v) => (
        <VersionLine
          key={v.key}
          song={v.song}
          sources={v.sources}
          current={v.current}
          booth={booth}
          approxYear={!v.sources.includes("catalogue")}
          workRhythm={song.rhythm}
        />
      ))}
      {!svc && res && (
        <div className="cell text-footnote text-[var(--label-2)]">{t("song.versions_services_looking")}</div>
      )}
      {res && !all && res.versions.length > SHOW && (
        <button
          type="button"
          className="cell cell-tap w-full justify-center text-[var(--tint)]"
          onClick={() => setAll(true)}
          data-testid="song-versions-all"
        >
          {t("song.versions_show_all", { n: res.versions.length })}
        </button>
      )}
    </Group>
  );
}

function VersionLine({
  song,
  sources,
  current,
  booth,
  approxYear,
  workRhythm,
}: {
  song: Song;
  sources: SourceId[];
  current: boolean;
  booth?: BoothVersionActions;
  approxYear: boolean;
  /** the side's own rhythm: a version's badge only when it differs (a vals version of a tango) */
  workRhythm: string;
}) {
  const item = useMemo<PlayItem>(() => ({ kind: "song", song, where: t("song.other_versions") }), [song]);
  const tp = useTapPlay(booth ? null : item);
  const hearing = booth?.hearingId === song.id;
  const year = song.year ? `${approxYear || song.yearApprox ? "≈ " : ""}${song.year}` : t("song.undated");
  const voice = singerDisplay(song.singer) ?? t("song.instrumental");
  const label = t("song.play_version", { orchestra: song.orchestra, year, voice });
  return (
    <div
      className="cell"
      data-testid="song-version"
      data-current={current || undefined}
      data-sources={sources.join(" ")}
    >
      <button
        type="button"
        className={`icon-btn icon-btn-bare h-11 w-11 shrink-0 ${booth ? "text-[var(--cue)]" : "text-[var(--tint)]"}`}
        aria-label={label}
        data-testid="song-version-play"
        onClick={() => {
          if (booth) return hearing ? booth.onStop() : booth.onListen(song);
          void tp.tap();
        }}
      >
        {booth ? (
          hearing ? (
            <Square size={14} fill="currentColor" strokeWidth={0} aria-hidden />
          ) : (
            <Headphones size={16} strokeWidth={2} aria-hidden />
          )
        ) : tp.playing ? (
          <I name="pause" size={16} fill="currentColor" strokeWidth={0} />
        ) : (
          <I name="play" size={16} fill="currentColor" strokeWidth={0} />
        )}
      </button>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate" lang="es">
            {song.orchestra}
          </span>
          <span className="shrink-0 tabular-nums text-[var(--label-2)]">{year}</span>
        </span>
        <span className="text-footnote flex min-w-0 gap-1 text-[var(--label-2)]">
          <span className="truncate" lang="es">
            {voice}
          </span>
          <span className="shrink-0 tabular-nums">
            · {lengthText(song)}
            {current ? ` · ${t("song.this_recording")}` : ""}
          </span>
        </span>
      </span>
      {(song.rhythm !== workRhythm || sources.length > 1 || sources[0] !== "catalogue") && (
        <span className="flex shrink-0 flex-col items-end gap-1">
          {song.rhythm !== workRhythm && <TandaTypeBadge rhythm={song.rhythm} compact />}
          {(sources.length > 1 || sources[0] !== "catalogue") && <SourceIcons sources={sources} />}
        </span>
      )}
      {booth && !current && !booth.readOnly && (
        <button
          type="button"
          className="booth-tool"
          data-testid="song-version-use"
          onClick={() => booth.onUse(song)}
        >
          <Play size={14} fill="currentColor" strokeWidth={0} aria-hidden /> {t("song.use")}
        </button>
      )}
      {!booth && !current && sources.includes("catalogue") && (
        <button
          type="button"
          className="icon-btn icon-btn-bare h-11 w-11 shrink-0 text-[var(--label-2)]"
          aria-label={t("song.details_of", { title: song.title, orchestra: song.orchestra })}
          onClick={() => openSongDetails(song)}
        >
          <Info size={16} strokeWidth={2} aria-hidden />
        </button>
      )}
    </div>
  );
}
