"use client";
import { featuresSummary, keyLabel } from "@/lib/analyze";
import { lower, t } from "@/lib/i18n";
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
  const edition =
    song.resolved?.provider === "deezer" ? t("audioDetails.deezer") : (song.resolved?.provider ?? "preview");
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={song.title}
      trailing={t("audioDetails.done")}
      detents={["medium", "large"]}
    >
      <Group
        header={featuresSummary(audio)}
        footer={t("audioDetails.analysed_from_a_30_s_preview", {
          edition,
          p1: song.resolved?.album ? `, ${song.resolved.album}` : "",
        })}
      >
        <Row label={t("audioDetails.key")} value={<span className="font-mono">{keyLabel(audio)}</span>} />
        <Row label={t("audioDetails.key_confidence")} value={`${Math.round(audio.keyConfidence * 100)} %`} />
        {/* wave 2: the tempo the row shows (one number), then every value with its source */}
        <Row
          label={t("audioDetails.tempo")}
          sub={
            bpm
              ? t("audioDetails.from", { label: lower(bpm.used.label) })
              : t("audioDetails.analysed_preview")
          }
          value={t("audioDetails.bpm", { p1: bpm?.value ?? Math.round(audio.bpm) })}
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
                    ? t("audioDetails.the_same_tempo_counted_at_another")
                    : t("audioDetails.agrees")
                  : t("audioDetails.disagrees_not_used")
              }
              value={t("audioDetails.bpm", { p1: Math.round(v.raw) })}
            />
          ))}
        <Row
          label={t("audioDetails.loudness")}
          value={t("audioDetails.dbfs_range_db", {
            loudnessDb: audio.loudnessDb.toFixed(1),
            loudnessRange: audio.loudnessRange.toFixed(1),
          })}
        />
        <Row
          label={t("audioDetails.brightness")}
          value={t("audioDetails.hz", { p1: Math.round(audio.brightnessHz) })}
        />
        <Row label={t("audioDetails.onsets")} value={`${audio.onsetsPerSec.toFixed(1)} / s`} />
        <Row label={t("audioDetails.pulse_clarity")} value={`${Math.round(audio.pulseClarity * 100)} %`} />
        <Row label={t("audioDetails.energy_prior")} value={String(Math.round(audio.energy))} />
      </Group>
      {onSwap && (
        <Group footer={t("audioDetails.picks_another_recording_of_the_same")}>
          <ActionRow
            label={t("audioDetails.swap_for_a_better_fit")}
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
