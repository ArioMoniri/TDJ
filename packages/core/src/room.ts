import type { NightFile, NightSide, NightTanda } from "./night";

/**
 * Rooms (ROADMAP §12): several DJs edit one night live. A room is a name, a 6-character code and a night in the
 * `.tdjnight` shape whose tandas carry stable slot ids. Every edit is an op against the room revision the DJ last
 * saw; the merge is per edit with last writer wins per register (each tanda slot, the running order, each setting,
 * the room name), so two DJs editing different tandas never collide, and when two edit the same tanda the later edit
 * stands and the log says whose change it replaced. Pure: the server stores the result, the client diffs its night
 * against the last synced one to produce the ops.
 */

export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;
export const ROOM_LOG_MAX = 400;
export const ROOM_NAME_MAX = 60;
export const ROOM_USER_MAX = 32;
/** a DJ seen within this long counts as in the room */
export const ROOM_PRESENCE_MS = 45_000;

export function newRoomCode(rand: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++)
    s += ROOM_CODE_ALPHABET[Math.floor(rand() * ROOM_CODE_ALPHABET.length) % ROOM_CODE_ALPHABET.length];
  return s;
}
/** What a DJ typed ("abc 123", "ABC-123") as a code, or null. O and I read as 0 and 1 are not in the alphabet. */
export function normalizeRoomCode(s: string | null | undefined): string | null {
  const c = (s ?? "")
    .toUpperCase()
    .replace(/[\s-]+/g, "")
    .replace(/O/g, "0")
    .replace(/I/g, "1");
  if (c.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of c) if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  return c;
}
/** "ABC123" → "ABC 123" for reading aloud */
export const formatRoomCode = (c: string) => `${c.slice(0, 3)} ${c.slice(3)}`;

/** a display name: control characters out, spaces collapsed, at most `max` characters */
function cleanName(s: unknown, max: number): string | null {
  if (typeof s !== "string") return null;
  const t = [...s]
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return c >= 0x20 && c !== 0x7f;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return t || null;
}
export const cleanRoomUser = (s: unknown) => cleanName(s, ROOM_USER_MAX);
export const cleanRoomName = (s: unknown) => cleanName(s, ROOM_NAME_MAX);

export interface RoomStamp {
  rev: number;
  by: string;
  at: string;
}
export type RoomLogKind =
  | "create"
  | "join"
  | "rename"
  | "night"
  | "swap"
  | "lock"
  | "unlock"
  | "skip"
  | "play"
  | "reorder"
  | "settings"
  | "edit"
  | "conflict";
export interface RoomLogEntry {
  rev: number;
  at: string;
  by: string;
  kind: RoomLogKind;
  text: string;
  /** 1-based tanda number at the time of the edit */
  tanda?: number;
}
export interface RoomState {
  code: string;
  name: string;
  createdAt: string;
  createdBy: string;
  rev: number;
  night: NightFile | null;
  /** stable slot ids, parallel to `night.tandas` */
  slots: string[];
  nextSlot: number;
  stamps: {
    name?: RoomStamp;
    night?: RoomStamp;
    order?: RoomStamp;
    slots: Record<string, RoomStamp>;
    settings: Record<string, RoomStamp>;
  };
  log: RoomLogEntry[];
  /** username → last seen (ISO) */
  members: Record<string, string>;
}

export type RoomOp =
  | { type: "join" }
  | { type: "rename"; name: string; base: number }
  | { type: "night"; night: NightFile | null; base: number }
  | { type: "slot"; slot: string; tanda: NightTanda; base: number }
  /** `moved`: the slot the DJ moved (the log names it; otherwise the slot that moved farthest) */
  | { type: "order"; order: string[]; base: number; moved?: string }
  | { type: "settings"; patch: Record<string, unknown>; base: number };

