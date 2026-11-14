"use client";
import { CORTINA_EDIT_RANGES } from "@tdj/core";
import { useEffect, useRef, useState } from "react";
import { STOP_NOW_SEC, TRANSPORT_RANGES } from "@/lib/booth/engine";
import { MIX_EXPLAIN, MIX_PRESETS, type MixPresetId, presetOf } from "@/lib/booth/mix";
import { BOOTH_RANGES, durationLabel } from "@/lib/booth/plan";
import { useBooth } from "@/lib/booth/store";
import { useMediaQuery } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { CORTINA_STOP_RANGE, cortinaStopSec } from "@/lib/types";
import { ActionRow, Group, Row, SegmentedRow, StepperRow, SwitchRow } from "../Form";
import { Sheet } from "../Sheet";
import { Stepper } from "../ui";
import { Fader } from "./Fader";

const Kbd = ({ k }: { k: string }) => (
  <kbd className="booth-kbd text-footnote rounded bg-[var(--fill-3)] px-1.5 py-0.5 text-[var(--label-2)]">
    {k}
  </kbd>
);

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
      <span className="cell-value tabular-nums">{display ?? `${value}${unit}`}</span>
      <Stepper label={label} value={value} unit={unit} {...stepper} />
    </div>
  );
}

/**
 * Mix (round 22, Spotify "Mix" style): the night's sound settings, every value visible in its row with one line
 * saying what it does — transitions (a preset, the gap, the song end fade, the crossfade and fade lengths),
 * cortinas (play length, fades, volume), levels (room volume, loudness, silence trim) and the source. The actions
 * on the playing song live on the transport; a phone, whose transport has no room for them, gets them here first.
 */
