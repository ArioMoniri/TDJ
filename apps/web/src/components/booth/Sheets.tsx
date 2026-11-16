"use client";
import { CORTINA_EDIT_RANGES } from "@tdj/core";
import { useRef, useState } from "react";
import { STOP_NOW_SEC, TRANSPORT_RANGES } from "@/lib/booth/engine";
import { MIX_EXPLAIN, MIX_PRESETS, type MixPresetId, presetOf } from "@/lib/booth/mix";
import { cortinaSpan } from "@/lib/booth/nightView";
import { BOOTH_RANGES, durationLabel } from "@/lib/booth/plan";
import { useBooth, useRoomCaps } from "@/lib/booth/store";
import { useMediaQuery } from "@/lib/hooks";
import { fmtNumber, fmtSec, lazy, t as tx } from "@/lib/i18n";
import {
  ACTIONS,
  type ActionId,
  bindingsOf,
  formatCombo,
  shownBindings,
  useBindings,
  useKeymap,
} from "@/lib/keymap";
import { useStore } from "@/lib/store";
import { CORTINA_STOP_RANGE, cortinaStopSec } from "@/lib/types";
import { ActionRow, Group, Row, SegmentedRow, StepperRow, SwitchRow, secUnit } from "../Form";
import { Sheet } from "../Sheet";
import { Stepper } from "../ui";
import { Fader } from "./Fader";
import { RoomControls } from "./LevelPanel";
import { SilenceGroup } from "./SilenceSettings";

/** the Mix sheet's old key names → their actions: the row shows the key as the DJ bound it (lib/keymap.ts) */
const KEY_ACTION: Record<string, ActionId> = {
  space: "booth.pause",
  f: "booth.fade",
  x: "booth.crossfade",
  h: "booth.hold",
  c: "booth.cueCortina",
};
const Kbd = ({ k }: { k: string }) => {
  const bound = useBindings(KEY_ACTION[k] ?? "booth.keys");
  const shown = KEY_ACTION[k] ? (bound[0] ? formatCombo(bound[0]) : "") : k;
  if (!shown) return null;
  return (
    <kbd className="booth-kbd text-footnote rounded bg-[var(--fill-3)] px-1.5 py-0.5 text-[var(--label-2)]">
      {shown}
    </kbd>
  );
};

/** A tappable row with its keyboard shortcut on the right (the Mix sheet's transport actions). */
function KeyAction({
  label,
  sub,
  k,
  onClick,
  disabled,
  testId,
}: {
  label: string;
  sub?: string;
  k: string;
  onClick: () => void;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      className="cell cell-tap w-full text-left disabled:text-[var(--label-3)]"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[var(--tint)]">{label}</span>
        {sub && <span className="text-footnote block text-[var(--label-2)]">{sub}</span>}
      </span>
      <Kbd k={k} />
    </button>
  );
}

/** A stepper row whose one-line explanation is never cut (the Mix sheet says what every number does). */
function MixStepper({
  label,
  explain,
  value,
  unit = " s",
  display,
  testId,
  ...stepper
}: {
  label: string;
  explain: string;
  value: number;
  unit?: string;
  display?: string;
  testId?: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="cell" data-testid={testId}>
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        <span className="text-footnote block text-[var(--label-2)]">{explain}</span>
      </span>
      <span className="cell-value tabular-nums">
        {display ?? (unit === " s" ? fmtSec(value) : `${value}${unit}`)}
      </span>
      <Stepper label={label} value={value} unit={unit === " s" ? secUnit() : unit} {...stepper} />
    </div>
  );
}

/**
 * Mix (round 22, Spotify "Mix" style): the night's sound settings, every value visible in its row with one line
 * saying what it does — transitions (a preset, the gap, the song end fade, the crossfade and fade lengths),
 * cortinas (play length, fades, volume), levels (room volume, loudness, silence trim) and the source. The actions
 * on the playing song live on the transport; a phone, whose transport has no room for them, gets them here first.
 */
