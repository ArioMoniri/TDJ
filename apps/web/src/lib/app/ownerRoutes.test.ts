/**
 * 2026-11 — the apps and owner contributions: the device never answers /api/owner/* or the owner session itself.
 * Linked to a TDJ server, the request goes to that server (whose owner check decides); unlinked, it is off.
 */
import { describe, expect, it } from "vitest";
import type { AppDeps } from "./deps";
import type { WireRequest } from "./host";
import { dispatch } from "./routes";

function deps(linked: boolean, seen: WireRequest[]): AppDeps {
  return {
    host: {
      linked: async () => linked,
      remote: async (r: WireRequest) => {
        seen.push(r);
        return { status: 401, headers: { "content-type": "application/json" }, body: '{"owner":false}' };
      },
    },
  } as unknown as AppDeps;
}
const req = (path: string, method = "GET", body?: unknown) =>
  new Request(`http://localhost:3000${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("owner routes in the apps", () => {
  it("go to the linked server, unchanged", async () => {
    const seen: WireRequest[] = [];
    const body = { v: 1, source: "app", items: [] };
    const r = await dispatch(req("/api/owner/contributions", "POST", body), deps(true, seen));
    expect(r.status).toBe(401);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      url: "/api/owner/contributions",
      method: "POST",
      body: JSON.stringify(body),
    });
    await dispatch(req("/api/admin/status"), deps(true, seen));
    expect(seen[1]?.url).toBe("/api/admin/status");
  });

  it("are off without a linked server", async () => {
    const seen: WireRequest[] = [];
    const r = await dispatch(req("/api/owner/contributions"), deps(false, seen));
    expect(r.status).toBe(404);
    expect(seen).toHaveLength(0);
  });
});
