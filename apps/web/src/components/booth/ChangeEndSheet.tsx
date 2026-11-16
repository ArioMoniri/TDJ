"use client";
import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { confirmNeeded } from "@/lib/booth/confirm";
import { clockLabel } from "@/lib/booth/plan";
import { useBooth } from "@/lib/booth/store";
import { undoEdit } from "@/lib/editHistory";
import { haptic } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { gateEdit } from "@/lib/ruleCheck";
import { spotCall } from "@/lib/spot";
import { toast } from "@/lib/toast";
import type { Playlist, Tanda } from "@/lib/types";
import { Group } from "../Form";
import { Sheet } from "../Sheet";

/**
 * 2026-11 (the owner: "in the Booth it should be able to auto add or remove tandas, with all rules, to extend the night
 * by e.g. 20 min or to a specific end time, or to shorten it"): the night card's "Change the end…". +10 / +20 / +30,
 * −10 / −20 min, or "End at HH:MM"; the engine (core nightEnd.ts, POST /api/spot `end`) re-plans only what is still to
 * play — whole tandas after the playing one, never the última, never a locked or pinned tanda; the rhythm cycle, the
 * big four, the repeat gaps, "last 4 tandas tango only" and the La Cumparsita kept — and the preview shows the new end
 * ("ends 17:02, 2 min after your target"), the tandas added and removed and the energy before and after. Apply (asks
 * once while the night runs) goes through the rule check and the undo history.
 */
interface EndAnswer {
  playlist: Playlist;
  endBeforeSec: number;
  endSec: number;
  targetSec: number;
  diffSec: number;
  added: string[];
  removed: string[];
  notes: string[];
  changed: boolean;
}
const keyOf = (x: Pick<Tanda, "songs">) => x.songs.map((s) => s.id).join(",");
const DELTAS = [10, 20, 30, -10, -20];

function EnergyBars({
  tandas,
  mark,
  tone,
  label,
}: {
  tandas: Tanda[];
  mark: Set<string>;
  tone: string;
  label: string;
}) {
  const w = 100 / Math.max(1, tandas.length);
  return (
    <svg
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      className="h-10 w-full"
      role="img"
      aria-label={label}
      data-testid="end-energy"
    >
      {tandas.map((x, k) => {
        const h = Math.max(2, (x.energy / 100) * 30);
        const on = mark.has(keyOf(x));
        return (
          <rect
            key={keyOf(x)}
            x={k * w + w * 0.1}
            y={32 - h}
            width={w * 0.8}
            height={h}
            rx={0.6}
            fill={on ? tone : "var(--fill-1, #8884)"}
            data-mark={on || undefined}
          />
        );
      })}
    </svg>
  );
}