export function LevelsSheet({
  open,
  onClose,
  onEditTransitions,
}: {
  open: boolean;
  onClose: () => void;
  /** wave 4: "Edit transitions…" opens the transition editor at the next transition */
  onEditTransitions?: () => void;
}) {
  const cortinaFader = useBooth((s) => s.cortinaFader);
  const master = useBooth((s) => s.master);
  const muted = useBooth((s) => s.muted);
  const ducked = useBooth((s) => s.ducked);
  const state = useBooth((s) => s.state);
  const started = useBooth((s) => s.started);
  const holding = useBooth((s) => s.holding);
  const paused = useBooth((s) => s.paused);
  const settings = useBooth((s) => s.settings);
  const sourceMode = useBooth((s) => s.sourceMode);
  const spotifyOk = useBooth((s) => s.availability.spotify.ok);
  const kind = useBooth((s) => s.plan?.items[s.planIndex]?.kind);
  const composerCortina = useBooth((s) => s.playlist?.options.cortinaLengthSec);
  const userSettings = useStore((s) => s.settings);
  const phone = useMediaQuery("(max-width: 599.98px)");
  // 2026-11: Spotify Connect cannot fade; the iOS Spotify app has no volume control either
  const caps = useRoomCaps();
  const mutePaused = useBooth((s) => s.mutePaused);
  const act = useBooth.getState();
  const live = state === "playing" || state === "cortina";
  const set = act.setSettings;
  const preset = presetOf(settings);
  const cortinaLen = cortinaStopSec(userSettings, composerCortina);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tx("booth.sheets.mix")}
      trailing={tx("booth.sheets.done")}
      detents={["medium", "large"]}
      testId="booth-levels-sheet"
    >
      {phone && (
        <Group header={tx("booth.sheets.now")} footer={tx("booth.sheets.pause_and_resume_fade_in_and")}>
          <KeyAction
            label={
              live ? tx("booth.sheets.pause") : paused ? tx("booth.sheets.resume") : tx("booth.sheets.play")
            }
            sub={tx("booth.sheets.s_fade", {
              pauseFadeSec: fmtNumber(settings.pauseFadeSec, { maximumFractionDigits: 1 }),
            })}
            k="space"
            onClick={() => act.togglePause()}
            disabled={!started}
            testId="booth-mix-pause"
          />
          <KeyAction
            label={tx("booth.sheets.fade_out_now_s", {
              fadeNowSec: fmtNumber(settings.fadeNowSec, { maximumFractionDigits: 1 }),
            })}
            sub={caps.fade ? tx("booth.sheets.the_song_fades_out_the_next") : tx("booth.connect.no_fade_why")}
            k="f"
            onClick={() => act.fadeOutNow()}
            disabled={!live || !caps.fade}
            testId="booth-fade-now"
          />
          <KeyAction
            label={tx("booth.sheets.next_with_crossfade_s", {
              crossfadeSec: fmtNumber(settings.crossfadeSec, { maximumFractionDigits: 1 }),
            })}
            sub={
              caps.fade ? tx("booth.sheets.the_next_item_starts_now_while") : tx("booth.connect.no_fade_why")
            }
            k="x"
            onClick={() => void act.crossfadeNext()}
            disabled={!live || !caps.fade}
            testId="booth-crossfade"
          />
          <KeyAction
            label={holding ? tx("booth.sheets.cancel_hold") : tx("booth.sheets.hold_after_this_song")}
            sub={tx("booth.sheets.the_song_finishes_the_next_one")}
            k="h"
            onClick={() => act.toggleHold()}
            disabled={!live}
            testId="booth-mix-hold"
          />
          {kind !== "closing" && (
            <KeyAction
              label={tx("booth.sheets.end_the_tanda_after_this_song")}
              sub={tx("booth.sheets.the_cortina_comes_next_at_the")}
              k="c"
              onClick={() => act.cueCortina()}
              disabled={!live || kind !== "track"}
              testId="booth-mix-cue"
            />
          )}
          <SwitchRow
            label={tx("booth.sheets.talk_over")}
            sub={
              caps.volume
                ? tx("booth.sheets.the_music_dips_12_db_while")
                : tx("booth.connect.talk_unavailable")
            }
            checked={caps.volume && ducked}
            disabled={!caps.volume}
            onChange={(v) => act.setDucked(v)}
          />
        </Group>
      )}
      <Group
        header={tx("booth.sheets.transitions")}
        footer={
          preset === "custom"
            ? tx("booth.sheets.custom_your_own_gap_fades_and")
            : tx("booth.sheets.saved_on_this_device", {
                explain: MIX_PRESETS.find((p) => p.id === preset)!.explain,
              })
        }
        data-testid="booth-mix-transitions"
      >
        <SegmentedRow
          label={tx("booth.sheets.style")}
          value={preset}
          items={[
            ...MIX_PRESETS.map((p) => [p.id, p.label] as [MixPresetId, string]),
            ["custom", tx("composer.custom")],
          ]}
          onChange={(k) => {
            const p = MIX_PRESETS.find((x) => x.id === k);
            if (p) set({ ...p.values });
          }}
        />
        <MixStepper
          label={tx("booth.sheets.gap_between_items")}
          explain={MIX_EXPLAIN.gapSec}
          value={settings.gapSec}
          {...BOOTH_RANGES.gapSec}
          onChange={(v) => set({ gapSec: v })}
          testId="booth-mix-gap"
        />
        <MixStepper
          label={tx("booth.sheets.song_end_fade")}
          explain={MIX_EXPLAIN.songFadeOutSec}
          value={settings.songFadeOutSec}
          {...TRANSPORT_RANGES.songFadeOutSec}
          onChange={(v) => set({ songFadeOutSec: v })}
        />
        <MixStepper
          label={tx("booth.sheets.crossfade")}
          explain={MIX_EXPLAIN.crossfadeSec}
          value={settings.crossfadeSec}
          {...TRANSPORT_RANGES.crossfadeSec}
          onChange={(v) => set({ crossfadeSec: v })}
        />
        <MixStepper
          label={tx("booth.sheets.fade_out_now")}
          explain={MIX_EXPLAIN.fadeNowSec}
          value={settings.fadeNowSec}
          {...TRANSPORT_RANGES.fadeNowSec}
          onChange={(v) => set({ fadeNowSec: v })}
        />
        <MixStepper
          label={tx("booth.sheets.pause_resume_fade")}
          explain={MIX_EXPLAIN.pauseFadeSec}
          value={settings.pauseFadeSec}
          {...TRANSPORT_RANGES.pauseFadeSec}
          onChange={(v) => set({ pauseFadeSec: Math.round(v * 10) / 10 })}
        />
        <MixStepper
          label={tx("booth.sheets.fade_out_and_stop")}
          explain={MIX_EXPLAIN.stopFadeSec}
          value={settings.stopFadeSec}
          {...TRANSPORT_RANGES.stopFadeSec}
          onChange={(v) => set({ stopFadeSec: v })}
        />
        {onEditTransitions && (
          <ActionRow
            label={tx("booth.sheets.edit_transitions")}
            tip={tx("booth.sheets.edit_transitions_hint")}
            onClick={() => {
              onClose();
              onEditTransitions();
            }}
          />
        )}
      </Group>
      <Group header={tx("booth.sheets.cortinas")} footer={tx("booth.sheets.each_cortina_can_have_its_own")}>
        <MixStepper
          label={tx("booth.sheets.cortina_length")}
          explain={
            userSettings.cortinaStopSec === null
              ? tx("booth.sheets.follows_the_composer", { cortinaStop: MIX_EXPLAIN.cortinaStop })
              : MIX_EXPLAIN.cortinaStop
          }
          value={cortinaLen}
          {...CORTINA_STOP_RANGE}
          onChange={(v) => act.setCortinaLength(v)}
          testId="booth-mix-cortina-length"
        />
        <SwitchRow
          label={tx("booth.sheets.follow_the_composer_s_cortina_length")}
          checked={userSettings.cortinaStopSec === null}
          onChange={(v) => act.setCortinaLength(v ? null : cortinaLen)}
        />
        <MixStepper
          label={tx("booth.sheets.cortina_fade_in")}
          explain={MIX_EXPLAIN.cortinaFadeInSec}
          value={settings.cortinaFadeInSec}
          {...BOOTH_RANGES.cortinaFadeInSec}
          onChange={(v) => set({ cortinaFadeInSec: v })}
        />
        <MixStepper
          label={tx("booth.sheets.cortina_fade_out")}
          explain={MIX_EXPLAIN.cortinaFadeOutSec}
          value={settings.cortinaFadeOutSec}
          {...BOOTH_RANGES.cortinaFadeOutSec}
          onChange={(v) => set({ cortinaFadeOutSec: v })}
        />
        <div className="cell">
          <Fader
            label={tx("booth.sheets.cortina_volume")}
            hint={tx("booth.sheets.how_loud_cortinas_play_against_the")}
            value={cortinaFader}
            min={0}
            max={1}
            step={0.05}
            onChange={act.setCortinaFader}
            display={`${Math.round(cortinaFader * 100)} %`}
            testId="booth-cortina-fader"
            className="w-full"
          />
        </div>
      </Group>
      <Group header={tx("booth.sheets.levels")} footer={tx("booth.sheets.master_volume_the_whole_output_to")}>
        <div className="cell">
          <Fader
            label={tx("booth.sheets.master_volume")}
            hint={tx("booth.sheets.the_whole_output_to_the_room")}
            value={master}
            min={-30}
            max={6}
            step={1}
            onChange={act.setMaster}
            display={tx("booth.sheets.db", { p1: master > 0 ? "+" : "", master })}
            testId="booth-master"
            className="w-full"
            disabled={!caps.volume}
            {...(caps.volume ? {} : { hint: tx("booth.connect.no_volume_why") })}
          />
        </div>
        <ActionRow
          label={
            caps.volume
              ? muted
                ? tx("booth.sheets.unmute")
                : tx("booth.sheets.mute")
              : muted && mutePaused
                ? tx("booth.connect.unmute_resumes")
                : tx("booth.connect.mute_pauses")
          }
          onClick={() => act.toggleMute()}
        />
        <MixStepper
          label={tx("booth.sheets.loudness")}
          explain={MIX_EXPLAIN.loudnessTargetLUFS}
          value={settings.loudnessTargetLUFS}
          unit={tx("booth.sheets.lufs")}
          {...BOOTH_RANGES.loudnessTargetLUFS}
          onChange={(v) => set({ loudnessTargetLUFS: v })}
        />
      </Group>
      {/* 2026-11: how the normalisation reaches the room now, the room meter and Auto master (LevelPanel.tsx) */}
      <RoomControls withMeter />
      {/* 2026-11: "Trim silence at the start" became the silence mode (Settings → Booth → Gaps, the same rows) */}
      <SilenceGroup header={tx("booth.silence.mix_header")} onChange={(p) => act.setSilence(p)} />
      <Group
        header={tx("booth.sheets.source")}
        footer={
          spotifyOk
            ? tx("booth.sheets.spotify_premium_is_connected_every_song")
            : tx("booth.sheets.connect_spotify_premium_or_link_your")
        }
      >
        <SwitchRow
          label={tx("booth.sheets.rehearsal_30_s_clips")}
          sub={tx("booth.sheets.for_trying_the_night_out_off")}
          checked={sourceMode === "preview"}
          disabled={started}
          onChange={(v) => void act.setSourceMode(v ? "preview" : "file")}
        />
      </Group>
    </Sheet>
  );
}