export function LevelsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
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
  const phone = useMediaQuery("(max-width: 639px)");
  const act = useBooth.getState();
  const live = state === "playing" || state === "cortina";
  const set = act.setSettings;
  const preset = presetOf(settings);
  const cortinaLen = cortinaStopSec(userSettings, composerCortina);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Mix"
      trailing="Done"
      detents={["medium", "large"]}
      testId="booth-levels-sheet"
    >
      {phone && (
        <Group
          header="Now"
          footer="Pause and Resume fade in and out; Hold lets the song finish and waits. The keys work without this sheet."
        >
          <KeyAction
            label={live ? "Pause" : paused ? "Resume" : "Play"}
            sub={`${settings.pauseFadeSec} s fade`}
            k="space"
            onClick={() => act.togglePause()}
            disabled={!started}
            testId="booth-mix-pause"
          />
          <KeyAction
            label={`Fade out now (${settings.fadeNowSec} s)`}
            sub="The song fades out; the next item follows at the gap"
            k="f"
            onClick={() => act.fadeOutNow()}
            disabled={!live}
            testId="booth-fade-now"
          />
          <KeyAction
            label={`Next with crossfade (${settings.crossfadeSec} s)`}
            sub="The next item starts now while this one fades out"
            k="x"
            onClick={() => void act.crossfadeNext()}
            disabled={!live}
            testId="booth-crossfade"
          />
          <KeyAction
            label={holding ? "Cancel hold" : "Hold after this song"}
            sub="The song finishes; the next one waits for Play"
            k="h"
            onClick={() => act.toggleHold()}
            disabled={!live}
            testId="booth-mix-hold"
          />
          <KeyAction
            label="End the tanda after this song"
            sub="The cortina comes next, at the gap"
            k="c"
            onClick={() => act.cueCortina()}
            disabled={!live || kind !== "track"}
            testId="booth-mix-cue"
          />
          <SwitchRow
            label="Talk-over"
            sub="The music dips 12 dB while you speak (t)"
            checked={ducked}
            onChange={(v) => act.setDucked(v)}
          />
        </Group>
      )}
      <Group
        header="Transitions"
        footer={
          preset === "custom"
            ? "Custom: your own gap, fades and crossfade. Saved on this device; the night is re-timed, also while it plays."
            : `${MIX_PRESETS.find((p) => p.id === preset)!.explain} Saved on this device.`
        }
        data-testid="booth-mix-transitions"
      >
        <SegmentedRow
          label="Style"
          value={preset}
          items={[...MIX_PRESETS.map((p) => [p.id, p.label] as [MixPresetId, string]), ["custom", "Custom"]]}
          onChange={(k) => {
            const p = MIX_PRESETS.find((x) => x.id === k);
            if (p) set({ ...p.values });
          }}
        />
        <MixStepper
          label="Gap between items"
          explain={MIX_EXPLAIN.gapSec}
          value={settings.gapSec}
          {...BOOTH_RANGES.gapSec}
          onChange={(v) => set({ gapSec: v })}
          testId="booth-mix-gap"
        />
        <MixStepper
          label="Song end fade"
          explain={MIX_EXPLAIN.songFadeOutSec}
          value={settings.songFadeOutSec}
          {...TRANSPORT_RANGES.songFadeOutSec}
          onChange={(v) => set({ songFadeOutSec: v })}
        />
        <MixStepper
          label="Crossfade"
          explain={MIX_EXPLAIN.crossfadeSec}
          value={settings.crossfadeSec}
          {...TRANSPORT_RANGES.crossfadeSec}
          onChange={(v) => set({ crossfadeSec: v })}
        />
        <MixStepper
          label="Fade out now"
          explain={MIX_EXPLAIN.fadeNowSec}
          value={settings.fadeNowSec}
          {...TRANSPORT_RANGES.fadeNowSec}
          onChange={(v) => set({ fadeNowSec: v })}
        />
        <MixStepper
          label="Pause / resume fade"
          explain={MIX_EXPLAIN.pauseFadeSec}
          value={settings.pauseFadeSec}
          {...TRANSPORT_RANGES.pauseFadeSec}
          onChange={(v) => set({ pauseFadeSec: Math.round(v * 10) / 10 })}
        />
        <MixStepper
          label="Fade out and stop"
          explain={MIX_EXPLAIN.stopFadeSec}
          value={settings.stopFadeSec}
          {...TRANSPORT_RANGES.stopFadeSec}
          onChange={(v) => set({ stopFadeSec: v })}
        />
      </Group>
      <Group
        header="Cortinas"
        footer="Each cortina can have its own fades and stop in the set list (the sliders on its row). Saved with the set; the exports follow it."
      >
        <MixStepper
          label="Cortina length"
          explain={
            userSettings.cortinaStopSec === null
              ? `${MIX_EXPLAIN.cortinaStop} Follows the composer.`
              : MIX_EXPLAIN.cortinaStop
          }
          value={cortinaLen}
          {...CORTINA_STOP_RANGE}
          onChange={(v) => act.setCortinaLength(v)}
          testId="booth-mix-cortina-length"
        />
        <SwitchRow
          label="Follow the composer's cortina length"
          checked={userSettings.cortinaStopSec === null}
          onChange={(v) => act.setCortinaLength(v ? null : cortinaLen)}
        />
        <MixStepper
          label="Cortina fade-in"
          explain={MIX_EXPLAIN.cortinaFadeInSec}
          value={settings.cortinaFadeInSec}
          {...BOOTH_RANGES.cortinaFadeInSec}
          onChange={(v) => set({ cortinaFadeInSec: v })}
        />
        <MixStepper
          label="Cortina fade-out"
          explain={MIX_EXPLAIN.cortinaFadeOutSec}
          value={settings.cortinaFadeOutSec}
          {...BOOTH_RANGES.cortinaFadeOutSec}
          onChange={(v) => set({ cortinaFadeOutSec: v })}
        />
        <div className="cell">
          <Fader
            label="Cortina volume"
            hint="How loud cortinas play against the tangos"
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
      <Group
        header="Levels"
        footer="Master volume: the whole output to the room (0 dB = as mastered). ↑ / ↓ move the cortina volume from the keyboard, m mutes."
      >
        <div className="cell">
          <Fader
            label="Master volume"
            hint="The whole output to the room"
            value={master}
            min={-30}
            max={6}
            step={1}
            onChange={act.setMaster}
            display={`${master > 0 ? "+" : ""}${master} dB`}
            testId="booth-master"
            className="w-full"
          />
        </div>
        <ActionRow label={muted ? "Unmute" : "Mute"} onClick={() => act.toggleMute()} />
        <MixStepper
          label="Loudness"
          explain={MIX_EXPLAIN.loudnessTargetLUFS}
          value={settings.loudnessTargetLUFS}
          unit=" LUFS"
          {...BOOTH_RANGES.loudnessTargetLUFS}
          onChange={(v) => set({ loudnessTargetLUFS: v })}
        />
        <SwitchRow
          label="Trim silence at the start"
          sub={MIX_EXPLAIN.trimLeadingSilence}
          checked={settings.trimLeadingSilence}
          onChange={(v) => set({ trimLeadingSilence: v })}
        />
      </Group>
      <Group
        header="Source"
        footer={
          spotifyOk
            ? "Spotify Premium is connected: every song plays in full. A rehearsal plays 30 s of each to hear the night quickly."
            : "Connect Spotify Premium (or link your music folder) to play full songs; without them the night plays 30 s clips."
        }
      >
        <SwitchRow
          label="Rehearsal (30 s clips)"
          sub="For trying the night out; off plays the full songs"
          checked={sourceMode === "preview"}
          disabled={started}
          onChange={(v) => void act.setSourceMode(v ? "preview" : "file")}
        />
      </Group>
    </Sheet>
  );
}