export function createRoom(o: {
  code: string;
  name: string;
  by: string;
  at: string;
  night?: NightFile | null;
}): RoomState {
  const room: RoomState = {
    code: o.code,
    name: o.name,
    createdAt: o.at,
    createdBy: o.by,
    rev: 1,
    night: null,
    slots: [],
    nextSlot: 1,
    stamps: { slots: {}, settings: {} },
    log: [{ rev: 1, at: o.at, by: o.by, kind: "create", text: `created the room “${o.name}”` }],
    members: { [o.by]: o.at },
  };
  if (o.night) return applyRoomOps(room, [{ type: "night", night: o.night, base: 1 }], o.by, o.at).room;
  return room;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** how long before, in words: "12 s", "3 min" */
function ago(from: string, to: string): string {
  const s = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000));
  return s < 90 ? `${s} s` : `${Math.round(s / 60)} min`;
}
const q = (s: string) => `“${s}”`;

/** what changed in one tanda slot, as log lines */
export function describeSlotChange(prev: NightTanda | undefined, next: NightTanda, n: number) {
  const out: Array<{ kind: RoomLogKind; text: string }> = [];
  if (!prev) return [{ kind: "edit" as const, text: `added tanda ${n}` }];
  const ids = (t: NightTanda) => t.sides.map((s) => s.id);
  if (!same(ids(prev), ids(next))) {
    if (prev.orchestraId !== next.orchestraId)
      out.push({ kind: "swap", text: `replaced tanda ${n}: ${prev.orchestra} → ${next.orchestra}` });
    else if (same([...ids(prev)].sort(), [...ids(next)].sort()))
      out.push({ kind: "edit", text: `reordered the sides of tanda ${n}` });
    else {
      const changes: string[] = [];
      const len = Math.max(prev.sides.length, next.sides.length);
      for (let i = 0; i < len; i++) {
        const a = prev.sides[i] as NightSide | undefined;
        const b = next.sides[i] as NightSide | undefined;
        if (a?.id === b?.id) continue;
        if (a && b) changes.push(`${q(a.title)} → ${q(b.title)}`);
        else if (b) changes.push(`added ${q(b.title)}`);
        else if (a) changes.push(`removed ${q(a.title)}`);
      }
      out.push({ kind: "swap", text: `swapped ${changes.join(", ")} in tanda ${n}` });
    }
  }
  if (!!prev.locked !== !!next.locked)
    out.push(
      next.locked
        ? { kind: "lock", text: `locked tanda ${n}` }
        : { kind: "unlock", text: `unlocked tanda ${n}` },
    );
  if (!!prev.bypass !== !!next.bypass)
    out.push(
      next.bypass
        ? { kind: "skip", text: `set tanda ${n} to skip tonight` }
        : { kind: "play", text: `set tanda ${n} to play tonight` },
    );
  if (!same(prev.cortina?.id, next.cortina?.id))
    out.push({
      kind: "edit",
      text: next.cortina
        ? `changed the cortina after tanda ${n} to ${q(next.cortina.title)}`
        : `removed the cortina after tanda ${n}`,
    });
  if (!out.length && !same(prev, next)) out.push({ kind: "edit", text: `edited tanda ${n}` });
  return out;
}

const SETTING_LABELS: Record<string, string> = {
  name: "the night's name",
  closing: "the closing Cumparsita",
  opening: "the opening Cumparsita",
  breaks: "the show break",
  booth: "the booth timing",
  "options.hours": "the length of the night",
  "options.cortinaLengthSec": "the cortina length",
  "options.rules": "the night rules",
  "options.cortinaCultures": "the cortina styles",
  "options.eras": "the eras",
  "options.pattern": "the rhythm pattern",
};
export function describeSetting(key: string, value: unknown): string {
  if (key === "name" && typeof value === "string") return `renamed the night to ${q(value)}`;
  if (key === "options.cortinaLengthSec" && typeof value === "number")
    return `set the cortina length to ${value} s`;
  if (key === "options.hours" && typeof value === "number") return `set the night to ${value} h`;
  if ((key === "closing" || key === "opening") && value && typeof value === "object")
    return `chose ${q((value as NightSide).title)} as ${SETTING_LABELS[key]}`;
  const label = SETTING_LABELS[key] ?? `the setting “${key.replace(/^options\./, "")}”`;
  return `changed ${label}`;
}

