import { mkdirSync, writeFileSync } from "node:fs";
import { compose } from "./compose";
import { EXPORTERS, toSetList } from "./export/index";
import { loadCatalog } from "./load";
import type { ComposeOptions } from "./types";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);
const { catalog, cortinas } = loadCatalog();
const opts: Partial<ComposeOptions> = {
  hours: Number(args.hours ?? 4),
  eras: ((args.eras as string) ?? "golden").split(",") as ComposeOptions["eras"],
  seed: args.seed ? Number(args.seed) : undefined,
  cortinaCultures: ((args.cultures as string) ?? "global").split(","),
  cortinaTrend: (args.trend as ComposeOptions["cortinaTrend"]) ?? "mixed",
  arc: (args.arc as ComposeOptions["arc"]) ?? "classic-two-peaks",
};
const p = compose(opts, { catalog, cortinas });
process.stdout.write(toSetList(p));
if (args.out) {
  mkdirSync(args.out as string, { recursive: true });
  for (const [k, fn] of Object.entries(EXPORTERS))
    writeFileSync(
      `${args.out}/${p.id}.${k === "rekordbox" || k === "traktor" ? (k === "traktor" ? "nml" : "xml") : k}`,
      fn(p),
    );
  console.log(`\nexported to ${args.out}`);
}
