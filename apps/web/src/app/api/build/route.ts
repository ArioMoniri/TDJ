import {
  asFavouriteTable,
  BIG_FOUR,
  buildManualNight,
  type ComposeOptions,
  type DanceRhythm,
  isDanceableSong,
  isFavouriteSide,
  type LearnedPreferences,
  nightOptions,
  normTitle,
  planSlots,
  type Song,
  sideProblem,
  suggestNext,
} from "@tdj/core";
import { NextResponse } from "next/server";
import { slimSong } from "@/lib/build";
import { getCatalogFor } from "@/lib/server/catalog";
import { noStore } from "@/lib/server/guard";
export const dynamic = "force-dynamic";

const RHYTHMS: DanceRhythm[] = ["tango", "vals", "milonga"];

/**
 * Round 22 — the hand-built night. Body: { draft: string[][] (the tandas so far, song ids), options?, learned?,
 * rhythm?, query?, finish? }. Answers the live suggestions for what comes next (core suggest.ts, each with its
 * reason), a catalogue search marked with whether each side fits the open tanda, or — with `finish` — the whole
 * night (cortinas, stats, score), ready for the booth and the exports.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const raw: unknown[] = Array.isArray(body.draft) ? body.draft.slice(0, 60) : [];
  const options: Partial<ComposeOptions> =
    body.options && typeof body.options === "object" ? body.options : { hours: 4 };
  const live = getCatalogFor(options.overrides);
  const deps = { catalog: live.catalog, cortinas: live.cortinas, contextModel: live.contextModel };
  const byId = new Map<string, Song>();
  for (const s of deps.catalog.songs) {
    byId.set(s.id, s);
    for (const a of s.altIds ?? []) if (!byId.has(a)) byId.set(a, s);
  }
  // Database → Memory names the learned sides: { lookup: ids } → the songs
  if (Array.isArray(body.lookup))
    return noStore(
      NextResponse.json({
        songs: body.lookup
          .slice(0, 200)
          .map((id: unknown) => byId.get(String(id)))
          .filter((s: Song | undefined): s is Song => !!s)
          .map(slimSong),
      }),
    );
  const draft: Song[][] = raw
    .map((t) =>
      (Array.isArray(t) ? t : [])
        .slice(0, 6)
        .map((id) => byId.get(String(id)))
        .filter((s): s is Song => !!s),
    )
    .filter((t) => t.length);
  // 2026-11 (the guided builder): the cortina pool for "Pick a cortina" — Turkish first, then by the night's years
  if (body.cortinas) {
    const o = nightOptions(options);
    const mid = ((o.yearRange?.[0] ?? 1935) + (o.yearRange?.[1] ?? 1955)) / 2;
    const pool = deps.cortinas
      .slice()
      .sort(
        (a, b) =>
          Number(b.culture === "turkish") - Number(a.culture === "turkish") ||
          Math.abs((a.year ?? mid) - mid) - Math.abs((b.year ?? mid) - mid) ||
          a.title.localeCompare(b.title),
      )
      .slice(0, 60);
    return noStore(NextResponse.json({ cortinas: pool }));
  }
  // "Fill the rest": the engine's suggestions fill the open tanda and every slot left, the DJ's tandas kept as they are
  if (body.fill) {
    const o = nightOptions(options);
    const slots = planSlots(o).length;
    const learned0 =
      body.learned && typeof body.learned === "object" ? (body.learned as LearnedPreferences) : undefined;
    const fav = asFavouriteTable(body.favourites);
    const out = draft.map((t) => t.slice());
    for (let guard = 0; guard < 80 && out.length <= slots; guard++) {
      const next = suggestNext(out, deps, { ...options, learned: learned0, favourites: fav, limit: 3 });
      const pick = next.suggestions[0];
      if (!pick) break;
      if (next.mode === "song") out[out.length - 1]!.push(...pick.songs);
      else if (out.length < slots) out.push(pick.songs.slice());
      else break;
    }
    return noStore(NextResponse.json({ draft: out.map((t) => t.map(slimSong)) }));
  }
  if (body.finish) {
    const playlist = buildManualNight(draft, deps, {
      ...options,
      name: String(body.name ?? "") || undefined,
    });
    return noStore(NextResponse.json({ playlist }));
  }
  const learned =
    body.learned && typeof body.learned === "object" ? (body.learned as LearnedPreferences) : undefined;
  const rhythm = RHYTHMS.includes(body.rhythm) ? (body.rhythm as DanceRhythm) : undefined;
  const out: Record<string, unknown> = {};
  if (body.suggest !== false) {
    const next = suggestNext(draft, deps, {
      ...options,
      learned,
      rhythm,
      limit: 8,
      favourites: asFavouriteTable(body.favourites),
    });
    out.next = {
      ...next,
      suggestions: next.suggestions.map((x) => ({ ...x, songs: x.songs.map(slimSong) })),
    };
  }
  // 2026-11: the plan the draft is measured against (the guidance lines): slots, minutes, rhythms, energies
  {
    const o = nightOptions(options);
    const slots = planSlots(o);
    out.plan = {
      minutes: Math.round((o.hours ?? 4) * 60),
      slots: slots.map((x) => ({ rhythm: x.rhythm, targetEnergy: x.targetEnergy })),
      bigFour: BIG_FOUR,
    };
  }
  const q = String(body.query ?? "").trim();
  const f = filtersOf(body.filters);
  const anyFilter = !!(f.rhythm || f.voice || f.decade || f.orchestraId || f.singer || f.fav);
  if (q.length >= 2 || (anyFilter && body.search !== false)) {
    const o = nightOptions(options);
    const used = new Set(draft.flat().map((s) => s.id));
    const size = (r: string) =>
      r === "tango" ? o.tangoTandaSize : r === "vals" ? o.valsTandaSize : o.milongaTandaSize;
    // the tanda a side would join: the selected one (`target`), else the open last one
    const ti = Number.isInteger(body.target) ? Number(body.target) : draft.length - 1;
    const sel = draft[ti];
    const filling = sel && (Number.isInteger(body.target) || sel.length < size(sel[0]!.rhythm)) ? sel : null;
    const fav = f.fav ? asFavouriteTable(body.favourites) : undefined;
    const pool = q.length >= 2 ? deps.catalog.search(q, 2000) : deps.catalog.songs;
    const base = pool.filter(
      (s) =>
        RHYTHMS.includes(s.rhythm as DanceRhythm) &&
        !used.has(s.id) &&
        isDanceableSong(s, deps.catalog.blacklist) &&
        // La Cumparsita opens or closes the night (its own slots), never a tanda
        normTitle(s.title) !== "la cumparsita" &&
        (!f.rhythm || s.rhythm === f.rhythm) &&
        (!f.voice || (f.voice === "vocal" ? !!s.vocal : !s.vocal)) &&
        (!f.decade || (s.year != null && Math.floor(s.year / 10) * 10 === f.decade)) &&
        (!f.fav || isFavouriteSide(fav, s.id)),
    );
    // the orchestra and singer chips: the ones in the matched sides, most first
    const count = (key: (s: Song) => string | null | undefined, name: (s: Song) => string) => {
      const m = new Map<string, { id: string; name: string; n: number }>();
      for (const s of base) {
        const k = key(s);
        if (!k) continue;
        const e = m.get(k) ?? { id: k, name: name(s), n: 0 };
        e.n++;
        m.set(k, e);
      }
      return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 12);
    };
    out.facets = {
      orchestras: count(
        (s) => s.orchestraId,
        (s) => s.orchestra,
      ),
      singers: count(
        (s) => s.singer,
        (s) => s.singer ?? "",
      ),
    };
    out.results = base
      .filter(
        (s) => (!f.orchestraId || s.orchestraId === f.orchestraId) && (!f.singer || s.singer === f.singer),
      )
      .slice(0, 40)
      .map((s) => {
        const why = filling ? fitWhy(filling, s, size(filling[0]!.rhythm), o) : null;
        return { song: slimSong(s), fits: !why, why };
      });
  }
  return noStore(NextResponse.json(out));
}

interface Filters {
  rhythm?: DanceRhythm;
  voice?: "vocal" | "instrumental";
  decade?: number;
  orchestraId?: string;
  singer?: string;
  fav?: boolean;
}
function filtersOf(x: unknown): Filters {
  if (!x || typeof x !== "object") return {};
  const v = x as Record<string, unknown>;
  return {
    rhythm: RHYTHMS.includes(v.rhythm as DanceRhythm) ? (v.rhythm as DanceRhythm) : undefined,
    voice: v.voice === "vocal" || v.voice === "instrumental" ? v.voice : undefined,
    decade: typeof v.decade === "number" && v.decade >= 1900 && v.decade <= 2030 ? v.decade : undefined,
    orchestraId: typeof v.orchestraId === "string" && v.orchestraId ? v.orchestraId : undefined,
    singer: typeof v.singer === "string" && v.singer ? v.singer : undefined,
    fav: v.fav === true,
  };
}

/** why `s` does not fit tanda `t` (the same orchestra, rhythm, room, then the tanda rules); null: it fits */
function fitWhy(t: Song[], s: Song, size: number, o: ReturnType<typeof nightOptions>): string | null {
  const s0 = t[0]!;
  if (s.rhythm !== s0.rhythm) return `a ${s.rhythm}, the tanda is ${s0.rhythm}: starts a new tanda`;
  if (s.orchestraId !== s0.orchestraId) return `another orchestra: starts a new tanda`;
  if (t.length >= size) return `the tanda is full (${size})`;
  return sideProblem(t, s, { rhythm: s0.rhythm, o });
}