/**
 * Stop (round 20; wave 2): the strip's Stop opens this; esc never does (two esc presses after Mix opened it with the
 * destructive action focused, so Enter faded the room out). The focus lands on Cancel: Enter or esc keeps playing;
 * "Fade out and stop" and "Stop now" each take a deliberate tap (or Tab, then Enter). Play restarts the same item.
 */
export function StopSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const stop = useBooth((s) => s.stop);
  const fade = useBooth((s) => s.settings.stopFadeSec);
  // 2026-11: a device that cannot fade (Spotify Connect) stops at once: the sheet never promises a fade
  const canFade = useRoomCaps().fade;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tx("booth.sheets.stop_the_music")}
      detents={["medium"]}
      testId="booth-stop-sheet"
      hideCancel
    >
      <Group
        footer={
          canFade
            ? tx("booth.sheets.cancel_keeps_the_music_playing_enter")
            : tx("booth.connect.stops_at_once_footer")
        }
      >
        <button
          type="button"
          className="cell cell-tap w-full justify-center font-semibold"
          data-autofocus
          data-testid="booth-stop-cancel"
          onClick={onClose}
        >
          {tx("booth.sheets.cancel")}
        </button>
        {canFade && (
          <button
            type="button"
            className="cell cell-tap w-full justify-center font-semibold text-[var(--tint)]"
            data-testid="booth-stop-fade"
            onClick={() => {
              stop(fade);
              onClose();
            }}
          >
            {tx("booth.sheets.fade_out_and_stop_s", { fade })}
          </button>
        )}
        <button
          type="button"
          className="cell cell-tap w-full justify-center font-semibold text-[var(--destructive)]"
          data-testid="booth-stop-now"
          onClick={() => {
            stop(STOP_NOW_SEC);
            onClose();
          }}
        >
          {canFade ? tx("booth.sheets.stop_now") : tx("booth.connect.stops_at_once")}
        </button>
      </Group>
    </Sheet>
  );
}

