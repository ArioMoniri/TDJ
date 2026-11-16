"use client";
import { Gauge } from "lucide-react";
import { useState } from "react";
import { AUTO_RANGES } from "@/lib/booth/autoMaster";
import {
  calibrate,
  clearClip,
  setAutoConfig,
  startAuto,
  startRoom,
  stopAuto,
  stopRoom,
  useLevels,
} from "@/lib/booth/levelRuntime";
import { useBooth } from "@/lib/booth/store";
import { t } from "@/lib/i18n";
import { ActionRow, Group, StepperRow, SwitchRow } from "../Form";
import { Sheet } from "../Sheet";
import { fmtDb, holdText, MeterBar, NoMeter, songLoudnessText } from "./Meter";
import "./level.css";

/**
 * 2026-11 — the levels in the Mixer, adding no height to the panel (its rows must fit its fold): the output meter, its
 * short-term loudness and the clip light sit on the group's title line (`MixerMeter`); the door to the room meter and
 * Auto master is a third button beside Mute and Talk (`MixerRoomButton`), and its sheet also says how the night's
 * normalisation reaches the room for the side playing now.
 */
export function MixerMeter() {
  const live = useLevels((s) => s.live);
  const r = useLevels((s) => s.reading);
  const external = live === "spotify" || live === "youtube";
  return (
    <span className="booth-levels-head" data-testid="ctl-levels">
      {external ? (
        <NoMeter testId="ctl-meter-na" />
      ) : (
        <>
          <MeterBar className="booth-levels-bar" testId="ctl-meter" />
          <span
            className="booth-levels-nums tabular-nums"
            data-testid="ctl-meter-nums"
            title={`${t("booth.level.short_term", { db: fmtDb(r.shortTermLufs) })} · ${t("booth.level.peak", { db: fmtDb(r.peakDb) })}`}
          >
            {t("booth.level.lufs_value", { db: fmtDb(r.shortTermLufs, 0) })}
          </span>
          <ClipLight />
        </>
      )}
    </span>
  );
}

export function MixerRoomButton() {
  const [open, setOpen] = useState(false);
  const autoOn = useLevels((s) => s.auto.enabled);
  return (
    <>
      <button
        type="button"
        className="booth-ctl-btn"
        onClick={() => setOpen(true)}
        aria-label={t("booth.level.room_and_auto")}
        title={t("booth.level.room_and_auto")}
        aria-pressed={autoOn}
        data-testid="ctl-room"
      >
        <Gauge size={20} strokeWidth={2} aria-hidden />
        <span className="booth-ctl-btn-l">
          {autoOn ? t("booth.level.auto_short") : t("booth.level.room_short")}
        </span>
      </button>
      <RoomSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function ClipLight() {
  const clip = useLevels((s) => s.reading.clip);
  return (
    <button
      type="button"
      className="booth-clip"
      data-on={clip ? "1" : "0"}
      data-testid="ctl-clip"
      disabled={!clip}
      onClick={() => clearClip()}
      aria-label={clip ? t("booth.level.clip_clear") : t("booth.level.no_clip")}
    >
      {t("booth.level.clip")}
    </button>
  );
}

/** How the per-song normalisation reaches the room for the side playing now (in plain words). */
export function NormNote() {
  const norm = useLevels((s) => s.norm);
  const song = useLevels((s) => s.song);
  const target = useBooth((s) => s.settings.loudnessTargetLUFS);
  const gain = useBooth((s) => s.current?.gainDb);
  const txt =
    norm === "graph"
      ? t("booth.level.norm_graph", { target, gain: fmtDb(gain ?? 0) })
      : norm === "sdk"
        ? t("booth.level.norm_sdk", { target })
        : norm === "spotify"
          ? t("booth.level.norm_connect")
          : t("booth.level.norm_none");
  const s = songLoudnessText(song);
  return (
    <p
      className="booth-levels-note text-caption1 text-[var(--label-2)]"
      data-testid="ctl-norm"
      data-norm={norm}
    >
      {txt}
      {s && norm !== "graph" ? ` ${s}.` : ""}
    </p>
  );
}

export function RoomSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("booth.level.room_title")}
      trailing={t("booth.level.done")}
      testId="booth-room-sheet"
    >
      <RoomControls withMeter />
    </Sheet>
  );
}

