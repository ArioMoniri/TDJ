"use client";
import { featuresSummary, keyLabel } from "@/lib/analyze";
import type { AudioFeatures, Song } from "@/lib/types";
import { Group, Row } from "./Form";
import { Sheet } from "./Sheet";

/** Long-press / tap sheet behind the key chip: the analysed numbers and the 30 s-preview caveat. */
export function AudioDetails({
  song,
  audio,
  open,
  onClose,
}: {
  song: Pick<Song, "title" | "orchestra" | "resolved">;
  audio: AudioFeatures;
  open: boolean;
  onClose: () => void;
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
        <Row
          label="Tempo"
          value={`${Math.round(audio.bpm)} BPM${
            audio.bpmCandidates?.length > 1
              ? ` (or ${audio.bpmCandidates
                  .filter((b) => Math.round(b) !== Math.round(audio.bpm))
                  .slice(0, 2)
                  .map((b) => Math.round(b))
                  .join(", ")})`
              : ""
          }`}
        />
        <Row
          label="Loudness"
          value={`${audio.loudnessDb.toFixed(1)} dBFS · range ${audio.loudnessRange.toFixed(1)} dB`}
        />
        <Row label="Brightness" value={`${Math.round(audio.brightnessHz)} Hz`} />
        <Row label="Onsets" value={`${audio.onsetsPerSec.toFixed(1)} / s`} />
        <Row label="Pulse clarity" value={`${Math.round(audio.pulseClarity * 100)} %`} />
        <Row label="Energy prior" value={String(Math.round(audio.energy))} />
      </Group>
    </Sheet>
  );
}