/** Per cortina (round 20): fade in, fade out and the stop second, saved with the set (exports and History carry it). */
export function CortinaSheet({ planIndex, onClose }: { planIndex: number | null; onClose: () => void }) {
  const it = useBooth((s) => (planIndex === null ? undefined : s.plan?.items[planIndex]));
  const edits = useBooth((s) => s.playlist?.booth?.cortinaEdits);
  const settings = useBooth((s) => s.settings);
  const current = useBooth(
    (s) => s.planIndex === planIndex && (s.state === "cortina" || s.state === "playing"),
  );
  const setEdit = useBooth((s) => s.setCortinaEdit);
  const open = !!it && it.kind === "cortina";
  const id = it?.id ?? "";
  const edited = !!edits?.[id];
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tx("booth.sheets.cortina_2")}
      trailing={tx("booth.sheets.done")}
      testId="booth-cortina-sheet"
    >
      {it && (
        <>
          <p className="section-foot mt-2">
            {it.title} · {it.artist} · {cortinaSpan(it.trimInSec ?? 0, it.stopSec ?? 45)}
          </p>
          <Group
            header={tx("booth.sheets.envelope")}
            footer={
              current
                ? tx("booth.sheets.the_cortina_playing_now_keeps_its")
                : tx("booth.sheets.saved_with_the_set_the_booth")
            }
          >
            <StepperRow
              label={tx("booth.sheets.fade_in")}
              value={it.fadeInSec ?? settings.cortinaFadeInSec}
              unit=" s"
              {...CORTINA_EDIT_RANGES.fadeInSec}
              onChange={(v) => setEdit(id, { fadeInSec: v })}
            />
            <StepperRow
              label={tx("booth.sheets.fade_out")}
              value={it.fadeOutSec ?? settings.cortinaFadeOutSec}
              unit=" s"
              {...CORTINA_EDIT_RANGES.fadeOutSec}
              onChange={(v) => setEdit(id, { fadeOutSec: v })}
            />
            <StepperRow
              label={tx("booth.sheets.stop_at")}
              value={it.stopSec ?? 45}
              display={durationLabel(it.stopSec ?? 45)}
              {...CORTINA_EDIT_RANGES.stopSec}
              // 2026-11: the stop is 20–90 s after the cortina's start (its chorus)
              min={(it.trimInSec ?? 0) + CORTINA_EDIT_RANGES.stopSec.min}
              max={(it.trimInSec ?? 0) + CORTINA_EDIT_RANGES.stopSec.max}
              onChange={(v) => setEdit(id, { stopSec: v })}
            />
            <Row label={tx("booth.sheets.plays_for")} value={durationLabel(it.lengthSec)} />
          </Group>
          {edited && (
            <Group>
              <ActionRow
                label={tx("booth.sheets.use_the_night_s_settings")}
                onClick={() => setEdit(id, null)}
              />
            </Group>
          )}
        </>
      )}
    </Sheet>
  );
}