/** The room meter and Auto master (the Mixer's sheet and the phone's Mix sheet). */
export function RoomControls({ withMeter = false }: { withMeter?: boolean }) {
  const live = useLevels((s) => s.live);
  const room = useLevels((s) => s.room);
  const auto = useLevels((s) => s.auto);
  const cfg = useLevels((s) => s.cfg);
  const [spl, setSpl] = useState(75);
  const on = room.status === "on";
  const roomSub =
    room.status === "denied"
      ? t("booth.level.mic_denied")
      : room.status === "unsupported"
        ? t("booth.level.mic_unsupported")
        : room.status === "asking"
          ? t("booth.level.mic_asking")
          : t("booth.level.mic_private");
  const unit = room.calOffset === null ? t("booth.level.unit_rel") : t("booth.level.unit_spl");
  const autoWhy =
    auto.path === "none"
      ? t("booth.level.auto_no_volume")
      : auto.path === "connect"
        ? t("booth.level.auto_connect")
        : null;
  return (
    <div data-testid="booth-room">
      {withMeter && (
        <Group header={t("booth.level.now_header")}>
          <div className="cell flex-col items-stretch">
            {live === "spotify" || live === "youtube" ? (
              <NoMeter testId="mix-meter-na" />
            ) : (
              <MeterBar className="h-3" testId="mix-meter" />
            )}
            <NormNote />
          </div>
        </Group>
      )}
      <Group header={t("booth.level.room_header")} footer={t("booth.level.room_footer")}>
        <SwitchRow
          label={t("booth.level.room_meter")}
          sub={roomSub}
          checked={on || room.status === "asking"}
          onChange={(v) => (v ? void startRoom() : stopRoom())}
        />
        {on && (
          <div className="cell" data-testid="booth-room-level">
            <span className="min-w-0 flex-1">
              <span className="cell-label">{t("booth.level.room_level")}</span>
              <span className="text-footnote cell-sub block text-[var(--label-2)]">
                {t("booth.level.noise_floor", { db: fmtDb(room.noiseDb, 0), unit })}
              </span>
            </span>
            <span className="cell-value tabular-nums" data-testid="booth-room-db">
              {fmtDb(room.levelDb, 0)} {unit}
            </span>
          </div>
        )}
        {on && (
          <StepperRow
            label={t("booth.level.calibrate")}
            sub={room.calOffset === null ? t("booth.level.calibrate_sub") : t("booth.level.calibrated")}
            value={spl}
            min={40}
            max={110}
            step={1}
            unit=" dB"
            onChange={setSpl}
          />
        )}
        {on && (
          <ActionRow
            label={
              room.calOffset === null
                ? t("booth.level.calibrate_now", { db: spl })
                : t("booth.level.calibrate_clear")
            }
            onClick={() => calibrate(room.calOffset === null ? spl : null)}
          />
        )}
      </Group>
      <Group header={t("booth.level.auto_header")} footer={autoWhy ?? t("booth.level.auto_footer")}>
        <SwitchRow
          label={t("booth.level.auto_master")}
          sub={
            !on
              ? t("booth.level.auto_needs_mic")
              : auto.enabled
                ? auto.hold
                  ? t("booth.level.auto_holding", { why: holdText(auto.hold), db: fmtDb(auto.db) })
                  : t("booth.level.auto_on", { db: fmtDb(auto.db) })
                : t("booth.level.auto_off")
          }
          checked={auto.enabled}
          disabled={!on || auto.path === "none"}
          onChange={(v) => (v ? startAuto() : stopAuto())}
        />
        <StepperRow
          label={t("booth.level.max_boost")}
          value={cfg.maxBoostDb}
          {...AUTO_RANGES.maxBoostDb}
          unit=" dB"
          display={`+${cfg.maxBoostDb} dB`}
          onChange={(v) => setAutoConfig({ maxBoostDb: v })}
        />
        <StepperRow
          label={t("booth.level.rate")}
          value={cfg.rateDbPerSec}
          {...AUTO_RANGES.rateDbPerSec}
          display={t("booth.level.rate_value", { db: cfg.rateDbPerSec.toFixed(2) })}
          onChange={(v) => setAutoConfig({ rateDbPerSec: Math.round(v * 100) / 100 })}
        />
      </Group>
    </div>
  );
}
