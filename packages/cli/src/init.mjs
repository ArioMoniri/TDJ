// `tdj init`: the interactive guide. Checks this computer, asks the stage, the region and (optionally) your
// Spotify app, then saves the settings to `.env.local` and the secrets where TDJ reads them at runtime:
//   aws route    — AWS Systems Manager Parameter Store, /tdj/<stage>/SPOTIFY_CLIENT_* (SecureString), the same
//                  encrypted store the in-app /admin page writes (apps/web/src/lib/server/config.ts)
//   github route — the fork's GitHub secrets (through stdin), after creating the fork's deploy role
// Nothing secret is printed, put on a command line or written to .env.local.
import { CliError, resolveConfig } from "./config.mjs";
import { awsIdentity, putSecure, rememberFork, setupFork } from "./deploy.mjs";
import { checks } from "./doctor.mjs";
import { ENV_FILE, writeEnvFile } from "./envfile.mjs";
import * as v from "./validate.mjs";

/** @param {import("./deploy.mjs").Ctx} ctx @param {Record<string, any>} flags */
export async function init(ctx, flags) {
  const { c, log } = ctx;
  const cfg0 = resolveConfig(ctx, flags);
  const route = cfg0.route;
  const total = 4;
  const head = (/** @type {number} */ n, /** @type {string} */ s) =>
    log(`\n${c.bold(`${n}/${total}`)} ${c.bold(s)}`);

  log(c.bold(route === "github" ? "Set up T-DJ to deploy from your GitHub fork" : "Set up your own T-DJ"));
  log(c.dim("Four short steps. Enter keeps the value in brackets. Ctrl-C stops without changing anything."));

  head(1, "Checking this computer");
  const list = checks(ctx, cfg0);
  let blocking = 0;
  for (const r of list) {
    if (r.id === "checkout" || r.id === "deps" || r.id === "env-file") continue;
    if (r.need !== "always" && r.need !== route) {
      // the fork route works without AWS credentials here: one AWS console page instead
      if (route === "github" && r.id === "aws-credentials")
        log(
          `${r.pass ? c.green("✓") : c.yellow("•")} ${r.name}${c.dim(r.pass ? "  the deploy role is created from here" : "  optional: without them you click through one AWS console page")}`,
        );
      continue;
    }
    log(`${r.pass ? c.green("✓") : c.red("✗")} ${r.name}${r.detail ? c.dim(`  ${r.detail}`) : ""}`);
    if (!r.pass) {
      blocking++;
      log(c.dim(`    → ${r.fix}`));
    }
  }
  if (blocking)
    throw new CliError(
      `${blocking} thing${blocking > 1 ? "s" : ""} to fix before T-DJ can deploy (the ✗ lines).`,
      ["Fix them, then run `tdj init` again. `tdj doctor` explains each one."],
    );

  head(2, "Where it runs");
  log(
    c.dim(
      "A stage is one copy of T-DJ (production, or dev to try changes). The region is the AWS data centre.",
    ),
  );
  const stage =
    flags.stage || (await ctx.ask("stage", "Stage name", { default: cfg0.stage, validate: v.stage }));
  const region =
    flags.region || (await ctx.ask("region", "AWS region", { default: cfg0.region, validate: v.region }));
  for (const bad of [v.stage(stage), v.region(region)]) if (bad) throw new CliError(bad);
  const cfg = { ...cfg0, stage, region };

  head(3, "Spotify (optional)");
  log(
    c.dim(
      "Skip it now and paste the keys later in the app at /admin, next to the redirect addresses it shows.",
    ),
  );
  const spotify = await spotifyCredentials(ctx, flags);

  head(4, "Saving");
  /** @type {Record<string, string | undefined>} */
  const settings = { TDJ_STAGE: stage, AWS_REGION: region, TDJ_DEPLOY_ROUTE: route };
  if (spotify?.id) settings.SPOTIFY_CLIENT_ID = spotify.id;
  if (ctx.dryRun) log(c.dim(`would write ${ENV_FILE}: ${Object.keys(settings).join(", ")}`));
  else log(`${c.green("✓")} ${writeEnvFile(cfg.dir, settings)} ${c.dim("(settings only, no secrets)")}`);

  if (route === "github") {
    const repo = await setupFork(ctx, cfg, spotify, flags["role-arn"]);
    rememberFork(ctx, cfg.dir, repo);
    log(`${c.green("✓")} ${repo} can deploy itself${spotify ? " (Spotify stored as GitHub secrets)" : ""}`);
  } else if (spotify?.secret) {
    if (!ctx.dryRun && !awsIdentity(ctx))
      throw new CliError("AWS credentials are needed to store the Spotify secret.", [
        "Run `aws configure sso`, then `tdj init` again, or skip Spotify and paste it at /admin.",
      ]);
    for (const [key, value] of [
      ["SPOTIFY_CLIENT_ID", spotify.id],
      ["SPOTIFY_CLIENT_SECRET", spotify.secret],
    ]) {
      const name = `/tdj/${stage}/${key}`;
      if (ctx.dryRun) log(c.dim(`would store ${name} (SecureString, hidden)`));
      else {
        putSecure(ctx, name, /** @type {string} */ (value), region);
        log(`${c.green("✓")} ${name} ${c.dim("stored encrypted in Parameter Store (value hidden)")}`);
      }
    }
  }
  log();
  log(
    `${c.bold(c.green("Ready."))} Next: ${c.bold(route === "github" ? "tdj deploy --github" : "tdj deploy")}`,
  );
  return 0;
}

/**
 * Spotify is the one connector worth entering now. The Client ID is public (it is in every login link); the
 * secret is typed hidden, or comes from SPOTIFY_CLIENT_SECRET in the environment. Never a flag.
 * @param {import("./deploy.mjs").Ctx} ctx @param {Record<string, any>} flags @returns {Promise<import("./deploy.mjs").Spotify>}
 */
export async function spotifyCredentials(ctx, flags) {
  const envId = ctx.env.SPOTIFY_CLIENT_ID || flags["spotify-client-id"] || "";
  if (envId && v.spotifyClientId(envId)) throw new CliError(/** @type {string} */ (v.spotifyClientId(envId)));
  if (ctx.env.SPOTIFY_CLIENT_SECRET && envId) {
    const bad = v.spotifySecret(ctx.env.SPOTIFY_CLIENT_SECRET);
    if (bad) throw new CliError(bad);
    return { id: envId, secret: ctx.env.SPOTIFY_CLIENT_SECRET };
  }
  if (flags["spotify-later"]) return null;
  if (envId && ctx.yes) return { id: envId, secret: "" };
  const id =
    envId ||
    (await ctx.ask("spotifyId", "Spotify Client ID (Enter to skip)", {
      default: "",
      validate: v.optional(v.spotifyClientId),
    }));
  if (!id) return null;
  if (ctx.yes) return { id, secret: "" };
  const secret = await ctx.ask("spotifySecret", "Spotify Client secret (typed hidden; Enter to skip)", {
    default: "",
    secret: true,
    validate: v.optional(v.spotifySecret),
  });
  return { id, secret };
}
