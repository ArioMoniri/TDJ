"use client";
import { Check, ChevronDown, Eye, Headphones, Speaker } from "lucide-react";
import { useState } from "react";
import { SINK_UNSUPPORTED } from "@/lib/booth/cue";
import { useBooth } from "@/lib/booth/store";
import { toast } from "@/lib/toast";
import { ActionRow, Group } from "../Form";
import { Sheet } from "../Sheet";
import { IndicatorSwitches } from "./IndicatorSwitches";

/**
 * Round 22 — the player's toolbar under the title: where the sound comes from (Spotify full tracks, files or the
 * 30 s rehearsal), where it goes (ROOM, rose, a speaker) and where the pre-listen goes (HEADPHONES, blue,
 * headphones), and Show (the indicator switches). The two outputs always carry a glyph and a word, never colour
 * alone. Without `setSinkId` (Safari) the headphones picker is hidden and its chip says why on hover / long-press.
 */
export function PlayerToolbar({ rehearsal }: { rehearsal: boolean }) {
  const outputs = useBooth((s) => s.outputs);
  const audition = useBooth((s) => s.audition);
  const [pick, setPick] = useState<"room" | "headphones" | null>(null);
  const [show, setShow] = useState(false);
  const label = (id: string | null) => outputs.devices.find((d) => d.id === id)?.label ?? "This device";
  const hearing = audition?.where === "headphones";
  return (
    <div className="booth-toolbar" data-testid="booth-toolbar">
      <SourceLine rehearsal={rehearsal} />
      <button
        type="button"
        className="booth-out"
        data-out="room"
        data-testid="booth-out-room"
        data-hint="ROOM: where the night plays for the dancers. Tap to choose the output."
        aria-label={`Room output: ${label(outputs.room)}`}
        onClick={() => setPick("room")}
      >
        <Speaker size={16} strokeWidth={2} aria-hidden />
        <span className="booth-out-word">Room</span>
        <span className="booth-out-name">{label(outputs.room)}</span>
        <ChevronDown size={14} strokeWidth={2} aria-hidden />
      </button>
      {outputs.cueSupported ? (
        <button
          type="button"
          className="booth-out"
          data-out="headphones"
          data-live={hearing || undefined}
          data-off={outputs.cue ? undefined : true}
          data-testid="booth-out-cue"
          data-hint="HEADPHONES: pre-listen here; the room never hears it. Tap to choose your headphones."
          aria-label={`Headphones output: ${outputs.cue ? label(outputs.cue) : "not set"}`}
          onClick={() => setPick("headphones")}
        >
          <Headphones size={16} strokeWidth={2} aria-hidden />
          <span className="booth-out-word">Headphones</span>
          <span className="booth-out-name">{outputs.cue ? label(outputs.cue) : "Choose…"}</span>
          <ChevronDown size={14} strokeWidth={2} aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          className="booth-out"
          data-off
          data-testid="booth-out-cue-unsupported"
          data-hint={SINK_UNSUPPORTED}
          aria-label={`Headphones pre-listen unavailable. ${SINK_UNSUPPORTED}`}
          onClick={() => toast(SINK_UNSUPPORTED)}
        >
          <Headphones size={16} strokeWidth={2} aria-hidden />
          <span className="booth-out-word">Headphones</span>
          <span className="booth-out-name">not in this browser</span>
        </button>
      )}
      <button
        type="button"
        className="booth-out"
        data-testid="booth-show"
        data-hint="Show or hide energy, BPM, key, era and artwork"
        onClick={() => setShow(true)}
      >
        <Eye size={16} strokeWidth={2} aria-hidden />
        <span>Show</span>
      </button>
      <OutputSheet which={pick} onClose={() => setPick(null)} />
      <ShowSheet open={show} onClose={() => setShow(false)} />
    </div>
  );
}