/** the keys that are not the DJ's to change (a search field's, the armed confirm's) */
const FIXED_KEYS: Array<[string, string]> = lazy(() => [
  ["enter", tx("booth.sheets.enter_key")],
  ["↑ ↓ ↵ ⇥ esc", tx("booth.sheets.search_keys")],
]);

/**
 * The keyboard sheet (?): every shortcut as the DJ bound it on this device (lib/keymap.ts), the Booth's first, then
 * the edit keys; "Change keys…" opens Settings → Keyboard.
 */
export function ShortcutsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const custom = useKeymap((s) => s.custom);
  const row = (a: (typeof ACTIONS)[number]) => {
    const keys = shownBindings(bindingsOf(a.id, custom));
    return (
      <Row
        key={a.id}
        label={tx(a.label)}
        data-testid={`shortcut-${a.id}`}
        value={
          keys.length ? (
            <span className="inline-flex flex-wrap justify-end gap-1">
              {keys.map((c) => (
                <kbd key={c} className="text-footnote rounded bg-[var(--fill-3)] px-1.5 py-0.5">
                  {formatCombo(c)}
                </kbd>
              ))}
            </span>
          ) : (
            tx("keys.none")
          )
        }
      />
    );
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tx("booth.sheets.keyboard")}
      trailing={tx("booth.sheets.done")}
      testId="booth-shortcuts"
    >
      <Group header={tx("keys.group_booth")} footer={tx("booth.sheets.shortcuts_are_ignored_while_a_text")}>
        {ACTIONS.filter((a) => a.group === "booth").map(row)}
        {FIXED_KEYS.map(([k, d]) => (
          <Row
            key={k}
            label={d}
            value={<kbd className="text-footnote rounded bg-[var(--fill-3)] px-1.5 py-0.5">{k}</kbd>}
          />
        ))}
      </Group>
      <Group header={tx("keys.group_edit")} footer={tx("keys.sheet_footer")}>
        {ACTIONS.filter((a) => a.group === "edit").map(row)}
        <ActionRow
          label={tx("keys.change")}
          onClick={() => {
            onClose();
            location.assign("/settings#settings-keyboard");
          }}
          id="shortcuts-change"
        />
      </Group>
    </Sheet>
  );
}

