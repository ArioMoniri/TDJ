import { contributionsGet, contributionsPost } from "@/lib/server/contributions";
export const dynamic = "force-dynamic";

/** Owner contributions to the shared catalogue (lib/server/contributions.ts): the owner session only. */
export const GET = contributionsGet;
export const POST = contributionsPost;
