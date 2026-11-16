"use client";
import { Keyboard, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { ACTIONS, type ActionDef, resetAllBindings, useKeymap } from "@/lib/keymap";
import { isTouchDevice, needsMotionPermission, setShakeUndo, shakeOn, useShakePref } from "@/lib/shake";
import { toast } from "@/lib/toast";
import { ActionRow, Group, Row, SwitchRow, Tile } from "./Form";
import { KeyRow } from "./KeyChips";

/**
 * 2026-11 — Settings → Keyboard: every shortcut (lib/keymap.ts) with its keys on this device. Each key is a chip:
 * tap it and press the new keys, "+" adds another, ⌫ removes one, Esc cancels; a key another action holds asks
 * "Replace / Cancel", a key the browser keeps is refused with its reason; Reset puts a row's defaults back, "Reset
 * all keys" every default (components/KeyChips.tsx — the same chips as the Booth's Keyboard sheet, one store).
 * Kept in this browser only.
 */
export function KeyboardSettings() {
  const changed = useKeymap((s) => Object.keys(s.custom).length > 0);
  // (the DJ's keys are this browser's: the list renders after mount, so the server's page and the first render match)
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const group = (g: ActionDef["group"], header: string) => (
    <Group header={header} data-testid={`keyboard-${g}`}>
      {ACTIONS.filter((a) => a.group === g).map((a) => (
        <KeyRow key={a.id} action={a} testId={`key-row-${a.id}`} />
      ))}
    </Group>
  );
  return (
    <section id="settings-keyboard" className="scroll-mt-24" data-testid="settings-keyboard">
      <Group header={t("keys.header")} footer={t("keys.footer")}>
        <Row
          tile={
            <Tile color="#636366">
              <Keyboard size={16} strokeWidth={2} />
            </Tile>
          }
          label={t("keys.intro")}
          sub={t("keys.intro_sub")}
        />
      </Group>
      {group("edit", t("keys.group_edit"))}
      {ready && <ShakeGroup />}
      {group("booth", t("keys.group_booth"))}
      <Group>
        <ActionRow
          label={t("keys.reset_all")}
          tip={t("keys.reset_all_tip")}
          destructive
          disabled={!ready || !changed}
          onClick={() => {
            resetAllBindings();
            toast(t("keys.reset_all_done"));
          }}
          id="keys-reset-all"
        />
      </Group>
    </section>
  );
}

/**
 * 2026-11 — Shake to Undo (lib/shake.ts): on a phone or a tablet only, on by default; on iOS turning it on asks for
 * motion (this tap is the gesture iOS needs), and the switch reads on only once it is granted
 */
function ShakeGroup() {
  const pref = useShakePref();
  if (!isTouchDevice() && !needsMotionPermission()) return null;
  return (
    <Group header={t("shake.header")} footer={t("shake.footer")} data-testid="settings-shake">
      <SwitchRow
        tile={
          <Tile color="#ff9500">
            <Smartphone size={16} strokeWidth={2} />
          </Tile>
        }
        label={t("shake.switch")}
        sub={t("shake.switch_sub")}
        checked={shakeOn(pref)}
        onChange={(on) =>
          void setShakeUndo(on).then((r) => {
            if (r === "denied") toast(t("shake.denied"));
          })
        }
      />
    </Group>
  );
}
