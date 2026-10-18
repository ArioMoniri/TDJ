import { swapTanda } from "@tdj/core";
import { getCatalog } from "@/lib/server/catalog";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const { playlist, index } = await req.json();
  const { catalog, cortinas } = getCatalog();
  return NextResponse.json(swapTanda(playlist, Number(index), { catalog, cortinas }));
}