export function BreakSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const startBreak = useBooth((s) => s.startBreak);
  const [min, setMin] = useState(10);
  return (
    <Sheet open={open} onClose={onClose} title={tx("booth.sheets.break")} testId="booth-break-sheet">
      <Group footer={tx("booth.sheets.the_booth_holds_after_the_current")}>
        {[5, 10, 15, 20, 30].map((m) => (
          <Row
            key={m}
            label={tx("booth.sheets.minutes", { m })}
            onClick={() => setMin(m)}
            value={min === m ? "✓" : undefined}
          />
        ))}
        <ActionRow
          label={tx("booth.sheets.break_for_min_after_this_song", { min })}
          onClick={() => {
            startBreak(min);
            onClose();
          }}
        />
      </Group>
    </Sheet>
  );
}

/** "Find…" for an item without a source: the three closest files, or any file from the disk (remembered as manual). */
export function FindFileSheet({
  item,
  onClose,
}: {
  item: { id: string; title: string } | null;
  onClose: () => void;
}) {
  const suggestions = useBooth((s) => (item ? s.suggestions[item.id] : undefined)) ?? [];
  const pickFile = useBooth((s) => s.pickFile);
  const input = useRef<HTMLInputElement>(null);
  return (
    <Sheet
      open={!!item}
      onClose={onClose}
      title={tx("booth.sheets.pick_file_2")}
      trailing={tx("booth.sheets.done")}
      testId="booth-find-sheet"
    >
      {item && (
        <>
          <p className="section-foot mt-2">{item.title}</p>
          <Group
            header={
              suggestions.length
                ? tx("booth.sheets.closest_files_in_your_folder")
                : tx("booth.sheets.no_close_file_name_in_your")
            }
            footer={tx("booth.sheets.a_file_picked_by_hand_is")}
          >
            {suggestions.map((s) => (
              <Row
                key={s.path}
                label={s.name}
                sub={s.path}
                onClick={() => {
                  void pickFile(item.id, { path: s.path });
                  onClose();
                }}
              />
            ))}
            <ActionRow label={tx("booth.sheets.pick_file")} onClick={() => input.current?.click()} />
          </Group>
          <input
            ref={input}
            type="file"
            accept="audio/*"
            className="sr-only"
            data-testid="booth-pick-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                void pickFile(item.id, f);
                onClose();
              }
            }}
          />
        </>
      )}
    </Sheet>
  );
}

