"use client";
import { featuresSummary, keyLabel } from "@/lib/analyze";
import type { BpmChoice } from "@/lib/songData";
import type { AudioFeatures, Song } from "@/lib/types";
import { ActionRow, Group, Row } from "./Form";
import { Sheet } from "./Sheet";

/** Long-press / tap sheet behind the key chip: the analysed numbers and the 30 s-preview caveat. */
export function AudioDetails({
  song,
  audio,
  open,
  onClose,
  onSwap,
  bpm,
}: {
  song: Pick<Song, "title" | "orchestra" | "resolved">;
  audio: AudioFeatures;
  open: boolean;
  onClose: () => void;
  /** "Swap for a better fit" (round4-ux.md §10.1): another recording of the same family in this slot */
  onSwap?: () => void;
  /** wave 2: the side's one BPM (the row's number) with every value and its source */
  bpm?: BpmChoice | null;
}) {
  const edition = song.resolved?.provider === "deezer" ? "Deezer" : (song.resolved?.provider ?? "preview");
  return (
    <Sheet open={open} onClose={onClose} title={song.title} trailing="Done" detents={["medium", "large"]}>
      <Group
        header={featuresSummary(audio)}
        footer={`Analysed from a 30 s preview (edition: ${edition}${song.resolved?.album ? `, ${song.resolved.album}` : ""}). Key and tempo on 78-rpm transfers are medium-confidence; the numbers compare tracks within a tanda, they are not mastering data.`}
      >
        <Row label="Key" value={<span className="font-mono">{keyLabel(audio)}</span>} />
        <Row label="Key confidence" value={`${Math.round(audio.keyConfidence * 100)} %`} />
        {/* wave 2: the tempo the row shows (one number), then every value with its source */}
        <Row
          label="Tempo"
          sub={bpm ? `From ${bpm.used.label.toLowerCase()}` : "Analysed preview"}
          value={`${bpm?.value ?? Math.round(audio.bpm)} BPM`}
          data-testid="details-bpm"
        />
        {bpm?.all
          .filter((v) => !v.used)
          .map((v) => (
            <Row
              key={`${v.source}-${v.label}`}
              label={v.label}
              sub={
                v.agrees
                  ? v.halfDouble
                    ? "The same tempo counted at another beat level"
                    : "Agrees"
                  : "Disagrees; not used"
              }
              value={`${Math.round(v.raw)} BPM`}
            />
          ))}
        <Row
          label="Loudness"
          value={`${audio.loudnessDb.toFixed(1)} dBFS · range ${audio.loudnessRange.toFixed(1)} dB`}
        />
        <Row label="Brightness" value={`${Math.round(audio.brightnessHz)} Hz`} />
        <Row label="Onsets" value={`${audio.onsetsPerSec.toFixed(1)} / s`} />
        <Row label="Pulse clarity" value={`${Math.round(audio.pulseClarity * 100)} %`} />
        <Row label="Energy prior" value={String(Math.round(audio.energy))} />
      </Group>
      {onSwap && (
        <Group footer="Picks another recording of the same orchestra, singer and years for this slot; the tanda's key and tempo spread are what the swap tries to tighten.">
          <ActionRow
            label="Swap for a better fit"
            id="swap-better-fit"
            onClick={() => {
              onClose();
              onSwap();
            }}
          />
        </Group>
      )}
    </Sheet>
  );
}