export function ChangeEndSheet({
  open,
  onClose,
  endMs,
}: {
  open: boolean;
  onClose: () => void;
  endMs: number;
}) {
  const playlist = useBooth((s) => s.playlist);
  const plan = useBooth((s) => s.plan);
  const planIndex = useBooth((s) => s.planIndex);
  const started = useBooth((s) => s.started);
  const [answer, setAnswer] = useState<EndAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [at, setAt] = useState("");
  const [ask, setAsk] = useState(false);
  const [target, setTarget] = useState<number | null>(null);
  useEffect(() => {
    if (!open) {
      setAnswer(null);
      setAsk(false);
      setTarget(null);
    }
  }, [open]);
  if (!plan || !playlist) return null;
  const cur = plan.items[planIndex];
  const running = cur ? (cur.kind === "closing" && cur.tanda > 0 ? playlist.tandas.length : cur.tanda) : 0;
  // the first tanda that may change: the one after the playing tanda (before the night: any)
  const from = started ? running : 0;
  const lockedPlaylist: Playlist = {
    ...playlist,
    tandas: playlist.tandas.map((x, i) => (started && i + 1 <= running ? { ...x, locked: true } : x)),
  };
  const ask0 = async (targetWall: number) => {
    setBusy(true);
    setAnswer(null);
    setAsk(false);
    setTarget(targetWall);
    try {
      const targetSec =
        (lockedPlaylist.booth?.wallClockSec ?? plan.wallClockSec) + (targetWall - endMs) / 1000;
      const r = await spotCall<EndAnswer>("end", { playlist: lockedPlaylist, from, targetSec });
      if (!r.ok) {
        toast(t("booth.end.failed"));
        return;
      }
      setAnswer(r.json);
    } finally {
      setBusy(false);
    }
  };
  const newEnd = answer ? endMs + (answer.endSec - answer.endBeforeSec) * 1000 : 0;
  const diffMin = answer ? Math.round(answer.diffSec / 60) : 0;
  const run = async () => {
    if (!answer?.changed) return;
    const before = playlist;
    const lockOf = new Map(before.tandas.map((x) => [keyOf(x), x.locked]));
    const after: Playlist = {
      ...answer.playlist,
      tandas: answer.playlist.tandas.map((x) =>
        lockOf.has(keyOf(x)) ? { ...x, locked: lockOf.get(keyOf(x)) } : x,
      ),
    };
    const label = t("booth.end.applied", { time: clockLabel(newEnd) });
    const res = await gateEdit({
      before,
      after,
      label,
      apply: async (p) => {
        useBooth.getState().stopAudition();
        await useBooth.getState().applySwappedPlaylist(p);
      },
      learn: false,
    });
    if (res === "cancelled") return;
    haptic(8);
    onClose();
    if (res === "applied") toast(label, () => void undoEdit());
  };
  const apply = () => {
    if (started && confirmNeeded() && !ask) {
      setAsk(true);
      return;
    }
    void run();
  };
  const addedSet = new Set(answer?.added ?? []);
  const removedSet = new Set(answer?.removed ?? []);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("booth.end.title")}
      detents={["large"]}
      testId="booth-end-sheet"
      footer={
        answer?.changed ? (
          <div className="grid gap-2 px-4 pt-2 pb-3">
            {ask && (
              <p className="text-footnote text-[var(--label-2)]" data-testid="booth-end-confirm-text">
                {t("booth.end.confirm")}
              </p>
            )}
            <button
              type="button"
              className="btn btn-primary min-h-11 w-full"
              onClick={apply}
              data-testid="booth-end-apply"
            >
              {ask ? t("booth.end.apply_now") : t("booth.end.apply")}
            </button>
          </div>
        ) : undefined
      }
    >
      <Group header={t("booth.end.now_ends", { time: clockLabel(endMs) })} footer={t("booth.end.footer")}>
        <fieldset className="cell m-0 flex-wrap gap-2 border-0">
          <legend className="sr-only">{t("booth.end.by")}</legend>
          {DELTAS.map((d) => (
            <button
              key={d}
              type="button"
              className="btn btn-ghost min-h-11 min-w-16 px-3 tabular-nums"
              disabled={busy}
              onClick={() => void ask0(endMs + d * 60_000)}
              data-testid={`booth-end-${d > 0 ? "plus" : "minus"}-${Math.abs(d)}`}
            >
              {d > 0 ? `+${d}` : `−${-d}`} {t("booth.end.min")}
            </button>
          ))}
        </fieldset>
        <label className="cell gap-3">
          <span className="min-w-0 flex-1">{t("booth.end.end_at")}</span>
          <input
            type="time"
            className="field min-h-11 w-32"
            value={at}
            onChange={(e) => setAt(e.target.value)}
            data-testid="booth-end-at"
          />
          <button
            type="button"
            className="btn btn-ghost min-h-11 px-3"
            disabled={!at || busy}
            onClick={() => {
              const [h, m] = at.split(":").map(Number);
              const d = new Date(endMs);
              d.setHours(h ?? 0, m ?? 0, 0, 0);
              // a time before the night's end by more than 12 h is tomorrow's (a night that runs past midnight)
              let ms = d.getTime();
              if (ms < endMs - 12 * 3600_000) ms += 24 * 3600_000;
              if (ms > endMs + 12 * 3600_000) ms -= 24 * 3600_000;
              void ask0(ms);
            }}
            data-testid="booth-end-at-go"
          >
            {t("booth.end.show")}
          </button>
        </label>
      </Group>
      {busy && (
        <p className="text-footnote flex items-center gap-2 px-4 text-[var(--label-2)]" role="status">
          <LoaderCircle size={14} className="animate-spin" aria-hidden /> {t("booth.end.planning")}
        </p>
      )}
      {answer && (
        <Group
          header={t("booth.end.preview")}
          footer={answer.notes.join(" · ") || undefined}
          data-testid="booth-end-preview"
        >
          <div className="cell flex-col items-stretch gap-1">
            <p className="text-headline" data-testid="booth-end-result">
              {!answer.changed
                ? t("booth.end.no_change")
                : diffMin === 0
                  ? t("booth.end.ends_on_target", { time: clockLabel(newEnd) })
                  : t(diffMin > 0 ? "booth.end.ends_after" : "booth.end.ends_before", {
                      time: clockLabel(newEnd),
                      m: Math.abs(diffMin),
                    })}
            </p>
            {target !== null && (
              <p className="text-footnote text-[var(--label-2)]">
                {t("booth.end.target", { time: clockLabel(target) })}
              </p>
            )}
          </div>
          {answer.changed && (
            <>
              <div className="cell flex-col items-stretch gap-1">
                <span className="text-caption1 text-[var(--label-2)]">{t("booth.end.energy_before")}</span>
                <EnergyBars
                  tandas={playlist.tandas}
                  mark={removedSet}
                  tone="var(--destructive)"
                  label={t("booth.end.energy_before")}
                />
                <span className="text-caption1 text-[var(--label-2)]">{t("booth.end.energy_after")}</span>
                <EnergyBars
                  tandas={answer.playlist.tandas}
                  mark={addedSet}
                  tone="var(--tint)"
                  label={t("booth.end.energy_after")}
                />
              </div>
              {answer.playlist.tandas.map((x, k) =>
                addedSet.has(keyOf(x)) ? (
                  <div key={keyOf(x)} className="cell" data-testid="booth-end-added">
                    <span className="min-w-0 flex-1 truncate">
                      {t("booth.end.added", {
                        n: k + 1,
                        who: `${x.orchestra}${x.singer ? ` / ${x.singer}` : ""} · ${x.rhythm}`,
                      })}
                    </span>
                  </div>
                ) : null,
              )}
              {playlist.tandas.map((x, k) =>
                removedSet.has(keyOf(x)) ? (
                  <div
                    key={keyOf(x)}
                    className="cell text-[var(--destructive)]"
                    data-testid="booth-end-removed"
                  >
                    <span className="min-w-0 flex-1 truncate line-through">
                      {t("booth.end.removed", {
                        n: k + 1,
                        who: `${x.orchestra}${x.singer ? ` / ${x.singer}` : ""} · ${x.rhythm}`,
                      })}
                    </span>
                  </div>
                ) : null,
              )}
            </>
          )}
        </Group>
      )}
    </Sheet>
  );
}
