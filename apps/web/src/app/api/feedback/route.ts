import { applyFeedback, type Feedback } from "@tdj/core";
import { NextResponse } from "next/server";
import { FEEDBACK_VALUES } from "@/lib/feedback";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const options = body.options && typeof body.options === "object" ? body.options : {};
  const feedback = (Array.isArray(body.feedback) ? body.feedback : []).filter((f: unknown) =>
    (FEEDBACK_VALUES as string[]).includes(f as string),
  ) as Feedback[];
  return NextResponse.json({ options: applyFeedback(options, feedback), feedback });
}