/**
 * Stop (round 20): one tap on the strip's Stop (or esc) opens this; no hidden press-and-hold. "Fade out and stop"
 * has the focus (Enter); "Stop now" cuts with a 0.1 s declick. Play restarts the same item.
 */
export function StopSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const stop = useBooth((s) => s.stop);
  const fade = useBooth((s) => s.settings.stopFadeSec);
  const gentle = useRef<HTMLButtonElement>(null);
  const now = useRef<HTMLButtonElement>(null);
  const done = useRef(onClose);
  done.current = onClose;
  // Enter = "Fade out and stop" wherever the focus is (the sheet's own focus lands on its first control, Cancel);
  // only a focused "Stop now" takes Enter for itself
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => gentle.current?.focus({ preventScroll: true }), 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.repeat || document.activeElement === now.current) return;
      e.preventDefault();
      e.stopPropagation();
      useBooth.getState().stop(useBooth.getState().settings.stopFadeSec);
      done.current();
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Stop the music?"
      detents={["medium"]}
      testId="booth-stop-sheet"
    >
      <Group footer="Esc opens this, Enter fades out, esc again keeps playing. Play restarts the same song from the top.">
        <button
          type="button"
          className="cell cell-tap w-full justify-center font-semibold text-[var(--tint)]"
          ref={gentle}
          data-testid="booth-stop-fade"
          onClick={() => {
            stop(fade);
            onClose();
          }}
        >
          Fade out and stop ({fade} s)
        </button>
        <button
          type="button"
          className="cell cell-tap w-full justify-center font-semibold text-[var(--destructive)]"
          ref={now}
          data-testid="booth-stop-now"
          onClick={() => {
            stop(STOP_NOW_SEC);
            onClose();
          }}
        >
          Stop now
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
    <Sheet open={open} onClose={onClose} title="Cortina" trailing="Done" testId="booth-cortina-sheet">
      {it && (
        <>
          <p className="section-foot mt-2">
            {it.title} · {it.artist} · in {durationLabel(it.trimInSec ?? 0)}
          </p>
          <Group
            header="Envelope"
            footer={
              current
                ? "The cortina playing now keeps its envelope; the change applies the next time it plays and re-times the night."
                : "Saved with the set: the booth, History and the DJ-app exports use it. The rest of the night is re-timed."
            }
          >
            <StepperRow
              label="Fade in"
              value={it.fadeInSec ?? settings.cortinaFadeInSec}
              unit=" s"
              {...CORTINA_EDIT_RANGES.fadeInSec}
              onChange={(v) => setEdit(id, { fadeInSec: v })}
            />
            <StepperRow
              label="Fade out"
              value={it.fadeOutSec ?? settings.cortinaFadeOutSec}
              unit=" s"
              {...CORTINA_EDIT_RANGES.fadeOutSec}
              onChange={(v) => setEdit(id, { fadeOutSec: v })}
            />
            <StepperRow
              label="Stop at"
              value={it.stopSec ?? 45}
              display={durationLabel(it.stopSec ?? 45)}
              {...CORTINA_EDIT_RANGES.stopSec}
              onChange={(v) => setEdit(id, { stopSec: v })}
            />
            <Row label="Plays for" value={durationLabel(it.lengthSec)} />
          </Group>
          {edited && (
            <Group>
              <ActionRow label="Use the night's settings" onClick={() => setEdit(id, null)} />
            </Group>
          )}
        </>
      )}
    </Sheet>
  );
}

