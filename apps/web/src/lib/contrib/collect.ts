import {
  type AgentMemory,
  CONTRIB_LIMITS,
  type ContributionItem,
  type ContributionKind,
  type PersonalKind,
  prepareItem,
} from "@tdj/core";
import { hash53 } from "@/lib/api/catalog";
import type { AppOverrides, HistorySnapshot } from "@/lib/types";

/**
 * Owner contributions on the device (pure; lib/contrib/owner.ts runs it): what this device's store holds that is a
 * shared catalogue fact, as contribution items, and which of them the server has not acknowledged yet. The queue is
 * the difference between the device's state and what was sent (key → hash), so nothing is lost when a send fails and
 * nothing is sent twice. Personal categories travel only when the owner opted in per category.
 */

/** what the device holds (the store, plus the small per-device caches kept in localStorage) */
export interface DeviceState {
  overrides: AppOverrides;
  memory: AgentMemory;
  history: HistorySnapshot[];
  /** lib/youtubeMatches.ts: song id → video id */
  youtube: Record<string, string>;
  /** lib/artwork.ts device cache: song or cortina id → cover url */
  artwork: Record<string, string>;
  /** lib/spotify.ts remembered BYO matches: song id → track */
  spotify: Record<string, { uri: string; matched?: string; durationMs?: number }>;
  /** 2026-11: the Booth's transition templates and their defaults (lib/booth/transitionTemplates.ts) */
  transitions?: { templates: unknown[]; defaults: unknown };
}

/** the groups Settings → Owner shows, each a set of contribution kinds */
export const CATALOGUE_GROUPS = {
  songs: ["song"],
  added: ["addedSong"],
  cortinas: ["cortina"],
  orchestras: ["profile"],
  filled: ["scraped"],
  matches: ["spotify", "youtube"],
  artwork: ["artwork"],
} as const satisfies Record<string, readonly ContributionKind[]>;
export type CatalogueGroup = keyof typeof CATALOGUE_GROUPS;
export const PERSONAL: readonly PersonalKind[] = [
  "learning",
  "favourites",
  "history",
  "grades",
  "transitions",
];
export type PersonalChoice = Record<PersonalKind, boolean>;
export const NO_PERSONAL: PersonalChoice = {
  learning: false,
  favourites: false,
  history: false,
  grades: false,
  transitions: false,
};
export type Group = CatalogueGroup | PersonalKind;

export const groupOf = (kind: ContributionKind): Group => {
  for (const [g, kinds] of Object.entries(CATALOGUE_GROUPS))
    if ((kinds as readonly string[]).includes(kind)) return g as CatalogueGroup;
  return kind as PersonalKind;
};

/** kinds a missing key withdraws (a cache eviction is not the owner taking a fact back) */
const WITHDRAWABLE = new Set<ContributionKind>(["song", "addedSong", "cortina", "profile", "scraped"]);
export const itemKey = (i: Pick<ContributionItem, "kind" | "id">) => `${i.kind}:${i.id}`;
export const itemHash = (i: Pick<ContributionItem, "value">) => hash53(JSON.stringify(i.value ?? null));

/** the night list without the nights themselves: when, what, which sides (newest first, bounded) */
function compactHistory(list: HistorySnapshot[]): unknown {
  const rows = list.slice(0, 30).map((h) => ({
    id: h.id,
    at: h.createdAt,
    title: h.title.slice(0, 120),
    source: h.source,
    score: h.score,
    sides: (h.playlist?.tandas ?? []).flatMap((t) => (t.songs ?? []).map((s) => s.id)),
    played: h.nightLog ? { at: h.nightLog.startedAt, items: h.nightLog.itemsPlayed } : undefined,
  }));
  while (rows.length && JSON.stringify(rows).length > CONTRIB_LIMITS.personalBytes - 2000) rows.pop();
  return { nights: rows };
}

