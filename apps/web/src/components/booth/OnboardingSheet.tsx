"use client";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { BOOTH_RANGES } from "@/lib/booth/plan";
import { LICENCE_NOTE, NO_FADES_IPAD } from "@/lib/booth/sources/spotify";
import { type SourceMode, useBooth } from "@/lib/booth/store";
import { ActionRow, Group, Row, StepperRow, SwitchRow } from "../Form";
import { Sheet } from "../Sheet";

/**
 * Onboarding (round7-booth.md §1.2): one sheet, three rows. Source (folder / Spotify / 30 s rehearsal), Output
 * (device name + test tone), Night (gap, cortina level, loudness target, trim). `Start the night` in the footer
 * is the gesture that creates the AudioContext and arms the first item.
 */
export function OnboardingSheet({
  open,
  onClose,
  onStart,
}: {
  open: boolean;
  onClose: () => void;
  onStart: () => void;
}) {
  const b = useBooth();
  const refresh = useBooth((s) => s.refreshSources);
  const [output, setOutput] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    void refresh();
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.enumerateDevices)
      navigator.mediaDevices
        .enumerateDevices()
        .then((l) => setOutput(l.find((d) => d.kind === "audiooutput" && d.label)?.label ?? null))
        .catch(() => {});
  }, [open, refresh]);
  const pick = (m: SourceMode) => void b.setSourceMode(m);
  const tick = (m: SourceMode) =>
    b.sourceMode === m ? (
      <Check size={18} strokeWidth={2.5} className="text-[var(--tint)]" aria-label="Chosen" />
    ) : undefined;
  const folderSub = b.folder.name
    ? `Linked: ${b.folder.name} · ${b.folder.files} files · ${b.folder.matched} of ${b.folder.total} matched${b.folder.session ? " · this session only" : ""}`
    : b.folder.canKeep
      ? "Your own files, matched by title, orchestra and year; linked once"
      : "Your browser cannot remember the folder: pick it again next time";
  const sp = b.availability.spotify;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Play the night"
      detents={["large"]}
      testId="booth-onboarding"
      footer={
        <button
          type="button"
          className="btn btn-primary min-h-[50px] w-full"
          onClick={onStart}
          data-testid="booth-onboarding-start"
        >
          Start the night
        </button>
      }
    >
      <Group
        header="Source"
        footer={
          b.sourceMode === "spotify"
            ? `${LICENCE_NOTE}${b.spotifyNoFades ? ` ${NO_FADES_IPAD}` : ""}`
            : "Files play sample-accurately; a missing file falls back to Spotify for that track when Premium is logged in."
        }
      >
        <Row
          label="Your music folder"
          sub={folderSub}
          onClick={() => pick("file")}
          data-testid="booth-source-file"
        >
          {tick("file")}
        </Row>
        <ActionRow
          label={
            b.folder.name
              ? b.folder.canKeep
                ? "Link another folder…"
                : "Pick the folder again…"
              : "Link your music folder…"
          }
          onClick={() =>
            b.folder.canKeep ? void b.linkFolder() : document.getElementById("booth-folder-input")?.click()
          }
          id="booth-link-folder"
        />
        <Row
          label="Spotify"
          sub={sp.ok ? "Premium · full tracks, gaps within ±0.5 s" : (sp.reason ?? "Checking…")}
          onClick={() => sp.ok && pick("spotify")}
          className={sp.ok ? "" : "text-[var(--label-3)]"}
          data-testid="booth-source-spotify"
          aria-disabled={!sp.ok || undefined}
        >
          {tick("spotify")}
        </Row>
        <Row
          label="30 s rehearsal"
          sub="Deezer previews: every rule of the booth on 30 s of each item"
          onClick={() => pick("preview")}
          data-testid="booth-source-preview"
        >
          {tick("preview")}
        </Row>
      </Group>
      <Group
        header="Output"
        footer="A −20 dBFS 440 Hz tone for half a second through the master: hear the room before the first tanda."
      >
        <Row label="Device" value={output ?? "System default"} />
        <ActionRow label="Test tone" onClick={() => b.testTone()} id="booth-test-tone" />
      </Group>
      <Group
        header="Night"
        footer="Saved on this device and copied into the set when the night starts, so History shows what was played with which settings."
      >
        <StepperRow
          label="Gap between songs"
          value={b.settings.gapSec}
          unit=" s"
          {...BOOTH_RANGES.gapSec}
          onChange={(v) => b.setSettings({ gapSec: v })}
        />
        <StepperRow
          label="Cortina level"
          value={b.settings.cortinaLevelDb}
          unit=" dB"
          {...BOOTH_RANGES.cortinaLevelDb}
          onChange={(v) => b.setSettings({ cortinaLevelDb: v })}
        />
        <StepperRow
          label="Cortina fade-out"
          value={b.settings.cortinaFadeOutSec}
          unit=" s"
          {...BOOTH_RANGES.cortinaFadeOutSec}
          onChange={(v) => b.setSettings({ cortinaFadeOutSec: v })}
        />
        <StepperRow
          label="Cortina fade-in"
          value={b.settings.cortinaFadeInSec}
          unit=" s"
          {...BOOTH_RANGES.cortinaFadeInSec}
          onChange={(v) => b.setSettings({ cortinaFadeInSec: v })}
        />
        <StepperRow
          label="Loudness target"
          value={b.settings.loudnessTargetLUFS}
          unit=" LUFS"
          {...BOOTH_RANGES.loudnessTargetLUFS}
          onChange={(v) => b.setSettings({ loudnessTargetLUFS: v })}
        />
        <SwitchRow
          label="Trim leading silence"
          sub="Up to 3 s, from the measured intro"
          checked={b.settings.trimLeadingSilence}
          onChange={(v) => b.setSettings({ trimLeadingSilence: v })}
        />
        <SwitchRow
          label="Media keys"
          sub="Headset pause holds (never cuts); off keeps a Bluetooth headset out of the booth"
          checked={b.settings.mediaKeys}
          onChange={(v) => b.setSettings({ mediaKeys: v })}
        />
      </Group>
    </Sheet>
  );
}
