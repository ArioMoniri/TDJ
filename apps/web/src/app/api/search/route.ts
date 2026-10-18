import { getCatalog } from "@/lib/server/catalog";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const { catalog } = getCatalog();
  return NextResponse.json(q.trim().length < 2 ? [] : catalog.search(q, 40));
}
