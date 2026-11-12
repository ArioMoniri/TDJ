"use client";
import { CORTINA_EDIT_RANGES } from "@tdj/core";
import { useEffect, useRef, useState } from "react";
import { STOP_NOW_SEC, TRANSPORT_RANGES } from "@/lib/booth/engine";
import { BOOTH_RANGES, durationLabel } from "@/lib/booth/plan";
import { useBooth } from "@/lib/booth/store";
import { ActionRow, Group, Row, StepperRow, SwitchRow } from "../Form";
import { Sheet } from "../Sheet";
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

/**
 * Mix (round 20; was Levels, round8-ux.md §1.5): what the DJ does to the sound right now (pause, fade out now, next
 * with crossfade, hold after this song, end the tanda, talk-over), the two faders, and the night's fade lengths.
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
  const kind = useBooth((s) => s.plan?.items[s.planIndex]?.kind);
  const act = useBooth.getState();
  const live = state === "playing" || state === "cortina";
  const set = act.setSettings;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Mix"
      trailing="Done"
      detents={["medium", "large"]}
      testId="booth-levels-sheet"
    >
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
      <Group footer="The cortina fader scales every cortina; the master is the room level. ↑ / ↓ move the cortina fader from the keyboard, m mutes.">
        <div className="cell">
          <Fader
            label="Cortina"
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
        <div className="cell">
          <Fader
            label="Master"
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
      </Group>
      <Group
        header="Fades"
        footer="Song end fade is 0 by default: dancers dislike faded tango sides. Cortina fades and the gap re-time the night (also while it plays); each cortina can have its own in the set list. Saved on this device."
      >
        <StepperRow
          label="Pause / resume fade"
          value={settings.pauseFadeSec}
          unit=" s"
          {...TRANSPORT_RANGES.pauseFadeSec}
          onChange={(v) => set({ pauseFadeSec: Math.round(v * 10) / 10 })}
        />
        <StepperRow
          label="Fade out now"
          value={settings.fadeNowSec}
          unit=" s"
          {...TRANSPORT_RANGES.fadeNowSec}
          onChange={(v) => set({ fadeNowSec: v })}
        />
        <StepperRow
          label="Crossfade"
          value={settings.crossfadeSec}
          unit=" s"
          {...TRANSPORT_RANGES.crossfadeSec}
          onChange={(v) => set({ crossfadeSec: v })}
        />
        <StepperRow
          label="Fade out and stop"
          value={settings.stopFadeSec}
          unit=" s"
          {...TRANSPORT_RANGES.stopFadeSec}
          onChange={(v) => set({ stopFadeSec: v })}
        />
        <StepperRow
          label="Song end fade"
          value={settings.songFadeOutSec}
          unit=" s"
          {...TRANSPORT_RANGES.songFadeOutSec}
          onChange={(v) => set({ songFadeOutSec: v })}
        />
        <StepperRow
          label="Cortina fade-in"
          value={settings.cortinaFadeInSec}
          unit=" s"
          {...BOOTH_RANGES.cortinaFadeInSec}
          onChange={(v) => set({ cortinaFadeInSec: v })}
        />
        <StepperRow
          label="Cortina fade-out"
          value={settings.cortinaFadeOutSec}
          unit=" s"
          {...BOOTH_RANGES.cortinaFadeOutSec}
          onChange={(v) => set({ cortinaFadeOutSec: v })}
        />
        <StepperRow
          label="Gap between items"
          value={settings.gapSec}
          unit=" s"
          {...BOOTH_RANGES.gapSec}
          onChange={(v) => set({ gapSec: v })}
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
  // Enter = "Fade out and stop": the focus lands on it once the sheet is up (the sheet's own focus goes to its
  // first control, the close button)
  useEffect(() => {
    if (!open) return;
    const focus = () => gentle.current?.focus({ preventScroll: true });
    const ts = [0, 50, 120].map((ms) => setTimeout(focus, ms));
    return () => {
      for (const t of ts) clearTimeout(t);
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