/** the setting registers of a night: `name`, `opening`, `closing`, `breaks`, `booth` and `options.<key>` */
export function nightSettings(n: NightFile | null): Record<string, unknown> {
  if (!n) return {};
  const out: Record<string, unknown> = {
    name: n.name,
    opening: n.opening,
    closing: n.closing,
    breaks: n.breaks ?? null,
    booth: n.booth ?? null,
  };
  for (const [k, v] of Object.entries(n.options ?? {})) out[`options.${k}`] = v;
  return out;
}
function setSetting(n: NightFile, key: string, value: unknown) {
  const v = value === null || value === undefined ? undefined : clone(value);
  if (key.startsWith("options.")) {
    const k = key.slice(8);
    const o = n.options as Record<string, unknown>;
    if (v === undefined) delete o[k];
    else o[k] = v;
    return;
  }
  switch (key) {
    case "name":
      if (typeof v === "string") n.name = v.slice(0, 200);
      return;
    case "opening":
    case "closing":
      n[key] = (v as NightSide | undefined) ?? null;
      return;
    case "breaks":
      if (v === undefined) delete n.breaks;
      else n.breaks = v as NightFile["breaks"];
      return;
    case "booth":
      if (v === undefined) delete n.booth;
      else n.booth = v as NightFile["booth"];
      return;
  }
}
const SETTING_KEY = /^(name|opening|closing|breaks|booth|options\.[A-Za-z]{1,40})$/;

export interface ApplyResult {
  room: RoomState;
  entries: RoomLogEntry[];
  /** ops that changed nothing (an echo, an edit to a slot that no longer exists) */
  ignored: number;
}

/**
 * Applies ops from `by` in order. Each op that changes the room takes the next revision. An op whose register
 * someone else wrote after the op's `base` still wins (last writer wins) and logs a conflict naming whose change
 * it replaced; an op for a tanda slot the room no longer has (a new night was loaded meanwhile) is dropped and
 * logged the same way, so nothing disappears silently.
 */
