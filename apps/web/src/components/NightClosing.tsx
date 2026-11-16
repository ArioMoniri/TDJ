"use client";
import {
  CLOSING_FORMATS,
  type ClosingFormat,
  closingFormatOf,
  cumparsitaPlacement,
  ERA_SETTINGS,
  type NightRules,
} from "@tdj/core";
import { Disc3 } from "lucide-react";
import { t } from "@/lib/i18n";
import type { MsgKey } from "@/lib/i18n/en";
import { useStore } from "@/lib/store";
import { Group, PickerRow, SwitchRow, Tile } from "./Form";

const LABEL: Record<ClosingFormat, MsgKey> = {
  "after-cortina": "settings.night.format.after-cortina",
  straight: "settings.night.format.straight",
  "in-tanda": "settings.night.format.in-tanda",
  "own-tanda": "settings.night.format.own-tanda",
  none: "settings.night.format.none",
};
const SUB: Record<ClosingFormat, MsgKey> = {
  "after-cortina": "settings.night.format_sub.after-cortina",
  straight: "settings.night.format_sub.straight",
  "in-tanda": "settings.night.format_sub.in-tanda",
  "own-tanda": "settings.night.format_sub.own-tanda",
  none: "settings.night.format_sub.none",
};

/**
 * 2026-11 (the owner: "a setting for the last Cumparsita: as 4 + 1, with or without cortina, or other"): Settings →
 * Night → "The last La Cumparsita" and the opening La Cumparsita on / off. The choice is a night rule
 * (`rules.closingFormat`, core cumparsita.ts): the next compose, the Booth's plan and every export follow it. Unset the
 * picker shows what the era's own keys give (today: straight after the última on a golden night); a stored night keeps
 * the format it was made with.
 */
export function NightClosingGroup() {
  const options = useStore((s) => s.options);
  const setOptions = useStore((s) => s.setOptions);
  const era = (options.eras ?? ["golden"])[0] ?? "golden";
  const rules: NightRules = {
    ...(ERA_SETTINGS[era] ?? ERA_SETTINGS.golden!).rules,
    ...(options.rules ?? {}),
  };
  const o = { rules, closeWithCumparsita: options.closeWithCumparsita };
  const fmt = closingFormatOf(o);
  const place = cumparsitaPlacement(o);
  const write = (patch: Partial<NightRules>, close?: boolean) =>
    setOptions({
      rules: { ...rules, ...patch },
      ...(close !== undefined ? { closeWithCumparsita: close } : {}),
    });
  return (
    <Group
      header={t("settings.night.header")}
      footer={t("settings.night.footer")}
      data-testid="settings-night"
    >
      <PickerRow
        label={t("settings.night.last_cumparsita")}
        sub={t(SUB[fmt])}
        ariaLabel={t("settings.night.last_cumparsita")}
        value={fmt}
        items={CLOSING_FORMATS.map((k) => [k, t(LABEL[k])] as [ClosingFormat, string])}
        onChange={(k) => {
          if (!k) return;
          // the opening stays as it was; the closing is the format's
          const cumparsita = place.open ? (k === "none" ? "open" : "both") : k === "none" ? "none" : "close";
          write({ closingFormat: k, cumparsita, openWithCumparsita: undefined }, k !== "none");
        }}
        tile={
          <Tile color="#af52de">
            <Disc3 size={16} strokeWidth={2} />
          </Tile>
        }
      />
      <SwitchRow
        label={t("settings.night.opening")}
        sub={t("settings.night.opening_sub")}
        checked={place.open}
        onChange={(v) =>
          write({
            cumparsita: v ? (place.close ? "both" : "open") : place.close ? "close" : "none",
            openWithCumparsita: undefined,
          })
        }
      />
    </Group>
  );
}
