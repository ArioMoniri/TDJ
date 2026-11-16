// `tdj status`: where this T-DJ runs, which version answers, and whether /admin still waits for its owner.
// Reads only; prints no secret (the setup code itself is shown by `tdj deploy` or the workflow summary).
import { resolveConfig } from "./config.mjs";
import { awsIdentity, readUrl, WORKFLOW } from "./deploy.mjs";

/** @param {import("./deploy.mjs").Ctx} ctx @param {Record<string, any>} flags */
export async function status(ctx, flags) {
  const { c, log } = ctx;
  const cfg = resolveConfig(ctx, flags);
  log(c.bold(`T-DJ status · stage ${cfg.stage} · ${cfg.region} · route ${cfg.route}`));
  log();
  if (cfg.route === "github") {
    const repo = cfg.repo;
    if (!repo) {
      log(`${c.yellow("•")} No fork recorded yet: run ${c.bold("tdj init --github")}.`);
      return 1;
    }
    const r = ctx.run(
      "gh",
      [
        "run",
        "list",
        "--repo",
        repo,
        "--workflow",
        WORKFLOW,
        "-L",
        "1",
        "--json",
        "status,conclusion,url,createdAt",
      ],
      { allowFail: true },
    );
    /** @type {{status: string, conclusion: string, url: string, createdAt: string}[]} */
    let runs = [];
    try {
      runs = JSON.parse(r.stdout || "[]");
    } catch {}
    const last = runs[0];
    if (!last) log(`${c.yellow("•")} ${repo} has not deployed yet: ${c.bold("tdj deploy --github")}`);
    else {
      const good = last.conclusion === "success";
      log(
        `${good ? c.green("✓") : last.status !== "completed" ? c.yellow("…") : c.red("✗")} last deploy ${last.createdAt}: ${last.status === "completed" ? last.conclusion : last.status}`,
      );
      log(c.dim(`    ${last.url} (app URL and setup code in the run summary)`));
    }
    return last?.conclusion === "success" ? 0 : 1;
  }

  const url = cfg.checkout ? readUrl(cfg.checkout) : "";
  if (!url) {
    log(
      `${c.yellow("•")} Not deployed from this folder yet (no .sst/outputs.json): run ${c.bold("tdj deploy")}.`,
    );
    return 1;
  }
  log(`${c.green("✓")} app ${c.bold(url)}`);
  let healthy = false;
  try {
    const f = ctx.fetch ?? fetch;
    const res = await f(`${url}/api/version`, { signal: AbortSignal.timeout(10_000) });
    const j = /** @type {{ version?: string, commit?: string }} */ (await res.json());
    healthy = res.ok && !!j.version;
    log(
      healthy
        ? `${c.green("✓")} answers: version ${j.version}${j.commit ? c.dim(` (${String(j.commit).slice(0, 7)})`) : ""}`
        : `${c.red("✗")} /api/version answered ${res.status}`,
    );
  } catch {
    log(`${c.red("✗")} no answer from ${url}/api/version`);
    log(
      c.dim("    A first deploy can take 15 minutes to reach every CloudFront edge; else run `tdj doctor`."),
    );
  }
  if (!awsIdentity(ctx)) {
    log(c.dim("• Owner setup: unknown (no AWS credentials here to read Parameter Store)."));
    return healthy ? 0 : 1;
  }
  const has = (/** @type {string} */ key) =>
    ctx.run(
      "aws",
      [
        "ssm",
        "get-parameter",
        "--name",
        `/tdj/${cfg.stage}/${key}`,
        "--query",
        "Parameter.Name",
        "--region",
        cfg.region,
      ],
      { allowFail: true },
    ).status === 0;
  if (has("OWNER_PASSPHRASE_HASH"))
    log(`${c.green("✓")} owner passphrase set (open ${url}/admin to change settings)`);
  else if (has("SETUP_CODE"))
    log(
      `${c.yellow("•")} /admin waits for its owner: the one-time code is in Parameter Store → /tdj/${cfg.stage}/SETUP_CODE (${cfg.region}); \`tdj deploy\` prints it again`,
    );
  else log(`${c.yellow("•")} no setup code yet: run ${c.bold("tdj deploy")} to issue one`);
  return healthy ? 0 : 1;
}
