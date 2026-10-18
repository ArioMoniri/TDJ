import { swapTanda } from "@tdj/core";
import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/server/catalog";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const { playlist, index } = await req.json();
  const { catalog, cortinas } = getCatalog();
  return NextResponse.json(swapTanda(playlist, Number(index), { catalog, cortinas }));
}