export function applyRoomOps(room0: RoomState, ops: RoomOp[], by: string, at: string): ApplyResult {
  const room = clone(room0);
  const entries: RoomLogEntry[] = [];
  let ignored = 0;
  const push = (e: Omit<RoomLogEntry, "rev" | "at" | "by">) => entries.push({ rev: room.rev, at, by, ...e });
  const stamp = (): RoomStamp => ({ rev: room.rev, by, at });
  const conflict = (s: RoomStamp | undefined, base: number, what: string, tanda?: number) => {
    if (s && s.rev > base && s.by !== by)
      push({
        kind: "conflict",
        text: `${what} replaced ${s.by}’s change from ${ago(s.at, at)} before`,
        tanda,
      });
  };
  const seen = room.members[by];
  room.members[by] = at;
  for (const op of ops) {
    switch (op.type) {
      case "join": {
        if (!seen || Date.parse(at) - Date.parse(seen) > 30 * 60_000) {
          room.rev++;
          push({ kind: "join", text: "joined the room" });
        } else ignored++;
        break;
      }
      case "rename": {
        const name = cleanRoomName(op.name);
        if (!name || name === room.name) {
          ignored++;
          break;
        }
        room.rev++;
        conflict(room.stamps.name, op.base, "This name");
        room.name = name;
        room.stamps.name = stamp();
        push({ kind: "rename", text: `renamed the room to ${q(name)}` });
        break;
      }
      case "night": {
        if (same(op.night, room.night)) {
          ignored++;
          break;
        }
        room.rev++;
        conflict(room.stamps.night, op.base, "This night");
        room.night = op.night ? clone(op.night) : null;
        room.slots = (op.night?.tandas ?? []).map(() => `s${room.nextSlot++}`);
        room.stamps.night = stamp();
        room.stamps.order = stamp();
        room.stamps.slots = Object.fromEntries(room.slots.map((s) => [s, stamp()]));
        room.stamps.settings = {};
        push({
          kind: "night",
          text: op.night
            ? `loaded the night ${q(op.night.name)} (${op.night.tandas.length} tandas)`
            : "cleared the night",
        });
        break;
      }
      case "slot": {
        const i = room.slots.indexOf(op.slot);
        if (!room.night || i < 0) {
          ignored++;
          room.rev++;
          const s = room.stamps.night;
          push({
            kind: "conflict",
            text: `an edit arrived for a tanda that is no longer in the night${s && s.by !== by ? ` (${s.by} loaded a new night)` : ""}; the current night was kept`,
          });
          break;
        }
        const prev = room.night.tandas[i];
        if (same(prev, op.tanda)) {
          ignored++;
          break;
        }
        room.rev++;
        const lines = describeSlotChange(prev, op.tanda, i + 1);
        conflict(
          room.stamps.slots[op.slot],
          op.base,
          `This ${lines[0]?.kind === "swap" ? "swap" : "edit"}`,
          i + 1,
        );
        room.night.tandas[i] = clone(op.tanda);
        room.stamps.slots[op.slot] = stamp();
        for (const l of lines) push({ ...l, tanda: i + 1 });
        break;
      }
      case "order": {
        if (!room.night) {
          ignored++;
          break;
        }
        const known = new Set(room.slots);
        const order = [...new Set(op.order.filter((s) => known.has(s)))];
        for (const s of room.slots) if (!order.includes(s)) order.push(s);
        if (same(order, room.slots)) {
          ignored++;
          break;
        }
        room.rev++;
        conflict(room.stamps.order, op.base, "This order");
        const byId = new Map(room.slots.map((s, k) => [s, room.night!.tandas[k]!]));
        // say which tanda moved where: the first slot whose position changed the most
        let moved = { id: order[0]!, from: 0, to: 0 };
        for (const [to, id] of order.entries()) {
          const from = room.slots.indexOf(id);
          if (Math.abs(to - from) > Math.abs(moved.to - moved.from)) moved = { id, from, to };
        }
        if (op.moved && order.includes(op.moved))
          moved = { id: op.moved, from: room.slots.indexOf(op.moved), to: order.indexOf(op.moved) };
        room.night.tandas = order.map((s) => byId.get(s)!);
        room.slots = order;
        room.stamps.order = stamp();
        const t = byId.get(moved.id);
        push({
          kind: "reorder",
          text: `moved tanda ${moved.from + 1}${t ? ` (${t.orchestra})` : ""} to position ${moved.to + 1}`,
          tanda: moved.to + 1,
        });
        break;
      }
      case "settings": {
        if (!room.night) {
          ignored++;
          break;
        }
        const cur = nightSettings(room.night);
        let any = false;
        for (const [key, value] of Object.entries(op.patch ?? {})) {
          if (!SETTING_KEY.test(key) || same(cur[key], value)) continue;
          if (!any) room.rev++;
          any = true;
          conflict(room.stamps.settings[key], op.base, "This setting");
          setSetting(room.night, key, value);
          room.stamps.settings[key] = stamp();
          push({ kind: "settings", text: describeSetting(key, value) });
        }
        if (!any) ignored++;
        break;
      }
    }
  }
  room.log = [...room.log, ...entries].slice(-ROOM_LOG_MAX);
  return { room, entries, ignored };
}

/** One tanda's identity for matching across edits: its sides in order. */
const sidesKey = (t: NightTanda) => t.sides.map((s) => s.id).join(",");

/**
 * The ops that turn the last synced night into `next`: whole-night load when the shape changed (a new compose),
 * otherwise one op per changed tanda slot, the running order when tandas moved, and the changed settings.
 */
