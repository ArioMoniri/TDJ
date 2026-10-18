import { compose } from "@tdj/core";
import { getCatalog } from "@/lib/server/catalog";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { catalog, cortinas } = getCatalog();
  const hours = Math.min(10, Math.max(1, Number(body.hours ?? 4)));
  try {
    const p = compose({ ...body, hours }, { catalog, cortinas });
    return NextResponse.json(p);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
