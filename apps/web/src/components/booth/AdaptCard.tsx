"use client";
import type { AdaptReason } from "@tdj/core";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { useAdapt } from "@/lib/booth/adapt";
import { useBooth } from "@/lib/booth/store";
import { undoEdit } from "@/lib/editHistory";
import { haptic } from "@/lib/haptics";
import { t as tx } from "@/lib/i18n";
import { gateEdit } from "@/lib/ruleCheck";
import { toast } from "@/lib/toast";
import type { Playlist } from "@/lib/types";

const yearsOf = (r: [number, number] | null) => (!r ? "" : r[0] === r[1] ? ` ${r[0]}` : ` ${r[0]}–${r[1]}`);
const reasonText = (r: AdaptReason) => {
  switch (r.kind) {
    case "energy":
      return tx("adapt.reason.energy", { n: `${r.value > 0 ? "+" : ""}${r.value}` });
    case "favourite":
      return tx("adapt.reason.favourite");
    case "known":
      return tx("adapt.reason.known");
    case "experimental":
      return tx("adapt.reason.experimental");
    case "succession":
      return tx("adapt.reason.succession");
    default:
      return "";
  }
};
const AFTER = { emptied: "adapt.after_emptied", full: "adapt.after_full", ok: "adapt.after_ok" } as const;

/**
 * 2026-11 — the Booth's suggestion card after a floor reaction (lib/booth/adapt.ts, core adapt.ts): "The floor emptied
 * after Láurenz. Next: swap Biagi for D'Arienzo 1938 (energy +8, floor favourite) · Apply · Keep". It never changes the
 * room by itself: Apply goes through the rule check and the undo history (the toast's Undo restores the night), Keep
 * closes it. Content on `surface`; the buttons are 44 pt.
 */
export function AdaptCard() {
  const s = useAdapt((x) => x.suggestion);
  const playlist = useBooth((x) => x.playlist);
  const [busy, setBusy] = useState(false);
  if (!s || !playlist) return null;
  const prev = playlist.tandas[s.after];
  const from = `${s.from.orchestra}${s.from.singer ? ` / ${s.from.singer}` : ""}`;
  const to = `${s.to.orchestra}${s.to.singer ? ` / ${s.to.singer}` : ""}${yearsOf(s.to.yearRange)}`;
  const reasons = s.reasons.map(reasonText).filter(Boolean).join(", ");
  const head = tx(AFTER[s.reaction], { name: prev?.orchestra ?? "" });
  const what =
    s.index === s.after + 1
      ? tx("adapt.next_swap", { from, to })
      : tx("adapt.later_swap", { n: s.index + 1, from, to });
  const apply = async () => {
    if (busy) return;
    setBusy(true);
    haptic(8);
    try {
      const before = useBooth.getState().playlist;
      if (!before) return;
      const label = tx("adapt.applied", { n: s.index + 1 });
      const res = await gateEdit({
        before,
        after: s.playlist as Playlist,
        label,
        apply: (p) => useBooth.getState().applySwappedPlaylist(p),
        learn: false,
      });
      if (res === "cancelled") return;
      useAdapt.getState().dismiss();
      if (res === "applied") toast(label, () => void undoEdit());
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="booth-adapt group-inset p-4" aria-label={tx("adapt.label")} data-testid="booth-adapt">
      <p className="text-subhead flex items-start gap-2">
        <Sparkles size={16} aria-hidden className="mt-0.5 shrink-0 text-[var(--tint)]" />
        <span className="min-w-0">
          <span className="text-[var(--label-2)]">{head}</span>{" "}
          <span data-testid="booth-adapt-what">{what}</span>
          {reasons && <span className="text-[var(--label-2)]"> ({reasons})</span>}
        </span>
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="btn btn-primary min-h-11 px-5"
          disabled={busy}
          onClick={() => void apply()}
          data-testid="booth-adapt-apply"
        >
          {tx("adapt.apply")}
        </button>
        <button
          type="button"
          className="btn btn-ghost min-h-11 px-5"
          onClick={() => {
            haptic(4);
            useAdapt.getState().dismiss();
          }}
          data-testid="booth-adapt-keep"
        >
          {tx("adapt.keep")}
        </button>
      </div>
    </section>
  );
}
