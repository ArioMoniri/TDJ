"use client";
import {
  Airplay,
  Bluetooth,
  Cable,
  CircleCheck,
  Headphones,
  Info,
  Laptop,
  Layers,
  Monitor,
  SlidersHorizontal,
  Speaker,
  TriangleAlert,
  Usb,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { beforeTheNight, type Check, platformOf } from "@/lib/booth/beforeNight";
import { CUE_ON_ROOM, roomSinkSupported, sinkSupported } from "@/lib/booth/cue";
import { outputsModel, roomOf, useAudio } from "@/lib/booth/guard";
import { setSystemOutput, showRoutePicker } from "@/lib/booth/nativeAudio";
import {
  chainOf,
  describeOutput,
  type OutputInfo,
  type OutputKind,
  pairLabel,
  pairsOf,
  TRIM_RANGE,
} from "@/lib/booth/outputs";
import { isAppleMobile } from "@/lib/booth/sources/spotify";
import { useBooth } from "@/lib/booth/store";
import { t } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { ActionRow, Group, PickerRow, SegmentedRow, SliderRow } from "../Form";
import { useSpotifyRoomName } from "./SpotifyRoom";

/**
 * 2026-11 (Part B: "see those settings, also if traceable, the connection and chain, and set them"). The outputs as
 * T-DJ sees them — kind (built-in, the 3.5 mm jack, USB / USB-C, Bluetooth, AirPlay, HDMI / DisplayPort), channels,
 * sample rate, latency — which one is ROOM and which HEADPHONES, the chain in one line with its warnings, a DJ
 * controller's channel pairs, a second speaker set with a delay trim, and what happens when the output disconnects.
 * In the Booth's ROOM / HEADPHONES sheet (`compact`) and in Settings → Booth → Audio (everything).
 */
const ICON: Record<OutputKind, typeof Speaker> = {
  "built-in": Laptop,
  headphones: Headphones,
  line: Cable,
  usb: Usb,
  interface: SlidersHorizontal,
  bluetooth: Bluetooth,
  airplay: Airplay,
  hdmi: Monitor,
  displayport: Monitor,
  thunderbolt: Cable,
  multi: Layers,
  aggregate: Layers,
  virtual: Layers,
  unknown: Speaker,
};

type Env = "web" | "mac" | "ios";
function useEnv(): { env: Env; mobile: boolean } {
  const native = useAudio((s) => s.native);
  const [mobile, setMobile] = useState(false);
  useEffect(() => setMobile(isAppleMobile()), []);
  const env: Env = native ? (native.platform === "macos" ? "mac" : "ios") : "web";
  return { env, mobile: mobile || env === "ios" };
}

/** The outputs, the room / headphones / second room output, and the chain — one hook for both views. */
export function useOutputs() {
  const outputs = useBooth((s) => s.outputs);
  const native = useAudio((s) => s.native);
  const roomCtx = useAudio((s) => s.roomCtx);
  const routing = useAudio((s) => s.routing);
  const connect = useSpotifyRoomName();
  const onlySpotify = useBooth(
    (s) =>
      s.sources.includes("spotify") &&
      !s.sources.some((x, i) => (x === "file" || x === "preview") && s.plan?.items[i]?.kind !== "break"),
  );
  const { env, mobile } = useEnv();
  return useMemo(() => {
    const list = outputsModel({ native, roomCtx }, { devices: outputs.devices, room: outputs.room });
    const roomId = native ? (native.outputs.find((o) => o.isDefault)?.id ?? "") : outputs.room;
    const room = roomOf(list, roomId);
    const cue =
      outputs.cue && outputs.cue !== CUE_ON_ROOM ? (list.find((o) => o.id === outputs.cue) ?? null) : null;
    const mirror = routing.mirror ? (list.find((o) => o.id === routing.mirror) ?? null) : null;
    const chain = chainOf({
      room,
      cue,
      mirror,
      routing: outputs.cue === CUE_ON_ROOM ? routing : { ...routing, cuePair: null },
      mobile,
      connect: connect && onlySpotify ? connect : null,
    });
    return { list, room, cue, mirror, chain, routing, env, mobile, outputs };
  }, [native, roomCtx, outputs, routing, connect, onlySpotify, env, mobile]);
}

function Badge({ children, tone }: { children: ReactNode; tone: "room" | "cue" | "plain" }) {
  const color = tone === "room" ? "var(--room)" : tone === "cue" ? "var(--cue)" : "var(--label-2)";
  return (
    <span
      className="text-caption2 rounded-full border px-1.5 py-px font-semibold tracking-wide"
      style={{ color, borderColor: color }}
    >
      {children}
    </span>
  );
}

/** One output: its kind's glyph, its name, what is known, and the roles it has tonight. */
function OutputRow({ o, roles, onPick }: { o: OutputInfo; roles: string[]; onPick?: () => void }) {
  const Icon = ICON[o.kind];
  const body = (
    <>
      <Icon size={18} strokeWidth={2} className="shrink-0 text-[var(--label-2)]" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="cell-label block break-words">{o.label}</span>
        <span className="text-footnote cell-sub block text-[var(--label-2)]" data-testid="booth-output-facts">
          {describeOutput(o)}
        </span>
      </span>
      {/* (a phone: the role badges stack instead of squeezing the name) */}
      <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row">
        {roles.map((r) => (
          <Badge key={r} tone={r === "room" || r === "room2" ? "room" : "cue"}>
            {r === "room"
              ? t("booth.outputs.room")
              : r === "room2"
                ? `${t("booth.outputs.room")} 2`
                : t("booth.outputs.headphones")}
          </Badge>
        ))}
      </span>
    </>
  );
  const common = {
    "data-testid": "booth-output-info",
    "data-kind": o.kind,
    "data-device": o.id,
    "data-roles": roles.join(" "),
  };
  return onPick ? (
    <button type="button" className="cell cell-tap w-full text-left" onClick={onPick} {...common}>
      {body}
    </button>
  ) : (
    <div className="cell" {...common}>
      {body}
    </div>
  );
}

/** The headphones chip when they are the room device's other pair: "DDJ-400 · ch 3–4" */
export function cuePairLabel(): string {
  const r = useAudio.getState().routing;
  const b = useBooth.getState().outputs;
  const name = b.devices.find((d) => d.id === b.room)?.label ?? t("booth.playerToolbar.this_device");
  return r.cuePair !== null ? `${name} · ${pairLabel(r.cuePair)}` : name;
}

/** The chain in one line, with its warnings under it. */
export function ChainLine({
  line,
  warnings,
}: {
  line: string;
  warnings: Array<{ id: string; text: string }>;
}) {
  return (
    <>
      <div className="cell items-start" data-testid="booth-chain">
        <Cable
          size={16}
          strokeWidth={2}
          className="mt-0.5 shrink-0 text-[var(--label-2)]"
          aria-label={t("booth.outputs.chain")}
          role="img"
        />
        <span className="text-subhead min-w-0 flex-1 break-words font-medium">{line}</span>
      </div>
      {warnings.map((w) => (
        <div
          key={w.id}
          className="cell items-start"
          data-testid="booth-chain-warn"
          data-id={w.id}
          role="note"
        >
          <TriangleAlert
            size={16}
            strokeWidth={2}
            className="mt-0.5 shrink-0 text-[var(--system-gold)]"
            aria-hidden
          />
          <span className="text-footnote min-w-0 flex-1 text-[var(--label)]">{w.text}</span>
        </div>
      ))}
    </>
  );
}

/** A controller / interface with ≥ 4 channels: which pair is the room and which the headphones. */
function PairsRows() {
  const { room, routing, outputs } = useOutputs();
  const setRouting = useAudio((s) => s.setRouting);
  const pairs = pairsOf(room?.channels);
  if (pairs < 2) return null;
  const mapped = outputs.cue === CUE_ON_ROOM && routing.cuePair !== null;
  const cueItems: Array<[string, string]> = [["sep", t("booth.outputs.cue_separate")]];
  for (let p = 0; p < pairs; p++) if (p !== routing.roomPair) cueItems.push([String(p), pairLabel(p)]);
  const roomItems: Array<[string, string]> = Array.from({ length: pairs }, (_, p) => [
    String(p),
    pairLabel(p),
  ]);
  const pickCue = (v: string) => {
    const pair = v === "sep" ? null : Number(v);
    void setRouting({ cuePair: pair }).then(() => {
      const b = useBooth.getState();
      if (pair !== null) b.setCueOutput(CUE_ON_ROOM);
      else if (b.outputs.cue === CUE_ON_ROOM) b.setCueOutput(null);
    });
  };
  return (
    <>
      {pairs > 2 && (
        <PickerRow
          label={t("booth.outputs.room_on")}
          value={String(routing.roomPair)}
          items={roomItems}
          onChange={(v) => v !== undefined && void setRouting({ roomPair: Number(v) })}
        />
      )}
      {cueItems.length <= 3 ? (
        <SegmentedRow
          label={t("booth.outputs.headphones_on")}
          value={mapped ? String(routing.cuePair) : "sep"}
          items={cueItems}
          onChange={pickCue}
        />
      ) : (
        <PickerRow
          label={t("booth.outputs.headphones_on")}
          value={mapped ? String(routing.cuePair) : "sep"}
          items={cueItems}
          onChange={(v) => pickCue(v ?? "sep")}
        />
      )}
    </>
  );
}

/** The booth sheet's part: the chain, its warnings, the controller's pairs (ROOM / HEADPHONES sheet). */
export function OutputChainGroup() {
  const { chain, env } = useOutputs();
  useRefreshOnMount();
  return (
    <Group
      header={t("booth.outputs.chain_header")}
      footer={env === "ios" ? t("booth.outputs.ios_routes") : undefined}
      data-testid="booth-chain-group"
    >
      <ChainLine line={chain.line} warnings={chain.warnings} />
      <PairsRows />
      {env === "ios" && (
        <ActionRow label={t("booth.outputs.route_picker")} onClick={() => void showRoutePicker()} />
      )}
    </Group>
  );
}

function useRefreshOnMount() {
  useEffect(() => {
    // (Settings: the booth may never have listed the outputs; the Booth's sheet: a fresh list costs nothing)
    void useBooth
      .getState()
      .refreshOutputs()
      .then(() => useAudio.getState().refresh(useBooth.getState().outputs.room));
  }, []);
}

/** Settings → Booth → Audio: every output, the chain, the pairs, a second speaker set, the disconnect choice. */
export function BoothAudioSettings() {
  const { list, room, cue, mirror, chain, routing, env, outputs } = useOutputs();
  const setRouting = useAudio((s) => s.setRouting);
  const mirrorSupported = useAudio((s) => s.mirrorSupported);
  const result = useAudio((s) => s.result);
  const policy = useStore((s) => s.settings.boothOutputLoss ?? "pause");
  const setSettings = useStore((s) => s.setSettings);
  useRefreshOnMount();
  const roles = (o: OutputInfo) => {
    const r: string[] = [];
    if (room && o.id === room.id) r.push("room");
    if (mirror && o.id === mirror.id) r.push("room2");
    if ((cue && o.id === cue.id) || (outputs.cue === CUE_ON_ROOM && room && o.id === room.id)) r.push("cue");
    return r;
  };
  const multi = list.find((o) => o.kind === "multi");
  const others = list.filter((o) => room && o.id !== room.id && !(cue && o.id === cue.id));
  // (the browser's abilities after mount: the server render knows none, the first client render must match it)
  const [caps, setCaps] = useState({ roomSink: false, sink: false, mac: false });
  useEffect(
    () =>
      setCaps({
        roomSink: roomSinkSupported(),
        sink: sinkSupported(),
        mac: platformOf(navigator.userAgent) === "mac",
      }),
    [],
  );
  const footer =
    env === "mac"
      ? t("booth.outputs.source_mac")
      : env === "ios"
        ? t("booth.outputs.source_ios")
        : caps.roomSink
          ? t("booth.outputs.source_web")
          : t("booth.outputs.source_safari");
  const canPick = env === "mac" || (env === "web" && caps.roomSink);
  return (
    <>
      <Group header={t("booth.outputs.header")} footer={footer} data-testid="settings-booth-audio">
        {list.map((o) => (
          <OutputRow
            key={o.id}
            o={o}
            roles={roles(o)}
            onPick={
              canPick && !(room && o.id === room.id)
                ? () =>
                    void (env === "mac"
                      ? setSystemOutput(o.id).then(() => useAudio.getState().refresh())
                      : useBooth.getState().setRoomOutput(o.id))
                : undefined
            }
          />
        ))}
        {env === "web" && !outputs.named && caps.sink && (
          <ActionRow
            label={t("booth.playerToolbar.show_device_names")}
            onClick={() => void useBooth.getState().refreshOutputs(true)}
          />
        )}
        {env === "ios" && (
          <ActionRow label={t("booth.outputs.route_picker")} onClick={() => void showRoutePicker()} />
        )}
      </Group>

      <Group header={t("booth.outputs.chain_header")} footer={t("booth.outputs.pairs_footer")}>
        <ChainLine line={chain.line} warnings={chain.warnings} />
        <PairsRows />
        {result?.limits.includes("channels") && (
          <div className="cell text-footnote text-[var(--label-2)]">
            {t("booth.outputs.channels_limited")}
          </div>
        )}
      </Group>

      <Group
        header={t("booth.outputs.two_sets")}
        footer={
          mirrorSupported
            ? t("booth.outputs.two_sets_web")
            : env === "mac" || caps.mac
              ? multi
                ? t("booth.outputs.multi_found", { name: multi.label })
                : t("booth.outputs.two_sets_mac")
              : t("booth.outputs.two_sets_none")
        }
        data-testid="settings-booth-mirror"
      >
        {mirrorSupported ? (
          <PickerRow
            label={t("booth.outputs.second_output")}
            value={routing.mirror ?? "none"}
            items={[
              ["none", t("booth.outputs.none")],
              ...others.map((o) => [o.id, o.label] as [string, string]),
            ]}
            onChange={(v) => void setRouting({ mirror: !v || v === "none" ? null : v })}
          />
        ) : (
          <div className="cell text-[var(--label-2)]">
            <Info size={16} strokeWidth={2} aria-hidden />
            <span className="text-footnote min-w-0 flex-1">{t("booth.outputs.one_output_here")}</span>
          </div>
        )}
        {[room, mirror]
          .filter((o): o is OutputInfo => !!o)
          .map((o) =>
            mirror ? (
              <SliderRow
                key={o.id}
                // (the value in the label: the row's value cell is narrow next to a device name)
                label={`${o.label} · +${routing.trimMs[o.id] ?? 0} ms`}
                tip={t("booth.outputs.trim", { name: o.label })}
                value={routing.trimMs[o.id] ?? 0}
                display={null}
                min={TRIM_RANGE.min}
                max={TRIM_RANGE.max}
                step={TRIM_RANGE.step}
                onChange={(v) => void setRouting({ trimMs: { ...routing.trimMs, [o.id]: v } })}
              />
            ) : null,
          )}
      </Group>

      <Group header={t("booth.outputs.disconnect")} footer={t("booth.outputs.disconnect_footer")}>
        <SegmentedRow
          label={t("booth.outputs.if_disconnects")}
          value={policy}
          items={[
            ["pause", t("booth.outputs.disconnect_pause")],
            ["continue", t("booth.outputs.disconnect_continue")],
          ]}
          onChange={(v) => setSettings({ boothOutputLoss: v })}
        />
      </Group>
      <BeforeTheNight roomKind={room?.kind ?? null} />
    </>
  );
}

/** "Before the night": what the app checks, and what only the DJ can set. */
export function BeforeTheNight({ roomKind }: { roomKind: OutputKind | null }) {
  const native = useAudio((s) => s.native);
  const [battery, setBattery] = useState<{ charging: boolean; level: number } | null>(null);
  const [list, setList] = useState<Check[]>([]);
  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ charging: boolean; level: number }> };
    void nav.getBattery?.().then(
      (b) => setBattery({ charging: b.charging, level: b.level }),
      () => {},
    );
  }, []);
  useEffect(() => {
    setList(
      beforeTheNight({
        platform: platformOf(navigator.userAgent, navigator.maxTouchPoints, native?.platform),
        battery,
        wakeLock: "wakeLock" in navigator,
        roomKind,
        native: !!native,
      }),
    );
  }, [battery, roomKind, native]);
  return (
    <Group
      header={t("booth.before.header")}
      footer={t("booth.before.footer")}
      data-testid="booth-before-night"
    >
      {list.map((c) => (
        <div
          key={c.id}
          className="cell items-start"
          data-testid="booth-before-item"
          data-id={c.id}
          data-status={c.status}
        >
          {c.status === "ok" ? (
            <CircleCheck
              size={16}
              strokeWidth={2}
              className="mt-0.5 shrink-0 text-[var(--system-green)]"
              aria-hidden
            />
          ) : c.status === "warn" ? (
            <TriangleAlert
              size={16}
              strokeWidth={2}
              className="mt-0.5 shrink-0 text-[var(--system-gold)]"
              aria-hidden
            />
          ) : (
            <Info size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-[var(--label-2)]" aria-hidden />
          )}
          <span className="text-footnote min-w-0 flex-1">
            {c.text}
            {c.help && (
              <>
                {" "}
                <a
                  className="text-[var(--tint-text)] underline"
                  href={c.help.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  {c.help.label}
                </a>
              </>
            )}
          </span>
        </div>
      ))}
    </Group>
  );
}
