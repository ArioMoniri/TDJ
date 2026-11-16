"use client";
import { BatteryCharging, Leaf } from "lucide-react";
import { useEffect } from "react";
import { Group, SegmentedRow, Tile } from "@/components/Form";
import type { MenuItem } from "@/components/Menu";
import { boothKeepAwake, useBooth } from "@/lib/booth/store";
import { t } from "@/lib/i18n";
import {
  idleAfter,
  type PowerMode,
  type SaverReason,
  tellNative,
  usePower,
  useSaving,
  watchPowerSignals,
} from "@/lib/power";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import "./power.css";

/**
 * 2026-11 — Battery saver's face (the mode and its helpers: lib/power.ts). `PowerSync` (once, in the root layout)
 * reads the device, puts `power-saver` on <html> (power.css: solid materials, still decorations, off-screen cards
 * skipped) and does the saver's few page-wide jobs; `PowerSaverGroup` is Settings → General; `PowerLeaf` sits in the
 * Booth's status chip; `usePowerMenuItem` is the Booth's More sheet toggle.
 */

const pct = (v: number | null) => (v === null ? "–" : String(Math.round(v * 100)));

/** why the saver is on, in words ("Low Power Mode is on", "on battery at 24 %") */
export function reasonText(r: SaverReason, level: number | null): string {
  switch (r) {
    case "manual":
      return t("power.reason_manual");
    case "low-power-mode":
      return t("power.reason_low_power_mode");
    case "thermal":
      return t("power.reason_thermal");
    case "battery-low":
      return t("power.reason_battery_low", { pct: pct(level) });
    case "battery-unplugged":
      return t("power.reason_battery_unplugged", { pct: pct(level) });
    default:
      return "";
  }
}

export function PowerSync() {
  const active = useSaving();
  useEffect(() => watchPowerSignals(), []);
  useEffect(() => {
    document.documentElement.classList.toggle("power-saver", active);
    tellNative(active);
    if (!active) {
      // back to the night's own rule: the screen stays awake from Start to the end
      boothKeepAwake(true);
      return;
    }
    const offs: Array<() => void> = [];
    // the search worker goes after two quiet minutes (lib/localSearch.ts)
    void import("@/lib/localSearch").then((m) => idleAfter("search", 120_000, m.suspendLocalSearch));
    // a room is read every 30 s while saving; the DJ's own edits go out at once
    let push: ReturnType<typeof setTimeout> | null = null;
    offs.push(
      useStore.subscribe((s, p) => {
        if (s.playlist === p.playlist) return;
        if (push) clearTimeout(push);
        push = setTimeout(() => void import("@/lib/rooms").then((m) => m.roomPushNow()), 1000);
      }),
      () => push && clearTimeout(push),
    );
    // the screen awake only while the night plays
    const wake = () => {
      const b = useBooth.getState();
      boothKeepAwake(b.state === "playing" || b.state === "cortina" || b.state === "armed");
    };
    wake();
    offs.push(useBooth.subscribe((s, p) => s.state !== p.state && wake()));
    // the room microphone and Auto master are off: they read the microphone ten times a second, all night
    let live = true;
    void import("@/lib/booth/levelRuntime").then((m) => {
      if (!live) return;
      const check = () => {
        const l = m.useLevels.getState();
        if (l.room.status !== "on" && !l.auto.enabled) return;
        m.stopRoom();
        toast(t("power.room_off"));
      };
      check();
      offs.push(
        m.useLevels.subscribe((s, p) => (s.room.status !== p.room.status || s.auto !== p.auto) && check()),
      );
    });
    return () => {
      live = false;
      for (const f of offs) f();
    };
  }, [active]);
  return null;
}

/** Settings → General → Battery saver: Off / Auto / On, and what it is doing now */
export function PowerSaverGroup() {
  const mode = usePower((s) => s.mode);
  const active = usePower((s) => s.active);
  const reason = usePower((s) => s.reason);
  const level = usePower((s) => s.signals.batteryLevel);
  const charging = usePower((s) => s.signals.charging);
  const from = usePower((s) => s.from);
  const setMode = usePower((s) => s.setMode);
  const now = active
    ? t("power.saving_now", { why: reasonText(reason, level) })
    : mode === "off"
      ? t("power.not_saving_off")
      : t("power.not_saving");
  const battery =
    level === null
      ? from === null
        ? t("power.no_battery_reading")
        : null
      : charging
        ? t("power.battery_charging", { pct: pct(level) })
        : t("power.battery_level", { pct: pct(level) });
  return (
    <Group header={t("power.header")} footer={t("power.footer")} data-testid="settings-power">
      <SegmentedRow<PowerMode>
        label={t("power.label")}
        tip={t("power.tip")}
        tips={{ off: t("power.tip_off"), auto: t("power.tip_auto"), on: t("power.tip_on") }}
        value={mode}
        items={[
          ["off", t("power.off")],
          ["auto", t("power.auto")],
          ["on", t("power.on")],
        ]}
        onChange={setMode}
        sub={
          <span data-testid="power-state" data-active={active ? "1" : "0"}>
            {now}
            {battery ? ` · ${battery}` : ""}
          </span>
        }
        tile={
          <Tile color="#34c759">
            {active ? <Leaf size={16} strokeWidth={2} /> : <BatteryCharging size={16} strokeWidth={2} />}
          </Tile>
        }
      />
    </Group>
  );
}

/** the Booth's status chip: a small leaf while saving */
export function PowerLeaf() {
  const active = useSaving();
  if (!active) return null;
  return (
    <Leaf
      size={12}
      strokeWidth={2.25}
      className="power-leaf"
      role="img"
      aria-label={t("power.leaf")}
      data-testid="power-leaf"
    />
  );
}

/** the Booth's More sheet: one tap turns the saver on (or off, whatever Auto had decided) */
export function usePowerMenuItem(): MenuItem {
  const mode = usePower((s) => s.mode);
  const active = usePower((s) => s.active);
  const reason = usePower((s) => s.reason);
  const level = usePower((s) => s.signals.batteryLevel);
  const setMode = usePower((s) => s.setMode);
  return {
    label: t("power.label"),
    icon: Leaf,
    checked: active,
    testId: "booth-menu-power",
    subtitle: active
      ? mode === "auto"
        ? t("power.menu_auto_on", { why: reasonText(reason, level) })
        : t("power.menu_on")
      : mode === "auto"
        ? t("power.menu_auto_off")
        : t("power.menu_off"),
    onClick: () => setMode(active ? "off" : "on"),
  };
}
