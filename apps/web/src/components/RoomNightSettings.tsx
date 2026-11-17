"use client";
import {
  BUILTIN_CORTINAS,
  CLOSING_FORMATS,
  type ClosingFormat,
  closingFormatOf,
  cumparsitaPlacement,
  type NightSettingsPatch,
} from "@tdj/core";
import { useMemo, useState } from "react";
import { recordSnapshot, undoEdit } from "@/lib/editHistory";
import { haptic } from "@/lib/haptics";
import { fmtNumber, lazy, t } from "@/lib/i18n";
import type { MsgKey } from "@/lib/i18n/en";
import { spotCall } from "@/lib/spot";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { Playlist } from "@/lib/types";
import { Group, MultiPickerRow, PickerRow, Row, SegmentedRow, SwitchRow } from "./Form";
import { Sheet } from "./Sheet";

const CULTURES: Array<[string, string]> = lazy(() => [
  ["global", t("composer.global")],
  ["latin", t("composer.latin")],
  ["french", t("composer.french")],
  ["italian", t("composer.italian")],
  ["brazilian", t("composer.brazilian")],
  ["turkish", t("composer.turkish")],
  ["greek", t("composer.greek")],
  ["persian", t("composer.persian")],
  ["balkan", t("composer.balkan")],
  ["arabic", t("composer.arabic")],
  ["kpop", "K-pop"],
  ["afrobeats", "Afrobeats"],
]);
const PATTERNS: Array<[NonNullable<NightSettingsPatch["pattern"]>, string]> = lazy(() => [
  ["classic", t("composer.classic_ttvttm")],
  ["TTVTTM-strict", t("composer.strict_ttvttm")],
  ["TVTM", "TVTM"],
  ["TMTV", "TMTV"],
  ["tango-only", t("composer.tango_only")],
]);
const FORMAT: Record<ClosingFormat, MsgKey> = {
  "after-cortina": "settings.night.format.after-cortina",
  straight: "settings.night.format.straight",
  "in-tanda": "settings.night.format.in-tanda",
  "own-tanda": "settings.night.format.own-tanda",
  none: "settings.night.format.none",
};
const LENGTHS = Array.from({ length: 15 }, (_, i) => 20 + i * 5);
const FADES = [3, 3.5, 4, 4.5, 5, 5.5, 6];
/** the cortina families the pool has (its genres), most cues first */
const GENRES = lazy(() => {
  const n = new Map<string, number>();
  for (const c of BUILTIN_CORTINAS) if (c.genre) n.set(c.genre, (n.get(c.genre) ?? 0) + 1);
  return [...n.entries()]
    .filter(([, k]) => k >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([g]) => g);
});

/**
 * 2026-11 (the owner: rooms — "a Night settings sheet: owner edits, guests read-only"). The room's night: its cortina
 * culture and genre, their length and fade, Auto or a pick per tanda, the rhythm cycle, the last four tandas tango,
 * the closing format and the opening La Cumparsita. A change goes through the engine (POST /api/spot `settings` →
 * core applyNightSettings: the cortinas re-mended), is one entry of the undo history, and reaches every DJ through the
 * room's sync (lib/rooms.ts sends the changed settings and tandas).
 */
