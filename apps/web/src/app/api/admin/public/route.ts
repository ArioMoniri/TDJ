import { NextResponse } from "next/server";
import { publicStatus } from "@/lib/server/admin";
export const dynamic = "force-dynamic";

/**
 * What every DJ may know without unlocking: which logins exist, seats used per provider (counts only), the
 * organiser's contact and whether a shared model key exists. Never a secret, never an e-mail from the seat lists.
 */
export async function GET() {
  return NextResponse.json(await publicStatus(), { headers: { "cache-control": "no-store" } });
}
