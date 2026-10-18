import "server-only";
import { loadCatalog, findRoot } from "@tdj/core/load";
import { join } from "node:path";
import { existsSync } from "node:fs";

let cached: ReturnType<typeof loadCatalog> | null = null;
export function getCatalog() {
  if (!cached) {
    const candidates = [process.env.TDJ_DATA_ROOT, process.cwd(), join(process.cwd(), "../.."), findRoot()].filter(Boolean) as string[];
    const root = candidates.find((r) => existsSync(join(r, "data/index/meta.json"))) ?? findRoot();
    cached = loadCatalog(root);
  }
  return cached;
}