export function RoomNightSettings({
  open,
  onClose,
  canEdit,
}: {
  open: boolean;
  onClose: () => void;
  /** the room's owner edits; a guest reads */
  canEdit: boolean;
}) {
  const playlist = useStore((s) => s.playlist);
  const setPlaylist = useStore((s) => s.setPlaylist);
  const recordNightEdit = useStore((s) => s.recordNightEdit);
  const [busy, setBusy] = useState(false);
  const o = playlist?.options;
  const rules = o?.rules ?? {};
  const fmt = o ? closingFormatOf({ rules, closeWithCumparsita: o.closeWithCumparsita }) : "straight";
  const place = o ? cumparsitaPlacement({ rules, closeWithCumparsita: o.closeWithCumparsita }) : null;
  const len = o?.cortinaLengthSec ?? 45;
  const fade = playlist?.booth?.settings.cortinaFadeOutSec ?? 4;
  const cultures = o?.cortinaCultures?.length ? o.cortinaCultures : ["global"];
  const genre = o?.cortinaGenres?.[0] ?? "any";
  const choice = o?.cortinaChoice ?? "auto";
  const pattern = (o?.pattern === "custom" ? "classic" : (o?.pattern ?? "classic")) as NonNullable<
    NightSettingsPatch["pattern"]
  >;
  const genres = useMemo<Array<[string, string]>>(
    () => [["any", t("roomSettings.any_genre")], ...GENRES.map((g) => [g, g] as [string, string])],
    [],
  );

  const change = async (patch: NightSettingsPatch, label: string) => {
    const before = useStore.getState().playlist;
    if (!before || !canEdit || busy) return;
    setBusy(true);
    haptic(4);
    try {
      const r = await spotCall("settings", { playlist: before, patch });
      const { changed, reason: _r, ...after } = r.json as Playlist & { changed?: boolean; reason?: string };
      if (!r.ok || !changed) {
        toast(t("spot.not_applied"));
        return;
      }
      const next = after as Playlist;
      setPlaylist(next);
      recordNightEdit(next, label, "swap");
      recordSnapshot(label, before, next, setPlaylist);
      toast(label, () => void undoEdit());
    } finally {
      setBusy(false);
    }
  };
  const said = (what: string, value: string) => t("roomSettings.changed", { what, value });

  const ro = (label: string, value: string, testId: string) => (
    <Row label={label} value={value} data-testid={testId} />
  );

  return (
    <Sheet
      open={open && !!playlist}
      onClose={onClose}
      title={t("roomSettings.title")}
      detents={["large"]}
      testId="room-night-settings"
    >
      {playlist && o && (
        <>
          {!canEdit && (
            <p className="section-foot" data-testid="room-settings-readonly">
              {t("roomSettings.read_only")}
            </p>
          )}
          <Group header={t("roomSettings.cortinas")} footer={t("roomSettings.cortinas_footer")}>
            {canEdit ? (
              <MultiPickerRow
                label={t("composer.cultures")}
                values={cultures}
                items={CULTURES}
                min={1}
                onChange={(v) =>
                  void change(
                    { cortinaCultures: v.length ? v : ["global"] },
                    said(
                      t("composer.cultures"),
                      v.map((k) => CULTURES.find(([c]) => c === k)?.[1] ?? k).join(", "),
                    ),
                  )
                }
              />
            ) : (
              ro(
                t("composer.cultures"),
                cultures.map((k) => CULTURES.find(([c]) => c === k)?.[1] ?? k).join(", "),
                "room-settings-cultures",
              )
            )}
            <PickerRow
              label={t("roomSettings.genre")}
              ariaLabel={t("roomSettings.genre")}
              value={genre}
              items={genres}
              disabled={!canEdit || busy}
              onChange={(g) =>
                g &&
                void change(
                  { cortinaGenres: g === "any" ? [] : [g] },
                  said(t("roomSettings.genre"), g === "any" ? t("roomSettings.any_genre") : g),
                )
              }
            />
            <PickerRow
              label={t("roomSettings.length")}
              ariaLabel={t("roomSettings.length")}
              value={String(len)}
              items={LENGTHS.map(
                (s) => [String(s), t("roomSettings.seconds", { n: fmtNumber(s) })] as [string, string],
              )}
              disabled={!canEdit || busy}
              onChange={(v) =>
                v &&
                void change(
                  { cortinaLengthSec: Number(v) },
                  said(t("roomSettings.length"), t("roomSettings.seconds", { n: fmtNumber(Number(v)) })),
                )
              }
            />
            <PickerRow
              label={t("roomSettings.fade")}
              ariaLabel={t("roomSettings.fade")}
              value={String(fade)}
              items={FADES.map(
                (s) => [String(s), t("roomSettings.seconds", { n: fmtNumber(s) })] as [string, string],
              )}
              disabled={!canEdit || busy}
              onChange={(v) =>
                v &&
                void change(
                  { cortinaFadeOutSec: Number(v) },
                  said(t("roomSettings.fade"), t("roomSettings.seconds", { n: fmtNumber(Number(v)) })),
                )
              }
            />
            {canEdit ? (
              <SegmentedRow
                label={t("roomSettings.choice")}
                value={choice}
                items={[
                  ["auto", t("roomSettings.choice_auto")],
                  ["pick", t("roomSettings.choice_pick")],
                ]}
                onChange={(v) =>
                  void change(
                    { cortinaChoice: v },
                    said(
                      t("roomSettings.choice"),
                      v === "auto" ? t("roomSettings.choice_auto") : t("roomSettings.choice_pick"),
                    ),
                  )
                }
              />
            ) : (
              ro(
                t("roomSettings.choice"),
                choice === "auto" ? t("roomSettings.choice_auto") : t("roomSettings.choice_pick"),
                "room-settings-choice",
              )
            )}
          </Group>
          <Group header={t("roomSettings.night")} footer={t("roomSettings.night_footer")}>
            <PickerRow
              label={t("roomSettings.cycle")}
              ariaLabel={t("roomSettings.cycle")}
              value={pattern}
              items={PATTERNS}
              disabled={!canEdit || busy}
              onChange={(v) =>
                v &&
                void change(
                  { pattern: v },
                  said(t("roomSettings.cycle"), PATTERNS.find(([k]) => k === v)?.[1] ?? v),
                )
              }
            />
            <SwitchRow
              label={t("rooms.last_4_tandas_tango_only")}
              sub={t("rooms.skips_any_vals_or_milonga_among")}
              checked={!!rules.lastFourTango}
              disabled={!canEdit || busy}
              onChange={(v) =>
                void change(
                  { lastFourTango: v },
                  said(t("rooms.last_4_tandas_tango_only"), v ? t("roomSettings.on") : t("roomSettings.off")),
                )
              }
            />
            <PickerRow
              label={t("settings.night.last_cumparsita")}
              ariaLabel={t("settings.night.last_cumparsita")}
              value={fmt}
              items={CLOSING_FORMATS.map((k) => [k, t(FORMAT[k])] as [ClosingFormat, string])}
              disabled={!canEdit || busy}
              onChange={(k) =>
                k &&
                void change({ closingFormat: k }, said(t("settings.night.last_cumparsita"), t(FORMAT[k])))
              }
            />
            <SwitchRow
              label={t("settings.night.opening")}
              sub={t("settings.night.opening_sub")}
              checked={!!place?.open}
              disabled={!canEdit || busy}
              onChange={(v) =>
                void change(
                  { opening: v },
                  said(t("settings.night.opening"), v ? t("roomSettings.on") : t("roomSettings.off")),
                )
              }
            />
          </Group>
        </>
      )}
    </Sheet>
  );
}