function OutputSheet({ which, onClose }: { which: "room" | "headphones" | null; onClose: () => void }) {
  const outputs = useBooth((s) => s.outputs);
  const b = useBooth.getState();
  const cur = which === "room" ? outputs.room : outputs.cue;
  const blocked = which === "headphones" ? b.cueBlocked() : null;
  return (
    <Sheet
      open={which !== null}
      onClose={onClose}
      title={which === "room" ? "Room output" : "Headphones output"}
      trailing="Done"
      testId="booth-output-sheet"
    >
      <Group
        header={which === "room" ? "Where the dancers hear the night" : "Where you pre-listen"}
        footer={
          which === "room"
            ? outputs.roomSupported
              ? "The night plays here. Changing it moves the music at once."
              : "This browser plays the night on this device's output: choose the speakers in the system's sound settings."
            : `Pick the headphones (or the interface's second output). The room never hears a pre-listen.${blocked && outputs.cue ? ` ${blocked}` : ""}`
        }
      >
        {outputs.devices.map((d) => {
          const isRoomDevice = which === "headphones" && d.id === outputs.room;
          return (
            <button
              key={d.id}
              type="button"
              className="cell cell-tap w-full text-left"
              disabled={(which === "room" && !outputs.roomSupported && d.id !== "default") || isRoomDevice}
              data-testid="booth-output"
              data-device={d.id}
              onClick={() => {
                if (which === "room") void b.setRoomOutput(d.id);
                else b.setCueOutput(d.id);
              }}
            >
              {which === "room" ? (
                <Speaker size={16} strokeWidth={2} className="text-[var(--room)]" aria-hidden />
              ) : (
                <Headphones size={16} strokeWidth={2} className="text-[var(--cue)]" aria-hidden />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{d.label}</span>
                {isRoomDevice && (
                  <span className="text-footnote block text-[var(--label-2)]">The room plays here</span>
                )}
              </span>
              {cur === d.id && (
                <Check size={18} strokeWidth={2.5} className="text-[var(--tint)]" aria-label="Chosen" />
              )}
            </button>
          );
        })}
        {which === "headphones" && outputs.cue && (
          <ActionRow label="Turn pre-listen off" onClick={() => b.setCueOutput(null)} />
        )}
      </Group>
      {!outputs.named && (
        <Group footer="Your browser names the outputs once it may use the microphone; nothing is recorded.">
          <ActionRow label="Show device names" onClick={() => void b.refreshOutputs(true)} />
        </Group>
      )}
    </Sheet>
  );
}

/** Show: the indicator switches (the same ones as Settings → Indicators) and the era legend. */
export function ShowSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Show" trailing="Done" testId="booth-show-sheet">
      <IndicatorSwitches />
    </Sheet>
  );
}

/**
 * Where the night's sound comes from, said plainly: "Spotify · full tracks" when the Premium session plays,
 * "Rehearsal · 30 s clips" otherwise with what would play the full songs.
 */
function SourceLine({ rehearsal }: { rehearsal: boolean }) {
  const sp = useBooth((s) => s.availability.spotify);
  const sources = useBooth((s) => s.sources);
  const mode = useBooth((s) => s.sourceMode);
  const started = useBooth((s) => s.started);
  const onSpotify = !rehearsal && sources.includes("spotify");
  if (!rehearsal && !onSpotify && !sp.reconnect) return null;
  return (
    <>
      <span
        className="booth-chip"
        data-testid="booth-mode"
        data-source={onSpotify ? "spotify" : "clips"}
        data-hint={
          onSpotify
            ? "Spotify Premium plays every song in full on this device"
            : "A rehearsal plays 30 s of every song so you can hear the night quickly"
        }
      >
        {onSpotify ? "Spotify · full tracks" : "Rehearsal · 30 s clips"}
      </span>
      {rehearsal && sp.ok && mode === "preview" && !started && (
        <button
          type="button"
          className="btn-plain min-h-11"
          onClick={() => void useBooth.getState().setSourceMode("file")}
          data-testid="booth-full-tracks"
        >
          Play full tracks on Spotify
        </button>
      )}
      {sp.reconnect && (
        <a
          className="btn-plain min-h-11 inline-flex items-center"
          href="/api/spotify/login?next=/booth"
          data-testid="booth-reconnect"
        >
          Reconnect Spotify to play full songs
        </a>
      )}
      {rehearsal && sp.checked && sp.premium === false && (
        <span className="text-footnote text-[var(--label-2)]">
          Spotify Free: the browser can only play 30 s clips.
        </span>
      )}
    </>
  );
}
