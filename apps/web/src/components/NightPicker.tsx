"use client";
import { useMemo, useState } from "react";
import { FEATURED, type FeaturedId, loadFeatured } from "@/lib/featured";
import { fmtDate, t } from "@/lib/i18n";
import { nightLength, totalText } from "@/lib/lengths";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { Playlist } from "@/lib/types";
import { ActionRow, Group, Row } from "./Form";
import { NightCover } from "./NightCover";
import { Sheet } from "./Sheet";

/** one night the DJ can pick: where it is from, and the night (a featured one loads when chosen) */
export interface NightChoice {
  key: string;
  from: "current" | "history" | "featured";
  title: string;
  /** when it was made or saved (ISO) */
  at?: string;
  playlist?: Playlist;
  featured?: FeaturedId;
  /** a featured night's line (its era) until it loads */
  sub?: string;
}

/** the DJ's nights: the one open now, History (composed, edited, imported, from a room), the featured ones */
export function useNightChoices(): NightChoice[] {
  const playlist = useStore((s) => s.playlist);
  const history = useStore((s) => s.history);
  return useMemo(() => {
    const out: NightChoice[] = [];
    if (playlist)
      out.push({
        key: `now:${playlist.id}`,
        from: "current",
        title: playlist.name,
        playlist,
        at: playlist.createdAt,
      });
    for (const h of history) {
      if (playlist && h.playlist.id === playlist.id) continue;
      out.push({
        key: `h:${h.id}`,
        from: "history",
        title: h.title || h.playlist.name,
        playlist: h.playlist,
        at: h.createdAt,
      });
    }
    for (const f of FEATURED)
      out.push({ key: `f:${f.id}`, from: "featured", title: f.title, featured: f.id, sub: f.sub });
    return out;
  }, [playlist, history]);
}

const facts = (c: NightChoice) => {
  if (!c.playlist) return c.sub ?? "";
  const len = nightLength(c.playlist);
  return [
    t("nightPicker.tandas", { n: c.playlist.tandas.length }),
    totalText(len),
    c.at ? fmtDate(c.at, { day: "numeric", month: "short", year: "numeric" }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
};

/**
 * 2026-11 (the owner: "I can't select from available nights"): choose one of the DJ's nights — the one open now,
 * every night in History (composed, edited, imported, from a room) and the featured ones — with a search, a preview
 * (its cover, tandas, length, date and its first tandas) and "Use this night". The rooms page uses it to make a
 * room with a night, and for the owner to put another night in the room.
 */
export function NightPicker({
  open,
  onClose,
  onUse,
  title,
  action,
}: {
  open: boolean;
  onClose: () => void;
  /** the chosen night (a featured one is loaded first) */
  onUse: (p: Playlist) => void | Promise<void>;
  title?: string;
  /** the button's words ("Use this night") */
  action?: string;
}) {
  const choices = useNightChoices();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<NightChoice | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return choices;
    return choices.filter((c) => {
      const hay =
        `${c.title} ${c.playlist?.name ?? ""} ${(c.playlist?.tandas ?? []).map((x) => x.orchestra).join(" ")}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [choices, q]);
  const groups: Array<[NightChoice["from"], string]> = [
    ["current", t("nightPicker.now")],
    ["history", t("nightPicker.history")],
    ["featured", t("nightPicker.featured")],
  ];
  const use = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      const p = picked.playlist ?? (picked.featured ? await loadFeatured(picked.featured) : null);
      if (!p) return;
      await onUse(p);
      setPicked(null);
      onClose();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open={open}
      onClose={() => {
        setPicked(null);
        onClose();
      }}
      title={title ?? t("nightPicker.title")}
      detents={["large"]}
      testId="night-picker"
    >
      <div className="px-4 pb-2">
        <input
          className="field w-full"
          type="search"
          placeholder={t("nightPicker.search")}
          aria-label={t("nightPicker.search")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          data-testid="night-picker-search"
        />
      </div>
      {picked && (
        <Group header={t("nightPicker.preview")} data-testid="night-picker-preview">
          <div className="cell items-start gap-3 py-3">
            {picked.playlist ? (
              <NightCover night={picked.playlist} size={72} className="rounded-[12px]" />
            ) : (
              <span className="tile-art" data-rhythm="tango" aria-hidden />
            )}
            <span className="min-w-0 flex-1">
              <span className="text-headline block">{picked.title}</span>
              <span className="text-footnote block text-[var(--label-2)]">{facts(picked)}</span>
              {picked.playlist && (
                <span className="text-footnote mt-1 block text-[var(--label-2)]">
                  {picked.playlist.tandas
                    .slice(0, 4)
                    .map((x) => x.orchestra)
                    .join(" · ")}
                  {picked.playlist.tandas.length > 4 ? " …" : ""}
                </span>
              )}
            </span>
          </div>
          <ActionRow
            label={action ?? t("nightPicker.use")}
            onClick={() => void use()}
            busy={busy}
            id="night-picker-use"
          />
        </Group>
      )}
      {groups.map(([from, header]) => {
        const rows = shown.filter((c) => c.from === from);
        if (!rows.length) return null;
        return (
          <Group key={from} header={header} data-testid={`night-picker-${from}`}>
            {rows.map((c) => (
              <Row
                key={c.key}
                tile={
                  c.playlist ? (
                    <NightCover night={c.playlist} size={44} className="rounded-[8px]" />
                  ) : (
                    <span className="tile-art" data-rhythm="tango" aria-hidden />
                  )
                }
                label={c.title}
                sub={facts(c)}
                value={picked?.key === c.key ? "✓" : undefined}
                onClick={() => {
                  setPicked(c);
                  // a featured night loads for its preview (its tandas, length and date)
                  if (!c.playlist && c.featured)
                    void loadFeatured(c.featured)
                      .then((p) => setPicked((cur) => (cur?.key === c.key ? { ...c, playlist: p } : cur)))
                      .catch(() => {});
                }}
                data-testid="night-choice"
              />
            ))}
          </Group>
        );
      })}
      {!shown.length && <p className="section-foot">{t("nightPicker.none")}</p>}
    </Sheet>
  );
}
