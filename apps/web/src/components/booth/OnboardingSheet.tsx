"use client";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { BOOTH_RANGES } from "@/lib/booth/plan";
import { LICENCE_NOTE, NO_FADES_IPAD } from "@/lib/booth/sources/spotify";
import { type SourceMode, useBooth } from "@/lib/booth/store";
import { FEATURED, loadFeatured } from "@/lib/featured";
import { t } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
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
      <Check
        size={18}
        strokeWidth={2.5}
        className="text-[var(--tint)]"
        aria-label={t("booth.onboardingSheet.chosen")}
      />
    ) : undefined;
  const folderSub = b.folder.name
    ? t("booth.onboardingSheet.linked_files_of_matched", {
        name: b.folder.name,
        files: b.folder.files,
        matched: b.folder.matched,
        total: b.folder.total,
        p1: b.folder.session ? t("booth.onboardingSheet.this_session_only") : "",
      })
    : b.folder.canKeep
      ? t("booth.onboardingSheet.your_own_files_matched_by_title")
      : t("booth.onboardingSheet.your_browser_cannot_remember_the_folder");
  const sp = b.availability.spotify;
  const [featuredBusy, setFeaturedBusy] = useState(false);
  const current = useStore((s) => s.playlist);
  const playFeatured = async () => {
    setFeaturedBusy(true);
    try {
      const p = await loadFeatured(FEATURED[0].id);
      // the booth boots per set id: a new playlist in the store re-plans the night
      useStore.getState().setPlaylist(p);
      useStore.getState().replaceOptions({ ...p.options, seed: p.options.seed });
      toast(t("booth.onboardingSheet.loaded_into_the_booth", { title: FEATURED[0].title }));
      onClose();
    } catch {
      toast(t("booth.onboardingSheet.the_featured_night_could_not_be"));
    } finally {
      setFeaturedBusy(false);
    }
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("booth.onboardingSheet.play_the_night")}
      detents={["large"]}
      testId="booth-onboarding"
      footer={
        <button
          type="button"
          className="btn btn-primary min-h-[50px] w-full"
          onClick={onStart}
          data-testid="booth-onboarding-start"
        >
          {t("booth.onboardingSheet.start_the_night")}
        </button>
      }
    >
      <Group
        header={t("booth.onboardingSheet.source")}
        footer={
          b.sourceMode === "spotify"
            ? `${LICENCE_NOTE()}${b.spotifyNoFades ? ` ${NO_FADES_IPAD()}` : ""}`
            : t("booth.onboardingSheet.files_play_sample_accurately_a_missing")
        }
      >
        <Row
          label={t("booth.onboardingSheet.your_music_folder")}
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
                ? t("booth.onboardingSheet.link_another_folder")
                : t("booth.onboardingSheet.pick_the_folder_again")
              : t("booth.onboardingSheet.link_your_music_folder")
          }
          onClick={() =>
            b.folder.canKeep ? void b.linkFolder() : document.getElementById("booth-folder-input")?.click()
          }
          id="booth-link-folder"
        />
        <Row
          label={t("booth.onboardingSheet.spotify")}
          sub={
            sp.ok
              ? t("booth.onboardingSheet.premium_full_tracks_gaps_within_0")
              : (sp.reason ?? t("booth.onboardingSheet.checking"))
          }
          onClick={() => sp.ok && pick("spotify")}
          className={sp.ok ? "" : "text-[var(--label-2)]"}
          data-testid="booth-source-spotify"
          aria-disabled={!sp.ok || undefined}
        >
          {tick("spotify")}
        </Row>
        <Row
          label={t("booth.onboardingSheet.30_s_rehearsal")}
          sub={t("booth.onboardingSheet.30_second_clips_so_you_can")}
          onClick={() => pick("preview")}
          data-testid="booth-source-preview"
        >
          {tick("preview")}
        </Row>
      </Group>
      {!b.started && (
        <Group header={t("booth.onboardingSheet.featured")} footer={FEATURED[0].sub}>
          <ActionRow
            label={
              current?.options?.seed === 20 && current.options.arcShape === "double"
                ? t("booth.onboardingSheet.featured_night_is_loaded")
                : t("booth.onboardingSheet.play_the_featured_night")
            }
            onClick={playFeatured}
            busy={featuredBusy}
            id="booth-featured"
          />
        </Group>
      )}
      <Group
        header={t("booth.onboardingSheet.output")}
        footer={t("booth.onboardingSheet.a_20_dbfs_440_hz_tone")}
      >
        <Row label={t("booth.onboardingSheet.device")} value={output ?? "System default"} />
        <ActionRow
          label={t("booth.onboardingSheet.test_tone")}
          onClick={() => b.testTone()}
          id="booth-test-tone"
        />
      </Group>
      <Group
        header={t("booth.onboardingSheet.night")}
        footer={t("booth.onboardingSheet.saved_on_this_device_and_copied")}
      >
        <StepperRow
          label={t("booth.onboardingSheet.gap_between_songs")}
          value={b.settings.gapSec}
          unit=" s"
          {...BOOTH_RANGES.gapSec}
          onChange={(v) => b.setSettings({ gapSec: v })}
        />
        <StepperRow
          label={t("booth.onboardingSheet.cortina_level")}
          value={b.settings.cortinaLevelDb}
          unit={t("booth.onboardingSheet.db")}
          {...BOOTH_RANGES.cortinaLevelDb}
          onChange={(v) => b.setSettings({ cortinaLevelDb: v })}
        />
        <StepperRow
          label={t("booth.onboardingSheet.cortina_fade_out")}
          value={b.settings.cortinaFadeOutSec}
          unit=" s"
          {...BOOTH_RANGES.cortinaFadeOutSec}
          onChange={(v) => b.setSettings({ cortinaFadeOutSec: v })}
        />
        <StepperRow
          label={t("booth.onboardingSheet.cortina_fade_in")}
          value={b.settings.cortinaFadeInSec}
          unit=" s"
          {...BOOTH_RANGES.cortinaFadeInSec}
          onChange={(v) => b.setSettings({ cortinaFadeInSec: v })}
        />
        <StepperRow
          label={t("booth.onboardingSheet.loudness_target")}
          value={b.settings.loudnessTargetLUFS}
          unit={t("booth.onboardingSheet.lufs")}
          {...BOOTH_RANGES.loudnessTargetLUFS}
          onChange={(v) => b.setSettings({ loudnessTargetLUFS: v })}
        />
        <SwitchRow
          label={t("booth.onboardingSheet.trim_leading_silence")}
          sub={t("booth.onboardingSheet.up_to_3_s_from_the")}
          checked={b.settings.trimLeadingSilence}
          onChange={(v) => b.setSettings({ trimLeadingSilence: v })}
        />
        <SwitchRow
          label={t("booth.onboardingSheet.media_keys")}
          sub={t("booth.onboardingSheet.headset_pause_holds_never_cuts_off")}
          checked={b.settings.mediaKeys}
          onChange={(v) => b.setSettings({ mediaKeys: v })}
        />
      </Group>
    </Sheet>
  );
}
