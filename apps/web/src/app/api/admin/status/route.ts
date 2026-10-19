import { NextResponse } from "next/server";
import { adminStatus } from "@/lib/server/admin";
export const dynamic = "force-dynamic";

/** What /admin shows: locked → whether a code or passphrase exists; unlocked → per-provider status (never a secret). */
export async function GET(req: Request) {
  return NextResponse.json(await adminStatus(req), { headers: { "cache-control": "no-store" } });
}
