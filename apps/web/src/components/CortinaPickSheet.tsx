"use client";
import type { Cortina } from "@tdj/core";
import { useEffect, useMemo, useState } from "react";
import { cortinaOptions } from "@/lib/booth/swap";
import { t } from "@/lib/i18n";
import type { Playlist } from "@/lib/types";
import { Group, Row } from "./Form";
import { Sheet } from "./Sheet";
import { Artwork } from "./ui/Artwork";

/** the cortina pool (/api/meta's list), fetched once per page */
let pool: Promise<Cortina[]> | null = null;
const cortinaPool = () => {
  pool ??= fetch("/api/meta")
    .then((r) => r.json())
    .then((j: { cortinaList?: Cortina[] }) => j.cortinaList ?? [])
    .catch(() => {
      pool = null;
      return [];
    });
  return pool;
};

/**
 * 2026-11 — change the cortina after a tanda (the room's night editor, components/NightEditor.tsx): the cortinas
 * nearest the current one (its culture, genre and energy; one Spotify can play first), none already in the night,
 * and a search over the whole pool — the Booth's Swap sheet's choice (lib/booth/swap.ts → cortinaOptions).
 */
export function CortinaPickSheet({
  playlist,
  index,
  onClose,
  onPick,
}: {
  playlist: Playlist | null;
  index: number | null;
  onClose: () => void;
  onPick: (c: Cortina) => void;
}) {
  const open = !!playlist && index !== null;
  const current = open ? (playlist.tandas[index]?.cortina ?? null) : null;
  const [all, setAll] = useState<Cortina[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!open) return;
    setQ("");
    let live = true;
    void cortinaPool().then((p) => live && setAll(p));
    return () => {
      live = false;
    };
  }, [open]);
  const tonight = useMemo(
    () => new Set((playlist?.tandas ?? []).flatMap((x) => (x.cortina ? [x.cortina.id] : []))),
    [playlist],
  );
  const options = useMemo(
    () => (current && all ? cortinaOptions(all, current, tonight, q, q.trim().length >= 2 ? 30 : 12) : []),
    [all, current, tonight, q],
  );
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("nightEditor.cortina_title", { n: (index ?? 0) + 1 })}
      detents={["large"]}
      testId="cortina-pick"
    >
      {current && (
        <Group header={t("nightEditor.cortina_now")}>
          <Row
            tile={<Artwork entity={current} orchestra={current.artist} size={44} />}
            label={current.title}
            sub={`${current.artist}${current.genre ? ` · ${current.genre}` : ""}`}
          />
        </Group>
      )}
      <div className="px-4 pb-2">
        <input
          className="field w-full"
          type="search"
          placeholder={t("nightEditor.cortina_search")}
          aria-label={t("nightEditor.cortina_search")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          data-testid="cortina-search"
        />
      </div>
      <Group
        header={q.trim().length >= 2 ? t("nightEditor.cortina_results") : t("nightEditor.cortina_nearest")}
        footer={all === null ? t("nightEditor.cortina_loading") : undefined}
        data-testid="cortina-options"
      >
        {options.map((c) => (
          <Row
            key={c.id}
            tile={<Artwork entity={c} orchestra={c.artist} size={44} />}
            label={c.title}
            sub={`${c.artist}${c.genre ? ` · ${c.genre}` : ""}`}
            chevron
            onClick={() => onPick(c)}
            data-testid="cortina-option"
          />
        ))}
        {all !== null && !options.length && <Row label={t("nightEditor.cortina_none")} />}
      </Group>
    </Sheet>
  );
}
