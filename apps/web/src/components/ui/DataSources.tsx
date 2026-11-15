"use client";
import { missingFields, songData } from "@tdj/core";
import { DatabaseZap, Disc, Image, KeyRound, Library, Radio } from "lucide-react";
import { type ReactNode, useState } from "react";
import { djDataOf } from "@/lib/artwork";
import { enabledSources, fillMissing } from "@/lib/fill/client";
import { SOURCES, type SourceId, type SourceInfo } from "@/lib/fill/sources";
import { t as tx } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { ActionRow, FieldRow, Group, Row, SwitchRow } from "../Form";
import { Sheet } from "../Sheet";

const ICON: Record<SourceId, ReactNode> = {
  deezer: <Disc size={16} strokeWidth={2} />,
  musicbrainz: <Library size={16} strokeWidth={2} />,
  coverart: <Image size={16} strokeWidth={2} />,
  discogs: <KeyRound size={16} strokeWidth={2} />,
  spotify: <Radio size={16} strokeWidth={2} />,
};
const tile = (s: SourceInfo) => (
  <span className="tile" style={{ background: s.color }} aria-hidden>
    {ICON[s.id]}
  </span>
);

/**
 * Round 22 — Settings › Connections › Data sources: where missing BPM, key, level, artwork and dates come from, and
 * an "Add a source" flow. Deezer, MusicBrainz and the Cover Art Archive need nothing; Discogs takes the DJ's own token
 * (kept in this browser only); Spotify uses the DJ's Spotify login.
 */
export function DataSources() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const playlist = useStore((s) => s.playlist);
  const connected = useStore((s) => !!s.spotifyToken && s.spotifyToken.expires > Date.now());
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<SourceInfo | null>(null);
  const [token, setToken] = useState("");
  const [progress, setProgress] = useState<string | null>(null);
  const ds = settings.dataSources ?? {};
  const isOn = (s: SourceInfo) => ds.enabled?.[s.id] ?? s.defaultOn;
  const added = SOURCES.filter(isOn);
  const available = SOURCES.filter((s) => !isOn(s));
  const active = enabledSources(settings, connected);
  const setOn = (id: SourceId, on: boolean) =>
    setSettings({ dataSources: { ...ds, enabled: { ...(ds.enabled ?? {}), [id]: on } } });
  const status = (s: SourceInfo) =>
    active.includes(s.id)
      ? tx("dataSources.on")
      : s.needs === "token"
        ? tx("dataSources.needs_your_token")
        : s.needs === "spotify"
          ? tx("dataSources.log_in_to_spotify")
          : tx("dataSources.off");

  const fillNight = async () => {
    if (!playlist) return;
    const songs = playlist.tandas.flatMap((t) => t.songs);
    const st = useStore.getState();
    const todo = songs.filter(
      (s) =>
        missingFields(songData(s, st.overrides.scraped?.[s.id], djDataOf(st.overrides.songs?.[s.id])))
          .length > 0,
    );
    let filled = 0;
    for (const [i, s] of todo.entries()) {
      setProgress(tx("dataSources.filling_of", { p1: i + 1, length: todo.length, title: s.title }));
      const r = await fillMissing(s).catch(() => null);
      if (r?.filled.length) filled++;
    }
    setProgress(
      todo.length
        ? tx("dataSources.done_new_data_for_of_sides", { filled, length: todo.length })
        : tx("dataSources.every_side_of_tonight_s_night"),
    );
  };

  return (
    <>
      <Group
        header={tx("dataSources.data_sources")}
        footer={tx("dataSources.where_missing_bpm_key_level_artwork")}
        id="data-sources"
      >
        {added.map((s) => (
          <Row
            key={s.id}
            tile={tile(s)}
            label={s.name}
            sub={s.gives}
            value={status(s)}
            chevron
            onClick={() => {
              setToken(ds.discogsToken ?? "");
              setOpen(s);
            }}
            data-testid={`source-${s.id}`}
          />
        ))}
        <ActionRow
          label={tx("dataSources.add_a_source_2")}
          tip={tx("dataSources.another_place_to_fill_in_missing")}
          onClick={() => setAdding(true)}
          disabled={!available.length}
        />
        <Row
          tip={tx("dataSources.asks_your_sources_for_every_side")}
          tile={
            <span className="tile" style={{ background: "#5856d6" }} aria-hidden>
              <DatabaseZap size={16} strokeWidth={2} />
            </span>
          }
          label={tx("dataSources.fill_tonight_s_night")}
          sub={
            progress ??
            (playlist
              ? tx("dataSources.bpm_key_level_artwork_and_dates")
              : tx("dataSources.compose_a_night_first"))
          }
          chevron
          disabled={!playlist}
          onClick={() => void fillNight()}
          data-testid="fill-night"
        />
      </Group>

      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title={tx("dataSources.add_a_source")}
        trailing={tx("dataSources.done")}
        testId="add-source"
      >
        <Group footer={tx("dataSources.a_source_fills_only_what_is")}>
          {available.map((s) => (
            <Row
              key={s.id}
              tile={tile(s)}
              label={s.name}
              sub={`${s.gives} · ${s.needs === "nothing" ? tx("dataSources.no_account_needed") : s.needs === "token" ? tx("dataSources.your_own_token") : tx("dataSources.your_spotify_login")}`}
              value={tx("dataSources.add")}
              onClick={() => {
                setOn(s.id, true);
                setAdding(false);
                if (s.needs === "token") {
                  setToken(ds.discogsToken ?? "");
                  setOpen(s);
                }
              }}
              data-testid={`add-${s.id}`}
            />
          ))}
          {!available.length && <Row label={tx("dataSources.every_source_is_added")} />}
        </Group>
      </Sheet>

      <Sheet
        open={!!open}
        onClose={() => setOpen(null)}
        title={open?.name ?? ""}
        trailing={tx("dataSources.done")}
        onTrailing={() => {
          if (open?.needs === "token") setSettings({ dataSources: { ...ds, discogsToken: token.trim() } });
          setOpen(null);
        }}
        testId="source-sheet"
      >
        {open && (
          <>
            <Group footer={open.gives}>
              <SwitchRow
                label={tx("dataSources.use", { name: open.name })}
                checked={isOn(open)}
                onChange={(v) => setOn(open.id, v)}
              />
            </Group>
            {open.needs === "token" && (
              <Group header={tx("dataSources.your_token")} footer={open.tokenHelp}>
                <FieldRow label={tx("dataSources.token")} id="discogs-token">
                  <input
                    id="discogs-token"
                    type="password"
                    className="field field-value min-w-0 flex-1 font-mono"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={tx("dataSources.paste_it_here")}
                  />
                </FieldRow>
              </Group>
            )}
            {open.needs === "spotify" && !connected && (
              <p className="section-foot">{tx("dataSources.log_in_to_spotify_above_artwork")}</p>
            )}
          </>
        )}
      </Sheet>
    </>
  );
}
