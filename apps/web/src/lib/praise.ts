import {
  type AgentMemory,
  learnFromPraise,
  type Playlist,
  praiseFromNight,
  praiseOf,
  type TandaPraise,
} from "@tdj/core";
import { t } from "@/lib/i18n";

/**
 * 2026-11 — "Praise this tanda ★" (the Booth's Controls → Floor group and the set list's tanda header): the DJ's
 * praise of a tanda of any night, kept in the DJ's memory (`learned.praise`, the same entry the featured night's
 * store holds: packages/core/src/praise.ts) with an optional short note. It rides with `learned`, so the learning
 * switch decides whether compose and the suggestions use it. The same tanda praised again takes it back. Pure
 * functions of the memory, so vitest checks them without a browser.
 */

/** tanda `tanda` (1-based, the plan's) of a night is praised in the DJ's memory */
export const isPraised = (m: AgentMemory | null | undefined, p: Playlist | null | undefined, tanda: number) =>
  !!p && tanda >= 1 && !!praiseOf(m?.learned, p.id, tanda - 1);

/** praise tanda `tanda` (1-based) of a night, or take the praise back when it is already there */
export function praiseTanda(
  m: AgentMemory,
  p: Playlist,
  tanda: number,
  note?: string,
  at: Date = new Date(),
): AgentMemory {
  if (tanda < 1 || !p.tandas[tanda - 1]) return m;
  const had = praiseOf(m.learned, p.id, tanda - 1);
  const entry =
    had ??
    praiseFromNight(p, tanda - 1, t("praise.reason_booth"), {
      at: at.toISOString(),
      source: "dj",
      ...(note?.trim() ? { note: note.trim() } : {}),
    });
  return { ...m, learned: learnFromPraise(m.learned, entry), updatedAt: at.toISOString() };
}

/** a family key (`orchestraId|singer|rhythm`) in words */
export function familyWords(key: string | null | undefined, nameOf: (id: string) => string): string {
  if (!key) return "";
  const [orch, singer, rhythm] = key.split("|");
  const sing = singer
    ? singer.replace(/(^|\s)(\p{L})/gu, (_m, a: string, c: string) => a + c.toUpperCase())
    : "";
  return `${nameOf(orch ?? "")}${sing ? ` / ${sing}` : ` ${t("fav.instrumental")}`} · ${rhythm ?? ""}`;
}

/** what a praise teaches, one line each: the tanda (in its role), its order, its connections */
export function praiseLines(
  p: TandaPraise,
  nameOf: (id: string) => string,
  titleOf: (id: string) => string | undefined,
): { tanda: string; order: string; connections: string } {
  const role = t(`fav.role.${p.role}` as "fav.role.build");
  const first = titleOf(p.songIds[0] ?? "") ?? "";
  const last = titleOf(p.songIds[p.songIds.length - 1] ?? "") ?? "";
  const links = [
    p.prevFamily ? t("praise.after", { family: familyWords(p.prevFamily, nameOf) }) : "",
    p.nextFamily ? t("praise.before", { family: familyWords(p.nextFamily, nameOf) }) : "",
  ].filter(Boolean);
  return {
    tanda: t("praise.teaches_tanda", { family: familyWords(p.family, nameOf), role }),
    order:
      first && last
        ? t("praise.teaches_order", { first, last })
        : t("praise.teaches_order_plain", { count: p.songIds.length }),
    connections: links.length
      ? t("praise.teaches_links", { links: links.join(" · ") })
      : t("praise.no_links"),
  };
}