export function ResumeSheet() {
  const offer = useBooth((s) => s.resumeOffer);
  const resume = useBooth((s) => s.resume);
  const plan = useBooth((s) => s.plan);
  const it = offer && plan ? plan.items[offer.planIndex] : null;
  // 2026-11: Spotify kept playing on Connect through the reload: continue with it (the default), no restart
  const re = offer?.reattach ?? null;
  if (offer && re && it)
    return (
      <Sheet
        open
        onClose={() => void resume(false)}
        title={tx("booth.connect.still_playing_title")}
        hideCancel
        detents={["medium"]}
        testId="booth-resume"
      >
        <Group footer={tx("booth.connect.still_playing_footer")}>
          <ActionRow
            label={tx("booth.connect.continue_playing", { title: it.title, device: re.deviceName })}
            onClick={() => void resume(true)}
            id="booth-resume-yes"
          />
          <ActionRow
            label={tx("booth.sheets.start_from_the_beginning")}
            destructive
            onClick={() => void resume(false)}
          />
        </Group>
      </Sheet>
    );
  const k =
    it && plan
      ? plan.items.filter((x) => x.tanda === it.tanda && x.kind === "track").findIndex((x) => x.n === it.n) +
        1
      : 0;
  return (
    <Sheet
      open={!!offer}
      onClose={() => void resume(false)}
      title={tx("booth.sheets.resume_the_night")}
      hideCancel
      detents={["medium"]}
      testId="booth-resume"
    >
      <Group footer={tx("booth.sheets.the_audio_cannot_survive_a_reload")}>
        <ActionRow
          label={
            it
              ? tx("booth.sheets.resume_at_tanda", {
                  tanda: it.tanda,
                  p1: it.kind === "cortina" ? tx("booth.sheets.cortina") : tx("booth.sheets.track", { k }),
                })
              : tx("booth.sheets.resume")
          }
          onClick={() => void resume(true)}
          id="booth-resume-yes"
        />
        <ActionRow
          label={tx("booth.sheets.start_from_the_beginning")}
          destructive
          onClick={() => void resume(false)}
        />
      </Group>
    </Sheet>
  );
}
