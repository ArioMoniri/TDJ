"use client";
import { missingFields, songData } from "@tdj/core";
import { DatabaseZap, Disc, Image, KeyRound, Library, Radio } from "lucide-react";
import { type ReactNode, useState } from "react";
import { djDataOf } from "@/lib/artwork";
import { enabledSources, fillMissing } from "@/lib/fill/client";
import { SOURCES, type SourceId, type SourceInfo } from "@/lib/fill/sources";
import { useStore } from "@/lib/store";
import { ActionRow, FieldRow, Group, Row, SwitchRow } from "../Form";
import { Sheet } from "../Sheet";
import { Tip } from "./Tip";

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
      ? "On"
      : s.needs === "token"
        ? "Needs your token"
        : s.needs === "spotify"
          ? "Log in to Spotify"
          : "Off";

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
      setProgress(`Filling ${i + 1} of ${todo.length}: ${s.title}`);
      const r = await fillMissing(s).catch(() => null);
      if (r?.filled.length) filled++;
    }
    setProgress(
      todo.length
        ? `Done: new data for ${filled} of ${todo.length} sides with gaps.`
        : "Every side of tonight's night already has its data.",
    );
  };

  return (
    <>
      <Group
        header="Data sources"
        footer="Where missing BPM, key, level, artwork and dates come from. Your own edits in the Database always win over every source."
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
        <ActionRow label="Add a source…" onClick={() => setAdding(true)} disabled={!available.length} />
        <Tip
          text="Asks your sources for every side of tonight's night that is missing something"
          className="w-full"
        >
          <Row
            tile={
              <span className="tile" style={{ background: "#5856d6" }} aria-hidden>
                <DatabaseZap size={16} strokeWidth={2} />
              </span>
            }
            label="Fill tonight's night"
            sub={
              progress ??
              (playlist ? "BPM, key, level, artwork and dates for its sides" : "Compose a night first")
            }
            chevron
            disabled={!playlist}
            onClick={() => void fillNight()}
            data-testid="fill-night"
          />
        </Tip>
      </Group>

      <Group
        header="Indicators"
        footer="Where each side sits in its orchestra's years, from your heatmap in Database › Orchestras."
      >
        <SwitchRow
          label="Era badges"
          sub="Best, good, uneven or outside years on every song"
          checked={settings.eraBadges !== false}
          onChange={(v) => setSettings({ eraBadges: v })}
        />
      </Group>
      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a source"
        trailing="Done"
        testId="add-source"
      >
        <Group footer="A source fills only what is missing; it never changes a value you set yourself.">
          {available.map((s) => (
            <Row
              key={s.id}
              tile={tile(s)}
              label={s.name}
              sub={`${s.gives} · ${s.needs === "nothing" ? "no account needed" : s.needs === "token" ? "your own token" : "your Spotify login"}`}
              value="Add"
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
          {!available.length && <Row label="Every source is added" />}
        </Group>
      </Sheet>

      <Sheet
        open={!!open}
        onClose={() => setOpen(null)}
        title={open?.name ?? ""}
        trailing="Done"
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
                label={`Use ${open.name}`}
                checked={isOn(open)}
                onChange={(v) => setOn(open.id, v)}
              />
            </Group>
            {open.needs === "token" && (
              <Group header="Your token" footer={open.tokenHelp}>
                <FieldRow label="Token" id="discogs-token">
                  <input
                    id="discogs-token"
                    type="password"
                    className="field field-value min-w-0 flex-1 font-mono"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Paste it here"
                  />
                </FieldRow>
              </Group>
            )}
            {open.needs === "spotify" && !connected && (
              <p className="section-foot">
                Log in to Spotify above; artwork and dates then come from your account.
              </p>
            )}
          </>
        )}
      </Sheet>
    </>
  );
}
