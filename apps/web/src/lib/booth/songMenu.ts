"use client";
import { t } from "../i18n";
import type { SongMenuSpec } from "../songMenu";
import { toast } from "../toast";
import type { Song } from "../types";
import { useBooth } from "./store";

/**
 * 2026-11 — the song menu of a Booth row (the set list, Up Next, the Now card, the Booth's search): Pre-listen in the
 * headphones (never the room), the Booth's own song sheet for the details (Play now / next / the start point on
 * top), Swap… where the place can change, Find… a file where the night needs one. Song DNA opens as the overlay
 * (lib/songOpen.ts `inBooth`): the Booth's page never leaves, so the night never stops.
 */
export function boothMenuSpec(
  i: number,
  o: { details?: () => void; swap?: () => void; find?: () => void } = {},
): SongMenuSpec {
  const b = useBooth.getState();
  const it = b.plan?.items[i];
  const e = b.entities[i];
  const song =
    it && it.kind !== "break" && it.kind !== "cortina" && e && "orchestraId" in e && "rhythm" in e
      ? (e as Song)
      : null;
  return {
    song,
    play: {
      label: t("songMenu.prelisten"),
      run: () =>
        void useBooth
          .getState()
          .prelisten({ i })
          .then((why) => {
            if (why) toast(t("booth.songSheet.can_t_pre_listen", { why }));
          }),
    },
    playFrom: false,
    details: o.details,
    swap: o.swap ? { run: o.swap } : undefined,
    find: o.find,
    noAddToTonight: true,
  };
}
