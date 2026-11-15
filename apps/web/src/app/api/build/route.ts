import {
  buildManualNight,
  type ComposeOptions,
  type DanceRhythm,
  isDanceableSong,
  type LearnedPreferences,
  nightOptions,
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
    const next = suggestNext(draft, deps, { ...options, learned, rhythm, limit: 8 });
    out.next = {
      ...next,
      suggestions: next.suggestions.map((x) => ({ ...x, songs: x.songs.map(slimSong) })),
    };
  }
  const q = String(body.query ?? "").trim();
  if (q.length >= 2) {
    const o = nightOptions(options);
    const used = new Set(draft.flat().map((s) => s.id));
    const open = draft.at(-1);
    const size = (r: string) =>
      r === "tango" ? o.tangoTandaSize : r === "vals" ? o.valsTandaSize : o.milongaTandaSize;
    const filling = open && open.length < size(open[0]!.rhythm) ? open : null;
    out.results = deps.catalog
      .search(q, 200)
      .filter(
        (s) =>
          RHYTHMS.includes(s.rhythm as DanceRhythm) &&
          !used.has(s.id) &&
          isDanceableSong(s, deps.catalog.blacklist),
      )
      .slice(0, 30)
      .map((s) => {
        const why = filling
          ? s.orchestraId !== filling[0]!.orchestraId
            ? `another orchestra: starts a new tanda`
            : sideProblem(filling, s, { rhythm: filling[0]!.rhythm, o })
          : null;
        return { song: slimSong(s), fits: !why, why };
      });
  }
  return noStore(NextResponse.json(out));
}