export function diffNight(
  synced: { night: NightFile | null; slots: string[]; rev: number },
  next: NightFile | null,
): RoomOp[] {
  const base = synced.rev;
  const prev = synced.night;
  if (!next) return prev ? [{ type: "night", night: null, base }] : [];
  if (!prev || prev.tandas.length !== next.tandas.length || prev.createdAt !== next.createdAt)
    return [{ type: "night", night: next, base }];
  const ops: RoomOp[] = [];
  // match each tanda of `next` to a slot: the same sides first, then the remaining slots by position
  const taken = new Set<number>();
  const assign: Array<number | null> = next.tandas.map((t) => {
    const k = sidesKey(t);
    const i = prev.tandas.findIndex((p, j) => !taken.has(j) && sidesKey(p) === k);
    if (i < 0) return null;
    taken.add(i);
    return i;
  });
  // unmatched by position: the same index when it is free, else the first free slot
  for (const [i, a] of assign.entries()) {
    if (a !== null) continue;
    const j = !taken.has(i) ? i : prev.tandas.findIndex((_p, k) => !taken.has(k));
    taken.add(j);
    assign[i] = j;
  }
  const order = assign.map((j) => synced.slots[j!]!);
  if (!same(order, synced.slots)) ops.push({ type: "order", order, base });
  for (const [i, j] of assign.entries()) {
    const t = next.tandas[i]!;
    if (!same(prev.tandas[j!], t)) ops.push({ type: "slot", slot: synced.slots[j!]!, tanda: t, base });
  }
  const a = nightSettings(prev);
  const b = nightSettings(next);
  const patch: Record<string, unknown> = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
    if (!same(a[k], b[k])) patch[k] = b[k] ?? null;
  if (Object.keys(patch).length) ops.push({ type: "settings", patch, base });
  return ops;
}

/** The people seen in the room within `ROOM_PRESENCE_MS` of `now`, most recent first. */
export function roomPresence(room: Pick<RoomState, "members">, now: number): string[] {
  return Object.entries(room.members)
    .filter(([, at]) => now - Date.parse(at) <= ROOM_PRESENCE_MS)
    .sort((x, y) => y[1].localeCompare(x[1]))
    .map(([n]) => n);
}

/** The night of a room as a standalone `.tdjnight` (for History, the file and Spotify). */
export function roomNight(room: Pick<RoomState, "night">): NightFile | null {
  return room.night ? clone(room.night) : null;
}

const isRecord = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
function cleanTanda(x: unknown): NightTanda | null {
  if (!isRecord(x) || !Array.isArray(x.sides) || x.sides.length > 12) return null;
  if (!["tango", "vals", "milonga"].includes(x.rhythm as string)) return null;
  if (!x.sides.every((s) => isRecord(s) && typeof s.id === "string" && typeof s.title === "string"))
    return null;
  return x as unknown as NightTanda;
}

/**
 * Ops as a client sent them, checked: unknown shapes are dropped, a night goes through `parse` (the `.tdjnight`
 * check), at most 50 ops per request. Returns null when nothing valid is left.
 */
export function cleanRoomOps(input: unknown, parse: (n: unknown) => NightFile): RoomOp[] | null {
  if (!Array.isArray(input)) return null;
  const out: RoomOp[] = [];
  for (const x of input.slice(0, 50)) {
    if (!isRecord(x)) continue;
    const base = typeof x.base === "number" && Number.isFinite(x.base) ? x.base : 0;
    switch (x.type) {
      case "join":
        out.push({ type: "join" });
        break;
      case "rename":
        if (typeof x.name === "string") out.push({ type: "rename", name: x.name, base });
        break;
      case "night":
        try {
          out.push({ type: "night", night: x.night === null ? null : parse(x.night), base });
        } catch {}
        break;
      case "slot": {
        const t = cleanTanda(x.tanda);
        if (t && typeof x.slot === "string" && x.slot.length <= 16)
          out.push({ type: "slot", slot: x.slot, tanda: t, base });
        break;
      }
      case "order":
        if (Array.isArray(x.order) && x.order.length <= 80 && x.order.every((s) => typeof s === "string"))
          out.push({
            type: "order",
            order: x.order as string[],
            base,
            ...(typeof x.moved === "string" ? { moved: x.moved } : {}),
          });
        break;
      case "settings":
        if (isRecord(x.patch)) out.push({ type: "settings", patch: x.patch, base });
        break;
    }
  }
  return out.length ? out : null;
}
