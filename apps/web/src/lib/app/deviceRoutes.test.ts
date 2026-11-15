/**
 * The server routes the apps run unchanged (scripts/device-routes.mjs): each one's server imports have a device
 * counterpart that exports every name the route takes, and an import with no counterpart stops the app build.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEVICE_ROUTES, deviceSource, SWAPS, swappedNames } from "../../../scripts/device-routes.mjs";
import * as llmServer from "../server/llm";
import * as catalog from "./server/catalog";
import * as guard from "./server/guard";
import * as llm from "./server/llm";
import * as next from "./server/next";

const DEVICE: Record<string, Record<string, unknown>> = {
  "@/lib/app/server/next": next,
  "@/lib/app/server/llm": llm,
  "@/lib/app/server/catalog": catalog,
  "@/lib/app/server/guard": guard,
};
const routes = Object.entries(DEVICE_ROUTES as Record<string, string>);
const source = (dir: string) => readFileSync(join(process.cwd(), "src/app/api", dir, "route.ts"), "utf8");

describe("device routes", () => {
  it.each(routes)("%s: every server name it imports exists on the device", (_path, dir) => {
    const src = source(dir);
    expect(() => deviceSource(src, dir)).not.toThrow();
    for (const [mod, names] of Object.entries(swappedNames(src) as Record<string, string[]>)) {
      const device = DEVICE[(SWAPS as Record<string, string>)[mod]!]!;
      for (const n of names) expect(device[n], `${dir}: ${n} from ${mod}`).toBeDefined();
    }
    expect(deviceSource(src, dir)).not.toMatch(
      /["']@\/lib\/server\/(llm|catalog|guard)["']|["']next\/server["']/,
    );
  });
  it("an import with no device counterpart stops the build", () => {
    expect(() => deviceSource('import { getConfig } from "@/lib/server/config";\n', "x")).toThrow(
      /no device counterpart/,
    );
  });
  it("the pure helpers are the server's own", () => {
    for (const raw of [undefined, "", "  no Canaro  ", "x".repeat(2100)])
      expect(llm.houseRulesBlock(raw)).toBe(llmServer.houseRulesBlock(raw));
    for (const t of ['{"a":1}', '```json\n{"b":2}\n```', 'Sure: {"c":3} done', "[1]", "nope"])
      expect(llm.extractJson(t)).toEqual(llmServer.extractJson(t));
  });
});
