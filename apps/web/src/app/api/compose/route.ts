import { compose, type Tanda } from "@tdj/core";
import { NextResponse } from "next/server";
import { getCatalogFor } from "@/lib/server/catalog";
import type { AppOverrides } from "@/lib/types";

export const dynamic = "force-dynamic";
const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad("Invalid JSON body");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return bad("Body must be an object");
  const hoursRaw = body.hours === undefined ? 4 : Number(body.hours);
  if (!Number.isFinite(hoursRaw)) return bad("hours must be a number between 0.5 and 12");
  const hours = Math.min(12, Math.max(0.5, hoursRaw));
  if (body.eras !== undefined && !Array.isArray(body.eras)) return bad("eras must be an array");
  for (const [k, ok] of [
    ["tangoTandaSize", [3, 4, 5]],
    ["valsTandaSize", [3, 4]],
    ["milongaTandaSize", [3, 4]],
  ] as const) {
    const v = body[k];
    if (v !== undefined && !(ok as readonly number[]).includes(Number(v)))
      return bad(`${k} must be one of ${ok.join(", ")}`);
  }
  const { locked: lockedRaw, overrides: ovRaw, ...rest } = body;
  const locked = Array.isArray(lockedRaw)
    ? (lockedRaw as Tanda[]).filter((t) => t && typeof t.index === "number" && Array.isArray(t.songs))
    : [];
  const overrides =
    ovRaw && typeof ovRaw === "object" && !Array.isArray(ovRaw) ? (ovRaw as AppOverrides) : undefined;
  try {
    const { catalog, cortinas, contextModel } = getCatalogFor(overrides);
    const { contextFactors: _cf, ...coreOverrides } = overrides ?? {};
    const p = compose(
      { ...rest, hours, overrides: overrides ? coreOverrides : undefined },
      { catalog, cortinas, contextModel },
      { locked },
    );
    return NextResponse.json(p);
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Could not compose this set");
  }
}
