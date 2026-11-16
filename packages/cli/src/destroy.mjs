// `tdj destroy`: removes a stage from your AWS account after you type its name. Production keeps its database
// table and settings on purpose (sst.config.ts `removal: retain`); the commands to delete those are printed,
// not run.
import { CliError, resolveConfig } from "./config.mjs";
import { awsIdentity, ROLE_STACK, step } from "./deploy.mjs";

/** @param {import("./deploy.mjs").Ctx} ctx @param {Record<string, any>} flags */
export async function destroy(ctx, flags) {
  const { c, log } = ctx;
  const cfg = resolveConfig(ctx, flags);
  if (!cfg.checkout)
    throw new CliError("Run `tdj destroy` inside the TDJ checkout that deployed the stage.", [
      "cd into the TDJ folder (or pass --dir PATH); a fork deploy can be removed from any checkout of it.",
    ]);
  const who = awsIdentity(ctx);
  if (!who && !ctx.dryRun)
    throw new CliError("Removing needs AWS credentials for the account the stage runs in.", [
      "Run `aws configure sso` (or `aws sso login` if it expired), then `tdj destroy` again.",
    ]);
  log(
    c.bold(c.red(`Remove T-DJ stage "${cfg.stage}"`)) +
      c.dim(` · ${cfg.region}${who ? ` · AWS account ${who.Account}` : ""}`),
  );
  log("This deletes the web app, its functions and its files on AWS. Rooms and short links stop working.");
  if (cfg.stage === "production")
    log(
      c.dim(
        "Production keeps its DynamoDB table and its /tdj/production settings (deleted below only if you choose).",
      ),
    );
  log();
  const typed =
    flags.confirm ??
    (ctx.yes
      ? ""
      : await ctx.ask("confirm", `Type the stage name (${cfg.stage}) to remove it`, { default: "" }));
  if (typed !== cfg.stage) {
    log(
      ctx.yes && flags.confirm === undefined
        ? `Nothing removed: with --yes, pass --confirm ${cfg.stage} as well.`
        : "Nothing removed (the name did not match).",
    );
    return 1;
  }
  // production is `protect`ed in sst.config.ts; this one run lifts it, because the person typed the name
  await step(
    ctx,
    "npx",
    ["sst", "remove", "--stage", cfg.stage],
    { cwd: cfg.checkout, env: { AWS_REGION: cfg.region, TDJ_ALLOW_REMOVE: "1" } },
    [
      "Run `tdj doctor` (it reads .sst/log), then `tdj destroy` again; a locked stage needs `npx sst unlock`.",
    ],
  );
  log();
  log(c.bold(c.green(`Stage ${cfg.stage} removed.`)));
  log("Left in your account, if you want them gone too (run them yourself):");
  log(
    c.dim(
      `  aws ssm get-parameters-by-path --path /tdj/${cfg.stage} --query 'Parameters[].Name' --output text --region ${cfg.region} | xargs -n 10 aws ssm delete-parameters --region ${cfg.region} --names`,
    ),
  );
  if (cfg.stage === "production")
    log(c.dim("  the DynamoDB table named tdj-production-Db…: AWS console → DynamoDB → Tables → Delete"));
  log(
    c.dim(
      `  aws cloudformation delete-stack --stack-name ${ROLE_STACK} --region ${cfg.region}   (the GitHub deploy role, if you made one)`,
    ),
  );
  return 0;
}
