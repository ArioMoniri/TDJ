"use client";
import type { Song } from "@tdj/core";
import { Headphones, Play, Square, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { spotifyLengthSec } from "@/lib/booth/clips";
import { durationLabel } from "@/lib/booth/plan";
import { useBooth, type Waveform as WaveData } from "@/lib/booth/store";
import { loadVersions, type Version } from "@/lib/booth/versions";
import { eraOf } from "@/lib/era";
import { toast } from "@/lib/toast";
import { ActionRow, Group } from "../Form";
import { Sheet } from "../Sheet";
import { Artwork } from "../ui/Artwork";
import { BpmKey, EnergyChip } from "../ui/BpmKey";
import { EraBadge } from "../ui/EraBadge";
import { Waveform } from "./Waveform";

/**
 * Round 22 — tap any song in the set: one sheet to play it (now, next, or from here before the night), pre-listen
 * it in the headphones, set its cue and stop on the waveform, and hear or play any other version of it (the same
 * title by the same orchestra). The room and the headphones are named on every button.
 */
export function SongSheet({ i, onClose }: { i: number | null; onClose: () => void }) {
  const it = useBooth((s) => (i === null ? null : s.plan?.items[i]));
  const entity = useBooth((s) => (i === null ? null : (s.entities[i] ?? null)));
  const started = useBooth((s) => s.started);
  const planIndex = useBooth((s) => s.planIndex);
  const audition = useBooth((s) => s.audition);
  const fade = useBooth((s) => s.settings.fadeNowSec);
  const cues = useBooth((s) => s.playlist?.booth?.songCues);
  const outputs = useBooth((s) => s.outputs);
  const b = useBooth.getState();
  const open = i !== null && !!it && it.kind !== "break";
  const blocked = open ? b.cueBlocked() : null;
  const curTanda = useBooth((s) => s.plan?.items[s.planIndex]?.tanda ?? 0);
  const readOnly = started && !!it && it.tanda <= curTanda && it.tanda > 0;
  const song = entity && "rhythm" in entity && "orchestraId" in entity ? (entity as Song) : null;
  const cueLabel = blocked ? (started ? null : "Test on this device") : "Pre-listen in headphones";
  const hearing = audition && i !== null && audition.i === i;
  const prelisten = async (o: { song?: Song; startSec?: number } = {}) => {
    if (i === null) return;
    const why = await b.prelisten(o.song ? { song: o.song } : { i }, { startSec: o.startSec });
    if (why) toast(`Can't pre-listen: ${why}`);
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={it ? it.title : "Song"}
      detents={["large"]}
      trailing="Done"
      testId="booth-play-sheet"
    >
      {it && entity && i !== null && (
        <>
          <div className="mt-2 flex items-start gap-3 px-4">
            <Artwork entity={entity} orchestra={song?.orchestra ?? it.artist} size={72} />
            <div className="min-w-0 flex-1">
              <p className="text-headline">{it.title}</p>
              <p className="text-subhead text-[var(--label-2)]">
                {it.artist}
                {it.year ? ` · ${it.year}` : ""}
                {` · ${durationLabel(it.lengthSec)}`}
              </p>
              <div className="booth-meta">
                {song && <EraBadge entity={song} />}
                {song && eraOf(song) && (
                  <span className="text-footnote text-[var(--label-2)]">{eraOf(song)!.label}</span>
                )}
                <BpmKey e={entity} />
                <EnergyChip e={entity} />
              </div>
            </div>
          </div>
          <Group
            header="Play"
            footer={
              started
                ? `Play now fades the room's song out over ${fade} s. ${blocked ? `Pre-listen: ${blocked}` : "Pre-listen plays only in your headphones: the room does not hear it."}`
                : blocked
                  ? `The night has not started, so a test plays on this device. ${blocked}`
                  : "Pre-listen plays only in your headphones."
            }
          >
            {started ? (
              <>
                <ActionRow
                  label="Play now (fade the current)"
                  disabled={i === planIndex}
                  onClick={() => {
                    void b.playNow(i);
                    onClose();
                  }}
                />
                <ActionRow
                  label="Play next"
                  disabled={i <= planIndex}
                  onClick={() => {
                    b.playNext(i);
                    toast(`${it.title} plays next`);
                    onClose();
                  }}
                />
              </>
            ) : (
              <ActionRow
                label="Start the night here"
                onClick={() => {
                  void b.playNow(i);
                  onClose();
                }}
              />
            )}
            {hearing ? (
              <button
                type="button"
                className="cell cell-tap w-full text-left"
                onClick={() => b.stopAudition()}
                data-testid="booth-cue-stop"
              >
                <Square
                  size={16}
                  fill="currentColor"
                  strokeWidth={0}
                  className="text-[var(--cue)]"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 text-[var(--cue)]">
                  Stop the {audition.where === "headphones" ? "pre-listen" : "test"}
                </span>
              </button>
            ) : (
              cueLabel && (
                <button
                  type="button"
                  className="cell cell-tap w-full text-left"
                  onClick={() => void prelisten()}
                  data-testid="booth-prelisten"
                  data-where={blocked ? "device" : "headphones"}
                >
                  {blocked ? (
                    <Volume2 size={16} strokeWidth={2} aria-hidden />
                  ) : (
                    <Headphones size={16} strokeWidth={2} className="text-[var(--cue)]" aria-hidden />
                  )}
                  <span className={`min-w-0 flex-1 ${blocked ? "text-[var(--tint)]" : "text-[var(--cue)]"}`}>
                    {cueLabel}
                  </span>
                  <span className="text-footnote text-[var(--label-2)]">
                    {blocked
                      ? "This device"
                      : (outputs.devices.find((d) => d.id === outputs.cue)?.label ?? "Headphones")}
                  </span>
                </button>
              )
            )}
          </Group>
          {it.kind !== "cortina" && song && (
            <CueEditor
              i={i}
              song={song}
              cue={cues?.[song.id]}
              readOnly={readOnly}
              onListen={(at) => void prelisten({ startSec: at })}
            />
          )}
          {song && it.kind !== "cortina" && (
            <Versions song={song} readOnly={readOnly} onListen={(v) => void prelisten({ song: v })} />
          )}
        </>
      )}
    </Sheet>
  );
}

function CueEditor({
  i,
  song,
  cue,
  readOnly,
  onListen,
}: {
  i: number;
  song: Song;
  cue?: { inSec?: number; outSec?: number };
  readOnly: boolean;
  onListen: (at: number) => void;
}) {
  const [wave, setWave] = useState<WaveData | null | undefined>(undefined);
  const cuePos = useBooth((s) => s.cuePos);
  const hearing = useBooth((s) => s.audition?.songId === song.id);
  useEffect(() => {
    let live = true;
    setWave(undefined);
    void useBooth
      .getState()
      .waveformOf(i)
      .then((w) => live && setWave(w));
    return () => {
      live = false;
    };
  }, [i]);
  const dur =
    (wave?.from === "file" ? wave.durationSec : null) ?? spotifyLengthSec(song) ?? song.durationSec ?? 170;
  const [local, setLocal] = useState({ inSec: cue?.inSec ?? 0, outSec: cue?.outSec ?? dur });
  useEffect(() => {
    setLocal({ inSec: cue?.inSec ?? 0, outSec: cue?.outSec ?? dur });
  }, [cue?.inSec, cue?.outSec, dur]);
  const commit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const change = (c: { inSec: number; outSec: number }) => {
    setLocal(c);
    if (commit.current) clearTimeout(commit.current);
    commit.current = setTimeout(() => {
      useBooth.getState().setSongCue(song.id, {
        inSec: c.inSec > 0 ? c.inSec : undefined,
        outSec: c.outSec < dur ? c.outSec : undefined,
      });
    }, 250);
  };
  const edited = local.inSec > 0 || local.outSec < dur;
  // the clip's waveform covers its own 30 s, not the song: then the bars are left out
  const peaks = wave && wave.from === "file" ? wave.peaks : null;
  return (
    <Group
      header="Cue and stop"
      footer={
        readOnly
          ? "This tanda is playing or has played: its songs keep their cue."
          : `Drag Cue and Stop on the song to skip a long intro or cut the ending; the night is re-timed. ${
              wave?.from === "file"
                ? "The waveform is your file."
                : "Link the file to see its waveform; the handles work on the song's length."
            } Saved with the set, and the DJ-app exports follow it.`
      }
    >
      <div className="cell block">
        <Waveform
          peaks={peaks}
          durationSec={dur}
          cue={local}
          disabled={readOnly}
          at={hearing ? cuePos.at : null}
          onChange={(c) => change(c)}
        />
        <div className="text-footnote mt-2 flex items-center justify-between tabular-nums text-[var(--label-2)]">
          <span data-testid="booth-cue-in-label">Cue {durationLabel(local.inSec)}</span>
          <span>Plays {durationLabel(local.outSec - local.inSec)}</span>
          <span data-testid="booth-cue-out-label">Stop {durationLabel(local.outSec)}</span>
        </div>
      </div>
      <button
        type="button"
        className="cell cell-tap w-full text-left"
        onClick={() => onListen(local.inSec)}
        data-testid="booth-cue-listen"
      >
        <Headphones size={16} strokeWidth={2} className="text-[var(--cue)]" aria-hidden />
        <span className="min-w-0 flex-1 text-[var(--cue)]">Listen from the cue</span>
      </button>
      {edited && !readOnly && (
        <ActionRow
          label="Play the whole song"
          onClick={() => {
            setLocal({ inSec: 0, outSec: dur });
            useBooth.getState().setSongCue(song.id, null);
          }}
        />
      )}
    </Group>
  );
}

function Versions({
  song,
  readOnly,
  onListen,
}: {
  song: Song;
  readOnly: boolean;
  onListen: (v: Song) => void;
}) {
  const [list, setList] = useState<Version[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const hearing = useBooth((s) => s.audition?.songId);
  useEffect(() => {
    let live = true;
    setList(null);
    setErr(null);
    loadVersions(song)
      .then((v) => live && setList(v))
      .catch(() => live && setErr("The catalogue could not be searched right now."));
    return () => {
      live = false;
    };
  }, [song]);
  return (
    <Group
      header="Versions"
      footer={
        err ??
        (readOnly
          ? "This tanda is playing or has played: pre-listen to other versions, swap ahead of the playhead."
          : "Every recording of this title by the same orchestra. Pre-listen, or play one tonight instead.")
      }
      data-testid="booth-versions"
    >
      {list === null && !err && <div className="cell text-[var(--label-2)]">Looking for other versions…</div>}
      {list?.length === 1 && (
        <div className="cell text-[var(--label-2)]">Only this version is in the catalogue.</div>
      )}
      {list?.map((v) => (
        <div
          key={v.song.id}
          className="cell"
          data-testid="booth-version"
          data-current={v.current || undefined}
        >
          <button
            type="button"
            className="icon-btn icon-btn-bare h-11 w-11 shrink-0 text-[var(--cue)]"
            aria-label={`Pre-listen ${v.song.year ?? ""} ${v.song.singer ?? "instrumental"}`}
            data-hint="Pre-listen this version in your headphones"
            onClick={() => (hearing === v.song.id ? useBooth.getState().stopAudition() : onListen(v.song))}
          >
            {hearing === v.song.id ? (
              <Square size={14} fill="currentColor" strokeWidth={0} aria-hidden />
            ) : (
              <Headphones size={16} strokeWidth={2} aria-hidden />
            )}
          </button>
          <span className="min-w-0 flex-1">
            <span className="block truncate">
              {v.song.year ?? "Undated"} · {v.song.singer ?? "Instrumental"}
            </span>
            <span className="text-footnote block truncate text-[var(--label-2)]">
              {v.current ? "In tonight's set" : (v.song.album ?? v.song.orchestra)}
              {v.song.durationSec ? ` · ${durationLabel(v.song.durationSec)}` : ""}
            </span>
          </span>
          <EraBadge entity={v.song} />
          {!v.current && !readOnly && (
            <button
              type="button"
              className="booth-tool"
              data-testid="booth-version-use"
              data-hint="Play this version tonight instead (the tanda keeps its place)"
              onClick={async () => {
                const ok = await useBooth.getState().playVersion(song.id, v.song);
                toast(ok ? `Tonight plays the ${v.song.year ?? ""} version` : "This tanda is read-only now");
              }}
            >
              <Play size={14} fill="currentColor" strokeWidth={0} aria-hidden /> Use
            </button>
          )}
        </div>
      ))}
    </Group>
  );
}