const KEYS: Array<[string, string]> = [
  ["space", "Pause / resume (a short fade)"],
  ["esc", "Stop…: fade out and stop, or stop now"],
  ["→", "Next at gap: the queued item is skipped"],
  ["f", "Fade out now; the next item follows at the gap"],
  ["x", "Next with crossfade"],
  ["h", "Hold after this song / cancel the hold"],
  ["t", "Talk-over: the music dips 12 dB"],
  ["↑ / ↓", "Cortina fader ± 5 %"],
  ["c", "Cue the cortina: end the tanda after this song"],
  ["p", "Pre-listen the next item in the headphones"],
  ["⇧ P", "Stop the pre-listen (the room keeps playing)"],
  ["b", "Birthday vals"],
  ["m", "Master mute"],
  ["?", "This sheet"],
];

export function ShortcutsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Keyboard" trailing="Done" testId="booth-shortcuts">
      <Group footer="Shortcuts are ignored while a text field has focus. Every key calls the same engine method the buttons do.">
        {KEYS.map(([k, d]) => (
          <Row
            key={k}
            label={d}
            value={<kbd className="text-footnote rounded bg-[var(--fill-3)] px-1.5 py-0.5">{k}</kbd>}
          />
        ))}
      </Group>
    </Sheet>
  );
}

export function BreakSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const startBreak = useBooth((s) => s.startBreak);
  const [min, setMin] = useState(10);
  return (
    <Sheet open={open} onClose={onClose} title="Break" testId="booth-break-sheet">
      <Group footer="The booth holds after the current song and counts down; Play (or End break) resumes with the next item.">
        {[5, 10, 15, 20, 30].map((m) => (
          <Row key={m} label={`${m} minutes`} onClick={() => setMin(m)} value={min === m ? "✓" : undefined} />
        ))}
        <ActionRow
          label={`Break for ${min} min after this song`}
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
    <Sheet open={!!item} onClose={onClose} title="Pick file" trailing="Done" testId="booth-find-sheet">
      {item && (
        <>
          <p className="section-foot mt-2">{item.title}</p>
          <Group
            header={suggestions.length ? "Closest files in your folder" : "No close file name in your folder"}
            footer="A file picked by hand is remembered for this recording and never overwritten by a re-index."
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
            <ActionRow label="Pick file…" onClick={() => input.current?.click()} />
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
  const k =
    it && plan
      ? plan.items.filter((x) => x.tanda === it.tanda && x.kind === "track").findIndex((x) => x.n === it.n) +
        1
      : 0;
  return (
    <Sheet
      open={!!offer}
      onClose={() => void resume(false)}
      title="Resume the night?"
      hideCancel
      detents={["medium"]}
      testId="booth-resume"
    >
      <Group footer="The audio cannot survive a reload; the position and the log do.">
        <ActionRow
          label={
            it ? `Resume at tanda ${it.tanda}, ${it.kind === "cortina" ? "cortina" : `track ${k}`}` : "Resume"
          }
          onClick={() => void resume(true)}
          id="booth-resume-yes"
        />
        <ActionRow label="Start from the beginning" destructive onClick={() => void resume(false)} />
      </Group>
    </Sheet>
  );
}