/** every item the device would contribute now (withdrawals are diffItems' business) */
export function collectItems(s: DeviceState, personal: PersonalChoice, at: string): ContributionItem[] {
  const out: ContributionItem[] = [];
  const add = (kind: ContributionKind, id: string, value: unknown) => {
    if (value === undefined || value === null) return;
    const it = prepareItem(kind, id, value, at);
    if (it) out.push(it);
  };
  const o = s.overrides ?? {};
  for (const [id, p] of Object.entries(o.songs ?? {})) add("song", id, p);
  for (const song of o.addedSongs ?? []) if (song?.id) add("addedSong", song.id, song);
  for (const [id, c] of Object.entries(o.cortinas ?? {})) if (c) add("cortina", id, c);
  for (const [id, p] of Object.entries(o.profiles ?? {})) add("profile", id, p);
  for (const [id, r] of Object.entries(o.scraped ?? {})) add("scraped", id, r);
  for (const [id, m] of Object.entries(s.spotify ?? {})) add("spotify", id, m);
  for (const [id, v] of Object.entries(s.youtube ?? {})) add("youtube", id, v);
  for (const [id, u] of Object.entries(s.artwork ?? {})) add("artwork", id, u);
  const m = s.memory;
  if (personal.learning && (m?.learned || m?.repoLearned))
    add("learning", "learning", { learned: m.learned ?? null, repoLearned: m.repoLearned ?? null });
  if (personal.favourites && m?.favourites) add("favourites", "favourites", m.favourites);
  if (personal.history && s.history?.length) add("history", "history", compactHistory(s.history));
  if (personal.grades && o.heatmap && Object.keys(o.heatmap).length) add("grades", "grades", o.heatmap);
  if (personal.transitions && s.transitions?.templates.length)
    add("transitions", "transitions", s.transitions);
  return out;
}

/**
 * What is not acknowledged yet: items whose hash differs from `sent` (and from `baseline`, the state the device had
 * when it became the owner's, unless `includeBaseline`), plus a null for each withdrawable key that was sent and is
 * gone now.
 */
export function diffItems(
  items: ContributionItem[],
  sent: Record<string, string>,
  o: { baseline?: Record<string, string>; includeBaseline?: boolean; at: string },
): ContributionItem[] {
  const out: ContributionItem[] = [];
  const now = new Set<string>();
  for (const it of items) {
    const k = itemKey(it);
    now.add(k);
    const h = itemHash(it);
    if (sent[k] === h) continue;
    if (!o.includeBaseline && o.baseline?.[k] === h) continue;
    out.push(it);
  }
  for (const k of Object.keys(sent)) {
    if (now.has(k) || sent[k] === itemHash({ value: null })) continue;
    const [kind, ...rest] = k.split(":");
    if (!WITHDRAWABLE.has(kind as ContributionKind)) continue;
    out.push({ kind: kind as ContributionKind, id: rest.join(":"), value: null, at: o.at });
  }
  return out;
}

/** a hash per key of the given items (what `sent` or the baseline records) */
export const hashesOf = (items: ContributionItem[]): Record<string, string> =>
  Object.fromEntries(items.map((i) => [itemKey(i), itemHash(i)]));

export function countByGroup(items: ContributionItem[]): Partial<Record<Group, number>> {
  const out: Partial<Record<Group, number>> = {};
  for (const i of items) {
    const g = groupOf(i.kind);
    out[g] = (out[g] ?? 0) + 1;
  }
  return out;
}

/** batches the server accepts: at most CONTRIB_LIMITS.items items and well under the body limit each */
export function chunkItems(
  items: ContributionItem[],
  maxBytes = CONTRIB_LIMITS.bodyBytes - 8_000,
): ContributionItem[][] {
  const out: ContributionItem[][] = [];
  let cur: ContributionItem[] = [];
  let bytes = 0;
  for (const it of items) {
    const n = JSON.stringify(it).length + 1;
    if (cur.length && (cur.length >= CONTRIB_LIMITS.items || bytes + n > maxBytes)) {
      out.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(it);
    bytes += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** the offline file (Settings → Owner → Export), read by `pnpm data:apply-contributions` */
export function contributionFile(items: ContributionItem[], at: string, source: "web" | "app") {
  return {
    format: "tdj-owner-contribution",
    v: 1,
    exportedAt: at,
    contributions: chunkItems(items).map((batch, i) => ({
      id: `file-${at.replace(/[-:.TZ]/g, "").slice(0, 14)}-${i}-${hash53(JSON.stringify(batch))}`,
      at,
      source,
      items: batch,
    })),
  };
}
